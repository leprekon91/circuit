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
 	monitor?: Monitor;
}

export interface WrapOptions {
	retry?: RetryOptions;
	circuit?: CircuitOptions;
	rateLimit?: RateLimitOptions;
 	monitor?: Monitor;
}
