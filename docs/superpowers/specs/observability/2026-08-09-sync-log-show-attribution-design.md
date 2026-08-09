<!-- spec-lint: not-ui — no UI surface: sink SQL, a cron-sync writer, two indexes, a prune function, and tests. The app/ paths cited are context for a decision NOT to build UI (§1.1), not deliverables. impeccable-gate: N/A. -->

# Sync-log show attribution, duration, indexing, and retention

**Date:** 2026-08-09
**Status:** DESIGN
**Closes:** `BL-ADMIN-PER-SHOW-HISTORY` (BACKLOG.md)
**Branch:** `fix/sync-log-show-id-duration`

---

## 1. Problem

`pnpm observe synclog --show <uuid>` is a shipped, documented developer command (`docs/agents/observe-cli.md:20`). It returns nothing, for every show, always — not because shows are healthy, but because the writer that produces nearly every row never records which show the attempt belonged to.

**Probe (2026-08-09, local DB):**

```
$ psql -c "select count(*) as total, count(show_id) as with_show from public.sync_log;"
 total | with_show
-------+-----------
  5073 |         0

$ pnpm observe synclog --show 3a03b41a-6c8b-49e4-b656-db0ffb93323b --since all --limit 5
(no rows)
```

The failure mode is silent-wrong-answer, not error: an empty result is indistinguishable from "this show has had no trouble." A developer asking "has this show been failing quietly?" through the documented interface is told no.

This is a **defect against the ratified spec**, not a feature request. Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:445-453` defines `sync_log` with `show_id uuid references shows(id) on delete cascade` and `duration_ms int`. The live DDL matches (`supabase/migrations/20260501001000_internal_and_admin.sql:221-230`, `show_id` at `supabase/migrations/20260501001000_internal_and_admin.sql:223`, `duration_ms` at `supabase/migrations/20260501001000_internal_and_admin.sql:228`). Neither column is populated by the routine writer; `duration_ms` is populated by **no** writer anywhere in the codebase. Under AGENTS.md rule 7 (spec is canonical), the implementation is out of conformance.

Two secondary defects on the same table, both real independent of any read surface:

- **No index.** `public.sync_log` has no index beyond its primary key. Per-show and per-file lookups are sequential scans over a monotonically growing table.
- **No retention.** No pruning exists. `prune_app_events` covers `app_events` at 60 days (`supabase/migrations/20260629000002_app_events.sql:32`); nothing covers `sync_log`.

### 1.1 Resolved scope — do not relitigate

Each decision below is settled. Cited ratification, not re-derivation.

| Decision | Ratification |
| --- | --- |
| **No new admin UI section.** Sync-attempt history is not surfaced on the show page (`app/admin/_showReviewModal.tsx` / `components/admin/showpage/PublishedReviewModal.tsx`). Attempt history is a developer instrument; the operator's need is served by the status strip, documented at `app/help/admin/per-show-panel/page.mdx:26-28`. | User decision, this arc. Supersedes the `BL-ADMIN-PER-SHOW-HISTORY` body's "add two new sections to the per-show panel" scope. |
| **No telemetry-page surface.** `/admin/dev/telemetry` reads `app_events` (`lib/admin/loadAppEvents.ts`). Per-attempt sync outcomes never reach `app_events` — the per-outcome sink is `sync_log` exclusively. Wiring this into telemetry is a new build, not a wiring job. | User decision, this arc; store separation confirmed by the `BL-ADMIN-PER-SHOW-HISTORY` store-correction stamp dated 2026-08-06. |
| **The developer surface is the existing CLI.** `pnpm observe synclog` already filters by `showId` / `driveFileId` / `status` / `sinceHours` (`lib/observe/query/types.ts:127-134`) and already selects and renders `duration_ms` (`lib/observe/query/syncLog.ts:47`; `scripts/observe/format.ts:115`). This spec adds **no read-side code**. | Read path verified this arc; see §4. |
| **`show_id` stays nullable.** Several attempt classes are legitimately show-less: first-seen sheets with no `shows` row, lock-contended skips, run-level entries with `driveFileId: null`, and onboarding/session-lifecycle rows. | DDL already nullable (`20260501001000_internal_and_admin.sql:223`); §3.2 enumerates the classes. |
| **Pruning `sync_log` discards nothing anyone is keeping.** `sync_audit` is the durable record of what was applied to a show (`20260501001000_internal_and_admin.sql:204-217`) and is **not** pruned by this change. Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:986` describes `sync_log` as "per-attempt and not surfaced as an alert"; `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:182` describes its rows as single-attempt outcomes distinct from show-level status. | Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:182`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:986`. |
| **Threading `showId` through every `logSync` call site is rejected.** It is a partial fix that reproduces the original defect at smaller scale. See §3.1. | This spec, §3.1. |

---

## 2. Goal and acceptance posture

**Goal.** Every `sync_log` row that *can* name its show does; every row records how long the attempt took; per-show and per-file lookups are indexed; the table stops growing without bound.

**Acceptance posture.** Consistent with the preparedness-audit posture (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`): an attempt is either attributed correctly or is *structurally* unattributable (§3.2 enumerates those classes exhaustively) — never silently mis-attributed, and never attributable-but-dropped. A NULL `show_id` on a row from an enumerated show-less class is correct behavior, not a gap.

### Acceptance criteria

- **AC-1.** A sync attempt processed through the cron sink for a drive file with a live `shows` row writes a `sync_log` row whose `show_id` is that show's id.
- **AC-2.** `querySyncLog({ showId })` returns those rows. (This is the probe in §1, executable.)
- **AC-3.** An attempt for a drive file with no `shows` row writes a row with `show_id IS NULL` and does not fail.
- **AC-4.** A run-level entry (`driveFileId: null`) writes a row with `show_id IS NULL` and does not fail.
- **AC-5.** Where a call site already holds an authoritative show id, that value is used verbatim — the fallback lookup never overrides it.
- **AC-6.** Every `sync_log` row written through the cron sink or the recovery sink carries a non-null `duration_ms` reflecting the attempt's elapsed milliseconds.
- **AC-7.** `public.sync_log` and `dev.sync_log` each carry a `(show_id, occurred_at desc)` index and a `(drive_file_id, occurred_at desc)` index.
- **AC-8.** `prune_sync_log(retain interval default interval '60 days')` exists with the same security posture as `prune_app_events`, is scheduled via `pg_cron`, and the job name is registered in the cron-coverage gate.
- **AC-9.** `BL-ADMIN-PER-SHOW-HISTORY` is archived, with the UI half recorded as a decision rather than a debt.

---

## 3. Design

### 3.1 Show attribution resolves at the sink, not at the call sites

**The rejected approach.** `SyncLogEntry` (`lib/sync/runScheduledCronSync.ts:446-456`) carries `driveFileId`, `outcome`, `code?`, `payload?`, `parseWarnings?` — no show field. The obvious fix is to add one and thread it through. Enumerating the `logSync` call sites shows why that fails:

| Call site | Outcome | Show id in lexical scope? |
| --- | --- | --- |
| `lib/sync/runScheduledCronSync.ts:2425` | applied (phase-2 tail) | **Yes** — `args.result.showId` |
| `lib/sync/runScheduledCronSync.ts:3408` | hard_fail | **Yes** — `phase1.showId ?? null` |
| `lib/sync/runScheduledCronSync.ts:3443` | shrink_held | **Yes** — `phase1.showId ?? null` |
| `lib/sync/runScheduledCronSync.ts:2742` | skip (`processOneFile`) | No — result carries none |
| `lib/sync/runScheduledCronSync.ts:2761` | CONCURRENT_SYNC_SKIPPED | No — lock contended, no tx |
| `lib/sync/runScheduledCronSync.ts:3316` | drift_recheck_failed | No — result carries none |
| `lib/sync/runScheduledCronSync.ts:3323` | locked deferral skip | No — `{outcome, reason}` only |
| `lib/sync/runScheduledCronSync.ts:3328` | prepared skip | No — variant carries none |
| `lib/sync/runScheduledCronSync.ts:3332` | asset_recovery | No — variant carries none |
| `lib/sync/runScheduledCronSync.ts:3336` | revision_race_cooldown | No — variant carries none |
| `lib/sync/runScheduledCronSync.ts:3341` | revision_race | No — variant carries none |
| `lib/sync/runScheduledCronSync.ts:3469` | stage | No — `{outcome, triggeredReviewItems, stagedId}` |
| `lib/sync/runScheduledCronSync.ts:3474` | defer | No — `{outcome, reason}` only |
| `lib/sync/runScheduledCronSync.ts:3632` | stale | No — `{outcome, code}` only |

Three of fourteen have it. Threading would make some attempts findable by show and leave the rest invisible — the same "empty result reads as healthy" defect, at smaller scale and harder to notice. It also cannot hold: `logSync` (`lib/sync/runScheduledCronSync.ts:2231-2251`) constructs the entry internally from `driveFileId` and `result` alone, so every future call site inherits the gap by default.

**The chosen approach.** `makePostgresSyncLogSink` (`lib/sync/syncLog.ts:39-48`) receives `driveFileId` on every write. Because `shows.drive_file_id` is `text not null unique` (`supabase/migrations/20260501000000_initial_public_schema.sql:5`), the show id is derivable there with a single unique-index lookup:

```sql
insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings, duration_ms)
values (
  coalesce($1::uuid, (select id from public.shows where drive_file_id = $2)),
  $2, $3, $4, $5::jsonb, $6
)
```

Properties this buys:

- **One change point.** No per-site audit, and a new `logSync` call site is attributed by construction rather than by remembering to thread a parameter.
- **Explicit wins.** The `coalesce` first argument is the optional explicit show id. Where a site holds an authoritative value it is used verbatim (AC-5). This matters for the first-seen `applied` path, where the `shows` row may be written inside the cron's still-open transaction while the sink writes on its own connection (`lib/sync/syncLog.ts:50-58` opens a fresh `postgres` client per call) and would therefore not see it. `lib/sync/runScheduledCronSync.ts:2425` holds `args.result.showId` for exactly that case.
- **Correct NULLs.** A drive file with no `shows` row yields NULL from the subselect, which is the right answer (AC-3).

`insertSyncLog` (`lib/sync/runScheduledCronSync.ts:1214-1232`) — the recovery/manual sink, already accepting `showId?: string | null` per its interface at `lib/sync/runScheduledCronSync.ts:490` — gains the same `coalesce` fallback so a caller that passes no show id still gets attribution.

### 3.2 Structurally unattributable classes (exhaustive)

These write `show_id IS NULL` by design. This list is the accept-set: anything not on it must attribute.

| Class | Site | Why unattributable |
| --- | --- | --- |
| Run-level entries | `runScheduledCronSync.ts:3780`, `lib/sync/runScheduledCronSync.ts:3796` | `driveFileId: null` — the entry describes the run, not a file. |
| Escaped-throw catch | `runScheduledCronSync.ts:3953` | Emitted outside any file's resolved context. |
| First-seen sheets | `lib/sync/runScheduledCronSync.ts:3469` stage, `lib/sync/runScheduledCronSync.ts:3328` prepared skip | No `shows` row exists yet by definition. |
| Onboarding scan | `lib/sync/runOnboardingScan.ts:662` | Wizard-partition candidate files, pre-promotion. |
| Session lifecycle | `lib/onboarding/sessionLifecycle.ts:306` (and :397, :634) | Session-scoped, not show-scoped; these write neither `show_id` nor `drive_file_id`. |

The last row is why the CLI's file column renders `-` for the bulk of today's rows (`scripts/observe/format.ts:115` renders `r.driveFileId ?? "-"`).

### 3.3 Duration

No elapsed-time measurement exists anywhere in the per-file scope. `processOneFile` (`lib/sync/runScheduledCronSync.ts:2707`) wraps one drive file's entire attempt and is the correct boundary.

Capture the start there using the existing injectable clock `ProcessOneFileDeps.now?: () => Date` (`lib/sync/runScheduledCronSync.ts:568`, already used at `lib/sync/runScheduledCronSync.ts:3484`) rather than raw `Date.now()` — the clock is injectable and therefore testable.

**How it reaches the writer.** `logSync` (`lib/sync/runScheduledCronSync.ts:2231-2251`) takes `SyncLogDeps` (`lib/sync/runScheduledCronSync.ts:2218-2220`), a narrow structural type currently holding only `logSync?`. Widen it with an optional `attemptStartedAtMs?: number`, and set that field on `ProcessOneFileDeps` in `processOneFile`. Propagation is already guaranteed: the object actually passed at the in-transaction call sites is the locally-constructed `txDeps = txBoundProcessDeps(tx, deps)` (`lib/sync/runScheduledCronSync.ts:3298`), and `txBoundProcessDeps` (`lib/sync/runScheduledCronSync.ts:2301-2305`) returns a `ProcessOneFileDeps` — either `deps` verbatim (`lib/sync/runScheduledCronSync.ts:2306`) or a derivation of it — so a new field on `ProcessOneFileDeps` reaches every site without touching any call site. `logSync` computes the delta and sets it on the entry; the sink writes it to `duration_ms`.

Note this is deliberately NOT the outer `txDeps` parameter of type `SyncPipelineTxBoundDeps` (`lib/sync/runScheduledCronSync.ts:457-459`, `{ upsertAdminAlert }` only) — that type carries no `logSync` and is shadowed at `lib/sync/runScheduledCronSync.ts:3298`. Confusing the two would produce a change that typechecks and silently writes nothing, because `logSync?` is optional and `deps.logSync?.(entry)` would no-op.

Guard conditions:

- **Start absent** (a deps object constructed without it, e.g. an older test double): `duration_ms` is NULL. Never a throw, never a negative, never `NaN`.
- **Direct `deps.logSync?.({...})` calls** at `lib/sync/runScheduledCronSync.ts:3780`, `lib/sync/runScheduledCronSync.ts:3796`, `lib/sync/runScheduledCronSync.ts:3953` bypass the `logSync` helper: NULL by design, consistent with §3.2.
- **Clock non-monotonic** (injected clock moving backwards in a test): clamp at 0 rather than persisting a negative.

No read-side work is required: `querySyncLog` already selects and maps it (`lib/observe/query/syncLog.ts:47`; type at `lib/observe/query/types.ts:143`) and the CLI already renders a duration column (`scripts/observe/format.ts:115`).

### 3.4 Indexes

```sql
create index if not exists sync_log_show_id_idx       on public.sync_log (show_id, occurred_at desc);
create index if not exists sync_log_drive_file_id_idx on public.sync_log (drive_file_id, occurred_at desc);
```

Shape and naming mirror the established convention for this exact access pattern: `sync_audit_show_id_idx on public.sync_audit (show_id, applied_at desc)` (`20260501001000_internal_and_admin.sql:218`), `reports_show_id_idx ... (show_id, created_at desc)` (`supabase/migrations/20260501001000_internal_and_admin.sql:323`), and `app_events_show_id_idx on public.app_events (show_id, occurred_at desc)` (`20260629000002_app_events.sql:19`). `if not exists` follows the newer-migration convention (`supabase/migrations/20260629000002_app_events.sql:19-21`).

The `drive_file_id` companion is included because `--file` is the flag that works *today* and is equally unindexed; leaving it out would fix the broken query path and leave the working one slow.

### 3.5 Retention

`prune_sync_log(retain interval default interval '60 days')` mirrors `prune_app_events` (`20260629000002_app_events.sql:32-63`) exactly: `returns integer`, `language sql`, `security definer`, `set search_path = public, pg_temp`, body deleting `where occurred_at < now() - retain` and returning the deleted count. Grants mirror `supabase/migrations/20260629000002_app_events.sql:44-45` — `revoke all from public, anon, authenticated`, `grant execute to service_role`.

Scheduling mirrors `supabase/migrations/20260629000002_app_events.sql:53-63`: a self-guarded `do $$ ... $$` block that unschedules any existing job of the same name before `cron.schedule`, so re-applying the migration is idempotent. Job name `sync_log_prune`, on an off-peak minute distinct from `app_events_prune`'s `17 4 * * *`.

**Gate coupling:** `sync_log_prune` sits outside the `fxav_cron_` prefix, exactly like `app_events_prune`, so it MUST be added to `EXPECTED_NON_FXAV_NON_ORPHAN_CRONS` (`tests/cross-cutting/pg-cron-coverage.test.ts:107`, currently `["app_events_prune"]`) in the same commit as the migration, or that gate fails.

---

## 4. Tier × layer completeness matrix

Every affected layer gets an action or an explicit N/A.

| Layer | Action |
| --- | --- |
| Table DDL — `public.sync_log` | No column change. Columns already exist (`supabase/migrations/20260501001000_internal_and_admin.sql:221-230`). Two indexes added. |
| Table DDL — `dev.sync_log` | Same two indexes. Clone at `20260502000000_dev_schema_clone.sql:300-309`; `duration_ms` at `supabase/migrations/20260502000000_dev_schema_clone.sql:307`. Precedent for altering both in one migration: `20260702120200_drive_file_id_nonblank.sql:69-70` (public) + `supabase/migrations/20260702120200_drive_file_id_nonblank.sql:95-96` (dev). `tests/db/schema.test.ts:293-303` pins that the dev block use `alter table if exists dev.<t>`. |
| Inline CHECK | N/A — no CHECK changes. `sync_log_drive_file_id_nonblank` (`20260702120200_drive_file_id_nonblank.sql:69-70`) is unaffected; nothing here writes `drive_file_id`. |
| RLS / grants | N/A — unchanged. `admin_only` policy at `20260501002000_rls_policies.sql:67-70`; the Aug-3 lockdown revoked only INSERT/UPDATE/DELETE (`20260803000000_lockdown_admin_only_tables.sql:46`), leaving SELECT granted. |
| DB function | New: `prune_sync_log`. SECURITY DEFINER, `search_path = public, pg_temp`, service_role-only execute. |
| pg_cron | New job `sync_log_prune`; registered in `tests/cross-cutting/pg-cron-coverage.test.ts:107`. |
| Write path — cron sink | `lib/sync/syncLog.ts:39-48` gains `show_id` (coalesce + subselect) and `duration_ms`. |
| Write path — recovery sink | `lib/sync/runScheduledCronSync.ts:1214-1232` gains the coalesce fallback and `duration_ms`. |
| Write path — timing | `processOneFile` (`lib/sync/runScheduledCronSync.ts:2707`) captures start via `deps.now`; `logSync` (`lib/sync/runScheduledCronSync.ts:2231-2251`) computes the delta. |
| Read path — query core | N/A — `lib/observe/query/syncLog.ts` already selects both columns (`lib/observe/query/syncLog.ts:7`, `lib/observe/query/syncLog.ts:47`). |
| Read path — CLI | N/A — `scripts/observe/format.ts:115` already renders duration. |
| Frontend | N/A — no UI surface. Invariant 8 (impeccable dual-gate) does not apply. |
| Schema manifest | `pnpm gen:schema-manifest` re-run and committed. An index does **not** change the manifest; the new `prune_sync_log` function **does** (cf. the `prune_app_events` signature at `supabase/__generated__/schema-manifest.json:36`). |
| Validation project | Migration applied surgically per the `validation-schema-parity` discipline. |
| Docs | `docs/agents/observe-cli.md` — no flag change; add a note that `--show` attributes from the sink. `BACKLOG.md` entry archived. |

### Invariant conformance

| Invariant | Disposition |
| --- | --- |
| 1 — TDD per task | Honored. Entry point in §5. |
| 2 — Per-show advisory lock | **No new lock holder.** `writeSyncLog` (`lib/sync/syncLog.ts:50-58`) opens its own `postgres` connection and runs outside the cron's locked transaction. The added subselect reads committed `shows` state on that separate connection. The single-holder topology pinned by `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched. |
| 3 — Email canonicalization | N/A — no email boundary. |
| 4 — No global sync cursor | N/A — no cursor reference added. |
| 5 — No raw error codes in UI | N/A — no UI surface. `sync_log.status` is an unconstrained internal string, never crew-facing. |
| 6 — Commit per task | Honored. |
| 7 — Spec is canonical | This change moves the implementation **toward** master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:445-453`, which is the entire justification. |
| 8 — UI quality gate | `impeccable-gate: N/A — no UI surface` |
| 9 — Supabase call-boundary | N/A on the write path — the sink uses raw `postgres`, not a Supabase client. The read path (`lib/observe/query/syncLog.ts:35`) already conforms and is unchanged. |
| 10 — Mutation surface instrumented | N/A — no new HTTP route and no new `"use server"` action. |
| 11 — Isolated worktree | Honored: `../FX-worktrees/sync-log-show-id-duration`. |
| 12 — Ledger declares work in flight | Honored: `BL-ADMIN-PER-SHOW-HISTORY` marked IN PROGRESS, branch pushed. |

---

## 5. Testing

**The regression test that matters** is the §1 probe made executable: write attempts through the cron sink for a drive file with a known `shows` row, then assert `querySyncLog({ showId })` returns them. That is the assertion whose absence let this ship. It must derive the expected show id from the fixture, never hardcode it.

**Anti-tautology.** Each assertion must fail for the right reason:

- Attribution is asserted against the **row read back from the DB**, not against the parameter array passed to the sink — a parameter-shape assertion passes even if the SQL never binds the value.
- The NULL cases (§3.2) are asserted as *positively* NULL for a file with no `shows` row, not merely "did not throw."
- The explicit-wins case (AC-5) requires a fixture where the explicit id and the lookup would resolve **differently**, otherwise the test cannot distinguish coalesce order from either branch alone.
- Duration is asserted against an injected clock with a known delta, not `> 0` — a `> 0` assertion passes on a wall-clock read that ignores the injected start.

**Premise guards.** Per `BL-GUARD-PREMISE-REACHABILITY` (`tests/_shared/premise.ts`), any assertion whose discriminating condition depends on a `shows` row existing must assert that precondition executably, or it passes vacuously on an empty fixture.

**Tests that break by design** — each is an expected update, not a regression:

| Test | What it pins |
| --- | --- |
| `tests/sync/syncLog.test.ts:5-25` | Exact sink SQL string + 4-param array. **Primary TDD entry point** — the first failing test. |
| `tests/sync/syncLogSink.persistence.test.ts:7-51` | Sink persists `entry.parseWarnings` into the warnings param. |
| `tests/sync/runOfShowSyncLogChannel.test.ts:199-250` | Structural pin on `insertSyncLog`'s jsonb param. |
| `tests/sync/runScheduledCronSync.test.ts:2643-2680` | Exact-object `toHaveBeenCalledWith` on `logSync` entries — breaks when the entry gains a field. |
| `tests/sync/def4-archived-skip.test.ts:41-112` | Archived paths must not call `logSync`; watermark skip calls it exactly once. Must still hold. |
| `tests/sync/perFileProcessor.test.ts:950-984` | Wizard-staged first-seen file with no `shows` row still writes a row — the AC-3 case, already covered. |
| `tests/observe/querySyncLog.test.ts:47-77` | Select column list including `duration_ms`. |
| `tests/db/schema.test.ts:293-303` | `sync_log` public + dev parity. |
| `tests/cross-cutting/pg-cron-coverage.test.ts:107` | Non-`fxav_` cron job registry. |

**Environment hazard.** `pnpm preflight` on this worktree warns: `TEST_DATABASE_URL is NON-LOOPBACK (aws-1-us-east-2.pooler.supabase.com)`. Loopback-guarded DB tests **skip** rather than fail under that env. Any DB-backed test added here must be confirmed to actually run — a skipped test is indistinguishable from a passing one in the summary line, which is this spec's own defect class.

---

## 6. Documented limits

Deliberate, and not findings:

- **Historical rows are not backfilled.** The 5,073 existing rows keep `show_id IS NULL`. A backfill by `drive_file_id` would attribute rows written before a show's `drive_file_id` was reassigned, and the onboarding/lifecycle bulk has no file id at all. The 60-day prune retires them.
- **`show_id` is resolved at write time, not maintained.** If a `shows` row is later deleted, the FK's `on delete cascade` (`20260501001000_internal_and_admin.sql:223`) removes the log rows with it. If a `drive_file_id` is reassigned between attempts, older rows keep their original attribution — which is the historically accurate answer.
- **One additional index lookup per sink write.** A unique-index hit on a low-rate write path. Not measured as a concern; noted so a reviewer need not raise it. The pre-existing per-write connection open/close in `writeSyncLog` (`lib/sync/syncLog.ts:50-58`) dominates it by orders of magnitude and is out of scope.
- **The CLI renders no show column.** `scripts/observe/format.ts:115` renders `driveFileId`, status, warning count, duration, message. `--show` is a filter, which is the use case; adding an output column is not in scope.
- **Retention is uniform at 60 days.** No per-show or per-status retention tiering. `sync_audit` remains the durable record of applied changes and is not pruned.

---

## 7. Out of scope

- Any admin-facing UI (§1.1).
- Any `/admin/dev/telemetry` change (§1.1).
- Emitting sync outcomes into `app_events` — a distinct design question about store consolidation, tracked by `BL-OPS-LOG-DASHBOARD-BANNER`.
- Repairing `writeSyncLog`'s per-write connection churn.
- Backfilling historical rows.
