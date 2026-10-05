import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test'
import { __test__ } from '../createMachine'

const { getDefinitionAndCatalog } = __test__

const DFL_NORM_ST_DEF_DEF = {
  final: false,
  //tags: new Set<string>(),
  entryHooks: null,
  exitHooks: null,
  invocations: [],
  //builtinEvents: {},
  internalEvents: {},
  events: {},
}
const DFL_GLOBAL_DEF_ITEM = {
  events: {},
  internalEvents: {},
}

describe('machine', () => {
  beforeAll(async () => { })

  describe('getNormalizedStateDefinition: 中間状態の確認', () => {
    beforeAll(async () => { })

    test('0: シンプルで一般的なマシン定義', async () => {
      const { definition, topLvDefItem, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          name: 'auth',
          initialState: 'idle',
          initContext: () => ({
            retryCount: 0,
            maxRetries: 3,
          }),
          actions: {
            resetRetryCount: ({ update }) => update({ retryCount: 0 }),
            incrementRetry: ({ update, c }) => update({ retryCount: c.retryCount + 1 }),
          },
          guards: {
            canRetry: ({ c }) => c.retryCount < c.maxRetries,
          },
        },
        ({ on }) => ({
          idle: [on('LOGIN_START', { to: 'authenticating' })],
          authenticating: [
            on('LOGIN_SUCCESS', { to: 'authenticated', actions: 'resetRetryCount' }),
            on('LOGIN_FAILURE', { to: 'error', actions: 'incrementRetry' }),
          ],
          authenticated: [on('LOGOUT', { to: 'idle' }), on('SESSION_EXPIRED', { to: 'idle' })],
          error: [on('RETRY', { to: 'authenticating', guard: 'canRetry' }), on('RESET', { to: 'idle' })],
        }),
      )

      expect(regionPaths).toEqual([])
      expect(topLvDefItem).toEqual(DFL_GLOBAL_DEF_ITEM)

      expect([...stateCatalog.keys()]).toEqual(['/idle', '/authenticating', '/authenticated', '/error'])

      expect(definition).toEqual({
        initial: 'idle',
        stateOf: {
          idle: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                LOGIN_START: [{ to: 'authenticating', fullTo: '/authenticating', guards: [], actions: [] }],
              },
            },
            sub: null,
          },
          authenticating: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                LOGIN_FAILURE: [
                  {
                    to: 'error',
                    fullTo: '/error',
                    actions: ['incrementRetry'],
                    guards: [],
                  },
                ],
                LOGIN_SUCCESS: [
                  {
                    to: 'authenticated',
                    fullTo: '/authenticated',
                    actions: ['resetRetryCount'],
                    guards: [],
                  },
                ],
              },
            },
            sub: null,
          },
          authenticated: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                LOGOUT: [{ to: 'idle', fullTo: '/idle', guards: [], actions: [] }],
                SESSION_EXPIRED: [{ to: 'idle', fullTo: '/idle', guards: [], actions: [] }],
              },
            },
            sub: null,
          },
          error: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                RETRY: [
                  {
                    to: 'authenticating',
                    fullTo: '/authenticating',
                    actions: [],
                    guards: ['canRetry'],
                  },
                ],
                RESET: [{ to: 'idle', fullTo: '/idle', actions: [], guards: [] }],
              },
            },
            sub: null,
          },
        },
      })
    })

    test('1.1: Machine config が不正: null', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          // @ts-expect-error
          () => null,
        ),
      ).toThrow(/Invalid state definition:/)
    })
    test('1.2: Machine config が不正: empty', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          () => ({}),
        ),
      ).toThrow(/Invalid state definition:/)
    })

    test('2.1: null を終点と見なすが、空配列は終点と見なさない', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1, flag: false }),
        },
        ({ on }) => ({
          state1: [on('event1', { to: 'state2' }), on('event2', { to: 'state3', guard: ['bar', 'baz'] })],
          state2: [],
          state3: null,
          state4: [{ final: true }],
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2', '/state3', '/state4'])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                event1: [{ to: 'state2', fullTo: '/state2', guards: [], actions: [] }],
                event2: [
                  {
                    to: 'state3',
                    fullTo: '/state3',
                    guards: ['bar', 'baz'],
                    actions: [],
                  },
                ],
              },
            },
            sub: null,
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '' },
            sub: null,
          },
          state3: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
          state4: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        },
      })
    })

    test('2.2: initialState', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1 }),
          initialState: 'state2',
        },
        ({ on }) => ({
          state1: null,
          state2: [on('event1', { to: 'state1' })],
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2'])

      expect(definition).toEqual({
        initial: 'state2',
        stateOf: {
          state1: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
          state2: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                event1: [{ to: 'state1', fullTo: '/state1', guards: [], actions: [] }],
              },
            },
            sub: null,
          },
        },
      })
    })

    test('3.1: on の空の config は許容されない', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on }) => ({
            // @ts-expect-error
            state1: [on()],
          }),
        ),
      ).toThrow(/must be an array or an object \(was undefined\)/)
    })
    test('3.2: on の空の config は許容されない', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on }) => ({
            state1: [on('event1', [])],
          }),
        ),
      ).toThrow(/Empty config/)
    })

    test('4: on の引数の様々な形', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1 }),
        },
        ({ on }) => ({
          state1: [
            on('event1', { to: 'state2' }),
            on('event2', [
              { to: 'state2', guard: 'foo' },
              { to: 'state3', guard: ['bar', 'baz'], actions: 'qux' },
            ]),
          ],
          state2: [
            on('event2', [
              { to: 'state1', guard: 'foo' },
              { actions: 'qux', guard: ['bar', 'baz'] },
              { actions: 'quux', to: 'state3' },
            ]),
          ],
          state3: null,
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2', '/state3'])

      expect(definition.stateOf).toEqual({
        state1: {
          def: {
            ...DFL_NORM_ST_DEF_DEF,
            pPath: '',
            events: {
              event1: [{ to: 'state2', fullTo: '/state2', guards: [], actions: [] }],
              event2: [
                { to: 'state2', fullTo: '/state2', guards: ['foo'], actions: [] },
                {
                  to: 'state3',
                  fullTo: '/state3',
                  guards: ['bar', 'baz'],
                  actions: ['qux'],
                },
              ],
            },
          },
          sub: null,
        },
        state2: {
          def: {
            ...DFL_NORM_ST_DEF_DEF,
            pPath: '',
            events: {
              event2: [
                { to: 'state1', fullTo: '/state1', guards: ['foo'], actions: [] },
                {
                  guards: ['bar', 'baz'],
                  actions: ['qux'],
                },
                { to: 'state3', fullTo: '/state3', guards: [], actions: ['quux'] },
              ],
            },
          },
          sub: null,
        },
        state3: {
          def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
          sub: null,
        },
      })
    })

    test('5: ビルドインイベント', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1 }),
          actions: {
            increment: ({ update, c }) => update({ count: c.count + 1 }),
            greet: (_, params: { name: string }) => {
              console.log(`Hello, ${params.name}!`)
            },
          },
          guards: {
            isTrue: () => true,
          },
        },
        ({ on, entryHook, exitHook }) => ({
          state1: [
            entryHook(({ enqueue, check }) => {
              if (check('isTrue')) {
                enqueue('increment')
              }
            }),
            exitHook(() => console.log('exit state1')),
            on(':always:', { actions: () => console.log('ctx changed') }),
            on('event1', { to: 'state2', actions: 'increment' }),
          ],
          state2: [
            entryHook('increment', { greet: { name: 'Ken' } }),
            {
              final: true,
            },
          ],
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2'])

      expect(definition.stateOf).toEqual({
        state1: {
          def: {
            ...DFL_NORM_ST_DEF_DEF,
            pPath: '',
            entryHooks: [expect.any(Function)],
            exitHooks: [expect.any(Function)],
            internalEvents: {
              ':always:': { transitions: [{ actions: [expect.any(Function)], guards: [] }] },
            },
            events: {
              event1: [{ to: 'state2', fullTo: '/state2', guards: [], actions: ['increment'] }],
            },
          },
          sub: null,
        },
        state2: {
          def: {
            ...DFL_NORM_ST_DEF_DEF,
            pPath: '',
            final: true,
            entryHooks: ['increment', { greet: { name: 'Ken' } }],
          },
          sub: null,
        },
      })
    })

    describe('6.1: duplicate subStates throw', () => {
      test('6.1.1: subStates', async () => {
        expect(() =>
          getDefinitionAndCatalog(
            {
              types: {
                events: {} as { type: 'subEvent1' },
              },
              initContext: () => ({ count: 1 }),
            },
            ({ on, subStates }) => ({
              state1: [
                subStates({
                  subState1: [on('subEvent1', { to: 'subState2' })],
                  subState2: null,
                }),
                subStates({
                  subState3: [on('subEvent1', { to: 'subState2' })],
                  subState2: null,
                }),
              ],
              state2: null,
            }),
          ),
        ).toThrow('Duplicated subStates')
      })
      test('6.1.2: parallel', async () => {
        expect(() =>
          getDefinitionAndCatalog(
            {
              types: {
                events: {} as { type: 'subEvent1' },
              },
              initContext: () => ({ count: 1 }),
            },
            ({ parallel }) => ({
              state1: [
                parallel({
                  region1: [],
                  region2: [],
                }),
                parallel({
                  region3: [],
                  region4: [],
                }),
              ],
              state2: null,
            }),
          ),
        ).toThrow('Duplicated subStates')
      })
      test('6.1.3: subStates and parallel', async () => {
        expect(() =>
          getDefinitionAndCatalog(
            {
              types: {
                events: {} as { type: 'subEvent1' },
              },
              initContext: () => ({ count: 1 }),
            },
            ({ parallel, subStates }) => ({
              state1: [
                subStates({
                  subStates1: [],
                  subStates2: [],
                }),
                parallel({
                  region3: [],
                  region4: [],
                }),
              ],
              state2: null,
            }),
          ),
        ).toThrow('Duplicated subStates')
      })
    })

    test('6.2: subStates', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
        },
        ({ on, entryHook, exitHook, subStates }) => ({
          state1: [
            entryHook(() => console.log('enter state1')),
            exitHook(() => console.log('exit state1')),
            on('event1', { to: 'state2', guard: (c) => false }),
            on(':childDone:', { to: 'state2' }),
            subStates({
              subState1: [
                on('subEvent1', { to: 'subState2' }),
                on(':childDone:', { to: 'subState2' }),
                subStates({
                  subSubState1: [on('event3', { to: 'subSubState2' })],
                  subSubState2: null,
                }),
              ],
              subState2: null,
            }),
          ],
          state2: [subStates({})],
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state1/subState1',
        '/state1/subState1/subSubState1',
        '/state1/subState1/subSubState2',
        '/state1/subState2',
        '/state2',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state2', fullTo: '/state2', actions: [], guards: [] }],
                },
              },
              events: {
                event1: [{ to: 'state2', fullTo: '/state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              stateOf: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    internalEvents: {
                      ':childDone:': {
                        cond: expect.any(Function),
                        transitions: [{ to: 'subState2', fullTo: '/state1/subState2', actions: [], guards: [] }],
                      },
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', fullTo: '/state1/subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    stateOf: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [
                              { to: 'subSubState2', fullTo: '/state1/subState1/subSubState2', guards: [], actions: [] },
                            ],
                          },
                        },
                        sub: null,
                      },
                      subSubState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/subState1', final: true },
                        sub: null,
                      },
                    },
                  },
                },
                subState2: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', final: true },
                  sub: null,
                },
              },
            },
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '' },
            sub: {
              initial: undefined,
              stateOf: {},
            },
          },
        },
      })
    })

    test('6.3: subStates: with initialStates', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
          initialState: 'state1',
        },
        ({ on, entryHook, exitHook, subStates }) => [
          {
            state0: null,
            state1: [
              entryHook(() => console.log('enter state1')),
              exitHook(() => console.log('exit state1')),
              on('event1', { to: 'state2', guard: (c) => false }),
              on(':childDone:', { to: 'state2' }),
              subStates(
                {
                  subState0: null,
                  subState1: [
                    on('subEvent1', { to: 'subState2' }),
                    on(':childDone:', { to: 'subState2' }),
                    subStates(
                      {
                        subSubState0: null,
                        subSubState1: [on('event3', { to: 'subSubState2' })],
                        subSubState2: null,
                      },
                      'subSubState2',
                    ),
                  ],
                  subState2: null,
                },
                'subState1',
              ),
            ],
            state2: null,
          },
        ],
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual([
        '/state0',
        '/state1',
        '/state1/subState0',
        '/state1/subState1',
        '/state1/subState1/subSubState0',
        '/state1/subState1/subSubState1',
        '/state1/subState1/subSubState2',
        '/state1/subState2',
        '/state2',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state0: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state2', fullTo: '/state2', actions: [], guards: [] }],
                },
              },
              events: {
                event1: [{ to: 'state2', fullTo: '/state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              stateOf: {
                subState0: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', final: true },
                  sub: null,
                },
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    internalEvents: {
                      ':childDone:': {
                        cond: expect.any(Function),
                        transitions: [{ to: 'subState2', fullTo: '/state1/subState2', actions: [], guards: [] }],
                      },
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', fullTo: '/state1/subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState2',
                    stateOf: {
                      subSubState0: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/subState1', final: true },
                        sub: null,
                      },
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [
                              { to: 'subSubState2', fullTo: '/state1/subState1/subSubState2', guards: [], actions: [] },
                            ],
                          },
                        },
                        sub: null,
                      },
                      subSubState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/subState1', final: true },
                        sub: null,
                      },
                    },
                  },
                },
                subState2: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', final: true },
                  sub: null,
                },
              },
            },
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        },
      })
    })

    test('6.4: subStates with Global events', async () => {
      const { definition, topLvDefItem, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
        },
        ({ on, subStates }) => [
          [
            on(':always:', { actions: () => console.log('ctx changed') }),
            on('event3', { actions: () => console.log('event3 received') }),
          ],
          {
            state1: [
              on('event1', { to: 'state2', guard: (c) => false }),
              on(':childDone:', { to: 'state2' }),
              subStates({
                subState1: [
                  on('subEvent1', { to: 'subState2' }),
                  on(':childDone:', { to: 'subState2' }),
                  subStates({
                    subSubState1: [on('event3', { to: 'subSubState2' })],
                    subSubState2: null,
                  }),
                ],
                subState2: null,
              }),
            ],
            state2: [subStates({})],
          },
        ],
      )

      expect(regionPaths).toEqual([])

      expect(topLvDefItem).toEqual({
        internalEvents: {
          ':always:': { transitions: [{ actions: [expect.any(Function)], guards: [] }] },
        },
        events: {
          event3: [{ actions: [expect.any(Function)], guards: [] }],
        },
      })

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state1/subState1',
        '/state1/subState1/subSubState1',
        '/state1/subState1/subSubState2',
        '/state1/subState2',
        '/state2',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state2', fullTo: '/state2', actions: [], guards: [] }],
                },
              },
              events: {
                event1: [{ to: 'state2', fullTo: '/state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              stateOf: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    internalEvents: {
                      ':childDone:': {
                        cond: expect.any(Function),
                        transitions: [{ to: 'subState2', fullTo: '/state1/subState2', actions: [], guards: [] }],
                      },
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', fullTo: '/state1/subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    stateOf: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [
                              { to: 'subSubState2', fullTo: '/state1/subState1/subSubState2', guards: [], actions: [] },
                            ],
                          },
                        },
                        sub: null,
                      },
                      subSubState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/subState1', final: true },
                        sub: null,
                      },
                    },
                  },
                },
                subState2: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', final: true },
                  sub: null,
                },
              },
            },
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '' },
            sub: {
              initial: undefined,
              stateOf: {},
            },
          },
        },
      })
    })

    test('7.1: parallel', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
        },
        ({ on, entryHook, exitHook, parallel }) => ({
          state1: [parallel({})],
          state2: [
            entryHook(() => console.log('enter state1')),
            exitHook(() => console.log('exit state1')),
            on('event1', {
              to: 'state3',
              guard: (c) => false,
            }),
            on(':childDone:', { to: 'state3' }),
            parallel({
              region1: [
                {
                  subState1: [on('subEvent1', { to: 'subState2' })],
                  subState2: null,
                },
              ],
              region2: [
                [
                  on('event3', { to: 'subState2' }),
                  on(':childDone:', {
                    actions: () => console.log('region2 is done'),
                  }),
                ],
                {
                  subState1: [],
                  subState2: null,
                },
              ],
              region3: [{}],
              region4: [],
            }),
          ],
          state3: null,
        }),
      )

      expect(regionPaths).toEqual([
        '/state2/region1',
        '/state2/region2',
        '/state2/region3',
        '/state2/region4',
      ])

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state2',
        '/state2/region1',
        '/state2/region1/subState1',
        '/state2/region1/subState2',
        '/state2/region2',
        '/state2/region2/subState1',
        '/state2/region2/subState2',
        '/state2/region3',
        '/state2/region4',
        '/state3',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
            },
            sub: {
              dType: 'regions',
              stateOf: {},
            },
          },
          state2: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state3', fullTo: '/state3', actions: [], guards: [] }],
                },
              },
              events: {
                event1: [{ to: 'state3', fullTo: '/state3', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              dType: 'regions',
              stateOf: {
                region1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                  },
                  sub: {
                    initial: 'subState1',
                    stateOf: {
                      subState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state2/region1',
                          events: {
                            subEvent1: [
                              {
                                to: 'subState2',
                                fullTo: '/state2/region1/subState2',
                                guards: [],
                                actions: [],
                              },
                            ],
                          },
                        },
                        sub: null,
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state2/region1', final: true },
                        sub: null,
                      },
                    },
                  },
                },
                region2: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                    internalEvents: {
                      ':childDone:': {
                        cond: expect.any(Function),
                        transitions: [{ actions: [expect.any(Function)], guards: [] }],
                      },
                    },
                    events: {
                      event3: [
                        {
                          to: 'subState2',
                          fullTo: '/state2/region2/subState2',
                          guards: [],
                          actions: [],
                        },
                      ],
                    },
                  },
                  sub: {
                    initial: 'subState1',
                    stateOf: {
                      subState1: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state2/region2' },
                        sub: null,
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state2/region2', final: true },
                        sub: null,
                      },
                    },
                  },
                },
                region3: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                  },
                  sub: {
                    initial: undefined,
                    stateOf: {},
                  },
                },
                region4: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                  },
                  sub: {
                    initial: undefined,
                    stateOf: {},
                  },
                },
              },
            },
          },
          state3: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        },
      })
    })

    test('7.2: parallel の入れ子', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
        },
        ({ on, parallel, subStates }) => ({
          state1: [
            on(':childDone:', { to: 'state2' }),
            parallel({
              region1: [
                {
                  subState1: [
                    on(':childDone:', { to: 'subState2' }),
                    subStates({
                      subSubState1: [on('subEvent1', { to: 'subSubState2' })],
                      subSubState2: null,
                    }),
                  ],
                  subState2: null,
                },
              ],
              region2: [
                {
                  subState1: [
                    on(':childDone:', { to: '../subState2' }),
                    parallel({
                      subRegion1: [
                        {
                          subSubState3: [on('subEvent1', { to: 'subSubState4' })],
                          subSubState4: null,
                        },
                      ],
                      subRegion2: [
                        {
                          subSubState5: [on('subEvent2', { to: 'subSubState6' })],
                          subSubState6: null,
                        },
                      ],
                    }),
                  ],
                  subState2: null,
                },
              ],
            }),
          ],
          state2: null,
        }),
      )

      expect(regionPaths).toEqual([
        '/state1/region2/subState1/subRegion1',
        '/state1/region2/subState1/subRegion2',
        '/state1/region1',
        '/state1/region2',
      ])

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state1/region1',
        '/state1/region1/subState1',
        '/state1/region1/subState1/subSubState1',
        '/state1/region1/subState1/subSubState2',
        '/state1/region1/subState2',
        '/state1/region2',
        '/state1/region2/subState1',
        '/state1/region2/subState1/subRegion1',
        '/state1/region2/subState1/subRegion1/subSubState3',
        '/state1/region2/subState1/subRegion1/subSubState4',
        '/state1/region2/subState1/subRegion2',
        '/state1/region2/subState1/subRegion2/subSubState5',
        '/state1/region2/subState1/subRegion2/subSubState6',
        '/state1/region2/subState2',
        '/state2',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state2', fullTo: '/state2', actions: [], guards: [] }],
                },
              },
            },
            sub: {
              dType: 'regions',
              stateOf: {
                region1: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1' },
                  sub: {
                    initial: 'subState1',
                    stateOf: {
                      subState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/region1',
                          internalEvents: {
                            ':childDone:': {
                              cond: expect.any(Function),
                              transitions: [
                                { to: 'subState2', fullTo: '/state1/region1/subState2', actions: [], guards: [] },
                              ],
                            },
                          },
                        },
                        sub: {
                          initial: 'subSubState1',
                          stateOf: {
                            subSubState1: {
                              def: {
                                ...DFL_NORM_ST_DEF_DEF,
                                pPath: '/state1/region1/subState1',
                                events: {
                                  subEvent1: [
                                    {
                                      to: 'subSubState2',
                                      fullTo: '/state1/region1/subState1/subSubState2',
                                      guards: [],
                                      actions: [],
                                    },
                                  ],
                                },
                              },
                              sub: null,
                            },
                            subSubState2: {
                              def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/region1/subState1', final: true },
                              sub: null,
                            },
                          },
                        },
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/region1', final: true },
                        sub: null,
                      },
                    },
                  },
                },
                region2: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1' },
                  sub: {
                    initial: 'subState1',
                    stateOf: {
                      subState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/region2',
                          internalEvents: {
                            ':childDone:': {
                              cond: expect.any(Function),
                              transitions: [
                                { to: '../subState2', fullTo: '/state1/region2/subState2', actions: [], guards: [] },
                              ],
                            },
                          },
                        },
                        sub: {
                          dType: 'regions',
                          stateOf: {
                            subRegion1: {
                              def: {
                                ...DFL_NORM_ST_DEF_DEF,
                                pPath: '/state1/region2/subState1',
                              },
                              sub: {
                                initial: 'subSubState3',
                                stateOf: {
                                  subSubState3: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/region2/subState1/subRegion1',
                                      events: {
                                        subEvent1: [
                                          {
                                            to: 'subSubState4',
                                            fullTo: '/state1/region2/subState1/subRegion1/subSubState4',
                                            guards: [],
                                            actions: [],
                                          },
                                        ],
                                      },
                                    },
                                    sub: null,
                                  },
                                  subSubState4: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/region2/subState1/subRegion1',
                                      final: true,
                                    },
                                    sub: null,
                                  },
                                },
                              },
                            },
                            subRegion2: {
                              def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/region2/subState1' },
                              sub: {
                                initial: 'subSubState5',
                                stateOf: {
                                  subSubState5: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/region2/subState1/subRegion2',
                                      events: {
                                        subEvent2: [
                                          {
                                            to: 'subSubState6',
                                            fullTo: '/state1/region2/subState1/subRegion2/subSubState6',
                                            guards: [],
                                            actions: [],
                                          },
                                        ],
                                      },
                                    },
                                    sub: null,
                                  },
                                  subSubState6: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/region2/subState1/subRegion2',
                                      final: true,
                                    },
                                    sub: null,
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/region2', final: true },
                        sub: null,
                      },
                    },
                  },
                },
              },
            },
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        },
      })
    })

    test('8: invoke', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
          services: {
            increment: async (count: number) => count + 1,
            log: async (msg: string) => console.log(msg),
          },
        },
        ({ on, invoke, subStates }) => ({
          state1: [
            invoke(
              { input: ({ c }) => c.count },
              'increment',
              on('done', {
                to: 'state2',
                actions: ({ e, update }) => update({ count: e.output }),
              }),
              on('error', {
                to: 'state3',
                actions: ({ e }) => e.error,
              }),
            ),
            invoke(
              { input: ({ c }) => c.count },
              async (count) => 'aiu' as const,
              on('done', {
                to: 'state2',
                actions: ({ e, update, c }) => {
                  update({
                    count: e.output,
                  })
                },
              }),
              on('error', {
                to: 'state3',
                actions: ({ e }) => e.error,
              }),
            ),
          ],
          state2: [
            on(':childDone:', { to: 'state3' }),
            subStates({
              subState1: [
                invoke(
                  { id: 'state2-invocation', input: ({ c }) => c.count },
                  (count) => '',
                  //(f)=>1,
                  on('done', {
                    to: 'subState2',
                    actions: ({ e, update, c }) => {
                      update({ count: e.output })
                    },
                  }),
                  on('error', { actions: ({ e }) => e.error }),
                ),
              ],
              subState2: null,
            }),
          ],
          state3: [],
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state2',
        '/state2/subState1',
        '/state2/subState2',
        '/state3',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              invocations: [
                {
                  id: '(invocation-0)',
                  input: expect.any(Function),
                  src: 'increment',
                },
                {
                  id: '(invocation-1)',
                  input: expect.any(Function),
                  src: expect.any(Function),
                },
              ],
              internalEvents: {
                '(invocation-0)/done': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state2', fullTo: '/state2', actions: [expect.any(Function)], guards: [] }],
                },
                '(invocation-0)/error': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state3', fullTo: '/state3', actions: [expect.any(Function)], guards: [] }],
                },
                '(invocation-1)/done': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state2', fullTo: '/state2', actions: [expect.any(Function)], guards: [] }],
                },
                '(invocation-1)/error': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state3', fullTo: '/state3', actions: [expect.any(Function)], guards: [] }],
                },
              },
            },
            sub: null,
          },
          state2: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: 'state3', fullTo: '/state3', actions: [], guards: [] }],
                },
              },
            },
            sub: {
              initial: 'subState1',
              stateOf: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                    invocations: [
                      {
                        id: 'state2-invocation',
                        input: expect.any(Function),
                        src: expect.any(Function),
                      },
                    ],
                    internalEvents: {
                      'state2-invocation/done': {
                        cond: expect.any(Function),
                        transitions: [
                          { to: 'subState2', fullTo: '/state2/subState2', actions: [expect.any(Function)], guards: [] },
                        ],
                      },
                      'state2-invocation/error': {
                        cond: expect.any(Function),
                        transitions: [{ actions: [expect.any(Function)], guards: [] }],
                      },
                    },
                  },
                  sub: null,
                },
                subState2: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                    final: true,
                  },
                  sub: null,
                },
              },
            },
          },
          state3: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '' },
            sub: null,
          },
        },
      })
    })

    test('9.1: 不正な Transition: 通常イベント', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on }) => ({
            state1: [on('event1', { to: 'state2' })],
            state2: [on('event1', { to: 'foobar' })],
          }),
        ),
      ).toThrow(/Invalid transition/)
    })

    test('9.2: 不正な Transition: ビルトインイベント', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on }) => ({
            state1: [on(':always:', { to: 'hogehoge' }), on('event1', { to: 'state2' })],
            state2: null,
          }),
        ),
      ).toThrow(/Invalid transition/)
    })

    test('9.3: 不正な Transition: invoke', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on, invoke }) => ({
            state1: [invoke({}, () => null, on('done', { to: 'state2' }), on('error', { to: 'hoge' }))],
            state2: null,
          }),
        ),
      ).toThrow(/Invalid transition/)
    })

    test('9.4: subStates をパスで遷移', async () => {
      const { definition, stateCatalog, regionPaths } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
              | { type: 'subEvent1' }
              | { type: 'subEvent2' },
          },
          initContext: () => ({ count: 1 }),
        },
        ({ on, subStates }) => ({
          state1: [
            on('event1', {
              to: './subState2',
              guard: ({ c }) => true,
            }),
            on('event3', {
              to: '/state2',
              guard: ({ c }) => true,
            }),
            on(':childDone:', { to: '../state2' }),
            subStates({
              subState1: [
                on('subEvent1', { to: '/state1/subState2' }),
                on(':childDone:', { to: '/state2' }),
                subStates({
                  subSubState1: [on('event3', { to: 'subSubState2' })],
                  subSubState2: [on('event3', { to: '/state1/subState1/subSubState1' })],
                }),
              ],
              subState2: null,
            }),
          ],
          state2: null,
        }),
      )

      expect(regionPaths).toEqual([])

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state1/subState1',
        '/state1/subState1/subSubState1',
        '/state1/subState1/subSubState2',
        '/state1/subState2',
        '/state2',
      ])

      expect(definition).toEqual({
        initial: 'state1',
        stateOf: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              internalEvents: {
                ':childDone:': {
                  cond: expect.any(Function),
                  transitions: [{ to: '../state2', fullTo: '/state2', actions: [], guards: [] }],
                },
              },
              events: {
                event1: [
                  { to: './subState2', fullTo: '/state1/subState2', guards: [expect.any(Function)], actions: [] },
                ],
                event3: [{ to: '/state2', fullTo: '/state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              stateOf: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    internalEvents: {
                      ':childDone:': {
                        cond: expect.any(Function),
                        transitions: [{ to: '/state2', fullTo: '/state2', actions: [], guards: [] }],
                      },
                    },
                    events: {
                      subEvent1: [{ to: '/state1/subState2', fullTo: '/state1/subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    stateOf: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [
                              { to: 'subSubState2', fullTo: '/state1/subState1/subSubState2', guards: [], actions: [] },
                            ],
                          },
                        },
                        sub: null,
                      },
                      subSubState2: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [
                              {
                                to: '/state1/subState1/subSubState1',
                                fullTo: '/state1/subState1/subSubState1',
                                guards: [],
                                actions: [],
                              },
                            ],
                          },
                        },
                        sub: null,
                      },
                    },
                  },
                },
                subState2: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', final: true },
                  sub: null,
                },
              },
            },
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        },
      })
    })
  })
})
