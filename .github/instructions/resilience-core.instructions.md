---
applyTo: "src/core/**"
description: "Resilience self-review checklist for editing core mechanism files."
---

# Resilience Core — Edge-Case Checklist

When editing any file in `src/core/`, verify these before finishing:

## CircuitBreaker

- [ ] Any failure in `HALF_OPEN` state must **immediately re-open** the circuit — do not accumulate `failures` and wait for `failureThreshold`.
- [ ] `circuit.success` event payload must be snapshotted **before** `reset()` is called, because `reset()` zeroes `successes` and changes `state`.
- [ ] `circuit.reset` is emitted **only** on `HALF_OPEN → CLOSED` transition — never on ordinary CLOSED-state successes.

## RateLimiter

- [ ] Reservoir tokens must be reserved **up-front** in `schedule()`, before the run-or-queue decision. Never re-check the reservoir when dequeuing a waiting job.
- [ ] `refillIfNeeded` must credit **all** fully-elapsed intervals (`Math.floor(elapsed / interval)`), not just one.
- [ ] Advance `lastRefill` by `intervals * intervalMs`, not by `Date.now()`, to avoid boundary drift.
- [ ] `run()` must **not** decrement `reservoir` — it was already decremented in `schedule()`.

## Bulkhead

- [ ] Key presence checks use `key == null`, not `!key` — the empty string `''` is a valid key.
- [ ] `startCleanup()` guards against double-start with `if (this.cleanupTimer) return`.
- [ ] `stopCleanup()` sets `this.cleanupTimer = null` after `clearInterval`.
- [ ] `maxKeys` enforcement tries to evict idle pools first before throwing.
- [ ] `idleTimeoutMs` tests must call `bh.shutdown()` to prevent setInterval leaks.

## General

- [ ] Timer field types are `ReturnType<typeof setInterval> | null`, never `NodeJS.Timeout`.
- [ ] `.unref()` calls use `(timer as unknown as { unref?: () => void }).unref?.()`.
- [ ] Silent error suppression uses `catch { }` — no unused binding variable.
