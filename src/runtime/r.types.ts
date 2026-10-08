import type { EventBody, InternalEPayload, InternalEventBody } from '../machine/m.types'
import type { Runtime } from './Runtime';

export type StateRoute = Array<
  // biome-ignore lint/complexity/noBannedTypes: WeakRef の対象にするためにリテラル文字列ではなく文字列オブジェクトを使う
  | String
  | { parallel: string; regions: { [key: string]: StateRoute }; output?: unknown }
>

type Child = { stop: () => void } | Runtime<any, any, any, any, any, any, any, any, any>
export type RuntimeOutbound<E extends EventBody> = {
  enqueueEvent: (event: E | InternalEventBody, payload?: InternalEPayload) => void
  children: Record<string, Child>
}
