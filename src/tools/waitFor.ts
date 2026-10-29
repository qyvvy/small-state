import type { Runtime } from '../runtime/Runtime'
import type { SnapshotFrom } from '../runtime/r.types'

export async function waitFor<RT extends Runtime<any>>(
  runtime: RT,
  cond: (snapshot: SnapshotFrom<RT>) => boolean,
  options?: { timeout?: number },
) {
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
    const check = (snapshot: SnapshotFrom<RT>) => {
      if (!cond(snapshot)) return
      dispose()
      resolve(snapshot)
    }

    const timeoutId = !options?.timeout ? undefined : setTimeout(() => {
      dispose()
      reject(`waitFor: timeout of ${options.timeout} ms exceeded`)
    }, options.timeout)

    check(runtime.getSnapshot() as SnapshotFrom<RT>)
    if (done) {
      return
    }
    unsubscribe = runtime.subscribe((snapshot) => {
      check(snapshot as SnapshotFrom<RT>)
    })
  })
}
