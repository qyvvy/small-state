import { type } from 'arktype'
import { JotSymbol, EntrySymbol, ExitSymbol, SubStatesSymbol } from '../m.types'
import { SubStNormalizedDefinition } from './ark_normalized'
import { AnyFn, EffectFuncs } from "./arktype.internal";

const oo_Transition = type({
  '+': 'reject',
  'to?': 'string',
  'guard?': EffectFuncs,
  'actions?': EffectFuncs,
})
const o_StateEvent = type(['string', AnyFn, oo_Transition.or(oo_Transition.array())]).readonly() // on()
const o_EntryHook = type([type.unit(EntrySymbol), AnyFn, EffectFuncs]).readonly()
const o_ExitHook = type([type.unit(ExitSymbol), AnyFn, EffectFuncs]).readonly()
const o_SubStatesNormalized = type([AnyFn, SubStNormalizedDefinition]).readonly() // subStates()
const o_StDefMetaInfo = type({
  '+': 'reject',
  'tags?': '(string > 0)[]',
  //'entry?': AnyFn.or(AnyFn.array()),
  //'exit?': AnyFn.or(AnyFn.array()),
  'final?': 'boolean',
})

export const StDefItems = type.or(
  o_SubStatesNormalized, o_StateEvent, o_EntryHook, o_ExitHook, o_StDefMetaInfo
).array().or('null')
//export const RegionStDefEntries = type.or(o_StateEvent, o_StDefMetaEntry).array().or('undefined')
export const JotAttached = type([type.unit(JotSymbol), 'unknown', StDefItems]).readonly()

