import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '..';

describe('rate limiter monitoring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits acquire, release, queued and refill events', async () => {
    const events: { type: string }[] = [];
    // use a limiter without reservoir to test acquire/queue/release
    const rlQueue = new RateLimiter(1, undefined, 1000, 1, undefined, (e) => events.push(e));

    const p1 = rlQueue.schedule(async () => {
      await new Promise((res) => setTimeout(res, 50));
      return 'a';
    });

    const p2 = rlQueue.schedule(() => Promise.resolve('b'));

    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    vi.advanceTimersByTime(50);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');

    // now test refill events with a reservoir-enabled limiter
    const rlRefill = new RateLimiter(5, 1, 1000, 1, undefined, (e) => events.push(e));
    await expect(rlRefill.schedule(() => Promise.resolve('ok'))).resolves.toBe('ok');
    await expect(rlRefill.schedule(() => Promise.resolve('too-much'))).rejects.toThrow(
      'Rate limiter: reservoir exhausted',
    );
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();
    await expect(rlRefill.schedule(() => Promise.resolve('again'))).resolves.toBe('again');

    const types = events.map((e) => e.type);
    expect(types).toContain('rate.acquire');
    expect(types).toContain('rate.release');
    expect(types).toContain('rate.queued');
    expect(types).toContain('rate.refill');
  });
});
