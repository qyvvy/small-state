import type {
  EmittedEvent,
  EventBody,
  InternalEPayload,
  InternalEventBody,
  Machine,
  MContext,
  NormalizedDefinition,
  PureETypeString,
} from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Placeholder } from '../shared/general.types'
import { defineFixedProperty } from '../shared/utils'
import { MailBox } from './MailBox'
import type { StateRoute } from './r.types'
import { initRuntime, macrostep } from './runtime_step'
import { readyAction } from './runtime_step.core'
import { runtimeUtils } from './runtime_utils'

export type RuntimeStatus = 'stopped' | 'active' | 'done' | 'error'

type Observer<C extends MContext, O> = (current: Snapshot<C, O>, prev: Snapshot<C, O>) => void
type Snapshot<C extends MContext, O> = {
  states: string[]
  stateValue: string | string[]
  context: X_RemovePrivateKeys<C>
  runtimeStatus: RuntimeStatus
  output: O | undefined
}
type RuntimeOption<I> = {
  id?: string
  input?: () => I
}

type X_RemovePrivateKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K]
}

export function createRuntime<
  C extends MContext,
  E extends EventBody,
  I,
  const EM extends EmittedEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  const ND extends NormalizedDefinition,
>(machine: Machine<C, E, I, EM, O, G, A, S, ND>, option?: RuntimeOption<I>) {
  const runtime = new Runtime(machine, option)
  return runtime
}

class Runtime<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  const ND extends NormalizedDefinition,
> {
  readonly id!: string
  readonly machine!: Machine<C, E, I, EM, O, G, A, S, ND>
  readonly #machineInternal!: Machine<C, E, I, EM, O, G, A, S, ND>['internal']
  readonly #input!: I
  #realContext!: C
  #crrStates: StateRoute = []
  #sentQueue: MailBox<E | InternalEventBody, InternalEPayload> = new MailBox(this.#processSentEvent.bind(this))
  #enqueueEvent = this.#sentQueue.enqueue.bind(this.#sentQueue)
  #observers = new Set<Observer<C, O>>()
  #emittedListeners: Map<string, Set<(emittedEvent: EM) => void>> = new Map()
  #snapshot: Snapshot<C, O> = { states: [], runtimeStatus: 'stopped' } as any

  get states() {
    return this.#snapshot.states
  }
  get stateValue() {
    return this.#snapshot.stateValue
  }
  get context() {
    return this.#snapshot.context
  }
  get runtimeStatus() {
    return this.#snapshot.runtimeStatus
  }

  constructor(machine: Machine<C, E, I, EM, O, G, A, S, ND>, { id, input }: RuntimeOption<I> = {}) {
    defineFixedProperty(this, 'id', id || `${machine.name}-${String(Date.now() % 10000000000).padStart(10, '0')}`, {
      enumerable: true,
    })
    defineFixedProperty(this, 'machine', machine, { enumerable: true })
    this.#machineInternal = machine.internal
    this.#input = input?.() as I

    const { initContext } = machine.internal
    const context = initContext ? initContext(this.#input) : (undefined as any as C)
    this.#buildAndSetSnapshot(context, true, 'stopped')()
  }

  subscribe(observer: Observer<C, O>) {
    this.#observers.add(observer)
    return () => this.#observers.delete(observer)
  }

  start() {
    this.#sentQueue.start()
    const INIT_EVENT = { type: ':init:' } as E

    const { context, hasTransitioned } = initRuntime(
      this.#realContext,
      this.#input,
      this.#emit,
      this.#crrStates,
      this.#machineInternal,
      this.#enqueueEvent,
    )

    this.#buildAndSetSnapshot(context, hasTransitioned, 'active')(INIT_EVENT)
    return this
  }

  send(event: E | PureETypeString<E>) {
    const eventObj = (typeof event === 'string' ? { type: event } : event) as E
    this.#enqueueEvent(eventObj)
    return this
  }

  on(emittedEventType: EM['type'], handler: (emittedEvent: EM) => void) {
    let listeners = this.#emittedListeners.get(emittedEventType)
    if (!listeners) {
      listeners = new Set()
      this.#emittedListeners.set(emittedEventType, listeners)
    }
    const handlerWrapper = (emittedEvent: EM) => handler(emittedEvent)
    listeners.add(handlerWrapper)
    return {
      unsubscribe: () => {
        listeners.delete(handlerWrapper)
      },
    }
  }

  getSnapshot() {
    return this.#snapshot
  }

  #processSentEvent<Ex extends E | InternalEventBody>(event: Ex, internalEPayload?: InternalEPayload) {
    const { guards, actions, topLvDefItem } = this.#machineInternal
    const actionRunner = readyAction<C, E, I, EM, G, A, Ex>(
      this.#realContext,
      event,
      this.#input,
      guards,
      actions,
      this.#emit,
    )

    const result = macrostep(
      event.type,
      internalEPayload,
      this.#crrStates,
      actionRunner,
      this.#machineInternal,
      this.#enqueueEvent,
      topLvDefItem,
    )
    {
      const { context, crrStates, hasTransitioned } = result
      this.#crrStates = crrStates

      this.#buildAndSetSnapshot(context, hasTransitioned)(event as E)
    }
  }

  #emit(emittedEvent: EM) {
    const listeners = this.#emittedListeners.get(emittedEvent.type)
    if (!listeners) {
      return
    }
    for (const handler of listeners) {
      try {
        handler(emittedEvent)
      } catch (err) {
        // TODO: error handling
      }
    }
  }

  #buildAndSetSnapshot(realContext: C, hasTransitioned: boolean, runtimeStatus?: RuntimeStatus) {
    const oldSnapshot = this.#snapshot

    const crrStates = this.#crrStates
    const states = !hasTransitioned ? oldSnapshot.states : !crrStates.length ? [] : makeStateList(this.#crrStates, 0, '')
    let { context } = oldSnapshot
    const contextUpdated = realContext !== this.#realContext
    if (contextUpdated) {
      this.#realContext = realContext
      context = Object.entries(realContext).reduce(
        (acc, [k, v]) => {
          if (!k.startsWith('_')) {
            acc[k as keyof X_RemovePrivateKeys<C>] = v
          }
          return acc
        },
        {} as X_RemovePrivateKeys<C>,
      )
    }

    return (event: E = {} as E) => {
      if (!(hasTransitioned || contextUpdated || runtimeStatus)) {
        return
      }
      const { stateCatalog, output } = this.machine.internal
      const isCompleted = !states.length ? false : states.every((stPath) => stateCatalog.get(stPath)?.def.final)

      this.#snapshot = {
        states,
        get stateValue() {
          return states.length === 1 ? states[0]! : states
        },
        context,
        runtimeStatus: isCompleted ? 'done' : runtimeStatus || oldSnapshot.runtimeStatus,
        output: !(isCompleted && output)
          ? undefined
          : output(runtimeUtils.makeFnBaseParam(realContext, event, this.#input)),
      }

      {
        const snapshot = this.#snapshot
        for (const observer of this.#observers) {
          observer(snapshot, oldSnapshot)
        }
      }

      if (isCompleted) {
        this.#sentQueue.clear()
        this.#onComplete()
      }
    }
  }

  #onComplete() {
    this.#observers.clear()
    this.#emittedListeners.clear()
  }
}


function makeStateList(stateRoute: StateRoute, idx: number, parent: string) {
  if (idx >= stateRoute.length) return [parent]
  const el = stateRoute[idx]!
  if (!('parallel' in el)) {
    return makeStateList(stateRoute, idx + 1, `${parent}${ST_DELIM}${el}`)
  }
  const { parallel, regions } = el
  const ret: string[] = []
  for (const key in regions) {
    ret.push(...makeStateList(regions[key]!, 0, `${parent}${ST_DELIM}${parallel}${ST_DELIM}${key}`))
  }
  return ret
}
