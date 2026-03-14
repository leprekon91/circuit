import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrap, Bulkhead, RateLimiter } from '..';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Returns a vi.fn() that fails the first `failCount` calls then resolves with `value`. */
function flakyFn<T>(failCount: number, value: T) {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (calls <= failCount) throw new Error(`fail #${calls}`);
    return value;
  });
}

/** Advance fake timers and drain all pending microtasks / macrotasks. */
async function flush(ms = 500) {
  vi.advanceTimersByTime(ms);
  await vi.runAllTimersAsync();
}

// ---------------------------------------------------------------------------
// passthrough — no options
// ---------------------------------------------------------------------------

describe('wrap() — no options', () => {
  it('returns the fn value', async () => {
    await expect(wrap(() => Promise.resolve('hello'))).resolves.toBe('hello');
  });

  it('propagates fn rejection', async () => {
    await expect(wrap(() => Promise.reject(new Error('oops')))).rejects.toThrow('oops');
  });
});

// ---------------------------------------------------------------------------
// retry
// ---------------------------------------------------------------------------

describe('wrap() — retry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('retries until fn succeeds and resolves with the correct value', async () => {
    const fn = flakyFn(2, 'recovered');
    const p = wrap(fn, { retry: { retries: 3, minDelayMs: 10, maxDelayMs: 10, factor: 1 } });
    await flush();
    await expect(p).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3); // 2 failures + 1 success
  });

  it('rejects with the last error after exhausting all retries', async () => {
    const fn = flakyFn(99, 'never');
    const p = wrap(fn, { retry: { retries: 2, minDelayMs: 10, maxDelayMs: 10, factor: 1 } });
    void p.catch(() => {});
    await flush();
    // retry rethrows the most recent (last) error — fail #3 after 1 initial + 2 retries
    await expect(p).rejects.toThrow('fail #3');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('uses top-level monitor when retry.monitor is absent', async () => {
    const events: string[] = [];
    const fn = flakyFn(1, 'ok');
    const p = wrap(fn, {
      retry: { retries: 2, minDelayMs: 5, factor: 1 },
      monitor: (e) => events.push(e.type),
    });
    await flush();
    await expect(p).resolves.toBe('ok');
    expect(events.some((t) => t.startsWith('retry.'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// circuit breaker × retry interaction
//
// Because the circuit breaker is the innermost layer (fn → circuit → retry),
// every individual retry attempt increments the circuit's failure counter.
// Once the threshold is hit, the circuit opens and remaining retry attempts see
// "Circuit is open" instead of calling fn again.
// ---------------------------------------------------------------------------

describe('wrap() — circuit breaker (interacts with retry)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('circuit opens after failureThreshold retries and fn is not called again', async () => {
    // failureThreshold=2: trips after 2 failed attempts.
    // retries=4: up to 5 total attempts.
    // Expected: fn called exactly 2 times, then circuit opens, final error = "Circuit is open".
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    const p = wrap(fn, {
      circuit: { failureThreshold: 2, timeoutMs: 60_000 },
      retry: { retries: 4, minDelayMs: 10, maxDelayMs: 10, factor: 1 },
    });
    void p.catch(() => {});
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p).rejects.toThrow('Circuit is open');
  });

  it('emits circuit.trip event through the top-level monitor', async () => {
    const events: string[] = [];
    const fn = vi.fn().mockRejectedValue(new Error('err'));
    const p = wrap(fn, {
      circuit: { failureThreshold: 2, timeoutMs: 60_000 },
      retry: { retries: 3, minDelayMs: 5, maxDelayMs: 5, factor: 1 },
      monitor: (e) => events.push(e.type),
    });
    void p.catch(() => {});
    await flush();
    expect(events).toContain('circuit.trip');
  });

  it('circuit threshold=3: fn called exactly 3 times regardless of higher retry count', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const p = wrap(fn, {
      circuit: { failureThreshold: 3, timeoutMs: 60_000 },
      retry: { retries: 10, minDelayMs: 5, maxDelayMs: 5, factor: 1 },
    });
    void p.catch(() => {});
    await flush(2000);
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(p).rejects.toThrow('Circuit is open');
  });

  it('circuit per wrap() call: successive wrap() calls each start with a fresh closed circuit', async () => {
    // Each wrap() creates a new CircuitBreaker, so failures in one call do not affect the next.
    const events1: string[] = [];
    const events2: string[] = [];
    const alwaysFails = vi.fn().mockRejectedValue(new Error('fail'));

    const p1 = wrap(alwaysFails, {
      circuit: { failureThreshold: 1, timeoutMs: 60_000 },
      monitor: (e) => events1.push(e.type),
    });
    void p1.catch(() => {});
    await flush();
    expect(events1).toContain('circuit.trip');

    // Second wrap() call — circuit is brand new, starts CLOSED
    const p2 = wrap(alwaysFails, {
      circuit: { failureThreshold: 1, timeoutMs: 60_000 },
      monitor: (e) => events2.push(e.type),
    });
    void p2.catch(() => {});
    await flush();
    // circuit.reject only fires when the circuit is already OPEN at call time,
    // so a fresh circuit will trip but won't reject on the first attempt
    expect(events2).toContain('circuit.failure');
  });
});

// ---------------------------------------------------------------------------
// bulkhead
// ---------------------------------------------------------------------------

describe('wrap() — bulkhead', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves normally within the concurrency limit', async () => {
    const p = wrap(() => Promise.resolve('ok'), { bulkhead: { limit: 1 } });
    await flush(10);
    await expect(p).resolves.toBe('ok');
  });

  it('shared Bulkhead instance: second call is rejected when slot is busy and queueLimit=0', async () => {
    const bh = new Bulkhead(1, 0); // one slot, no queue

    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });

    const p1 = wrap(() => blocker.then(() => 'p1'), { bulkhead: bh });
    // p1 holds the only slot; p2 should be rejected immediately
    const p2 = wrap(() => Promise.resolve('p2'), { bulkhead: bh });
    void p2.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(p2).rejects.toThrow('Bulkhead: queue limit exceeded');

    release();
    await vi.runAllTimersAsync();
    await expect(p1).resolves.toBe('p1');
    bh.shutdown();
  });

  it('options object: each wrap() call gets its own bulkhead — they do NOT contend', async () => {
    // Passing options (not an instance) creates a fresh Bulkhead per wrap() call,
    // so two concurrent calls with limit=1, queueLimit=0 do NOT interfere with each other.
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });

    const opts = { bulkhead: { limit: 1, queueLimit: 0 } };
    const p1 = wrap(() => blocker.then(() => 'p1'), opts);
    const p2 = wrap(() => Promise.resolve('p2'), opts); // own pool → no contention

    await vi.runAllTimersAsync();
    await expect(p2).resolves.toBe('p2');

    release();
    await vi.runAllTimersAsync();
    await expect(p1).resolves.toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// rate limiter
// ---------------------------------------------------------------------------

describe('wrap() — rate limiter', () => {
  it('processes all calls and resolves each one', async () => {
    const order: number[] = [];
    const calls = [1, 2, 3].map((id) =>
      wrap(
        async () => {
          order.push(id);
          return id;
        },
        { rateLimit: { maxConcurrent: 2 } },
      ),
    );
    const results = await Promise.all(calls);
    expect(results).toEqual([1, 2, 3]);
  });

  it('uses top-level monitor when rateLimit.monitor is absent', async () => {
    const events: string[] = [];
    await wrap(() => Promise.resolve(1), {
      rateLimit: { maxConcurrent: 1 },
      monitor: (e) => events.push(e.type),
    });
    expect(events).toContain('rate.acquire');
    expect(events).toContain('rate.release');
  });

  it('rejects when reservoir is exhausted', async () => {
    // reservoir=0 means no tokens at all — first call is rejected immediately
    await expect(
      wrap(() => Promise.resolve('x'), {
        rateLimit: { maxConcurrent: 10, reservoir: 0 },
      }),
    ).rejects.toThrow('reservoir exhausted');
  });
});

// ---------------------------------------------------------------------------
// pipeline ordering
// ---------------------------------------------------------------------------

describe('wrap() — pipeline ordering', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /**
   * Critical: bulkhead slot must NOT be held while a job waits in the rate-limiter queue.
   *
   * Setup: shared Bulkhead(limit=1, queueLimit=0) + RateLimiter(maxConcurrent=1).
   *
   * Correct order (our impl — rate limiter outermost):
   *   Both p1 and p2 enter the rate-limiter queue.
   *   p1 runs first → acquires bulkhead slot → fn → releases slot.
   *   p2 was waiting in limiter queue (never touching bulkhead) → runs → acquires slot → fn.
   *   Both resolve. ✓
   *
   * Wrong order (bulkhead outermost):
   *   p1 acquires bulkhead slot → enters rate-limiter.
   *   p2 immediately tries bulkhead → slot busy, queueLimit=0 → REJECTED. ✗
   */
  it('bulkhead slot is NOT held while waiting in the rate-limiter queue', async () => {
    // Shared instances so both wrap() calls contend on the same limiter and bulkhead.
    const limiter = new RateLimiter(1); // maxConcurrent=1
    const bh = new Bulkhead(1, 0);     // one slot, no bulkhead queue
    const opts = { bulkhead: bh, rateLimit: limiter };

    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });

    const p1 = wrap(() => blocker.then(() => 'p1'), opts);
    const p2 = wrap(() => Promise.resolve('p2'), opts);

    // p1 is running (inside blocker); p2 is queued in the rate limiter, NOT touching the bulkhead.
    await vi.runAllTimersAsync();

    release();
    vi.advanceTimersByTime(10);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('p1');
    await expect(p2).resolves.toBe('p2'); // would have been REJECTED if ordering were wrong
    bh.shutdown();
  });

  it('retry wraps circuit: fn is only called failureThreshold times regardless of retry count', async () => {
    // Verifies circuit is INSIDE retry (not outside): the retry loop calls
    // `circuit.exec(fn)` on each attempt, so the circuit accumulates one failure per attempt.
    // With failureThreshold=3 and retries=10, fn is called exactly 3 times.
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const p = wrap(fn, {
      circuit: { failureThreshold: 3, timeoutMs: 60_000 },
      retry: { retries: 10, minDelayMs: 5, maxDelayMs: 5, factor: 1 },
    });
    void p.catch(() => {});
    await flush(2000);
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(p).rejects.toThrow('Circuit is open');
  });
});

// ---------------------------------------------------------------------------
// all mechanisms combined
// ---------------------------------------------------------------------------

describe('wrap() — all mechanisms combined', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves when fn eventually succeeds', async () => {
    const bh = new Bulkhead(5, 10);
    const fn = flakyFn(1, 'done');
    const p = wrap(fn, {
      circuit: { failureThreshold: 5, timeoutMs: 5_000 },
      retry: { retries: 3, minDelayMs: 10, maxDelayMs: 10, factor: 1 },
      bulkhead: bh,
      rateLimit: { maxConcurrent: 5 },
    });
    await flush(500);
    await expect(p).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(2); // 1 failure + 1 success
    bh.shutdown();
  });

  it('all mechanism events flow through the top-level monitor', async () => {
    const events: string[] = [];
    const monitor = (e: { type: string }) => events.push(e.type);
    const bh = new Bulkhead(5, 10, monitor);
    const fn = flakyFn(1, 'ok');
    const p = wrap(fn, {
      circuit: { failureThreshold: 5, timeoutMs: 5_000 },
      retry: { retries: 2, minDelayMs: 5, maxDelayMs: 5, factor: 1 },
      bulkhead: bh,
      rateLimit: { maxConcurrent: 5 },
      monitor,
    });
    await flush(200);
    await expect(p).resolves.toBe('ok');
    expect(events.some((t) => t.startsWith('retry.'))).toBe(true);
    expect(events.some((t) => t.startsWith('circuit.'))).toBe(true);
    expect(events.some((t) => t.startsWith('bulkhead.'))).toBe(true);
    expect(events.some((t) => t.startsWith('rate.'))).toBe(true);
    bh.shutdown();
  });
});

