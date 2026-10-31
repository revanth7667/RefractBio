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
});
