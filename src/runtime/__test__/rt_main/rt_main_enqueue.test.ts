import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { createMachine } from '../../../machine/createMachine'
import { createRuntime } from '../../Runtime'

describe('rt_main_enqueue', () => {
  test('1:名前付きアクションを順番に実行する', async () => {
    const calls: string[] = []
    const machine = createMachine({
      actions: {
        first: () => calls.push('first'),
        second: () => calls.push('second'),
      }
    }, ({ entryHook }) => ({
      a: [entryHook(({ enqueue }) => {
        enqueue('first')
        enqueue('second')
      })]
    }))
    createRuntime(machine).start()
    expect(calls).toEqual(['first', 'second'])
  })

  test('2:インライン。enqueueした順番で呼ばれる。', async () => {
    const machine = createMachine({
      initContext: () => ({ count: 0 }),
    }, ({ entryHook }) => ({
      a: [entryHook(({ enqueue, c, update }) => {
        //enqueue(({ update, c }) => update({ count: c.count + 1 }))
        //enqueue(({ update, c }) => update({ count: c.count + 1 }))
        // update はどちらのものを使ってもいいが、 context は enqueue のものを使わないと古い値が参照される
        enqueue(({ c }) => update({ count: c.count + 1 }))
        enqueue(({ c }) => update({ count: c.count + 1 }))
      })]
    }))
    const rt = createRuntime(machine).start()
    expect(rt.context.count).toBe(2)
  })

  test('3:event に応じて enqueue 内容を切り替えられる', async () => {
    const calls: string[] = []
    const machine = createMachine({
      types: {
        events: {} as { type: 'go', flag: boolean }
      },
      actions: {
        yes: () => calls.push('yes'),
        no: () => calls.push('no'),
      },
    }, ({ on }) => ({
      a: [
        on('go', {
          actions: ({ enqueue, e }) => {
            if (e.flag) enqueue('yes')
            else enqueue('no')
          }
        })
      ]
    }))
    const rt = createRuntime(machine).start()
    rt.send({ type: 'go', flag: true })
    rt.send({ type: 'go', flag: false })
    expect(calls).toEqual(['yes', 'no'])
  })

  test('4:check', async () => {
    const spy = jest.fn()
    const machine = createMachine({
      types: {
        context: {} as { ok: boolean },
      },
      guards: { isOk: ({ c }) => c.ok },
      actions: {
        onOk: spy,
      },
      initContext: () => ({ ok: true })
    }, ({ entryHook }) => ({
      a: [
        entryHook(({ enqueue, check }) => {
          if (check('isOk')) {
            enqueue('onOk')
          }
        }),
      ]
    }))
    createRuntime(machine).start()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('5:param 付き enqueue', async () => {
    const spy = jest.fn()
    const machine = createMachine({
      actions: {
        log: (_, params: { msg: string }) => spy(params.msg),
      },
    }, ({ entryHook }) => ({
      a: [
        entryHook(({ enqueue }) => {
          enqueue({ log: { msg: 'hello' } })
        }),
      ]
    }))
    createRuntime(machine).start()
    expect(spy).toHaveBeenCalledWith('hello')
  })

  test('6:何もしない enqueue でエラーにならない', async () => {
    const spy = jest.fn()
    const machine = createMachine({
      initContext: () => ({ n: 0 }),
    }, ({ entryHook }) => ({
      a: [
        entryHook(({ enqueue }) => {
          enqueue(() => { })
        }),
      ]
    }))
    const rt = createRuntime(machine).start()
    expect(rt.context.n).toBe(0)
  })

  test('7:ネストした enqueue はサポート外', async () => {
    const calls: string[] = []
    const machine = createMachine({
    }, ({ entryHook }) => ({
      a: [
        entryHook(({ enqueue }) => {
          enqueue(() => {
            enqueue(() => calls.push('inner'))
          })
          enqueue(() => calls.push('outer'))
        }),
      ]
    }))
    expect(() => createRuntime(machine).start()).toThrow()
  })

  test('8: exit', async () => {
    const calls: string[] = []
    const machine = createMachine({
      actions: { bye: () => calls.push('bye') }
    }, ({ exitHook, on }) => ({
      a: [
        exitHook(({ enqueue }) => {
          enqueue('bye')
        }),
        on('next', { to: 'b' })
      ],
      b: []
    }))
    const rt = createRuntime(machine).start()
    rt.send({ type: 'next' })
    expect(calls).toEqual(['bye'])
  })


})
