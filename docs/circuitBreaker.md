# Circuit Breaker

`CircuitBreaker` implements a simple state machine with `CLOSED`, `OPEN`, and `HALF_OPEN` states.

Constructor signature: `new CircuitBreaker(failureThreshold = 5, successThreshold = 2, timeoutMs = 60000, monitor?)`

Options (see `WrapOptions.circuit`):

- `failureThreshold` — failures required to open the circuit.
- `successThreshold` — consecutive successes to close from `HALF_OPEN`.
- `timeoutMs` — how long `OPEN` lasts before trying `HALF_OPEN`.

Notes on synchronous behavior:

- When the circuit is `OPEN`, `exec()` rejects immediately with `Error('Circuit is open')`. Callers should expect this immediate rejection; wrapper authors may choose to defer this behavior if they require macrotask-ordering consistency with `retry`.


## When To Use

- Protect against cascading failures by stopping repeated calls to a downstream service that is failing.
- Use when a failing dependency needs time to recover and you want to fail fast locally instead of waiting on repeated remote timeouts.

## How It Works

- The circuit counts failures; when `failureThreshold` is reached it `OPEN`s and immediately rejects new calls.
- After `timeoutMs` it moves to `HALF_OPEN` and allows limited attempts; `successThreshold` consecutive successes will `CLOSE` the circuit.
- Events (see below) are emitted via the `monitor` callback for tracing state transitions and decisions.

## Key Options

- `failureThreshold`: number — failures required to open the circuit.
- `successThreshold`: number — consecutive successes needed to close from `HALF_OPEN`.
- `timeoutMs`: number — how long the circuit stays `OPEN` before trying `HALF_OPEN`.
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

## Best Practices

- Use `CircuitBreaker` when a downstream service shows persistent failures; prefer fast local failures over repeated slow remote timeouts.
- Combine with `retry` and `rateLimit` carefully: retries increase failure counts if the dependency is unhealthy; tune `failureThreshold` accordingly.
- Monitor `circuit.trip` and `circuit.reset` events to alert on dependency health changes.
