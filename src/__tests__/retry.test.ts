import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry } from '..';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries failing function until success', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) {
        await Promise.resolve();
        throw new Error('fail');
      }
      return 'ok';
    };

    // start and await result
    const p = retry(fn, { retries: 3, minDelayMs: 10, factor: 1 });
    vi.advanceTimersByTime(30);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws after exceeding retries', async () => {
    const fn = async () => {
      await Promise.resolve();
      throw new Error('always fail');
    };

    const p = retry(fn, { retries: 2, minDelayMs: 1, factor: 1 });
    // attach noop handler to avoid unhandled rejection race
    p.catch(() => {});
    vi.advanceTimersByTime(10);
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow('always fail');
  });
});
