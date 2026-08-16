import type {
  ActionFnParams,
  EmitFn,
  EmittedEvent,
  EventBody,
  FnBaseParams,
  Machine,
  MContext,
  NormalizedStateItem,
  NormalizedStateItemBoth,
  NormalizedTransition,
  UpdateFn,
  ParamsArgOf,
  UpdateFnParam,
} from '../machine/m.types'
import type { EnqueueActions, CheckFn, EnqueueFn } from '../machine/createMachine-enqueue'
import { AsyncProcQueue } from './AsyncProcQueue'
import type { RecursiveRecord, Placeholder, AnyFn } from '../shared/general.types'

import { deepFreeze, hasOwnProperty, calcCommonPathPrefix, parentPathOf, stringifyCircular, splitStPath } from '../shared/utils'
import { ST_DELIM } from '../shared/constants'

type X_EventTransitionCandidate = {
  leaves: string[] // 遷移元候補(末端ステート)
  firedIn: string // イベント発火箇所 (※現状、使われていない)
  transition: NormalizedTransition
}
type TransitionExec = {
  from: string | undefined, // 遷移元
  transition: NormalizedTransition
}

export const serviceUtils = {
  makeFnBaseParam<C extends MContext, E extends EventBody, I>(
    context: C, event: E, input: I
  ): FnBaseParams<C, E, I>[0] {
    return { context, c: context, event, e: event, input }
  },
}

function o_evalActionParams<
  C extends MContext,
  Ex extends EventBody,
  I,
>(
  param: unknown | ((arg: FnBaseParams<C, Ex, I>[0]) => unknown),
  context: C, event: Ex, input: I
) {
  return typeof param !== 'function' ? param : param(serviceUtils.makeFnBaseParam(context, event, input))
}

export function readyAction<
  C extends MContext, Ex extends EventBody, I, EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
>(
  origContext: C,
  event: Ex,
  input: I,
  machineGuards: Required<Machine<any, any, any, any, any, any, any, any, any>>['guards'],
  machineActions: Required<Machine<any, any, any, any, any, any, any, any, any>>['actions'],
  emit: EmitFn<EM>,
  //commit: (newContext: C) => unknown,
) {
  let context = deepFreeze(origContext)
  function localAssign(partial: Partial<C>) {
    context = deepFreeze({ ...context, ...partial })
  }

  const updatingQueue = new AsyncProcQueue()
  const enqueuees: {
    body: (string | ((...arg: ActionFnParams<C, Ex, I, EM>) => unknown)),
    params: any
  }[] = []

  const update: UpdateFn<C> = (updates: UpdateFnParam<C>) => {
    if (!updates || typeof updates !== 'object') {
      throw new Error(`invalid updates argument: ${JSON.stringify(updates)}`)
    }
    updatingQueue.add(
      async () => {
        const partial = Object.fromEntries(
          await Promise.all(
            Object.entries(updates).map(async ([key, val]) => {
              return [key, typeof val === 'function' ? await val() : await val]
            }),
          ),
        )
        localAssign(partial)
      },
    )
  }

  function check<Gk extends keyof G & string | never>(
    type: Gk, ...args: ParamsArgOf<G, Gk, C, Ex, I>
  ) {
    const fn = machineGuards[type]
    if (!fn) {
      throw new Error(`invalid Guard type: "${type}"`)
    }
    const fnBaseParam = serviceUtils.makeFnBaseParam(context, event, input)
    const [params] = args
    return fn(fnBaseParam, typeof params !== 'function' ? params : params(fnBaseParam))
  }

  function enqueue<Ak extends keyof A | never>(type: Ak, ...args: ParamsArgOf<A, Ak, C, Ex, I>): void
  function enqueue(fn: (...arg: ActionFnParams<C, Ex, I, EM>) => unknown): void
  function enqueue(body: any, params?: any) {
    enqueuees.push({ body, params })
  }

  const execAction = async <P extends unknown | AnyFn>(
    actionFn: (...arg: ActionFnParams<C, Ex, I, EM, P>) => unknown,
    params: P
  ) => {
    await actionFn(
      { context, c: context, event, e: event, input, update, emit },
      o_evalActionParams(params, context, event, input)
    )
  }

  return {
    execAction,

    execEnqueueAction: (
      enqueueActionFn: EnqueueActions<C, Ex, I, EM, any, any>
    ) => {
      enqueueActionFn({
        context, c: context, event, e: event, input, update, emit, check: check as CheckFn<C, Ex, I, G>, enqueue: enqueue as EnqueueFn<C, Ex, I, EM, A>
      })
    },

    async wait() {
      await updatingQueue.onIdle()
      for (const { body, params } of enqueuees) {
        const fn = typeof body === 'string' ? machineActions[body] : body
        if (!fn) {
          throw new Error(`invalid Action type: "${JSON.stringify(body)}"`)
        }
        await execAction(fn, params)
      }
      await updatingQueue.onIdle()
    },

    getResult() {
      return { context }
    }
  }
}

const oo_readyToEvalGuard =
  <C extends MContext, Ex extends EventBody, I>(
    fnBaseParam: FnBaseParams<C, Ex, I>[0],
    machineGuards: Required<Machine<any, any, any, any, any, any, any, any, any>>['guards'],
  ) =>
    ({ body, params }: NormalizedTransition['guards'][number]): boolean => {
      const fn = typeof body === 'string' ? machineGuards[body] : body
      if (!fn) {
        throw new Error(`invalid Guard name: "${body}"`)
      }
      return fn(fnBaseParam, typeof params !== 'function' ? params : params(fnBaseParam))
    }

function o_readyToFindTransitionByEvent<C extends MContext, Ex extends EventBody, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: Required<Machine<any, any, any, any, any, any, any, any, any>>['guards'],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
) {
  const _evalGuard = oo_readyToEvalGuard(fnBaseParam, machineGuards)

  // statePath に設定されているイベント eType から guard が一番最初に通った transition を返す
  return (statePath: string, eType: string) => {
    const stateItem = stateCatalog.get(statePath)
    if (!stateItem) {
      throw new Error(`unknown state path: ${statePath}`)
    }
    const { events } = stateItem.def
    return !hasOwnProperty(events, eType) ? undefined
      : events[eType]!.find(({ guards }) => !guards.length || guards.every((e) => _evalGuard(e)))
  }
}

function o_tCandidatesIntoTExec(tCandidatesX: (X_EventTransitionCandidate & { leafRoot?: string })[]): TransitionExec[] {
  return tCandidatesX.map(({ transition, leaves, leafRoot }) => {
    const from = (() => {
      const { fullTo } = transition
      if (!fullTo) return undefined
      if (leaves.length === 1) return leaves[0]
      const _nextParent = parentPathOf(fullTo)
      // NOTE: filtered は空になる可能性もある
      const filtered = leaves.filter((pth) => pth.startsWith(_nextParent))
      return filtered.length === 1 ? filtered[0] : leafRoot || calcCommonPathPrefix(leaves)
    })()
    return { transition, from }
  })
}

function removeConflictedTransitions(
  tCandidates: X_EventTransitionCandidate[],
  regionPaths: string[],
): TransitionExec[] {
  if (tCandidates.length < 2 || !regionPaths.length) {
    return o_tCandidatesIntoTExec(tCandidates)
  }

  // region 内かどうかを leafRoot で判定し、fullTo で region 外に出ているか判定。出ていたら parallel path を返す
  const _getParallelPathIfExited = ((_regionPaths) =>
    (leafRoot: string, fullTo: string) => _regionPaths.reduce((acc, regionPath) => {
      return leafRoot.startsWith(regionPath) && !fullTo.startsWith(regionPath) ? parentPathOf(regionPath) : acc
    }, '')
  )(regionPaths)

  const nonShiftTExecs: TransitionExec[] = []
  const nonPExitedTCandXs: (X_EventTransitionCandidate & { leafRoot: string })[] = []
  const exitedParallelDict: Record<string, X_EventTransitionCandidate> = Object.create(null)
  for (const tCand of tCandidates) {
    const { transition, leaves } = tCand
    const { fullTo } = transition
    if (!fullTo) {
      nonShiftTExecs.push({ transition, from: undefined })
      continue
    }
    const leafRoot = calcCommonPathPrefix(leaves)
    const exitedParallelPath = _getParallelPathIfExited(leafRoot, fullTo)
    if (!exitedParallelPath) {
      nonPExitedTCandXs.push({ leafRoot, ...tCand })
    } else if (!(exitedParallelPath in exitedParallelDict)) {
      exitedParallelDict[exitedParallelPath] = tCand
    }
  }

  const _exitParallelPaths: string[] = []
  const exitedParallelTExecs = Object.entries(exitedParallelDict).sort(([a], [b]) => a > b ? 1 : -1).reduce((acc, [pth, { transition }]) => {
    if (_exitParallelPaths.every((el) => !pth.startsWith(el))) {
      _exitParallelPaths.push(pth)
      acc.push({ from: pth, transition })
    }
    return acc
  }, [] as TransitionExec[])

  return [
    ...nonShiftTExecs,
    ...o_tCandidatesIntoTExec(
      nonPExitedTCandXs.filter(({ leafRoot }) => _exitParallelPaths.every((el) => !leafRoot.startsWith(el)))
    ),
    ...exitedParallelTExecs
  ]
}

// stateTree の一番深い場所にマッチする transition を収集する
function o_findDeepestTransitions(
  stateTree: RecursiveRecord,
  parent: string,
  eType: string,
  findTransitionByEvent: (pth: string, eType: string) => NormalizedTransition | undefined,
): [X_EventTransitionCandidate[], string[]] {
  const tCandidates: X_EventTransitionCandidate[] = []
  const leafPaths: string[] = []
  for (const stateName in stateTree) {
    const pth = `${parent}${ST_DELIM}${stateName}`
    const [childExecs, cLeafPaths] =
      o_findDeepestTransitions(stateTree[stateName]!, pth, eType, findTransitionByEvent)
    if (childExecs.length) {
      tCandidates.push(...childExecs)
      continue
    }
    const transition = findTransitionByEvent(pth, eType)
    if (transition) {
      tCandidates.push({ transition, firedIn: pth, leaves: cLeafPaths.length ? cLeafPaths : [pth] })
    } else {
      leafPaths.push(...(cLeafPaths.length ? cLeafPaths : [pth]))
    }
  }
  return [tCandidates, leafPaths]
}

export function calcEventTransition<C extends MContext, Ex extends EventBody, I>(
  eType: string,
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  crrStateTree: RecursiveRecord,
  machineGuards: Required<Machine<any, any, any, any, any, any, any, any, any>>['guards'],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  regionPaths: string[],
) {
  const findTransitionByEvent = o_readyToFindTransitionByEvent(fnBaseParam, machineGuards, stateCatalog)
  const [tExecs] = o_findDeepestTransitions(crrStateTree, '', eType, findTransitionByEvent)

  return removeConflictedTransitions(tExecs, regionPaths)
}

export function calcNewPaths(
  states: Record<string, NormalizedStateItem>,
  stateName: string | undefined,
): string[] | null {
  if (!stateName) return null
  if (!(stateName in states)) {
    throw new Error(`initial state "${stateName}" is not found in ${stringifyCircular(states)}`)
  }
  const stateItem = states[stateName]!
  const getStatePath = () => `${stateItem.def.pPath}${ST_DELIM}${stateName}`
  if (!stateItem?.sub) return [getStatePath()]
  const subResults = (() => {
    const { sub } = stateItem
    if ('states' in sub) {
      const { states: subStates, initial } = sub
      return calcNewPaths(subStates, initial)
    }
    return Object.values(sub.regions)
      .map(({ sub: { states, initial } }) => calcNewPaths(states, initial))
      .filter((x) => x != null)
      .flat()
  })()

  return subResults?.length ? subResults : [getStatePath()]
}

export function calcTransitionDelta(newPaths: string[], crrStateTree: RecursiveRecord) {
  // TODO: 子ノード終了時の親ノードだけ生きてる状態に対応していない
  // NOTE: 子ノード終了は特別なイベントの発行によって捉えられる
  const reavedTrees: [string, RecursiveRecord][] = []
  const enteredTreeOf: RecursiveRecord = Object.create(null)
  for (const pth of newPaths) {
    const stateNames = splitStPath(pth)
    let focusedNode = crrStateTree
    let brokenIdx = -1
    for (const [i, sName] of stateNames.entries()) {
      if (!(sName in focusedNode)) {
        brokenIdx = i
        break
      }
      focusedNode = focusedNode[sName]!
    }
    if (brokenIdx == -1) {
      continue
    }
    const prefix = `${ST_DELIM}${stateNames.slice(0, brokenIdx).join(ST_DELIM)}`
    reavedTrees.push([prefix, focusedNode])
    enteredTreeOf[prefix] = enteredTreeOf[prefix] || Object.create(null)
    let target = enteredTreeOf[prefix]!
    for (const name of stateNames.slice(brokenIdx)) {
      target[name] = target[name] || Object.create(null)
      target = target[name]!
    }
  }
  return { reavedTrees, enteredTreeOf }
}

export function procExit(
  reavedEntries: [string, RecursiveRecord][],
  prefix: string,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
) {
  for (const [stateName, children] of reavedEntries) {
    const entries = Object.entries(children)
    const pth = `${prefix}${ST_DELIM}${stateName}`
    if (entries.length) {
      procExit(entries, pth, stateCatalog)
    }
    if (!stateCatalog.has(pth)) {
      throw new Error(`exitHook: unknown state path: ${pth}`)
    }
    const {
      def: { exitHook },
    } = stateCatalog.get(pth)!
    if (exitHook) {
      // TODO: キューに積む
    }
  }
}

export function procEntry(
  enteredEntries: [string, RecursiveRecord][],
  prefix: string,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
) {
  for (const [stateName, children] of enteredEntries) {
    const pth = `${prefix}${ST_DELIM}${stateName}`
    if (!stateCatalog.has(pth)) {
      throw new Error(`entryHook: unknown state path: ${pth}`)
    }
    const {
      def: { entryHook, invocations, builtinEvents },
    } = stateCatalog.get(pth)!
    if (entryHook) {
      // TODO: キューに積む
    }

    const entries = Object.entries(children)
    if (entries.length) {
      procEntry(entries, pth, stateCatalog)
    }

    if (builtinEvents[':always:']) {
      // TODO: キューに積む
    }
  }
}

export const __test__ = {
  removeConflictedTransitions,
}
