import { type } from 'arktype'
import { AnyFn, EffectFuncs } from "./arktype.internal";

const o_Assigner = type({ assign: type.or(AnyFn, 'Record<string, unknown>') })
const ActionRecord = type({
  '[string]': type.or(AnyFn, o_Assigner)
})

const o_Types = type({
  '+': 'reject',
  'context?': 'unknown',
  'events?': 'unknown',
  'emitted?': 'unknown',
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
  'guards?': 'Record<string, unknown>',
  'actions?': ActionRecord,
  'services?': 'Record<string, unknown>',
})
