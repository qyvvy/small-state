import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { makeMachine } from '../../../machine/machine'
import type { Runtime } from '../../Runtime'
import { makeRuntime } from '../../Runtime'

describe('rt_main/parallel', () => {
  describe('parallel', () => {
    const log =
      (name: string) =>
        ({ update, c }: any) =>
          update({ trace: [...c.trace, name] })

    const machine = makeMachine(
      {
        types: {
          context: {} as { trace: string[]; result?: unknown },
          events: {} as { type: 'start' | 'ping' | 'go_all' | 'go_c1' | 'go_c2' | 'reset' },
        },
        initContext: () => ({ trace: [] }),
      },
      ({ on, entryHook, exitHook, parallel }) => ({
        idle: [entryHook(log('idle:entry')), exitHook(log('idle:exit')), on('start', { to: 'working' })],
        working: [
          entryHook(log('working:entry')),
          exitHook(log('working:exit')),
          on(':childDone:', {
            to: 'finished',
            actions: [log('working:childDone'), ({ update, e }) => update({ result: e.output })],
          }),
          parallel({
            regionA: [
              [entryHook(log('regionA:entry')), exitHook(log('regionA:exit'))],
              {
                a1: [
                  entryHook(log('a1:entry')),
                  exitHook(log('a1:exit')),
                  on('ping', { actions: log('a1:ping') }),
                  on('go_all', { to: 'a2' }),
                ],
                a2: [entryHook(log('a2:entry')), exitHook(log('a2:exit')), { final: true }],
              },
            ],
            regionB: [
              [entryHook(log('regionB:entry')), exitHook(log('regionB:exit'))],
              {
                b1: [
                  entryHook(log('b1:entry')),
                  exitHook(log('b1:exit')),
                  on('ping', { actions: log('b1:ping') }),
                  on('go_all', { to: 'b2' }),
                ],
                b2: [entryHook(log('b2:entry')), exitHook(log('b2:exit')), { final: () => 'B' }],
              },
            ],
            regionC: [
              [entryHook(log('regionC:entry')), exitHook(log('regionC:exit'))],
              {
                c: [
                  parallel({
                    c1: [
                      [entryHook(log('c1:entry')), exitHook(log('c1:exit'))],
                      {
                        c1_1: [
                          entryHook(log('c1_1:entry')),
                          exitHook(log('c1_1:exit')),
                          on('ping', { actions: log('c1_1:ping') }),
                          on('go_c1', { to: 'c1_2' }),
                        ],
                        c1_2: [entryHook(log('c1_2:entry')), exitHook(log('c1_2:exit')), { final: true }],
                      },
                    ],
                    c2: [
                      [entryHook(log('c2:entry')), exitHook(log('c2:exit'))],
                      {
                        c2_1: [
                          entryHook(log('c2_1:entry')),
                          exitHook(log('c2_1:exit')),
                          on('ping', { actions: log('c2_1:ping') }),
                          on('go_c2', { to: 'c2_2' }),
                        ],
                        c2_2: [entryHook(log('c2_2:entry')), exitHook(log('c2_2:exit')), { final: () => 'C2' }],
                      },
                    ],
                  }),
                ],
              },
            ],
          }),
        ],
        finished: [entryHook(log('finished:entry')), exitHook(log('finished:exit')), on('reset', { to: 'idle' })],
      }),
    )

    /** 直前の確認以降に増えた trace だけを取り出す */
    const makeTracer = (runtime: Runtime<any>) => {
      let mark = 0
      return () => {
        const all = runtime.context.trace
        const diff = all.slice(mark)
        mark = all.length
        return diff
      }
    }

    /** 順序を問わず要素が一致すること（並列リージョン間の順序に依存させないため） */
    const sameMembers = (actual: string[], expected: string[]) =>
      expect([...actual].sort()).toEqual([...expected].sort())

    test('0:開始すると idle に入る', async () => {
      const rt = makeRuntime(machine).start()
      const take = makeTracer(rt)
      expect(take()).toEqual(['idle:entry'])
    })

    test('0:send "start" で全リージョンのentryが実行される', async () => {
      const rt = makeRuntime(machine).start()
      const take = makeTracer(rt)
      take() // 初期分を捨てる

      rt.send('start')

      expect(rt.states).toEqual([
        '/working/regionA/a1',
        '/working/regionB/b1',
        '/working/regionC/c/c1/c1_1',
        '/working/regionC/c/c2/c2_1',
      ])
      expect(rt.stateValue).toEqual([
        '/working/regionA/a1',
        '/working/regionB/b1',
        '/working/regionC/c/c1/c1_1',
        '/working/regionC/c/c2/c2_1',
      ])
      const t = take()
      expect(t[0]).toEqual('idle:exit')
      expect(t.slice(1)).toEqual([
        'working:entry',
        'regionA:entry',
        'a1:entry',
        'regionB:entry',
        'b1:entry',
        'regionC:entry',
        'c1:entry',
        'c1_1:entry',
        'c2:entry',
        'c2_1:entry',
      ])
    })

    test('0:複数リージョンで同じイベントが同時に実行', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      const take = makeTracer(rt)
      take()

      rt.send('ping')
      expect(take()).toEqual(['a1:ping', 'b1:ping', 'c1_1:ping', 'c2_1:ping'])
    })

    test('0:同時に遷移。childDone はまだ動かない。', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      const take = makeTracer(rt)
      take()
      expect(rt.states).toEqual([
        '/working/regionA/a1',
        '/working/regionB/b1',
        '/working/regionC/c/c1/c1_1',
        '/working/regionC/c/c2/c2_1',
      ])

      rt.send('go_all')
      expect(take()).toEqual(['a1:exit', 'b1:exit', 'a2:entry', 'b2:entry'])
      expect(rt.states).toEqual([
        '/working/regionA/a2',
        '/working/regionB/b2',
        '/working/regionC/c/c1/c1_1',
        '/working/regionC/c/c2/c2_1',
      ])
      expect(rt.context.trace).not.toContain('working:childDone')
    })

    test('0:入れ子のparallel の片方だけ完了では childDoneにならない', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      const take = makeTracer(rt)
      take()

      rt.send('go_c1')
      expect(take()).toEqual(['c1_1:exit', 'c1_2:entry'])
      expect(rt.states).toEqual([
        '/working/regionA/a2',
        '/working/regionB/b2',
        '/working/regionC/c/c1/c1_2',
        '/working/regionC/c/c2/c2_1',
      ])
      expect(rt.context.trace).not.toContain('working:childDone')
    })

    test('0:全リージョンの終了で childDone が動き /finishedに遷移', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      rt.send('go_c1')
      const take = makeTracer(rt)
      take()

      rt.send('go_c2')
      const t = take()
      expect(rt.states).toEqual(['/finished'])
      expect(t).toEqual([
        'c2_1:exit',
        'c2_2:entry',
        'working:childDone', // TBC: childDone のタイミングはこれでいいのか？
        'a2:exit',
        'regionA:exit',
        'b2:exit',
        'regionB:exit',
        'c1_2:exit',
        'c1:exit',
        'c2_2:exit',
        'c2:exit',
        'regionC:exit',
        'working:exit',
        'finished:entry',
      ])
      expect(rt.context.trace).toEqual([
        'idle:entry',
        'idle:exit',
        'working:entry',
        'regionA:entry',
        'a1:entry',
        'regionB:entry',
        'b1:entry',
        'regionC:entry',
        'c1:entry',
        'c1_1:entry',
        'c2:entry',
        'c2_1:entry',
        'a1:exit',
        'b1:exit',
        'a2:entry',
        'b2:entry',
        'c1_1:exit',
        'c1_2:entry',
        'c2_1:exit',
        'c2_2:entry',
        'working:childDone',
        'a2:exit',
        'regionA:exit',
        'b2:exit',
        'regionB:exit',
        'c1_2:exit',
        'c1:exit',
        'c2_2:exit',
        'c2:exit',
        'regionC:exit',
        'working:exit',
        'finished:entry',
      ])
    })

    test('0: childDone の output の内容確認', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      rt.send('go_c1')
      rt.send('go_c2')

      expect(rt.context.result).toEqual({
        regionB: 'B',
        regionC: {
          c2: 'C2',
        },
      })
    })

    test('0:イベントの順序が違っても動く', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      rt.send('go_c2')
      rt.send('go_c1')

      expect(rt.states.every((e) => e.startsWith('/working'))).toBe(true)

      rt.send('go_all')

      expect(rt.states).toEqual(['/finished'])
      expect(rt.context.result).toEqual({
        regionB: 'B',
        regionC: {
          c2: 'C2',
        },
      })
    })

    test('0:', async () => {
      const rt = makeRuntime(machine).start()
      rt.send('start')
      rt.send('go_all')
      rt.send('go_c1')
      rt.send('go_c2')
      const take = makeTracer(rt)
      take()

      rt.send('reset')

      expect(take()).toEqual(['finished:exit', 'idle:entry'])
    })
  })
})
