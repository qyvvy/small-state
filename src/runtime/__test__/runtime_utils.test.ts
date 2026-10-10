import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { traverseStateRouteMatch } from '../runtime_utils'


describe('runtime_utils', () => {
  beforeAll(async () => { })

  describe('traverseStateRouteMatch', () => {
    // 第二引数に指定した通りに StateRoute を辿る
    describe('非parallel', () => {
      test('0:第二引数が空のとき', async () => {
        const route = ['a', 'aa', 'aaa']
        expect(traverseStateRouteMatch(route, [])).toEqual({
          isExhausted: true,
          endIdx: 0,
          remaining: [route, 0],
        })
      })

      test('0:完全一致', async () => {
        const route = ['a', 'aa', 'aaa']
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aaa'])).toEqual({
          isExhausted: true,
          endIdx: 3,
          remaining: [route, 3],
        })
      })
      test('0:routeに余りあり', async () => {
        const route = ['a', 'aa', 'aaa']
        expect(traverseStateRouteMatch(route, ['a', 'aa'])).toEqual({
          isExhausted: true,
          endIdx: 2,
          remaining: [route, 2],
        })
      })

      test('0:第二引数が超過', async () => {
        const route = ['a', 'aa']
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aaa', 'aaaa'])).toEqual({
          isExhausted: false,
          endIdx: 2, // idx 2 以降が不一致
          remaining: [route, 2], // idx 2 以降が
        })
      })

      test('0:不一致', async () => {
        const route = ['a', 'aa']
        expect(traverseStateRouteMatch(route, ['a', 'b', 'aaa', 'aaaa'])).toEqual({
          isExhausted: false,
          endIdx: 1,
          remaining: [route, 1],
        })
      })
    })

    describe('parallel', () => {
      test('1:', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a'])).toEqual({
          isExhausted: true,
          endIdx: 1,
          remaining: [route, 1],
        })
      })

      test('2:', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa'])).toEqual({
          isExhausted: true,
          endIdx: 2,
          remaining: [route, 1, true],
        })
      })

      test('2.2:parallel でつまずいたら remaining がない', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'x'])).toEqual({
          isExhausted: false,
          endIdx: 1,
        })
      })

      test('3:', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aa1'])).toEqual({
          isExhausted: true,
          endIdx: 3,
          // @ts-expect-error
          remaining: [route[1]!.regions.aa1, 0],
        })
      })

      test('3.2:parallelでつまずいたら remaining はない', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'x'])).toEqual({
          isExhausted: false,
          endIdx: 2,
        })
      })

      test('4:', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aa1', 'aa1a'])).toEqual({
          isExhausted: true,
          endIdx: 4,
          // @ts-expect-error
          remaining: [route[1]!.regions.aa1, 1],
        })
      })

      test('4.2:', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aa1', 'x'])).toEqual({
          isExhausted: false,
          endIdx: 3,
          // @ts-expect-error
          remaining: [route[1]!.regions.aa1, 0],
        })
      })

      test('4.3:超過', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aa1', 'aa1a', 'aa1ab', 'aa1abb'])).toEqual({
          isExhausted: false,
          endIdx: 5,
          // @ts-expect-error
          remaining: [route[1]!.regions.aa1, 2],
        })
      })

      test('5:', async () => {
        const route = ['a', { parallel: 'aa', regions: { aa1: ['aa1a', 'aa1ab'], aa2: ['aa2a'], aa3: [] } }]
        expect(traverseStateRouteMatch(route, ['a', 'aa', 'aa3'])).toEqual({
          isExhausted: true,
          endIdx: 3,
          // @ts-expect-error
          remaining: [route[1]!.regions.aa3, 0],
        })
      })
    })
  })
})
