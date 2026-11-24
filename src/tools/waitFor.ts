import type { AnyMachine } from '../machine/m.types'
import type { Runtime, Snapshot } from '../runtime/Runtime'

/**
 * @param runtime
 * @param {function} cond: (snapshot) => boolean
 * @param {Object} [options]
 * @param {number} [options.timeout]
 */
export async function waitFor<M extends AnyMachine>(
  runtime: Runtime<M>,
  cond: (snapshot: Snapshot<M>) => boolean,
  options?: { timeout?: number },
): Promise<Snapshot<M>> {
  if (runtime.runtimeStatus === 'notStarted') {
    throw new Error(`RT"${runtime.id}" is not started.`)
  }
  return new Promise((resolve, reject) => {
    let done = false
    let unsubscribe: (() => void) | undefined
    const dispose = () => {
      clearTimeout(timeoutId)
      done = true
      unsubscribe?.()
    }
    const check = (snapshot: Snapshot<M>) => {
      if (!cond(snapshot)) return
      dispose()
      resolve(snapshot)
    }

    const timeoutId = !options?.timeout
      ? undefined
      : setTimeout(() => {
        dispose()
        reject(`waitFor: timeout of ${options.timeout} ms exceeded`)
      }, options.timeout)

    check(runtime.getSnapshot() as Snapshot<M>)
    if (done) {
      return
    }
    unsubscribe = runtime.subscribe((snapshot) => {
      check(snapshot as Snapshot<M>)
    })
  })
}
