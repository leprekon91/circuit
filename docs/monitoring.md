# Monitoring & Hooks

`fault-guard` exposes a simple `Monitor` callback you can attach via `WrapOptions.monitor` (or per-mechanism where supported).

Type: `type Monitor = (event: { type: string; payload?: Record<string, unknown> }) => void`

## Where to provide it

- Pass `monitor` at the top level — `wrap(..., { monitor })` — to receive events from all mechanisms.
- Or provide `monitor` directly in `retry`, `circuit`, `rateLimit`, or `bulkhead` options to scope events to one mechanism.
- A mechanism-specific `monitor` **overrides** the top-level `monitor` for that mechanism.

## All event types

| Prefix | Event | Payload |
|---|---|---|
| `retry` | `retry.attempt` | `{ attempt }` |
| `retry` | `retry.delay` | `{ attempt, delay }` |
| `circuit` | `circuit.failure` | `{ failures }` |
| `circuit` | `circuit.success` | `{ state, successes }` |
| `circuit` | `circuit.trip` | `{ nextAttempt }` |
| `circuit` | `circuit.reset` | `{}` |
| `circuit` | `circuit.half_open` | `{ nextAttempt }` |
| `circuit` | `circuit.reject` | `{ state }` |
| `rate` | `rate.acquire` | `{ current }` |
| `rate` | `rate.release` | `{ current }` |
| `rate` | `rate.queued` | `{ queueLength }` |
| `rate` | `rate.dequeue` | `{ queueLength }` |
| `rate` | `rate.refill` | `{ reservoir }` |
| `rate` | `rate.reservoir_exhausted` | `{}` |
| `bulkhead` | `bulkhead.acquire` | `{ key?, current }` |
| `bulkhead` | `bulkhead.release` | `{ key?, current }` |
| `bulkhead` | `bulkhead.queued` | `{ key?, queueLength }` |
| `bulkhead` | `bulkhead.dequeue` | `{ key?, queueLength }` |
| `bulkhead` | `bulkhead.reject` | `{ key?, queueLength }` |
| `bulkhead` | `bulkhead.cleanup` | `{ key }` |
| `bulkhead` | `bulkhead.evict` | `{ key }` |
| `bulkhead` | `bulkhead.key_error` | `{ error }` |

## Example — collect all events

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const events: { type: string; payload?: Record<string, unknown> }[] = [];

await wrap(() => fetch('/unstable'), {
  retry:     { retries: 3 },
  circuit:   { failureThreshold: 4 },
  rateLimit: { maxConcurrent: 5 },
  bulkhead:  { limit: 10 },
  monitor:   (e) => events.push(e),
});

console.log(events);
```

## Notes

- Keep payloads small and JSON-serializable.
- `CircuitBreaker` rejects immediately with `Error('Circuit is open')` when the circuit is open. `retry` defers invocation of `fn()` to a macrotask to avoid synchronous rejection races; keep this in mind when mixing mechanisms.

// inspect or forward events to your logging/telemetry
console.log(events.map((e) => e.type));
```

## Useful patterns

- Filter events by prefix (e.g., `type.startsWith('rate.')`) to route to different observability channels.
- Include correlation IDs in payloads (if available) to relate events to specific requests.
- Avoid expensive synchronous work inside `monitor` — forward or enqueue to your telemetry pipeline.
