# Rate Limiter

`RateLimiter` enforces concurrent execution limits and optional reservoir-based rate windows.

Options (see `WrapOptions.rateLimit`):

- `maxConcurrent` — maximum concurrent executions (default: 10).
- `reservoir` — optional token bucket count for the interval.
- `reservoirRefreshIntervalMs` — refill interval for the reservoir.
- `reservoirRefreshAmount` — amount added on each refill.
- `reservoirMax` — optional cap for the reservoir when refilling. If omitted the reservoir may grow beyond its initial value.

## When To Use

- Protect downstream services from sudden load spikes by limiting concurrent requests.
- Enforce strict per-interval quotas (use `reservoir`) when interacting with third‑party APIs that impose rate limits.
- Smooth bursts by queuing excess work instead of dropping or retrying immediately.

## How It Works

- `maxConcurrent` controls how many invocations can run concurrently in-process.
- `reservoir` (optional) is a token pool decremented per call and refilled on the configured interval.
- Calls exceeding `maxConcurrent` are queued and will start when slots free; if `reservoir` is zero, new calls reject with `Error('Rate limiter: reservoir exhausted')`.

## Key Options

- `maxConcurrent`: number — active slot limit.
- `reservoir`: number — tokens available for the interval.
- `reservoirRefreshIntervalMs` / `reservoirRefreshAmount`: refill cadence and amount.
- `reservoirMax`: optional cap applied when refilling so the reservoir cannot grow beyond this value.
- `monitor`: `Monitor` callback to observe events (see `docs/monitoring.md`).

## Monitoring & Events

- `rate.acquire` / `rate.release`: emitted when a slot is acquired and released.
- `rate.queued` / `rate.dequeue`: emitted when a job is enqueued and when it begins running.
- `rate.refill` / `rate.reservoir_exhausted`: emitted on reservoir refills and when the reservoir is depleted.

## Examples

Wrap with concurrency limit:

```ts
await wrap(() => fetch('/api'), { rateLimit: { maxConcurrent: 3 } });
```

Create a limiter with a 1-minute reservoir of 100 tokens (capped at 100):

```ts
const rl = new RateLimiter(5, 100, 60_000, 100, 100, (e) => console.log(e));
await rl.schedule(() => fetch('/api'));
```

## Best Practices

- Tune `maxConcurrent` to match the downstream service capacity and your client's concurrency model.
- Use `reservoir` for strict quota enforcement (e.g., API keys limited to X requests/min).
- Provide a `monitor` to track queueing, refills, and exhausted conditions.
- Remember this limiter is in-process; use a distributed solution for cluster-wide rate limits.
