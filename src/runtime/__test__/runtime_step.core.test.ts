import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import type {
  NormalizedDefinition,
  NormalizedStateItemBoth,
} from '../../machine/m.types'
import type { RecursiveRecord } from '../../shared/general.types'
import { deriveCommonPathPrefix } from '../../shared/utils'
import {
  __test__,
  deleteNodeFromStateTree,
  deriveEventTransition,
  genExitPaths,
  readyAction,
  updateStateTreeForEntry,
} from '../runtime_step.core'
import { runtimeUtils } from '../runtime_utils'

const { o_readyToGetParallelPathIfExited, x_removeConflictedTransitions, oo_adjustSrcPathForParallel } = __test__

const DFL_NST_ITEM_DEF = {
  pPath: '',
  final: false,
  //tags: new Set<string>(),
  entryHooks: null,
  exitHooks: null,
  invocations: [],
  internalEvents: {},
  events: {},
}

describe('runtime_step.core', () => {
  beforeAll(async () => { })

  describe('readyAction()', () => {
    describe('1: check/enqueue, emit, update', () => {
      let mockFn1: jest.Mock
      beforeEach(() => {
        mockFn1 = jest.fn()
      })

      let readied: ReturnType<
        typeof readyAction<
          { name: string; count: number; flag: boolean },
          { type: 'eventFoo'; value: number },
          null,
          { type: 'emittedFoo' },
          { guardFalse: unknown; guardFoo: { value: number } },
          { inc: unknown }
        >
      >
      const context = { name: '', count: 0, flag: false as boolean }
      beforeEach(async () => {
        readied = readyAction(
          context,
          { type: 'eventFoo', value: 5 },
          null,
          { guardFalse: () => false, guardFoo: (_, { value }: { value: number }) => value > 5 },
          {
            inc: ({ c, update }) => update({ count: c.count + 1 }),
          },
          (emitted) => mockFn1(emitted),
        )
      })

      test('check', async () => {
        const { execAction } = readied
        execAction(({ check }) => {
          expect(check('guardFalse')).toBe(false)
          expect(check('guardFoo', { value: 5 })).toBe(false)
          expect(check('guardFoo', { value: 6 })).toBe(true)
          expect(
            check('guardFoo', ({ c, e }) => {
              expect(c).toEqual({
                name: '',
                count: 0,
                flag: false,
              })
              expect(e).toEqual({ type: 'eventFoo', value: 5 })
              return { value: e.value }
            }),
          ).toBe(false)
        })

        const { getResult } = readied
        expect(getResult().context, 'context 同一性確認').toBe(context)
      })

      test('emit', async () => {
        const { execAction } = readied
        execAction(({ emit }) => {
          emit({ type: 'emittedFoo' })
        })
        expect(mockFn1).toHaveBeenCalledTimes(1)
        expect(mockFn1.mock.calls[0]).toEqual([{ type: 'emittedFoo' }])

        const { getResult } = readied
        expect(getResult().context, 'context 同一性確認').toBe(context)
      })

      test('update 1', async () => {
        const { execAction, getResult } = readied
        execAction(({ c, update }) => {
          expect(c).toEqual({
            name: '',
            count: 0,
            flag: false,
          })
          update({ name: 'ken' })
          update({ flag: true })
          expect(c).toEqual({
            name: '',
            count: 0,
            flag: false,
          })
        })
        execAction('inc')
        execAction('inc')
        expect(getResult().context).toEqual({
          name: 'ken',
          count: 2,
          flag: true,
        })

        expect(getResult().context, 'context 非同一性確認').not.toBe(context)
      })

      test('update 2', async () => {
        const { execAction, processQueue, getResult } = readied
        execAction(({ c, check, enqueue, update }) => {
          expect(c, '初期状態').toEqual({
            name: '',
            count: 0,
            flag: false,
          })

          enqueue(({ c }) => {
            expect(c, 'processQueue 開始時').toEqual({
              name: '',
              count: 10,
              flag: true,
            })
          })
          enqueue('inc')
          enqueue(({ c, update }) => {
            expect(c).toEqual({
              name: '',
              count: 11,
              flag: true,
            })
            update({ name: 'emi' })
          })

          update({ count: 10, flag: true })
        })
        processQueue()
        expect(getResult().context).toEqual({
          name: 'emi',
          count: 11,
          flag: true,
        })

        expect(getResult().context, 'context 非同一性確認').not.toBe(context)
      })
    })
  })

  describe('genExitPaths()', () => {
    test('1: crrStateTree に指定したパスがないときにはエラー', async () => {
      expect(() => [...genExitPaths('/a/ab', { a: {} })]).toThrow(/is not found/)
    })

    test('2: 指定されたパス以下に続くものがないときには指定されたパスのみを返す', async () => {
      expect([...genExitPaths('/a/ab', { a: { aa: {}, ab: {} } })]).toEqual(['/a/ab'])
    })

    test('3: 指定されたパス以下のパスを深いものから列挙する', async () => {
      expect([
        ...genExitPaths('/a/ab', {
          a: { aa: {}, ab: { aba: {}, abb: { abba: { abbaa: {} }, abbb: {}, abbc: {} }, abc: {} } },
        }),
      ]).toEqual([
        '/a/ab/aba',
        '/a/ab/abb/abba/abbaa',
        '/a/ab/abb/abba',
        '/a/ab/abb/abbb',
        '/a/ab/abb/abbc',
        '/a/ab/abb',
        '/a/ab/abc',
        '/a/ab',
      ])
    })
  })

  describe('deleteNodeFromStateTree: 指定されたパスの末端を削除する', () => {
    test('1:', async () => {
      const target: RecursiveRecord = { a: {} }
      deleteNodeFromStateTree(['a'], target)
      expect(target).toEqual({})
    })

    test('2:', async () => {
      const target: RecursiveRecord = { a: { aa: { aaa: {} } } }
      deleteNodeFromStateTree(['a', 'aa', 'aaa'], target)
      expect(target).toEqual({ a: { aa: {} } })
    })

    test('3:', async () => {
      const target: RecursiveRecord = { a: { aa: {}, ab: {} } }
      deleteNodeFromStateTree(['a', 'aa'], target)
      expect(target).toEqual({ a: { ab: {} } })
    })
  })

  describe('updateStateTreeForEntry()', () => {
    test('1: 新しいステートの内新規に入るステートについて浅い階層から順に定義を返す', async () => {
      const destStates = [['a', 'ab', 'aba']] // 新しいステート
      const crrStateTree: RecursiveRecord = { a: {} }
      const results = [
        ...updateStateTreeForEntry(destStates, crrStateTree, {
          initial: 'a',
          states: {
            a: {
              def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a'] },
              sub: {
                initial: 'aa',
                states: {
                  aa: {
                    def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aa'] },
                    sub: {
                      initial: 'aaa',
                      states: {
                        aaa: {
                          def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aaa'] },
                          sub: null,
                        },
                      },
                    },
                  },
                  ab: {
                    def: { ...DFL_NST_ITEM_DEF, entryHooks: ['ab'] },
                    sub: {
                      initial: 'aba',
                      states: {
                        aba: {
                          def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aba'] },
                          sub: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ]

      expect(results.map(([stateName]) => stateName)).toEqual(['ab', 'aba'])

      expect(crrStateTree, 'crrStateTree に新しい経路を追加する（削除は行わない）').toEqual({ a: { ab: { aba: {} } } })
    })

    test('2: fullToSplittees 以下にサブステートがある場合、その末端までが新しいステートとなる', async () => {
      const destStates = [['a']] // これより下に子ステートがある
      const crrStateTree: RecursiveRecord = {}
      expect(
        [
          ...updateStateTreeForEntry(destStates, crrStateTree, {
            initial: 'a',
            states: {
              a: {
                def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a'] },
                sub: {
                  initial: 'ab',
                  states: {
                    aa: {
                      def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aa'] },
                      sub: {
                        initial: 'aaa',
                        states: {
                          aaa: {
                            def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aaa'] },
                            sub: null,
                          },
                        },
                      },
                    },
                    ab: {
                      def: { ...DFL_NST_ITEM_DEF, entryHooks: ['ab'] },
                      sub: {
                        initial: 'aba',
                        states: {
                          aba: {
                            def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aba'] },
                            sub: null,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        ].map(([stateName]) => stateName),
      ).toEqual(['a', 'ab', 'aba'])

      expect(crrStateTree, 'crrStateTree に新しい経路を追加する').toEqual({ a: { ab: { aba: {} } } })
    })

    describe('parallel 1', () => {
      const stateDefinition: NormalizedDefinition = {
        initial: 'a',
        states: {
          a: {
            def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a'] },
            sub: {
              dType: 'parallel',
              states: {
                a1: {
                  def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a1'] },
                  sub: {
                    initial: 'a1a',
                    states: {
                      a1a: {
                        def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a1a'] },
                        sub: null,
                      },
                      a1b: {
                        def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a1b'] },
                        sub: null,
                      },
                    },
                  },
                },
                a2: {
                  def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2'] },
                  sub: {
                    initial: 'a2b',
                    states: {
                      a2a: {
                        def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2a'] },
                        sub: null,
                      },
                      a2b: {
                        def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b'] },
                        sub: {
                          dType: 'parallel',
                          states: {
                            a2b1: {
                              def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b1'] },
                              sub: {
                                initial: 'a2b1a',
                                states: {
                                  a2b1a: {
                                    def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b1a'] },
                                    sub: null,
                                  },
                                  a2b1b: {
                                    def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b1b'] },
                                    sub: null,
                                  },
                                },
                              },
                            },
                            a2b2: {
                              def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b2'] },
                              sub: {
                                initial: undefined,
                                states: {},
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      test('3.1: ステート遷移先が parallel である場合、子がすべて対象になる', async () => {
        const destStates = [['a']] // これより下に子ステートがある
        const crrStateTree: RecursiveRecord = { a: {} }
        expect(
          [...updateStateTreeForEntry(destStates, crrStateTree, stateDefinition)].map(([stateName]) => stateName),
        ).toEqual(['a1', 'a1a', 'a2', 'a2b', 'a2b1', 'a2b1a', 'a2b2'])

        expect(crrStateTree, 'crrStateTree に新しい経路を追加する').toEqual({
          a: {
            a1: {
              a1a: {},
            },
            a2: {
              a2b: {
                a2b1: {
                  a2b1a: {},
                },
                a2b2: {},
              },
            },
          },
        })
      })

      test('3.2: parallel の leaf を指定した場合でも途中の parallel も起動する', async () => {
        const destStates = [['a', 'a1', 'a1b']] // これより下に子ステートがある
        const crrStateTree: RecursiveRecord = { a: { a1: {} } }
        expect(
          [...updateStateTreeForEntry(destStates, crrStateTree, stateDefinition)].map(([stateName]) => stateName),
        ).toEqual(['a1b', 'a2', 'a2b', 'a2b1', 'a2b1a', 'a2b2'])

        expect(crrStateTree, 'crrStateTree に新しい経路を追加する').toEqual({
          a: {
            a1: {
              a1b: {},
            },
            a2: {
              a2b: {
                a2b1: {
                  a2b1a: {},
                },
                a2b2: {},
              },
            },
          },
        })
      })

      test('3.3: parallel の leaf を指定した場合でも途中の parallel も起動する', async () => {
        const destStates = [
          ['a', 'a1', 'a1a'],
          ['a', 'a2', 'a2b'],
        ]
        const crrStateTree: RecursiveRecord = {
          a: {
            a1: {},
            a2: {},
          },
        }
        expect(
          [...updateStateTreeForEntry(destStates, crrStateTree, stateDefinition)].map(([stateName]) => stateName),
        ).toEqual(['a1a', 'a2b', 'a2b1', 'a2b1a', 'a2b2'])

        expect(crrStateTree, 'crrStateTree に新しい経路を追加する').toEqual({
          a: {
            a1: {
              a1a: {},
            },
            a2: {
              a2b: {
                a2b1: {
                  a2b1a: {},
                },
                a2b2: {},
              },
            },
          },
        })
      })
    })
  })

  //describe.skip('diggStateNode()', () => {
  //  beforeAll(async () => {
  //  })
  //  test('1: ツリーがないときには空リストを返す', async () => {
  //    expect(diggStateNode('', {})).toEqual([])
  //    expect(diggStateNode('xxx', {})).toEqual([])
  //  })

  //  test('2: ツリーがあるときには走査した分のパスを返す', async () => {
  //    expect(diggStateNode('xxx', { aaa: {} })).toEqual(['xxx/aaa'])
  //    expect(diggStateNode('xxx', {
  //      aaa: {
  //        eee: { hhh: {}, iii: { lll: {} } },
  //        fff: {},
  //        ggg: { ooo: { qqq: {} } }
  //      },
  //      bbb: {}
  //    })).toEqual([
  //      'xxx/aaa/eee/hhh',
  //      'xxx/aaa/eee/iii/lll',
  //      'xxx/aaa/fff',
  //      'xxx/aaa/ggg/ooo/qqq',
  //      'xxx/bbb',
  //    ])
  //  })
  //})

  describe('deriveEventTransition()', () => {
    beforeAll(async () => { })
    const GLOBAL_DEF_ITEM = { events: {}, internalEvents: {} }

    test('1: "/A/AA/AAA" のとき、"foo" イベントが投げられたとき、"/A/AA/AAC" を遷移先にする', async () => {
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { A: { AA: { AAA: {} } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            [
              '/A',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  events: {
                    foo: [{ to: 'B', fullTo: '/B', guards: [], actions: [] }],
                  },
                },
                sub: null,
              },
            ],
            [
              '/A/AA',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/A',
                  events: {
                    foo: [{ to: 'AB', fullTo: '/A/Ab', guards: [], actions: [] }],
                  },
                },
                sub: null,
              },
            ],
            [
              '/A/AA/AAA',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/A/AA',
                  events: {
                    foo: [
                      { to: 'AAB', fullTo: '/A/AA/AAB', guards: [() => false], actions: [] },
                      { to: 'AAC', fullTo: '/A/AA/AAC', guards: [], actions: [] },
                      { to: 'AAD', fullTo: '/A/AA/AAD', guards: [], actions: [] },
                    ],
                  },
                },
                sub: null,
              },
            ],
          ]),
          [], // regionPaths,
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          from: '/A/AA/AAA',
          tIndex: 1,
          transition: {
            to: 'AAC',
            fullTo: '/A/AA/AAC',
            actions: [],
            guards: [],
          },
        },
      ])
    })

    test('2: subStates (非parallel) では leaves は遷移元の候補を表す', async () => {
      const regionPaths = ['/a/a1', '/a/a2']
      const fooEventOf = {
        '/a': [{ to: '/a/a1/a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }], // こっちが発火する
        '/a/a1/a1a/a1aa': [{ to: '/b', fullTo: '/b', guards: [() => false], actions: [] }], // guards が false なので発火しない
      }
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: { a1aa: {} } }, a2: { a2a: {} } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            [
              '/a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  events: { foo: fooEventOf['/a'] },
                },
                sub: null,
              },
            ],
            [
              '/a/a1',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a',
                },
                sub: null,
              },
            ],
            [
              '/a/a1/a1a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/aa',
                },
                sub: null,
              },
            ],
            [
              '/a/a1/a1a/a1aa',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/aa/aaa',
                  events: { foo: fooEventOf['/a/a1/a1a/a1aa'] },
                },
                sub: null,
              },
            ],
            [
              '/a/a2',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a2a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2',
                },
                sub: null,
              },
            ],
          ]),
          regionPaths,
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          from: '/a/a1/a1a/a1aa',
          tIndex: 0,
          transition: {
            actions: [],
            fullTo: '/a/a1/a1b',
            guards: [],
            to: '/a/a1/a1b',
          },
        },
      ])
    })

    test('3.1: region を抜けない遷移', async () => {
      const regionPaths = ['/a/a2/a21', '/a/a2/a22', '/a/a1', '/a/a2']
      const fooEventOf = {
        '/a/a1/a1a': [{ to: 'a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }],
        // NOTE: この遷移が正当かどうかはともかくとして、leaves に '/a/a2/a21/a21a' が含まれてしまうので遷移実行には leaves を検証し exit されるものを調整する必要がある
        '/a/a2': [{ to: '/a/a2/a22/a22c', fullTo: '/a/a2/a22/a22c', guards: [], actions: [] }],
      }
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: {} }, a2: { a21: { a21a: {} }, a22: { a22a: {} } } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            [
              '/a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                },
                sub: null,
              },
            ],
            [
              '/a/a1',
              {
                def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
                sub: null,
              },
            ],
            [
              '/a/a1/a1a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a1',
                  events: { foo: fooEventOf['/a/a1/a1a'] },
                },
                sub: null,
              },
            ],
            [
              '/a/a2',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a',
                  events: { foo: fooEventOf['/a/a2'] },
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a21',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a21/a21a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a21',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a22',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a22/a22a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a22',
                },
                sub: null,
              },
            ],
          ]),
          regionPaths,
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          from: '/a/a1/a1a',
          tIndex: 0,
          transition: {
            to: 'a1b',
            fullTo: '/a/a1/a1b',
            actions: [],
            guards: [],
          },
        },
        {
          from: '/a/a2/a22/a22a',
          tIndex: 0,
          transition: {
            to: '/a/a2/a22/a22c',
            fullTo: '/a/a2/a22/a22c',
            actions: [],
            guards: [],
          },
        },
      ])
    })

    test('3.2: region を抜ける遷移', async () => {
      const regionPaths = ['/a/a2/a21', '/a/a2/a22', '/a/a1', '/a/a2']
      const fooEventOf = {
        '/a/a1/a1a': [{ to: 'a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }], // これは候補に挙がるが棄却される
        '/a/a2': [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
      }
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: {} }, a2: { a21: { a21a: {} }, a22: { a22a: {} } } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            [
              '/a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                },
                sub: null,
              },
            ],
            [
              '/a/a1',
              {
                def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
                sub: null,
              },
            ],
            [
              '/a/a1/a1a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a1',
                  events: { foo: fooEventOf['/a/a1/a1a'] },
                },
                sub: null,
              },
            ],
            [
              '/a/a2',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a',
                  events: { foo: fooEventOf['/a/a2'] },
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a21',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a21/a21a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a21',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a22',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a22/a22a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a22',
                },
                sub: null,
              },
            ],
          ]),
          regionPaths,
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          from: '/a', // parallel root が遷移元になる
          tIndex: 0,
          transition: {
            to: '/b/ba',
            fullTo: '/b/ba',
            actions: [],
            guards: [],
          },
        },
      ])
    })

    describe('4: サブステートのいずれかがイベントにマッチしたとき、親ステートのイベントは発火しない', () => {
      test('4.1: 親に遷移先が指定されていても無視される', async () => {
        const regionPaths = ['/a/a1/a11', '/a/a1/a12', '/a/a1']
        const fooEventOf = {
          '/a/a1': [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
          '/a/a1/a11/a11a': [
            { guards: [() => false], actions: [] },
            { to: 'a11b', fullTo: '/a/a1/a11/a11b', guards: [], actions: [] },
          ],
        }
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            { a: { a1: { a11: { a11a: {}, a11b: {} } } } },
            {}, // machineGuards
            // stateCatalog
            new Map<string, NormalizedStateItemBoth>([
              ['/a', { def: { ...DFL_NST_ITEM_DEF }, sub: null }],
              [
                '/a/a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a',
                    events: { foo: fooEventOf['/a/a1'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11/a11a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                    events: { foo: fooEventOf['/a/a1/a11/a11a'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11/a11b',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                  },
                  sub: null,
                },
              ],
            ]),
            regionPaths,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            from: '/a/a1/a11/a11a',
            tIndex: 1,
            transition: {
              to: 'a11b',
              fullTo: '/a/a1/a11/a11b',
              actions: [],
              guards: [],
            },
          },
        ])
      })

      test('4.2: 子に遷移先が無指定でも親は発火しない。遷移先無指定のため from は undefined になる', async () => {
        const regionPaths = ['/a/a1/a11', '/a/a1/a12', '/a/a1']
        const fooEventOf = {
          '/a/a1': [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
          '/a/a1/a11/a11a': [{ guards: [], actions: [] }],
        }
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            { a: { a1: { a11: { a11a: {}, a11b: {} } } } },
            {}, // machineGuards
            // stateCatalog
            new Map<string, NormalizedStateItemBoth>([
              ['/a', { def: { ...DFL_NST_ITEM_DEF }, sub: null }],
              [
                '/a/a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a',
                    events: { foo: fooEventOf['/a/a1'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11/a11a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                    events: { foo: fooEventOf['/a/a1/a11/a11a'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11/a11b',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                  },
                  sub: null,
                },
              ],
            ]),
            regionPaths,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            from: undefined,
            tIndex: 0,
            transition: {
              actions: [],
              guards: [],
            },
          },
        ])
      })

      test('4.3: 子と親に遷移先が無指定でも親は発火しない。遷移先無指定のため from は undefined になる', async () => {
        const regionPaths = ['/a/a1/a11', '/a/a1/a12', '/a/a1']
        const fooEventOf = {
          '/a/a1': [{ guards: [], actions: [] }],
          '/a/a1/a11/a11a': [{ guards: [], actions: [] }],
        }
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            { a: { a1: { a11: { a11a: {}, a11b: {} } } } },
            {}, // machineGuards
            // stateCatalog
            new Map<string, NormalizedStateItemBoth>([
              ['/a', { def: { ...DFL_NST_ITEM_DEF }, sub: null }],
              [
                '/a/a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a',
                    events: { foo: fooEventOf['/a/a1'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11/a11a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                    events: { foo: fooEventOf['/a/a1/a11/a11a'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11/a11b',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                  },
                  sub: null,
                },
              ],
            ]),
            regionPaths,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            from: undefined,
            tIndex: 0,
            transition: {
              actions: [],
              guards: [],
            },
          },
        ])
      })
    })

    describe('5: internalEvents', () => {
      const stateCatalog = new Map<string, NormalizedStateItemBoth>([
        [
          '/a',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              internalEvents: {
                ':childDone:': {
                  cond: ({ path }) => path === '/a',
                  transitions: [{ to: '/b', fullTo: '/b', guards: [], actions: [] }],
                },
              },
            },
            sub: null,
          },
        ],
        [
          '/a/a1',
          {
            def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
            sub: null,
          },
        ],
        [
          '/a/a1/a1a',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              pPath: '/a/a1',
            },
            sub: null,
          },
        ],
        [
          '/a/a2',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              pPath: '/a',
              internalEvents: {
                ':childDone:': {
                  cond: ({ path }) => path === '/a/a2',
                  transitions: [{ to: '/c', fullTo: '/c', guards: [], actions: [] }],
                },
              },
            },
            sub: null,
          },
        ],
        [
          '/a/a2/a21',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              pPath: '/a/a2',
            },
            sub: null,
          },
        ],
        [
          '/a/a2/a21/a21a',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              pPath: '/a/a2/a21',
            },
            sub: null,
          },
        ],
        [
          '/a/a2/a22',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              pPath: '/a/a2',
            },
            sub: null,
          },
        ],
        [
          '/a/a2/a22/a22a',
          {
            def: {
              ...DFL_NST_ITEM_DEF,
              pPath: '/a/a2/a22',
            },
            sub: null,
          },
        ],
      ])

      test('5.1: childDone', async () => {
        const regionPaths = ['/a/a2/a21', '/a/a2/a22', '/a/a1', '/a/a2']

        expect(
          deriveEventTransition(
            ':childDone:',
            { path: '/a' },
            runtimeUtils.makeFnBaseParam({}, { type: ':childDone:' }, undefined),
            { a: { a1: { a1a: {} }, a2: { a21: { a21a: {} }, a22: { a22a: {} } } } },
            {}, // machineGuards
            stateCatalog,
            regionPaths,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            from: '/a',
            tIndex: 0,
            transition: {
              to: '/b',
              fullTo: '/b',
              actions: [],
              guards: [],
            },
          },
        ])
      })

      test('5.2: childDone', async () => {
        const regionPaths = ['/a/a2/a21', '/a/a2/a22', '/a/a1', '/a/a2']

        expect(
          deriveEventTransition(
            ':childDone:',
            { path: '/a/a2' },
            runtimeUtils.makeFnBaseParam({}, { type: ':childDone:' }, undefined),
            //{ a: { a1: { a1a: {} }, a2: { a21: { a21a: {} }, a22: { a22a: {} } } } },
            { a: { a1: { a1a: {} }, a2: { a21: { a21a: {} } } } },
            {}, // machineGuards
            stateCatalog,
            regionPaths,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            from: '/a',
            tIndex: 0,
            transition: {
              to: '/c',
              fullTo: '/c',
              actions: [],
              guards: [],
            },
          },
        ])
      })
    })

    describe('6: global event', () => {
      test('6.1:', async () => {
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            { a: { a1: { a1a: {} }, a2: { a2a: { a2a1: { a2a1a: {} }, a2a2: { a2a2a: {} } } } } },
            {}, // machineGuards

            new Map<string, NormalizedStateItemBoth>([
              [
                '/a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1',
                {
                  def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a2',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a2/a2a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a2',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a2/a2a/a2a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a2/a2a',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a2/a2a/a2a1/a2a1a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a2/a2a/a2a1',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a2/a2a/a2a2',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a2/a2a',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a2/a2a/a2a2/a2a2a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a2/a2a/a2a2',
                  },
                  sub: null,
                },
              ],
            ]),

            [],

            {
              events: { foo: [{ to: 'b', fullTo: '/b', guards: [], actions: [] }] },
              internalEvents: {},
            },
          ),
        ).toEqual([
          {
            from: '/a',
            tIndex: 0,
            transition: {
              to: 'b',
              fullTo: '/b',
              actions: [],
              guards: [],
            },
          },
        ])
      })
    })

    test.skip('0.0: 実験用', async () => {
      const regionPaths = ['/a/a2/a2a/a2a1', '/a/a2/a2a/a2a2', '/a/a1', '/a/a2']

      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: {} }, a2: { a2a: { a2a1: { a2a1a: {} }, a2a2: { a2a2a: {} } } } } },
          {}, // machineGuards

          new Map<string, NormalizedStateItemBoth>([
            [
              '/a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  events: {
                    foo: [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
                  },
                },
                sub: null,
              },
            ],
            [
              '/a/a1',
              {
                def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
                sub: null,
              },
            ],
            [
              '/a/a1/a1a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a1',
                },
                sub: null,
              },
            ],
            [
              '/a/a2',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a',
                  //events: { foo: [{ to: '/a/a2/a21b', fullTo: '/a/a2/a21b', guards: [], actions: [] }], }
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a2a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2',
                  events: { foo: [{ to: 'a2b', fullTo: '/a/a2/a2b', guards: [], actions: [] }] },
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a2a/a2a1',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a2a',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a2a/a2a1/a2a1a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a2a/a2a1',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a2a/a2a2',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a2a',
                },
                sub: null,
              },
            ],
            [
              '/a/a2/a2a/a2a2/a2a2a',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2/a2a/a2a2',
                },
                sub: null,
              },
            ],
          ]),

          regionPaths,
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          from: '',
          tIndex: 0,
          transition: {
            to: '',
            fullTo: '',
            actions: [],
            guards: [],
          },
        },
      ])
    })
  })

  describe('o_readyToFindAlwaysTransition', () => {
    test('0:この関数の処理想定範囲外', async () => {
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1', '/a/a2'])('/a/a1/a1a', '/a'),
        '自身のパラレルルートを 第二引数 fullTo に指定されることは想定していない',
      ).toBe('/a')
    })

    test('1:parallel を抜けないときは空文字を返す', async () => {
      expect(o_readyToGetParallelPathIfExited(['/a/a1', '/a/a2'])('/a/a1/a1a', '/a/a1/a1b')).toBe('')
    })

    test('2:第二引数fullTo が regionPath から始まっていないなら脱出と見なす', async () => {
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1', '/a/a2'])('/a', '/b'),
        '対象パスがregion以下でないときは空文字を返す',
      ).toBe('')
      expect(o_readyToGetParallelPathIfExited(['/a/a1', '/a/a2'])('/a/a1', '/b')).toBe('/a')
      expect(o_readyToGetParallelPathIfExited(['/a/a1', '/a/a2'])('/a/a1/a1a', '/b')).toBe('/a')
    })

    test('3:サブステートからの移動', async () => {
      // 完全脱出
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1/a1a/a1a1', '/a/a1/a1a/a1a2', '/a/a1', '/a/a2'])(
          '/a/a1/a1a/a1a1/a1a1b',
          '/b',
        ),
      ).toBe('/a')

      // 兄弟移動
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1/a1a/a1a1', '/a/a1/a1a/a1a2', '/a/a1', '/a/a2'])(
          '/a/a1/a1a/a1a1/a1a1b',
          '/a/a1/a1a/a1a1/a1a1c',
        ),
      ).toBe('')
      // 親（リージョン）への移動
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1/a1a/a1a1', '/a/a1/a1a/a1a2', '/a/a1', '/a/a2'])(
          '/a/a1/a1a/a1a1/a1a1b',
          '/a/a1/a1a/a1a1',
        ),
      ).toBe('')

      // 根は同じままパラレルルート以上への移動
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1/a1a/a1a1', '/a/a1/a1a/a1a2', '/a/a1', '/a/a2'])(
          '/a/a1/a1a/a1a1/a1a1b',
          '/a/a1/a1a',
        ),
      ).toBe('/a/a1/a1a')
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1/a1a/a1a1', '/a/a1/a1a/a1a2', '/a/a1', '/a/a2'])(
          '/a/a1/a1a/a1a1/a1a1b',
          '/a/a1',
        ),
      ).toBe('/a/a1/a1a')
      expect(
        o_readyToGetParallelPathIfExited(['/a/a1/a1a/a1a1', '/a/a1/a1a/a1a2', '/a/a1', '/a/a2'])(
          '/a/a1/a1a/a1a1/a1a1b',
          '/a',
        ),
      ).toBe('/a')
    })
  })

  describe('x_removeConflictedTransitions()', () => {
    beforeAll(async () => { })

    describe('1: from (移動元)の選ばれ方', () => {
      beforeAll(async () => { })

      test('1.1: leaves から fullTo と同族のステートが from として選ばれる', async () => {
        expect(
          x_removeConflictedTransitions(
            [
              {
                firedIn: '/a',
                leaves: ['/a/a1/a1a', '/a/a2/a2b/a2ba'],
                tIndex: 0,
                transition: { to: '/a/a2/a2c', fullTo: '/a/a2/a2c', actions: [], guards: [] },
              },
            ],
            ['/a/a1', '/a/a2'],
          ),
        ).toEqual([
          {
            from: '/a/a2/a2b/a2ba',
            tIndex: 0,
            transition: { to: '/a/a2/a2c', fullTo: '/a/a2/a2c', actions: [], guards: [] },
          },
        ])
      })

      test('1.2: fullTo と同族のステートがない場合、 leaves のパス群の共通親が from として選ばれる', async () => {
        expect(
          x_removeConflictedTransitions(
            [
              {
                firedIn: '/a',
                leaves: ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b/aa2ba'],
                tIndex: 0,
                transition: { to: '/b', fullTo: '/b', actions: [], guards: [] },
              },
            ],
            ['/a/aa/aa1', '/a/aa/aa2'],
          ),
        ).toEqual([{ from: '/a/aa', tIndex: 0, transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } }])
      })
    })

    test('2.1: parallel 外から parallel への遷移', async () => {
      expect(
        x_removeConflictedTransitions(
          [
            {
              firedIn: '/b',
              tIndex: 0,
              leaves: ['/b/ba'],
              transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] },
            },
          ],
          ['/a/a1', '/a/a2', '/a/a3', '/a/a4'],
        ),
      ).toEqual([
        { from: '/b/ba', tIndex: 0, transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } },
      ])
    })

    test('2.2: 別 parallel から parallel への遷移', async () => {
      expect(
        x_removeConflictedTransitions(
          [
            {
              firedIn: '/b',
              leaves: ['/b/b1/b1a', '/b/b2/b2a'],
              tIndex: 0,
              transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] },
            },
          ],
          ['/a/a1', '/a/a2', '/a/a3', '/a/a4', '/b/b1', '/b/b2'],
        ),
      ).toEqual([{ from: '/b', tIndex: 0, transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } }])
    })

    test('3: 同じ parallel から抜ける遷移が複数あるとき、先に定義されているほうを採用する。to がない処理はそのまま残す', async () => {
      expect(
        x_removeConflictedTransitions(
          [
            {
              firedIn: '/a/a1/a1a',
              leaves: ['/a/a1/a1a'],
              tIndex: 0,
              transition: { to: '/b', fullTo: '/b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a2/a2a',
              leaves: ['/a/a2/a2a'],
              tIndex: 0,
              transition: { to: '/c', fullTo: '/c', actions: [], guards: [] },
            },
            { firedIn: '/a/a3/a3a', leaves: ['/a/a3/a3a'], tIndex: 0, transition: { actions: [], guards: [] } },
            {
              firedIn: '/a/a4/a4b/a4ba',
              leaves: ['/a/a4/a4b/a4ba'],
              tIndex: 0,
              transition: { to: '/d', fullTo: '/d', actions: [], guards: [] },
            },
          ],
          ['/a/a1', '/a/a2', '/a/a3', '/a/a4'],
        ),
      ).toEqual([
        { from: undefined, tIndex: 0, transition: { actions: [], guards: [] } },
        { from: '/a', tIndex: 0, transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
      ])
    })

    test('4: 同 region 内の遷移は除去されない', async () => {
      expect(
        x_removeConflictedTransitions(
          [
            {
              firedIn: '/a/a1/a1c',
              leaves: ['/a/a1/a1c'],
              tIndex: 0,
              transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a2/a2a/a2a1/a2a1a',
              leaves: ['/a/a2/a2a/a2a1/a2a1a'],
              tIndex: 0,
              transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a2/a2a/a2a2/a2a2b',
              leaves: ['/a/a2/a2a/a2a2/a2a2b'],
              tIndex: 0,
              transition: { to: '/a/a2/a2a/a2a2/a2a2c', fullTo: '/a/a2/a2a/a2a2/a2a2c', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a3/a3b',
              leaves: ['/a/a3/a3b'],
              tIndex: 0,
              transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] },
            },
          ],
          ['/a/a2/a2a/a2a1', '/a/a2/a2a/a2a2', '/a/a1', '/a/a2', '/a/a3'],
        ),
      ).toEqual([
        { from: '/a/a1/a1c', tIndex: 0, transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
        {
          from: '/a/a2/a2a/a2a1/a2a1a',
          tIndex: 0,
          transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] },
        },
        {
          from: '/a/a2/a2a/a2a2/a2a2b',
          tIndex: 0,
          transition: { to: '/a/a2/a2a/a2a2/a2a2c', fullTo: '/a/a2/a2a/a2a2/a2a2c', actions: [], guards: [] },
        },
        { from: '/a/a3/a3b', tIndex: 0, transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
      ])
    })

    test('5: 入れ子の parallel 内での脱出は同じレベルの region にだけ影響を与える', async () => {
      expect(
        x_removeConflictedTransitions(
          [
            {
              firedIn: '/a/a1/a1c',
              leaves: ['/a/a1/a1c'],
              tIndex: 0,
              transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a2/a2a/a2a1/a2a1a',
              leaves: ['/a/a2/a2a/a2a1/a2a1a'],
              tIndex: 0,
              transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a2/a2a/a2a2/a2a2b',
              leaves: ['/a/a2/a2a/a2a2/a2a2b'],
              tIndex: 0,
              transition: { to: '/a/a2/a2b', fullTo: '/a/a2/a2b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a3/a3b',
              leaves: ['/a/a3/a3b'],
              tIndex: 0,
              transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] },
            },
          ],
          ['/a/a2/a2a/a2a1', '/a/a2/a2a/a2a2', '/a/a1', '/a/a2', '/a/a3'],
        ),
      ).toEqual([
        { from: '/a/a1/a1c', tIndex: 0, transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
        { from: '/a/a3/a3b', tIndex: 0, transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
        { from: '/a/a2/a2a', tIndex: 0, transition: { to: '/a/a2/a2b', fullTo: '/a/a2/a2b', actions: [], guards: [] } },
      ])
    })

    test('6: parallel を脱出すると配下の transition のうち遷移を含むものはすべてキャンセルされる', async () => {
      expect(
        x_removeConflictedTransitions(
          [
            { firedIn: '/a/a1/a1c', leaves: ['/a/a1/a1c'], tIndex: 0, transition: { actions: [], guards: [] } },
            {
              firedIn: '/a/a2/a2a/a2a1/a2a1a',
              leaves: ['/a/a2/a2a/a2a1/a2a1a'],
              tIndex: 0,
              transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a2/a2a/a2a2/a2a2b',
              leaves: ['/a/a2/a2a/a2a2/a2a2b'],
              tIndex: 0,
              transition: { to: '/b', fullTo: '/b', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a3/a3b',
              leaves: ['/a/a3/a3b'],
              tIndex: 0,
              transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] },
            },
            {
              firedIn: '/a/a4/a4a',
              leaves: ['/a/a4/a4a'],
              tIndex: 0,
              transition: { to: '/c', fullTo: '/c', actions: [], guards: [] },
            },
            { firedIn: '/a/a5/a5a', leaves: ['/a/a5/a5a'], tIndex: 0, transition: { actions: [], guards: [] } },
          ],
          ['/a/a2/a2a/a2a1', '/a/a2/a2a/a2a2', '/a/a1', '/a/a2', '/a/a3', '/a/a4', '/a/a5'],
        ),
      ).toEqual([
        { from: undefined, tIndex: 0, transition: { actions: [], guards: [] } },
        { from: undefined, tIndex: 0, transition: { actions: [], guards: [] } },
        { from: '/a', tIndex: 0, transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
      ])
    })
  })

  describe('oo_adjustSrcPathForParallel', () => {
    const REGION_PATHS = [
      '/a/aa/aa2/aa2a/aa2aa/aa2aa1',
      '/a/aa/aa2/aa2a/aa2aa/aa2aa2',
      '/a/aa/aa1/aa1a/aa1a1',
      '/a/aa/aa1/aa1a/aa1a2',
      '/a/aa/aa1',
      '/a/aa/aa2',
      '/a/ab/ab1',
      '/a/ab/ab2',
    ]

    test('1: 第一引数srcPathが regionPaths から始まらないならそのまま第一引数を返す', async () => {
      expect(oo_adjustSrcPathForParallel('/a/ac', '/a/aa', REGION_PATHS)).toBe('/a/ac')
    })

    describe('srcPath が region 内。srcPathをそのまま返すパターン', () => {
      test('1: from と to が兄弟であり region の孫', async () => {
        const src = '/a/aa/aa1/aa1a/aa1a1/aa1a1a/aa1a1aa'
        const dst = '/a/aa/aa1/aa1a/aa1a1/aa1a1a/aa1a1ab'
        expect(deriveCommonPathPrefix([src, dst]), 'commonPrefix').toBe('/a/aa/aa1/aa1a/aa1a1/aa1a1a')
        // commonPrefix が 最深regionPaths よりも長い -> src に渡したパスそのまま返す
        expect(oo_adjustSrcPathForParallel(src, dst, REGION_PATHS)).toBe('/a/aa/aa1/aa1a/aa1a1/aa1a1a/aa1a1aa')
      })
      test('2: region 以下の孫同士の遷移', async () => {
        const src = '/a/aa/aa1/aa1a/aa1a1/aa1a1a/aa1a1aa'
        const dst = '/a/aa/aa1/aa1a/aa1a1/aa1a1b/aa1a1ba'
        expect(deriveCommonPathPrefix([src, dst])).toBe('/a/aa/aa1/aa1a/aa1a1') // region
        // commonPrefix が 最深regionPath と同一 -> src パスをそのまま返す
        expect(oo_adjustSrcPathForParallel(src, dst, REGION_PATHS)).toBe('/a/aa/aa1/aa1a/aa1a1/aa1a1a/aa1a1aa')
      })
      test('3: from と to が兄弟であり同じ region の子', async () => {
        const src = '/a/aa/aa1/aa1a/aa1a1/aa1a1a'
        const dst = '/a/aa/aa1/aa1a/aa1a1/aa1a1b'
        expect(deriveCommonPathPrefix([src, dst])).toBe('/a/aa/aa1/aa1a/aa1a1') // region
        // commonPrefix が 最深regionPath と同一 -> src パスをそのまま返す
        expect(oo_adjustSrcPathForParallel(src, dst, REGION_PATHS)).toBe('/a/aa/aa1/aa1a/aa1a1/aa1a1a')
      })
    })

    describe('srcPath が region 内。parallel を求めて返すパターン', () => {
      test('4: region の子から一段上の region の兄弟へ', async () => {
        // 共通パス '/a/aa/aa1'
        // 抜けないparallel '/a/aa'
        // 抜けるparallel   '/a/aa/aa1/aa1a'
        const src = '/a/aa/aa1/aa1a/aa1a2/aa1a2b'
        const dst = '/a/aa/aa1/aa1b'
        expect(deriveCommonPathPrefix([src, dst])).toBe('/a/aa/aa1') // region
        expect(oo_adjustSrcPathForParallel(src, dst, REGION_PATHS)).toBe('/a/aa/aa1/aa1a')
      })
      test('5: 上段の region の孫 parallel の region から parallel の一つ親から見た兄弟へ', async () => {
        // 抜けないparallel '/a/aa'
        // 抜けるparallel   '/a/aa/aa2/aa2a'
        expect(oo_adjustSrcPathForParallel('/a/aa/aa2/aa2a/aa2aa/aa2aa1/aa2aa1a', '/a/aa/aa2/aa2b', REGION_PATHS)).toBe(
          '/a/aa/aa2/aa2a/aa2aa',
        )
      })
      test('6.1: 2つのparallel を抜ける 1', async () => {
        // 抜けるparallel   '/a/aa'
        expect(oo_adjustSrcPathForParallel('/a/aa/aa1/aa1a/aa1a1/aa1a1a', '/a/ab', REGION_PATHS)).toBe('/a/aa')
      })
      test('6.2: 2つのparallel を抜ける 2', async () => {
        // 抜けるparallel   '/a/aa'
        expect(oo_adjustSrcPathForParallel('/a/aa/aa1/aa1a/aa1a1/aa1a1a', '/b', REGION_PATHS)).toBe('/a/aa')
      })
      test('7.1: リージョンからparallel を2つ抜ける', async () => {
        // 抜けるparallel   '/a/aa'
        expect(oo_adjustSrcPathForParallel('/a/aa/aa1/aa1a/aa1a1', '/b', REGION_PATHS)).toBe('/a/aa')
      })
      test('7.2: パラレルから親パラレルを抜ける', async () => {
        // 抜けるparallel   '/a/aa'
        expect(oo_adjustSrcPathForParallel('/a/aa/aa1/aa1a', '/b', REGION_PATHS)).toBe('/a/aa')
      })
    })
  })
})
