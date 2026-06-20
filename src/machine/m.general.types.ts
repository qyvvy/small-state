export type Expand<T> = { [K in keyof T]: T[K] } & {}
export type One<T> = T | [T]
export type OneOrMany<T> = T | T[]
export type AnyFn<R = unknown> = R extends any ? (...arg: any[]) => R : never
export type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false
export type Fallback<T, U> = T extends never ? U : T
export type LowInfer<T> = T & NonNullable<unknown>;
export type Placeholder = {} | null | undefined // 何でも入り後から捕捉できる型
export type Values<T> = T[keyof T]
export type Duplicate<T> = T extends infer Tx ? Tx : never
export type IsAny<T> = 0 extends (1 & T) ? true : false;



//type Exact<A, B> = A extends B ? (B extends A ? A : never) : never
type Ary2Dict<T extends readonly Record<PropertyKey, any>[], K extends PropertyKey> = Readonly<{
  [P in T[number]as P[K]]: P
}>
type Default<T, D> = [T] extends [undefined] ? D : T
type Prettify<T> = { [K in keyof T]: T[K] } & {}



type NonEmpty<T extends string> = T extends '' ? `Error: Non-empty string required.` : T
