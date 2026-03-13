import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wait, calcExponentialDelay } from '..';

describe('backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcExponentialDelay grows and caps at max', () => {
    const d1 = calcExponentialDelay(1, 100, 2, 500);
    const d2 = calcExponentialDelay(2, 100, 2, 500);
    const d3 = calcExponentialDelay(4, 100, 2, 500);

    expect(d1).toBe(100);
    expect(d2).toBe(200);
    // capped by max (500)
    expect(d3).toBeLessThanOrEqual(500);
  });

  it('wait resolves after given time', async () => {
    const p = wait(50);
    vi.advanceTimersByTime(50);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeUndefined();
  });
});
