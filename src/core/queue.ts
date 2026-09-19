/**
 * The bounded prefetch queue (D-004): at most `concurrency` tasks in flight, at least `spacingMs`
 * between task starts, FIFO start order, no retries. A task that rejects does not stall the queue
 * and its rejection reaches the caller of `add`. Keys name the tasks so a caller can `prioritize`
 * a still-pending one to the front; a task already in flight cannot be called back, so it is a
 * silent no-op.
 */
export interface QueueOptions {
  concurrency?: number;
  spacingMs?: number;
  /** Injectable so tests run instantly and deterministically instead of on the clock. */
  sleep?: (ms: number) => Promise<void>;
}

export interface TaskQueue {
  /** Keys are unique; adding a key that is already queued or in flight is a programming error. */
  add(key: string, task: () => Promise<void>): Promise<void>;
  /** Moves a *pending* task to the front. A no-op once it has started, or if the key is unknown. */
  prioritize(key: string): void;
  idle(): Promise<void>;
}

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_SPACING_MS = 300;

interface QueuedTask {
  key: string;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createTaskQueue(options: QueueOptions = {}): TaskQueue {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const spacingMs = Math.max(0, options.spacingMs ?? DEFAULT_SPACING_MS);
  const sleep = options.sleep ?? wait;

  const queued: QueuedTask[] = [];
  /** Every key that is currently queued or in flight, so a duplicate `add` is caught. */
  const knownKeys = new Set<string>();
  const slotWaiters: Array<() => void> = [];
  const idleWaiters: Array<() => void> = [];
  let inFlight = 0;
  let startedAny = false;
  let draining = false;

  function isIdle(): boolean {
    return !draining && inFlight === 0 && queued.length === 0;
  }

  function settleIdle(): void {
    if (!isIdle()) return;
    for (const resolve of idleWaiters.splice(0)) resolve();
  }

  function releaseSlot(): void {
    slotWaiters.shift()?.();
  }

  function start(task: QueuedTask): void {
    inFlight += 1;
    void (async () => {
      try {
        await task.run();
        task.resolve();
      } catch (cause) {
        task.reject(cause);
      } finally {
        inFlight -= 1;
        knownKeys.delete(task.key);
        releaseSlot();
        settleIdle();
      }
    })();
  }

  /**
   * Single pump loop: it starts tasks one at a time in queue order, so FIFO order and the spacing
   * between starts both hold by construction. A rejected task never reaches the loop — `start`
   * forwards its rejection to the caller and the loop keeps going. `prioritize` only reorders the
   * pending list, so it cannot break the cap or the spacing.
   */
  async function pump(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queued.length > 0) {
        while (inFlight >= concurrency) {
          await new Promise<void>((resolve) => slotWaiters.push(resolve));
        }
        if (startedAny && spacingMs > 0) {
          await sleep(spacingMs);
        }
        const task = queued.shift();
        if (task === undefined) break;
        startedAny = true;
        start(task);
      }
    } finally {
      draining = false;
      settleIdle();
    }
  }

  return {
    add(key, task) {
      if (knownKeys.has(key)) {
        throw new Error(`task queue already holds a task for key "${key}"`);
      }
      knownKeys.add(key);

      return new Promise<void>((resolve, reject) => {
        queued.push({ key, run: task, resolve, reject });
        void pump();
      });
    },
    prioritize(key) {
      const index = queued.findIndex((task) => task.key === key);
      // Index 0 is already at the front and -1 is not pending (started, or never queued): a no-op.
      // A task in flight is not in `queued`, so it is a no-op too.
      if (index <= 0) return;

      const [task] = queued.splice(index, 1);
      if (task !== undefined) queued.unshift(task);
    },
    idle() {
      if (isIdle()) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    },
  };
}
