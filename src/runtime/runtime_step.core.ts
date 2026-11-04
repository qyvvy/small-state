import type {
  ActionFnParams,
  AnyMachine,
  BuiltinSendableEvent,
  CheckFn,
  EmittableEvent,
  EnqueueFn,
  FnBaseParams,
  InternalEPayload,
  InternalEType,
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
  SendableEvent,
  SendToFn,
  ServiceFn,
  ServiceRecord,
  SystemSendableEvent,
  TopLvStDefItem,
  UpdateFn,
  UpdateFnParam,
} from '../machine/m.types'
import { SystemEventSymbol } from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Placeholder, RecursiveRecord, Values } from '../shared/general.types'
import { deepFreeze, parentPathOf, splitStPath } from '../shared/utils'
import { makeRuntime } from './Runtime'
import type { RuntimeOutbound, StateRoute } from './r.types'
import {
  readyToEvalGuard,
  resolveActionElement,
  resolveGuardElement,
  runtimeUtils,
  traverseStateRouteMatch,
} from './runtime_utils'

type X_TransitionCandidate = {
  leaves: string[] // 遷移元パス候補(末端ステート)
  firedIn: string // イベント発火箇所 (※現状、使われていない)
  transition: NormalizedTransition
  tIndex: number // 採用された transition のインデックス(エラーメッセージ用)
}
export type TransitionExec = {
  lca?: string // 遷移元: このパス配下の exit が深いところから順に呼ばれる
  transition: NormalizedTransition
  tIndex: number
}

export type StateEntryAdditionalData = {
  stateName: string
  isRegionChild?: boolean
}

function buildTransitionCandidate(
  transition: NormalizedTransition,
  tIndex: number,
  firedIn: string,
  leaves: string[],
): X_TransitionCandidate {
  return {
    transition,
    tIndex,
    firedIn,
    leaves,
  }
}

const x_getStItemDef = (stPath: string, stateCatalog: Map<string, NormalizedStateItemBoth>) => {
  const stateItem = stateCatalog.get(stPath)
  if (!stateItem) {
    throw new Error(`Unknown state path "${stPath}"`)
  }
  return stateItem.def
}

function o_deriveLowestCommonAncestor(model: string, leaves: string[]) {
  let crrLeaves = leaves
  let bgn = 1 // model, leaves は '/' から始まる想定なので最初の1文字はスキップしている
  let end = model.indexOf(ST_DELIM, bgn) + 1
  while (end) {
    const needle = model.slice(bgn, end)
    crrLeaves = crrLeaves.filter((pth) => pth.startsWith(needle, bgn))
    if (!crrLeaves.length) {
      break
    }
    bgn = end
    end = model.indexOf(ST_DELIM, bgn) + 1
  }
  return model.slice(0, bgn - 1)
}

function x_removeConflictedTransitions(
  tCandidates: X_TransitionCandidate[],
  activeParallels: string[],
): TransitionExec[] {
  if (tCandidates.length < 2 || !activeParallels.length) {
    return tCandidates.map(({ transition, tIndex, leaves }) => {
      const { fullTo } = transition
      const lca = !fullTo ? undefined : o_deriveLowestCommonAncestor(fullTo, leaves)
      return { tIndex, transition, lca }
    })
  }

  const stateStayingTExecs: TransitionExec[] = []
  const nonPExitedTExecs: TransitionExec[] = []
  const accStChangingTExecDict: Record<string | symbol, TransitionExec> = Object.create(null)
  for (const tCand of tCandidates) {
    const { transition, tIndex, leaves } = tCand
    const { fullTo } = transition
    if (!fullTo) {
      stateStayingTExecs.push({ transition, tIndex })
      continue
    }
    const lca = o_deriveLowestCommonAncestor(fullTo, leaves)
    const exitedParallel = (() => {
      const idx = fullTo.indexOf(ST_DELIM, lca.length + 1)
      const needle = idx == -1 ? fullTo : fullTo.slice(0, idx + 1)
      const candidates = activeParallels.filter((p) => !p.startsWith(needle) && p.startsWith(lca))
      return !candidates.length ? '' : candidates.reduce((a, b) => (a.length <= b.length ? a : b))
    })()
    if (!exitedParallel) {
      nonPExitedTExecs.push({ transition, tIndex, lca })
    } else if (!(exitedParallel in accStChangingTExecDict)) {
      accStChangingTExecDict[exitedParallel] = { transition, tIndex, lca }
    }
  }

  const [tmp1, tmp2] = ((): [TransitionExec[], TransitionExec[]] => {
    const _adoptedParallels: string[] = []
    const exitedParallelTExecs = Object.entries(accStChangingTExecDict)
      .sort(([pathA], [pathB]) => (pathA > pathB ? 1 : -1)) // 昇順
      .reduce((acc, [pth, tExec]) => {
        // 上位ステートから調べて登録。登録されたステートの下位ステートは弾く
        if (!_adoptedParallels.some((parPath) => pth.startsWith(parPath))) {
          _adoptedParallels.push(pth)
          acc.push(tExec)
        }
        return acc
      }, [] as TransitionExec[])
    return [
      exitedParallelTExecs,
      nonPExitedTExecs.filter(({ lca }) => !_adoptedParallels.some((pth) => lca?.startsWith(pth))),
    ]
  })()

  return [...stateStayingTExecs, ...tmp1, ...tmp2]
}

function o_findChildOrSelfTransition(
  stPath: string,
  stateRoute: StateRoute,
  childIdx: number,
  activeParallelSet: Set<string>,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  findTransition: (
    stItemDef: TopLvStDefItem<string>,
    eType: string | InternalEType,
  ) => { tIndex: number; transition: NormalizedTransition } | undefined,
  eType: string,
): [X_TransitionCandidate[], leaves: string[]] {
  const [childCandidates, cLeaves] = x_findDeepestTransitions(
    stateRoute,
    childIdx,
    stPath,
    activeParallelSet,
    stateCatalog,
    findTransition,
    eType,
  )
  if (childCandidates.length) {
    return [childCandidates, []]
  }
  const result = findTransition(x_getStItemDef(stPath, stateCatalog), eType)
  const leaves: string[] = cLeaves.length ? cLeaves : [stPath]
  if (!result) {
    return [[], leaves]
  }
  const { transition, tIndex } = result
  return [[buildTransitionCandidate(transition, tIndex, stPath, leaves)], []]
}

// stateRoute の一番深い場所にマッチする transition を収集する
// NOTE: X_TransitionCandidate が末端で作られたなら leaves は末端パスになるが、上位階層で作られたなら末端からリフトアップされた leafPaths が使われる
function x_findDeepestTransitions(
  stateRoute: StateRoute,
  idx: number,
  parentPath: string,
  activeParallelSet: Set<string>,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  findTransition: (
    stItemDef: TopLvStDefItem<string>,
    eType: string | InternalEType,
  ) => { tIndex: number; transition: NormalizedTransition } | undefined,
  eType: string = '',
): [X_TransitionCandidate[], leaves: string[]] {
  if (idx >= stateRoute.length) {
    return [[], []]
  }
  const stateNameOrParallel = stateRoute[idx]!
  if (typeof stateNameOrParallel === 'string') {
    return o_findChildOrSelfTransition(
      `${parentPath}${ST_DELIM}${stateNameOrParallel}`,
      stateRoute,
      idx + 1,
      activeParallelSet,
      stateCatalog,
      findTransition,
      eType,
    )
  }
  const { parallel, regions } = stateNameOrParallel
  const parallelRoot = `${parentPath}${ST_DELIM}${parallel}`
  activeParallelSet.add(parallelRoot)
  const accTCandidates: X_TransitionCandidate[] = []
  const accLeaves: string[] = [] // leaves になる
  for (const key in regions) {
    const [resultCandidates, resultLeaves] = o_findChildOrSelfTransition(
      `${parentPath}${ST_DELIM}${parallel}${ST_DELIM}${key}`,
      regions[key]!,
      0,
      activeParallelSet,
      stateCatalog,
      findTransition,
      eType,
    )
    if (resultCandidates.length) {
      accTCandidates.push(...resultCandidates)
    }
    if (resultLeaves.length) {
      accLeaves.push(...resultLeaves)
    }
  }
  if (accTCandidates.length) {
    return [accTCandidates, []]
  }
  const result = findTransition(x_getStItemDef(parallelRoot, stateCatalog), eType)
  if (!result) {
    return [[], accLeaves]
  }
  const { transition, tIndex } = result
  return [[buildTransitionCandidate(transition, tIndex, parallelRoot, accLeaves)], []]
}

// ==

function o_unwrapSystemEvent(
  event: SendableEvent | BuiltinSendableEvent | SystemSendableEvent,
): SendableEvent | BuiltinSendableEvent {
  return !(SystemEventSymbol in event && event.payload) ? event : event.payload
}

function o_evalActionParams<C extends MContext, Ex extends SendableEvent, I>(
  param: unknown | ((arg: FnBaseParams<C, Ex, I>[0]) => unknown),
  context: C,
  event: Ex,
  input: I,
) {
  return typeof param !== 'function' ? param : param(runtimeUtils.makeFnBaseParam(context, event, input))
}

export function readyAction<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ExRaw extends E | BuiltinSendableEvent | SystemSendableEvent,
  Ex extends E | BuiltinSendableEvent = Exclude<ExRaw, SystemSendableEvent>,
>(
  origContext: C,
  rawEvent: ExRaw,
  input: I,
  machineGuards: Machine<C, E, I, any, any, any, any, any, any>['internal']['guards'],
  machineActions: Machine<C, E, I, EM, any, any, any, any, any>['internal']['actions'],
  rtOutbound: RuntimeOutbound<E, EM, S>,
) {
  const event = o_unwrapSystemEvent(rawEvent) as Ex
  const { emit } = rtOutbound
  let context = deepFreeze(origContext)
  let updateApplications: UpdateFnParam<C>[] = []
  let enqActions: {
    fn: (...arg: LimitedActionFnParams<C, Ex, I, EM>) => unknown
    params: any
  }[] = []

  const update: UpdateFn<C> = (updates: UpdateFnParam<C>) => {
    if (!updates || typeof updates !== 'object') {
      throw new Error(`RT"${rtOutbound.id}"> Invalid updates argument: ${JSON.stringify(updates)}`)
    }
    updateApplications.push(updates)
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

  function sendTo(
    serviceName: string,
    ...args: [event: SendableEvent] | [subKey: string | number, event: SendableEvent]
  ) {
    const [subKey, sEvent] = args.length == 2 ? args : (['', args[0]] as const)
    const childKey = subKey || typeof subKey === 'number' ? `${serviceName}:${subKey}` : serviceName
    if (!Object.hasOwn(rtOutbound.children, childKey)) {
      throw new Error(`RT"${rtOutbound.id}"> Cannot send event to "${childKey}": child not found.`)
    }
    const service = rtOutbound.children[childKey]
    service?.send(sEvent)
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
      throw new Error(`RT"${rtOutbound.id}"> Nested enqueue operations are not supported.`)
    }
    const [fn, params] = resolveActionElement<C, Ex, I, EM>(type, machineActions, args?.[0])
    enqActions.push({ fn, params })
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

    execAction<Exx extends Eo extends undefined ? Ex : any, Eo extends SendableEvent | undefined = undefined>(
      transitionAction: NormalizedAction<C, Ex, I, EM, G, A, S>,
      eventOverride?: Eo,
    ) {
      const bodies = resolveActionElement<C, Ex, I, EM, ActionFnParams<C, Ex, I, EM, G, A, S>[0]>(
        transitionAction,
        machineActions,
      )
      const qEvent = !eventOverride ? event : (o_unwrapSystemEvent(eventOverride) as Exx)
      if (bodies.length === 1) {
        bodies[0]({
          context,
          c: context,
          event: qEvent,
          e: qEvent,
          input,
          update,
          sendTo: sendTo as SendToFn<S>,
          emit,
          check: check as CheckFn<C, Ex, I, G>,
          enqueue: enqueue as EnqueueFn<C, Ex, I, EM, A>,
        })
      } else {
        const [fn, params] = bodies
        fn(
          { context, c: context, event: qEvent, e: qEvent, input, update, emit },
          o_evalActionParams(params, context, qEvent, input),
        )
      }
      applyUpdate()
    },

    processQueue() {
      // enqueue 中で enqueue したら警告する
      isProcessingQueue = true
      try {
        for (const { fn, params } of enqActions) {
          fn(
            { context, c: context, event, e: event, input, update, emit },
            o_evalActionParams(params, context, event, input),
          )
          applyUpdate()
        }
      } finally {
        enqActions = []
        isProcessingQueue = false
      }
    },

    getResult() {
      return { context }
    },
  }
}

function o_readyToFindInternalEventTransition<C extends MContext, Ex extends SendableEvent, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: AnyMachine['internal']['guards'],
  internalEPayload: InternalEPayload,
) {
  const _evalGuard = readyToEvalGuard(fnBaseParam, machineGuards)

  return ({ internalEvents }: TopLvStDefItem<string>, eType: string) => {
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

function o_readyToFindTransitionByEvent<C extends MContext, Ex extends SendableEvent, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: AnyMachine['internal']['guards'],
) {
  const _evalGuard = readyToEvalGuard(fnBaseParam, machineGuards)

  // statePath に設定されているイベント eType から guard が一番最初に通った transition を返す
  return ({ events }: TopLvStDefItem<string>, eType: string) => {
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

export function deriveEventTransition<C extends MContext, Ex extends SendableEvent, I>(
  eType: string,
  internalEPayload: InternalEPayload | undefined,
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  crrStates: StateRoute,
  machineGuards: AnyMachine['internal']['guards'],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  topLvDefItem: TopLvStDefItem<string>,
): TransitionExec[] {
  const findTransition = internalEPayload
    ? o_readyToFindInternalEventTransition(fnBaseParam, machineGuards, internalEPayload)
    : o_readyToFindTransitionByEvent(fnBaseParam, machineGuards)

  const activeParallelSet = new Set<string>()
  const [tCandidates, cLeaves] = x_findDeepestTransitions(
    crrStates,
    0,
    '',
    activeParallelSet,
    stateCatalog,
    findTransition,
    eType,
  )

  if (!tCandidates.length) {
    const result = findTransition(topLvDefItem, eType)
    if (result) {
      const { transition, tIndex } = result
      tCandidates.push(buildTransitionCandidate(transition, tIndex, '/', cLeaves))
    }
  }

  const activeParallels = [...activeParallelSet].sort((a, b) => (a > b ? -1 : 1))
  return x_removeConflictedTransitions(tCandidates, activeParallels)
}

function* o_genExitPaths(
  parent: string,
  stateRoute: StateRoute,
  idx: number,
  asRootpath: boolean = false,
): Generator<string> {
  if (idx >= stateRoute.length) return
  const el = stateRoute[idx]!
  if (typeof el === 'string') {
    const pth = `${parent}${ST_DELIM}${el}`
    yield* o_genExitPaths(pth, stateRoute, idx + 1)
    yield pth
    return
  }
  const { parallel, regions } = el
  const rootPath = asRootpath ? parent : `${parent}${ST_DELIM}${parallel}`
  for (const regionName in regions) {
    const pth = `${rootPath}${ST_DELIM}${regionName}`
    yield* o_genExitPaths(pth, regions[regionName]!, 0)
    yield pth
  }
  if (!asRootpath) {
    yield rootPath
  }
}

export function* genExitPathsAndDeleteFromCrrStates(crrStates: StateRoute, lca: string, fullTo: string = ':DUMMY:') {
  const { remaining, isExhausted } = traverseStateRouteMatch(crrStates, splitStPath(lca))
  if (!isExhausted) {
    throw new Error(`During transition to "${fullTo}", state "${lca}" is not found in ${JSON.stringify(crrStates)}`)
  }
  const [stateRoute, startIdx, asRootpath] = remaining!
  yield* o_genExitPaths(lca, stateRoute, startIdx, asRootpath)

  if (!asRootpath) {
    stateRoute.splice(startIdx)
  } else if (typeof stateRoute[startIdx] === 'object') {
    stateRoute[startIdx].regions = {}
  } else {
    throw new Error(`Internal error: unexpected stateRoute: ${JSON.stringify(stateRoute)}, lca:${lca}`)
  }
}

// destinations に未記載の、末端リーフを追加する
function oo_addSubStatesToDest(destinations: RecursiveRecord, { initial, stateOf }: NormalizedDefinition) {
  if (!initial || initial in destinations) {
    return destinations
  }
  destinations[initial] = Object.create(null)
  const { sub } = stateOf[initial]!
  if (!sub) {
    return destinations
  } else if (sub.dType === 'regions') {
    oo_addParallelToDestTree(destinations[initial]!, sub.stateOf)
  } else {
    oo_addSubStatesToDest(destinations[initial]!, sub)
  }
  return destinations
}
function oo_addParallelToDestTree(
  destinations: RecursiveRecord,
  regionStItemOf: Record<string, ParallelNormalizedStateItem>,
  routeRegions?: Record<string, StateRoute>,
) {
  for (const key in regionStItemOf) {
    // すでに routeRegions の StateRoute が存在するなら追加しない
    if (key in destinations || routeRegions?.[key]?.length) {
      continue
    }
    destinations[key] = Object.create(null)
    oo_addSubStatesToDest(destinations[key]!, regionStItemOf[key]!.sub)
  }
}

function* o_genStateEntryData(
  transitionDest: RecursiveRecord,
  target:
    | { isRegions: false; route: StateRoute; isRegionChild: boolean }
    | { isRegions: true; regions: Record<string, StateRoute> },
  rIdx: number,
  stateDefinition: NormalizedDefinition | ParallelNormalizedDefinition,
): Generator<[stateItem: NStateItemDef<string>, StateEntryAdditionalData]> {
  const { stateOf } = stateDefinition

  let isLeaf = true
  for (const dKey in transitionDest) {
    isLeaf = false
    const stDef = stateOf?.[dKey]
    if (!stDef) throw new Error(`Unknown state "${dKey}"`)
    const { def, sub } = stDef
    const isParallel = sub?.dType === 'regions'
    const childTree = transitionDest[dKey]!
    if (rIdx >= 0) {
      if (isParallel) {
        const { route } = target as Extract<Parameters<typeof o_genStateEntryData>[1], { isRegions: false }>
        const el = route[rIdx]
        if (typeof el === 'object' && 'parallel' in el && el.parallel === dKey) {
          oo_addParallelToDestTree(childTree, sub.stateOf, el.regions)
          yield* o_genStateEntryData(childTree, { isRegions: true, regions: el.regions }, rIdx, sub)
          continue
        }
      } else if (target.isRegions) {
        const { regions } = target
        if (dKey in regions) {
          if (sub) {
            yield* o_genStateEntryData(
              childTree,
              { isRegions: false, route: regions[dKey]!, isRegionChild: true },
              0,
              sub,
            )
          }
          continue
        }
      } else {
        const { route } = target
        const el = route[rIdx]
        if (el?.valueOf() === dKey) {
          if (sub) {
            yield* o_genStateEntryData(childTree, { isRegions: false, route, isRegionChild: false }, rIdx + 1, sub)
          }
          continue
        }
      }
    }

    if (isParallel) {
      const regions = Object.create(null)
      const el = { parallel: dKey, regions }
      const { route, isRegionChild } = target as Extract<
        Parameters<typeof o_genStateEntryData>[1],
        { isRegions: false }
      >
      route.push(el)
      yield [def, { stateName: dKey, isRegionChild }]
      oo_addParallelToDestTree(childTree, sub.stateOf)
      yield* o_genStateEntryData(childTree, { isRegions: true, regions }, -1, sub)
    } else if (target.isRegions) {
      const route: StateRoute = []
      target.regions[dKey] = route
      yield [def, { stateName: dKey }]
      if (sub) {
        yield* o_genStateEntryData(childTree, { isRegions: false, route, isRegionChild: true }, -1, sub)
      }
    } else {
      const { route, isRegionChild } = target
      route.push(dKey)
      yield [def, { stateName: dKey, isRegionChild }]
      if (sub) {
        yield* o_genStateEntryData(childTree, { isRegions: false, route, isRegionChild: false }, -1, sub)
      }
    }
  }
  if (isLeaf && 'initial' in stateDefinition && stateDefinition.initial) {
    yield* o_genStateEntryData(oo_addSubStatesToDest(Object.create(null), stateDefinition), target, -1, stateDefinition)
  }
}

// NOTE: fullToSplittees が空でも末端リーフを遷移先に追加するので遷移先がない場合は事前に弾く必要がある
export function* updateStateRouteForEntry(
  fullToSplittees: string[][],
  crrStates: StateRoute,
  stateDefinition: NormalizedDefinition,
) {
  // fullToSplittees: [['a','aa','aaa'], ['a','ab','aba'], ['a','ab','abb']]
  // -> destTree: {a:{aa:{aaa:{}}, ab:{aba:{},abb:{}}}}
  const transitionDestinations = (() => {
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

  yield* o_genStateEntryData(
    transitionDestinations,
    { isRegions: false, route: crrStates, isRegionChild: false },
    0,
    stateDefinition,
  )
}

export function launchInvocations<E extends SendableEvent, S extends ServiceRecord>(
  invocations: NormalizedInvocation[],
  path: string,
  makeFnBaseParam: () => FnBaseParams<any, any, any>[0],
  machineServices: ServiceRecord,
  rtOutbound: RuntimeOutbound<E, any, S>,
) {
  const { enqueueEvent } = rtOutbound
  const fnBaseParam = makeFnBaseParam()
  for (const [i, { input, mainKey, subKey, src, emittableETypesToListen }] of invocations.entries()) {
    const [srcType, srcValue] = (() => {
      const { type, value } = src
      if (type !== 'string') {
        return [type, value]
      }
      const service = machineServices[value]
      if (!service) throw new Error(`RT"${rtOutbound.id}"> invoke: Unknown src: "${value}"`)
      return [typeof service === 'function' ? 'function' : 'machine', service]
    })()

    const childKey = subKey ? `${mainKey}:${subKey}` : mainKey
    if (rtOutbound.children[childKey]) {
      throw new Error(`RT"${rtOutbound.id}"> Service with ID '${childKey}' is already running.`)
    }
    const onDone = (output: unknown) => enqueueEvent(
      {
        type: `invoke/:done:[${i}]` as const,
        payload: { type: ':done:', output },
        [SystemEventSymbol]: true,
      },
      { path },
    )
    const onError = (error: unknown) => {
      enqueueEvent(
        {
          type: `invoke/:error:[${i}]` as const,
          payload: { type: ':error:', error },
          [SystemEventSymbol]: true,
        },
        { path },
      )
    }

    const inputValue = input && typeof input === 'function' ? input(fnBaseParam) : undefined

    switch (srcType) {
      case 'machine': {
        const childRt = makeRuntime(srcValue as AnyMachine, {
          id: `${rtOutbound.id}/${childKey}`,
          input: () => inputValue,
        })
        rtOutbound.children = { ...rtOutbound.children, [childKey]: childRt }
        childRt.subscribe(({ runtimeStatus, output }) => {
          if (runtimeStatus === 'done') {
            onDone(output)
          }
        }, onError)
        for (const eType of emittableETypesToListen) {
          childRt.onEmitted(eType, (emittedEvent) => {
            enqueueEvent(
              {
                type: `invoke/${eType}[${i}]` as const,
                payload: emittedEvent,
                [SystemEventSymbol]: true,
              },
              { path },
            )
          })
        }
        childRt.start()
        break
      }
      case 'function': {
        const abortController = new AbortController()
        const { signal } = abortController
        const emit = (emittedEvent: EmittableEvent) => {
          if (
            !(emittedEvent && typeof emittedEvent === 'object' && emittableETypesToListen.includes(emittedEvent?.type))
          ) {
            throw new Error(`RT"${rtOutbound.id}"> Invalid emittedEvent: ${JSON.stringify(emittedEvent)}`)
          }
          enqueueEvent(
            { type: `invoke/${emittedEvent?.type}[${i}]` as const, payload: emittedEvent, [SystemEventSymbol]: true },
            { path },
          )
        }
        type Listener = (event: SendableEvent) => void
        const listeners = new Set<Listener>()
        const listen = (listener: Listener) => { listeners.add(listener) }
        const child = {
          send(event: SendableEvent) {
            listeners.forEach((listener) => listener(event))
          },
          stop() {
            abortController.abort()
            listeners.clear()
          }
        }
        rtOutbound.children = { ...rtOutbound.children, [childKey]: child }
        const result = (() => {
          try {
            return (srcValue as ServiceFn)(inputValue, emit, listen, signal)
          } catch (error) {
            if (!signal.aborted) {
              onError(error)
            }
          }
        })()

        const _handleOutput = (output: unknown) => {
          if (typeof output === 'function') {
            if (signal.aborted) {
              output()
            } else {
              child.stop = () => {
                abortController.abort()
                listeners.clear()
                output()
              }
            }
          } else if (!signal.aborted) {
            onDone(output)
          }
        }
        if (!(result instanceof Promise)) {
          _handleOutput(result)
          return
        }
        result
          .then((output) => _handleOutput(output))
          .catch((error) => {
            if (!signal.aborted) {
              onError(error)
            }
          })
        break
      }
    }
  }
}

export function stopInvocations<E extends SendableEvent, S extends ServiceRecord>(
  invocations: NormalizedInvocation[],
  rtOutbound: RuntimeOutbound<E, any, S>,
) {
  const newChildren = { ...rtOutbound.children }
  for (const { mainKey, subKey } of invocations) {
    const key = subKey ? `${mainKey}:${subKey}` : mainKey
    newChildren[key]!.stop()
    delete newChildren[key]
  }
  rtOutbound.children = newChildren
}

function o_gatherAllChildrenOutputs<C extends MContext, Ex extends SendableEvent, I>(
  regions: Record<string, StateRoute>,
  parent: string,
  fnBaseParams: FnBaseParams<C, Ex, I>[0],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
) {
  const output: RecursiveRecord<unknown> = {}
  for (const key in regions) {
    const regionChild = regions[key]![0]
    if (!regionChild) {
      continue
    } else if (typeof regionChild === 'object') {
      const result = regionChild.output
      if (!result) return null
      output[key] = result
      continue
    }
    const { final } = x_getStItemDef(`${parent}${ST_DELIM}${key}${ST_DELIM}${regionChild}`, stateCatalog)
    if (!final) return null
    if (typeof final === 'function') {
      output[key] = final(fnBaseParams)
    }
  }
  return output
}

export function* genChildDoneEvents<C extends MContext, Ex extends SendableEvent, I>(
  reachedFinalStateData: [
    pPath: string,
    isRegionChild: boolean | undefined,
    final: boolean | ((args: FnBaseParams<C, Ex, I>[0]) => unknown),
  ][] = [],
  fnBaseParams: FnBaseParams<C, Ex, I>[0],
  crrStates: StateRoute,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
): Generator<[SendableEvent, InternalEPayload]> {
  const accParallelRoots = new Set<string>()
  for (const [pPath, isRegionChild, final] of reachedFinalStateData) {
    if (!pPath) continue
    if (isRegionChild) {
      accParallelRoots.add(parentPathOf(pPath))
    } else {
      yield [
        { type: ':childDone:', output: typeof final === 'function' ? final(fnBaseParams) : undefined },
        { path: pPath },
      ]
    }
  }
  {
    const seen = new Set<string>()
    for (const parallelRoot of accParallelRoots) {
      let focusedPath = parentPathOf(parallelRoot)
      while (focusedPath) {
        if (seen.has(focusedPath)) break
        seen.add(focusedPath)
        const item = stateCatalog.get(focusedPath)!
        const pPath = item.def.pPath
        if (item.sub?.dType === 'regions') {
          accParallelRoots.add(focusedPath)
          focusedPath = pPath
          continue
        } else if (!pPath) {
          break
        }
        const pItem = stateCatalog.get(pPath)!
        if (pItem.sub?.dType !== 'regions') {
          break
        }
        accParallelRoots.add(pPath)
        focusedPath = pItem.def.pPath
      }
    }
  }
  const parallelRoots = [...accParallelRoots].sort((a, b) => (a > b ? -1 : 1))
  const last = parallelRoots.length - 1
  for (const [i, parallelRoot] of parallelRoots.entries()) {
    const def = stateCatalog.get(parallelRoot)?.def
    if (i >= last && !def?.internalEvents[':childDone:']?.transitions.length) {
      break
    }
    const { remaining, isExhausted } = traverseStateRouteMatch(crrStates, splitStPath(parallelRoot))
    if (!isExhausted) {
      throw new Error(`Internal error: state "${parallelRoot}" is not found in current states.`)
    }
    const [route, idx] = remaining!
    // biome-ignore lint/complexity/noBannedTypes: x
    const parallelRouteEl = route[idx]! as Exclude<StateRoute[number], String>
    const output = o_gatherAllChildrenOutputs(parallelRouteEl.regions, parallelRoot, fnBaseParams, stateCatalog)
    if (output) {
      parallelRouteEl.output = output
      yield [{ type: ':childDone:', output }, { path: parallelRoot }]
    }
  }
}

function o_readyToFindAlwaysTransition<C extends MContext, Ex extends SendableEvent, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: AnyMachine['internal']['guards'],
) {
  const _evalGuard = readyToEvalGuard(fnBaseParam, machineGuards)

  return ({ internalEvents }: TopLvStDefItem<string>) => {
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

export function evalAlwaysEvent<C extends MContext, Ex extends SendableEvent, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  crrStates: StateRoute,
  machineGuards: AnyMachine['internal']['guards'],
  stateCatalog: Map<string, NormalizedStateItemBoth>,
) {
  const findTransition = o_readyToFindAlwaysTransition(fnBaseParam, machineGuards)
  const activeParallelSet = new Set<string>()
  const [tCandidates] = x_findDeepestTransitions(crrStates, 0, '', activeParallelSet, stateCatalog, findTransition)

  const activeParallels = [...activeParallelSet].sort((a, b) => (a > b ? -1 : 1))
  return x_removeConflictedTransitions(tCandidates, activeParallels)
}

export const __test__ = {
  x_removeConflictedTransitions,
  x_findDeepestTransitions,
  o_deriveLowestCommonAncestor,
}
