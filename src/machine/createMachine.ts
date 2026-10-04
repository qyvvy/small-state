import { type as arkType } from 'arktype'
import { ST_DELIM } from '../shared/constants'
import type { AnyFn, Expand, OneOrMany, Placeholder, Values } from '../shared/general.types'
import { assertOrThrow, deepFreeze, ensureArray, parentPathOf, randomString } from '../shared/utils'
import * as ark_m_config from './arktype/ark_m_config'
import type * as ark_normalized from './arktype/ark_normalized'
import * as ark_stdef from './arktype/ark_stdef'
import type {
  ActionFnParams,
  BuiltinEType,
  ChildDoneEType,
  ChildDoneEventBody,
  EmittedEvent,
  EventBody,
  FnBaseParams,
  Machine,
  MachineConfig,
  MContext,
  NormalizedDefinition,
  NormalizedStateItemBoth,
  NormalizedTransition,
  NStateItemDef,
  ParallelNormalizedDefinition,
  ParamsInput,
  StateName,
  TopLvStDefItem,
} from './m.types'
import { EntrySymbol, ExitSymbol, InvokeSymbol, MachineSymbol, ParallelSymbol, SubStatesSymbol } from './m.types'

type X_HiddenImpl = any & { __brand: 'HiddenImpl' }
type X_DefTypeRefluxer<
  C extends MContext,
  E extends EventBody,
  I, // Input
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  Eb extends BuiltinEType = BuiltinEType,
  S extends Record<string, (input: any) => unknown> = Record<string, (input: any) => unknown>, // Services
  R = unknown,
> = () => R

type X_DefineStatesParam = {
  on: typeof on
  entryHook: typeof entryHook
  exitHook: typeof exitHook
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

type X_ImplKeys<IpR extends Record<string, Placeholder>> = Values<{
  [K in keyof IpR]: unknown extends IpR[K] ? K : never
}>

type Guard<C extends MContext, Ex extends EventBody, I, G extends Record<string, Placeholder>> =
  | Expand<X_ImplKeys<G>>
  | Values<{ [K in keyof G & string as unknown extends G[K] ? never : K]: { [K2 in K]: ParamsInput<G[K], C, Ex, I> } }> // { [guardName: string]: Params }
  | ((arg: FnBaseParams<C, Ex, I>[0]) => boolean)

type Action<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> =
  | Expand<X_ImplKeys<A>>
  | Values<{ [K in keyof A & string as unknown extends A[K] ? never : K]: { [K2 in K]: ParamsInput<A[K], C, Ex, I> } }> // { [actionName: string]: Params }
  | ((arg: ActionFnParams<C, Ex, I, EM, G, A>[0]) => unknown)

type StDefMetaInfo<C extends MContext, E extends EventBody, I> = {
  final?: boolean | ((args: FnBaseParams<C, E, I>[0]) => unknown)
}

type StDefCoreItem<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> =
  | StDefMetaInfo<C, E, I>
  | readonly [E['type'] | BuiltinEType, X_DefTypeRefluxer<C, E, I, EM, G, A>, X_HiddenImpl] // on
  | readonly [typeof EntrySymbol, X_DefTypeRefluxer<C, E, I, EM, G, A>, null, X_HiddenImpl] // entryHook
  | readonly [typeof ExitSymbol, X_DefTypeRefluxer<C, E, I, EM, G, A>, null, X_HiddenImpl] // exitHook

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
  | readonly [X_DefTypeRefluxer<C, E, I, EM, G, A, BuiltinEType, S, any>, unknown] // subStates|parallel
  | readonly [typeof InvokeSymbol, X_DefTypeRefluxer<C, E, I, EM, G, A, never, S>, null, unknown, any, any] // invoke
>

function entryHook<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
>(...actions: Array<Action<C, E, I, EM, G, A>>) {
  return [EntrySymbol, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A>, null, actions] as const // StDefItems
}

function exitHook<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
>(...actions: Array<Action<C, E, I, EM, G, A>>) {
  return [ExitSymbol, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A>, null, actions] as const // StDefItems
}

type O_ExtractEvent<E extends EventBody, Et extends E['type']> =
  Et extends ChildDoneEType ? Expand<ChildDoneEventBody>
  : Et extends BuiltinEType ? E
  : E extends { type: Et } ? E
  : Et extends E['type'] ? E
  : never

type O_Transition<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = {
  to?: StateName
  guard?: OneOrMany<Guard<C, Ex, I, G>>
  actions?: OneOrMany<Action<C, Ex, I, EM, G, A>>
}

function on<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  Et extends [E] extends [never] ? string : E['type'] | Eb | never,
  Eb extends BuiltinEType = BuiltinEType,
>(eventType: Et, config: OneOrMany<Expand<O_Transition<C, O_ExtractEvent<E, Et>, I, EM, G, A>>>) {
  return [eventType, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, Eb>, config as X_HiddenImpl] as const // StDefCoreItem, InvocationCleanupEvents
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
    (() => SubStatesSymbol) as X_DefTypeRefluxer<C, E, I, EM, G, A, BuiltinEType, S, typeof SubStatesSymbol>,
    transformNormalizedDefinition(stateDefinition, initialState) as {
      initial: [Initial] extends [never] ? undefined : Initial
      stateOf: {
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
    (() => ParallelSymbol) as X_DefTypeRefluxer<C, E, I, EM, G, A, BuiltinEType, S, typeof ParallelSymbol>,
    transformParallelNormalizedDefinition<C, E, I, EM, G, A, S>()<typeof parallelDefinition>(
      parallelDefinition,
    ) as unknown as {
      dType: 'regions'
      stateOf: {
        [K in keyof PD]: {
          def: NStateItemDef<O_ExtractRegionEType<PD[K]>>
          sub: {
            initial: string | undefined
            stateOf: {
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

type InvocationCleanupEvents<
  C extends MContext,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  Data,
> = Array<
  | readonly ['done', NoInfer<X_DefTypeRefluxer<C, { type: 'done'; data: Data }, I, EM, G, A, never>>, X_HiddenImpl] // on
  | readonly ['error', X_DefTypeRefluxer<C, { type: 'error'; error: Error }, I, EM, G, A, never>, X_HiddenImpl] // on
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
  ...cleanupEvents: InvocationCleanupEvents<C, I, EM, G, A, Awaited<ReturnType<O_IntoServiceFn<Src, S>>>>
) {
  return [
    InvokeSymbol,
    (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, BuiltinEType, S>,
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
    //tags: new Set(),
    entryHooks: null,
    exitHooks: null,
    invocations: [],
    internalEvents: {},
    events: {},
  },
  sub: null,
})

function o_normalizeTransitions(transitions: Array<typeof ark_stdef.Transition.infer>) {
  return transitions.map(({ actions, guard, ...rest }) => ({
    actions: ensureArray(actions),
    guards: ensureArray(guard),
    ...rest,
  }))
}

function x_parseStDefItems(items: typeof ark_stdef.StateDefinition.infer, stateName: StateName) {
  let { def, sub } = o_getNormalizedStDefTemplate()
  if (!items?.length) {
    def.final = !items
    return { def, sub }
  }

  const _getPath = () => `${def.pPath}${ST_DELIM}${stateName}`
  const seenInvocationId = new Set<string>()
  for (const [i, item] of items.entries()) {
    if (!Array.isArray(item)) {
      if ('final' in item) {
        const { final } = item
        def.final = typeof final === 'function' ? final : !!final
      }
      continue
    }

    switch (typeof item?.[0]) {
      case 'string': {
        // on(...)
        const [eType, _, transitions] = item
        if (Object.hasOwn(def.events, eType) || Object.hasOwn(def.internalEvents, eType)) {
          throw new Error(`createMachine: Duplicate event definition for event "${eType}", at "${stateName}"[${i}]`)
        }
        const mid = ensureArray(transitions!)
        if (!mid.length || mid.some((t) => !Object.keys(t).length)) {
          throw new Error(
            `createMachine: on(eventType, config): Empty config is not allowed: on("${eType}", ${JSON.stringify(transitions)}), at "${stateName}"[${i}]`,
          )
        }
        const nTransitions = o_normalizeTransitions(mid)
        switch (eType) {
          case ':always:':
            def.internalEvents[':always:'] = {
              transitions: nTransitions,
            }
            break
          case ':childDone:':
            def.internalEvents[':childDone:'] = {
              cond: ({ path }) => path === _getPath(),
              transitions: nTransitions,
            }
            break
          default:
            def.events[eType] = nTransitions
            break
        }
        break
      }
      case 'symbol': {
        switch (item[0]) {
          case InvokeSymbol: {
            const { id, ...rest } = item[3]
            const ivkId = id || `(invocation-${i})`
            if (seenInvocationId.has(ivkId)) {
              throw new Error(`createMachine: Duplicate invocation id: "${ivkId}", at state:"${stateName}"[${i}]`)
            }
            seenInvocationId.add(ivkId)
            def.invocations.push({ id: ivkId, ...rest, src: item[4] })

            const { internalEvents } = def
            for (const [j, [ivkEType, _, cleanupEvents]] of item[5].entries()) {
              if (!(ivkEType === 'done' || ivkEType === 'error')) {
                throw new Error(
                  `createMachine: Invocation event must be 'done' or 'error': ${ivkEType}, at state:"${stateName}"[${i}] > invoke events[${j}]`,
                )
              }
              const internalEType = `${ivkId}/${ivkEType}` as const
              if (Object.hasOwn(internalEvents, internalEType)) {
                throw new Error(
                  `createMachine: Duplicate invocation event: ${ivkEType}, at state:"${stateName}"[${i}] > invoke events[${j}]`,
                )
              }
              const mid = ensureArray(cleanupEvents!)
              if (!mid.length || mid.some((t) => !Object.keys(t).length)) {
                throw new Error(
                  `createMachine: on(eventType, config): The 'config' argument is required, at state:"${stateName}"[${i}] > invoke events[${j}] event:"${ivkEType}"`,
                )
              }
              internalEvents[internalEType] = {
                cond: ({ path }) => path === _getPath(),
                transitions: o_normalizeTransitions(mid),
              }
            }
            break
          }
          case EntrySymbol: {
            def.entryHooks = ensureArray(item[3]!)
            break
          }
          case ExitSymbol: {
            def.exitHooks = ensureArray(item[3]!)
            break
          }
          default:
            break
        }
        break
      }
      case 'function': {
        const subStDict = item[1] as Exclude<(typeof item)[1], (...args: any[]) => unknown>
        if (sub) {
          throw new Error(
            `createMachine: Duplicated subStates: at "${stateName}"[${i}] { ${Object.keys(
              'stateOf' in subStDict ? subStDict.stateOf : {},
            )
              .map((el) => `${el}:...`)
              .join(', ')} }`,
          )
        }
        sub = subStDict
        break
      }
      default:
        throw new Error(`createMachine: Unexpected array[0] type: ${JSON.stringify(item?.[0])}`)
    }
  }
  return { def, sub }
}

function o_normalizeStates<const D extends Record<string, StateDefinition<any, any, any, any, any, any, any>>>(
  stateDefOf: D,
) {
  return Object.entries(stateDefOf).reduce(
    (acc, [stateName, stDefs]: [keyof D & string, unknown], i) => {
      if (stateName.includes(ST_DELIM)) {
        throw new Error(`createMachine: State names cannot contain the character "${ST_DELIM}": "${stateName}"`)
      } else if (Array.isArray(stDefs) || stDefs == null) {
        const items = ark_stdef.StateDefinition.assert(stDefs)
        const { def, sub } = x_parseStDefItems(items, stateName)
        acc[stateName] = { def, sub } as any
      } else {
        throw new Error(
          `createMachine: Invalid state definition for state "${String(stateName)}". Expected an array but got ${typeof stDefs}.`,
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
        assertOrThrow(
          Object.hasOwn(stateDefOf, initialState),
          `createMachine: Invalid initialState: "${initialState}"`,
        )
        ? initialState
        : firstState
  ) as Initial extends string ? Initial : string
  return {
    initial,
    stateOf: o_normalizeStates(stateDefOf),
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
    const stateOf = Object.fromEntries(
      Object.entries(parallelDefinition).map(([regionName, rawDefinition]) => {
        if (regionName.includes(ST_DELIM)) {
          throw new Error(
            `createMachine: Parallel region state names cannot contain the character "${ST_DELIM}": "${regionName}"`,
          )
        }
        const len = rawDefinition.length
        const leafDefOf = (rawDefinition[len - 1] || {}) as Record<string, StateDefinition<C, E, I, EM, G, A, S>>
        const regionStDefCoreItems = (rawDefinition[len - 2] || []) as Array<StDefCoreItem<C, E, I, EM, G, A>>

        const { def } = x_parseStDefItems(regionStDefCoreItems, regionName)
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
      dType: 'regions',
      stateOf,
    }
  }
}

// ===

function o_setPPathAndAddCatalog(
  nStItemRecord: NormalizedDefinition['stateOf'] | ParallelNormalizedDefinition['stateOf'],
  parent: string,
  addToCatalog: (stPath: string, state: NormalizedStateItemBoth) => unknown,
  isRegion: boolean,
  addRegionPath: (regionPath: string) => unknown,
) {
  for (const [key, nState] of Object.entries(nStItemRecord)) {
    const { def, sub } = nState
    def.pPath = parent
    const stPath = `${parent}${ST_DELIM}${key}`
    addToCatalog(stPath, nState)
    if (isRegion) {
      addRegionPath(stPath)
    }
    if (sub) {
      const isParallel = 'dType' in sub && sub.dType === 'regions'
      o_setPPathAndAddCatalog(sub.stateOf, stPath, addToCatalog, isParallel, addRegionPath)
    }
  }
}

function o_getTransitionFullPath(
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
function x_readyToValidateTransitionAndSetFullTo(
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
      const tFullPath = o_getTransitionFullPath(to, statePath, pPath, stateCatalog)
      if (!tFullPath) {
        throw new Error(`createMachine: Invalid transition "${to}" in state "${statePath || '/'}" (on:"${eType}").`)
      }
      if (regionUnder && !tFullPath.startsWith(regionUnder) && tFullPath.startsWith(parallelRoot!)) {
        throw new Error(
          `createMachine: Transitions in a parallel state cannot target a different region: on('${eType}', ['${to}', ...]) in state "${statePath || '/'}".`,
        )
      }
      transition.fullTo = tFullPath
    }
  }
}

function o_validateTransitionAndSetFullTo(stateCatalog: Map<string, NormalizedStateItemBoth>, regionPaths: string[]) {
  stateCatalog.forEach(({ def }, statePath) => {
    const { events, internalEvents, pPath } = def
    const _validateTransitionAndSetFullTo = x_readyToValidateTransitionAndSetFullTo(
      stateCatalog,
      statePath,
      pPath,
      regionPaths,
    )
    Object.entries(events).forEach(([eType, transitions]) => {
      if (!transitions) return
      _validateTransitionAndSetFullTo(transitions, eType)
    })
    Object.entries(internalEvents).forEach(([eType, internalEvent]) =>
      _validateTransitionAndSetFullTo(internalEvent!.transitions, eType),
    )
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
  defineStates: (
    define: Expand<X_DefineStatesParam>,
  ) => readonly [X_GlobalEvents<C, E, I, EM, G, A>, D] | readonly [D] | D,
) {
  {
    const configOut = ark_m_config.MachineConfig(config)
    if (configOut instanceof arkType.errors) {
      throw new Error(`createMachine: Invalid machine config: ${configOut.summary}`)
    }
  }
  const rawDefinition = defineStates({
    on,
    entryHook,
    exitHook,
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
      throw new Error(`createMachine: Invalid state definition: Expected an object but got ${dType}.`)
    }
    if (Object.keys(stateDefDict).length === 0) {
      throw new Error(`createMachine: Invalid state definition: The state definition object cannot be empty.`)
    }
  }

  const { initial, stateOf } = transformNormalizedDefinition(stateDefDict, config.initialState)

  // Setup stateCatalog and regionPaths
  const stateCatalog = new Map<string, NormalizedStateItemBoth>()
  const regionPaths: string[] = []
  o_setPPathAndAddCatalog(
    stateOf,
    '',
    (stPath: string, state: NormalizedStateItemBoth) => stateCatalog.set(stPath, state),
    false,
    (regionPath: string) => regionPaths.push(regionPath),
  )
  regionPaths.sort((a, b) => b.length - a.length)

  o_validateTransitionAndSetFullTo(stateCatalog, regionPaths)

  const {
    def: { events, internalEvents },
  } = x_parseStDefItems(globalEvents || [], '(root)')
  {
    const _validateTransitionAndSetFullTo = x_readyToValidateTransitionAndSetFullTo(stateCatalog, '', '', regionPaths)
    Object.entries(events).forEach(([eType, transitions]) => {
      if (!transitions) return
      _validateTransitionAndSetFullTo(transitions, eType)
    })
    Object.entries(internalEvents).forEach(([eType, internalEvent]) =>
      _validateTransitionAndSetFullTo(internalEvent!.transitions, eType),
    )
  }

  return {
    definition: { initial, stateOf },
    topLvDefItem: { events, internalEvents },
    stateCatalog,
    regionPaths,
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
  defineStates: (
    define: Expand<X_DefineStatesParam>,
  ) => readonly [X_GlobalEvents<C, E, I, EM, G, A>, D] | readonly [D] | D,
  //defineStates: ( define: Expand<T_DefineStatesParam>) => D,
) {
  const { definition, topLvDefItem, stateCatalog, regionPaths } = getDefinitionAndCatalog<C, E, I, EM, O, S, D, G, A>(
    config,
    defineStates,
  )

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
    topLvDefItem: topLvDefItem as TopLvStDefItem<E['type']>,
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
