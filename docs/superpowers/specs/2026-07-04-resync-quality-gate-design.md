# Re-sync Quality Gate — Design Spec

**Date:** 2026-07-04
**Author:** Opus / Claude Code (autonomous ship)
**Audit source:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` finding #3 / §5 recommendation #2 (work item #2 of 6).
**Worktree/branch:** `/Users/ericweiss/fxav-worktrees/resync-quality-gate` · `feat/resync-quality-gate`

---

## 1. Problem

A re-sync of an **existing, already-published** show currently auto-applies with full-replace semantics regardless of how much data the new parse lost. Audit finding #3 (the highest-severity data-loss vector):

> **Re-sync shrinkage auto-clobbers live data — newest sheet always wins.** `lib/sync/phase1.ts:333-344` (MI-6..14 = notify-only); `applyParseResult.ts:128-135` (unconditional `deleteCrewMembersNotIn` + `replaceRooms/Hotels/...`). Plausible trigger: Doug deletes/moves a block mid-edit; sync fires between keystrokes. Live show overwritten. MI-6 crew shrink has no panel warning; only a passive `DataQualityBadge`.

The **detection already exists**: `runInvariants` (`lib/parser/invariants.ts:250-326`) computes `MI-6` (crew shrink `crewDrop > 1`) and `MI-7` (section shrink `nc < pc/2 || pc <= 2` for hotels/rooms/contacts, or transportation populated→null). The bug is purely **routing**: PF34 (`lib/sync/phase1.ts:333-345`) filters those triggered items down to `MI-11` only for existing shows; `MI-6`/`MI-7`/`MI-7b`/asset-drift are dropped, the pipeline falls through to `outcome: "pass"` (`phase1.ts:414`), and `applyParseResult` full-replaces the live rows.

## 2. Goal

Promote **count-based material shrinkage** (`MI-6` crew, `MI-7` section) on an existing published show from **notify-only auto-apply → staged-for-review**, so the live show retains last-good until an admin approves (accept the smaller roster) or rejects (keep last-good). This is audit recommendation #2 verbatim: *"Promote MI-6/MI-7 shrinkage from notify-only to staged-for-review."*

**Non-goal (explicitly out of scope):** a general "new parse materially worse than last-good" comparator (audit lists this as *"consider…"*, optional). `MI-6`/`MI-7` **are** the comparator; a second one is YAGNI. De-literalizing anchors is work item #3. MI-7b behavior change is excluded (§6).

## 3. Resolved decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Stage-for-review**, not alert-only. | An alert-only fix (audit's *"at minimum"*) fires **after** `applyParseResult` has already `deleteCrewMembersNotIn`'d the live rows — it reports the loss, it does not prevent it. Staging is the only option that actually stops the clobber. |
| D2 | **Reuse the existing `existing_staged` machinery**; add **no** new schema, **no** new §12.4 code, **no** new admin-alert code. | `pending_syncs` already supports existing-show rows (no `show_id` FK; keyed on `drive_file_id`; `20260501001000_internal_and_admin.sql:138-183`). The staging write path already branches on `show` existence (`phase1.ts:397-399` calls `updateShowPendingReview`). The `existing_staged` inbox variant (`lib/admin/needsAttention.ts:102,315`), digest push (`lib/notify/digest.ts:97` → "Changes staged for review"), per-show `?review=` surface, `applyStagedCore` UPDATE path, and `discardStaged` reject variants are all live and tested. `MI-6_CREW_SHRINKAGE` / `MI-7_SECTION_SHRINKAGE` already have §12.4 catalog rows (`lib/messages/catalog.ts:706,719`) and generated codes (`spec-codes.ts:527,533`). |
| D3 | **Gate `MI-6` and `MI-7` only**; leave `MI-7b`, `MI-11`, and asset-drift in their current lanes. | `MI-6`/`MI-7` are count-based **material** shrinkage (the audit's exact target). `MI-7b` (keyed preservation, `invariants.ts:329-360`) fires on **any benign room/hotel/contact rename** (memory `feedback_parser_rename_restages_via_mi7b`: "any rename re-stages once") — gating it would re-create the exact review-backlog problem the PF34 cutover eliminated. `MI-11` (email identity change) correctly routes to per-crew `sync_holds`. Asset drift is notify-only by design. |
| D4 | **MI-11 co-occurrence suppresses staging (identity-gate precedence).** A parse is staged ONLY when it carries material-shrinkage items AND **no** `MI-11` item. If `MI-11` (existing-crew email change) co-occurs with `MI-6`/`MI-7`, the parse is NOT staged — it falls through to `auto_apply_with_holds` (email held, rest applied), exactly as today. | The live staged-**apply** path is **fail-closed on `MI-11`** by deliberate design: `applyStaged.ts:1257-1266` (`P2-F7`) `throw`s `Phase2GateBypassError` if a staged row carries an `MI-11` item, because the legacy whole-parse apply calls `runPhase2` with `mi11Items: []` (`applyStaged.ts:1323`) → no `sync_holds` row → the changed email would apply **ungated**. Staging an `MI-11`-carrying parse would therefore strand the row (approval throws). Routing the combined case to `auto_apply_with_holds` preserves the identity gate AND introduces **zero regression** (identical to current behavior). Completing the combined case (stage + convert persisted `MI-11` items to holds on approve, reversing `P2-F7`) is a security-boundary change deferred to `BL-RESYNC-STAGE-MI11-HOLDS` (§13). |
| D5 | **Scope to existing shows only** (`show != null`). | `MI-6`/`MI-7` require a prior snapshot and return early when `prior === null` (`invariants.ts:238`), so they can never fire first-seen. The `!show` auto-publish branch (`phase1.ts:354-370`) is disjoint. |
| D6 | **Existing-show reject uses `defer_until_modified` semantics** so a rejected shrink cannot immediately re-stage. | The reject route already forwards all three variants (`app/api/admin/show/staged/[stagedId]/discard/route.ts:41-82`), and the deferral **consumer** is `drive_file_id`-keyed and show-agnostic (`runScheduledCronSync.ts:2147-2152`: `defer_until_modified` → skip until `modifiedTimeAdvanced`). Only the **write** side is blocked — `discardStaged.ts:504-505` refuses non-`try_again` when a show exists. Enabling it there is the whole fix (§4b). |

## 4. Architecture — the behavioral change

The primary production change is in `runPhase1` (`lib/sync/phase1.ts`), narrowing the PF34 filter so material-shrinkage items on an existing show route into `triggeredReviewItems` (→ `upsertLivePendingSync`) instead of being dropped. A secondary change in `discardStaged` (§4b) makes the reject path defer-capable for existing shows so a rejected shrink cannot re-stage.

**Before** (`phase1.ts:337-345`):

```ts
const mi11Items = reviewItems.filter(
  (item): item is Extract<TriggeredReviewItem, { invariant: "MI-11" }> =>
    item.invariant === "MI-11",
);

// The staging branch (`upsertLivePendingSync`) is now reserved for SENTINELS + hard-fail ONLY [PF34].
let triggeredReviewItems: TriggeredReviewItem[] = sentinel ? [sentinel] : [];
```

**After:**

```ts
const mi11Items = reviewItems.filter(
  (item): item is Extract<TriggeredReviewItem, { invariant: "MI-11" }> =>
    item.invariant === "MI-11",
);

// Re-sync quality gate (audit finding #3): count-based MATERIAL shrinkage (MI-6 crew,
// MI-7 section) on an EXISTING published show stages the whole parse for review instead
// of auto-clobbering live data. MI-7b (benign renames) and asset drift stay notify-only —
// narrowing PF34, not reversing it. MI-6/MI-7 require a prior (invariants.ts:238), so
// `show` is always non-null when they fire; the `show &&` guard documents the scope.
//
// IDENTITY-GATE PRECEDENCE (D4): stage ONLY when no MI-11 item co-occurs. The live
// staged-apply path is fail-closed on MI-11 (applyStaged.ts P2-F7 throws), so an MI-11-
// carrying parse must NOT be staged; it falls through to the auto_apply_with_holds branch
// below (email held, unchanged behavior).
const materialShrinkItems: TriggeredReviewItem[] =
  show && mi11Items.length === 0
    ? reviewItems.filter(
        (item) => item.invariant === "MI-6" || item.invariant === "MI-7",
      )
    : [];

let triggeredReviewItems: TriggeredReviewItem[] = [
  ...(sentinel ? [sentinel] : []),
  ...materialShrinkItems,
];
```

When `materialShrinkItems` is non-empty the existing `triggeredReviewItems.length > 0` branch (`phase1.ts:372-401`) stages the parse via `upsertLivePendingSync`, calls `updateShowPendingReview` (existing-show path already present at `:397-399`), and returns `{ outcome: "stage", ... }`. When `MI-11` co-occurs, `materialShrinkItems` is empty, staging is skipped, and control reaches `if (mi11Items.length > 0) return { outcome: "auto_apply_with_holds", mi11Items }` (`phase1.ts:406-408`) — unchanged.

### 4b. `discardStaged` — existing-show `defer_until_modified` (Finding 2 fix)

`lib/sync/discardStaged.ts` currently refuses any non-`try_again` reject when a show exists (`:504-505` → `INVALID_REVIEWER_ACTION`) and only writes a deferral on the `!show` branch (`:514-524`). The change: allow `defer_until_modified` (and `permanent_ignore`) for existing shows and write the deferral in the `if (show)` branch (in addition to `restoreShowStatus`), so a rejected shrink watermarks `deferred_at_modified_time = stagedModifiedTime` and the cron consumer (`runScheduledCronSync.ts:2147-2152`) skips it until the sheet's `modifiedTime` advances. `try_again` for an existing show is unchanged (restore status + delete pending → re-processes next cron, which re-stages if the sheet is still shrunk — an explicit "retry now" choice, distinct from "keep last-good until Doug fixes it").

**UI affordance:** the per-show `existing_staged` reject control must expose `defer_until_modified` (label per §5), not only `try_again`. The route already forwards it; only the UI needs the button. (Opus-owned per the UI-always-Opus rule; a one-control addition, no new layout/token surface — invariant-8 impeccable gate engaged at milestone close-out.)

### Why every guard already holds

- **Debounce does not swallow it.** `mi8DebounceReason` (`phase1.ts:176`) returns `null` (no debounce) whenever any non-`MI-8`/`MI-8b` item is present. A parse with an `MI-6`/`MI-7` item never early-returns at `phase1.ts:330-331`.
- **Items are present in `reviewItems`.** When `runInvariants` returns `{ outcome: "stage", triggeredItems }` (`invariants.ts:811`), `phase1.ts:317-324` wraps them via `withLeadToggleSafetyNet` into `invariantItems`, which flow into `reviewItems` (`phase1.ts:329`). The filter finds them there.
- **Live rows preserved.** The stage branch never calls `applyParseResult`. `updateShowPendingReview` (`runScheduledCronSync.ts:834-838`) only sets `last_sync_status = 'pending_review'`; `crew_members`/`rooms`/`hotels`/`contacts` are untouched. The crew page keeps serving last-good.
- **`pending_review` is display-benign on a published show.** Consumed only by `StaleFooter` / `lib/admin/syncStatus.ts` / `driveConnectionHealth.ts` as a passive status tier — it does **not** unpublish or hide the crew page.

## 5. Data flow

```
cron re-sync (existing published show)
  → parseSheet → runInvariants(prior, next)
     ├─ MI-6/MI-7 shrink present AND no MI-11  → outcome:"stage", triggeredItems
     │     → phase1: materialShrinkItems routed to upsertLivePendingSync
     │        → pending_syncs row (wizard_session_id NULL = LIVE)
     │        → updateShowPendingReview → shows.last_sync_status='pending_review'
     │        → live crew/rooms/hotels/contacts UNTOUCHED (last-good served)
     │     ── SIGNAL ──
     │        → Needs Attention inbox: variant "existing_staged" (needsAttention.ts:315)
     │        → notify digest push: "Changes staged for review" (digest.ts:97)
     │     ── REVIEW (admin, per-show ?review= surface) ──
     │        → APPROVE ("Apply changes") → applyStagedCore (UPDATE) → smaller parse applied
     │        → REJECT ("Keep current version") → discardStaged(defer_until_modified)
     │                  → deferral watermark @ stagedModifiedTime → cron skips until
     │                    the sheet is edited again → NO re-stage loop
     ├─ MI-6/MI-7 shrink present AND MI-11 co-occurs → auto_apply_with_holds (email held; D4)
     └─ MI-11 only / asset drift / MI-7b            → auto-apply (unchanged)
```

## 6. Guard conditions & edge cases

| Case | Behavior | Where it's handled |
|------|----------|--------------------|
| `MI-6`/`MI-7` + `MI-11` in one parse | Does NOT stage. Falls through to `auto_apply_with_holds` (email held, rest applied) — unchanged from today, no regression. Staging is suppressed because the staged-apply path is fail-closed on `MI-11` (P2-F7). | `materialShrinkItems` gated on `mi11Items.length === 0` (§4, D4); `applyStaged.ts:1264-1266`. |
| `MI-6`/`MI-7` + asset drift (no MI-11) | Whole parse stages; asset-drift feed rows not written this pass (re-derived on approve's apply). | Stage branch returns before asset-drift feed writes. |
| Repeated cron with same shrunk sheet (before reject) | `upsertLivePendingSync` upserts on `drive_file_id` (`runScheduledCronSync.ts:786`) → updates the existing staged row, no duplicate. | Existing upsert. |
| Admin rejects, Doug hasn't fixed sheet | Reject uses `defer_until_modified` → writes a deferral watermark at `stagedModifiedTime`; cron consumer (`runScheduledCronSync.ts:2147-2152`) skips until `modifiedTimeAdvanced`. No re-stage loop. When Doug edits again (new `modifiedTime`), it re-evaluates. | §4b `discardStaged` change + existing show-agnostic consumer. |
| Admin rejects with `try_again` (transient) | Restore status + delete pending → re-processes next cron; re-stages if still shrunk. Explicit "retry now" choice. | `discardStaged` `try_again` (unchanged). |
| First-seen sheet with "shrinkage" | Impossible — `MI-6`/`MI-7` need a prior (`invariants.ts:238`). | `show` guard (D5). |
| `MI-7b` keyed rename (room renamed, count stable) | Auto-applies (notify-only) — unchanged. Avoids staging benign renames. | Excluded from filter (D3). |
| `MI-7` transportation populated→null | Stages (it is an `MI-7` item, `invariants.ts:317-325`). | Included by filter. |
| Legitimate large crew removal (Doug really cut 3 people) | Stages; admin approves → smaller roster applied. The "accept legit shrink" affordance is the whole point of staging over retain-last-good. | `applyStagedCore` approve path. |
| Published-lifecycle interaction (unpublish/republish while a live pending_sync exists) | Governed by the existing `existing_staged` machinery + publish gate; not newly introduced by this change. | Watchpoint — test coverage in §8. |

## 7. Blast radius

**Production files changed (3):**
1. `lib/sync/phase1.ts` — the routing narrowing (§4). ~8 lines.
2. `lib/sync/discardStaged.ts` — allow `defer_until_modified`/`permanent_ignore` for existing shows + write the deferral in the `show` branch (§4b). ~10 lines.
3. The `existing_staged` reject UI control — expose the `defer_until_modified` action (§4b). UI, Opus-owned.

**What does NOT change:**
- **No schema change.** `pending_syncs` and `deferred_ingestions` already hold existing-show rows; the deferral consumer is already `drive_file_id`-keyed and show-agnostic.
- **No new §12.4 code.** `MI-6_CREW_SHRINKAGE`, `MI-7_SECTION_SHRINKAGE` already catalogued (`catalog.ts:706,719`; `spec-codes.ts:527,533`). No `gen:spec-codes` / `gen:internal-code-enums` regen, no x1/x2 catalog-parity impact.
- **No new admin-alert code.** Staging signals via inbox + digest (existing copy). `_metaAdminAlertCatalog` untouched.
- **No `applyParseResult` change.** The gate is upstream of apply.
- **No `runInvariants` change.** Detection thresholds reused as-is.
- **`applyStaged` P2-F7 fail-closed guard preserved** (not reversed). D4 routes the MI-11 combined case away from staging precisely so P2-F7 is never provoked.
- **No advisory-lock topology change.** `phase1` runs under the per-show `withShowLock` (`lib/sync/lockedShowTx.ts`, `hashtext('show:'||drive_file_id)`); `discardStaged` already owns its per-show lock/tx (`discardStaged.ts:101` comment). No new holder, no nesting. Meta-test `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected (no new SECURITY DEFINER function).

## 8. Testing strategy (TDD)

All new tests are unit/decision-rule level over the existing `phase1` fakes plus a DB-backed staging assertion; derive expectations from fixture dimensions (not hardcoded).

1. **Decision-rule: MI-6 crew shrink stages (existing show).** Prior 5 crew → next 2 crew (`crewDrop=3>1`); assert `outcome === "stage"`, `triggeredReviewItems` contains the `MI-6` item, and `upsertLivePendingSync` was called. Concrete failure it catches: a routing regression that drops `MI-6` back to auto-apply. (`tests/sync/phase1.decision-rule.test.ts`.)
2. **Decision-rule: MI-7 section shrink stages (existing show).** Prior 4 rooms → next 1 (`nc < pc/2`); assert staged. Also transportation populated→null stages.
3. **Decision-rule: benign drift still auto-applies.** (a) `MI-11`-only email change + crew **growth** → `outcome === "auto_apply_with_holds"`, NO live pending_sync (this is exactly the `cutover.retireLivePendingSyncs.test.ts:57` scenario — assert it stays green). (b) `MI-7b` rename with stable count → auto-applies, not staged. (c) crew drop of exactly 1 (`crewDrop=1`, not `>1`) → auto-applies. Failure it catches: over-staging benign renames / off-by-one on the `MI-6` threshold.
4. **Decision-rule: MI-11 co-occurrence suppresses staging (Finding 1).** Prior 5 crew with Alice@old → next 2 crew with Alice@new (`crewDrop=3>1` **and** an `MI-11` email change). Assert `outcome === "auto_apply_with_holds"`, `mi11Items` non-empty, and NO live pending_sync written. Concrete failure it catches: staging an `MI-11`-carrying parse, which would strand on the P2-F7 fail-closed guard at approve (or, worse, a future refactor bypassing the email hold).
5. **DB-backed staging integration.** Seed a published show + 5 crew; run the pipeline with a 2-crew parse (no email change); assert (a) a LIVE `pending_syncs` row exists (`wizard_session_id IS NULL`), (b) `shows.last_sync_status = 'pending_review'`, (c) the 5 live `crew_members` rows are **still present** (last-good retained, not clobbered). Failure it catches: the core data-loss bug — apply running despite the gate.
6. **Reject → defer → no re-stage loop (Finding 2).** DB-backed: stage an existing-show shrink; reject with `defer_until_modified`; assert a `deferred_ingestions` row exists with `deferred_at_modified_time = stagedModifiedTime`; then run the cron decision (`shouldSkip`/deferral gate) against the SAME `modifiedTime` → `skipped (deferred_modtime)`; and against an ADVANCED `modifiedTime` → proceeds (re-evaluates). Also assert `discardStaged` no longer returns `INVALID_REVIEWER_ACTION` for an existing show + `defer_until_modified`. Failure it catches: the re-stage loop and the existing-show reject regression.
7. **Cutover regression.** `tests/sync/cutover.retireLivePendingSyncs.test.ts` must stay green unchanged (its MI-11+growth scenario has no pure shrinkage, so the narrowed filter doesn't touch it). Cross-reference in the new decision-rule test that the cutover's "never inserts a live pending_sync" claim now reads "for benign drift" — pure shrinkage is the deliberate, narrow exception.
8. **Approve round-trip (existing coverage check).** Confirm `applyStagedCore` UPDATE path covers the existing-show approve (apply the smaller parse). Extend only if a gap surfaces.

## 9. Disagreement-loop preempt (for adversarial review)

**EXPLICITLY DO NOT RELITIGATE:**

- **"This reverses the PF34 / `retire_live_pending_syncs` cutover."** It narrows it, it does not reverse it. The cutover (`supabase/migrations/20260608000004_retire_live_pending_syncs.sql`) is a **one-shot residue sweep** — there is no CHECK/trigger forbidding future live rows. Its guarding test (`tests/sync/cutover.retireLivePendingSyncs.test.ts:57`) asserts only that **benign** drift (MI-11 email change + crew **growth**) never stages — it never exercises shrinkage. Material shrinkage is a distinct, higher-severity class the cutover deliberately did not consider. Benign drift still auto-applies exactly as PF34 intended.
- **"MI-11 + shrinkage bypasses the identity gate on approve."** Addressed by D4 — the combined case is NOT staged; it routes to `auto_apply_with_holds` (email held), so the P2-F7 fail-closed guard (`applyStaged.ts:1264-1266`) is never provoked. Zero regression vs today. The complete combined-case wiring (stage + convert persisted MI-11 → holds on approve) is `BL-RESYNC-STAGE-MI11-HOLDS` (§13).
- **"Add a general worse-than-last-good comparator."** Out of scope by decision D2/§2 — the audit lists it as optional ("consider…"); `MI-6`/`MI-7` are the comparator.
- **"Gate MI-7b too."** Excluded by D3 with rationale — MI-7b fires on benign renames and would re-create the review-backlog problem PF34 fixed.
- **"Raise a dedicated admin alert."** Rejected by D2 — staging already pushes via the digest (`digest.ts:97`) and surfaces in the inbox (`needsAttention.ts:315`), consistent with every other staged item. A bespoke alert would duplicate the signal and add the full `_metaAdminAlertCatalog` + §12.4 lockstep for no marginal signal.

## 10. Routing / flag lifecycle

There is no new boolean flag. The routing decision is code-level (the filter). For completeness, the one config flag in the neighborhood — `getAutoPublishCleanFirstSeen` (`phase1.ts:360`) — is **not consulted** by this change: it gates only the `!show` clean-first-seen branch, which is disjoint from the material-shrink branch (D5).

## 11. Meta-test inventory

- **Creates/extends:** none structurally new. Adds decision-rule + DB-staging + reject-defer tests under `tests/sync/`.
- **Must stay green:** `tests/sync/cutover.retireLivePendingSyncs.test.ts`, `tests/sync/phase1.decision-rule.test.ts`, `tests/sync/discardStaged.test.ts`, `tests/messages/*` (unchanged catalog), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no new lock holder), `tests/auth/_metaInfraContract.test.ts` (no new Supabase call boundary — `phase1` routing is pure in-memory; the `discardStaged` deferral write reuses the existing `upsertLiveDeferral` primitive, already registered).
- **Advisory-lock topology:** unchanged; no `pg_advisory*` edit. `phase1` runs inside the already-locked pipeline; `discardStaged` already owns its per-show lock.
- **UI / invariant 8:** the `existing_staged` reject control is a UI surface (`components/`/`app/` non-api). The one-control `defer_until_modified` addition engages the invariant-8 impeccable dual-gate (`/impeccable critique` + `audit`) at milestone close-out; HIGH/CRITICAL fixed or deferred via `DEFERRED.md`.

## 12. Numeric sweep

- `MI-6` threshold: `crewDrop > 1` (i.e., a drop of ≥2). Reused verbatim from `invariants.ts:251`. Not re-declared.
- `MI-7` threshold: `nc < pc/2 || pc <= 2` for hotels/rooms/contacts; transportation populated→null. Reused verbatim from `invariants.ts:266,284,302,317`.
- Staging condition: material-shrink items present AND `mi11Items.length === 0` (exactly 2 gated invariant tags: `MI-6`, `MI-7`).
- Production files changed: 3 (`phase1.ts`, `discardStaged.ts`, one reject-UI control). New production line-edit sites: 2 code + 1 UI. New test surfaces: `tests/sync/phase1.decision-rule.test.ts` (extend), a DB-staging test, and `tests/sync/discardStaged.test.ts` (extend for existing-show defer). No new fixtures, no schema, no new §12.4/alert code.

## 13. Backlog

- **`BL-RESYNC-STAGE-MI11-HOLDS`** (files to `BACKLOG.md` at implementation): complete the MI-6/MI-7 **+ MI-11** combined case so it stages (prevents the shrink clobber) instead of auto-applying, by persisting MI-11 items in the staged row and converting them to `sync_holds` on approve — which requires reversing the `applyStaged` P2-F7 fail-closed guard (`:1264-1266`) under its own security-boundary review + test. Deferred because (a) the combined case is rare, (b) D4 already preserves the identity gate with zero regression, and (c) reversing a fail-closed security boundary warrants a dedicated arc, not a rider on this one.
