# Monitoring & Hooks

`fault-guard` exposes a simple `Monitor` callback you can attach via `WrapOptions.monitor` (or per-mechanism where supported).

Type: `type Monitor = (event: { type: string; payload?: Record<string, unknown> }) => void`

Where to provide it:

- pass `monitor` at the top-level `wrap(..., { monitor })` to receive events from retry, rate limiter, and circuit breaker.
- or provide `monitor` directly in `retry`, `circuit`, or `rateLimit` options to scope events.

Notes on precedence and async behavior:

- Mechanism-specific `monitor` (for example `rateLimit.monitor` or `retry.monitor`) takes precedence over the top-level `monitor` passed to `wrap`.
- Some mechanisms throw synchronously for certain conditions (for example `CircuitBreaker` throws `Error('Circuit is open')` when open). `retry` intentionally defers invocation of the user `fn()` to a macrotask to avoid synchronous rejection races; mechanism authors should follow that pattern when appropriate or document synchronous behavior.

Example:

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const events: any[] = [];
const monitor = (e: any) => events.push(e);

await wrap(() => fetch('/unstable'), {
  retry: { retries: 3 },
  circuit: { failureThreshold: 4 },
  rateLimit: { maxConcurrent: 5 },
  monitor,
});

console.log(events);
```

Common event types:

- `retry.attempt`, `retry.delay`
- `circuit.failure`, `circuit.success`, `circuit.trip`, `circuit.reset`, `circuit.half_open`, `circuit.reject`
- `rate.acquire`, `rate.release`, `rate.queued`, `rate.refill`, `rate.reservoir_exhausted`
