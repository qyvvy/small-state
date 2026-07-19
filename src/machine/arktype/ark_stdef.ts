import { type } from 'arktype'
import { InvokeSymbol, TransitionSymbol } from '../m.types'
import { SubStNormalizedDefinition } from './ark_normalized'
import { AnyFn } from './arktype.internal'

const o_ActionBody = type({ type: '"function"|"string"', body: type.or(AnyFn, 'string'), 'params?': 'unknown' })
const GuardReturn = type([type.unit(TransitionSymbol), '"guards"', o_ActionBody, AnyFn]).readonly()
const ActionReturn = type([type.unit(TransitionSymbol), '"actions"', o_ActionBody, AnyFn, 'null']).readonly()
export const Transition = type.or('string', GuardReturn, ActionReturn, AnyFn).array()
const OnEventReturn = type(['string', AnyFn, Transition.array()]).readonly() // on()

const oo_OneAction = type.or(GuardReturn, ActionReturn, AnyFn).array()

const o_StDefMetaInfo = type({
  '+': 'reject',
  'tags?': '(string > 0)[]',
  'entryHook?': type.or(AnyFn, oo_OneAction),
  'exitHook?': type.or(AnyFn, oo_OneAction),
  'isFinal?': 'boolean',
})
const o_SubStatesNormalized = type([AnyFn, SubStNormalizedDefinition]).readonly() // subStates|parallel
const o_Invocation = type([
  type.unit(InvokeSymbol),
  AnyFn,
  'null',
  { 'id?': 'string', 'input?': AnyFn, },
  type.or(AnyFn, 'string'),
  OnEventReturn.array()
]).readonly()

export const StateDefinition = type.or(OnEventReturn, o_StDefMetaInfo, o_SubStatesNormalized, o_Invocation).array().or('null')
