import { type } from 'arktype'
import { ActionElement, AnyFn } from './arktype.internal'

const NormalizedActions = ActionElement.array()

const x_NormalizedTransitions = type({
  'to?': 'string',
  'fullTo?': 'string',
  actions: NormalizedActions,
  guards: NormalizedActions,
}).array()

const o_NormalizedInvocations = type({
  'id': 'string',
  'input?': AnyFn,
  src: type.or(AnyFn, 'string'),
  'done?': x_NormalizedTransitions,
  'error?': x_NormalizedTransitions,
}).array()
const o_InternalEvent = type({
  'cond?': AnyFn,
  transitions: x_NormalizedTransitions,
})
const NStateItemDef = type({
  '+': 'reject',
  pPath: 'string',
  final: AnyFn.or('boolean'),
  //tags: 'Set',
  entryHooks: NormalizedActions.or('null'),
  exitHooks: NormalizedActions.or('null'),
  invocations: o_NormalizedInvocations,
  internalEvents: { '[string]': o_InternalEvent },
  events: { '[string]': x_NormalizedTransitions },
})

export const SubStNormalizedDefinition = type([
  {
    'dType?': '"normal"',
    initial: 'string | undefined',
    stateOf: {
      '[string]': {
        def: NStateItemDef,
        sub: 'null | this',
      },
    },
  },
  '|',
  {
    dType: '"regions"',
    stateOf: {
      '[string]': {
        def: NStateItemDef,
        sub: 'null | this',
      },
    },
  },
])
