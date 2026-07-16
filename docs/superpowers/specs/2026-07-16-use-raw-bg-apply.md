# Use-raw toggle: background apply (return `apply_pending` immediately)

**Date:** 2026-07-16
**Status:** Ratified (autonomous-ship pipeline; user review gates waived)
**Parent spec:** `docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md` §9b (per-show toggle action). This spec AMENDS §9b step (3) only — the apply delegation moves post-response. Everything else in the parent spec (decision model §3, guards §4, control states §8, wizard path §9a) is unchanged.

## 1. Problem

Each click on the `<UseRawControl>` choice group runs the FULL apply pipeline inline in the server action before the client transition resolves: `setUseRawDecisionAction` awaits `runManualSyncForShow(driveFileId)` (`app/admin/show/[slug]/_actions/useRaw.ts:157`) — a Drive fetch + re-parse + entity rewrite. The control soft-disables both rows while the transition is in flight (`busy = state === "pending"`, `components/admin/UseRawControl.tsx:413`, `disabled={busy}` at `:453`/`:483`), so the admin waits multiple seconds per toggle and cannot compare readings quickly.

The wait buys nothing the durable state machine doesn't already provide: the decision row is committed and durable before the sync starts, the UI has an honest `apply-pending` state with copy "Saved. The crew-visible values will update on the next successful sync." (`components/admin/UseRawControl.tsx:513-517`), and a failed or skipped apply already self-heals on the next scheduled sync (parent spec §9b).

## 2. Change

`setUseRawDecisionAction` keeps everything up to and including the post-commit emit and the synchronous revalidate, then **schedules the apply as a post-response task and returns `{ ok: true, state: "apply_pending" }` immediately** instead of awaiting the sync.

### 2.1 New helper — `lib/async/deferPostResponse.ts`

A plain module (NOT `"use server"` — a `"use server"` file may only export server actions, and a function-typed dep cannot ride the action's serialized argument channel without widening the wire surface):

```ts
import { after } from "next/server";

/** Schedule `task` to run after the current response is sent (Next `after()`).
 *  Callers own the task's error handling — a rejected task must be caught
 *  inside the task body; this helper never awaits it. */
export function deferPostResponse(task: () => Promise<void>): void {
  after(task);
}
```

- Why a module and not an injectable `deps` parameter: the two existing defer patterns (`app/api/drive/webhook/route.ts:60` `deps.defer`, `app/api/admin/onboarding/finalize-cas/route.ts:50` `deps.deferRevalidate`) live in route handlers, where deps stay server-side. A server action's parameters are the client-facing wire format — an optional `deps` argument on `setUseRawDecisionAction` would be attacker-reachable (any POST can append arguments). Tests mock the module with `vi.mock` instead.
- `after()` is legal in a server action's request scope (Next canary docs; the E468 no-request-scope throw applies only outside a request, i.e. in unit tests — which mock this module and never reach the real `after`).
- Precedent for doing cache revalidation inside an `after()` callback: `app/api/admin/onboarding/finalize-cas/route.ts:1026-1031` calls `revalidateShow(...)` inside its deferred callback.

### 2.2 Action change — `app/admin/show/[slug]/_actions/useRaw.ts`

Current step (3) (`useRaw.ts:152-170`): await `runManualSyncForShow`, map `outcome === "applied"` to `settled`, revalidate, return.

New step (3):

```ts
// (3) Non-settled write → schedule the apply post-response (its OWN lock —
// sequential, not nested). The decision is durable; the UI shows apply-pending
// and self-heals when the sync lands (or on the next scheduled sync).
try {
  deferPostResponse(async () => {
    try {
      await runManualSyncForShow(driveFileId);
    } catch {
      // runManualSyncForShow logs internally; the decision stays durable
      // (apply-pending) and applies on the next successful sync.
    }
    revalidateShow(id);
  });
} catch {
  // A synchronous scheduling fault must not escape after the decision has
  // committed and the outcome emitted — the durable state is identical.
}
revalidateShow(id);
return { ok: true, state: "apply_pending" };
```

- The **task body** catches its own sync rejection (helper contract §2.1) so a background failure can never surface as an unhandled rejection (post-response, an uncaught rejection would crash the serverless invocation rather than 500 the request — strictly worse than the current in-request catch).
- **Failure observability is exact parity with today, not a new dark path.** The current inline call already discards thrown faults with the identical rationale — `useRaw.ts:160-168`, a comment block ratified in the parent milestone's adversarial review (Codex R6 F3). Returned (non-thrown) sync failures are logged INSIDE `runManualSyncForShow` itself: every processed outcome is written under the pipeline lock via `logSync` (`lib/sync/runScheduledCronSync.ts:2677` — "Shared by cron / push / manual (all route their apply through processOneFile)"), and parse/infra failures produce durable `pending_ingestions` / `admin_alerts` rows on their return paths (`lib/sync/runManualSyncForShow.ts:177`, `:249`). Moving the call post-response changes WHERE the swallow happens, not WHAT is observable. No new mutation surface is created (invariant 10: the action's own `logAdminOutcome` emit is untouched).
- `revalidateShow(id)` runs **both** synchronously before return (so the tag is already busted when the boundary's post-resolve `router.refresh()` (`components/admin/UseRawControlBoundary.tsx:78`) re-fetches the route — the refreshed render carries the persisted decision and the control derives `apply-pending`; the action's own return payload is only `{ ok, state }`) **and** inside the task after the sync settles (so the next page load reflects the applied flip; runs regardless of sync outcome, mirroring current `useRaw.ts:169` which revalidates after the try/catch).
- The outer `try/catch` around `deferPostResponse` mirrors the invariant-9 spirit already applied to this exact spot (`useRaw.ts:160-168`): after the commit + emit, no throw may escape to the client.

### 2.3 Result semantics

`SetUseRawDecisionResult` type is UNCHANGED (`useRaw.ts:39-43`). Meaning shift:

| Return | Before | After |
| --- | --- | --- |
| `{ ok: true, state: "settled" }` | no-op toggle; already-settled write; OR mutated write whose inline re-sync applied | no-op toggle; already-settled write (both unchanged — `useRaw.ts:135`, `:147-150`) |
| `{ ok: true, state: "apply_pending" }` | mutated write whose inline re-sync failed/blocked/skipped/threw | EVERY mutated non-settled write (apply always backgrounds) |

No caller branches on the two `ok:true` states: `UseRawControlBoundary.onToggle` throws only on `!result.ok` (`components/admin/UseRawControlBoundary.tsx:53-79` — "THROWS on `!result.ok`"), and the control re-derives its state from the revalidated `decision` prop. Grep-verified: no other `setUseRawDecisionAction` call sites.

### 2.4 What does NOT change

- **Steps (1)–(2) and the emit:** pre-lock show resolve, locked re-read/validate/write, `logAdminOutcome` (`await` load-bearing, invariant 10) — all stay synchronous and ordered exactly as today (`useRaw.ts:56-150`).
- **Lock topology (invariant 2):** still two SEQUENTIAL acquisitions, never nested — the decision lock (`withShowLock`, `useRaw.ts:78`) fully releases before the action returns; the deferred `runManualSyncForShow` acquires its own pipeline lock (`lib/sync/runManualSyncForShow.ts:297-298`) after the response. Single-holder rule intact; `tests/auth/advisoryLockRpcDeadlock.test.ts` topology unaffected (no holder added, moved, or removed).
- **Wizard/staged path:** `setStagedUseRawDecisionAction` never runs a re-sync (parent spec §9a; the wizard never reaches apply states) — untouched.
- **UI:** zero file changes. `deriveUseRawControlState` (`components/admin/UseRawControl.tsx:53-72`) already renders `apply-pending`/`clear-pending` from the persisted decision; rows re-enable as soon as the transition resolves. The marker honestly reads "Selected" (not "In use") until the background sync lands and a later navigation/refresh delivers the applied decision (`components/admin/UseRawControl.tsx:433-434` — critique P2 contract preserved).
- **`admin_alerts` / §12.4:** no new codes, no catalog rows, no UI copy.
- **DB:** no schema change, no migration.

## 3. Concurrency & failure matrix

| Scenario | Behavior |
| --- | --- |
| Admin toggles again while a background apply is in flight | Rows are enabled (`apply-pending` ≠ `pending`). Second toggle commits the new decision under the show lock, schedules another background sync. **The decision write and the sync hold the SAME advisory key**: `withPostgresSyncPipelineLock` delegates to the same `withShowLock(driveFileId, …)` (`lib/sync/runScheduledCronSync.ts:1853-1860`), and `withShowLock` locks `hashtext('show:' \|\| $1)` (`lib/sync/lockedShowTx.ts:59-61`); both the action (`useRaw.ts:78`, blocking — "Blocking lock never skips", `useRaw.ts:125-126`) and the manual sync (`tryOnly: false`, `lib/sync/runManualSyncForShow.ts:298`) take the BLOCKING variant. So every decision write and every apply fully serialize per show: either toggle-2's write lands before sync-1 acquires (sync-1 applies decision-2; sync-2 re-applies, a no-op) or after sync-1 releases (sync-2 applies decision-2). In both interleavings the last COMMITTED decision is the one applied at rest — each sync reads decisions from the DB inside its own lock, never from a captured snapshot. |
| Background sync throws | Caught inside the task body; `runManualSyncForShow` logs internally. Decision stays durable `apply-pending`; next scheduled sync applies it (parent spec §9b self-heal). `revalidateShow` still fires. |
| Background sync blocked/skipped (archived, concurrent, source gone) | Same as today's non-applied outcomes: decision stays `apply-pending`, UI copy already covers it. |
| `after()` scheduling itself throws synchronously | Outer catch; return `apply_pending`; scheduled-sync path degrades to the existing cron self-heal. Accepted (R2 A3): no dedicated telemetry for the scheduling fault itself — an `after()` runtime regression surfaces as lingering `apply-pending` state that the next scheduled sync clears; invariant 10 stays satisfied by the unchanged admin outcome emit. |
| Serverless runtime teardown kills the task mid-sync | Vercel keeps the function alive for `after()` callbacks (`waitUntil` semantics); if the platform still kills it, the decision is durable and the next scheduled sync applies — identical to a failed inline sync today. |
| Toggle to a state that needs no sync (`alreadySettled`, `!mutated`) | Unchanged early returns (`useRaw.ts:135`, `:147-150`) — no task scheduled. |

## 4. Testing

All in `tests/admin/setUseRawDecisionAction.test.ts` (existing suite; mocks `runManualSyncForShow` at `tests/admin/setUseRawDecisionAction.test.ts:73-78`), plus a `vi.mock` of `lib/async/deferPostResponse` that records scheduled tasks for explicit, awaited draining (never fire-and-forget in tests — no promise may leak past teardown).

1. **Mutated non-settled write returns `apply_pending` WITHOUT running the sync inline** — action resolves `{ ok: true, state: "apply_pending" }`; `runManualSyncForShowMock` NOT yet called; exactly one task recorded by the defer mock. Failure mode caught: reintroducing the inline await.
2. **Drained task runs the sync then revalidates** — after `await task()`, `runManualSyncForShowMock` called once with `driveFileId`; `revalidateShow` called for the show id. Ordering assertions are explicit (R2 A2): assert spy count is exactly 1 IMMEDIATELY after the action resolves and BEFORE draining (catches the pre-return call moving into the task), then exactly 2 after `await task()`. Failure mode: task scheduled but empty / wrong file id / revalidate dropped from the task.
3. **Background sync rejection is contained** — mock sync to reject; `await task()` resolves (does not reject); `revalidateShow` still fired. Failure mode: unhandled rejection / revalidate skipped on failure (regression of current `useRaw.ts:169` always-revalidate).
4. **Settled paths schedule nothing** — `alreadySettled` and `!mutated` toggles record zero tasks (extends existing `not.toHaveBeenCalled()` assertions at `:157`, `:174`). Failure mode: background task leaking onto no-op paths.
5. **Emit ordering preserved** — `logAdminOutcome` observed before the action resolves on mutated writes (existing assertions retained). Failure mode: emit moved into the background task.
6. **Existing tests updated, not deleted** — the three current inline-sync-outcome tests (applied→`settled` at `:146`, returned-failure→`apply_pending` at `:243`/`:254`, thrown-fault→`apply_pending` at `:257-270`) become the drained-task equivalents above; the thrown-fault test's assertion that the throw "does NOT escape" moves to the task-containment test (test 3).
7. **Synchronous scheduling fault is contained** — mock `deferPostResponse` to THROW synchronously; action still resolves `{ ok: true, state: "apply_pending" }`, `logAdminOutcome` was called before resolution, and `revalidateShow` fired (the synchronous pre-return call). Failure mode: a scheduling fault escaping to the client after the decision committed and the outcome emitted (spec §2.2 outer catch).
8. **An `outcome: "applied"` sync no longer upgrades the result to `settled`** — with the sync mock resolving `{ outcome: "applied" }` (the suite's default), the action returns `apply_pending` BEFORE the task is drained, and draining does not retroactively change anything the action returned. Pins the §2.3 semantic shift; failure mode: reintroducing the `sync.outcome === "applied" → settled` mapping (current `useRaw.ts:157-159`, `:170`).
9. **Helper unit test** — new `tests/async/deferPostResponse.test.ts` mocking `next/server`: `deferPostResponse(task)` passes EXACTLY `task` to `after()` (same function reference), does not invoke it, does not await it, and returns `undefined` synchronously. Failure mode: the helper awaiting or invoking the task inline (which would reintroduce the blocking wait), or wrapping it so `after()` receives a different callable than the caller's task.

Meta-test inventory (declared per AGENTS.md):

- `tests/log/_metaMutationSurfaceObservability.test.ts` / `_auditableMutations.ts`: NO new surface — `setUseRawDecisionAction` rows already registered (`tests/log/_auditableMutations.ts:335`, `:340`); emit unchanged.
- `tests/auth/_metaInfraContract.test.ts`: no new Supabase call sites (the new helper contains none).
- `tests/auth/advisoryLockRpcDeadlock.test.ts`: topology unchanged (no holder added/moved) — no extension needed.
- No new registry required for `lib/async/deferPostResponse.ts`: it is a 5-line scheduling shim with no Supabase, no email, no log calls.

## 5. Out of scope

- Auto-refreshing the client when the background sync lands (would need polling or realtime push; the honest "Selected" marker + next-refresh flip is the accepted tradeoff, chosen explicitly in conversation 2026-07-16).
- A rendered integration test that the boundary's `router.refresh()` (`components/admin/UseRawControlBoundary.tsx:78`) re-renders the control into `apply-pending` after the synchronous revalidate. Accepted gap (R1 F5, advisory): jsdom cannot execute an RSC refresh round-trip, and the two halves are each already pinned — the action's synchronous `revalidateShow` (test 2's first spy call) and `deriveUseRawControlState`'s `{preference:"raw", applied:false} → apply-pending` mapping (existing coverage: `tests/components/UseRawControl.test.tsx:108-111` plus the transition matrix in `tests/components/UseRawControl.transitions.test.tsx`). The composition is exercised by the existing per-show surface e2e flow, not duplicated here.
- Skipping the Drive fetch on toggle re-syncs (option 3 in the conversation — rejected for blast radius).
- Any change to the wizard/staged surface, the cron path, or `runManualSyncForShow` itself.
