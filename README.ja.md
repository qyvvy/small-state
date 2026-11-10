# small-state

A state machine inspired by [XState](https://stately.ai/docs/xstate).

## 特徴・長所

- TypeScript対応
- 少ない記述量
- 迷子になりにくい記述


## Installation

```
npm i small-state
```


## FSM（Finite State Machine / 有限ステートマシン）とは

有限個の状態と、状態間の遷移を定義するモデル。

ある状態のときに、あるイベントが投げられたなら、そのイベントに応じて指定された処理を行い、内部状態を更新し、場合によって別の状態へ遷移する。<br>
状態と条件が複雑なものを扱うとき、プログラミングミスが減り、見通しがよくなり、威力を発揮する。


## 例

まず `makeMachine` でマシンを定義する。

```ts
import { makeMachine } from 'small-state'

const loginMachine = makeMachine(
  {
    name: 'login',
    types: {
      context: {} as { failedAttempts: number },
      events: {} as { type: 'LOGIN_FAILED' } | { type: 'LOGIN_SUCCESS' } | { type: 'UNLOCK' },
    },
    initContext: () => ({ failedAttempts: 0 }),
  },
  ({ on }) => ({
    idle: [
      on('LOGIN_FAILED', [
        {
          to: 'locked',
          guard: ({ context }) => context.failedAttempts >= 1,
          actions: ({ update, context }) => update({ failedAttempts: context.failedAttempts + 1 }),
        },
        {
          actions: ({ update, context }) => update({ failedAttempts: context.failedAttempts + 1 }),
        },
      ]),
      on('LOGIN_SUCCESS', { to: 'loggedIn' }),
    ],
    locked: [
      on('UNLOCK', { to: 'idle', actions: ({ update }) => update({ failedAttempts: 0 }) })
    ],
    loggedIn: null,
  }),
)
```

このマシンは idle, locked, loggedIn という3つの状態を持つ。<br>無指定時、マシンの初期状態は先頭に定義されたものになる。つまりこのマシンの場合は idle になる。

このマシンを動かすには `makeRuntime` にマシンを渡す。

```ts
import { createRuntime, type Runtime } from 'small-state'

const logRuntime = (idx: number, { runtimeStatus, stateValue, context }: Runtime<any>) =>
  console.log(idx, { runtimeStatus, stateValue, context })

const loginRt = createRuntime(loginMachine)
logRuntime(0, loginRt)
/*
  0 {
    runtimeStatus: "notStarted",
    stateValue: undefined,
    context: {
      failedAttempts: 0,
    },
  }
*/
```

作成した runtime は .start() しない限り runtimeStatus が "notStarted" のままで停止している。<br>この状態では stateValue が undefined になる。

```ts
loginRt.start()
showStatus(1, loginRt)
/*
  1 {
    runtimeStatus: "active",
    stateValue: "/idle",
    context: {
      failedAttempts: 0,
    },
  }
*/
```

start すると runtimeStatus: "active" に変わる。stateValue は現在のステートを指す。現在 "idle" 状態なので、これは "/idle" になる。<br>
なお、ステートはフルパスで表現されるので先頭に "/" が付く。

```ts
loginRt.send('LOGIN_FAILED')
showStatus(2, loginRt)
/*
  2 {
    runtimeStatus: "active",
    stateValue: "/idle",
    context: {
      failedAttempts: 1,
    },
  }
*/
```

LOGIN_FAILED イベントを送ると idle に定義された LOGIN_FAILED の定義配列を上から順に guard を評価し、最初にマッチした要素の actions を実行する。

```ts
[
  {
    to: 'locked',
    guard: ({ context }) => context.failedAttempts >= 2,
    actions: ({ update, context }) => update({ failedAttempts: context.failedAttempts + 1 }),
  },
  {
    actions: ({ update, context }) => update({ failedAttempts: context.failedAttempts + 1 }),
  },
]
```

context の failedAttempts は 0 なので最初の要素の guard にマッチせず2番目の要素にマッチする。guard が設定されていない要素には無条件にマッチする。<br>
context が更新され failedAttempts が +1 され 1 になる。

```ts
loginRt.send('LOGIN_FAILED')
showStatus(3, loginRt)
loginRt.send('LOGIN_FAILED')
showStatus(4, loginRt)
/*
  3 {
    runtimeStatus: "active",
    stateValue: "/idle",
    context: {
      failedAttempts: 2,
    },
  }
  4 {
    runtimeStatus: "active",
    stateValue: "/locked",
    context: {
      failedAttempts: 3,
    },
  }
*/
```

さらに2回 LOGIN_FAILED を発生させると failedAttempts が 2 以上になり、 `guard: ({ context }) => context.failedAttempts >= 2` の条件を満たす。`to` は遷移先を表す。`to` が指定されているなら、action が実行された後、その状態に遷移する。この場合 "locked" ステートに遷移するので、 stateValue が "/locked" になる。

```ts
loginRt.send('LOGIN_FAILED')
showStatus(5, loginRt)
/*
  5 {
    runtimeStatus: "active",
    stateValue: "/locked",
    context: {
      failedAttempts: 3,
    },
  }
*/
```

locked には LOGIN_FAILED イベントが定義されていないので send しても何も起こらない。

```ts
loginRt.send('UNLOCK')
showStatus(6, loginRt)
/*
  6 {
    runtimeStatus: "active",
    stateValue: "/idle",
    context: {
      failedAttempts: 0,
    },
  }
*/
```

UNLOCK イベントを起こすと failedAttempts が 0 に更新され "idle" に遷移する。

```ts
loginRt.send('LOGIN_SUCCESS')
showStatus(7, loginRt)
/*
  7 {
    runtimeStatus: "done",
    stateValue: "/loggedIn",
    context: {
      failedAttempts: 0,
    },
  }
*/
```

idle 内で LOGIN_SUCCESS を受け取ると、定義に従い "loggedIn" ステートに遷移する。<br>loggedIn は null なのでここでマシンは停止し runtimeStatus は "done" になる。



## API

### 型

- マシン定義
  - `type AnyMachine = Machine<any, any, any, any, any, any, any, any, any>`
    - 任意のマシン
  - `type MContext = Record<string, any>`
    - context。マシン内部に状態として持つことができる値。ちなみに `_` で始まるプロパティ名はマシン内部用となり外部に公開されない。
  - `type SendableEvent = { type: string;[key: string]: any }`
    - 主に外部から runtime.send や sendTo を通じてステートマシンに送られるイベント。
  - `type EmittableEvent = { type: string;[key: string]: any }`
    - ステートマシン内部から外部に向かって emit を通じて送られるイベント。
  - `type ServiceFn<TInput = any> = (input: TInput, emit: Emit<EmittableEvent>, listen: Listen<SendableEvent>, signal: AbortSignal) => unknown`
    - MachineConfig.services や invoke の引数に渡せるサービス関数の型。
    - emit や listen で送出したり受けたりするイベントは親のイベントではなくこの関数独自に定義した型になる。
    - `input: any` - invoke の input オプションから渡された値
    - `emit: (event: EmittableEvent) => void`
      - 子から親に通信するときに使用する関数。この関数の引数に渡したイベントオブジェクトは親からは `on` 関数を利用して購読できる。
    - `listen: (listener: (event: SendableEvent) => void) => void`
      - 親から `sendTo` で送られたイベントを購読するリスナー関数を登録する。
    - `signal: AbortSignal`
      - この関数がもうすでに停止扱いになったかどうかを内部から検知するためのオブジェクト。`signal.aborted` が `ture` のとき、その関数はステートを抜けたなどの理由で停止扱いになっている。
  - `type Emit<EM extends EmittableEvent> = (event: EM) => void`
    - defServiceFn でラップしたサービス関数の第2引数のemit関数に指定して任意の EmittableEvent を型引数として与えることで型レベルでその関数の EmittableEvent の型を親に認知させることができる。
  - `type ListenFn<E extends SendableEvent> = (listener: (event: E) => void) => void`
    - defServiceFn でラップしたサービス関数の第3引数のlisten関数に指定して任意の SendableEvent を型引数として与えることで親から `sendTo` でそのイベントを受け付けることができる。
- ランタイム
  - `type RuntimeStatus = 'notStarted' | 'active' | 'stopped' | 'done' | 'error'`
    - ランタイムの稼働状態。
    - 'notStarted' - まだ .start() されていない。
    - 'active' - .start() され、稼働している。
    - 'stopped' - .stop() され、停止している。
    - 'done' - 最終状態に入り完了し、正常停止した。
    - 'error' - エラーで停止した。
  - `type Runtime<M extends AnyMachine>`
  - `type Snapshot<M extends AnyMachine>` - Runtime の getSnapshot の項参照。

### 補助関数

- `isMachine(v: unknown): v is AnyMachine` - 引数がマシンかどうかを判定。
- `isRuntime(v: unknown): v is Runtime<AnyMachine>` - 引数がランタイムかどうかを判定。
- `defServiceFn(serviceFn: ServiceFn): ServiceFn`
  - サービス関数を定義する。
  - マシン外部でサービス関数を定義するときか、invoke に直接関数を渡すときに裸の関数だと型推論が崩れてしまうが、この関数でラップすることで型を通すことができる。
- `waitFor<R extends Runtime<any>>(runtime, cond, options?): Promise<SnapshotFrom<R>>` - 渡した runtime が条件を満たすまで待機する。


### メイン関数

- `makeMachine(config, states): Machine` - マシンを作る。
- `makeRuntime(machine, option?): Runtime` - マシンを実際に動かすランタイムを作る。


### 予約されているイベントタイプ

`':fooBar:'` のように先頭と末尾が `:` で挟まれたイベントタイプはシステムが使う可能性がある。
イベントタイプに限らず任意につけられる名前について、 `:` に挟まれた名前は将来システムが使う可能性がある。
以下のイベントタイプ名が予約されている:

- 通常ステート内
  - `':always:'` - ステートに遷移し初期処理が終了した後や、コンテキストが更新された後など、スナップショットが更新されるような処理が発生した際に発火する
  - `':childDone:'` - 配下のサブステートやパラレルステートが全て終了したときに発火する
- invoke 内
  - `{type: ':done:', output: unknown}` - そのサービスが正常終了したときに発火する
  - `{type: ':error:', error: unknown}` - そのサービスが異常狩猟したときに発火する


### `makeMachine(config: MachineConfig, defineStates: (tools)=>Record<string, StateDefinition>): Machine`

#### makeMachine > `MachineConfig`

マシンの基本的な設定をする辞書オブジェクト。以下のプロパティを持つ。

- `types?: { context?: C; events?: E; emittable?: EM; input?: I; output?: O }`
  - マシンで使う各要素の型を `{} as ...` の形式で指定する。
    - `context: Record<string, any>` - マシン内外で参照し更新できる任意の値。これらのうち、`_` で始まるプロパティはマシン内部用となり、外部に公開されなくなる。
    - `events: SendableEvent` - 外部からマシンに向かって発行され得るイベント。
    - `emittable: EmittableEvent` - マシンから外部に向かって発行されうるイベント。
    - `input: any` - マシン起動時外部から受け取る値の型。
    - `output: any` - マシン終了時外部に出力する値の型。
  - 型引数でなく `{} as ...` で型を指定する奇妙な方式の理由は、型を一部だけ与えつつ型推論を有効にするためである。

- `name?: string`
  - マシン名。ログに使われたり、ランタイム id の一部に使われることがある。
- `initialState?: string`
  - マシン開始時の初期ステートをステート名で指定する。
- `initContext?: (input: I) => C`
  - マシン開始時の初期コンテキストを返す関数を指定する。コンテキストを使う場合はほぼ必須である。
- `output?: (args: CommonArgs) => O`
  - マシンが final の状態になったら実行され、これがマシンの最終出力となる。この値は ランタイムの snapshot.output から参照できる。
  - マシンが子マシンとして invoke されているときには親マシンのイベント `{type: ':done:', output: O}` の output の値として設定される。
  - この関数に渡されるイベントも `{type: ':done:', output: unknown}` である。output には final オプションが出力した値があればそれが設定され、そうでなければ undefined が設定される。
- `guards?: Record<string, (args: CommonArgs, params: unknown)=>boolean>`
  - 遷移時に各アクションを実行するかどうかの判定に使われる関数を登録する。ここに登録した guard は名前でアクセスできるようになる。
  - 第二引数 params に型を指定すると呼び出された時に任意の値を追加で受け取ることができる。params を設定した guard を呼ぶときには文字列の代わりにキーにガード名、値に params の値か、paramsの値を返す関数を指定したオブジェクト`{[guardName:string]: ParamsValueOrFn}`を代わりに使う。
- `actions?: Record<string, (arg: {context, c, event, e, input, update, emit}, params: unknown)=>unknown>`
  - 遷移時に実行するアクション関数を登録する。ここに登録した action は名前でアクセスできるようになる。
  - 第二引数 params に型を指定すると呼び出された時に任意の値を追加で受け取ることができる。params を設定した action を呼ぶときには文字列の代わりにキーにアクション名、値に params の値か、paramsの値を返す関数を指定したオブジェクト`{[actionName:string]: ParamsValueOrFn}`を代わりに使う。
- `services?: Record<string, AnyMachine | ServiceFn>`
  - キーにサービス名、値にマシンか関数を指定する。サービスは invoke で起動させることができる。
  - 非同期関数を指定することもできる。現状、small-state が非同期関数を扱う方法はサービスとして実行する以外に手段がない。
  - サービス関数には4つの引数が渡され、戻り値が output として扱われる。`ServiceFn` の項を参照。
  - マシン定義の外でサービス関数を定義する場合は `defServiceFn` を使うこと。

#### makeMachine > `defineStates: (tools: {on, entryHook, exitHook, subStates, parallel, invoke})=> Record<string, StatesDefinition>`

引数に補助関数をまとめたオブジェクトを取りステート定義を返す関数。
ステート定義となる辞書オブジェクトはキーがステート名であり、値は配列か null である。

値を null にした場合はそのステートは最終状態であると見なされ、そのステートに入った直後、そのステートがあるステートのサブステートである場合はそのサブステートは終了したと見なされる。サブステートでない場合、そのマシン自体が終了したと見なされる。

値の配列にはオブジェクトか補助関数の戻り値を入れることができる。
オブジェクトを指定する場合、以下のプロパティを設定できる:

- `final?: boolean | (args: CommonArgs) => any`
  - この値が真の場合、そのステートは最終状態と見なされる。ステートに `entryHook` など何か他の値も設定したいときに代わりにこれを使うとよい。逆に他の値を設定しないのであれば、ステートに配列の代わりに null を指定することでもそのステートを最終状態にすることができる。
  - 関数を設定した場合、その戻り値は `':done:'` イベントの `output` プロパティに渡される。


補助関数は以下のとおりである:

- `on(eventType: string, exec: Exec|Exec[])`
  - マシンがあるステートであるときの、 SendableEvent に反応し実行される処理を定義する。exec に配列が指定されている場合、guard条件に最初にマッチしたアクションだけが実行される。
  - `eventType: string`
    - このイベントが send されたときのアクションを定義する。特別なイベント名として `':always:'` `':childDone:'` がある。
        - `':always:'` - そのステートに遷移した直後やコンテストを更新した直後など、1つの処理のループが終わった直後に実行される。`guard` を設定して実行に条件をつけるか、 `to` を設定して必ずその状態を抜けるかしないと永久に実行されるので注意。
      - `':childDone:'` - そのステートにある subState か parallel state が終了状態に達したときに発火する。`{type: ':childDone:', output: unknown}` 型のイベントであり、output には子ステートが final で出力した値が入る。
  - `Exec` - 以下のプロパティを持つオブジェクトである。
    - `guard?: OneOrMany<string | (args: CommonArgs)=>boolean>`
      - booleanを返す関数か、MachineConfig の guards で指定したガード名を単体または配列で指定する。配列を指定した場合、全てが true なら真と見なされる。
      - eventType が発火したとき、Exec の guard が先頭から順に評価されていき、最初に真になった Exec が実行される。
    - `actions?: OneOrMany<string | ActionFn>`
      - 関数か、MachineConfig の actions で指定したアクション名を単体または配列で指定する。配列を指定した場合、複数のアクションを先頭から順に実行する。
      - アクションは context の更新や別サービスとの通信など副作用を行う。
    - `to?: string` - 遷移先ステート名を指定する。アクション実行後に指定したステートに遷移する。
      - 単にステート名だけ指定した場合、この on が定義されたステートを起点として子ステートからステートを探し見つかればそれに遷移する。見つからなければ兄弟ステートから探す。
      - `'./foo'` のように `./` から始まるパスで指定した場合、子ステートだけを対象にして遷移先を探す。
      - `'../foo'` のように `../` から始まるパスで指定した場合、兄弟ステートだけを対象にして遷移先を探す。
      - `'/path/to/state'` のように `/` から始まるパスで指定した場合、ルートからの絶対パスとして遷移先を探す。子や兄弟ステート以外を対象に遷移するにはこの絶対パスで指定する必要がある。

- `entryHook(...actions: ActionFn[])`
  - そのステートに遷移した直後に最初に実行されるアクション。可変長引数に複数のアクションを設定した場合、前から順番に実行される。`on(':always:', ...)` で設定されたイベントより前に実行される。
- `exitHook(...actions: ActionFn[])`
  - そのステートから離れる直前に実行されるアクション。可変長引数に複数のアクションを設定した場合、前から順番に実行される。
- `subStates(stateDefinitions: Record<string, StateDefinition>, initialState?: string)`
  - 1つのステートにつき1つしか指定できず、 parallel と共に指定することはできない。もしやると定義時にエラーが発生する。
  - そのステートの子ステートを定義する。stateDefinitions の形式は makeMachine の第二引数の戻り値の形式と同じ、キーにステート名、値に配列または null を指定したオブジェクトである。
  - サブステートが最終状態になったとき、親ステートに `':childDone:'` イベントが定義されていればそれが発火する。
  - あるステートに入ったとき、サブステートが指定されているのなら、自動的にそれの initialState に入る。initialState が省略された場合、先頭に定義されたステートに入る。
- `parallel(parallelDefinition: { [Region: string]: [Record<string, StateDefinition>] | [MetaItem[], Record<string, StateDefinition>] })`
  - 1つのステートにつき1つしか指定できず、 subStates と共に指定することはできない。もしやると定義時にエラーが発生する。
  - 同時に複数の状態を並行して取るステートを定義する。ステートは子ステートと孫ステート以下を持つことになる。子ステートはそのステートがアクティブである間必ず全てアクティブでありRegionと呼ばれる。それ以下のステートがそのRegionのステートとなる。
  - 辞書オブジェクトを引数としてとり、キーがRegion 名、値は長さ1か2のタプルである。
    - タプルに1つ辞書オブジェクトを指定するとそれがそのリージョンのステート定義になる。ステート定義は makeMachine の第二引数の戻り値や subStates の第一引数と同じ形式である。
    - タプルの最初に MetaItemの配列を指定することができる。それはそのリージョン自身がもつ属性となり、 `on` `entryHook` `exitHook` を持たせることができる。その場合タプルの2つ目がステートの定義となる。
  - すべての Region が最終状態になったとき、親に `':childDone:'` イベントが設定されているならそれが発火する。
    - Region の子ステートに final が設定され、戻り値が設定されている場合、`':childDone:'` イベントの `output` は Region 名をキー、final の戻り値を値にした辞書が設定される。final に戻り値が設定されていなければその Region のプロパティは設定されない。
  - NOTE: この parallel の API は気に入っていないので将来的に変更される可能性がある。
- `invoke(service, config?, ...events)`
  - そのステートに入ったとき、service 引数に指定された関数やマシンを起動させる。
    - 1つのステートにつき複数の invoke を指定することもできる。
  - `':done:'` と `':error:'` イベントが提供されている。`on(':done:', ...)` や `on(':error:', ...)` の形式で、events 引数に指定すると、サービスが正常終了した時かエラー終了した時に処理を実行できる。
  - invoke されたサービスはそのステートを抜けるときに停止させられる。その場合は `':done:'` イベントは発火しない。
  - 複数 invoke したサービスが同時に親の遷移イベントを起動させた場合、競合し、一番最初に処理されたイベント以外は処理されない。
  - 引数 `service`
    - service 引数には直接マシンや関数を指定することも、 makeMachine の MachineConfig の services で登録したサービス名を指定することもできる。
    - 関数をリテラルで指定する場合、その関数が引数を受け取るように定義すると型推論が上手く効かなくなるので、その場合は関数を `defServiceFn` 関数でラップしたうえで関数の引数に型を指定して定義すること。
    - サービス関数には4つの引数（`input: InvocationInput, emit: Emit, listen: Listen, signal: AbortSignal`）が渡され、戻り値が `':done:'` イベントの output として使われる。
      - ただし、サービス関数が関数を返すと、`':done:'` イベントは発火しない。その関数はクリーンアップ関数と見なされ、そのステートを抜けるときに発火する。
      - emit や listen で送出したり受けたりするイベントは親のイベントではなくこの関数独自に定義した型になる。
      - サービス関数に渡される4つの引数
        - `input: InvocationInput` - config の input から渡された値
        - `emit: (event: EmittableEvent) => void`
          - 子から親に通信するときに使用する関数。この関数の引数に渡したイベントオブジェクトは `...events`引数で購読できる。
          - これに渡すことのできるイベント種類は親の Event ではなく、この関数自身が独自に定義することのできるイベントである。
            - `defServiceFn` を用いつつ、emit 引数に `Emit<EmittableEvent>`型を用いて型指定すると、親マシンで型が認識され受けつけられるようになる。
        - `listen: (listener: (event: SendableEvent) => void) => void`
          - 親から `sendTo` で送られたイベントを購読するリスナー関数を登録する。
        - `signal: AbortSignal`
          - その関数がもうすでに停止扱いになったかどうかを内部から検知するためのオブジェクト。`signal.aborted` が `ture` のとき、その関数はステートを抜けたなどの理由で停止扱いになっている。
  - 引数 `config` - オプショナルな設定オブジェクト。以下のプロパティを持つことができる。
    - `input?: (args: CommonArgs) => InvocationInput`
      - この関数の戻り値を service の input 値として利用することができる。どんな型でも良い。
    - `subKey?: string|number`
      - services に登録しているサービスの内、同じ名前のサービスを複数同時に起動するときにはこれの設定が必須である。そうでなければエラーが発生する。
      - これは名前付きサービスはその名前で起動されるが、同じ名前で複数起動できないためであり、それの回避のためである。
      - これが指定されているとき、`snapshot._children` では `${serviceName}:${subKey}` というキーで登録されてサービスが起動される。
      - これが指定されているとき、 `sendTo` ではサブキーも同時に指定しないと送信できなくなる。
  - 引数 `...events`
    - `on` 関数を用いてそのサービス内で起こるイベントにフックした処理を設定することができる。組み込みで用意されているイベントの他に、そのサービス内から `emit` を使って発行されたイベントにフックすることもできる。
    - 組み込みで用意されているイベントの型は以下である:
      - `{type: ':done:', output: unknown}`
        - そのサービスが正常終了した時に発行される。
        - output にはそのサービスが関数であるときにはAwaited された戻り値が、マシンであるときには output 関数が返す戻り値が設定される。
      - `{type: ':error:', error: unknown}`
        - そのサービスが異常終了した時に発行される。

#### makeMachine > 関数に渡される引数

多くの関数では一番目の引数として下記のプロパティが設定されたオブジェクトが渡される:

- `CommonArgs`
  - `context`
    - マシンの現在のコンテキストの値。マシンの initContext を設定していないと null になる。
    - イミュータブルであり、変更は許されていない。更新するときには ActionFn の update 関数を通して更新すること。
  - `c` - context のショートハンド。使用頻度が高いので怠惰のために用意しただけで context と内容は同じ。
  - `event` - 現在のアクションのきっかけとなったイベント
  - `e` - event のショートハンド。使用頻度が高いので怠惰のために用意しただけで event と内容は同じ。
  - `input` - マシンランタイム作成時に input オプションから与えられた値。基本的に静的なデータであるべきで、マシン内で更新するべきではない。作成時に一度与えられるだけの値の割にはライフサイクルを通じてずっと参照することができる。
    - input に副作用をもたらす関数を渡してマシン内部で実行するという使い方もできるが、どちらかというと、副作用は emit を通じて行われるべきである。

参考までに、この種の関数には以下のものがある:
- makeMachine の MachineConfig.output, guard, actionsやguards の params, invoke の input, final

entryHook や exitHook や on で使うことができる ActionFn の第一引数オブジェクトは追加で以下のプロパティを持つ:

- `update: (updates: Partial<Context>) => void`
  - Context の部分プロパティを持つオブジェクトを渡すと Context を部分更新する関数。
  - この関数を実行しても更新されたcontextがその関数内ですぐに利用できるわけではなく、その関数のスコープ内では context は古い値のままである。なぜなら context はイミュータブルだからだ。
    - この後に別のアクション関数を追加すると、そこで更新後の context を利用することができる。
- `emit: (event: EmittableEvent) => void`
  - 外部にイベントを発行する関数。ここでのイベントは外側から send で送られてきてステート内の `on` で購読する SendableEvent とは別物である。
    - マシンの場合、 MachineConfig.types.emittable で型を指定する。
  - ランタイム側からは runtime.onEmitted でこのイベントを購読できる。
  - もし invoke されているサービスから emit した場合、 invoke 関数内の on から購読することができる。
- `sendTo: (service: string, subKey?: string|number, event: EventOfService) => void`
  - invoke されて現在起動しているマシンや関数にイベントを send する。
  - 受け付けられるイベントはマシンの場合そのマシンが send で受け取れるイベント、関数の場合、listen で登録されているイベントである。
  - MachineConfig の services に登録されたサービスしか対象にできない（invoke にリテラル関数やマシン定義を直接渡したときには使えない）。services に登録した名前でサービスを指定する。
    - invoke のオプションで subKey を指定して起動した場合は subKey も同時に指定しないといけない。
- `check`
- `check: (type: string, params?: ParamsValue | ((args: CommonArgs)=>ParamValue)) => boolean`
- `check: (type: {[guardName: string]: ParamsValueOrFn}) => boolean`
  - enqueue と組み合わせることで実行するアクションを動的に組み立てることができる。
    - 他に update と組み合わせることで条件によって更新するかどうか決めることができる。
  - type に guard 名を指定することでその guard の現在の判定結果を返す。
  - params 付きの guard は第二引数に params を与えるか、キーに guard 名、値に params を指定したオブジェクトとして与えるかすることができる。
- `enqueue`
- `enqueue: (type: string, params?: ParamsValue | ((args: CommonArgs)=>ParamValue)) => void`
- `enqueue: (type: {[guardName: string]: ParamsValueOrFn}) => void`
- `enqueue: (fn: (args: {context, c, event, e, input, update, emit})=>void) => void`
  - check と組み合わせることで実行するアクションを動的に組み立てることができる。enqueue に与えられたアクションはすぐに実行されるのではなく実行が予約され、現在のアクションを抜けた後に enqueue された順に実行が開始される。
  - type に action名を指定するか、パラメーター付きのアクションをオブジェクトで指定するほかに、関数のリテラルを直接渡すこともできる。
    - 外側の関数内や直前の enqueue で update を実行した場合、外側の context は更新反映前の古い context になるので、context を使うのなら enqueue の内側の関数に渡される引数の context を参照する必要がある。
    - enqueue 内の関数でさらに enqueue することは今のところ禁じられている。もし enqueue した場合エラーが投げられる。



### `makeRuntime<M extends AnyMachine>(machine: M, options?: RuntimeOptions): Runtime`

マシンを実行可能なランタイムを作る。ランタイムは作っただけではマシンは起動せず、 `.start()` を実行しないと起動しない。

- `RuntimeOptions` - 以下のプロパティを持つオブジェクトである。
  - `id?: string` - ランタイムの id。ログなどに使われる。無指定時には マシンの name と番号を組み合わせた名前が勝手につけられる。
  - `input?: () => I`
    - ランタイム作成時にマシンの input に設定される値を返す関数。この値は initContext でも使うことができ、マシンのあらゆる文脈から参照することができる。
    - あくまで参照用の値として使い、マシン側からこの値を変更するのは避けるべきである。

Runtime は以下のメンバーを持つ:

- `id: string` - ランタイムのid
- `machine: M` - 渡されたマシンの参照。
- `getSnapshot(): Snapshot` - 現在のランタイムの状態を表すスナップショットを得る。
  - あくまでその取得時の瞬間のものなので時間経過によって古くなる可能性がある。
  - `.start()` されていないとき、snapshot は空オブジェクトになる。
  - Snapshot はオブジェクトであり、以下のメンバーを持つ:
    - `runtimeId: string` - そのスナップショットのランタイムID。識別のために用意されている。
    - `runtimeStatus: RuntimeStatus` - ランタイムの稼働状態。型の `RuntimeStatus` 参照。
    - `states: string[]` - 現在のステートのフルパスのリスト。現在ステートが parallel な子ステートを持つ場合、配列の長さは 2 以上になることがある。そうでないときには配列の長さは 1 である。
      - 他のステートマシンと違って、ステート名の前に '/' が付き、階層は '/' で区切られる。
    - `stateValue: string | string[] | undefined` - parallel を扱わないマシン定義のために用意されたショートカット。states の長さが 1 のときには最初のステートパスを返す。そうでないときには states をそのまま返す。
    - `context: PrivateKeyRemovedContext` - コンテキスト。ただし、マシン内部で context を参照するときと違い、`_` から始まるプロパティは公開されない。
    - `c` - 怠惰のために用意された context のショートハンド。中身は context と同じ。
    - `output: O | undefined` - ランタイムが最終状態に入るまでは undefined。最終状態に入ったとき計算され結果がここに設定される。
    - `error: unknown` - エラーが生じてランタイムが停止したときにそのエラー内容が入る。それまでは undefined。
    - `_children` - デバッグ用。業務では使用しないのが望ましい。キーにサービス名、値に invoke などで起動中のサービスが入る。subKey を設定して起動している場合、キーは `${serviceName}:${subKey}` になる。
    - `_runtime` - このスナップショットを作ったランタイム自身。
  - 怠惰のために runtime から直接プロパティでsnapshot を参照できる getter が用意されている。以下のものが設定されている:
    - states, stateValue, context, runtimeStatus, output
- `subscribe(onSnapshot: ((current: Snapshot, prev: Snapshot)=>void)|undefined, onError?:(err:unknown)=>void): UnsubscribeFn`
  - snapshot が更新されるたびに呼ばれる観測関数を登録する。ただし第一引数の関数はエラーは監視しない。それは省略可能な第二引数の関数の役割である。
    - React の useSyncExternalStore のように更新とエラーの両方を監視する関数が必要な場合、2つの関数をまとめて記述する必要がある。
    ```ts
    const subscribe = useCallback((onStoreChange) => {
      const unsubscribe = rt.subscribe(onStoreChange, onStoreChange)
      return unsubscribe
    }, [rt]);
    const snapshot = useSyncExternalStore(subscribe, () => rt.getSnapshot())
    ```
  - もしもエラーを監視する関数が全く登録されていない場合、エラーが発生するとそのまま例外として投げられる。
  - UnsubscribeFn を返す。実行すると登録を解除する。
  - onSnapshot
    - `current` - 現在のスナップショット
    - `prev` - 1つ前のスナップショット
      - NOTE: この引数は無意味に感じているので仕様から削除される可能性がある。
  - `UnsubscribeFn: () => void` - 登録を削除する。
- `start(): this` - ランタイムを起動する。runtimeStatus が 'active' になり最初のステートに遷移し、 send を受け付けるようになる。
- `send(event: SendableEvent | string): this`
  - 外部からマシンにイベントを送る。`type` 以外のプロパティのないイベントの場合、オブジェクトでなく文字列で送ることもできる。このイベントを送った結果は getSnapshot() や subscribe で受けることができる。
- `stop(): this` - 'active' のランタイムを停止する。一度停止させると再開することはできない。runtimeStatus は 'stopped' になる。
- `onEmitted(emittedEventType: string, handler: (emittedEvent: EmittableEvent) => void): UnsubscribeFn`
  - マシン内部から送られたイベント EmittableEvent に対応した処理を設定する。主に副作用を設定すると良い。
    - `emittedEventType` に指定できる特別な値として `'*'` がある。これはすべての EmittedEvent を対象にする。
  - `UnsubscribeFn: () => void` - 登録を削除する。



## XState との差異

|  | XState | small-state |
| - | - | - |
| パス区切り文字 | `.` | `/` |
| ロジックを持つのは | マシン | ランタイム |
| context 更新 | assign | update: action内引数 |
| 子から親への通信 | sendParent | emit |
| 親から子への通信に使うもの | actor id | service name (と subKey) |
| 兄弟アクター間の通信 | sendTo | できない (親経由で代替可能) |
| 子から外界への emit | emit | なし（親経由で代替可能） |
| eventless | always | on(':always:', ...) |
| subState の終了フック | onDone | on(':childDone:', ...) |
| invokeの終了フック | onDone | on(':done:', ...) |
| invokeのerrorフック | onError | on(':error:', ...) |

- initial を指定しなければ最初のステートがアクティブになる。
- 階層を持つステートがアクティブなら、必ず末端のステートがアクティブになる。


## 不足している機能

以下の機能はない:

- delays, after: 指定した秒数後に自動的に別の状態に遷移する機能
- 子の syncSnapshot: boolean オプション: 子のスナップショットが更新されるたびに親のスナップショットも更新する機能
- spawn, spawnChild
- stopChild
- raise
- tags
- .matches()
- ステートid （代替手段：フルパス指定での遷移）
- reenter （自己遷移）
- マシントップレベル（ルート）で以下の機能が使えない
  - invoke, entryHook, exitHook, parallel
  - 状態を持たないマシン

## TODO

- Arktype を独自のパーサーに置き換えてエラー箇所を分かりやすくする
- parallel のインターフェースの改修
  - もう少し分かりやすく
  - 連続で入れ子にできないのを改善する
