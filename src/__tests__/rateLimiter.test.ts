import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '..';

describe('rate limiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enforces maxConcurrent and queues extra calls', async () => {
    const rl = new RateLimiter(1);
    const order: string[] = [];

    const task = (name: string, delay = 50) => async () => {
      order.push(`start:${name}`);
      await new Promise((res) => setTimeout(res, delay));
      order.push(`end:${name}`);
      return name;
    };

    const p1 = rl.schedule(task('a', 100));
    const p2 = rl.schedule(task('b', 10));

    // advance timers so p1 starts and is in-flight
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    // advance to finish first
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');
    expect(order[0]).toBe('start:a');
    expect(order[1]).toBe('end:a');
    expect(order[2]).toBe('start:b');
  });

  it('uses reservoir tokens and refills on interval', async () => {
    const rl = new RateLimiter(5, 1, 1000, 1);

    // first call consumes token
    await expect(rl.schedule(() => Promise.resolve('ok'))).resolves.toBe('ok');

    // second call should be rejected (reservoir exhausted)
    await expect(rl.schedule(() => Promise.resolve('too-much'))).rejects.toThrow('Rate limiter: reservoir exhausted');

    // advance time beyond refresh interval
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    // now token should be refilled
    await expect(rl.schedule(() => Promise.resolve('again'))).resolves.toBe('again');
  });
});
