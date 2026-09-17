interface QueueItem<V, P extends Record<string, any> = Record<string, any>> {
  value: V
  payload: P | undefined
  next: QueueItem<V, P> | null
}
type ProcessFn<V, P extends Record<string, any> = Record<string, any>> =
  (value: V, payload?: P) => void

export class MailBox<V, P extends Record<string, any> = Record<string, any>> {
  #isActive = false
  #current: QueueItem<V, P> | null = null
  #last: QueueItem<V, P> | null = null
  #process!: ProcessFn<V, P>
  #flush!: () => void

  constructor(process: ProcessFn<V, P>, isAsync = false) {
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

  enqueue(value: V, payload?: P) {
    const newElement = { value, payload, next: null }
    if (this.#current) {
      this.#last!.next = newElement
      this.#last = newElement
      return
    }
    this.#current = newElement
    this.#last = newElement
    if (this.#isActive) {
      this.#flush()
    }
  }

  #_flush() {
    while (this.#current) {
      const { value, payload } = this.#current
      this.#process(value, payload)
      this.#current = this.#current.next
    }
    this.#last = null
  }

  async #_flushAsync() {
    while (this.#current) {
      const { value, payload } = this.#current
      await this.#process(value, payload)
      this.#current = this.#current.next
    }
    this.#last = null
  }
}
