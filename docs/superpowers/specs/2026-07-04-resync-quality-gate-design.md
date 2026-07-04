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
| D7 | **`RESYNC_SHRINK_HELD` is a peer sync-problem code**, exactly like `PARSE_ERROR_LAST_GOOD`: set `last_sync_status = 'shrink_held'` on the hold; add the code to `SYNC_PROBLEM_CODES` and to `syncProblemCodeForStatus`. | This is the ONLY correct way to get auto-resolve + digest for an inbox-routed code (Codex R6). `resolveAdminAlert` **throws** for inbox-routed codes; inbox sync-problem alerts resolve through the SQL sweep `resolveStaleSyncProblemAlerts_unlocked` (`runScheduledCronSync.ts:190`), which the success/recovery path already calls with `currentCode=null` (`runScheduledCronSync.ts:2241,2320,2800`; `runManualSyncForShow.ts:443`) — so a clean apply auto-resolves `RESYNC_SHRINK_HELD` **for free** once it's a `SYNC_PROBLEM_CODE`. Digest push is likewise gated on `SYNC_PROBLEM_CODES` (`lib/notify/detect/candidates.ts`), so membership is required for the pushed signal. **No DB migration** — `shows.last_sync_status` is unconstrained `text` (`20260501000000_initial_public_schema.sql:23`). Status consumers get a `'shrink_held'` case: `syncStatus.ts:22-26` + `driveConnectionHealth.ts` mirror `'parse_error'` (degraded tier); the crew-facing `StaleFooter.tsx:54-73` treats it like `'pending_review'` (delayed, not error — §5). |

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

`shrink_held` is a new `Phase1Result` variant. Like the hard-fail branch (which sets `last_sync_status='parse_error'` via `updateShowParseError`), phase1 sets **`last_sync_status = 'shrink_held'`** and `last_sync_error = message` — but does **not** touch `crew_members`/`rooms`/`hotels`/`contacts` (no `applyParseResult`), so last-good rows are retained and the crew page keeps serving them. No `last_seen_modified_time` advance — identical to the hard-fail retain posture, so a subsequent unchanged cron re-evaluates and the caller re-raises the (deduped) alert; a fixed sheet (new `modifiedTime`) re-evaluates to `pass`/`auto_apply_with_holds`. Implement via an `updateShowShrinkHeld(driveFileId, {message})` tx method mirroring `updateShowParseError` (returns `showId`).

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
    // Resolve OTHER stale sync-problem alerts, KEEP this one (mirrors the hard_fail branch's
    // resolve call at :2800 with currentCode = the code just raised).
    await resolveStaleSyncProblemAlerts_unlocked(
      tx, show.showId, syncProblemCodeForStatus("shrink_held"), // === "RESYNC_SHRINK_HELD"
    );
  }
  return result;
}
```

`upsertAdminAlert` dedupes on `(coalesce(show_id::text,''), code) where resolved_at is null` (one open row per show+code; context replaced). Same tx-bound helper the hard-fail branch uses — no new Supabase call boundary. The `shrink_held` outcome is added to `Phase1Result` **and** `ProcessOneFileResult`; the file-loop handles it like `hard_fail` (log + post-commit `revalidateShowFromResult` via `showId`, since the hold committed `shows.last_sync_status='shrink_held'` and must bust the projected status).

### 4c. Auto-resolve — via the sync-problem sweep, NOT `resolveAdminAlert`

`RESYNC_SHRINK_HELD` is lifecycle **`auto`** (an inbox-routed code MUST be `auto` — `tests/messages/_metaAdminAlertCatalog.test.ts:704-707`). **Do NOT use `resolveAdminAlert`** — it `throw`s for any `isInboxRouted(code)` and a meta-test bans inbox literals from that helper. Instead, resolution is **free** through the existing sync-problem recovery sweep: every clean apply / recovery already calls `resolveStaleSyncProblemAlerts_unlocked(tx, showId, null)` (`runScheduledCronSync.ts:2241,2320,2800`; `runManualSyncForShow.ts:443`), which resolves all open sync-problem alerts for the show except `currentCode`. With `currentCode=null` on a successful apply (status → `ok`), `RESYNC_SHRINK_HELD` is swept closed automatically — whether Doug restored the crew (clean cron) or the admin accepted via manual re-sync. The `resolveSites` in `ADMIN_ALERTS_LIFECYCLE` are exactly `PARSE_ERROR_LAST_GOOD`'s (the same recovery-sweep sites) — mirror that entry.

## 5. New §12.4 admin-alert code — `RESYNC_SHRINK_HELD`

A pushed admin alert (an `AdminAlertCode`, which is also a §12.4 catalog code). Full lockstep:

| Touchpoint | Change |
|---|---|
| `lib/adminAlerts/upsertAdminAlert.ts` (`AdminAlertCode` union, ~:1-35) | add `\| "RESYNC_SHRINK_HELD"` |
| `lib/notify/constants.ts` `SYNC_PROBLEM_CODES` | add `"RESYNC_SHRINK_HELD"` (→ digest push + realtime tier + recovery sweep membership) |
| `lib/sync/runScheduledCronSync.ts` `syncProblemCodeForStatus` (:181-188) | add `if (status === "shrink_held") return "RESYNC_SHRINK_HELD";` |
| `lib/sync/runScheduledCronSync.ts` (tx method) | add `updateShowShrinkHeld(driveFileId, {message})` (sets `last_sync_status='shrink_held'`, `last_sync_error=message`; mirrors `updateShowParseError`) |
| `lib/admin/syncStatus.ts` (:22-26) + `lib/admin/driveConnectionHealth.ts` | add a `'shrink_held'` case (degraded sync-problem tier, mirror `'parse_error'`) |
| `components/shared/StaleFooter.tsx` (`selectCodeAndTier`, :54-73) — **crew-facing** | treat `'shrink_held'` **identically to `'pending_review'`**: age-based tiers, escalating to `SYNC_DELAYED_SEVERE` (red) when held > 6h. NOT the `parse_error` red-error path — the sheet parsed fine; crew are seeing valid last-good, so the honest framing is "sync delayed / showing last confirmed version," not "error." No crew-facing copy for `RESYNC_SHRINK_HELD` (it is admin-only, `crewFacing:null`). |
| `app/admin/show/[slug]/page.tsx` (:1004) | wrap the `ReSyncButton` mount in `id="resync"` (stable fragment anchor for the alert action link) |
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

**Surface — Needs Attention (not Data Quality).** `adminSurface: "inbox"` routes `RESYNC_SHRINK_HELD` into the **Needs Attention** inbox aggregator (`isInboxRouted` from `lib/messages/adminSurface.ts`, computed from the catalog `adminSurface` field), exactly like its peers `PARSE_ERROR_LAST_GOOD` / `SHEET_UNAVAILABLE`. It also renders on the per-show alert card (`components/admin/PerShowAlertSection.tsx`) and — because it is now in `SYNC_PROBLEM_CODES` (D7) — is a **notify-digest** candidate (`lib/notify/detect/candidates.ts` selects `admin_alerts` whose `code = any(SYNC_PROBLEM_CODES)`), pushed like its peers after the staleness threshold. It is deliberately **NOT** the passive `DataQualityBadge` — that quiet band is the exact gap audit finding #3 calls out.

**Re-sync action on the alert.** The alert carries an action link so the admin can accept (apply) the held shrink directly from the alert, without hunting for the control. Register `RESYNC_SHRINK_HELD` in the action-link registry (`lib/adminAlerts/alertActions.ts` — `ALERT_ACTION_CODES` + `ALERT_ACTIONS`), reusing the existing `shareAccess`-style slug builder:

```ts
// lib/adminAlerts/alertActions.ts
RESYNC_SHRINK_HELD: (_context, opts) => {
  const slug = typeof opts.slug === "string" ? opts.slug.trim() : "";
  return slug
    ? { label: "Review & re-sync", href: `/admin/show/${encodeURIComponent(slug)}#resync`, external: false }
    : null; // fail-quiet when slug missing (registry contract)
},
```

The link jumps (via the `#resync` fragment) directly to the existing **`ReSyncButton`** (`components/admin/ReSyncButton.tsx`), which is mounted in the per-show page footer (`app/admin/show/[slug]/page.tsx:1004`) and POSTs `/api/admin/sync/[slug]` → `runManualSyncForShow(driveFileId, "manual")` — applying the held parse (the D4 accept path); the recovery sweep (§4c) then clears the alert. **Required companion change:** wrap the `ReSyncButton` mount in a container with `id="resync"` (a stable anchor) so the fragment lands on it, and a test asserts that anchor renders on the per-show page. **No new re-sync UI is built** — the action link reuses the existing button; the manual re-sync (`mode: "manual"`) is exactly the hold-override accept path.

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
6. **DB-backed: hold retains last-good + raises alert + sets status.** Seed published show + 5 crew; run cron pipeline with a 2-crew parse; assert (a) the 5 live `crew_members` rows are **still present** (no clobber), (b) an open `admin_alerts` row `code=RESYNC_SHRINK_HELD` for the show, (c) `shows.last_sync_status = 'shrink_held'`. Catches: the core data-loss bug + missing signal + missing status.
7. **DB-backed: auto-resolve via the recovery sweep.** After a hold, run a clean re-sync (crew restored → status `ok`) OR a manual re-sync (accept); assert the open `RESYNC_SHRINK_HELD` alert is resolved (`resolved_at` set) by the existing `resolveStaleSyncProblemAlerts_unlocked(...,null)` path — NOT via `resolveAdminAlert`. Catches: a stuck-open inbox alert / a throwing `resolveAdminAlert` call (Codex R6 finding 1).
8. **Digest candidacy + status mapping + crew footer.** Assert `SYNC_PROBLEM_CODES` includes `RESYNC_SHRINK_HELD` and `syncProblemCodeForStatus("shrink_held") === "RESYNC_SHRINK_HELD"`; that a status consumer (`syncStatus.ts`) classifies `'shrink_held'` as a degraded tier (not `ok`); and that `StaleFooter` renders `'shrink_held'` like `'pending_review'` — subtle when fresh, `SYNC_DELAYED_SEVERE` (red) when > 6h — NOT a `parse_error`-style error. Catches: the alert never reaching the digest (R6-2) / an unclassified status / a held re-sync rendering as a normal recent sync on crew pages (R7-1).
9. **Alert action link + anchor target.** `resolveAlertAction("RESYNC_SHRINK_HELD", ctx, {slug})` → `{label:"Review & re-sync", href:"/admin/show/<slug>#resync"}`; slug missing → `null` (fail-quiet) (`tests/adminAlerts/alertActions.test.ts`). AND a per-show-page test asserts an element with `id="resync"` renders around the `ReSyncButton` (the fragment target exists). Catches: an unregistered code / broken slug / a link that lands nowhere (R7-2).
10. **Meta-tests stay green:** `_metaAdminAlertCatalog` (new code registered: union + `ADMIN_ALERTS_CODES` + `WRITE_SITES` + `LIFECYCLE` class `auto` + `PARSE_ERROR_LAST_GOOD`-mirrored resolveSites; non-null `dougFacing`); x1 catalog parity; x2 no-raw-codes; `alertActions.test.ts` registry row; any `SYNC_PROBLEM_CODES` pin test (`tests/notify/*`); `cutover.retireLivePendingSyncs.test.ts` (unchanged — this design never inserts a live `pending_sync`).

## 9. Disagreement-loop preempt (for adversarial review)

**EXPLICITLY DO NOT RELITIGATE:**

- **"Use staged-for-review (the audit's primary rec) instead of an alert."** The product owner explicitly chose retain-last-good + alert on 2026-07-04 **because** staging requires un-retiring the whole-parse review UI that Phase 6 deliberately removed (`tests/app/admin/perShowPage.test.tsx:373-388` pins the retirement; `app/admin/show/[slug]/page.tsx` mounts `ChangesFeed`, not `ParsePanel`/`StagedReviewCard`). Reversing a ratified architectural decision is a separate, larger arc — `BL-RESYNC-STAGED-REVIEW-UI` (§13). This design is the audit's sanctioned alternative and fully prevents the data-loss clobber.
- **"MI-11 + shrinkage bypasses the identity gate / clobbers."** No — the hold **applies nothing** (D5). No clobber, no ungated email. A manual accept flows through the normal `auto_apply_with_holds` (email held).
- **"This re-inserts live `pending_syncs` / reverses the PF34 cutover."** No — this design never writes a `pending_sync`; it retains last-good like the hard-fail path. `cutover.retireLivePendingSyncs.test.ts` stays green unchanged.
- **"Add a general worse-than-last-good comparator."** Out of scope — `MI-6`/`MI-7` are the comparator (audit lists a general one as optional "consider…").
- **"Gate MI-7b too."** Excluded (D3) — MI-7b fires on benign renames; holding it would nag on normal edits.
- **"Auto-resolve should call `resolveAdminAlert` / a bespoke resolver."** No — `RESYNC_SHRINK_HELD` is a peer sync-problem code (D7): it sets `last_sync_status='shrink_held'` and is in `SYNC_PROBLEM_CODES`, so the existing recovery sweep (`resolveStaleSyncProblemAlerts_unlocked(...,null)`) auto-resolves it on the next clean apply — the same mechanism that resolves `PARSE_ERROR_LAST_GOOD`. `resolveAdminAlert` is deliberately NOT used (it throws for inbox codes). No new resolve site, no new status migration (`text` column).

## 10. Why staging was declined (context)

Phase 6 (resolution #21 cutover) removed the whole-parse review mount from the per-show page: `app/admin/show/[slug]/page.tsx` mounts `ChangesFeed`; `tests/app/admin/perShowPage.test.tsx:373-388` asserts `staged-review-apply` / `staged-review-read-only` / `admin-show-parse-warnings-section` are absent, with the comment "no invariant stages a whole parse anymore." Staging `MI-6`/`MI-7` would reintroduce exactly what Phase 6 retired and require rebuilding that admin review surface (Apply / Keep-current) plus rewriting the pinning test. The owner declined that scope in favor of retain-last-good + alert. Filed as `BL-RESYNC-STAGED-REVIEW-UI` (§13) if a richer review workflow is wanted later.

## 11. Meta-test inventory

- **Extends:** `tests/messages/_metaAdminAlertCatalog.test.ts` (new `RESYNC_SHRINK_HELD` across union / `ADMIN_ALERTS_CODES` / `WRITE_SITES` / `ADMIN_ALERTS_LIFECYCLE`), `tests/adminAlerts/alertActions.test.ts` (new action-link registry row), `tests/app/admin/perShowPage.test.tsx` (new `id="resync"` anchor assertion), a `StaleFooter` test (`'shrink_held'` tier), any `tests/notify/*` pin of `SYNC_PROBLEM_CODES` (new member), and the §12.4 three-way lockstep (x1/x2/codes-coverage).
- **Must stay green:** `tests/sync/cutover.retireLivePendingSyncs.test.ts` (no live `pending_sync` written), `tests/app/admin/perShowPage.test.tsx` retirement pins (`staged-review-*` still absent — the anchor adds no review UI), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no new lock holder; the raise runs inside the already-locked cron tx), `tests/auth/_metaInfraContract.test.ts` (reuses the existing tx-bound `upsertAdminAlert` helper — no new call boundary).
- **Advisory-lock topology:** unchanged; the shrink-hold branch and the alert raise both run inside the existing per-show `withShowLock` cron tx.
- **UI / invariant 8:** `components/shared/StaleFooter.tsx` (crew) and `app/admin/show/[slug]/page.tsx` (the `#resync` anchor) are UI surfaces; the action link renders via existing `PerShowAlertSection`. All Opus-owned. The changes are a status-case + an anchor `id` (no new layout/tokens), but the invariant-8 impeccable dual-gate (`/impeccable critique` + `audit`) still runs on the affected diff at close-out; HIGH/CRITICAL fixed or deferred via `DEFERRED.md`.

## 12. Numeric sweep

- `MI-6` threshold `crewDrop > 1`; `MI-7` `nc < pc/2 || pc <= 2` (transportation populated→null) — reused verbatim from `invariants.ts:251,266,284,302,317`.
- Held invariant tags: exactly 2 (`MI-6`, `MI-7`).
- New production edit sites: `phase1.ts` (hold branch + `Phase1Result` variant), `runScheduledCronSync.ts` (caller branch, `updateShowShrinkHeld` tx method, `syncProblemCodeForStatus` case), `upsertAdminAlert.ts` (union), `lib/notify/constants.ts` (`SYNC_PROBLEM_CODES`), `lib/admin/syncStatus.ts` + `driveConnectionHealth.ts` + `components/shared/StaleFooter.tsx` (`'shrink_held'` case), `lib/adminAlerts/alertActions.ts` (action-link row), `app/admin/show/[slug]/page.tsx` (`id="resync"` anchor). Plus the §12.4/admin-alert lockstep (catalog.ts, spec §12.4, 2 regens, `_families.ts`, meta-test registry rows). New admin-alert codes: 1 (`RESYNC_SHRINK_HELD`). New `SYNC_PROBLEM_CODES`: 1. New `last_sync_status` values: 1 (`'shrink_held'`) — **no migration** (column is unconstrained `text`). New DB schema: 0. New UI component files: 0 (reuses `PerShowAlertSection` + `ReSyncButton`). Auto-resolve reuses the existing recovery sweep — 0 new resolve sites.

## 13. Backlog

- **`BL-RESYNC-STAGED-REVIEW-UI`** (files to `BACKLOG.md`): if a richer "review the diff and approve the smaller roster inline" workflow is wanted, restore/replace the whole-parse review surface for existing-show staged parses (un-retire or re-home `StagedReviewCard` with existing-show mode; expose Apply / Keep-current; update `perShowPage.test.tsx` retirement pins). Deferred by owner decision (§10) — retain-last-good + alert already prevents the data loss; this is a UX enhancement, not a safety gap.
