import { type } from 'arktype'

export const AnyFn = type('Function').narrow((f): f is (...args: any[]) => unknown => true)
export const EffectFuncs = type.or(AnyFn, 'string', type.or(AnyFn, 'string').array())
