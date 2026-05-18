//import { Machine } from './Machine'

import { ST_DELIM } from '../shared/constants'
import { assertOrThrow, assertOrWarn, deepFreeze, ensureArray, randomString } from '../shared/utils'
import type { AnyFn, Expand, Fallback, OneOrMany } from './m.general.types'
import {
  type ActionFn,
  type ActionRecord,
  type BuiltinEType,
  type EmittedEvent,
  type EventBody,
  type ExtractEvent,
  type FnBase,
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
  type TypedActionFn,
  type TypedGuardFn,
} from './m.types'
import * as ark from './m_arktype'

type T_HiddenImpl = any & { __brand: 'HiddenImpl' }
type T_DefTypeRefluxer<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  J,
  Jp,
  S extends Record<string, (input: any) => unknown> = Record<string, (input: any) => unknown>,
  R = unknown,
> = () => R

type T_DefineStatesParamPart = {
  on: typeof on
  AttachJot: typeof AttachJot
  subStates: typeof subStates
  parallel: typeof parallel
  invoke: typeof invoke
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

interface BuiltinGuard<Gk extends string, C extends MContext, Ex extends EventBody, I, J> {
  (): boolean
  check: (snapshot: any) => boolean
}
export function and<C extends MContext, Ex extends EventBody, I, J, Gk extends string>(
  ...guards: Array<Gk | GuardFn<C, Ex, I, J>>
): BuiltinGuard<Gk, C, Ex, I, J> {
  const fn = () => false
  fn.check = (snapshot: any) =>
    //guards.every((g) => evaluateGuard(g, { c, context: c, e, event: e, input, jot }, snapshot))
    true
  return fn
}
export function or<C extends MContext, Ex extends EventBody, I, J, Gk extends string>(
  ...guards: Array<Gk | GuardFn<C, Ex, I, J>>
): BuiltinGuard<Gk, C, Ex, I, J> {
  const fn = () => false
  fn.check = (snapshot: any) =>
    //guards.some((g) => evaluateGuard(g, { c, context: c, e, event: e, input, jot }, snapshot))
    true
  return fn
}

type Assignment<C extends MContext, Ex extends EventBody, I, J> =
  { [P in keyof C]?: C[P] | FnBase<C[P], C, Ex, I, J> }
type AssignmentFn<C extends MContext, Ex extends EventBody, I, J> =
  FnBase<Partial<C>, C, Ex, I, J>

export function assign<C extends MContext, Ex extends EventBody, I, J>(
  assignment: Assignment<NoInfer<C>, Ex, I, J>
): ActionFn<C, Ex, I, J>
export function assign<C extends MContext, Ex extends EventBody, I, J>(
  fn: AssignmentFn<NoInfer<C>, Ex, I, J>
): ActionFn<C, Ex, I, J>
export function assign<C extends MContext, Ex extends EventBody, I, J>(
  arg?: FnBase<Partial<C>, C, Ex, I, J> | { [P in keyof C]?: C[P] | FnBase<C[P], C, Ex, I, J> },
): ActionFn<C, Ex, I, J> {
  switch (typeof arg) {
    case 'function':
      return (param: FnBaseParams<C, Ex, I, J>[0]) => {
        // TODO
        const newCtxPartial = arg(param)
      }
    case 'object':
      return (param: FnBaseParams<C, Ex, I, J>[0]) => {
        // TODO
        //arg
      }
    default:
      return (param: FnBaseParams<C, Ex, I, J>[0]) => { }
  }
}

const getNormalizedStDefTemplate = (): {
  def: NormalizedStItemDef<any, string>
  sub: null | typeof ark.SubStNormalizedDefinition.infer
} => ({
  def: {
    pPath: '',
    final: false,
    deriveJot: null,
    tags: new Set(),
    entry: null,
    exit: null,
    invocations: [],
    builtinEvents: {},
    events: {},
  },
  sub: null,
})

type StDefMetaEntry<in out C extends MContext, in out E extends EventBody, in out I, J> = {
  tags?: string[]
  entry?: OneOrMany<ActionFn<C, E, I, J>>
  exit?: OneOrMany<ActionFn<C, E, I, J>>
  final?: boolean
  //always?: OneOrMany<Transition<C, E, I, Gk, Ak, J>>
  //delays?: OneOrMany<Delay<C, E, I, Gk, Ak, J>>
}

type StDefEntries<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  J,
  Jp,
  S extends Record<string, (input: any) => unknown>,
  Et extends E['type'] | BuiltinEType = E['type'] | BuiltinEType,
> = Array<
  | StDefMetaEntry<C, E, I, J>
  | readonly [Et, T_DefTypeRefluxer<C, E, I, Gk, Ak, J, unknown>, T_HiddenImpl] // on
  | readonly [T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S, any>, unknown] // subStates|parallel
  // NOTE: NormalizedDefinition でなく unknown にしないと ExtractEType が上手く働かない
  | readonly [InvokeSymbol, T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S>, unknown, unknown]
>

type RegionStDefEntry<C extends MContext, E extends EventBody, I, Gk extends string, Ak extends string, J> =
  | StDefMetaEntry<C, E, I, J>
  | readonly [E['type'] | BuiltinEType, T_DefTypeRefluxer<C, E, I, Gk, Ak, J, unknown>, T_HiddenImpl] // on

type StateDefinition<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  Je,
  J,
  Jp,
  S extends Record<string, (input: any) => unknown>,
> =
  | null
  | StDefEntries<C, E, I, Gk, Ak, J, Jp, S> // on, subStates, parallel
  | readonly [JotSymbol, Je, StDefEntries<C, E, I, Gk, Ak, any, Jp, S>] // AttachJot

function AttachJot<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  S extends Record<string, (input: any) => unknown>,
  Jp,
  J,
  const Et extends E['type'] | BuiltinEType,
  const Sub,
>(
  jot: J | ((arg: JotParams<C, E, I, Jp>) => J | Promise<J>), // NOTE: jotに関数を指定した場合、引数の型を明示しないと jot が any 扱いされる問題がある
  stateDefEntries: Array<
    | StDefMetaEntry<C, E, I, J>
    | readonly [Et, T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp>, T_HiddenImpl] // on
    | readonly [T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S, any>, Sub] // subStates|parallel
    | readonly [InvokeSymbol, T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S>, unknown, unknown]
  >,
  // NOTE: StDefEntries でなく展開して Et と Sub をジェネリクス化しておかないと上から参照できない
  // NOTE: AttachJot が絡むとタプル内部の型でなく要素数で判別しているようなので invoke の要素数は 4 でなければならない
) {
  return [JotSymbol, jot, stateDefEntries] as const // StateDefinition
}

function on<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  Et extends E['type'] | BuiltinEType,
  J,
>(eventType: Et, config: OneOrMany<Expand<Transition<C, ExtractEvent<E, Et>, I, Gk, Ak, J>>>) {
  return [
    eventType as Et,
    (() => null) as T_DefTypeRefluxer<C, E, I, Gk, Ak, J, unknown>,
    config as T_HiddenImpl,
  ] as const // StDefEntries, AttachJot
}

function subStates<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const D extends { [K in string]: StateDefinition<C, E, I, Gk, Ak, Jd[K], J, Jp, S> },
  Jd extends { [K in keyof D]: unknown },
>(
  stateDefinition: D,
): readonly [
  T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S, SubStatesSymbol>,
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
  Gk extends string,
  Ak extends string,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const D extends { [K in string]: StateDefinition<C, E, I, Gk, Ak, Jd[K], J, Jp, S> },
  Jd extends { [K in keyof D]: unknown },
  const Initial extends keyof D & string,
>(
  initialState: Initial,
  stateDefinition: D,
): readonly [
  T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S, SubStatesSymbol>,
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
function subStates<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const D extends { [K in string]: StateDefinition<C, E, I, Gk, Ak, Jd[K], J, Jp, S> },
  Jd extends { [K in keyof D]: unknown },
  const Arg1 extends D | (keyof D & string),
>(arg1: Arg1, arg2?: D) {
  const [stateDefinition, initialState] = (() => {
    if (arg2) return [arg2, arg1 as string]
    const d = arg1 as D
    return [d, Object.keys(d)?.[0]]
  })()
  return [
    (() => SubStatesSymbol) as T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S, SubStatesSymbol>,
    transformNormalizedDefinition<C, E, I, Gk, Ak>()(stateDefinition, initialState) as {
      initial: Arg1 extends keyof D ? Arg1 : keyof D
      states: {
        [K in keyof D]: {
          def: NormalizedStItemDef<ExtractJot<D[K]>, ExtractEType<D[K]>>
          sub: ExtractSubStDefinition<D[K]>
        }
      }
    },
  ] as const // StDefEntries, AttachJot
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
  Gk extends string,
  Ak extends string,
  S extends Record<string, (input: any) => unknown>,
  J,
  Jp,
  const PD extends {
    [K in string]:
    | [{ [L in string]: StateDefinition<C, E, I, Gk, Ak, Jd[K][L], J, Jp, S> }]
    | [
      Array<RegionStDefEntry<C, E, I, Gk, Ak, J>>,
      { [L in string]: StateDefinition<C, E, I, Gk, Ak, Jd[K][L], J, Jp, S> },
    ]
    | []
  },
  Jd extends { [K in keyof PD]: { [L in keyof O_InnerDict<PD[K]>]: unknown } },
>(parallelDefinition: PD) {
  return [
    (() => ParallelSymbol) as T_DefTypeRefluxer<C, E, I, Gk, Ak, J, Jp, S, ParallelSymbol>,
    transformParallelNormalizedDefinition<C, E, I, Gk, Ak, J>()(parallelDefinition) as {
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
  ] as const // StDefEntries, AttachJot
}

type O_IntoServiceFn<Src, S extends Record<string, unknown>> = Src extends AnyFn
  ? Src
  : Src extends keyof S
  ? S[Src]
  : never
function invoke<
  C extends MContext,
  E extends EventBody,
  I,
  Gk extends string,
  Ak extends string,
  S extends Record<string, (input: any) => unknown>,
  J,
  Src extends ((input: any) => unknown) | keyof S,
>(
  preparation: { id?: string; input?: FnBase<Parameters<O_IntoServiceFn<Src, S>>[0], C, E, I, J> },
  src: Src,
  completion?: {
    done: Transition<C, { type: 'done'; data: Awaited<ReturnType<O_IntoServiceFn<Src, S>>> }, I, Gk, Ak, J>
    error?: Transition<C, { type: 'error'; error: Error }, I, Gk, Ak, J>
  },
) {
  return [
    InvokeSymbol,
    (() => null) as T_DefTypeRefluxer<C, E, I, Gk, Ak, J, unknown, S>,
    { src, ...preparation, ...completion } as T_HiddenImpl,
    null,
  ] as const // StDefEntries, AttachJot
}

type Actions<Ak extends string, C extends MContext, Ex extends EventBody, I, J> = OneOrMany<Ak | ActionFn<C, Ex, I, J>>
type Guards<Gk extends string, C extends MContext, Ex extends EventBody, I, J> = OneOrMany<
  Gk | GuardFn<C, Ex, I, J> | TypedGuardFn<C, Ex, I> | BuiltinGuard<Gk, C, Ex, I, J>
>
type Transition<C extends MContext, Ex extends EventBody, I, Gk extends string, Ak extends string, J> = {
  to?: StateName
  guard?: Guards<Gk, C, Ex, I, J>
  actions?: Actions<Ak, C, Ex, I, J>
}
type Delay<C extends MContext, E extends EventBody, I, Gk extends string, Ak extends string, J> = Expand<
  { after: number } & Transition<C, E, I, Gk, Ak, J>
>

function o_normalizeTransitions(transitions: Transition<any, any, any, any, any, any>[]) {
  return transitions.map(({ actions, guard, ...rest }) => ({
    actions: ensureArray(actions),
    guards: ensureArray(guard),
    ...rest,
  }))
}

function parseStDefEntries(entries: typeof ark.StDefEntries.infer, stateName: string) {
  let { def, sub } = getNormalizedStDefTemplate()
  if (!entries?.length) {
    def.final = !entries
    return { def, sub }
  }

  for (const [i, entry] of entries.entries()) {
    if (!Array.isArray(entry)) {
      if ('tags' in entry) {
        def.tags = new Set(entry.tags)
      }
      if ('entry' in entry) {
        def.entry = ensureArray(entry.entry)
      }
      if ('exit' in entry) {
        def.exit = ensureArray(entry.exit)
      }
      if ('final' in entry) {
        def.final = !!entry.final
      }
      continue
    }

    switch (typeof entry?.[0]) {
      case 'string': {
        // on(...)
        const [eType, _, transitions] = entry
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
        const subStDict = entry[1] as Exclude<(typeof entry)[1], (...args: any[]) => unknown>
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
        switch (entry[0]) {
          case InvokeSymbol: {
            const { done, error, ...rest } = entry[2]
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
        throw new Error(`unexpected array[0] type: ${JSON.stringify(entry?.[0])}`)
    }
  }
  return { def, sub }
}

function normalizeStates<
  C extends MContext,
  const E extends EventBody,
  const I,
  const Gk extends string,
  const Ak extends string,
  const D extends { [K in string]: StateDefinition<C, E, I, Gk, Ak, any, any, any, any> },
>(stateDefOf: D) {
  return Object.entries(stateDefOf).reduce(
    (acc, [stateName, stDefs]: [keyof D & string, unknown]) => {
      if (stateName.includes('/')) {
        throw new Error(`State names cannot contain the character "/": "${stateName}"`)
      } else if (Array.isArray(stDefs) || stDefs == null) {
        const [_, jot, entries] =
          stDefs?.[0] === JotSymbol ? ark.JotAttached.assert(stDefs) : [false, null, ark.StDefEntries.assert(stDefs)]
        const { def, sub } = parseStDefEntries(entries, stateName)
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
  C extends MContext,
  const E extends EventBody,
  const I,
  const Gk extends string,
  const Ak extends string,
>() {
  return <
    const D extends Record<string, StateDefinition<C, E, I, Gk, Ak, any, any, any, any>>,
    const Initial extends string | undefined,
  >(
    stateDefOf: D,
    initialState: Initial,
  ) => {
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
      states: normalizeStates<C, E, I, Gk, Ak, D>(stateDefOf),
    }
  }
}
function transformParallelNormalizedDefinition<
  C extends MContext,
  const E extends EventBody,
  const I,
  const Gk extends string,
  const Ak extends string,
  J,
>() {
  return <
    const PD extends {
      [K in string]:
      | [{ [L in string]: StateDefinition<C, E, I, Gk, Ak, any, any, any, any> }]
      | [
        Array<RegionStDefEntry<C, E, I, Gk, Ak, J>>,
        { [L in string]: StateDefinition<C, E, I, Gk, Ak, any, any, any, any> },
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
        const [leafDefOf = {}, regionStDefEntries]: [
          Record<string, StateDefinition<C, E, I, Gk, Ak, any, any, any, any>>,
          Array<RegionStDefEntry<C, E, I, Gk, Ak, J>> | undefined,
        ] = [rawDefinition[rawDefinition.length - 1], rawDefinition[rawDefinition.length - 2]] as any

        const { def } = parseStDefEntries(regionStDefEntries || [], regionName)
        return [
          regionName,
          {
            def,
            sub: transformNormalizedDefinition<C, E, I, Gk, Ak>()(leafDefOf, undefined),
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

type O_GlobalEvents<C extends MContext, E extends EventBody, I, Gk extends string, Ak extends string> = Array<
  readonly [E['type'] | BuiltinEType, T_DefTypeRefluxer<C, E, I, Gk, Ak, undefined, undefined>, T_HiddenImpl]
>
function getDefinitionAndCatalog<
  C extends MContext,
  const E extends EventBody,
  const EM extends EmittedEvent,
  const I,
  const O,
  const G extends GuardRecord<C, E, I>,
  const A extends ActionRecord<C, E, I>,
  const S extends Record<string, (input: any) => unknown>,
  const D extends { [K in string]: StateDefinition<C, E, I, Gk, Ak, Jd[K], unknown, unknown, S> },
  Jd extends { [K in keyof D]: unknown },
  Gk extends keyof G & string = keyof G & string,
  Ak extends keyof A & string = keyof A & string,
>(
  config: MachineConfig<C, E, EM, I, O, G, A, S>,
  defineStates: (
    define: Expand<
      T_DefineStatesParamPart & { guards: NonNullable<G>; actions: NonNullable<A>; services: NonNullable<S> }
    >,
  ) => readonly [O_GlobalEvents<C, E, I, Gk, Ak>, D] | readonly [D] | D,
) {
  const { guards, actions, services } = config
  const rawDefinition = defineStates({
    on,
    AttachJot,
    subStates,
    parallel,
    invoke,
    guards: guards!,
    actions: actions!,
    services: services!,
  })

  const [stateDefDict, globalEvents]: [D, O_GlobalEvents<C, E, I, Gk, Ak> | undefined] = Array.isArray(rawDefinition)
    ? ([rawDefinition[rawDefinition.length - 1], rawDefinition[rawDefinition.length - 2]] as const)
    : ([rawDefinition, []] as const)

  const { initial, states } = transformNormalizedDefinition<C, E, I, keyof G & string, keyof A & string>()(
    stateDefDict,
    config.initialState,
  )

  const stateCatalog = new Map<string, NormalizedStateItem>()
  o_setPPath(states, '', (stPath: string, state: NormalizedStateItem) => {
    stateCatalog.set(stPath, state)
  })
  o_validateTransition(stateCatalog)

  const {
    def: { events, builtinEvents },
  } = parseStDefEntries(globalEvents || [], '(root)')
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
    [K in string]: StateDefinition<C, E, I, keyof G & string, keyof A & string, Jd[K], unknown, unknown, S>
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
