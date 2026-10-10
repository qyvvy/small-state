import type { EventBody, InternalEPayload, InternalEventBody, Machine } from '../machine/m.types'
import type { IsAny } from '../shared/general.types';
import type { Runtime } from './Runtime'

export type StateRoute = Array<string | { parallel: string; regions: { [key: string]: StateRoute }; output?: unknown }>

type Child = { stop: () => void } | Runtime<any>
export type RuntimeOutbound<E extends EventBody> = {
  enqueueEvent: (event: E | InternalEventBody, payload?: InternalEPayload) => void
  children: Record<string, Child>
}

export type InferredMachineTypes<M extends Machine<any, any, any, any, any, any, any, any, any>> =
  IsAny<M> extends true
  ? { C: any, E: any, I: any, EM: any, O: any, G: any, A: any, S: any, ND: any, M: Machine<any, any, any, any, any, any, any, any, any> }
  : M extends Machine<infer C, infer E, infer I, infer EM, infer O, infer G, infer A, infer S, infer ND>
  ? { C: C, E: E, I: I, EM: EM, O: O, G: G, A: A, S: S, ND: ND, M: Machine<C, E, I, EM, O, G, A, S, ND> }
  : never

export type InputFromMachine<M extends Machine<any, any, any, any, any, any, any, any, any>> =
  M extends Machine<any, any, infer I, any, any, any, any, any, any> ? I : never
