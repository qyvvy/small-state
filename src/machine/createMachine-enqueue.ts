import type { Placeholder } from '../shared/general.types'
import type {
  EventBody,
  FnBaseParams,
  MContext,
  ParamsArgOf,
} from './m.types'


export type EnqueueActions<
  C extends MContext,
  Ex extends EventBody,
  I,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = (
  arg: FnBaseParams<
    C,
    Ex,
    I,
    { check: Check<C, Ex, I, G>; enqueue: Enqueue<C, Ex, I, A>; update: typeof enqueueUpdate<C, Ex, I, A> }
  >[0],
) => unknown

type Check<C extends MContext, Ex extends EventBody, I, G extends Record<string, Placeholder>> = <
  Gk extends keyof G | never,
>(
  type: Gk,
  ...args: ParamsArgOf<G, Gk, C, Ex, I>
) => boolean

type Enqueue<C extends MContext, Ex extends EventBody, I, A extends Record<string, Placeholder>> = {
  update: typeof enqueueUpdate<C, Ex, I, A>
  <Ak extends keyof A | never>(
    type: Ak,
    ...args: ParamsArgOf<A, Ak, C, Ex, I>
  ): { enqueue: Enqueue<C, Ex, I, A>; update: typeof enqueueUpdate<C, Ex, I, A> }
  (
    fn: (...args: FnBaseParams<C, Ex, I, { update: typeof enqueueUpdate<C, Ex, I, A> }>) => unknown,
  ): { enqueue: Enqueue<C, Ex, I, A>; update: typeof enqueueUpdate<C, Ex, I, A> }
}

function enqueueUpdate<C extends MContext, Ex extends EventBody, I, A extends Record<string, Placeholder>>(
  updates: {
    [K in keyof C]?: C[K] | Promise<C[K]> | (() => C[K] | Promise<C[K]>)
  },
): { enqueue: Enqueue<C, Ex, I, A>; update: typeof enqueueUpdate<C, Ex, I, A> } {
  return null as unknown as { enqueue: Enqueue<C, Ex, I, A>; update: typeof enqueueUpdate<C, Ex, I, A> }
}
