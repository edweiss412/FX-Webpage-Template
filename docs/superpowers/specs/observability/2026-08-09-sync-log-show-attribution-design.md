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
| **`show_id` stays nullable.** A row cannot always name a show: entries with no `drive_file_id` at all (run-level, session-lifecycle) and files with no committed `shows` row have nothing to point at. Proposing `not null` is out of scope. | DDL already nullable (`supabase/migrations/20260501001000_internal_and_admin.sql:223`); §3.2 derives the rule. Note lock-contended skips are NOT in this set — they carry a drive file id and DO attribute (§3.2). |
| **Pruning `sync_log` discards nothing anyone is keeping.** `sync_audit` is the durable record of what was applied to a show (`20260501001000_internal_and_admin.sql:204-217`) and is **not** pruned by this change. Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:986` describes `sync_log` as "per-attempt and not surfaced as an alert"; `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:182` describes its rows as single-attempt outcomes distinct from show-level status. | Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:182`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:986`. |
| **Threading `showId` through every `logSync` call site is rejected.** It is a partial fix that reproduces the original defect at smaller scale. See §3.1. | This spec, §3.1. |
| **There is no explicit-show-id parameter, and adding one back is rejected — fenced in both directions.** Spec R1 finding 1 established that an explicit id passed from inside the cron transaction deadlocks the first-seen applied path against the FK check on the sink's separate connection. Do not re-propose `coalesce(explicit, lookup)`, and equally do not propose reversing the coalesce order as a fix — the defect is referencing uncommitted state at all, not the precedence between two arguments. | This spec, §3.1.1, with the topology cited to `lib/sync/runScheduledCronSync.ts:1563-1583` and `lib/sync/runScheduledCronSync.ts:3651-3662`. |
| **Duration stays scoped to the `logSync` helper.** The seven other writers carry NULL by design and are enumerated. Extending timing to them is out of scope, not an oversight. | This spec, §3.3.1 and §7. |

---

## 2. Goal and acceptance posture

**Goal.** Every `sync_log` row that *can* name its show does; every row records how long the attempt took; per-show and per-file lookups are indexed; the table stops growing without bound.

**Acceptance posture.** Consistent with the preparedness-audit posture (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`): every attempt is **attributed correct or signaled, never silently wrong**. Concretely, a row either carries the right `show_id`, or carries NULL under the derived rule in §3.2 — where NULL is the honest signal that no committed show is knowable for it. NULL under that rule is correct behavior, not a gap; NULL for a row the rule says should attribute is the defect this spec closes.

### Acceptance criteria

- **AC-1.** A `sync_log` row written for a `drive_file_id` that has a **committed** `shows` row lands with that show's id in `show_id`. This holds for **every** writer that supplies a `drive_file_id` — the cron sink, the recovery sink, and the onboarding-scan sink alike.
- **AC-2.** `querySyncLog({ showId, sinceHours: null })` returns those rows, and returns zero rows for an unrelated show id. (This is the probe in §1, executable, with its negative control.)
- **AC-3.** A row whose `drive_file_id` has no committed `shows` row lands `show_id IS NULL` and does not fail — no FK violation, no blocking wait.
- **AC-4.** A row with `drive_file_id IS NULL` (run-level and session-lifecycle entries) lands `show_id IS NULL` and does not fail.
- **AC-5.** **The first-seen applied path does not block.** Processing a first-seen file end-to-end — where the `shows` row is inserted inside the same transaction that awaits the sink — completes without deadlock or FK wait, and writes its row with `show_id IS NULL`. See §3.1.1.
- **AC-6.** Every row written **through the `logSync` helper** carries a non-null `duration_ms`. Rows from the writers enumerated in §3.3.1 carry NULL by design; no other writer may.
- **AC-7.** `public.sync_log` carries a `(show_id, occurred_at desc)` index and a `(drive_file_id, occurred_at desc)` index; `dev.sync_log` carries the same two **when the dev clone is present**, and the migration applies cleanly to a target where it is absent.
- **AC-8.** `prune_sync_log(retain interval default interval '60 days')` exists with the same security posture as `prune_app_events`, deletes exactly the rows older than `retain` and returns the deleted count, is scheduled via `pg_cron`, and its job name is registered in the cron-coverage gate.
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
  (select id from public.shows where drive_file_id = $1),
  $1, $2, $3, $4::jsonb, $5
)
```

Properties this buys:

- **One change point.** No per-site audit, and a new `logSync` call site is attributed by construction rather than by remembering to thread a parameter.
- **Uniform across writers.** The same subselect goes into the recovery sink `insertSyncLog` (`lib/sync/runScheduledCronSync.ts:1214-1232`) and the onboarding-scan sink (`lib/sync/runOnboardingScan.ts:659-670`), so all three file-scoped writers attribute identically. `insertSyncLog`'s existing `showId?: string | null` parameter (`lib/sync/runScheduledCronSync.ts:490`) is **retired**, not retained — see §3.1.1.
- **Correct NULLs.** A drive file with no committed `shows` row yields NULL, which is the right answer (AC-3).

#### 3.1.1 Why there is no explicit-show-id parameter (an earlier draft's deadlock)

An earlier revision of this spec used `coalesce($explicit, (select …))` so a call site holding an authoritative show id could bypass the lookup. **That design deadlocks the cron on every first-seen apply**, and the reasoning that motivated it was exactly backwards.

The topology: `processOneFile_unlocked` inserts the first-seen `shows` row *inside* the locked transaction (`lib/sync/runScheduledCronSync.ts:1563-1583`), and still inside that transaction calls `emitSuccessfulPhase2Tail` (`lib/sync/runScheduledCronSync.ts:3651-3662`), which awaits `logSync`. `writeSyncLog` opens its **own** `postgres` connection (`lib/sync/syncLog.ts:50-58`). Writing `show_id = <uncommitted id>` on that second connection triggers the FK check against `shows` (`supabase/migrations/20260501001000_internal_and_admin.sql:223`), which must wait for the inserting transaction to commit or roll back — while that transaction is itself blocked awaiting the sink. Application-level deadlock, on the most common first-seen path.

Resolving by subselect only cannot reach that state: a plain `SELECT` on the second connection reads the committed snapshot, sees no row for an uncommitted first-seen show, and yields NULL — so no FK check is performed at all and nothing waits. The cost is that the single `applied` row that *creates* a show is NULL-attributed; every subsequent attempt for that show attributes normally. That is recorded as a documented limit in §6, and pinned by AC-5.

The general rule, worth stating because it will recur: **this sink runs on a connection that cannot see its caller's transaction, so it may only reference committed state.**

### 3.2 Unattributable rows — a derived rule, not an enumeration

A row lands `show_id IS NULL` **iff** its `drive_file_id` is NULL, or no committed `shows` row exists for that `drive_file_id` at write time. That is the whole accept-set, and it is derived from the mechanism rather than listed — an enumeration re-opens the moment someone adds a call site, which is the defect class this spec exists to close.

Consequences worth naming, because an earlier draft got several of them wrong by enumerating:

| Row class | Attributed? |
| --- | --- |
| Run-level entries (`lib/sync/runScheduledCronSync.ts:3780`, `lib/sync/runScheduledCronSync.ts:3796`) | **No** — `driveFileId: null`; the entry describes the run, not a file. |
| Session lifecycle (`lib/onboarding/sessionLifecycle.ts:306`, `lib/onboarding/sessionLifecycle.ts:397`, `lib/onboarding/sessionLifecycle.ts:634`, `lib/onboarding/sessionLifecycle.ts:944`) | **No** — these write neither `show_id` nor `drive_file_id`. `lib/onboarding/sessionLifecycle.ts:944` (`reap_stale_session`) is the largest of the four by volume and was missed by the first draft. |
| Escaped-throw catch (`lib/sync/runScheduledCronSync.ts:3953`) | **Yes** — it is inside the file loop and writes `file.driveFileId` (`lib/sync/runScheduledCronSync.ts:3928-3958`), so it attributes whenever a committed show exists. The first draft wrongly called it context-less. |
| Prepared skip (`lib/sync/runScheduledCronSync.ts:3328`) | **Yes** — it carries gate outcomes including watermark skips for *existing* shows (`lib/sync/perFileProcessor.ts:8-18`), so it is not first-seen "by definition." First draft was wrong. |
| Lock-contended skip (`lib/sync/runScheduledCronSync.ts:2761`) | **Yes** — it passes the drive file id. First draft was wrong. |
| Stage / first-seen files (`lib/sync/runScheduledCronSync.ts:3469`) | **Only while no committed `shows` row exists.** Attributes on any re-stage after the show exists. |
| Onboarding `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` (`lib/sync/runOnboardingScan.ts:740`, `lib/sync/runOnboardingScan.ts:826`, `lib/sync/runOnboardingScan.ts:842`, `lib/sync/runOnboardingScan.ts:863`, `lib/sync/runOnboardingScan.ts:896`, `lib/sync/runOnboardingScan.ts:922`, `lib/sync/runOnboardingScan.ts:1019`) | **Yes, after a caller repair.** These seven call `tx.logSync({ code })` with **no `driveFileId`**, though `file.driveFileId` is in scope — the sink's `driveFileId?` is optional (`lib/sync/runOnboardingScan.ts:659`) and the omission becomes NULL. Repairing only the sink SQL leaves them dropped. Each must pass `driveFileId`. The run-level readiness emit at `lib/sync/runOnboardingScan.ts:1134` is genuinely unattributable and stays NULL. |
| Onboarding scan sink (`lib/sync/runOnboardingScan.ts:659-670`) | **Yes**, once the sink is repaired. `lib/sync/runOnboardingScan.ts:536-540` supports re-onboarding a file that already has a `shows` row, so its three file-scoped emissions (`lib/sync/runOnboardingScan.ts:810-813`, `lib/sync/runOnboardingScan.ts:879-883`, `lib/sync/runOnboardingScan.ts:1023-1031`) are attributable-but-NULL today. The first draft wrongly fenced this whole writer as pre-promotion. |
| First-seen `applied` (`lib/sync/runScheduledCronSync.ts:2425`) | **No** — the `shows` row is uncommitted at write time (§3.1.1). Documented limit. |

The session-lifecycle row is why the CLI's file column renders `-` for the bulk of today's rows (`scripts/observe/format.ts:115` renders `r.driveFileId ?? "-"`).

### 3.3 Duration

No elapsed-time measurement exists anywhere in the per-file scope. `processOneFile` (`lib/sync/runScheduledCronSync.ts:2707`) wraps one drive file's entire attempt and is the correct boundary.

Capture the start there using the existing injectable clock `ProcessOneFileDeps.now?: () => Date` (`lib/sync/runScheduledCronSync.ts:568`, already used at `lib/sync/runScheduledCronSync.ts:3484`) rather than raw `Date.now()` — the clock is injectable and therefore testable.

**How it reaches the writer.** `logSync` (`lib/sync/runScheduledCronSync.ts:2231-2251`) takes `SyncLogDeps` (`lib/sync/runScheduledCronSync.ts:2218-2220`), a narrow structural type currently holding only `logSync?`. Widen it with **both** `attemptStartedAtMs?: number` **and** `now?: () => Date`, and set the start on `ProcessOneFileDeps` in `processOneFile`.

Both fields are required. `logSync` computes `now() - attemptStartedAtMs`, so a widening that carries only the start leaves the helper unable to read `deps.now` under the declared parameter type — it would either fail to typecheck or fall back to ambient wall-clock time, which defeats the injected-delta assertion in §5 and can emit an epoch-sized value when a test injects a fake start. `ProcessOneFileDeps` already declares `now?: () => Date` (`lib/sync/runScheduledCronSync.ts:568`), so no call site changes; only the narrow type needs to admit it.

**There are TWO capture sites, not one.** `lib/sync/runManualStageForFirstSeen.ts:147-158` calls `emitSuccessfulPhase2Tail` directly — reaching the `logSync` helper **without** passing through `processOneFile`, the other site that establishes a start. Its emission is exercised by an existing test through an injected sink (`tests/sync/runOfShowSyncLogChannel.test.ts:172-192`). Left alone it would write NULL duration through the helper path and contradict AC-6, so it captures its own start the same way. This is a genuine attempt with a real boundary, which is why it gets a start rather than a place on the §3.3.1 NULL list. Propagation is already guaranteed: the object actually passed at the in-transaction call sites is the locally-constructed `txDeps = txBoundProcessDeps(tx, deps)` (`lib/sync/runScheduledCronSync.ts:3298`), and `txBoundProcessDeps` (`lib/sync/runScheduledCronSync.ts:2301-2305`) returns a `ProcessOneFileDeps` — either `deps` verbatim (`lib/sync/runScheduledCronSync.ts:2306`) or a derivation of it — so a new field on `ProcessOneFileDeps` reaches every site without touching any call site. `logSync` computes the delta and sets it on the entry; the sink writes it to `duration_ms`.

The three are: the prepared-skip branch (`lib/sync/runScheduledCronSync.ts:2742`), the lock-contended branch (`lib/sync/runScheduledCronSync.ts:2761`), and the main path through `txBoundProcessDeps` (`lib/sync/runScheduledCronSync.ts:2755`). The first two log with the **original** `deps` and are outside the `txBoundProcessDeps` propagation argument entirely — substituting only the third gives the applied path a correct duration while both skip classes stay NULL, and no listed assertion notices.

**Derive a fresh object; do NOT mutate `deps`.** The same `processDeps` object is reused across files in the run loop (`lib/sync/runScheduledCronSync.ts:3877-3942`), so writing a start onto it leaks one file's start into the next file's row. `processOneFile` therefore builds its own `depsWithStart` per invocation.

Note this is deliberately NOT the outer `txDeps` parameter of type `SyncPipelineTxBoundDeps` (`lib/sync/runScheduledCronSync.ts:457-459`, `{ upsertAdminAlert }` only) — that type carries no `logSync` and is shadowed at `lib/sync/runScheduledCronSync.ts:3298`. Confusing the two would produce a change that typechecks and silently writes nothing, because `logSync?` is optional and `deps.logSync?.(entry)` would no-op.

Guard conditions:

- **Start absent** (a deps object constructed without it, e.g. an older test double): `duration_ms` is NULL. Never a throw, never a negative, never `NaN`.
- **Clock non-monotonic** (injected clock moving backwards in a test): clamp at 0 rather than persisting a negative.

#### 3.3.1 Writers that carry NULL duration — the complete list

Duration is scoped to the `logSync` helper, because that is the only site with an attempt boundary to measure from. Every other writer produces a row whose elapsed time is either meaningless or unavailable, and each writes NULL **by design**. AC-6 is worded against this list; an earlier draft's AC-6 said "every cron- or recovery-sink row" and contradicted its own guard section.

| Writer | Why NULL |
| --- | --- |
| Direct `deps.logSync?.({...})` at `lib/sync/runScheduledCronSync.ts:3780`, `lib/sync/runScheduledCronSync.ts:3796` | Run-level; no single attempt to time. |
| Escaped-throw catch at `lib/sync/runScheduledCronSync.ts:3953-3958` | The attempt aborted; a partial elapsed time would misreport as a completed duration. |
| Recovery sink at `lib/sync/runScheduledCronSync.ts:2581-2589`, `lib/sync/runScheduledCronSync.ts:2636-2648` | `insertSyncLog` (`lib/sync/runScheduledCronSync.ts:1214-1232`) receives no clock or start. |
| Manual recovery at `lib/sync/runManualSyncForShow.ts:175-183`, `lib/sync/runManualSyncForShow.ts:224-232` | Same — recovery sink, no start threaded. |
| Push preflight / failure / duplicate at `lib/sync/runPushSyncForShow.ts:235-247` | Written **before** `processOneFile` captures a start; there is no attempt yet. |
| Onboarding scan at `lib/sync/runOnboardingScan.ts:659-670` | Scan-scoped, not attempt-scoped. |
| Webhook folder-list failure (`app/api/drive/webhook/route.ts:224`) | Calls the sink directly with `driveFileId: null`; no attempt has begun. |
| Webhook per-file escaped error (`app/api/drive/webhook/route.ts:234-239`) | Calls the sink directly, outside the timed helper. Note it DOES pass `driveFileId`, so it attributes — it is a NULL-**duration** writer, not a NULL-attribution one. |
| Session lifecycle (four sites, §3.2) | Not a sync attempt at all. |

Extending timing to these is deliberately **out of scope** (§7): each needs its own notion of "the attempt," and the operator question this spec answers ("has this show been failing?") is served by outcome and timestamp, not by duration.

No read-side work is required: `querySyncLog` already selects and maps it (`lib/observe/query/syncLog.ts:47`; type at `lib/observe/query/types.ts:143`) and the CLI already renders a duration column (`scripts/observe/format.ts:115`).

### 3.4 Indexes

```sql
create index if not exists sync_log_show_id_idx       on public.sync_log (show_id, occurred_at desc);
create index if not exists sync_log_drive_file_id_idx on public.sync_log (drive_file_id, occurred_at desc);
```

Shape and naming mirror the established convention for this exact access pattern: `sync_audit_show_id_idx on public.sync_audit (show_id, applied_at desc)` (`20260501001000_internal_and_admin.sql:218`), `reports_show_id_idx ... (show_id, created_at desc)` (`supabase/migrations/20260501001000_internal_and_admin.sql:323`), and `app_events_show_id_idx on public.app_events (show_id, occurred_at desc)` (`20260629000002_app_events.sql:19`). `if not exists` follows the newer-migration convention (`supabase/migrations/20260629000002_app_events.sql:19-21`).

The `drive_file_id` companion is included because `--file` is the flag that works *today* and is equally unindexed; leaving it out would fix the broken query path and leave the working one slow.

**The `dev.sync_log` mirror MUST be existence-guarded.** The dev clone creates its own indexes inline (`supabase/migrations/20260502000000_dev_schema_clone.sql:294-295`), which is safe *there* because the same migration creates the tables immediately above. A later migration cannot copy that form: `create index if not exists … on dev.sync_log` guards only against a duplicate **index**, not a missing **table**, and raises `relation "dev.sync_log" does not exist` wherever the clone is absent. Per AGENTS.md the `dev.*` schema is local-seed infrastructure and explicitly **not a deploy target**, so the validation project is exactly such a target and the surgical apply there would abort.

The established later-migration idiom for dev is `alter table if exists dev.<t>` (`supabase/migrations/20260702120200_drive_file_id_nonblank.sql:95-96`, pinned by `tests/db/schema.test.ts:300-306`), but `create index` has no `if exists` form that guards the table. The guard is therefore explicit:

```sql
do $$
begin
  if to_regclass('dev.sync_log') is not null then
    create index if not exists sync_log_show_id_idx       on dev.sync_log (show_id, occurred_at desc);
    create index if not exists sync_log_drive_file_id_idx on dev.sync_log (drive_file_id, occurred_at desc);
  end if;
end;
$$;
```

Index names are reused verbatim across schemas because index names are schema-scoped — `sync_audit_show_id_idx` already exists in both `public` (`supabase/migrations/20260501001000_internal_and_admin.sql:218`) and `dev` (`supabase/migrations/20260502000000_dev_schema_clone.sql:294`). This is the convention, not a collision.

### 3.5 Retention

`prune_sync_log(retain interval default interval '60 days')` mirrors `prune_app_events` (`20260629000002_app_events.sql:32-63`) exactly: `returns integer`, `language sql`, `security definer`, `set search_path = public, pg_temp`, body deleting `where occurred_at < now() - retain` and returning the deleted count. Grants mirror `supabase/migrations/20260629000002_app_events.sql:44-45` — `revoke all from public, anon, authenticated`, `grant execute to service_role`.

Scheduling mirrors `supabase/migrations/20260629000002_app_events.sql:53-63`: a self-guarded `do $$ ... $$` block that unschedules any existing job of the same name before `cron.schedule`, so re-applying the migration is idempotent. Job name `sync_log_prune`, on an off-peak minute distinct from `app_events_prune`'s `17 4 * * *`.

**Gate coupling:** `sync_log_prune` sits outside the `fxav_cron_` prefix, exactly like `app_events_prune`, so it MUST be added to `EXPECTED_NON_FXAV_NON_ORPHAN_CRONS` (`tests/cross-cutting/pg-cron-coverage.test.ts:107`, currently `["app_events_prune"]`) in the same commit as the migration, or that gate fails.

### 3.5.1 Manual sync paths install no sink at all (R5 F1)

`SyncLogDeps.logSync` is optional (`lib/sync/runScheduledCronSync.ts:2218-2220`) and emitted through optional chaining (`lib/sync/runScheduledCronSync.ts:2250`). Every production manual entry point passes **no** sink, so `deps.logSync?.(entry)` is a no-op and a manual applied / skipped / error outcome writes **no `sync_log` row at all**:

| Entry point | Shape |
| --- | --- |
| `app/api/admin/sync/[slug]/route.ts:94` | calls `runManualSyncForShow` with no `processDeps` |
| `app/admin/dev/actions.ts:622` | same |
| `app/admin/show/[slug]/_actions/roleToken.ts:184` | same |
| `app/admin/show/[slug]/_actions/useRaw.ts:168` | same |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:427-433` | passes `{}` |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:480-488` | first-seen `stageDeps` carries no logger |

`runManualSyncForShow` forwards only `...(deps.processDeps ?? {})` (`lib/sync/runManualSyncForShow.ts:431-436`), so nothing supplies one. The existing test injects `logSync` explicitly (`tests/sync/runOfShowSyncLogChannel.test.ts:172-185`) and therefore proves only a test-only path.

**This is silence, not NULL, and it violates the consequence bound directly.** §2 requires every attempt to be attributed correctly or signaled; a row that never exists is neither. It also defeats the change's own purpose for the operator's most deliberate action: `observe synclog --show` stays blind to manual syncs even after the sink resolves show ids perfectly.

Note the manual *fetch-failure* paths do log, via `insertSyncLog` (`lib/sync/runManualSyncForShow.ts:175`, `lib/sync/runManualSyncForShow.ts:224`). So manual sync records its failures-to-fetch and drops its ordinary outcomes — the worst of both, because the log looks populated.

**The census is DERIVED, not enumerated — because enumerating it has now failed twice (R6 F1).** The table above listed six sites; a module-path sweep then found two more that reach `runManualSyncForShow` indirectly and equally sinkless:

| Missed entry point | Reached via |
| --- | --- |
| `lib/showLifecycle/unarchiveShow.ts:24` | `app/admin/show/[slug]/_actions/unarchive.ts:34` |
| `app/api/admin/show/pull-sheet-override/route.ts:213` | the production `POST` at `app/api/admin/show/pull-sheet-override/route.ts:222-229`, whose `runSync` defaults to the real function |

Both operate on committed existing shows, so their outcomes are attributable and still produce no row. That is eight known sites, and the count is not the point: **this is the fifth time in this arc that a hand-listed cover came up short** (the writer recognizer at R4 F4, the guard's own exemption, my verification grep, the six-site census, now this). The list is therefore illustrative of a class, and the enforceable cover is the plan's derived entry-point assertion — every caller reaching an exported sync entry point must supply a sink or be exempted at the site. A future caller is covered by construction rather than by someone remembering to extend a table.

**Repair, in scope:** each entry point passes `logSync: writeSyncLog`, one property each. This is the class-sweep default (repair every instance in the same PR) rather than a filing: it needs no product decision, no ratified fence excludes it, and it is not a redesign. Leaving it would ship a spec whose headline claim is false for manual syncs.

Two comments in `app/admin/show/[slug]/_actions/useRaw.ts:162` and `app/admin/show/[slug]/_actions/useRaw.ts:173` assert that logging already happens here. They are wrong today and must be corrected with the wiring, or they will re-mislead the next reader exactly as they misled this spec.

### 3.6 Attribution meta-test (the structural defense)

Three findings across rounds 1 and 2 were instances of one vector — *a `sync_log` row that could name its show does not*: the onboarding sink never resolved it (R1 F2), three row classes were misfiled as unattributable (R1 F7), and seven onboarding callers drop an available `driveFileId` (R2 F1). Each was repaired per-instance. `docs/agents/writing-plans.md` is explicit that this is the stopping point: *"if the class is already nameable at FIRST occurrence, ship the structural defense in the FIRST repair commit"*, because *"the 3-round same-vector threshold is a ceiling, not a waiting period."*

A NEW meta-suite under `tests/sync/` (named `_metaSyncLogAttribution`, created by this change, so it is a deliverable rather than a citation) walks every call site reaching a `sync_log` writer **from disk** and requires each to be in exactly one state:

1. **Attributing** — the call passes a `drive_file_id`, or
2. **Registered run-level** — an explicit `RUN_LEVEL_SYNC_LOG_SITES` row naming the site and why it cannot name a file.

Filesystem discovery is the load-bearing part: a NEW call site fails by default rather than being silently exempt. Same posture as `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10). Mechanism: `walkSourceFiles` (`lib/messages/__internal__/walkSourceFiles.ts:8-11`) plus the TypeScript AST, exactly as that precedent uses them.

**This is the oracle for the caller class**, which no DB scenario can cover: the seven superseded branches are mutually exclusive, so a behavioral test reaches one per scenario (§5, R3 F1).

**Recognized writers — derived from the module's exports, not hand-listed (R4 F4).** An earlier draft enumerated call shapes and omitted the two canonical exported writers, `writeSyncLog` and `makePostgresSyncLogSink` (`lib/sync/syncLog.ts:39`, `lib/sync/syncLog.ts:51`). That is not a hypothetical gap: `app/api/cron/sync/route.ts:4` imports `writeSyncLog` and `app/api/cron/sync/route.ts:21` wires it as `logSync: writeSyncLog`, so an ordinary direct `writeSyncLog({ driveFileId: null, … })` call — no aliasing, no obfuscation — evaded both the recognizer and the registry.

The recognizer is therefore derived: **every exported symbol of `lib/sync/syncLog.ts`, plus the `logSync`/`insertSyncLog` method and callback forms, plus any literal `insert into public.sync_log`.** Deriving from the module's export list rather than a hand-kept list is the same "derive a cover, don't enumerate" rule the class-sweep discipline requires, and it is what makes a future writer covered by default.

**Roots:** `lib`, `app/api`, and `app/admin`. R5 F2: the earlier narrow list omitted `app/admin` and `app/api/admin`, where all six manual entry points live, and an assertion over scanned roots cannot discover a writer in an unscanned root.

**Writer grammar — three shapes the export-derived list alone misses (R5 F2):**

- **The PostgREST idiom.** `.from("sync_log").insert(...)` is an established repository write form (`lib/log/persist.ts:16`) and is not an exported `syncLog.ts` symbol, a `logSync`/`insertSyncLog` call, or a SQL literal. Recognized explicitly.
- **Schema-unqualified SQL.** `insert into sync_log` is ordinary valid SQL and falls outside an `insert into public.sync_log` literal match. The pattern accepts an optional `public.` qualifier.
- **The factory boundary.** `makePostgresSyncLogSink` takes `sql` and RETURNS the emitter (`lib/sync/syncLog.ts:39-48`); the emitting invocation is the returned binding's call (`lib/sync/syncLog.ts:54`), whose callee is a call expression rather than a name. Deriving names from exports alone therefore inspects the wrong call boundary — classifying the construction as an emission and missing the entry-bearing call. The rule must match the shape actually present. The **only** production factory invocation is `makePostgresSyncLogSink(sql)(entry)` (`lib/sync/syncLog.ts:54`) — immediately invoked, with **no binding and no assignment**, so a rule phrased as "track the binding it is assigned to" matches nothing (R6 F2). The recognizer instead treats a call whose *callee is itself a call* to a known factory as the emission: for `f(a)(b)`, the outer `CallExpression` is the emitting site and the inner one is construction. A bound form (`const sink = makeX(sql); sink(entry)`) is handled by the same rule via the binding, but the immediately-invoked form is the one that exists and therefore the one the rule is written against. Roots are asserted against the derived writer set — a writer reachable from a root not scanned is itself a failure, so the two cannot drift apart silently.

**Scope bound, stated so it cannot ratchet.** Target ~150 lines. If review pressure pushes it past ~250, that is the ratchet the round-economy retrospective describes, and the response is to narrow the claim rather than widen the recognizer.

**Threat model.** Defends against an ordinary contributor adding a call site and forgetting attribution. Deliberate obfuscation — a dynamically computed writer name, an aliased import — is out of scope and files to documented limits.

**Seed registry** — exactly the rows §3.2 derives: `lib/sync/runScheduledCronSync.ts:3780`, `lib/sync/runScheduledCronSync.ts:3796`, the four `lib/onboarding/sessionLifecycle.ts` sites, `lib/sync/runOnboardingScan.ts:1134`, and `app/api/drive/webhook/route.ts:224`. The `app/api/cron/sync/route.ts:21` wiring is a *dependency injection*, not an emission, and is covered by the sites inside `runScheduledCronSync` that it drives — the meta-test must distinguish the two, or every injection site becomes a false positive.

---

## 4. Tier × layer completeness matrix

Every affected layer gets an action or an explicit N/A.

| Layer | Action |
| --- | --- |
| Table DDL — `public.sync_log` | No column change. Columns already exist (`supabase/migrations/20260501001000_internal_and_admin.sql:221-230`). Two indexes added. |
| Table DDL — `dev.sync_log` | Same two indexes, **wrapped in a `to_regclass('dev.sync_log') is not null` guard** (§3.4) so the migration applies cleanly where the clone is absent — the validation project. Clone at `supabase/migrations/20260502000000_dev_schema_clone.sql:300-309`; `duration_ms` at `supabase/migrations/20260502000000_dev_schema_clone.sql:307`. Precedent for a later migration touching both schemas: `supabase/migrations/20260702120200_drive_file_id_nonblank.sql:69-70` (public) + `supabase/migrations/20260702120200_drive_file_id_nonblank.sql:95-96` (dev, `alter table if exists`), pinned by `tests/db/schema.test.ts:300-306`. |
| Inline CHECK | N/A — no CHECK changes. `sync_log_drive_file_id_nonblank` (`20260702120200_drive_file_id_nonblank.sql:69-70`) is unaffected; nothing here writes `drive_file_id`. |
| RLS / grants | N/A — unchanged. `admin_only` policy at `20260501002000_rls_policies.sql:67-70`; the Aug-3 lockdown revoked only INSERT/UPDATE/DELETE (`20260803000000_lockdown_admin_only_tables.sql:46`), leaving SELECT granted. |
| DB function | New: `prune_sync_log`. SECURITY DEFINER, `search_path = public, pg_temp`, service_role-only execute. |
| pg_cron | New job `sync_log_prune`; registered in `tests/cross-cutting/pg-cron-coverage.test.ts:107`. |
| Write path — cron sink | `lib/sync/syncLog.ts:39-48` resolves `show_id` by subselect on `drive_file_id` (no explicit parameter, §3.1.1) and writes `duration_ms`. |
| Write path — recovery sink | `lib/sync/runScheduledCronSync.ts:1214-1232` resolves `show_id` by the same subselect; its `showId?` parameter (`lib/sync/runScheduledCronSync.ts:490`) is retired. Duration stays NULL (§3.3.1). |
| Write path — onboarding-scan sink | `lib/sync/runOnboardingScan.ts:659-670` gains the same subselect. **In scope, not fenced:** `lib/sync/runOnboardingScan.ts:536-540` supports re-onboarding a file that already has a `shows` row, so its three file-scoped emissions (`lib/sync/runOnboardingScan.ts:810-813`, `lib/sync/runOnboardingScan.ts:879-883`, `lib/sync/runOnboardingScan.ts:1023-1031`) are attributable-but-NULL today and would violate the consequence bound if left alone. |
| Write path — push sink | `lib/sync/runPushSyncForShow.ts:235-247` routes through the cron sink and therefore attributes automatically. Duration stays NULL — these rows are written before any attempt starts (§3.3.1). |
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

## 5. Testing posture

The assertion-by-assertion inventory lives in this change's implementation plan, under `docs/superpowers/plans/observability/` (created alongside this spec), not here. This section states the posture that inventory must satisfy; where the two disagree, this section wins and the plan is wrong.

The split is deliberate and was learned in this arc. An earlier revision carried the full inventory, and three of round 2's findings plus five of round 4's were assertion-shaped — all real defects, but each cost a full spec round to close when it belonged where a plan reviewer would find it. Round 4 returned five findings, none about the design. That is the signal for this move, not an argument against the findings.

**The regression that matters** is §1's probe made executable: write through a sink for a `drive_file_id` with a committed `shows` row, then read the row back and assert `show_id`. Its absence is why this shipped.

**Posture requirements**, each naming the failure it prevents:

1. **Read back from the database, never the parameter array.** A parameter-shape assertion passes even when the SQL never binds the value.
2. **One oracle per sink, not one parameterized over a sink.** AC-1 spans three writers; a repair to `makePostgresSyncLogSink` alone must not satisfy the suite (R2 F4).
3. **The caller class needs a static oracle, not a behavioral one.** The seven superseded branches are mutually exclusive, so a DB scenario reaches exactly one and six can stay broken behind green (R3 F1). §3.6 is that oracle.
4. **Branch-complete, not path-complete.** Duration has five distinct behaviors — prepared skip, lock-contended skip, manual first-seen apply, the reuse hazard, and the missing-start/backward-clock guards — and an oracle exercising only the applied path leaves every one of them free (R4 F1). Each behavior gets its own assertion.
5. **A prune oracle must prove non-deletion of rows it did not mark.** Asserting only that marked-new rows survive admits a predicate like `occurred_at < cutoff OR status = 'skipped'`, which deletes unrelated recent rows while every marked assertion passes (R4 F5).
6. **Every guard states its premise executably** (`tests/_shared/premise.ts`), unconditionally relative to what it guards — never inside a `.each` callback, whose case count can be zero.

**Three hazards that are design-level, and therefore stay here:**

- **`TEST_DATABASE_URL` is the validation project**, and `lib/sync/syncLog.ts:8-14` prefers it. `prune_sync_log` deletes every qualifying row in whatever database it reaches, so a test inheriting that variable can permanently delete shared validation history. Targets are pinned to loopback via `assertLocalDbUrl`.
- **The pre-existing meta-guards do not cover this, and extending their discovery is necessary but NOT sufficient (R3 F6, sharpened by R4 F3).** `tests/db/_metaDestructiveDbTargetGuard.test.ts:42-43` recognizes a guard by *name match only* — it does not establish that the guarded value is the URL actually handed to `postgres`, that the call precedes the connection, or that the callee is the imported guard rather than a local same-named function. A prune test can therefore call `assertLocalDbUrl` on an unrelated loopback literal, or after pruning, and pass. The guard extension is part of the deliverable **and** so is closing those three holes; a name-match guard is a documented limit being relied on as a control.
- **Anti-vacuity must key on CI presence, not on a configured URL (R4 F2).** `unit-suite-db` boots local Supabase and runs the serial project with **no** `TEST_DATABASE_URL` and no `LOCAL_TEST_DATABASE_URL` (`.github/workflows/unit-suite.yml:139-144`, whose only env is `VITEST_EXCLUDE_ENV_BOUND`). A condition that fires only when a URL is explicitly configured is therefore dead in the exact job that runs these tests, and every new DB assertion could skip while CI stays green. Follow `unreachableDbFailure` (`lib/driveIdCoverage/introspect.ts:132-148`), which keys on `CI` being *present* — its own comment records the escape it was hardened against, an earlier `if (!opts.ci)` that let a wrapper exporting `CI=` disable the guard silently.
- **`querySyncLog` defaults `sinceHours` to 24** (`lib/observe/query/syncLog.ts:28`); only an explicit `null` removes the bound. A fixture older than a day returns `rows: []` — an empty result identical to the bug under test, inside the test meant to prove it fixed.

## 6. Documented limits

Deliberate, and not findings:

- **The first-seen `applied` row is NULL-attributed.** The one attempt that *creates* a show writes its `sync_log` row from inside the transaction holding the uncommitted `shows` insert, on a connection that cannot see it (§3.1.1). Every subsequent attempt for that show attributes normally, so the loss is exactly one row per show, at the moment the show is born. Accepting this is what makes the design deadlock-free; the alternative was a cron hang.
- **Rows written before a show exists never become attributed.** Attribution is resolved at write time, not maintained. A file that fails repeatedly before its first successful apply accumulates NULL-attributed rows, and those rows stay NULL after the show is created. The operator question ("has this show been failing?") is answerable from the show's existence onward; the pre-existence history is reachable by `--file`.
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
- Extending `duration_ms` to the seven writers enumerated in §3.3.1. Each needs its own definition of "the attempt" — a push preflight has none yet, a recovery write is not an attempt, a session reap is not a sync — and the question this spec answers is served by outcome and timestamp.
- Moving the sink write outside the cron transaction. That would let the first-seen `applied` row attribute, but it reorders a durability boundary in the hottest path in the system for one row per show. Filed as a documented limit above rather than attempted here.
- Backfilling historical rows.
