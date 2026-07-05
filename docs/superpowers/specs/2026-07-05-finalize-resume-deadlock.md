# Spec: Unblock the finalize-resume deadlock

**Date:** 2026-07-05
**Slug:** `finalize-resume-deadlock`
**Status:** Draft (autonomous ship)

## 1. Problem

An admin published shows through the setup wizard. Batch 1 published one show
(`wizard_finalize_checkpoints.batches_completed = 1`, `status = 'in_progress'`).
A later batch hit `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` — the "sheet had
been changed" error raised at `app/api/admin/onboarding/finalize/route.ts:730`
when Google Drive reports a `modifiedTime` different from the one captured when
the sheet was staged. Google bumps `modifiedTime` for reasons that do not change
the parsed content (volatile-formula recalculation on open, rename/move/share,
another viewer's session, Google's own re-saves), so this fires even when the
operator changed nothing.

On that failure, `demotePending` (`route.ts:432`) sets
`pending_syncs.wizard_approved = false` and `onboarding_scan_manifest.status =
'staged'`, and stamps `last_finalize_failure_code`. The session is now wedged,
because the `in_progress` re-entry surface `FinalizeInProgress`
(`components/admin/FinalizeInProgress.tsx`, selected at `app/admin/page.tsx:165`)
offers exactly two actions and BOTH are gated shut in this state:

1. **Resume publishing** → `POST /api/admin/onboarding/finalize` returns 409
   `ONBOARDING_NOT_RESOLVED` (`route.ts:1179–1194`): 0 finishable clean rows
   remain but ≥1 unresolved row exists. The catalog copy
   (`lib/messages/catalog.ts:1660`) says "resolve them and try again" — but the
   screen has **no affordance to reach the resolution surface.** The wizard
   review UI is only rendered when the checkpoint is `null`
   (`app/admin/page.tsx:197`); an `in_progress` checkpoint can never reach it.
2. **Discard this setup** → `cleanupAbandonedFinalize`
   (`lib/onboarding/sessionLifecycle.ts:336`) requires
   `pending_wizard_session_at < now() - interval '24 hours'` (`:352`). A fresh
   session throws `CleanupRequiresStaleSessionError('session_too_fresh')`
   (`:57–68`, `:365`) → catalog `CLEANUP_REQUIRES_STALE_SESSION`
   (`catalog.ts:2417`) = "Cleanup is only available for stale setup sessions."

Result: the operator cannot finish (a demoted sheet needs re-resolution and no
path reaches it) and cannot start over (the escape hatch is locked for 24h). The
only current escapes are waiting 24 hours or a direct DB edit.

This is a design gap in three places, addressed as three threads below.

## 2. Goals / Non-goals

**Goals**

- G1. The `in_progress` re-entry surface always exposes a path to resolve every
  unresolved sheet — for ANY demote cause, not just the modtime race.
- G2. A cosmetic `modifiedTime` bump (content materially unchanged) does not
  block finalize at all — finalize auto-heals it and keeps publishing, so the
  operator never sees it.
- G3. A provably-stuck fresh session can always be discarded immediately, without
  the 24h wait.

**Non-goals**

- No schema change. No new table, column, CHECK, or enum. (Confirmed: every fix
  is read-path logic, UI, or existing-mutation control flow.)
- No change to the cron sync path, the crew page, or auth.
- Not touching the `all_batches_complete` (`ReadyToPublish` /
  `StaleReadyToPublish`) or `final_cas_done` branches of `app/admin/page.tsx`.
- Not reworking `applyStaged`'s `restaged_inline` wizard path (`route.ts` apply
  route `:188`) — that stays the operator-driven re-review recovery.

## 3. Thread 1 — Resume screen surfaces the recovery (linchpin)

### 3.1 Behavior

`FinalizeInProgress` becomes aware of *which* sheets block finish. On render it
reads the session's unresolved rows using the SAME predicate the finalize route
uses in `unresolvedManifestCount` (`route.ts:333–366`):

```
m.status in ('hard_failed','live_row_conflict','discard_retryable')
OR (m.status = 'staged' AND ps.last_finalize_failure_code IS NOT NULL)
```

For each unresolved row it renders a list item with:

- the sheet's display name (`pending_syncs.parse_result.show.title` when present,
  else the `drive_file_id`),
- the Doug-facing copy for its `last_finalize_failure_code` via
  `lib/messages/lookup.ts` `messageFor(code).dougFacing` (NEVER raw — invariant
  5); a row with a blocking manifest status but null failure code gets neutral
  fallback copy,
- a `HelpAffordance` for the code (matching `ResumeFinalizeButton`'s race-row
  presentation, `components/admin/ResumeFinalizeButton.tsx:142`),
- a recovery link to the existing staged-review page, built EXACTLY as the
  finalize route builds it: `reApplyUrl(wizardSessionId, driveFileId)` =
  `/admin/onboarding/staged/<wsid>/<dfid>` (`route.ts:247–249`). The client never
  composes the URL; the server component passes the built href.

The staged-review page
(`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`) is a
standalone admin-gated route (`requireAdmin`, `:173`) reachable regardless of
checkpoint status, and its Apply endpoint already re-parses on modtime drift
(`restaged_inline`, apply route `:188`). So once the row is listed, the operator
has a working, already-built resolution path.

### 3.2 Data read

A new admin-private helper next to the dispatcher — `app/admin/_unresolvedSheets.ts`
(underscore-prefixed like `app/admin/_finalizeCheckpoint.ts` so Next.js does not
route it) — reads the unresolved rows through the cookie-bound Supabase server
client. It follows the Supabase call-boundary discipline (invariant 9):
destructure `{ data, error }`, distinguish returned-error from thrown-error, and
return a discriminated `{ kind: 'infra_error' }` on fault. It is registered in
`tests/admin/_metaInfraContract.test.ts` (mirroring `fetchWizardStagedRow`,
staged page `:112`).

Because the manifest/pending_syncs join is not expressible in one PostgREST
`.select()`, the helper issues two guarded reads (manifest rows for the session
at blocking statuses; the `pending_syncs` `last_finalize_failure_code` +
`parse_result.show.title` for those drive_file_ids) and composes them in JS —
each read independently `{ data, error }`-guarded.

### 3.3 Guard conditions (Thread 1)

- Unresolved list empty (0 rows): the screen renders WITHOUT the unresolved-list
  section — Resume alone is correct (nothing blocks; e.g. the operator resolved
  everything in another tab). No empty-list placeholder box.
- `parse_result` null / missing `show.title`: fall back to `drive_file_id` as the
  display name (never crash, never blank).
- `last_finalize_failure_code` null on a blocking-status row
  (`hard_failed`/`live_row_conflict`/`discard_retryable`): render neutral copy
  ("This sheet needs review before setup can finish.") + the recovery link; do
  NOT invent a code.
- Infra error reading the list: render the existing screen (Resume + Discard)
  WITHOUT the list, plus a soft "We couldn't load the blocked sheets — refresh
  in a moment" note. Never block the whole screen on the auxiliary read.

## 4. Thread 3 — Automatic content re-parse inside finalize

### 4.1 Behavior

At `route.ts:730`, when `!sameTimestamp(metadata.modifiedTime,
row.staged_modified_time)`, finalize STOPS demoting unconditionally. Instead,
under the already-held `finalize:<session>` lock (outer tx, acquired
`route.ts:1130`) and `show:<drive_file_id>` lock (per-row tx via
`runtime.withRowTx`, `route.ts:1219`), it re-parses and applies the existing
clean/dirty decision:

1. Re-fetch + re-parse the one sheet (`prepareOnboardingFiles`,
   `lib/sync/runOnboardingScan.ts:944`). A Drive export/parse failure → demote
   `DRIVE_FETCH_FAILED` (identical to the existing `route.ts:711` handling). A
   non-sheet / not-found → demote as the scan reports.
2. Re-stage on the held tx (`scanOnboardingPreparedFiles`,
   `runOnboardingScan.ts:1108`). A `hard_failed` scan → demote (matching
   `rescanWizardSheet`'s hard-fail branch, `lib/onboarding/rescanWizardSheet.ts:298`).
3. `computeRescanDecision(row.parse_result, refreshedParse, priorGaps)`
   (`lib/onboarding/rescanDecision.ts:29`). DIRTY iff a decision-requiring crew
   change (MI-11..14) OR a per-class data-gap count increase.
   - **CLEAN**: keep the row finishable with the FRESH staged identifiers
     (`staged_id`, `staged_modified_time`) and continue processing it in the same
     per-row transaction — publishing it Live (if it was approved/checked) or
     Held (if fresh-unchecked-clean), regenerating reviewer choices for the new
     sentinel items exactly as `rescanWizardSheet`'s clean branch does
     (`rescanWizardSheet.ts:406–436`). Because the restage set
     `staged_modified_time = metadata.modifiedTime`, the subsequent
     generation-scoped re-read (`route.ts:762`) matches on the fresh identifiers.
     The operator never sees a bump.
   - **DIRTY**: demote (`RESCAN_REVIEW_REQUIRED`, carrying the decision items,
     matching `rescanWizardSheet.ts:391–403`) → returned as a per-row failure,
     surfaced for review by Thread 1.

### 4.2 Reuse mechanism (single-holder lock rule — invariant 2)

`rescanWizardSheet` (`rescanWizardSheet.ts:195`) already implements steps 1–3,
but it ACQUIRES its own `finalize:<session>` try-lock (`:252`),
`app_settings FOR UPDATE` (`:260`), and `show:<drive>` lock (`:274`). Calling it
from within a finalize batch would attempt to re-acquire `finalize:<session>`
against finalize's own outer holder on a separate connection and FAIL (busy) —
and would violate the single-holder rule.

**Resolution:** extract `rescanWizardSheet`'s post-lock core — capture prior
state, restage on the passed tx, `computeRescanDecision`, and the clean/dirty
branches — into a shared helper `applyRescanDecisionUnderLock(tx, {
wizardSessionId, driveFileId, pendingFolderId, refreshedParse, prior })` that
takes an ALREADY-LOCKED tx and NEVER acquires `finalize:`, `app_settings`, or a
NEW `show:` lock (it asserts the show lock is held, mirroring finalize's existing
`adoptShowLockHeld` posture, `route.ts` around `:751`). Both callers use it:

- `rescanWizardSheet` keeps its own lock acquisition, then calls the core.
- `processApprovedRow` calls the core under finalize's already-held locks.

The advisory-lock holder topology is therefore UNCHANGED — `finalize:<session>`
has exactly one holder (finalize's outer tx), `show:<drive>` exactly one
(finalize's per-row tx). The extracted core is lock-free by contract. The
structural guard `tests/auth/advisoryLockRpcDeadlock.test.ts` is extended to pin
that `applyRescanDecisionUnderLock` acquires no advisory lock.

### 4.3 Drive-light contract change (§5.6 / §5.7)

This is the one deliberate contract change. Finalize today is "Drive-light": it
fetches Drive *metadata* per row (`route.ts:709`) but does NO body export
(`route.ts:755`, "finalize does NO per-PDF Drive call"). Thread 3 adds a Drive
export + parse **only on the rare `modifiedTime` mismatch**, under the held
`show:` lock. This extends the lock-hold window during that export, bounded by
`runtime.batchCap` rows per batch and gated by the mismatch condition (the common
no-mismatch path is byte-identical to today). This supersedes the §5.7
temporal-scope "delegate re-validation to cron" note FOR THE MODTIME-MISMATCH
CASE ONLY; the post-publish cron re-validation is otherwise unchanged.

Rationale for accepting export-under-lock rather than `rescanWizardSheet`'s
pre-lock read: finalize already holds `finalize:` + `show:` across the whole
batch; releasing and re-acquiring per mismatched row to do a pre-lock read would
break the batch's transactional atomicity and the single-holder topology. The
export is consistent with the existing under-lock metadata fetch, just heavier,
and only on the rare mismatch.

### 4.4 Guard conditions (Thread 3)

- Drive export fails during the inline re-parse → `DRIVE_FETCH_FAILED` demote
  (fail-closed; never publish a row we could not re-verify).
- Sheet moved out of the setup folder: already handled BEFORE the timestamp
  check by the folder-scope guard (`route.ts:720`), so the inline re-parse is
  only reached for in-folder sheets.
- `computeRescanDecision` needs a readable prior parse. `row.parse_result` is the
  staged parse; if unreadable (corrupt jsonb) treat as DIRTY (force review),
  matching `rescanWizardSheet.ts:389` (`priorReady && priorParse === null`).
- An unchecked-clean (Held) row (`wizard_approved = false`,
  `last_finalize_failure_code IS NULL`) that drifts: CLEAN → restage + keep
  unchecked + continue (published Held); DIRTY → demote. Same split, keyed on
  prior-approved.
- Streaming: the per-row `onRow` progress event (`route.ts:1262`) still fires
  once per row after processing, including the inline-restaged row.

### 4.5 Observability

The auto-heal is worth counting but MUST NOT add a new §12.4 catalog code (that
would pull in the x1/x2/help/enum CI touchpoints for no user-facing value).
Finalize's admin-mutation observability is already satisfied by the post-commit
`SHOW_FINALIZED` outcome (invariant 10, `AUDITABLE_MUTATIONS`). The auto-heal
adds ONE post-commit `log.info("finalize auto-healed modtime drift", { source:
"api.admin.onboarding.finalize", event: "modtime_autohealed", driveFileId,
wizardSessionId })` — a durable structured log with an `event` field (NOT a
`code` field, so it is not a catalog code and not subject to the §12.4 scanner).
Emitted POST-COMMIT (outside the advisory-lock tx, invariant 2), never logging
the sheet contents.

## 5. Thread 2 — Immediate discard when provably stuck

### 5.1 Behavior

`cleanupAbandonedFinalize` (`sessionLifecycle.ts:336`) gains a SECOND eligibility
path alongside the 24h-staleness path. A session is **provably stuck** when,
under the `finalize:<session>` lock it already takes (`:344`):

- 0 finishable clean rows remain (the `selectFinishableCleanRows` predicate,
  `route.ts:381`), AND
- ≥1 unresolved row exists (the `unresolvedManifestCount` predicate,
  `route.ts:333`).

When provably stuck, cleanup proceeds regardless of `pending_wizard_session_at`
age. When NOT stuck AND not 24h-stale, it still throws
`CleanupRequiresStaleSessionError('session_too_fresh')` as today (a fresh,
still-progressing session must not be casually destroyed). The
`finalize_active_within_last_hour` guard (`:371–387`) is UNCHANGED and still
applies — an actively-advancing finalize is never "stuck" even if the row
arithmetic looks stuck mid-batch, because the recency guard blocks it.

The stuck-eligibility check reuses the two predicates via small SQL count
helpers local to `sessionLifecycle.ts` (the module already runs raw SQL through
its `OnboardingSessionTx`), evaluated UNDER the held `finalize:` lock so the
counts are consistent with any concurrent finalize.

### 5.2 Published shows stay live

Cleanup's deletes are unchanged: it removes only `published = false` interim
shows created by this session (`sessionLifecycle.ts:409–420`, provenance-keyed).
A show already published Live in an earlier batch of this run STAYS live — it is
a real crew page. This is the intended semantics.

### 5.3 Confirm copy

`CleanupAbandonedFinalizeButton` (`components/admin/CleanupAbandonedFinalizeButton.tsx`)
confirmation copy states plainly: discarding wipes the unpublished remainder of
this run, and shows already published in this run stay live. No new §12.4 code —
this is a state page / confirmation copy change (invariant 5 vacuously satisfied,
same as the existing button's copy).

### 5.4 Guard conditions (Thread 2)

- Session already rotated away (not the active `pending_wizard_session_id`):
  existing `already_cleaned` short-circuit (`sessionLifecycle.ts:362`) unchanged.
- Fresh session that is NOT stuck (has finishable rows): still
  `session_too_fresh` 409 — Thread 2 does not weaken the guard for
  actively-progressing sessions.
- `finalize_active_within_last_hour`: unchanged, still 409 — never discard a
  running finalize.

## 6. Files touched

| File | Change |
| --- | --- |
| `components/admin/FinalizeInProgress.tsx` | Render unresolved-sheet list with recovery links; accept the unresolved rows as a prop. |
| `app/admin/_unresolvedSheets.ts` (new) | Admin-private guarded read of unresolved rows; `_metaInfraContract` registry row. |
| `app/admin/page.tsx` | Read unresolved sheets for the `in_progress` branch, pass to `FinalizeInProgress`. |
| `app/api/admin/onboarding/finalize/route.ts` | Replace the `:730` unconditional demote with the inline re-parse + `applyRescanDecisionUnderLock`; continue-on-clean; post-commit auto-heal `log.info`. |
| `lib/onboarding/rescanWizardSheet.ts` | Extract post-lock core into `applyRescanDecisionUnderLock`; call it. |
| `lib/onboarding/applyRescanDecisionUnderLock.ts` (new, or co-located) | The shared lock-free clean/dirty core. |
| `lib/onboarding/sessionLifecycle.ts` | Add the provably-stuck eligibility path to `cleanupAbandonedFinalize`. |
| `components/admin/CleanupAbandonedFinalizeButton.tsx` | Confirm copy: published shows stay live. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | Pin `applyRescanDecisionUnderLock` acquires no advisory lock. |
| `tests/admin/_metaInfraContract.test.ts` | Register `_unresolvedSheets` reader. |

## 7. Meta-test inventory

- **EXTEND** `tests/auth/advisoryLockRpcDeadlock.test.ts` — the extracted core
  must acquire no advisory lock (single-holder topology preserved).
- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — new `_unresolvedSheets`
  Supabase read boundary.
- **No new registry** for admin-mutation observability: finalize and cleanup are
  already registered mutation surfaces; Thread 3's behavior stays within
  `SHOW_FINALIZED`, Thread 2 stays within cleanup's existing coverage. The
  `tests/log/_metaMutationSurfaceObservability.test.ts` walk still passes (no new
  mutating route/action added).
- **No §12.4 catalog change** — no new code, so `x1-catalog-parity` and the
  `gen:spec-codes`/`catalog.ts` lockstep are untouched.

## 8. Transition inventory (FinalizeInProgress states)

The `in_progress` re-entry surface has these states; enumerate the pairs:

| State | Render |
| --- | --- |
| A. No unresolved rows | Progress + Resume; no list; Discard (24h-gated). |
| B. ≥1 unresolved row | Progress + Resume; **unresolved list with recovery links**; Discard (stuck-eligible → enabled). |
| C. Aux read infra error | Progress + Resume; soft "couldn't load blocked sheets" note; Discard. |

- A↔B: server-render difference on each page load (the list appears/disappears
  as rows resolve). No client animation — the screen is a server component that
  re-renders on `router.refresh()`; instant, no transition needed.
- A/B↔C: infra-error fallback, server-render; instant.
- Resume click result (`ResumeFinalizeButton`) is UNCHANGED (its own race-row /
  error states remain). The new list is additive and static.

No `AnimatePresence` / ternary-render animation is introduced; all three states
are plain conditional server render. Transition-audit task therefore asserts
"instant — no animation needed" for every pair.

## 9. Disagreement-loop preempts (for the reviewer)

- **§5.6/§5.7 Drive-light finalize is intentionally superseded for the
  modtime-mismatch case** (§4.3). This is the ratified decision of this spec — do
  not relitigate "finalize must never export." The export is gated on the rare
  mismatch and bounded by `batchCap`.
- **Export-under-`show`-lock is deliberate, not an oversight** (§4.3). Reusing
  `rescanWizardSheet`'s pre-lock read would break batch atomicity + the
  single-holder topology; the extracted core is lock-free by contract and pinned
  by the deadlock meta-test.
- **Fail-closed on inline re-parse Drive failure** (§4.4): a row we cannot
  re-verify is demoted, never published. Matches the existing `DRIVE_FETCH_FAILED`
  posture.
- **No new §12.4 code is intentional** (§4.5, §5.3): auto-heal uses an `event`-
  keyed `log.info`, not a catalog `code`; Thread 2 copy is a state-page change.
- **Thread 1 is required even with Thread 3** (§3): the resume screen must expose
  recovery for DIRTY rows and every non-modtime demote cause (out-of-scope,
  corrupt review items, `DRIVE_FETCH_FAILED`, `hard_failed`), which Thread 3 does
  not auto-heal.
- **Thread 2 does not weaken the fresh-session guard** (§5.4): only a
  provably-stuck (0 finishable + ≥1 unresolved) session bypasses 24h; an
  actively-progressing fresh session still 409s, and the
  `finalize_active_within_last_hour` recency guard is untouched.

## 10. Test plan (concrete failure modes)

- **T1 (Thread 1 list):** given a session with one `staged` +
  `last_finalize_failure_code` row and one `permanent_ignore` row, the screen
  lists exactly the one blocking sheet with `messageFor(code).dougFacing` copy
  and `reApplyUrl` href; the `permanent_ignore` row is NOT listed. Catches: the
  screen re-inventing the unresolved predicate or listing resolved rows.
- **T2 (Thread 1 guards):** null `parse_result` → drive_file_id shown; aux infra
  error → screen still renders Resume+Discard with the soft note. Catches: a
  crash on partial data trapping the operator again.
- **T3 (Thread 3 clean):** a row whose live `modifiedTime` differs but whose
  re-parse is content-identical (no MI-11..14, no gap regression) is published in
  the same batch with a fresh `staged_modified_time`; `wizard_approved` stays
  true; no demote; `SHOW_FINALIZED` emitted; auto-heal `log.info` emitted
  post-commit. Catches: false-positive demote on cosmetic bump; publishing with
  stale identifiers.
- **T4 (Thread 3 dirty):** a row whose re-parse surfaces an MI-12 crew change is
  demoted `RESCAN_REVIEW_REQUIRED` with decision items, NOT published. Catches:
  auto-healing a genuine content change (publishing unreviewed data).
- **T5 (Thread 3 fail-closed):** Drive export throws during inline re-parse →
  `DRIVE_FETCH_FAILED` demote, row not published. Catches: publishing a row we
  could not re-verify.
- **T6 (Thread 3 topology):** `applyRescanDecisionUnderLock` acquires no
  advisory lock (deadlock meta-test). Catches: a nested `finalize:`/`show:`
  acquisition reintroducing the M5-R20 deadlock class.
- **T7 (Thread 2 stuck):** a fresh (<24h) session with 0 finishable + ≥1
  unresolved rows is discarded successfully; published shows survive; unpublished
  interim shows deleted. Catches: the 24h gate trapping a stuck operator.
- **T8 (Thread 2 not-stuck):** a fresh session WITH finishable rows still 409s
  `session_too_fresh`. Catches: weakening the guard for actively-progressing
  sessions.
- **T9 (Thread 2 recency):** a fresh, stuck-looking session with
  `last_processed_at > now() - 1h` still 409s `finalize_active_within_last_hour`.
  Catches: discarding a running finalize.

Tests deriving "unresolved" expectations assert against the DB row state (the
data source), not against the rendered container — anti-tautology rule.
