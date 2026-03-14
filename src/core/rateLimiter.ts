import { Monitor } from '../types';

export class RateLimiter {
  private current = 0;
  private queue: Array<() => void> = [];
  private reservoir: number | null = null;
  private lastRefill = Date.now();

  constructor(
    private maxConcurrent = 10,
    reservoir?: number,
    private reservoirRefreshIntervalMs = 60000,
    private reservoirRefreshAmount = 0,
    private reservoirMax?: number,
    private monitor?: Monitor,
  ) {
    this.reservoir = reservoir ?? null;
  }

  private refillIfNeeded() {
    if (this.reservoir === null) return;

    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.reservoirRefreshIntervalMs) {
      // Credit all fully elapsed intervals so a long idle period catches up.
      const intervals = Math.floor(elapsed / this.reservoirRefreshIntervalMs);
      const added = this.reservoirRefreshAmount * intervals;
      // `refillIfNeeded` returns early when `reservoir` is null, so the non-null assertion is safe.
      let next = this.reservoir! + added;

      if (this.reservoirMax !== undefined) {
        next = Math.min(next, this.reservoirMax);
      }

      this.reservoir = next;
      // Advance lastRefill by whole intervals so the next window starts from the correct boundary.
      this.lastRefill += intervals * this.reservoirRefreshIntervalMs;
      this.monitor?.({ type: 'rate.refill', payload: { reservoir: this.reservoir } });
    }
  }

  public async schedule<T>(fn: () => Promise<T>): Promise<T> {
    this.refillIfNeeded();

    if (this.reservoir !== null && this.reservoir <= 0) {
      this.monitor?.({ type: 'rate.reservoir_exhausted', payload: {} });
      return Promise.reject(new Error('Rate limiter: reservoir exhausted'));
    }

    // Reserve the reservoir token up-front, before deciding to run or queue.
    // This prevents a queued job from seeing "reservoir exhausted" when it is finally
    // dequeued, even though it was accepted while tokens were available.
    if (this.reservoir !== null) this.reservoir--;

    if (this.current < this.maxConcurrent) {
      return this.run(fn);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.monitor?.({ type: 'rate.dequeue', payload: { queueLength: this.queue.length } });
        // Use run() directly — reservoir was already reserved at queue time.
        this.run(fn).then(resolve).catch(reject);
      });
      this.monitor?.({ type: 'rate.queued', payload: { queueLength: this.queue.length } });
    });
  }

  /** Execute fn immediately, assuming a slot is available. Does not touch the reservoir. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.current++;
    this.monitor?.({ type: 'rate.acquire', payload: { current: this.current } });
    try {
      return await fn();
    } finally {
      this.current--;
      this.monitor?.({ type: 'rate.release', payload: { current: this.current } });
      this.next();
    }
  }

  private next() {
    const job = this.queue.shift();
    if (job) job();
  }
}
