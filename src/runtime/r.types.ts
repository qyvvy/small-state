import type {
  BuiltinEventBody,
  EmittedEvent,
  EventBody,
  InternalEPayload,
  Machine,
  AnyMachine,
  ServiceRecord,
  SystemEventBody,
} from '../machine/m.types'
import type { AnyFn, IsAny } from '../shared/general.types'
import type { Runtime, Snapshot } from './Runtime'

export type StateRoute = Array<string | { parallel: string; regions: { [key: string]: StateRoute }; output?: unknown }>

type Child<TService> =
  TService extends AnyMachine
  ? Runtime<TService>
  : TService extends AnyFn
  ? { stop: () => void }
  : never
export type Children<S extends ServiceRecord> = {
  [K in keyof S & string as K | `${K}:${string | number}`]?: Child<S[K]>
} & { [key: string]: Child<any> }
export type RuntimeOutbound<E extends EventBody, EM extends EmittedEvent, S extends ServiceRecord> = {
  id: string
  enqueueEvent: (event: E | BuiltinEventBody | SystemEventBody, payload?: InternalEPayload) => void
  emit: (emittedEvent: EM) => void
  children: Children<S>
}

export type InferredMachineTypes<M extends AnyMachine> =
  IsAny<M> extends true
  ? {
    C: any
    E: any
    I: any
    EM: any
    O: any
    G: any
    A: any
    S: any
    ND: any
    M: AnyMachine
  }
  : M extends Machine<infer C, infer E, infer I, infer EM, infer O, infer G, infer A, infer S, infer ND>
  ? { C: C; E: E; I: I; EM: EM; O: O; G: G; A: A; S: S; ND: ND; M: Machine<C, E, I, EM, O, G, A, S, ND> }
  : never

export type InferMInput<M extends AnyMachine> =
  M extends Machine<any, any, infer I, any, any, any, any, any, any> ? I : never

export type SnapshotFrom<RT extends Runtime<any>> =
  RT extends Runtime<any, infer Mt> ? Snapshot<Mt['C'], Mt['O'], Mt['S']> : never
