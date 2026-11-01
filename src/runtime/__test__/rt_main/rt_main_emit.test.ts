import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { makeMachine } from '../../../machine/machine'
import { makeRuntime } from '../../Runtime'


describe('rt_main_emit', () => {
  const counterMachine = makeMachine({
    name: 'counter',
    types: {
      events: {} as { type: 'inc' } | { type: 'reset' },
      emitted: {} as
        | { type: 'incremented', count: number }
        | { type: 'limitReached' }
    },
    initContext: () => ({ count: 0 }),
  }, ({ on }) => [
    [
      on('inc', {
        actions: [
          ({ update, c }) => update({ count: c.count + 1 }),
          ({ emit, c }) => emit({ type: 'incremented', count: c.count })
        ],
      }),
      on('reset', { actions: ({ update }) => update({ count: 0 }) })
    ],
    { a: [] }
  ])

  test('0:inc で incremented が emit される', async () => {
    const rt = makeRuntime(counterMachine).start()
    const handler = jest.fn()
    rt.onEmitted('incremented', handler)
    rt.send({ type: 'inc' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ type: 'incremented', count: 1 })
  })

  test('0:複数回 send すると、その回数だけ emit される', async () => {
    const rt = makeRuntime(counterMachine).start()
    const handler = jest.fn()
    rt.onEmitted('incremented', handler)
    rt.send({ type: 'inc' })
    rt.send({ type: 'inc' })

    expect(handler.mock.calls.map(([e]) => e.count)).toEqual([1, 2])
  })

  test('0:reset では emit されない', async () => {
    const rt = makeRuntime(counterMachine).start()
    const handler = jest.fn()
    rt.onEmitted('incremented', handler)
    rt.send({ type: 'reset' })

    expect(handler).not.toHaveBeenCalled()
  })

  test('0:unsubscribe 後は呼ばれない', async () => {
    const rt = makeRuntime(counterMachine).start()
    const handler = jest.fn()
    const sub = rt.onEmitted('incremented', handler)
    rt.send({ type: 'inc' })
    sub.unsubscribe()
    rt.send({ type: 'inc' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

})
