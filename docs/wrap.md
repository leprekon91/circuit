# `wrap()` — Pipeline & Shared Instances

`wrap(fn, opts)` is the central API. It composes all enabled mechanisms around your function and returns a single promise.

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const result = await wrap(() => fetch('/api'), {
  retry: { retries: 3, minDelayMs: 100 },
  circuit: { failureThreshold: 5, timeoutMs: 30_000 },
  bulkhead: { limit: 10 },
  rateLimit: { maxConcurrent: 5 },
  monitor: (e) => console.log(e.type),
});
```

## Pipeline ordering

`wrap()` builds a **linear pipeline** of mechanisms around your function. Mechanisms are layered innermost-first:

```
your fn
 └─ 1. circuit breaker  ← innermost; each retry attempt counts as one failure
 └─ 2. retry
 └─ 3. bulkhead         ← slot acquired only while the job is running
 └─ 4. rate limiter     ← outermost; jobs queue here before touching the bulkhead
```

Execution always starts from the outermost layer (rate limiter) and flows inward to the function. Results and errors bubble back outward.

### Why this order matters

**Retry × circuit breaker**: because the circuit breaker is inside the retry loop, every retry attempt increments the circuit's failure counter. With `failureThreshold: 3` and `retries: 10`, your function is called exactly 3 times — after the third failure the circuit opens and the remaining 7 retry attempts fail fast with `Error('Circuit is open')`.

**Bulkhead × rate limiter**: the rate limiter sits outside the bulkhead. A job waiting in the rate-limiter queue does **not** hold a bulkhead slot. The slot is only acquired when the rate limiter releases the job and it actually begins executing.

## Instance — options object vs. shared instance

By default, passing a plain options object to `rateLimit` or `bulkhead` creates a **new mechanism instance on every `wrap()` call**. Each call gets its own independent pool with no shared state:

```ts
// Two concurrent calls — each has its own RateLimiter(maxConcurrent=1), so they never contend.
const opts = { rateLimit: { maxConcurrent: 1 } };
await Promise.all([wrap(fn1, opts), wrap(fn2, opts)]);
```

To enforce a shared limit across multiple concurrent `wrap()` calls, pass a **pre-built instance**:

```ts
import { wrap, RateLimiter, Bulkhead } from '@leprekon-hub/fault-guard';

const limiter = new RateLimiter(5);
const bh = new Bulkhead(10);

await Promise.all(
  requests.map((req) => wrap(() => fetch(req), { rateLimit: limiter, bulkhead: bh })),
);
```

### Lifecycle of shared instances

- `RateLimiter` instances have no explicit lifecycle method; they are garbage-collected when no longer referenced.
- `Bulkhead` instances hold timer state when `idleTimeoutMs` is configured. Call `bh.shutdown()` when the instance is no longer needed to stop the cleanup interval.

## `WrapOptions` reference

| Option      | Type                              | Description                                                                    |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `retry`     | `RetryOptions`                    | Retry with exponential backoff. See [retry.md](retry.md).                      |
| `circuit`   | `CircuitOptions`                  | Circuit breaker state machine. See [circuitBreaker.md](circuitBreaker.md).     |
| `bulkhead`  | `BulkheadOptions \| Bulkhead`     | Per-pool concurrency isolation. See [bulkhead.md](bulkhead.md).                |
| `rateLimit` | `RateLimitOptions \| RateLimiter` | Concurrent slot + optional token bucket. See [rateLimiter.md](rateLimiter.md). |
| `monitor`   | `Monitor`                         | Receives events from all mechanisms. See [monitoring.md](monitoring.md).       |

Omitting any option disables that mechanism entirely — there is no overhead for unused mechanisms.
