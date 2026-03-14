# SKILL: Add a new mechanism to fault-guard

Purpose
-------
This SKILL documents the exact, project-specific steps for adding a new resilience mechanism to `fault-guard` so it matches the repository's conventions (code layout, types, monitoring hooks, tests, exports, and docs).

When to use
-----------
- Add a mechanism when you need a new resilience primitive (e.g., concurrency window, bulkhead, token bucket) not already covered by `retry`, `CircuitBreaker`, or `RateLimiter`.

Files & locations (concrete)
----------------------------
- Implementation: `src/core/<mechanism>.ts` (class or function).
- Types: extend `src/types.ts` with `<Mechanism>Options` including `monitor?: Monitor`.
- Core exports: add to `src/core/index.ts`.
- Package exports/types: update `src/index.ts` to re-export public types if needed.
- Tests: `src/__tests__/<mechanism>.test.ts`.
- Docs: `docs/<mechanism>.md` and add entry to `docs/index.md`.

Required API shape & patterns (copy existing conventions)
------------------------------------------------------
1) Shape
- Class-based stateful mechanisms should expose one of:
  - `exec<T>(fn: () => Promise<T>): Promise<T>` (like `CircuitBreaker`), or
  - `schedule<T>(fn: () => Promise<T>): Promise<T>` (like `RateLimiter`).
- Stateless/functional helpers should be `export async function mechanism<T>(fn: () => Promise<T>, opts?: MechanismOptions): Promise<T>` (like `retry`).

2) Types
- Add mechanism options to `src/types.ts` and include `monitor?: Monitor` on the options interface.
- The repository `Monitor` type lives in `src/types.ts`:

  export type Monitor = (event: { type: string; payload?: Record<string, unknown> }) => void;

3) Monitoring
- Emit monitoring events at meaningful lifecycle points using `monitor?.(...)`.
- Event naming: use dotted namespace `mechanism.action` (e.g., `newMechanism.start`, `newMechanism.complete`, `newMechanism.error`).
- Keep payloads minimal and JSON-serializable.
- If mechanism participates in `wrap`, ensure `wrap` forwards `opts.monitor` into the mechanism's constructor or function. Follow pattern in `src/core/wrap.ts`:

  const limiter = rate ? new RateLimiter(..., opts.monitor) : null;
  const breaker = circuit ? new CircuitBreaker(..., opts.monitor) : null;

4) Error & async behavior
- Avoid synchronous throws from async code paths that are expected to be asynchronous by callers. If you must throw synchronously for invalid config, do it clearly in constructor; otherwise defer invocation of user `fn()` to a macrotask like `new Promise(res => setTimeout(res, 0)).then(() => fn())`, consistent with `retry`.

5) Exports
- Add symbol to `src/core/index.ts` and re-export public types (if any) from `src/index.ts`.

Testing: exact patterns
----------------------
- Location: `src/__tests__/<mechanism>.test.ts`.
- Use Vitest helpers used in this repo:
  - `vi.useFakeTimers()` / `vi.useRealTimers()` in setup/teardown.
  - Drive timers with `vi.advanceTimersByTime(ms)` and `await vi.runAllTimersAsync()`.
- For tests that expect promises to reject after timer-based delays, attach `.catch(() => {})` early if you advance timers before awaiting to avoid unhandled-rejection races.
- For monitoring assertions: provide a `monitor` callback that pushes events into an array. Assert on `events.map(e => e.type)` and specific payload fields.

Test checklist (must cover):
- Success path: mechanism allows successful execution and emits expected monitor events.
- Failure path: mechanism handles failing `fn()` correctly (retries/trips/queues) and emits error events.
- Edge behavior: concurrency, queueing, reservoir exhaustion, or state transitions as applicable.
- Integration with `wrap`: add a simple test calling `wrap(fn, { <mechanism>: { ... }, monitor })` and assert events propagate.

Docs: exact steps
-----------------
1. Add `docs/<mechanism>.md` with sections:
   - Short description
   - Public API / constructor or function signature
   - Options mapping (link to `src/types.ts`) and defaults
   - Monitoring events list and example payloads
   - Minimal usage example and `wrap` integration example
2. Add an entry to `docs/index.md` (preserve alphabetical or logical order).
3. Keep `README.md` short; link to `docs/index.md` rather than copying content.

Export & build checklist (pre-PR)
--------------------------------
- Lint / format: repo uses `prettier` and ESLint; run `npm run format` and `npm run lint` if configured.
- Tests: run `npm test` and ensure all tests pass.
- Build: run `npm run build` to ensure emitted type definitions and bundles build.

Concrete example (class-based skeleton)
--------------------------------------
Create `src/core/newMechanism.ts`:

```ts
import { Monitor } from '../types';

export interface NewMechanismOptions { concurrency?: number; monitor?: Monitor }

export class NewMechanism {
  constructor(private opts: NewMechanismOptions = {}) {}

  public async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.opts.monitor?.({ type: 'newMechanism.start', payload: {} });
    try {
      const res = await fn();
      this.opts.monitor?.({ type: 'newMechanism.success', payload: {} });
      return res;
    } catch (err) {
      this.opts.monitor?.({ type: 'newMechanism.error', payload: { error: String(err) } });
      throw err;
    }
  }
}
```

Then export from `src/core/index.ts` and add options to `src/types.ts`.

Concrete example (functional skeleton)
-------------------------------------
Create `src/core/newHelper.ts`:

```ts
import { Monitor } from '../types';

export interface NewHelperOptions { attempts?: number; monitor?: Monitor }

export async function newHelper<T>(fn: () => Promise<T>, opts: NewHelperOptions = {}) {
  opts.monitor?.({ type: 'newHelper.attempt', payload: { attempt: 1 } });
  return await new Promise((res) => setTimeout(res, 0)).then(() => fn());
}
```

PR description template (use for the PR)
---------------------------------------
- Summary: what the mechanism does.
- Files added/changed: list implementation, types, exports, tests, docs.
- Public API & examples: short code snippet.
- Test coverage: what tests were added and what they validate.
- Notes on monitoring events: list event names and payload examples.

Repository-specific gotchas to watch for
--------------------------------------
- `retry` intentionally defers user invocation to avoid synchronous rejection races — follow this when invoking user `fn()` inside loops.
- Circuit breaker currently throws `Error('Circuit is open')` synchronously when open; we added a `circuit.reject` monitor event in the current branch — document behavior if you change it.
- When adding a mechanism that participates in `wrap`, ensure `wrap` forwards `opts.monitor` (update `src/core/wrap.ts`).

If anything is unclear or you find inconsistent behavior while implementing, add a short note to the PR describing the observed behavior, include a minimal failing test, and open an issue if the change is a breaking API/behavior change.

End of SKILL.
