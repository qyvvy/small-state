
export type RemovePrivateKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K]
}
