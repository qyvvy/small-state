import type { Runtime } from '../runtime/Runtime'
import type { SnapshotFrom } from '../runtime/r.types'

export async function waitFor<R extends Runtime<any>>(
  runtime: R,
  cond: (snapshot: SnapshotFrom<R>) => boolean,
  options?: { timeout?: number },
): Promise<SnapshotFrom<R>> {
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
    const check = (snapshot: SnapshotFrom<R>) => {
      if (!cond(snapshot)) return
      dispose()
      resolve(snapshot)
    }

    const timeoutId = !options?.timeout ? undefined : setTimeout(() => {
      dispose()
      reject(`waitFor: timeout of ${options.timeout} ms exceeded`)
    }, options.timeout)

    check(runtime.getSnapshot() as SnapshotFrom<R>)
    if (done) {
      return
    }
    unsubscribe = runtime.subscribe((snapshot) => {
      check(snapshot as SnapshotFrom<R>)
    })
  })
}
