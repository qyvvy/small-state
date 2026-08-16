interface ArrayConstructor {
  // Array.isArray() では readonly の配列を型絞り込みできない問題の解決
  isArray<T>(
    value: T,
    ..._: unknown extends T
      ? never
      : T extends readonly unknown[]
      ? []
      : never
  ): value is Extract<T, readonly unknown[]>;
}
