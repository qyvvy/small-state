import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, jest, test } from 'bun:test'
import { calcCommonPathPrefix } from "../utils";

describe('shared/utils', () => {
  beforeAll(async () => {
  })

  describe('calcCommonPathPrefix', () => {
    test('1: 与えられたパスから先頭一致部分を返す', async () => {
      expect(calcCommonPathPrefix(['/aa/bb/xxx', '/aa/bb/xxy/yy', '/aa/bb/xxy/zz'])).toBe('/aa/bb')
      expect(calcCommonPathPrefix(['/a/b/xxx', '/a/b/xxy/yy', '/a/b/xxy/zz'])).toBe('/a/b')
    })
    test('2: 長さが1ならそのまま返す', async () => {
      expect(calcCommonPathPrefix(['/aa/bb/xxx'])).toBe('/aa/bb/xxx')
    })
    test('3.1: 1段目のステートが不一致(超過)', async () => {
      expect(calcCommonPathPrefix(['/aa/bb', '/aa/cc', '/aaa/a'])).toBe('')
    })
    test('3.2: 2段目のステートが不一致(不足)', async () => {
      expect(calcCommonPathPrefix(['/aa/bb/ccc', '/aa/b/cc'])).toBe('/aa')
    })
    test('4: デリミタの手前までを判定（末尾のステートは対象外）', async () => {
      expect(calcCommonPathPrefix(['/aa/bb', '/aa/bb'])).toBe('/aa')
    })
  })

})
