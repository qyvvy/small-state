import type {
  EmittedEvent,
  EventBody,
  FnBaseParams,
  InternalEventBody,
  LimitedActionFnParams,
  Machine,
  MContext,
  NormalizedTransition,
  ParamsInput,
} from '../machine/m.types'
import type { AnyFn, RecursiveRecord } from '../shared/general.types'
import { isPlainObject } from '../shared/utils'

//import type { EnqueueActions, CheckFn, EnqueueFn } from '../machine/createMachine-enqueue'

type MachineGuardFn<C extends MContext, E extends EventBody, I> = (...args: FnBaseParams<C, E, I>) => boolean

type MachineActionFn<C extends MContext, E extends EventBody, I, EM extends EmittedEvent> = (
  ...args: LimitedActionFnParams<C, E, I, EM>
) => unknown

function x_resolveActionElement<
  TMachineFn extends MachineGuardFn<C, E, I> | MachineActionFn<C, E, I, EM>,
  C extends MContext,
  E extends EventBody | InternalEventBody,
  I,
  EM extends EmittedEvent = EmittedEvent,
  TTypeArg = Parameters<TMachineFn>[0],
>(
  kind: string,
  type: string | ((arg: TTypeArg) => ReturnType<TMachineFn>) | Record<string, ParamsInput<unknown, C, E, I>>,
  implRecord: Record<string, TMachineFn>,
  keyParams: unknown = undefined,
): [fn: (arg: TTypeArg) => ReturnType<TMachineFn>] | [fn: TMachineFn, params: undefined | unknown | AnyFn] {
  switch (typeof type) {
    case 'function':
      return [type]
    case 'string':
      if (!Object.hasOwn(implRecord, type)) {
        throw new Error(`unknown ${kind} type: "${type}"`)
      }
      return [implRecord[type]!, keyParams]
    case 'object': {
      const entries = Object.entries(type!)
      if (!(entries.length === 1 && isPlainObject(type))) {
        throw new Error(`invalid ${kind} type: "${JSON.stringify(type)}"`)
      }
      const [key, val] = entries[0]!
      if (!Object.hasOwn(implRecord, key)) {
        throw new Error(`unknown ${kind} type: "${key}"`)
      }
      return [implRecord[key]!, val]
    }
    default:
      throw new Error(`invalid ${kind} type: "${JSON.stringify(type)}"`)
  }
}

export function resolveGuardElement<
  C extends MContext,
  E extends EventBody | InternalEventBody,
  I,
  TMachineFn extends MachineGuardFn<C, E, I> = MachineGuardFn<C, E, I>,
>(
  type:
    | string
    | ((arg: Parameters<TMachineFn>[0]) => ReturnType<TMachineFn>)
    | Record<string, ParamsInput<unknown, C, E, I>>,
  machineGuards: Record<string, TMachineFn>,
  keyParams: unknown = undefined,
) {
  return x_resolveActionElement<TMachineFn, C, E, I>('Guard', type, machineGuards, keyParams)
}

export function resolveActionElement<
  C extends MContext,
  Ex extends EventBody | InternalEventBody,
  I,
  EM extends EmittedEvent,
  TTypeArg = LimitedActionFnParams<C, Ex, I, EM>[0],
  TMachineFn extends MachineActionFn<C, Ex, I, EM> = MachineActionFn<C, Ex, I, EM>,
>(
  type: string | ((arg: TTypeArg) => ReturnType<TMachineFn>) | Record<string, ParamsInput<unknown, C, Ex, I>>,
  machineActions: Record<string, TMachineFn>,
  keyParams: unknown = undefined,
) {
  return x_resolveActionElement<TMachineFn, C, Ex, I, EM, TTypeArg>('Action', type, machineActions, keyParams)
}

export const runtimeUtils = {
  makeFnBaseParam<C extends MContext, E extends EventBody, I>(
    context: C,
    event: E,
    input: I,
  ): FnBaseParams<C, E, I>[0] {
    return { context, c: context, event, e: event, input }
  },
}

export function readyToEvalGuard<C extends MContext, Ex extends EventBody, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: Machine<any, any, any, any, any, any, any, any, any>['guards'],
) {
  return (guard: NormalizedTransition['guards'][number]): boolean => {
    const [fn, params] = resolveGuardElement(guard, machineGuards)
    return fn(fnBaseParam, typeof params !== 'function' ? params : params(fnBaseParam))
  }
}

// 第一引数に指定した道順に沿って、第二引数を辿る関数
export function traverseStateTreeMatch(stateSplitted: string[], crrStateTree: RecursiveRecord) {
  let focusedNode = crrStateTree
  let i: number = -2,
    sName: string
  for ([i, sName] of stateSplitted.entries()) {
    if (!(sName in focusedNode)) {
      return { endIdx: i, remaining: focusedNode, isExhausted: false }
    }
    focusedNode = focusedNode[sName]!
  }
  return { endIdx: i + 1, remaining: focusedNode, isExhausted: true }
}
