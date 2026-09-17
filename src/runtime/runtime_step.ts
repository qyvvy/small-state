import type {
  EmitFn,
  EmittedEvent,
  EventBody,
  GlobalStDefItem,
  InternalEPayload,
  InternalEventBody,
  Machine,
  MContext,
  NormalizedAction,
  NormalizedDefinition,
  NStateItemDef,
} from '../machine/m.types'
import { MICROSTEP_LOOP_LIMIT, ST_DELIM } from '../shared/constants'
import type { Placeholder, RecursiveRecord } from '../shared/general.types'
import { splitStPath } from '../shared/utils'
import type { EnqueueEventFn, TransitionExec } from './runtime_step.core'
import {
  deleteNodeFromStateTree,
  deriveEventTransition,
  evalAlwaysEvent,
  genChildDoneEvents,
  genExitPaths,
  launchInvocations,
  readyAction,
  updateStateTreeForEntry,
} from './runtime_step.core'

function execTExecActions(
  tExecs: TransitionExec[],
  actionRunner: ReturnType<typeof readyAction<any, any, any, any, any, any, any>>,
) {
  const { execAction, processQueue } = actionRunner

  let i: number, tExec: TransitionExec, action: NormalizedAction
  try {
    for (const tExec of tExecs) {
      for ([i, action] of tExec.transition.actions.entries()) {
        execAction(action)
        processQueue()
      }
    }
  } catch (err) {
    const { from, tIndex } = tExec!
    if (!(err instanceof Error)) {
      throw new Error(
        `Unknown error occurred in state "${from}", transition[${tIndex}], actions[${i!}]: ${String(err)}`,
      )
    }
    throw new Error(`Error occurred in state "${from}", transition[${tIndex}], actions[${i!}]`, { cause: err })
  }
}

export function initRuntime<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  ND extends NormalizedDefinition,
>(
  realContext: C,
  input: I,
  emit: EmitFn<EM>,
  crrStateTree: RecursiveRecord,
  machine: Machine<C, E, I, EM, any, G, A, any, ND>,
  enqueueEvent: EnqueueEventFn<E>,
  event: E = { type: ':init:' } as E,
) {
  const { definition, guards, actions, globalDefItem } = machine
  const { initial } = definition

  const actionRunner = readyAction<C, E, I, EM, G, A>(realContext, event, input, guards, actions, emit)

  const tExecs: TransitionExec[] = [
    {
      transition: { to: initial, fullTo: `${ST_DELIM}${initial}`, guards: [], actions: [] },
      tIndex: -1, // dummy
    },
  ]
  const hasTransitioned = runMicrosteps(tExecs, crrStateTree, actionRunner, machine, enqueueEvent, globalDefItem)

  {
    const { context } = actionRunner.getResult()
    return { context, stateTree: crrStateTree, hasTransitioned }
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
  ND extends NormalizedDefinition,
>(
  eType: Ex['type'],
  internalEPayload: InternalEPayload | undefined,
  crrStateTree: RecursiveRecord,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, Ex>>,
  machine: Machine<C, E, I, EM, any, G, A, any, ND>,
  enqueueEvent: EnqueueEventFn<E>,
  globalDefItem: GlobalStDefItem<E['type']>,
) {
  const { guards, stateCatalog, regionPaths } = machine

  const tExecs = deriveEventTransition(
    eType,
    internalEPayload,
    actionRunner.makeFnBaseParam(),
    crrStateTree,
    guards,
    stateCatalog,
    regionPaths,
    globalDefItem,
  )

  execTExecActions(tExecs, actionRunner)

  const hasTransitioned = runMicrosteps(tExecs, crrStateTree, actionRunner, machine, enqueueEvent, globalDefItem)

  {
    const { context } = actionRunner.getResult()
    return { context, stateTree: crrStateTree, hasTransitioned }
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
  ND extends NormalizedDefinition,
>(
  tExecs: TransitionExec[],
  crrStateTree: RecursiveRecord,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, Ex>>,
  machine: Machine<C, E, I, EM, any, G, A, any, ND>,
  enqueueEvent: EnqueueEventFn<E>,
  globalDefItem: GlobalStDefItem<E['type']>,
) {
  const { regionPaths } = machine
  const regionPathSet = new Set(regionPaths)
  //const doneBranches: DoneBranch[] = []
  const internalQueue: Array<[EventBody, InternalEPayload]> = []

  let hasTransitioned = runExitAndEntryThenAlways(
    tExecs,
    crrStateTree,
    actionRunner,
    machine,
    enqueueEvent,
    internalQueue,
    regionPathSet,
  )

  const { guards, stateCatalog } = machine
  const { makeFnBaseParam } = actionRunner
  while (internalQueue.length) {
    const [event, payload] = internalQueue.shift()!
    const internalTExecs = deriveEventTransition(
      event.type,
      payload,
      makeFnBaseParam(),
      crrStateTree,
      guards,
      stateCatalog,
      regionPaths,
      globalDefItem,
    )

    execTExecActions(internalTExecs, actionRunner)

    const tmp = runExitAndEntryThenAlways(
      internalTExecs,
      crrStateTree,
      actionRunner,
      machine,
      enqueueEvent,
      internalQueue,
      regionPathSet,
    )
    hasTransitioned ||= tmp
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
  ND extends NormalizedDefinition,
>(
  tExecs: TransitionExec[],
  crrStateTree: RecursiveRecord,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, Ex>>,
  machine: Machine<C, E, I, EM, any, G, A, any, ND>,
  enqueueEvent: EnqueueEventFn<E>,
  internalQueue: Array<[EventBody, InternalEPayload]>,
  regionPathSet: Set<string>,
) {
  let [alwaysTExecs, hasTransitioned] = exitAndEntry(
    tExecs,
    crrStateTree,
    actionRunner,
    machine,
    enqueueEvent,
    internalQueue,
    regionPathSet,
  )

  let i = 0
  while (alwaysTExecs.length) {
    let tmp: boolean
      ;[alwaysTExecs, tmp] = exitAndEntry(
        alwaysTExecs,
        crrStateTree,
        actionRunner,
        machine,
        enqueueEvent,
        internalQueue,
        regionPathSet,
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
  ND extends NormalizedDefinition,
>(
  tExecs: TransitionExec[],
  crrStateTree: RecursiveRecord,
  actionRunner: ReturnType<typeof readyAction<C, E, I, EM, G, A, Ex>>,
  { guards, services, stateCatalog, regionPaths, definition }: Machine<C, E, I, EM, any, G, A, any, ND>,
  enqueueEvent: EnqueueEventFn<E>,
  internalQueue: Array<[EventBody, InternalEPayload]>,
  regionPathSet: Set<string>,
): [TransitionExec[], hasTransitioned: boolean] {
  const { makeFnBaseParam, execAction, processQueue } = actionRunner

  for (const { from } of tExecs) {
    if (!from) {
      continue
    }
    const fromPathStateSplitted = splitStPath(from)
    {
      const exitPaths = genExitPaths(from, crrStateTree, fromPathStateSplitted)
      let i: number, action: NormalizedAction
      try {
        for (const pth of exitPaths) {
          const { def } = stateCatalog.get(pth)!
          const { invocations, exitHooks } = def
          if (invocations.length) {
            // TODO: もしマシンであるなら停止させる
          }
          if (exitHooks) {
            for ([i, action] of exitHooks.entries()) {
              execAction(action)
              processQueue()
            }
          }
        }
      } catch (err) {
        if (!(err instanceof Error)) {
          throw new Error(`Unknown error occurred during exit "${from}", exitHooks[${i!}]: ${String(err)}`)
        }
        throw new Error(`Error occurred during exit "${from}", exitHooks[${i!}]`, { cause: err })
      }
    }
    if (tExecs?.[0]?.from === '/processing/rejected') {
      console.log(`DBG:205: `, tExecs, crrStateTree, fromPathStateSplitted)
    }
    deleteNodeFromStateTree(fromPathStateSplitted, crrStateTree)
    if (tExecs?.[0]?.from === '/processing/rejected') {
      console.log(`DBG:206: `, crrStateTree)
    }
  }

  const stChangingTExecs = tExecs.filter(({ transition: { fullTo } }) => fullTo) as Required<TransitionExec>[]

  // NOTE: updateStateTreeForEntry は stChangingTExecs が空でも末端リーフ追加して遷移先とするので遷移先がなければ明示的にスキップする必要がある
  if (stChangingTExecs.length) {
    const reachedFinalStateItems = new Set<NStateItemDef<string>>()
    const fullToSplittees = stChangingTExecs.map(({ transition }) => splitStPath(transition.fullTo!))
    const enteredStItemDefs = updateStateTreeForEntry(fullToSplittees, crrStateTree, definition)
    let i = 0,
      j: number,
      action: NormalizedAction
    try {
      if (tExecs?.[0]?.from === '/processing/rejected') {
        console.log(`DBG:207: `, crrStateTree)
      }
      for (const [stateName, stateNode, def] of enteredStItemDefs) {
        if (tExecs?.[0]?.from === '/processing/rejected') {
          console.log(`DBG:208: `, crrStateTree)
        }
        const { invocations, entryHooks, final, pPath } = def
        if (invocations.length) {
          launchInvocations(
            invocations,
            `${pPath}${ST_DELIM}${stateName}`,
            stateNode,
            makeFnBaseParam,
            services,
            enqueueEvent,
          )
        }
        if (entryHooks) {
          for ([j, action] of entryHooks.entries()) {
            execAction(action)
            processQueue()
          }
        }
        if (final) {
          reachedFinalStateItems.add(def)
        }
        i += 1
      }
    } catch (err) {
      const pth = ST_DELIM + fullToSplittees[i]?.join(ST_DELIM)
      if (!(err instanceof Error)) {
        throw new Error(`Unknown error occurred during entry "${pth}", exitHooks[${j!}]: ${String(err)}`)
      }
      throw new Error(`Error occurred during entry "${pth}", exitHooks[${i!}]`, { cause: err })
    }
    internalQueue.push(...genChildDoneEvents(reachedFinalStateItems, regionPathSet, crrStateTree, stateCatalog))
  }

  const alwaysTExecs = evalAlwaysEvent(makeFnBaseParam(), crrStateTree, guards, stateCatalog, regionPaths)
  {
    let i: number, tExec: TransitionExec, action: NormalizedAction
    try {
      for (const tExec of alwaysTExecs) {
        for ([i, action] of tExec.transition.actions.entries()) {
          execAction(action)
          processQueue()
        }
      }
    } catch (err) {
      const { from, tIndex } = tExec!
      if (!(err instanceof Error)) {
        throw new Error(
          `Unknown error occurred in state "${from}", :always:[${tIndex}], actions[${i!}]: ${String(err)}`,
        )
      }
      throw new Error(`Error occurred in state "${from}", :always:[${tIndex}], actions[${i!}]`, { cause: err })
    }
  }

  return [alwaysTExecs, !!stChangingTExecs.length]
}

