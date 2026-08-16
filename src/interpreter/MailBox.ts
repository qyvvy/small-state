interface QueueItem<V> {
  value: V
  next: QueueItem<V> | null
}

export class MailBox<V> {
  #isActive = false
  #current: QueueItem<V> | null = null
  #last: QueueItem<V> | null = null
  #process!: (value: V) => void
  #flush!: () => void

  constructor(process: (value: V) => void, isAsync = false) {
    this.#process = process
    this.#flush = isAsync ? this.#_flushAsync : this.#_flush
  }

  start() {
    this.#isActive = true
    this.#flush()
  }

  clear() {
    if (this.#current) {
      this.#current.next = null
      this.#last = this.#current
    }
  }

  enqueue(value: V) {
    const enqueued = { value, next: null }
    if (this.#current) {
      this.#last!.next = enqueued
      this.#last = enqueued
      return
    }
    this.#current = enqueued
    this.#last = enqueued
    if (this.#isActive) {
      this.#flush()
    }
  }

  #_flush() {
    while (this.#current) {
      const { value, next } = this.#current
      this.#process(value)
      this.#current = next
    }
    this.#last = null
  }

  async #_flushAsync() {
    while (this.#current) {
      const { value, next } = this.#current
      await this.#process(value)
      this.#current = next
    }
    this.#last = null
  }
}
