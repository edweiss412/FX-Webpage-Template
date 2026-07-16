# Use-Raw Background Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `setUseRawDecisionAction` returns `{ ok: true, state: "apply_pending" }` immediately after the decision commit + emit, deferring `runManualSyncForShow` post-response via a new `deferPostResponse` helper, so `<UseRawControl>` frees up in ~200ms instead of blocking on a full Drive re-sync.

**Architecture:** One new 5-line helper module (`lib/async/deferPostResponse.ts`) wrapping Next's `after()`; one edit to the tail of `setUseRawDecisionAction` (`app/admin/show/[slug]/_actions/useRaw.ts:152-171`) replacing the awaited sync with a deferred task. Zero UI changes; zero DB changes. Spec: `docs/superpowers/specs/2026-07-16-use-raw-bg-apply.md` (adversarially APPROVED 2026-07-16, 2 rounds).

**Tech Stack:** Next.js 16 App Router server actions, `next/server` `after()`, Vitest module mocks.

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (AGENTS.md invariant 1).
- Lock topology unchanged: decision lock releases before return; deferred sync acquires its OWN lock post-response — sequential, never nested (invariant 2). No `pg_advisory*` code is touched.
- `logAdminOutcome` emit stays synchronous, post-commit, `await` load-bearing (invariant 10). No new mutation surface.
- No new Supabase call sites (invariant 9) — the helper contains none.
- `SetUseRawDecisionResult` type unchanged; `settled` now means ONLY no-op/already-settled (spec §2.3).
- Commits: conventional-commits, one task per commit, `--no-verify` (worktree hook rule).
- Worktree: `/Users/ericweiss/FX-Webpage-Template-wt/use-raw-bg-apply` (preflight green). All paths below are relative to it.

## Meta-test inventory (declared per AGENTS.md)

- `tests/log/_metaMutationSurfaceObservability.test.ts` / `_auditableMutations.ts`: NO change — `setUseRawDecisionAction` rows already registered (`tests/log/_auditableMutations.ts:335`, `:340`); emit untouched.
- `tests/auth/_metaInfraContract.test.ts`: NO change — no new Supabase call sites.
- `tests/auth/advisoryLockRpcDeadlock.test.ts`: NO change — no lock holder added/moved/removed.
- No registry needed for `lib/async/deferPostResponse.ts` (no Supabase, no email, no log calls).

## Advisory-lock holder topology (declared; plan touches lock-ADJACENT code only)

Holders for `hashtext('show:' || driveFileId)` relevant to this diff, all pre-existing and unchanged: (1) the action's JS-side `withShowLock` (`useRaw.ts:78`, blocking); (2) the manual-sync pipeline wrapper `withPostgresSyncPipelineLock` → same `withShowLock` (`lib/sync/runScheduledCronSync.ts:1853`, blocking via `tryOnly:false` at `lib/sync/runManualSyncForShow.ts:298`). This plan only moves WHEN holder (2) fires (post-response instead of in-request). Single-holder-per-acquisition preserved; no topology test extension needed.

---

### Task 1: `deferPostResponse` helper

**Files:**
- Create: `lib/async/deferPostResponse.ts`
- Test: `tests/async/deferPostResponse.test.ts` (sibling of existing `tests/async/mapWithConcurrency.test.ts`)

**Interfaces:**
- Produces: `deferPostResponse(task: () => Promise<void>): void` — Task 2's action imports it as `@/lib/async/deferPostResponse`.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * tests/async/deferPostResponse.test.ts
 * Spec 2026-07-16-use-raw-bg-apply §4 test 9: the helper passes EXACTLY the
 * caller's task to Next's after() — same function reference, never invoked,
 * never awaited, void return. Failure mode caught: the helper awaiting or
 * invoking the task inline (reintroducing the blocking wait), or wrapping it
 * so after() receives a different callable.
 */
import { describe, expect, test, vi } from "vitest";

const afterMock = vi.fn();
vi.mock("next/server", () => ({ after: (fn: unknown) => afterMock(fn) }));

import { deferPostResponse } from "@/lib/async/deferPostResponse";

describe("deferPostResponse", () => {
  test("passes the exact task to after() without invoking or awaiting it", () => {
    const task = vi.fn(async () => {});
    const result = deferPostResponse(task) as unknown;
    expect(result).toBeUndefined();
    expect(afterMock).toHaveBeenCalledTimes(1);
    // Same reference — not a wrapper.
    expect(afterMock.mock.calls[0]![0]).toBe(task);
    expect(task).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/async/deferPostResponse.test.ts`
Expected: FAIL — `Cannot find module '@/lib/async/deferPostResponse'` (or equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * lib/async/deferPostResponse.ts
 * Schedule `task` to run after the current response is sent (Next `after()`).
 *
 * Plain module, NOT "use server": a "use server" file may only export server
 * actions, and a function-typed dep cannot ride an action's serialized
 * argument channel without widening the client-facing wire surface (spec
 * 2026-07-16-use-raw-bg-apply §2.1). Callers own the task's error handling —
 * a rejected task must be caught INSIDE the task body; this helper never
 * awaits it. Outside a request scope (unit tests), after() throws
 * synchronously — callers that must not throw post-commit wrap the call.
 */
import { after } from "next/server";

export function deferPostResponse(task: () => Promise<void>): void {
  after(task);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/async/deferPostResponse.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/async/deferPostResponse.ts tests/async/deferPostResponse.test.ts
git commit --no-verify -m "feat(sync): add deferPostResponse helper wrapping next/server after()"
```

---

### Task 2: Action returns `apply_pending` immediately; sync deferred

**Files:**
- Modify: `app/admin/show/[slug]/_actions/useRaw.ts:152-171` (step (3) tail) + imports at `:25-37`
- Test: `tests/admin/setUseRawDecisionAction.test.ts` (update existing + add spec §4 tests 1–8)

**Interfaces:**
- Consumes: `deferPostResponse(task)` from Task 1.
- Produces: unchanged `SetUseRawDecisionResult`; `state: "settled"` now ONLY from the `!mutated` (`useRaw.ts:135`) and `alreadySettled` (`useRaw.ts:147-150`) early returns.

- [ ] **Step 1: Update the test file — mocks and matrix (failing first)**

In `tests/admin/setUseRawDecisionAction.test.ts`:

(a) Add the defer mock + revalidate spy access. PLACEMENT IS LOAD-BEARING (plan-R1 F1): insert the block immediately after the `runManualSyncForShowMock` `vi.mock` block (line 77-79) and strictly BEFORE the `import { setUseRawDecisionAction } from …` line (line 82) — the same const-fn-then-`vi.mock`-factory pattern every other mock in this file uses (e.g. lines 16-22). If the mock lands after the action import, the action binds the REAL helper and tests hit `next/server` `after()` instead of the capture mock. `callOrder` (line 44) and `deferredTasks` must both be declared before the factory body runs. Replace the anonymous showCacheTag mock (line 32) so the spy is importable:

```ts
// REPLACE: vi.mock("@/lib/data/showCacheTag", () => ({ revalidateShow: vi.fn() }));
const revalidateShowMock = vi.fn((_id: string) => undefined);
vi.mock("@/lib/data/showCacheTag", () => ({
  revalidateShow: (id: string) => revalidateShowMock(id),
}));

// Deferred-task capture: the action must NEVER run the sync inline. Tests
// drain tasks explicitly and awaited — no promise may leak past teardown.
let deferredTasks: Array<() => Promise<void>>;
const deferPostResponseMock = vi.fn((task: () => Promise<void>) => {
  callOrder.push("defer:schedule");
  deferredTasks.push(task);
});
vi.mock("@/lib/async/deferPostResponse", () => ({
  deferPostResponse: (t: () => Promise<void>) => deferPostResponseMock(t),
}));
```

(b) In `beforeEach` (line 121), add `deferredTasks = [];` alongside the other resets.

(c) Update the four existing tests whose assertions change (spec §4 test 6):

```ts
// :143 "transform-active → ON writes {raw, applied:false} (NOT applied:true)" —
// result line becomes:
    expect(runManualSyncForShowMock).not.toHaveBeenCalled(); // deferred, not inline
    expect(deferredTasks).toHaveLength(1);
    expect(r).toEqual({ ok: true, state: "apply_pending" }); // spec 2026-07-16 §2.3

// :161 "raw-active → OFF writes {transform, applied:false} and delegates re-sync" —
// the sync-call assertion becomes drain-then-assert:
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
    await deferredTasks[0]!();
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
    expect(runManualSyncForShowMock).toHaveBeenCalledWith("df-server");

// :236 + :247 (R8 failure-symmetry pair): keep the hard_fail mock and the
// durable-write assertions; result stays apply_pending; add before the result line
// (length assertion FIRST — a missing schedule must fail as a contract violation,
// not a vague "deferredTasks[0] is not a function"; plan-R1 F3):
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
    await deferredTasks[0]!();   // drained task runs the failing sync; result already returned

// :257 thrown-fault test: the throw now happens inside the drained task
// (spec §4 test 3). Replace the tail after the action call with:
    expect(writtenDecisions()![0]).toMatchObject({ preference: "raw", applied: false });
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    // Containment: the drained task RESOLVES despite the sync throw, and the
    // in-task revalidate still fires (regression pin on always-revalidate).
    await expect(deferredTasks[0]!()).resolves.toBeUndefined();
    expect(revalidateShowMock).toHaveBeenCalledTimes(2);
```

(d) Update the two sequential-order tests (`:361-377`, "sequential-not-nested + delegated re-sync order"):

```ts
  test("apply is scheduled AFTER the decision lock releases; sync runs only when drained", async () => {
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "defer:schedule"]);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    await deferredTasks[0]!();
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "defer:schedule", "resync"]);
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
  });

  test("re-sync is NOT called inside the lock (no nested double-hold)", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    await deferredTasks[0]!();
    // "resync" must appear strictly after "lock:release".
    expect(callOrder.indexOf("resync")).toBeGreaterThan(callOrder.indexOf("lock:release"));
  });
```

(e) Add a new describe block (spec §4 tests 1, 2, 4, 7, 8):

```ts
describe("background apply (spec 2026-07-16-use-raw-bg-apply)", () => {
  test("mutated non-settled write returns apply_pending WITHOUT running the sync inline (test 1)", async () => {
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    expect(runManualSyncForShowMock).not.toHaveBeenCalled();
    expect(deferredTasks).toHaveLength(1);
  });

  test("drained task runs the sync then revalidates; pre-return revalidate already fired (test 2)", async () => {
    txScript.decisions = [];
    await setUseRawDecisionAction("show-1", ref(), true);
    // Exactly ONE revalidate before draining — the synchronous pre-return call
    // (catches the pre-return revalidate moving into the deferred task).
    expect(revalidateShowMock).toHaveBeenCalledTimes(1);
    expect(revalidateShowMock).toHaveBeenCalledWith("show-1");
    await deferredTasks[0]!();
    expect(runManualSyncForShowMock).toHaveBeenCalledTimes(1);
    expect(runManualSyncForShowMock).toHaveBeenCalledWith("df-server");
    expect(revalidateShowMock).toHaveBeenCalledTimes(2);
    expect(revalidateShowMock).toHaveBeenNthCalledWith(2, "show-1");
  });

  // Split per settled path (plan-R1 F2): each proves its own no-schedule AND
  // its settled result, with no spy state shared across action calls.
  test("alreadySettled write (clear-pending → ON) schedules nothing and returns settled (test 4a)", async () => {
    txScript.decisions = [{ ...rawDecision(false), preference: "transform" }];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "settled" });
    expect(deferredTasks).toHaveLength(0);
    expect(deferPostResponseMock).not.toHaveBeenCalled();
  });

  test("non-mutated toggle (apply-pending → ON) schedules nothing and returns settled (test 4b)", async () => {
    txScript.decisions = [rawDecision(false)];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "settled" });
    expect(deferredTasks).toHaveLength(0);
    expect(deferPostResponseMock).not.toHaveBeenCalled();
  });

  test("synchronous scheduling fault is contained: apply_pending, emit-before-schedule ordering intact (test 7)", async () => {
    // Ordering pin (plan-R1 F4): the scheduling attempt must come AFTER the
    // post-commit emit and AFTER lock release — a swallowed fault must not be
    // able to mask a reordering of the post-commit sequence.
    deferPostResponseMock.mockImplementationOnce(() => {
      callOrder.push("defer:throw");
      throw new Error("after() called outside a request scope");
    });
    logAdminOutcomeMock.mockImplementationOnce(async () => {
      callOrder.push("emit");
    });
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    expect(callOrder).toEqual(["lock:acquire", "lock:release", "emit", "defer:throw"]);
    // The action really called deferPostResponse WITH a task (plan-R2 F1) —
    // callOrder alone proves a local marker ran, not the call contract.
    expect(deferPostResponseMock).toHaveBeenCalledTimes(1);
    expect(deferPostResponseMock.mock.calls[0]![0]).toBeInstanceOf(Function);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(revalidateShowMock).toHaveBeenCalledTimes(1); // synchronous pre-return call
  });

  test("an applied sync outcome no longer upgrades the result to settled (test 8)", async () => {
    // Suite default mock resolves { outcome: "applied" } — the action must
    // return apply_pending BEFORE the task is drained, and draining changes
    // nothing about the returned value (pins spec §2.3; failure mode:
    // reintroducing the sync.outcome === "applied" → settled mapping).
    txScript.decisions = [];
    const r = await setUseRawDecisionAction("show-1", ref(), true);
    expect(r).toEqual({ ok: true, state: "apply_pending" });
    await deferredTasks[0]!();
    expect(r).toEqual({ ok: true, state: "apply_pending" });
  });
});
```

(f) Update the file-header comment (lines 1-10): replace "sequential-not-nested re-sync delegation" with "sequential-not-nested DEFERRED re-sync delegation (spec 2026-07-16-use-raw-bg-apply: apply is post-response; settled = no-op/already-settled only)".

- [ ] **Step 2: Run the suite to verify the new/updated tests fail**

Run: `pnpm vitest run tests/admin/setUseRawDecisionAction.test.ts`
Expected: FAIL — updated tests expecting `apply_pending` get `settled`; `deferredTasks` stays empty (module not yet imported by the action); order test sees `["lock:acquire","lock:release","resync"]`.

- [ ] **Step 3: Implement the action change**

In `app/admin/show/[slug]/_actions/useRaw.ts`:

(a) Add import (after line 24's imports, alphabetical with the `@/lib` group):

```ts
import { deferPostResponse } from "@/lib/async/deferPostResponse";
```

(b) Replace lines 152-170 (the entire step-(3) block from `// (3) Non-settled write …` through `return { ok: true, state: applied ? "settled" : "apply_pending" };`) with:

```ts
  // (3) Non-settled write → schedule the apply post-response (its OWN lock —
  // sequential, not nested; the decision lock above fully released before this
  // line). The decision is durable: the UI derives apply-pending from the
  // revalidated decision and self-heals when the background sync lands (or on
  // the next scheduled sync). Returning without awaiting the sync is the point:
  // the admin's toggle resolves in ~200ms instead of blocking on a full Drive
  // re-sync (spec 2026-07-16-use-raw-bg-apply §2.2). Failure observability is
  // parity with the previous inline call: returned sync failures are logged
  // inside runManualSyncForShow (logSync under the pipeline lock), and a THROWN
  // fault is contained in the task body so it can never crash the invocation
  // post-response.
  try {
    deferPostResponse(async () => {
      try {
        await runManualSyncForShow(driveFileId);
      } catch {
        // This catch handles only an unexpected THROWN fault, swallowed at exact
        // parity with the previous inline catch (spec 2026-07-16 §2.2). Returned
        // failure outcomes are not inspected here at all — runManualSyncForShow
        // records them itself (logSync under the pipeline lock). Either way the
        // decision stays durable (apply-pending) and applies on the next
        // successful sync.
      }
      revalidateShow(id);
    });
  } catch {
    // A synchronous scheduling fault (after() outside a request scope) must not
    // escape after the decision committed and the outcome emitted — the durable
    // state is identical either way; the next scheduled sync applies it.
  }
  revalidateShow(id);
  return { ok: true, state: "apply_pending" };
```

Note: the JSDoc header (lines 17-18, "(3) AFTER the lock releases, delegate to `runManualSyncForShow` … — unless the write is already settled") gets one wording touch: "delegate" → "schedule (post-response, via deferPostResponse)".

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm vitest run tests/admin/setUseRawDecisionAction.test.ts tests/async/deferPostResponse.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Verify the behavioral admin-outcome suite still passes**

`tests/log/adminOutcomeBehavior.test.ts` calls the REAL action (mocking `runManualSyncForShow` but NOT `deferPostResponse`), so the real helper's `after()` throws E468 outside a request scope — the action's outer catch must contain it and the emit assertions must hold unchanged. This is itself a live probe of the outer catch.

Run: `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts`
Expected: PASS. If any assertion in the use-raw section (`:3219+`) counts `runManualSyncForShowMock` calls, update it to expect zero inline calls (the section is emit-focused; sync-count assertions are not expected).

- [ ] **Step 6: Commit**

```bash
git add "app/admin/show/[slug]/_actions/useRaw.ts" tests/admin/setUseRawDecisionAction.test.ts
git commit --no-verify -m "feat(admin): use-raw toggle returns apply_pending immediately, defers re-sync post-response"
```

---

### Task 3: Full verification sweep (close-out gates)

**Files:** none created — verification only.

- [ ] **Step 1: Full test suite** — `pnpm test` — Expected: green (memory: scoped gates miss shared-chokepoint regressions).
- [ ] **Step 2: Typecheck** — `pnpm typecheck` — Expected: clean (vitest strips types; only tsc/build catch TS errors).
- [ ] **Step 3: Lint** — `pnpm exec eslint app/admin/show/\[slug\]/_actions/useRaw.ts lib/async/deferPostResponse.ts tests/async/deferPostResponse.test.ts tests/admin/setUseRawDecisionAction.test.ts` — Expected: clean.
- [ ] **Step 4: Format** — `pnpm format:check` — Expected: clean (pre-push hooks bypassed by --no-verify; CI quality gate runs this).
- [ ] **Step 5: Build** — `pnpm build` — Expected: success (server-action wiring class is only caught by `next build`).
- [ ] **Step 6: Meta-test spot-runs** — `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/auth/_metaInfraContract.test.ts` — Expected: green (declared-no-change proof).
- [ ] **Step 7: Commit any formatter fallout only if needed** (`chore: format sweep`), then proceed to whole-diff adversarial review (ship-feature Stage 4).

## Self-review notes

- Spec coverage: §2.1→Task 1; §2.2/§2.3→Task 2; §4 tests 1-8→Task 2 step 1, test 9→Task 1; §3 matrix rows are covered by tests 3/4/7/8 + unchanged early-return tests; §2.4 no-change claims→Task 3 step 6 meta-runs.
- No placeholders; all code inline; types consistent (`deferPostResponse(task: () => Promise<void>): void` used identically in Tasks 1-2).
- UI untouched → no impeccable gate; no migrations → no validation-parity step.
