# fault-guard

A lightweight resilience layer for Promise-returning functions and HTTP clients. It provides retries with exponential backoff, circuit breaking, concurrency rate limiting, and bulkhead isolation.

## Installation

Install from npm (package name: `@leprekon-hub/fault-guard`) and add `axios` if you plan to use the adapter:

```bash
npm install @leprekon-hub/fault-guard
# if using axios adapter
npm install axios
```

## Quick Start

Wrap a function to apply resilience features:

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const result = await wrap(() => fetchMyApi(), {
  retry:     { retries: 3, minDelayMs: 100 },
  circuit:   { failureThreshold: 5, timeoutMs: 30_000 },
  rateLimit: { maxConcurrent: 5 },
  bulkhead:  { limit: 10 },
});
```

### How `wrap()` works

`wrap()` builds a **linear pipeline** around your function. Mechanisms are layered innermost-first in this fixed order:

```
your fn
 └─ 1. circuit breaker  ← innermost; each retry attempt counts as one failure
 └─ 2. retry
 └─ 3. bulkhead         ← slot acquired only when the job is actually running
 └─ 4. rate limiter     ← outermost; jobs queue here before touching the bulkhead
```

This ordering has two important consequences:

- **Retry × circuit**: every individual retry attempt is seen by the circuit breaker. Once `failureThreshold` is reached the circuit opens and further retry attempts fail fast with `"Circuit is open"`.
- **Bulkhead × rate limiter**: a job waits in the rate-limiter queue *before* acquiring a bulkhead slot, so the bulkhead slot is held only while the job actively runs — not while it waits.

### Shared instances

By default, `wrap()` creates a fresh mechanism instance on every call. Pass a **pre-built instance** for `bulkhead` or `rateLimit` to share state (and enforce limits) across multiple calls:

```ts
import { wrap, Bulkhead, RateLimiter } from '@leprekon-hub/fault-guard';

const limiter = new RateLimiter(5);  // 5 concurrent max, shared
const bh      = new Bulkhead(10);    // 10 concurrent max, shared

await Promise.all(requests.map(req =>
  wrap(() => fetch(req), { rateLimit: limiter, bulkhead: bh })
));
```

For full documentation, detailed options, and examples see the docs:

- [Docs Home](docs/index.md)

## Development

- Build: `npm run build`
- Test: `npm test`

## Contributing & License

Contributions welcome. The project is MIT licensed (see `LICENSE`).
