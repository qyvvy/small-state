import type {
  AnyMachine,
  BuiltinSendableEvent,
  EmittableEvent,
  FnBaseParams,
  LimitedActionFnParams,
  MContext,
  NormalizedTransition,
  ParamsInput,
  SendableEvent,
} from '../machine/m.types'
import type { AnyFn } from '../shared/general.types'
import { isPlainObject } from '../shared/utils'
import type { StateRoute } from './r.types'

type MachineGuardFn<C extends MContext, E extends SendableEvent, I> = (...args: FnBaseParams<C, E, I>) => boolean

type MachineActionFn<C extends MContext, E extends SendableEvent, I, EM extends EmittableEvent> = (
  ...args: LimitedActionFnParams<C, E, I, EM>
) => unknown

function x_resolveActionElement<
  TMachineFn extends MachineGuardFn<C, E, I> | MachineActionFn<C, E, I, EM>,
  C extends MContext,
  E extends SendableEvent | BuiltinSendableEvent,
  I,
  EM extends EmittableEvent = EmittableEvent,
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
  E extends SendableEvent | BuiltinSendableEvent,
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
  Ex extends SendableEvent | BuiltinSendableEvent,
  I,
  EM extends EmittableEvent,
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
  makeFnBaseParam<C extends MContext, E extends SendableEvent, I>(
    context: C,
    event: E,
    input: I,
  ): FnBaseParams<C, E, I>[0] {
    return { context, c: context, event, e: event, input }
  },
}

export function readyToEvalGuard<C extends MContext, Ex extends SendableEvent, I>(
  fnBaseParam: FnBaseParams<C, Ex, I>[0],
  machineGuards: AnyMachine['internal']['guards'],
) {
  return (guard: NormalizedTransition['guards'][number]): boolean => {
    const [fn, params] = resolveGuardElement(guard, machineGuards)
    return fn(fnBaseParam, typeof params !== 'function' ? params : params(fnBaseParam))
  }
}

// 第二引数に指定した道順に沿って、第一引数を辿る関数
export function traverseStateRouteMatch(
  stateRoute: StateRoute,
  stPathSplitted: string[],
): { isExhausted: boolean; endIdx: number; remaining?: [StateRoute, startIdx: number, asRootpath?: boolean] } {
  let focusedRoute = stateRoute
  let routeIdx = 0
  const len = stPathSplitted.length
  let i: number
  for (i = 0; i < len; i++, routeIdx++) {
    const sName = stPathSplitted[i]
    const routeEl = focusedRoute[routeIdx]
    if (!routeEl) {
      return { isExhausted: false, endIdx: i, remaining: [focusedRoute, routeIdx] }
    } else if (typeof routeEl === 'string') {
      if (sName !== routeEl.valueOf()) {
        return { isExhausted: false, endIdx: i, remaining: [focusedRoute, routeIdx] }
      }
      continue
    }
    const { parallel, regions } = routeEl
    if (sName !== parallel) {
      return { isExhausted: false, endIdx: i }
    }
    i += 1
    if (i >= len) {
      return { isExhausted: true, endIdx: i, remaining: [focusedRoute, routeIdx, true] }
    }
    const regionRoute = regions[stPathSplitted[i]!]
    if (!regionRoute) {
      return { isExhausted: false, endIdx: i }
    }
    focusedRoute = regionRoute
    routeIdx = -1
  }
  return { isExhausted: true, endIdx: i, remaining: [focusedRoute, routeIdx] }
}
