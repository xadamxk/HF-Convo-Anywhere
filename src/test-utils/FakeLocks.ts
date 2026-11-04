/**
 * A Web Locks (navigator.locks) stand-in shared by the "tabs" of a test.
 * Exclusive locks only: requests for a held name wait in FIFO order;
 * `ifAvailable` gets null instead of waiting; `signal` takes a waiting
 * request out of the queue; `steal` takes a held lock at once, rejecting
 * the holder's request with an AbortError as browsers do.
 */

type Callback = (lock: { name: string } | null) => unknown;

interface Waiter {
  callback: Callback;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const abortError = () =>
  new DOMException("The request was aborted.", "AbortError");

export class FakeLocks {
  private readonly held = new Map<string, Waiter>();
  private readonly queues = new Map<string, Waiter[]>();

  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: Callback
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { callback, resolve, reject };
      if (options.signal?.aborted) {
        reject(abortError());
        return;
      }
      const queue = this.queue(name);
      if (options.steal) {
        const holder = this.held.get(name);
        this.held.delete(name);
        holder?.reject(abortError());
        this.grant(name, waiter);
        return;
      }
      if (options.ifAvailable && (this.held.has(name) || queue.length)) {
        Promise.resolve()
          .then(() => callback(null))
          .then(resolve, reject);
        return;
      }
      queue.push(waiter);
      options.signal?.addEventListener("abort", () => {
        const index = queue.indexOf(waiter);
        if (index === -1) return;
        queue.splice(index, 1);
        reject(abortError());
      });
      this.pump(name);
    });
  }

  /** Whether `name` is held. */
  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  /** How many requests wait for `name`. */
  waiting(name: string): number {
    return this.queue(name).length;
  }

  private queue(name: string): Waiter[] {
    if (!this.queues.has(name)) this.queues.set(name, []);
    return this.queues.get(name)!;
  }

  private pump(name: string): void {
    const queue = this.queue(name);
    if (!this.held.has(name) && queue.length) this.grant(name, queue.shift()!);
  }

  private grant(name: string, waiter: Waiter): void {
    this.held.set(name, waiter);
    // The lock is released when the callback's promise settles, unless it
    // was stolen first (then that request already rejected)
    const settle = (done: () => void) => {
      if (this.held.get(name) !== waiter) return;
      this.held.delete(name);
      done();
      this.pump(name);
    };
    Promise.resolve()
      .then(() => waiter.callback({ name }))
      .then(
        (value) => settle(() => waiter.resolve(value)),
        (error) => settle(() => waiter.reject(error))
      );
  }
}
