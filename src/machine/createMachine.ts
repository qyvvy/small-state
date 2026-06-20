//import { Machine } from './Machine'

import { type } from 'arktype'
import { ST_DELIM } from '../shared/constants'
import { assertOrThrow, deepFreeze, ensureArray, randomString } from '../shared/utils'
import * as ark_m_config from './arktype/ark_m_config'
import type * as ark_normalized from './arktype/ark_normalized'
import * as ark_stdef from './arktype/ark_stdef'
import type { AnyFn, Expand, IsAny, One, OneOrMany, Placeholder, Values } from './m.general.types'
import {
  type ActionFn,
  type ActionRecord,
  type Assigner,
  type BuiltinEType,
  type EmittedEvent,
  EntrySymbol,
  type EventBody,
  ExitSymbol,
  type ExtractEvent,
  //type FnBase,
  type FnBaseParams,
  type GuardFn,
  type GuardRecord,
  InvokeSymbol,
  isBuiltinEType,
  type JotParams,
  JotSymbol,
  type Machine,
  type MachineConfig,
  MachineSymbol,
  type MContext,
  type NormalizedDefinition,
  type NormalizedInvocation,
  type NormalizedStateItem,
  type NormalizedStItemDef,
  type NormalizedTransition,
  type ParallelNormalizedDefinition,
  ParallelSymbol,
  type StateName,
  SubStatesSymbol,
  type TypedGuardFn,
} from './m.types'

type T_HiddenImpl = any & { __brand: 'HiddenImpl' }
type T_DefTypeRefluxer<
  C extends MContext,
  E extends EventBody,
  I, // Input
  //Gk extends string,
  G extends GuardRecord<C, E, I>,
  //Ak extends string,
  A extends ActionRecord<C, E, I>,
  J, // Current Jot
  Jp,
  S extends Record<string, (input: any) => unknown> = Record<string, (input: any) => unknown>, // Services
  R = unknown,
> = () => R

type OO_Ak2Relayed<AkAsRi, A extends ActionRecord<any, any, any>> = [AkAsRi] extends [never]
  ? unknown
  : unknown extends AkAsRi
  ? unknown
  : AkAsRi extends keyof A
  ? A[AkAsRi] extends (...args: any) => any
  ? ReturnType<A[AkAsRi]>
  : unknown
  : unknown

type O_ResolveRelayed<AkAsRi, Ri, A extends ActionRecord<any, any, any>> = [Ri] extends [never]
  ? OO_Ak2Relayed<AkAsRi, A>
  : unknown extends Ri
  ? OO_Ak2Relayed<AkAsRi, A>
  : Ri

type O_ExtractActionFn<
  C extends MContext,
  E extends EventBody,
  I,
  A extends ActionRecord<C, E, I>,
  Ako extends keyof A & string,
> = A[Ako] extends (...args: any) => any
  ? A[Ako]
  : A[Ako] extends { assign: (...args: any) => any }
  ? A[Ako]['assign']
  : never

type ActionEl<
  C extends MContext,
  E extends EventBody,
  I,
  A extends ActionRecord<C, E, I>,
  J,
  Ex extends EventBody,
  Aki,
  Ri,
  Ako extends keyof A & string,
  Ro,
  ResolvedRi = O_ResolveRelayed<Aki, Ri, A>,
> =
  | ActionFn<C, Ex, I, J, ResolvedRi, Ro>
  | Ako
  | { type: Ako } &
  // NOTE: params の型は定義されてる関数すべてのユニオン
  (O_ExtractActionFn<C, E, I, A, Ako> extends infer F
    ? F extends (...args: any) => any
    ? {
      params?:
      | Parameters<F>[1]
      | ((arg: FnBaseParams<C, Ex, I, J, { relayed: Awaited<ResolvedRi> }>[0]) => Parameters<F>[1])
    }
    : unknown
    : unknown)
  & { assign?: never }
  | (Assigner<C, Ex, I, J, ResolvedRi> & { type?: never; params?: never })

type T_DefineStatesParamPart = {
  on: typeof on
  entryHook: typeof entryHook
  exitHook: typeof exitHook
  AttachJot: typeof AttachJot
  subStates: typeof subStates
  parallel: typeof parallel
  //invoke: typeof invoke
}
type U_ExtractAryElementsFromMaybeJotted<T> =
  T extends Array<infer El> ? El : T extends readonly [JotSymbol, any, Array<infer El>] ? El : never
type O_ExtractEType<T> =
  U_ExtractAryElementsFromMaybeJotted<T> extends infer El
  ? El extends readonly [infer Et, AnyFn, any]
  ? Et
  : never
  : never
type O_ExtractSubStDefinition<T> =
  U_ExtractAryElementsFromMaybeJotted<T> extends infer El
  ? El extends readonly [AnyFn<SubStatesSymbol | ParallelSymbol>, infer Sub]
  ? Sub
  : never
  : never

type ExtractJot<T> = T extends readonly [JotSymbol, infer J, any]
  ? J extends (...args: any[]) => infer R
  ? Awaited<R>
  : J
  : undefined
type ExtractEType<T> = O_ExtractEType<T> extends infer Et extends string ? Exclude<Et, BuiltinEType> : never
type ExtractSubStDefinition<T> =
  O_ExtractSubStDefinition<T> extends infer Sub
  ? [Sub] extends [never]
  ? null
  : Sub extends NormalizedDefinition | ParallelNormalizedDefinition
  ? Sub
  : null
  : null

interface BuiltinGuard<G extends GuardRecord<C, EventBody, I>, C extends MContext, Ex extends EventBody, I, J> {
  (): boolean
  check: (snapshot: any) => boolean
}
export function and<C extends MContext, Ex extends EventBody, I, J, G extends GuardRecord<C, EventBody, I>>(
  ...guards: Array<Record2Guard<G, C, Ex, I, J> | GuardFn<C, Ex, I, J>>
): BuiltinGuard<G, C, Ex, I, J> {
  const fn = () => false
  fn.check = (snapshot: any) =>
    //guards.every((g) => evaluateGuard(g, { c, context: c, e, event: e, input, jot }, snapshot))
    true
  return fn
}
export function or<C extends MContext, Ex extends EventBody, I, J, G extends GuardRecord<C, EventBody, I>>(
  ...guards: Array<Record2Guard<G, C, Ex, I, J> | GuardFn<C, Ex, I, J>>
): BuiltinGuard<G, C, Ex, I, J> {
  const fn = () => false
  fn.check = (snapshot: any) =>
    //guards.some((g) => evaluateGuard(g, { c, context: c, e, event: e, input, jot }, snapshot))
    true
  return fn
}

const getNormalizedStDefTemplate = (): {
  def: NormalizedStItemDef<any, string>
  sub: null | typeof ark_normalized.SubStNormalizedDefinition.infer
} => ({
  def: {
    pPath: '',
    final: false,
    deriveJot: null,
    tags: new Set(),
    entryHooks: null,
    exitHooks: null,
    invocations: [],
    builtinEvents: {},
    events: {},
  },
  sub: null,
})

type StDefMetaInfo<in out C extends MContext, in out E extends EventBody, in out I, J> = {
  tags?: string[]
  //entry?: OneOrMany<ActionFn<C, E, I, J, unknown, unknown>>
  //exit?: OneOrMany<ActionFn<C, E, I, J, unknown, unknown>>
  final?: boolean
  //always?: OneOrMany<Transition<C, E, I, Gk, Ak, J>>
  //delays?: OneOrMany<Delay<C, E, I, Gk, Ak, J>>
}

type StDefItems<
  C extends MContext,
  E extends EventBody,
  I,
  //Gk extends string,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  J,
  Jp,
  S extends Record<string, (input: any) => unknown>,
  Et extends E['type'] | BuiltinEType = E['type'] | BuiltinEType,
> = Array<
  | StDefMetaInfo<C, E, I, J>
  | readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, unknown>, T_HiddenImpl] // on
  | readonly [EntrySymbol, T_DefTypeRefluxer<C, E, I, any, A, J, unknown>, T_HiddenImpl] // entryHook
  | readonly [ExitSymbol, T_DefTypeRefluxer<C, E, I, any, A, J, unknown>, T_HiddenImpl] // exitHook
  | readonly [T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S, any>, unknown] // subStates|parallel|entry|exit
  // NOTE: NormalizedDefinition でなく unknown にしないと ExtractEType が上手く働かない
  | readonly [InvokeSymbol, T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S>, unknown, unknown]
>

type RegionStDefItem<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  J,
> =
  | StDefMetaInfo<C, E, I, J>
  | readonly [E['type'] | BuiltinEType, T_DefTypeRefluxer<C, E, I, G, A, J, unknown>, T_HiddenImpl] // on
  | readonly [EntrySymbol, T_DefTypeRefluxer<C, E, I, any, A, J, unknown>, T_HiddenImpl] // entryHook
  | readonly [ExitSymbol, T_DefTypeRefluxer<C, E, I, any, A, J, unknown>, T_HiddenImpl] // exitHook

type StateDefinition<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  //Gk extends string,
  A extends ActionRecord<C, E, I>,
  Je,
  J,
  Jp,
  S extends Record<string, (input: any) => unknown>,
> =
  | null
  | StDefItems<C, E, I, G, A, J, Jp, S> // on, subStates, parallel
  | readonly [JotSymbol, Je, StDefItems<C, E, I, G, A, any, Jp, S>] // AttachJot

function AttachJot<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  S extends Record<string, (input: any) => unknown>,
  Jp,
  J,
  const Et extends E['type'] | BuiltinEType,
  const Sub,
>(
  jot: J | ((arg: JotParams<C, E, I, Jp>) => J | Promise<J>), // NOTE: jotに関数を指定した場合、引数の型を明示しないと jot が any 扱いされる問題がある
  stateDefItems: Array<
    | StDefMetaInfo<C, E, I, J>
    | readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, Jp>, T_HiddenImpl] // on
    | readonly [EntrySymbol, T_DefTypeRefluxer<C, E, I, any, A, J, unknown>, T_HiddenImpl] // entryHook
    | readonly [ExitSymbol, T_DefTypeRefluxer<C, E, I, any, A, J, unknown>, T_HiddenImpl] // exitHook
    | readonly [T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S, any>, Sub] // subStates|parallel
    | readonly [InvokeSymbol, T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S>, unknown, unknown]
  >,
  // NOTE: StDefItems でなく展開して Et と Sub をジェネリクス化しておかないと上から参照できない
  // NOTE: AttachJot が絡むとタプル内部の型でなく要素数で判別しているようなので invoke の要素数は 4 でなければならない
) {
  return [JotSymbol, jot, stateDefItems] as const // StateDefinition
}

// Overloads:
function entryHook<
  C extends MContext,
  E extends EventBody,
  I,
  A extends ActionRecord<C, E, I>,
  Ak extends keyof A & string,
  J,
  Ak1 extends Ak,
  Ak2 extends Ak,
  Ak3 extends Ak,
  Ak4 extends Ak,
  Ak5 extends Ak,
  Ak6 extends Ak,
  R1,
  R2,
  R3,
  R4,
  R5,
>(
  ...actions: [
    ActionEl<C, E, I, A, J, E, never, unknown, Ak1, R1>,
    ActionEl<C, E, I, A, J, E, Ak1, R1, Ak2, R2>?,
    ActionEl<C, E, I, A, J, E, Ak2, R2, Ak3, R3>?,
    ActionEl<C, E, I, A, J, E, Ak3, R3, Ak4, R4>?,
    ActionEl<C, E, I, A, J, E, Ak4, R4, Ak5, R5>?,
    ActionEl<C, E, I, A, J, E, Ak5, R5, Ak6, unknown>?,
    ...ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>[],
  ]
): readonly [
  EntrySymbol,
  T_DefTypeRefluxer<C, E, I, any, A, J, unknown, Record<string, (input: any) => unknown>, unknown>,
  ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>[],
]

function entryHook<C extends MContext, E extends EventBody, I, A extends ActionRecord<C, E, I>, J>(
  ...actions: [
    ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>,
    ...Array<ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>>,
  ]
): readonly [
  EntrySymbol,
  T_DefTypeRefluxer<C, E, I, any, A, J, unknown, Record<string, (input: any) => unknown>, unknown>,
  ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>[],
]
// Implementation:
function entryHook<C extends MContext, E extends EventBody, I, A extends ActionRecord<C, E, I>, J>(
  ...actions: Array<ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>>
) {
  return [
    EntrySymbol,
    (() => null) as T_DefTypeRefluxer<C, E, I, any, A, J, unknown, Record<string, (input: any) => unknown>, unknown>,
    actions,
  ] as const // StDefItems, AttachJot
}

// Overloads:
function exitHook<
  C extends MContext,
  E extends EventBody,
  I,
  A extends ActionRecord<C, E, I>,
  Ak extends keyof A & string,
  J,
  Ak1 extends Ak,
  Ak2 extends Ak,
  Ak3 extends Ak,
  Ak4 extends Ak,
  Ak5 extends Ak,
  Ak6 extends Ak,
  R1,
  R2,
  R3,
  R4,
  R5,
>(
  ...actions: [
    ActionEl<C, E, I, A, J, E, never, unknown, Ak1, R1>,
    ActionEl<C, E, I, A, J, E, Ak1, R1, Ak2, R2>?,
    ActionEl<C, E, I, A, J, E, Ak2, R2, Ak3, R3>?,
    ActionEl<C, E, I, A, J, E, Ak3, R3, Ak4, R4>?,
    ActionEl<C, E, I, A, J, E, Ak4, R4, Ak5, R5>?,
    ActionEl<C, E, I, A, J, E, Ak5, R5, Ak6, unknown>?,
    ...ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>[],
  ]
): readonly [
  ExitSymbol,
  T_DefTypeRefluxer<C, E, I, any, A, J, unknown, Record<string, (input: any) => unknown>, unknown>,
  ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>[],
]
function exitHook<C extends MContext, E extends EventBody, I, A extends ActionRecord<C, E, I>, J>(
  ...actions: [
    ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>,
    ...Array<ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>>,
  ]
): readonly [
  ExitSymbol,
  T_DefTypeRefluxer<C, E, I, any, A, J, unknown, Record<string, (input: any) => unknown>, unknown>,
  ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>[],
]
// Implementation:
function exitHook<C extends MContext, E extends EventBody, I, A extends ActionRecord<C, E, I>, J>(
  ...actions: Array<ActionEl<C, E, I, A, J, E, never, unknown, keyof A & string, unknown>>
) {
  return [
    ExitSymbol,
    (() => null) as T_DefTypeRefluxer<C, E, I, any, A, J, unknown, Record<string, (input: any) => unknown>, unknown>,
    actions,
  ] as const // StDefItems, AttachJot
}

type O_OnEventConfigPart<
  C extends MContext,
  Ex extends EventBody,
  I,
  G extends GuardRecord<C, any, I>,
  J,
  As extends OneOrMany<ActionEl<C, any, I, any, J, Ex, any, any, any, any>>,
> = Expand<
  TransitionPart<C, Ex, I, G, J> & {
    actions?: As
  }
>

// Overloads:
function on<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  Ak extends keyof A & string,
  Et extends E['type'] | BuiltinEType,
  Ex extends ExtractEvent<E, Et>,
  J,
  Ak11 extends Ak,
  Ak12 extends Ak,
  Ak13 extends Ak,
  Ak14 extends Ak,
  Ak15 extends Ak,
  Ak16 extends Ak,
  R11,
  R12,
  R13,
  R14,
  R15,
>(
  eventType: Et,
  config: One<
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak11, R11>,
          ActionEl<C, E, I, A, J, Ex, Ak11, R11, Ak12, R12>?,
          ActionEl<C, E, I, A, J, Ex, Ak12, R12, Ak13, R13>?,
          ActionEl<C, E, I, A, J, Ex, Ak13, R13, Ak14, R14>?,
          ActionEl<C, E, I, A, J, Ex, Ak14, R14, Ak15, R15>?,
          ActionEl<C, E, I, A, J, Ex, Ak15, R15, Ak16, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >
  >,
): readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, unknown, Record<string, (input: any) => unknown>, unknown>, any]

function on<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  Ak extends keyof A & string,
  Et extends E['type'] | BuiltinEType,
  Ex extends ExtractEvent<E, Et>,
  J,
  Ak11 extends Ak,
  Ak12 extends Ak,
  Ak13 extends Ak,
  Ak14 extends Ak,
  Ak15 extends Ak,
  Ak16 extends Ak,
  Ak21 extends Ak,
  Ak22 extends Ak,
  Ak23 extends Ak,
  Ak24 extends Ak,
  Ak25 extends Ak,
  Ak26 extends Ak,
  R11,
  R12,
  R13,
  R14,
  R15,
  R21,
  R22,
  R23,
  R24,
  R25,
>(
  eventType: Et,
  config: [
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak11, R11>,
          ActionEl<C, E, I, A, J, Ex, Ak11, R11, Ak12, R12>?,
          ActionEl<C, E, I, A, J, Ex, Ak12, R12, Ak13, R13>?,
          ActionEl<C, E, I, A, J, Ex, Ak13, R13, Ak14, R14>?,
          ActionEl<C, E, I, A, J, Ex, Ak14, R14, Ak15, R15>?,
          ActionEl<C, E, I, A, J, Ex, Ak15, R15, Ak16, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak21, R21>,
          ActionEl<C, E, I, A, J, Ex, Ak21, R21, Ak22, R22>?,
          ActionEl<C, E, I, A, J, Ex, Ak22, R22, Ak23, R23>?,
          ActionEl<C, E, I, A, J, Ex, Ak23, R23, Ak24, R24>?,
          ActionEl<C, E, I, A, J, Ex, Ak24, R24, Ak25, R25>?,
          ActionEl<C, E, I, A, J, Ex, Ak25, R25, Ak26, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
  ],
): readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, unknown, Record<string, (input: any) => unknown>, unknown>, any]

function on<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  Ak extends keyof A & string,
  Et extends E['type'] | BuiltinEType,
  Ex extends ExtractEvent<E, Et>,
  J,
  Ak11 extends Ak,
  Ak12 extends Ak,
  Ak13 extends Ak,
  Ak14 extends Ak,
  Ak15 extends Ak,
  Ak16 extends Ak,
  Ak21 extends Ak,
  Ak22 extends Ak,
  Ak23 extends Ak,
  Ak24 extends Ak,
  Ak25 extends Ak,
  Ak26 extends Ak,
  Ak31 extends Ak,
  Ak32 extends Ak,
  Ak33 extends Ak,
  Ak34 extends Ak,
  Ak35 extends Ak,
  Ak36 extends Ak,
  R11,
  R12,
  R13,
  R14,
  R15,
  R21,
  R22,
  R23,
  R24,
  R25,
  R31,
  R32,
  R33,
  R34,
  R35,
>(
  eventType: Et,
  config: [
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak11, R11>,
          ActionEl<C, E, I, A, J, Ex, Ak11, R11, Ak12, R12>?,
          ActionEl<C, E, I, A, J, Ex, Ak12, R12, Ak13, R13>?,
          ActionEl<C, E, I, A, J, Ex, Ak13, R13, Ak14, R14>?,
          ActionEl<C, E, I, A, J, Ex, Ak14, R14, Ak15, R15>?,
          ActionEl<C, E, I, A, J, Ex, Ak15, R15, Ak16, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak21, R21>,
          ActionEl<C, E, I, A, J, Ex, Ak21, R21, Ak22, R22>?,
          ActionEl<C, E, I, A, J, Ex, Ak22, R22, Ak23, R23>?,
          ActionEl<C, E, I, A, J, Ex, Ak23, R23, Ak24, R24>?,
          ActionEl<C, E, I, A, J, Ex, Ak24, R24, Ak25, R25>?,
          ActionEl<C, E, I, A, J, Ex, Ak25, R25, Ak26, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak31, R31>,
          ActionEl<C, E, I, A, J, Ex, Ak31, R31, Ak32, R32>?,
          ActionEl<C, E, I, A, J, Ex, Ak32, R32, Ak33, R33>?,
          ActionEl<C, E, I, A, J, Ex, Ak33, R33, Ak34, R34>?,
          ActionEl<C, E, I, A, J, Ex, Ak34, R34, Ak35, R35>?,
          ActionEl<C, E, I, A, J, Ex, Ak35, R35, Ak36, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
  ],
): readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, unknown, Record<string, (input: any) => unknown>, unknown>, any]

function on<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  Ak extends keyof A & string,
  Et extends E['type'] | BuiltinEType,
  Ex extends ExtractEvent<E, Et>,
  J,
  Ak11 extends Ak,
  Ak12 extends Ak,
  Ak13 extends Ak,
  Ak14 extends Ak,
  Ak15 extends Ak,
  Ak16 extends Ak,
  Ak21 extends Ak,
  Ak22 extends Ak,
  Ak23 extends Ak,
  Ak24 extends Ak,
  Ak25 extends Ak,
  Ak26 extends Ak,
  Ak31 extends Ak,
  Ak32 extends Ak,
  Ak33 extends Ak,
  Ak34 extends Ak,
  Ak35 extends Ak,
  Ak36 extends Ak,
  Ak41 extends Ak,
  Ak42 extends Ak,
  Ak43 extends Ak,
  Ak44 extends Ak,
  Ak45 extends Ak,
  Ak46 extends Ak,
  R11,
  R12,
  R13,
  R14,
  R15,
  R21,
  R22,
  R23,
  R24,
  R25,
  R31,
  R32,
  R33,
  R34,
  R35,
  R41,
  R42,
  R43,
  R44,
  R45,
>(
  eventType: Et,
  config: [
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak11, R11>,
          ActionEl<C, E, I, A, J, Ex, Ak11, R11, Ak12, R12>?,
          ActionEl<C, E, I, A, J, Ex, Ak12, R12, Ak13, R13>?,
          ActionEl<C, E, I, A, J, Ex, Ak13, R13, Ak14, R14>?,
          ActionEl<C, E, I, A, J, Ex, Ak14, R14, Ak15, R15>?,
          ActionEl<C, E, I, A, J, Ex, Ak15, R15, Ak16, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak21, R21>,
          ActionEl<C, E, I, A, J, Ex, Ak21, R21, Ak22, R22>?,
          ActionEl<C, E, I, A, J, Ex, Ak22, R22, Ak23, R23>?,
          ActionEl<C, E, I, A, J, Ex, Ak23, R23, Ak24, R24>?,
          ActionEl<C, E, I, A, J, Ex, Ak24, R24, Ak25, R25>?,
          ActionEl<C, E, I, A, J, Ex, Ak25, R25, Ak26, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak31, R31>,
          ActionEl<C, E, I, A, J, Ex, Ak31, R31, Ak32, R32>?,
          ActionEl<C, E, I, A, J, Ex, Ak32, R32, Ak33, R33>?,
          ActionEl<C, E, I, A, J, Ex, Ak33, R33, Ak34, R34>?,
          ActionEl<C, E, I, A, J, Ex, Ak34, R34, Ak35, R35>?,
          ActionEl<C, E, I, A, J, Ex, Ak35, R35, Ak36, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        | ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>
        | [
          ActionEl<C, E, I, A, J, Ex, never, unknown, Ak41, R41>,
          ActionEl<C, E, I, A, J, Ex, Ak41, R41, Ak42, R42>?,
          ActionEl<C, E, I, A, J, Ex, Ak42, R42, Ak43, R43>?,
          ActionEl<C, E, I, A, J, Ex, Ak43, R43, Ak44, R44>?,
          ActionEl<C, E, I, A, J, Ex, Ak44, R44, Ak45, R45>?,
          ActionEl<C, E, I, A, J, Ex, Ak45, R45, Ak46, unknown>?,
          ...Array<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>,
        ]
      >
    >,
    ...Array<
      Expand<
        O_OnEventConfigPart<
          C,
          Ex,
          I,
          G,
          J,
          OneOrMany<ActionEl<C, E, I, A, J, Ex, unknown, unknown, keyof A & string, unknown>>
        >
      >
    >,
  ],
): readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, unknown, Record<string, (input: any) => unknown>, unknown>, any]

function on<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  Et extends E['type'] | BuiltinEType,
  Ex extends ExtractEvent<E, Et>,
  J,
>(
  eventType: Et,
  config: OneOrMany<
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        OneOrMany<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>
      >
    >
  >,
): readonly [Et, T_DefTypeRefluxer<C, E, I, G, A, J, unknown, Record<string, (input: any) => unknown>, unknown>, any]

// Implementation:
function on<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  Et extends E['type'] | BuiltinEType,
  Ex extends ExtractEvent<E, Et>,
  J,
>(
  eventType: Et,
  config: OneOrMany<
    Expand<
      O_OnEventConfigPart<
        C,
        Ex,
        I,
        G,
        J,
        OneOrMany<ActionEl<C, E, I, A, J, Ex, never, unknown, keyof A & string, unknown>>
      >
    >
  >,
) {
  return [
    eventType as Et,
    (() => null) as T_DefTypeRefluxer<C, E, I, G, A, J, unknown>,
    config as T_HiddenImpl,
  ] as const // StDefItems, AttachJot
}

// Overloads:
function subStates<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const D extends { [K in string]: StateDefinition<C, E, I, G, A, Jd[K], J, Jp, S> },
  Jd extends { [K in keyof D]: unknown },
>(
  stateDefinition: D,
): readonly [
  T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S, SubStatesSymbol>,
  {
    initial: keyof D extends never ? undefined : keyof D
    states: {
      [K in keyof D]: {
        def: NormalizedStItemDef<ExtractJot<D[K]>, ExtractEType<D[K]>>
        sub: ExtractSubStDefinition<D[K]>
      }
    }
  },
]
function subStates<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const D extends { [K in string]: StateDefinition<C, E, I, G, A, Jd[K], J, Jp, S> },
  Jd extends { [K in keyof D]: unknown },
  const Initial extends keyof D & string,
>(
  initialState: Initial,
  stateDefinition: D,
): readonly [
  T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S, SubStatesSymbol>,
  {
    initial: Initial
    states: {
      [K in keyof D]: {
        def: NormalizedStItemDef<ExtractJot<D[K]>, ExtractEType<D[K]>>
        sub: ExtractSubStDefinition<D[K]>
      }
    }
  },
]
// Implementation:
function subStates<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const D extends { [K in string]: StateDefinition<C, E, I, G, A, Jd[K], J, Jp, S> },
  Jd extends { [K in keyof D]: unknown },
  const Arg1 extends D | (keyof D & string),
>(arg1: Arg1, arg2?: D) {
  const [stateDefinition, initialState] = (() => {
    if (arg2) return [arg2, arg1 as string]
    const d = arg1 as D
    return [d, Object.keys(d)?.[0]]
  })()
  return [
    (() => SubStatesSymbol) as T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S, SubStatesSymbol>,
    transformNormalizedDefinition(stateDefinition, initialState) as {
      initial: Arg1 extends keyof D ? Arg1 : keyof D
      states: {
        [K in keyof D]: {
          def: NormalizedStItemDef<ExtractJot<D[K]>, ExtractEType<D[K]>>
          sub: ExtractSubStDefinition<D[K]>
        }
      }
    },
  ] as const // StDefItems, AttachJot
}

type O_InnerDict<T> = T extends [...any[], infer Last] ? Last : never
type O_ExtractRegionEType<PDEl> = PDEl extends [
  infer U,
  Record<string, StateDefinition<any, any, any, any, any, any, any, any, any>>,
]
  ? U_ExtractAryElementsFromMaybeJotted<U> extends infer El
  ? El extends readonly [infer Et, AnyFn, any]
  ? Exclude<Et, BuiltinEType>
  : never
  : never
  : never

function parallel<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const PD extends {
    [K in string]:
    | [{ [L in string]: StateDefinition<C, E, I, G, A, Jd[K][L], J, Jp, S> }]
    | [
      Array<RegionStDefItem<C, E, I, G, A, J>>,
      { [L in string]: StateDefinition<C, E, I, G, A, Jd[K][L], J, Jp, S> },
    ]
    | []
  },
  Jd extends { [K in keyof PD]: { [L in keyof O_InnerDict<PD[K]>]: unknown } },
>(parallelDefinition: PD) {
  return [
    (() => ParallelSymbol) as T_DefTypeRefluxer<C, E, I, G, A, J, Jp, S, ParallelSymbol>,
    transformParallelNormalizedDefinition<C, E, I, G, A, J>()(parallelDefinition) as {
      nType: 'parallel'
      regions: {
        [K in keyof PD]: {
          def: NormalizedStItemDef<undefined, O_ExtractRegionEType<PD[K]>>
          sub: {
            initial: string | undefined
            states: {
              [L in keyof O_InnerDict<PD[K]>]: {
                def: NormalizedStItemDef<ExtractJot<O_InnerDict<PD[K]>[L]>, ExtractEType<O_InnerDict<PD[K]>[L]>>
                sub: ExtractSubStDefinition<O_InnerDict<PD[K]>[L]>
              }
            }
          }
        }
      }
    },
  ] as const // StDefItems, AttachJot
}

//type O_IntoServiceFn<Src, S extends Record<string, unknown>> = Src extends AnyFn
//  ? Src
//  : Src extends keyof S
//  ? S[Src]
//  : never
//function invoke<
//  C extends MContext,
//  E extends EventBody,
//  I,
//  Gk extends string,
//  Ak extends string,
//  S extends Record<string, (input: any) => unknown>,
//  J,
//  Src extends ((input: any) => unknown) | keyof S,
//>(
//  preparation: { id?: string; input?: FnBase<Parameters<O_IntoServiceFn<Src, S>>[0], C, E, I, J> },
//  src: Src,
//  completion?: {
//    done: TransitionPart<C, { type: 'done'; data: Awaited<ReturnType<O_IntoServiceFn<Src, S>>> }, I, Gk, Ak, J>
//    error?: TransitionPart<C, { type: 'error'; error: Error }, I, Gk, Ak, J>
//  },
//) {
//  return [
//    InvokeSymbol,
//    (() => null) as T_DefTypeRefluxer<C, E, I, Gk, Ak, J, unknown, S>,
//    { src, ...preparation, ...completion } as T_HiddenImpl,
//    null,
//  ] as const // StDefItems, AttachJot
//}


type Record2Guard<
  G extends GuardRecord<C, EventBody, I>,
  C extends MContext,
  Ex extends EventBody,
  I,
  J,
  Gk extends keyof G & string = keyof G & string,
> =
  | Gk
  | Values<{
    [K in Gk]: {
      type: K
      params?: Parameters<G[K]>[1] | ((arg: FnBaseParams<C, Ex, I, J, unknown>[0]) => Parameters<G[K]>[1])
    }
  }>
type TransitionPart<C extends MContext, Ex extends EventBody, I, G extends GuardRecord<C, EventBody, I>, J> = {
  to?: StateName
  guard?: Record2Guard<G, C, Ex, I, J> | GuardFn<C, Ex, I, J> | TypedGuardFn<C, Ex, I> | BuiltinGuard<G, C, Ex, I, J>
  //actions?: Actions<A, C, Ex, I, J>
}
//type Delay<C extends MContext, E extends EventBody, I, Gk extends string, Ak extends string, J> = Expand<
//  { after: number } & TransitionPart<C, E, I, Gk, Ak, J>
//>

function o_normalizeTransitions(
  //transitions: (TransitionPart<any, any, any, any, any> & { actions: Actions<any, any, any, any, any> })[],
  transitions: (TransitionPart<any, any, any, any, any> & {
    actions: OneOrMany<ActionEl<any, any, any, any, any, any, any, any, any, any>>
  })[],
) {
  return transitions.map(({ actions, guard, ...rest }) => ({
    actions: ensureArray(actions),
    guards: ensureArray(guard),
    ...rest,
  }))
}

function parseStDefItems(items: typeof ark_stdef.StDefItems.infer, stateName: string) {
  let { def, sub } = getNormalizedStDefTemplate()
  if (!items?.length) {
    def.final = !items
    return { def, sub }
  }

  for (const [i, item] of items.entries()) {
    if (!Array.isArray(item)) {
      if ('tags' in item) {
        def.tags = new Set(item.tags)
      }
      //if ('entry' in item) {
      //  def.entry = ensureArray(item.entry)
      //}
      //if ('exit' in item) {
      //  def.exit = ensureArray(item.exit)
      //}
      if ('final' in item) {
        def.final = !!item.final
      }
      continue
    }

    switch (typeof item?.[0]) {
      case 'string': {
        // on(...)
        const [eType, _, transitions] = item
        if (eType in def.events || eType in def.builtinEvents) {
          throw new Error(`Duplicate event definition for event "${eType}", at "${stateName}"[${i}]`)
        }
        const mid = ensureArray(transitions!)
        if (!mid.length || mid.some((t) => !Object.keys(t).length)) {
          throw new Error(
            `on(eventType, config): Empty config is not allowed: on("${eType}", ${JSON.stringify(transitions)}), at "${stateName}"[${i}]`,
          )
        }
        const nTransitions = o_normalizeTransitions(mid)
        //def.final = def.final && !nTransitions.some((t) => 'to' in t)
        if (isBuiltinEType(eType)) {
          def.builtinEvents[eType] = nTransitions
        } else {
          def.events[eType] = nTransitions
        }
        break
      }
      case 'function': {
        const subStDict = item[1] as Exclude<(typeof item)[1], (...args: any[]) => unknown>
        if (sub) {
          throw new Error(
            `Duplicated subStates: at "${stateName}"[${i}] { ${Object.keys(subStDict?.states || subStDict?.regions)
              .map((el) => `${el}:...`)
              .join(', ')} }`,
          )
        }
        sub = subStDict
        break
      }
      case 'symbol': {
        switch (item[0]) {
          case EntrySymbol: {
            if (def.entryHooks) {
              throw new Error(`Duplicate entry definition at "${stateName}"[${i}]`)
            }
            def.entryHooks = ensureArray(item[2])
            break
          }
          case ExitSymbol: {
            if (def.exitHooks) {
              throw new Error(`Duplicate exit definition at "${stateName}"[${i}]`)
            }
            def.exitHooks = ensureArray(item[2])
            break
          }
          case InvokeSymbol: {
            const { done, error, ...rest } = item[2]
            const nInvocation = {
              done: o_normalizeTransitions(ensureArray(done)),
              error: o_normalizeTransitions(ensureArray(error)),
              ...rest,
            }
            def.invocations.push(nInvocation)
            break
          }
          default:
            break
        }
        break
      }
      default:
        throw new Error(`unexpected array[0] type: ${JSON.stringify(item?.[0])}`)
    }
  }
  return { def, sub }
}

function normalizeStates<
  //C extends MContext,
  //const E extends EventBody,
  //const I,
  //const Gk extends string,
  //const A extends ActionRecord<C, E, I>,
  //A extends { [K in string]: ActionFn<C, E, I, unknown, unknown, unknown, Pa[K]> },
  //const D extends { [K in string]: StateDefinition<C, E, I, Gk, A, any, any, any, any> },
  const D extends { [K in string]: StateDefinition<any, any, any, any, any, any, any, any, any> },
>(stateDefOf: D) {
  return Object.entries(stateDefOf).reduce(
    (acc, [stateName, stDefs]: [keyof D & string, unknown]) => {
      if (stateName.includes('/')) {
        throw new Error(`State names cannot contain the character "/": "${stateName}"`)
      } else if (Array.isArray(stDefs) || stDefs == null) {
        const [_, jot, items] =
          stDefs?.[0] === JotSymbol
            ? ark_stdef.JotAttached.assert(stDefs)
            : [false, null, ark_stdef.StDefItems.assert(stDefs)]
        const { def, sub } = parseStDefItems(items, stateName)
        acc[stateName] = {
          def: { ...def, deriveJot: !jot ? null : typeof jot === 'function' ? jot : () => structuredClone(jot) },
          sub,
        } as any
      } else {
        throw new Error(
          `Invalid state definition for state "${String(stateName)}". Expected an array but got ${typeof stDefs}.`,
        )
      }
      return acc
    },
    {} as {
      [K in keyof D]: {
        def: NormalizedStItemDef<ExtractJot<D[K]>, ExtractEType<D[K]>>
        sub: ExtractSubStDefinition<D[K]>
      }
    },
  )
}

function transformNormalizedDefinition<
  //const D extends Record<string, StateDefinition<C, E, I, Gk, A, any, any, any, any>>,
  const D extends Record<string, StateDefinition<any, any, any, any, any, any, any, any, any>>,
  const Initial extends string | undefined,
>(stateDefOf: D, initialState: Initial) {
  const firstState = Object.keys(stateDefOf)?.[0]
  const initial = (
    !firstState
      ? undefined
      : initialState && assertOrThrow(initialState in stateDefOf, `invalid initialState: "${initialState}"`)
        ? initialState
        : firstState
  ) as Initial extends string ? Initial : string
  return {
    initial,
    //states: normalizeStates<C, E, I, Gk, A, D>(stateDefOf),
    states: normalizeStates<D>(stateDefOf),
  }
}

function transformParallelNormalizedDefinition<
  C extends MContext,
  const E extends EventBody,
  const I,
  const G extends GuardRecord<C, E, I>,
  const A extends ActionRecord<C, E, I>,
  J,
>() {
  return <
    const PD extends {
      [K in string]:
      | [{ [L in string]: StateDefinition<C, E, I, G, A, any, any, any, any> }]
      | [
        Array<RegionStDefItem<C, E, I, G, A, J>>,
        { [L in string]: StateDefinition<C, E, I, G, A, any, any, any, any> },
      ]
      | []
    },
  >(
    parallelDefinition: PD,
  ) => {
    const regions = Object.fromEntries(
      Object.entries(parallelDefinition).map(([regionName, rawDefinition]) => {
        if (regionName.includes('/')) {
          throw new Error(`Parallel region state names cannot contain the character "/": "${regionName}"`)
        }
        const [leafDefOf = {}, regionStDefItems]: [
          Record<string, StateDefinition<C, E, I, G, A, any, any, any, any>>,
          Array<RegionStDefItem<C, E, I, G, A, J>> | undefined,
        ] = [rawDefinition[rawDefinition.length - 1], rawDefinition[rawDefinition.length - 2]] as any

        const { def } = parseStDefItems(regionStDefItems || [], regionName)
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

function o_setPPath(
  nStates: NormalizedDefinition['states'] | ParallelNormalizedDefinition['regions'],
  parent: string,
  addToCatalog: (stPath: string, state: NormalizedStateItem) => unknown,
) {
  for (const [key, nState] of Object.entries(nStates)) {
    nState.def.pPath = parent
    const stPath = `${parent}${ST_DELIM}${key}`
    addToCatalog(stPath, nState)
    const { sub } = nState
    if (sub) {
      o_setPPath('regions' in sub ? sub.regions : sub.states, stPath, addToCatalog)
    }
  }
}

function ooo_getTransitionFullPath(transitionTarget: string, statePath: string, pPath: string) {
  return transitionTarget[0] === ST_DELIM
    ? transitionTarget
    : transitionTarget.startsWith('./')
      ? `${statePath}${ST_DELIM}${transitionTarget.slice(2)}`
      : transitionTarget.startsWith('../')
        ? `${pPath}${ST_DELIM}${transitionTarget.slice(3)}`
        : ''
}
function oo_readyToValidateTransition(
  stateCatalog: Map<string, NormalizedStateItem>,
  statePath: string,
  nState: NormalizedStateItem,
) {
  const { pPath } = nState.def
  return (transitions: NormalizedTransition[], eType: string) => {
    for (const { to } of transitions) {
      if (!to) {
        continue
      }
      const fullPath = ooo_getTransitionFullPath(to, statePath, pPath)
      if (fullPath && !stateCatalog.has(fullPath)) {
        throw new Error(`Invalid transition "${to}" in state "${statePath.slice(1)}" (on:"${eType}").`)
      }
    }
  }
}
// TODO: 相対パスチェックにも対応させる
function o_validateTransition(stateCatalog: Map<string, NormalizedStateItem>) {
  stateCatalog.forEach((nState, statePath) => {
    const {
      def: { builtinEvents, events },
    } = nState
    const validateTransition = oo_readyToValidateTransition(stateCatalog, statePath, nState)
    Object.entries(builtinEvents).forEach(([eType, transitions]) => {
      validateTransition(transitions, eType)
    })
    Object.entries(events).forEach(([eType, transitions]) => {
      if (!transitions) return
      validateTransition(transitions, eType)
    })
  })
}

type O_GlobalEvents<
  C extends MContext,
  E extends EventBody,
  I,
  G extends GuardRecord<C, E, I>,
  A extends ActionRecord<C, E, I>,
> = Array<readonly [E['type'] | BuiltinEType, T_DefTypeRefluxer<C, E, I, G, A, undefined, undefined>, T_HiddenImpl]>

function getDefinitionAndCatalog<
  C extends MContext,
  const E extends EventBody,
  const EM extends EmittedEvent,
  const I,
  const O,
  const G extends GuardRecord<C, E, I>,
  const A extends ActionRecord<C, E, I>,
  const S extends Record<string, (input: any) => unknown>,
  const D extends { [K in string]: StateDefinition<C, E, I, G, A, Jd[K], unknown, unknown, S> },
  Jd extends { [K in keyof D]: unknown },
>(
  config: MachineConfig<C, E, EM, I, O, G, A, S>,
  defineStates: (
    define: Expand<
      T_DefineStatesParamPart & { guards: NonNullable<G>; actions: NonNullable<A>; services: NonNullable<S> }
    >,
  ) => readonly [O_GlobalEvents<C, E, I, G, A>, D] | readonly [D] | D,
) {
  {
    const configOut = ark_m_config.MachineConfig(config)
    if (configOut instanceof type.errors) {
      throw new Error(`Invalid machine config: ${configOut.summary}`)
    }
  }
  const { guards, actions, services } = config
  const rawDefinition = defineStates({
    on,
    entryHook,
    exitHook,
    AttachJot,
    subStates,
    parallel,
    //invoke,
    guards: guards!,
    actions: actions!,
    services: services!,
  })

  const [stateDefDict, globalEvents]: [D, O_GlobalEvents<C, E, I, G, A> | undefined] = Array.isArray(rawDefinition)
    ? ([rawDefinition[rawDefinition.length - 1], rawDefinition[rawDefinition.length - 2]] as const)
    : ([rawDefinition, []] as const)

  const { initial, states } = transformNormalizedDefinition(stateDefDict, config.initialState)

  const stateCatalog = new Map<string, NormalizedStateItem>()
  o_setPPath(states, '', (stPath: string, state: NormalizedStateItem) => {
    stateCatalog.set(stPath, state)
  })
  o_validateTransition(stateCatalog)

  const {
    def: { events, builtinEvents },
  } = parseStDefItems(globalEvents || [], '(root)')
  return { definition: { initial, events, builtinEvents, states }, stateCatalog }
}

export function createMachine<
  C extends MContext,
  const E extends EventBody,
  const EM extends EmittedEvent,
  const I,
  const O,
  const G extends GuardRecord<C, E, I>,
  const A extends ActionRecord<C, E, I>,
  const S extends Record<string, (input: any) => unknown>,
  const D extends {
    [K in string]: StateDefinition<C, E, I, G, A, Jd[K], unknown, unknown, S>
  },
  Jd extends { [K in keyof D]: unknown },
>(
  config: Expand<MachineConfig<C, E, EM, I, O, G, A, S>>,
  defineStates: (
    define: Expand<
      T_DefineStatesParamPart & { guards: NonNullable<G>; actions: NonNullable<A>; services: NonNullable<S> }
    >,
  ) => D,
) {
  const { definition, stateCatalog } = getDefinitionAndCatalog<C, E, EM, I, O, G, A, S, D, Jd>(config, defineStates)

  const { name, initContext, output, guards, actions } = config

  const m: Machine<C, E, EM, I, O, G, A, typeof definition> = {
    [MachineSymbol]: true,
    name: name || '(machine)',
    initContext,
    output,
    guards,
    actions,
    definition,
    stateCatalog,
  }
  return deepFreeze(m)

  //const stateDefDict = defineStates({ on, AttachJot, subStates })
  //const normalizedStDefs = normalizeStateDefinition<C, E, I, keyof G & string, keyof A & string>()(stateDefDict)
  //return definition

  //return new Machine<C, E, EM, I, O, G, A, typeof definition>(config, definition, stateCatalog)

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
