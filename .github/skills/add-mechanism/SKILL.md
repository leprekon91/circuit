---
name: add-mechanism
description: "Add a new resilience mechanism to fault-guard. Use when implementing a new core class like a timeout, hedge, or fallback. Covers: core implementation, types, wrap() pipeline integration, index export, tests, docs, and README update."
argument-hint: "Name of the new mechanism (e.g. 'timeout', 'hedge', 'fallback')"
---

# Add a New Resilience Mechanism

## When to Use

Use this skill when adding any new mechanism class to `src/core/` that should be composable via `wrap()`.

## Checklist

Work through these steps in order. Each step has a concrete file target and a pattern to follow.

### 1. Core Implementation — `src/core/<name>.ts`

Implement the class. Follow the patterns already established:

- Constructor accepts options with sensible defaults, plus an optional `monitor?: Monitor` as the last parameter.
- Emit `monitor?.()` events at every significant decision point (acquire, release, reject, queue, etc.).
- Name events `<mechanism>.<event>` (e.g. `timeout.exceeded`).
- Timer fields: `private timer: ReturnType<typeof setInterval> | null = null`.
- Key/null guards: `key == null`, not `!key`.
- `.unref()`: `(timer as unknown as { unref?: () => void }).unref?.()`.
- Error swallowing: `catch { }`.
- Provide a `shutdown()` method if the class holds a timer.

### 2. Types — `src/types.ts`

Add two exports:

```ts
// Options object passed via WrapOptions
export interface <Name>Options {
  // ...fields with inline comments
  monitor?: Monitor;
}

// Structural interface allowing pre-built instances to be passed to wrap()
export interface <Name>Like {
  <primaryMethod><T>(fn: () => Promise<T>): Promise<T>;
}
```

Widen `WrapOptions` with a new field:
```ts
/** Pass an options object for a per-call instance, or a shared pre-built instance. */
<fieldName>?: <Name>Options | <Name>Like;
```

### 3. Pipeline Integration — `src/core/wrap.ts`

Decide where in the pipeline the mechanism belongs:

| Concern | Position |
|---|---|
| Guards the raw function call | Innermost (before circuit breaker) |
| Retries the call | Between circuit and bulkhead |
| Limits active concurrency | Bulkhead position |
| Queues/throttles before running | Outermost (after rate limiter) |

Add a new numbered step comment and `resolve*()` helper matching the existing style:

```ts
// N. <Name>: <one-line rationale for its pipeline position>
if (opts.<fieldName>) {
  const m = resolve<Name>(opts.<fieldName>, opts.monitor);
  const prev = step;
  step = () => m.<primaryMethod>(prev);
}
```

Add the resolver helper at the bottom:

```ts
function resolve<Name>(x: <Name>Options | <Name>Like, monitor?: Monitor): <Name>Like {
  if (typeof (x as <Name>Like).<primaryMethod> === 'function') return x as <Name>Like;
  const o = x as <Name>Options;
  return new <Name>(/* map fields from o */);
}
```

Update the pipeline diagram comment at the top of the function.

### 4. Export — `src/core/index.ts`

```ts
export { <Name> } from './<name>';
```

### 5. Tests — `src/__tests__/<name>.test.ts`

Cover minimum:
- [ ] Happy path: mechanism is transparent when limits are not exceeded.
- [ ] Limit enforcement: what happens when the limit is hit.
- [ ] Queue/reject behaviour (if applicable).
- [ ] Shared instance: two `wrap()` calls share the same limit.
- [ ] `shutdown()` called in tests that create instances with timers (prevent leaks).
- [ ] Monitor events: verify key events are emitted with correct payloads.

Use fake timers:
```ts
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
```

For rejection tests attach the error handler before any `await`:
```ts
const p = wrap(fn, opts);
void p.catch(() => {});
await vi.runAllTimersAsync();
await expect(p).rejects.toThrow('...');
```

### 6. Mechanism Docs — `docs/<name>.md`

Follow the structure of an existing doc (e.g. `docs/rateLimiter.md`):

1. Short description + constructor signature.
2. **When To Use** — real-world scenarios.
3. **How It Works** — internal behaviour summary.
4. **Key Options** — table or list.
5. **Monitoring & Events** — list of `<mechanism>.*` events.
6. **Examples** — minimal code snippets.
7. **Shared Instances** — if applicable.
8. **Best Practices**.

### 7. Monitoring Docs — `docs/monitoring.md`

Add a row for each new event to the event table.

### 8. Pipeline Docs — `docs/wrap.md`

Update the pipeline ASCII diagram and the `WrapOptions` table.

### 9. README — `README.md`

- Mention the new mechanism in the feature list.
- Add a usage example if it introduces a common pattern.
