# Retry

The `retry` helper performs repeated attempts of an async function with exponential backoff.

Options (see `WrapOptions.retry` / `RetryOptions`):

- `retries` (number): max retry attempts (default: 3)
- `minDelayMs` (number): base delay (default: 100)
- `maxDelayMs` (number): max delay cap (default: 10000)
- `factor` (number): exponential factor (default: 2)

## When To Use

- Retry transient failures (network timeouts, temporary 5xx errors) where a later attempt is likely to succeed.
- Avoid retries for idempotency-sensitive operations unless the caller guarantees safe retries.

## How It Works

- `retry` runs the provided `fn()` and, on failure, waits an exponentially increasing delay before trying again.
- `retry` intentionally invokes `fn()` asynchronously (macrotask) to avoid synchronous rejection races.
- Use `retries`, `minDelayMs`, `maxDelayMs`, and `factor` to tune backoff behavior.

## Key Options

- `retries`: number — how many additional attempts after the first (default: 3).
- `minDelayMs`: number — base delay for backoff.
- `maxDelayMs`: number — maximum delay cap.
- `factor`: number — exponential multiplier.
- `monitor`: `Monitor` callback receives `retry.attempt` and `retry.delay` events.

## Monitoring & Events

- `retry.attempt`: emitted before each attempt with payload `{ attempt }`.
- `retry.delay`: emitted when a delay is scheduled with payload `{ attempt, delay }`.

## Examples

Simple retry with backoff:

```ts
await retry(() => fetch('/unstable'), { retries: 3, minDelayMs: 100 });
```

## Best Practices

- Only retry transient or idempotent operations.
- Keep `maxDelayMs` reasonable to avoid long blocking delays.
- Attach a `monitor` to capture attempts and delays for observability and debugging.
