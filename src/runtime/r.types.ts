import type {
  AnyMachine,
  BuiltinSendableEvent,
  EmittableEvent,
  InternalEPayload,
  SendableEvent,
  ServiceRecord,
  SystemSendableEvent,
} from '../machine/m.types'
import type { AnyFn } from '../shared/general.types'
import type { Runtime, Snapshot } from './Runtime'

export type StateRoute = Array<string | { parallel: string; regions: { [key: string]: StateRoute }; output?: unknown }>

type Child<TService> = TService extends AnyMachine
  ? Runtime<TService>
  : TService extends AnyFn
  ? { stop: () => void, send: (event: SendableEvent) => void }
  : never
export type Children<S extends ServiceRecord> = {
  [K in keyof S & string as K | `${K}:${string | number}`]?: Child<S[K]>
} & { [key: string]: Child<any> }
export type RuntimeOutbound<E extends SendableEvent, EM extends EmittableEvent, S extends ServiceRecord> = {
  id: string
  enqueueEvent: (event: E | BuiltinSendableEvent | SystemSendableEvent, payload?: InternalEPayload) => void
  emit: (eventToEmit: EM) => void
  children: Children<S>
}

export type SnapshotFrom<R extends Runtime<any>> =
  R extends Runtime<infer M> ? Snapshot<M> : never
