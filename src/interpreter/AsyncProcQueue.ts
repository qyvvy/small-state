
export class AsyncProcQueue {
  #pendingNum = 0
  #queue: Array<() => void> = []
  #idleResolvers: Array<() => void> = []

  async add<T>(task: () => Promise<T>): Promise<T> {
    this.#pendingNum += 1
    return new Promise<T>((resolve, reject) => {
      this.#queue.push(() => {
        Promise.resolve().then(task).then(
          (value) => resolve(value),
          (err) => reject(err),
        ).finally(() => {
          this.#pendingNum -= 1
          this.#execNext()
          this.#signalCompletion()
        })
      })
      this.#execNext()
    })
  }

  #execNext() {
    const item = this.#queue.shift()
    if (item) {
      item()
    }
  }

  async onIdle(): Promise<void> {
    return !this.#pendingNum
      ? Promise.resolve()
      : new Promise((resolve) => this.#idleResolvers.push(resolve))
  }

  #signalCompletion() {
    if (!this.#pendingNum) {
      // 実行完了したら resolver を消費することで onIdle に通知させる
      this.#idleResolvers.forEach((r) => r())
      this.#idleResolvers = []
    }
  }

}
