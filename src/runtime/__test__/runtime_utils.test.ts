import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { traverseStateTreeMatch } from '../runtime_utils'


describe('runtime_utils', () => {
  beforeAll(async () => { })

  describe('traverseStateTreeMatch()', () => {
    // 第一引数に指定した道順に沿って、第二引数を辿る関数
    describe('01:', () => {
      test('1: 第一引数が空なら index は -1', async () => {
        expect(traverseStateTreeMatch(
          [],
          { x: {} },
        )).toEqual(
          {
            endIdx: -1,
            remaining: { x: {} },
            isExhausted: true,
          }
        )
      })

      test('2.1: 初手でマッチしなければ isExhausted: false, endIdx: 0', async () => {
        expect(traverseStateTreeMatch(
          ['a', 'ab'],
          { x: {} },
        )).toEqual(
          {
            endIdx: 0,
            remaining: { x: {} },
            isExhausted: false
          }
        )
      })

      test('2.2: 途中でマッチしなければ isExhausted: false, endIdx にはマッチしなかった箇所が入る', async () => {
        expect(traverseStateTreeMatch(
          ['a', 'ab'],
          { a: { x: {} } },
        )).toEqual(
          {
            endIdx: 1,
            remaining: { x: {} },
            isExhausted: false
          }
        )
      })

      test('3: ちょうど第一引数を消費しつくしたときに終わると endIdx は 第一引数の長さに、 remaining は空になる', async () => {
        expect(traverseStateTreeMatch(
          ['a', 'ab'],
          { a: { aa: {}, ab: {} } },
        )).toEqual(
          {
            endIdx: 2,
            remaining: {},
            isExhausted: true,
          }
        )
      })

      test('4: 第一引数を消費しつくしても 第二引数 が残る場合、 remaining にそれが入る', async () => {
        expect(traverseStateTreeMatch(
          ['a', 'ab'],
          { a: { aa: {}, ab: { aba: { abaa: {} }, abb: {} } } },
        )).toEqual(
          {
            endIdx: 2,
            remaining: { aba: { abaa: {} }, abb: {} },
            isExhausted: true,
          }
        )
      })

    })

  })

})
