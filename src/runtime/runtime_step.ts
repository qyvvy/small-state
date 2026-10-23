import type {
  EmittedEvent,
  EventBody,
  FnBaseParams,
  InternalEPayload,
  InternalEventBody,
  Machine,
  MContext,
  NormalizedAction,
  NormalizedDefinition,
  ServiceRecord,
} from '../machine/m.types'
import { MICROSTEP_LOOP_LIMIT, ST_DELIM } from '../shared/constants'
import type { Placeholder } from '../shared/general.types'
import { splitStPath } from '../shared/utils'
import type { RuntimeOutbound, StateRoute } from './r.types'
import type { TransitionExec } from './runtime_step.core'
import {
  deriveEventTransition,
  evalAlwaysEvent,
  genChildDoneEvents,
  genExitPathsAndDeleteFromCrrStates,
  launchInvocations,
  readyAction,
  stopInvocations,
  updateStateRouteForEntry,
} from './runtime_step.core'

function execTExecActions<Ep extends EventBody>(
  tExecs: TransitionExec[],
  actionRunner: ReturnType<typeof readyAction<any, any, any, any, any, any, any>>,
  errLocation: string,
  providedEvent?: Ep,
) {
  const { execAction, processQueue } = actionRunner

  let i: number, tExec: TransitionExec, action: NormalizedAction
  try {
    for (const tExec of tExecs) {
      for ([i, action] of tExec.transition.actions.entries()) {
        execAction(action, providedEvent)
        processQueue()
      }
    }
  } catch (err) {
    const { lca, tIndex } = tExec!
    if (!(err instanceof Error)) {
      throw new Error(
        `Unknown error occurred in state "${lca}", ${errLocation}[${tIndex}], actions[${i!}]: ${String(err)}`,
      )
    }
    throw new Error(`Error occurred in state "${lca}", ${errLocation}[${tIndex}], actions[${i!}]`, { cause: err })
  }
}

export function initRuntime<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ND extends NormalizedDefinition,
>(
  realContext: C,
  input: I,
  crrStates: StateRoute,
  machineInternal: Machine<C, E, I, EM, any, G, A, any, ND>['internal'],
  rtOutbound: RuntimeOutbound<E, EM, S>,
  event: E = { type: ':init:' } as E,
) {
  const { definition, guards, actions } = machineInternal
  const { initial } = definition

  const actionRunner = readyAction<C, E, I, EM, G, A, S>(realContext, event, input, guards, actions, rtOutbound)

  const tExecs: TransitionExec[] = [
    {
      transition: { to: initial, fullTo: `${ST_DELIM}${initial}`, guards: [], actions: [] },
      tIndex: -1, // dummy
    },
  ]
  const hasTransitioned = runMicrosteps(tExecs, crrStates, actionRunner, machineInternal, rtOutbound)

  {
    const { context } = actionRunner.getResult()
    return { context, crrStates, hasTransitioned }
  }
}

export function macrostep<
  C extends MContext,
  E extends EventBody,
  Ex extends E | InternalEventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ND extends NormalizedDefinition,
>(
  eType: Ex['type'],
  internalEPayload: InternalEPayload | undefined,
  crrStates: StateRoute,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, S, Ex>>,
  machineInternal: Machine<C, E, I, EM, any, G, A, any, ND>['internal'],
  rtOutbound: RuntimeOutbound<E, EM, S>,
) {
  const { guards, stateCatalog, topLvDefItem } = machineInternal

  const tExecs = deriveEventTransition(
    eType,
    internalEPayload,
    actionRunner.makeFnBaseParam(),
    crrStates,
    guards,
    stateCatalog,
    topLvDefItem,
  )

  execTExecActions(tExecs, actionRunner, 'transition')

  const hasTransitioned = runMicrosteps(
    tExecs,
    crrStates,
    actionRunner,
    machineInternal,
    rtOutbound,
  )

  {
    const { context } = actionRunner.getResult()
    return { context, crrStates, hasTransitioned }
  }
}

function runMicrosteps<
  C extends MContext,
  E extends EventBody,
  Ex extends E | InternalEventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ND extends NormalizedDefinition,
>(
  tExecs: TransitionExec[],
  crrStates: StateRoute,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, S, Ex>>,
  machineInternal: Machine<C, E, I, EM, any, G, A, any, ND>['internal'],
  rtOutbound: RuntimeOutbound<E, EM, S>,
) {
  const internalQueue: Array<[EventBody, InternalEPayload]> = []

  let hasTransitioned = runExitAndEntryThenAlways(
    tExecs,
    crrStates,
    actionRunner,
    machineInternal,
    rtOutbound,
    internalQueue,
  )

  const { guards, stateCatalog, topLvDefItem } = machineInternal
  const { makeFnBaseParam } = actionRunner
  while (internalQueue.length) {
    const [event, payload] = internalQueue.shift()!
    const internalTExecs = deriveEventTransition(
      event.type,
      payload,
      makeFnBaseParam(),
      crrStates,
      guards,
      stateCatalog,
      topLvDefItem,
    )

    execTExecActions(internalTExecs, actionRunner, event.type, event)

    hasTransitioned =
      runExitAndEntryThenAlways(
        internalTExecs,
        crrStates,
        actionRunner,
        machineInternal,
        rtOutbound,
        internalQueue,
      ) || hasTransitioned
  }

  return hasTransitioned
}

function runExitAndEntryThenAlways<
  C extends MContext,
  E extends EventBody,
  Ex extends E | InternalEventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ND extends NormalizedDefinition,
>(
  tExecs: TransitionExec[],
  crrStates: StateRoute,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, S, Ex>>,
  machineInternal: Machine<C, E, I, EM, any, G, A, any, ND>['internal'],
  rtOutbound: RuntimeOutbound<E, EM, S>,
  internalQueue: Array<[EventBody, InternalEPayload]>,
) {
  let [alwaysTExecs, hasTransitioned] = exitAndEntry(
    tExecs,
    crrStates,
    actionRunner,
    machineInternal,
    rtOutbound,
    internalQueue,
  )

  let i = 0
  while (alwaysTExecs.length) {
    let tmp: boolean
      ;[alwaysTExecs, tmp] = exitAndEntry(
        alwaysTExecs,
        crrStates,
        actionRunner,
        machineInternal,
        rtOutbound,
        internalQueue,
      )
    hasTransitioned ||= tmp
    if (++i > MICROSTEP_LOOP_LIMIT) {
      throw new Error(`Maximum number of microsteps exceeded`)
    }
  }
  return hasTransitioned
}

function exitAndEntry<
  C extends MContext,
  E extends EventBody,
  Ex extends E | InternalEventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ND extends NormalizedDefinition,
>(
  tExecs: TransitionExec[],
  crrStates: StateRoute,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, S, Ex>>,
  { guards, services, stateCatalog, definition }: Machine<C, E, I, EM, any, G, A, any, ND>['internal'],
  rtOutbound: RuntimeOutbound<E, EM, S>,
  internalQueue: Array<[EventBody, InternalEPayload]>,
): [TransitionExec[], hasTransitioned: boolean] {
  const { makeFnBaseParam, execAction, processQueue } = actionRunner

  for (const { lca, transition } of tExecs) {
    if (lca === undefined) {
      continue
    }
    {
      const exitPaths = genExitPathsAndDeleteFromCrrStates(crrStates, lca, transition.fullTo!)
      let i: number, action: NormalizedAction
      try {
        for (const pth of exitPaths) {
          const { def } = stateCatalog.get(pth)!
          const { invocations, exitHooks } = def
          if (exitHooks) {
            for ([i, action] of exitHooks.entries()) {
              execAction(action)
              processQueue()
            }
          }
          if (invocations.length) {
            stopInvocations(invocations, rtOutbound)
          }
        }
      } catch (err) {
        if (!(err instanceof Error)) {
          throw new Error(`Unknown error occurred during exit under "${lca}", exitHooks[${i!}]: ${String(err)}`)
        }
        throw new Error(`Error occurred during exit under "${lca}", exitHooks[${i!}]`, { cause: err })
      }
    }
  }

  const stChangingTExecs = tExecs.filter(({ transition: { fullTo } }) => fullTo) as Required<TransitionExec>[]

  // NOTE: updateStateTreeForEntry は stChangingTExecs が空でも末端リーフ追加して遷移先とするので遷移先がなければ明示的にスキップする必要がある
  if (stChangingTExecs.length) {
    const accReachedFinal: [
      pPath: string,
      isRegionChild: boolean | undefined,
      final: boolean | ((args: FnBaseParams<C, Ex, I>[0]) => unknown),
    ][] = []
    const fullToSplittees = stChangingTExecs.map(({ transition }) => splitStPath(transition.fullTo!))
    const enteredStItemDefs = updateStateRouteForEntry(fullToSplittees, crrStates, definition)
    let i = 0,
      j: number,
      action: NormalizedAction
    try {
      for (const [def, additional] of enteredStItemDefs) {
        const { invocations, entryHooks, final, pPath } = def
        if (entryHooks) {
          for ([j, action] of entryHooks.entries()) {
            execAction(action)
            processQueue()
          }
        }
        if (invocations.length) {
          launchInvocations(
            invocations,
            `${pPath}${ST_DELIM}${additional.stateName}`,
            makeFnBaseParam,
            services,
            rtOutbound,
          )
        }
        if (final) {
          accReachedFinal.push([pPath, additional.isRegionChild, final])
        }
        i += 1
      }
    } catch (err) {
      const pth = ST_DELIM + fullToSplittees[i]?.join(ST_DELIM)
      if (!(err instanceof Error)) {
        throw new Error(`Unknown error occurred during entry "${pth}", entryHooks[${j!}]: ${String(err)}`)
      }
      throw new Error(`Error occurred during entry "${pth}", entryHooks[${i!}]`, { cause: err })
    }
    internalQueue.push(...genChildDoneEvents(accReachedFinal, makeFnBaseParam(), crrStates, stateCatalog))
  }

  const alwaysTExecs = evalAlwaysEvent(makeFnBaseParam(), crrStates, guards, stateCatalog)
  execTExecActions(alwaysTExecs, actionRunner, ':always:')

  return [alwaysTExecs, !!stChangingTExecs.length]
}
