import type {
  AnyMachine,
  BuiltinSendableEvent,
  DoneEBody,
  InternalEPayload,
  Machine,
  SendFnEvent,
  SystemSendableEvent,
} from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Expand } from '../shared/general.types'
import { defineFixedProperty, reportUnhandledError } from '../shared/utils'
import { MailBox } from './MailBox'
import type { Children, RuntimeOutbound, StateRoute } from './r.types'
import { initRuntime, macrostep } from './runtime_step'
import { readyAction } from './runtime_step.core'
import { runtimeUtils } from './runtime_utils'

export type RuntimeStatus = 'notStarted' | 'active' | 'stopped' | 'done' | 'error'

type C<M extends AnyMachine> = M extends Machine<infer C, any, any, any, any, any, any, any, any> ? C : never
type E<M extends AnyMachine> = M extends Machine<any, infer E, any, any, any, any, any, any, any> ? E : never
type I<M extends AnyMachine> = M extends Machine<any, any, infer I, any, any, any, any, any, any> ? I : never
type EM<M extends AnyMachine> = M extends Machine<any, any, any, infer EM, any, any, any, any, any> ? EM : never
type O<M extends AnyMachine> = M extends Machine<any, any, any, any, infer O, any, any, any, any> ? O : never
type G<M extends AnyMachine> = M extends Machine<any, any, any, any, any, infer G, any, any, any> ? G : never
type A<M extends AnyMachine> = M extends Machine<any, any, any, any, any, any, infer A, any, any> ? A : never
type S<M extends AnyMachine> = M extends Machine<any, any, any, any, any, any, any, infer S, any> ? S : never

type X_RemovePrivateKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K]
}

export type Snapshot<M extends AnyMachine> = {
  runtimeId: string
  states: string[]
  stateValue: string | string[] | undefined
  context: Expand<X_RemovePrivateKeys<C<M>>>
  c: Expand<X_RemovePrivateKeys<C<M>>>
  runtimeStatus: RuntimeStatus
  output: O<M> | undefined
  error: unknown
  _children: Children<S<M>>
  _runtime: Runtime<M>
}

type Subscriber<M extends AnyMachine> = {
  onSnapshot?: (current: Expand<Snapshot<M>>, prev: Expand<Snapshot<M>>) => void
  onError?: (err: unknown) => void
}

export function isRuntime(v: unknown): v is Runtime<AnyMachine> {
  return v instanceof Runtime
}

export type RuntimeOptions<M extends AnyMachine> = {
  id?: string
  input?: () => I<M>
}

export function makeRuntime<M extends AnyMachine>(machine: M, options?: RuntimeOptions<M>) {
  const runtime = new Runtime(machine, options)
  return runtime
}

const STOP_EVENT = { type: 'system/stop' as const }

let idCounter = 0
export class Runtime<M extends AnyMachine> {
  readonly id!: string
  readonly machine!: M
  readonly #machineInternal!: M['internal']
  readonly #input!: I<M>
  #realContext!: Readonly<C<M>>
  #crrStates: StateRoute = []
  #sentQueue: MailBox<E<M> | BuiltinSendableEvent | SystemSendableEvent, InternalEPayload> = new MailBox(this.#processSentEvent.bind(this))
  #enqueueEvent = this.#sentQueue.enqueue.bind(this.#sentQueue)
  #outbound: RuntimeOutbound<E<M>, EM<M>, S<M>> = {
    id: '',
    enqueueEvent: this.#enqueueEvent,
    emit: this.#_emit.bind(this),
    children: {},
  }
  #subscribers = new Set<Subscriber<M>>()
  #emittedListeners: Map<string, Set<(emittedEvent: EM<M>) => void>> = new Map()
  #snapshot = {} as Snapshot<M>

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
  get output() {
    return this.#snapshot.output
  }
  getSnapshot() {
    return this.#snapshot
  }

  constructor(machine: M, { id, input }: RuntimeOptions<I<M>> = {}) {
    defineFixedProperty(this, 'id', id || `${machine.name}:${idCounter++}`, {
      enumerable: true,
    })
    defineFixedProperty(this, 'machine', machine, { enumerable: true })
    this.#machineInternal = machine.internal
    this.#input = input?.() as I<M>
    this.#outbound.id = this.id

    const { initContext } = machine.internal
    const context = initContext ? initContext(this.#input) : (null as any as C<M>)
    this.#buildAndSetSnapshot(context, true, 'notStarted')()
  }

  subscribe(
    onSnapshot: Subscriber<M>['onSnapshot'],
    onError?: Subscriber<M>['onError'],
  ) {
    const subscriber = { onSnapshot, onError }
    this.#subscribers.add(subscriber)
    return () => {
      this.#subscribers.delete(subscriber)
    }
  }

  start() {
    if (this.runtimeStatus !== 'notStarted') return this

    const result = (() => {
      try {
        return initRuntime(this.#realContext, this.#input, this.#crrStates, this.#machineInternal, this.#outbound)
      } catch (err) {
        this.#handleError(err)
      }
    })()
    if (!result) return this

    const { context, hasTransitioned, doneEvent } = result
    this.#buildAndSetSnapshot(context, hasTransitioned, 'active')(doneEvent)
    this.#sentQueue.start()
    return this
  }

  send(event: SendFnEvent<M>) {
    const eventObj = (typeof event === 'string' ? { type: event } : event) as E<M>
    if (this.#snapshot.runtimeStatus !== 'active') {
      console.warn(`RT"${this.id}"> Event "${eventObj.type}" was sent to non-active runtime.`)
      return this
    }
    this.#enqueueEvent(eventObj)
    return this
  }

  stop() {
    if (this.#snapshot.runtimeStatus !== 'active') return this

    this.#sentQueue.clear()
    this.#enqueueEvent(STOP_EVENT, {})
    return this
  }

  onEmitted(emittedEventType: EM<M>['type'], handler: (emittedEvent: EM<M>) => void) {
    let listeners = this.#emittedListeners.get(emittedEventType)
    if (!listeners) {
      listeners = new Set()
      this.#emittedListeners.set(emittedEventType, listeners)
    }
    const handlerWrapper = (emittedEvent: EM<M>) => handler(emittedEvent)
    listeners.add(handlerWrapper)
    return () => {
      listeners.delete(handlerWrapper)
    }
  }

  #processSentEvent<Ex extends E<M> | BuiltinSendableEvent | SystemSendableEvent>(
    event: Ex,
    internalEPayload?: InternalEPayload,
  ) {
    if (event === STOP_EVENT) {
      this.#dispose()
      return this.#buildAndSetSnapshot(this.#realContext, false, 'stopped')()
    }
    const result = (() => {
      try {
        const { guards, actions } = this.#machineInternal
        const actionRunner = readyAction<C<M>, E<M>, I<M>, EM<M>, G<M>, A<M>, S<M>, Ex>(
          this.#realContext,
          event,
          this.#input,
          guards,
          actions,
          this.#outbound,
        )

        return macrostep(
          event.type,
          internalEPayload,
          this.#crrStates,
          actionRunner,
          this.#machineInternal as any,
          this.#outbound,
        )
      } catch (err) {
        this.#handleError(err)
      }
    })()
    if (!result) return

    const { context, crrStates, hasTransitioned, doneEvent } = result
    this.#crrStates = crrStates
    this.#buildAndSetSnapshot(context, hasTransitioned)(doneEvent)
  }

  #dispose() {
    {
      const children = { ...this.#outbound.children }
      for (const id in children) {
        children[id]!.stop()
        delete children[id]
      }
      this.#outbound.children = children
    }
    this.#sentQueue.clear()
    this.#subscribers.clear()
    this.#emittedListeners.clear()
  }

  #_emit(emittedEvent: EM<M>) {
    const listeners = this.#emittedListeners.get(emittedEvent.type)
    const wildcardListener = this.#emittedListeners.get('*')
    if (!(listeners || wildcardListener)) {
      return
    }
    for (const handler of [...(listeners || []), ...(wildcardListener || [])]) {
      try {
        handler(emittedEvent)
      } catch (err) {
        reportUnhandledError(err)
      }
    }
  }

  #buildAndSetSnapshot(newRealContext: Readonly<C<M>>, hasTransitioned: boolean, runtimeStatus?: RuntimeStatus) {
    const oldSnapshot = this.#snapshot

    const crrStates = this.#crrStates
    const states = !hasTransitioned ? oldSnapshot.states : !crrStates.length ? [] : makeStateList(this.#crrStates)
    let { context } = oldSnapshot
    const contextUpdated = newRealContext !== this.#realContext
    if (contextUpdated) {
      this.#realContext = newRealContext
      context = !newRealContext
        ? newRealContext
        : Object.entries(newRealContext).reduce(
          (acc, [k, v]) => {
            if (!k.startsWith('_')) {
              acc[k as keyof X_RemovePrivateKeys<C<M>>] = v
            }
            return acc
          },
          {} as X_RemovePrivateKeys<C<M>>,
        )
    }

    return (doneEvent?: DoneEBody<unknown>) => {
      if (!(hasTransitioned || contextUpdated || runtimeStatus)) {
        return
      }
      const { stateCatalog, output } = this.#machineInternal
      const isCompleted = !!(
        doneEvent ||
        (states.length && states.every((stPath) => stateCatalog.get(stPath)?.def.final))
      )

      this.#snapshot = {
        runtimeId: this.id,
        states,
        get stateValue() {
          return states.length <= 1 ? states[0] : states
        },
        context,
        c: context,
        runtimeStatus: isCompleted ? 'done' : runtimeStatus || oldSnapshot.runtimeStatus,
        output: !(isCompleted && output)
          ? undefined
          : output(
            runtimeUtils.makeFnBaseParam(
              newRealContext,
              doneEvent || { type: ':done:', output: undefined },
              this.#input,
            ),
          ),
        error: undefined,
        _children: this.#outbound.children,
        _runtime: this,
      }
      Object.defineProperty(this.#snapshot, '_runtime', {
        enumerable: false
      })

      {
        const snapshot = this.#snapshot
        for (const { onSnapshot } of this.#subscribers) {
          if (!onSnapshot) continue
          try {
            onSnapshot(snapshot, oldSnapshot)
          } catch (err) {
            reportUnhandledError(err)
          }
        }
      }

      if (isCompleted) {
        this.#dispose()
      }
    }
  }

  #handleError(err: unknown) {
    this.#snapshot = { ...this.#snapshot, runtimeStatus: 'error', error: err }
    let shouldReport = !this.#subscribers.size
    for (const { onError } of this.#subscribers) {
      shouldReport ||= !onError
      try {
        onError?.(err)
      } catch (err2) {
        reportUnhandledError(err2)
      }
    }
    this.#dispose()
    if (shouldReport) {
      reportUnhandledError(err)
    }
  }
}

function makeStateList(stateRoute: StateRoute, idx: number = 0, parent: string = '') {
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
