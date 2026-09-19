import { describe, expect, it } from 'vitest';

import { createTaskQueue } from '../../src/core/queue';

/** Lets queued microtasks (the pump starting tasks) run before the assertion. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const noSleep = (): Promise<void> => Promise.resolve();

describe('createTaskQueue', () => {
  it('never runs more than the concurrency cap at once', async () => {
    const queue = createTaskQueue({ concurrency: 2, spacingMs: 0, sleep: noSleep });

    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    const task = (): Promise<void> =>
      new Promise((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });

    const added = [
      queue.add('a', task),
      queue.add('b', task),
      queue.add('c', task),
      queue.add('d', task),
    ];
    await flush();

    // Only the cap is running; the rest wait for a slot.
    expect(peak).toBe(2);
    expect(releases).toHaveLength(2);

    while (releases.length > 0) {
      releases.shift()?.();
      await flush();
    }
    await Promise.all(added);

    expect(peak).toBe(2);
  });

  it('separates task starts by at least the configured spacing', async () => {
    const starts: number[] = [];
    let clock = 0;
    const queue = createTaskQueue({
      concurrency: 1,
      spacingMs: 300,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });

    const task = (): Promise<void> => {
      starts.push(clock);
      return Promise.resolve();
    };

    await Promise.all([queue.add('a', task), queue.add('b', task), queue.add('c', task)]);

    // The first starts immediately; each later start advances the injected clock by the spacing.
    expect(starts).toEqual([0, 300, 600]);
  });

  it('defaults to two in flight and 300 ms spacing when created with no options', async () => {
    const delays: number[] = [];
    const queue = createTaskQueue({
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });

    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    const task = (): Promise<void> =>
      new Promise((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });

    const added = [queue.add('a', task), queue.add('b', task), queue.add('c', task)];
    await flush();

    // Default concurrency is 2: two tasks run, the third waits for a free slot.
    expect(peak).toBe(2);
    expect(releases).toHaveLength(2);
    // Default spacing is 300 ms: the one non-first start so far waited exactly that.
    expect(delays).toEqual([300]);

    while (releases.length > 0) {
      releases.shift()?.();
      await flush();
    }
    await Promise.all(added);

    // The third start was spaced by the same default, and the cap never rose above 2.
    expect(delays).toEqual([300, 300]);
    expect(peak).toBe(2);
  });

  it('starts tasks in the order they were added (FIFO)', async () => {
    const order: number[] = [];
    const queue = createTaskQueue({ concurrency: 2, spacingMs: 0, sleep: noSleep });

    const task = (n: number) => (): Promise<void> => {
      order.push(n);
      return Promise.resolve();
    };

    await Promise.all([1, 2, 3, 4, 5].map((n) => queue.add(`t${n}`, task(n))));

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('forwards a task rejection to the caller without stalling the queue', async () => {
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });
    const order: string[] = [];

    const failing = queue.add('failing', () => {
      order.push('failing');
      return Promise.reject(new Error('boom'));
    });
    const following = queue.add('following', () => {
      order.push('following');
      return Promise.resolve();
    });

    await expect(failing).rejects.toThrow('boom');
    await following;

    expect(order).toEqual(['failing', 'following']);
  });

  it('reports idle only once every queued task has settled', async () => {
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });
    let finished = 0;

    void queue.add('a', () => {
      finished += 1;
      return Promise.resolve();
    });
    void queue.add('b', () => {
      finished += 1;
      return Promise.resolve();
    });

    await queue.idle();

    expect(finished).toBe(2);
  });
});

describe('createTaskQueue.prioritize', () => {
  /** A task that records its start and stays in flight until the returned release is called. */
  function inFlightTask(order: string[], releases: Array<() => void>) {
    return (key: string) => (): Promise<void> =>
      new Promise((resolve) => {
        order.push(key);
        releases.push(resolve);
      });
  }

  it('moves a pending task to the front, ahead of the ones queued before it', async () => {
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });
    const task = inFlightTask(order, releases);

    void queue.add('a', task('a'));
    await flush();
    void queue.add('b', task('b'));
    void queue.add('c', task('c'));
    void queue.add('d', task('d'));
    await flush();

    // Pending is [b, c, d]; promoting d moves it to the front of the pending list.
    queue.prioritize('d');

    while (releases.length > 0) {
      releases.shift()?.();
      await flush();
    }
    await queue.idle();

    // a was already running; d jumps ahead of b and c, which is the whole point of promotion.
    expect(order).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a silent no-op for a task that is already in flight', async () => {
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });
    const task = inFlightTask(order, releases);

    void queue.add('a', task('a'));
    await flush();
    void queue.add('b', task('b'));
    void queue.add('c', task('c'));
    await flush();

    // 'a' has started and cannot be called back, so promoting it changes nothing.
    queue.prioritize('a');

    while (releases.length > 0) {
      releases.shift()?.();
      await flush();
    }
    await queue.idle();

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for an unknown key', async () => {
    const order: string[] = [];
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });

    void queue.add('a', () => {
      order.push('a');
      return Promise.resolve();
    });
    void queue.add('b', () => {
      order.push('b');
      return Promise.resolve();
    });

    expect(() => {
      queue.prioritize('never-added');
    }).not.toThrow();

    await queue.idle();

    expect(order).toEqual(['a', 'b']);
  });

  it('throws, naming the key, when the same key is added again', async () => {
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });
    let release!: () => void;

    void queue.add('dup', () => new Promise<void>((resolve) => (release = resolve)));
    await flush();

    // 'dup' is in flight: adding it again is a programming error, not a silent no-op.
    expect(() => queue.add('dup', () => Promise.resolve())).toThrow(/dup/);

    release();
    await queue.idle();
  });

  it('throws, naming the key, when a queued key is added again', async () => {
    const queue = createTaskQueue({ concurrency: 1, spacingMs: 0, sleep: noSleep });
    let release!: () => void;

    void queue.add('first', () => new Promise<void>((resolve) => (release = resolve)));
    await flush();
    // 'second' is only queued, never started, and still counts as a duplicate.
    void queue.add('second', () => Promise.resolve());

    expect(() => queue.add('second', () => Promise.resolve())).toThrow(/second/);

    release();
    await queue.idle();
  });

  it('keeps the concurrency cap and the spacing while promotion is in play', async () => {
    const starts: Array<{ key: string; clock: number }> = [];
    let clock = 0;
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const queue = createTaskQueue({
      concurrency: 2,
      spacingMs: 300,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    const task = (key: string) => (): Promise<void> =>
      new Promise((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        starts.push({ key, clock });
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });

    const added = ['a', 'b', 'c', 'd'].map((key) => queue.add(key, task(key)));
    await flush();

    // Two in flight (the cap), c and d still pending; promote d past c.
    expect(peak).toBe(2);
    expect(starts.map((start) => start.key)).toEqual(['a', 'b']);
    queue.prioritize('d');

    while (releases.length > 0) {
      releases.shift()?.();
      await flush();
    }
    await Promise.all(added);

    // d jumped c, the cap held at 2, and every start was spaced by the configured 300 ms.
    expect(peak).toBe(2);
    expect(starts.map((start) => start.key)).toEqual(['a', 'b', 'd', 'c']);
    expect(starts.map((start) => start.clock)).toEqual([0, 300, 600, 900]);
  });
});
