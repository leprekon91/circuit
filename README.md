# fault-guard

A resilience layer for HTTP clients that adds retries, backoff, rate-limit handling, and circuit breakers for axios requests or any Promise-returning functions.

## Installation

Install from npm (package name: `@leprekon-hub/fault-guard`) and add `axios` if you plan to use the adapter:

```bash
npm install @leprekon-hub/fault-guard
# if using axios adapter
npm install axios
```

## Quick Start

Wrap any Promise-returning function with `wrap(...)` to apply retries, circuit breaker, and rate limiting:

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const result = await wrap(() => fetchMyApi(), {
  retry: { retries: 3, minDelayMs: 100 },
  circuit: { failureThreshold: 5, timeoutMs: 30000 },
  rateLimit: { maxConcurrent: 5 },
});
```

Use the Axios adapter to automatically protect requests made by an Axios instance:

```ts
import axios from 'axios';
import { applyAxiosResilience } from '@leprekon-hub/fault-guard';

const client = axios.create({ baseURL: 'https://api.example.com' });
applyAxiosResilience(client, {
  retry: { retries: 2, minDelayMs: 200 },
  circuit: { failureThreshold: 3, timeoutMs: 60000 },
  rateLimit: { maxConcurrent: 10 },
});

await client.get('/resource');
```

**Note:** the Axios adapter expects `axios` to be a peer dependency of your project.

## Table of contents

- **Installation**: how to install
- **Quick Start**: minimal examples
- **API**: exported functions and classes
- **Configurations**: explanation of each option and examples
- **Advanced**: recommendations and caveats

## API

- **wrap(fn, opts)**: Wraps a function `fn: () => Promise<T>` with optional resilience features.
- **retry**: low-level helper to run retries with exponential/backoff delays.
- **CircuitBreaker**: class implementing a simple circuit-breaker state machine.
- **RateLimiter**: concurrency and reservoir-based rate limiter.
- **applyAxiosResilience(axiosInstance, opts)**: installs response interceptor to transparently retry/wrap axios requests.

## Configurations and Options

All options are passed to `wrap` or `applyAxiosResilience` using the same shape (`WrapOptions`).

- **RetryOptions** (`retry`):
  - **retries**: number — maximum retry attempts (default: 3).
  - **minDelayMs**: number — base delay for exponential backoff (default: 100 ms).
  - **maxDelayMs**: number — maximum backoff delay (default: 10000 ms).
  - **factor**: number — exponential factor (default: 2).

Example:

```ts
await wrap(() => fetch('/unstable'), { retry: { retries: 4, minDelayMs: 200, factor: 2 } });
```

- **CircuitOptions** (`circuit`):
  - **failureThreshold**: number — failures required to open the circuit (default: 5).
  - **successThreshold**: number — consecutive successes required to close from HALF_OPEN (default: 2).
  - **timeoutMs**: number — how long the circuit stays OPEN before moving to HALF_OPEN (default: 60000 ms).

Behavior notes:

- When failures reach `failureThreshold`, the circuit `OPEN`s and immediately rejects calls until `timeoutMs` elapses.
- After `timeoutMs`, the circuit moves to `HALF_OPEN` and will allow limited attempts; `successThreshold` successful calls will close it.

Example:

```ts
const cb = new CircuitBreaker(3, 2, 30000);
await cb.exec(() => fetch('/maybe-fails'));
```

- **RateLimitOptions** (`rateLimit`):
  - **maxConcurrent**: number — maximum concurrent calls allowed (default: 10).
  - **reservoir**: number | undefined — number of tokens available for the interval (if provided, limits per interval).
  - **reservoirRefreshIntervalMs**: number — how often to refill the reservoir.
  - **reservoirRefreshAmount**: number — amount to add on each interval.

Behavior notes:

- `RateLimiter` enforces `maxConcurrent` immediate concurrency. Calls beyond this limit are queued.
- If a `reservoir` is provided and reaches zero, new calls are rejected until a refill occurs.

Example (concurrency):

```ts
await wrap(() => fetch('/heavy'), { rateLimit: { maxConcurrent: 3 } });
```

Example (reservoir):

```ts
await wrap(() => fetch('/limited'), {
  rateLimit: { reservoir: 100, reservoirRefreshIntervalMs: 60000, reservoirRefreshAmount: 100 },
});
```

## Examples

1. Full pipeline: rate limit + retry + circuit

```ts
import { wrap } from '@leprekon-hub/fault-guard';

const opts = {
  rateLimit: { maxConcurrent: 5 },
  retry: { retries: 3, minDelayMs: 100 },
  circuit: { failureThreshold: 4, successThreshold: 2, timeoutMs: 30000 },
};

const result = await wrap(() => fetch('https://httpbin.org/status/500'), opts);
```

2. Using the Axios adapter (recommended for Axios-based codebases)

```ts
import axios from 'axios';
import { applyAxiosResilience } from '@leprekon-hub/fault-guard';

const client = axios.create({ baseURL: 'https://httpbin.org' });
applyAxiosResilience(client, { retry: { retries: 2, minDelayMs: 200 } });

try {
  await client.get('/status/500');
} catch (err) {
  console.error('Request failed after resilience handling:', err.message);
}
```

3. Low-level: use `CircuitBreaker` directly for custom flows

```ts
import { CircuitBreaker } from '@leprekon-hub/fault-guard';

const cb = new CircuitBreaker(3, 1, 15000);

try {
  const res = await cb.exec(() => fetch('https://example.com'));
} catch (err) {
  // handle open circuit or underlying error
}
```

## Error handling and semantics

- If a circuit is `OPEN`, calls through `wrap` will reject with `Error('Circuit is open')` until the timeout elapses.
- Retries will rethrow the last error if all attempts fail.
- Rate limiter rejections use `Error('Rate limiter: reservoir exhausted')` when the reservoir is depleted.

## Development

- Build: `npm run build`
- Test: `npm test`

## Contributing & License

Contributions welcome. The project is MIT licensed (see `LICENSE`).
