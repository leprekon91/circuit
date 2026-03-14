import { Monitor } from '../types';

export class RateLimiter {
  private current = 0;
  private queue: Array<() => void> = [];
  private reservoir: number | null = null;
  private lastRefill = Date.now();

  constructor(private maxConcurrent = 10, reservoir?: number, private reservoirRefreshIntervalMs = 60000, private reservoirRefreshAmount = 0, private monitor?: Monitor) {
    this.reservoir = reservoir ?? null;
  }

  private refillIfNeeded() {
    if (this.reservoir === null) return;
    const now = Date.now();
    if (now - this.lastRefill >= this.reservoirRefreshIntervalMs) {
      this.reservoir = (this.reservoir ?? 0) + this.reservoirRefreshAmount;
      this.lastRefill = now;
      this.monitor?.({ type: 'rate.refill', payload: { reservoir: this.reservoir } });
    }
  }

  public async schedule<T>(fn: () => Promise<T>): Promise<T> {
    this.refillIfNeeded();

    if (this.reservoir !== null && this.reservoir <= 0) {
      this.monitor?.({ type: 'rate.reservoir_exhausted', payload: {} });
      return Promise.reject(new Error('Rate limiter: reservoir exhausted'));
    }

    if (this.current < this.maxConcurrent) {
      this.current++;
      if (this.reservoir !== null) this.reservoir!--;
      this.monitor?.({ type: 'rate.acquire', payload: { current: this.current } });
      try {
        const res = await fn();
        return res;
      } finally {
        this.current--;
        this.monitor?.({ type: 'rate.release', payload: { current: this.current } });
        this.next();
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.monitor?.({ type: 'rate.queued', payload: { queueLength: this.queue.length } });
        this.schedule(fn).then(resolve).catch(reject);
      });
    });
  }

  private next() {
    const job = this.queue.shift();
    if (job) job();
  }
}
