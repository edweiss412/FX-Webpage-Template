# Re-sync Quality Gate — TDD Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-04-resync-quality-gate-design.md` (APPROVED)
**Worktree/branch:** `/Users/ericweiss/fxav-worktrees/resync-quality-gate` · `feat/resync-quality-gate`
**Date:** 2026-07-04

---

## Goal

On any re-sync of an **existing published show**, count-based **material shrinkage** (`MI-6` crew drop > 1, `MI-7` section shrink) must **not auto-clobber** live data. Instead: **retain last-good** (serve the previous roster/blocks unchanged — no `applyParseResult`) and **raise a pushed admin alert** (`RESYNC_SHRINK_HELD`) so a human is signaled. The admin resolves by (a) a **version-bound confirmed accept** on the existing `ReSyncButton` (applies the shrink) or (b) leaving it until Doug fixes the sheet, after which the next clean cron re-sync applies and the alert **auto-resolves for free** through the existing sync-problem recovery sweep.

This is audit finding #3 recommendation #2 (owner-chosen retain-last-good + alert, NOT staging — §10 of the spec).

## Architecture

Mirror the existing **hard-fail retain path** with a distinct outcome + code:

- **`lib/sync/phase1.ts`** (`runPhase1`) — where PF34 currently drops `MI-6`/`MI-7` to `pass`, add a **hold branch** returning a new `Phase1Result` variant `shrink_held`. The hold is bypassed ONLY by a **version-bound** `acceptShrink` (`acceptShrink === true && expectedModifiedTime === binding.modifiedTime`). phase1 writes `shows.last_sync_status='shrink_held'` via a new `updateShowShrinkHeld` tx method (mirrors `updateShowParseError`), touches **no** crew/room/hotel/contact rows.
- **`lib/sync/runScheduledCronSync.ts`** (`processOneFile_unlocked`) — a caller branch mirroring the `hard_fail` branch (`:2777-2806`): log, raise `RESYNC_SHRINK_HELD` via the tx-bound `upsertAdminAlert`, resolve OTHER stale sync-problem alerts (keep this one). Add `shrink_held` to `ProcessOneFileResult`; the file loop post-commit-revalidates via `showId` (busts the crew cache tag since `last_sync_status` changed).
- **Sync-problem peer code** — `RESYNC_SHRINK_HELD` joins `SYNC_PROBLEM_CODES` (→ digest push + realtime tier + recovery-sweep membership). `syncProblemCodeForStatus('shrink_held')` + `recoveryResolution.ts` (TS `STATUS_TO_CODE` + SQL `CASE`) map the status. Auto-resolve is **free** through the existing `resolveStaleSyncProblemAlerts_unlocked(tx, showId, null)` calls on every clean apply. **Never** `resolveAdminAlert` (it throws for inbox codes).
- **§12.4 admin-alert lockstep** — new catalog code `RESYNC_SHRINK_HELD` (`adminSurface:"inbox"`, mirror `PARSE_ERROR_LAST_GOOD`).
- **Manual accept flow** — route body params `acceptShrink`/`expectedModifiedTime` threaded through `runManualSyncForShow` → `processOneFile_unlocked` → `runPhase1`; route special-cases `shrink_held` (HTTP 200, `ok:true`) **before** the `"code" in result` error branch; `ReSyncButton` renders a confirm prompt with the shrink counts + a version-echoing "Apply reduced version" re-submit.
- **Status consumers** — `syncStatus.ts`, `driveConnectionHealth.ts`, and crew-facing `StaleFooter.tsx` gain a `'shrink_held'` case.
- **Alert action link** — `alertActions.ts` registers `RESYNC_SHRINK_HELD` → "Review & re-sync" → `/admin/show/<slug>#resync`; `page.tsx` wraps the `ReSyncButton` mount in `id="resync"`.

**No DB migration** — `shows.last_sync_status` is unconstrained `text` (`20260501000000_initial_public_schema.sql:23`). **No advisory-lock topology change** — hold + alert raise both run inside the existing per-show `withShowLock` cron tx; `discardStaged` untouched.

## Tech Stack

Next.js 16, Supabase (Postgres), TypeScript (strict), vitest (unit + DB-backed via `TEST_DATABASE_URL`), `postgres` (postgres.js). Client component uses React 19 (`ReSyncButton`).

## Global Constraints (plan-wide invariants that apply)

1. **TDD per task.** Every task: failing test → run (fails) → minimal implementation → run (passes) → commit. Never write implementation before the test that exercises it.
2. **Commit per task**, conventional-commits: `feat(sync)` / `test(sync)` for pipeline; `feat(admin)` / `feat(crew-page)` / `feat(messages)` for the respective surfaces; bare `chore:`/`docs:` only for cross-cutting regen/spec edits. One task = one commit; never batch.
3. **No raw error codes in user-visible UI** (invariant 5). All copy routes through `lib/messages/lookup.ts` / the §12.4 catalog. `ReSyncButton` renders errors via `<ErrorExplainer surface="admin" />`; the shrink confirm renders the alert `detail` string (a human message from `describeShrink`, never a bare code).
4. **§12.4 three-way+ lockstep** for the new `RESYNC_SHRINK_HELD` code (invariant 5 / AGENTS.md §12.4 rule): (a) master-spec §12.4 prose, (b) `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, (c) `lib/messages/catalog.ts` producer row — all in ONE commit. Plus for a NEW admin-alert code: `pnpm gen:internal-code-enums`, `app/help/errors/_families.ts`, and the `_metaAdminAlertCatalog` registry rows.
5. **Supabase call-boundary discipline** (invariant 9). This design adds **no new Supabase call boundary** — the alert raise reuses the existing tx-bound `upsertAdminAlert` helper (`requireTxBoundUpsertAdminAlert`) inside the already-locked cron tx; the new tx method `updateShowShrinkHeld` uses the same `this.rows(...)` chokepoint as `updateShowParseError`. No `_metaInfraContract` registry row needed (declared explicitly below).
6. **Advisory-lock single-holder rule.** No change: the hold branch and alert raise run inside the existing per-show cron tx. `tests/auth/advisoryLockRpcDeadlock.test.ts` stays green unchanged.
7. **Never prettier the master spec** (mangles §12.4 cells → x1 divergence). Hand-edit the §12.4 row only.
8. **Run FULL `pnpm test` + `pnpm typecheck` before any push.** Scoped per-task gates miss shared-chokepoint regressions (phase1 / catalog / SYNC_PROBLEM_CODES are shared). Also run `pnpm format:check` (a `--no-verify` commit skips the prettier hook → CI `quality` fails).
9. **Spec is canonical.** Anywhere this plan and the spec conflict, the spec wins — open a question, don't silently fix. (Two spec-prose refinements surfaced during citation verification are folded into Task 2 with rationale; see the "Spec nuances folded in" note there.)

---

## File Structure

### Production files — modified

| File | Responsibility (this change) |
|---|---|
| `lib/sync/phase1.ts` | `Phase1Args` gains `acceptShrink?: boolean` + `expectedModifiedTime?: string`. `Phase1Result` gains the `shrink_held` variant. `Phase1Tx` gains `updateShowShrinkHeld`. New `describeShrink(items, prior, next)` helper. Hold branch (before the `triggeredReviewItems`/`mi11`/`pass` logic) + version-bound accept gate + `updateShowShrinkHeld` call. |
| `lib/sync/runScheduledCronSync.ts` | `syncProblemCodeForStatus` gains the `'shrink_held'` case. `ProcessOneFileResult` gains the `shrink_held` variant. New caller branch (raise `RESYNC_SHRINK_HELD`, resolve stale peers, keep own). File-loop post-commit revalidation for `shrink_held`. `updateShowShrinkHeld` tx-method impl (mirrors `updateShowParseError` at `:809`). Thread `acceptShrink`/`expectedModifiedTime` from `ProcessOneFileDeps` into the `runPhase1` args (`:2766-2775`). |
| `lib/sync/runManualSyncForShow.ts` | `RunManualSyncForShowDeps` (`:47`) carries `acceptShrink`/`expectedModifiedTime` into `processDeps`; thread to `processOneFile_unlocked`. |
| `app/api/admin/sync/[slug]/route.ts` | Read `acceptShrink`/`expectedModifiedTime` from the POST body; pass into `runManualSyncForShow`; special-case `result.outcome === "shrink_held"` (HTTP 200 `ok:true`) **before** the `"code" in result` branch (`:93-98`). |
| `components/admin/ReSyncButton.tsx` | Confirm-required state: a `shrink_held` result renders the counts + an "Apply reduced version" button (`data-testid="admin-resync-accept"`) that re-POSTs `{acceptShrink:true, expectedModifiedTime: heldModifiedTime}`. |
| `lib/adminAlerts/upsertAdminAlert.ts` | `AdminAlertCode` union gains `\| "RESYNC_SHRINK_HELD"`. |
| `lib/notify/constants.ts` | `SYNC_PROBLEM_CODES` gains `"RESYNC_SHRINK_HELD"`. |
| `lib/notify/detect/recoveryResolution.ts` | `STATUS_TO_CODE` TS map (`:4`) + SQL `CASE` (`:58-62`) gain `shrink_held → RESYNC_SHRINK_HELD`. |
| `lib/admin/syncStatus.ts` | `syncStatusBucket` gains a `'shrink_held'` case (degraded `warn` tier). |
| `lib/admin/driveConnectionHealth.ts` | `'shrink_held'` mapped alongside `'parse_error'` (degraded sync-problem tier). |
| `components/shared/StaleFooter.tsx` | `selectCodeAndTier` treats `'shrink_held'` **identically to `'pending_review'`** (age tiers; `SYNC_DELAYED_SEVERE` red > 6h). No crew-facing `RESYNC_SHRINK_HELD` copy. |
| `lib/adminAlerts/alertActions.ts` | `ALERT_ACTION_CODES` + `ALERT_ACTIONS` gain the `RESYNC_SHRINK_HELD` "Review & re-sync" → `#resync` builder. |
| `app/admin/show/[slug]/page.tsx` | Wrap the `ReSyncButton` mount (`:1004`) in a container with `id="resync"`. |
| `lib/messages/catalog.ts` | New `RESYNC_SHRINK_HELD` producer row (mirror `PARSE_ERROR_LAST_GOOD` `:110-124`: `adminSurface:"inbox"`, non-null `dougFacing` with `_<sheet-name>_`, `crewFacing:null`, title, `helpHref`). |
| `app/help/errors/_families.ts` | Add `"RESYNC"` prefix to the `syncing-sheets` family (keep "Other" empty). |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | §12.4 new row (after `PARSE_ERROR_LAST_GOOD`) + helpfulContext appendix line. |

### Generated files — regenerated + committed

| File | Regen command |
|---|---|
| `lib/messages/__generated__/spec-codes.ts` | `pnpm gen:spec-codes` |
| `lib/messages/__generated__/internal-code-enums.ts` | `pnpm gen:internal-code-enums` |

### Test files — created / extended

| File | New coverage |
|---|---|
| `tests/sync/phase1.decision-rule.test.ts` (extend) | shrink_held outcomes, `describeShrink` counts, version-bound accept, benign-drift negatives. |
| `tests/sync/resyncShrinkHold.db.test.ts` (**new**, DB-backed) | Retain last-good + alert + status; auto-resolve via both recovery paths; version-binding negatives. |
| `tests/messages/_metaAdminAlertCatalog.test.ts` (extend) | Registry rows + inbox-contract updates. |
| `tests/adminAlerts/alertActions.test.ts` (extend) | Action-link row. |
| `tests/notify/*` SYNC_PROBLEM_CODES pin (extend) | New member. |
| `tests/notify/recoveryResolution.*.test.ts` (extend or new) | Held stays open; recovered resolves. |
| `tests/components/admin/ReSyncButton.test.tsx` (extend or new) | Confirm prompt + accept re-POST. |
| `tests/app/admin/sync-route.test.ts` (extend or new) | Route `shrink_held` 200 contract + version-binding. |
| `tests/app/admin/perShowPage.test.tsx` (extend) | `id="resync"` anchor. |
| `tests/components/shared/StaleFooter.test.tsx` (extend) | `'shrink_held'` tier. |
| `tests/admin/syncStatus.test.ts` (extend) | `'shrink_held'` bucket. |

> Test file names above are the expected homes; if a differently-named suite already owns the surface, extend that one — verify with `rg` before creating a new file (writing-plans pre-draft rule).

---

## Meta-test inventory (spec §11)

**CREATES:** none (no new registry file).

**EXTENDS:**
- `tests/messages/_metaAdminAlertCatalog.test.ts` — add `RESYNC_SHRINK_HELD` to `ADMIN_ALERTS_CODES` (`:58`), `ADMIN_ALERTS_WRITE_SITES` (`:108`, the `runScheduledCronSync.ts` shrink-hold raise site), `ADMIN_ALERTS_LIFECYCLE` (`:313`, `{ class:"auto", resolveSites:[{file:"lib/sync/runScheduledCronSync.ts", pattern:/resolveStaleSyncProblemAlerts_unlocked/}] }` — mirror `PARSE_ERROR_LAST_GOOD`), and **the two inbox-contract assertions** (`:692` exact-set + `:696` per-code): the exact-set list becomes `["PARSE_ERROR_LAST_GOOD","RESYNC_SHRINK_HELD","SHEET_UNAVAILABLE"]`, and `INTERPOLATED_DOUG_FACING_CODES` (`:556`) gains `RESYNC_SHRINK_HELD` (its `dougFacing` carries `_<sheet-name>_`; the producer supplies `sheet_name`). The count comment at `:301-304` (21 auto / 42 total) increments to 22 auto / 43 total.
- `tests/adminAlerts/alertActions.test.ts` — new registry row (slug-present → link; slug-missing → null, fail-quiet).
- notify `SYNC_PROBLEM_CODES` pin (whichever `tests/notify/*` asserts membership) — new member.
- The §12.4 three-way lockstep gates: `tests/cross-cutting/codes.test.ts` (x1 catalog parity), `tests/cross-cutting/no-raw-codes.test.ts` (x2), codes-coverage.
- `tests/app/admin/perShowPage.test.tsx` — new `id="resync"` anchor assertion (the retirement pins at `:373-388` stay green — the anchor adds NO review UI).

**MUST STAY GREEN (unchanged):**
- `tests/sync/cutover.retireLivePendingSyncs.test.ts` — this design never writes a live `pending_sync`.
- `tests/app/admin/perShowPage.test.tsx` retirement pins (`staged-review-*` still absent).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — **NO advisory-lock topology change** (hold + alert raise run inside the existing per-show `withShowLock` cron tx; `discardStaged` untouched).
- `tests/auth/_metaInfraContract.test.ts` — reuses the existing tx-bound `upsertAdminAlert`; no new call boundary.

**Advisory-lock holder topology:** unchanged. For hashkey `show:<drive_file_id>` the sole holder remains the JS-side `withShowLock`/`withPostgresSyncPipelineLock` wrapper; the new hold branch, `updateShowShrinkHeld`, and the alert raise all run inside that already-open tx — no nested acquire.

**Layout-dimensions task:** **N/A.** The only new UI is a text confirm affordance (inline conditional render, tested by presence) + a status tier — no fixed-dimension parent contains flex/grid children whose dimensions must be pinned.

**Transition-audit task:** **N/A.** `ReSyncButton`'s confirm is a single inline conditional render (`shrink_held ? <confirm/> : <success/>`), tested by presence/absence, not an animated multi-state component. Visual quality is covered by the invariant-8 impeccable dual-gate at close-out.

---

## Tasks

> **Ordering is driven by type-coupling + green-per-commit (Codex plan-review R1 fix).** Every task must `pnpm typecheck` AND leave the suite green at its commit. Two hard couplings shape the order: (1) an interface method added to `Phase1Tx` requires its concrete impl in `PostgresPipelineTx` (which `implements SyncPipelineTx`) in the **same** commit or the class won't compile; (2) the `AdminAlertCode` union member **and** the `SYNC_PROBLEM_CODES` member are each grep-coupled to the caller raise site — `tests/notify/constants-producers.test.ts:27` greps `runScheduledCronSync.ts` for an `upsertAdminAlert({code:"RESYNC_SHRINK_HELD"})` producer for **every** `SYNC_PROBLEM_CODES` member, and `_metaAdminAlertCatalog` (orphan test + `WRITE_SITES` Record) requires the same producer for every union/`ADMIN_ALERTS_CODES` member. So the union, the constant, the catalog row, ALL the meta-registry rows, and the caller raise branch are **one atomic commit** — they cannot be split. The only pieces that land independently are (a) `phase1`'s own additions (which reference `"RESYNC_SHRINK_HELD"` only as a plain `code: string` value, no union dependency, and whose new `Phase1Result` variant is safely unhandled downstream because `runScheduledCronSync` uses fall-through `if`s, no `assertNever`), and (b) the downstream consumers/route/UI/DB tests that read already-landed types. Hence: **Task 1 = phase1** (self-contained), **Task 2 = the atomic admin-alert/sync-problem/caller bundle**, then consumers → action link → route → button → DB. Each task ends `git commit` before the next begins.

---

### Task 1 — phase1: `shrink_held` outcome + `describeShrink` + version-bound accept gate + types + `updateShowShrinkHeld` (interface **and** impl)

> **Why the `updateShowShrinkHeld` impl is in THIS task (Codex R1 fix):** `PostgresPipelineTx implements SyncPipelineTx`, and `SyncPipelineTx` extends `Phase1Tx`. Adding the method to the `Phase1Tx` **interface** without its **concrete impl** in the same commit makes the class fail to compile. So the interface (in `phase1.ts`) and the impl (in `runScheduledCronSync.ts`) land together here.

**Interfaces**

Consumes:
- `Phase1Args` (`lib/sync/phase1.ts:80`) — gains `acceptShrink?: boolean`, `expectedModifiedTime?: string`.
- `Phase1Binding` (`:17`) — `.modifiedTime: string` (existing).
- `Phase1ShowRow` (`:22`) — `.showId?: string|null`, `.priorParseResult: ParseResult` (existing).
- `reviewItems` (`:329`) — includes `MI-6`/`MI-7` `TriggeredReviewItem`s when `runInvariants` stages.
- `ParseResult.crewMembers` (array) — for the `MI-6` crew delta.

Produces:
- `Phase1Result` variant: `{ outcome:"shrink_held"; code:string; message:string; heldModifiedTime:string; shrinkItems:TriggeredReviewItem[]; showId?:string|null }`. (`code:"RESYNC_SHRINK_HELD"` is a plain string on a `code:string` field — **no** `AdminAlertCode`-union dependency, so this task compiles before the union member exists.)
- `Phase1Tx.updateShowShrinkHeld(driveFileId, {message}): Promise<string|null|void>` (interface) **and** its `PostgresPipelineTx` impl (mirror `updateShowParseError`).
- `describeShrink(items, priorParseResult, nextParseResult): string`.

**Step 1a — failing test** in `tests/sync/phase1.decision-rule.test.ts`.

Add these cases (using the file's existing `runPhase1` harness + fake `Phase1Tx`; derive counts from fixture arrays, never hardcode a magic total):

```ts
// Concrete failure mode: PF34 currently drops MI-6/MI-7 to `pass` and applyParseResult
// full-replaces live rows. These assert the hold intercepts BEFORE pass, retains last-good
// (no apply), and reports the ACTUAL crew counts (not a generic "crew reduced").

it("MI-6 crew shrink (cron) → shrink_held with real prior→next counts", async () => {
  const prior = makeParseResult({ crew: 5 });   // fixture helper: N crew rows
  const next = makeParseResult({ crew: 2 });     // crewDrop = 3 > 1 → MI-6
  const tx = makeFakeTx({ show: makeShowRow({ priorParseResult: prior, showId: "show-1" }) });
  const res = await runPhase1(tx, makeArgs({ mode: "cron", parseResult: next, modifiedTime: "T1" }));
  expect(res.outcome).toBe("shrink_held");
  expect(res).toMatchObject({ code: "RESYNC_SHRINK_HELD", heldModifiedTime: "T1", showId: "show-1" });
  // Derived from fixture dimensions: prior.crewMembers.length → next.crewMembers.length.
  expect(res.message).toContain(`${prior.crewMembers.length}→${next.crewMembers.length}`); // "5→2"
  expect(res.message.toLowerCase()).toContain("crew");
  expect(tx.applyParseResult).not.toHaveBeenCalled();
  expect(tx.updateShowShrinkHeld).toHaveBeenCalledWith(expect.any(String), { message: res.message });
});

it("MI-7 section shrink (cron) → shrink_held; message carries each section's counts", async () => {
  const prior = makeParseResult({ rooms: 4, transportation: "populated" });
  const next = makeParseResult({ rooms: 1, transportation: null }); // nc<pc/2 + populated→null
  const tx = makeFakeTx({ show: makeShowRow({ priorParseResult: prior, showId: "show-1" }) });
  const res = await runPhase1(tx, makeArgs({ mode: "cron", parseResult: next, modifiedTime: "T1" }));
  expect(res.outcome).toBe("shrink_held");
  expect(res.message).toContain("4→1"); // rooms prior_count→new_count from the MI-7 item
});

it("hold is mode-independent; only a VERSION-BOUND accept bypasses it", async () => {
  const prior = makeParseResult({ crew: 5 });
  const next = makeParseResult({ crew: 2 });
  const show = makeShowRow({ priorParseResult: prior, showId: "show-1" });
  // (a) manual, no accept → still holds (generic manual re-sync can't one-click-clobber, R9)
  expect((await runPhase1(makeFakeTx({ show }), makeArgs({ mode: "manual", parseResult: next, modifiedTime: "T1" }))).outcome).toBe("shrink_held");
  // (b) accept + matching expectedModifiedTime → applies
  const applied = await runPhase1(makeFakeTx({ show }), makeArgs({ mode: "manual", parseResult: next, modifiedTime: "T1", acceptShrink: true, expectedModifiedTime: "T1" }));
  expect(["pass", "auto_apply_with_holds"]).toContain(applied.outcome);
  // (c) accept + MISSING expectedModifiedTime → holds (no apply)
  expect((await runPhase1(makeFakeTx({ show }), makeArgs({ mode: "manual", parseResult: next, modifiedTime: "T1", acceptShrink: true }))).outcome).toBe("shrink_held");
  // (d) accept + MISMATCHED (stale) expectedModifiedTime → holds with fresh counts
  expect((await runPhase1(makeFakeTx({ show }), makeArgs({ mode: "manual", parseResult: next, modifiedTime: "T2", acceptShrink: true, expectedModifiedTime: "T1" }))).outcome).toBe("shrink_held");
});

it("MI-6 + MI-11 (cron) → shrink_held (no apply → no clobber, no ungated email)", async () => {
  const prior = makeParseResult({ crew: 5, crewEmails: { Alice: "old@x" } });
  const next = makeParseResult({ crew: 2, crewEmails: { Alice: "new@x" } }); // MI-6 + MI-11
  const tx = makeFakeTx({ show: makeShowRow({ priorParseResult: prior, showId: "show-1" }) });
  const res = await runPhase1(tx, makeArgs({ mode: "cron", parseResult: next, modifiedTime: "T1" }));
  expect(res.outcome).toBe("shrink_held");
  expect(tx.applyParseResult).not.toHaveBeenCalled();
});

it("benign drift unchanged: MI-11-only grows → auto_apply_with_holds; MI-7b rename & crewDrop==1 apply", async () => {
  // (a) MI-11 only + crew growth (5→6) → auto_apply_with_holds, NOT held
  const grow = await runPhase1(makeFakeTx({ show: makeShowRow({ priorParseResult: makeParseResult({ crew: 5, crewEmails: { Alice: "old@x" } }), showId: "s" }) }),
    makeArgs({ mode: "cron", parseResult: makeParseResult({ crew: 6, crewEmails: { Alice: "new@x" } }), modifiedTime: "T1" }));
  expect(grow.outcome).toBe("auto_apply_with_holds");
  // (c) crewDrop == 1 (5→4) → applies (not >1)
  const drop1 = await runPhase1(makeFakeTx({ show: makeShowRow({ priorParseResult: makeParseResult({ crew: 5 }), showId: "s" }) }),
    makeArgs({ mode: "cron", parseResult: makeParseResult({ crew: 4 }), modifiedTime: "T1" }));
  expect(["pass", "auto_apply_with_holds"]).toContain(drop1.outcome);
});
```

> If the existing test helpers (`makeParseResult`, `makeFakeTx`, `makeShowRow`, `makeArgs`) don't yet accept `crew`/`rooms`/`transportation`/`crewEmails`/`acceptShrink`/`expectedModifiedTime`/`modifiedTime` shaping, extend the helpers minimally in the same test file — but keep counts **derived** (fixture builds N rows; the test reads `.length`).

**Step 1b — run, confirm red:** `pnpm vitest run tests/sync/phase1.decision-rule.test.ts`.

**Step 1c — minimal implementation** in `lib/sync/phase1.ts`.

Types:

```ts
export type Phase1Args = {
  driveFileId: string;
  mode: Exclude<ResolvedSyncMode, "asset_recovery">;
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  binding: Phase1Binding;
  wizardSessionId?: string;
  sourceAnchors?: Record<string, SourceAnchor>;
  // Re-sync quality gate (audit finding #3): a VERSION-BOUND confirmed accept that already
  // showed the admin the shrink counts. Cron/push never set these. The hold is bypassed ONLY
  // when acceptShrink === true AND expectedModifiedTime === binding.modifiedTime (§4a).
  acceptShrink?: boolean;
  expectedModifiedTime?: string;
};
```

Add the `shrink_held` variant to `Phase1Result`:

```ts
  | {
      outcome: "shrink_held";
      code: string;
      message: string;
      heldModifiedTime: string;
      shrinkItems: TriggeredReviewItem[];
      showId?: string | null;
    }
```

Add to `Phase1Tx` (after `updateShowParseError`):

```ts
  // Retain-last-good on a material-shrink hold (audit finding #3): sets
  // shows.last_sync_status='shrink_held', last_sync_error=message. Mirrors updateShowParseError:
  // returns the updated show's id (or null when no row matched) so phase1 threads showId onto the
  // shrink_held result and the caller busts the crew cache tag. `| void` keeps void-returning
  // tx stubs structurally assignable.
  updateShowShrinkHeld(
    driveFileId: string,
    payload: { message: string },
  ): Promise<string | null | void>;
```

`describeShrink` helper (module scope, near `warningSummary`):

```ts
// Human summary of a material-shrink hold for the admin alert `detail` + the ReSyncButton confirm.
// MI-6's TriggeredReviewItem carries no counts (lib/parser/types.ts), so the crew delta is computed
// from the parse results; MI-7 items embed { section, prior_count, new_count }. Emits e.g.
// "crew 5→2; rooms 4→1". Never a bare code (invariant 5).
function describeShrink(
  items: TriggeredReviewItem[],
  priorParseResult: ParseResult,
  nextParseResult: ParseResult,
): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.invariant === "MI-6") {
      parts.push(`crew ${priorParseResult.crewMembers.length}→${nextParseResult.crewMembers.length}`);
    } else if (item.invariant === "MI-7") {
      const mi7 = item as Extract<TriggeredReviewItem, { invariant: "MI-7" }>;
      parts.push(`${mi7.section} ${mi7.prior_count}→${mi7.new_count}`);
    }
  }
  return parts.join("; ");
}
```

Hold branch — insert **immediately after** `reviewItems` is computed and the MI-8 debounce early-return (`:330-331`), **before** the `mi11Items` filter (`:337`):

```ts
  // Re-sync quality gate (audit finding #3): count-based MATERIAL shrinkage (MI-6 crew, MI-7
  // section) on an EXISTING published show HOLDS last-good instead of auto-clobbering, in EVERY
  // mode (cron/push/manual). The ONLY bypass is a VERSION-BOUND acceptShrink set by a confirmed
  // re-submit that already showed the admin the shrink counts (D4). MI-6/MI-7 require a prior
  // (invariants.ts) so `show` is always non-null here; the guard documents the scope.
  const materialShrinkItems = show
    ? reviewItems.filter((item) => item.invariant === "MI-6" || item.invariant === "MI-7")
    : [];
  if (materialShrinkItems.length > 0) {
    // Drive's modifiedTime advances on any edit, so a mismatch means Doug edited between the
    // prompt and the confirm — re-hold with fresh counts (the admin must re-confirm).
    const acceptedThisVersion =
      args.acceptShrink === true && args.expectedModifiedTime === args.binding.modifiedTime;
    if (!acceptedThisVersion) {
      const message = describeShrink(materialShrinkItems, show!.priorParseResult, args.parseResult);
      const updatedShowId = await callTx("updateShowShrinkHeld", () =>
        tx.updateShowShrinkHeld(args.driveFileId, { message }),
      );
      return {
        outcome: "shrink_held",
        code: "RESYNC_SHRINK_HELD",
        message,
        heldModifiedTime: args.binding.modifiedTime,
        shrinkItems: materialShrinkItems,
        showId: typeof updatedShowId === "string" ? updatedShowId : (show!.showId ?? null),
      };
    }
    // else fall through → the parse applies (pass / auto_apply_with_holds; MI-11 still holds).
  }
```

> Verify the `MI-7` `TriggeredReviewItem` field names (`section`/`prior_count`/`new_count`) against `lib/parser/types.ts` before finalizing the cast; adjust the extract if the discriminated shape differs.

**Concrete `updateShowShrinkHeld` impl (same commit — interface+impl coupling).** In `lib/sync/runScheduledCronSync.ts`, add after `updateShowParseError` (`:832`), mirroring it:

```ts
  async updateShowShrinkHeld(
    driveFileId: string,
    payload: { message: string },
  ): Promise<string | null> {
    const rows = await this.rows<{ id: string }>(
      `
        update public.shows
           set last_sync_status = 'shrink_held',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
        returning id
      `,
      [driveFileId, payload.message],
    );
    return rows[0]?.id ?? null;
  }
```

> The `phase1` hold branch calls `tx.updateShowShrinkHeld`; in `processOneFile` the tx is this real `PostgresPipelineTx` (impl above), and unit tests supply a fake tx that stubs the method (the test asserts it was called). No consumer of the new `Phase1Result` `shrink_held` variant exists yet — `processOneFile_unlocked` uses fall-through `if`s (no `assertNever`), so an unhandled variant compiles; the caller raise branch lands in Task 2.

**Step 1d — run, confirm green:** `pnpm vitest run tests/sync/phase1.decision-rule.test.ts && pnpm typecheck`.

**Step 1e — commit:** `test(sync): shrink_held phase1 decision cases` + `feat(sync): hold material re-sync shrinkage (MI-6/MI-7) retaining last-good` (test-then-impl per TDD; the impl commit includes both the `phase1.ts` hold branch/types and the `runScheduledCronSync.ts` `updateShowShrinkHeld` impl so the class compiles).

---

### Task 2 — Atomic admin-alert + sync-problem + caller bundle (union · `SYNC_PROBLEM_CODES` · `recoveryResolution` · `syncProblemCodeForStatus` · §12.4 catalog lockstep · caller raise branch · `ProcessOneFileResult` variant · file-loop revalidation · arg threading)

> **Why this is ONE atomic task (Codex R1 fix).** The `AdminAlertCode` union member, the `SYNC_PROBLEM_CODES` member, and the `RESYNC_SHRINK_HELD` catalog row are each grep-/typecheck-coupled to the caller **raise site** (`upsertAdminAlert({code:"RESYNC_SHRINK_HELD"})` in `runScheduledCronSync.ts`): `tests/notify/constants-producers.test.ts:27` greps that producer for **every** `SYNC_PROBLEM_CODES` member; `_metaAdminAlertCatalog`'s orphan test + `ADMIN_ALERTS_WRITE_SITES` Record (typecheck) + `WRITE_SITES` grep require it for the union/`ADMIN_ALERTS_CODES` member; and the catalog's `adminSurface:"inbox"` triggers the inbox-contract test that needs the `ADMIN_ALERTS_LIFECYCLE` entry (→ `ADMIN_ALERTS_CODES` → raise site). So none of these can land before the raise site, and the raise site needs the union member to typecheck. They are indivisible for green-per-commit. Depends on Task 1 (the `Phase1Result` `shrink_held` variant + `updateShowShrinkHeld`). The `updateShowShrinkHeld` **impl** is NOT here — it shipped in Task 1 with its interface.

**Interfaces**

Consumes:
- `phase1.outcome === "shrink_held"` + `.message`/`.heldModifiedTime`/`.showId` (Task 1).
- `requireTxBoundUpsertAdminAlert(txDeps, "processOneFile_unlocked")` (existing, `:1969`).
- `resolveStaleSyncProblemAlerts_unlocked(tx, showId, currentCode)` (`:190`).
- `syncProblemCodeForStatus(status)` (`:181`).
- `SYNC_PROBLEM_CODES` (`lib/notify/constants.ts:2`); `STATUS_TO_CODE` + SQL `CASE` (`lib/notify/detect/recoveryResolution.ts:4,58`).
- `AdminAlertCode` union (`lib/adminAlerts/upsertAdminAlert.ts:3`); `MESSAGE_CATALOG` (`lib/messages/catalog.ts:110`).
- `ProcessOneFileDeps` (`:301`) — extend with `acceptShrink?`/`expectedModifiedTime?`.

Produces:
- `RESYNC_SHRINK_HELD ∈ SYNC_PROBLEM_CODES`; `syncProblemCodeForStatus('shrink_held') === "RESYNC_SHRINK_HELD"`; `STATUS_TO_CODE.shrink_held` + SQL `CASE` map `'shrink_held'`.
- `AdminAlertCode` union member; `RESYNC_SHRINK_HELD` §12.4 catalog row (`adminSurface:"inbox"`) + regens + families + meta-registry rows.
- `ProcessOneFileResult` variant `{ outcome:"shrink_held"; code:string; showId?:string|null; detail:string; heldModifiedTime:string }`.
- The caller raise branch (`upsertAdminAlert` + `resolveStaleSyncProblemAlerts_unlocked`), file-loop revalidation, and `ProcessOneFileDeps` accept-arg threading into `runPhase1`.

**Spec nuances folded in (verified against the live meta-test — Global Constraint 9):**
1. `tests/messages/_metaAdminAlertCatalog.test.ts:692` pins `INBOX_ROUTED_CODES` as **exactly** `["PARSE_ERROR_LAST_GOOD","SHEET_UNAVAILABLE"]`; adding an inbox code REQUIRES updating that assertion to the 3-code set.
2. `:696-714` requirement (c) asserts **every** inbox-routed code is in `INTERPOLATED_DOUG_FACING_CODES`. So `RESYNC_SHRINK_HELD`'s `dougFacing` MUST carry a `_<sheet-name>_` placeholder and be registered there; the producer (the caller raise branch in this same task) supplies `sheet_name`. The spec §5 admin copy is therefore reworded to **lead with** `_<sheet-name>_` (below) — a copy refinement, not a design change.
3. `tests/notify/sync-problem-codes.test.ts:6` pins `SYNC_PROBLEM_CODES` as the exact 3-code set → update to the 4-code set in the same commit.

**Step 2a — failing test.** Extend the caller-level test that already exercises the `hard_fail` branch (find with `rg "hard_fail" tests/sync`). Assert, with a `phase1` fake returning `shrink_held`:

```ts
// Failure mode: without a caller branch, a shrink_held phase1 result falls through unhandled
// and NO admin alert is raised (silent data-hold with no signal).
it("shrink_held → raises RESYNC_SHRINK_HELD, resolves OTHER stale peers, keeps its own", async () => {
  const upsertAdminAlert = vi.fn();
  const resolveSpy = vi.fn();
  // ...wire txDeps so requireTxBoundUpsertAdminAlert returns upsertAdminAlert and
  // resolveStaleSyncProblemAlerts_unlocked is spied...
  const result = await processOneFile_unlocked(tx, driveFileId, "cron", fileMeta, deps);
  expect(result.outcome).toBe("shrink_held");
  expect(result).toMatchObject({ code: "RESYNC_SHRINK_HELD", detail: expect.any(String), heldModifiedTime: expect.any(String) });
  expect(upsertAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
    code: "RESYNC_SHRINK_HELD",
    showId: "show-1",
    context: expect.objectContaining({ drive_file_id: driveFileId, detail: expect.any(String), held_modified_time: expect.any(String) }),
  }));
  // Keeps its own code (currentCode === "RESYNC_SHRINK_HELD"), resolves other peers.
  expect(resolveSpy).toHaveBeenCalledWith(expect.anything(), "show-1", "RESYNC_SHRINK_HELD");
});

it("syncProblemCodeForStatus('shrink_held') === RESYNC_SHRINK_HELD", () => {
  expect(syncProblemCodeForStatus("shrink_held")).toBe("RESYNC_SHRINK_HELD");
});
```

Also extend, in the same commit:
- `tests/notify/sync-problem-codes.test.ts:6` exact-set → `["DRIVE_FETCH_FAILED","PARSE_ERROR_LAST_GOOD","RESYNC_SHRINK_HELD","SHEET_UNAVAILABLE"]` (sorted).
- `tests/notify/recoveryResolution.*.test.ts` (extend or new, DB-backed via `TEST_DATABASE_URL`):

```ts
// Failure mode: without the shrink_held CASE, resolveRecoveredSyncProblemAlert would resolve a
// RESYNC_SHRINK_HELD alert while the show is STILL held (status='shrink_held') — the `not exists`
// guard finds no matching status → alert wrongly resolves. And without STATUS_TO_CODE, the scan
// mis-keys the code.
it("keeps RESYNC_SHRINK_HELD OPEN while last_sync_status='shrink_held'", async () => {
  const res = await resolveRecoveredSyncProblemAlert({ alertId, showId, code: "RESYNC_SHRINK_HELD" }, sql);
  expect(res).toEqual({ kind: "ok", resolved: false });
});
it("resolves RESYNC_SHRINK_HELD once status returns to 'ok'", async () => {
  const res = await resolveRecoveredSyncProblemAlert({ alertId, showId, code: "RESYNC_SHRINK_HELD" }, sql);
  expect(res).toEqual({ kind: "ok", resolved: true });
});
```

- `tests/messages/_metaAdminAlertCatalog.test.ts` registry + inbox edits (fail until the catalog/union/raise-site land):
  - `ADMIN_ALERTS_CODES` (`:58`) += `"RESYNC_SHRINK_HELD"`.
  - `ADMIN_ALERTS_WRITE_SITES` (`:108`) += `RESYNC_SHRINK_HELD: { path: "lib/sync/runScheduledCronSync.ts", pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"RESYNC_SHRINK_HELD"/ }`.
  - `ADMIN_ALERTS_LIFECYCLE` (`:313`) += `RESYNC_SHRINK_HELD: { class: "auto", resolveSites: [{ file: "lib/sync/runScheduledCronSync.ts", pattern: /resolveStaleSyncProblemAlerts_unlocked/ }] }`.
  - `INTERPOLATED_DOUG_FACING_CODES` (`:556`) += `"RESYNC_SHRINK_HELD"`.
  - Inbox exact-set (`:693`) → `["PARSE_ERROR_LAST_GOOD", "RESYNC_SHRINK_HELD", "SHEET_UNAVAILABLE"]`.
  - Count comment (`:301-304`): 22 auto / 43 total.
- x1 smoke in the same run: `pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts`.

**Step 2b — run, confirm red.**

**Step 2c — implementation** in `lib/sync/runScheduledCronSync.ts`.

`syncProblemCodeForStatus` (`:184-187`) — add before the final `return null`:

```ts
  if (status === "shrink_held") return "RESYNC_SHRINK_HELD";
```

`ProcessOneFileResult` (`:210`) — add:

```ts
  | { outcome: "shrink_held"; code: string; showId?: string | null; detail: string; heldModifiedTime: string }
```

Caller branch — insert immediately after the `hard_fail` branch (`:2807`), before the `stage` branch:

```ts
  if (phase1.outcome === "shrink_held") {
    // detail + heldModifiedTime propagate to ProcessOneFileResult so the manual route can render
    // the confirmation prompt and echo the reviewed version back on accept (§5c). Mirrors the
    // hard_fail branch (:2777) — retain last-good, raise a per-show alert, resolve stale peers.
    const result = {
      outcome: "shrink_held" as const,
      code: phase1.code,
      showId: phase1.showId ?? null,
      detail: phase1.message,
      heldModifiedTime: phase1.heldModifiedTime,
    };
    await logSync(txDeps, driveFileId, result);
    const show = await tx.readShowForPhase1(driveFileId);
    if (show?.showId) {
      const upsertAdminAlert = requireTxBoundUpsertAdminAlert(txDeps, "processOneFile_unlocked");
      await upsertAdminAlert({
        showId: show.showId,
        code: "RESYNC_SHRINK_HELD",
        context: {
          drive_file_id: driveFileId,
          sheet_name: show.priorParseResult.show.title,
          detail: phase1.message,
          held_modified_time: phase1.heldModifiedTime,
        },
      });
      await resolveStaleSyncProblemAlerts_unlocked(
        tx,
        show.showId,
        syncProblemCodeForStatus("shrink_held"), // === "RESYNC_SHRINK_HELD" → keeps its own row
      );
    }
    return result;
  }
```

**File-loop revalidation:** locate where the file loop post-commit calls `revalidateShowFromResult` for `hard_fail`/`applied` (grep `revalidateShowFromResult` in the loop) and add `shrink_held` to the set of outcomes whose `showId` busts the crew cache tag (the hold committed `shows.last_sync_status='shrink_held'`).

> `updateShowShrinkHeld` impl already shipped in **Task 1** (interface+impl coupling). Nothing to add here.

**Arg threading:** in `ProcessOneFileDeps` (`:301`) add `acceptShrink?: boolean; expectedModifiedTime?: string;`, and spread them into the `runPhase1_unlocked` args object (`:2766-2774`):

```ts
  const phase1 = await runPhase1_unlocked(
    tx,
    {
      driveFileId,
      mode: pipeline.resolvedMode,
      fileMeta,
      parseResult: pipeline.parseResult,
      binding: pipeline.binding,
      ...(deps.acceptShrink !== undefined ? { acceptShrink: deps.acceptShrink } : {}),
      ...(deps.expectedModifiedTime !== undefined ? { expectedModifiedTime: deps.expectedModifiedTime } : {}),
    },
    txDeps,
  );
```

> Cron/push callers never populate `deps.acceptShrink`/`deps.expectedModifiedTime`, so the hold is always active for them. Confirm the enclosing function reads `deps` in scope at `:2766` (it is `processOneFile_unlocked`, `deps: ProcessOneFileDeps`).

**Sync-problem membership + recovery (same commit — the raise site above satisfies the `constants-producers` grep):**
- `lib/notify/constants.ts:2-6` — add `"RESYNC_SHRINK_HELD",` to `SYNC_PROBLEM_CODES`.
- `lib/notify/detect/recoveryResolution.ts:4-8` — add `shrink_held: "RESYNC_SHRINK_HELD",` to `STATUS_TO_CODE`.
- `:58-62` — add `when 'shrink_held' then 'RESYNC_SHRINK_HELD'` to the SQL `CASE`.

**§12.4 admin-alert lockstep (same commit — union member + catalog + meta-registry are indivisible from the raise site):**
1. **Master spec §12.4** (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) — hand-edit a new row after `PARSE_ERROR_LAST_GOOD` (NEVER prettier the spec). Add the helpfulContext appendix line.
2. `pnpm gen:spec-codes` → commit `lib/messages/__generated__/spec-codes.ts`.
3. `lib/adminAlerts/upsertAdminAlert.ts` union (`:3`): add `| "RESYNC_SHRINK_HELD"` to `AdminAlertCode`.
4. `lib/messages/catalog.ts` — new producer row (mirror `PARSE_ERROR_LAST_GOOD` `:110`):

```ts
  RESYNC_SHRINK_HELD: {
    code: "RESYNC_SHRINK_HELD",
    adminSurface: "inbox",
    dougFacing:
      "_<sheet-name>_'s latest version dropped crew or a whole section, so the update was held and the last good version is still live. If the change is intentional, re-sync the show to apply it; otherwise fix the sheet.",
    crewFacing: null,
    followUp: "Doug → re-sync to accept, or fix sheet",
    helpfulContext:
      "A recent sync would have removed crew members or an entire section (rooms, hotels, contacts, or transportation) compared to the previous version. To avoid silently losing data we held the update and kept the last good version live for crew. If the reduction is intentional, re-sync the show and confirm to apply it; otherwise fix the sheet and the next sync will apply cleanly and clear this automatically.",
    title: "Re-sync held — sheet lost data",
    longExplanation:
      "The latest version of this sheet would have removed crew or a whole section relative to the previous version. Rather than clobber live data, we held the update and kept the last good version serving crew. Re-sync and confirm to accept the reduction, or fix the sheet — a clean sync clears this on its own.",
    helpHref: "/help/admin/parse-warnings#RESYNC_SHRINK_HELD",
  },
```

5. `pnpm gen:internal-code-enums` → commit `lib/messages/__generated__/internal-code-enums.ts`.
6. `app/help/errors/_families.ts` — add `"RESYNC"` to the `syncing-sheets` family `prefixes` (keeps "Other" empty; `codePrefix("RESYNC_SHRINK_HELD") === "RESYNC"`).
7. Apply the `_metaAdminAlertCatalog` registry + inbox-assertion edits from Step 2a.

**Step 2d — run green (FULL messages + notify + sync):** `pnpm vitest run tests/messages tests/cross-cutting tests/notify tests/sync && pnpm typecheck` (recovery DB tests need `TEST_DATABASE_URL`).

**Step 2e — commit:** `feat(sync): RESYNC_SHRINK_HELD atomic bundle — admin-alert code + sync-problem membership + caller raise + §12.4 lockstep` (union + `SYNC_PROBLEM_CODES` + `recoveryResolution` + `syncProblemCodeForStatus` + catalog + both regens + families + meta-registry rows + caller branch + `ProcessOneFileResult` variant + file-loop + arg threading ALL staged together — they are grep-/typecheck-indivisible).

---

### Task 3 — status consumers: `syncStatus.ts` + `driveConnectionHealth.ts` + `StaleFooter.tsx`

**Interfaces**

Consumes: `syncStatusBucket` (`lib/admin/syncStatus.ts:20`), `driveConnectionHealth.ts` status mapping (`:60-90,196`), `selectCodeAndTier` (`components/shared/StaleFooter.tsx:54`).

**Step 3a — failing test.**
- `tests/admin/syncStatus.test.ts`: `expect(syncStatusBucket("shrink_held")).toEqual({ bucket: "warn", label: expect.any(String) })` — asserts it is NOT `positive`/`ok` (failure mode: an unmapped status defaulting to "Unknown sync state" or, worse, silent `idle`).
- `tests/components/shared/StaleFooter.test.tsx`: render with `lastSyncStatus="shrink_held"`:
  - fresh (age < 10 min) → tier `subtle`, NO `parse_error`-style red error code (failure mode: a held re-sync rendering as a normal recent sync, R7-1);
  - age > 6h → `SYNC_DELAYED_SEVERE` red (identical to `pending_review`), NOT `PARSE_ERROR_LAST_GOOD`.
- (Optional) a `driveConnectionHealth` test if the file has a unit suite: `'shrink_held'` classifies into the degraded sync-problem bucket alongside `'parse_error'`.

**Step 3b — run red.**

**Step 3c — implementation.**
- `syncStatus.ts:26-27` — add before/after `parse_error`:

```ts
    case "shrink_held":
      return { bucket: "warn", label: "Re-sync held (data loss)" };
```

- `driveConnectionHealth.ts` — mirror the `'parse_error'` handling: add `'shrink_held'` to the degraded sync-problem classification (same bucket as `sync_parse_error`; follow the existing `:196-201` pattern — if it filters on a status literal, include `'shrink_held'`).
- `StaleFooter.tsx:64` — extend the `pending_review` branch to also cover `shrink_held`:

```ts
  if ((lastSyncStatus === "pending_review" || lastSyncStatus === "shrink_held") && hours > 6) {
    return { code: "SYNC_DELAYED_SEVERE", tier: "red" };
  }
```

and the fall-through comment at `:68` updates to note `shrink_held<=6h` also falls through to age tiers (crew see valid last-good; honest framing is "sync delayed / showing last confirmed version," not "error").

**Step 3d — run green:** `pnpm vitest run tests/admin tests/components/shared && pnpm typecheck`.

**Step 3e — commit:** `feat(admin): classify shrink_held as a degraded sync tier (admin + crew footer)`.

> **UI note (invariant 8):** `StaleFooter.tsx` is a crew-facing UI surface — include it in the milestone close-out impeccable dual-gate (Task 10 handoff).

---

### Task 4 — alert action link + `#resync` anchor

**Interfaces**

Consumes: `ALERT_ACTION_CODES` (`lib/adminAlerts/alertActions.ts:13`), `ALERT_ACTIONS` (`:79`), `resolveAlertAction` (`:107`), `ReSyncButton` mount (`app/admin/show/[slug]/page.tsx:1004`).

**Step 4a — failing test.**
- `tests/adminAlerts/alertActions.test.ts` new row:

```ts
// Failure mode: an unregistered code → resolveAlertAction returns null → the held alert has no
// "accept" affordance and the admin must hunt for the control.
it("RESYNC_SHRINK_HELD → Review & re-sync link to #resync (slug-present)", () => {
  expect(resolveAlertAction("RESYNC_SHRINK_HELD", {}, { slug: "east-coast" }))
    .toEqual({ label: "Review & re-sync", href: "/admin/show/east-coast#resync", external: false });
});
it("RESYNC_SHRINK_HELD → null when slug missing (fail-quiet)", () => {
  expect(resolveAlertAction("RESYNC_SHRINK_HELD", {}, { slug: null })).toBeNull();
});
```

- `tests/app/admin/perShowPage.test.tsx`: assert an element with `id="resync"` renders around the `ReSyncButton` (the fragment target exists), AND the retirement pins (`staged-review-*` absent) still pass.

**Step 4b — run red.**

**Step 4c — implementation.**
- `alertActions.ts:13-23` — add `"RESYNC_SHRINK_HELD"` to `ALERT_ACTION_CODES`.
- `:79-103` — add the builder to `ALERT_ACTIONS`:

```ts
  RESYNC_SHRINK_HELD: (_context, opts) => {
    const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
    return slug
      ? { label: "Review & re-sync", href: `/admin/show/${encodeURIComponent(slug)}#resync`, external: false }
      : null; // fail-quiet when slug missing (registry contract)
  },
```

- `app/admin/show/[slug]/page.tsx:998-1005` — wrap BOTH mount branches (or at least the `ReSyncButton`) in a stable anchor container:

```tsx
          <div id="resync">
            {show.archived ? (
              <span data-testid="admin-show-resync-archived" className="text-sm text-text-subtle">
                Re-sync is paused while this show is archived.
              </span>
            ) : (
              <ReSyncButton slug={show.slug} />
            )}
          </div>
```

> Confirm the surrounding JSX (`:998-1006`) so the wrapper doesn't break the existing footer flex layout; keep the anchor a plain block wrapper.

**Step 4d — run green:** `pnpm vitest run tests/adminAlerts tests/app/admin/perShowPage.test.tsx && pnpm typecheck`.

**Step 4e — commit:** `feat(admin): RESYNC_SHRINK_HELD alert action link + #resync anchor`.

---

### Task 5 — route: `acceptShrink`/`expectedModifiedTime` body params + `shrink_held` success special-case + `runManualSyncForShow` signature

**Interfaces**

Consumes: `runManualSyncForShow(driveFileId, mode, deps)` (`lib/sync/runManualSyncForShow.ts:282`), `RunManualSyncForShowDeps` (`:47`), route POST (`app/api/admin/sync/[slug]/route.ts:68`).
Produces: route returns HTTP 200 `{ ok:true, result:{ outcome:"shrink_held", detail, heldModifiedTime } }` for a hold; version-bound apply on accept.

**Step 5a — failing test** in `tests/app/admin/sync-route.test.ts` (extend or new — grep for the existing sync-route suite first):

```ts
// Failure mode (R10-2): the route maps ANY result with a `code` field to {ok:false,error:code},
// so shrink_held would render as an error, not a confirm prompt.
it("first POST on a shrunk sheet → HTTP 200 {ok:true, result:{outcome:'shrink_held', detail, heldModifiedTime}}", async () => {
  // fake runManualSyncForShow → { outcome:"shrink_held", code:"RESYNC_SHRINK_HELD", detail:"crew 5→2", heldModifiedTime:"T1", showId:"s" }
  const res = await POST(req, ctx);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toMatchObject({ ok: true, result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" } });
});
it("accept POST threads acceptShrink + expectedModifiedTime into runManualSyncForShow", async () => {
  // body: { acceptShrink: true, expectedModifiedTime: "T1" }
  await POST(reqWithBody({ acceptShrink: true, expectedModifiedTime: "T1" }), ctx);
  expect(runManualSyncSpy).toHaveBeenCalledWith("drive-1", "manual",
    expect.objectContaining({ acceptShrink: true, expectedModifiedTime: "T1" }));
});
```

**Step 5b — run red.**

**Step 5c — implementation.**

`runManualSyncForShow.ts` — `RunManualSyncForShowDeps` (`:47`) gains `acceptShrink?: boolean; expectedModifiedTime?: string;`, and `runManualSyncForShow` forwards them into `processDeps` when building the deps passed to `processOneFile`/`processOneFile_unlocked` (so they reach `ProcessOneFileDeps` from Task 2). Concretely, where `deps.processDeps` is spread (`:417`), merge:

```ts
    ...(deps.processDeps ?? {}),
    ...(deps.acceptShrink !== undefined ? { acceptShrink: deps.acceptShrink } : {}),
    ...(deps.expectedModifiedTime !== undefined ? { expectedModifiedTime: deps.expectedModifiedTime } : {}),
```

(Mirror at the `runManualSyncForShow_unlocked` path `:279` if that is the seam the route uses.)

`route.ts` — read the body and thread + special-case:

```ts
    // Parse an optional accept payload (absent on the first, generic re-sync click).
    let body: { acceptShrink?: unknown; expectedModifiedTime?: unknown } = {};
    try {
      body = (await _request.json()) as typeof body;
    } catch {
      body = {}; // no body → generic re-sync
    }
    const acceptShrink = body.acceptShrink === true;
    const expectedModifiedTime =
      typeof body.expectedModifiedTime === "string" ? body.expectedModifiedTime : undefined;

    const result = await runManualSyncForShow(resolved.driveFileId, "manual", {
      ...(acceptShrink ? { acceptShrink: true } : {}),
      ...(expectedModifiedTime !== undefined ? { expectedModifiedTime } : {}),
    });
    if (
      "outcome" in result &&
      result.outcome === "blocked" &&
      result.code === FINALIZE_OWNED_SHOW
    ) {
      return NextResponse.json({ ok: false, error: FINALIZE_OWNED_SHOW }, { status: 409 });
    }
    if ("skipped" in result) {
      return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
    }
    // R10-2: shrink_held is a SUCCESS posture (last-good retained), NOT an error — it MUST be
    // special-cased BEFORE the `"code" in result` branch (which would render it as {ok:false}).
    if ("outcome" in result && result.outcome === "shrink_held") {
      return NextResponse.json(
        { ok: true, result: { outcome: "shrink_held", detail: result.detail, heldModifiedTime: result.heldModifiedTime } },
        { status: 200 },
      );
    }
    if ("code" in result) {
      return NextResponse.json(
        { ok: false, error: result.code },
        { status: statusForManualSyncCode(result.code) },
      );
    }
```

> `_request.json()` on a bodyless POST throws → the `catch` yields `{}` (generic re-sync). Confirm `runManualSyncForShow`'s `ManualSyncResult` union already includes the `shrink_held` shape (it returns `ProcessOneFileResult`, extended in Task 2) so the `.detail`/`.heldModifiedTime` reads typecheck.

**Step 5d — run green:** `pnpm vitest run tests/app/admin tests/sync && pnpm typecheck`.

**Step 5e — commit:** `feat(admin): version-bound accept for held re-sync shrinkage (route + manual-sync signature)`.

---

### Task 6 — `ReSyncButton`: confirm-required state + "Apply reduced version" re-submit

**Interfaces**

Consumes: the route's `{ ok:true, result:{ outcome:"shrink_held", detail, heldModifiedTime } }` (Task 5).
Produces: a confirm prompt (counts + `data-testid="admin-resync-accept"`) that re-POSTs `{ acceptShrink:true, expectedModifiedTime }`.

**Step 6a — failing test** in `tests/components/admin/ReSyncButton.test.tsx`:

```ts
// Failure mode (R9): a generic one-click re-sync must NOT clobber. The hold returns shrink_held;
// the button must render a CONFIRM (not a plain success line) and only re-POST accept on click.
it("shrink_held result renders counts + Apply-reduced-version confirm; a plain success does not", async () => {
  mockFetchOnce({ ok: true, result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" } });
  render(<ReSyncButton slug="s" />);
  fireEvent.click(screen.getByTestId("admin-resync-button"));
  expect(await screen.findByText(/crew 5→2/)).toBeInTheDocument();
  expect(screen.getByTestId("admin-resync-accept")).toBeInTheDocument();
  expect(screen.queryByTestId("admin-resync-success")).toBeNull();
});
it("clicking Apply reduced version re-POSTs acceptShrink + expectedModifiedTime", async () => {
  mockFetchOnce({ ok: true, result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" } });
  render(<ReSyncButton slug="s" />);
  fireEvent.click(screen.getByTestId("admin-resync-button"));
  const accept = await screen.findByTestId("admin-resync-accept");
  mockFetchOnce({ ok: true, result: { outcome: "applied" } });
  fireEvent.click(accept);
  await waitFor(() =>
    expect(lastFetchBody()).toEqual({ acceptShrink: true, expectedModifiedTime: "T1" }),
  );
});
```

**Step 6b — run red.**

**Step 6c — implementation** in `components/admin/ReSyncButton.tsx`. Add a `heldShrink` state and a shared POST helper. Sketch (keep the existing error/success paths intact):

```tsx
  const [heldShrink, setHeldShrink] = useState<{ detail: string; heldModifiedTime: string } | null>(null);

  const post = async (accept?: { expectedModifiedTime: string }) => {
    if (pending) return;
    setErrorCode(null);
    setSuccessMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/sync/${encodeURIComponent(slug)}`, {
        method: "POST",
        ...(accept
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ acceptShrink: true, expectedModifiedTime: accept.expectedModifiedTime }),
            }
          : {}),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; result?: unknown };
      if (json.ok) {
        const result = json.result as { outcome?: string; detail?: string; heldModifiedTime?: string } | undefined;
        if (result?.outcome === "shrink_held" && result.detail && result.heldModifiedTime) {
          setHeldShrink({ detail: result.detail, heldModifiedTime: result.heldModifiedTime });
        } else {
          setHeldShrink(null);
          setSuccessMessage(summarizeResult(json.result));
          router.refresh();
        }
      } else {
        setHeldShrink(null);
        setErrorCode(typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR");
      }
    } catch {
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };
```

Wire the primary button to `() => post()` and render the confirm when `heldShrink` is set (before/after the success/error blocks):

```tsx
      {heldShrink && !errorCode ? (
        <div
          role="status"
          data-testid="admin-resync-shrink-confirm"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <p className="text-sm">
            This re-sync would reduce the show: {heldShrink.detail}. The last good version is still live.
            Apply the reduced version anyway?
          </p>
          <AccentButton
            onClick={() => post({ expectedModifiedTime: heldShrink.heldModifiedTime })}
            disabled={pending}
            data-testid="admin-resync-accept"
            fontWeight="medium"
            inline
            selfStart
            minWidthTap
            ringOffset="bg"
          >
            {pending ? "Applying…" : "Apply reduced version"}
          </AccentButton>
        </div>
      ) : null}
```

> The confirm copy is human text (the `detail` from `describeShrink`), not a raw code — invariant 5 satisfied. The primary `handleClick` is replaced by `() => post()`. Confirm `AccentButton` prop compatibility (it is already imported).

**Step 6d — run green:** `pnpm vitest run tests/components/admin/ReSyncButton.test.tsx && pnpm typecheck`.

**Step 6e — commit:** `feat(admin): ReSyncButton confirm-to-apply held re-sync shrinkage`.

> **UI note (invariant 8):** `ReSyncButton` is the PRIMARY UI surface for the close-out impeccable dual-gate (clarity of the shrink-count copy, the confirm affordance's prominence/accessibility, no accidental one-click destructive path).

---

### Task 7 — DB-backed integration tests

**New file** `tests/sync/resyncShrinkHold.db.test.ts` (env-gated on `TEST_DATABASE_URL`; the executor runs locally). Follow the existing DB-test harness (grep `TEST_DATABASE_URL` under `tests/sync` for the seed/teardown pattern).

**Step 7a — failing tests.**

```ts
// (6) Core data-loss bug: seed a published show + 5 crew; run the cron pipeline with a 2-crew parse.
it("hold retains last-good + raises alert + sets status", async () => {
  // seed: published show, 5 crew_members rows, prior parse of 5 crew
  await runCronPipelineForShow(driveFileId, parseOf({ crew: 2 })); // MI-6 crewDrop=3
  const crew = await sql`select id from public.crew_members where show_id = ${showId}`;
  expect(crew.length).toBe(5); // NO clobber — last-good retained (derived from the 5-row seed)
  const alerts = await sql`select code, resolved_at from public.admin_alerts where show_id = ${showId} and resolved_at is null`;
  expect(alerts.map((a) => a.code)).toContain("RESYNC_SHRINK_HELD");
  const [show] = await sql`select last_sync_status from public.shows where id = ${showId}`;
  expect(show.last_sync_status).toBe("shrink_held");
});

// (7a) Auto-resolve via the sync-problem sweep on a clean apply (Doug restored crew).
it("clean re-sync (crew restored → ok) resolves the RESYNC_SHRINK_HELD alert", async () => {
  await runCronPipelineForShow(driveFileId, parseOf({ crew: 2 }));      // hold
  await runCronPipelineForShow(driveFileId, parseOf({ crew: 5 }), { modifiedTime: "T2" }); // clean apply
  const open = await sql`select 1 from public.admin_alerts where show_id = ${showId} and code = 'RESYNC_SHRINK_HELD' and resolved_at is null`;
  expect(open.length).toBe(0); // swept by resolveStaleSyncProblemAlerts_unlocked(...,null), NOT resolveAdminAlert
});

// (7a') Auto-resolve via a manual version-bound accept.
it("manual accept (version-bound) applies the shrink and resolves the alert", async () => {
  const held = await runManualSyncForShow(driveFileId, "manual"); // shrink_held w/ heldModifiedTime
  await runManualSyncForShow(driveFileId, "manual", { acceptShrink: true, expectedModifiedTime: held.heldModifiedTime });
  const crew = await sql`select id from public.crew_members where show_id = ${showId}`;
  expect(crew.length).toBe(2); // reduced roster applied
  const open = await sql`select 1 from public.admin_alerts where show_id = ${showId} and code = 'RESYNC_SHRINK_HELD' and resolved_at is null`;
  expect(open.length).toBe(0);
});

// Version-binding negatives (integration): a mismatched expectedModifiedTime re-holds (no apply).
it("accept with a stale expectedModifiedTime re-holds (no clobber)", async () => {
  await runManualSyncForShow(driveFileId, "manual"); // held at T1
  // Simulate Doug editing between prompt and confirm: current binding.modifiedTime advances.
  await runManualSyncForShow(driveFileId, "manual", { acceptShrink: true, expectedModifiedTime: "STALE" });
  const crew = await sql`select id from public.crew_members where show_id = ${showId}`;
  expect(crew.length).toBe(5); // still last-good
});
```

> Assertions read the **data source** (`crew_members`, `admin_alerts`, `shows` rows), never a rendering container (anti-tautology rule). Crew counts are **derived** from the seed dimension (5) and the parse dimension (2), never a bare magic number stated only in the assertion.

**Step 7b — run red** (`TEST_DATABASE_URL` set).

**Step 7c — implementation:** none new — this task validates Tasks 1-6 end-to-end. If a test surfaces a wiring gap (e.g. the file-loop revalidation or the `runManualSyncForShow` shrink_held passthrough), fix in the owning task's file and note it.

**Step 7d — run green:** `TEST_DATABASE_URL=… pnpm vitest run tests/sync/resyncShrinkHold.db.test.ts && pnpm typecheck`.

**Step 7e — commit:** `test(sync): DB-backed re-sync shrink-hold (retain, alert, status, auto-resolve, version-binding)`.

---

### Task 8 — Self-review

- Run the FULL suite: `pnpm test` (all vitest, DB tests included with `TEST_DATABASE_URL`), `pnpm typecheck`, `pnpm format:check`, and the audit gates `pnpm test:audit:x1-catalog-parity` + `pnpm test:audit:x2-no-raw-codes`.
- Re-run the meta-test surfaces explicitly (comment/format-fragility): `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/auth/_metaInfraContract.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/sync/cutover.retireLivePendingSyncs.test.ts tests/app/admin/perShowPage.test.tsx`.
- Spec self-review checklist against `AGENTS.md`: guard conditions per new prop (null/empty/mismatched `expectedModifiedTime`); mode boundaries (cron/push/manual × accept/no-accept); §12.4 three-way lockstep staged together; flag lifecycle for `acceptShrink` (storage: none — request-scoped; write path: route body; read path: phase1 gate; effect: bypass hold when version matches); numeric sweep (2 held tags MI-6/MI-7; 1 new admin-alert code; 1 new SYNC_PROBLEM_CODE; 1 new status value; 0 migrations; meta-test count 22 auto / 43 total).
- Class-sweep: `rg 'last_sync_status' lib components app` to confirm every consumer that branches on the status enum got a `'shrink_held'` case (syncStatus, driveConnectionHealth, StaleFooter — and any admin dashboard status pill).
- **UI (invariant 8):** run `/impeccable critique` AND `/impeccable audit` on the UI diff (`ReSyncButton.tsx`, `StaleFooter.tsx`, `page.tsx` anchor); HIGH/CRITICAL fixed or `DEFERRED.md`-deferred; dispositions recorded in the handoff. This runs BEFORE adversarial review.

---

### Task 9 — Adversarial review (cross-model) — MANDATORY

After self-review completes, invoke the `adversarial-review` skill to send the whole diff to Codex (the opposing CLI). Iterate to **APPROVE** (no round budget). Preload the reviewer with the spec §9 **do-not-relitigate** list (staging-vs-alert owner decision; MI-11 co-occurrence holds nothing; no live `pending_sync` reinserted; manual-accept applies current-not-frozen; MI-7b excluded; auto-resolve via the sweep not `resolveAdminAlert`), each with its `file:line` citation. Brief must state **REVIEWER ONLY** (no fixes) and **fresh-eyes** posture, and forbid nested cross-model reviews from within the Codex session. Do NOT proceed to execution handoff without an APPROVE.

---

### Task 10 — Execution handoff / merge

- Push; verify **real CI green** (not just local) via `gh pr checks <PR#> --watch`; confirm `mergeStateStatus == CLEAN`.
- `gh pr merge --merge` (never squash); fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- Record the invariant-8 impeccable dispositions + adversarial-review closure in the milestone handoff §12.
- File `BL-RESYNC-STAGED-REVIEW-UI` in `BACKLOG.md` (spec §13) if not already present.

---

## Appendix — verified citations (pre-draft code-verification pass)

- `Phase1Args` `lib/sync/phase1.ts:80`; `Phase1Result` `:91`; `Phase1Tx` `:59`; `Phase1Binding.modifiedTime` `:17-19`; `Phase1ShowRow.showId/priorParseResult` `:22-29`; PF34 decision region `:316-414` (hold insert point after `:331`, before `mi11Items` `:337`); `updateShowParseError` decl `:72`, impl `runScheduledCronSync.ts:809`.
- `runScheduledCronSync.ts`: `syncProblemCodeForStatus` `:181`; `resolveStaleSyncProblemAlerts_unlocked` `:190`; `ProcessOneFileResult` `:210`; hard_fail caller branch `:2777-2806`; `requireTxBoundUpsertAdminAlert` `:1969`; `ProcessOneFileDeps` `:301`; `runPhase1_unlocked` args build `:2766-2775`.
- `lib/notify/constants.ts` `SYNC_PROBLEM_CODES` `:2-6`; `lib/notify/detect/recoveryResolution.ts` `STATUS_TO_CODE` `:4-8`, SQL CASE `:58-62`.
- `lib/adminAlerts/upsertAdminAlert.ts` `AdminAlertCode` union `:1`; `lib/adminAlerts/alertActions.ts` `ALERT_ACTION_CODES` `:13`, `ALERT_ACTIONS` `:79`, `resolveAlertAction` `:107`.
- `lib/messages/catalog.ts` `PARSE_ERROR_LAST_GOOD` `:110-124`.
- `_metaAdminAlertCatalog.test.ts`: `ADMIN_ALERTS_CODES` `:58`, `ADMIN_ALERTS_WRITE_SITES` `:108`, `ADMIN_ALERTS_LIFECYCLE` `:313`, `INTERPOLATED_DOUG_FACING_CODES` `:556`, inbox exact-set `:692`, inbox per-code `:696`, count comment `:301-304`.
- `app/api/admin/sync/[slug]/route.ts`: `runManualSyncForShow` call `:82`, `"code" in result` branch `:93-98`.
- `lib/sync/runManualSyncForShow.ts`: `RunManualSyncForShowDeps` `:47`, `processDeps` `:71`, entry `:282`, `_unlocked` `:270`, processDeps spread `:417`.
- `lib/admin/syncStatus.ts` `syncStatusBucket` `:20`; `lib/admin/driveConnectionHealth.ts` status map `:60-90,196`; `components/shared/StaleFooter.tsx` `selectCodeAndTier` `:54`, `pending_review>6h` `:64`.
- `app/admin/show/[slug]/page.tsx` `ReSyncButton` mount `:1004`; `components/admin/ReSyncButton.tsx` (full).
- `app/help/errors/_families.ts` `syncing-sheets` prefixes `:48-63`.
- No migration: `shows.last_sync_status` unconstrained `text` (`supabase/migrations/20260501000000_initial_public_schema.sql:23`).
