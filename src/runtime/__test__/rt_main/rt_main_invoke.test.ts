import { sleep } from 'bun'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { createMachine } from '../../../machine/createMachine'
import { createRuntime } from '../../Runtime'

describe('rt_main_invoke', () => {
  let mockFn1: jest.Mock
  beforeAll(async () => {
    mockFn1 = jest.fn()
  })

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

  test('0:resolve するまで遷移しない。resolveすると遷移し結果がoutputに渡される', async () => {
    const d = deferred<{ id: string }>()
    const machine = createMachine({
      initContext: () => ({ user: null as null | { id: string } })
    }, ({ invoke, on }) => ({
      loading: [
        invoke(
          {},
          () => d.promise,
          on('done', { to: 'success', actions: ({ update, e }) => update({ user: e.output }) }),
          on('error', { to: 'failure' })
        )
      ],
      success: null,
      failure: null,
    }))
    const rt = createRuntime(machine).start()
    expect(rt.stateValue).toBe('/loading')

    d.resolve({ id: 'u1' })
    await flush()

    expect(rt.stateValue).toBe('/success')
    expect(rt.context.user).toEqual({ id: 'u1' })
  })

  test('0:同期的なreject', async () => {
    const err = new Error()
    const machine = createMachine({
      initContext: () => ({ error: null as unknown }),
    }, ({ invoke, on }) => ({
      loading: [
        invoke(
          {},
          () => { throw err },
          on('done', { to: 'success' }),
          on('error', { to: 'failure', actions: ({ update, e }) => update({ error: e.error }) }),
        )
      ],
      success: null,
      failure: null,
    }));
    const rt = createRuntime(machine).start()
    await flush()

    expect(rt.stateValue).toBe('/failure')
    expect(rt.context.error).toBe(err)
  })

  test('0:非同期的なreject', async () => {
    const err = new Error()
    const machine = createMachine({
      initContext: () => ({ error: null as unknown }),
    }, ({ invoke, on }) => ({
      loading: [
        invoke(
          {},
          async () => { throw err },
          on('done', { to: 'success' }),
          on('error', { to: 'failure', actions: ({ update, e }) => update({ error: e.error }) }),
        )
      ],
      success: null,
      failure: null,
    }));
    const rt = createRuntime(machine).start()
    await flush()

    expect(rt.stateValue).toBe('/failure')
    expect(rt.context.error).toBe(err)
  })

  test.todo('0:onError が未定義のときでも subscribe で捕捉できる', async () => {
    const machine = createMachine({
      initContext: () => ({ error: null as unknown }),
    }, ({ invoke, on }) => ({
      loading: [
        invoke(
          {},
          async () => { throw Error() },
          on('done', { to: 'success' }),
        )
      ],
      success: null,
      failure: null,
    }));
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

  test('0:input の src への受け渡し', async () => {
    const src = jest.fn(async (_: { query: string }) => 'ok')
    const machine = createMachine({
      initContext: () => ({ q: 'initial' }),
    }, ({ invoke, on }) => ({
      idle: [
        on('search', { to: 'searching', actions: ({ update }) => update({ q: 'hello' }) })
      ],
      searching: [
        invoke(
          { input: ({ c }) => ({ query: c.q }) },
          src,
        )
      ],
    }));
    const rt = createRuntime(machine).start()
    rt.send({ type: 'search' })
    await flush()

    expect(rt.stateValue).toBe('/searching')
    expect(src).toHaveBeenCalledTimes(1)
    expect(src.mock.calls[0]![0]).toEqual({ query: 'hello' })
  })

  describe('invoke のキャンセル', () => {
    const build = (src: any) => createMachine({
      initContext: () => ({ user: null as any }),
    }, ({ invoke, on }) => ({
      loading: [
        invoke(
          {}, src,
          on('done', { to: 'success', actions: ({ update, e }) => update({ user: e.output }) }),
          on('error', { to: 'failure' }),
        ),
        on('cancel', { to: 'idle' })
      ],
      success: null,
      failure: null,
      idle: null,
    }))

    test.todo('0:キャンセルされると signal が abort に', async () => {
      let signal!: AbortSignal
      const rt = createRuntime(
        build((_: any, options: any) => {
          console.log(`DBG:100: `, options)
          signal = options.signal
          return new Promise(() => { })
        })
      ).start()
      await flush()
      console.log(`DBG:100: `, signal)

      expect(signal.aborted).toBe(false)
      rt.send({ type: 'cancel' })
      await flush()
      expect(signal.aborted).toBe(true)
    })

    test('0:キャンセルされたら invoke による遷移も update も起こらない', async () => {
      const d = deferred<string>()
      const rt = createRuntime(build(() => d.promise)).start()
      rt.send({ type: 'cancel' })
      d.resolve('late')
      await flush()
      expect(rt.stateValue).toBe('/idle')
      expect(rt.context.user).toBeNull()
    })

    test('0:キャンセルされたら onErrorに遷移しないし例外も発生しない', async () => {
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

  test('0:複数 invoke', async () => {
    const a = deferred<string>()
    const b = deferred<string>()

    const src = jest.fn(async (_: { query: string }) => 'ok')

    const machine = createMachine(
      {
        initContext: () => ({ value: '' }),
      }, ({ invoke, on, parallel, subStates }) => ({
        root: [
          parallel({
            a: [
              {
                pending: [
                  invoke({}, () => a.promise, on('done', { to: 'done' }))
                ],
                done: null
              }
            ],
            b: [
              {
                pending: [
                  invoke({}, () => b.promise, on('done', { to: 'done' }))
                ],
                done: null
              }
            ]
          })
        ]
      })
    )
    const rt = createRuntime(machine).start()
    b.resolve('b')
    await flush()
    expect(rt.states).toEqual([
      '/root/a/pending',
      '/root/b/done',
    ])
    a.resolve('a')
    await flush()
    expect(rt.states).toEqual([
      '/root/a/done',
      '/root/b/done',
    ])
  })

  describe.todo('マシンを対象に invoke', () => {
    let mockFn1: jest.Mock
    beforeAll(async () => {
      mockFn1 = jest.fn()
    })

    const makeChild = () =>
      createMachine({
        initContext: () => ({ count: 0 }),
        output: ({ context }) => ({ total: context.count }),
      }, ({ on }) => ({
        working: [
          on('inc', { actions: ({ update, c }) => update({ count: c.count + 1 }) }),
          on('finish', { to: 'done' }),
        ],
        done: null
      }))

    const makeParent = (child = makeChild()) =>
      createMachine({
        initContext: () => ({ total: -1 }),
      }, ({ invoke, on }) => ({
        running: [
          invoke(
            { id: 'child' },
            child,
            on('done', { to: 'finished', actions: ({ update, e }) => update({ total: e.output.total }) })
          ),
          on('abort', { to: 'aborted' })
        ],
        finished: null,
        aborted: null,
      }))

  })




})
