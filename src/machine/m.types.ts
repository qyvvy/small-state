import type { AnyFn, Duplicate, Expand, Placeholder } from '../shared/general.types'

export type ExtractEvent<E extends EventBody, Et extends E['type']> =
  Et extends BuiltinEType ? E : E extends { type: Et } ? E : Et extends E['type'] ? E : never


export const SubStatesSymbol: unique symbol = Symbol('SubStates')
export const ParallelSymbol: unique symbol = Symbol('Parallel')
export const TransitionSymbol: unique symbol = Symbol('Transition')
export const InvokeSymbol: unique symbol = Symbol('Invoke')
export const InvokeDoneSymbol: unique symbol = Symbol('InvokeDone')
export const InvokeErrorSymbol: unique symbol = Symbol('InvokeDone')


//export const BUILTIN_ETYPES = [':ctxChanged:', ':childDone:'] as const
export const BUILTIN_ETYPES = [':always:', ':childDone:'] as const
const BuiltinETypeSet = new Set<string>(BUILTIN_ETYPES)
export type BuiltinEType = (typeof BUILTIN_ETYPES)[number]
export const isBuiltinEType = (v: string): v is BuiltinEType => BuiltinETypeSet.has(v)

export type MContext = Record<string, any>
export type EventBody = { type: string;[key: string]: any }
export type EmittedEvent = { type: string;[key: string]: any }
export type StateName = string

// type 以外のプロパティを持たない EventBody の型を抽出する
export type PureEventType<E extends EventBody> =
  E extends unknown ? Exclude<keyof E, "type"> extends never ? E['type'] : never : any

export type FnBaseParams<C extends MContext, Ex extends EventBody, I, Additional = unknown, P = any> = [
  arg: Expand<{ c: C; context: C; e: Ex; event: Ex; input: I } & Additional>,
  params: P
]
export type ActionFnParams<C extends MContext, Ex extends EventBody, I, EM extends EmittedEvent, P = any> =
  FnBaseParams<C, Ex, I, { update: UpdateFn<C>, emit: EmitFn<EM> }, P>


type X_NormalizedGuardBody = { body: AnyFn<boolean> | string, params?: unknown | AnyFn }
type X_NormalizedActionBody = { body: AnyFn | string, params?: unknown | AnyFn, isEnqueue?: true }
export type NormalizedTransition = {
  to?: StateName
  fullTo?: StateName
  guards: X_NormalizedGuardBody[]
  actions: X_NormalizedActionBody[]
}

export type NormalizedInvocation = {
  id?: string
  input?: AnyFn
  src: AnyFn | string
  done?: NormalizedTransition[]
  error?: NormalizedTransition[]
}

type O_NormalizedOneAction = {
  guards: X_NormalizedGuardBody[]
  actions: X_NormalizedActionBody[]
}
export type NStateItemDef<Et extends string> = {
  pPath: string
  final: boolean
  tags: Set<string>
  entryHook: O_NormalizedOneAction | null
  exitHook: O_NormalizedOneAction | null
  //always: O_NormalizedTransition[]
  //delays: Array<O_NormalizedTransition & { after: number }>
  invocations: Array<NormalizedInvocation>
  builtinEvents: { [K in BuiltinEType]?: NormalizedTransition[] }
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
  initial: string | undefined,
  states: Record<string, NormalizedStateItem>
}
export type ParallelNormalizedDefinition = {
  nType: 'parallel'
  regions: Record<string, ParallelNormalizedStateItem>
}

export type ParamsArgOf<
  R extends Record<string, Placeholder>,
  Rk extends keyof R,
  C extends MContext,
  Ex extends EventBody,
  I,
> = unknown extends R[Rk]
  ? []
  : [params: R[Rk] | ((arg: FnBaseParams<C, Ex, I>[0]) => R[Rk])]

// TODO: もし Cが narrow されるのなら Duplicate する
export type UpdateFnParam<C extends MContext> = {
  [K in keyof C]?: C[K] | Promise<C[K]> | (() => (C[K] | Promise<C[K]>))
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
  actions?: { [K in keyof A]: (arg: FnBaseParams<C, E, I, { update: UpdateFn<C> }>[0], params: A[K]) => unknown },
  services?: S
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
  output?: (arg: Omit<FnBaseParams<C, E, I, unknown>[0], 'jot'>) => O // マシンが最終状態になったときに実行される
  guards: { [K in keyof G]: (arg: FnBaseParams<C, E, I>[0], params: G[K]) => boolean }
  actions: {
    [K in keyof A]: (arg: FnBaseParams<C, E, I, { update: UpdateFn<C> }>[0], params: A[K]) => unknown
  }
  services: S
  definition: ND
  stateCatalog: Map<string, NormalizedStateItemBoth>
  regionPaths: string[]
}
