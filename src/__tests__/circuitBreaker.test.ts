import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '..';

describe('circuit breaker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('trips after failures and rejects while open', async () => {
    const cb = new CircuitBreaker(2, 1, 1000);

    // two failures to trip
    await expect(cb.exec(() => Promise.reject(new Error('err1')))).rejects.toThrow();
    await expect(cb.exec(() => Promise.reject(new Error('err2')))).rejects.toThrow();

    // now circuit should be open and reject immediately
    await expect(cb.exec(() => Promise.resolve('ok'))).rejects.toThrow('Circuit is open');

    // advance past timeout to allow HALF_OPEN
    vi.advanceTimersByTime(1001);
    await vi.runAllTimersAsync();

    // next success should close the circuit
    await expect(cb.exec(() => Promise.resolve('good'))).resolves.toBe('good');
  });
});
