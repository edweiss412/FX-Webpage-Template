# Spec — Per-sheet "Re-scan" in the setup wizard

- **Date:** 2026-06-29
- **Slug:** `per-sheet-rescan-wizard`
- **Status:** APPROVED by Codex adversarial review (4 rounds; autonomous-ship; user spec/plan review gates waived per AGENTS.md)
- **Owner:** Opus / Claude Code (UI surfaces are Opus-only per ROUTING.md)
- **Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`
- **Revision history:** R1 (7 findings, 2 CRITICAL) → finalize-session lock coordination; clean-rule via direct `runInvariants` diff (the onboarding scan is blinded); dirty rescans truly block finalize via the demote shape; posted `wizardSessionId` stale-tab guard; Flow-B hard-fail postconditions; count-based data-gap rule. R2 (3) → Flow-B clean approval-payload CHECK; `cas_per_row` button scope + fail-closed shadow read; concrete hard-fail code. R3 (2 HIGH) → prior-state capture UNDER the lock (TOCTOU vs approve/unapprove); pre-lock folder-scope guard. R4 → APPROVE (2 LOW advisories folded in: the preliminary settings read is named in §5.2; this header).

---

## 1. Problem & goal

During setup (the onboarding wizard), the operator (Doug) sometimes spots something wrong in a sheet — or wants to change it — and edits the Google Sheet. Today there is **no per-sheet way** to make the wizard pick up that one edit:

- The only refresh during setup is a **whole-folder re-scan** (Step 2 "Re-scan"), which re-stages every sheet.
- The per-sheet wizard re-review page (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:135`) reads `pending_syncs WHERE wizard_approved = false` — it does **not** re-fetch from Drive, and does **not** serve a sheet blocked at final publish (whose `pending_syncs` row was deleted at Phase B, `finalize/route.ts:589`).
- `runManualSyncForShow` (the live-show "Re-sync from Drive" engine) is the published-show path and refuses finalize-owned shows (`FINALIZE_OWNED_SHOW`, `lib/sync/runManualSyncForShow.ts:296`).
- A sheet blocked with `STAGED_PARSE_OUTDATED_AT_PHASE_D` (`finalize-cas/route.ts:377/383/444`) can only be cleared by a full folder re-scan.

**Goal:** add a manual **"Re-scan this sheet"** button, available where Doug reviews/blocks on a single sheet during setup, that re-fetches just that one Drive file, re-parses, re-stages, clears a `STAGED_PARSE_OUTDATED_AT_PHASE_D` block, and — when the refreshed sheet is "clean" — keeps Doug's prior approval so he isn't forced to re-review for a typo fix.

Live/published shows already have this (`ReSyncButton` → `POST /api/admin/sync/[slug]`); this spec brings the equivalent into the **wizard** context only.

## 2. Resolved decisions (from brainstorming, 2026-06-29)

1. **Trigger = manual button** (not real-time). Real-time is out of scope.
2. **Surfaces = both**: each Step-3 review card (`Step3SheetCard`) and each blocked row at the final-publish step (`RunFinalCASButton` / `FinalizeButton` `cas_per_row`).
3. **Re-review semantics = auto-keep approval if "clean"**: a re-scan keeps the sheet's prior approval iff the refreshed parse surfaces nothing that needs a decision; otherwise the sheet drops to "needs review" *and is blocked from publishing* until Doug re-reviews. Precise rule in §6.
4. **Approach = purpose-built isolated route** (`POST /api/admin/onboarding/rescan-sheet`) + a new `rescanWizardSheet` lib function. We do **not** generalize the folder scan and do **not** extend `retrySingleFile` (it is gated on a `pending_ingestions` row, `lib/sync/retrySingleFile.ts:114/60`).

## 3. Non-goals (explicit, to preempt relitigation)

- **No real-time / Drive-push changes.** The webhook + cron are untouched.
- **No live/published-show changes.** `ReSyncButton` / `runManualSyncForShow` are untouched; this is wizard-only.
- **No schema migration.** Reuses existing tables and existing enum **values**. The dirty-block uses `pending_syncs.last_finalize_failure_code` (plain `text`, no CHECK — `migrations/20260518010444`), so blocking needs no migration.
- **Exactly ONE new §12.4 code:** `RESCAN_REVIEW_REQUIRED` (the dirty-rescan block reason, surfaced in the wizard as "this sheet changed — re-review before publishing"). It lands via the §12.4 three-way lockstep (spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`) and is added to `demotePending`'s `code` union (`finalize/route.ts:401-407`). All other codes are reused (§10). *(This corrects round-1's "no new code" claim — finding 3 showed a real block requires it.)*
- **No change to the existing finalize consumption model** beyond adding the rescan write paths.

## 4. Architecture

Three units, each independently testable:

1. **`rescanWizardSheet(driveFileId, wizardSessionId, deps): Promise<RescanResult>`** — `lib/onboarding/rescanWizardSheet.ts` (NEW). Orchestration core: capture prior state → pre-lock Drive read + parse → under the finalize→app_settings→show lock order, re-stage + heal + apply the clean rule → typed result. Deps-injected (mirrors `runOnboardingScan`/`retrySingleFile`).
2. **`POST /api/admin/onboarding/rescan-sheet`** — `app/api/admin/onboarding/rescan-sheet/route.ts` (NEW). `requireAdmin()` (`lib/auth/requireAdmin.ts:263`); body `{ driveFileId, wizardSessionId }` (the **rendered** session, per finding 4); maps the result to JSON. Mutations flow ONLY through this server route under the lock (PostgREST DML lockdown).
3. **`RescanSheetButton`** — `components/admin/RescanSheetButton.tsx` (NEW, client). Mounts on both surfaces; POSTs `{ driveFileId, wizardSessionId }`; on `ok` `router.refresh()` and renders an inline result line (mirrors the existing `wizard-step3-retry` button's `fetch`→`{status}|{ok:false,code}`→`router.refresh()` pattern, `Step3Review.tsx:146-191`, and `ReSyncButton.tsx:59-104`).

```
Doug edits the Google Sheet → clicks "Re-scan this sheet"  (Step3SheetCard OR cas_per_row row)
   ▼  POST /api/admin/onboarding/rescan-sheet { driveFileId, wizardSessionId }
rescanWizardSheet(driveFileId, wizardSessionId, deps)
   1. PRE-LOCK Drive read: fetch metadata → FOLDER-SCOPE GUARD (parents ∋ pending_folder_id, else out_of_scope)
                          → prepareOnboardingFiles(folder,{listFolder:()=>[meta]})   (side-effect-free)
   2. LOCK ORDER (identical to finalize → no deadlock):
        i.  tryFinalizeLock(finalize:<session>)  — held → busy (CONCURRENT_FINALIZE_IN_FLIGHT)
        ii. app_settings FOR UPDATE → re-check pending_wizard_session_id === wizardSessionId  (else superseded)
        iii.withShowLock(driveFileId) blocking
        2.0 capture AUTHORITATIVE prior state UNDER lock (priorReady/priorApprovedByEmail/priorParse/…)
        a.  re-stage pending_syncs (fresh base, new parse_result, new item ids)
        b.  HEAL: delete orphan shadow; reset manifest/checkpoint so next Publish re-stages
        c.  CLEAN RULE (runInvariants(priorParse,new) diff): keep-or-block + regenerate choices
   ▼  RescanResult → JSON → button renders + router.refresh()
```

## 5. `rescanWizardSheet` — sequence & guards

### 5.1 Inputs / preconditions

| Input | Guard | Result if violated |
|---|---|---|
| `driveFileId` (string) | non-empty | route 400 `{ ok:false, code:"BAD_REQUEST" }` (route-level) |
| `wizardSessionId` (string, **posted by the client**) | well-formed UUID | route 400 |
| active wizard session | re-checked **under the `app_settings FOR UPDATE` row lock** (step ii): `pending_wizard_session_id === wizardSessionId` | typed `superseded` → button: "Setup moved on — refresh this page." |
| sheet belongs to this session | `onboarding_scan_manifest` row exists for `(wizard_session_id, drive_file_id)` | typed `not_found` → "That sheet isn't part of this setup." |
| folder | `app_settings.pending_folder_id` non-null | typed `no_active_session` → "Setup isn't active." |

**Stale-tab guard (finding 4):** the button posts the **rendered** `wizardSessionId`; the route re-checks it against `app_settings.pending_wizard_session_id` *under the `FOR UPDATE` lock* before any write, then checks the manifest row. An old tab on a superseded session is rejected (`superseded`) even if its `driveFileId` exists in a newer session's manifest, because the posted session id won't match.

### 5.2 Step 1 — pre-lock Drive read + folder-scope guard (side-effect-free)

First, a **preliminary NON-mutating read** of `app_settings` supplies `pending_folder_id` (for the guard + the Drive read) and `pending_wizard_session_id` (an early cheap check that the posted `wizardSessionId` matches — fail fast). This read is **advisory only**; the **authoritative** session re-check is the `... FOR UPDATE` read in §5.3 step ii, under the lock (round-4 LOW-1). Only the *mutations* move under the lock; the Drive fetch + export stays here, pre-lock.

Then fetch the file's current Drive metadata for `driveFileId` (id, name, mimeType, modifiedTime, parents) as `retrySingleFile` does (`lib/sync/retrySingleFile.ts:232`).

- **Folder-scope guard (round-3 finding 2):** require `metadata.parents` to contain the active `pending_folder_id`. If the sheet was **moved out** of the setup folder, return typed `out_of_scope` → `{ status:"needs_attention", code:"STAGED_PARSE_SOURCE_OUT_OF_SCOPE" }` (the cataloged code finalize already uses for this, `catalog.ts:388`); **NO mutation.** This mirrors `retrySingleFile`'s out-of-folder refusal (`retrySingleFile.ts:232-234`) and finalize's out-of-scope demotion (`finalize/route.ts:700-708`) — a re-scan-by-ID must not re-stage a file a full folder scan would exclude. Applies to BOTH Flow A and Flow B.
- Then `prepared = await prepareOnboardingFiles(folderId, { ...deps, listFolder: async () => [metadata] })` (`lib/sync/runOnboardingScan.ts:907`; `listFolder` injection `:147`). Returns one `PreparedOnboardingFile`.
- **Drive fetch / export failure or timeout** → typed `{ status:"needs_attention", code }` (reuse the existing onboarding Drive-failure code); NO mutation (pre-lock).
- **`kind:"non_sheet"`** → typed `not_a_sheet`; NO mutation. **Flow-B postcondition:** the orphan shadow is **left intact** (do not destroy the only recovery surface for a row that mysteriously stopped being a sheet).

### 5.3 Step 2 — locked mutation (lock order = finalize → app_settings → show)

Single-holder + deadlock-free (§8): acquire in the **same order** finalize/finalize-cas use:
1. **`tryFinalizeLock(tx, wizardSessionId)`** = `pg_try_advisory_xact_lock(hashtext('finalize:'||$1))` (`finalize/route.ts:263-269`). If not acquired (a finalize is in flight) → typed `busy` → **`CONCURRENT_FINALIZE_IN_FLIGHT`**; NO mutation.
2. **`app_settings ... FOR UPDATE`** re-check `pending_wizard_session_id === wizardSessionId` (`readActiveSessionForUpdate`, `finalize/route.ts:251-261`) — else `superseded`; NO mutation.
3. **`withShowLock(driveFileId, { tx })`** = `pg_advisory_xact_lock(hashtext('show:'||$1))` (`lib/sync/lockedShowTx.ts:88`), **blocking** (matches finalize's per-show acquisition `finalize-cas/route.ts:122`). Because both rescan and finalize take `finalize:<session>` first, there is no AB-BA deadlock.

**Step 2.0 — capture authoritative prior state UNDER the held lock (round-3 finding 1).** Read the prior state ONLY now — after all three locks are held, NOT before the pre-lock Drive window — so a concurrent `approve`/`unapprove` (which mutate the same `pending_syncs` row under only the per-show lock, `app/api/admin/onboarding/.../approve|unapprove`) cannot be lost. Read whichever exists for `(wizard_session_id, drive_file_id)` and derive `priorReady`, `priorApprovedByEmail`, `priorParse`, `priorChoices`, `priorDataGaps`:
- **`pending_syncs`** (Flow A): `priorReady=(wizard_approved===true)`; `priorApprovedByEmail=wizard_approved_by_email`; `priorParse=parse_result`; `priorChoices=wizard_reviewer_choices`; `priorDataGaps=summarizeDataGaps(parse_result.warnings)`.
- else **`shows_pending_changes`** shadow (Flow B — `pending_syncs` deleted at Phase B): `priorReady=true` (a shadow is staged only when `/finalize` Phase B processed the row in an operator-initiated Publish — `selectFinishableCleanRows`, `finalize/route.ts:346`); `priorApprovedByEmail=applied_by_email` (`shows_pending_changes.applied_by_email`, `migrations/20260501001000:433-439`, written `finalize/route.ts:546-586`). `payload` read **fail-closed** via `parseShadowPayloadForApply` (`lib/onboarding/shadowPayload.ts`): usable → `priorParse=payload.parse_result`, `priorChoices=payload.reviewer_choices`, `priorDataGaps=summarizeDataGaps(payload.parse_result.warnings)`; **corrupt** → `priorParse=null` (→ §6 DIRTY clause; dirty-safe).
- else **neither** (first-seen): `priorReady=false`; `priorParse=null`; `priorApprovedByEmail=null`.

All of (a)/(b)/(c) then run inside this same transaction; the scan's internal lock is satisfied via the held-lock passthrough (`deps.withShowLock = (_id, fn) => fn(scanTx)`, the `holdPort` pattern of `retrySingleFile.ts:254-272`) — a single acquirer, no nesting.

**(a) Re-stage `pending_syncs`** — `scanOnboardingPreparedFiles(folderId, wizardSessionId, [prepared], deps)` (`runOnboardingScan.ts:994`) → `runPhase1` (`phase1.ts:258`) stages the `ONBOARDING_SCAN_REVIEW` sentinel (`phase1.ts:253`), `outcome:"stage"`; `upsertLivePendingSync` (`:382`) writes a fresh row with `base_modified_time = coalesce(staged, live watermark)` (`:404-407`), new `parse_result`, new `triggered_review_items` (new `randomUUID` ids — the scan is blinded so these are **just the sentinel**, never MI-11; the decision diff is computed separately in (c)), and `staged_modified_time` = current Drive `modifiedTime`. The ON CONFLICT set-list (`:416-426`) does **not** touch `wizard_approved`/`wizard_reviewer_choices`/`last_finalize_failure_code` — (c) sets all three explicitly.
- **`scanOnboardingPreparedFiles` returns `processed[0].outcome:"hard_failed"`** (the single-file scan completes with a per-file hard-fail; `runOnboardingScan.ts:113-126`) → the scan path writes a `pending_ingestions` error row carrying the **concrete Phase-1 hard-fail code** in `last_error_code` (`phase1.ts:274-292`) + manifest `status='hard_failed'`. **Result code (round-2 finding 3):** read that just-written `pending_ingestions.last_error_code` for `(wizard_session_id, drive_file_id)` and return it as the cataloged code — `{ status:"needs_attention", code:<pending_ingestions.last_error_code> }` — so Doug sees the actual parse error, not a generic one. (This rescan path has no prior pending-ingestion to read, unlike `retrySingleFile.ts:77-95`, so it reads the row the scan just created.) **Flow-B postcondition (finding 6):** also `DELETE` the orphan shadow (the re-scan supersedes it; the now-`hard_failed` manifest keeps final CAS blocked via `unresolvedManifestCount`). Clean rule skipped.

**(b) Heal the finalize state (idempotent — no-op for Flow A; the blocker fix for Flow B).** Post-conditions:
1. **No orphan shadow:** `DELETE FROM shows_pending_changes WHERE wizard_session_id=$1 AND drive_file_id=$2` (Flow A: 0 rows; Flow B: removes the `STAGED_PARSE_OUTDATED`-emitting orphan).
2. **Manifest re-stageable:** the `onboarding_scan_manifest` row ends at `status='staged'` (a previously-`'applied'` blocked row moves back) with `publish_intent` per §7 — so `selectFinishableCleanRows` re-selects it on the next Publish (`finalize/route.ts:346`).
3. **Checkpoint re-openable:** if `wizard_finalize_checkpoints.status` for the session is `'all_batches_complete'` or `'final_cas_done'`, reset it to `'in_progress'` (so the next `/finalize` re-processes the re-opened row — `ensureCheckpoint` never resets, `finalize/route.ts:271`). The reset is per-session but only widens what finalize re-examines; it never skips a sibling.

> **Pinned by the Flow-B real-DB test (§11 T-B), not asserted blindly:** the end-to-end invariant — *after re-scanning a blocked sheet, clicking Publish again cleanly re-stages (Phase B) and publishes (Phase D) that sheet, with no orphan shadow and no stale checkpoint, and the sibling sheets' shadows/rows are untouched.* The batch-hold semantics (`finalize-cas/route.ts:711-721`: any blocked row 409s the whole batch *before* the publish flip, though already-applied row-txns are durably committed) make "don't disturb siblings" a real assertion.

**(c) Apply the clean rule (§6).**

### 5.4 Step 3 — result

```ts
type RescanResult =
  | { status: "updated"; needsReview: boolean; changed: boolean }   // staged OK (needsReview=true ⇒ blocked/demoted)
  | { status: "needs_attention"; code: string }                     // parse hard-fail / drive fail
  | { status: "busy"; code: "CONCURRENT_FINALIZE_IN_FLIGHT" }
  | { status: "superseded" | "no_active_session" | "not_found" | "not_a_sheet" };
```

`changed` = new `staged_modified_time` ≠ prior staged value (drives "Updated" vs "No changes found"). The route serializes this; the button renders the matching inline copy and `router.refresh()`es.

## 6. The "clean" rule (precise, pinned)

The clean/dirty decision is computed by a **direct diff of `priorParse` vs the refreshed parse**, NOT from the staged `triggered_review_items` (finding 2: the onboarding scan path passes `null` prior to `runInvariants`, so it can never emit MI-11 — `invariants.ts:218-227`).

Compute `decisionItems` and `gapRegressed`:
- `decisionItems` = the **decision-requiring** items from `runInvariants(priorParse, refreshedParse)` (`lib/parser/invariants.ts:98` → `{outcome:"stage", triggeredItems}`). Decision-requiring = the **existing-crew change family the operator must consciously re-confirm**: `DECISION_REQUIRING_INVARIANTS = {MI-11, MI-12, MI-13, MI-14}` — MI-11 (email change, item shape `{id, invariant:"MI-11", crew_name, prior_email, new_email}` `types.ts:461-464`), MI-12 (crew rename), MI-13/MI-14 (roster add/remove). **MI-12/13/14 are genuinely gated**: their `allowedActions` set has size > 1 (`applyStagedCore.ts:104-111`: MI-12 → `{rename, reject}`, MI-13/14 → `{rename, independent}`), so a synthesized apply-all is *invalid* for them and they REQUIRE an explicit reviewer choice. MI-11 is single-action `{apply}` (the wizard auto-applies it), but the brainstorming explicitly chose email changes to re-prompt, so it is included in the dirty set (its recovery is "see the change + confirm," §6.1). Asset-review invariants + room renames (MI-7b) + every non-crew notification are NOT decision-requiring. *(This corrects round-1's "MI-11 only" — that drew from `phase1.ts:312-319`, the LIVE-sync gating, not the review/wizard `allowedActions` contract. Forward-compat: the set is a single named constant pinned by meta-test §11 T-M, asserted against `allowedActions().size > 1` ∪ the MI-11 email family.)* If `priorParse === null` (first-seen), `decisionItems = []` (no prior to diff; such a row has `priorReady=false` and stays needs-review anyway).
- `gapRegressed` (finding 5) = `summarizeDataGaps(refreshed.warnings).classes` has **any class whose count is greater** than that class's count in `priorDataGaps` (a per-class **count increase**, not merely a new class). A fixed gap (count drops) is NOT a regression.

The sheet is **DIRTY** iff `decisionItems.length > 0` OR `gapRegressed` OR (`priorReady === true` AND `priorParse === null`). The last clause forces re-review when a previously-ready sheet's prior parse is unreadable (a corrupt Flow-B shadow, §5.3) — cleanliness cannot be verified, so it must not be auto-kept. Otherwise **CLEAN**.

### 6.1 DIRTY → block + route to re-review (the demote shape)

A dirty rescan must *truly* block finalize (finding 3: `wizard_approved=false` alone is silently consumed because `selectFinishableCleanRows` admits `last_finalize_failure_code IS NULL`). It writes the **`demotePending` end-state** (`finalize/route.ts:397-432`), extended to carry the decision items:
- `pending_syncs`: `wizard_approved=false`, `wizard_approved_by_email=null`, `wizard_approved_at=null`, `wizard_reviewer_choices=null`, `wizard_reviewer_choices_version=null`, **`last_finalize_failure_code='RESCAN_REVIEW_REQUIRED'`** (the NEW code, added to `demotePending`'s code union `finalize/route.ts:401-407`), and `triggered_review_items = [ONBOARDING_SCAN_REVIEW, ...decisionItems]` (so the reapply surface renders the crew-change choices).
- `onboarding_scan_manifest`: `status='staged'` (with `last_finalize_failure_code` set, this is counted blocking by `unresolvedManifestCount`, `finalize/route.ts:323-326` + `finalize-cas:282-285`, and EXCLUDED from `selectFinishableCleanRows`).
- Result `{ status:"updated", needsReview:true, changed }`.

**Recovery — the Step-3 checkbox MUST NOT silently clear it (round-1 plan-review CRITICAL).** The Step-3 `/approve` route (`app/api/admin/onboarding/staged/[…]/approve/route.ts`) deliberately clears `last_finalize_failure_code=null` and synthesizes `{action:"apply"}` for *every* item (`:104/:139`) — so a plain re-check would either silently apply an MI-11 email change or write an invalid apply-all for a multi-action MI-12/13/14 (which then 500s the batch at finalize via `validateReviewerChoices`). Therefore:
1. **`/approve` route guard:** the approve route REFUSES any row whose `last_finalize_failure_code === 'RESCAN_REVIEW_REQUIRED'`, returning that code (the button/card route Doug to the reapply page). This is a **targeted** guard — only the rescan-dirty code is gated; the existing checkbox recovery for other demotion codes (`DRIVE_FETCH_FAILED`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, …) is preserved.
2. **Step-3 visibility:** `last_finalize_failure_code` is threaded into the Step-3 card data; a `RESCAN_REVIEW_REQUIRED` row renders **distinctly** ("This sheet changed since you reviewed it — review before publishing") with a **"Review this sheet →"** link to the reapply page and the plain publish checkbox **suppressed**.
3. **Clearing:** the reapply page (`/admin/onboarding/staged/[session]/[driveFileId]`, `wizard_approved=false` + `last_finalize_failure_code!=null` → `StagedReviewCard mode="wizard_failed_reapply"`) renders the decision items with their real choice controls (MI-12/13/14 multi-action via `allowedActionsFor`, `StagedReviewCard.tsx:116-125`; MI-11 as a visible single-action confirm), and its **`/apply`** route applies the explicit choices, clears `last_finalize_failure_code`, and restores `wizard_approved=true`. *(Plan verifies: the checkbox `/approve` cannot clear a `RESCAN_REVIEW_REQUIRED` row; the reapply `/apply` can.)*

### 6.2 CLEAN

- If `priorReady === true` (and `priorParse !== null`, guaranteed by the DIRTY clause above): re-stamp `wizard_approved=true`, `wizard_reviewer_choices_version=1`, `last_finalize_failure_code=null`, **`wizard_approved_by_email = priorApprovedByEmail`**, **`wizard_approved_at = now()`**, and **regenerate** `wizard_reviewer_choices` as one `{ item_id, action:"apply" }` per new `triggered_review_item` (a clean re-scan's only item is the non-decision `ONBOARDING_SCAN_REVIEW` sentinel, whose synthesized choice is `apply` — `synthesizeDefaultChoices`, `applyStagedCore.ts:228`). The approval-payload fields are **non-null by construction** — `priorApprovedByEmail` is Flow A's prior approver or Flow B's shadow `applied_by_email` (§5.3) — which the **`pending_syncs_approved_requires_full_payload` CHECK** (`migrations/20260518010444:23-31`) requires whenever `wizard_approved=true` (finding 1: `upsertLivePendingSync` re-creates the row with NULL approval fields, so the rescan MUST write them). → `needsReview=false`, stays publish-ready. Regeneration of choices is mandatory because re-parse mints new item ids (the prior choices reference deleted ids → `validateReviewerChoices` would 500 at finalize, `applyStagedCore.ts:129`).
- If `priorReady === false`: leave `wizard_approved=false`, `last_finalize_failure_code=null` — the refreshed content is shown and the sheet keeps its prior (un-reviewed) finalize behavior (existing fresh-unchecked semantics — unchanged). → `needsReview=true` (advisory; not a hard block).

Guard table:

| Input | null / empty / corrupt | Behavior |
|---|---|---|
| refreshed `triggered_review_items` | corrupt (fails `parseTriggeredReviewItems`, `lib/staging/triggeredReviewItems.ts`) | `needs_attention` — never approve over a corrupt review surface |
| `priorParse` | null (first-seen) | `decisionItems=[]`; CLEAN-path with `priorReady=false` → needs-review |
| `priorDataGaps` | null | any refreshed gap class with count>0 → `gapRegressed=true` (conservative) |
| `refreshed.warnings` | null / not-array | treat as `[]` → no gaps |
| `priorChoices` | null/not-array | irrelevant to the diff; choices are regenerated/cleared per branch |

## 7. `publish_intent` on re-scan

`publish_intent` (`onboarding_scan_manifest`, `migrations/20260623000001:10`) is the per-sheet "include in this publish" flag. The re-scan **preserves** `publish_intent` in all branches (a typo-fix must not silently drop the sheet from the batch; a dirty sheet is blocked by `last_finalize_failure_code` regardless of the flag). For a Flow-B blocked row (`status` was `'applied'`, `publish_intent=true`), the heal returns `status='staged'` and keeps `publish_intent=true`; §11 T-B pins that the subsequent Publish re-includes exactly this sheet.

## 8. Invariants honored

- **Per-show advisory lock — single holder + deadlock-free (invariant 2).** The rescan acquires `finalize:<session>` (try) → `app_settings FOR UPDATE` → `show:<driveFileId>` (blocking) — the **identical** total order to `/finalize` and `/finalize-cas` (`finalize:→app_settings→show:`, pinned by `tests/auth/advisoryLockRpcDeadlock.test.ts`), so mutual exclusion holds and no AB-BA deadlock is possible. `withShowLock` is the sole `show:` acquirer (held-lock passthrough inside the scan; no nested acquire). The plan extends `advisoryLockRpcDeadlock.test.ts` to pin the rescan surface.
- **Email canonicalization at the boundary (invariant 3).** Re-staging flows through the same `runPhase1`→parser path; emails canonicalize at the existing stage boundary (`lib/email/canonicalize.ts`).
- **No raw error codes in UI (invariant 5).** The route returns typed results; the button renders error/busy states via the catalog (`lookupDougFacing`). Success/needs-review copy is plain English.
- **Supabase call-boundary discipline (invariant 9).** New Supabase calls destructure `{ data, error }`, distinguish thrown vs returned errors, and register in the relevant meta-test or carry an inline `// not-subject-to-meta:` note.
- **PostgREST DML lockdown.** All mutations happen server-side under the lock via the locked tx path — never client PostgREST.
- **UI quality gate (invariant 8).** `RescanSheetButton` + `Step3SheetCard`/`cas_per_row` changes → `/impeccable critique` + `/impeccable audit` before cross-model review.
- **§12.4 lockstep (invariant 5 corollary).** The new `RESCAN_REVIEW_REQUIRED` code lands in spec §12.4 + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in one commit; the `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`) confirms parity.
- **TDD per task; commit per task.**

### 8.1 Flag / field lifecycle (state this rescan touches)

| Field | Storage | Write path(s) | Read path(s) | Effect |
|---|---|---|---|---|
| `pending_syncs.wizard_approved` | bool | existing Apply; **NEW** rescan clean-rule (§6.1/§6.2). `upsertLivePendingSync` does NOT touch it. | `selectFinishableCleanRows` (`finalize/route.ts:346`); Step-3 render | gates finalize selection |
| `pending_syncs.last_finalize_failure_code` | text (no CHECK) | existing `demotePending`; **NEW** rescan dirty (§6.1) sets `'RESCAN_REVIEW_REQUIRED'`; clean (§6.2) sets `null` | `selectFinishableCleanRows` exclusion + `unresolvedManifestCount` blocking (`finalize/route.ts:323-326`) | a dirty sheet cannot be consumed/published until re-review clears it |
| `onboarding_scan_manifest.publish_intent` | bool | existing Step-3 toggle; **NEW** rescan **preserves** it | finalize flip / `unresolvedManifestCount` | whether the sheet is in the publish batch |
| `onboarding_scan_manifest.status` | text enum | existing; **NEW** rescan heal sets `'staged'` (or `'hard_failed'` on re-parse hard-fail) | finalize selection/blocking | re-stageable vs blocking |

No zombie flags; every field is written and read.

### 8.2 Matrices that do not apply

- **Tier × domain (surcharge) matrix: N/A** — no surcharge/pay-config surface.
- **CHECK / enum migration matrix: N/A** — no migration; `last_finalize_failure_code` is plain `text` (no CHECK); `onboarding_scan_manifest.status` / `wizard_finalize_checkpoints.status` reuse existing enum **values** only (`'staged'`, `'hard_failed'`, `'in_progress'`). The ONLY catalog change is the new `RESCAN_REVIEW_REQUIRED` §12.4 row (text column, no DB constraint).
- **Build-vs-runtime gate: N/A** — the button is always present in the wizard build.

## 9. UI — `RescanSheetButton`

- **Placement:** (a) `Step3SheetCard` — **both** render paths: the null-parse early return (`components/admin/wizard/Step3SheetCard.tsx:777-794`, after the "We couldn't read the details" warning — re-scan is exactly how you recover a no-details row) AND the normal render (alongside the "More" button, `:963-972`). (b) inside each `<li>` of the `cas_per_row` block (`RunFinalCASButton.tsx:115` and the equivalent in `FinalizeButton.tsx:295`) **only for rows whose `code === "STAGED_PARSE_OUTDATED_AT_PHASE_D"`** (round-2 finding 2). The `cas_per_row` list can also carry `STAGED_REVIEW_ITEMS_CORRUPT` / `STAGED_PARSE_RESULT_CORRUPT` / `SHOW_ARCHIVED_IMMUTABLE` rows (`finalize-cas/route.ts:55-70`); re-scan is the wrong recovery for a corrupt-payload or archived-show shadow, so the button is **not** rendered for those codes (they keep their existing recovery). Each eligible row carries `drive_file_id` (`CasPerRowEntry`, `RunFinalCASButton.tsx:25`).
- **States (mode boundary):** `idle` ("Re-scan this sheet") → `loading` ("Re-scanning…", disabled) → result. Mirrors `ReSyncButton.tsx:103`.
- **Result copy (plain English, inline, `aria-live="polite"`):**
  - `updated` + `!needsReview` + `changed` → "Updated — still ready to publish."
  - `updated` + `!needsReview` + `!changed` → "No changes found."
  - `updated` + `needsReview` → "Updated — this sheet changed and needs your review before publishing."
  - `needs_attention` → cataloged `dougFacing` for the code + `HelpAffordance`.
  - `busy` → the `CONCURRENT_FINALIZE_IN_FLIGHT` dougFacing.
  - `superseded`/`no_active_session`/`not_found`/`not_a_sheet` → a short plain line each.
- **Guards:** disabled while loading; renders even when `parseResult` is null (the no-details recovery case); double-click guarded by the loading state — **not** a self-disabling `form action` (see `feedback_react_form_action_synchronous_disable_cancels_submit`).
- **Dimensional invariants:** intrinsic-sized inline content, not a fixed-dimension-parent child; no `getBoundingClientRect` assertion required (stated explicitly).

### Transition inventory

| From → To | Treatment |
|---|---|
| idle → loading | instant (disable + label swap) |
| loading → result (any) | instant; result line via `aria-live` (no animation) |
| card approved ✓ → needs-review (dirty re-scan + refresh) | instant on `router.refresh()` server re-render |
| card needs-review → approved ✓ (clean re-scan of an edited-but-previously-ready sheet) | instant on refresh |
| blocked `cas_per_row` row → cleared (Flow B) | the re-scan shows its inline result + refresh; the row leaves the list on the next Publish |

All transitions are instant (a button + server re-render); no compound mid-animation states.

## 10. Error handling & §12.4 codes

| Condition | Code | source |
|---|---|---|
| a finalize is in flight (`finalize:<session>` held) | `CONCURRENT_FINALIZE_IN_FLIGHT` (existing; `finalize/route.ts:933`) | reuse |
| re-parse hard-fail | the concrete Phase-1 hard-fail code read from the just-written `pending_ingestions.last_error_code` (§5.3a; e.g. `PARSE_HARD_FAIL` and friends — all §12.4-cataloged) | reuse |
| Drive fetch/export failure | the existing onboarding Drive-failure code surfaced by the scan path | reuse |
| sheet moved out of the setup folder | `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` (`catalog.ts:388`) | reuse |
| dirty rescan needs re-review (block reason) | **`RESCAN_REVIEW_REQUIRED`** | **NEW** (§12.4 three-way lockstep) |

`SHOW_BUSY_RETRY` (`catalog.ts:2536`, dougFacing "That show is already syncing. Try again in a moment.") is **not** used (the `show:` lock is blocking and the finalize-busy case uses `CONCURRENT_FINALIZE_IN_FLIGHT`). `FINALIZE_OWNED_SHOW` is not used (the finalize lock already serializes).

## 11. Testing

Real-DB (`*.db.test.ts`, loopback) siblings of `tests/onboarding/finalizeCasReonboardBaseline.db.test.ts`, exercising production writers; each states the failure mode it catches; expectations derive from fixture dimensions, never hardcoded.

- **T-A1 (review, clean):** approve a staged sheet; edit fixture (typo, no MI-11, no gap increase); rescan → `pending_syncs` refreshed (new parse, fresh base), `wizard_approved=true`, **`wizard_approved_by_email` non-null (= prior approver) + `wizard_approved_at` refreshed** (the `pending_syncs_approved_requires_full_payload` CHECK passes), `last_finalize_failure_code=null`, `wizard_reviewer_choices` regenerated to the **new** item ids, `needsReview=false`.
- **T-A2 (dirty via MI-11, the key correctness test):** edit fixture to change an existing crew member's email; rescan → `decisionItems` contains MI-11, `wizard_approved=false`, `last_finalize_failure_code='RESCAN_REVIEW_REQUIRED'`, `triggered_review_items` includes the MI-11 item, manifest `'staged'`. **Then** `handleOnboardingFinalize` → assert the row is NOT consumed (excluded from finishable) and `unresolvedManifestCount` blocks finish. Negative control: an identical-email edit stays CLEAN and is not blocked.
- **T-A3 (dirty via gap-count, finding 5):** edit fixture to add a second `FIELD_UNREADABLE` (count 1→2) → `gapRegressed=true` → blocked. Negative control: removing a gap stays clean.
- **T-A4 (parse hard-fail):** edit fixture to hard-fail → `needs_attention` with the **concrete `pending_ingestions.last_error_code`** (assert it equals the Phase-1 hard-fail code, derived — not hardcoded as a generic), manifest `hard_failed`, Flow-B orphan shadow deleted.
- **T-B (blocker heal, headline integration):** drive a sheet to a genuine `STAGED_PARSE_OUTDATED_AT_PHASE_D` block with a **sibling** sheet also staged; rescan the blocked sheet → orphan shadow deleted, fresh base==live watermark, the re-staged row carries **`wizard_approved_by_email` = the shadow's `applied_by_email`** (CHECK passes), manifest `'staged'`+`publish_intent` preserved, checkpoint re-openable, **sibling shadow untouched**; then `handleOnboardingFinalize`+`handleOnboardingFinalizeCas` → per_row `OK`, batch publishes. Pre-heal control: without the heal, the second finalize-cas still 409s.
- **T-CAS-SCOPE (finding 2):** a `cas_per_row` list containing a `STAGED_PARSE_OUTDATED_AT_PHASE_D` row AND a `STAGED_REVIEW_ITEMS_CORRUPT` (or archived) row → the `RescanSheetButton` renders only on the OUTDATED row; and a rescan invoked against a row whose shadow `payload` is corrupt reads it fail-closed (no crash) → re-stages fresh content as DIRTY (`priorParse=null`+`priorReady` → needs-review).
- **T-LOCK (race, findings 1+4 + r3-1):** (i) hold `finalize:<session>` in a concurrent tx → rescan returns `CONCURRENT_FINALIZE_IN_FLIGHT`, no mutation; (ii) post a stale `wizardSessionId` after a session supersession → `superseded`, no mutation; (iii) extend `tests/auth/advisoryLockRpcDeadlock.test.ts` to pin the rescan lock order; (iv) **TOCTOU (r3-1):** with a deps seam that runs an `unapprove` (sets `wizard_approved=false`) during the pre-lock Drive window, assert the rescan's UNDER-LOCK re-read sees `priorReady=false` (no lost update — a clean rescan does NOT resurrect the just-revoked approval).
- **T-SCOPE2 (folder guard, r3-2):** a manifest row whose Drive metadata `parents` no longer contains `pending_folder_id` → rescan returns `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, **no mutation** (assert `pending_syncs`/`shows_pending_changes` unchanged), for both a Flow-A and a Flow-B (shadow) row.
- **T-M (meta-test):** `DECISION_REQUIRING_INVARIANTS` (`{MI-11,MI-12,MI-13,MI-14}`) is pinned AND asserted to be a superset of `{i : allowedActions(i).size > 1}` (`applyStagedCore.ts:104-111`), so a future multi-action invariant can't silently bypass the clean rule. Negative-regression: dropping MI-12 flips a crew-rename rescan to CLEAN.
- **T-CRIT (silent-approve guard, plan-review CRITICAL):** a dirty-rescanned row (`last_finalize_failure_code='RESCAN_REVIEW_REQUIRED'`) → the Step-3 `/approve` route REFUSES (returns the code, row stays un-approved + code not cleared); the reapply page's `/apply` with explicit choices clears it + approves. Component: the Step-3 card renders the dirty row distinctly with a reapply link, no bare checkbox.
- **Route tests:** `requireAdmin`; body `{driveFileId, wizardSessionId}`; superseded; non-manifest `driveFileId` → `not_found`.
- **Component tests:** `RescanSheetButton` renders on both `Step3SheetCard` paths and in a `cas_per_row` `<li>`; posts `{driveFileId, wizardSessionId}`; renders each result branch; `router.refresh()` on ok. Anti-tautology: assert the posted body and the rendered branch independently; clone+strip sibling label-bearing nodes before scanning result copy.
- **§12.4 parity:** `RESCAN_REVIEW_REQUIRED` passes `x1-catalog-parity`.

## 12. Out of scope / future

- Real-time auto-pickup — `BACKLOG.md`.
- Re-scan on the standalone re-review page — follow-up (that page already has a re-apply flow).

## 13. Citations appendix (verified against `origin/main` worktree, 2026-06-29)

- Scan/stage: `prepareOnboardingFiles` `lib/sync/runOnboardingScan.ts:907` (listFolder dep `:147`); `scanOnboardingPreparedFiles` `:994`; `upsertLivePendingSync` `:382` (coalesce `:404-407`, set-list `:416-426`, does NOT touch `wizard_approved`/`last_finalize_failure_code`); `runPhase1` `lib/sync/phase1.ts:258`; sentinel `:253`; gated-invariant comment `:312-319`; blinded-prior `invariants.ts:218-227`.
- Diff: `runInvariants(prior|null, next)` `lib/parser/invariants.ts:98`; MI-11 `:566`; MI-11 item shape `lib/parser/types.ts:461-464`; `ReviewerChoice` `lib/sync/applyStagedCore.ts:33-37`; `synthesizeDefaultChoices` `:228`; `validateReviewerChoices` `:129`; `summarizeDataGaps` `lib/parser/dataGaps.ts:53` (classes `:19`).
- Lock: `tryFinalizeLock` `finalize/route.ts:263-269` (`pg_try_advisory_xact_lock(hashtext('finalize:'||$1))`), mirror `finalize-cas:221`; lock order `/finalize` `:927/:932/:935/:987`; `/finalize-cas` `:653/:668/:674/:713`; per-show `pg_advisory_xact_lock(hashtext('show:'||$1))` `finalize-cas:122`; `adoptShowLockHeld` `:386`/`lockedShowTx.ts:155`; `withShowLock` `lockedShowTx.ts:88`; total order pinned `tests/auth/advisoryLockRpcDeadlock.test.ts`; `readActiveSessionForUpdate` `finalize/route.ts:251-261`.
- Finalize selection/block: `selectFinishableCleanRows` `finalize/route.ts:346-371` (WHERE `:362-364`); `unresolvedManifestCount` `:298-331` (pred `:323-326`), mirror `finalize-cas:256-290`; `demotePending` `:397-432` (code union `:401-407`); `processApprovedRow` invalid_request throw `:870-877`; unchecked existing no-op `:789-805`; `deleteApprovedPending` `:589`; `ensureCheckpoint` `:271`; checkpoint status enum `migrations/20260501001000_internal_and_admin.sql:427`.
- Finalize-cas: `applyShadow` `finalize-cas/route.ts:351`; per-row code union (incl. `STAGED_REVIEW_ITEMS_CORRUPT`/`STAGED_PARSE_RESULT_CORRUPT`/`SHOW_ARCHIVED_IMMUTABLE`) `:55-70/:360-395`; `STAGED_PARSE_OUTDATED_AT_PHASE_D` `:377/:383/:444`; batch-hold `:711-721`; `readShadowRows` `:292`; publish flip `:489-497`; fail-closed shadow read `parseShadowPayloadForApply` `lib/onboarding/shadowPayload.ts`.
- Schema: `shows_pending_changes` `migrations/20260501001000:433` (UNIQUE `:442`); `wizard_finalize_checkpoints` `:420`; `onboarding_scan_manifest` `:336` (status `:343`); `created_show_id` `20260611000000:15`; `publish_intent` `20260623000001:10`; `last_finalize_failure_code` text no-CHECK `20260518010444`; approval-payload CHECK `pending_syncs_approved_requires_full_payload` `migrations/20260518010444:23-31`; `shows_pending_changes.applied_by_email`/`applied_at_intent` `20260501001000:433-439` (written `finalize/route.ts:546-586`); `pending_ingestions.last_error_code` write `phase1.ts:274-292`, scan completion shape `runOnboardingScan.ts:113-126`.
- UI/messages: `Step3SheetCard` `components/admin/wizard/Step3SheetCard.tsx:749` (null-parse return `:777-794`, "More" `:963-972`); existing retry button `Step3Review.tsx:146-191` (endpoint `:143`); staged-apply variant `:718-723`; `CasPerRowEntry` `RunFinalCASButton.tsx:25` (render `:106-125`); `FinalizeButton` `cas_per_row` `:295`; `ReSyncButton` `:59-104`; re-review page `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:135`; `SHOW_BUSY_RETRY` dougFacing `catalog.ts:2536`; `STAGED_PARSE_FAILED` `:2585`; `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` `:210`; `requireAdmin` `lib/auth/requireAdmin.ts:263`; active-session read `lib/sync/applyStaged.ts:524-528`; wizard approve/unapprove (mutate `pending_syncs` under per-show lock) `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts` + `unapprove/route.ts`; folder-scope refusal `retrySingleFile.ts:232-234` + finalize out-of-scope demote `finalize/route.ts:700-708`; `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` `catalog.ts:388`; `allowedActions` (decision-requiring contract) `lib/sync/applyStagedCore.ts:104-111` + UI mirror `components/admin/StagedReviewCard.tsx:116-125`; Step-3 `/approve` synthesize-apply-all + clear-code `approve/route.ts:104/:139`; reapply page failure-heading render `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:273`; `demotePending` code union `finalize/route.ts:401-407`.
