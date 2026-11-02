import type {
  AnyMachine,
  BuiltinEventBody,
  DoneEBody,
  InternalEPayload,
  MContext,
  PureETypeString,
  ServiceRecord,
  SystemEventBody,
} from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Expand } from '../shared/general.types'
import { defineFixedProperty } from '../shared/utils'
import { MailBox } from './MailBox'
import type { Children, InferMInput, InferredMachineTypes, RuntimeOutbound, StateRoute } from './r.types'
import { initRuntime, macrostep } from './runtime_step'
import { readyAction } from './runtime_step.core'
import { runtimeUtils } from './runtime_utils'

export type RuntimeStatus = 'notStarted' | 'active' | 'stopped' | 'done' | 'error'

export type Snapshot<C extends MContext, O, S extends ServiceRecord> = {
  runtimeId: string
  states: string[]
  stateValue: string | string[] | undefined
  context: Expand<X_RemovePrivateKeys<C>>
  c: Expand<X_RemovePrivateKeys<C>>
  runtimeStatus: RuntimeStatus
  output: O | undefined
  _children: Children<S>
}

type Observer<C extends MContext, O, S extends ServiceRecord> = (
  current: Expand<Snapshot<C, O, S>>,
  prev: Expand<Snapshot<C, O, S>>,
) => void

export type RuntimeOptions<I> = {
  id?: string
  input?: () => I
}

type X_RemovePrivateKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K]
}

export function makeRuntime<M extends AnyMachine>(
  machine: M,
  options?: RuntimeOptions<InferMInput<M>>,
) {
  const runtime = new Runtime(machine, options)
  return runtime
}

type C<Mt extends InferredMachineTypes<any>> = Mt['C']
type E<Mt extends InferredMachineTypes<any>> = Mt['E']
type I<Mt extends InferredMachineTypes<any>> = Mt['I']
type EM<Mt extends InferredMachineTypes<any>> = Mt['EM']
type O<Mt extends InferredMachineTypes<any>> = Mt['O']
type G<Mt extends InferredMachineTypes<any>> = Mt['G']
type A<Mt extends InferredMachineTypes<any>> = Mt['A']
type S<Mt extends InferredMachineTypes<any>> = Mt['S']

const STOP_EVENT = { type: 'system/stop' }

let idCounter = 0
export class Runtime<
  M extends AnyMachine,
  Mt extends InferredMachineTypes<M> = InferredMachineTypes<M>,
> {
  readonly id!: string
  readonly machine!: Mt['M']
  readonly #machineInternal!: Mt['M']['internal']
  readonly #input!: I<Mt>
  #realContext!: C<Mt>
  #crrStates: StateRoute = []
  #sentQueue: MailBox<E<Mt> | BuiltinEventBody, InternalEPayload> = new MailBox(this.#processSentEvent.bind(this))
  #enqueueEvent = this.#sentQueue.enqueue.bind(this.#sentQueue)
  #outbound: RuntimeOutbound<E<Mt>, EM<Mt>, S<Mt>> = {
    id: '',
    enqueueEvent: this.#enqueueEvent,
    emit: this.#_emit.bind(this),
    children: {},
  }
  #observers = new Set<Observer<C<Mt>, O<Mt>, S<Mt>>>()
  #emittedListeners: Map<string, Set<(emittedEvent: EM<Mt>) => void>> = new Map()
  #snapshot = {} as Snapshot<C<Mt>, O<Mt>, S<Mt>>
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
  get output() {
    return this.#snapshot.output
  }
  getSnapshot() {
    return this.#snapshot
  }

  constructor(machine: M, { id, input }: RuntimeOptions<I<Mt>> = {}) {
    defineFixedProperty(this, 'id', id || `${machine.name}:${idCounter++}`, {
      enumerable: true,
    })
    defineFixedProperty(this, 'machine', machine, { enumerable: true })
    this.#machineInternal = machine.internal
    this.#input = input?.() as I<Mt>
    this.#outbound.id = this.id

    const { initContext } = machine.internal
    const context = initContext ? initContext(this.#input) : (null as any as C<Mt>)
    this.#buildAndSetSnapshot(context, true, 'notStarted')()
  }

  subscribe(observer: Observer<C<Mt>, O<Mt>, S<Mt>>) {
    this.#observers.add(observer)
    return () => {
      this.#observers.delete(observer)
    }
  }

  start() {
    if (this.#isStarted) return this
    this.#isStarted = true

    const { context, hasTransitioned, doneEvent } = initRuntime(
      this.#realContext,
      this.#input,
      this.#crrStates,
      this.#machineInternal,
      this.#outbound,
    )

    this.#buildAndSetSnapshot(context, hasTransitioned, 'active')(doneEvent)
    this.#sentQueue.start()
    return this
  }

  send(event: E<Mt> | PureETypeString<E<Mt>>) {
    const eventObj = (typeof event === 'string' ? { type: event } : event) as E<Mt>
    if (this.#snapshot.runtimeStatus !== 'active') {
      console.warn(`Event "${eventObj.type}" was sent to non-active runtime: ${this.id}`)
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

  onEmitted(emittedEventType: EM<Mt>['type'], handler: (emittedEvent: EM<Mt>) => void) {
    let listeners = this.#emittedListeners.get(emittedEventType)
    if (!listeners) {
      listeners = new Set()
      this.#emittedListeners.set(emittedEventType, listeners)
    }
    const handlerWrapper = (emittedEvent: EM<Mt>) => handler(emittedEvent)
    listeners.add(handlerWrapper)
    return () => {
      listeners.delete(handlerWrapper)
    }
  }

  #processSentEvent<Ex extends E<Mt> | BuiltinEventBody | SystemEventBody>(event: Ex, internalEPayload?: InternalEPayload) {
    if (event === STOP_EVENT) {
      return this.#stop()
    }
    const { guards, actions } = this.#machineInternal
    const actionRunner = readyAction<C<Mt>, E<Mt>, I<Mt>, EM<Mt>, G<Mt>, A<Mt>, S<Mt>, Ex>(
      this.#realContext,
      event,
      this.#input,
      guards,
      actions,
      this.#outbound,
    )

    const result = macrostep(
      event.type,
      internalEPayload,
      this.#crrStates,
      actionRunner,
      this.#machineInternal as any,
      this.#outbound,
    )
    {
      const { context, crrStates, hasTransitioned, doneEvent } = result
      this.#crrStates = crrStates

      this.#buildAndSetSnapshot(context, hasTransitioned)(doneEvent)
    }
  }

  #stop() {
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
  }

  #_emit(emittedEvent: EM<Mt>) {
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

  #buildAndSetSnapshot(newRealContext: C<Mt>, hasTransitioned: boolean, runtimeStatus?: RuntimeStatus) {
    const oldSnapshot = this.#snapshot

    const crrStates = this.#crrStates
    const states = !hasTransitioned
      ? oldSnapshot.states
      : !crrStates.length
        ? []
        : makeStateList(this.#crrStates)
    let { context } = oldSnapshot
    const contextUpdated = newRealContext !== this.#realContext
    if (contextUpdated) {
      this.#realContext = newRealContext
      context = !newRealContext
        ? newRealContext
        : Object.entries(newRealContext).reduce(
          (acc, [k, v]) => {
            if (!k.startsWith('_')) {
              acc[k as keyof X_RemovePrivateKeys<C<Mt>>] = v
            }
            return acc
          },
          {} as X_RemovePrivateKeys<C<Mt>>,
        )
    }

    return (doneEvent?: DoneEBody<unknown>) => {
      if (!(hasTransitioned || contextUpdated || runtimeStatus)) {
        return
      }
      const { stateCatalog, output } = this.#machineInternal
      const isCompleted = !!(doneEvent || states.length && states.every((stPath) => stateCatalog.get(stPath)?.def.final))

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
          : output(runtimeUtils.makeFnBaseParam(
            newRealContext, (doneEvent || { type: ':done:', output: undefined }), this.#input
          )),
        _children: this.#outbound.children,
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
