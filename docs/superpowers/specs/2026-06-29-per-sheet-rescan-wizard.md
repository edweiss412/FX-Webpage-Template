# Spec — Per-sheet "Re-scan" in the setup wizard

- **Date:** 2026-06-29
- **Slug:** `per-sheet-rescan-wizard`
- **Status:** Draft (autonomous-ship; user spec/plan review gates waived per AGENTS.md)
- **Owner:** Opus / Claude Code (UI surfaces are Opus-only per ROUTING.md)
- **Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`

---

## 1. Problem & goal

During setup (the onboarding wizard), the operator (Doug) sometimes spots something wrong in a sheet — or simply wants to change it — and edits the Google Sheet. Today there is **no per-sheet way** to make the wizard pick up that one edit:

- The only refresh during setup is a **whole-folder re-scan** (Step 2 "Re-scan"), which re-stages every sheet and is heavy.
- The per-sheet wizard re-review page (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:114-151`) reads `pending_syncs WHERE wizard_approved = false` (confirmed `:135`) — it does **not** re-fetch from Drive and does **not** serve a sheet that is blocked at final publish (whose `pending_syncs` row was deleted at Phase B).
- `runManualSyncForShow` (the live-show "Re-sync from Drive" engine, `lib/sync/runManualSyncForShow.ts`) deliberately **refuses finalize-owned shows** (`FINALIZE_OWNED_SHOW`, `:296`) and is the published-show path, not the in-wizard path.
- A sheet blocked at final publish with `STAGED_PARSE_OUTDATED_AT_PHASE_D` (`app/api/admin/onboarding/finalize-cas/route.ts:377/383/444`) can only be cleared by a full folder re-scan.

**Goal:** add a manual **"Re-scan this sheet"** button, available where Doug reviews/blocks on a single sheet during setup, that re-fetches just that one Drive file, re-parses it, re-stages it, clears a `STAGED_PARSE_OUTDATED_AT_PHASE_D` block, and — when the refreshed sheet is "clean" — keeps Doug's prior approval so he isn't forced to re-review for a typo fix.

Live/published shows already have this (`ReSyncButton` → `POST /api/admin/sync/[slug]`); this spec brings the equivalent into the **wizard** context only.

## 2. Resolved decisions (from brainstorming, 2026-06-29)

1. **Trigger = manual button** (not real-time auto-pickup). Real-time is out of scope (the folder isn't watched until finalize; admin has no realtime channel).
2. **Surfaces = both**: (a) each Step-3 review card (`Step3SheetCard`), and (b) each blocked row at the final-publish step (`RunFinalCASButton` / `FinalizeButton` `cas_per_row`).
3. **Re-review semantics = auto-keep approval if "clean"**: a re-scan keeps the sheet's prior approval iff the refreshed parse surfaces nothing that needs a decision; otherwise the sheet drops to "needs review." Precise rule in §6.
4. **Approach = purpose-built isolated route** (`POST /api/admin/onboarding/rescan-sheet`) + a new `rescanWizardSheet` lib function. We do **not** generalize the folder scan and do **not** extend `retrySingleFile` (it is gated on a `pending_ingestions` row, `lib/sync/retrySingleFile.ts:114/60`, which this path must not inherit).

## 3. Non-goals (explicit, to preempt relitigation)

- **No real-time / Drive-push changes.** The webhook (`app/api/drive/webhook/route.ts`) and cron (`app/api/cron/sync/route.ts`) are untouched.
- **No live/published-show changes.** `ReSyncButton` / `runManualSyncForShow` / `POST /api/admin/sync/[slug]` are untouched; this is wizard-only.
- **No schema migration.** Reuses existing tables (`pending_syncs`, `shows_pending_changes`, `wizard_finalize_checkpoints`, `onboarding_scan_manifest`, `app_settings`). If implementation proves a migration is unavoidable, it honors the `validation-schema-parity` gate (manifest regen + surgical apply) — but none is anticipated.
- **No new §12.4 error code.** Error paths reuse existing cataloged codes (§10). The "updated / needs-review / no-changes" result is a typed success result rendered as plain copy, not an error code.
- **No change to the clean-vs-dirty *publish-intent* checkbox semantics** beyond what §7 specifies.

## 4. Architecture

Three units, each independently testable:

1. **`rescanWizardSheet(driveFileId, wizardSessionId, deps): Promise<RescanResult>`** — `lib/onboarding/rescanWizardSheet.ts` (NEW). The orchestration core: capture prior state → pre-lock Drive read + parse → under the single per-show advisory lock, re-stage + heal + apply the clean rule → return a typed result. Pure of HTTP; deps-injected for tests (mirrors the `deps`-injection style of `runOnboardingScan`/`retrySingleFile`).
2. **`POST /api/admin/onboarding/rescan-sheet`** — `app/api/admin/onboarding/rescan-sheet/route.ts` (NEW). Thin handler: `requireAdmin()` (`lib/auth/requireAdmin.ts:263`), read body `{ driveFileId }`, derive `wizardSessionId` + `folderId` from `app_settings` (`pending_wizard_session_id` / `pending_folder_id`), call `rescanWizardSheet`, map the result to a JSON response. Mutations flow ONLY through this server route under the lock (PostgREST DML lockdown honored).
3. **`RescanSheetButton`** — `components/admin/RescanSheetButton.tsx` (NEW, client). Mounts on both surfaces; POSTs `{ driveFileId }`; on success `router.refresh()` and renders an inline result line. Mirrors `ReSyncButton.tsx`'s UX (label / "Re-scanning…" / refresh-on-ok).

```
Doug edits the Google Sheet
        │  clicks "Re-scan this sheet"  (Step3SheetCard  OR  cas_per_row row)
        ▼
POST /api/admin/onboarding/rescan-sheet { driveFileId }
        │  requireAdmin; derive (wizardSessionId, folderId) from app_settings
        ▼
rescanWizardSheet(driveFileId, wizardSessionId, deps)
        │  1. capture PRIOR state (approval + choices + dataGaps) from pending_syncs OR shadow
        │  2. PRE-LOCK Drive read: fetch metadata → prepareOnboardingFiles(folder,{listFolder:()=>[meta]})
        │  3. withShowLock(driveFileId, tryOnly) — single holder:
        │       a. runPhase1 stage → fresh pending_syncs (fresh base, new parse_result, new item ids)
        │       b. HEAL: delete orphan shadow; reset manifest→'staged'/publish_intent; reset checkpoint
        │       c. CLEAN RULE: keep-or-drop wizard_approved + regenerate reviewer_choices
        ▼
RescanResult → JSON → button renders + router.refresh()
```

## 5. `rescanWizardSheet` — sequence & guards

### 5.1 Inputs / preconditions

| Input | Guard | Result if violated |
|---|---|---|
| `driveFileId` (string) | non-empty | route 400 `{ ok:false, code:"BAD_REQUEST" }` (route-level; not a §12.4 code) |
| active wizard session | `app_settings.pending_wizard_session_id === wizardSessionId` (read in the route; re-checked under lock) | `WIZARD_SUPERSEDED`-style typed result → button shows "Setup moved on — refresh." (reuse the existing superseded copy path; see §10) |
| sheet belongs to this session | a row exists in `onboarding_scan_manifest WHERE (wizard_session_id, drive_file_id)` | typed `not_found` result → button shows "That sheet isn't part of this setup." |
| folder | `app_settings.pending_folder_id` non-null | typed `no_active_session` → "Setup isn't active." |

`driveFileId` provenance is bound to the session via the manifest row (mirrors `retrySingleFile`'s `discovered_during_folder_id` / `wizard_session_id` provenance check, `lib/sync/retrySingleFile.ts:60-75`) so a stale tab on a superseded session cannot re-scan into the wrong session.

### 5.2 Step 1 — capture prior state (BEFORE any write)

Read, in this order, whichever exists for `(wizard_session_id, drive_file_id)`, and derive `priorReady` ("was this sheet on track to publish before the re-scan?"):
- **`pending_syncs`** row (Flow A — sheet still in review): `priorReady = (wizard_approved === true)`; capture `wizard_reviewer_choices`, `triggered_review_items`, `warning_summary`/dataGaps.
- else **`shows_pending_changes`** shadow (Flow B — sheet blocked at publish, `pending_syncs` deleted at Phase B per `finalize/route.ts:589`): `priorReady = true` — a shadow is staged **only** when `/finalize` Phase B processed the row as part of a Publish the operator initiated (the row was finishable, `selectFinishableCleanRows` `finalize/route.ts:346`), so a clean re-scan should restore it to publish-ready rather than force Doug to re-include a typo-fixed sheet. Capture `payload.triggered_review_items` + `payload.reviewer_choices` + the dataGaps derivable from `payload.parse_result.warnings`.
- else **neither** (first-seen, never finalized, never approved): `priorReady = false`.

`priorReady`, `priorDataGapClasses`, and `priorChoices` are the captured inputs to the clean rule (§6).

### 5.3 Step 2 — pre-lock Drive read (side-effect-free)

Fetch the file's current Drive metadata for `driveFileId` (id, name, mimeType, modifiedTime, parents) the same way `retrySingleFile` does (`lib/sync/retrySingleFile.ts:232`), then:

```
prepared = await prepareOnboardingFiles(folderId, { ...deps, listFolder: async () => [metadata] })
```

`prepareOnboardingFiles` (`lib/sync/runOnboardingScan.ts:907`) is pre-lock and side-effect-free; the injected `listFolder` (`RunOnboardingScanDeps.listFolder`, `:147`) scopes it to exactly this one file. It returns one `PreparedOnboardingFile` (`{file, kind:"non_sheet"}` or `{file, kind:"sheet", binding, parseResult}`).

- **Drive fetch / export failure or timeout** → typed result `{ status:"needs_attention", code:"STAGED_PARSE_FAILED"|<existing drive-failure code> }`; NO mutation. (Pre-lock, so nothing is half-written.)
- **`kind:"non_sheet"`** → typed `not_a_sheet` result; no mutation. (Not expected for an existing wizard row, but guarded.)

### 5.4 Step 3 — under `withShowLock(driveFileId, { tryOnly:true })`

Single-holder rule (§8): the re-scan acquires the per-show advisory lock at exactly **one** layer — `withShowLock` (`lib/sync/lockedShowTx.ts:88`, `pg_try_advisory_xact_lock(hashtext('show:'||$1))`). `scanOnboardingPreparedFiles` already acquires this lock internally (`runOnboardingScan.ts:835-847` via `deps.withShowLock ?? defaultWithShowLock`); `rescanWizardSheet` therefore performs **all** of (a)/(b)/(c) inside that same single lock acquisition by routing the heal + clean-rule writes through the scan's already-locked transaction (the `holdPort` passthrough pattern that `retrySingleFile.ts:254-272` uses — `withShowLock: (_id, fn) => fn(scanTx)` — so there is no second acquirer and no nesting).

- **Lock contention** (`pg_try_advisory_xact_lock` returns false — another finalize/cron/scan holds it) → typed result mapped to **`SHOW_BUSY_RETRY`** (`lib/messages/catalog.ts:2534`); NO mutation. This is the serialization guard against an in-flight finalize (no separate `FINALIZE_OWNED_SHOW` check is needed — the per-show lock is the single point of mutual exclusion).

**(a) Re-stage `pending_syncs`** — run the single prepared file through `scanOnboardingPreparedFiles(folderId, wizardSessionId, [prepared], deps)` (`runOnboardingScan.ts:994`), which calls `runPhase1` (`lib/sync/phase1.ts:258`). For a sheet in `onboarding_scan` mode this stages the `ONBOARDING_SCAN_REVIEW` sentinel (`phase1.ts:253`) and returns `outcome:"stage"`; `upsertLivePendingSync` (`runOnboardingScan.ts:382`) writes a fresh `pending_syncs` row with `base_modified_time = coalesce(staged, live watermark)` (`:404-407`), the new `parse_result`, new `triggered_review_items` (new `randomUUID` ids), and `staged_modified_time` = the current Drive `modifiedTime`.
- **`runPhase1` outcome `hard_fail`** → the sheet became a `pending_ingestions` error row + manifest `hard_failed`; result `{ status:"needs_attention", code:"STAGED_PARSE_FAILED", needsReview:true }`. (No `pending_syncs` row to approve; the clean rule is skipped.)
- Confirmed invariant: the `upsertLivePendingSync` ON CONFLICT DO UPDATE set-list (`:416-426`) does **not** touch `wizard_approved` / `wizard_reviewer_choices`, so without step (c) the re-stage would silently preserve a stale approval whose choices reference deleted item ids. Step (c) is therefore mandatory.

**(b) Heal the finalize state (idempotent — no-op for Flow A, the blocker fix for Flow B).** Required POST-CONDITIONS after a re-scan of any sheet:
1. **No orphan shadow:** `DELETE FROM shows_pending_changes WHERE wizard_session_id = $1 AND drive_file_id = $2`. (Flow A: 0 rows; Flow B: removes the orphan that was emitting `STAGED_PARSE_OUTDATED_AT_PHASE_D`.)
2. **Manifest re-stageable:** the `onboarding_scan_manifest` row for `(session, driveFileId)` ends at `status='staged'` and `publish_intent` per §7 (a previously-`'applied'` blocked row must move back to `'staged'` so `selectFinishableCleanRows` re-selects it on the next Publish — `finalize/route.ts:346`).
3. **Checkpoint allows re-finalize:** `wizard_finalize_checkpoints.status` for the session must not be left at `'all_batches_complete'`/`'final_cas_done'` if it would prevent the next `/finalize` from re-processing the re-staged row; it is reset to `'in_progress'` when the re-scan re-opens a row for publishing. (`ensureCheckpoint` is INSERT-ON-CONFLICT-DO-NOTHING, `finalize/route.ts:271`, so it never resets — the reset is performed here.)

> **Implementation note (pinned by a real-DB test, not asserted blindly here):** the exact field values for (2)/(3) — and whether the checkpoint reset is conditional on the row having been `'applied'` — are verified by the Flow-B integration test (§11 T-B), which asserts the end-to-end invariant: *after re-scanning a blocked sheet, clicking Publish again cleanly re-stages (Phase B) and publishes (Phase D) that sheet with no orphan shadow and no stale checkpoint, and does not disturb the other sheets in the batch.* The batch-hold semantics (`finalize-cas/route.ts:711-721`: any blocked row 409s the whole batch *before* the publish flip, though already-applied row-txns are durably committed) mean the re-scan must restore exactly the re-staged sheet, leaving sibling shadows intact.

**(c) Apply the clean rule (§6)** to the freshly re-staged `pending_syncs` row, using the captured prior state.

### 5.5 Step 4 — result

```ts
type RescanResult =
  | { status: "updated"; needsReview: boolean; changed: boolean }   // staged OK
  | { status: "needs_attention"; code: string }                     // parse hard-fail / drive fail
  | { status: "busy"; code: "SHOW_BUSY_RETRY" }
  | { status: "no_active_session" | "not_found" | "superseded" | "not_a_sheet" };
```

`changed` = whether the new `staged_modified_time` differs from the prior staged value (drives "Updated" vs "No changes found" copy). The route serializes this; the button renders the matching inline copy and `router.refresh()`es.

## 6. The "clean" rule (precise, pinned)

After a successful re-stage (outcome `stage`), the sheet is **DIRTY** (→ `wizard_approved=false`, `wizard_reviewer_choices=NULL`, `needsReview=true`) iff **any** of:

- **(D1)** the new `triggered_review_items` contain a **decision-requiring** item. Decision-requiring = the **MI-11** invariant (existing-crew email change; produced at `lib/parser/invariants.ts:563-580`) — the only gated invariant that routes to a per-crew reviewer choice. The `ONBOARDING_SCAN_REVIEW` sentinel (`phase1.ts:253`) is **not** decision-requiring. (Forward-compat: any future gated invariant added to the reviewer-choice surface is added to this list — pinned by a meta-test, §11 T-M.)
- **(D2)** the refreshed parse introduces a **new data-gap class** vs the captured prior: `summarizeDataGaps(new.warnings).classes` (`lib/parser/dataGaps.ts:53`, classes `FIELD_UNREADABLE` / `UNKNOWN_SECTION_HEADER` / `BLOCK_DISAPPEARED`) has a non-zero class **not** present in `priorDataGapClasses`. (A gap Doug fixed — count drops — is still clean; a gap he introduced is dirty.)

Otherwise the sheet is **CLEAN**. When CLEAN:

- If `priorReady === true`: re-stamp `wizard_approved=true`, `wizard_reviewer_choices_version=1`, and **regenerate** `wizard_reviewer_choices` as one `{ item_id, action:"apply" }` per new `triggered_review_item` (the only items in a clean re-scan are non-decision sentinels, whose contract is `action:"apply"` — matching how the wizard records sentinel choices, e.g. `tests/onboarding/finalizeCasReonboardBaseline.db.test.ts`). Preserve `wizard_approved_by_email`; refresh `wizard_approved_at`. → `needsReview=false`, sheet stays publish-ready.
- If `priorReady === false` (Doug hadn't approved/included it yet): leave `wizard_approved=false` — the refreshed content is shown but still needs his review. → `needsReview=true`.

Regeneration is mandatory even when CLEAN because re-parse mints **new** `randomUUID` item ids; the prior choices reference deleted ids and would fail `validateReviewerChoices` at finalize (MISSING/EXTRA choice).

Guard table for the clean rule inputs:

| Input | null / empty / corrupt | Behavior |
|---|---|---|
| new `triggered_review_items` | empty (no sentinel — not expected) | CLEAN by D1; choices = `[]` |
| new `triggered_review_items` | corrupt (fails `parseTriggeredReviewItems`, `lib/staging/triggeredReviewItems.ts`) | treat as hard-fail-equivalent → `needs_attention` (do not approve over a corrupt review surface) |
| `priorChoices` | null / not-array | treated as "no prior approval covering items" → DIRTY if any decision item, else regenerate fresh |
| `priorDataGapClasses` | null (no prior) | any new gap class → DIRTY (conservative) |
| `new.warnings` | null / not-array | treat as `[]` → no gaps |

## 7. `publish_intent` on re-scan

`publish_intent` (`onboarding_scan_manifest`, added `migrations/20260623000001:10`) is the per-sheet "include in this publish" flag.

- **CLEAN + priorApproved** → preserve `publish_intent` unchanged (a typo-fix must not silently drop the sheet from the publish batch).
- **DIRTY** → preserve `publish_intent` as-is but the sheet renders as "needs review"; finalize already refuses an un-approved row, so an unreviewed dirty sheet cannot publish regardless of the flag.
- **Flow B blocked row** (`status` was `'applied'`) → on re-scan, `status` returns to `'staged'`; `publish_intent` stays `true` (it was being published). The §11 T-B test pins that the subsequent Publish re-includes exactly this sheet.

## 8. Invariants honored

- **Per-show advisory lock — single holder (invariant 2).** `rescanWizardSheet` acquires `withShowLock(driveFileId)` exactly once and performs the re-stage + heal + clean-rule writes inside that one held transaction (holdPort passthrough; no nested acquirer). Holder enumeration for `hashtext('show:'||driveFileId)`: `withShowLock` is the sole acquirer; `withPostgresSyncPipelineLock` delegates to it (`runScheduledCronSync.ts:1471`), not a second acquire. The plan extends `tests/auth/advisoryLockRpcDeadlock.test.ts` to pin the re-scan surface's topology.
- **Email canonicalization at the boundary (invariant 3).** Re-staging flows through the same `runPhase1` → parser path as the folder scan; emails are canonicalized at the existing stage boundary (`lib/email/canonicalize.ts`); no new raw-email handling is introduced.
- **No raw error codes in UI (invariant 5).** The route returns typed results; the button renders error states via the message catalog (`lookupDougFacing`) using existing codes only (§10). Success/needs-review copy is plain English (no code).
- **Supabase call-boundary discipline (invariant 9).** Any new Supabase client call in the route destructures `{ data, error }` and distinguishes thrown vs returned errors; new boundary helpers register in the relevant meta-test or carry an inline `// not-subject-to-meta:` note.
- **PostgREST DML lockdown.** All mutations (`pending_syncs`, `shows_pending_changes`, `wizard_finalize_checkpoints`, `onboarding_scan_manifest`) happen server-side under the lock via the existing locked tx path — never via client PostgREST builders.
- **UI quality gate (invariant 8).** `RescanSheetButton` + the `Step3SheetCard` / `cas_per_row` mount changes are UI surfaces → `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`-deferred.
- **TDD per task; commit per task.**

### 8.1 Flag lifecycle (the two booleans this spec touches)

| Flag | Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|---|
| `pending_syncs.wizard_approved` | bool, migration `20260518010444` | existing wizard Apply; **NEW**: `rescanWizardSheet` clean-rule (§6) sets `true` (clean+priorReady) or `false` (dirty / not-ready). `upsertLivePendingSync` does NOT touch it (`runOnboardingScan.ts:416-426`), so the re-scan sets it explicitly. | `selectFinishableCleanRows` (`finalize/route.ts:346`); Step-3 review render | gates whether `/finalize` will stage+publish the row |
| `onboarding_scan_manifest.publish_intent` | bool, migration `20260623000001` | existing Step-3 "include in publish" toggle; **NEW**: `rescanWizardSheet` heal resets `status`→`'staged'` for a re-opened blocked row but **preserves** `publish_intent` (§7) | finalize flip / `unresolvedManifestCount` | whether the sheet is in the publish batch |

No zombie flags: both are written and read; the re-scan's writes are the only additions.

### 8.2 Matrices that do not apply (stated explicitly to preempt review)

- **Tier × domain (surcharge) matrix: N/A** — this feature touches no surcharge/pay-config surface (no user/client/booking/shift × short-turn/holiday/meal/overnight cells).
- **CHECK / enum migration matrix: N/A** — no migration; no CHECK constraint or enum is added or altered. Reuses existing `onboarding_scan_manifest.status` / `wizard_finalize_checkpoints.status` enum **values** only (no new value introduced).
- **Build-vs-runtime gate: N/A** — no env-gated feature; the button is always present in the wizard build.

## 9. UI — `RescanSheetButton`

- **Placement:** (a) in `Step3SheetCard`'s action area (`components/admin/wizard/Step3SheetCard.tsx`, alongside the existing per-row actions); (b) inside each `<li>` of the `cas_per_row` block (`RunFinalCASButton.tsx:115`, and the equivalent block in `FinalizeButton.tsx:295`). Each row already carries `drive_file_id` (`CasPerRowEntry`, `RunFinalCASButton.tsx:25`).
- **States (mode boundary):** `idle` ("Re-scan this sheet") → `loading` ("Re-scanning…", disabled) → result. Mirrors `ReSyncButton.tsx:103` label/loading and `router.refresh()` on ok (`:77-79`).
- **Result copy (plain English, inline, `aria-live="polite"`):**
  - `updated` + `!needsReview` + changed → "Updated — still ready to publish."
  - `updated` + `!needsReview` + `!changed` → "No changes found."
  - `updated` + `needsReview` → "Updated — please re-review this sheet."
  - `needs_attention` → the cataloged `dougFacing` for the returned code + `HelpAffordance`.
  - `busy` → the `SHOW_BUSY_RETRY` dougFacing ("Another sync is in progress — try again in a moment.").
  - `superseded`/`no_active_session`/`not_found`/`not_a_sheet` → a short plain line each.
- **Guard conditions:** disabled while loading; a row whose `parseResult` is null still renders the button (re-scan is exactly how you recover a no-details row); double-click guarded by the loading state (no self-disabling `form action` pattern — see `feedback_react_form_action_synchronous_disable_cancels_submit`).
- **Dimensional invariants:** the button is intrinsic-sized inline content, not a fixed-dimension-parent child; no `getBoundingClientRect` layout assertion required. (Stated explicitly per the dimensional-invariant rule.)

### Transition inventory (button + card state)

| From → To | Treatment |
|---|---|
| idle → loading | instant (disable + label swap) |
| loading → result (any) | instant; result line appears with `aria-live` (no animation) |
| card: approved ✓ → needs-review (after dirty re-scan + refresh) | instant on `router.refresh()` re-render — no in-place animation (server re-render swaps the card's state chip) |
| card: needs-review → approved ✓ (clean re-scan of a previously-approved-then-edited sheet) | instant on refresh |
| blocked row → cleared (Flow B, after refresh) | the row leaves the `cas_per_row` list on the next Publish attempt; the re-scan itself shows the inline result then refresh |

All transitions are deliberately instant (a button + server re-render); there are no compound mid-animation states.

## 10. Error handling & §12.4 codes (reuse only)

| Condition | Code (existing) | catalog cite |
|---|---|---|
| lock contention (busy) | `SHOW_BUSY_RETRY` | `lib/messages/catalog.ts:2534` |
| re-parse hard-fail | `STAGED_PARSE_FAILED` | `:2585` |
| Drive fetch/export failure | reuse the existing onboarding Drive-failure code surfaced by the scan path (no new code) | — |

No new `§12.4` row is added → **no catalog 3-way lockstep / x1 gate change**. `FINALIZE_OWNED_SHOW` (`:1551`) is available but not used (the per-show lock already serializes against finalize; using it would imply a second guard layer we don't need).

## 11. Testing

Real-DB (`*.db.test.ts`, loopback) tests siblings of `tests/onboarding/finalizeCasReonboardBaseline.db.test.ts`, exercising the **production** writers:

- **T-A1 (review, clean):** stage a sheet via the scan path, approve it; edit the fixture (typo-level, no MI-11, no new gap); `rescanWizardSheet` → assert `pending_syncs` refreshed (new `parse_result`, fresh base), `wizard_approved=true`, `wizard_reviewer_choices` regenerated to match the **new** item ids (derive ids from the row, not hardcoded), result `needsReview=false`.
- **T-A2 (review, dirty via D1):** edit the fixture to introduce an MI-11 email change; re-scan → `wizard_approved=false`, `wizard_reviewer_choices=NULL`, `needsReview=true`.
- **T-A3 (review, dirty via D2):** edit the fixture to introduce a new data-gap class not previously present; re-scan → `needsReview=true`. Negative control: a re-scan that *removes* a gap stays clean.
- **T-A4 (parse hard-fail):** edit the fixture to a hard-fail shape; re-scan → `needs_attention` + `STAGED_PARSE_FAILED`, no `pending_syncs` approval, manifest `hard_failed`.
- **T-B (blocker heal, the headline integration test):** drive a sheet to a real `STAGED_PARSE_OUTDATED_AT_PHASE_D` block (genuine mid-setup live-watermark advance, mirroring the true-staleness case in `finalizeCasReonboardBaseline.db.test.ts`), with at least one *sibling* sheet also staged. Re-scan the blocked sheet → assert: orphan shadow deleted, fresh `pending_syncs` with base==current live watermark, manifest `'staged'`+`publish_intent` preserved, checkpoint re-openable, **sibling shadow untouched**. Then run `handleOnboardingFinalize` + `handleOnboardingFinalizeCas` → assert per_row `OK` and the batch publishes. Pre-fix control: without the heal, the second finalize-cas still 409s.
- **T-busy:** hold the per-show lock in a concurrent tx; re-scan returns `SHOW_BUSY_RETRY`; no mutation.
- **T-M (meta-test):** the decision-requiring-invariant list (D1) is pinned by a structural test so a future gated invariant can't silently bypass the clean rule.
- **Route tests:** `requireAdmin` enforced; `wizardSessionId`/`folderId` derived from `app_settings`; superseded session → `superseded`; non-manifest `driveFileId` → `not_found`.
- **Component tests:** `RescanSheetButton` renders on `Step3SheetCard` and in a `cas_per_row` `<li>`; posts `{ driveFileId }`; renders each result-copy branch; `router.refresh()` on ok. Anti-tautology: assert the posted body + the rendered branch independently, and remove sibling label-bearing nodes before scanning for result copy.

Every test states the concrete failure mode it catches (per the anti-tautology rule); expectations derive from fixture dimensions, never hardcoded ids/times.

## 12. Out of scope / future

- Real-time auto-pickup (decision 1 deferred mechanism) — `BACKLOG.md` candidate.
- A per-sheet re-scan on the standalone re-review page (`/admin/onboarding/staged/[…]`) — that page serves Phase-B failures and already has a re-apply flow; folding re-scan in there is a follow-up, not this spec.

## 13. Citations appendix (verified against `origin/main` worktree, 2026-06-29)

- `prepareOnboardingFiles` `lib/sync/runOnboardingScan.ts:907`; `RunOnboardingScanDeps.listFolder` `:147`; `scanOnboardingPreparedFiles` `:994`; per-file lock `:835-847`; `upsertLivePendingSync` `:382` (base coalesce `:404-407`, ON-CONFLICT set-list `:416-426`, does NOT reset `wizard_approved`).
- `runPhase1` `lib/sync/phase1.ts:258`; outcomes union `:79-104`; `ONBOARDING_SCAN_REVIEW` sentinel `:253`.
- `withShowLock` `lib/sync/lockedShowTx.ts:88`; `withPostgresSyncPipelineLock` delegates `lib/sync/runScheduledCronSync.ts:1471`; holdPort passthrough pattern `lib/sync/retrySingleFile.ts:254-272`; pending_ingestions gate (NOT inherited) `:60-75/:114`.
- `stageExistingShowShadow` `app/api/admin/onboarding/finalize/route.ts:525` (base coalesce); `deleteApprovedPending` `:589`; `selectFinishableCleanRows` `:346`; `ensureCheckpoint` `:271`; `advanceCheckpoint` `:610`; `stampManifestPublishIntent` `:499`.
- `applyShadow` `app/api/admin/onboarding/finalize-cas/route.ts:351`; `STAGED_PARSE_OUTDATED_AT_PHASE_D` `:377/:383/:444`; batch-hold `:711-721`.
- `shows_pending_changes` `migrations/20260501001000_internal_and_admin.sql:433` (UNIQUE `:442`); `wizard_finalize_checkpoints` `:420` (status enum `:427`); `onboarding_scan_manifest` `:336` (status enum `:343`); `created_show_id` `migrations/20260611000000:15`; `publish_intent` `migrations/20260623000001:10`.
- UI: `CasPerRowEntry` `components/admin/RunFinalCASButton.tsx:25`; per-row render `:106-125`; `FinalizeButton` `cas_per_row` `:295`; `Step3SheetCard` `components/admin/wizard/Step3SheetCard.tsx:749`; `ReSyncButton` `components/admin/ReSyncButton.tsx:59-104`; sync route `app/api/admin/sync/[slug]/route.ts:54-81`; re-review page `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:135`.
- Messages: `FINALIZE_OWNED_SHOW` `lib/messages/catalog.ts:1551`; `SHOW_BUSY_RETRY` `:2534`; `STAGED_PARSE_FAILED` `:2585`; `ONBOARDING_SCAN_REVIEW` `:1000`.
- Clean-rule inputs: MI-11 `lib/parser/invariants.ts:563-580`; `summarizeDataGaps` `lib/parser/dataGaps.ts:53` (classes `:19`); `ReviewerChoice` `lib/sync/applyStagedCore.ts:33`; `TriggeredReviewItem` `lib/parser/types.ts:428`; `parseTriggeredReviewItems` `lib/staging/triggeredReviewItems.ts`.
- Gate: `app_settings.pending_wizard_session_id` read pattern `lib/sync/applyStaged.ts:524-528`; `requireAdmin` `lib/auth/requireAdmin.ts:263`.
