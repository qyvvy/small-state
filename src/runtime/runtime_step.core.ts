import type {
  ActionFnParams,
  CheckFn,
  EmitFn,
  EmittedEvent,
  EnqueueFn,
  EventBody,
  FnBaseParams,
  GlobalStDefItem,
  InternalEPayload,
  InternalEType,
  InternalEventBody,
  LimitedActionFnParams,
  Machine,
  MContext,
  NormalizedAction,
  NormalizedDefinition,
  NormalizedInvocation,
  NormalizedStateItemBoth,
  NormalizedTransition,
  NStateItemDef,
  ParallelNormalizedDefinition,
  ParallelNormalizedStateItem,
  ParamsInput,
  ParamsInputArgsOf,
  UpdateFn,
  UpdateFnParam,
} from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Placeholder, RecursiveRecord, Values } from '../shared/general.types'
import { deepFreeze, deriveCommonPathPrefix, parentPathOf, splitStPath } from '../shared/utils'
import {
  readyToEvalGuard,
  resolveActionElement,
  resolveGuardElement,
  runtimeUtils,
  traverseStateTreeMatch,
} from './runtime_utils'

type X_TransitionCandidate = {
  leaves: string[] // 遷移元候補(末端ステート)
  firedIn: string // イベント発火箇所 (※現状、使われていない)
  transition: NormalizedTransition
  tIndex: number // 採用された transition のインデックス(エラーメッセージ用)
}
export type TransitionExec = {
  from?: string // 遷移元: このパス以下の exit が深いところから順に呼ばれる
  transition: NormalizedTransition
  tIndex: number
}
//export type DoneBranch = { srcPath: string; def: NStateItemDef<string> }
export type EnqueueEventFn<E extends EventBody> = (event: E | InternalEventBody, payload?: InternalEPayload) => void

function oo_adjustSrcPathForParallel(srcPath: string, fullTo: string, regionPaths: string[]) {
  const srcRegions = regionPaths.filter((region) => srcPath.startsWith(region))
  if (!srcRegions.length) return srcPath
  const [deepestSrcRegion] = srcRegions
  const commonPrefix = deriveCommonPathPrefix([srcPath, fullTo])
  if (commonPrefix.length >= deepestSrcRegion!.length) {
    return srcPath
  }
  const shallowestCommonRegion = srcRegions
    .reverse()
    .find((region) => region.startsWith(commonPrefix) && region !== commonPrefix)!
  return parentPathOf(shallowestCommonRegion)
}
function o_tCandidatesIntoTExec(
  tCandidatesX: (X_TransitionCandidate & { leafCommonPrefix?: string })[],
  regionPaths: string[],
): TransitionExec[] {
  return tCandidatesX.map(({ transition, tIndex, leaves, leafCommonPrefix }) => {
    // crrStateTree の末端(=leaves)から選び from とする。leaves が複数ある場合は共通ルートを from とする。
    const qFrom = (() => {
      const { fullTo } = transition
      if (!fullTo) return undefined
      if (leaves.length === 1) return leaves[0]
      const _destParent = parentPathOf(fullTo)
      // 行き先が兄弟ステートなら leaves 内の共通部分を遷移元とする
      // NOTE: filtered は空になる可能性もある
      const filtered = !_destParent ? leaves : leaves.filter((leaf) => leaf.startsWith(_destParent))
      if (filtered.length) {
        return filtered.length === leafCommonPrefix?.length ? leafCommonPrefix : deriveCommonPathPrefix(filtered)
      }
      return leafCommonPrefix || deriveCommonPathPrefix(leaves)
    })()

    const from = qFrom ? oo_adjustSrcPathForParallel(qFrom, transition.fullTo!, regionPaths) : qFrom
    return { tIndex, transition, from }
    //return { tIndex, transition, from }
  })
}

// region 内かどうかを leafCommonPrefix で判定し、fullTo で region 外に出ているか判定。出ていたら parallel path を返す
function o_readyToGetParallelPathIfExited(regionPaths: string[]) {
  return (leafCommonPrefix: string, fullTo: string) =>
    regionPaths.reduce((acc, regionPath) => {
      return leafCommonPrefix.startsWith(regionPath) && !fullTo.startsWith(regionPath) ? parentPathOf(regionPath) : acc
    }, '')
}

function o_resolveExitedParallel(exitedParallelDict: Record<string, X_TransitionCandidate>) {
  const exitedParallelPaths: string[] = []
  const exitedParallelTExecs = Object.entries(exitedParallelDict)
    .sort(([pathA], [pathB]) => (pathA > pathB ? 1 : -1)) // 昇順
    .reduce((acc, [pth, { transition, tIndex }]) => {
      // 上位ステートから調べて登録。登録されたステートの下位ステートは弾く
      if (exitedParallelPaths.every((el) => !pth.startsWith(el))) {
        exitedParallelPaths.push(pth)
        acc.push({ from: pth, transition, tIndex })
      }
      return acc
    }, [] as TransitionExec[])
  return { exitedParallelPaths, exitedParallelTExecs }
}

function x_removeConflictedTransitions(tCandidates: X_TransitionCandidate[], regionPaths: string[]): TransitionExec[] {
  if (tCandidates.length < 2 || !regionPaths.length) {
    return o_tCandidatesIntoTExec(tCandidates, regionPaths)
  }

  const _getParallelPathIfExited = o_readyToGetParallelPathIfExited(regionPaths)

  const stateStayingTExecs: TransitionExec[] = []
  const nonPExitedTCandXs: (X_TransitionCandidate & { leafCommonPrefix: string })[] = []
  const acc_exitedParallelDict: Record<string, X_TransitionCandidate> = Object.create(null)

  for (const tCand of tCandidates) {
    const { transition, tIndex, leaves } = tCand
    const { fullTo } = transition
    if (!fullTo) {
      stateStayingTExecs.push({ transition, tIndex, from: undefined })
      continue
    }
    const leafCommonPrefix = deriveCommonPathPrefix(leaves)
    const exitedParallelPath = _getParallelPathIfExited(leafCommonPrefix, fullTo)
    if (!exitedParallelPath) {
      nonPExitedTCandXs.push({ ...tCand, leafCommonPrefix })
    } else if (!(exitedParallelPath in acc_exitedParallelDict)) {
      acc_exitedParallelDict[exitedParallelPath] = tCand
    }
  }

  const { exitedParallelPaths, exitedParallelTExecs } = o_resolveExitedParallel(acc_exitedParallelDict)

  return [
    ...stateStayingTExecs,
    ...o_tCandidatesIntoTExec(
      // 脱出する parallel 配下にある region 内同士への遷移は除去する
      nonPExitedTCandXs.filter(({ leafCommonPrefix }) =>
        exitedParallelPaths.every((el) => !leafCommonPrefix.startsWith(el)),
      ),
      regionPaths,
    ),
    ...exitedParallelTExecs,
  ]
}

// stateTree の一番深い場所にマッチする transition を収集する
function x_findDeepestTransitions(
  stateTree: RecursiveRecord,
  parent: string,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  findTransition: (
    stItemDef: GlobalStDefItem<string>,
    eType: string | InternalEType,
  ) => { tIndex: number; transition: NormalizedTransition } | undefined,
  eType: string = '',
): [X_TransitionCandidate[], string[]] {
  const _getStItemDef = (pth: string) => {
    const stateItem = stateCatalog.get(pth)
    if (!stateItem) {
      throw new Error(`Unknown state path "${pth}"`)
    }
    return stateItem.def
  }

  // NOTE: X_TransitionCandidate が末端で作られたなら leaves は末端パスになるが、上位階層で作られたなら末端からリフトアップされた leafPaths が使われる
  const tCandidates: X_TransitionCandidate[] = []
  const leafPaths: string[] = [] // leaves になる
  for (const stateName in stateTree) {
    const pth = `${parent}${ST_DELIM}${stateName}`
    const [childCandidates, cLeafPaths] = x_findDeepestTransitions(
      stateTree[stateName]!,
      pth,
      stateCatalog,
      findTransition,
      eType,
    )
    if (childCandidates.length) {
      tCandidates.push(...childCandidates)
      continue
    }
    const result = findTransition(_getStItemDef(pth), eType)
    if (result) {
      const { transition, tIndex } = result
      tCandidates.push({ transition, tIndex, firedIn: pth, leaves: cLeafPaths.length ? cLeafPaths : [pth] })
    } else {
      leafPaths.push(...(cLeafPaths.length ? cLeafPaths : [pth]))
    }
  }
  return [tCandidates, leafPaths]
}

// ==

function o_evalActionParams<C extends MContext, Ex extends EventBody, I>(
  param: unknown | ((arg: FnBaseParams<C, Ex, I>[0]) => unknown),
  context: C,
  event: Ex,
  input: I,
) {
  return typeof param !== 'function' ? param : param(runtimeUtils.makeFnBaseParam(context, event, input))
}

export function readyAction<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  Ex extends E | InternalEventBody = E | InternalEventBody,
>(
  origContext: C,
  event: Ex,
  input: I,
  //machineGuards: Record<string, MachineGuardFn<C, Ex, I>>,
  machineGuards: Machine<C, E, I, any, any, any, any, any, any>['guards'],
  machineActions: Machine<C, E, I, EM, any, any, any, any, any>['actions'],
  //Record<string, MachineActionFn<C, Ex, I, EM>>,
  emit: EmitFn<EM>,
) {
  let context = deepFreeze(origContext)
  let updateApplications: UpdateFnParam<C>[] = []
  //const updatingQueue = new AsyncProcQueue()
  let enqueuees: {
    fn: (...arg: LimitedActionFnParams<C, Ex, I, EM>) => unknown
    params: any
  }[] = []

  const _local = {
    context,
    assign(partial: Partial<C>) {
      this.context = deepFreeze({ ...context, ...partial })
    },
    reflect() {
      context = this.context
    },
  }

  const update: UpdateFn<C> = (updates: UpdateFnParam<C>) => {
    if (!updates || typeof updates !== 'object') {
      throw new Error(`invalid updates argument: ${JSON.stringify(updates)}`)
    }
    updateApplications.push(updates)

    //updatingQueue.add(
    //  async () => {
    //    const partial = Object.fromEntries(
    //      await Promise.all(
    //        Object.entries(updates).map(async ([key, val]) => {
    //          return [key, typeof val === 'function' ? await val() : await val]
    //        }),
    //      ),
    //    )
    //    _local.assign(partial)
    //  },
    //)
  }

  function applyUpdate() {
    for (const updates of updateApplications) {
      const partial = Object.entries(updates).reduce(
        (acc, [key, val]) => {
          acc[key as keyof C] = typeof val === 'function' ? val() : val
          return acc
        },
        {} as Partial<C>,
      )
      context = { ...context, ...partial }
    }
    if (!updateApplications.length) {
      return
    }
    context = deepFreeze(context)
    updateApplications = []
  }

  function check<Gk extends (keyof G & string) | never>(
    type:
      | Gk
      | Values<{
        [K in keyof G & string as unknown extends G[K] ? never : K]: { [K2 in K]: ParamsInput<G[K], C, Ex, I> }
      }>,
    ...args: ParamsInputArgsOf<G, Gk, C, Ex, I>
  ) {
    const [fn, params] = resolveGuardElement<C, Ex, I>(type, machineGuards, args?.[0])
    const fnBaseParam = runtimeUtils.makeFnBaseParam<C, Ex, I>(context, event, input)
    return fn(fnBaseParam, typeof params !== 'function' ? params : params(fnBaseParam))
  }

  let isProcessingQueue = false
  function enqueue<Ak extends (keyof A & string) | never>(
    type:
      | Ak
      | Values<{
        [K in keyof A & string as unknown extends A[K] ? never : K]: { [K2 in K]: ParamsInput<A[K], C, Ex, I> }
      }>
      | ((arg: LimitedActionFnParams<C, Ex, I, EM>[0]) => unknown),
    ...args: ParamsInputArgsOf<A, Ak, C, Ex, I>
  ) {
    if (isProcessingQueue) {
      throw new Error(`Cannot enqueue while processing the queue.`)
    }
    const [fn, params] = resolveActionElement<C, Ex, I, EM>(type, machineActions, args?.[0])
    enqueuees.push({ fn, params })
  }

  let saveContext = origContext
  let saveFnBaseParam: ReturnType<typeof runtimeUtils.makeFnBaseParam<C, Ex, I>>

  return {
    makeFnBaseParam() {
      if (!(context === saveContext && saveFnBaseParam)) {
        saveContext = context
        saveFnBaseParam = runtimeUtils.makeFnBaseParam(context, event, input)
      }
      return saveFnBaseParam
    },

    execAction(transitionAction: NormalizedAction<C, Ex, I, EM, G, A>) {
      const bodies = resolveActionElement<C, Ex, I, EM, ActionFnParams<C, Ex, I, EM, G, A>[0]>(
        transitionAction,
        machineActions,
      )
      if (bodies.length === 1) {
        bodies[0]({
          context,
          c: context,
          event,
          e: event,
          input,
          update,
          emit,
          check: check as CheckFn<C, Ex, I, G>,
          enqueue: enqueue as EnqueueFn<C, Ex, I, EM, A>,
        })
      } else {
        const [fn, params] = bodies
        fn(
          { context, c: context, event, e: event, input, update, emit },
          o_evalActionParams(params, context, event, input),
        )
      }
      applyUpdate()
    },

    processQueue() {
      //await updatingQueue.onIdle()
      //_local.reflect()

      // enqueue 中で enqueue したら警告する
      isProcessingQueue = true
      try {
        for (const { fn, params } of enqueuees) {
          fn(
            { context, c: context, event, e: event, input, update, emit },
            o_evalActionParams(params, context, event, input),
          )
          applyUpdate()
        }
      } finally {
        enqueuees = []
        isProcessingQueue = false
      }
      //await updatingQueue.onIdle()
    },

    getResult() {
      return { context }
    },
  }
}

function o_readyToFindInternalEventTransition<C extends MContext, Ex extends EventBody, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: Machine<any, any, any, any, any, any, any, any, any>['guards'],
  internalEPayload: InternalEPayload,
) {
  const _evalGuard = readyToEvalGuard(fnBaseParam, machineGuards)

  return ({ internalEvents }: GlobalStDefItem<string>, eType: string) => {
    const internalEType = eType as InternalEType
    if (Object.hasOwn(internalEvents, internalEType)) {
      const cond = internalEvents[internalEType]!.cond
      if (!cond || cond(internalEPayload)) {
        const { transitions } = internalEvents[internalEType]!
        const tIndex = transitions.findIndex(({ guards }) => !guards.length || guards.every((e) => _evalGuard(e)))
        if (tIndex != -1) {
          return { tIndex, transition: transitions[tIndex]! }
        }
      }
    }
    return undefined
  }
}

function o_readyToFindTransitionByEvent<C extends MContext, Ex extends EventBody, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: Machine<any, any, any, any, any, any, any, any, any>['guards'],
) {
  const _evalGuard = readyToEvalGuard(fnBaseParam, machineGuards)

  // statePath に設定されているイベント eType から guard が一番最初に通った transition を返す
  return ({ events }: GlobalStDefItem<string>, eType: string) => {
    if (Object.hasOwn(events, eType)) {
      const transitions = events[eType]!
      const tIndex = transitions.findIndex(({ guards }) => !guards.length || guards.every((e) => _evalGuard(e)))
      if (tIndex != -1) {
        return { tIndex, transition: transitions[tIndex]! }
      }
    }
    return undefined
  }
}

export function deriveEventTransition<C extends MContext, Ex extends EventBody, I>(
  eType: string,
  internalEPayload: InternalEPayload | undefined,
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  crrStateTree: RecursiveRecord,
  machineGuards: Machine<any, any, any, any, any, any, any, any, any>['guards'],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  regionPaths: string[],
  globalDefItem: GlobalStDefItem<string>,
): TransitionExec[] {
  const findTransition = internalEPayload
    ? o_readyToFindInternalEventTransition(fnBaseParam, machineGuards, internalEPayload)
    : o_readyToFindTransitionByEvent(fnBaseParam, machineGuards)

  const [tCandidates, cLeafPaths] = x_findDeepestTransitions(crrStateTree, '', stateCatalog, findTransition, eType)

  if (!tCandidates.length) {
    const result = findTransition(globalDefItem, eType)
    if (result) {
      const { transition, tIndex } = result
      tCandidates.push({ transition, tIndex, firedIn: '/', leaves: cLeafPaths })
    }
  }

  return x_removeConflictedTransitions(tCandidates, regionPaths)
}

function* o_genExitPaths(stateNode: RecursiveRecord, parent: string): Generator<string> {
  for (const stateName in stateNode) {
    const pth = `${parent}${ST_DELIM}${stateName}`
    yield* o_genExitPaths(stateNode[stateName]!, pth)
    yield pth
  }
}
export function* genExitPaths(
  fromPath: string,
  crrStateTree: RecursiveRecord,
  fromPathStateSplitted: string[] = splitStPath(fromPath),
) {
  const { remaining, isExhausted } = traverseStateTreeMatch(fromPathStateSplitted, crrStateTree)
  if (!isExhausted) {
    throw new Error(`state "${fromPath}" is not found in ${JSON.stringify(crrStateTree)}`)
  }
  yield* o_genExitPaths(remaining, fromPath)
  yield fromPath
}

export function deleteNodeFromStateTree(fromPathStateSplitted: string[], crrStateTree: RecursiveRecord) {
  let focusedNode: RecursiveRecord | undefined = crrStateTree
  const secondLastIdx = fromPathStateSplitted.length - 2
  for (let i = 0; i <= secondLastIdx; i++) {
    focusedNode = focusedNode![fromPathStateSplitted[i]!]
    if (!focusedNode) {
      throw new Error(
        `state "${ST_DELIM}${fromPathStateSplitted.join(ST_DELIM)}" is not found in ${JSON.stringify(crrStateTree)}`,
      )
    }
  }
  delete focusedNode[fromPathStateSplitted[secondLastIdx + 1]!]
}

// destNode に未記載の、末端リーフを追加する
function oo_addSubStatesToDest(destNode: RecursiveRecord, { initial, states }: NormalizedDefinition) {
  if (!initial || initial in destNode) {
    return destNode
  }
  destNode[initial] = Object.create(null)
  const { sub } = states[initial]!
  if (!sub) {
    return destNode
  } else if (sub.dType === 'parallel') {
    oo_addParallelToDest(destNode[initial]!, sub.states)
  } else {
    oo_addSubStatesToDest(destNode[initial]!, sub)
  }
  return destNode
}
function oo_addParallelToDest(destNode: RecursiveRecord, regions: Record<string, ParallelNormalizedStateItem>) {
  for (const key in regions) {
    if (key in destNode) {
      continue
    }
    destNode[key] = Object.create(null)
    oo_addSubStatesToDest(destNode[key]!, regions[key]!.sub)
  }
}

function* o_genEntryStDefs(
  destNode: RecursiveRecord,
  crrStateNode: RecursiveRecord,
  stateDefinition: NormalizedDefinition | ParallelNormalizedDefinition,
): Generator<[stateName: string, stateNode: RecursiveRecord, stateItem: NStateItemDef<string>]> {
  const { states } = stateDefinition
  let isLeaf = true
  for (const key in destNode) {
    isLeaf = false
    const stDef = states?.[key]
    if (!stDef) throw new Error(`Unknown state "${key}"`)
    const { def, sub } = stDef
    if (!(key in crrStateNode)) {
      crrStateNode[key] = Object.create(null)
      yield [key, crrStateNode[key]!, def]
    }
    if (!sub) {
      continue
    }
    const cDestNode = destNode[key]!
    if (sub.dType === 'parallel') {
      oo_addParallelToDest(cDestNode, sub.states)
    }
    yield* o_genEntryStDefs(cDestNode, crrStateNode[key]!, sub)
  }
  if (isLeaf && 'initial' in stateDefinition && stateDefinition.initial) {
    yield* o_genEntryStDefs(oo_addSubStatesToDest(Object.create(null), stateDefinition), crrStateNode, stateDefinition)
  }
}

// NOTE: fullToSplittees が空でも末端リーフを遷移先に追加するので遷移先がない場合は次善に弾く必要がある
export function* updateStateTreeForEntry(
  fullToSplittees: string[][],
  crrStateTree: RecursiveRecord,
  stateDefinition: NormalizedDefinition,
) {
  // fullToSplittees: [['a','aa','aaa'], ['a','ab','aba'], ['a','ab','abb']]
  // -> destTree: {a:{aa:{aaa:{}}, ab:{aba:{},abb:{}}}}
  const destTree = (() => {
    const root = Object.create(null)
    for (const stateNames of fullToSplittees) {
      let focused = root
      for (const stName of stateNames) {
        focused[stName] = focused[stName] || Object.create(null)
        focused = focused[stName]
      }
    }
    return root
  })()
  yield* o_genEntryStDefs(destTree, crrStateTree, stateDefinition)
}

export function launchInvocations(
  invocations: NormalizedInvocation[],
  path: string,
  stateNode: RecursiveRecord,
  makeFnBaseParam: () => FnBaseParams<any, any, any>[0],
  machineServices: Machine<any, any, any, any, any, any, any, any, any>['services'],
  enqueueEvent: EnqueueEventFn<any>,
) {
  const stateNodeRef = new WeakRef(stateNode) // stateNode が生存していなければ enqueueEvent しない
  const fnBaseParam = makeFnBaseParam()
  for (const { id, input, src } of invocations) {
    const inputValue = input && typeof input === 'function' ? input(fnBaseParam) : undefined
    Promise.resolve(typeof src === 'function' ? src(inputValue) : machineServices[src]?.(inputValue))
      .then((data) => {
        if (stateNodeRef.deref()) {
          enqueueEvent({ type: `${id}/done`, data }, { path })
        }
      })
      .catch((error) => {
        if (stateNodeRef.deref()) {
          enqueueEvent({ type: `${id}/error`, error }, { path })
        }
      })
  }
}

function o_isAllLeafFinished(
  crrStateNode: RecursiveRecord,
  parent: string,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
): { isLeaf: boolean; isAllFinished: boolean } {
  let isLeaf = true,
    isAllFinished = true
  for (const stateName in crrStateNode) {
    isLeaf = false
    const pth = `${parent}${ST_DELIM}${stateName}`
    const cResult = o_isAllLeafFinished(crrStateNode[stateName]!, pth, stateCatalog)
    if (cResult.isLeaf) {
      const stateItem = stateCatalog.get(pth)
      if (!stateItem) {
        throw new Error(`Unknown state path "${pth}"`)
      }
      isAllFinished = isAllFinished && stateItem.def.final
    } else {
      isAllFinished = isAllFinished && cResult.isAllFinished
    }
  }
  return { isLeaf, isAllFinished }
}

export function* genChildDoneEvents(
  reachedFinalStateItems: Set<NStateItemDef<string>>,
  regionPathSet: Set<string>,
  crrStateTree: RecursiveRecord,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
): Generator<[EventBody, InternalEPayload]> {
  const parallelRoots = new Set<string>()
  for (const { pPath } of reachedFinalStateItems) {
    if (!pPath) continue
    if (regionPathSet.has(pPath)) {
      parallelRoots.add(parentPathOf(pPath))
    } else {
      yield [{ type: ':childDone:' }, { path: pPath }]
    }
  }
  for (const pth of parallelRoots) {
    const def = stateCatalog.get(pth)?.def
    if (!def?.internalEvents[':childDone:']?.transitions.length) {
      continue
    }
    const { remaining } = traverseStateTreeMatch(splitStPath(pth), crrStateTree)
    const { isAllFinished } = o_isAllLeafFinished(remaining, pth, stateCatalog)
    if (isAllFinished) {
      yield [{ type: ':childDone:' }, { path: pth }]
    }
  }
}

function o_readyToFindAlwaysTransition<C extends MContext, Ex extends EventBody, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: Machine<any, any, any, any, any, any, any, any, any>['guards'],
) {
  const _evalGuard = readyToEvalGuard(fnBaseParam, machineGuards)

  return ({ internalEvents }: GlobalStDefItem<string>) => {
    const transitions = internalEvents[':always:']?.transitions
    if (transitions) {
      const tIndex = transitions.findIndex(({ guards }) => !guards.length || guards.every((e) => _evalGuard(e)))
      if (tIndex != -1) {
        return { tIndex, transition: transitions[tIndex]! }
      }
    }
    return undefined
  }
}

export function evalAlwaysEvent<C extends MContext, Ex extends EventBody, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  crrStateTree: RecursiveRecord,
  machineGuards: Machine<any, any, any, any, any, any, any, any, any>['guards'],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  regionPaths: string[],
) {
  const findTransition = o_readyToFindAlwaysTransition(fnBaseParam, machineGuards)
  const [tCandidates] = x_findDeepestTransitions(crrStateTree, '', stateCatalog, findTransition)
  return x_removeConflictedTransitions(tCandidates, regionPaths)
}

export const __test__ = {
  o_readyToGetParallelPathIfExited,
  x_removeConflictedTransitions,
  oo_adjustSrcPathForParallel,
  //diggStateNode,
}
