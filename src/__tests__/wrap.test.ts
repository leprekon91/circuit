import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrap } from '..';

describe('wrap integration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('combines retry, circuit, and rate limit', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw new Error('fail');
      return 'ok';
    };

    const resP = wrap(fn, { retry: { retries: 2, minDelayMs: 10, factor: 1 }, circuit: { failureThreshold: 3, timeoutMs: 1000 }, rateLimit: { maxConcurrent: 1 } });

    // advance timers to allow retry waits
    vi.advanceTimersByTime(20);
    await vi.runAllTimersAsync();

    await expect(resP).resolves.toBe('ok');
  });
});
