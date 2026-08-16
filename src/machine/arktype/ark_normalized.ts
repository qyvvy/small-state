import { type } from 'arktype'
import { BUILTIN_ETYPES } from '../m.types'
import { AnyFn } from "./arktype.internal";

const NormalizedActionBody = type({ body: type.or(AnyFn, 'string'), 'params?': 'unknown', 'isEnqueue?': 'boolean' })

const o_NormalizedTransitions = type({
  'to?': 'string',
  'fullTo?': 'string',
  actions: NormalizedActionBody.array(),
  guards: NormalizedActionBody.array(),
}).array()
const o_NormalizedInvocations = type({
  'id?': 'string',
  'input?': AnyFn,
  src: type.or(AnyFn, 'string'),
  'done?': o_NormalizedTransitions,
  'error?': o_NormalizedTransitions,
}).array()
const NStateItemDef = type({
  '+': 'reject',
  pPath: 'string',
  final: 'boolean',
  tags: 'Set',
  invocations: o_NormalizedInvocations,
  entryHook: NormalizedActionBody.or('null'),
  exitHook: NormalizedActionBody.or('null'),
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
      def: NStateItemDef,
      sub: 'null | this',
    },
  },
}, '|', {
  nType: '"parallel"',
  regions: {
    '[string]': {
      def: NStateItemDef,
      sub: 'null | this',
    },
  },
}])

