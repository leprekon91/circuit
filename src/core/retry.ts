import { wait, calcExponentialDelay } from './backoff';
import { RetryOptions } from '../types';

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}) {
  const retries = opts.retries ?? 3;
  const base = opts.minDelayMs ?? 100;
  const factor = opts.factor ?? 2;
  const maxDelay = opts.maxDelayMs ?? 10000;

  let lastErr: unknown;
  // `attempt` is 1-based and covers all calls including the first. Consumers that only
  // want to observe retries (not the initial attempt) should filter by `attempt >= 2`.
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      opts.monitor?.({ type: 'retry.attempt', payload: { attempt } });
      // Defer fn() to the next macrotask so that synchronous throws become rejections
      // and callers have already had a chance to attach .catch() handlers.
      return await new Promise((res) => setTimeout(res, 0)).then(() => fn());
    } catch (err) {
      lastErr = err;
      if (attempt > retries) break;
      const delay = calcExponentialDelay(attempt, base, factor, maxDelay);
      opts.monitor?.({ type: 'retry.delay', payload: { attempt, delay } });
      await wait(delay);
    }
  }
  // One final macrotask deferral keeps throw timing consistent with the per-attempt deferral above.
  await new Promise((res) => setTimeout(res, 0));
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(String(lastErr));
}
