import { type } from 'arktype'
import { MachineSymbol, type NormalizedStateItemBoth } from '../m.types'
import { ActionElement, AnyFn, FunctionRecord } from './arktype.internal'

const NormalizedActions = ActionElement.array()

const x_NormalizedTransitions = type({
  'to?': 'string',
  'fullTo?': 'string',
  actions: NormalizedActions,
  guards: NormalizedActions,
}).array()

const x_InternalEvent = type({
  'cond?': AnyFn,
  transitions: x_NormalizedTransitions,
})

export const ChildMachine = type({
  name: 'string',
  provide: AnyFn,
  internal: {
    [MachineSymbol]: 'true',
    initContext: AnyFn.or('undefined'),
    output: AnyFn.or('undefined'),
    guards: FunctionRecord,
    actions: FunctionRecord,
    services: FunctionRecord,
    definition: 'unknown',
    topLvDefItem: {
      events: type({ '[string]': x_NormalizedTransitions }),
      internalEvents: type({ '[string]': x_InternalEvent }),
    },
    stateCatalog: type.instanceOf(Map).as<Map<string, NormalizedStateItemBoth>>(),
  },
})

const o_NormalizedInvocations = type({
  'id?': 'string',
  'input?': AnyFn,
  src: type.or(
    { type: '"function"', value: AnyFn },
    { type: '"string"', value: 'string' },
    { type: '"machine"', value: ChildMachine }
  ),
}).array()
const NStateItemDef = type({
  '+': 'reject',
  pPath: 'string',
  final: AnyFn.or('boolean'),
  //tags: 'Set',
  entryHooks: NormalizedActions.or('null'),
  exitHooks: NormalizedActions.or('null'),
  invocations: o_NormalizedInvocations,
  internalEvents: { '[string]': x_InternalEvent },
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

