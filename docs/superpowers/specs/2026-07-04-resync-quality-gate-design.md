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
| D4 | **Staging holds the WHOLE parse** (all-or-nothing). If a parse has `MI-6`+`MI-11` together, staging takes precedence; `MI-11` holds are not written this pass and are re-evaluated when the admin approves. | The stage branch (`phase1.ts:372-401`) returns before the `MI-11` branch (`phase1.ts:406-408`) — this ordering already yields the correct semantics; no code change needed for the combined case. |
| D5 | **Scope to existing shows only** (`show != null`). | `MI-6`/`MI-7` require a prior snapshot and return early when `prior === null` (`invariants.ts:238`), so they can never fire first-seen. The `!show` auto-publish branch (`phase1.ts:354-370`) is disjoint. |

## 4. Architecture — the single behavioral change

The only production change is in `runPhase1` (`lib/sync/phase1.ts`), narrowing the PF34 filter so material-shrinkage items on an existing show route into `triggeredReviewItems` (→ `upsertLivePendingSync`) instead of being dropped.

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
// of auto-clobbering live data. MI-7b (benign renames), MI-11 (→ sync_holds), and asset
// drift stay notify-only — narrowing PF34, not reversing it. MI-6/MI-7 require a prior
// (invariants.ts:238), so `show` is always non-null when they fire; the `show &&` guard is
// belt-and-suspenders + documents the existing-show scope.
const materialShrinkItems: TriggeredReviewItem[] = show
  ? reviewItems.filter(
      (item) => item.invariant === "MI-6" || item.invariant === "MI-7",
    )
  : [];

let triggeredReviewItems: TriggeredReviewItem[] = [
  ...(sentinel ? [sentinel] : []),
  ...materialShrinkItems,
];
```

The existing `triggeredReviewItems.length > 0` branch (`phase1.ts:372-401`) then stages the parse via `upsertLivePendingSync`, calls `updateShowPendingReview` (existing-show path already present at `:397-399`), and returns `{ outcome: "stage", ... }`. No other production file changes.

### Why every guard already holds

- **Debounce does not swallow it.** `mi8DebounceReason` (`phase1.ts:176`) returns `null` (no debounce) whenever any non-`MI-8`/`MI-8b` item is present. A parse with an `MI-6`/`MI-7` item never early-returns at `phase1.ts:330-331`.
- **Items are present in `reviewItems`.** When `runInvariants` returns `{ outcome: "stage", triggeredItems }` (`invariants.ts:811`), `phase1.ts:317-324` wraps them via `withLeadToggleSafetyNet` into `invariantItems`, which flow into `reviewItems` (`phase1.ts:329`). The filter finds them there.
- **Live rows preserved.** The stage branch never calls `applyParseResult`. `updateShowPendingReview` (`runScheduledCronSync.ts:834-838`) only sets `last_sync_status = 'pending_review'`; `crew_members`/`rooms`/`hotels`/`contacts` are untouched. The crew page keeps serving last-good.
- **`pending_review` is display-benign on a published show.** Consumed only by `StaleFooter` / `lib/admin/syncStatus.ts` / `driveConnectionHealth.ts` as a passive status tier — it does **not** unpublish or hide the crew page.

## 5. Data flow

```
cron re-sync (existing published show)
  → parseSheet → runInvariants(prior, next)
     ├─ MI-6 crewDrop>1 OR MI-7 section shrink  → outcome:"stage", triggeredItems
     │     → phase1: materialShrinkItems routed to upsertLivePendingSync
     │        → pending_syncs row (wizard_session_id NULL = LIVE)
     │        → updateShowPendingReview → shows.last_sync_status='pending_review'
     │        → live crew/rooms/hotels/contacts UNTOUCHED (last-good served)
     │     ── SIGNAL ──
     │        → Needs Attention inbox: variant "existing_staged" (needsAttention.ts:315)
     │        → notify digest push: "Changes staged for review" (digest.ts:97)
     │     ── REVIEW (admin, per-show ?review= surface) ──
     │        → APPROVE → applyStagedCore (UPDATE) → new (smaller) parse applied
     │        → REJECT  → discardStaged: try_again | defer_until_modified | permanent_ignore
     │                     (defer_until_modified advances baseline → no re-stage loop)
     └─ MI-11 only / asset drift / MI-7b  → auto-apply (unchanged)
```

## 6. Guard conditions & edge cases

| Case | Behavior | Where it's handled |
|------|----------|--------------------|
| `MI-6` + `MI-11` in one parse | Whole parse stages; `MI-11` holds NOT written this pass, re-evaluated on approve. | Stage branch returns before `MI-11` branch (`phase1.ts:372` vs `:406`). No code change. |
| `MI-6` + asset drift | Whole parse stages; asset-drift feed rows not written this pass. | Same ordering. |
| Repeated cron with same shrunk sheet | `upsertLivePendingSync` upserts on `drive_file_id` (`runScheduledCronSync.ts:786`) → updates the existing staged row, no duplicate. Cron also skips unchanged `modifiedTime` (per-show `last_seen_modified_time`), so no churn. | Existing upsert + no-global-cursor. |
| Admin rejects, Doug hasn't fixed sheet | `defer_until_modified` advances baseline so the rejected parse does not re-stage until the sheet is modified again. | `discardStaged` `DiscardVariant` (`lib/sync/discardStaged.ts:20`). |
| First-seen sheet with "shrinkage" | Impossible — `MI-6`/`MI-7` need a prior (`invariants.ts:238`). | `show` guard (D5). |
| `MI-7b` keyed rename (room renamed, count stable) | Auto-applies (notify-only) — unchanged. Avoids staging benign renames. | Excluded from filter (D3). |
| `MI-7` transportation populated→null | Stages (it is an `MI-7` item, `invariants.ts:317-325`). | Included by filter. |
| Legitimate large crew removal (Doug really cut 3 people) | Stages; admin approves → smaller roster applied. The "accept legit shrink" affordance is the whole point of staging over retain-last-good. | `applyStagedCore` approve path. |
| Published-lifecycle interaction (unpublish/republish while a live pending_sync exists) | Governed by the existing `existing_staged` machinery + publish gate; not newly introduced by this change. | Watchpoint — test coverage in §8. |

## 7. What does NOT change (blast-radius fence)

- **No schema change.** `pending_syncs` already holds existing-show rows.
- **No new §12.4 code.** `MI-6_CREW_SHRINKAGE`, `MI-7_SECTION_SHRINKAGE` already catalogued (`catalog.ts:706,719`; `spec-codes.ts:527,533`). No `gen:spec-codes` / `gen:internal-code-enums` regen, no x1/x2 catalog-parity impact.
- **No new admin-alert code.** Staging signals via inbox + digest (existing copy). `_metaAdminAlertCatalog` untouched.
- **No `applyParseResult` change.** The gate is upstream of apply.
- **No `runInvariants` change.** Detection thresholds are reused as-is.
- **No advisory-lock topology change.** The whole pipeline already runs under the per-show `withShowLock` (`lib/sync/lockedShowTx.ts`, `hashtext('show:'||drive_file_id)`); this change adds no lock holder. Meta-test `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected (no new SECURITY DEFINER function).

## 8. Testing strategy (TDD)

All new tests are unit/decision-rule level over the existing `phase1` fakes plus a DB-backed staging assertion; derive expectations from fixture dimensions (not hardcoded).

1. **Decision-rule: MI-6 crew shrink stages (existing show).** Prior 5 crew → next 2 crew (`crewDrop=3>1`); assert `outcome === "stage"`, `triggeredReviewItems` contains the `MI-6` item, and `upsertLivePendingSync` was called. Concrete failure it catches: a routing regression that drops `MI-6` back to auto-apply. (`tests/sync/phase1.decision-rule.test.ts`.)
2. **Decision-rule: MI-7 section shrink stages (existing show).** Prior 4 rooms → next 1 (`nc < pc/2`); assert staged. Also transportation populated→null stages.
3. **Decision-rule: benign drift still auto-applies.** (a) `MI-11`-only email change + crew **growth** → `outcome === "auto_apply_with_holds"`, NO live pending_sync (this is exactly the `cutover.retireLivePendingSyncs.test.ts:57` scenario — assert it stays green). (b) `MI-7b` rename with stable count → auto-applies, not staged. (c) crew drop of exactly 1 (`crewDrop=1`, not `>1`) → auto-applies. Failure it catches: over-staging benign renames / off-by-one on the `MI-6` threshold.
4. **DB-backed staging integration.** Seed a published show + 5 crew; run the pipeline with a 2-crew parse; assert (a) a LIVE `pending_syncs` row exists (`wizard_session_id IS NULL`), (b) `shows.last_sync_status = 'pending_review'`, (c) the 5 live `crew_members` rows are **still present** (last-good retained, not clobbered). Failure it catches: the core data-loss bug — apply running despite the gate.
5. **Cutover regression.** `tests/sync/cutover.retireLivePendingSyncs.test.ts` must stay green unchanged (its MI-11+growth scenario has no shrinkage, so the narrowed filter doesn't touch it). Add an inline assertion/comment in the new decision-rule test cross-referencing that the cutover's "never inserts a live pending_sync" claim now reads "for benign drift" — the shrink path is the deliberate, narrow exception.
6. **Approve/reject round-trip (existing coverage check).** Confirm `applyStagedCore` UPDATE path and `discardStaged` `defer_until_modified` already cover the existing-show approve/reject; extend only if a gap surfaces (no new machinery expected).

## 9. Disagreement-loop preempt (for adversarial review)

**EXPLICITLY DO NOT RELITIGATE:**

- **"This reverses the PF34 / `retire_live_pending_syncs` cutover."** It narrows it, it does not reverse it. The cutover (`supabase/migrations/20260608000004_retire_live_pending_syncs.sql`) is a **one-shot residue sweep** — there is no CHECK/trigger forbidding future live rows. Its guarding test (`tests/sync/cutover.retireLivePendingSyncs.test.ts:57`) asserts only that **benign** drift (MI-11 email change + crew **growth**) never stages — it never exercises shrinkage. Material shrinkage is a distinct, higher-severity class the cutover deliberately did not consider. Benign drift still auto-applies exactly as PF34 intended.
- **"Add a general worse-than-last-good comparator."** Out of scope by decision D2/§2 — the audit lists it as optional ("consider…"); `MI-6`/`MI-7` are the comparator.
- **"Gate MI-7b too."** Excluded by D3 with rationale — MI-7b fires on benign renames and would re-create the review-backlog problem PF34 fixed.
- **"Raise a dedicated admin alert."** Rejected by D2 — staging already pushes via the digest (`digest.ts:97`) and surfaces in the inbox (`needsAttention.ts:315`), consistent with every other staged item. A bespoke alert would duplicate the signal and add the full `_metaAdminAlertCatalog` + §12.4 lockstep for no marginal signal.

## 10. Routing / flag lifecycle

There is no new boolean flag. The routing decision is code-level (the filter). For completeness, the one config flag in the neighborhood — `getAutoPublishCleanFirstSeen` (`phase1.ts:360`) — is **not consulted** by this change: it gates only the `!show` clean-first-seen branch, which is disjoint from the material-shrink branch (D5).

## 11. Meta-test inventory

- **Creates/extends:** none structurally new. Adds decision-rule + DB-staging tests under `tests/sync/`.
- **Must stay green:** `tests/sync/cutover.retireLivePendingSyncs.test.ts`, `tests/sync/phase1.decision-rule.test.ts`, `tests/messages/*` (unchanged catalog), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no new lock holder), `tests/auth/_metaInfraContract.test.ts` (no new Supabase call boundary — the change is pure in-memory routing).
- **Advisory-lock topology:** unchanged; no `pg_advisory*` edit. The change lives inside the already-locked pipeline.

## 12. Numeric sweep

- `MI-6` threshold: `crewDrop > 1` (i.e., a drop of ≥2). Reused verbatim from `invariants.ts:251`. Not re-declared.
- `MI-7` threshold: `nc < pc/2 || pc <= 2` for hotels/rooms/contacts; transportation populated→null. Reused verbatim from `invariants.ts:266,284,302,317`.
- Filter set: exactly 2 invariant tags (`MI-6`, `MI-7`).
- New production files: 0. New production line-edit sites: 1 (`phase1.ts:337-345`). New test files: up to 2 (`tests/sync/phase1.decision-rule.test.ts` extension + a DB-staging test); no new fixtures.
