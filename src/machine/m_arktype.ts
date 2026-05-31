import { type } from 'arktype'
import { BUILTIN_ETYPES, JotSymbol, SubStatesSymbol } from './m.types'

const AnyFn = type('Function').narrow((f): f is (...args: any[]) => unknown => true)
const EffectFuncs = type.or(AnyFn, 'string', type.or(AnyFn, 'string').array())

const o_NormalizedTransitions = type({
  'to?': 'string',
  actions: EffectFuncs,
  guards: EffectFuncs,
}).array()
const NormalizedStItemDef = type({
  pPath: 'string',
  final: 'boolean',
  deriveJot: AnyFn.or('null'),
  tags: 'Set',
  entry: AnyFn.array().or('null'),
  exit: AnyFn.array().or('null'),
  builtinEvents: BUILTIN_ETYPES.reduce(
    (acc, et) => {
      acc[`${et}?`] = o_NormalizedTransitions
      return acc
    },
    {} as { [K in typeof BUILTIN_ETYPES[number]as `${K}?`]: typeof o_NormalizedTransitions },
  ),
  events: { '[string]': o_NormalizedTransitions },
})

export const SubStNormalizedDefinition = type([{
  initial: 'string | undefined',
  states: {
    '[string]': {
      def: NormalizedStItemDef,
      sub: 'null | this',
    },
  },
}, '|', {
  nType: '"parallel"',
  regions: {
    '[string]': {
      def: NormalizedStItemDef,
      sub: 'null | this',
    },
  },
}])


const Transition = type({
  '+': 'reject',
  'to?': 'string',
  'guard?': EffectFuncs,
  'actions?': EffectFuncs,
})
const o_StateEvent = type(['string', AnyFn, Transition.or(Transition.array())]).readonly() // on()
const o_SubStatesNormalized = type([AnyFn, SubStNormalizedDefinition]).readonly() // subStates()
const o_StDefMetaEntry = type({
  '+': 'reject',
  'tags?': '(string > 0)[]',
  //'entry?': AnyFn.or(AnyFn.array()),
  //'exit?': AnyFn.or(AnyFn.array()),
  'final?': 'boolean',
})

export const StDefItems = type.or(o_SubStatesNormalized, o_StateEvent, o_StDefMetaEntry).array().or('null')
//export const RegionStDefEntries = type.or(o_StateEvent, o_StDefMetaEntry).array().or('undefined')
export const JotAttached = type([type.unit(JotSymbol), 'unknown', StDefItems]).readonly()

