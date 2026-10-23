import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import type { NormalizedDefinition, NormalizedStateItemBoth, ServiceRecord, TopLvStDefItem } from '../../machine/m.types'
import type { StateRoute } from '../r.types'
import {
  __test__,
  deriveEventTransition,
  genExitPathsAndDeleteFromCrrStates,
  readyAction,
  updateStateRouteForEntry,
} from '../runtime_step.core'
import { runtimeUtils } from '../runtime_utils'

const { x_removeConflictedTransitions, x_findDeepestTransitions, o_deriveLowestCommonAncestor } = __test__

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

  describe('o_deriveLowestCommonAncestor', () => {
    // 第一引数を基準として第二引数との共通部分のうち一番長いものを返す
    test('0:', async () => {
      expect(
        o_deriveLowestCommonAncestor('/a/aa/aa1/aa1c', [
          '/a/aa/aa1/aa1a/aa1a1/aa1a1a',
          '/a/aa/aa1/aa1a/aa1a2/aa1a2a',
          '/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa',
          '/a/aa/aa2/aa2b/aa2b2',
          '/a/aa/aa2/aa2b/aa2b3/aa2b3a',
        ]),
      ).toBe('/a/aa/aa1')
    })

    test('0:完全部分集合には非対応', async () => {
      expect(
        o_deriveLowestCommonAncestor('/a/aa', [
          '/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa',
          '/a/aa/aa2/aa2b/aa2b2',
          '/a/aa/aa2/aa2b/aa2b3/aa2b3a',
        ]),
      ).not.toBe('/a/aa') // /a になる
    })

    test('0:model と一致する最長のパスを返す', async () => {
      expect(
        o_deriveLowestCommonAncestor('/a/aa/aa1/aa1a/aa1ab', [
          '/b/ba',
          '/a/aa/aa1',
          '/a/aa/aa1/aa1a',
          '/a/aa/aa1/aa1c',
        ]),
      ).toBe('/a/aa/aa1')
    })
    test('1:同時に最長が決まった場合', async () => {
      expect(o_deriveLowestCommonAncestor('/a/aa/aa1/aa1a/aa1ab', ['/a/aa/aa1/x', '/a/aa/aa1/y', '/a/aa/aa1/z'])).toBe(
        '/a/aa/aa1',
      )
    })
    test('0:', async () => {
      expect(o_deriveLowestCommonAncestor('/aa/bb', ['/aa/cc', '/aaa/a'])).toBe('/aa')
    })
    test('0: 1段目のステートが不一致(超過)', async () => {
      expect(o_deriveLowestCommonAncestor('/aa/bb', ['/aaa/bb'])).toBe('')
    })
    test('0: 2段目のステートが不一致(不足)', async () => {
      expect(o_deriveLowestCommonAncestor('/aa/bb/ccc', ['/aa/b/cc'])).toBe('/aa')
    })
    describe('2:どちらかがどちらかの完全部分一致になるケースは未対応', () => {
      test('2:model が部分', async () => {
        expect(o_deriveLowestCommonAncestor('/a/aa', ['/a/aa/aa1'])).toBe('/a')
      })
      test('2:leaves が部分', async () => {
        expect(o_deriveLowestCommonAncestor('/a/aa/aa1', ['/a/aa'])).toBe('/a')
      })
      test('2.1: デリミタの手前までを判定（末尾のステートは対象外）', async () => {
        expect(o_deriveLowestCommonAncestor('/aa/bb', ['/aa/bb'])).toBe('/aa')
      })
      test('2.2: デリミタの手前までを判定（末尾のステートは対象外）', async () => {
        expect(o_deriveLowestCommonAncestor('/aa/bb', ['/aa/bb', '/aa/bb'])).toBe('/aa')
      })
    })
  })

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
          { inc: unknown },
          ServiceRecord
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
          { emit: (emitted) => mockFn1(emitted), children: {}, enqueueEvent: () => null },
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

  describe('genExitPathsAndDeleteFromCrrStates()', () => {
    // 第二引数で示したパスより下位のパスを stateRoute から削除しそれらのパスを深いところから順に yield する
    describe('非parallel', () => {
      test('0:lcaがルートのとき("/" でなくて "" と指定)', async () => {
        const stateRoute = ['a', 'ab', 'abc']
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '')
        expect([...result]).toEqual(['/a/ab/abc', '/a/ab', '/a'])
        expect(stateRoute).toEqual([])
      })

      test('0:', async () => {
        const stateRoute = ['a', 'ab', 'abc']
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '/a')
        expect([...result]).toEqual(['/a/ab/abc', '/a/ab'])
        expect(stateRoute).toEqual(['a'])
      })

      test('0:', async () => {
        const stateRoute = ['a', 'ab', 'abc']
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '/a/ab/abc')
        expect([...result]).toEqual([])
        expect(stateRoute).toEqual(['a', 'ab', 'abc'])
      })

      test('0:lca が route を超えると例外を投げる', async () => {
        const stateRoute = ['a', 'ab', 'abc']
        expect(() => [...genExitPathsAndDeleteFromCrrStates(stateRoute, '/a/ab/abc/abcd')]).toThrow(/is not found/)
      })

      test('0:lca が route に見つからないと例外を投げる', async () => {
        const stateRoute = ['a', 'ab', 'abc']
        expect(() => [...genExitPathsAndDeleteFromCrrStates(stateRoute, '/a/x')]).toThrow(/is not found/)
      })
    })

    describe('parallel', () => {
      test('1:', async () => {
        const stateRoute = ['a', { parallel: 'ab', regions: { ab1: ['ab1a', 'ab1ab'], ab2: [], ab3: ['ab3b'] } }]
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '/a')
        expect([...result]).toEqual([
          '/a/ab/ab1/ab1a/ab1ab',
          '/a/ab/ab1/ab1a',
          '/a/ab/ab1',
          '/a/ab/ab2',
          '/a/ab/ab3/ab3b',
          '/a/ab/ab3',
          '/a/ab',
        ])
        expect(stateRoute).toEqual(['a'])
      })

      test('2:parallelを指定', async () => {
        const stateRoute = ['a', { parallel: 'ab', regions: { ab1: ['ab1a', 'ab1ab'], ab2: [], ab3: ['ab3b'] } }]
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '/a/ab')
        expect([...result]).toEqual([
          '/a/ab/ab1/ab1a/ab1ab',
          '/a/ab/ab1/ab1a',
          '/a/ab/ab1',
          '/a/ab/ab2',
          '/a/ab/ab3/ab3b',
          '/a/ab/ab3',
        ])
        expect(stateRoute).toEqual(['a', { parallel: 'ab', regions: {} as any }])
      })

      test('3:regionを指定', async () => {
        const stateRoute = ['a', { parallel: 'ab', regions: { ab1: ['ab1a', 'ab1ab'], ab2: [], ab3: ['ab3b'] } }]
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '/a/ab/ab1')
        expect([...result]).toEqual(['/a/ab/ab1/ab1a/ab1ab', '/a/ab/ab1/ab1a'])
        expect(stateRoute).toEqual(['a', { parallel: 'ab', regions: { ab1: [], ab2: [], ab3: ['ab3b'] } }])
      })

      test('4:regionの子を指定', async () => {
        const stateRoute = ['a', { parallel: 'ab', regions: { ab1: ['ab1a', 'ab1ab'], ab2: [], ab3: ['ab3b'] } }]
        const result = genExitPathsAndDeleteFromCrrStates(stateRoute, '/a/ab/ab1/ab1a')
        expect([...result]).toEqual(['/a/ab/ab1/ab1a/ab1ab'])
        expect(stateRoute).toEqual(['a', { parallel: 'ab', regions: { ab1: ['ab1a'], ab2: [], ab3: ['ab3b'] } }])
      })
    })
  })

  describe('updateStateRouteForEntry()', () => {
    test('1: 新しいステートの内新規に入るステートについて浅い階層から順に定義を返す', async () => {
      const destSplittedStates = [['a', 'ab', 'aba']] // /a/ab/aba
      const crrStates = ['a']
      const results = [
        ...updateStateRouteForEntry(destSplittedStates, crrStates, {
          initial: 'a',
          stateOf: {
            a: {
              def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a'] },
              sub: {
                initial: 'aa',
                stateOf: {
                  aa: {
                    def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aa'] },
                    sub: {
                      initial: 'aaa',
                      stateOf: {
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
                      stateOf: {
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

      expect(results.map(([_, { stateName }]) => stateName)).toEqual(['ab', 'aba'])
      expect(results.map(([_, { isRegionChild }]) => isRegionChild)).toEqual([false, false])

      expect(crrStates, 'crrStateTree に新しい経路を追加する（削除は行わない）').toEqual(['a', 'ab', 'aba'])
    })

    test('2: fullToSplittees 以下にサブステートがある場合、その末端までが新しいステートとなる', async () => {
      const destSplittedStates = [['a']] // これより下に子ステートがある
      const crrStates = ['a']
      const results = [
        ...updateStateRouteForEntry(destSplittedStates, crrStates, {
          initial: 'a',
          stateOf: {
            a: {
              def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a'] },
              sub: {
                initial: 'ab',
                stateOf: {
                  aa: {
                    def: { ...DFL_NST_ITEM_DEF, entryHooks: ['aa'] },
                    sub: {
                      initial: 'aaa',
                      stateOf: {
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
                      stateOf: {
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

      expect(results.map(([_, { stateName }]) => stateName)).toEqual(['ab', 'aba'])
      expect(results.map(([_, { isRegionChild }]) => isRegionChild)).toEqual([false, false])

      expect(crrStates, 'crrStateTree に新しい経路を追加する').toEqual(['a', 'ab', 'aba'])
    })

    describe('parallel 1', () => {
      const stateDefinition: NormalizedDefinition = {
        initial: 'a',
        stateOf: {
          a: {
            def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a'] },
            sub: {
              dType: 'regions',
              stateOf: {
                a1: {
                  def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a1'] },
                  sub: {
                    initial: 'a1a',
                    stateOf: {
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
                    stateOf: {
                      a2a: {
                        def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2a'] },
                        sub: null,
                      },
                      a2b: {
                        def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b'] },
                        sub: {
                          dType: 'regions',
                          stateOf: {
                            a2b1: {
                              def: { ...DFL_NST_ITEM_DEF, entryHooks: ['a2b1'] },
                              sub: {
                                initial: 'a2b1a',
                                stateOf: {
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
                                stateOf: {},
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

      test('3.1: ステート遷移先が parallel である場合、子がすべて対象になる', () => {
        const destStates = [['a']] // これより下に子ステートがある
        const crrStates = [{ parallel: 'a', regions: {} }]
        const results = [...updateStateRouteForEntry(destStates, crrStates, stateDefinition)]

        expect(results.map(([_, { stateName }]) => stateName)).toEqual([
          'a1',
          'a1a',
          'a2',
          'a2b',
          'a2b1',
          'a2b1a',
          'a2b2',
        ])
        expect(results.map(([_, { isRegionChild }]) => isRegionChild)).toEqual([
          undefined,
          true,
          undefined,
          true,
          undefined,
          true,
          undefined,
        ])

        expect(crrStates, 'crrStateTree に新しい経路を追加する').toEqual([
          {
            parallel: 'a',
            regions: {
              a1: ['a1a'],
              a2: [
                {
                  parallel: 'a2b',
                  regions: {
                    a2b1: ['a2b1a'],
                    a2b2: [],
                  },
                },
              ],
            },
          },
        ])
      })

      test('3.2: parallel の leaf を指定した場合でも途中の parallel も起動する', () => {
        const destStates = [['a', 'a1', 'a1b']] // これより下に子ステートがある
        const crrStates = [{ parallel: 'a', regions: { a1: [] } as any }]
        const results = [...updateStateRouteForEntry(destStates, crrStates, stateDefinition)]

        expect(results.map(([_, { stateName }]) => stateName)).toEqual(['a1b', 'a2', 'a2b', 'a2b1', 'a2b1a', 'a2b2'])
        expect(results.map(([_, { isRegionChild }]) => isRegionChild)).toEqual([
          true,
          undefined,
          true,
          undefined,
          true,
          undefined,
        ])

        expect(crrStates, 'crrStateTree に新しい経路を追加する').toEqual([
          {
            parallel: 'a',
            regions: {
              a1: ['a1b'],
              a2: [
                {
                  parallel: 'a2b',
                  regions: {
                    a2b1: ['a2b1a'],
                    a2b2: [],
                  },
                },
              ],
            },
          },
        ])
      })

      test('3.3: parallel の leaf を指定した場合でも途中の parallel も起動する', () => {
        const destStates = [
          ['a', 'a1', 'a1a'],
          ['a', 'a2', 'a2b'],
        ]
        const crrStates = [{ parallel: 'a', regions: { a1: [] as StateRoute, a2: [] as StateRoute } }]
        const results = [...updateStateRouteForEntry(destStates, crrStates, stateDefinition)]

        expect(results.map(([_, { stateName }]) => stateName)).toEqual(['a1a', 'a2b', 'a2b1', 'a2b1a', 'a2b2'])
        expect(results.map(([_, { isRegionChild }]) => isRegionChild)).toEqual([true, true, undefined, true, undefined])

        expect(crrStates, 'crrStateTree に新しい経路を追加する').toEqual([
          {
            parallel: 'a',
            regions: {
              a1: ['a1a'],
              a2: [
                {
                  parallel: 'a2b',
                  regions: {
                    a2b1: ['a2b1a'],
                    a2b2: [],
                  },
                },
              ],
            },
          },
        ])
      })
    })
  })

  describe.todo('genChildDoneEvents', () => { })

  describe('x_findDeepestTransitions', () => {
    const findTransition = ({ events }: TopLvStDefItem<string>, eType: string) => {
      const transitions = events[eType]
      if (!transitions) {
        return undefined
      }
      const tIndex = transitions.findIndex(
        ({ guards }) => !guards.length || (guards as (() => boolean)[]).every((guard) => guard()),
      )
      return tIndex != -1 ? { tIndex, transition: transitions[tIndex]! } : undefined
    }

    const DFL_STATE_ITEM_DEF = {
      pPath: '',
      final: false,
      entryHooks: null,
      exitHooks: null,
      invocations: [],
      internalEvents: {},
      events: {},
    }
    const stateCatalog = new Map<string, NormalizedStateItemBoth>([
      ['a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
      ['aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
    ])

    test('0:空のstateRoute', async () => {
      const activeParallelSet = new Set<string>()
      expect(x_findDeepestTransitions([], 0, '', activeParallelSet, stateCatalog, findTransition, 'FIRE')).toEqual([
        [],
        [],
      ])
      expect([...activeParallelSet]).toEqual([])
    })

    describe('1: 非parallel な stateRoute', () => {
      test('0:一致する transition が見つからなければ leaves に末端ステートパスが入る', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aaa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(['a', 'aa', 'aaa'], 0, '', activeParallelSet, stateCatalog, findTransition, 'FIRE'),
        ).toEqual([[], ['/a/aa/aaa']])
        expect([...activeParallelSet]).toEqual([])
      })

      test('0:末端で発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aaa',
            {
              def: {
                ...DFL_STATE_ITEM_DEF,
                events: {
                  FIRE: [
                    { guards: [() => false], actions: [] },
                    { guards: [() => true], actions: [] },
                  ],
                },
              },
              sub: null,
            },
          ],
        ])
        expect(
          x_findDeepestTransitions(['a', 'aa', 'aaa'], 0, '', activeParallelSet, stateCatalog, findTransition, 'FIRE'),
        ).toEqual([
          [
            {
              firedIn: '/a/aa/aaa',
              leaves: ['/a/aa/aaa'],
              tIndex: 1,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual([])
      })

      test('0:中間親で発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aaa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(['a', 'aa', 'aaa'], 0, '', activeParallelSet, stateCatalog, findTransition, 'FIRE'),
        ).toEqual([
          [
            {
              firedIn: '/a/aa',
              leaves: ['/a/aa/aaa'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])
        expect([...activeParallelSet]).toEqual([])
      })

      test('0:ルートで発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          [
            '/a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aaa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(['a', 'aa', 'aaa'], 0, '', activeParallelSet, stateCatalog, findTransition, 'FIRE'),
        ).toEqual([
          [
            {
              firedIn: '/a',
              leaves: ['/a/aa/aaa'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual([])
      })
    })

    describe('2:parallel', () => {
      test('1:一致がない場合末端のパスを収集する', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2ba', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            ['a', { parallel: 'aa', regions: { aa1: ['aa1a'], aa2: ['aa2b', 'aa2ba'] } }],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([[], ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b/aa2ba']])

        expect([...activeParallelSet]).toEqual(['/a/aa'])
      })

      test('2.1:末端周辺で発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa1/aa1a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa2/aa2b',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa2/aa2b/aa2ba', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            ['a', { parallel: 'aa', regions: { aa1: ['aa1a'], aa2: ['aa2b', 'aa2ba'] } }],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a/aa/aa1/aa1a',
              leaves: ['/a/aa/aa1/aa1a'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
            {
              firedIn: '/a/aa/aa2/aa2b',
              leaves: ['/a/aa/aa2/aa2b/aa2ba'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa'])
      })

      test('2.2:片方の枝だけで発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          [
            '/a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa1/aa1a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2ba', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            ['a', { parallel: 'aa', regions: { aa1: ['aa1a'], aa2: ['aa2b', 'aa2ba'] } }],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a/aa/aa1/aa1a',
              leaves: ['/a/aa/aa1/aa1a'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa'])
      })

      test('2.3:パラレルルートで発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          [
            '/a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          [
            '/a/aa',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2ba', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            ['a', { parallel: 'aa', regions: { aa1: ['aa1a'], aa2: ['aa2b', 'aa2ba'] } }],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a/aa',
              leaves: ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b/aa2ba'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa'])
      })

      test('2.4:ルートで発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          [
            '/a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2ba', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            ['a', { parallel: 'aa', regions: { aa1: ['aa1a'], aa2: ['aa2b', 'aa2ba'] } }],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a',
              leaves: ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b/aa2ba'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa'])
      })

      test('2.5.1:多重パラレル 浅いところで発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1/aa1a1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a2/aa1a2a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3/aa2b3a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            [
              'a',
              {
                parallel: 'aa',
                regions: {
                  aa1: [{ parallel: 'aa1a', regions: { aa1a1: ['aa1a1a'], aa1a2: ['aa1a2a'] } }],
                  aa2: [{ parallel: 'aa2b', regions: { aa2b1: ['aa2b1a', 'aa2b1aa'], aa2b2: [], aa2b3: ['aa2b3a'] } }],
                },
              },
            ],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a/aa',
              leaves: [
                '/a/aa/aa1/aa1a/aa1a1/aa1a1a',
                '/a/aa/aa1/aa1a/aa1a2/aa1a2a',
                '/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa',
                '/a/aa/aa2/aa2b/aa2b2',
                '/a/aa/aa2/aa2b/aa2b3/aa2b3a',
              ],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa', '/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b'])
      })

      test('2.5.2:多重パラレル 深いところで発火', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa1/aa1a/aa1a1/aa1a1a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa1/aa1a/aa1a2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a2/aa1a2a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa2',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3/aa2b3a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            [
              'a',
              {
                parallel: 'aa',
                regions: {
                  aa1: [{ parallel: 'aa1a', regions: { aa1a1: ['aa1a1a'], aa1a2: ['aa1a2a'] } }],
                  aa2: [{ parallel: 'aa2b', regions: { aa2b1: ['aa2b1a', 'aa2b1aa'], aa2b2: [], aa2b3: ['aa2b3a'] } }],
                },
              },
            ],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a/aa/aa1/aa1a/aa1a1/aa1a1a',
              leaves: ['/a/aa/aa1/aa1a/aa1a1/aa1a1a'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
            {
              firedIn: '/a/aa/aa2',
              leaves: ['/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa', '/a/aa/aa2/aa2b/aa2b2', '/a/aa/aa2/aa2b/aa2b3/aa2b3a'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa', '/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b'])
      })

      test('2.5.3:多重パラレル 発火なし', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1/aa1a1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a2/aa1a2a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3/aa2b3a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        const result = x_findDeepestTransitions(
          [
            'a',
            {
              parallel: 'aa',
              regions: {
                aa1: [{ parallel: 'aa1a', regions: { aa1a1: ['aa1a1a'], aa1a2: ['aa1a2a'] } }],
                aa2: [{ parallel: 'aa2b', regions: { aa2b1: ['aa2b1a', 'aa2b1aa'], aa2b2: [], aa2b3: ['aa2b3a'] } }],
              },
            },
          ],
          0,
          '',
          activeParallelSet,
          stateCatalog,
          findTransition,
          'FIRE',
        )
        expect(result).toEqual([
          [],
          [
            '/a/aa/aa1/aa1a/aa1a1/aa1a1a',
            '/a/aa/aa1/aa1a/aa1a2/aa1a2a',
            '/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa',
            '/a/aa/aa2/aa2b/aa2b2',
            '/a/aa/aa2/aa2b/aa2b3/aa2b3a',
          ],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa', '/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b'])
      })

      test('2.5.0:多重パラレル', async () => {
        const activeParallelSet = new Set<string>()
        const stateCatalog = new Map<string, NormalizedStateItemBoth>([
          ['/a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a1/aa1a1a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa1/aa1a/aa1a2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa1/aa1a/aa1a2/aa1a2a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          [
            '/a/aa/aa2',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa2/aa2b', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b1', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          [
            '/a/aa/aa2/aa2b/aa2b1/aa2b1a',
            { def: { ...DFL_STATE_ITEM_DEF, events: { FIRE: [{ guards: [() => true], actions: [] }] } }, sub: null },
          ],
          ['/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b2', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
          ['/a/aa/aa2/aa2b/aa2b3/aa2b3a', { def: { ...DFL_STATE_ITEM_DEF }, sub: null }],
        ])
        expect(
          x_findDeepestTransitions(
            [
              'a',
              {
                parallel: 'aa',
                regions: {
                  aa1: [{ parallel: 'aa1a', regions: { aa1a1: ['aa1a1a'], aa1a2: ['aa1a2a'] } }],
                  aa2: [{ parallel: 'aa2b', regions: { aa2b1: ['aa2b1a', 'aa2b1aa'], aa2b2: [], aa2b3: ['aa2b3a'] } }],
                },
              },
            ],
            0,
            '',
            activeParallelSet,
            stateCatalog,
            findTransition,
            'FIRE',
          ),
        ).toEqual([
          [
            {
              firedIn: '/a/aa/aa1/aa1a/aa1a2/aa1a2a',
              leaves: ['/a/aa/aa1/aa1a/aa1a2/aa1a2a'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
            {
              firedIn: '/a/aa/aa2/aa2b/aa2b1/aa2b1a',
              leaves: ['/a/aa/aa2/aa2b/aa2b1/aa2b1a/aa2b1aa'],
              tIndex: 0,
              transition: {
                actions: [],
                guards: [expect.any(Function)],
              },
            },
          ],
          [],
        ])

        expect([...activeParallelSet]).toEqual(['/a/aa', '/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b'])
      })
    })
  })

  describe('deriveEventTransition()', () => {
    beforeAll(async () => { })
    const GLOBAL_DEF_ITEM = { events: {}, internalEvents: {} }

    test('1: "/A/AA/AAA" のとき、"foo" イベントが投げられたとき、"/A/AA/AAC" を遷移先にする', async () => {
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          ['A', 'AA', 'AAA'],
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
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          lca: '/A/AA',
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
      const fooEventOf = {
        '/a': [{ to: '/a/a1/a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }], // こっちが発火する
        '/a/a1/a1a/a1aa': [{ to: '/b', fullTo: '/b', guards: [() => false], actions: [] }], // guards が false なので発火しない
      }
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          [{ parallel: 'a', regions: { a1: ['a1a', 'a1aa'], a2: ['a2a'] } }],
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
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          lca: '/a/a1',
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
      const fooEventOf = {
        '/a/a1/a1a': [{ to: 'a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }],
        // NOTE: この遷移が正当かどうかはともかくとして、leaves に '/a/a2/a21/a21a' が含まれてしまうので遷移実行には leaves を検証し exit されるものを調整する必要がある
        '/a/a2': [{ to: '/a/a2/a2a/a2a2/a2a2c', fullTo: '/a/a2/a2a/a2a2/a2a2c', guards: [], actions: [] }],
      }
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          [
            {
              parallel: 'a',
              regions: { a1: ['a1a'], a2: [{ parallel: 'a2a', regions: { a2a1: ['a2a1a'], a2a2: ['a2a2a'] } }] },
            },
          ],
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
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          lca: '/a/a1',
          tIndex: 0,
          transition: {
            to: 'a1b',
            fullTo: '/a/a1/a1b',
            actions: [],
            guards: [],
          },
        },
        {
          lca: '/a/a2/a2a/a2a2',
          tIndex: 0,
          transition: {
            to: '/a/a2/a2a/a2a2/a2a2c',
            fullTo: '/a/a2/a2a/a2a2/a2a2c',
            actions: [],
            guards: [],
          },
        },
      ])
    })

    test('3.2: region を抜ける遷移', async () => {
      const fooEventOf = {
        '/a/a1/a1a': [{ to: 'a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }], // これは候補に挙がるが棄却される
        '/a/a2': [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
      }
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          [
            {
              parallel: 'a',
              regions: {
                a1: ['a1a'],
                a2: [{ parallel: 'a2a', regions: { a2a1: ['a2a1a'], a2a2: ['a2a2a'] } }],
              },
            },
          ],
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
          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          lca: '', // parallel root が遷移元になる
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
        const fooEventOf = {
          '/a/a1': [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
          '/a/a1/a1a/a1a1/a1a1a': [
            { guards: [() => false], actions: [] },
            { to: 'a1a1b', fullTo: '/a/a1/a1a/a1a1/a1a1b', guards: [], actions: [] },
          ],
        }
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            [
              {
                parallel: 'a',
                regions: {
                  a1: [
                    {
                      parallel: 'a1a',
                      regions: {
                        a1a1: ['a1a1a'],
                      },
                    },
                  ],
                },
              },
            ],
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
                '/a/a1/a1a/a1a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a/a1a1/a1a1a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a/a1a1',
                    events: { foo: fooEventOf['/a/a1/a1a/a1a1/a1a1a'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a/a1a1/a1a1b',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a/a1a1',
                  },
                  sub: null,
                },
              ],
            ]),
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            lca: '/a/a1/a1a/a1a1',
            tIndex: 1,
            transition: {
              to: 'a1a1b',
              fullTo: '/a/a1/a1a/a1a1/a1a1b',
              actions: [],
              guards: [],
            },
          },
        ])
      })

      test('4.2: 子に遷移先が無指定でも親は発火しない。遷移先無指定のため lca は undefined になる', async () => {
        const fooEventOf = {
          '/a/a1': [{ to: '/b/ba', fullTo: '/b/ba', guards: [], actions: [] }],
          '/a/a1/a1a/a1a1/a1a1a': [{ guards: [], actions: [] }],
        }
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            [
              {
                parallel: 'a',
                regions: {
                  a1: [
                    {
                      parallel: 'a1a',
                      regions: {
                        a1a1: ['a1a1a'],
                        a1a2: [],
                      },
                    },
                  ],
                },
              },
            ],
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
                '/a/a1/a1a/a1a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a/a1a1/a1a1a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a11',
                    events: { foo: fooEventOf['/a/a1/a1a/a1a1/a1a1a'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a/a1a2',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a',
                  },
                  sub: null,
                },
              ],
            ]),
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            lca: undefined,
            tIndex: 0,
            transition: {
              actions: [],
              guards: [],
            },
          },
        ])
      })

      test('4.3: 子と親に遷移先が無指定でも親は発火しない。遷移先無指定のため lca は undefined になる', async () => {
        const fooEventOf = {
          '/a/a1': [{ guards: [], actions: [] }],
          '/a/a1/a1a/a1a1/a1a1a': [{ guards: [], actions: [] }],
        }
        expect(
          deriveEventTransition(
            'foo',
            undefined,
            runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
            [
              {
                parallel: 'a',
                regions: {
                  a1: [{ parallel: 'a1a', regions: { a1a1: ['a1a1a'], a1a2: [] } }],
                },
              },
            ],
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
                '/a/a1/a1a/a1a1',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a',
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a/a1a1/a1a1a',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a/a1a1',
                    events: { foo: fooEventOf['/a/a1/a1a/a1a1/a1a1a'] },
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a1a/a1a2',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1/a1a',
                  },
                  sub: null,
                },
              ],
            ]),
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            lca: undefined,
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
      ])

      test('5.1: childDone', async () => {
        expect(
          deriveEventTransition(
            ':childDone:',
            { path: '/a' },
            runtimeUtils.makeFnBaseParam({}, { type: ':childDone:' }, undefined),
            [
              {
                parallel: 'a',
                regions: {
                  a1: ['a1a'],
                  a2: [
                    {
                      parallel: 'a2a',
                      regions: {
                        a2a1: ['a2a1a'],
                        a2a2: ['a2a2a'],
                      },
                    },
                  ],
                },
              },
            ],
            {}, // machineGuards
            stateCatalog,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            lca: '',
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
        expect(
          deriveEventTransition(
            ':childDone:',
            { path: '/a/a2' },
            runtimeUtils.makeFnBaseParam({}, { type: ':childDone:' }, undefined),
            [
              {
                parallel: 'a',
                regions: {
                  a1: ['a1a'],
                  a2: [{ parallel: 'a2a', regions: { a2a1: ['a2a1a'], a2a2: ['a2a2a'] } }],
                },
              },
            ],
            {}, // machineGuards
            stateCatalog,
            GLOBAL_DEF_ITEM,
          ),
        ).toEqual([
          {
            lca: '',
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
            [
              {
                parallel: 'a',
                regions: {
                  a1: ['a1a'],
                  a2: [{ parallel: 'a2a', regions: { a2a1: ['a2a1a'], a2a2: ['a2a2a'] } }],
                },
              },
            ],
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

            {
              events: { foo: [{ to: 'b', fullTo: '/b', guards: [], actions: [] }] },
              internalEvents: {},
            },
          ),
        ).toEqual([
          {
            lca: '',
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

    test('0.0: 実験用', async () => {
      expect(
        deriveEventTransition(
          'foo',
          undefined,
          runtimeUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          [
            {
              parallel: 'a',
              regions: {
                a1: ['a1a'],
                a2: [{ parallel: 'a2a', regions: { a2a1: ['a2a1a'], a2a2: ['a2a2a'] } }],
              },
            },
          ],
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

          GLOBAL_DEF_ITEM,
        ),
      ).toEqual([
        {
          lca: '/a/a2',
          tIndex: 0,
          transition: {
            to: 'a2b',
            fullTo: '/a/a2/a2b',
            actions: [],
            guards: [],
          },
        },
      ])
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
            ['/a'],
          ),
        ).toEqual([
          {
            lca: '/a/a2',
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
            ['/a/aa'],
          ),
        ).toEqual([{ lca: '', tIndex: 0, transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } }])
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
          ['/a'],
        ),
      ).toEqual([{ lca: '', tIndex: 0, transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } }])
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
          ['/a', '/b'],
        ),
      ).toEqual([{ lca: '', tIndex: 0, transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } }])
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
          ['/a'],
        ),
      ).toEqual([
        { lca: undefined, tIndex: 0, transition: { actions: [], guards: [] } },
        { lca: '', tIndex: 0, transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
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
          ['/a/a2/a2a', '/a'],
        ),
      ).toEqual([
        { lca: '/a/a1', tIndex: 0, transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
        {
          lca: '/a/a2/a2a/a2a1',
          tIndex: 0,
          transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] },
        },
        {
          lca: '/a/a2/a2a/a2a2',
          tIndex: 0,
          transition: { to: '/a/a2/a2a/a2a2/a2a2c', fullTo: '/a/a2/a2a/a2a2/a2a2c', actions: [], guards: [] },
        },
        { lca: '/a/a3', tIndex: 0, transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
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
          ['/a/a2/a2a', '/a'],
        ),
      ).toEqual([
        { lca: '/a/a2', tIndex: 0, transition: { to: '/a/a2/a2b', fullTo: '/a/a2/a2b', actions: [], guards: [] } },
        { lca: '/a/a1', tIndex: 0, transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
        { lca: '/a/a3', tIndex: 0, transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
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
          ['/a/a2/a2a', '/a'],
        ),
      ).toEqual([
        { tIndex: 0, transition: { actions: [], guards: [] } },
        { tIndex: 0, transition: { actions: [], guards: [] } },
        { lca: '', tIndex: 0, transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
      ])
    })

    describe('深いレベルの競合', () => {
      test('0: 内輪同士の遷移は生存', async () => {
        expect(
          x_removeConflictedTransitions(
            [
              {
                firedIn: '',
                leaves: ['/a/aa/aa1/aa1a/aa1a1/aa1a1a'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/aa/aa1/aa1a/aa1a1/aa1a1b', actions: [], guards: [] },
              },
              {
                firedIn: '',
                leaves: ['/a/aa/aa1/aa1a/aa1a2/aa1a2a'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/aa/aa1/aa1a/aa1a2/aa1a2b', actions: [], guards: [] },
              },
            ],
            ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2a', '/a/ab/abb', '/a/aa'],
          ),
        ).toEqual([
          {
            lca: '/a/aa/aa1/aa1a/aa1a1',
            tIndex: 0,
            transition: { to: '', fullTo: '/a/aa/aa1/aa1a/aa1a1/aa1a1b', actions: [], guards: [] },
          },
          {
            lca: '/a/aa/aa1/aa1a/aa1a2',
            tIndex: 0,
            transition: { to: '', fullTo: '/a/aa/aa1/aa1a/aa1a2/aa1a2b', actions: [], guards: [] },
          },
        ])
      })

      test('0: ', async () => {
        expect(
          x_removeConflictedTransitions(
            [
              {
                firedIn: '',
                leaves: ['/a/aa/aa1/aa1a/aa1a1/aa1a1a'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/aa/aa1/aa1a/aa1a1/aa1a1b', actions: [], guards: [] },
              },
              {
                firedIn: '',
                leaves: ['/a/aa/aa1/aa1a/aa1a2/aa1a2a'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/aa/aa1/aa1b', actions: [], guards: [] },
              },
            ],
            ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2a', '/a/ab/abb', '/a/aa'],
          ),
        ).toEqual([
          { lca: '/a/aa/aa1', tIndex: 0, transition: { to: '', fullTo: '/a/aa/aa1/aa1b', actions: [], guards: [] } },
        ])
      })

      test('0: ', async () => {
        expect(
          x_removeConflictedTransitions(
            [
              {
                firedIn: '',
                leaves: ['/a/aa/aa1/aa1a/aa1a1/aa1a1a'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/aa/aa1/aa1a/aa1a1/aa1a1b', actions: [], guards: [] },
              },
              {
                firedIn: '',
                leaves: ['/a/aa/aa1/aa1a/aa1a2/aa1a2a'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/aa/aa1/aa1b', actions: [], guards: [] },
              },
              {
                firedIn: '',
                leaves: ['/a/aa/aa2/aa2b'],
                tIndex: 0,
                transition: { to: '', fullTo: '/a/ab', actions: [], guards: [] },
              },
            ],
            ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2a', '/a/ab/abb', '/a/aa'],
          ),
        ).toEqual([{ lca: '/a', tIndex: 0, transition: { to: '', fullTo: '/a/ab', actions: [], guards: [] } }])
      })
    })
  })
})
