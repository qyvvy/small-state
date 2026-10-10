import type {
  EmittedEvent,
  EventBody,
  InternalEPayload,
  InternalEventBody,
  Machine,
  MContext,
  NormalizedDefinition,
  PureETypeString,
  ServiceOptions,
} from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Expand, Placeholder } from '../shared/general.types'
import { defineFixedProperty } from '../shared/utils'
import { MailBox } from './MailBox'
import type { RuntimeOutbound, StateRoute } from './r.types'
import { initRuntime, macrostep } from './runtime_step'
import { readyAction } from './runtime_step.core'
import { runtimeUtils } from './runtime_utils'

export type RuntimeStatus = 'stopped' | 'active' | 'done' | 'error'

type Snapshot<C extends MContext, O> = {
  states: string[]
  stateValue: string | string[] | undefined
  context: Expand<X_RemovePrivateKeys<C>>
  c: Expand<X_RemovePrivateKeys<C>>
  runtimeStatus: RuntimeStatus
  output: O | undefined
  _children: RuntimeOutbound<any>['children']
}

type Observer<C extends MContext, O> = (current: Expand<Snapshot<C, O>>, prev: Expand<Snapshot<C, O>>) => void

export type RuntimeOptions<I> = {
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
  S extends Record<string, (input: any, option: ServiceOptions) => unknown>,
  const ND extends NormalizedDefinition,
>(machine: Machine<C, E, I, EM, O, G, A, S, ND>, option?: RuntimeOptions<I>) {
  const runtime = new Runtime(machine, option)
  return runtime
}

export class Runtime<
  C extends MContext,
  E extends EventBody,
  I,
  EM extends EmittedEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any, option: ServiceOptions) => unknown>,
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
  #outbound: RuntimeOutbound<E> = {
    enqueueEvent: this.#enqueueEvent,
    children: {},
  }
  #emit = this.#_emit.bind(this)
  #observers = new Set<Observer<C, O>>()
  #emittedListeners: Map<string, Set<(emittedEvent: EM) => void>> = new Map()
  #snapshot = {} as Snapshot<C, O>
  #isStarted = false

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

  constructor(machine: Machine<C, E, I, EM, O, G, A, S, ND>, { id, input }: RuntimeOptions<I> = {}) {
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
    if (this.#isStarted) return this
    this.#isStarted = true
    this.#sentQueue.start()
    const INIT_EVENT = { type: ':init:' } as E

    const { context, hasTransitioned } = initRuntime(
      this.#realContext,
      this.#input,
      this.#crrStates,
      this.#machineInternal,
      this.#emit,
      this.#outbound,
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

  stop() {
    if (this.#snapshot.runtimeStatus !== 'active') return this

    this.#sentQueue.clear()
    // TODO: 終了処理を mailbox を介して行う
    {
      const children = { ...this.#outbound.children }
      for (const id in children) {
        children[id]!.stop()
        delete children[id]
      }
      this.#outbound.children = children
    }
    this.#buildAndSetSnapshot(this.#realContext, false, 'stopped')()
    this.#observers.clear()
    this.#emittedListeners.clear()

    return this
  }

  #processSentEvent<Ex extends E | InternalEventBody>(event: Ex, internalEPayload?: InternalEPayload) {
    const { guards, actions } = this.#machineInternal
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
      this.#outbound,
    )
    {
      const { context, crrStates, hasTransitioned } = result
      this.#crrStates = crrStates

      this.#buildAndSetSnapshot(context, hasTransitioned)(event as E)
    }
  }

  #_emit(emittedEvent: EM) {
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

  #buildAndSetSnapshot(
    newRealContext: C,
    hasTransitioned: boolean,
    runtimeStatus?: RuntimeStatus,
  ) {
    const oldSnapshot = this.#snapshot

    const crrStates = this.#crrStates
    const states = !hasTransitioned
      ? oldSnapshot.states
      : !crrStates.length
        ? []
        : makeStateList(this.#crrStates, 0, '')
    let { context } = oldSnapshot
    const contextUpdated = newRealContext !== this.#realContext
    if (contextUpdated) {
      this.#realContext = newRealContext
      context = Object.entries(newRealContext).reduce(
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
          return states.length <= 1 ? states[0] : states
        },
        context,
        c: context,
        runtimeStatus: isCompleted ? 'done' : runtimeStatus || oldSnapshot.runtimeStatus,
        output: !(isCompleted && output)
          ? undefined
          : output(runtimeUtils.makeFnBaseParam(newRealContext, event, this.#input)),
        _children: this.#outbound.children
      }

      {
        const snapshot = this.#snapshot
        for (const observer of this.#observers) {
          observer(snapshot, oldSnapshot)
        }
      }

      if (isCompleted) {
        this.#sentQueue.clear()
        this.#observers.clear()
        this.#emittedListeners.clear()
      }
    }
  }
}

function makeStateList(stateRoute: StateRoute, idx: number, parent: string) {
  if (idx >= stateRoute.length) return [parent]
  const el = stateRoute[idx]!
  if (typeof el === 'string') {
    return makeStateList(stateRoute, idx + 1, `${parent}${ST_DELIM}${el}`)
  }
  const { parallel, regions } = el
  const ret: string[] = []
  for (const key in regions) {
    ret.push(...makeStateList(regions[key]!, 0, `${parent}${ST_DELIM}${parallel}${ST_DELIM}${key}`))
  }
  return ret
}
