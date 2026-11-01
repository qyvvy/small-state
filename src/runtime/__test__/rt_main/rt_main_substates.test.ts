import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { makeMachine } from '../../../machine/machine'
import { makeRuntime } from '../../Runtime'

describe('rt_main/subStates', () => {
  describe('subState', () => {
    const orderMachine = makeMachine(
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
      const rt = makeRuntime(orderMachine, {
        input: () => ({ amount: 100, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      // isValid: amount > 0 なので always で paymentPending まで進んでいるはず
      expect(rt.stateValue).toBe('/processing/paymentPending')

      expect(rt.context.trace).toEqual(['/idle', '/processing', '/processing/validating', '/processing/paymentPending'])
    })

    test('2: childDone 1', async () => {
      const rt = makeRuntime(orderMachine, {
        input: () => ({ amount: 0, balance: 0 }),
      }).start()
      expect(rt.stateValue).toEqual('/idle')
      rt.send('submit')

      // /processing/rejected に到達し childDone が発火してるはず
      expect(rt.stateValue).toEqual('/completed')
      expect(rt.runtimeStatus).toBe('done')

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
      const rt = makeRuntime(orderMachine, {
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
      const rt = makeRuntime(orderMachine, {
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
      expect(rt.runtimeStatus).toBe('done')
    })

    test('3: 残高balance が足りないので failed に移行', async () => {
      const rt = makeRuntime(orderMachine, {
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
      expect(rt.runtimeStatus).toBe('done')
    })
  })

})
