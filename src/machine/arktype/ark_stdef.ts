import { type } from 'arktype'
import { EntrySymbol, ExitSymbol, InvokeSymbol } from '../m.types'
import { ChildMachine, SubStNormalizedDefinition } from './ark_normalized'
import { ActionElement, AnyFn } from './arktype.internal'

const x_ActionEffects = type.or(ActionElement, ActionElement.array())

export const Transition = type({
  '+': 'reject',
  'to?': 'string',
  'guard?': x_ActionEffects,
  'actions?': x_ActionEffects,
})
const OnFnReturn = type(['string', AnyFn, type.or(Transition, Transition.array())]).readonly() // on()

const EntryHookReturn = type([type.unit(EntrySymbol), AnyFn, 'null', x_ActionEffects]).readonly()
const ExitHookReturn = type([type.unit(ExitSymbol), AnyFn, 'null', x_ActionEffects]).readonly()

const o_StDefMetaInfo = type({
  '+': 'reject',
  //'tags?': '(string > 0)[]',
  'final?': AnyFn.or('boolean'),
})
const o_SubStatesNormalized = type([AnyFn, SubStNormalizedDefinition]).readonly() // subStates|parallel
const o_Invocation = type([
  type.unit(InvokeSymbol),
  AnyFn,
  'null',
  type.or(AnyFn, 'string', ChildMachine),
  { '+': 'reject', 'subKey?': 'string | number', 'input?': AnyFn },
  OnFnReturn.array(),
]).readonly()

export const StateDefinition = type
  .or(OnFnReturn, EntryHookReturn, ExitHookReturn, o_StDefMetaInfo, o_SubStatesNormalized, o_Invocation)
  .array()
  .or('null')
