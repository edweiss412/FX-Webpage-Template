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
`.select()`, the helper issues two guarded reads and composes them in JS — each
read independently `{ data, error }`-guarded. **The read MUST reproduce the
finalize predicate exactly, including the demoted-`staged` case** — this is the
most common wedge (the incident's row was `status='staged'` +
`last_finalize_failure_code` non-null, set by `demotePending`, `route.ts:432`).
Do NOT pre-filter the manifest read to the three "blocking" statuses only, or the
exact wedged row is invisible (violates G1 / T1). Concretely:

1. Read `onboarding_scan_manifest` rows for the session with `status IN
   ('hard_failed','live_row_conflict','discard_retryable','staged')` — i.e.
   include `staged`.
2. Read `pending_syncs.last_finalize_failure_code` + `parse_result.show.title`
   for those `drive_file_id`s.
3. In JS, INCLUDE a row iff `status IN
   ('hard_failed','live_row_conflict','discard_retryable')` OR (`status='staged'`
   AND its `pending_syncs.last_finalize_failure_code IS NOT NULL`) — byte-for-byte
   the `unresolvedManifestCount` predicate (`route.ts:333–366`). A fresh
   unchecked-clean `staged` row (null failure code) is correctly excluded.

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
   - **CLEAN**: keep the row finishable and continue processing it in the same
     per-row transaction — publishing it Live (if it was approved/checked) or
     Held (if fresh-unchecked-clean), regenerating reviewer choices for the new
     sentinel items exactly as `rescanWizardSheet`'s clean branch does
     (`rescanWizardSheet.ts:406–436`). **Full fresh-row rebind (correctness-
     critical — NOT just the two identifiers):** the restage mints a NEW
     `staged_id`, `staged_modified_time`, AND new `triggered_review_items`
     (fresh sentinel ids). The downstream publish path consumes `staged_id` +
     `staged_modified_time` at the generation-scoped re-read (`route.ts:762–786`,
     which pins all four of `wizard_session_id, drive_file_id, staged_id,
     staged_modified_time`), AND `triggered_review_items` + reviewer choices +
     staged ids together into the apply core (`route.ts:887`, `:987`, `:997`,
     `:999`). If only the two identifiers are rebound while
     `triggered_review_items` / choices stay from the OLD generation, the apply
     core sees choices referencing deleted sentinel ids → `EXTRA_REVIEWER_CHOICE`
     / invalid-request / typed-500, or publishes/audits a stale review payload.
     So after a clean restage, `processApprovedRow` MUST re-read the FULL fresh
     `pending_syncs` row by `(wizard_session_id, drive_file_id)` —
     `staged_id`, `staged_modified_time`, `triggered_review_items`,
     `wizard_approved`, `wizard_approved_by_email`, `wizard_approved_at`,
     `wizard_reviewer_choices`, `wizard_reviewer_choices_version`, `parse_result`,
     `source_anchors` — and rebind its local `row` to ALL of them, with reviewer
     choices REGENERATED from the fresh sentinel items exactly as
     `rescanWizardSheet.ts:412` does, BEFORE reaching the `:730`/`:762` re-reads.
     Equivalently: `applyRescanDecisionUnderLock` returns the fully-restaged row
     shape and `processApprovedRow` restarts its per-row publish from that row.
     If any part is stale, the batch either demotes spuriously (0-row re-read) or
     500s (cross-generation choices). The operator never sees a bump only when
     this full rebind is correct; T3 asserts the published show carries the fresh
     `staged_modified_time` AND that its audit/choices reference the fresh
     sentinel generation (no `EXTRA_REVIEWER_CHOICE`).
   - **DIRTY**: demote (`RESCAN_REVIEW_REQUIRED`, carrying the decision items,
     matching `rescanWizardSheet.ts:391–403`) → returned as a per-row failure,
     surfaced for review by Thread 1.

### 4.2 Reuse mechanism (single-holder lock rule — invariant 2 — AND cross-tx row-lock safety)

`rescanWizardSheet` (`rescanWizardSheet.ts:195`) already implements steps 1–3,
but it ACQUIRES its own `finalize:<session>` try-lock (`:252`),
`app_settings FOR UPDATE` (`:261`), a `show:<drive>` lock (`:274`), AND it UPDATEs
`wizard_finalize_checkpoints` (`:371`, the blocker-heal reopen). Calling it from
within a finalize batch would fail two ways: (a) re-acquire `finalize:<session>`
against finalize's own outer holder → busy (single-holder violation), and (b) —
the more dangerous one — a **cross-transaction row-lock deadlock.**

**Connection topology (verified).** Finalize's outer transaction
(`defaultWithTx`, `route.ts:161`) and each per-row transaction (`defaultWithRowTx`,
`route.ts:174`) open **separate `postgres()` connections** — they are distinct
DB transactions, not nested savepoints. The OUTER tx holds, for the ENTIRE batch
loop: `app_settings FOR UPDATE` (`route.ts:290–292`) and
`wizard_finalize_checkpoints FOR UPDATE` (`ensureCheckpoint`, `route.ts:324–326`).
The existing per-row processing deliberately writes ONLY `pending_syncs`,
`onboarding_scan_manifest`, `shows`, `shows_pending_changes`, audit — it NEVER
touches `app_settings` or `wizard_finalize_checkpoints`, precisely because a
per-row write to a row the outer tx holds `FOR UPDATE` would block forever on the
outer tx (which cannot commit until the row finishes) → self-deadlock.

**Resolution:** the shared helper `applyRescanDecisionUnderLock(tx, {
wizardSessionId, driveFileId, pendingFolderId, refreshedParse, prior })` extracts
ONLY the per-row-surface part of `rescanWizardSheet`'s core: capture prior state,
restage via `scanOnboardingPreparedFiles` (injecting a PASS-THROUGH
`withShowLock` that adopts the held lock and acquires nothing), `computeRescanDecision`,
and the clean/dirty `pending_syncs` + `onboarding_scan_manifest` +
`shows_pending_changes` writes for the single `driveFileId`. The helper MUST NOT:

- acquire ANY advisory lock (`finalize:`, `app_settings`, `show:`) — it asserts
  the `show:` lock is held via finalize's existing `adoptShowLockHeld` posture
  (`route.ts:991`), never acquires;
- read or write `app_settings` (the outer tx holds it `FOR UPDATE`);
- write `wizard_finalize_checkpoints` (the outer tx holds it `FOR UPDATE`). The
  checkpoint blocker-heal reopen (`rescanWizardSheet.ts:371`) and the
  `app_settings` session re-check (`:261`) STAY in `rescanWizardSheet`'s own
  wrapper — they are correct there (its standalone tx legitimately owns those)
  and are NOT part of the shared helper.

`rescanWizardSheet` therefore = its lock acquisition + `app_settings` re-check +
`applyRescanDecisionUnderLock` + its checkpoint blocker-heal. `processApprovedRow`
= `applyRescanDecisionUnderLock` under the already-held locks, nothing checkpoint-
or `app_settings`-related (the outer tx owns the checkpoint; finalize does not
reopen it mid-batch — it is already `in_progress`).

The advisory-lock holder topology is UNCHANGED — `finalize:<session>` one holder
(outer tx), `show:<drive>` one holder (per-row tx). The structural guard
`tests/auth/advisoryLockRpcDeadlock.test.ts` is extended to pin that
`applyRescanDecisionUnderLock` (a) acquires no advisory lock and (b) issues no
`app_settings` / `wizard_finalize_checkpoints` write (a static-source assertion,
so a future edit that reintroduces the cross-tx deadlock fails at CI).

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
age AND regardless of the `finalize_active_within_last_hour` recency guard
(`sessionLifecycle.ts:371–387`). When NOT stuck AND not 24h-stale, it still
throws `CleanupRequiresStaleSessionError('session_too_fresh')` as today (a fresh,
still-progressing session must not be casually destroyed).

**Why the recency guard must be bypassed for the stuck path (R1 finding).** A
batch that DEMOTES a row and leaves the checkpoint `in_progress` still runs
`advanceCheckpoint` (`route.ts:646–662`), which sets `last_processed_at = now()`
and `batches_completed + 1`. So a session that just got stuck has a `< 1 hour`
`last_processed_at` BY CONSTRUCTION — the recency guard, unchanged, would block
the stuck-discard for up to an hour (the real incident's `last_processed_at` was
~2 minutes old). That reduces the deadlock from 24h to 1h; it does not remove it.

**Why bypassing is safe.** `cleanupAbandonedFinalize` takes
`pg_advisory_xact_lock(hashtext('finalize:' || sessionId))` (`sessionLifecycle.ts:344`)
— the SAME key finalize's `tryFinalizeLock` acquires for its whole batch
(`route.ts:1130`). So cleanup cannot even begin its checks until any concurrent
finalize has committed/rolled back and released the lock; and while cleanup holds
it, a new finalize's `tryFinalizeLock` fails → `CONCURRENT_FINALIZE_IN_FLIGHT`,
no mutation. Under that lock, "0 finishable clean rows" means no finalize is or
can be making progress, so a recent `last_processed_at` reflects the FAILED batch,
not activity. The recency guard's purpose (don't destroy an actively-advancing
finalize) is already fully served by the advisory lock for the stuck case; the
guard remains for the NON-stuck 24h path (a fresh session with finishable rows
whose operator merely wandered off).

The stuck-eligibility check reuses the two predicates (`selectFinishableCleanRows`
count == 0 AND `unresolvedManifestCount` > 0) via small SQL count helpers local
to `sessionLifecycle.ts` (the module already runs raw SQL through its
`OnboardingSessionTx`), evaluated UNDER the held `finalize:` lock so the counts
are consistent and no concurrent finalize can change them mid-check.

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
- `finalize_active_within_last_hour`: STILL 409 for the NON-stuck path (unchanged)
  — never discard a session that still has finishable rows. BYPASSED only for the
  provably-stuck path (0 finishable + ≥1 unresolved), where the `finalize:`
  advisory lock already guarantees no finalize is concurrently running (§5.1) and
  the §5.5 show-lock-and-recheck closes the recovery-path race.

### 5.5 Show-lock-and-recheck contract (concurrency with Thread 1 recovery — R4/R5)

The `finalize:<session>` lock serializes stuck-cleanup against a concurrent
FINALIZE, but NOT against the Thread 1 recovery path. The staged-review Apply /
re-scan takes only the per-`show:<drive>` lock (`defaultWithRowTx` →
`pg_advisory_xact_lock(show:<drive>)`), never `finalize:<session>`, and it
mutates `pending_syncs` + `onboarding_scan_manifest` for the demoted row
(`applyStaged.ts`). Meanwhile `lockCleanupDriveFiles` (`sessionLifecycle.ts:171`)
locks only `status='applied'` manifest rows + shadows — the demoted wedge row is
`status='staged'` with a failure code and has NO shadow, so cleanup acquires NO
`show:<drive>` lock for it, then `purgeWizardRows` (`sessionLifecycle.ts:164`)
deletes ALL wizard `pending_syncs`/manifest rows unconditionally.

**Race (two-tab incident behavior):** tab A follows the Thread 1 recovery link
and clicks Apply on the demoted row (holds `show:<drive>`, mid-mutation) while
tab B clicks Discard. Stuck-cleanup counts the session stuck under
`finalize:<session>`, never takes `show:<drive>` for the demoted row, and purges
it concurrently with the show-locked Apply → invariant-2 violation + a discard
decided on a now-stale stuck predicate.

**Structural resolution of the cleanup lock-ordering vector (R4→R7).** Four
review rounds hit the same class: cleanup's `lockCleanupDriveFiles`
(`sessionLifecycle.ts:171`) acquires row locks (`SELECT … FOR UPDATE`) BEFORE
`show:<drive>` advisory locks, while EVERY session recovery/mutation route takes
`show:<drive>` FIRST (via `defaultWithRowTx`/`withPostgresSyncPipelineLock`) then
mutates rows — staged **Apply** (touches `staged` rows), staged **Unapprove**
(touches `applied` rows, `unapprove/route.ts:43,74,102`), staged **discard**,
**extract-agenda**, etc. Cleanup's row-before-advisory ordering is AB-BA against
ALL of them, not just Apply. Per the same-vector rule this is resolved
STRUCTURALLY, not per-route:

**`cleanupAbandonedFinalize` converts its ENTIRE drive-file locking to
advisory-before-row**, exactly mirroring the proven reap path
(`collectReapDriveFileIds` / `lockReapDriveFiles`, `sessionLifecycle.ts:516–567`):

1. Collect the FULL drive_file_id set it will touch — `applied`-manifest rows,
   shadows (`shows_pending_changes`), AND the unresolved set
   (`unresolvedManifestCount` rows: blocking statuses + demoted `staged`+failure
   code) — via **PLAIN reads, NO `FOR UPDATE`** anywhere.
2. Acquire `show:<drive>` advisory locks for that whole set in ONE globally-sorted
   acquisition, BEFORE any row lock or mutation. This is the ONLY ordering; there
   is no remaining `FOR UPDATE`-before-`show:` path in cleanup. (The old
   `applied`/shadow `FOR UPDATE` in `lockCleanupDriveFiles` is removed; any row
   lock cleanup still needs happens AFTER the advisory locks, matching the reap.)
3. RE-CHECK UNDER those `show:` locks — ONE rule, IDENTICAL for both purge paths:
   re-read the pre-lock unresolved set; **if ANY drive_file_id that was unresolved
   pre-lock is now resolved** (finishable / failure code cleared / re-approved — a
   concurrent recovery won the `show:` race), cleanup ABORTS without purging,
   throwing `CleanupRequiresStaleSessionError('session_too_fresh')` (client
   `router.refresh()`es; the now-resolvable row appears / Resume works). This holds
   on the 24h-stale path too: a session someone is actively recovering is not
   abandoned, and aborting never destroys just-applied work. Only when the recheck
   confirms the rows are STILL unresolved does the purge proceed. The stuck path
   additionally requires its eligibility predicate (`selectFinishableCleanRows`
   count == 0 AND `unresolvedManifestCount` > 0) to still hold under the locks; the
   stale path keeps its age gate. Neither path purges a row a recovery just
   resolved.

**Structural defense shipped WITH this change (not deferred):** a meta-test pins
that `cleanupAbandonedFinalize`'s lock helper issues NO `SELECT … FOR UPDATE`
before its `show:` advisory acquisitions (static-source assertion over
`sessionLifecycle.ts`, so a future edit reintroducing the inversion fails at CI),
plus the T10 DB-level AB-BA-no-hang test exercised against BOTH the Apply and
Unapprove recovery routes. This closes the vector at CI time regardless of which
recovery route contends.

This makes cleanup hold `show:<drive>` for every row it locks/purges that a
recovery could touch (invariant 2), eliminates the AB-BA inversion against all
recovery routes, and turns the race into a clean serialize-then-recheck: whichever
of recovery / cleanup wins the `show:` lock, the loser observes the committed
result and does the right thing.

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

- **EXTEND** `tests/auth/advisoryLockRpcDeadlock.test.ts` — (a) the extracted
  core acquires no advisory lock and issues no `app_settings`/checkpoint write
  (§4.2); (b) stuck-cleanup's extended `show:<drive>` lock set for unresolved
  rows preserves the globally-sorted acquisition (§5.5), so no new AB-BA against
  finalize/reap. **Advisory-lock holder topology (Thread 2 change):** cleanup
  already holds `finalize:<session>` (`sessionLifecycle.ts:344`) then a sorted set
  of `show:<drive>` locks (`lockCleanupDriveFiles`). BOTH cleanup purge paths
  (24h-stale and stuck) now collect their ENTIRE drive_file_id set — `applied`
  manifest + shadows + unresolved — via PLAIN read and lock it ALL
  ADVISORY-BEFORE-ROW (the old `applied`/shadow `FOR UPDATE`-then-advisory in
  `lockCleanupDriveFiles` is REMOVED — R7 structural fix, mirroring
  `collectReapDriveFileIds`/`lockReapDriveFiles`, `sessionLifecycle.ts:516–567`).
  This closes AB-BA against EVERY `show:`-first recovery route (Apply on `staged`
  rows, Unapprove on `applied` rows, discard, extract-agenda). Single holder per
  key preserved (cleanup is the only acquirer within its tx; finalize is excluded
  by the `finalize:` lock; a recovery holds exactly one `show:` and
  blocks/unblocks cleanly). The deadlock meta-test asserts cleanup's lock helper
  issues NO `for update` before any `pg_advisory_xact_lock(show:…)` (static
  source).
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
- **Cross-tx row-lock deadlock is explicitly designed out** (§4.2). The outer
  finalize tx and per-row tx are SEPARATE connections; the outer tx holds
  `app_settings` + `wizard_finalize_checkpoints` `FOR UPDATE` across the batch.
  The shared core touches NEITHER table — checkpoint reopen + `app_settings`
  re-check stay in `rescanWizardSheet`'s standalone wrapper. Pinned by the
  extended deadlock meta-test (no-`app_settings`/no-checkpoint-write assertion).
  Do not relitigate "reuse the whole rescan core" — that path deadlocks.
- **Fresh-identifier rebind after clean restage is mandatory** (§4.1). The
  restage mints new `staged_id`/`staged_modified_time`; the `:762` re-read pins
  them, so `processApprovedRow` must continue from the fresh values or it
  spuriously demotes. Covered by T3.
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
  actively-progressing fresh session still 409s. The recency guard is bypassed
  ONLY for the stuck path (§5.1), justified by the `finalize:` lock.
- **Cleanup is serialized against the Thread 1 recovery path via `show:<drive>`
  locks + an under-lock recheck** (§5.5) — the `finalize:` lock alone is NOT
  sufficient (recovery Apply takes `show:`, not `finalize:`). BOTH cleanup purge
  paths (24h-stale and stuck; R5-1) extend `lockCleanupDriveFiles` to lock the
  unresolved rows, collected via PLAIN read and locked ADVISORY-BEFORE-ROW (R5-2
  AB-BA avoidance). Do not treat this as redundant with the finalize-lock
  argument, and do not re-scope it to the stuck path only — the shared
  `purgeWizardRows` deletes unresolved rows on both paths.

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
  post-commit. The published row's reviewer choices reference the FRESH sentinel
  generation — assert NO `EXTRA_REVIEWER_CHOICE` / invalid-request, and that the
  audit payload reflects the re-parsed `parse_result`, not the stale one.
  Catches: false-positive demote on cosmetic bump; publishing with stale
  identifiers OR cross-generation choices/items (the §4.1 full-rebind hazard).
- **T4 (Thread 3 dirty):** a row whose re-parse surfaces an MI-12 crew change is
  demoted `RESCAN_REVIEW_REQUIRED` with decision items, NOT published. Catches:
  auto-healing a genuine content change (publishing unreviewed data).
- **T5 (Thread 3 fail-closed):** Drive export throws during inline re-parse →
  `DRIVE_FETCH_FAILED` demote, row not published. Catches: publishing a row we
  could not re-verify.
- **T6 (Thread 3 topology):** `applyRescanDecisionUnderLock` (a) acquires no
  advisory lock and (b) issues no `app_settings` / `wizard_finalize_checkpoints`
  write (static-source deadlock meta-test). Catches: a nested `finalize:`/`show:`
  acquisition reintroducing the M5-R20 deadlock class, AND a per-row write to an
  outer-tx-held `FOR UPDATE` row (the cross-tx deadlock §4.2 designs out).
- **T6b (Thread 3 clean, DB-level):** a `.db.test.ts` runs a real clean inline
  restage inside a finalize batch against Postgres and asserts the batch COMMITS
  (does not hang/deadlock) and the show is published with the fresh
  `staged_modified_time`. Catches: the cross-tx deadlock escaping the static
  meta-test (fake-tx unit suites never execute the SQL that would block).
- **T7 (Thread 2 stuck):** a fresh (<24h) session with 0 finishable + ≥1
  unresolved rows is discarded successfully; published shows survive; unpublished
  interim shows deleted. Catches: the 24h gate trapping a stuck operator.
- **T8 (Thread 2 not-stuck):** a fresh session WITH finishable rows still 409s
  `session_too_fresh`. Catches: weakening the guard for actively-progressing
  sessions.
- **T9 (Thread 2 recency, non-stuck):** a fresh session WITH finishable rows and
  `last_processed_at > now() - 1h` still 409s (guard applies to the non-stuck
  path). Catches: weakening the recency guard for a session that could still
  progress.
- **T9b (Thread 2 recency, stuck — the incident):** a fresh, PROVABLY-STUCK
  session (0 finishable + ≥1 unresolved) whose `last_processed_at` is 2 minutes
  old (set by the demoting batch's `advanceCheckpoint`) IS discarded successfully
  — the recency guard does NOT block it. Catches the exact real-world deadlock:
  the escape hatch failing for the first hour after getting stuck.

- **T10 (Thread 2 × recovery concurrency — R4/R5/R7):** a `.db.test.ts` that
  holds a session row's `show:<drive>` lock FIRST (simulating a recovery route
  that took `show:` before its row mutation — the AB-BA-prone ordering), then
  invokes cleanup; cleanup must NOT AB-BA-deadlock (it collects ALL drive ids via
  plain read and acquires every `show:` lock before any `FOR UPDATE`), BLOCKS on
  the held lock, and once the recovery commits: (a) if it resolved the row, the
  under-lock recheck aborts `session_too_fresh`, purging nothing; (b) if not,
  cleanup proceeds. Exercise it for BOTH recovery routes that take `show:`-first
  and touch session rows — staged **Apply** (a `staged`+code row) AND staged
  **Unapprove** (an `applied` row) — and for BOTH cleanup paths (24h-stale +
  stuck). Catches: AB-BA deadlock on ANY recovery route (the R7 Unapprove-vs-
  applied case), purging mid-recovery without the `show:` lock (invariant 2),
  and discarding on a stale predicate.
- **T10-static (R7 structural):** a static-source meta-test asserting
  `cleanupAbandonedFinalize`'s lock helper contains no `for update` before its
  `pg_advisory_xact_lock(show:…)` calls — reintroducing the inversion fails at CI.

Tests deriving "unresolved" expectations assert against the DB row state (the
data source), not against the rendered container — anti-tautology rule.
