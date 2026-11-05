import { describe, it, expect } from 'vitest';
import { GenerationQueue } from '../../src/generation/queue';

describe('GenerationQueue (pure module §14.2)', () => {
  it('concurrency never exceeds 2 (assert with a counter)', async () => {
    const queue = new GenerationQueue<string>(2);
    let activeCounter = 0;
    let maxSeenActive = 0;

    const createDeferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    const d1 = createDeferred();
    const d2 = createDeferred();
    const d3 = createDeferred();
    const d4 = createDeferred();

    const makeTask = (deferred: { promise: Promise<void> }) => async () => {
      activeCounter++;
      if (activeCounter > maxSeenActive) {
        maxSeenActive = activeCounter;
      }
      await deferred.promise;
      activeCounter--;
    };

    const p1 = queue.enqueue('task1', makeTask(d1));
    const p2 = queue.enqueue('task2', makeTask(d2));
    const p3 = queue.enqueue('task3', makeTask(d3));
    const p4 = queue.enqueue('task4', makeTask(d4));

    expect(queue.activeCount).toBe(2);
    expect(queue.queuedCount).toBe(2);
    expect(maxSeenActive).toBe(2);

    d1.resolve();
    await p1;

    // After task1 resolves, task3 should be picked up
    expect(maxSeenActive).toBe(2);
    expect(queue.activeCount).toBe(2);
    expect(queue.queuedCount).toBe(1);

    d2.resolve();
    await p2;

    expect(maxSeenActive).toBe(2);

    d3.resolve();
    await p3;

    d4.resolve();
    await p4;

    expect(maxSeenActive).toBe(2);
    expect(queue.activeCount).toBe(0);
    expect(queue.queuedCount).toBe(0);
  });

  it('runs waiting jobs in strict FIFO order', async () => {
    const queue = new GenerationQueue<string>(1);
    const executionOrder: string[] = [];

    const createDeferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    const d1 = createDeferred();
    const d2 = createDeferred();
    const d3 = createDeferred();

    const p1 = queue.enqueue('first', async () => {
      executionOrder.push('start:first');
      await d1.promise;
      executionOrder.push('end:first');
    });

    const p2 = queue.enqueue('second', async () => {
      executionOrder.push('start:second');
      await d2.promise;
      executionOrder.push('end:second');
    });

    const p3 = queue.enqueue('third', async () => {
      executionOrder.push('start:third');
      await d3.promise;
      executionOrder.push('end:third');
    });

    expect(executionOrder).toEqual(['start:first']);

    d1.resolve();
    await p1;
    expect(executionOrder).toEqual(['start:first', 'end:first', 'start:second']);

    d2.resolve();
    await p2;
    expect(executionOrder).toEqual([
      'start:first',
      'end:first',
      'start:second',
      'end:second',
      'start:third',
    ]);

    d3.resolve();
    await p3;
    expect(executionOrder).toEqual([
      'start:first',
      'end:first',
      'start:second',
      'end:second',
      'start:third',
      'end:third',
    ]);
  });

  it('one failure does not cancel or stop other jobs', async () => {
    const queue = new GenerationQueue<string>(2);
    const completed: string[] = [];

    const createDeferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    const d1 = createDeferred();
    const d2 = createDeferred();

    const p1 = queue.enqueue('failing', async () => {
      throw new Error('Task 1 failed');
    });

    const p2 = queue.enqueue('succeeding1', async () => {
      await d1.promise;
      completed.push('succeeding1');
    });

    const p3 = queue.enqueue('succeeding2', async () => {
      await d2.promise;
      completed.push('succeeding2');
    });

    await expect(p1).rejects.toThrow('Task 1 failed');

    // p2 and p3 continue processing
    d1.resolve();
    await p2;
    expect(completed).toContain('succeeding1');

    d2.resolve();
    await p3;
    expect(completed).toContain('succeeding2');
  });

  it('abortAll aborts active jobs and drains queued jobs so queued jobs never start', async () => {
    const queue = new GenerationQueue<string>(1);
    let job1SignalAborted = false;
    let job2Started = false;
    let job3Started = false;

    const createDeferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    const d1 = createDeferred();

    const p1 = queue.enqueue('job1', async (signal) => {
      signal.addEventListener('abort', () => {
        job1SignalAborted = true;
      });
      await d1.promise;
    });

    const p2 = queue.enqueue('job2', async () => {
      job2Started = true;
    });

    const p3 = queue.enqueue('job3', async () => {
      job3Started = true;
    });

    expect(queue.activeCount).toBe(1);
    expect(queue.queuedCount).toBe(2);

    queue.abortAll();

    expect(job1SignalAborted).toBe(true);
    expect(queue.queuedCount).toBe(0);

    // Queued jobs should be rejected
    await expect(p2).rejects.toThrow();
    await expect(p3).rejects.toThrow();

    d1.resolve();
    await p1;

    expect(job2Started).toBe(false);
    expect(job3Started).toBe(false);
  });

  it('a job aborted while queued never starts', async () => {
    const queue = new GenerationQueue<string>(1);
    let job2Started = false;
    let job3Started = false;

    const createDeferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };

    const d1 = createDeferred();

    const p1 = queue.enqueue('job1', async () => {
      await d1.promise;
    });

    const p2 = queue.enqueue('job2', async () => {
      job2Started = true;
    });

    const p3 = queue.enqueue('job3', async () => {
      job3Started = true;
    });

    // Abort job2 while it is waiting in the queue
    queue.abort('job2');
    await expect(p2).rejects.toThrow();

    // Finish job1
    d1.resolve();
    await p1;

    // job3 should now execute, but job2 never started
    await p3;
    expect(job2Started).toBe(false);
    expect(job3Started).toBe(true);
  });

  describe('cancel and cancelAll (§14.8)', () => {
    it('cancel removes queued job without running it', async () => {
      const queue = new GenerationQueue<string>(1);
      let job2Ran = false;
      let job1Signal!: AbortSignal;

      const createDeferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        return { promise, resolve };
      };
      const d1 = createDeferred();

      const p1 = queue.enqueue('job1', async (signal) => {
        job1Signal = signal;
        await d1.promise;
      });

      const p2 = queue.enqueue('job2', async () => {
        job2Ran = true;
      });

      expect(queue.isQueued('job2')).toBe(true);
      const cancelled = queue.cancel('job2');
      expect(cancelled).toBe(true);
      expect(queue.isQueued('job2')).toBe(false);
      await expect(p2).rejects.toThrow();

      d1.resolve();
      await p1;
      expect(job1Signal.aborted).toBe(false);
      expect(job2Ran).toBe(false);
    });

    it('cancel aborts running job through its AbortController', async () => {
      const queue = new GenerationQueue<string>(2);
      let jobSignal!: AbortSignal;
      const createDeferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        return { promise, resolve };
      };
      const d = createDeferred();

      const p = queue.enqueue('runningJob', async (signal) => {
        jobSignal = signal;
        await d.promise;
      });

      expect(queue.isRunning('runningJob')).toBe(true);
      expect(jobSignal.aborted).toBe(false);

      const cancelled = queue.cancel('runningJob');
      expect(cancelled).toBe(true);
      expect(jobSignal.aborted).toBe(true);

      d.resolve();
      await p;
    });

    it('cancelAll aborts running jobs and rejects queued jobs', async () => {
      const queue = new GenerationQueue<string>(1);
      let job1Signal!: AbortSignal;
      let job2Started = false;

      const createDeferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        return { promise, resolve };
      };
      const d1 = createDeferred();

      const p1 = queue.enqueue('job1', async (signal) => {
        job1Signal = signal;
        await d1.promise;
      });

      const p2 = queue.enqueue('job2', async () => {
        job2Started = true;
      });

      expect(queue.isRunning('job1')).toBe(true);
      expect(queue.isQueued('job2')).toBe(true);

      queue.cancelAll();

      expect(job1Signal.aborted).toBe(true);
      expect(queue.isQueued('job2')).toBe(false);
      await expect(p2).rejects.toThrow();

      d1.resolve();
      await p1;
      expect(job2Started).toBe(false);
    });

    it('retains active job and cancellability when a new job with same key is enqueued while previous is settling', async () => {
      const queue = new GenerationQueue<string>(2);
      let job1ResolveSettling!: () => void;
      const job1SettlingPromise = new Promise<void>((r) => {
        job1ResolveSettling = r;
      });

      let job2Started = false;
      let job2ResolveSettling!: () => void;
      const job2SettlingPromise = new Promise<void>((r) => {
        job2ResolveSettling = r;
      });

      // Start job 1
      const p1 = queue.enqueue('task1', async (signal) => {
        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', async () => {
            await job1SettlingPromise;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      expect(queue.isRunning('task1')).toBe(true);

      // Cancel job 1 so it is aborted and begins settling
      const cancelled1 = queue.cancel('task1');
      expect(cancelled1).toBe(true);

      // Enqueue job 2 with the same key while job 1 is still settling
      const p2 = queue.enqueue('task1', async (signal) => {
        job2Started = true;
        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', async () => {
            await job2SettlingPromise;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      expect(job2Started).toBe(true);

      // Now let job 1 finish settling
      job1ResolveSettling();
      await p1.catch(() => {});

      // Assert job 2 is still running/pending and cancellable
      expect(queue.isRunning('task1')).toBe(true);
      expect(queue.isPending('task1')).toBe(true);
      expect(queue.cancel('task1')).toBe(true);

      job2ResolveSettling();
      await p2.catch(() => {});
    });
  });
});
