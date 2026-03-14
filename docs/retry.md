# Retry

The `retry` helper performs repeated attempts of an async function with exponential backoff.

Options (see `WrapOptions.retry` / `RetryOptions`):

- `retries` (number): max retry attempts (default: 3)
- `minDelayMs` (number): base delay (default: 100)
- `maxDelayMs` (number): max delay cap (default: 10000)
- `factor` (number): exponential factor (default: 2)

Events (monitor):

- `retry.attempt` — emitted before each attempt, payload: `{ attempt }`.
- `retry.delay` — emitted when sleeping between attempts, payload: `{ attempt, delay }`.

Usage example:

```ts
import { retry } from '@leprekon-hub/fault-guard';

await retry(() => fetch('/unstable'), { retries: 3, minDelayMs: 100 });
```
