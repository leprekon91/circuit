# fault-guard Project Guidelines

## Overview

TypeScript resilience library (`@leprekon-hub/fault-guard`, Node ≥ 16, ES2021).  
Mechanisms: `CircuitBreaker`, `Bulkhead`, `RateLimiter`, `retry`, `wrap()`.  
Source layout: `src/core/` — mechanisms | `src/__tests__/` — Vitest tests | `docs/` — Markdown docs | `src/adapters/` — framework adapters.

## Architecture

`wrap()` in `src/core/wrap.ts` is the central API. It composes all mechanisms as a **linear pipeline** around a user `fn`:

```
rate limiter (outermost) → bulkhead → retry → circuit breaker → fn (innermost)
```

Steps are added in source order from innermost to outermost; the last step added is the first to execute.

**Instance sharing** — `BulkheadLike` / `RateLimiterLike` structural interfaces in `src/types.ts` allow callers to pass a pre-built instance to `wrap()`. Each step's `resolve*()` helper duck-types the argument to decide whether to build a new instance or use the one provided.

## Coding Conventions

- Timer types: `ReturnType<typeof setInterval> | null` — not `NodeJS.Timeout`.
- Null checks on keys: `key == null` — not `!key` (avoids treating `''` as absent).
- Swallowing errors silently: `catch { }` (optional catch binding, no variable) — satisfies lint without declaring an unused binding.
- Implementing `.unref()` on timers: `(timer as unknown as { unref?: () => void }).unref?.()`.
- Duck-typing instances vs options objects: `typeof x.exec === 'function'` for `BulkheadLike`; `typeof x.schedule === 'function'` for `RateLimiterLike`.
- All private timer fields are null-initialized: `private cleanupTimer: ReturnType<typeof setInterval> | null = null`.

## Testing Conventions

Framework: **Vitest** with fake timers.

- Wrap timer setup in block-body callbacks to avoid TS return-type errors:
  ```ts
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  ```
- Prevent unhandled rejection errors in timer-driven tests — attach a noop handler *before* any `await`:
  ```ts
  const p = wrap(fn, opts);
  void p.catch(() => {}); // prevent unhandled rejection if timers fire before .rejects attaches
  await vi.runAllTimersAsync();
  await expect(p).rejects.toThrow('...');
  ```
- Use shared instances (`new RateLimiter(1)`, `new Bulkhead(1, 0)`) when a test needs to prove shared concurrency limits.
- Always call `bh.shutdown()` in tests that create a `Bulkhead` with `idleTimeoutMs` — prevents `setInterval` leaks.

## Build & Test

```sh
npm run test      # vitest --run
npm run build     # tsup → dist/
npm run lint      # eslint src/
npm run format    # prettier
```

## Docs

Per-mechanism Markdown in `docs/`. Key files:
- `docs/wrap.md` — pipeline ordering, instance sharing, `WrapOptions` table.
- `docs/monitoring.md` — complete event table for all mechanisms.

See `docs/index.md` for the overview linking all docs.
