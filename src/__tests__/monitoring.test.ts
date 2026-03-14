import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry } from '..';

describe('monitoring hooks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits retry attempt and delay events', async () => {
    const events: any[] = [];
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) {
        await Promise.resolve();
        throw new Error('fail');
      }
      return 'ok';
    };

    const p = retry(fn, { retries: 2, minDelayMs: 10, factor: 1, monitor: (e) => events.push(e) });
    vi.advanceTimersByTime(30);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');

    const types = events.map((e) => e.type);
    expect(types).toContain('retry.attempt');
    expect(types).toContain('retry.delay');
  });
});
