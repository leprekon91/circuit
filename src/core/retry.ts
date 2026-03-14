import { wait, calcExponentialDelay } from './backoff';
import { RetryOptions } from '../types';

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}) {
  const retries = opts.retries ?? 3;
  const base = opts.minDelayMs ?? 100;
  const factor = opts.factor ?? 2;
  const maxDelay = opts.maxDelayMs ?? 10000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      opts.monitor?.({ type: 'retry.attempt', payload: { attempt } });
      // ensure fn() is invoked asynchronously (macrotask) to avoid synchronous rejections
      return await new Promise((res) => setTimeout(res, 0)).then(() => fn());
    } catch (err) {
      lastErr = err;
      if (attempt > retries) break;
      const delay = calcExponentialDelay(attempt, base, factor, maxDelay);
      opts.monitor?.({ type: 'retry.delay', payload: { attempt, delay } });
      await wait(delay);
    }
  }
  // defer throwing to next macrotask so callers have a chance to attach handlers
  await new Promise((res) => setTimeout(res, 0));
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(String(lastErr));
}
