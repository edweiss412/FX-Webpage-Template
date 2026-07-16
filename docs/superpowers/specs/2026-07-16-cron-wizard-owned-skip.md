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
- the session is **not stale**. Stale is a strict older-than, exactly mirroring
  the `sessionLifecycle.ts` contract (`pending_wizard_session_at < now() -
  interval '24 hours'` at `lib/onboarding/sessionLifecycle.ts:355`, `:388`,
  `:430`): the session is active iff `pending_wizard_session_at >= now - 24h`
  (a timestamp exactly 24h old is still ACTIVE — the boundary releases only
  strictly past it, so the gate never releases ownership while sessionLifecycle
  still treats the session as not stale), AND
- at least one wizard-partition row exists for `(F, S)` in any of:
  - `pending_syncs` (staged preview awaiting step-3 review),
  - `pending_ingestions` (wizard hard-fail awaiting a sheet fix),
  - `deferred_ingestions` (session-scoped defer decision).

All three tables carry a nullable `wizard_session_id` column (the wizard
partition discriminator used throughout `lib/sync` — e.g.
`lib/sync/runScheduledCronSync.ts:954`, `:984`, `:1293`).

**Why row-existence, not `onboarding_scan_manifest` membership:** pending-row
ownership releases naturally when the wizard finalize consumes the row
(`app/api/admin/onboarding/finalize/route.ts:707-712` deletes approved
`pending_syncs` rows), so cron resumes normal update syncing for published
shows immediately, even while the wizard tab stays open. Manifest membership
would hold ownership until session teardown and could freeze live-show syncing
for up to the 24h reap on an abandoned session.

### 2.2 Guard-condition table (per input)

| Input state | Behavior |
| --- | --- |
| `pending_wizard_session_id` null (steady state) | No ownership reads beyond the single `app_settings` select; gate proceeds to existing checks. |
| `pending_wizard_session_id` set, `pending_wizard_session_at` null | Treated as **active** (fail-safe toward protecting the wizard). Cannot occur via current writers — id and at are always set together (`lib/onboarding/sessionLifecycle.ts:323-324`, `:350-351`, `:645-646`; `app/api/admin/onboarding/scan/route.ts:184-189`) and cleared together (`app/api/admin/onboarding/finalize-cas/route.ts:682-683`). |
| Session set but stale (strictly older than 24h) | Not active → gate proceeds. The session reap owns cleanup; cron must not stay wedged behind an abandoned session. |
| `app_settings` `'default'` singleton row ABSENT | `SyncInfraError` (fail-loud). A missing singleton is a corrupted install, not "no session" — a benign no-session read would fail open and reopen the hijack path. Mirrors `lib/onboarding/sessionLifecycle.ts:331-334` (`OnboardingSessionInfraError` on missing default row). |
| Session active, no wizard row for `F` | Not owned → gate proceeds. Files the wizard didn't stage (e.g. non-sheet files, files added to Drive mid-session and not yet scanned) keep today's behavior. |
| Session active, wizard row for `F` in any of the three tables | `{ outcome: "skip", reason: "wizard_owned" }`. |
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

### 2.5 Reads and clock

- One `app_settings` select per gated file
  (`pending_wizard_session_id, pending_wizard_session_at`), then — only when a
  session is active — up to three existence probes (`select drive_file_id …
  .eq("drive_file_id", F).eq("wizard_session_id", S).limit(1).maybeSingle()`
  shape, matching the existing gate-read helpers). Steady-state overhead:
  +1 read per file per tick; wizard-active overhead: +4.
- Staleness is compared **JS-side** (`Date.now()` vs the parsed
  `pending_wizard_session_at`), consistent with the gate's existing JS-side
  timestamp comparisons (`timestampMs` / `isAfter`,
  `lib/sync/perFileProcessor.ts:60-78`). Clock drift between app and DB is
  bounded by minutes against a 24-hour window — accepted.

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
  step / reap — by design (`finalize-cas/route.ts:682-686` clears it).
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
4. **Not owned: stale session** — `pending_wizard_session_at` 25h old →
   proceeds (failure mode: abandoned session wedges cron for good).
5. **Not owned: rows belong to a different session** — wizard rows with a
   non-matching `wizard_session_id` → proceeds (failure mode: stale sibling
   session freezing cron).
6. **Boundary: `pending_wizard_session_at` null with id set** → treated
   active → skip (fail-safe branch).
7. **Live-deferral priority** — file both live-deferred (`permanent_ignore`)
   and wizard-owned → reason stays `deferred_permanent` (ordering pin).
7b. **Ownership beats watermark (ordering pin)** — file wizard-owned AND
   watermark-skippable (a `shows` row whose `last_seen_modified_time` is at or
   after `fileMeta.modifiedTime`) → reason is `wizard_owned`, NOT `watermark`
   (failure mode: an implementation that places the ownership check after the
   watermark reads passes the incident-shape tests but loses the ordering /
   operator-visibility contract of §2.3).
7c. **Stale boundary is strict** — `pending_wizard_session_at` exactly 24h old
   (relative to the fixed test clock) → still ACTIVE → skip; strictly older →
   proceeds (failure mode: a `>=`-stale JS boundary releasing ownership while
   `sessionLifecycle` still treats the session as not stale).
7d. **Missing `app_settings` singleton** — empty `app_settings` table →
   rejects with `SyncInfraError` (failure mode: corrupted install failing open
   into the hijack path).
8. **Infra contract** — extend the behavioral cases in
   `tests/sync/_metaInfraContract.test.ts:496-511`: returned-error and
   thrown-error on the `app_settings` read and on an ownership probe each
   reject with `SyncInfraError` (failure mode: infra fault collapsing into a
   benign proceed → the race reopens silently).
9. **Regression (integration, the incident shape)** — via
   `prepareProcessOneFile` with the real `perFileProcessor` against the fake
   Supabase: active wizard session + wizard-staged file + no `shows` row →
   result is `{ kind: "skip", result: { outcome: "skipped", reason:
   "wizard_owned" } }` (failure mode: gate bypassed by the cron pipeline
   plumbing). Anti-tautology: asserts on the returned result object, not on a
   mock's call count.

Expected values derive from the seeded fixture rows (session UUIDs, timestamps
relative to a fixed `nowMs`), never hardcoded date literals.

## 5. Meta-test inventory

- `tests/sync/_metaInfraContract.test.ts` — **extended** (behavioral cases for
  the new reads; the module-level registry row `perFileProcessor` at `:17-20`
  already covers the surface).
- `tests/sync/_partitionScopeContract.test.ts` — **extended** (mandatory).
  Its first test (`:17-24`) pins `perFileProcessor`'s `pending_syncs` SELECT
  as live-scoped via a first-occurrence `indexOf` — too weak once the file
  gains a second, wizard-scoped `pending_syncs` read. Extend it to pin the
  DUAL topology: enumerate every `.from("pending_syncs")` occurrence in
  `lib/sync/perFileProcessor.ts`; assert the expected count (2) and that each
  is followed (within its own builder chain) by exactly one of
  `.is("wizard_session_id", null)` (the live watermark read) or
  `.eq("wizard_session_id", <session>)` (the ownership probe). An unscoped
  probe (neither filter) must fail the meta-test.
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
- **JS-side staleness clock** (§2.5) follows the file's existing
  `timestampMs` precedent; do not demand SQL `now()` here.
- **`wizard_owned` logs a sync_log row** deliberately (unlike the archived
  silent skip): operator visibility requirement.
