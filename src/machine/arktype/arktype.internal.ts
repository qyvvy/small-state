import { type } from 'arktype'

export const AnyFn = type('Function').narrow((f): f is (...args: any[]) => any => true)
