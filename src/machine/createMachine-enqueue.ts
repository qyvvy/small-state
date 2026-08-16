import type { Placeholder } from '../shared/general.types'
import type {
  UpdateFn,
  UpdateFnParam,
  EmittedEvent,
  EventBody,
  FnBaseParams,
  MContext,
  ParamsArgOf,
} from './m.types'


export type EnqueueActions<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
> = (
  arg: FnBaseParams<
    C,
    Ex,
    I,
    {
      check: CheckFn<C, Ex, I, G>
      enqueue: EnqueueFn<C, Ex, I, EM, A>
      update: UpdateFn<C>
      emit: (emittedEvent: EM) => unknown
    }
  >[0],
) => unknown

export type CheckFn<
  C extends MContext, Ex extends EventBody, I, G extends Record<string, Placeholder>
> = < Gk extends keyof G & string | never >(type: Gk, ...args: ParamsArgOf<G, Gk, C, Ex, I>) => boolean
//export type check<Gk extends (keyof G & string) | never>(type: Gk, ...args: ParamsArgOf<G, Gk, C, Ex, I>): boolean

export type EnqueueFn<
  C extends MContext, Ex extends EventBody, I, EM extends EmittedEvent, A extends Record<string, Placeholder>
> = {
  //update: typeof enqueueUpdate<C, Ex, I, EM, A>
  //update: UpdateFn<C>
  <Ak extends keyof A | never>(
    type: Ak,
    ...args: ParamsArgOf<A, Ak, C, Ex, I>
  ): void
  (
    fn: (...args: FnBaseParams<C, Ex, I, {
      emit: (emittedEvent: EM) => unknown
      update: typeof enqueueUpdate<C, Ex, I, EM, A>
    }>) => unknown,
  ): void
}


type EnqueueUpdateFn<
  C extends MContext, Ex extends EventBody, I, EM extends EmittedEvent, A extends Record<string, Placeholder>
> = (updates: UpdateFnParam<C>) => {
  enqueue: EnqueueFn<C, Ex, I, EM, A>;
  update: typeof enqueueUpdate<C, Ex, I, EM, A>;
}

function enqueueUpdate<
  C extends MContext,
  Ex extends EventBody,
  I,
  EM extends EmittedEvent,
  A extends Record<string, Placeholder>
>(updates: UpdateFnParam<C>): { enqueue: EnqueueFn<C, Ex, I, EM, A>; update: typeof enqueueUpdate<C, Ex, I, EM, A> } {
  return null as unknown as { enqueue: EnqueueFn<C, Ex, I, EM, A>; update: typeof enqueueUpdate<C, Ex, I, EM, A> }
}
