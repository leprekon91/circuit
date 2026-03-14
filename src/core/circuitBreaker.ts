export type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

import { Monitor } from '../types';

export class CircuitBreaker {
  private failures = 0;
  private successes = 0;
  private state: State = 'CLOSED';
  private nextAttempt = 0;

  constructor(
    private failureThreshold = 5,
    private successThreshold = 2,
    private timeoutMs = 60000,
    private monitor?: Monitor,
  ) {}

  public async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF_OPEN';
        this.monitor?.({ type: 'circuit.half_open', payload: { nextAttempt: this.nextAttempt } });
      } else {
        this.monitor?.({ type: 'circuit.reject', payload: { state: this.state } });
        throw new Error('Circuit is open');
      }
    }

    try {
      const res = await fn();
      this.onSuccess();
      return res;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.reset();
      }
    } else {
      this.reset();
    }
    this.monitor?.({
      type: 'circuit.success',
      payload: { state: this.state, successes: this.successes },
    });
  }

  private onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.trip();
    }
    this.monitor?.({ type: 'circuit.failure', payload: { failures: this.failures } });
  }

  private trip() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.timeoutMs;
    this.failures = 0;
    this.successes = 0;
    this.monitor?.({ type: 'circuit.trip', payload: { nextAttempt: this.nextAttempt } });
  }

  private reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.monitor?.({ type: 'circuit.reset', payload: {} });
  }
}
