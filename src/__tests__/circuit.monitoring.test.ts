import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '..';

describe('circuit breaker monitoring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits trip and reset events and rejects while open', async () => {
    const events: { type: string }[] = [];
    const cb = new CircuitBreaker(2, 1, 1000, (e) => events.push(e));

    // first failure
    await expect(cb.exec(() => Promise.reject(new Error('fail1')))).rejects.toThrow('fail1');
    // second failure trips circuit
    await expect(cb.exec(() => Promise.reject(new Error('fail2')))).rejects.toThrow('fail2');

    // next call should be rejected synchronously (deferred) while open
    const p = cb.exec(() => Promise.resolve('ok'));
    // attach noop handler to avoid unhandled rejection race
    p.catch(() => {});
    // run macrotasks (if any) and assert rejection
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow('Circuit is open');

    const types = events.map((e) => e.type);
    expect(types).toContain('circuit.failure');
    expect(types).toContain('circuit.trip');
    expect(types).toContain('circuit.reject');
  });
});
