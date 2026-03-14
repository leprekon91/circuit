# Bulkhead

`Bulkhead` isolates concurrent capacity into bounded pools so one caller or key cannot exhaust shared resources.

Constructor signature:

```ts
new Bulkhead(limit = 10, queueLimit = Infinity, monitor?, opts?)
```

Options (via `BulkheadOptions` / `WrapOptions.bulkhead`):

- `limit`: number — concurrent slots per pool (default: 10).
- `queueLimit`: number — maximum queued jobs per pool (default: unlimited).
- `monitor`: `Monitor` — receive `bulkhead.*` events.
- `keyed`: boolean — enable per-key pools (default: false).
- `idleTimeoutMs`: number — milliseconds of inactivity after which a keyed pool is cleaned up.
- `maxKeys`: number — maximum keyed pools to keep. When exceeded, idle pools are evicted to make room. If no idle pool can be evicted the call rejects with `Error('Bulkhead: max keyed pools exceeded')`.
- `bulkheadKey`: `() => string` — optional function used to generate a key automatically when `exec(fn)` is called without an explicit key. Useful for adapters that can capture request context.

## How it works

- If `keyed` is false (default) a single global pool enforces `limit` and `queueLimit`.
- If `keyed` is true, `exec(key, fn)` creates or uses a per-key pool for isolation.
- When a slot is available the call runs immediately; otherwise it's queued until a slot frees.
- If the queue is full the call rejects with `Error('Bulkhead: queue limit exceeded')`.

## Monitoring events

- `bulkhead.acquire` — a slot was acquired, payload: `{ key?, current }`.
- `bulkhead.release` — a slot was released, payload: `{ key?, current }`.
- `bulkhead.queued` — job enqueued, payload: `{ key?, queueLength }`.
- `bulkhead.dequeue` — queued job started, payload: `{ key?, queueLength }`.
- `bulkhead.reject` — job rejected due to full queue, payload: `{ key?, queueLength }`.
- `bulkhead.cleanup` — keyed pool removed due to idleness, payload: `{ key }`.
- `bulkhead.evict` — keyed pool evicted to enforce `maxKeys`, payload: `{ key }`.
- `bulkhead.key_error` — `bulkheadKey` function threw; fell back to global pool, payload: `{ error }`.

## Usage examples

Direct usage:

```ts
const bh = new Bulkhead(5, 50, (e) => console.log(e));
await bh.exec(() => fetch('/api'));
```

Keyed pools (per-customer isolation):

```ts
const bh = new Bulkhead(3, 10, (e) => console.log(e), { keyed: true, idleTimeoutMs: 60000 });
await bh.exec('customer:123', () => fetch('/customer/123/data'));
```

Wrap integration:

Pass a **shared** `Bulkhead` instance so concurrency is enforced across all calls to `wrap()`. Passing an options object creates a new bulkhead per call, which does **not** limit concurrency across separate invocations.

```ts
// Correct: shared instance limits concurrency across all wrap() calls
const bh = new Bulkhead(5, Infinity, monitor, { keyed: true, idleTimeoutMs: 60000 });
await wrap(() => fetch('/api'), { bulkhead: bh });

// Note: passing options creates a one-off bulkhead scoped to a single call
await wrap(() => fetch('/api'), { bulkhead: { limit: 5, keyed: true, idleTimeoutMs: 60000 } });
```

## Best practices

- Use keyed bulkheads for multi-tenant systems to prevent one tenant from starving others.
- Set a reasonable `idleTimeoutMs` and `maxKeys` to avoid unbounded memory use for many ephemeral keys.
- Combine with `rateLimit` and `circuit` where appropriate: bulkheads guard concurrency, rate limits control request rate, circuits protect failing dependencies.
