import { type } from 'arktype'

export const AnyFn = type('Function').narrow((f): f is (...args: any[]) => any => true)

const SingleRecord = type({ '[string]': 'unknown' })
  .narrow((value) => Object.keys(value).length === 1)
export const ActionElement = type.or(AnyFn, 'string', SingleRecord)
