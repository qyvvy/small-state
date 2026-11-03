import type { AnyFn, EmptyRecord, Expand, LowInfer, Merge, Placeholder, Values } from '../shared/general.types'


export const EntrySymbol: unique symbol = Symbol('Entry')
export const ExitSymbol: unique symbol = Symbol('Exit')
export const SubStatesSymbol: unique symbol = Symbol('SubStates')
export const ParallelSymbol: unique symbol = Symbol('Parallel')
export const InvokeSymbol: unique symbol = Symbol('Invoke')


export type ChildDoneEBody = { type: ':childDone:', output: unknown }
export type BuiltinEType = ':always:' | ChildDoneEBody['type']
export type BuiltinSendableEvent = { type: BuiltinEType;[key: string]: any }
export type DoneEBody<O> = { type: ':done:', output: O }
export type ErrorEBody = { type: ':error:', error: unknown }

export const SystemEventSymbol: unique symbol = Symbol('SystemEvent')
export type SystemSendableEvent =
  | {
    type: `invoke/${string}[${number}]`
    [SystemEventSymbol]: true
    payload: { type: string;[key: string]: any }
  }
  | { type: `system/${string}` }
export type InternalEType = BuiltinEType | SystemSendableEvent['type']
export type InternalEPayload = { path: string } | EmptyRecord

export type MContext = Record<string, any>
export type SendableEvent = { type: string;[key: string]: any }
export type EmittableEvent = { type: string;[key: string]: any }
export type StateName = string

// type 以外のプロパティを持たない SendableEvent の型を抽出する
export type PureETypeString<E extends SendableEvent> =
  E extends unknown ? Exclude<keyof E, "type"> extends never ? E['type'] : never : any

export type FnBaseParams<C extends MContext, Ex extends SendableEvent, I, Additional = unknown, Prm = any> = [
  arg: Expand<{ c: C; context: C; e: Ex; event: Ex; input: I } & Additional>,
  params: Prm
]
export type ActionFnParams<
  C extends MContext,
  Ex extends SendableEvent,
  I,
  EM extends EmittableEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord
> = FnBaseParams<C, Ex, I,
  {
    check: CheckFn<C, Ex, I, G>
    enqueue: EnqueueFn<C, Ex, I, EM, A>
    update: UpdateFn<C>
    emit: EmitFn<EM>
    sendTo: SendToFn<S>
  }
>
export type LimitedActionFnParams<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  Prm = any
> = FnBaseParams<C, E, I, {
  update: UpdateFn<C>,
  emit: EmitFn<EM>
  // TODO: sendTo を追加できるか検討。S を持ってくるのが難しいから保留してるような気がする。
}, Prm>

/**
 * check(type: {[guardName: keyof G]: ParamsOfGuard}): boolean
 * check(type: keyof G, params?: ParamsOfGuard): boolean
 */
export type CheckFn<
  C extends MContext, Ex extends SendableEvent, I, G extends Record<string, Placeholder>
> = {
  (type: Values<{ [K in keyof G & string as unknown extends G[K] ? never : K]: { [K3 in K]: ParamsInput<G[K], C, Ex, I> } }>): boolean
  <Gk extends keyof G & string | never>(
    type: Gk, ...args: ParamsInputArgsOf<G, Gk, C, Ex, I>
  ): boolean
}

/**
 * enqueue(type: {[actionName: keyof A]: ParamsOfTheAction}): void
 * enqueue(type: keyof A, params?: ParamsOfTheAction): void
 * enqueue(fn: (arg: FnBaseParams & {update: UpdateFn, emit: EmitFn}) => void): void
 */
export type EnqueueFn<
  C extends MContext, Ex extends SendableEvent, I, EM extends EmittableEvent, A extends Record<string, Placeholder>
> = {
  (type: Values<{ [K in keyof A & string as unknown extends A[K] ? never : K]: { [K2 in K]: ParamsInput<A[K], C, Ex, I> } }>): void
  <Ak extends keyof A & string | never>(type: Ak, ...args: ParamsInputArgsOf<A, Ak, C, Ex, I>): void
  (fn: (arg: LimitedActionFnParams<C, Ex, I, EM>[0]) => void): void
}

// TODO: もし Cが narrow されるのなら Duplicate する
export type UpdateFnParam<C extends MContext> = {
  [K in keyof C]?: C[K] | (() => (C[K]))
}
export type UpdateFn<C extends MContext> = (updates: UpdateFnParam<C>) => unknown

type O_InferSendableEvent<S extends ServiceRecord[string]> =
  S extends Machine<any, infer E, any, any, any, any, any, any, any> ? E :
  S extends AnyFn
  ? (Parameters<S>[2] extends ListenFn<infer Er> ? Er : never)
  : never

export type SendToFn<
  S extends ServiceRecord,
> = {
  <Sk extends keyof S>(
    serviceName: Sk,
    subKey: string | number,
    event: O_InferSendableEvent<S[Sk]>
  ): void
  <Sk extends keyof S>(
    serviceName: Sk,
    event: O_InferSendableEvent<S[Sk]>
  ): void
}


export type EmitFn<EM extends EmittableEvent> = (event: EM) => void

export type ListenFn<E extends SendableEvent> = (listener: (event: E) => void) => void



type X_NormalizedGuard<C extends MContext = any, Ex extends SendableEvent = any, I = any> =
  ((arg: FnBaseParams<C, Ex, I>[0]) => boolean) | string | Record<string, ParamsInput<unknown, C, Ex, I>>
export type NormalizedAction<
  C extends MContext = any, Ex extends SendableEvent = any, I = any, EM extends EmittableEvent = any,
  G extends Record<string, Placeholder> = any,
  A extends Record<string, Placeholder> = any,
  S extends ServiceRecord = ServiceRecord
> =
  ((arg: ActionFnParams<C, Ex, I, EM, G, A, S>[0]) => unknown) | string | Record<string, ParamsInput<unknown, C, Ex, I>>
export type NormalizedTransition = {
  to?: StateName
  fullTo?: string
  guards: X_NormalizedGuard[]
  actions: NormalizedAction[]
}

export type NormalizedSrc =
  | { type: 'function', value: ServiceFn }
  | { type: 'string', value: string }
  | { type: 'machine', value: AnyMachine }

export type NormalizedInvocation = {
  mainKey: string
  subKey?: string | number
  input?: AnyFn
  emittableETypesToListen: string[]
  src: NormalizedSrc
}

type InternalEvent = {
  cond?: (payload: InternalEPayload) => boolean
  transitions: NormalizedTransition[]
}

export type NStateItemDef<Et extends string> = {
  pPath: string
  final: boolean | AnyFn
  //tags: Set<string>
  entryHooks: NormalizedAction[] | null
  exitHooks: NormalizedAction[] | null
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
  stateOf: Record<string, NormalizedStateItem>
}
export type ParallelNormalizedDefinition = {
  dType: 'regions'
  stateOf: Record<string, ParallelNormalizedStateItem>
}

export type ParamsInput<Prm, C extends MContext, Ex extends SendableEvent, I> =
  Prm | ((arg: FnBaseParams<C, Ex, I>[0]) => Prm)

export type ParamsInputArgsOf<
  IR extends Record<string, Placeholder>,
  IRk extends keyof IR,
  C extends MContext,
  Ex extends SendableEvent,
  I,
> = unknown extends IR[IRk]
  ? []
  : [params: ParamsInput<IR[IRk], C, Ex, I>]


export type ServiceFn<TInput = any> =
  (input: TInput, emit: EmitFn<EmittableEvent>, listen: ListenFn<any>, signal: AbortSignal) => unknown

export type ServiceRecord = Record<string, ServiceFn | AnyMachine>

export type MachineConfig<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
> = {
  types?: { context?: C; events?: E; emittable?: EM; input?: I; output?: O }
  name?: string
  initialState?: StateName
  initContext?: (input: I) => LowInfer<C>
  output?: (arg: FnBaseParams<C, DoneEBody<unknown>, I>[0]) => O
  guards?: { [K in keyof G]: (arg: FnBaseParams<C, E, I>[0], params: G[K]) => boolean }
  actions?: { [K in keyof A & string]: (arg: LimitedActionFnParams<C, E, I, EM>[0], params: A[K]) => unknown }
  services?: S
}

export type TopLvStDefItem<Et extends string> = {
  events: { [K in Et]?: NormalizedTransition[] }
  internalEvents: { [K in InternalEType]?: InternalEvent }
}
export type AnyMachine = Machine<any, any, any, any, any, any, any, any, any>

export const MachineSymbol: unique symbol = Symbol('Machine')
export type Machine<
  C extends MContext,
  E extends SendableEvent,
  I,
  EM extends EmittableEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends ServiceRecord,
  ND extends NormalizedDefinition,
> = {
  name: string
  internal: {
    [MachineSymbol]: true
    initContext: undefined | ((input: I) => C)
    output: undefined | ((arg: FnBaseParams<C, DoneEBody<unknown>, I, unknown>[0]) => O)
    guards: { [K in keyof G]: (arg: FnBaseParams<C, E | BuiltinSendableEvent, I>[0], params: G[K]) => boolean }
    actions: {
      [K in keyof A]: (arg: LimitedActionFnParams<C, E | BuiltinSendableEvent, I, EM>[0], params: A[K]) => unknown
    }
    services: S
    definition: ND
    topLvDefItem: TopLvStDefItem<E['type']>
    stateCatalog: Map<string, NormalizedStateItemBoth>
  }
  provide: <
    const nS extends ServiceRecord,
    const nG extends Record<string, Placeholder> = Record<string, Placeholder>,
    const nA extends Record<string, Placeholder> = Record<string, Placeholder>,
  >(
    implementations: {
      guards?: { [K in keyof nG]: (arg: FnBaseParams<C, E | BuiltinSendableEvent, I>[0], params: nG[K]) => boolean },
      actions?: {
        [K in keyof nA]: (arg: LimitedActionFnParams<C, E | BuiltinSendableEvent, I, EM>[0], params: nA[K]) => unknown
      }
      services?: nS
    }
  ) => Readonly<Machine<C, E, I, EM, O, Merge<G, nG>, Merge<A, nA>, Merge<S, nS>, ND>>
}
