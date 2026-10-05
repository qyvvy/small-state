import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { createMachine } from '../../../machine/createMachine'
import { createRuntime } from '../../Runtime'

describe('rt_main/provide', () => {
  let mockFn1: jest.Mock
  beforeAll(async () => {
    mockFn1 = jest.fn()
  })

  describe('.provide', () => {
    let mockFn1: jest.Mock
    beforeAll(async () => {
      mockFn1 = jest.fn()
    })

    const lockMachine = createMachine({
      name: 'lock',
      types: {
        context: {} as { entered: string; attempts: number },
        events: {} as { type: 'input', code: string } | { type: 'submit' }
      },
      initContext: () => ({ entered: '', attempts: 0 }),
      guards: {
        isCorrect: ({ c }) => c.entered === '1234',
        isLockedOut: ({ c }) => c.attempts >= 3,
      },
      actions: {
        saveCode: ({ update, e }) => update({ entered: e.type === 'input' ? e.code : '' }),
        countUp: ({ update, c }) => update({ attempts: c.attempts + 1 }),
        resetAttempts: ({ update }) => update({ attempts: 0 }),
        alarm: () => { }, // モック対象
      }
    }, ({ on }) => ({
      idle: [
        on(':always:', { to: 'lockedOut', guard: 'isLockedOut', actions: 'alarm' }),
        on('input', { actions: 'saveCode' }),
        on('submit', [
          { to: 'unlocked', guard: 'isCorrect', actions: 'resetAttempts' },
          { actions: 'countUp' },
        ])
      ],
      unlocked: null,
      lockedOut: null, // TODO: delay ができたら 30000ミリ秒後に 初期状態に戻す. xstate では delay も .provide の差し替え対象らしい
    }))

    test('0:action をスパイに差し替えて呼び出す', async () => {
      const alarm = jest.fn()
      const testMachine = lockMachine.provide({
        actions: { alarm }
      })
      const rt = createRuntime(testMachine).start()

      // 間違った番号を 3 回送信
      for (let i = 0; i < 3; i++) {
        rt.send({ type: 'input', code: '0000' })
        rt.send({ type: 'submit' })
      }

      expect(rt.stateValue).toBe('/lockedOut')
      expect(rt.context.attempts).toBe(3)
      expect(alarm).toHaveBeenCalledTimes(1)
    })

    test('0:guard を差し替えて入力なしで unlocked にさせる', async () => {
      const testMachine = lockMachine.provide({
        guards: {
          isCorrect: () => true
        }
      })
      const rt = createRuntime(testMachine).start()
      rt.send('submit')

      expect(rt.stateValue).toBe('/unlocked')
    })

    test('0:.provide は元のマシンを変更しない', async () => {
      lockMachine.provide({ guards: { isCorrect: () => true } })

      const rt = createRuntime(lockMachine).start()
      rt.send({ type: 'submit' })
      expect(rt.stateValue).toBe('/idle')
      expect(rt.context.attempts).toBe(1)
    })

  })

})
