# Cron wizard-ownership skip — spec

**Date:** 2026-07-16
**Status:** Draft
**Owner decision:** ratified in-session 2026-07-16 (per-file wizard-ownership skip chosen over auto-publish-branch-only gate and global cron stand-down).

## 1. Problem

The automatic sync gate is blind to wizard-partition staging, so the cron can
consume ("hijack") sheets an open onboarding wizard session has staged for
review — including first-seen **auto-publishing** them outside the wizard.

Live incident (validation, 2026-07-16 UTC):

1. 16:15:41 `VALIDATION_RESET_RUN` cleared 7 `shows` rows; setup rerun rotated
   the wizard session.
2. 16:16:12 onboarding scan staged 8 sheets under wizard session
   `ac40954f-f2f2-4d47-8278-499f7238da7c` (wizard-partition `pending_syncs`).
3. 16:20–16:21 the next cron tick processed the same files. Its gate reads only
   `shows` and LIVE-partition `pending_syncs` (`wizard_session_id is null` —
   `lib/sync/perFileProcessor.ts:112` and `:153`), both empty → every sheet
   looked clean-first-seen → phase1 `auto_publish_ready`
   (`lib/sync/phase1.ts:525-541`, `:587-588`; `auto_publish_clean_first_seen`
   flag ON) → cron created and **published all 7 shows** itself
   (7 `SHOW_FIRST_PUBLISHED` alerts, `sync_log` `applied` rows).
4. The user's step-3 publish at 16:36 then ran against rows whose shows already
   existed; two sheets the user deliberately left unchecked
   (`publish_intent = false`) were live anyway, and the degraded step-3 rows
   rendered the §4.6 "We couldn't read the details of this sheet" fallback
   (`components/admin/wizard/Step3SheetCard.tsx:366`).

Intermittency: the bug bites only when a cron tick (5-minute cadence) lands
between the wizard scan and the user's publish, and only while `shows` rows are
absent for the folder (fresh onboarding or right after a validation reset).

## 2. Fix

Add a **wizard-ownership skip** to `perFileProcessor`
(`lib/sync/perFileProcessor.ts`): in automatic modes (`cron` / `push` — the
existing `isAutomaticMode` gate at `:56-58`), a file owned by the **active
pending wizard session** is skipped with a new skip reason before any
watermark/staging work.

### 2.1 Ownership predicate

A file `drive_file_id = F` is **wizard-owned** iff:

- `app_settings.pending_wizard_session_id` is non-null (call it `S`;
  single-row settings table, columns at
  `supabase/migrations/20260501001000_internal_and_admin.sql:243-244`), AND
- at least one wizard-partition row exists for `(F, S)` in any of:
  - `pending_syncs` (staged preview awaiting step-3 review),
  - `pending_ingestions` (wizard hard-fail awaiting a sheet fix),
  - `deferred_ingestions` (session-scoped defer decision).

All three tables carry a nullable `wizard_session_id` column (the wizard
partition discriminator used throughout `lib/sync` — e.g.
`lib/sync/runScheduledCronSync.ts:954`, `:984`, `:1293`).

**Why row-existence, not `onboarding_scan_manifest` membership:** pending-row
ownership releases naturally when the wizard finalize consumes the row
(`app/api/admin/onboarding/finalize/route.ts:707-712` deletes every FINISHABLE
clean row — checked AND unchecked, per the selector predicate `m.status in
('staged','applied') and (ps.wizard_approved = true or
ps.last_finalize_failure_code is null)` at `finalize/route.ts:440-448`), so
cron resumes normal update syncing for published shows immediately, even while
the wizard tab stays open. Manifest membership
would hold ownership until session teardown and could freeze live-show syncing
for up to the 24h reap on an abandoned session.

**No gate-side staleness clock (R2 amendment).** The gate deliberately does
NOT re-derive session staleness. The lifecycle's real staleness contract is a
six-table freshest-activity aggregate
(`lib/onboarding/sessionLifecycle.ts:808-820` — greatest of checkpoint
`last_processed_at`, `shows_pending_changes.staged_at`, `pending_syncs`
`parsed_at`/`wizard_approved_at`, manifest `observed_at`/`transitioned_at`,
`pending_ingestions` `first_seen_at`/`last_attempt_at`,
`deferred_ingestions.deferred_at`), and same-folder rescans reuse the session
WITHOUT refreshing `pending_wizard_session_at`
(`app/api/admin/onboarding/scan/route.ts:177-189`, `isMint` ternary at
`:189`). Any simpler gate-side clock (e.g. `pending_wizard_session_at` alone)
diverges from that contract and can release ownership while the session is
still active — reopening the hijack (adversarial R2 finding 1). Session
lifecycle transitions (finalize-cas completion, setup rerun/takeover, reset,
reap) are the ONLY release authorities; the gate re-derives nothing.

**Release semantics.** Ownership requires BOTH the pointer
(`app_settings.pending_wizard_session_id = S`) AND a `(F, S)` row, so it
releases the moment EITHER side goes away:

- **Pointer side (dominant):** finalize-cas Finish clears the pointer
  (`app/api/admin/onboarding/finalize-cas/route.ts:673-687`, `promoteSettings`
  nulls `pending_wizard_session_id`); a setup rerun / new scan rotates it
  (`app/api/admin/onboarding/scan/route.ts:177-190`;
  `lib/onboarding/sessionLifecycle.ts:323-324`), and
  `cleanupAbandonedFinalize` rotates it for the mid-finalize abandoned case
  (`lib/onboarding/sessionLifecycle.ts:645-646`); a validation
  reset clears wizard state wholesale. Any of these instantly releases EVERY
  file owned by the old session, regardless of leftover rows — leftover rows
  with a non-pointer session id never match the predicate.
- **Row side:** the wizard finalize deletes every finishable clean
  `pending_syncs` row per-file — checked and unchecked
  (`app/api/admin/onboarding/finalize/route.ts:707-712`; selector predicate at
  `:440-448`); a
  same-session rescan purges the session's `pending_syncs`,
  `pending_ingestions`, and manifest rows
  (`app/api/admin/onboarding/scan/route.ts:197-206` — NOT
  `deferred_ingestions`: a wizard-deferred file stays owned across
  same-session rescans by design, the admin deferred it); finalize-cas
  deletes the session's `deferred_ingestions`
  (`app/api/admin/onboarding/finalize-cas/route.ts:658-664`).
- **Reap scope caveat:** `reapStaleOnboardingSessions` explicitly EXCLUDES the
  active pointer session from its candidates
  (`lib/onboarding/sessionLifecycle.ts:955-966`, `is distinct from` the
  `app_settings` pointer), so the Reap button releases only NON-active
  sessions' rows — it is NOT the escape hatch for an abandoned active
  session.

**Abandoned-session wedge scope (accepted):** if the ACTIVE wizard session is
abandoned (pointer never cleared), its owned files stay cron-skipped until an
admin acts. Bounded and accepted because (a) only files the admin deliberately
staged in the wizard are affected, (b) every skip on a non-archived file
writes an operator-visible `sync_log` row (`skipped:wizard_owned`; see the
§2.4 DEF-4 archived-relabel interaction for the archived exception), and (c)
the escape hatches are the
ordinary admin flows — finish the wizard (finalize-cas), re-run setup (the
24h-stale takeover contract at `lib/onboarding/sessionLifecycle.ts:355`,
`:388`, `:430` lets a new scan claim a stale pending session — EXCEPT when a
finalize checkpoint with `batches_completed > 0` and status not
`final_cas_done` exists, where rotation is suppressed
(`lib/onboarding/sessionLifecycle.ts:285-295`) and the escape is the
dedicated abandoned-finalize cleanup (`cleanupAbandonedFinalize`,
`lib/onboarding/sessionLifecycle.ts:413`, admin route
`app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts`,
which rotates `app_settings` itself), or reset. A wedged cron sync is
strictly safer than the alternative this spec fixes (cron publishing
wizard-staged shows).

### 2.2 Guard-condition table (per input)

| Input state | Behavior |
| --- | --- |
| `pending_wizard_session_id` null (steady state) | No ownership reads beyond the single `app_settings` select; gate proceeds to existing checks. |
| `pending_wizard_session_id` set | Session treated as active — no gate-side staleness derivation (§2.1 "No gate-side staleness clock"). `pending_wizard_session_at` is NOT read by the gate. |
| `app_settings` `'default'` singleton row ABSENT | `SyncInfraError` (fail-loud) — WHEN the ownership read is reached. Per §2.3 ordering, a live-deferral skip short-circuits before the `app_settings` read, so a live-deferred file on a corrupted install still skips with its deferral reason (test 5's priority pin) and never probes the singleton. A missing singleton is a corrupted install, not "no session" — a benign no-session read would fail open and reopen the hijack path. Mirrors `lib/onboarding/sessionLifecycle.ts:331-334` (`OnboardingSessionInfraError` on missing default row). |
| Session set, no wizard row for `F` | Not owned → gate proceeds. Files the wizard didn't stage (e.g. non-sheet files, files added to Drive mid-session and not yet scanned) keep today's behavior. |
| Session set, wizard row for `F` in any of the three tables (matching `wizard_session_id = S` only — a row from a DIFFERENT session never matches) | `{ outcome: "skip", reason: "wizard_owned" }`. |
| `app_settings` / ownership read returns or throws an error | `SyncInfraError` (fail-loud, retried next tick) — never a silent proceed or silent skip. Same contract as the existing gate reads (`lib/sync/perFileProcessor.ts:24-36`, registry row `tests/sync/_metaInfraContract.test.ts:17-20`). |
| Non-automatic mode (`manual` / `onboarding_scan`) | Gate already returns `proceed` before any reads (`perFileProcessor.ts:170-172`); unchanged. |

### 2.3 Placement and ordering

Inside `perFileProcessor`, after the live-deferral check (`:175-183`) and
**before** the show/pending watermark reads (`:185-197`):

1. Existing `permanent_ignore` / `defer_until_modified` live-deferral skips
   keep priority (their reasons stay stable for operators).
2. Wizard-ownership check runs next. When owned, the gate returns before the
   `shows` / live-`pending_syncs` reads (saves them, and `wizard_owned` wins
   over `watermark` as the logged reason).
3. Otherwise the existing watermark logic runs unchanged.

### 2.4 Skip plumbing

- New member `"wizard_owned"` in the `PerFileProcessorResult` skip-reason union
  (`lib/sync/perFileProcessor.ts:8-22`).
- The generic consumption site `prepareProcessOneFile`
  (`lib/sync/runScheduledCronSync.ts:2786-2788`) already maps any gate skip to
  `{ outcome: "skipped", reason }`, which `logSync` writes as a `sync_log` row
  with `status = reason`, `message = "skipped:<reason>"`. No special-casing:
  unlike `ARCHIVED_SKIP_REASON` (silent, `:2662`), `wizard_owned` **does** log
  — operators must be able to see the stand-down in `pnpm observe synclog`.
- `sync_log.status` is unconstrained text and the observe CLI's `--status`
  flag is free-form (`scripts/observe/args.ts:103-104`), so no catalog,
  §12.4, or CLI change is needed. `wizard_owned` is a sync_log status token,
  not an error code; nothing user-facing renders it (invariant 5 untouched).
- **DEF-4 archived-relabel interaction (accepted):** `processOneFile` logs a
  non-archived gate skip only after an under-lock archived re-read
  (`lib/sync/runScheduledCronSync.ts:2658-2680`) — if the file's show became
  archived in the gap, the skip is relabeled to the SILENT
  `ARCHIVED_SKIP_REASON` and no sync_log row is written. A `wizard_owned`
  skip inherits this shared behavior unchanged (DEF-4's archived-immutable
  contract outranks the visibility contract, exactly as it does for
  `watermark` / `deferred_*` skips). "Every skip writes a sync_log row" in
  §2.1 is therefore scoped to non-archived files; the §4 log assertions seed
  fixtures with no `shows` row (the incident shape), which never hit the
  relabel branch.

### 2.5 Reads and clock

- One `app_settings` select per gated file (`pending_wizard_session_id`
  only), then — only when a session is pending — up to three existence probes
  (`select drive_file_id … .eq("drive_file_id", F).eq("wizard_session_id",
  S).limit(1).maybeSingle()` shape, matching the existing gate-read helpers).
  Steady-state overhead: +1 read per file per tick; wizard-active overhead:
  +4. No timestamp is read or parsed (§2.1 — no gate-side staleness clock).

### 2.6 Single guard layer (no defense-in-depth duplicate)

The check lives ONLY in `perFileProcessor`. phase1's `auto_publish_ready`
branch (`lib/sync/phase1.ts:525-541`) is NOT given a second copy: every path
that stages or applies (cron via `prepareProcessOneFile`, push via
`processOneFile`) runs the gate before any pipeline work, so a second holder of
the same decision would only add drift risk. The regression test (§4) pins the
behavior end-to-end instead.

**Push preflight ordering caveat:** on the push path,
`readPushDuplicatePreflight` runs BEFORE `processOneFile`
(`lib/sync/runPushSyncForShow.ts:283-292`) and can short-circuit with
`WEBHOOK_NOOP_ALREADY_SYNCED`. That preflight skip performs no staging or
apply work, so it is NOT a bypass of this guard — a wizard-owned file that the
preflight skips is simply not processed at all. The
`wizard_owned`-beats-`watermark` ordering claim in §2.3 is scoped to WITHIN
`perFileProcessor`; on push, an already-synced duplicate may log
`WEBHOOK_NOOP_ALREADY_SYNCED` instead of `wizard_owned` (accepted — reason
labeling only, no behavioral hole).

### 2.7 Accepted race window (documented, not fixed)

A wizard session that starts mid-cron-tick can still interleave on a file the
tick already gated (gate ran before the scan staged the row). Advisory locks
serialize the actual writes; the exposure shrinks from the full 5-minute
cadence to the gate→lock interval of a single in-flight file. Same class as
"file added to Drive mid-wizard"; out of scope.

## 3. Explicitly out of scope

- Validation cleanup: re-running the Settings → validation reset after merge
  wipes the 7 cron-published shows (including the 2 unchecked ones).
- `pending_wizard_session_id` remaining set after finalize until the Finish
  step (finalize-cas `promoteSettings`, `finalize-cas/route.ts:673-687`), a
  setup-rerun takeover, or `cleanupAbandonedFinalize` — by design. The reap
  never touches the active pointer (§2.1 reap scope caveat).
- Files added to Drive mid-wizard that the scan never staged: cron may still
  auto-publish them. Pre-existing behavior; not made worse by this change.
- The `auto_publish_clean_first_seen` flag semantics themselves.

## 4. Tests (TDD)

Extend `tests/sync/perFileProcessor.test.ts` (existing FakeDb harness with
`shows` / `pending_syncs` / `deferred_ingestions` tables; add `app_settings`
and `pending_ingestions`):

1. **Owned via `pending_syncs`** — active session + wizard-partition row →
   `{ outcome: "skip", reason: "wizard_owned" }`; concrete failure mode
   caught: the validation incident (cron auto-publish of a wizard-staged
   sheet).
2. **Owned via `pending_ingestions`** and **via `deferred_ingestions`** — one
   test per arm (failure mode: cron re-ingesting a wizard hard-fail /
   session-deferred file).
3. **Not owned: no session** — `app_settings` row with null
   `pending_wizard_session_id` → proceeds to watermark logic; asserts NO
   ownership-probe queries were issued (failure mode: steady-state read
   amplification / accidental skip).
4. **Not owned: rows belong to a different session** — wizard rows with a
   non-matching `wizard_session_id` → proceeds (failure mode: stale sibling
   session freezing cron).
4b. **No stale-clock regression** — owned row with
   `app_settings.pending_wizard_session_at` seeded 25h in the past → STILL
   `{ outcome: "skip", reason: "wizard_owned" }` (failure mode: an
   implementation reintroducing the rejected gate-side staleness clock and
   releasing ownership on a reused long-lived session — the exact §2.1 R2
   hijack). Paired with a source-scan assertion in the
   `_partitionScopeContract.test.ts` extension (§5) that
   `lib/sync/perFileProcessor.ts` never references
   `pending_wizard_session_at`.
5. **Live-deferral priority** — file both live-deferred (`permanent_ignore`)
   and wizard-owned → reason stays `deferred_permanent` (ordering pin).
6. **Ownership beats watermark (ordering pin)** — file wizard-owned AND
   watermark-skippable (a `shows` row whose `last_seen_modified_time` is at or
   after `fileMeta.modifiedTime`) → reason is `wizard_owned`, NOT `watermark`
   (failure mode: an implementation that places the ownership check after the
   watermark reads passes the incident-shape tests but loses the ordering /
   operator-visibility contract of §2.3).
7. **Missing `app_settings` singleton** — empty `app_settings` table →
   rejects with `SyncInfraError` (failure mode: corrupted install failing open
   into the hijack path).
8. **Push mode is gated too** — `perFileProcessor(F, "push", meta)` with an
   owned row → `{ outcome: "skip", reason: "wizard_owned" }` (failure mode:
   an implementation gating only cron leaves the webhook path able to process
   wizard-owned files whenever the push duplicate-preflight proceeds,
   `lib/sync/runPushSyncForShow.ts:283-303`).
9. **`wizard_owned` writes a sync_log row (not archived-style silent)** — the
   regression case in item 11 runs through `processOneFile` with an injected
   `logSync` sink. NOTE the boundary shape: the internal `logSync` wrapper
   converts the result's `reason` into `SyncLogEntry.code` before invoking the
   injected sink (`lib/sync/runScheduledCronSync.ts:2183-2202`, mapping at
   `:2197-2198`; `SyncLogEntry` type at `:431-446`). The assertion is
   therefore on the entry object the sink receives:
   `{ driveFileId: F, outcome: "skipped", code: "wizard_owned" }` (assert on
   the entry payload, not a call count — anti-tautology). Failure mode: an
   implementation special-casing the new reason into the
   `ARCHIVED_SKIP_REASON` silent branch (`lib/sync/runScheduledCronSync.ts:
   2662`) passes the gate-level tests while making the accepted
   abandoned-session wedge invisible to operators.
10. **Infra contract** — extend the behavioral cases in
   `tests/sync/_metaInfraContract.test.ts:496-511`: returned-error AND
   thrown-error cases for the `app_settings` read and for EACH of the three
   ownership probes (`pending_syncs`, `pending_ingestions`,
   `deferred_ingestions`) — 8 cases total — each rejecting with
   `SyncInfraError` (failure mode: a returned error on any single probe table
   collapsing into a benign "not owned" → the race reopens silently while the
   other tables' tests pass; invariant 9 applies per read boundary).
11. **Regression (integration, the incident shape)** — through
   `processOneFile` (which runs `prepareProcessOneFile` → the real
   `perFileProcessor`) against the fake Supabase, with an injected `logSync`:
   active wizard session + wizard-staged file + no `shows` row → the returned
   result is `{ outcome: "skipped", reason: "wizard_owned" }` AND the injected
   `logSync` sink received the mapped entry
   `{ driveFileId: F, outcome: "skipped", code: "wizard_owned" }` (the
   operator-visibility assertion of item 9 — `reason` becomes `code` at the
   boundary, `lib/sync/runScheduledCronSync.ts:2197-2198`). Failure mode: gate
   bypassed by the cron pipeline plumbing, or the skip silenced.
   Anti-tautology: asserts on the returned result object and the received
   entry object, not on mock call counts.

Expected values derive from the seeded fixture rows (session UUIDs, timestamps
relative to a fixed `nowMs`), never hardcoded date literals.

## 5. Meta-test inventory

- `tests/sync/_metaInfraContract.test.ts` — **extended** (behavioral cases for
  the new reads; the module-level registry row `perFileProcessor` at `:17-20`
  already covers the surface).
- `tests/sync/_partitionScopeContract.test.ts` — **extended** (mandatory).
  Its first test (`:17-24`) pins `perFileProcessor`'s `pending_syncs` SELECT
  as live-scoped via a first-occurrence `indexOf` — too weak once the file
  gains wizard-scoped reads. Extend it to pin the FULL partitioned-read
  topology across all three partition-carrying tables: enumerate every
  `.from("pending_syncs")`, `.from("pending_ingestions")`, and
  `.from("deferred_ingestions")` occurrence in
  `lib/sync/perFileProcessor.ts`; assert the expected counts
  (`pending_syncs`: 2 — live watermark read + ownership probe;
  `deferred_ingestions`: 2 — live deferral read + ownership probe;
  `pending_ingestions`: 1 — ownership probe only) and that each occurrence is
  followed (within its own builder chain) by exactly one of
  `.is("wizard_session_id", null)` (live-scoped) or
  `.eq("wizard_session_id", <session>)` (wizard-scoped ownership probe). An
  unscoped read (neither filter) must fail the meta-test. Additionally assert
  the source never references `pending_wizard_session_at` (structural pin for
  the no-gate-side-staleness-clock decision, §2.1 / test 4b).
- Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) —
  **none applies**: the gate is pre-lock and read-only; no `pg_advisory*`
  surface touched.
- Supabase auth meta-registry (`tests/auth/_metaInfraContract.test.ts`) —
  **none applies**: no auth helper touched.
- Mutation-surface observability (invariant 10) — **none applies**: no new
  mutation surface; the gate only reads.

## 6. Watchpoints (do-not-relitigate preempts)

- **Single-layer guard** (§2.6) is a ratified owner decision; do not
  relitigate adding a phase1 duplicate.
- **Row-existence over manifest membership** (§2.1) is ratified; the
  abandoned-session freeze is the documented reason.
- **No gate-side staleness clock** (§2.1, R2 amendment): the session
  lifecycle transitions (finalize-cas, setup-rerun takeover,
  `cleanupAbandonedFinalize`, reap for non-active sessions) are the only
  release authorities; do not demand the gate re-derive staleness from
  `pending_wizard_session_at` (that clock diverges from the six-table
  freshest-activity contract and reopens the hijack) nor from a replicated
  freshest-activity aggregate (a second holder of the lifecycle decision).
  The abandoned-session wedge scope is documented and accepted in §2.1.
- **`wizard_owned` logs a sync_log row** deliberately (unlike the archived
  silent skip): operator visibility requirement.
