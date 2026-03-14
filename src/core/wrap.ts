import { retry } from './retry';
import { CircuitBreaker } from './circuitBreaker';
import { RateLimiter } from './rateLimiter';
import { WrapOptions } from '../types';

export async function wrap<T>(fn: () => Promise<T>, opts: WrapOptions = {}): Promise<T> {
  const rate = opts.rateLimit;
  const circuit = opts.circuit;
  const retryOpts = opts.retry;

  const limiter = rate
    ? new RateLimiter(
        rate.maxConcurrent ?? 10,
        rate.reservoir,
        rate.reservoirRefreshIntervalMs,
        rate.reservoirRefreshAmount ?? 0,
        rate.monitor ?? opts.monitor,
      )
    : null;
  const breaker = circuit
    ? new CircuitBreaker(
        circuit.failureThreshold ?? 5,
        circuit.successThreshold ?? 2,
        circuit.timeoutMs ?? 60000,
        circuit.monitor ?? opts.monitor,
      )
    : null;

  const exec = async () => {
    const inner = async () => {
      const target = breaker ? () => breaker.exec(fn) : fn;
      if (retryOpts)
        return retry(target, { ...retryOpts, monitor: retryOpts.monitor ?? opts.monitor });
      return target();
    };

    if (limiter) return limiter.schedule(inner);
    return inner();
  };

  return exec();
}
