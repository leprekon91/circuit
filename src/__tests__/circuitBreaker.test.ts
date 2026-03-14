import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '..';

describe('circuit breaker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

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

  it('re-opens immediately on any failure in HALF_OPEN', async () => {
    const cb = new CircuitBreaker(2, 2, 1000);
    const fail = () => Promise.reject(new Error('fail'));

    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    // circuit is now OPEN

    vi.advanceTimersByTime(1001);
    await vi.runAllTimersAsync();

    // single probe failure must re-open — not require failureThreshold (2) more failures
    await expect(cb.exec(fail)).rejects.toThrow('fail');
    // circuit should be OPEN again immediately
    await expect(cb.exec(() => Promise.resolve('ok'))).rejects.toThrow('Circuit is open');
  });

  it('emits circuit.success with correct state/successes snapshot from HALF_OPEN', async () => {
    const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
    const cb = new CircuitBreaker(2, 2, 1000, (e) => events.push(e));
    const fail = () => Promise.reject(new Error('fail'));

    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();

    vi.advanceTimersByTime(1001);
    await vi.runAllTimersAsync();

    // two successes to close: first probe
    await expect(cb.exec(() => Promise.resolve('a'))).resolves.toBe('a');
    // second probe closes → reset
    await expect(cb.exec(() => Promise.resolve('b'))).resolves.toBe('b');

    // The circuit.success event that accompanied the closing success should
    // report state 'HALF_OPEN' and successes 2, not the post-reset 'CLOSED'/0.
    const closingSuccess = events.filter(
      (e) => e.type === 'circuit.success' && e.payload?.successes === 2,
    );
    expect(closingSuccess.length).toBe(1);
    expect(closingSuccess[0].payload?.state).toBe('HALF_OPEN');
  });
});
