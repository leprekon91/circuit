import { retry } from './retry';
import { CircuitBreaker } from './circuitBreaker';
import { RateLimiter } from './rateLimiter';
import { Bulkhead } from './bulkhead';
import { BulkheadLike, BulkheadOptions, Monitor, RateLimiterLike, RateLimitOptions, WrapOptions } from '../types';

export async function wrap<T>(fn: () => Promise<T>, opts: WrapOptions = {}): Promise<T> {
  let step: () => Promise<T> = fn;

  // Each block captures `prev = step` and wraps it: `step = () => mechanism.exec(prev)`.
  // Mechanisms are added innermost-first; the last one added becomes the outermost and
  // executes first at call time:
  //   fn (innermost) ← circuit breaker ← retry ← bulkhead ← rate limiter (outermost, runs first)

  // 1. Circuit breaker: guards the raw call — innermost so retries see accurate failure counts.
  if (opts.circuit) {
    const c = opts.circuit;
    const breaker = new CircuitBreaker(
      c.failureThreshold ?? 5,
      c.successThreshold ?? 2,
      c.timeoutMs ?? 60_000,
      c.monitor ?? opts.monitor,
    );
    const prev = step;
    step = () => breaker.exec(prev);
  }

  // 2. Retry: wraps the (possibly circuit-broken) call.
  if (opts.retry) {
    const r = opts.retry;
    const prev = step;
    step = () => retry(prev, { ...r, monitor: r.monitor ?? opts.monitor });
  }

  // 3. Bulkhead: limits concurrency; the slot is held only while the job actively runs,
  //    not while it waits in the rate-limiter queue (see step 4).
  if (opts.bulkhead) {
    const bulk = resolveBulkhead(opts.bulkhead, opts.monitor);
    const prev = step;
    step = () => bulk.exec(prev);
  }

  // 4. Rate limiter: outermost so it queues without holding a bulkhead slot.
  if (opts.rateLimit) {
    const limiter = resolveRateLimiter(opts.rateLimit, opts.monitor);
    const prev = step;
    step = () => limiter.schedule(prev);
  }

  return step();
}

/** Accepts either a pre-built `RateLimiter` instance or a plain `RateLimitOptions` object. */
function resolveRateLimiter(r: RateLimitOptions | RateLimiterLike, monitor?: Monitor): RateLimiterLike {
  if (typeof (r as RateLimiterLike).schedule === 'function') {
    return r as RateLimiterLike;
  }
  const o = r as RateLimitOptions;
  return new RateLimiter(
    o.maxConcurrent ?? 10,
    o.reservoir,
    o.reservoirRefreshIntervalMs,
    o.reservoirRefreshAmount ?? 0,
    o.reservoirMax,
    o.monitor ?? monitor,
  );
}

/** Accepts either a pre-built `Bulkhead` instance or a plain `BulkheadOptions` object. */
function resolveBulkhead(b: BulkheadOptions | BulkheadLike, monitor?: Monitor): BulkheadLike {
  if (typeof (b as BulkheadLike).exec === 'function') {
    return b as BulkheadLike;
  }
  const o = b as BulkheadOptions;
  return new Bulkhead(o.limit ?? 10, o.queueLimit ?? Infinity, o.monitor ?? monitor, {
    keyed: o.keyed,
    idleTimeoutMs: o.idleTimeoutMs,
    maxKeys: o.maxKeys,
    keyFn: o.bulkheadKey,
  });
}
