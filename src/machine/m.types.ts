import type { AnyFn, Expand } from './m.general.types'

export type ExtractEvent<E extends EventBody, Et extends E['type']> =
  Et extends BuiltinEType ? E : E extends { type: Et } ? E : Et extends E['type'] ? E : never


export const JotSymbol: unique symbol = Symbol('Jot')
export type JotSymbol = typeof JotSymbol
export const SubStatesSymbol: unique symbol = Symbol('SubStates')
export type SubStatesSymbol = typeof SubStatesSymbol
export const ParallelSymbol: unique symbol = Symbol('Parallel')
export type ParallelSymbol = typeof ParallelSymbol
export const InvokeSymbol: unique symbol = Symbol('Invoke')
export type InvokeSymbol = typeof InvokeSymbol

//export const BUILTIN_ETYPES = [':ctxChanged:', ':childDone:'] as const
export const BUILTIN_ETYPES = [':always:', ':childDone:'] as const
const BuiltinETypeSet = new Set<string>(BUILTIN_ETYPES)
export type BuiltinEType = (typeof BUILTIN_ETYPES)[number]
export const isBuiltinEType = (v: string): v is BuiltinEType => BuiltinETypeSet.has(v)
//export type BuiltinEType = ':always:' | ':entry:'

export type MContext = Record<string, any>
export type EventBody = { type: string;[key: string]: any }
export type EmittedEvent = { type: string;[key: string]: any }
export type StateName = string

export type FnBaseParams<C extends MContext, Ex extends EventBody, I, J> = [
  arg: { c: C; context: C; e: Ex; event: Ex; input: I; jot: J },
]
export type JotParams<C extends MContext, E extends EventBody, I, Jp> = Expand<
  Omit<FnBaseParams<C, E, I, Jp>[0], 'e' | 'event'>
>

export type FnBase<out R, in C extends MContext, in Ex extends EventBody, in I, in J> = (
  ...args: FnBaseParams<C, Ex, I, J>
) => R
export type GuardFn<in C extends MContext, Ex extends EventBody, I, J> = FnBase<boolean, C, Ex, I, J>
export type ActionFn<in C extends MContext, Ex extends EventBody, I, J> = FnBase<unknown, C, Ex, I, J>


export type TypedGuardFn<in C extends MContext, in out E extends EventBody, in I> = Expand<
  E['type'] extends infer Et
  ? Et extends E['type']
  ? { eType: Et; fn: GuardFn<C, ExtractEvent<E, Et>, I, unknown> }
  : never
  : never
>
export type GuardRecord<in C extends MContext, in out E extends EventBody, in I> = Record<
  string,
  GuardFn<C, E, I, unknown> | TypedGuardFn<C, E, I>
>

// TODO: assign が動かなくなるので使用をやめている
export type TypedActionFn<in C extends MContext, in out E extends EventBody, in I> = Expand<
  E['type'] extends infer Et
  ? Et extends E['type']
  ? { eType: Et; fn: ActionFn<C, ExtractEvent<E, Et>, I, unknown> }
  : never
  : never
>
export type ActionRecord<in C extends MContext, in out E extends EventBody, in I> = Record<
  string,
  ActionFn<C, E, I, unknown> | TypedActionFn<C, E, I>
>
//export type ServiceRecord<A, R> = Record<string, (...arg: A) => R>
//export type Service<A extends any[], R> = (...arg: A) => R


export type NormalizedInvocation = {
  id?: string
  input?: AnyFn
  src: AnyFn | string
  done?: NormalizedTransition[]
  error?: NormalizedTransition[]
}

type O_NormalizedEffectFunc = Array<AnyFn | string | { eType: string; fn: AnyFn }>
export type NormalizedTransition = {
  to?: StateName
  actions: O_NormalizedEffectFunc
  guards: O_NormalizedEffectFunc
}
export type NormalizedStItemDef<J, Et extends string> = {
  pPath: string
  final: boolean
  deriveJot: null | AnyFn<J>
  tags: Set<string>
  entry: AnyFn[] | null
  exit: AnyFn[] | null
  //always: O_NormalizedTransition[]
  //delays: Array<O_NormalizedTransition & { after: number }>
  invocations: Array<NormalizedInvocation>
  builtinEvents: { [K in BuiltinEType]?: NormalizedTransition[] }
  events: { [K in Et]?: NormalizedTransition[] }
}

export type NormalizedStateItem = {
  def: NormalizedStItemDef<unknown, string>
  sub: NormalizedDefinition | ParallelNormalizedDefinition | null
}

export type NormalizedDefinition = {
  initial: string | undefined,
  states: Record<string, NormalizedStateItem>
}
export type ParallelNormalizedDefinition = {
  nType: 'parallel'
  regions: Record<string, NormalizedStateItem>
}

export type MachineConfig<
  C extends MContext,
  E extends EventBody,
  EM extends EmittedEvent,
  I,
  O,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  S
> = {
  types?: { context?: C; events?: E; emitted?: EM; input?: I; output?: O }
  name?: string
  initialState?: StateName
  initContext?: (input: I) => C
  output?: (arg: Omit<FnBaseParams<C, E, I, unknown>[0], 'jot'>) => O // マシンが最終状態になったときに実行される
  guards?: G
  actions?: A
  services?: S
}

export const MachineSymbol: unique symbol = Symbol('Machine')
export type Machine<
  C extends MContext,
  E extends EventBody,
  EM extends EmittedEvent,
  I,
  O,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  ND extends NormalizedDefinition,
> = {
  [MachineSymbol]: true,
  name: string,
  initContext?: (input: I) => C
  output?: (arg: Omit<FnBaseParams<C, E, I, unknown>[0], 'jot'>) => O // マシンが最終状態になったときに実行される
  guards?: G
  actions?: A
  definition: ND
  stateCatalog: Map<string, NormalizedStateItem>
}
