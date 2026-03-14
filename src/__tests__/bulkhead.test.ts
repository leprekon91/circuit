import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Bulkhead } from '..';

describe('bulkhead (non-keyed) behavior and monitoring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires, queues, dequeues and releases slots', async () => {
    const events: { type: string }[] = [];
    const bh = new Bulkhead(1, 10, (e) => events.push(e));

    const p1 = bh.exec(async () => {
      await new Promise((res) => setTimeout(res, 50));
      return 'first';
    });

    const p2 = bh.exec(() => Promise.resolve('second'));

    // let queue/dequeue logic run
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    vi.advanceTimersByTime(50);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('first');
    await expect(p2).resolves.toBe('second');

    const types = events.map((e) => e.type);
    expect(types).toContain('bulkhead.acquire');
    expect(types).toContain('bulkhead.release');
    expect(types).toContain('bulkhead.queued');
    expect(types).toContain('bulkhead.dequeue');
  });
});

describe('bulkhead keyed pools and idle cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates per-key pools and cleans up idle keys', async () => {
    const events: { type: string }[] = [];
    const bh = new Bulkhead(1, 10, (e) => events.push(e), {
      keyed: true,
      idleTimeoutMs: 1000,
      maxKeys: 10,
    });

    const p1 = bh.exec('k1', async () => {
      await new Promise((res) => setTimeout(res, 50));
      return 'k1-first';
    });

    const p2 = bh.exec('k1', () => Promise.resolve('k1-second'));

    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(50);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('k1-first');
    await expect(p2).resolves.toBe('k1-second');

    // advance past idle timeout to trigger cleanup interval
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();

    const types = events.map((e) => e.type);
    expect(types).toContain('bulkhead.cleanup');

    bh.shutdown();
  });
});

describe('automatic key extraction with bulkheadKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses bulkheadKey to generate keys when exec is called without explicit key', async () => {
    const events: { type: string; payload?: Record<string, unknown> }[] = [];
    const keys = ['auto1', 'auto2'];
    const keyFn = () => keys.shift()!;
    const bh = new Bulkhead(1, 10, (e) => events.push(e), {
      keyed: true,
      keyFn,
      idleTimeoutMs: 1000,
    });

    const p1 = bh.exec(async () => {
      await new Promise((res) => setTimeout(res, 10));
      return 'a';
    });

    const p2 = bh.exec(async () => {
      await new Promise((res) => setTimeout(res, 10));
      return 'b';
    });

    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(10);
    await vi.runAllTimersAsync();

    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');

    const keyEvents = events
      .filter((e) => e.type === 'bulkhead.acquire')
      .map((e) => e.payload?.key);
    expect(keyEvents).toContain('auto1');
    expect(keyEvents).toContain('auto2');

    bh.shutdown();
  });
});
