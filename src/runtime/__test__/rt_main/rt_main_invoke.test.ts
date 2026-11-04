import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { sleep } from 'bun'
import type { EmitFn, ServiceFn } from '../../../machine/m.types'
import { defServiceFn, makeMachine } from '../../../machine/machine'
import { waitFor } from '../../../tools/waitFor'
import { makeRuntime } from '../../Runtime'

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
    const machine = makeMachine(
      {
        initContext: () => ({ user: null as null | { id: string } }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            () => d.promise,
            on(':done:', { to: 'success', actions: ({ update, e }) => update({ user: e.output }) }),
            on(':error:', { to: 'failure' }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = makeRuntime(machine).start()
    expect(rt.stateValue).toBe('/loading')

    d.resolve({ id: 'u1' })
    await flush()

    expect(rt.stateValue).toBe('/success')
    expect(rt.context.user).toEqual({ id: 'u1' })
  })

  test('2.1:同期的なreject', async () => {
    const err = new Error()
    const machine = makeMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            () => {
              throw err
            },
            on(':done:', { to: 'success' }),
            on(':error:', { to: 'failure', actions: ({ update, e }) => update({ error: e.error }) }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = makeRuntime(machine).start()
    await flush()

    expect(rt.stateValue).toBe('/failure')
    expect(rt.context.error).toBe(err)
  })

  test('2.2:非同期的なreject', async () => {
    const err = new Error()
    const machine = makeMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            async () => {
              throw err
            },
            on(':done:', { to: 'success' }),
            on(':error:', { to: 'failure', actions: ({ update, e }) => update({ error: e.error }) }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = makeRuntime(machine).start()
    await flush()

    expect(rt.stateValue).toBe('/failure')
    expect(rt.context.error).toBe(err)
  })

  test('2: :error: が未定義のときでも subscribe で捕捉できる', async () => {
    const machine = makeMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            async () => {
              throw Error('this is error.')
            },
            on(':done:', { to: 'success' }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = makeRuntime(machine)
    const errSpy = jest.fn((e) => {
      expect(e.message).toBe('this is error.')
    })
    rt.subscribe(undefined, errSpy)
    rt.start()
    await flush()
    expect(errSpy).toHaveBeenCalled()
  })

  test('2: :error: が定義済みのとき subscribe にエラーは流れない', async () => {
    const machine = makeMachine(
      {
        initContext: () => ({ error: null as unknown }),
      },
      ({ invoke, on }) => ({
        loading: [
          invoke(
            () => {
              throw Error()
            },
            on(':done:', { to: 'success' }),
            on(':error:', { actions: () => { } }),
          ),
        ],
        success: null,
        failure: null,
      }),
    )
    const rt = makeRuntime(machine)
    const errSpy = jest.fn(() => { })
    rt.subscribe(undefined, errSpy)
    rt.start()
    await flush()
    expect(errSpy).not.toHaveBeenCalled()
  })

  test('3:input の src への受け渡し', async () => {
    const src = jest.fn(async (_: { query: string }) => 'ok')
    const machine = makeMachine(
      {
        initContext: () => ({ q: 'initial' }),
      },
      ({ invoke, on }) => ({
        idle: [on('search', { to: 'searching', actions: ({ update }) => update({ q: 'hello' }) })],
        searching: [invoke(src, { input: ({ c }) => ({ query: c.q }) })],
      }),
    )
    const rt = makeRuntime(machine).start()
    rt.send({ type: 'search' })
    await flush()

    expect(rt.stateValue).toBe('/searching')
    expect(src).toHaveBeenCalledTimes(1)
    expect(src.mock.calls[0]![0]).toEqual({ query: 'hello' })
  })

  describe('4.invoke のキャンセル', () => {
    const build = (src: ServiceFn) =>
      makeMachine(
        {
          initContext: () => ({ user: null as any }),
        },
        ({ invoke, on }) => ({
          loading: [
            invoke(
              src,
              on(':done:', { to: 'success', actions: ({ update, e }) => update({ user: e.output }) }),
              on(':error:', { to: 'failure' }),
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
      const rt = makeRuntime(
        build((_, _emit, _listen, sig) => {
          signal = sig
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
      const rt = makeRuntime(
        build((_input, _emit, _listen, sig) => {
          signal = sig
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
      const rt = makeRuntime(build(() => d.promise)).start()
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

      const rt = makeRuntime(build(() => d.promise)).start()
      rt.send({ type: 'cancel' })
      d.reject(new Error('late'))
      await flush()
      expect(rt.stateValue).toBe('/idle')
      expect(unhandled).not.toHaveBeenCalled()
      process.off('unhandledRejection', unhandled)
    })
  })

  describe('5.関数のemit', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const ticker = defServiceFn((_, emit: EmitFn<{ type: 'tick' }>) => {
      const id = setInterval(() => emit({ type: 'tick' }), 1000)
      return () => {
        clearInterval(id)
      }
    })

    const clockMachine = makeMachine(
      {
        types: { events: {} as { type: 'pause' } | { type: 'resume' } },
        initContext: () => ({ ticks: 0 }),
        services: { ticker },
      },
      ({ on, invoke }) => ({
        counting: [
          invoke('ticker', on('tick', { actions: ({ update, c }) => update({ ticks: c.ticks + 1 }) })),
          on('pause', { to: 'paused' }),
        ],
        paused: [on('resume', { to: 'counting' })],
      }),
    )

    test('1:paused では child が存在しなくなりタイマーの数も0に', async () => {
      const rt = makeRuntime(clockMachine).start()
      //await Promise.resolve()
      expect(jest.getTimerCount()).toBe(1)

      rt.send('pause')
      //await Promise.resolve()
      expect(rt.getSnapshot()._children.ticker).toBeUndefined()
      expect(jest.getTimerCount()).toBe(0)
    })

    test('2:子の emit が親に届く', async () => {
      const rt = makeRuntime(clockMachine).start()
      //await Promise.resolve()

      jest.advanceTimersByTime(999)
      expect(rt.context.ticks).toBe(0)
      jest.advanceTimersByTime(1)
      expect(rt.context.ticks).toBe(1)
      jest.advanceTimersByTime(2000)
      expect(rt.context.ticks).toBe(3)
    })

    test('3:pauseでタイマーが破棄され、以後時間経過で ticker は増えない', async () => {
      const rt = makeRuntime(clockMachine).start()
      //await Promise.resolve()
      jest.advanceTimersByTime(2000)
      expect(rt.context.ticks).toBe(2)

      rt.send('pause')
      expect(jest.getTimerCount()).toBe(0)
      jest.advanceTimersByTime(5000)
      expect(rt.context.ticks).toBe(2)
    })

    test('4:再開すると新しいticker が起動する', async () => {
      const rt = makeRuntime(clockMachine).start()
      //await Promise.resolve()
      const first = rt.getSnapshot()._children.ticker!
      jest.advanceTimersByTime(1000)
      rt.send('pause')
      rt.send('resume')
      //await Promise.resolve()

      const second = rt.getSnapshot()._children.ticker!
      expect(second).not.toBe(first)

      jest.advanceTimersByTime(500)
      expect(rt.context.ticks).toBe(1)
      jest.advanceTimersByTime(500)
      expect(rt.context.ticks).toBe(2)
    })

    test('5:pause/resumeを繰り返してもタイマーは1つのまま(リーク防止)', async () => {
      const rt = makeRuntime(clockMachine).start()
      for (let i = 0; i < 5; i++) {
        rt.send('pause')
        rt.send('resume')
      }
      expect(jest.getTimerCount()).toBe(1)
    })

    describe('provideで差し替えて親のロジックだけをテスト', () => {
      test('0:任意のタイミングでtickを送る', async () => {
        let fire!: () => void
        const mockTicker = defServiceFn((_, emit: EmitFn<{ type: 'tick' }>) => {
          fire = () => emit({ type: 'tick' })
        })

        const rt = makeRuntime(
          clockMachine.provide({
            services: {
              ticker: mockTicker,
            },
          }),
        ).start()
        fire()
        fire()
        expect(rt.context.ticks).toBe(2)
        expect(jest.getTimerCount()).toBe(0)
      })
      test('0:cleanup が呼ばれている確認', async () => {
        const cleanup = jest.fn()
        const mockTicker = defServiceFn((_, emit: EmitFn<{ type: 'tick' }>) => cleanup)

        const rt = makeRuntime(clockMachine.provide({ services: { ticker: mockTicker } })).start()
        expect(cleanup).not.toHaveBeenCalled()
        rt.send('pause')
        expect(cleanup).toHaveBeenCalledTimes(1)
      })
    })
  })

  test('6:複数 invoke', async () => {
    const a = deferred<string>()
    const b = deferred<string>()

    const machine = makeMachine(
      {
        initContext: () => ({ value: '' }),
      },
      ({ invoke, on, parallel }) => ({
        root: [
          parallel({
            a: [
              {
                pending: [invoke(() => a.promise, on(':done:', { to: 'done' }))],
                done: null,
              },
            ],
            b: [
              {
                pending: [invoke(() => b.promise, on(':done:', { to: 'done' }))],
                done: null,
              },
            ],
          }),
        ],
      }),
    )
    const rt = makeRuntime(machine).start()
    b.resolve('b')
    await flush()
    expect(rt.states).toEqual(['/root/a/pending', '/root/b/done'])
    a.resolve('a')
    await flush()
    expect(rt.states).toEqual(['/root/a/done', '/root/b/done'])
  })

  describe('マシンを対象に invoke', () => {
    const makeChild = () =>
      makeMachine(
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

    const makeParent = (key: string, child = makeChild()) =>
      makeMachine(
        {
          initContext: () => ({ total: -1 }),
          services: { [key]: child },
        },
        ({ invoke, on }) => ({
          running: [
            invoke(
              key,
              on(':done:', { to: 'finished', actions: ({ update, e }) => update({ total: e.output.total }) }),
            ),
            on('abort', { to: 'aborted' }),
          ],
          finished: null,
          aborted: null,
        }),
      )

    test('0:state に入ると子マシンが起動し、_children から key で参照できる', async () => {
      const rt = makeRuntime(makeParent('KEY')).start()
      const child = rt.getSnapshot()._children.KEY!
      expect(rt.stateValue).toBe('/running')

      child.send({ type: 'inc' })
      child.send({ type: 'inc' })
      expect(rt.stateValue).toBe('/running')

      child.send({ type: 'finish' })
      expect(rt.stateValue).toBe('/finished')
      expect(rt.context.total).toBe(2)
    })

    test('0:input が子マシンに渡される', async () => {
      const child = makeMachine(
        {
          initContext: (input: { seed: number }) => ({ seed: input.seed }),
        },
        () => ({ a: [] }),
      )
      const parent = makeMachine(
        {
          initContext: () => ({ seed: 42 }),
          services: { c: child },
        },
        ({ invoke }) => ({
          A: [invoke('c', { input: ({ c }) => ({ seed: c.seed }) })],
        }),
      )
      const rt = makeRuntime(parent).start()
      expect((rt.getSnapshot()._children.c as any).context.seed).toBe(42)
    })

    test('0:親が state を抜けると子マシンが stop される', async () => {
      const rt = makeRuntime(makeParent('KEY')).start()
      const child = rt.getSnapshot()._children.KEY!
      rt.send({ type: 'abort' })

      expect(child.runtimeStatus).toBe('stopped')
      expect(rt.getSnapshot()._children).toEqual({})
    })

    test('0:停止した子に送ったイベントは親に影響しない', async () => {
      const rt = makeRuntime(makeParent('KEY')).start()
      const child = rt.getSnapshot()._children.KEY!
      rt.send({ type: 'abort' })

      child.send({ type: 'finish' })
      expect(rt.stateValue).toBe('/aborted')
    })

    test('0:親を stop すると子も stop される', async () => {
      const rt = makeRuntime(makeParent('KEY')).start()
      const child = rt.getSnapshot()._children.KEY!
      rt.stop()
      expect(child.runtimeStatus).toBe('stopped')
    })

    test('0:親の entryHooks が完了してから子の entryHooks が走る', async () => {
      const order: string[] = []
      const child = makeMachine({}, ({ entryHook }) => ({ a: [entryHook(() => order.push('child entry'))] }))
      const parent = makeMachine({}, ({ invoke, entryHook }) => ({
        A: [entryHook(() => order.push('parent entry')), invoke(child)],
      }))
      makeRuntime(parent).start()
      expect(order).toEqual(['parent entry', 'child entry'])
    })
  })

  describe('複数invoke', () => {
    test('0:マシンと関数を同時に done', async () => {
      const child = makeMachine(
        {
          output: () => 'machine-result',
        },
        ({ on }) => ({
          a: [on(':always:', { to: 'done' })],
          done: null,
        }),
      )
      const fn = async () => 'promise-result'

      const parent = makeMachine(
        {
          types: { context: {} as { m?: string; p?: string } },
          name: 'parent',
          services: { child, fn },
          initContext: () => ({}),
        },
        ({ on, invoke }) => ({
          running: [
            invoke('child', on(':done:', { actions: [({ update, e }) => update({ m: e.output })] })),
            invoke(
              'fn',
              on(':done:', {
                actions: ({ update, e }) => {
                  update({ p: e.output })
                },
              }),
            ),
            on(':always:', [{ guard: ({ c }) => !!c.m && !!c.p, to: 'finished' }]),
          ],
          finished: null,
        }),
      )

      const rt = makeRuntime(parent).start()
      rt.context
      await waitFor(rt, (snapshot) => {
        return snapshot.runtimeStatus === 'done'
      })
      expect(rt.context).toEqual({ m: 'machine-result', p: 'promise-result' })
    })

    test('0:失敗したinvoke', async () => {
      const failing = async () => {
        throw new Error('boom')
      }
      const parent = makeMachine(
        {
          services: { failing },
          initContext: () => ({ err: '' }),
        },
        ({ invoke, on }) => ({
          running: [
            invoke(
              'failing',
              on(':done:', { to: 'ok' }),
              on(':error:', { to: 'failed', actions: ({ update, e }) => update({ err: (e.error as Error).message }) }),
            ),
          ],
          ok: null,
          failed: null,
        }),
      )

      const rt = makeRuntime(parent).start()
      await waitFor(rt, ({ runtimeStatus }) => runtimeStatus === 'done')
      expect(rt.context.err).toBe('boom')
    })

    test('0:inputの受け渡し', async () => {
      const child = makeMachine(
        {
          types: {
            input: {} as { n: number },
            context: {} as { n: number },
            output: {} as number,
          },
          initContext: ({ n }) => ({ n }),
          output: ({ c }) => c.n * 2,
        },
        ({ on }) => ({
          x: [on(':always:', { to: 'done' })],
          done: null,
        }),
      )

      const parent = makeMachine(
        {
          types: { context: {} as { base: number; result?: number } },
          services: { child },
          initContext: () => ({ base: 21 }),
        },
        ({ invoke, on }) => ({
          running: [
            invoke(
              'child',
              { input: ({ c }) => ({ n: c.base }) },
              on(':done:', {
                to: 'done',
                actions: ({ update, e, enqueue }) => {
                  update({ result: e.output })
                },
              }),
            ),
          ],
          done: null,
        }),
      )

      const rt = makeRuntime(parent).start()
      await waitFor(rt, ({ runtimeStatus }) => runtimeStatus === 'done')
      expect(rt.context.result).toBe(42)
    })

    test('0:sendTo で 子マシンに送る', async () => {
      const received = jest.fn()
      const child = makeMachine(
        {
          types: {
            events: {} as { type: 'ping'; v: number } | { type: 'emit'; v: number },
            emittable: {} as { type: 'emitted', emittedV: number },
            context: {} as { v?: number },
            output: {} as number,
          },
          initContext: () => ({}),
          output: ({ c }) => c.v!,
        },
        ({ on }) => ({
          waiting: [
            on('ping', { to: 'done', actions: [({ e }) => received(e), ({ update, e }) => update({ v: e.v })] }),
            on('emit', { actions: [({ emit, e }) => emit({ type: 'emitted', emittedV: e.v })] }),
          ],
          done: null,
        }),
      )

      const parent = makeMachine(
        {
          services: { child },
          types: { context: {} as { pong?: number, emittedV?: number }, events: {} as { type: 'go' } },
          initContext: () => ({}),
        },
        ({ invoke, on }) => ({
          waiting: [
            invoke('child', on(':done:', { to: 'done', actions: [({ update, e }) => update({ pong: e.output })] })),
            invoke('child', { subKey: 2 }, on('emitted', { actions: [({ update, e }) => update({ emittedV: e.emittedV })] })),
            on('go', {
              actions: ({ sendTo }) => {
                sendTo('child', 2, { type: 'emit', v: 9 })
                sendTo('child', { type: 'ping', v: 7 })
              }
            }),
          ],
          done: null,
        }),
      )

      const rt = makeRuntime(parent).start()
      rt.send('go')
      await waitFor(rt, (ss) => {
        return ss.runtimeStatus === 'done'
      })
      expect(received).toHaveBeenCalledWith({ type: 'ping', v: 7 })
      expect(rt.context.pong).toBe(7)
      expect(rt.context.emittedV).toBe(9)
    })

    test('0:子から親へのemit', async () => {
      const child = makeMachine(
        {
          types: { emittable: {} as { type: 'childEvent'; value: string } },
        },
        ({ entryHook }) => ({
          first: [entryHook(({ emit }) => emit({ type: 'childEvent', value: 'hello' }))],
        }),
      )

      const parent = makeMachine(
        {
          services: { child },
          types: { context: {} as { got?: string } },
          initContext: () => ({}),
        },
        ({ invoke, on }) => ({
          idle: [
            invoke(
              'child',
              on('childEvent', {
                to: 'received',
                actions: ({ update, e }) => {
                  update({ got: e.value })
                },
              }),
            ),
          ],
          received: [],
        }),
      )

      const rt = makeRuntime(parent).start()
      await waitFor(rt, (ss) => ss.stateValue === '/received')
      expect(rt.context.got).toBe('hello')
    })

    test('0:parallel での同時 invoke イベント', async () => {
      const a = async () => 'A'
      const b = async () => {
        throw new Error('B-failed')
      }

      const parent = makeMachine(
        {
          services: { a, b },
          initContext: () => ({}) as { a?: string; b?: string },
        },
        ({ parallel, invoke, on }) => ({
          a: [
            parallel({
              r1: [
                {
                  run: [invoke('a', on(':done:', { to: 'done', actions: ({ update, e }) => update({ a: e.output }) }))],
                  done: null,
                },
              ],
              r2: [
                {
                  run: [
                    invoke(
                      'b',
                      on(':error:', {
                        to: 'failed',
                        actions: ({ update, e }) => update({ b: (e.error as Error).message }),
                      }),
                    ),
                  ],
                  failed: null,
                },
              ],
            }),
          ],
        }),
      )

      const rt = makeRuntime(parent).start()
      await waitFor(rt, (ss) => ss.runtimeStatus === 'done')
      expect(rt.states).toEqual(['/a/r1/done', '/a/r2/failed'])
      expect(rt.context).toEqual({ a: 'A', b: 'B-failed' })
    })

  })
})
