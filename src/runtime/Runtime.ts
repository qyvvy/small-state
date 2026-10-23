import type {
  InternalEPayload,
  InternalEventBody,
  Machine,
  MContext,
  PureETypeString,
  ServiceRecord,
} from '../machine/m.types'
import { ST_DELIM } from '../shared/constants'
import type { Expand } from '../shared/general.types'
import { defineFixedProperty } from '../shared/utils'
import { MailBox } from './MailBox'
import type { Children, InferredMachineTypes, InputFromMachine, RuntimeOutbound, StateRoute } from './r.types'
import { initRuntime, macrostep } from './runtime_step'
import { readyAction } from './runtime_step.core'
import { runtimeUtils } from './runtime_utils'

export type RuntimeStatus = 'stopped' | 'active' | 'done' | 'error'

type Snapshot<C extends MContext, O, S extends ServiceRecord> = {
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

export function createRuntime<M extends Machine<any, any, any, any, any, any, any, any, any>>(
  machine: M,
  option?: RuntimeOptions<InputFromMachine<M>>,
) {
  const runtime = new Runtime(machine, option)
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

export class Runtime<
  M extends Machine<any, any, any, any, any, any, any, any, any>,
  Mt extends InferredMachineTypes<M> = InferredMachineTypes<M>,
> {
  readonly id!: string
  readonly machine!: Mt['M']
  readonly #machineInternal!: Mt['M']['internal']
  readonly #input!: I<Mt>
  #realContext!: C<Mt>
  #crrStates: StateRoute = []
  #sentQueue: MailBox<E<Mt> | InternalEventBody, InternalEPayload> = new MailBox(this.#processSentEvent.bind(this))
  #enqueueEvent = this.#sentQueue.enqueue.bind(this.#sentQueue)
  #outbound: RuntimeOutbound<E<Mt>, EM<Mt>, S<Mt>> = {
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
  getSnapshot() {
    return this.#snapshot
  }

  constructor(machine: M, { id, input }: RuntimeOptions<I<Mt>> = {}) {
    defineFixedProperty(this, 'id', id || `${machine.name}-${String(Date.now() % 10_000_000_000).padStart(10, '0')}`, {
      enumerable: true,
    })
    defineFixedProperty(this, 'machine', machine, { enumerable: true })
    this.#machineInternal = machine.internal
    this.#input = input?.() as I<Mt>

    const { initContext } = machine.internal
    const context = initContext ? initContext(this.#input) : (undefined as any as C<Mt>)
    this.#buildAndSetSnapshot(context, true, 'stopped')()
  }

  subscribe(observer: Observer<C<Mt>, O<Mt>, S<Mt>>) {
    this.#observers.add(observer)
    return () => this.#observers.delete(observer)
  }

  start() {
    if (this.#isStarted) return this
    this.#isStarted = true
    this.#sentQueue.start()
    const INIT_EVENT = { type: ':init:' } as E<Mt>

    const { context, hasTransitioned } = initRuntime(
      this.#realContext,
      this.#input,
      this.#crrStates,
      this.#machineInternal,
      this.#outbound,
    )

    this.#buildAndSetSnapshot(context, hasTransitioned, 'active')(INIT_EVENT)
    return this
  }

  send(event: E<Mt> | PureETypeString<E<Mt>>) {
    if (this.#snapshot.runtimeStatus !== 'active') return this
    const eventObj = (typeof event === 'string' ? { type: event } : event) as E<Mt>
    this.#enqueueEvent(eventObj)
    return this
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

  on(emittedEventType: EM<Mt>['type'], handler: (emittedEvent: EM<Mt>) => void) {
    let listeners = this.#emittedListeners.get(emittedEventType)
    if (!listeners) {
      listeners = new Set()
      this.#emittedListeners.set(emittedEventType, listeners)
    }
    const handlerWrapper = (emittedEvent: EM<Mt>) => handler(emittedEvent)
    listeners.add(handlerWrapper)
    return {
      unsubscribe: () => {
        listeners.delete(handlerWrapper)
      },
    }
  }

  #processSentEvent<Ex extends E<Mt> | InternalEventBody>(event: Ex, internalEPayload?: InternalEPayload) {
    const { guards, actions } = this.#machineInternal
    const actionRunner = readyAction<C<Mt>, E<Mt>, I<Mt>, EM<Mt>, G<Mt>, A<Mt>, Ex>(
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
      const { context, crrStates, hasTransitioned } = result
      this.#crrStates = crrStates

      this.#buildAndSetSnapshot(context, hasTransitioned)(event as E<Mt>)
    }
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
        : makeStateList(this.#crrStates, 0, '')
    let { context } = oldSnapshot
    const contextUpdated = newRealContext !== this.#realContext
    if (contextUpdated) {
      this.#realContext = newRealContext
      context = Object.entries(newRealContext).reduce(
        (acc, [k, v]) => {
          if (!k.startsWith('_')) {
            acc[k as keyof X_RemovePrivateKeys<C<Mt>>] = v
          }
          return acc
        },
        {} as X_RemovePrivateKeys<C<Mt>>,
      )
    }

    return (event: E<Mt> = {} as E<Mt>) => {
      if (!(hasTransitioned || contextUpdated || runtimeStatus)) {
        return
      }
      const { stateCatalog, output } = this.#machineInternal
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
