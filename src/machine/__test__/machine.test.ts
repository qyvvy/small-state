import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test'

import { __test__ } from '../createMachine'

const { getDefinitionAndCatalog } = __test__

const DFL_NORM_ST_DEF_DEF = {
  final: false,
  tags: new Set<string>(),
  entryHook: null,
  exitHook: null,
  invocations: [],
  builtinEvents: {},
  events: {},
}

describe('machine', () => {
  beforeAll(async () => { })

  describe('getNormalizedStateDefinition: 中間状態の確認', () => {
    beforeAll(async () => { })

    test('0: シンプルで一般的なマシン定義', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
        ({ On, action, guard }) => ({
          idle: [On('LOGIN_START', ['authenticating'])],
          authenticating: [
            On('LOGIN_SUCCESS', ['authenticated', action('resetRetryCount')]),
            On('LOGIN_FAILURE', ['error', action('incrementRetry')]),
          ],
          authenticated: [
            On('LOGOUT', ['idle']),
            On('SESSION_EXPIRED', ['idle'])
          ],
          error: [
            On('RETRY', ['authenticating', guard('canRetry')]),
            On('RESET', ['idle'])
          ],
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/idle', '/authenticating', '/authenticated', '/error'])

      expect(definition).toEqual({
        initial: 'idle',
        builtinEvents: {},
        events: {},
        states: {
          idle: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                LOGIN_START: [{ to: 'authenticating', guards: [], actions: [] }],
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
                    actions: [{ type: 'string', body: 'incrementRetry', params: undefined }],
                    guards: []
                  }
                ],
                LOGIN_SUCCESS: [
                  {
                    to: 'authenticated',
                    actions: [{ type: 'string', body: 'resetRetryCount', params: undefined }],
                    guards: []
                  }
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
                LOGOUT: [{ to: 'idle', guards: [], actions: [] }],
                SESSION_EXPIRED: [{ to: 'idle', guards: [], actions: [] }],
              },
            },
            sub: null,
          },
          error: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                RETRY: [{ to: 'authenticating', actions: [], guards: ['canRetry'] }],
                RESET: [{ to: 'idle', actions: [], guards: [] }],
              },
            },
            sub: null,
          },
        }
      })
    })

    test('1.1: Machine config が不正', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          () => ({}),
        ),
      ).toThrow(/Empty config/)
    })

    test('2.1: null を終点と見なすが、空配列は終点と見なさない', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1, flag: false }),
        },
        ({ on, subStates }) => ({
          state1: [on('event1', { to: 'state2' }), on('event2', [{ to: 'state3', guard: ['bar', 'baz'] }])],
          state2: [],
          state3: null,
          state4: [{ final: true }],
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2', '/state3', '/state4'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                event1: [{ to: 'state2', guards: [], actions: [] }],
                event2: [{ to: 'state3', guards: ['bar', 'baz'], actions: [] }],
              },
            },
            sub: null,
          },
          state2: {

            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', },
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
        }
      })
    })

    test('2.2: initialState', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2'])

      expect(definition).toEqual({
        initial: 'state2',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
          state2: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              events: {
                event1: [{ to: 'state1', guards: [], actions: [] }],
              },
            },
            sub: null,
          },
        }
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
            state1: [on('event1', {})],
          }),
        ),
      ).toThrow(/Empty config/)
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
    test('3.3: on の空の config は許容されない', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on }) => ({
            state1: [on('event1', [{ guard: 'foo' }, {}])],
          }),
        ),
      ).toThrow(/Empty config/)
    })

    test('4: on の引数の様々な形', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1 }),
        },
        ({ on }) => ({
          state1: [
            on('event1', { to: 'state2' }),
            on('event2', [{ to: 'state2', guard: 'foo' }, { to: 'state3', guard: ['bar', 'baz'] }, { actions: 'qux' }]),
          ],
          state2: [
            on('event2', [
              { to: 'state1', guard: 'foo' },
              { actions: 'qux', guard: ['bar', 'baz'] },
              { actions: ['quux'], to: 'state3' },
            ]),
          ],
          state3: null,
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2', '/state3'])

      expect(definition.states).toEqual({
        state1: {
          def: {
            ...DFL_NORM_ST_DEF_DEF,
            pPath: '',
            events: {
              event1: [{ to: 'state2', guards: [], actions: [] }],
              event2: [
                { to: 'state2', guards: ['foo'], actions: [] },
                { to: 'state3', guards: ['bar', 'baz'], actions: [] },
                { guards: [], actions: ['qux'] },
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
                { to: 'state1', guards: ['foo'], actions: [] },
                { guards: ['bar', 'baz'], actions: ['qux'] },
                { to: 'state3', guards: [], actions: ['quux'] },
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
      const { definition, stateCatalog } = getDefinitionAndCatalog(
        {
          types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
          initContext: () => ({ count: 1 }),
        },
        ({ on, entryHook, exitHook }) => ({
          state1: [
            entryHook(() => console.log('enter state1'),),
            exitHook(() => console.log('exit state1'),),
            {
              tags: ['tag1', 'tag2'],
              //entry: () => console.log('enter state1'),
              //exit: () => console.log('exit state1'),
            },
            on(':always:', { actions: () => console.log('ctx changed') }),
            on('event1', { to: 'state2' }),
          ],
          state2: null,
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2'])

      expect(definition.states).toEqual({
        state1: {
          def: {
            ...DFL_NORM_ST_DEF_DEF,
            pPath: '',
            tags: new Set(['tag1', 'tag2']),
            entryHooks: [expect.any(Function)],
            exitHooks: [expect.any(Function)],
            builtinEvents: {
              ':always:': [{ actions: [expect.any(Function)], guards: [] }],
            },
            events: {
              event1: [{ to: 'state2', guards: [], actions: [] }],
            },
          },
          sub: null,
        },
        state2: {

          def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
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
                events: {} as
                  | { type: 'subEvent1' }
              },
              initContext: () => ({ count: 1 }),
            },
            ({ on, subStates }) => ({
              state1: [
                subStates({
                  subState1: [
                    on('subEvent1', { to: 'subState2' }),
                  ],
                  subState2: null,
                }),
                subStates({
                  subState3: [
                    on('subEvent1', { to: 'subState2' }),
                  ],
                  subState2: null,
                }),
              ],
              state2: null,
            }),
          )
        ).toThrow('Duplicated subStates')
      })
      test('6.1.2: parallel', async () => {
        expect(() =>
          getDefinitionAndCatalog(
            {
              types: {
                events: {} as
                  | { type: 'subEvent1' }
              },
              initContext: () => ({ count: 1 }),
            },
            ({ parallel }) => ({
              state1: [
                parallel({
                  parallel1: [],
                  parallel2: [],
                }),
                parallel({
                  parallel3: [],
                  parallel4: [],
                }),
              ],
              state2: null,
            }),
          )
        ).toThrow('Duplicated subStates')
      })
      test('6.1.3: subStates and parallel', async () => {
        expect(() =>
          getDefinitionAndCatalog(
            {
              types: {
                events: {} as
                  | { type: 'subEvent1' }
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
                  parallel3: [],
                  parallel4: [],
                }),
              ],
              state2: null,
            }),
          )
        ).toThrow('Duplicated subStates')
      })
    })

    test('6.2: subStates', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
                })
              ],
              subState2: null,
            }),
          ],
          state2: [
            subStates({})
          ],
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state1/subState1', '/state1/subState1/subSubState1', '/state1/subState1/subSubState2', '/state1/subState2', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              builtinEvents: {
                ':childDone:': [{ to: 'state2', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: 'state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              states: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    builtinEvents: {
                      ':childDone:': [{ to: 'subState2', actions: [], guards: [] }],
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    states: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [{ to: 'subSubState2', guards: [], actions: [] }],
                          }
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
              states: {}
            },
          },
        }
      })
    })

    test('6.3: subStates: with initialStates', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
        ({ on, entryHook, exitHook, subStates }) => [{
          state0: null,
          state1: [
            entryHook(() => console.log('enter state1'),),
            exitHook(() => console.log('exit state1'),),
            on('event1', { to: 'state2', guard: (c) => false }),
            on(':childDone:', { to: 'state2' }),
            subStates('subState1', {
              subState0: null,
              subState1: [
                on('subEvent1', { to: 'subState2' }),
                on(':childDone:', { to: 'subState2' }),
                subStates('subSubState2', {
                  subSubState0: null,
                  subSubState1: [on('event3', { to: 'subSubState2' })],
                  subSubState2: null,
                })
              ],
              subState2: null,
            }),
          ],
          state2: null,
        }],
      )

      expect([...stateCatalog.keys()]).toEqual(['/state0', '/state1', '/state1/subState0', '/state1/subState1', '/state1/subState1/subSubState0', '/state1/subState1/subSubState1', '/state1/subState1/subSubState2', '/state1/subState2', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
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
              builtinEvents: {
                ':childDone:': [{ to: 'state2', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: 'state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              states: {
                subState0: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', final: true },
                  sub: null,
                },
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    builtinEvents: {
                      ':childDone:': [{ to: 'subState2', actions: [], guards: [] }],
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState2',
                    states: {
                      subSubState0: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/subState1', final: true },
                        sub: null,
                      },
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [{ to: 'subSubState2', guards: [], actions: [] }],
                          }
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
        }
      })
    })

    test('6.4: subStates with Global events', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
        ({ on, entryHook, exitHook, subStates }) => [
          [
            on(':always:', { actions: () => console.log('ctx changed') }),
            on('event3', { actions: () => console.log('event3 received') }),
          ],
          {
            state1: [
              entryHook(() => console.log('enter state1'),),
              exitHook(() => console.log('exit state1'),),
              on('event1', { to: 'state2', guard: (c) => false }),
              on(':childDone:', { to: 'state2' }),
              subStates({
                subState1: [
                  on('subEvent1', { to: 'subState2' }),
                  on(':childDone:', { to: 'subState2' }),
                  subStates({
                    subSubState1: [on('event3', { to: 'subSubState2' })],
                    subSubState2: null,
                  })
                ],
                subState2: null,
              }),
            ],
            state2: [
              subStates({})
            ],
          }],
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state1/subState1', '/state1/subState1/subSubState1', '/state1/subState1/subSubState2', '/state1/subState2', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {
          ':always:': [{ actions: [expect.any(Function)], guards: [] }],
        },
        events: {
          event3: [{ actions: [expect.any(Function)], guards: [] }],
        },
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              builtinEvents: {
                ':childDone:': [{ to: 'state2', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: 'state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              states: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    builtinEvents: {
                      ':childDone:': [{ to: 'subState2', actions: [], guards: [] }],
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    states: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [{ to: 'subSubState2', guards: [], actions: [] }],
                          }
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
              states: {}
            },
          },
        }
      })
    })

    test('7.1: parallel', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
          state1: [
            parallel({}),
          ],
          state2: [
            entryHook(() => console.log('enter state1'),),
            exitHook(() => console.log('exit state1'),),
            on('event1', { to: 'state3', guard: (c) => false }),
            on(':childDone:', { to: 'state3' }),
            parallel({
              parallel1: [{
                subState1: [on('subEvent1', { to: 'subState2' })],
                subState2: null,
              }],
              parallel2: [
                [
                  on('event3', { to: 'subState2' }),
                  on(':childDone:', { actions: () => console.log('parallel2 is done') }),
                ],
                {
                  subState1: [],
                  subState2: null,
                }
              ],
              parallel3: [{}],
              parallel4: [],
            }),
          ],
          state3: null,
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2', '/state2/parallel1', '/state2/parallel1/subState1', '/state2/parallel1/subState2', '/state2/parallel2', '/state2/parallel2/subState1', '/state2/parallel2/subState2', '/state2/parallel3', '/state2/parallel4', '/state3'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
            },
            sub: {
              nType: 'parallel',
              regions: {},
            },
          },
          state2: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              builtinEvents: {
                ':childDone:': [{ to: 'state3', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: 'state3', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              nType: 'parallel',
              regions: {
                parallel1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                  },
                  sub: {
                    initial: 'subState1',
                    states: {
                      subState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state2/parallel1',
                          events: {
                            subEvent1: [{ to: 'subState2', guards: [], actions: [] }],
                          }
                        },
                        sub: null,
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state2/parallel1', final: true, },
                        sub: null,
                      },
                    }
                  }
                },
                parallel2: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                    builtinEvents: {
                      ':childDone:': [{ actions: [expect.any(Function)], guards: [] }],
                    },
                    events: {
                      event3: [{ to: 'subState2', guards: [], actions: [] }],
                    }
                  },
                  sub: {
                    initial: 'subState1',
                    states: {
                      subState1: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state2/parallel2', },
                        sub: null,
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state2/parallel2', final: true, },
                        sub: null,
                      },
                    }
                  }
                },
                parallel3: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                  },
                  sub: {
                    initial: undefined,
                    states: {},
                  },
                },
                parallel4: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state2',
                  },
                  sub: {
                    initial: undefined,
                    states: {},
                  },
                },
              },
            },
          },
          state3: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        }
      })
    })

    test('7.2: parallel の入れ子', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
              parallel1: [{
                subState1: [
                  on(':childDone:', { to: 'subState2' }),
                  subStates({
                    subSubState1: [on('subEvent1', { to: 'subSubState2' })],
                    subSubState2: null
                  })
                ],
                subState2: null,
              }],
              parallel2: [
                {
                  subState1: [
                    on(':childDone:', { to: '../subState2' }),
                    parallel({
                      subParallel1: [{
                        subSubState3: [on('subEvent1', { to: 'subSubState4' })],
                        subSubState4: null,
                      }],
                      subParallel2: [{
                        subSubState5: [on('subEvent2', { to: 'subSubState6' })],
                        subSubState6: null,
                      }],
                    })
                  ],
                  subState2: null,
                }
              ],
            }),
          ],
          state2: null,
        }),
      )

      expect([...stateCatalog.keys()]).toEqual([
        '/state1',
        '/state1/parallel1',
        '/state1/parallel1/subState1',
        '/state1/parallel1/subState1/subSubState1',
        '/state1/parallel1/subState1/subSubState2',
        '/state1/parallel1/subState2',
        '/state1/parallel2',
        '/state1/parallel2/subState1',
        '/state1/parallel2/subState1/subParallel1',
        '/state1/parallel2/subState1/subParallel1/subSubState3',
        '/state1/parallel2/subState1/subParallel1/subSubState4',
        '/state1/parallel2/subState1/subParallel2',
        '/state1/parallel2/subState1/subParallel2/subSubState5',
        '/state1/parallel2/subState1/subParallel2/subSubState6',
        '/state1/parallel2/subState2',
        '/state2'
      ])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              builtinEvents: {
                ':childDone:': [{ to: 'state2', actions: [], guards: [] }],
              },
            },
            sub: {
              nType: 'parallel',
              regions: {
                parallel1: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', },
                  sub: {
                    initial: 'subState1',
                    states: {
                      subState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/parallel1',
                          builtinEvents: {
                            ':childDone:': [{ to: 'subState2', actions: [], guards: [] }],
                          },
                        },
                        sub: {
                          initial: 'subSubState1',
                          states: {
                            subSubState1: {
                              def: {
                                ...DFL_NORM_ST_DEF_DEF,
                                pPath: '/state1/parallel1/subState1',
                                events: {
                                  subEvent1: [{ to: 'subSubState2', guards: [], actions: [] }]
                                },
                              },
                              sub: null
                            },
                            subSubState2: {
                              def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/parallel1/subState1', final: true },
                              sub: null,
                            }
                          },
                        },
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/parallel1', final: true, },
                        sub: null,
                      },
                    }
                  }
                },
                parallel2: {
                  def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1', },
                  sub: {
                    initial: 'subState1',
                    states: {
                      subState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/parallel2',
                          builtinEvents: {
                            ':childDone:': [{ to: '../subState2', actions: [], guards: [] }],
                          }
                        },
                        sub: {
                          nType: 'parallel',
                          regions: {
                            subParallel1: {
                              def: {
                                ...DFL_NORM_ST_DEF_DEF,
                                pPath: '/state1/parallel2/subState1',
                              },
                              sub: {
                                initial: 'subSubState3',
                                states: {
                                  subSubState3: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/parallel2/subState1/subParallel1',
                                      events: {
                                        subEvent1: [{ to: 'subSubState4', guards: [], actions: [] }]
                                      }
                                    },
                                    sub: null,
                                  },
                                  subSubState4: {
                                    def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/parallel2/subState1/subParallel1', final: true },
                                    sub: null,
                                  }
                                }
                              }
                            },
                            subParallel2: {
                              def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/parallel2/subState1', },
                              sub: {
                                initial: 'subSubState5',
                                states: {
                                  subSubState5: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/parallel2/subState1/subParallel2',
                                      events: {
                                        subEvent2: [{ to: 'subSubState6', guards: [], actions: [] }]
                                      }
                                    },
                                    sub: null,
                                  },
                                  subSubState6: {
                                    def: {
                                      ...DFL_NORM_ST_DEF_DEF,
                                      pPath: '/state1/parallel2/subState1/subParallel2',
                                      final: true,
                                    },
                                    sub: null,
                                  }
                                }
                              }
                            },
                          },
                        },
                      },
                      subState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/parallel2', final: true, },
                        sub: null,
                      },
                    }
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

    test.todo('8: invoke', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
        ({ on, invoke, subStates }) => ({
          state1: [
            invoke({ input: ({ c }) => c.count },
              async (count: number) => count + 1,
              { done: { to: 'state2' } }
            ),
          ],
          state2: [
            subStates({})
          ],
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state1/subState1', '/state1/subState1/subSubState1', '/state1/subState1/subSubState2', '/state1/subState2', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              builtinEvents: {
                ':childDone:': [{ to: 'state2', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: 'state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              states: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    builtinEvents: {
                      ':childDone:': [{ to: 'subState2', actions: [], guards: [] }],
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    states: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [{ to: 'subSubState2', guards: [], actions: [] }],
                          }
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
              states: {}
            },
          },
        }
      })
    })

    test.todo('9.1: 不正な Transition: 通常イベント', async () => {
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

    test.todo('9.2: 不正な Transition: ビルトインイベント', async () => {
      expect(() =>
        getDefinitionAndCatalog(
          {
            types: { events: {} as { type: 'event1' } | { type: 'event2'; number: number } | { type: 'event3' } },
            initContext: () => ({ count: 1 }),
          },
          ({ on }) => ({
            state1: [
              on(':always:', { to: 'hogehoge' }),
              on('event1', { to: 'state2' }),
            ],
            state2: null,
          }),
        ),
      ).toThrow(/Invalid transition/)
    })

    test('9.3: subStates をパスで遷移', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
            entryHook(() => console.log('enter state1'),),
            exitHook(() => console.log('exit state1'),),
            on('event1', { to: './subState2', guard: (c) => false }),
            on('event3', { to: '/state2', guard: (c) => false }),
            on(':childDone:', { to: '../state2' }),
            subStates({
              subState1: [
                on('subEvent1', { to: '/state1/subState2' }),
                on(':childDone:', { to: '/state2' }),
                subStates({
                  subSubState1: [on('event3', { to: 'subSubState2' })],
                  subSubState2: [on('event3', { to: '/state1/subState1/subSubState1' })],
                })
              ],
              subState2: null,
            }),
          ],
          state2: null,
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state1/subState1', '/state1/subState1/subSubState1', '/state1/subState1/subSubState2', '/state1/subState2', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              entryHooks: [expect.any(Function)],
              exitHooks: [expect.any(Function)],
              builtinEvents: {
                ':childDone:': [{ to: '../state2', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: './subState2', guards: [expect.any(Function)], actions: [] }],
                event3: [{ to: '/state2', guards: [expect.any(Function)], actions: [] }],
              },
            },
            sub: {
              initial: 'subState1',
              states: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    builtinEvents: {
                      ':childDone:': [{ to: '/state2', actions: [], guards: [] }],
                    },
                    events: {
                      subEvent1: [{ to: '/state1/subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    states: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [{ to: 'subSubState2', guards: [], actions: [] }],
                          }
                        },
                        sub: null,
                      },
                      subSubState2: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            event3: [{ to: '/state1/subState1/subSubState1', guards: [], actions: [] }],
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
        }
      })
    })

    test('10: AttachJot', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
        {
          types: {
            events: {} as
              | { type: 'event1' }
              | { type: 'event2'; number: number }
              | { type: 'event3' }
          },
          initContext: () => ({ count: 1 }),
        },
        ({ on, AttachJot }) => ({
          state1: AttachJot({ jotValue: 11 }, [
            on('event1', { actions: () => console.log('event1 in state1') }),
            on('event2', { to: 'state2' }),
          ]),
          state2: null
        }),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              deriveJot: expect.any(Function),
              events: {
                event1: [{ guards: [], actions: [expect.any(Function)] }],
                event2: [{ to: 'state2', guards: [], actions: [] }],
              },
            },
            sub: null,
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          },
        }
      })
    })

    test('11.1: AttachJot + subStates', async () => {
      const { definition, stateCatalog } = getDefinitionAndCatalog(
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
        ({ on, AttachJot, subStates }) => (
          {
            state1: AttachJot({ jotValue: 11 }, [
              on(':childDone:', { to: 'state2' }),
              on('event1', { to: 'state2', actions: ({ jot }) => console.log(jot.jotValue) }),
              on('event2', { actions: ({ jot }) => console.log(jot.jotValue) }),
              subStates({
                subState1: AttachJot(({ jot }: { jot: { jotValue: number } }) => ({ ...jot, subJotValue: 22 }), [
                  on('subEvent1', { to: 'subState2' }),
                  on(':childDone:', { to: '/state2' }),
                  subStates({
                    subSubState1: [
                      on('subEvent2', { to: 'subSubState2' })
                    ],
                    subSubState2: null,
                  })
                ]),
                subState2: [
                  on('event2', { actions: ({ c, jot }) => c })
                ],
              })
            ]),
            state2: null,
          }
        ),
      )

      expect([...stateCatalog.keys()]).toEqual(['/state1', '/state1/subState1', '/state1/subState1/subSubState1', '/state1/subState1/subSubState2', '/state1/subState2', '/state2'])

      expect(definition).toEqual({
        initial: 'state1',
        builtinEvents: {},
        events: {},
        states: {
          state1: {
            def: {
              ...DFL_NORM_ST_DEF_DEF,
              pPath: '',
              deriveJot: expect.any(Function),
              builtinEvents: {
                ':childDone:': [{ to: 'state2', actions: [], guards: [] }],
              },
              events: {
                event1: [{ to: 'state2', guards: [], actions: [expect.any(Function),] }],
                event2: [{ guards: [], actions: [expect.any(Function),] }],
              },
            },
            sub: {
              initial: 'subState1',
              states: {
                subState1: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    deriveJot: expect.any(Function),
                    builtinEvents: {
                      ':childDone:': [{ to: '/state2', actions: [], guards: [] }],
                    },
                    events: {
                      subEvent1: [{ to: 'subState2', guards: [], actions: [] }],
                    },
                  },
                  sub: {
                    initial: 'subSubState1',
                    states: {
                      subSubState1: {
                        def: {
                          ...DFL_NORM_ST_DEF_DEF,
                          pPath: '/state1/subState1',
                          events: {
                            subEvent2: [{ to: 'subSubState2', guards: [], actions: [] }],
                          }
                        },
                        sub: null,
                      },
                      subSubState2: {
                        def: { ...DFL_NORM_ST_DEF_DEF, pPath: '/state1/subState1', final: true },
                        sub: null
                      },
                    }
                  },
                },
                subState2: {
                  def: {
                    ...DFL_NORM_ST_DEF_DEF,
                    pPath: '/state1',
                    events: {
                      event2: [{ actions: [expect.any(Function)], guards: [] }]
                    }
                  },
                  sub: null
                },
              }
            },
          },
          state2: {
            def: { ...DFL_NORM_ST_DEF_DEF, pPath: '', final: true },
            sub: null,
          }
        }
      })
    })


  })
})
