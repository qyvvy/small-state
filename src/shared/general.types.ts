export type Expand<T> = { [K in keyof T]: T[K] } & {}
export type LowInfer<T> = T & NonNullable<unknown> // 推論優先度を下げる
export type Values<T> = T[keyof T]
export type Merge<A, B> = Omit<A, keyof B> & B

export type IsAny<T> = 0 extends (1 & T) ? true : false;
export type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false

export type IsEqual<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
  ? (
    (<T>() => T extends Y ? 1 : 2) extends (<T>() => T extends X ? 1 : 2)
    ? true
    : false
  )
  : false

export type EmptyRecord = Record<PropertyKey, never>
export type RecursiveRecord<T = never> = { [key: string]: RecursiveRecord<T> | T }
export type AnyFn<R = unknown> = (...arg: any[]) => R
export type OneOrMany<T> = T | T[]
export type Placeholder = {} | null | undefined // 何でも入り後から捕捉できる型
