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

On a scheduled (cron) re-sync of an existing published show, **material shrinkage (`MI-6` crew, `MI-7` section) must not auto-apply.** Instead, **retain last-good** (serve the previous roster/blocks unchanged — no clobber) and **raise a pushed admin alert** so a human is signaled. The admin resolves by either accepting the shrink (a manual re-sync applies it) or leaving it until Doug fixes the sheet (the next clean cron re-sync applies and the alert auto-resolves).

This is audit recommendation #2's sanctioned option ("…or at minimum a pushed admin alert"), **chosen by the product owner** over the fuller "staged-for-review" path because the whole-parse review UI was deliberately retired in Phase 6 (resolution #21 cutover) and staging would require reversing that ratified decision (§10). Retain-last-good + alert prevents the exact data-loss vector, aligns with the current Phase-6 architecture (ChangesFeed + admin alerts, no whole-parse review mount), and is far smaller.

**Non-goals (out of scope):** a general "materially worse than last-good" comparator (`MI-6`/`MI-7` **are** the comparator); staging / a whole-parse review UI (owner-declined, §10); de-literalizing anchors (work item #3); any `MI-7b` behavior change (D3).

## 3. Resolved decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Retain-last-good + pushed admin alert** (product-owner decision 2026-07-04), NOT staging. | Staging (audit's primary rec) needs the whole-parse review UI that Phase 6 retired (`tests/app/admin/perShowPage.test.tsx:373-388` pins its absence: "the legacy live whole-parse review mount (ParsePanel) is RETIRED… no invariant stages a whole parse anymore"). Retain+alert prevents the clobber, aligns with Phase 6, and is far smaller. Owner chose it explicitly. |
| D2 | **Mirror the existing hard-fail retain path**, with a distinct outcome + code. | The hard-fail branch (`phase1.ts:288-313` → `runScheduledCronSync.ts:2777-2806`) already implements "retain last-good, don't apply, raise a per-show admin alert, resolve stale peers." The shrink-hold is the same shape with a new outcome `shrink_held` and a new code `RESYNC_SHRINK_HELD` (parse succeeded, so it is NOT `parse_error`/`PARSE_ERROR_LAST_GOOD`). |
| D3 | **Hold on `MI-6` and `MI-7` only.** Leave `MI-7b`, `MI-11`, asset-drift in their current lanes. | `MI-6`/`MI-7` are count-based **material** shrinkage (the audit's exact target). `MI-7b` (keyed preservation, `invariants.ts:329-360`) fires on **any benign rename** (memory `feedback_parser_rename_restages_via_mi7b`) — holding it would nag on normal edits. `MI-11` (email identity change) alone keeps routing to `auto_apply_with_holds`. Asset drift stays notify-only. |
| D4 | **Manual re-sync is the "accept" path — it overrides the hold and applies.** | Manual re-sync (`runManualSyncForShow`, `mode: "manual"`) is an explicit admin action; it already "re-applies even a held/suppressed show" (`runManualSyncForShow.ts:430,436` — DEF-3 overrides deferrals). The hold is gated on `args.mode !== "manual"`, so a manual re-sync applies the shrink (accepting the smaller roster) and the resolve-site clears the alert. A combined shrink+`MI-11` manual re-sync flows through the normal `auto_apply_with_holds` path (email still held). |
| D5 | **`MI-11` co-occurrence needs no special handling.** | Because the hold **applies nothing**, a shrink+email-change parse cannot clobber and cannot apply an ungated email. It simply holds last-good. (This is why retain-last-good is simpler than staging, which had to fail-close the approve path against `MI-11`.) |
| D6 | **Scope to existing shows only** (`show != null`), cron mode only. | `MI-6`/`MI-7` require a prior snapshot (`invariants.ts:238`) so they never fire first-seen. The `!show` first-seen/auto-publish branch (`phase1.ts:354-370`) is disjoint. |
| D7 | **No `last_sync_status` enum change.** The alert is the signal; last-good keeps its `ok` status. | Avoids a DB CHECK/enum migration and touching every status consumer (`StaleFooter`/`syncStatus`/`driveConnectionHealth`). The pushed `RESYNC_SHRINK_HELD` alert is the "held" signal (the audit's actual gap was *no pushed signal*). The alert's lifecycle is `auto`, resolved at the apply-success site (D2, §4c). |

## 4. Architecture

### 4a. `lib/sync/phase1.ts` — the hold decision

Where PF34 currently drops `MI-6`/`MI-7` to `pass`, add a hold branch. `MI-6`/`MI-7` items live in `reviewItems` (from `withLeadToggleSafetyNet(...)` when `runInvariants` returns `{outcome:"stage"}`, `phase1.ts:317-329`). Insert **before** the existing `triggeredReviewItems`/`mi11`/`pass` logic:

```ts
// Re-sync quality gate (audit finding #3): count-based MATERIAL shrinkage (MI-6 crew,
// MI-7 section) on an EXISTING published show HOLDS last-good instead of auto-clobbering.
// A scheduled (cron/push) re-sync does NOT apply; it retains last-good and the caller raises
// RESYNC_SHRINK_HELD. A MANUAL re-sync is the admin's explicit accept — it skips the hold and
// applies (mode "manual", runManualSyncForShow.ts:284). MI-6/MI-7 require a prior
// (invariants.ts:238) so `show` is always non-null here; the guard documents the scope.
const materialShrinkItems = show
  ? reviewItems.filter((item) => item.invariant === "MI-6" || item.invariant === "MI-7")
  : [];
if (materialShrinkItems.length > 0 && args.mode !== "manual") {
  const message = describeShrink(materialShrinkItems); // e.g. "crew 5→2; rooms 4→1"
  return {
    outcome: "shrink_held",
    code: "RESYNC_SHRINK_HELD",
    message,
    shrinkItems: materialShrinkItems,
    showId: show!.showId,
  };
}
```

`shrink_held` is a new `Phase1Result` variant. phase1 writes **nothing** to `shows` (last-good and its `ok` status stay; no `applyParseResult`). No `last_seen_modified_time` advance — identical to the hard-fail retain posture, so a subsequent unchanged cron re-evaluates and the caller re-raises the (deduped) alert; a fixed sheet (new `modifiedTime`) re-evaluates to `pass`/`auto_apply_with_holds`.

### 4b. `lib/sync/runScheduledCronSync.ts` — caller branch (raise alert)

Mirror the `hard_fail` branch (`2777-2806`). Add:

```ts
if (phase1.outcome === "shrink_held") {
  const result = { outcome: "shrink_held" as const, code: phase1.code, showId: phase1.showId };
  await logSync(txDeps, driveFileId, result);
  const show = await tx.readShowForPhase1(driveFileId);
  if (show?.showId) {
    const upsertAdminAlert = requireTxBoundUpsertAdminAlert(txDeps, "processOneFile_unlocked");
    await upsertAdminAlert({
      showId: show.showId,
      code: "RESYNC_SHRINK_HELD",
      context: { drive_file_id: driveFileId, sheet_name: show.priorParseResult.show.title, detail: phase1.message },
    });
  }
  return result;
}
```

`upsertAdminAlert` dedupes on `(coalesce(show_id::text,''), code) where resolved_at is null` (one open row per show+code; context replaced). Same tx-bound helper the hard-fail branch uses — no new Supabase call boundary.

### 4c. Resolve-site (lifecycle `auto`)

`RESYNC_SHRINK_HELD` is lifecycle **`auto`** (an inbox-routed code MUST be `auto` — `tests/messages/_metaAdminAlertCatalog.test.ts:704-707`). Its resolve-site is the **apply-success branch** (`runScheduledCronSync.ts:2844`, `phase1.outcome === "pass" || "auto_apply_with_holds"`): after a successful apply, call `resolveAdminAlert(tx, showId, "RESYNC_SHRINK_HELD")` (`lib/adminAlerts/resolveAdminAlert.ts:25`) — idempotent (no-op if none open). A successful apply means the held condition is gone (Doug restored the crew → clean re-sync, OR the admin accepted via manual re-sync). The `resolveSites` entry in `ADMIN_ALERTS_LIFECYCLE` points at this site.

## 5. New §12.4 admin-alert code — `RESYNC_SHRINK_HELD`

A pushed admin alert (an `AdminAlertCode`, which is also a §12.4 catalog code). Full lockstep:

| Touchpoint | Change |
|---|---|
| `lib/adminAlerts/upsertAdminAlert.ts` (`AdminAlertCode` union, ~:1-35) | add `\| "RESYNC_SHRINK_HELD"` |
| `tests/messages/_metaAdminAlertCatalog.test.ts` `ADMIN_ALERTS_CODES` (~:58) | add code |
| …`WRITE_SITES` (~:108) | add the `runScheduledCronSync.ts` shrink-hold raise site |
| …`ADMIN_ALERTS_LIFECYCLE` (~:313) | `{ class: "auto", resolveSites: [<apply-success site>] }` |
| `docs/…/2026-04-30-fxav-crew-pages-v1.md` §12.4 | new row (after `PARSE_ERROR_LAST_GOOD`) + helpfulContext appendix line |
| `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` | regenerate + commit |
| `lib/messages/catalog.ts` | producer row (mirror `PARSE_ERROR_LAST_GOOD` shape: `adminSurface:"inbox"`, non-null `dougFacing` admin copy, `crewFacing:null`, title, `helpHref`) |
| `pnpm gen:internal-code-enums` → `internal-code-enums.ts` | regenerate + commit |
| `app/help/errors/_families.ts` | map into a sync/review family (keep "Other" empty) |
| `tests/messages/*` (x1 catalog parity, x2 no-raw-codes, codes-coverage) | must pass; run the FULL `tests/messages` suite before push |

**Admin-facing copy (recovery-oriented):** title "Re-sync held — sheet lost data" / body "This sheet's latest version dropped crew or a whole section, so the update was held and the last good version is still live. If the change is intentional, re-sync the show to apply it; otherwise fix the sheet." (`dougFacing` = this admin copy; `crewFacing` = null — crew never see it.)

## 5b. Alert surfaces & the re-sync action

**Surface — Needs Attention (not Data Quality).** `adminSurface: "inbox"` routes `RESYNC_SHRINK_HELD` into the **Needs Attention** inbox aggregator (`isInboxRouted` from `lib/messages/adminSurface.ts`, computed from the catalog `adminSurface` field), exactly like its peers `PARSE_ERROR_LAST_GOOD` / `SHEET_UNAVAILABLE`. It also renders on the per-show alert card (`components/admin/PerShowAlertSection.tsx`) and pushes via the notify digest. It is deliberately **NOT** the passive `DataQualityBadge` — that quiet band is the exact gap audit finding #3 calls out.

**Re-sync action on the alert.** The alert carries an action link so the admin can accept (apply) the held shrink directly from the alert, without hunting for the control. Register `RESYNC_SHRINK_HELD` in the action-link registry (`lib/adminAlerts/alertActions.ts` — `ALERT_ACTION_CODES` + `ALERT_ACTIONS`), reusing the existing `shareAccess`-style slug builder:

```ts
// lib/adminAlerts/alertActions.ts
RESYNC_SHRINK_HELD: (_context, opts) => {
  const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
  return slug
    ? { label: "Review & re-sync", href: `/admin/show/${encodeURIComponent(slug)}`, external: false }
    : null; // fail-quiet when slug missing (registry contract)
},
```

The link lands the admin at the top of the per-show page, where the existing **`ReSyncButton`** (`components/admin/ReSyncButton.tsx`, mounted at the top of `/admin/show/[slug]`, POSTs `/api/admin/sync/[slug]` → `runManualSyncForShow(driveFileId, "manual")`) applies the held parse (the D4 accept path) and the resolve-site (§4c) clears the alert. **No new re-sync UI is built** — the action link reuses the existing button; the manual re-sync (`mode: "manual"`) is exactly the hold-override accept path.

**Registry lockstep:** add the code to `ALERT_ACTION_CODES` + `ALERT_ACTIONS`, and a row to the pinning meta-test `tests/adminAlerts/alertActions.test.ts` (slug-present → link; slug-missing → null, fail-quiet). `resolveAlertAction` returns null for unregistered codes, so this is additive.

## 6. Data flow

```
cron/push re-sync (existing published show)
  → parseSheet → runInvariants(prior, next)
     ├─ MI-6 crewDrop>1 OR MI-7 section shrink (mode != manual)
     │     → phase1 outcome "shrink_held" — NO applyParseResult (last-good served)
     │     → caller raises RESYNC_SHRINK_HELD (upsertAdminAlert, DEDUPE per show → one open row)
     │        → Needs Attention inbox (adminSurface:"inbox") + per-show alert card + digest push
     │        → alert carries "Review & re-sync" action link → per-show ReSyncButton
     │     ── ADMIN RESOLVES ──
     │        accept (legit shrink) → click through → ReSyncButton (mode "manual") → hold skipped
     │                                → applies → resolve-site AUTO-CLEARS the alert
     │        mistake → do nothing; Doug fixes sheet → clean cron re-sync applies
     │                                → resolve-site AUTO-CLEARS the alert (no manual dismiss)
     ├─ MI-6/MI-7 present AND mode == manual → applies (accept; MI-11 still held if present)
     └─ MI-11 only / asset drift / MI-7b / crewDrop==1 → auto-apply (unchanged)
```

## 7. Guard conditions & edge cases

| Case | Behavior | Where |
|------|----------|-------|
| `MI-6`/`MI-7` + `MI-11` (cron) | Holds — applies nothing, so no clobber AND no ungated email. `MI-11` rides along unused. | D5; `phase1` hold branch precedes the `mi11` branch. |
| `MI-6`/`MI-7` + `MI-11` (manual accept) | Hold skipped → `auto_apply_with_holds` → shrink applied, email held. | D4; `phase1.ts:406-408`. |
| `MI-6`/`MI-7` + asset drift (cron) | Holds; asset-drift feed rows not written this pass. | Hold branch returns first. |
| crew drop of exactly 1 (`crewDrop==1`) | Auto-applies (not `>1`). | `invariants.ts:251`. |
| `MI-7b` benign rename, stable count | Auto-applies (not held). | Excluded from filter (D3). |
| Repeated cron, sheet unchanged | Re-evaluates → re-`shrink_held`; `upsertAdminAlert` dedupes → one open row. Same posture as hard-fail retry. | `upsert` conflict clause. |
| Doug fixes the sheet | New `modifiedTime` → clean cron re-sync → `pass`/`auto_apply_with_holds` → resolve-site clears alert. | §4c. |
| Manual re-sync of a genuinely-shrunk sheet | Applies the smaller roster (explicit accept) + resolves the alert. | D4, §4c. |
| First-seen shrink | Impossible — `MI-6`/`MI-7` need a prior. | D6. |
| Show archived/unpublished mid-hold | Governed by existing archive/publish gates; the hold writes nothing to `shows`, so no lifecycle interaction is introduced. | — |

## 8. Testing strategy (TDD)

Derive expectations from fixture dimensions (not hardcoded).

1. **phase1: MI-6 crew shrink (cron) → `shrink_held`.** Prior 5 crew → next 2 (`crewDrop=3>1`), `mode:"cron"`; assert `outcome==="shrink_held"`, `code:"RESYNC_SHRINK_HELD"`, and NO apply/`upsertLivePendingSync`. (`tests/sync/phase1.decision-rule.test.ts`.)
2. **phase1: MI-7 section shrink (cron) → `shrink_held`.** Prior 4 rooms → 1 (`nc<pc/2`); also transportation populated→null. Assert held.
3. **phase1: MI-6/MI-7 (mode `"manual"`) → NOT held.** Same shrink but `mode:"manual"` → `outcome` is `pass`/`auto_apply_with_holds` (applies). Catches: the accept path silently holding.
4. **phase1: MI-6 + MI-11 (cron) → `shrink_held`.** Prior 5/Alice@old → next 2/Alice@new; assert held (no apply → no clobber, no ungated email). Catches: routing the combined case to auto-apply.
5. **phase1: benign drift unchanged.** (a) MI-11-only + crew growth → `auto_apply_with_holds`, no hold (matches `cutover.retireLivePendingSyncs.test.ts:57`, stays green). (b) MI-7b rename stable count → applies. (c) `crewDrop==1` → applies. Catches: over-holding benign edits / off-by-one.
6. **DB-backed: hold retains last-good + raises alert.** Seed published show + 5 crew; run cron pipeline with a 2-crew parse; assert (a) the 5 live `crew_members` rows are **still present** (no clobber), (b) an open `admin_alerts` row `code=RESYNC_SHRINK_HELD` for the show, (c) `shows.last_sync_status` unchanged (`ok`). Catches: the core data-loss bug + missing signal.
7. **DB-backed: resolution on apply.** After a hold, run a clean re-sync (crew restored) OR a manual re-sync (accept); assert the open `RESYNC_SHRINK_HELD` alert is resolved (`resolved_at` set). Catches: a stuck-open alert (lifecycle `auto` contract).
8. **Alert action link.** `resolveAlertAction("RESYNC_SHRINK_HELD", ctx, {slug})` → `{label:"Review & re-sync", href:"/admin/show/<slug>"}`; slug missing → `null` (fail-quiet). (`tests/adminAlerts/alertActions.test.ts`.) Catches: an unregistered code (no link) or a link that renders with a broken/empty slug.
9. **Meta-tests stay green:** `_metaAdminAlertCatalog` (new code registered: union + `ADMIN_ALERTS_CODES` + `WRITE_SITES` + `LIFECYCLE` class `auto` + resolveSite; non-null `dougFacing`); x1 catalog parity; x2 no-raw-codes; `alertActions.test.ts` registry row; `cutover.retireLivePendingSyncs.test.ts` (unchanged — this design never inserts a live `pending_sync`).

## 9. Disagreement-loop preempt (for adversarial review)

**EXPLICITLY DO NOT RELITIGATE:**

- **"Use staged-for-review (the audit's primary rec) instead of an alert."** The product owner explicitly chose retain-last-good + alert on 2026-07-04 **because** staging requires un-retiring the whole-parse review UI that Phase 6 deliberately removed (`tests/app/admin/perShowPage.test.tsx:373-388` pins the retirement; `app/admin/show/[slug]/page.tsx` mounts `ChangesFeed`, not `ParsePanel`/`StagedReviewCard`). Reversing a ratified architectural decision is a separate, larger arc — `BL-RESYNC-STAGED-REVIEW-UI` (§13). This design is the audit's sanctioned alternative and fully prevents the data-loss clobber.
- **"MI-11 + shrinkage bypasses the identity gate / clobbers."** No — the hold **applies nothing** (D5). No clobber, no ungated email. A manual accept flows through the normal `auto_apply_with_holds` (email held).
- **"This re-inserts live `pending_syncs` / reverses the PF34 cutover."** No — this design never writes a `pending_sync`; it retains last-good like the hard-fail path. `cutover.retireLivePendingSyncs.test.ts` stays green unchanged.
- **"Add a general worse-than-last-good comparator."** Out of scope — `MI-6`/`MI-7` are the comparator (audit lists a general one as optional "consider…").
- **"Gate MI-7b too."** Excluded (D3) — MI-7b fires on benign renames; holding it would nag on normal edits.
- **"The held show should change `last_sync_status`."** Deliberately not (D7) — last-good is genuinely fine (`ok`); the pushed alert is the signal (the audit's actual gap). Avoids a status-enum migration + consumer churn.

## 10. Why staging was declined (context)

Phase 6 (resolution #21 cutover) removed the whole-parse review mount from the per-show page: `app/admin/show/[slug]/page.tsx` mounts `ChangesFeed`; `tests/app/admin/perShowPage.test.tsx:373-388` asserts `staged-review-apply` / `staged-review-read-only` / `admin-show-parse-warnings-section` are absent, with the comment "no invariant stages a whole parse anymore." Staging `MI-6`/`MI-7` would reintroduce exactly what Phase 6 retired and require rebuilding that admin review surface (Apply / Keep-current) plus rewriting the pinning test. The owner declined that scope in favor of retain-last-good + alert. Filed as `BL-RESYNC-STAGED-REVIEW-UI` (§13) if a richer review workflow is wanted later.

## 11. Meta-test inventory

- **Extends:** `tests/messages/_metaAdminAlertCatalog.test.ts` (new `RESYNC_SHRINK_HELD` across union / `ADMIN_ALERTS_CODES` / `WRITE_SITES` / `ADMIN_ALERTS_LIFECYCLE`), `tests/adminAlerts/alertActions.test.ts` (new action-link registry row), and the §12.4 three-way lockstep (x1/x2/codes-coverage).
- **Must stay green:** `tests/sync/cutover.retireLivePendingSyncs.test.ts` (no live `pending_sync` written), `tests/app/admin/perShowPage.test.tsx` (unchanged — no review UI added), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no new lock holder; the raise runs inside the already-locked cron tx), `tests/auth/_metaInfraContract.test.ts` (reuses the existing tx-bound `upsertAdminAlert` helper — no new call boundary).
- **Advisory-lock topology:** unchanged; the shrink-hold branch and the alert raise both run inside the existing per-show `withShowLock` cron tx.

## 12. Numeric sweep

- `MI-6` threshold `crewDrop > 1`; `MI-7` `nc < pc/2 || pc <= 2` (transportation populated→null) — reused verbatim from `invariants.ts:251,266,284,302,317`.
- Held invariant tags: exactly 2 (`MI-6`, `MI-7`).
- New production edit sites: `phase1.ts` (hold branch + `Phase1Result` variant), `runScheduledCronSync.ts` (caller branch + resolve-site), `upsertAdminAlert.ts` (union), `lib/adminAlerts/alertActions.ts` (action-link row). Plus the §12.4/admin-alert lockstep (catalog.ts, spec §12.4, 2 regens, `_families.ts`, meta-test registry rows). New admin-alert codes: 1 (`RESYNC_SHRINK_HELD`). New DB schema: 0. New `last_sync_status` values: 0. New UI component files: 0 (reuses `PerShowAlertSection` rendering + `ReSyncButton`).

## 13. Backlog

- **`BL-RESYNC-STAGED-REVIEW-UI`** (files to `BACKLOG.md`): if a richer "review the diff and approve the smaller roster inline" workflow is wanted, restore/replace the whole-parse review surface for existing-show staged parses (un-retire or re-home `StagedReviewCard` with existing-show mode; expose Apply / Keep-current; update `perShowPage.test.tsx` retirement pins). Deferred by owner decision (§10) — retain-last-good + alert already prevents the data loss; this is a UX enhancement, not a safety gap.
