# Rate Limiter

`RateLimiter` enforces concurrent execution limits and optional reservoir-based rate windows.

Options (see `WrapOptions.rateLimit`):

- `maxConcurrent` — maximum concurrent executions (default: 10).
- `reservoir` — optional token bucket count for the interval.
- `reservoirRefreshIntervalMs` — refill interval for the reservoir.
- `reservoirRefreshAmount` — amount added on each refill.
- `reservoirMax` — optional cap for the reservoir when refilling. If omitted the reservoir may grow beyond its initial value.

Events (monitor):

- `rate.acquire` — emitted when a slot is acquired, payload: `{ current }`.
- `rate.release` — emitted when a slot is released, payload: `{ current }`.
- `rate.queued` — when a job is queued, payload: `{ queueLength }`.
- `rate.refill` — when reservoir refills, payload: `{ reservoir }`.
- `rate.reservoir_exhausted` — when reservoir is depleted.
- `rate.dequeue` — when a queued job starts running, payload: `{ queueLength }`.

Event semantics:

- `rate.queued` is emitted when a job is enqueued (queue length after enqueue). `rate.dequeue` is emitted when a queued job begins running.
- `rate.acquire` and `rate.release` indicate active slot usage; `rate.refill` shows reservoir after a refill (respecting `reservoirMax` if provided).

Usage example:

```ts
await wrap(() => fetch('/heavy'), { rateLimit: { maxConcurrent: 3 } });
```
