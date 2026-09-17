import type { AnyFn, Duplicate, Expand, Placeholder, Values } from '../shared/general.types'

export type ExtractEvent<E extends EventBody, Et extends E['type']> =
  Et extends BuiltinEType ? E : E extends { type: Et } ? E : Et extends E['type'] ? E : never


export const EntrySymbol: unique symbol = Symbol('Entry')
export const ExitSymbol: unique symbol = Symbol('Exit')
export const SubStatesSymbol: unique symbol = Symbol('SubStates')
export const ParallelSymbol: unique symbol = Symbol('Parallel')
export const InvokeSymbol: unique symbol = Symbol('Invoke')
export const InternalEventSymbol: unique symbol = Symbol('InternalEvent')


//export const BUILTIN_ETYPES = [':ctxChanged:', ':childDone:'] as const
export const BUILTIN_ETYPES = [':always:', ':childDone:'] as const
const BuiltinETypeSet = new Set<string>(BUILTIN_ETYPES)
export type BuiltinEType = (typeof BUILTIN_ETYPES)[number]
export const isBuiltinEType = (v: string): v is BuiltinEType =>
  BuiltinETypeSet.has(v)

//export const INTERNAL_ETYPES = [':always:', ':childDone:', 'done', 'error'] as const
//export type InternalEType = (typeof INTERNAL_ETYPES)[number]
export type InternalEType = BuiltinEType | `${string}/done` | `${string}/error`
export type InternalEventBody = { type: InternalEType;[key: string]: any }

export type MContext = Record<string, any>
export type EventBody = { type: string;[key: string]: any }
export type EmittedEvent = { type: string;[key: string]: any }
export type StateName = string

// type 以外のプロパティを持たない EventBody の型を抽出する
export type PureETypeString<E extends EventBody> =
  E extends unknown ? Exclude<keyof E, "type"> extends never ? E['type'] : never : any

export type FnBaseParams<C extends MContext, Ex extends EventBody, I, Additional = unknown, P = any> = [
  arg: Expand<{ c: C; context: C; e: Ex; event: Ex; input: I } & Additional>,
  params: P
]
export type ActionFnParams<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = FnBaseParams<C, Ex, I,
  {
    check: CheckFn<C, Ex, I, G>
    enqueue: EnqueueFn<C, Ex, I, EM, A>
    update: UpdateFn<C>
    emit: (emittedEvent: EM) => unknown
  }
>
export type LimitedActionFnParams<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  P = any
> = FnBaseParams<C, E, I, {
  update: UpdateFn<C>,
  emit: (emittedEvent: EM) => unknown
}, P>

export type CheckFn<
  C extends MContext, Ex extends EventBody, I, G extends Record<string, Placeholder>
> = {
  (type: Values<{ [K in keyof G & string as unknown extends G[K] ? never : K]: { [K3 in K]: ParamsInput<G[K], C, Ex, I> } }>): boolean
  <Gk extends keyof G & string | never>(
    type: Gk, ...args: ParamsInputArgsOf<G, Gk, C, Ex, I>
  ): boolean
}

export type EnqueueFn<
  C extends MContext, Ex extends EventBody, I, EM extends EmittedEvent, A extends Record<string, Placeholder>
> = {
  (type: Values<{ [K in keyof A & string as unknown extends A[K] ? never : K]: { [K2 in K]: ParamsInput<A[K], C, Ex, I> } }>): void
  <Ak extends keyof A & string | never>(type: Ak, ...args: ParamsInputArgsOf<A, Ak, C, Ex, I>): void
  (fn: (arg: LimitedActionFnParams<C, Ex, I, EM>[0]) => void): void
}

type X_NormalizedGuard<C extends MContext = any, Ex extends EventBody = any, I = any> =
  ((arg: FnBaseParams<C, Ex, I>[0]) => boolean) | string | Record<string, ParamsInput<unknown, C, Ex, I>>
export type NormalizedAction<
  C extends MContext = any, Ex extends EventBody = any, I = any, EM extends EmittedEvent = any,
  G extends Record<string, Placeholder> = any,
  A extends Record<string, Placeholder> = any,
> =
  ((arg: ActionFnParams<C, Ex, I, EM, G, A>[0]) => unknown) | string | Record<string, ParamsInput<unknown, C, Ex, I>>
export type NormalizedTransition = {
  to?: StateName
  fullTo?: string
  guards: X_NormalizedGuard[]
  actions: NormalizedAction[]
}

export type NormalizedInvocation = {
  id: string
  input?: AnyFn
  src: AnyFn | string
  //done?: NormalizedTransition[]
  //error?: NormalizedTransition[]
}

export type InternalEPayload = { path: string }
type InternalEvent = {
  cond?: (payload: InternalEPayload) => boolean
  transitions: NormalizedTransition[]
}

export type NStateItemDef<Et extends string> = {
  pPath: string
  final: boolean
  //tags: Set<string>
  entryHooks: NormalizedAction[] | null
  exitHooks: NormalizedAction[] | null
  //always: O_NormalizedTransition[]
  //delays: Array<O_NormalizedTransition & { after: number }>
  invocations: Array<NormalizedInvocation>
  internalEvents: { [K in InternalEType]?: InternalEvent }
  events: { [K in Et]?: NormalizedTransition[] }
}

export type NormalizedStateItem = {
  def: NStateItemDef<string>
  sub: null | NormalizedDefinition | ParallelNormalizedDefinition
}
export type ParallelNormalizedStateItem = {
  def: NStateItemDef<string>
  sub: NormalizedDefinition
}
export type NormalizedStateItemBoth = NormalizedStateItem | ParallelNormalizedStateItem

export type NormalizedDefinition = {
  dType?: 'normal'
  initial: string | undefined,
  states: Record<string, NormalizedStateItem>
}
export type ParallelNormalizedDefinition = {
  dType: 'parallel'
  states: Record<string, ParallelNormalizedStateItem>
}

export type ParamsInput<P, C extends MContext, Ex extends EventBody, I> =
  P | ((arg: FnBaseParams<C, Ex, I>[0]) => P)

export type ParamsInputArgsOf<
  IR extends Record<string, Placeholder>,
  IRk extends keyof IR,
  C extends MContext,
  Ex extends EventBody,
  I,
> = unknown extends IR[IRk]
  ? []
  : [params: ParamsInput<IR[IRk], C, Ex, I>]

// TODO: もし Cが narrow されるのなら Duplicate する
export type UpdateFnParam<C extends MContext> = {
  [K in keyof C]?: C[K] | (() => (C[K]))
}
export type UpdateFn<C extends MContext> = (updates: UpdateFnParam<C>) => unknown

export type EmitFn<EM extends EmittedEvent> = (emittedEvent: EM) => unknown


export type MachineConfig<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
> = {
  types?: { context?: C; events?: E; emitted?: EM; input?: I; output?: O }
  name?: string
  initialState?: StateName
  initContext?: (input: I) => C
  output?: (arg: FnBaseParams<C, E, I>[0]) => O // マシンが最終状態になったときに実行される
  guards?: { [K in keyof G]: (arg: FnBaseParams<C, E, I>[0], params: G[K]) => boolean },
  actions?: { [K in keyof A & string]: (arg: LimitedActionFnParams<C, E, I, EM>[0], params: A[K]) => unknown },
  services?: S
}

export type GlobalStDefItem<Et extends string> = {
  events: { [K in Et]?: NormalizedTransition[] }
  internalEvents: { [K in InternalEType]?: InternalEvent }
}

export const MachineSymbol: unique symbol = Symbol('Machine')
export type Machine<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  ND extends NormalizedDefinition,
> = {
  [MachineSymbol]: true,
  name: string,
  initContext?: (input: I) => C
  output?: (arg: FnBaseParams<C, E, I, unknown>[0]) => O // マシンが最終状態になったときに実行される
  guards: { [K in keyof G]: (arg: FnBaseParams<C, E | InternalEventBody, I>[0], params: G[K]) => boolean }
  actions: {
    [K in keyof A]: (arg: LimitedActionFnParams<C, E | InternalEventBody, I, EM>[0], params: A[K]) => unknown
  }
  services: S
  definition: ND
  globalDefItem: GlobalStDefItem<E['type']>
  stateCatalog: Map<string, NormalizedStateItemBoth>
  regionPaths: string[]
}
