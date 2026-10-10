import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { sleep } from 'bun'
import { createMachine } from '../../../machine/createMachine'
import { createRuntime, type Runtime } from '../../Runtime'

describe('rt_main_invoke', () => {
  // 非同期処理をテスト側で任意に操作するヘルパー
  function deferred<T = void>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  test('1:resolve するまで遷移しない。resolveすると遷移し結果がoutputに渡される', async () => {
    const d = deferred<{ id: string }>()
    const machine = createMachine(
      {
        initContext: () => ({ user: null as null | { id: string } }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            () => d.promise,
            on('done', { to: 'success', actions: ({ update, e }) => update({ user: e.output }) }),
            on('error', { to: 'failure' }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = createRuntime(machine).start()
    expect(rt.stateValue).toBe('/loading')

    d.resolve({ id: 'u1' })
    await flush()

    expect(rt.stateValue).toBe('/success')
    expect(rt.context.user).toEqual({ id: 'u1' })
  })

  test('2.1:同期的なreject', async () => {
    const err = new Error()
    const machine = createMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            () => {
              throw err
            },
            on('done', { to: 'success' }),
            on('error', { to: 'failure', actions: ({ update, e }) => update({ error: e.error }) }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = createRuntime(machine).start()
    await flush()

    expect(rt.stateValue).toBe('/failure')
    expect(rt.context.error).toBe(err)
  })

  test('2.2:非同期的なreject', async () => {
    const err = new Error()
    const machine = createMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            {},
            async () => {
              throw err
            },
            on('done', { to: 'success' }),
            on('error', { to: 'failure', actions: ({ update, e }) => update({ error: e.error }) }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = createRuntime(machine).start()
    await flush()

    expect(rt.stateValue).toBe('/failure')
    expect(rt.context.error).toBe(err)
  })

  test.todo('0:onError が未定義のときでも subscribe で捕捉できる', async () => {
    const machine = createMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            async () => {
              throw Error()
            },
            on('done', { to: 'success' }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = createRuntime(machine)
    // TODO: subscribe で error を捕捉できるようにする
    const errSpy = jest.fn((x) => {
      console.log(`DBG:100: `, x)
    })
    rt.subscribe(errSpy)
    rt.start()
    await flush()
    expect(errSpy).toHaveBeenCalled()
  })

  test('3:input の src への受け渡し', async () => {
    const src = jest.fn(async (_: { query: string }) => 'ok')
    const machine = createMachine(
      {
        initContext: () => ({ q: 'initial' }),
      },
      ({ invoke, on }) => ({
        idle: [on('search', { to: 'searching', actions: ({ update }) => update({ q: 'hello' }) })],
        searching: [invoke({ input: ({ c }) => ({ query: c.q }) }, src)],
      }),
    )
    const rt = createRuntime(machine).start()
    rt.send({ type: 'search' })
    await flush()

    expect(rt.stateValue).toBe('/searching')
    expect(src).toHaveBeenCalledTimes(1)
    expect(src.mock.calls[0]![0]).toEqual({ query: 'hello' })
  })

  describe('4.invoke のキャンセル', () => {
    const build = (src: any) =>
      createMachine(
        {
          initContext: () => ({ user: null as any }),
        },
        ({ invoke, on }) => ({
          loading: [
            invoke(
              {},
              src,
              on('done', { to: 'success', actions: ({ update, e }) => update({ user: e.output }) }),
              on('error', { to: 'failure' }),
            ),
            on('cancel', { to: 'idle' }),
          ],
          success: null,
          failure: null,
          idle: null,
        }),
      )

    test('4.1:キャンセルされると signal が abort に', async () => {
      let signal!: AbortSignal
      const rt = createRuntime(
        build((_: any, options: any) => {
          signal = options.signal
          return new Promise(() => { })
        }),
      ).start()
      await flush()

      expect(signal.aborted).toBe(false)
      rt.send({ type: 'cancel' })
      await flush()
      expect(signal.aborted).toBe(true)
    })

    test('4.1:親Runtime を stop すると signal が abort される', async () => {
      const d = deferred<string>()
      let signal!: AbortSignal
      const rt = createRuntime(
        build((_: any, options: any) => {
          signal = options.signal
          return d.promise
        }),
      ).start()
      await flush()
      const listener = jest.fn()
      rt.subscribe(listener)

      rt.stop()
      listener.mockClear()
      expect(signal.aborted).toBe(true)

      d.resolve('late')
      await flush()
      expect(listener).not.toHaveBeenCalled()
    })

    test('4.2.1:キャンセルされたら invoke による遷移も update も起こらない', async () => {
      const d = deferred<string>()
      const rt = createRuntime(build(() => d.promise)).start()
      rt.send({ type: 'cancel' })
      d.resolve('late')
      await flush()
      expect(rt.stateValue).toBe('/idle')
      expect(rt.context.user).toBeNull()
    })

    test('4.2.2:キャンセルされたら onErrorに遷移しないし例外も発生しない', async () => {
      const d = deferred<string>()
      const unhandled = jest.fn()
      process.on('unhandledRejection', unhandled) // 捕捉されなかった reject イベントを監視する(nodeや bun の機能)

      const rt = createRuntime(build(() => d.promise)).start()
      rt.send({ type: 'cancel' })
      d.reject(new Error('late'))
      await flush()
      expect(rt.stateValue).toBe('/idle')
      expect(unhandled).not.toHaveBeenCalled()
      process.off('unhandledRejection', unhandled)
    })
  })

  test('5:複数 invoke', async () => {
    const a = deferred<string>()
    const b = deferred<string>()

    const machine = createMachine(
      {
        initContext: () => ({ value: '' }),
      },
      ({ invoke, on, parallel }) => ({
        root: [
          parallel({
            a: [
              {
                pending: [invoke(() => a.promise, on('done', { to: 'done' }))],
                done: null,
              },
            ],
            b: [
              {
                pending: [invoke(() => b.promise, on('done', { to: 'done' }))],
                done: null,
              },
            ],
          }),
        ],
      }),
    )
    const rt = createRuntime(machine).start()
    b.resolve('b')
    await flush()
    expect(rt.states).toEqual(['/root/a/pending', '/root/b/done'])
    a.resolve('a')
    await flush()
    expect(rt.states).toEqual(['/root/a/done', '/root/b/done'])
  })

  describe('マシンを対象に invoke', () => {
    const makeChild = () =>
      createMachine(
        {
          initContext: () => ({ count: 0 }),
          output: ({ context }) => ({ total: context.count }),
        },
        ({ on }) => ({
          working: [
            on('inc', { actions: ({ update, c }) => update({ count: c.count + 1 }) }),
            on('finish', { to: 'done' }),
          ],
          done: null,
        }),
      )

    const makeParent = (child = makeChild()) =>
      createMachine(
        {
          initContext: () => ({ total: -1 }),
        },
        ({ invoke, on }) => ({
          running: [
            invoke(
              { id: 'CHILD' },
              child,
              on('done', { to: 'finished', actions: ({ update, e }) => update({ total: e.output.total }) }),
            ),
            on('abort', { to: 'aborted' }),
          ],
          finished: null,
          aborted: null,
        }),
      )

    test('0:state に入ると子マシンが起動し、_children から id で参照できる', async () => {
      const rt = createRuntime(makeParent()).start()
      const child = rt.getSnapshot()._children.CHILD! as Runtime<any>
      expect(rt.stateValue).toBe('/running')

      child.send({ type: 'inc' })
      child.send({ type: 'inc' })
      expect(rt.stateValue).toBe('/running')

      child.send({ type: 'finish' })
      expect(rt.stateValue).toBe('/finished')
      expect(rt.context.total).toBe(2)
    })

    test('0:input が子マシンに渡される', async () => {
      const child = createMachine({
        initContext: (input: { seed: number }) => ({ seed: input.seed })
      }, () => ({ a: [] }))
      const parent = createMachine({
        initContext: () => ({ seed: 42 }),
      }, ({ invoke }) => ({
        A: [invoke({ id: 'c', input: ({ c }) => ({ seed: c.seed }) }, child)]
      }))
      const rt = createRuntime(parent).start()
      expect((rt.getSnapshot()._children.c as any).context.seed).toBe(42)
    })

    test('0:親が state を抜けると子マシンが stop される', async () => {
      const rt = createRuntime(makeParent()).start()
      const child = rt.getSnapshot()._children.CHILD! as Runtime<any>
      rt.send({ type: 'abort' })

      expect(child.runtimeStatus).toBe('stopped')
      expect(rt.getSnapshot()._children).toEqual({})
    })

    test('0:停止した子に送ったイベントは親に影響しない', async () => {
      const rt = createRuntime(makeParent()).start()
      const child = rt.getSnapshot()._children.CHILD! as Runtime<any>
      rt.send({ type: 'abort' })

      child.send({ type: 'finish' })
      expect(rt.stateValue).toBe('/aborted')
    })

    test('0:親を stop すると子も stop される', async () => {
      const rt = createRuntime(makeParent()).start()
      const child = rt.getSnapshot()._children.CHILD! as Runtime<any>
      rt.stop()
      expect(child.runtimeStatus).toBe('stopped')
    })

    test('0:親の entryHooks が完了してから子の entryHooks が走る', async () => {
      const order: string[] = []
      const child = createMachine(
        {},
        ({ entryHook }) => ({ a: [entryHook(() => order.push('child entry'))] })
      )
      const parent = createMachine(
        {},
        ({ invoke, entryHook }) => ({
          A: [
            entryHook(() => order.push('parent entry')),
            invoke(child),
          ]
        })
      )
      createRuntime(parent).start()
      expect(order).toEqual(['parent entry', 'child entry'])
    })

  })
})
