//import { Machine } from "../machine/Machine";

import type {
  EmittedEvent,
  EventBody,
  Machine,
  MContext,
  NormalizedDefinition,
  PureEventType,
} from '../machine/m.types'
import type {
  AnyFn,
  Placeholder,
  RecursiveRecord,
} from '../shared/general.types'
import {
  deepFreeze,
  defineFixedProperty,
} from '../shared/utils'
import { MailBox } from './MailBox'
import type { RemovePrivateKeys } from './i.types'
import {
  calcEventTransition,
  calcNewPaths,
  calcTransitionDelta,
  procEntry,
  procExit,
  serviceUtils,
  readyAction,
} from './service_utils'

const { makeFnBaseParam } = serviceUtils

type ServiceStatus = 'stopped' | 'active' | 'done' | 'error'
type AnyMachine = Machine<any, any, any, any, any, any, any, any, any>
//type StateNode = {
//  isParallel: boolean
//  children: { [key: string]: StateNode }
//}

type Definition<M extends AnyMachine> = M['definition']['states']

type Snapshot<C extends MContext, E extends EventBody, in out EM extends EmittedEvent, O> = {
  //id: string, // マシンID
  //name: string, // マシン名
  //parent: string,
  states: string[]
  context: C
  event: E
  status: ServiceStatus
  emitted: EM | null
  output: O | null
}

// robot3 の onChange: (service)=>any
type OnUpdateFn<C extends MContext, E extends EventBody, EM extends EmittedEvent, O> = (
  snapshot: Snapshot<C, E, EM, O>,
) => unknown

// robot3: interpret(Machine, onChange, initialContext)=> {machine: M, context: M['context'], onChange: (s:Service)=>void, send: (e:SendEvent)=>void, child?: Service}
export function interpret<
  C extends MContext,
  E extends EventBody,
  I,
  const EM extends EmittedEvent,
  O,
  G extends Record<string, Placeholder>,
  A extends Record<string, Placeholder>,
  S extends Record<string, (input: any) => unknown>,
  const ND extends NormalizedDefinition,
  Id extends string,
  OwnId extends string,
>(
  machine: Machine<C, E, I, EM, O, G, A, S, ND>,
  option?: {
    id?: OwnId
    input?: () => I
    onUpdate?: OnUpdateFn<C, E, EM, O>
    //subscribe?: (snapshot: Snapshot<C, E, EM, O, Id | OwnId>) => unknown
  } | null,
) {
  const { id, input, onUpdate } = option || {}
  const qId = id || `${machine.name}-${String(Date.now() % 10000000000).padStart(10, '0')}`
  const interpreter = new Service(machine, { id: qId, input, onUpdate })
  //interpreter.subscribe
  return interpreter
}

class Service<
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
  #realContext!: C
  #_contextForUser!: RemovePrivateKeys<C>
  readonly #input!: I
  readonly #onUpdate!: OnUpdateFn<C, E, EM, O> | undefined
  //#crrStateTree: StateNode = { isParallel: false, children: {} }
  status: ServiceStatus = 'stopped'

  #crrStateTree: RecursiveRecord = Object.create(null)
  #crrStatePaths: string[] = [] // TBC: ~~長い順にソートさせておく？~~
  #sentQueue: MailBox<E> = new MailBox(this.#processSent.bind(this), true)
  #emittedListeners: Map<string, Set<(emittedEvent: EM) => void>> = new Map()

  constructor(
    machine: Machine<C, E, I, EM, O, G, A, S, ND>,
    {
      id,
      input,
      onUpdate,
    }: { id: string; input: (() => I) | undefined; onUpdate: OnUpdateFn<C, E, EM, O> | undefined },
  ) {
    defineFixedProperty(this, 'id', id, { enumerable: true })
    defineFixedProperty(this, 'machine', machine, { enumerable: true })
    this.#input = (input && input()) as I
    this.#onUpdate = onUpdate
  }

  get context(): RemovePrivateKeys<C> {
    return this.#_contextForUser
  }
  set context(value: Partial<C>) {
    this.#realContext = { ...this.#realContext, ...value }
    Object.defineProperty(this, '#_contextForUser', {
      value: deepFreeze(
        Object.entries(this.#realContext).reduce((acc, [k, v]) => {
          if (!k.startsWith('_')) {
            acc[k] = v
          }
          return acc
        }, {} as MContext),
      ),
      enumerable: true,
    })
  }

  //#transition(to: string, crrStatePath: string) {
  //  const { pPath } = this.#crrPaths
  //  const fullPath = getTransitionFullPath(to, crrStatePath, pPath)
  //  return this.#digg(this.machine.stateCatalog.get(fullPath)!, to)
  //}

  start() {
    const { initContext, definition } = this.machine
    const { initial, states } = definition
    const newPaths = calcNewPaths(states, initial)

    this.context = initContext ? initContext(this.#input) : (undefined as any as C)
    this.status = 'active'
    if (!newPaths?.length) {
      return this
    }
    this.#bootState(newPaths)
    this.#sentQueue.start()
    return this
  }

  send(event: E | PureEventType<E>) {
    const eventObj = (typeof event === 'string' ? { type: event } : event) as E
    this.#sentQueue.enqueue(eventObj)

    //const result = this.#machine.transition(this.#makeSnapshot(eventObj), eventObj)
    //if (result.state !== this.#crrStates) {
    //  const { state, context } = result
    //  this.#crrStates = state
    //  this.context = context
    //  this.notify()
    //}
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

  unlisten() {
    // onUpdate を停止する
  }

  //#makeSnapshot(event: E, emitted: EM | null, output: O | null): Snapshot<C, E, EM, O> {
  //  const { #id: id, #crrState: crrState, context, status } = this
  //  return {
  //    states: crrState,
  //    context,
  //    event,
  //    emitted,
  //    status,
  //    output,
  //  }
  //}

  #bootState(newPaths: string[]) {
    // TODO: crrPaths との比較。すでに起動されているのなら無視する
    const crrTree = this.#crrStateTree
    const { stateCatalog } = this.machine
    const { reavedTrees, enteredTreeOf } = calcTransitionDelta(newPaths, crrTree)
    for (const [prefix, tree] of reavedTrees) {
      procExit(Object.entries(tree), prefix, stateCatalog)
    }
    for (const [prefix, tree] of Object.entries(enteredTreeOf)) {
      procEntry(Object.entries(tree), prefix, stateCatalog)
    }
  }

  async #processSent(event: E) {
    const context = this.#realContext
    const input = this.#input
    const crrStateTree = this.#crrStateTree
    const { guards, actions, services, stateCatalog, regionPaths } = this.machine

    const tExecs = calcEventTransition(event.type, makeFnBaseParam(context, event, input), crrStateTree, guards, stateCatalog, regionPaths)

    const { execAction, execEnqueueAction, wait, getResult } =
      readyAction<C, E, I, EM, G, A>(context, event, input, guards, actions, this.#emit)
    for (const { transition } of tExecs) {
      for (const { isEnqueue, body, params } of transition.actions) {
        if (isEnqueue) {
          execEnqueueAction(body as AnyFn)
        } else if (typeof body === 'function') {
          await execAction(body, params)
        } else {
          await execAction(services[body]!, params)
        }
        await wait()
      }
    }
    this.context = getResult().context

    // exit と enter を求める. 現在地 crrStateTree と移動先との差分、
    // exit は深い方から実行され、 entry は浅い方から実行される
    crrStateTree
    for (const { transition: { fullTo }, from } of tExecs) {
      if (!from) {
        continue
      }
      const { def } = stateCatalog.get(from)!
      if (def.exitHook) {
        // TODO

      }
    }

    // always は子を先に判定してから親を判定. マイクロステップ直後ごとに判定
    // 遷移なしの場合、元のステート内で子。子のalways が存在する場合親の always は実行されない
    // 遷移がある場合、新しいステート内で判定


    //const { states } = this.machine.definition
    //const newPaths = calcNewPaths(states, initial)
  }

  #emit(emittedEvent: EM) {
    const listeners = this.#emittedListeners.get(emittedEvent.type);
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


}

