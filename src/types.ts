export type Fn<T> = () => Promise<T>;

export type Monitor = (event: { type: string; payload?: Record<string, unknown> }) => void;

export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  monitor?: Monitor;
}

export interface CircuitOptions {
  failureThreshold?: number; // failures before opening
  successThreshold?: number; // successes before closing
  timeoutMs?: number; // open duration
  monitor?: Monitor;
}

export interface RateLimitOptions {
  maxConcurrent?: number;
  reservoir?: number; // requests per interval
  reservoirRefreshIntervalMs?: number;
  reservoirRefreshAmount?: number;
  reservoirMax?: number;
  monitor?: Monitor;
}

export interface BulkheadOptions {
  limit?: number;
  queueLimit?: number;
  monitor?: Monitor;
  keyed?: boolean;
  idleTimeoutMs?: number;
  maxKeys?: number;
  bulkheadKey?: () => string;
}

/** Structural interface satisfied by a `Bulkhead` instance, allowing callers to pass a shared instance into `wrap()`. */
export interface BulkheadLike {
  exec<T>(keyOrFn: string | (() => Promise<T>), maybeFn?: () => Promise<T>): Promise<T>;
  shutdown(): void;
}

/** Structural interface satisfied by a `RateLimiter` instance, allowing callers to pass a shared instance into `wrap()`. */
export interface RateLimiterLike {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export interface WrapOptions {
  retry?: RetryOptions;
  circuit?: CircuitOptions;
  /** Pass a `RateLimitOptions` object to create a one-off limiter, or a `RateLimiter` instance to share one across calls. */
  rateLimit?: RateLimitOptions | RateLimiterLike;
  /** Pass a `BulkheadOptions` object to create a one-off bulkhead, or a `Bulkhead` instance to share one across calls. */
  bulkhead?: BulkheadOptions | BulkheadLike;
  monitor?: Monitor;
}
