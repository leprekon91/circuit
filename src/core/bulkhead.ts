import { Monitor } from '../types';

type PoolKey = string;

class Pool {
  public current = 0;
  public queue: Array<() => void> = [];
  public lastUsed = Date.now();

  constructor(
    private limit: number,
    private queueLimit: number,
    private monitor?: Monitor,
    private key?: PoolKey,
  ) {}

  touch() {
    this.lastUsed = Date.now();
  }

  isIdle(idleTimeoutMs: number) {
    return (
      Date.now() - this.lastUsed > idleTimeoutMs && this.current === 0 && this.queue.length === 0
    );
  }

  private next() {
    if (this.current >= this.limit) return;
    const job = this.queue.shift();
    if (!job) return;
    this.monitor?.({
      type: 'bulkhead.dequeue',
      payload: { key: this.key, queueLength: this.queue.length },
    });
    job();
  }

  public async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.touch();
    if (this.current < this.limit) {
      this.current++;
      this.monitor?.({
        type: 'bulkhead.acquire',
        payload: { key: this.key, current: this.current },
      });
      try {
        return await fn();
      } finally {
        this.current--;
        this.touch();
        this.monitor?.({
          type: 'bulkhead.release',
          payload: { key: this.key, current: this.current },
        });
        this.next();
      }
    }

    if (this.queue.length < this.queueLimit) {
      return new Promise<T>((resolve, reject) => {
        this.queue.push(() => {
          // Re-enter exec; current is below limit at this point so the slot is acquired immediately.
          this.exec(fn).then(resolve).catch(reject);
        });
        this.touch();
        this.monitor?.({
          type: 'bulkhead.queued',
          payload: { key: this.key, queueLength: this.queue.length },
        });
      });
    }

    this.monitor?.({
      type: 'bulkhead.reject',
      payload: { key: this.key, queueLength: this.queue.length },
    });
    return Promise.reject(new Error('Bulkhead: queue limit exceeded'));
  }
}

export class Bulkhead {
  private globalPool: Pool;
  private pools: Map<PoolKey, Pool> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private limit = 10,
    private queueLimit = Infinity,
    private monitor?: Monitor,
    private opts?: {
      keyed?: boolean;
      idleTimeoutMs?: number;
      maxKeys?: number;
      keyFn?: () => string;
    },
  ) {
    this.globalPool = new Pool(limit, queueLimit, monitor, undefined);
    if (this.opts?.keyed && this.opts.idleTimeoutMs) this.startCleanup();
  }

  private startCleanup() {
    const interval = Math.max(1000, this.opts!.idleTimeoutMs!);
    if (this.cleanupTimer) return;
    const timer = setInterval(() => this.cleanupOnce(), interval);
    (timer as unknown as { unref?: () => void }).unref?.();
    this.cleanupTimer = timer;
  }

  private stopCleanup() {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private cleanupOnce() {
    if (!this.opts) return;
    const idleTimeout = this.opts.idleTimeoutMs ?? 60_000;
    for (const [key, pool] of this.pools.entries()) {
      if (pool.isIdle(idleTimeout)) {
        this.pools.delete(key);
        this.monitor?.({ type: 'bulkhead.cleanup', payload: { key } });
      }
    }
    // stop timer if no keyed pools left
    if (this.pools.size === 0) this.stopCleanup();
  }

  private ensurePoolForKey(key?: PoolKey): Pool {
    if (!this.opts?.keyed) return this.globalPool;

    if (key == null && this.opts.keyFn) {
      try {
        key = this.opts.keyFn();
      } catch (err) {
        // fall back to global pool on key extraction failure
        this.monitor?.({ type: 'bulkhead.key_error', payload: { error: String(err) } });
        return this.globalPool;
      }
    }

    if (key == null) return this.globalPool;

    const existing = this.pools.get(key);
    if (existing) return existing;

    // enforce maxKeys by evicting idle pools first
    const max = this.opts.maxKeys ?? 1000;
    if (this.pools.size >= max) {
      // try to remove any idle pool
      const idleTimeout = this.opts.idleTimeoutMs ?? 60_000;
      for (const [k, p] of this.pools.entries()) {
        if (p.isIdle(idleTimeout)) {
          this.pools.delete(k);
          this.monitor?.({ type: 'bulkhead.evict', payload: { key: k } });
          break;
        }
      }
      if (this.pools.size >= max) {
        throw new Error('Bulkhead: max keyed pools exceeded');
      }
    }

    const pool = new Pool(this.limit, this.queueLimit, this.monitor, key);
    this.pools.set(key, pool);
    if (this.opts.idleTimeoutMs) this.startCleanup();
    return pool;
  }

  public async exec<T>(
    keyOrFn: string | (() => Promise<T>),
    maybeFn?: () => Promise<T>,
  ): Promise<T> {
    let key: string | undefined;
    let fn: () => Promise<T>;
    if (typeof keyOrFn === 'string') {
      key = keyOrFn;
      if (!maybeFn) throw new Error('Bulkhead.exec requires a function when a key is provided');
      fn = maybeFn;
    } else {
      fn = keyOrFn as () => Promise<T>;
    }

    const pool = this.ensurePoolForKey(key);
    return pool.exec(fn);
  }

  // allow manual shutdown/cleanup
  public shutdown() {
    this.stopCleanup();
    this.pools.clear();
  }
}
