export type Expand<T> = { [K in keyof T]: T[K] } & {}
export type One<T> = T | [T]
export type OneOrMany<T> = T | T[]
export type AnyFn<R = unknown> = (...arg: any[]) => R
export type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false
export type Fallback<T, U> = T extends never ? U : T
export type LowInfer<T> = T & NonNullable<unknown>;
export type Placeholder = {} | null | undefined // 何でも入り後から捕捉できる型
export type Values<T> = T[keyof T]
export type Duplicate<T> = T extends infer Tx ? Tx : never
export type IsAny<T> = 0 extends (1 & T) ? true : false;
export type NestedArray<T> = (T | NestedArray<T>)[]
export type RecursiveRecord<T = never> = { [key: string]: RecursiveRecord<T> | T }
export type Mutable<T> = { -readonly [K in keyof T]: T[K] }
export type KeysWithoutUnknown<T extends object> = {
  [K in keyof T]: unknown extends T[K] ? never : K
}[keyof T]
export type Merge<A, B> = Omit<A, keyof B> & B

type Ary2Dict<T extends readonly Record<PropertyKey, any>[], K extends PropertyKey> = Readonly<{
  [P in T[number]as P[K]]: P
}>
type Default<T, D> = [T] extends [undefined] ? D : T
type Prettify<T> = { [K in keyof T]: T[K] } & {}



type NonEmpty<T extends string> = T extends '' ? `Error: Non-empty string required.` : T
