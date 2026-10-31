import { MAX_CONCURRENT_GENERATIONS } from '../config';

export interface QueueJob<TKey> {
  key: TKey;
  run: (signal: AbortSignal) => Promise<void>;
  controller: AbortController;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export interface ActiveJob<TKey> {
  key: TKey;
  controller: AbortController;
}

/**
 * Pure concurrency queue for generation tasks per SPEC §14.2.
 * - Concurrency capped at MAX_CONCURRENT_GENERATIONS (default 2).
 * - FIFO ordering for waiting jobs.
 * - One failure never cancels or stops other running or queued jobs.
 * - Individual per-job AbortControllers so jobs can be aborted individually.
 * - abortAll() cancels both active and queued jobs; queued jobs never execute.
 * - No setTimeout-based logic; purely promise- and event-driven.
 */
export class GenerationQueue<TKey = string> {
  private readonly concurrency: number;
  private readonly activeJobs = new Map<TKey, ActiveJob<TKey>>();
  private readonly waitingQueue: QueueJob<TKey>[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(concurrency: number = MAX_CONCURRENT_GENERATIONS) {
    this.concurrency = concurrency;
  }

  public get activeCount(): number {
    return this.activeJobs.size;
  }

  public get queuedCount(): number {
    return this.waitingQueue.length;
  }

  public get totalPending(): number {
    return this.activeCount + this.queuedCount;
  }

  public isRunning(key: TKey): boolean {
    return this.activeJobs.has(key);
  }

  public isQueued(key: TKey): boolean {
    return this.waitingQueue.some((job) => job.key === key);
  }

  public isPending(key: TKey): boolean {
    return this.isRunning(key) || this.isQueued(key);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Enqueues a job with a key and run function.
   * If a job with the same key is already running or queued, it is aborted and replaced.
   */
  public enqueue(
    key: TKey,
    run: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    // If already active or queued for this key, abort previous job first (§14.2)
    if (this.isPending(key)) {
      this.abort(key);
    }

    const controller = new AbortController();

    return new Promise<void>((resolve, reject) => {
      const job: QueueJob<TKey> = {
        key,
        run,
        controller,
        resolve,
        reject,
      };

      if (this.activeJobs.size < this.concurrency) {
        this.startJob(job);
      } else {
        this.waitingQueue.push(job);
        this.notify();
      }
    });
  }

  private startJob(job: QueueJob<TKey>): void {
    const { key, run, controller, resolve, reject } = job;
    this.activeJobs.set(key, { key, controller });
    this.notify();

    // Run the job asynchronously without blocking
    (async () => {
      try {
        await run(controller.signal);
        this.activeJobs.delete(key);
        resolve();
      } catch (err: unknown) {
        this.activeJobs.delete(key);
        reject(err);
      } finally {
        this.pump();
      }
    })();
  }

  private pump(): void {
    while (this.activeJobs.size < this.concurrency && this.waitingQueue.length > 0) {
      const nextJob = this.waitingQueue.shift()!;
      this.startJob(nextJob);
    }
    this.notify();
  }

  /**
   * Aborts an individual job by key.
   * If running, its AbortController is aborted.
   * If queued, it is aborted and removed from the queue so it never runs.
   */
  public abort(key: TKey): void {
    // Check waiting queue
    const queuedIndex = this.waitingQueue.findIndex((job) => job.key === key);
    if (queuedIndex !== -1) {
      const [queuedJob] = this.waitingQueue.splice(queuedIndex, 1);
      queuedJob.controller.abort();
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      queuedJob.reject(abortError);
      this.notify();
      return;
    }

    // Check active jobs
    const active = this.activeJobs.get(key);
    if (active) {
      active.controller.abort();
      this.notify();
    }
  }

  /**
   * Aborts all in-flight and queued jobs.
   * Queued jobs are rejected and never execute.
   */
  public abortAll(): void {
    // Abort and drain queued jobs
    while (this.waitingQueue.length > 0) {
      const queuedJob = this.waitingQueue.shift()!;
      queuedJob.controller.abort();
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      queuedJob.reject(abortError);
    }

    // Abort active jobs
    for (const active of this.activeJobs.values()) {
      active.controller.abort();
    }

    this.notify();
  }
}
