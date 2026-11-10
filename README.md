# small-state

This README.md was automatically translated from the Japanese version and may contain inaccuracies. For accurate information, please refer to [the Japanese version](https://github.com/qyvvy/small-state/blob/dev/README.ja.md).

---

A state machine library inspired by [XState](https://stately.ai/docs/xstate).

## Features & Advantages

- TypeScript support
- Low verbosity / Minimal boilerplate
- Clean syntax that is hard to get lost in


## Installation

```
npm i small-state
```


## What is an FSM (Finite State Machine)?

A Finite State Machine is a computational model defined by a finite number of states and transitions between those states.

When the machine is in a specific state and an event is sent to it, it executes the specified logic for that event, updates its internal context/state, and optionally transitions to another state.<br>
When dealing with complex states and conditional branching, state machines demonstrate immense value by reducing programming bugs and improving code readability.


## Example

First, define a state machine using `makeMachine`.

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

This state machine has three states: `idle`, `locked`, and `loggedIn`.<br>
When unspecified, the initial state defaults to the first defined state (in this case, `idle`).

To execute this machine, pass it to `createRuntime`.

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

A newly created runtime remains paused with `runtimeStatus: "notStarted"` until `.start()` is called.<br>In this state, `stateValue` is `undefined`.

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

Calling `.start()` changes `runtimeStatus` to `"active"`. `stateValue` points to the current state. Since it is currently in the `"idle"` state, the path is `"/idle"`.<br>
Note that state values are represented by full paths, so they start with a leading `"/"`.

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

When sending a `LOGIN_FAILED` event, the machine evaluates the `guard` functions in the `LOGIN_FAILED` definition array sequentially. It executes the `actions` of the first matching element.

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

Since `failedAttempts` in `context` is 0, it fails the guard condition of the first element and matches the second element instead. (An element without a `guard` matches unconditionally.)<br>
`context` is updated, incrementing `failedAttempts` by +1 to 1.

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

Sending `LOGIN_FAILED` two more times increases `failedAttempts` to 2 or more, fulfilling the condition `guard: ({ context }) => context.failedAttempts >= 2`. The `to` property represents the transition destination. If `to` is specified, the machine transitions to that state after executing `actions`. In this case, it transitions to the `"locked"` state, making `stateValue` equal to `"/locked"`.

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

The `locked` state has no event handler defined for `LOGIN_FAILED`, so sending this event produces no effect.

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

Triggering the `UNLOCK` event resets `failedAttempts` back to 0 and transitions back to `"idle"`.

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

When receiving `LOGIN_SUCCESS` while in `idle`, it transitions to `"loggedIn"`.<br>
Since `loggedIn` is defined as `null`, it acts as a final state. The machine stops execution, and `runtimeStatus` becomes `"done"`.



## API

### Types

- Machine Definition
  - `type AnyMachine = Machine<any, any, any, any, any, any, any, any, any>`
    - Any machine instance.
  - `type MContext = Record<string, any>`
    - Context object representing state variables held inside the machine. Properties starting with `_` are internal to the machine and hidden from external visibility.
  - `type SendableEvent = { type: string; [key: string]: any }`
    - Events sent to the state machine from external callers via `runtime.send` or `sendTo`.
  - `type EmittableEvent = { type: string; [key: string]: any }`
    - Events emitted externally from inside the state machine via `emit`.
  - `type ServiceFn<TInput = any> = (input: TInput, emit: Emit<EmittableEvent>, listen: Listen<SendableEvent>, signal: AbortSignal) => unknown`
    - Function signature for service functions passed to `MachineConfig.services` or `invoke`.
    - Events sent via `emit` or received via `listen` inside a service function are scoped to types defined specifically for that service function, rather than the parent machine's event type.
    - `input: any` - Value passed via the `input` option of `invoke`.
    - `emit: (event: EmittableEvent) => void`
      - Function to communicate from child to parent. Event objects passed to this function can be subscribed to by the parent using the `on` helper.
    - `listen: (listener: (event: SendableEvent) => void) => void`
      - Registers a listener to subscribe to events sent from the parent via `sendTo`.
    - `signal: AbortSignal`
      - Signal object used internally by the function to check if it has been stopped. When `signal.aborted` is `true`, the function is considered stopped (e.g., due to exiting the state).
  - `type Emit<EM extends EmittableEvent> = (event: EM) => void`
    - By providing `Emit` with generic type parameters to the second argument of a service function wrapped in `defServiceFn`, the parent machine can recognize the emitted event types at type level.
  - `type ListenFn<E extends SendableEvent> = (listener: (event: E) => void) => void`
    - By providing `ListenFn` with generic type parameters to the third argument of a service function wrapped in `defServiceFn`, the service can accept specific `SendableEvent` types sent from the parent via `sendTo`.
- Runtime
  - `type RuntimeStatus = 'notStarted' | 'active' | 'stopped' | 'done' | 'error'`
    - Execution status of the runtime.
    - `'notStarted'` - `.start()` has not been called yet.
    - `'active'` - `.start()` has been called and the machine is running.
    - `'stopped'` - `.stop()` was called and execution is halted.
    - `'done'` - Entered the final state, completed, and successfully stopped.
    - `'error'` - Execution stopped due to an error.
  - `type Runtime<M AnyMachine extends>`
  - `type Snapshot<M AnyMachine extends>` - Refer to the Runtime getSnapshot section.

### Utility Functions

- `isMachine(v: unknown): v is AnyMachine` - Determines whether the argument is a machine.
- `isRuntime(v: unknown): v is Runtime<AnyMachine>` - Determines whether the argument is a runtime.
- `defServiceFn(serviceFn): ServiceFn`
  - Defines a service function.
  - Passing plain functions directly to `invoke` or defining them outside a machine configuration might cause type inference to break. Wrapping them with `defServiceFn` preserves type inference.
- `waitFor<R extends Runtime<any>>(runtime, cond, options?): Promise<SnapshotFrom<R>>` - Returns a Promise that resolves when the specified `runtime` satisfies `cond`.

### Primary Functions

- `makeMachine(config, states): Machine` - Creates a machine definition.
- `makeRuntime(machine, option?): Runtime` - Creates an executable runtime instance for a machine.


### Reserved Event Types

Event types surrounded by colons (e.g., `':fooBar:'`) are reserved for internal system use.
Beyond event types, any names bracketed by colons might also be reserved by the system in future releases.
The following event names are currently reserved:

- Inside standard states
  - `':always:'` - Fires whenever a snapshot update occurs, such as immediately after transitioning to a state or after updating the context.
  - `':childDone:'` - Fires when all child substates or parallel states reach a final state.
- Inside `invoke`
  - `{type: ':done:', output: unknown}` - Fires when the invoked service completes successfully.
  - `{type: ':error:', error: unknown}` - Fires when the invoked service terminates with an error.

### `makeMachine(config: MachineConfig, defineStates: (tools)=>Record<string, StateDefinition>): Machine`

#### makeMachine > `MachineConfig`

A dictionary object containing basic machine settings and configuration properties:

- `types?: { context?: C; events?: E; emittable?: EM; input?: I; output?: O }`
  - Specifies types for each entity using the pattern `{}` as `...`.
    - `context: Record<string, any>` - Values readable and writable inside and outside the machine. Properties starting with `_` are private internal values and are not exposed externally.
    - `events: SendableEvent` - Events that can be sent to the machine from the outside.
    - `emittable: EmittableEvent` - Events that can be emitted outward from the machine.
    - `input: any` - Type of input data supplied when initializing the machine.
    - `output: any` - Type of return value output when the machine finishes execution.
  - Type definitions use `{}` as `...` instead of standard type parameters to allow partial type specification while retaining type inference.

- `name?: string`
  - Name of the machine. Used for logging or generating runtime IDs.
- `initialState?: string`
  - Name of the initial state when starting the machine.
- `initContext?: (input: I) => C`
  - Function returning initial context data when the machine starts. Highly recommended when state context is used.
- `output?: (args: CommonArgs) => O`
  - Function executed when the machine reaches a `final` state, returning the machine's final output value. Accessible via `snapshot.output` on the runtime.
  - When the machine is invoked as a child service, this value is passed as the `output` property of the parent machine's `{type: ':done:', output: O}` event.
  - The event argument passed to this function is also of type `{type: ':done:', output: unknown}`. The `output` parameter contains the value produced by the final state options, or `undefined` if none was emitted.
- `guards?: Record<string, (args: CommonArgs, params: unknown)=>boolean>`
  - Register guard functions used to evaluate transition eligibility. Registered guard functions can be referenced by string names.
  - If a guard accepts parameters via its second argument `params`, pass an object formatted as `{[guardName: string]: ParamsValueOrFn}` (where the value is either a parameter value or a function returning it) instead of a simple string name when referencing the guard.
- `actions?: Record<string, (arg: {context, c, event, e, input, update, emit}, params: unknown)=>unknown>`
  - Register side-effect action functions to execute during transitions. Registered actions can be referenced by string names.
  - If an action accepts parameters via its second argument `params`, pass an object formatted as `{[actionName: string]: ParamsValueOrFn}` (where the value is either a parameter value or a function returning it) instead of a simple string name when calling the action.
- `services?: Record<string, AnyMachine | ServiceFn>`
  - Dictionary mapping service names to machine definitions or service functions. Services can be started using `invoke`.
  - Async functions are supported. Currently, running an async function as a service is the only way `small-state` manages async operations.
  - A service function receives 4 arguments, and its return value is treated as `output`. See `ServiceFn` section.
  - When defining a service function outside `makeMachine`, wrap it with `defServiceFn`.

#### makeMachine > `defineStates: (tools: {on, entryHook, exitHook, subStates, parallel, invoke})=> Record<string, StatesDefinition>`

A function accepting an object of helper utilities as parameters and returning state definitions.
The dictionary object returned key-maps state names to either definition arrays or `null`.

Setting a state's value to `null` designates it as a final state. Immediately upon entering a `null` state, if it is a substate of a parent state, that substate is considered complete. If it is a top-level state, the entire state machine completes execution.

Elements inside a state definition array can be configuration objects or return values from helper tools.
When providing a configuration object, the following properties can be set:

- `final?: boolean | (args: CommonArgs) => any`
  - When set to `true`, the state is considered a final state. Useful when you need to specify other properties (such as `entryHook`) on a final state. If no extra hooks are needed, setting the state value to `null` directly instead of an array is equivalent.
  - When passing a function, its return value is forwarded to the `output` property of the `':done:'` event.


The following helper functions are provided in `tools`:

- `on(eventType: string, exec: Exec|Exec[])`
  - Defines action handling in response to received `SendableEvent`s when in this state. If an array of `Exec` objects is provided, only the action matching the first satisfied `guard` executes.
  - `eventType: string`
    - Defines actions triggered when this event is sent. Built-in special event types include `':always:'` and `':childDone:'`.
        - `':always:'` - Fires continuously whenever an execution loop completes (e.g., right after entering a state or updating context). Note: Ensure a `guard` or a `to` transition is specified to prevent infinite execution loops.
      - `':childDone:'` - Fires when child `subState`s or `parallel` states under this state reach a final state. Formatted as an event of type `{type: ':childDone:', output: unknown}`, where `output` contains values emitted by child final states.
  - `Exec` - Configuration object containing the following properties:
    - `guard?: OneOrMany<string | (args: CommonArgs)=>boolean>`
      - Accepts a boolean function or guard name(s) registered in `MachineConfig.guards`. When providing an array, all guard conditions must evaluate to `true`.
      - When `eventType` fires, `guard` conditions are evaluated in sequence. The first matching `Exec` executes.
    - `actions?: OneOrMany<string | ActionFn>`
      - Accepts action function(s) or action name(s) registered in `MachineConfig.actions`. Arrays of actions execute sequentially from top to bottom.
      - Actions handle side-effects such as context updates or messaging external services.
    - `to?: string` - Target state name for state transition. Transitions to the specified state after executing actions.
      - Providing a simple state name resolves state targets relative to child states first, followed by sibling states.
      - Paths starting with `./` (e.g., `'./foo'`) search strictly within child states.
      - Paths starting with `../` (e.g., `'../foo'`) search strictly within sibling states.
      - Absolute paths starting with `/` (e.g., `'/path/to/state'`) resolve from the root machine level. Absolute paths are required to target states outside child or sibling trees.

- `entryHook(...actions: ActionFn[])`
  - Actions executed immediately upon entering the state. When multiple actions are passed via variadic arguments, they execute in parameter order. Runs before events configured via `on(':always:', ...)`.
- `exitHook(...actions: ActionFn[])`
  - Actions executed right before leaving the state. Executes sequentially in parameter order when multiple actions are supplied.
- `subStates(stateDefinitions: Record<string, StateDefinition>, initialState?: string)`
  - Can only be specified once per state and cannot be combined with `parallel` (doing so raises a definition error).
  - Defines nested child substates. `stateDefinitions` follows the same structure as the return value of `makeMachine`'s state factory (dictionary mapping state names to arrays or `null`).
  - When a substate reaches a final state, it triggers the parent state's `':childDone:'` event if one is defined.
  - Entering a state with defined substates automatically activates its `initialState`. If `initialState` is omitted, it defaults to the first defined substate.
- `parallel(parallelDefinition: { [Region: string]: [Record<string, StateDefinition>] | [MetaItem[], Record<string, StateDefinition>] })`
  - Can only be specified once per state and cannot be combined with `subStates` (doing so raises a definition error).
  - Defines concurrent state regions that execute simultaneously. States defined inside contain regions (child states) and nested sub-tree states. All region child states remain active concurrently as long as the parent state is active.
  - Accepts a dictionary mapping Region names to 1- or 2-element tuple arrays:
    - A single-element tuple containing a state definition dictionary defines state definitions for that region (same format as `makeMachine` state definitions or `subStates`).
    - A two-element tuple can supply an array of `MetaItem`s as its first element (allowing regional attributes such as `on`, `entryHook`, `exitHook`), followed by state definitions as its second element.
  - When all regions reach final states, the parent state's `':childDone:'` event fires (if defined).
    - If final states inside regions return values, the `output` object of `':childDone:'` will contain Region names as keys and returned final values as dictionary entries. Unreturned region final values are omitted.
  - NOTE: The `parallel` API structure may change in future releases.
- `invoke(service, config?, ...events)`
  - Spawns services (functions or machines) provided by `service` upon entering the state.
    - Multiple `invoke` declarations can be attached to a single state.
  - Built-in event hooks `':done:'` and `':error:'` are provided. Subscribing via `on(':done:', ...)` or `on(':error:', ...)` inside `...events` allows handling success or error completion.
  - Invoked services are automatically canceled/stopped upon exiting the state. In this case, `':done:'` events do not fire.
  - If multiple invoked services attempt to trigger parent transitions simultaneously, race conditions resolve by handling only the earliest processed event.
  - Argument `service`
    - Accepts direct machine references, inline functions, or service name strings registered in `MachineConfig.services`.
    - Defining parameter-accepting functions as raw inline literals can break TypeScript inference; wrap inline service declarations with `defServiceFn` while explicitly typing parameters.
    - Service functions receive 4 arguments (`input: InvocationInput, emit: Emit, listen: Listen, signal: AbortSignal`) and use their return values as output for `':done:'` events.
      - Exception: If a service function returns a cleanup function, the `':done:'` event does not fire. The returned function is treated as a cleanup hook and executes when exiting the state.
      - Events sent via `emit` or received via `listen` use types explicitly defined by the service function, not parent machine types.
      - 4 parameters passed to service functions:
        - `input: InvocationInput` - Value received from configuration `input`.
        - `emit: (event: EmittableEvent) => void`
          - Emit messages from child to parent. Emitted events can be handled using `...events` arguments in `invoke`.
          - Allowed emitted event types are custom types defined by the service function itself.
            - Wrapping functions with `defServiceFn` and annotating `emit` with `Emit<EmittableEvent>` allows parent machines to infer emitted event types.
        - `listen: (listener: (event: SendableEvent) => void) => void`
          - Registers event listeners to process messages sent from parent machines via `sendTo`.
        - `signal: AbortSignal`
          - Abort signal used to check if execution was stopped. `signal.aborted === true` indicates the service has been terminated.
  - Argument `config` - Optional configuration object with the following properties:
    - `input?: (args: CommonArgs) => InvocationInput`
      - Returns values passed as the `input` argument to `service`. Can return any data type.
    - `subKey?: string|number`
      - Mandatory when spawning multiple concurrent instances of the same service name registered in `services`. Omitting `subKey` during duplicate instances throws an error.
      - Named services track execution by key; `subKey` prevents collisions between identical service names.
      - When set, services register under `${serviceName}:${subKey}` in `snapshot._children`.
      - When using `sendTo`, target services must include `subKey`.
  - Argument `...events`
    - Use `on` functions to intercept internal events generated within invoked services. Supports custom events emitted via `emit` alongside standard built-in events.
    - Standard built-in event definitions:
      - `{type: ':done:', output: unknown}`
        - Emitted upon successful completion of the service.
        - `output` contains the awaited function return value or the machine's `output` function result.
      - `{type: ':error:', error: unknown}`
        - Emitted when service execution fails with an error.

#### makeMachine > Parameters Passed to Callbacks

Most callback functions receive an object matching `CommonArgs` as their first parameter:

- `CommonArgs`
  - `context`
    - Current context value of the machine (`null` if `initContext` was omitted).
    - Immutable object; direct mutations are disallowed. Use `ActionFn`'s `update` function to modify context fields.
  - `c` - Shorthand property for `context`. Provided for convenience.
  - `event` - The event object that triggered the current action execution.
  - `e` - Shorthand property for `event`. Provided for convenience.
  - `input` - Static input data passed during machine runtime creation. Should remain immutable during lifecycle execution.
    - While functions with side effects can technically be passed via `input`, side effects should ideally be dispatched via `emit`.

Callback parameters of this form are supplied to:
- `MachineConfig` functions (`output`, `guard`, `actions`, `guards` params, `invoke` input, `final`).

First-argument objects passed to `ActionFn` handlers in `entryHook`, `exitHook`, and `on` contain additional properties:

- `update: (updates: Partial<Context>) => void`
  - Accepts partial context update objects to modify machine context state.
  - Calling `update` does not immediately update `context` within the current execution scope (context context references within the same block retain older values due to immutability).
    - Updated context values become available in subsequent action handlers.
- `emit: (event: EmittableEvent) => void`
  - Emits event objects externally. Distinct from internal `SendableEvent`s received from external senders and handled by state `on` handlers.
    - Define types on `MachineConfig.types.emittable`.
  - Subscribed externally on runtimes via `runtime.onEmitted`.
  - If emitted from invoked services, parent machines can subscribe using `on` handlers inside `invoke`.
- `sendTo: (service: string, subKey?: string|number, event: EventOfService) => void`
  - Dispatches events to active invoked machine or service function targets.
  - Target events must match acceptable send events for machines or registered `listen` handlers for service functions.
  - Can only target services registered in `MachineConfig.services` (cannot target inline literal functions/machines).
    - If `subKey` was specified on `invoke`, it must also be provided to `sendTo`.
- `check`
- `check: (type: string, params?: ParamsValue | ((args: CommonArgs)=>ParamValue)) => boolean`
- `check: (type: {[guardName: string]: ParamsValueOrFn}) => boolean`
  - Evaluates current guard status dynamically when building conditional action chains alongside `enqueue` or `update`.
  - Returns the current boolean outcome for the guard matching `type`.
  - Guards accepting parameters take values via second-argument `params` or object parameter entries.
- `enqueue`
- `enqueue: (type: string, params?: ParamsValue | ((args: CommonArgs)=>ParamValue)) => void`
- `enqueue: (type: {[guardName: string]: ParamsValueOrFn}) => void`
- `enqueue: (fn: (args: {context, c, event, e, input, update, emit})=>void) => void`
  - Used with `check` to build dynamic execution queues. Enqueued actions do not run immediately; they are scheduled to execute sequentially after exiting the active action function scope.
  - Accepts registered action names, parameterized action configuration objects, or inline action functions.
  - If `update` was called outside or in a preceding action, reference context inside enqueued callback parameters to read updated context states.
  - Calling `enqueue` inside an enqueued action is currently forbidden and throws an error.



### `makeRuntime<M extends AnyMachine>(machine: M, options?: RuntimeOptions): Runtime`

Creates an executable runtime instance for a machine. Creating a runtime does not start the machine automatically; `.start()` must be called to begin execution.

- `RuntimeOptions` - Configuration object with properties:
  - `id?: string` - Runtime ID string used for identification or logging. Defaults to combining machine name and numeric sequence counters.
  - `input?: () => I`
    - Function returning input data passed to machine `input`. Accessible across initializers (`initContext`) and execution callbacks.
    - Intended for static reference data; mutating input state internally is discouraged.

Runtime instances expose the following members:

- `id: string` - Runtime ID.
- `machine: M` - Reference to the underlying machine definition.
- `getSnapshot(): Snapshot` - Returns a snapshot snapshot representing the runtime's current state.
  - Reflects state at the instant of invocation; snapshot state may age over time.
  - Returns an empty object prior to calling `.start()`.
  - Snapshot objects contain:
    - `runtimeId: string` - Unique identifier string for runtime validation.
    - `runtimeStatus: RuntimeStatus` - Current status. See `RuntimeStatus` type.
    - `states: string[]` - Full path strings of active state values. Returns arrays with length > 1 if parallel states are active; otherwise returns a single-element array.
      - State paths prepend leading `/` separators and delimit nested state hierarchies using `/`.
    - `stateValue: string | string[] | undefined` - Convenience helper for non-parallel machines. Returns the first string state path when `states.length === 1`, or `states` array otherwise.
    - `context: PrivateKeyRemovedContext` - Public context data (properties starting with `_` are excluded).
    - `c` - Convenience shorthand property for `context`.
    - `output: O | undefined` - Contains final execution output values when `runtimeStatus === 'done'`; `undefined` otherwise.
    - `error: unknown` - Contains error details if execution halted due to errors; `undefined` otherwise.
    - `_children` - Debugging member. Keyed by service name mapping to running service instances. When `subKey` is present, keys map as `${serviceName}:${subKey}`.
    - `_runtime` - The runtime instance itself that generated this snapshot.
  - Direct shortcut getters exist on `runtime` instances for convenience:
    - `states`, `stateValue`, `context`, `runtimeStatus`, `output`
- `subscribe(onSnapshot: ((current: Snapshot, prev: Snapshot)=>void)|undefined, onError?:(err:unknown)=>void): UnsubscribeFn`
  - Registers snapshot listener callbacks fired whenever snapshot states update. The primary callback listener ignores runtime errors; error handling is delegated to `onError`.
    - When integrating with state stores requiring unified update/error observation (such as React's `useSyncExternalStore`), pass handlers to both parameters:
    ```ts
    const subscribe = useCallback((onStoreChange) => {
      const unsubscribe = rt.subscribe(onStoreChange, onStoreChange)
      return unsubscribe
    }, [rt]);
    const snapshot = useSyncExternalStore(subscribe, () => rt.getSnapshot())
    ```
  - If no error listener handler is registered, runtime errors are thrown as uncaught exceptions.
  - Returns an `UnsubscribeFn` callback to unregister the listener.
  - `onSnapshot` parameters:
    - `current` - Latest updated snapshot instance.
    - `prev` - Previous snapshot instance prior to update.
      - NOTE: The `prev` argument may be deprecated in future releases.
  - `UnsubscribeFn: () => void` - Cancels subscription.
- `start(): this` - Begins machine execution. Sets `runtimeStatus` to `'active'`, enters initial state structures, and enables `send` handling.
- `send(event: SendableEvent | string): this`
  - Dispatches events into the runtime. For simple events without payload fields beyond `type`, string representations can be sent directly instead of event objects. Results are observable via `getSnapshot()` or `subscribe`.
- `stop(): this` - Halts active runtime instances. Stopped runtimes cannot be restarted. Sets `runtimeStatus` to `'stopped'`.
- `onEmitted(emittedEventType: string, handler: (emittedEvent: EmittableEvent) => void): UnsubscribeFn`
  - Registers listeners for internal `EmittableEvent` events dispatched outward from within machines. Ideal for triggering application side-effects.
    - Passing `'*'` to `emittedEventType` subscribes to all emitted event types.
  - `UnsubscribeFn: () => void` - Cancels subscription.



## Differences from XState

| Feature / Behavior | XState | small-state |
| - | - | - |
| Path Delimiter | `.` | `/` |
| Logic ownership | Machine | Runtime |
| Context Updates | `assign` | `update` argument inside action handlers |
| Child to Parent Messaging | `sendParent` | `emit` |
| Parent to Child Messaging | actor id | service name (and optional `subKey`) |
| Peer Actor Messaging | `sendTo` | Not supported (use parent routing instead) |
| Child Emit to External | `emit` | Not supported (route via parent instead) |
| Eventless Transitions | `always` | `on(':always:', ...)` |
| Substate Done Hook | `onDone` | `on(':childDone:', ...)` |
| Invoke Done Hook | `onDone` | `on(':done:', ...)` |
| Invoke Error Hook | `onError` | `on(':error:', ...)` |

- If `initial` state is omitted, the first state in definition order becomes initial active state.
- When a state hierarchy is active, a leaf state is guaranteed to be active.


## Missing Features / Unimplemented Functionality

The following features are not supported:

- `delays`, `after`: Automatic state transitions after specified timeouts
- `syncSnapshot: boolean` child option: Automatically updating parent snapshot whenever child snapshot changes
- `spawn`, `spawnChild`
- `stopChild`
- `raise`
- `tags`
- `.matches()`
- State IDs (Workaround: Use absolute path state target string transitions)
- `reenter` (self-transitions)
- Machine root-level restrictions (the following cannot be declared directly at machine root):
  - `invoke`, `entryHook`, `exitHook`, `parallel`
  - Stateless machines

## TODO

- Replace ArkType parser with custom error parser to provide clear debugging feedback
- Refactor `parallel` interface structure
  - Improve clarity and usability
  - Support nested continuous parallel structures
