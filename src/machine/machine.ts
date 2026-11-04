import { type as arkType } from 'arktype'
import { ST_DELIM } from '../shared/constants'
import type {
  AnyFn,
  Expand,
  IsAny,
  IsEqual,
  IsUnknown,
  Merge,
  OneOrMany,
  Placeholder,
  Values,
} from '../shared/general.types'
import { assertOrThrow, deepFreeze, ensureArray, parentPathOf } from '../shared/utils'
import * as ark_m_config from './arktype/ark_m_config'
import type * as ark_normalized from './arktype/ark_normalized'
import * as ark_stdef from './arktype/ark_stdef'
import type {
  ActionFnParams,
  BuiltinEType,
  BuiltinSendableEvent,
  ChildDoneEBody,
  DoneEBody,
  EmitFn,
  EmittableEvent,
  ErrorEBody,
  FnBaseParams,
  InternalEPayload,
  LimitedActionFnParams,
  Machine,
  MachineConfig,
  MContext,
  NormalizedDefinition,
  NormalizedSrc,
  NormalizedStateItemBoth,
  NormalizedTransition,
  NStateItemDef,
  ParallelNormalizedDefinition,
  ParamsInput,
  SendableEvent,
  ServiceFn,
  ServiceRecord,
  StateName,
  TopLvStDefItem,
} from './m.types'
import { EntrySymbol, ExitSymbol, InvokeSymbol, MachineSymbol, ParallelSymbol, SubStatesSymbol } from './m.types'

type X_HiddenImpl = any & { __brand: 'HiddenImpl' }
type X_DefTypeRefluxer<
  C extends MContext,
  E extends SendableEvent,
  I, // Input
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord = ServiceRecord,
  Eb extends BuiltinEType = BuiltinEType,
  R = unknown,
> = () => R

type X_DefineStatesTools = {
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

type Guard<C extends MContext, Ex extends SendableEvent, I, G extends Record<string, Placeholder>> =
  | Expand<X_ImplKeys<G>>
  | Values<{ [K in keyof G & string as unknown extends G[K] ? never : K]: { [K2 in K]: ParamsInput<G[K], C, Ex, I> } }> // { [guardName: string]: Params }
  | ((arg: FnBaseParams<C, Ex, I>[0]) => boolean)

type Action<
  C extends MContext,
  Ex extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
> =
  | Expand<X_ImplKeys<A>>
  | Values<{ [K in keyof A & string as unknown extends A[K] ? never : K]: { [K2 in K]: ParamsInput<A[K], C, Ex, I> } }> // { [actionName: string]: Params }
  | ((arg: ActionFnParams<C, Ex, I, EM, G, A, S>[0]) => unknown)

type StDefMetaInfo<C extends MContext, E extends SendableEvent, I> = {
  final?: boolean | ((args: FnBaseParams<C, E, I>[0]) => unknown)
}

type StDefCoreItem<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
> =
  | StDefMetaInfo<C, E, I>
  | readonly [E['type'] | BuiltinEType, X_DefTypeRefluxer<C, E, I, EM, G, A, S>, X_HiddenImpl] // on
  | readonly [typeof EntrySymbol, X_DefTypeRefluxer<C, E, I, EM, G, A, S>, null, X_HiddenImpl] // entryHook
  | readonly [typeof ExitSymbol, X_DefTypeRefluxer<C, E, I, EM, G, A, S>, null, X_HiddenImpl] // exitHook

type StateDefinition<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
> = null | Array<
  | StDefCoreItem<C, E, I, EM, G, A, S>
  | readonly [X_DefTypeRefluxer<C, E, I, EM, G, A, S, BuiltinEType, any>, unknown] // subStates|parallel
  | readonly [typeof InvokeSymbol, X_DefTypeRefluxer<C, E, I, EM, G, A, S, never>, null, unknown, any, any] // invoke
>

function entryHook<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
>(...actions: Array<Action<C, E, I, EM, G, A, S>>) {
  return [EntrySymbol, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, S>, null, actions] as const // StDefItems
}

function exitHook<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
>(...actions: Array<Action<C, E, I, EM, G, A, S>>) {
  return [ExitSymbol, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, S>, null, actions] as const // StDefItems
}

type O_ExtractEvent<E extends SendableEvent, Et extends E['type']> = Et extends ChildDoneEBody['type']
  ? Expand<ChildDoneEBody>
  : Et extends BuiltinEType
  ? E
  : E extends { type: Et }
  ? E
  : Et extends E['type']
  ? E
  : never

type O_Transition<
  C extends MContext,
  Ex extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
> = {
  to?: StateName
  guard?: OneOrMany<Guard<C, Ex, I, G>>
  actions?: OneOrMany<Action<C, Ex, I, EM, G, A, S>>
}

function on<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  Et extends [E] extends [never] ? string : E['type'] | Eb | never,
  Eb extends BuiltinEType = BuiltinEType,
>(eventType: Et, config: OneOrMany<Expand<O_Transition<C, O_ExtractEvent<E, Et>, I, EM, G, A, S>>>) {
  return [eventType, (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, S, Eb>, config as X_HiddenImpl] as const // StDefCoreItem, InvocationCleanupEvents
}

function subStates<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  const D extends { [K in string]: StateDefinition<C, E, I, EM, G, A, S> },
  const Initial extends keyof D & string,
>(statesDefinition: D, initialState?: Initial) {
  return [
    (() => SubStatesSymbol) as X_DefTypeRefluxer<C, E, I, EM, G, A, S, BuiltinEType, typeof SubStatesSymbol>,
    transformNormalizedDefinition(statesDefinition, initialState) as {
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
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  const PD extends {
    [K in string]:
    | [Array<StDefCoreItem<C, E, I, EM, G, A, S>>, { [L in string]: StateDefinition<C, E, I, EM, G, A, S> }]
    | [{ [L in string]: StateDefinition<C, E, I, EM, G, A, S> }?]
  },
>(parallelDefinition: PD) {
  return [
    (() => ParallelSymbol) as X_DefTypeRefluxer<C, E, I, EM, G, A, S, BuiltinEType, typeof ParallelSymbol>,
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

type InvokeSrcExpr<TInput> = ServiceFn<TInput> | Machine<any, any, TInput, any, any, any, any, any, any>

type InvokeConfig<
  C extends MContext,
  E extends SendableEvent,
  I,
  S extends ServiceRecord,
  Src extends keyof S | InvokeSrcExpr<[SrcInput] extends [never] ? any : SrcInput>,
  SrcInput,
> = {
  subKey?: string | number
  input?: (
    arg: FnBaseParams<C, E, I>[0],
  ) => Src extends keyof S ? (S[Src] extends AnyFn ? Parameters<S[Src]>[0] : SrcInput) : SrcInput
}

type InvocationEvents<
  C extends MContext,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  TSrcTypes extends { Type: 'm' | 'f'; EM: EmittableEvent; O: unknown },
> = Array<
  | readonly [
    string,
    NoInfer<X_DefTypeRefluxer<C, Expand<DoneEBody<TSrcTypes['O']>>, I, EM, G, A, S, never>>,
    X_HiddenImpl,
  ]
  | readonly [string, X_DefTypeRefluxer<C, ErrorEBody, I, EM, G, A, S, never>, X_HiddenImpl]

  // マシン対象時、EM が any であっても builtin を補完に表示させる
  // :done: と EmittableEvent を混ぜさせない
  | (TSrcTypes['Type'] extends 'm'
    ? IsAny<TSrcTypes['EM']> extends false
    ? IsEqual<TSrcTypes['EM'], EmittableEvent> extends false
    ? readonly [string, X_DefTypeRefluxer<C, TSrcTypes['EM'], I, EM, G, A, S, never>, X_HiddenImpl]
    : never
    : never
    : never)

  // NOTE: 現状、引数にEmittableEvent の型を指定する場合、 defServiceFn でラップしないと機能しない。
  | (TSrcTypes['Type'] extends 'f'
    ? IsEqual<TSrcTypes['EM'], EmittableEvent> extends false
    ? readonly [string, X_DefTypeRefluxer<C, TSrcTypes['EM'], I, EM, G, A, S, never>, X_HiddenImpl]
    : never
    : never)
>

type OO_ResolveSrc<Src, S extends ServiceRecord> = Src extends keyof S ? S[Src] : Src

type O_InferIvkSrcTypes<Src, S extends ServiceRecord> =
  OO_ResolveSrc<Src, S> extends infer T
  ? T extends Machine<any, any, any, infer EM, infer O, any, any, any, any>
  ? { EM: EM; O: O; Type: 'm' }
  : T extends ServiceFn
  ? Parameters<T>[1] extends EmitFn<infer EM>
  ? IsUnknown<ReturnType<T>> extends false
  ? { EM: NonNullable<EM>; O: Awaited<ReturnType<T>>; Type: 'f' }
  : never
  : { EM: EmittableEvent; O: Awaited<ReturnType<T>>; Type: 'f' }
  : never
  : never

// Overloads:
function invoke<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  Src extends keyof S | InvokeSrcExpr<[SrcInput] extends [never] ? any : SrcInput>,
  SrcInput = never,
>(
  service: Src,
  ...events: InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>
): readonly [
  typeof InvokeSymbol,
  X_DefTypeRefluxer<C, E, I, EM, G, A, S, BuiltinEType, unknown>,
  null,
  X_HiddenImpl,
  X_HiddenImpl,
  InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>,
]

function invoke<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  Src extends keyof S | InvokeSrcExpr<[SrcInput] extends [never] ? any : SrcInput>,
  SrcInput = never,
>(
  service: Src,
  config: InvokeConfig<C, E, I, S, Src, SrcInput>,
  ...events: InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>
): readonly [
  typeof InvokeSymbol,
  X_DefTypeRefluxer<C, E, I, EM, G, A, S, BuiltinEType, unknown>,
  null,
  X_HiddenImpl,
  X_HiddenImpl,
  InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>,
]

// Implementation:
function invoke<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  Src extends keyof S | InvokeSrcExpr<[SrcInput] extends [never] ? any : SrcInput>,
  SrcInput = never,
>(
  service: Src,
  ...args:
    | [
      config: InvokeConfig<C, E, I, S, Src, SrcInput>,
      ...events: InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>,
    ]
    | InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>
) {
  const [config, events] = ((): [
    InvokeConfig<C, E, I, S, Src, SrcInput>,
    InvocationEvents<C, I, EM, G, A, S, O_InferIvkSrcTypes<Src, S>>,
  ] => {
    if (!args.length) return [{}, []]
    if (Array.isArray(args[0])) return [{}, args as any]
    const [first, ...rest] = args
    return [first as any, rest as any]
  })()

  return [
    InvokeSymbol,
    (() => null) as X_DefTypeRefluxer<C, E, I, EM, G, A, S>,
    null,
    service as X_HiddenImpl,
    config as X_HiddenImpl,
    events,
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
              cond: ({ path }: InternalEPayload) => path === _getPath(),
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
            const rawSrc = item[3]
            const src: NormalizedSrc = (() => {
              switch (typeof rawSrc) {
                case 'object':
                  return { type: 'machine', value: rawSrc }
                case 'function':
                  return { type: 'function', value: rawSrc }
                default:
                  return { type: 'string', value: rawSrc }
              }
            })()
            const { invocations, internalEvents } = def
            const emittableETypesToListen: string[] = []
            invocations.push({ ...item[4], src, emittableETypesToListen, mainKey: '' })
            const suffixNum = invocations.length - 1

            let hasErrObserver = false
            for (const [j, [ivkEType, _, ivkTransitions]] of item[5].entries()) {
              const transitions = ensureArray(ivkTransitions!)
              if (!transitions.length || transitions.some((t) => !Object.keys(t).length)) {
                throw new Error(
                  `createMachine: on(eventType, config): The 'config' argument is required, at state:"${stateName}"[${i}] > invoke events[${j}] event:"${ivkEType}"`,
                )
              }
              const eType: `invoke/${string}[${number}]` = `invoke/${ivkEType}[${suffixNum}]`
              if (Object.hasOwn(internalEvents, eType)) {
                throw new Error(
                  `createMachine: Duplicate event definition for event "${ivkEType}", at state:"${stateName}"[${i}] > invoke events[${j}]`,
                )
              }
              internalEvents[eType] = {
                cond: ({ path }: InternalEPayload) => path === _getPath(),
                transitions: o_normalizeTransitions(transitions),
              }
              if (ivkEType === ':error:') {
                hasErrObserver = true
              } else if (ivkEType !== ':done:') {
                emittableETypesToListen.push(ivkEType)
              }
            }
            if (!hasErrObserver) {
              // 非同期処理をキューで受けられるようにする
              internalEvents[`invoke/:error:[${suffixNum}]`] = {
                cond: ({ path }: InternalEPayload) => path === _getPath(),
                transitions: [
                  { guards: [], actions: [({ e }) => { throw e.error }] },
                ],
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
    (acc, [stKey, stDefs]: [keyof D & string, unknown], i) => {
      if (stKey.includes(ST_DELIM)) {
        throw new Error(`createMachine: State names cannot contain the character "${ST_DELIM}": "${stKey}"`)
      } else if (Array.isArray(stDefs) || stDefs == null) {
        try {
          const items = ark_stdef.StateDefinition.assert(stDefs)
          const { def, sub } = x_parseStDefItems(items, stKey)
          acc[stKey] = { def, sub } as any
        } catch (err) {
          if (err instanceof Error) {
            throw new Error(`createMachine:(at state "${stKey}") ${err.name}: ${err.message}`)
          }
        }
      } else {
        throw new Error(
          `createMachine: Invalid state definition for state "${String(stKey)}". Expected an array but got ${typeof stDefs}.`,
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
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
>() {
  return <
    const PD extends {
      [K in string]:
      | [Array<StDefCoreItem<C, E, I, EM, G, A, S>>, Record<string, StateDefinition<C, E, I, EM, G, A, S>>]
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
        const regionStDefCoreItems = (rawDefinition[len - 2] || []) as Array<StDefCoreItem<C, E, I, EM, G, A, S>>

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

function o_setPPathAndInvocationMainKeyThenAddCatalog(
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
    for (const [i, e] of def.invocations.entries()) {
      e.mainKey = e.src.type === 'string' ? e.src.value : `${stPath}[${i}]`
    }
    addToCatalog(stPath, nState)
    if (isRegion) {
      addRegionPath(stPath)
    }
    if (sub) {
      const isParallel = 'dType' in sub && sub.dType === 'regions'
      o_setPPathAndInvocationMainKeyThenAddCatalog(sub.stateOf, stPath, addToCatalog, isParallel, addRegionPath)
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
  const ancestorRegion = regionPaths.find((regionPath) => pPath.startsWith(regionPath))
  const parallelRoot = !ancestorRegion ? null : parentPathOf(ancestorRegion)

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
      if (ancestorRegion && !tFullPath.startsWith(ancestorRegion) && tFullPath.startsWith(parallelRoot!)) {
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
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = Array<readonly [E['type'] | BuiltinEType, X_DefTypeRefluxer<C, E, I, EM, G, A>, X_HiddenImpl]>

function getDefinitionAndCatalog<
  C extends MContext,
  const E extends SendableEvent,
  const I,
  const EM extends EmittableEvent,
  const O,
  const S extends ServiceRecord,
  const D extends { [K in string]: StateDefinition<C, E, I, EM, G, A, S> },
  const G extends Record<string, Placeholder> = Record<string, Placeholder>,
  const A extends Record<string, Placeholder> = Record<string, Placeholder>,
>(
  config: MachineConfig<C, E, I, EM, O, G, A, S>,
  defineStates: (
    defineStatesTools: Expand<X_DefineStatesTools>,
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
      throw new Error(`createMachine: No states in machine definition.`)
    }
  }

  const { initial, stateOf } = transformNormalizedDefinition(stateDefDict, config.initialState)

  // Setup stateCatalog and regionPaths
  const stateCatalog = new Map<string, NormalizedStateItemBoth>()
  const regionPaths: string[] = []
  o_setPPathAndInvocationMainKeyThenAddCatalog(
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
    regionPaths, // マシン内では使わなくなった
  }
}

export function defServiceFn<TFn extends ServiceFn>(fn: TFn) {
  return fn
}

export function makeMachine<
  C extends MContext,
  const E extends SendableEvent,
  const I,
  const EM extends EmittableEvent,
  const O,
  const S extends ServiceRecord,
  const D extends { [K in string]: StateDefinition<C, E, I, EM, G, A, S> },
  const G extends Record<string, Placeholder> = Record<string, Placeholder>,
  const A extends Record<string, Placeholder> = Record<string, Placeholder>,
>(
  config: Expand<MachineConfig<C, E, I, EM, O, G, A, S>>,
  defineStates: (
    defineStatesTools: Expand<X_DefineStatesTools>,
  ) => readonly [X_GlobalEvents<C, E, I, EM, G, A>, D] | readonly [D] | D,
) {
  const { definition, topLvDefItem, stateCatalog } = getDefinitionAndCatalog<C, E, I, EM, O, S, D, G, A>(
    config,
    defineStates,
  )

  const { name, initContext, output, guards, actions, services } = config

  const m: Machine<C, E, I, EM, O, G, A, S, typeof definition> = {
    name: name || '(machine)',
    provide,
    internal: {
      [MachineSymbol]: true,
      initContext,
      output,
      guards: guards || ({} as any),
      actions: actions || ({} as any),
      services: services || ({} as any),
      definition,
      topLvDefItem: topLvDefItem as TopLvStDefItem<E['type']>,
      stateCatalog,
    },
  }
  return deepFreeze(m)
}

function provide<
  C extends MContext,
  const E extends SendableEvent,
  const I,
  const EM extends EmittableEvent,
  O,
  const G extends Record<string, Placeholder>,
  const A extends Record<string, Placeholder>,
  const S extends ServiceRecord,
  ND extends NormalizedDefinition,
  const nS extends ServiceRecord,
  const nG extends Record<string, Placeholder> = Record<string, Placeholder>,
  const nA extends Record<string, Placeholder> = Record<string, Placeholder>,
>(
  this: Machine<C, E, I, EM, any, G, A, S, ND>,
  implementations: {
    guards?: { [K in keyof nG]: (arg: FnBaseParams<C, E | BuiltinSendableEvent, I>[0], params: nG[K]) => boolean }
    actions?: {
      [K in keyof nA]: (arg: LimitedActionFnParams<C, E | BuiltinSendableEvent, I, EM>[0], params: nA[K]) => unknown
    }
    services?: nS
  },
): Readonly<Machine<C, E, I, EM, O, Merge<G, nG>, Merge<A, nA>, Merge<S, nS>, ND>> {
  const { internal } = this
  const { guards, actions, services } = internal
  const newMachine = {
    ...this,
    internal: {
      ...internal,
      guards: { ...guards, ...implementations.guards },
      actions: { ...actions, ...implementations.actions },
      services: { ...services, ...implementations.services },
    },
  }
  return deepFreeze(newMachine) as any
}

export const __test__ = {
  getDefinitionAndCatalog,
}
