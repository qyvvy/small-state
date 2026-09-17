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
          { isFinal: true },
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
    let mockFn1: jest.Mock
    beforeAll(async () => {
      mockFn1 = jest.fn()
    })
    const orderMachine = createMachine(
      {
        name: 'order',
        types: {
          context: {} as { amount: number; balance: number },
          events: {} as { type: 'submit' } | { type: 'pay' } | { type: 'cancel' },
          input: {} as { amount: number; balance: number },
        },
        initContext: ({ amount, balance }) => ({ amount, balance }),
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
        idle: [on('submit', { to: 'processing' })],
        processing: [
          on(':childDone:', { to: 'completed' }),
          subStates({
            validating: [
              entryHook('logValidated'),
              on(':always:', [{ to: 'paymentPending', guard: 'isValid' }, { to: 'rejected' }]),
            ],
            paymentPending: [
              on(':always:', { to: '/completed' }), // TMP
              on('pay', [{ to: 'success', guard: 'hasFunds', actions: 'debitBalance' }, { to: 'failed' }]),
            ],
            success: null,
            failed: null,
            rejected: null,
          }),
        ],
        completed: null,
      }),
    )

    test.only('0:', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 100 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      expect(rt.stateValue).toEqual('/completed')
    })

    test('1:subState 内の always から自動で兄弟ステートに遷移', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      // isValid: amount > 0 なので always で paymentPending まで進んでいるはず
      expect(rt.stateValue).toEqual('/processing/paymentPending')
    })

    test('2: childDone', async () => {
      const rt = createRuntime(orderMachine, {
        input: () => ({ amount: 0, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      // /processing/rejected に到達し childDone が発火してるはず
      expect(rt.stateValue).toEqual('/completed')
      expect(rt.runtimeStatus).toBe('completed')
    })
  })
})
