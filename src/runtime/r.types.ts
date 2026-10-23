import type { EmittedEvent, EventBody, InternalEPayload, InternalEventBody, Machine, ServiceRecord } from '../machine/m.types'
import type { AnyFn, IsAny } from '../shared/general.types';
import type { Runtime } from './Runtime'

export type StateRoute = Array<string | { parallel: string; regions: { [key: string]: StateRoute }; output?: unknown }>

type Child<TService> = TService extends Machine<any, any, any, any, any, any, any, any, any> ? Runtime<TService> : TService extends AnyFn ? { stop: () => void } : never
export type Children<S extends ServiceRecord> = {
  [K in keyof S & string as K | `${K}:${string | number}`]?: Child<S[K]>
} & { [key: string]: Child<any> }
export type RuntimeOutbound<E extends EventBody, EM extends EmittedEvent, S extends ServiceRecord> = {
  enqueueEvent: (event: E | InternalEventBody, payload?: InternalEPayload) => void
  emit: (emittedEvent: EM) => void
  children: Children<S>
}

export type InferredMachineTypes<M extends Machine<any, any, any, any, any, any, any, any, any>> =
  IsAny<M> extends true
  ? { C: any, E: any, I: any, EM: any, O: any, G: any, A: any, S: any, ND: any, M: Machine<any, any, any, any, any, any, any, any, any> }
  : M extends Machine<infer C, infer E, infer I, infer EM, infer O, infer G, infer A, infer S, infer ND>
  ? { C: C, E: E, I: I, EM: EM, O: O, G: G, A: A, S: S, ND: ND, M: Machine<C, E, I, EM, O, G, A, S, ND> }
  : never

export type InputFromMachine<M extends Machine<any, any, any, any, any, any, any, any, any>> =
  M extends Machine<any, any, infer I, any, any, any, any, any, any> ? I : never
