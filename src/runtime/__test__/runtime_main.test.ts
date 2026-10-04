import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { createMachine } from '../../machine/createMachine'
import { createRuntime } from '../Runtime'

describe('Runtime', () => {
  describe('単純な遷移の確認', () => {
    const stoplightMachine = createMachine(
      {
        types: {
          events: {} as { type: 'timer' } | { type: 'powerOutage' } | { type: 'powerRestored' },
        },
        name: 'stoplight',
      },
      ({ on }) => [
        [on('powerOutage', { to: 'flashingRed' })],
        {
          red: [on('timer', { to: 'green' })],
          green: [on('timer', { to: 'yellow' })],
          yellow: [on('timer', { to: 'red' })],
          flashingRed: [on('powerRestored', { to: 'green' })],
        },
      ],
    )

    test('1: start 前', async () => {
      const stoplightRt = createRuntime(stoplightMachine)
      expect(stoplightRt.states).toEqual([])
    })

    test('1: start', async () => {
      //const unsubscribe1 = stoplightRt.subscribe(observer1)
      //const unsubscribe2 = stoplightRt.subscribe(observer2)
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      expect(stoplightRt.states).toEqual(['/red'])
    })

    test('2: send 1', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      expect(stoplightRt.states).toEqual(['/green'])
    })

    test('2: send unknown event', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      expect(stoplightRt.states, 'before').toEqual(['/green'])

      // @ts-expect-error
      stoplightRt.send('unknown event')
      expect(stoplightRt.states, 'after').toEqual(['/green'])
      expect(observer).toHaveBeenCalledTimes(2)
    })

    test('2: send 2', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(3)
      expect(stoplightRt.states).toEqual(['/yellow'])
      stoplightRt.send('powerRestored')
      expect(observer).toHaveBeenCalledTimes(3)
      expect(stoplightRt.states).toEqual(['/yellow'])
    })

    test('2: send 3', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(3)
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(4)
      expect(stoplightRt.states).toEqual(['/red'])
    })

    test('2: send powerOutage', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(3)
      stoplightRt.send('powerOutage')
      expect(observer).toHaveBeenCalledTimes(4)
      expect(stoplightRt.states).toEqual(['/flashingRed'])
    })

    test('2: send powerOutage and timer', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(3)
      stoplightRt.send('powerOutage')
      expect(observer).toHaveBeenCalledTimes(4)
      expect(stoplightRt.states).toEqual(['/flashingRed'])
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(4)
      expect(stoplightRt.states).toEqual(['/flashingRed'])
    })

    test('2: send powerRestored', async () => {
      const observer = jest.fn()
      const stoplightRt = createRuntime(stoplightMachine)
      stoplightRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      stoplightRt.start()
      expect(observer).toHaveBeenCalledTimes(1)

      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(2)
      stoplightRt.send('timer')
      expect(observer).toHaveBeenCalledTimes(3)
      stoplightRt.send('powerOutage')
      expect(observer).toHaveBeenCalledTimes(4)
      stoplightRt.send('powerRestored')
      expect(observer).toHaveBeenCalledTimes(5)
      expect(stoplightRt.states).toEqual(['/green'])
    })
  })

  describe('guard と actins の確認', () => {
    const loginMachine = createMachine(
      {
        types: {
          events: {} as { type: 'LOGIN_FAILED' } | { type: 'LOGIN_SUCCESS' },
        },
        initContext: () => ({ failedAttempts: 0 }),
      },
      ({ on }) => ({
        idle: [
          on('LOGIN_FAILED', [
            {
              to: 'locked',
              guard: ({ c }) => c.failedAttempts >= 2,
              actions: ({ update, c }) => update({ failedAttempts: c.failedAttempts + 1 }),
            },
            {
              actions: ({ update, c }) => update({ failedAttempts: c.failedAttempts + 1 }),
            },
          ]),
          on('LOGIN_SUCCESS', { to: 'loggedIn' }),
        ],
        locked: null,
        loggedIn: null,
      }),
    )

    test('1: 1回目のログイン失敗ではロックされない', async () => {
      const loginRt = createRuntime(loginMachine).start()
      loginRt.send('LOGIN_FAILED')
      expect(loginRt.states).toEqual(['/idle'])
      expect(loginRt.context.failedAttempts).toBe(1)
    })

    test('2: 2回目のログイン失敗でもロックされない', async () => {
      const loginRt = createRuntime(loginMachine).start()
      loginRt.send('LOGIN_FAILED')
      loginRt.send('LOGIN_FAILED')
      expect(loginRt.states).toEqual(['/idle'])
      expect(loginRt.context.failedAttempts).toBe(2)
      expect(loginRt.runtimeStatus).toBe('active')
    })

    test('3: 3回目のログイン失敗でロックされる', async () => {
      const loginRt = createRuntime(loginMachine).start()
      loginRt.send('LOGIN_FAILED')
      loginRt.send('LOGIN_FAILED')
      loginRt.send('LOGIN_FAILED')
      expect(loginRt.states).toEqual(['/locked'])
      expect(loginRt.context.failedAttempts).toBe(3)
      expect(loginRt.runtimeStatus).toBe('completed')
    })

    test('4: observer', async () => {
      const observer = jest.fn()
      const loginRt = createRuntime(loginMachine)
      loginRt.subscribe(observer)
      expect(observer).toHaveBeenCalledTimes(0)

      loginRt.start()
      expect(observer).toHaveBeenCalledTimes(1)
      loginRt.send('LOGIN_FAILED')
      expect(observer).toHaveBeenCalledTimes(2)
      loginRt.send('LOGIN_FAILED')
      expect(observer).toHaveBeenCalledTimes(3)
      loginRt.send('LOGIN_FAILED')
      expect(observer).toHaveBeenCalledTimes(4)

      expect(loginRt.states).toEqual(['/locked'])
      expect(loginRt.context.failedAttempts).toBe(3)

      const mockCalls = observer.mock.calls!
      expect(mockCalls[0]![0]).toEqual({
        states: ['/idle'],
        stateValue: '/idle',
        context: { failedAttempts: 0 },
        runtimeStatus: 'active',
        output: undefined,
      })
      expect(mockCalls[0]![1]).toEqual({
        states: [],
        stateValue: [],
        context: { failedAttempts: 0 },
        runtimeStatus: 'stopped',
        output: undefined,
      })

      expect(mockCalls[1]![0]).toEqual({
        states: ['/idle'],
        stateValue: '/idle',
        context: { failedAttempts: 1 },
        runtimeStatus: 'active',
        output: undefined,
      })
      // states と context は変更があるときだけ別の実体になる
      expect(mockCalls[1]![0].states).toBe(mockCalls[1]![1].states)
      expect(mockCalls[1]![0].context).not.toBe(mockCalls[1]![1].context)

      expect(mockCalls[2]![0]).toEqual({
        states: ['/idle'],
        stateValue: '/idle',
        context: { failedAttempts: 2 },
        runtimeStatus: 'active',
        output: undefined,
      })
      expect(mockCalls[2]![0].states).toBe(mockCalls[2]![1].states)
      expect(mockCalls[2]![0].context).not.toBe(mockCalls[2]![1].context)

      expect(mockCalls[3]![0]).toEqual({
        states: ['/locked'],
        stateValue: '/locked',
        context: { failedAttempts: 3 },
        runtimeStatus: 'completed',
        output: undefined,
      })
      expect(mockCalls[3]![0].states).not.toBe(mockCalls[3]![1].states)
      expect(mockCalls[3]![0].context).not.toBe(mockCalls[3]![1].context)
    })
  })

  describe('entry と exit と always', () => {
    const orderMachine = createMachine(
      {
        types: { input: {} as { stock: number }, events: {} as { type: 'CONFIRM' } },
        name: 'order',
        initContext: (input) => ({
          stock: input.stock,
          trace: [] as string[],
        }),
      },
      ({ on, entryHook, exitHook }) => ({
        pending: [on('CONFIRM', { to: 'checking' })],
        checking: [
          entryHook(({ update, c }) => update({ trace: [...c.trace, 'checking.entry'] })),
          exitHook(({ update, c }) => update({ trace: [...c.trace, 'checking.exit'] })),
          on(':always:', [{ to: 'shipping', guard: ({ c }) => c.stock > 0 }, { to: 'outOfStock' }]),
        ],
        shipping: [entryHook(({ update, c }) => update({ trace: [...c.trace, 'shipping.entry'] }))],
        outOfStock: [entryHook(({ update, c }) => update({ trace: [...c.trace, 'outOfStock.entry'] }))],
      }),
    )

    test('1:在庫がある場合、checking の entry → always → exit → shipping の entry が実行される', async () => {
      const orderRt = createRuntime(orderMachine, { input: () => ({ stock: 1 }) }).start()
      expect(orderRt.stateValue).toBe('/pending')
      orderRt.send('CONFIRM')
      expect(orderRt.stateValue).toBe('/shipping')
      expect(orderRt.context.trace).toEqual(['checking.entry', 'checking.exit', 'shipping.entry'])
    })

    test('2:在庫がない場合、outOfStock に遷移する', async () => {
      const orderRt = createRuntime(orderMachine, { input: () => ({ stock: 0 }) }).start()
      expect(orderRt.stateValue).toBe('/pending')
      orderRt.send('CONFIRM')
      expect(orderRt.stateValue).toBe('/outOfStock')
      expect(orderRt.context.trace).toEqual(['checking.entry', 'checking.exit', 'outOfStock.entry'])
    })
  })

  describe('always の連鎖', () => {
    const orderMachine = createMachine(
      {
        types: { input: {} as { isValid: boolean } },
        name: 'order',
        initContext: ({ isValid }) => ({ isValid, trace: [] as string[] }),
      },
      ({ on, entryHook, exitHook }) => ({
        idle: [on('START', { to: 'checking' })],
        checking: [
          entryHook(({ c, update }) => update({ trace: [...c.trace, 'checking.entry'] })),
          on(':always:', [
            {
              to: 'processing',
              guard: ({ c }) => c.isValid,
              actions: ({ c, update }) => update({ trace: [...c.trace, 'checking.always'] }),
            },
            { to: 'invalid' },
          ]),
          exitHook(({ c, update }) => update({ trace: [...c.trace, 'checking.exit'] })),
        ],
        invalid: null,
        processing: [
          entryHook(({ c, update }) => update({ trace: [...c.trace, 'processing.entry'] })),
          on(':always:', {
            to: 'completed',
            actions: ({ c, update }) => update({ trace: [...c.trace, 'processing.always'] }),
          }),
          exitHook(({ c, update }) => update({ trace: [...c.trace, 'processing.exit'] })),
        ],
        completed: [
          { final: true },
          entryHook(({ c, update }) => update({ trace: [...c.trace, 'completed.entry'] })),
        ],
      }),
    )

    test('1:always による遷移が連鎖して completed まで到達する', async () => {
      const runtime = createRuntime(orderMachine, { input: () => ({ isValid: true }) }).start()
      runtime.send({ type: 'START' })
      expect(runtime.stateValue).toBe('/completed')
      expect(runtime.context.trace).toEqual([
        'checking.entry',
        'checking.always',
        'checking.exit',
        'processing.entry',
        'processing.always',
        'processing.exit',
        'completed.entry',
      ])
      expect(runtime.runtimeStatus).toBe('completed')
    })

    test('2:isValid が false だと checking から invalid に飛ぶ', async () => {
      const runtime = createRuntime(orderMachine, { input: () => ({ isValid: false }) }).start()
      runtime.send({ type: 'START' })
      expect(runtime.stateValue).toBe('/invalid')
      expect(runtime.runtimeStatus).toBe('completed')
    })
  })

  describe('subState', () => {
    const orderMachine = createMachine(
      {
        name: 'order',
        types: {
          context: {} as { amount: number; balance: number; trace: string[], doneOutput?: string },
          events: {} as { type: 'submit' } | { type: 'pay' } | { type: 'cancel' },
          input: {} as { amount: number; balance: number },
        },
        initContext: ({ amount, balance }) => ({ amount, balance, trace: [] }),
        guards: {
          isValid: ({ c }) => c.amount > 0,
          hasFunds: ({ c }) => c.balance >= c.amount,
        },
        actions: {
          logValidated: () => { },
          debitBalance: ({ c, update }) => update({ balance: c.balance - c.amount }),
        },
      },
      ({ on, subStates, entryHook }) => ({
        idle: [
          entryHook(({ c, update }) => update({ trace: [...c.trace, '/idle'] })),
          on('submit', { to: 'processing' }),
        ],
        processing: [
          entryHook(({ c, update }) => update({ trace: [...c.trace, '/processing'] })),
          on(':childDone:', {
            to: 'completed',
            actions: ({ e, update }) => update({ doneOutput: e.output as string }),
          }),
          subStates({
            validating: [
              entryHook(({ c, update }) => update({ trace: [...c.trace, '/processing/validating'] }), 'logValidated'),
              on(':always:', [{ to: 'paymentPending', guard: 'isValid' }, { to: 'rejected' }]),
            ],
            paymentPending: [
              //on(':always:', { to: '/completed' }), // TMP
              entryHook(({ c, update }) => update({ trace: [...c.trace, '/processing/paymentPending'] })),
              on('pay', [{ to: 'success', guard: 'hasFunds', actions: 'debitBalance' }, { to: 'failed' }]),
            ],
            success: [
              { final: () => 'success' },
              entryHook(({ c, update }) => update({ trace: [...c.trace, '/processing/success'] })),
            ],
            failed: [
              { final: true },
              entryHook(({ c, update }) => update({ trace: [...c.trace, '/processing/failed'] })),
            ],
            rejected: [
              { final: true },
              entryHook(({ c, update }) => update({ trace: [...c.trace, '/processing/rejected'] })),
            ],
          }),
        ],
        completed: [
          { final: true },
          entryHook(({ c, update }) => update({ trace: [...c.trace, '/completed'] }))
        ],
      }),
    )

    test('1:subState 内の always から自動で兄弟ステートに遷移', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      // isValid: amount > 0 なので always で paymentPending まで進んでいるはず
      expect(rt.stateValue).toBe('/processing/paymentPending')

      expect(rt.context.trace).toEqual(['/idle', '/processing', '/processing/validating', '/processing/paymentPending'])
    })

    test('2: childDone 1', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 0, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      // /processing/rejected に到達し childDone が発火してるはず
      expect(rt.stateValue).toEqual('/completed')
      expect(rt.runtimeStatus).toBe('completed')

      expect(rt.context.trace).toEqual([
        '/idle',
        '/processing',
        '/processing/validating',
        '/processing/rejected',
        '/completed',
      ])
    })

    test('2: childDone 2', async () => {
      const mockFn1 = jest.fn()
      //orderMachine.actions.logValidated = mockFn1
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      //expect(mockFn1).toHaveBeenCalledTimes(1)

      // /processing/rejected に到達し childDone が発火してるはず
      expect(rt.stateValue).toEqual('/processing/paymentPending')
      expect(rt.runtimeStatus).toBe('active')

      expect(rt.context.trace).toEqual(['/idle', '/processing', '/processing/validating', '/processing/paymentPending'])
    })

    test('3: 残高balance が足りてるので success に移行', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 200 }),
      }).start()

      rt.send('submit').send('pay')

      expect(rt.context.trace).toEqual([
        '/idle',
        '/processing',
        '/processing/validating',
        '/processing/paymentPending',
        '/processing/success',
        '/completed',
      ])
      expect(rt.context.doneOutput).toBe('success')
      expect(rt.runtimeStatus).toBe('completed')
    })

    test('3: 残高balance が足りないので failed に移行', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 0 }),
      }).start()

      rt.send('submit').send('pay')

      expect(rt.context.trace).toEqual([
        '/idle',
        '/processing',
        '/processing/validating',
        '/processing/paymentPending',
        '/processing/failed',
        '/completed',
      ])
      expect(rt.context.doneOutput).toBe(undefined)
      expect(rt.runtimeStatus).toBe('completed')
    })
  })

  describe('parallel', () => {
    const log = (name: string) => ({ update, c }: any) => update({ trace: [...c.trace, name] })

    const machine = createMachine({
      types: {
        context: {} as { trace: string[], result?: unknown },
        events: {} as { type: 'start' | 'ping' | 'go_all' | 'go_c1' | 'go_c2' | 'reset' }
      },
      initContext: () => ({ trace: [] }),
    }, ({ on, entryHook, exitHook, parallel }) => ({
      idle: [
        entryHook(log('idle:entry')),
        exitHook(log('idle:exit')),
        on('start', { to: 'working' }),
      ],
      working: [
        entryHook(log('working:entry')),
        exitHook(log('working:exit')),
        on(':childDone:', {
          to: 'finished',
          actions: [log('working:childDone'), ({ update, e }) => update({ result: e.output })],
        }),
        parallel({
          regionA: [
            [
              entryHook(log('regionA:entry')),
              exitHook(log('regionA:exit')),
            ], {
              a1: [
                entryHook(log('a1:entry')),
                exitHook(log('a1:exit')),
                on('ping', { actions: log('a1:ping') }),
                on('go_all', { to: 'a2' })
              ],
              a2: [
                entryHook(log('a2:entry')),
                exitHook(log('a2:exit')),
                { final: true }
              ]
            }
          ],
          regionB: [
            [
              entryHook(log('regionB:entry')),
              exitHook(log('regionB:exit')),
            ], {
              b1: [
                entryHook(log('b1:entry')),
                exitHook(log('b1:exit')),
                on('ping', { actions: log('b1:ping') }),
                on('go_all', { to: 'b2' })
              ],
              b2: [
                entryHook(log('b2:entry')),
                exitHook(log('b2:exit')),
                { final: () => 'B' }
              ]
            }
          ],
          regionC: [
            [
              entryHook(log('regionC:entry')),
              exitHook(log('regionC:exit')),
            ], {
              c: [
                parallel({
                  c1: [
                    [
                      entryHook(log('c1:entry')),
                      exitHook(log('c1:exit')),
                    ],
                    {
                      c1_1: [
                        entryHook(log('c1_1:entry')),
                        exitHook(log('c1_1:exit')),
                        on('ping', { actions: log('c1_1:ping') }),
                        on('go_c1', { to: 'c1_2' })
                      ],
                      c1_2: [
                        entryHook(log('c1_2:entry')),
                        exitHook(log('c1_2:exit')),
                        { final: true },
                      ]
                    }
                  ],
                  c2: [
                    [
                      entryHook(log('c2:entry')),
                      exitHook(log('c2:exit')),
                    ],
                    {
                      c2_1: [
                        entryHook(log('c2_1:entry')),
                        exitHook(log('c2_1:exit')),
                        on('ping', { actions: log('c2_1:ping') }),
                        on('go_c2', { to: 'c2_2' })
                      ],
                      c2_2: [
                        entryHook(log('c2_2:entry')),
                        exitHook(log('c2_2:exit')),
                        { final: () => 'C2' },
                      ]
                    }
                  ]
                })
              ],
            }
          ],
        }),
      ],
      finished: [
        entryHook(log('finished:entry')),
        exitHook(log('finished:exit')),
        on('reset', { to: 'idle' })
      ]
    }))
    //console.log(`DBG:100: `, machine.definition.stateOf.working.sub?.stateOf)

    /** 直前の確認以降に増えた trace だけを取り出す */
    const makeTracer = (runtime: ReturnType<typeof createRuntime<any, any, any, any, any, any, any, any, any>>) => {
      let mark = 0;
      return () => {
        const all = runtime.context.trace;
        const diff = all.slice(mark);
        mark = all.length;
        return diff;
      };
    };

    /** 順序を問わず要素が一致すること（並列リージョン間の順序に依存させないため） */
    const sameMembers = (actual: string[], expected: string[]) =>
      expect([...actual].sort()).toEqual([...expected].sort());

    test('0:開始すると idle に入る', async () => {
      const rt = createRuntime(machine).start()
      const take = makeTracer(rt)
      expect(take()).toEqual(['idle:entry'])
    })

    test('0:send "start" で全リージョンのentryが実行される', async () => {
      const rt = createRuntime(machine).start()
      const take = makeTracer(rt)
      take() // 初期分を捨てる

      rt.send('start')

      expect(rt.states).toEqual([
        '/working/regionA/a1',
        '/working/regionB/b1',
        '/working/regionC/c/c1/c1_1',
        '/working/regionC/c/c2/c2_1'
      ])
      expect(rt.stateValue).toEqual([
        '/working/regionA/a1',
        '/working/regionB/b1',
        '/working/regionC/c/c1/c1_1',
        '/working/regionC/c/c2/c2_1'
      ])
      const t = take()
      expect(t[0]).toEqual('idle:exit')
      expect(t.slice(1)).toEqual([
        "working:entry",
        "regionA:entry",
        "a1:entry",
        "regionB:entry",
        "b1:entry",
        "regionC:entry",
        "c1:entry",
        "c1_1:entry",
        "c2:entry",
        "c2_1:entry",
      ])
    })

    test('0:複数リージョンで同じイベントが同時に実行', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      const take = makeTracer(rt)
      take()

      rt.send('ping')
      expect(take()).toEqual(["a1:ping", "b1:ping", "c1_1:ping", "c2_1:ping"])
    })

    test('0:同時に遷移。childDone はまだ動かない。', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      const take = makeTracer(rt)
      take()
      expect(rt.states).toEqual([
        "/working/regionA/a1",
        "/working/regionB/b1",
        "/working/regionC/c/c1/c1_1",
        "/working/regionC/c/c2/c2_1",
      ])

      rt.send('go_all')
      expect(take()).toEqual(["a1:exit", "b1:exit", "a2:entry", "b2:entry"])
      expect(rt.states).toEqual([
        "/working/regionA/a2",
        "/working/regionB/b2",
        "/working/regionC/c/c1/c1_1",
        "/working/regionC/c/c2/c2_1",
      ])
      expect(rt.context.trace).not.toContain('working:childDone')
    })

    test('0:入れ子のparallel の片方だけ完了では childDoneにならない', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      const take = makeTracer(rt)
      take()

      rt.send('go_c1')
      expect(take()).toEqual(["c1_1:exit", "c1_2:entry"])
      expect(rt.states).toEqual([
        "/working/regionA/a2",
        "/working/regionB/b2",
        "/working/regionC/c/c1/c1_2",
        "/working/regionC/c/c2/c2_1",
      ])
      expect(rt.context.trace).not.toContain('working:childDone')
    })

    test('0:全リージョンの終了で childDone が動き /finishedに遷移', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      rt.send('go_c1')
      const take = makeTracer(rt)
      take()

      rt.send('go_c2')
      const t = take()
      expect(rt.states).toEqual(['/finished'])
      expect(t).toEqual([
        "c2_1:exit",
        "c2_2:entry",
        "working:childDone", // TBC: childDone のタイミングはこれでいいのか？
        "a2:exit",
        "regionA:exit",
        "b2:exit",
        "regionB:exit",
        "c1_2:exit",
        "c1:exit",
        "c2_2:exit",
        "c2:exit",
        "regionC:exit",
        "working:exit",
        "finished:entry",
      ])
      expect(rt.context.trace).toEqual([
        "idle:entry", "idle:exit", "working:entry", "regionA:entry", "a1:entry", "regionB:entry", "b1:entry",
        "regionC:entry", "c1:entry", "c1_1:entry", "c2:entry", "c2_1:entry", "a1:exit", "b1:exit", "a2:entry",
        "b2:entry", "c1_1:exit", "c1_2:entry", "c2_1:exit", "c2_2:entry", "working:childDone", "a2:exit",
        "regionA:exit", "b2:exit", "regionB:exit", "c1_2:exit", "c1:exit", "c2_2:exit", "c2:exit", "regionC:exit",
        "working:exit", "finished:entry"
      ])
    })

    test('0: childDone の output の内容確認', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      rt.send('go_c1')
      rt.send('go_c2')

      expect(rt.context.result).toEqual({
        regionB: 'B',
        regionC: {
          'c2': 'C2',
        },
      })
    })

    test('0:イベントの順序が違っても動く', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      rt.send('go_c2')
      rt.send('go_c1')

      expect(rt.states.every(e => e.startsWith('/working'))).toBe(true)

      rt.send('go_all')

      expect(rt.states).toEqual(['/finished'])
      expect(rt.context.result).toEqual({
        regionB: 'B',
        regionC: {
          'c2': 'C2',
        },
      })
    })

    test('0:', async () => {
      const rt = createRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      rt.send('go_c1')
      rt.send('go_c2')
      const take = makeTracer(rt)
      take()

      rt.send('reset')

      expect(take()).toEqual([
        "finished:exit", "idle:entry"
      ])
    })

  })
})
