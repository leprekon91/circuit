export type Fn<T> = () => Promise<T>;

export interface RetryOptions {
	retries?: number;
	minDelayMs?: number;
	maxDelayMs?: number;
	factor?: number;
}

export interface CircuitOptions {
	failureThreshold?: number; // failures before opening
	successThreshold?: number; // successes before closing
	timeoutMs?: number; // open duration
}

export interface RateLimitOptions {
	maxConcurrent?: number;
	reservoir?: number; // requests per interval
	reservoirRefreshIntervalMs?: number;
	reservoirRefreshAmount?: number;
}

export interface WrapOptions {
	retry?: RetryOptions;
	circuit?: CircuitOptions;
	rateLimit?: RateLimitOptions;
}
