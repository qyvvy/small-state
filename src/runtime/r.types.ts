export type StateRoute = Array<
  // biome-ignore lint/complexity/noBannedTypes: WeakRef の対象にするためにリテラル文字列ではなく文字列オブジェクトを使う
  | String
  | { parallel: string; regions: { [key: string]: StateRoute }; output?: unknown }
>
