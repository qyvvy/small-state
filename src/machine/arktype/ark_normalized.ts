import { type } from 'arktype'
import { BUILTIN_ETYPES } from '../m.types'
import { AnyFn, EffectFuncs } from "./arktype.internal";

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
  entryHooks: AnyFn.array().or('null'),
  exitHooks: AnyFn.array().or('null'),
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

