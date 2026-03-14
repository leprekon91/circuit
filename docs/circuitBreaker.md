# Circuit Breaker

`CircuitBreaker` implements a simple state machine with `CLOSED`, `OPEN`, and `HALF_OPEN` states.

Constructor signature: `new CircuitBreaker(failureThreshold = 5, successThreshold = 2, timeoutMs = 60000, monitor?)`

Options (see `WrapOptions.circuit`):

- `failureThreshold` — failures required to open the circuit.
- `successThreshold` — consecutive successes to close from `HALF_OPEN`.
- `timeoutMs` — how long `OPEN` lasts before trying `HALF_OPEN`.

## When To Use

- Protect against cascading failures by stopping repeated calls to a downstream service that is failing.
- Use when a failing dependency needs time to recover and you want to fail fast locally instead of waiting on repeated remote timeouts.

## How It Works

- The circuit counts failures; when `failureThreshold` is reached it `OPEN`s and immediately rejects new calls with `Error('Circuit is open')`.
- After `timeoutMs` it moves to `HALF_OPEN` and allows limited attempts; `successThreshold` consecutive successes will `CLOSE` the circuit.
- Events (see below) are emitted via the `monitor` callback for tracing state transitions and decisions.

## Interaction with `retry`

When both `circuit` and `retry` are used in `wrap()`, the circuit breaker is the **innermost** layer:

```
your fn → circuit breaker → retry
```

Every individual retry attempt is a separate call to `circuit.exec()` — each failed attempt increments the failure counter. With `failureThreshold: 3` and `retries: 10`, your function is called exactly **3 times**. After the third failure the circuit opens; all remaining retry attempts immediately receive `Error('Circuit is open')` without calling your function again.

Tune `failureThreshold` to be greater than `retries` if you want retry to exhaust before the circuit trips.

## Key Options

- `failureThreshold`: number — failures required to open the circuit (default: 5).
- `successThreshold`: number — consecutive successes needed to close from `HALF_OPEN` (default: 2).
- `timeoutMs`: number — how long the circuit stays `OPEN` before trying `HALF_OPEN` (default: 60 000).
- `monitor`: `Monitor` callback to observe `circuit.*` events.

## Monitoring & Events

- `circuit.failure`: emitted on every failure, payload: `{ failures }`.
- `circuit.success`: emitted on success, payload: `{ state, successes }`.
- `circuit.trip`: emitted when the circuit opens, payload: `{ nextAttempt }`.
- `circuit.reset`: emitted when the circuit resets to `CLOSED`.
- `circuit.half_open`: emitted when transitioning to `HALF_OPEN`.
- `circuit.reject`: emitted when a call is rejected while `OPEN`.

## Examples

Create a circuit that trips after 3 failures and requires 2 successful attempts to close:

```ts
const cb = new CircuitBreaker(3, 2, 30_000, (e) => console.log(e));
await cb.exec(() => fetch('/maybe-fails'));
```

With `wrap()` — allow up to 2 retries before the circuit trips on the 3rd failure:

```ts
await wrap(() => fetch('/service'), {
  circuit: { failureThreshold: 3, timeoutMs: 30_000 },
  retry:   { retries: 2, minDelayMs: 200 },
});
```

## Best Practices

- Use `CircuitBreaker` when a downstream service shows persistent failures; prefer fast local failures over repeated slow remote timeouts.
- When combining with `retry`, set `failureThreshold` **greater than** `retries` if you want retries to exhaust before the circuit opens. Set it lower for aggressive fast-fail behaviour.
- Monitor `circuit.trip` and `circuit.reset` events to alert on dependency health changes.
