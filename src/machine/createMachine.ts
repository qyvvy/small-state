import { type as arkType } from 'arktype'
import { ST_DELIM } from '../shared/constants'
import type { AnyFn, Expand, IsAny, One, OneOrMany, Placeholder, Values } from '../shared/general.types'
import { assertOrThrow, deepFreeze, ensureArray, hasOwnProperty, parentPathOf, randomString } from '../shared/utils'
import * as ark_m_config from './arktype/ark_m_config'
import type * as ark_normalized from './arktype/ark_normalized'
import * as ark_stdef from './arktype/ark_stdef'
import type { EnqueueActions } from './createMachine-enqueue'
import type {
  ActionFnParams,
  BuiltinEType,
  EmittedEvent,
  EventBody,
  ExtractEvent,
  FnBaseParams,
  Machine,
  MachineConfig,
  MContext,
  NormalizedDefinition,
  NormalizedInvocation,
  NormalizedStateItem,
  NormalizedStateItemBoth,
  NormalizedTransition,
  NStateItemDef,
  ParallelNormalizedDefinition,
  ParallelNormalizedStateItem,
  ParamsArgOf,
  StateName,
} from './m.types'
import {
  InvokeSymbol,
  isBuiltinEType,
  MachineSymbol,
  ParallelSymbol,
  SubStatesSymbol,
  TransitionSymbol,
} from './m.types'

type X_HiddenImpl = any & { __brand: 'HiddenImpl' }
type X_DefTypeRefluxer<
  C extends MContext,
  E extends EventBody,
  I, // Input
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown> = Record<string, (input: any) => unknown>, // Services
  R = unknown,
> = () => R

type X_DefineStatesParam = {
  on: typeof on
  Guard: typeof Guard
  Action: typeof Action
  subStates: typeof subStates
  parallel: typeof parallel
  invoke: typeof invoke
}

type X_ExtractEType<TStateDefinition> =
  TStateDefinition extends Array<infer El>
  ? El extends readonly [infer Et, AnyFn, any]
  ? Exclude<Et, BuiltinEType>
  : never
  : never

type X_ExtractSubStDefinition<TStateDefinition> =
  TStateDefinition extends Array<infer El>
  ? [El] extends [never]
  ? null
  : El extends readonly [AnyFn<typeof SubStatesSymbol | typeof ParallelSymbol>, infer Sub]
  ? [Sub] extends [never]
  ? null
  : Sub extends NormalizedDefinition | ParallelNormalizedDefinition
  ? Sub
  : null
  : null
  : null

type O_OneAction<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = Array<GuardReturn<C, E, I, G> | ActionReturn<C, E, I, EM, A> | EnqueueActions<C, E, I, EM, G, A>>

type StDefMetaInfo<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = {
  tags?: string[]
  entryHook?: EnqueueActions<C, E, I, EM, G, A> | O_OneAction<C, E, I, EM, G, A>
  exitHook?: EnqueueActions<C, E, I, EM, G, A> | O_OneAction<C, E, I, EM, G, A>
  isFinal?: boolean
}

type StDefCoreItem<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = StDefMetaInfo<C, E, I, EM, G, A> | readonly [E['type'] | BuiltinEType, X_DefTypeRefluxer<C, E, I, EM, G, A>, X_HiddenImpl] // on

type StateDefinition<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
> = null | Array<
  | StDefCoreItem<C, E, I, EM, G, A>
  | readonly [X_DefTypeRefluxer<C, E, I, EM, G, A, S, any>, unknown] // subStates|parallel
  | readonly [typeof InvokeSymbol, X_DefTypeRefluxer<C, E, I, EM, G, A, S>, null, unknown, any, any] // invoke
>

type GuardReturn<C extends MContext, Ex extends EventBody, I, G extends Record<string, Placeholder>> = readonly [
  typeof TransitionSymbol,
  'guards',
  X_HiddenImpl,
  X_DefTypeRefluxer<C, Ex, I, any, G, any>,
]

function Guard<
  C extends MContext,
  Ex extends EventBody,
  I,
  G extends Record<string, Placeholder>,
  Gk extends keyof G | never,
>(body: Gk | ((arg: FnBaseParams<C, Ex, I>[0]) => boolean), ...args: ParamsArgOf<G, Gk, C, Ex, I>) {
  return [
    TransitionSymbol,
    'guards',
    { body, ...(args.length ? { params: args[0] } : {}) },
    (() => null) as X_DefTypeRefluxer<C, Ex, I, any, G, any>,
  ] as const // GuardReturn
}

type ActionReturn<C extends MContext, Ex extends EventBody, I, EM extends EmittedEvent, A extends Record<string, Placeholder>> = readonly [
  typeof TransitionSymbol,
  'actions',
  X_HiddenImpl,
  X_DefTypeRefluxer<C, Ex, I, EM, any, A, any>,
  null,
]

function Action<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  A extends Record<string, Placeholder>,
  Ak extends keyof A | never,
>(body: Ak | ((arg: ActionFnParams<C, Ex, I, EM, unknown>[0]) => unknown), ...args: ParamsArgOf<A, Ak, C, Ex, I>) {
  return [
    TransitionSymbol,
    'actions',
    { body, ...(args.length ? { params: args[0] } : {}) },
    (() => null) as X_DefTypeRefluxer<C, Ex, I, EM, any, A>,
    null,
  ] as const // ActionReturn
}

type Transition<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = Array<
  | StateName
  //| readonly [T_DefTypeRefluxer<C, Ex, I, G, any>, typeof GuardSymbol, T_HiddenImpl]
  | GuardReturn<C, Ex, I, G>
  | ActionReturn<C, Ex, I, EM, A>
  | EnqueueActions<C, Ex, I, EM, G, A>
>

function on<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  Et extends [E] extends [never] ? string : E['type'] | BuiltinEType | never,
>(
  eventType: Et,
  ...transitions: [Transition<C, ExtractEvent<E, Et>, I, EM, G, A>, ...Array<Transition<C, ExtractEvent<E, Et>, I, EM, G, A>>]
) {
  return [eventType, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A>, transitions as X_HiddenImpl] as const // StDefCoreItem
}

function subStates<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  const D extends { [K in string]: StateDefinition<C, E, I, EM, G, A, S> },
  const Initial extends keyof D & string,
>(stateDefinition: D, initialState?: Initial) {
  return [
    (() => SubStatesSymbol) as X_DefTypeRefluxer<C, E, I, EM, G, A, S, typeof SubStatesSymbol>,
    transformNormalizedDefinition(stateDefinition, initialState) as {
      initial: [Initial] extends [never] ? undefined : Initial
      states: {
        [K in keyof D]: {
          def: NStateItemDef<X_ExtractEType<D[K]>>
          sub: X_ExtractSubStDefinition<D[K]>
        }
      }
    },
  ] as const // StateDefinition
}

type O_ExtractRegionEType<De> = De extends [infer U, Record<string, StateDefinition<any, any, any, any, any, any, any>>]
  ? U extends Array<infer El>
  ? El extends readonly [infer Et, AnyFn, any]
  ? Exclude<Et, BuiltinEType>
  : never
  : never
  : never
type O_InnerDict<T> = T extends [...any[], infer Last] ? Last : never

function parallel<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  const PD extends {
    [K in string]:
    | [Array<StDefCoreItem<C, E, I, EM, G, A>>, { [L in string]: StateDefinition<C, E, I, EM, G, A, S> }]
    | [{ [L in string]: StateDefinition<C, E, I, EM, G, A, S> }?]
  },
>(parallelDefinition: PD) {
  return [
    (() => ParallelSymbol) as X_DefTypeRefluxer<C, E, I, EM, G, A, S, typeof ParallelSymbol>,
    transformParallelNormalizedDefinition<C, E, I, EM, G, A, S>()<typeof parallelDefinition>(
      parallelDefinition,
    ) as unknown as {
      nType: 'parallel'
      regions: {
        [K in keyof PD]: {
          def: NStateItemDef<O_ExtractRegionEType<PD[K]>>
          sub: {
            initial: string | undefined
            states: {
              [L in keyof O_InnerDict<PD[K]>]: {
                def: NStateItemDef<X_ExtractEType<O_InnerDict<PD[K]>[L]>>
                sub: X_ExtractSubStDefinition<O_InnerDict<PD[K]>[L]>
              }
            }
          }
        }
      }
    },
  ] as const // StateDefinition
}

type O_IntoServiceFn<Src, S extends Record<string, (input: any) => unknown>> = Src extends AnyFn
  ? Src
  : Src extends keyof S
  ? S[Src]
  : never

type CleanupEvents<
  C extends MContext,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  Data,
> = Array<
  | readonly ['done', NoInfer<X_DefTypeRefluxer<C, { type: 'done'; data: Data }, I, EM, G, A>>, X_HiddenImpl] // on
  | readonly ['error', X_DefTypeRefluxer<C, { type: 'error'; error: Error }, I, EM, G, A>, X_HiddenImpl] // on
>

function invoke<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  Src extends keyof S | ((input: [Si] extends [never] ? unknown : Si) => unknown),
  Si = never,
>(
  preparation: {
    id?: string
    input?: (arg: FnBaseParams<C, E, I>[0]) => Src extends keyof S ? Parameters<S[Src]>[0] : Si
  },
  src: Src,
  ...cleanupEvents: CleanupEvents<C, I, EM, G, A, Awaited<ReturnType<O_IntoServiceFn<Src, S>>>>
) {
  return [
    InvokeSymbol,
    (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, S>,
    null,
    preparation as X_HiddenImpl,
    src as X_HiddenImpl,
    cleanupEvents,
  ] as const // StateDefinition
}

// ===

const o_getNormalizedStDefTemplate = (): {
  def: NStateItemDef<string>
  sub: null | typeof ark_normalized.SubStNormalizedDefinition.infer
} => ({
  def: {
    pPath: '',
    final: false,
    tags: new Set(),
    entryHook: null,
    exitHook: null,
    invocations: [],
    builtinEvents: {},
    events: {},
  },
  sub: null,
})

function _normalizeOneAction(
  transitions: typeof ark_stdef.Transition.infer,
  makeDuplicateTargetErrMsg: (transition: (typeof ark_stdef.Transition.infer)[number], k: number) => string = () => '',
) {
  const nTransition: NormalizedTransition = { actions: [], guards: [] }
  for (const [k, transition] of transitions.entries()) {
    if (Array.isArray(transition)) {
      nTransition[transition[1]].push(transition[2]) // guard or action
      continue
    }
    switch (typeof transition) {
      case 'string':
        if (nTransition.to) {
          throw new Error(makeDuplicateTargetErrMsg(transition, k))
        }
        nTransition.to = transition
        break
      case 'function':
        nTransition.actions.push({ isEnqueue: true, body: transition })
        break
    }
  }
  return nTransition
}

function _normalizeTransition(
  transitionArgs: Array<typeof ark_stdef.Transition.infer>,
  eType: string,
  stateName: string,
  i: number,
) {
  const nTransitions: NormalizedTransition[] = []

  for (const [j, transitions] of transitionArgs.entries()) {
    if (!transitions.length) {
      throw new Error(
        `on(eventType, ...configs): configs must not be empty, at { ${stateName}: [on('${eType}', configs[${j}])] }`,
      )
    }
    const nTransition = _normalizeOneAction(
      transitions,
      (transition: (typeof ark_stdef.Transition.infer)[number], k: number) =>
        `Duplicate target "${transition}", at state:"${stateName}"[${i}] on("${eType}", configs[${j}][${k}])`,
    )
    nTransitions.push(nTransition)
  }
  return nTransitions
}

function _parseStDefItems(items: typeof ark_stdef.StateDefinition.infer, stateName: string) {
  let { def, sub } = o_getNormalizedStDefTemplate()
  if (!items?.length) {
    def.final = !items
    return { def, sub }
  }

  for (const [i, item] of items.entries()) {
    if (!Array.isArray(item)) {
      if ('tags' in item) {
        def.tags = new Set(item.tags)
      }
      if ('entryHook' in item) {
        def.entryHook = _normalizeOneAction(ensureArray(item.entryHook!))
      }
      if ('exitHook' in item) {
        def.exitHook = _normalizeOneAction(ensureArray(item.exitHook!))
      }
      if ('isFinal' in item) {
        def.final = !!item.isFinal
      }
      continue
    }

    switch (typeof item?.[0]) {
      case 'string': {
        // on(...)
        const eType = item[0]
        const transitionArgs = item[2]!
        if (hasOwnProperty(def.events, eType) || hasOwnProperty(def.builtinEvents, eType)) {
          throw new Error(`Duplicate event definition for event "${eType}", at "${stateName}"[${i}]`)
        }
        if (!transitionArgs.length) {
          throw new Error(
            `on(eventType, ...configs): The 'configs' argument is required, at state:"${stateName}"[${i}] event:"${eType}"`,
          )
        }
        const nTransitions = _normalizeTransition(transitionArgs, eType, stateName, i)
        if (isBuiltinEType(eType)) {
          def.builtinEvents[eType] = nTransitions
        } else {
          def.events[eType] = nTransitions
        }
        break
      }
      case 'symbol': {
        if (item[0] === InvokeSymbol) {
          const nInvocation: NormalizedInvocation = { ...item[3], src: item[4] }
          def.invocations.push(nInvocation)
          for (const [j, [iEType, _, cleanupArgs]] of item[5].entries()) {
            if (!(iEType === 'done' || iEType === 'error')) {
              throw new Error(
                `invocation event must be 'done' or 'error': ${iEType}, at state:"${stateName}"[${i}] > invoke events[${j}]`,
              )
            }
            if (hasOwnProperty(nInvocation, iEType)) {
              throw new Error(
                `duplicate invocation event: ${iEType}, at state:"${stateName}"[${i}] > invoke events[${j}]`,
              )
            }
            if (!cleanupArgs.length) {
              throw new Error(
                `on(eventType, ...configs): The 'configs' argument is required, at state:"${stateName}"[${i}] > invoke events[${j}] event:"${iEType}"`,
              )
            }
            nInvocation[iEType] = _normalizeTransition(cleanupArgs, iEType, stateName, j)
          }
        }
        break
      }
      case 'function': {
        const subStDict = item[1] as Exclude<(typeof item)[1], (...args: any[]) => unknown>
        if (sub) {
          throw new Error(
            `Duplicated subStates: at "${stateName}"[${i}] { ${Object.keys(
              'states' in subStDict ? subStDict.states : 'regions' in subStDict ? subStDict.regions : [],
            )
              .map((el) => `${el}:...`)
              .join(', ')} }`,
          )
        }
        sub = subStDict
        break
      }
      default:
        throw new Error(`unexpected array[0] type: ${JSON.stringify(item?.[0])}`)
    }
  }
  return { def, sub }
}

function o_normalizeStates<const D extends Record<string, StateDefinition<any, any, any, any, any, any, any>>>(
  stateDefOf: D,
) {
  return Object.entries(stateDefOf).reduce(
    (acc, [stateName, stDefs]: [keyof D & string, unknown], i) => {
      if (stateName.includes('/')) {
        throw new Error(`State names cannot contain the character "/": "${stateName}"`)
      } else if (Array.isArray(stDefs) || stDefs == null) {
        const items = ark_stdef.StateDefinition.assert(stDefs)
        const { def, sub } = _parseStDefItems(items, stateName)
        acc[stateName] = { def, sub } as any
      } else {
        throw new Error(
          `Invalid state definition for state "${String(stateName)}". Expected an array but got ${typeof stDefs}.`,
        )
      }
      return acc
    },
    {} as {
      [K in keyof D]: {
        def: NStateItemDef<X_ExtractEType<D[K]>>
        sub: X_ExtractSubStDefinition<D[K]>
      }
    },
  )
}

function transformNormalizedDefinition<
  const D extends Record<string, StateDefinition<any, any, any, any, any, any, any>>,
  const Initial extends string | undefined,
>(stateDefOf: D, initialState: Initial) {
  const firstState = Object.keys(stateDefOf)?.[0]
  const initial = (
    !firstState
      ? undefined
      : initialState &&
        assertOrThrow(hasOwnProperty(stateDefOf, initialState), `invalid initialState: "${initialState}"`)
        ? initialState
        : firstState
  ) as Initial extends string ? Initial : string
  return {
    initial,
    states: o_normalizeStates(stateDefOf),
  }
}

function transformParallelNormalizedDefinition<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
>() {
  return <
    const PD extends {
      [K in string]:
      | [Array<StDefCoreItem<C, E, I, EM, G, A>>, Record<string, StateDefinition<C, E, I, EM, G, A, S>>]
      | [Record<string, StateDefinition<C, E, I, EM, G, A, S>>?]
    },
  >(
    parallelDefinition: PD,
  ) => {
    const regions = Object.fromEntries(
      Object.entries(parallelDefinition).map(([regionName, rawDefinition]) => {
        if (regionName.includes('/')) {
          throw new Error(`Parallel region state names cannot contain the character "/": "${regionName}"`)
        }
        const len = rawDefinition.length
        const leafDefOf = (rawDefinition[len - 1] || {}) as Record<string, StateDefinition<C, E, I, EM, G, A, S>>
        const regionStDefCoreItems = (rawDefinition[len - 2] || []) as Array<StDefCoreItem<C, E, I, EM, G, A>>

        const { def } = _parseStDefItems(regionStDefCoreItems, regionName)
        return [
          regionName,
          {
            def,
            sub: transformNormalizedDefinition(leafDefOf, undefined),
          },
        ]
      }),
    )

    return {
      nType: 'parallel',
      regions,
    }
  }
}

// ===

function o_setPPathAndAddCatalog(
  nStItemRecord: NormalizedDefinition['states'] | ParallelNormalizedDefinition['regions'],
  parent: string,
  addToCatalog: (stPath: string, state: NormalizedStateItemBoth) => unknown,
  isRegion: boolean,
  addRegionPath: (regionPath: string) => unknown,
) {
  for (const [key, nState] of Object.entries(nStItemRecord)) {
    nState.def.pPath = parent
    const stPath = `${parent}${ST_DELIM}${key}`
    addToCatalog(stPath, nState)
    if (isRegion) {
      addRegionPath(stPath)
    }
    const { sub } = nState
    if (sub) {
      const isParallel = 'regions' in sub
      o_setPPathAndAddCatalog(isParallel ? sub.regions : sub.states, stPath, addToCatalog, isParallel, addRegionPath)
    }
  }
}

function ooo_getTransitionFullPath(
  to: string,
  crrPath: string,
  pPath: string,
  stateCatalog: Map<string, NormalizedStateItemBoth>,
) {
  const pth =
    to[0] === ST_DELIM
      ? to
      : to.startsWith('./')
        ? `${crrPath}${ST_DELIM}${to.slice(2)}`
        : to.startsWith('../')
          ? `${pPath}${ST_DELIM}${to.slice(3)}`
          : ''
  if (pth) {
    return stateCatalog.has(pth) ? pth : ''
  }
  // 無印パスは子→兄弟を探して最初にマッチするパスになる
  for (const pthFn of [() => `${crrPath}${ST_DELIM}${to}`, () => `${pPath}${ST_DELIM}${to}`]) {
    const pth = pthFn()
    if (stateCatalog.has(pth)) {
      return pth
    }
  }
  return ''
}
function oo_readyToValidateTransitionAndSetFullTo(
  stateCatalog: Map<string, NormalizedStateItemBoth>,
  statePath: string,
  pPath: string,
  regionPaths: string[],
) {
  const regionUnder = regionPaths.find((regionPath) => pPath.startsWith(regionPath))
  const parallelRoot = !regionUnder ? null : parentPathOf(regionUnder)

  return (transitions: NormalizedTransition[], eType: string) => {
    for (const transition of transitions) {
      const { to } = transition
      if (!to) {
        continue
      }
      const tFullPath = ooo_getTransitionFullPath(to, statePath, pPath, stateCatalog)
      if (!tFullPath) {
        throw new Error(`Invalid transition "${to}" in state "${statePath.slice(1)}" (on:"${eType}").`)
      }
      if (regionUnder && !tFullPath.startsWith(regionUnder) && tFullPath.startsWith(parallelRoot!)) {
        throw new Error(
          `Transitions in a parallel state cannot target a different region: on('${eType}', ['${to}', ...]) in state "${statePath.slice(1)}".`,
        )
      }
      transition.fullTo = tFullPath
    }
  }
}
function o_validateTransitionAndSetFullTo(stateCatalog: Map<string, NormalizedStateItemBoth>, regionPaths: string[]) {
  stateCatalog.forEach((nState, statePath) => {
    const {
      def: { builtinEvents, events, invocations },
    } = nState
    const validateTransitionAndSetFullTo = oo_readyToValidateTransitionAndSetFullTo(
      stateCatalog,
      statePath,
      nState.def.pPath,
      regionPaths,
    )
    Object.entries(builtinEvents).forEach(([eType, transitions]) => {
      validateTransitionAndSetFullTo(transitions, eType)
    })
    Object.entries(events).forEach(([eType, transitions]) => {
      if (!transitions) return
      validateTransitionAndSetFullTo(transitions, eType)
    })
    for (const { done, error } of invocations) {
      if (done) {
        validateTransitionAndSetFullTo(done, 'done')
      }
      if (error) {
        validateTransitionAndSetFullTo(error, 'error')
      }
    }
  })
}

type X_GlobalEvents<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = Array<readonly [E['type'] | BuiltinEType, X_DefTypeRefluxer<C, E, I, EM, G, A>, X_HiddenImpl]>

function getDefinitionAndCatalog<
  C extends MContext,
  const E extends EventBody,
  const I,
  const EM extends EmittedEvent,
  const O,
  const S extends Record<string, (input: any) => unknown>,
  const D extends { [K in string]: StateDefinition<C, E, I, EM, G, A, S> },
  const G extends Record<string, Placeholder> = Record<string, Placeholder>,
  const A extends Record<string, Placeholder> = Record<string, Placeholder>,
>(
  config: MachineConfig<C, E, I, EM, O, G, A, S>,
  defineStates: (define: Expand<X_DefineStatesParam>) => readonly [X_GlobalEvents<C, E, I, EM, G, A>, D] | readonly [D] | D,
) {
  {
    const configOut = ark_m_config.MachineConfig(config)
    if (configOut instanceof arkType.errors) {
      throw new Error(`Invalid machine config: ${configOut.summary}`)
    }
  }
  const rawDefinition = defineStates({
    on,
    Guard,
    Action,
    subStates,
    parallel,
    invoke,
  })

  const [stateDefDict, globalEvents]: [D, X_GlobalEvents<C, E, I, EM, G, A> | undefined] = Array.isArray(rawDefinition)
    ? ([rawDefinition[rawDefinition.length - 1], rawDefinition[rawDefinition.length - 2]] as const)
    : ([rawDefinition, []] as const)
  {
    const dType = stateDefDict === null ? 'null' : typeof stateDefDict
    if (dType !== 'object') {
      throw new Error(`Invalid state definition: Expected an object but got ${dType}.`)
    }
    if (Object.keys(stateDefDict).length === 0) {
      throw new Error(`Invalid state definition: The state definition object cannot be empty.`)
    }
  }

  const { initial, states } = transformNormalizedDefinition(stateDefDict, config.initialState)

  const stateCatalog = new Map<string, NormalizedStateItemBoth>()
  const regionPaths: string[] = []
  o_setPPathAndAddCatalog(
    states,
    '',
    (stPath: string, state: NormalizedStateItemBoth) => stateCatalog.set(stPath, state),
    false,
    (regionPath: string) => regionPaths.push(regionPath),
  )
  regionPaths.sort((a, b) => b.length - a.length)

  o_validateTransitionAndSetFullTo(stateCatalog, regionPaths)

  const {
    def: { events, builtinEvents },
  } = _parseStDefItems(globalEvents || [], '(root)')
  return {
    definition: { initial, events, builtinEvents, states },
    stateCatalog, regionPaths
  }
}

export function createMachine<
  C extends MContext,
  const E extends EventBody,
  const I,
  const EM extends EmittedEvent,
  const O,
  const S extends Record<string, (input: any) => unknown>,
  const D extends { [K in string]: StateDefinition<C, E, I, EM, G, A, S> },
  const G extends Record<string, Placeholder> = Record<string, Placeholder>,
  const A extends Record<string, Placeholder> = Record<string, Placeholder>,
>(
  config: Expand<MachineConfig<C, E, I, EM, O, G, A, S>>,
  defineStates: (define: Expand<X_DefineStatesParam>) => readonly [X_GlobalEvents<C, E, I, EM, G, A>, D] | readonly [D] | D,
  //defineStates: ( define: Expand<T_DefineStatesParam>) => D,
) {
  const { definition, stateCatalog, regionPaths } =
    getDefinitionAndCatalog<C, E, I, EM, O, S, D, G, A>(config, defineStates)

  const { name, initContext, output, guards, actions, services } = config

  const m: Machine<C, E, I, EM, O, G, A, S, typeof definition> = {
    [MachineSymbol]: true,
    name: name || '(machine)',
    initContext,
    output,
    guards: guards || ({} as any),
    actions: actions || ({} as any),
    services: services || ({} as any),
    definition,
    stateCatalog,
    regionPaths,
  }
  return deepFreeze(m)

  //const stateDefDict = defineStates({ on, AttachJot, subStates })
  //const normalizedStDefs = normalizeStateDefinition<C, E, I, keyof G & string, keyof A & string>()(stateDefDict)
  //return definition

  //return new Machine<C, E, EM, I, O, G, A, S, typeof definition>(config, definition, stateCatalog)

  //return new Machine(config, normalizedStateDefs)
  //const getInput = (input: I) => input
  //const { types, id, ...rest } = config

  //const configuration = {
  //  ...(id ? { id } : { id: makeId() }),
  //  getInput,
  //  stateDict,
  //  ...rest
  //}
}

function makeId() {
  return `${randomString(4)}-${Date.now()}`.slice(-5)
}

export const __test__ = {
  getDefinitionAndCatalog,
}
