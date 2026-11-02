import { type } from 'arktype'
import { AnyFn, FunctionRecord } from "./arktype.internal";


const o_Types = type({
  '+': 'reject',
  'context?': 'unknown',
  'events?': 'unknown',
  'emittable?': 'unknown',
  'input?': 'unknown',
  'output?': 'unknown',
})

export const MachineConfig = type({
  '+': 'reject',
  'types?': o_Types,
  'name?': 'string',
  'initialState?': 'string',
  'initContext?': AnyFn,
  'output?': AnyFn,
  'guards?': FunctionRecord,
  'actions?': FunctionRecord,
  'services?': 'Record<string, unknown>',
})
