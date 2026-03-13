import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrap } from '..';

describe('wrap combined behaviors', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retry + circuit + rate together for a single invocation', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return 'done';
    };

    const p = wrap(fn, { retry: { retries: 2, minDelayMs: 10, factor: 1 }, circuit: { failureThreshold: 3, timeoutMs: 1000 }, rateLimit: { maxConcurrent: 1 } });

    vi.advanceTimersByTime(20);
    await vi.runAllTimersAsync();

    await expect(p).resolves.toBe('done');
  });

  it('sequential wrap calls do not share circuit or rate limiter state', async () => {
    let callsA = 0;
    const a = async () => {
      callsA++;
      if (callsA < 2) throw new Error('a-fail');
      return 'a';
    };

    let callsB = 0;
    const b = async () => {
      callsB++;
      if (callsB < 2) throw new Error('b-fail');
      return 'b';
    };

    // use a higher failureThreshold so the retry attempt can succeed
    const p1 = wrap(a, { retry: { retries: 1, minDelayMs: 5, factor: 1 }, circuit: { failureThreshold: 2, timeoutMs: 1000 }, rateLimit: { maxConcurrent: 1 } });
    const p2 = wrap(b, { retry: { retries: 1, minDelayMs: 5, factor: 1 }, circuit: { failureThreshold: 2, timeoutMs: 1000 }, rateLimit: { maxConcurrent: 1 } });

    vi.advanceTimersByTime(10);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');
  });
});
