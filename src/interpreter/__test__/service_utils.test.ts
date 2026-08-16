import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test'
import type { NormalizedStateItemBoth } from '../../machine/m.types'
import { calcEventTransition, calcNewPaths, serviceUtils, __test__ } from '../service_utils'

const { removeConflictedTransitions } = __test__

const DFL_NST_ITEM_DEF = {
  pPath: '',
  final: false,
  tags: new Set<string>(),
  entryHook: null,
  exitHook: null,
  invocations: [],
  builtinEvents: {},
  events: {},
}

describe('service_utils', () => {
  beforeAll(async () => { })

  describe('calcNewPaths', () => {
    beforeAll(async () => { })

    test('1:', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: null,
            },
            state2: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: null,
            },
            state3: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: null,
            },
          },
          'state2',
        ),
      ).toEqual(['/state2'])
    })

    test('2.1: 空の subStates', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: {
                initial: undefined,
                states: {},
              },
            },
          },
          'state1',
        ),
      ).toEqual(['/state1'])
    })

    test('2.2: subStates', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: {
                initial: 'subState2',
                states: {
                  subState1: {
                    def: { ...DFL_NST_ITEM_DEF, pPath: '/state1' },
                    sub: null,
                  },
                  subState2: {
                    def: { ...DFL_NST_ITEM_DEF, pPath: '/state1' },
                    sub: {
                      initial: undefined,
                      states: {},
                    },
                  },
                },
              },
            },
          },
          'state1',
        ),
      ).toEqual(['/state1/subState2'])
    })

    test('3.1: 空の parallel', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: {
                nType: 'parallel',
                regions: {},
              },
            },
          },
          'state1',
        ),
      ).toEqual(['/state1'])
    })

    test('3.2: parallel', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: {
                nType: 'parallel',
                regions: {
                  p1: {
                    def: {
                      ...DFL_NST_ITEM_DEF,
                      pPath: '/state1',
                    },
                    sub: {
                      initial: 'p1_sub1',
                      states: {
                        p1_sub1: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p1' },
                          sub: null,
                        },
                        p1_sub2: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p1', final: true },
                          sub: null,
                        },
                      },
                    },
                  },
                  p2: {
                    def: {
                      ...DFL_NST_ITEM_DEF,
                      pPath: '/state1',
                    },
                    sub: {
                      initial: 'p2_sub2',
                      states: {
                        p2_sub1: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: null,
                        },
                        p2_sub2: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: {
                            nType: 'parallel',
                            regions: {
                              p2_sub2_p1: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2' },
                                sub: {
                                  initial: 'p2_sub2_p1_sub1',
                                  states: {
                                    p2_sub2_p1_sub1: {
                                      def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2/p2_sub2_p1' },
                                      sub: null,
                                    },
                                  },
                                },
                              },
                              p2_sub2_p2: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2' },
                                sub: {
                                  initial: 'p2_sub2_p2_sub1',
                                  states: {
                                    p2_sub2_p2_sub1: {
                                      def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2/p2_sub2_p2' },
                                      sub: null,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        p2_sub3: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          'state1',
        ),
      ).toEqual([
        '/state1/p1/p1_sub1',
        '/state1/p2/p2_sub2/p2_sub2_p1/p2_sub2_p1_sub1',
        '/state1/p2/p2_sub2/p2_sub2_p2/p2_sub2_p2_sub1',
      ])
    })

    test('3.3: parallel', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: {
                nType: 'parallel',
                regions: {
                  p1: {
                    def: {
                      ...DFL_NST_ITEM_DEF,
                      pPath: '/state1',
                    },
                    sub: {
                      initial: 'p1_sub1',
                      states: {
                        p1_sub1: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p1' },
                          sub: null,
                        },
                        p1_sub2: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p1', final: true },
                          sub: null,
                        },
                      },
                    },
                  },
                  p2: {
                    def: {
                      ...DFL_NST_ITEM_DEF,
                      pPath: '/state1',
                    },
                    sub: {
                      initial: 'p2_sub2',
                      states: {
                        p2_sub1: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: null,
                        },
                        p2_sub2: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: {
                            nType: 'parallel',
                            regions: {
                              p2_sub2_p1: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2' },
                                sub: {
                                  initial: 'p2_sub2_p1_sub1',
                                  states: {
                                    p2_sub2_p1_sub1: {
                                      def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2/p2_sub2_p1' },
                                      sub: null,
                                    },
                                  },
                                },
                              },
                              p2_sub2_p2: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2' },
                                sub: {
                                  initial: undefined,
                                  states: {},
                                },
                              },
                              p2_sub2_p3: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2' },
                                sub: {
                                  initial: 'p2_sub2_p3_sub1',
                                  states: {
                                    p2_sub2_p3_sub1: {
                                      def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub2/p2_sub2_p3' },
                                      sub: null,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        p2_sub3: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          'state1',
        ),
      ).toEqual([
        '/state1/p1/p1_sub1',
        '/state1/p2/p2_sub2/p2_sub2_p1/p2_sub2_p1_sub1',
        '/state1/p2/p2_sub2/p2_sub2_p3/p2_sub2_p3_sub1',
      ])
    })

    test('3.4: parallel + subStates', async () => {
      expect(
        calcNewPaths(
          {
            state1: {
              def: { ...DFL_NST_ITEM_DEF },
              sub: {
                nType: 'parallel',
                regions: {
                  p1: {
                    def: { ...DFL_NST_ITEM_DEF, pPath: '/state1' },
                    sub: {
                      initial: 'p1_sub1',
                      states: {
                        p1_sub1: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p1' },
                          sub: {
                            initial: undefined,
                            states: {},
                          },
                        },
                        p2_sub3: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: null,
                        },
                      },
                    },
                  },
                  p2: {
                    def: { ...DFL_NST_ITEM_DEF, pPath: '/state1' },
                    sub: {
                      initial: 'p2_sub1',
                      states: {
                        p2_sub1: {
                          def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2' },
                          sub: {
                            initial: 'p2_sub1_subState2',
                            states: {
                              p2_sub1_subState1: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub1' },
                                sub: null,
                              },
                              p2_sub1_subState2: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub1' },
                                sub: {
                                  initial: 'p2_sub1_subState2_subState1',
                                  states: {
                                    p2_sub1_subState2_subState1: {
                                      def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub1/p2_sub1_subState2' },
                                      sub: null,
                                    },
                                  },
                                },
                              },
                              p2_sub1_subState3: {
                                def: { ...DFL_NST_ITEM_DEF, pPath: '/state1/p2/p2_sub1' },
                                sub: null,
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
          'state1',
        ),
      ).toEqual(['/state1/p1/p1_sub1', '/state1/p2/p2_sub1/p2_sub1_subState2/p2_sub1_subState2_subState1'])
    })
  })

  describe('calcEventTransition', () => {
    beforeAll(async () => { })

    test('1: "/A/AA/AAA" のとき、"foo" イベントが投げられたとき、"/A/AA/AAC" を遷移先にする', async () => {
      expect(
        calcEventTransition(
          'foo',
          serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
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
                      { to: 'AAB', fullTo: '/A/AA/AAB', guards: [{ body: () => false }], actions: [] },
                      { to: 'AAC', fullTo: '/A/AA/AAC', guards: [], actions: [] },
                      { to: 'AAD', fullTo: '/A/AA/AAD', guards: [], actions: [] },
                    ],
                  },
                },
                sub: null,
              },
            ],
          ]),
          [] // regionPaths,
        ),
      ).toEqual(
        [
          {
            from: "/A/AA/AAA",
            transition: {
              to: "AAC",
              fullTo: "/A/AA/AAC",
              actions: [],
              guards: [],
            },
          }
        ],
      )
    })

    test('2: subStates (非parallel) では leaves は遷移元の候補を表す', async () => {
      const regionPaths = ['/a/a1', '/a/a2']
      const fooEventOf = {
        '/a': [{ to: '/a/a1/a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }],
        '/a/a1/a1a/a1aa': [{ to: '/b', fullTo: '/b', guards: [{ body: () => false }], actions: [] }],
      }
      expect(
        calcEventTransition(
          'foo',
          serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: { a1aa: {} } }, a2: { a2a: {} } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            ['/a', {
              def: {
                ...DFL_NST_ITEM_DEF,
                events: { foo: fooEventOf['/a'] }
              },
              sub: null,
            }],
            ['/a/a1', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a',
              },
              sub: null,
            }],
            ['/a/a1/a1a', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a/aa',
              },
              sub: null,
            }],
            ['/a/a1/a1a/a1aa', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a/aa/aaa',
                events: { foo: fooEventOf['/a/a1/a1a/a1aa'] }
              },
              sub: null,
            }],
            ['/a/a2', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a',
              },
              sub: null,
            }],
            ['/a/a2/a2a', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a/a2',
              },
              sub: null,
            }],
          ]),
          regionPaths,
        ),
      ).toEqual(
        [
          {
            "from": "/a/a1/a1a/a1aa",
            "transition": {
              "actions": [],
              "fullTo": "/a/a1/a1b",
              "guards": [],
              "to": "/a/a1/a1b",
            },
          },
        ],
      )
    })

    test('3.1: region を抜けない遷移', async () => {
      const regionPaths = ['/a/a2/a21', '/a/a2/a22', '/a/a1', '/a/a2']
      const fooEventOf = {
        '/a/a1/a1a': [{ to: 'a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }],
        // NOTE: この遷移が正当かどうかはともかくとして、leaves に '/a/a2/a21/a21a' が含まれてしまうので遷移実行には leaves を検証し exit されるものを調整する必要がある
        '/a/a2': [{ to: 'a1b', fullTo: '/a/a2/a22/a22c', guards: [], actions: [] }],
      }
      expect(
        calcEventTransition(
          'foo',
          serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: {} }, a2: { a21: { a21a: {} }, a22: { a22a: {} } } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            ['/a', {
              def: {
                ...DFL_NST_ITEM_DEF,
              },
              sub: null,
            }],
            ['/a/a1', {
              def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
              sub: null,
            }],
            ['/a/a1/a1a', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a/a1',
                events: { foo: fooEventOf['/a/a1/a1a'] }
              },
              sub: null,
            }],
            ['/a/a2', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a',
                events: { foo: fooEventOf['/a/a2'] }
              },
              sub: null,
            }],
            [
              '/a/a2/a21',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2'
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
        ),
      ).toEqual(
        [
          {
            "from": "/a/a1/a1a",
            "transition": {
              "to": "a1b",
              "fullTo": "/a/a1/a1b",
              "actions": [],
              "guards": [],
            },
          },
          {
            "from": "/a/a2/a22/a22a",
            "transition": {
              "to": "a1b",
              "fullTo": "/a/a2/a22/a22c",
              "actions": [],
              "guards": [],
            },
          },
        ],
      )
    })

    test('3.2: region を抜ける遷移', async () => {
      const regionPaths = ['/a/a2/a21', '/a/a2/a22', '/a/a1', '/a/a2']
      const fooEventOf = {
        '/a/a1/a1a': [{ to: 'a1b', fullTo: '/a/a1/a1b', guards: [], actions: [] }],
        '/a/a2': [{ to: '/b', fullTo: '/b', guards: [], actions: [] }],
      }
      expect(
        calcEventTransition(
          'foo',
          serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
          { a: { a1: { a1a: {} }, a2: { a21: { a21a: {} }, a22: { a22a: {} } } } },
          {}, // machineGuards
          // stateCatalog
          new Map<string, NormalizedStateItemBoth>([
            ['/a', {
              def: {
                ...DFL_NST_ITEM_DEF,
              },
              sub: null,
            }],
            ['/a/a1', {
              def: { ...DFL_NST_ITEM_DEF, pPath: '/a' },
              sub: null,
            }],
            ['/a/a1/a1a', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a/a1',
                events: { foo: fooEventOf['/a/a1/a1a'] }
              },
              sub: null,
            }],
            ['/a/a2', {
              def: {
                ...DFL_NST_ITEM_DEF,
                pPath: '/a',
                events: { foo: fooEventOf['/a/a2'] }
              },
              sub: null,
            }],
            [
              '/a/a2/a21',
              {
                def: {
                  ...DFL_NST_ITEM_DEF,
                  pPath: '/a/a2'
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
        ),
      ).toEqual(
        [
          {
            "from": "/a",
            "transition": {
              "to": "/b",
              "fullTo": "/b",
              "actions": [],
              "guards": [],
            },
          },
        ],
      )
    })

    describe('4: サブステートのいずれかがイベントにマッチしたとき、親ステートのイベントは発火しない', () => {

      test('4.1: 親に遷移先が指定されていても無視される', async () => {
        const regionPaths = ['/a/a1/a11', '/a/a1/a12', '/a/a1']
        const fooEventOf = {
          '/a/a1': [{ to: 'b', fullTo: '/b', guards: [], actions: [] }],
          '/a/a1/a11/a11a': [{ to: 'a11b', fullTo: '/a/a1/a11/a11b', guards: [], actions: [] }],
        }
        expect(
          calcEventTransition(
            'foo',
            serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
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
                    events: { foo: fooEventOf['/a/a1'] }
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1'
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
                    events: { foo: fooEventOf['/a/a1/a11/a11a'] }
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
          ),
        ).toEqual(
          [
            {
              "from": "/a/a1/a11/a11a",
              "transition": {
                "to": "a11b",
                "fullTo": "/a/a1/a11/a11b",
                "actions": [],
                "guards": [],
              },
            },
          ],
        )
      })

      test('4.2: 子に遷移先が無指定でも親は発火しない。遷移先無指定のため from は undefined になる', async () => {
        const regionPaths = ['/a/a1/a11', '/a/a1/a12', '/a/a1']
        const fooEventOf = {
          '/a/a1': [{ to: 'b', fullTo: '/b', guards: [], actions: [] }],
          '/a/a1/a11/a11a': [{ guards: [], actions: [] }],
        }
        expect(
          calcEventTransition(
            'foo',
            serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
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
                    events: { foo: fooEventOf['/a/a1'] }
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1'
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
                    events: { foo: fooEventOf['/a/a1/a11/a11a'] }
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
          ),
        ).toEqual(
          [
            {
              "from": undefined,
              "transition": {
                "actions": [],
                "guards": [],
              },
            },
          ],
        )
      })

      test('4.3: 子と親に遷移先が無指定でも親は発火しない。遷移先無指定のため from は undefined になる', async () => {
        const regionPaths = ['/a/a1/a11', '/a/a1/a12', '/a/a1']
        const fooEventOf = {
          '/a/a1': [{ guards: [], actions: [] }],
          '/a/a1/a11/a11a': [{ guards: [], actions: [] }],
        }
        expect(
          calcEventTransition(
            'foo',
            serviceUtils.makeFnBaseParam({}, { type: 'foo' }, undefined),
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
                    events: { foo: fooEventOf['/a/a1'] }
                  },
                  sub: null,
                },
              ],
              [
                '/a/a1/a11',
                {
                  def: {
                    ...DFL_NST_ITEM_DEF,
                    pPath: '/a/a1'
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
                    events: { foo: fooEventOf['/a/a1/a11/a11a'] }
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
          ),
        ).toEqual(
          [
            {
              "from": undefined,
              "transition": {
                "actions": [],
                "guards": [],
              },
            },
          ],
        )
      })
    })
  })

  describe('removeConflictedTransitions', () => {
    beforeAll(async () => {
    })

    describe('1: from (移動元)の選ばれ方', () => {
      beforeAll(async () => {
      })

      test('1.1: leaves から fullTo と同族のステートが from として選ばれる', async () => {
        expect(
          removeConflictedTransitions(
            [
              { firedIn: '/a', leaves: ['/a/a1/a1a', '/a/a2/a2b/a2ba'], transition: { to: '/a/a2/a2c', fullTo: '/a/a2/a2c', actions: [], guards: [] } },
            ],
            [
              '/a/a1',
              '/a/a2',
            ],
          )
        ).toEqual([
          { from: '/a/a2/a2b/a2ba', transition: { to: '/a/a2/a2c', fullTo: '/a/a2/a2c', actions: [], guards: [] } },
        ],
        )
      })

      test('1.2: fullTo と同族のステートがない場合、 leaves のパス群の共通親が from として選ばれる', async () => {
        expect(
          removeConflictedTransitions(
            [
              { firedIn: '/a', leaves: ['/a/aa/aa1/aa1a', '/a/aa/aa2/aa2b/aa2ba'], transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
            ],
            [
              '/a/aa/aa1',
              '/a/aa/aa2',
            ],
          )
        ).toEqual([
          { from: '/a/aa', transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
        ],
        )
      })
    })

    test('2.1: parallel 外から parallel への遷移', async () => {
      expect(
        removeConflictedTransitions(
          [
            { firedIn: '/b', leaves: ['/b/ba'], transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } },
          ],
          [
            '/a/a1',
            '/a/a2',
            '/a/a3',
            '/a/a4',
          ],
        )
      ).toEqual([
        { from: '/b/ba', transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } },
      ],
      )
    })

    test('2.2: 別 parallel から parallel への遷移', async () => {
      expect(
        removeConflictedTransitions(
          [
            { firedIn: '/b', leaves: ['/b/b1/b1a', '/b/b2/b2a'], transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } },
          ],
          [
            '/a/a1',
            '/a/a2',
            '/a/a3',
            '/a/a4',
            '/b/b1',
            '/b/b2',
          ],
        )
      ).toEqual([
        { from: '/b', transition: { to: '/a/a1/a', fullTo: '/a/a1/a', actions: [], guards: [] } },
      ],
      )
    })

    test('3: 同じ parallel から抜ける遷移が複数あるとき、先に定義されているほうを採用する。to がない処理はそのまま残す', async () => {
      expect(
        removeConflictedTransitions(
          [
            { firedIn: '/a/a1/a1a', leaves: ['/a/a1/a1a'], transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a', leaves: ['/a/a2/a2a'], transition: { to: '/c', fullTo: '/c', actions: [], guards: [] } },
            { firedIn: '/a/a3/a3a', leaves: ['/a/a3/a3a'], transition: { actions: [], guards: [] } },
            { firedIn: '/a/a4/a4b/a4ba', leaves: ['/a/a4/a4b/a4ba'], transition: { to: '/d', fullTo: '/d', actions: [], guards: [] } },
          ],
          [
            '/a/a1',
            '/a/a2',
            '/a/a3',
            '/a/a4',
          ],
        )
      ).toEqual([
        { from: undefined, transition: { actions: [], guards: [] } },
        { from: '/a', transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
      ],
      )
    })

    test('4: 同 region 内の遷移は除去されない', async () => {
      expect(
        removeConflictedTransitions(
          [
            { firedIn: '/a/a1/a1c', leaves: ['/a/a1/a1c'], transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a/a2a1/a2a1a', leaves: ['/a/a2/a2a/a2a1/a2a1a'], transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a/a2a2/a2a2b', leaves: ['/a/a2/a2a/a2a2/a2a2b'], transition: { to: '/a/a2/a2a/a2a2/a2a2c', fullTo: '/a/a2/a2a/a2a2/a2a2c', actions: [], guards: [] } },
            { firedIn: '/a/a3/a3b', leaves: ['/a/a3/a3b'], transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
          ],
          [
            '/a/a2/a2a/a2a1',
            '/a/a2/a2a/a2a2',
            '/a/a1',
            '/a/a2',
            '/a/a3',
          ]
        )
      ).toEqual([
        { from: '/a/a1/a1c', transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
        { from: '/a/a2/a2a/a2a1/a2a1a', transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] } },
        { from: '/a/a2/a2a/a2a2/a2a2b', transition: { to: '/a/a2/a2a/a2a2/a2a2c', fullTo: '/a/a2/a2a/a2a2/a2a2c', actions: [], guards: [] } },
        { from: '/a/a3/a3b', transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
      ])
    })

    test('5: 入れ子の parallel 内での脱出は同じレベルの region にだけ影響を与える', async () => {
      expect(
        removeConflictedTransitions(
          [
            { firedIn: '/a/a1/a1c', leaves: ['/a/a1/a1c'], transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a/a2a1/a2a1a', leaves: ['/a/a2/a2a/a2a1/a2a1a'], transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a/a2a2/a2a2b', leaves: ['/a/a2/a2a/a2a2/a2a2b'], transition: { to: '/a/a2/a2b', fullTo: '/a/a2/a2b', actions: [], guards: [] } },
            { firedIn: '/a/a3/a3b', leaves: ['/a/a3/a3b'], transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
          ],
          [
            '/a/a2/a2a/a2a1',
            '/a/a2/a2a/a2a2',
            '/a/a1',
            '/a/a2',
            '/a/a3',
          ]
        )
      ).toEqual([
        { from: '/a/a1/a1c', transition: { to: '/a/a1/a1b', fullTo: '/a/a1/a1b', actions: [], guards: [] } },
        { from: '/a/a3/a3b', transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
        { from: '/a/a2/a2a', transition: { to: '/a/a2/a2b', fullTo: '/a/a2/a2b', actions: [], guards: [] } },
      ])
    })

    test('6: parallel を脱出すると配下の transition のうち遷移を含むものはすべてキャンセルされる', async () => {
      expect(
        removeConflictedTransitions(
          [
            { firedIn: '/a/a1/a1c', leaves: ['/a/a1/a1c'], transition: { actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a/a2a1/a2a1a', leaves: ['/a/a2/a2a/a2a1/a2a1a'], transition: { to: '/a/a2/a2a/a2a1/a2a1b', fullTo: '/a/a2/a2a/a2a1/a2a1b', actions: [], guards: [] } },
            { firedIn: '/a/a2/a2a/a2a2/a2a2b', leaves: ['/a/a2/a2a/a2a2/a2a2b'], transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
            { firedIn: '/a/a3/a3b', leaves: ['/a/a3/a3b'], transition: { to: '/a/a3/a3e', fullTo: '/a/a3/a3e', actions: [], guards: [] } },
            { firedIn: '/a/a4/a4a', leaves: ['/a/a4/a4a'], transition: { to: '/c', fullTo: '/c', actions: [], guards: [] } },
            { firedIn: '/a/a5/a5a', leaves: ['/a/a5/a5a'], transition: { actions: [], guards: [] } },
          ],
          [
            '/a/a2/a2a/a2a1',
            '/a/a2/a2a/a2a2',
            '/a/a1',
            '/a/a2',
            '/a/a3',
            '/a/a4',
            '/a/a5',
          ]
        )
      ).toEqual([
        { from: undefined, transition: { actions: [], guards: [] } },
        { from: undefined, transition: { actions: [], guards: [] } },
        { from: '/a', transition: { to: '/b', fullTo: '/b', actions: [], guards: [] } },
      ])
    })
  })

})
