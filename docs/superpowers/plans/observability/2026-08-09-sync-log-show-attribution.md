# Plan: sync-log show attribution, duration, indexing, retention

**Spec:** `docs/superpowers/specs/observability/2026-08-09-sync-log-show-attribution-design.md` (canonical; this plan implements it, TDD per task, one commit per task). **Branch:** `fix/sync-log-show-id-duration`. **Charter:** `BL-ADMIN-PER-SHOW-HISTORY`.

**Invariant 8 APPLIES to this change** (plan R1 F1). Task 3c edits `app/admin/dev/actions.ts`, `app/admin/show/[slug]/_actions/roleToken.ts` and `app/admin/show/[slug]/_actions/useRaw.ts`, and `AGENTS.md:20` defines any file under `app/` except `app/api/**` as a UI surface **regardless of whether the edit is visually apparent**. An earlier revision claimed `N/A` reasoning that no visual change occurs; the invariant is written on file location precisely so that reasoning cannot be used.

The invariant-8 dual gate runs at close-out on the affected diff, and its marker line is written **then**, with real counts, in the close-out record. It is deliberately absent from this plan rather than carrying a placeholder: the marker grammar admits only `RAN`/`RAN-DEGRADED`, so any value written before the gate runs would be false, and a false marker is worse than a missing one — it is the exact "assert a protection instead of shipping it" defect this arc spent sixteen rounds removing.

(Live marker. **Invariant 8 APPLIES** — plan R1 F1: Task 3c edits `app/admin/dev/actions.ts`, `app/admin/show/[slug]/_actions/roleToken.ts` and `app/admin/show/[slug]/_actions/useRaw.ts`, and `AGENTS.md:20` defines any file under `app/` except `app/api/**` as a UI surface regardless of whether the edit is visually apparent. An earlier revision claimed `N/A` on the reasoning that no *visual* change occurs; the invariant is written on file location precisely so that reasoning cannot be used. The dual gate runs at close-out and this marker is completed with its counts.)

---

## Pre-draft verification — run, not described

Per the authored-AND-RUN rule, every sweep below was executed at plan time and its output pasted.

**Sweep A — every `sync_log` writer.** Command and full output in the shipping session's findings log SF-4. Seven write sites; four are session-lifecycle (`lib/onboarding/sessionLifecycle.ts:306`) and write neither `show_id` nor `drive_file_id`. Disposition: the cron sink (`lib/sync/syncLog.ts:43`), the recovery sink (`lib/sync/runScheduledCronSync.ts:1217`), and the onboarding-scan sink (`lib/sync/runOnboardingScan.ts:662`) are all IN scope — all three supply a `drive_file_id`, so spec §3.2's derived rule requires all three to attribute. Only the four session-lifecycle sites are OUT, because they write neither `show_id` nor `drive_file_id`. (An earlier draft fenced the onboarding sink as pre-promotion; spec R1 finding 2 refuted that — `lib/sync/runOnboardingScan.ts:536-540` supports re-onboarding a file that already has a `shows` row.)

**Sweep B — cron registry.** `tests/cross-cutting/pg-cron-coverage.test.ts:456-461` asserts exact array equality on live non-`fxav_` job names excluding `cleanup-bootstrap-nonces`, against `EXPECTED_NON_FXAV_NON_ORPHAN_CRONS` (`tests/cross-cutting/pg-cron-coverage.test.ts:107` = `["app_events_prune"]`). Registry diff this plan makes: `["app_events_prune"]` → `["app_events_prune", "sync_log_prune"]`. One row added, none removed.

**Sweep C — migration version collision.** Highest migration on any live `origin/*` branch is `20260804000000_undo_change_selections_reset_at.sql`. the new migration `20260809000000_sync_log_show_attribution` is free. Re-verify immediately before merge.

## Acceptance criteria index

Restated from the spec so every `ac=` id in this plan resolves here. Spec is canonical if the two ever disagree.

| AC | Claim | Proved by |
| --- | --- | --- |
| **AC-1** | A row written for a `drive_file_id` with a committed `shows` row lands that show's id — for the cron, recovery, AND onboarding sinks alike. | Tasks 1, 3, 3b, 3c |
| **AC-2** | `querySyncLog({ showId, sinceHours: null })` returns those rows, and zero for an unrelated show id. | Task 1 (DB oracle) |
| **AC-3** | A `drive_file_id` with no committed `shows` row lands `show_id IS NULL` — no FK violation, no blocking wait. | Task 1 (unit + DB oracle) |
| **AC-4** | A row with `drive_file_id IS NULL` lands `show_id IS NULL` and does not fail. | Task 1 (unit + DB oracle) |
| **AC-5** | The first-seen applied path does not block, and writes `show_id IS NULL`. | Task 1 (DB oracle, end-to-end, bounded timeout) |
| **AC-6** | Every row written through the `logSync` helper carries non-null `duration_ms`; only the §3.3.1 writers carry NULL. | Tasks 1, 2 |
| **AC-7** | Both indexes exist on `public.sync_log`, and on `dev.sync_log` when the clone is present; the migration applies cleanly where it is absent. | Tasks 5, 8 |
| **AC-8** | `prune_sync_log` exists with the `prune_app_events` security posture, deletes exactly the rows past the cutoff, is scheduled, `active`, and registered in the cron gate. | Tasks 5, 8 |
| **AC-9** | `BL-ADMIN-PER-SHOW-HISTORY` is archived with the UI half recorded as a decision, not a debt. | Task 10 |
| **AC-10** | The invariant-8 dual gate has run on the three `app/` files Task 3c edits, with findings and dispositions recorded and a valid `RAN`-form marker in the unit's closeout sibling. | Task 9 |

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/cross-cutting/pg-cron-coverage.test.ts` — one registry row (`sync_log_prune`).
- **CREATES** a new `syncLogIndexesAndPrune.db` suite under `tests/db/` — no existing test references any of the new index or function names (`rg` returns nothing), so AC-7 and AC-8 have no executable proof without it. Includes a migration-text assertion pinning the `to_regclass` dev guard, so an ungated `create index ... on dev.sync_log` cannot ship.
- **CREATES no attribution meta-test.** Descoped to `BL-SYNC-LOG-ATTRIBUTION-METATEST` under the three-round prose cap after its definition consumed spec rounds 11-13. Design is preserved in that entry, ready to implement. The repairs it would police all ship here; what is deferred is regression prevention.
- **CREATES** no other registry meta-test. The invariant-9 registry (`tests/auth/_metaInfraContract.test.ts`, `tests/admin/_metaInfraContract.test.ts`) is **not** extended: the sink uses raw `postgres`, not a Supabase client, so it is outside that contract. The read path already conforms and is unchanged.
- **Invariant-10 mutation-surface registry:** N/A — no new HTTP route and no new `"use server"` action.

## Connection model per sink (load-bearing — spec §3.1.1)

The three file-scoped sinks do NOT share a connection model, and the distinction is what makes the design safe. Implementers and reviewers both need it stated once:

| Sink | Connection | Sees caller's uncommitted writes | Safe because |
| --- | --- | --- | --- |
| `makePostgresSyncLogSink` / `writeSyncLog` (`lib/sync/syncLog.ts:39-58`) | its own `postgres` client, per call | **No** | it only READS committed state, so nothing can block it and it can block nothing |
| `insertSyncLog` (`lib/sync/runScheduledCronSync.ts:1214-1232`) | `this.rows` — caller's transaction | **Yes** | same transaction; cannot deadlock against itself |
| onboarding `logSync` (`lib/sync/runOnboardingScan.ts:659-672`) | `this.rows` — caller's transaction | **Yes** | same transaction |

Two consequences: the first-seen NULL limit (spec §6) applies **only** to the separate-connection cron sink; and the R1 deadlock was **only ever possible** there. `lib/sync/runPushSyncForShow.ts:235-248` also writes from inside a held lock transaction via `logUnlessArchived`, and is safe for the first row's reason.

## Downstream readers of `sync_log` (verified unaffected)

`lib/notify/monitorDigest.ts:247-250` and `lib/notify/monitorDigest.ts:261-263` join `sync_log` to `shows` **on `drive_file_id`**, never on `show_id` — so populating `show_id` is purely additive and changes no behavior. The new `sync_log_drive_file_id_idx` positively helps both queries, which today drive that join off a sequential scan. **Out of scope:** rewriting those joins to use `show_id`. Fixtures at `tests/notify/monitorDigest.drift.db.test.ts:64`, `tests/notify/monitorDigest.autofix.db.test.ts:73`, `tests/notify/monitorNewShowGaps.db.test.ts:65` insert without `show_id` and continue to pass — confirm during implementation rather than assume.

## Advisory-lock topology (mandatory declaration)

This plan touches **no** `pg_advisory*` call. The cron sink writes on its own `postgres` connection (`lib/sync/syncLog.ts:50-58`), outside the locked transaction. No new holder is introduced at any layer; the topology pinned by `tests/auth/advisoryLockRpcDeadlock.test.ts` is unchanged.

## Test-file wiring (mandatory declaration) — verified, no change required

`vitest.projects.ts` partitions the suite; `unit-suite-db` runs only `--project=serial`, `unit-suite-nodb` runs the parallel project on a runner with **no Supabase and no psql**. The parallel (verified DB-free) directories are listed explicitly and the file states *"New directories default to SERIAL (safe)."* `tests/db`, `tests/sync`, and `tests/observe` are all absent from that list, so every new file here lands in serial by default. **No `testMatch` entry and no workflow path-filter change is owed.**

New DB-backed tests go in `tests/db/` with the `*.db.test.ts` suffix (template: `tests/db/driveFileIdNonblank.db.test.ts`) rather than alongside the DB-free mock suite in `tests/observe/`.

## DB target safety (load-bearing)

**`TEST_DATABASE_URL` is the VALIDATION project**, not a local database — `postgres.vzakgrxqwcalbmagufjh@aws-1-us-east-2.pooler.supabase.com` (`AGENTS.md:218`, `AGENTS.md:218`). The preflight non-loopback warning is expected, not a misconfiguration.

Every new DB test resolves its URL through `assertLocalDbUrl` (`tests/db/_localDbUrl.ts:50`) and never reads `TEST_DATABASE_URL` directly; otherwise its fixtures mutate the validation project. `tests/db/_metaDestructiveDbTargetGuard.test.ts` and `_metaLocalDbUrlGuard.test.ts` already enforce this class.

Task 8's validation apply is `psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -f supabase/migrations/20260809000000_sync_log_show_attribution.sql` then `notify pgrst, 'reload schema';` — `supabase db push` is blocked on that project.

No dev counterpart is needed for `prune_sync_log`: `prune_app_events` has none, and the dev schema is not a deploy target ("Public schema only", `AGENTS.md:218`). The migration's dev block covers indexes only.

## Vacuity guards for the new suites

`tests/cross-cutting/pgCronCiVacuity.test.ts` already prevents the pg-cron coverage suite from reporting success without live assertions, so adding `sync_log_prune` to that registry inherits the protection — nothing new is owed there.

The new suites do NOT inherit it. Apply that file's method rather than a weaker one: it **executes the suite under a hostile environment and reads the outcome** instead of matching its source, because two adversarial rounds walked past the source-matching version — once via `const isCi = false; // Boolean(process.env.CI);` (every predicate preserved, vacuum restored) and once by registering the real cases with `test.skip` while a counted sentinel stayed non-zero.

## e2e harness

N/A — no Playwright surface.

---

<!-- tasks: depth=2 -->

## Task 1 — Cron sink writes `show_id` and `duration_ms`

<!-- task: red=`pnpm vitest run tests/sync/syncLog.test.ts tests/sync/syncLogSink.persistence.test.ts tests/db/syncLogAttribution.db.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6 -->

**RED validity.** `tests/sync/syncLog.test.ts:16-31` asserts `toHaveBeenCalledWith(expect.stringContaining("insert into public.sync_log"), [4 params])`. The production line whose absence makes it fail is the `insert into public.sync_log (drive_file_id, status, message, parse_warnings)` literal at `lib/sync/syncLog.ts:43` — four columns, four params. Not test-local: the string under assertion is production source.

**Know which half actually goes red.** The `stringContaining` half **still passes** after the change (the new statement also contains that substring); only the param array (4 → 5) goes red. So containment is not coverage of the column list.

**The new SQL assertion must be exact equality, not containment** — a `show_id` token inside a SQL comment satisfies containment while the column is dead, which is mutant (c) below:

```ts
// normalize(): strip `--` comments FIRST, then collapse whitespace. Both steps
// are mandatory - the shipped statement carries an explanatory comment, so a
// whitespace-only normalizer fails on correct code (plan R6 F4), and a
// comment-blind one lets a commented-out subselect satisfy the assertion.
const normalize = (raw: string) =>
  raw.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
const sql = normalize(unsafe.mock.calls[0]![0] as string);
expect(sql).toBe(
  "insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings, duration_ms) " +
  "values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb, $5)",
);
```

Exact equality is the only form surviving all four mutants; containment survives (b) and (c).

**`normalize()` must strip `--` comments before collapsing whitespace**, and this is load-bearing in both directions. The implementation carries an explanatory comment block INSIDE the SQL string (the deadlock rationale), so a comment-preserving comparison fails against correct code. And stripping makes mutant (c) fail *more* reliably: a `show_id` moved into a comment vanishes from the compared string rather than contributing text to it. The assertion then compares executable SQL only, which is exactly the claim being made. The `c.sql.includes(...)` at `tests/sync/runOfShowSyncLogChannel.test.ts:228` is a call *selector* and may stay, but its downstream assertions must not also be containment-based.

**Four pre-dispatch mutants** (mandatory for string-presence guards; record each result in the commit):
- (a) empty the `show_id` column from the insert literal → assertion must fail
- (b) append a suffix to the literal → assertion must fail (guards against substring-containment passing)
- (c) put `show_id` in a SQL comment inside the literal → assertion must fail (present but not live)
- (d) vary the drive file id between one with a committed `shows` row and one without → the resolved `show_id` must change from the show's id to NULL

**The SQL is probe-validated, not reasoned.** Run against local Postgres through this exact driver before any implementation:

```
NO-SHOW   -> {"show_id":null,"drive_file_id":"__probe_no_such_file__","duration_ms":42}
REAL-SHOW -> {"show_id":"643b840a-…","drive_file_id":"seed-fixture:2024-05-east-coast-family-office","duration_ms":7}
attributed correctly? true
```

That settles three things that were otherwise assumptions: `$1` reused twice with a 5-element param array is accepted by `sql.unsafe`; a missing show yields NULL with no FK violation; a real file resolves to `shows.id`. Do not re-derive them.

**An EXISTING suite pins the old column order and this task must update it (plan R7 F1).** `tests/sync/syncLogSink.persistence.test.ts` asserts `parse_warnings` is the last parameter, at `tests/sync/syncLogSink.persistence.test.ts:22`, `tests/sync/syncLogSink.persistence.test.ts:38`, and `tests/sync/syncLogSink.persistence.test.ts:49`. Appending `duration_ms` breaks all three. No later task owned that file, so Task 1's advertised suites could go green while the repo stayed red — the plan's own suites are not the whole test surface, and a task is green only when the full suite is. Update those three assertions here and add the file to this task's red command.

**Type prerequisites land in THIS task (plan R5 F5).** The sink reads `entry.durationMs`, and `SyncLogEntry` currently ends at `parseWarnings` (`lib/sync/runScheduledCronSync.ts:446-455`). Add `durationMs?: number | null` to `SyncLogEntry` here, in the task that first consumes it — deferring it to Task 2 leaves this task's commit failing `pnpm typecheck`, and a task that cannot typecheck at its own boundary is not green. Task 2 then adds only the CAPTURE (`attemptStartedAtMs`), and adds it to `ProcessOneFileDeps` (`lib/sync/runScheduledCronSync.ts:494-577`) as well as `SyncLogDeps`, because its own `depsWithStart: ProcessOneFileDeps = { ...deps, attemptStartedAtMs }` is typed as the former.

**Implementation.** Change the sink insert to (5 params, not 6 — there is no explicit show id; see spec §3.1.1):

```sql
insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings, duration_ms)
values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb, $5)
```

`makePostgresSyncLogSink` gains only `duration_ms` from the entry. **No explicit show-id parameter** — passing one from inside the cron transaction deadlocks the first-seen applied path against the FK check (spec §3.1.1). Mutant (d) below varies the drive file id, not a show id.

### Task 1's DB oracle — attribution integration test (the probe, executable)


**This task's suite is written and run as part of Task 1, not after it (plan R5 F2).** Two revisions in a row put an integration oracle at a task boundary where the defect it targets had already been repaired: R4 F2 moved the AC-4 case out of Task 5 into here, and here is still downstream of Task 1's sink implementation, so at this boundary AC-1/AC-3/AC-4/AC-5 are already green and the suite has no production defect left to fail on. That is the standalone-test defect this plan rejects in Task 3b's own RED-validity note.

The repair is structural, not another relocation: **this DB suite is Task 1's second RED.** Task 1 writes both its unit test (`tests/sync/syncLog.test.ts`) and this integration suite (the new DB suite named in this task's own red command, created under the `tests/db/` tree per the plan's DB-suite placement rule) BEFORE touching `lib/sync/syncLog.ts`, watches both fail against the four-column sink, then implements once and takes both green in a single commit. The section below stays here as the suite's specification — its scenarios, its traps, and its negative controls — and Task 1's marker owns its execution. Nothing about the assertions changes; only the commit they land in.

AC-4's case is one of them: write an entry with `driveFileId: null`, read the row back through `querySyncLog`, assert `show_id IS NULL` **and** that the insert did not throw. Paired with the positive case in the same run, so a sink that always writes NULL fails the positive half while a sink that rejects NULL fails this one — neither assertion is meaningful alone, because today's sink never binds `show_id` at all.

New DB-backed test. Write attempts through the cron sink for a drive file with a known `shows` row, then assert `querySyncLog({ showId })` returns them.

**This MUST NOT be an extension of `tests/observe/querySyncLog.test.ts`.** That suite mocks `@/lib/supabase/server` wholesale (`tests/observe/querySyncLog.test.ts:11-29`) and asserts on the recorded builder call chain — it never touches a database. A mocked read test can assert `.eq("show_id", …)` was called and stay green forever while no writer ever populates the column, which is exactly how this defect shipped and survived. Per the AGENTS.md "mocked-only tests invite tautological APPROVE" rule, the attribution proof must exercise a real write followed by a real read, in a new file.

The mocked suite still gets its expected update for the select-list change (Task 1 alters no select list, so likely none) — but it is not, and cannot be, the AC-2 evidence.

**Prune oracle (belongs to TASK 5, not here — plan R1 F13: the function does not exist until Task 5, so Task 1's DB oracle could not go green owning it). Stated here only as a cross-reference; the assertions live in Task 5.** It must prove NON-deletion of rows it did not mark (spec R4 F5). Asserting only that marked-new rows survive admits a predicate equivalent to `occurred_at < cutoff OR status = 'skipped'`: the marked old row disappears, the marked new row survives, the global return stays `>= fixtureOldCount`, and every assertion passes while unrelated recent rows are destroyed. So the fixture also inserts a **recent row NOT carrying the marker**, and asserts it survives. Include at least one whose `status` differs from the marker's, since status is the most likely accidental predicate.

**The oracle CANNOT be rollback-only (plan R1 F10).** `querySyncLog` reads through a separate Supabase REST connection (`lib/observe/query/syncLog.ts:23`), so a row written inside the test transaction is invisible to it; and `writeSyncLog` opens and commits its OWN connection whose resolver prefers `TEST_DATABASE_URL` — the validation project. Either shape produces a false negative, a remote mutation, or residue.

Required shape: **commit the fixture, then clean it in a `finally`**, with the target pinned explicitly to loopback for BOTH writer and reader, and an assertion that the two resolve to the same database (compare `current_database()` and the host, or inject one resolved URL into both). A rollback-only variant is only valid for assertions that never cross the connection boundary — the direct `select … from sync_log` readbacks, not `querySyncLog`.

**One readback PER SINK, each landing in the task that repairs that sink (plan R6 F1).** AC-1 spans three writers, and the R5 relocation folded the whole suite into Task 1 — which repairs only the CRON sink. Recovery still binds `$1::uuid` until Task 3 (`lib/sync/runScheduledCronSync.ts:1214`) and onboarding still omits `show_id` until Task 3b (`lib/sync/runOnboardingScan.ts:659`), so a Task 1 commit owning all three readbacks could not go green without silently dropping two of them. The file is written once, in Task 1, with the cron cases live; the other two cases are added by the tasks that make them passable:

| Readback | Written and taken green in | Because that task repairs |
| --- | --- | --- |
| cron sink (AC-1 cron clause, AC-2, AC-3, AC-4, AC-5) | Task 1 | `lib/sync/syncLog.ts` |
| recovery sink (AC-1 recovery clause) | Task 3 | `insertSyncLog`'s explicit-id channel |
| onboarding sink (AC-1 onboarding clause) | Task 3b | `runOnboardingScan`'s sink |

Each of those three tasks therefore has a DB-level RED as well as its structural one, and each reaches green at its OWN boundary — the property R1 F6 established and the R5 merge broke for two of the three. The acceptance index credits AC-1 to Tasks 1, 3, 3b, 3c for exactly this reason. Each of the three gets its own write-then-read-back, or its AC-1 clause is unproven.

**Anti-tautology:** assert against the row read back from the DB, not the param array. Derive the expected show id from the fixture. Duration asserted against a known injected delta, not `> 0`. **Negative control (AC-2):** the same query for an unrelated show id returns zero rows — without it, green is equally consistent with the filter being ignored.

**AC-5 is a separate, end-to-end test:** process a first-seen file through the full locked path against a live DB with a bounded timeout; assert it completes (no deadlock) and lands `show_id IS NULL`. A two-committed-fixture test does not exercise that topology and would have passed against the deadlocking design.

**Premise (executable, per `tests/_shared/premise.ts`):** assert the `shows` row exists before asserting attribution — otherwise the test passes vacuously on an empty fixture, which is this spec's own defect class.

**Skip hazard — closed executably, not by intention.** `TEST_DATABASE_URL` is non-loopback on this worktree, so loopback-guarded DB tests SKIP, and a skipped test is indistinguishable from a passing one in the summary line.

Use the shared helper `unreachableDbFailure` (`lib/driveIdCoverage/introspect.ts:132-148`) rather than hand-rolling the condition. It already carries the hardening this class needs: its own comment records that an earlier draft's `if (!opts.ci)` let a CI wrapper exporting `CI=` silently disable the guard, so it keys on **presence** of `CI`, not truthiness (`lib/driveIdCoverage/introspect.ts:139-142`).

Fail loudly when the probe fails and EITHER condition holds:
- `CI` is set (any value, including empty) — via `unreachableDbFailure`
- a DB URL was explicitly configured — the `DB_URL_EXPLICIT` shape at `tests/sync/qualityRegressionLifecycle.test.ts:449-459`

Only a completely unconfigured local dev environment may skip clean.

**Test-file template — with one deliberate divergence (plan R2 F4).** Follow `tests/db/driveFileIdNonblank.db.test.ts` for the driver and `assertLocalDbUrl` usage. **Do NOT apply its always-rollback rule to the `querySyncLog` assertions**: that reader opens a separate connection and cannot see an uncommitted row, so rollback would leave Task 1's DB oracle permanently red for the wrong reason. Rollback applies only to assertions that never cross the connection boundary (the direct `select … from sync_log` readbacks); the `querySyncLog` case commits its fixture and cleans it in a `finally`.

**`sinceHours` trap (verified at `lib/observe/query/syncLog.ts:28`).** `querySyncLog` defaults `sinceHours` to **24** when the field is `undefined`; only an explicit `null` removes the time bound. A fixture whose rows are older than 24h therefore yields `rows: []` — an empty result that looks exactly like the bug under test, inside the very test meant to prove the bug is fixed. The test MUST pass `sinceHours: null` explicitly, and must additionally assert a **negative control**: the same query against a different show's id returns zero rows, so a green result cannot come from the filter being ignored.

**Service-role requirement.** `querySyncLog` constructs `createSupabaseServiceRoleClient()` (`lib/observe/query/syncLog.ts:23`), so the test needs `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` present. Absent it, the call throws and is swallowed into `{ kind: "infra_error" }` (`lib/observe/query/syncLog.ts:52-54`) — assert on `kind === "ok"` before asserting on rows, or an infra fault reads as "no rows."

## Task 2 — Capture the attempt start and thread it to the sink

<!-- task: red=`pnpm vitest run tests/sync/runScheduledCronSync.test.ts -t logSync tests/sync/perFileProcessor.test.ts` ac=AC-6 -->

**RED validity — the claimed existing RED was false (plan R1 F3).** `tests/sync/runScheduledCronSync.test.ts:2662` observes the dependency object handed to a MOCKED `processOneFile`, not the `SyncLogEntry` built inside the real `logSync`, so adding a field to that entry cannot fail it; the later sink assertion is `expect.objectContaining`, not exact. This task therefore WRITES its RED: a new duration assertion against the entry the real helper constructs, with an injected clock and a known delta. The production line is the entry construction inside `logSync` (`lib/sync/runScheduledCronSync.ts:2241-2249`).

`SyncLogEntry.durationMs` is NOT added here — Task 1 adds it, as `durationMs?: number | null`, because Task 1 is its first consumer and a task that cannot typecheck at its own boundary is not green (plan R5 F5). Re-adding it here duplicates the property or narrows the nullable type Task 1 established (plan R6 F2). This task adds `attemptStartedAtMs` — to `ProcessOneFileDeps` as well as `SyncLogDeps`, since the `depsWithStart: ProcessOneFileDeps` object below is typed as the former — and **not** `showId` (plan R1 F2: an explicit show-id channel is the design the spec rejected in §3.1.1, and Task 1's own text forbids it) (`lib/sync/runScheduledCronSync.ts:446-456`); add **both** `attemptStartedAtMs?: number` **and** `now?: () => Date` to `SyncLogDeps` (plan R1 F2: `logSync` computes `now() - start`, so a widening carrying only the start cannot read `deps.now` under the declared parameter type and would fall back to ambient time, defeating the injected-delta oracle) (`lib/sync/runScheduledCronSync.ts:2218-2220`).

**An EXISTING suite pins the exact logged object (plan R7 F2).** `tests/sync/perFileProcessor.test.ts:982` asserts the logged entry by exact shape; once every `processOneFile` invocation carries a captured start, that entry gains `durationMs` and the assertion fails. Same class as Task 1's persistence suite, and the second measured instance: the plan's per-task red commands name only the suites a task ADDS, never the ones it breaks. Update that assertion here and add `tests/sync/perFileProcessor.test.ts` to this task's red command.

**Class sweep, at plan time rather than at the third finding.** Before implementing either task, run `rg -l "sync_log|logSync|insertSyncLog" tests/` and check every hit for an exact-shape or positional assertion over the sink's columns, entry object, or parameter array. Two were found by review; the sweep is what establishes there is no third. Record its output in the task's commit message.

**Exact injection point.** `processOneFile(driveFileId, mode, fileMeta, deps: ProcessOneFileDeps = {})` (`lib/sync/runScheduledCronSync.ts:2707-2712`). Capture at the top, before `prepareProcessOneFile`, then bind once:

```ts
const attemptStartedAtMs = (deps.now?.() ?? new Date()).getTime();
const depsWithStart: ProcessOneFileDeps = { ...deps, attemptStartedAtMs };
```

**Both call sites must use `depsWithStart`, not `deps`** — this is the easy miss. The archived/skip branch calls `logSync(deps, ...)` with the RAW deps at `lib/sync/runScheduledCronSync.ts:2742`, while the main branch routes through `txBoundProcessDeps(lockedTx, deps, txDeps)` at `lib/sync/runScheduledCronSync.ts:2755`. Substituting only the second leaves every skip-path row with a NULL duration while the tests (which mostly exercise the main path) stay green. Propagation past `lib/sync/runScheduledCronSync.ts:2755` is then free, since `txBoundProcessDeps` returns a `ProcessOneFileDeps` (`lib/sync/runScheduledCronSync.ts:2301-2306`).

**Do not** confuse this with the outer `SyncPipelineTxBoundDeps` param (`lib/sync/runScheduledCronSync.ts:457-459`) — it carries no `logSync`, and since `logSync?` is optional, a change routed there typechecks and silently no-ops.

Guards: absent start → SQL `NULL`, never NaN; non-monotonic clock → clamp at 0.

**`undefined` is NOT `NULL` to Postgres.js, and the difference throws (plan R7 F3).** An earlier revision wrote "`undefined` (NULL)" as if the driver coerced. It does not: the postgres.js driver raises `UNDEFINED_VALUE` for an undefined bind parameter, and `writeSyncLog` constructs its client with no `transform.undefined` option (`lib/sync/syncLog.ts:51`). Every NULL-duration writer in spec §3.3.1 would therefore THROW instead of persisting a row — the two run-level emits, the escaped-throw emit, the push preflight/failure/duplicate emits, and both webhook direct-error classes, the last of which visibly pass no duration at all (`app/api/drive/webhook/route.ts:218`, `app/api/drive/webhook/route.ts:234`). That is strictly worse than the bug this arc repairs: today those rows land unattributed; under the broken form they would not land.

The sink binds `entry.durationMs ?? null`, never `entry.durationMs`. Its test needs a case the pasted probe cannot express — the probe exercises durations `42` and `7`, both defined, so it passes either way. Add a third case that emits an entry with NO `durationMs` property at all and asserts the row lands with `duration_ms IS NULL` and no throw. That case is the whole oracle for §3.3.1's writers, and it is a DB-level case: a unit mock cannot reproduce the driver's undefined rejection.

**The duration oracle is BRANCH-complete, not path-complete (spec R4 F1).** Five distinct behaviors, five assertions. A suite exercising only the applied path satisfies the known-delta assertion while leaving every one of these free — and `rg "duration_ms|attemptStartedAt" tests` confirms no existing write-side oracle covers any of them:

| # | Behavior | Assertion |
| --- | --- | --- |
| 1 | Prepared skip (`lib/sync/runScheduledCronSync.ts:2742`) | row carries the injected delta, not NULL |
| 2 | Lock-contended skip (`lib/sync/runScheduledCronSync.ts:2761`) | same |
| 3 | Manual first-seen apply (`lib/sync/runManualStageForFirstSeen.ts:147-158`) | same, via its own capture site |
| 4 | Reuse hazard (`lib/sync/runScheduledCronSync.ts:3877-3942`) | **Assert the shared object is NOT mutated**, not merely that two rows differ. Plan R1 F14: the file loop is sequential, so an implementation assigning `deps.attemptStartedAtMs = freshStart` on every invocation mutates the shared `processDeps` and STILL gives both rows correct durations — a two-file duration comparison cannot distinguish it. Snapshot the deps object's own keys before the run and assert it is unchanged after — reference-identity is NOT an acceptable alternative (plan R2 F3): the mutant `deps.attemptStartedAtMs = freshStart; const depsWithStart = { ...deps }` mutates the shared object AND yields a non-identical per-file object AND gives both rows correct durations. |
| 5 | Missing start / backward clock | NULL and 0 respectively — never NaN, never negative |

## Task 3 — Recovery sink resolves by subselect; explicit parameter retired

<!-- task: red=`pnpm vitest run tests/sync/runOfShowSyncLogChannel.test.ts tests/db/syncLogAttribution.db.test.ts` ac=AC-1 -->

**RED validity — the existing suite is NOT the red (plan R4 F3).** `tests/sync/runOfShowSyncLogChannel.test.ts:199-250` tests parse-warning preservation: it declares `insertSyncLog(entry, showId?)` and calls it with `"show-1"`, so current production — explicit parameter, `$1::uuid` in the insert — satisfies it completely. Naming that suite as the oracle would let this task begin green.

The RED is a NEW assertion added to that file, and it must fail on production source before the edit:

1. Capture the recovery insert's SQL through the same `sql` spy the file already uses and assert it **normalizes to** the expected statement — the same `normalize()` Task 1 uses, comments stripped before whitespace collapse. NOT containment (plan R5 F6): Task 1 forbids containment for exactly this reason, and an appended suffix or a subselect parked in a comment satisfies a containment check while the live statement still binds `$1::uuid`. The two tasks assert the same way or the weaker one is the real contract.

2. Assert the parameter array is `[entry.driveFileId, status, message, parseWarnings]` — **FOUR** elements (plan R5 F1). An earlier revision said five, claiming production has six; production has five (`lib/sync/runScheduledCronSync.ts:1220-1230`) and the target has four, because `$1` is reused for both the subselect and `drive_file_id` and this writer carries no duration (spec §3.3.1 — recovery is a NULL-duration writer). Five would be a bind-count error at runtime. The discriminating assertion is not the length but `params[0] === entry.driveFileId`: today `params[0]` is the show id, so the binding demonstrably flipped.

3. A type-level pin that `insertSyncLog` accepts exactly one argument, so the retired channel cannot return as an optional parameter nobody passes. Follow the type-removed precondition pattern: a source scan of the `ManualRecoveryTx.insertSyncLog` declaration (`lib/sync/runScheduledCronSync.ts:490`) AND of the duplicate at `lib/sync/runManualSyncForShow.ts:88-99` (plan R2 F13), since a removed type cannot be asserted by a compiling test.

Production line under test: `lib/sync/runScheduledCronSync.ts:1216-1219`.

`insertSyncLog(entry, showId?)` currently takes an explicit id (`lib/sync/runScheduledCronSync.ts:490`). **Retire that parameter** and resolve by the same subselect, so the recovery sink cannot reintroduce the uncommitted-reference hazard from a future caller. Update the four call sites (`lib/sync/runScheduledCronSync.ts:2581`, `lib/sync/runScheduledCronSync.ts:2636`; `lib/sync/runManualSyncForShow.ts:175`, `lib/sync/runManualSyncForShow.ts:224`) **and the duplicate declaration on `ManualRecoveryTx` at `lib/sync/runManualSyncForShow.ts:88-99` (plan R2 F13)** — leaving that one advertises the rejected explicit-ID channel in the type while the implementation has dropped it.

## Task 3b — Onboarding-scan sink + its seven callers (with their regression pin)

**Pin lands WITH the repair, not before it (plan R1 F6).** An earlier revision put all fifteen assertions in a standalone Task 3a that had no implementation of its own and so could never reach green at its own boundary — seven assertions stayed red until 3b and eight until 3c, breaking the mandatory failing-test → implementation → passing-test → commit sequence. The pin is therefore split: the seven superseded assertions land in THIS task's `syncLogRepairSites` suite alongside the caller fix that makes them pass, and the eight entry-point assertions land in Task 3c with theirs.

The enumeration is still deliberate (a regression pin, not a cover — see the acceptance index), and the file is still deleted when `BL-SYNC-LOG-ATTRIBUTION-METATEST` lands.

<!-- task: red=`pnpm vitest run tests/sync/onboardingScanSyncLogAttribution.test.ts tests/sync/syncLogRepairSites.test.ts tests/db/syncLogAttribution.db.test.ts` ac=AC-1 -->

**This test file is NEW.** a `runOnboardingScan` test file does not exist (an earlier plan draft cited it — corrected by the pre-draft verification pass), and `grep -rn "insert into public.sync_log" tests/` shows no test asserts the onboarding sink's SQL at all. The only production-sink assertion in the repo is `tests/sync/runOfShowSyncLogChannel.test.ts:228`, which covers `insertSyncLog`. So there is no existing RED to extend; the task creates one.

**RED validity.** Production line: the insert literal at `lib/sync/runOnboardingScan.ts:659-670`, which names four columns and no `show_id`.

Spec R1 finding 2: `lib/sync/runOnboardingScan.ts:536-540` supports re-onboarding a file that already has a `shows` row, so its file-scoped emissions are attributable-but-NULL today. Leaving this writer alone violates the consequence bound.

**Two edits, and the caller one is easy to miss.** Spec R2 finding 1: repairing the sink SQL alone still leaves seven rows NULL, because those callers never pass a `driveFileId` at all.

*Edit A — sink SQL* (`lib/sync/runOnboardingScan.ts:659-670`), binding `[driveFileId ?? null, code, message, payload]`:

```sql
insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings)
values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb)
```

*Edit B — the seven callers.* All are byte-identical, so this is one `replace_all`:

```ts
// from
await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
// to
await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN, driveFileId: file.driveFileId }));
```

Sites: `lib/sync/runOnboardingScan.ts:740`, `lib/sync/runOnboardingScan.ts:826`, `lib/sync/runOnboardingScan.ts:842`, `lib/sync/runOnboardingScan.ts:863`, `lib/sync/runOnboardingScan.ts:896`, `lib/sync/runOnboardingScan.ts:922`, `lib/sync/runOnboardingScan.ts:1019`. **Scope verified per site** — six are inside `scanPreparedFileWithTx` (`lib/sync/runOnboardingScan.ts:719`), one inside `recordLiveRowConflict` (`lib/sync/runOnboardingScan.ts:1001`), and all seven have `file.driveFileId` in lexical scope. **Assert exactly 7 replacements**; 6 or 8 means the file moved and the site list must be re-derived, not patched.

**Do NOT touch `lib/sync/runOnboardingScan.ts:1134`** — the run-level readiness emit is genuinely unattributable and is a seed row in the filed guard's `RUN_LEVEL_SYNC_LOG_SITES` (`BL-SYNC-LOG-ATTRIBUTION-METATEST`), not a deliverable here.

## Task 3c — Manual entry points install a sink (with their regression pin) + the two fenced gap markers

<!-- task: red=`pnpm vitest run tests/sync/manualSyncInstallsSink.test.ts tests/sync/syncLogRepairSites.test.ts` ac=AC-1 -->

**Scope fence, ratified 2026-08-09 (spec §6.2).** This task wires sinks. It does **not** make manual sync observable, and must not claim to. Spec R8 F1 measured `logSyncCalls: 0` on four `runManualStageForFirstSeen` branches even with a sink installed, because those branches return before the sole emission at `lib/sync/runManualStageForFirstSeen.ts:147`; and `runManualSyncForShow` awaits `runOne` with no catch, so a throw escapes unlogged. That gap is filed as `BL-MANUAL-SYNC-UNEMITTED`.

So the RED for this task asserts **the sink is installed and reaches the pipeline**, not that a row appears for every manual outcome. A test asserting rows-per-outcome would fail for reasons this task does not own, and "fixing" it would silently pull the filed work back in.

**The largest real gap in the arc (spec R5 F1).** `SyncLogDeps.logSync` is optional and emitted via optional chaining (`lib/sync/runScheduledCronSync.ts:2218-2220`, `lib/sync/runScheduledCronSync.ts:2250`), and **no** production manual entry point supplies one — so manual applied/skipped/error outcomes write no row at all. Not NULL: absent. That is silence, which the consequence bound forbids outright, and it leaves `observe synclog --show` blind to the operator's most deliberate action even after the sink is perfect.

**RED validity.** New test asserting each entry point forwards a sink into the pipeline. The production defect is the absent `logSync` property at each call site; the test cannot pass until they carry it. It is NOT test-local — the existing `tests/sync/runOfShowSyncLogChannel.test.ts:172-185` injects `logSync` itself, which is exactly why it proved a test-only path and missed this for the whole arc.

**This task uses the FIXED eight-site list below; the derivation discussion is BACKGROUND for the filed guard (plan R3 F1).** An earlier revision presented a derived importer rule here, which contradicts the fixed-pin decision and would let an implementer build the descoped guard. What this task ships is the list.

*Background, retained because `BL-SYNC-LOG-ATTRIBUTION-METATEST` cites it:* My own verification grep missed `app/api/admin/pending-ingestions/[id]/retry/route.ts:427-433` because its callee is `deps.runManualSyncForShowUnlocked` — a different exported name than the four shapes I pattern-matched. That is the fourth instance in this arc of a hand-list coming up short, this time in the verification method rather than the artifact. **The pin is a FIXED fifteen-site enumeration, NOT a derived cover (plan R2 F1).** An earlier revision described both, which let an implementer build the very derived guard the spec descoped. Spec §3.6 and `BACKLOG.md` are explicit: the derived recognizer is filed work; this change ships a fixed list only, and its file-level rule must be per-CALL so one instrumented call cannot launder a sinkless one in the same file.

**Accept-set reasoning below is BACKGROUND for the filed guard, not an instruction for this task.** It is kept because the filed entry cites it: An export is an entry point iff its own signature accepts a deps object that can carry `logSync`. Transitive reachability had no stopping condition: `unarchiveShow` reaches a writer, so it became an entry point, so ITS caller owed a sink, and so on up the graph — and no marker was truthful there, since once the sink is wired into `unarchiveShow` the attempt does emit. Signature-keyed terminates by construction and is decidable from the callee alone. `unarchiveShow`'s `deps?: { rpc?, runManualSyncForShow? }` carries no `logSync`, so it is a CALLER that must pass one inward — which is this task — and its own callers inherit nothing.

*Background (same filed guard), NOT an instruction for this task:* key the check on the IMPORT, never the call name. `lib/showLifecycle/unarchiveShow.ts:7` imports `runManualSyncForShow as defaultRunManualSyncForShow` and calls it at `lib/showLifecycle/unarchiveShow.ts:32` through a local alias (`catchUp = deps?.runManualSyncForShow ?? default…`); `app/api/admin/show/pull-sheet-override/route.ts` binds the same import as `runSync`. Three distinct local names for one import — a callee-name match finds none of them, and both renames are ordinary authoring, squarely inside the threat model rather than the fenced-out obfuscation limit.

*Background rule, for the filed guard only:* a file importing an exported sync entry point must supply a sink at some call, or carry a site exemption. Import presence is file-local, so no interprocedural analysis is needed — the indirection through `app/admin/show/[slug]/_actions/unarchive.ts:34` never has to be traced, because the direct caller is itself in a scanned root and is the right site to name.

Census — **two of ten** production entry points install a sink today (`app/api/cron/sync/route.ts:21` and `app/api/drive/webhook/route.ts:230`); the eight below do not.

**No type widening is needed.** `RunManualStageForFirstSeenDeps` already carries `logSync?: ProcessOneFileDeps["logSync"]` (`lib/sync/runManualStageForFirstSeen.ts:63`). An earlier revision of this plan mandated adding it, from a grep window that stopped one line short (plan R1 F18). Callers can pass a sink today; the defect is only that they do not.

**The shape differs per site — "one property each" was wrong (plan R2 F2).** `RunManualSyncForShowDeps` exposes `processDeps?: ProcessOneFileDeps` (`lib/sync/runManualSyncForShow.ts:48-71`), NOT a top-level `logSync`, so six direct/manual-unlocked sites and pull-sheet override need the **nested** form `{ processDeps: { logSync: writeSyncLog } }`. `lib/showLifecycle/unarchiveShow.ts:11` types `CatchUpSync` as a **two-argument** function, so its call cannot forward a third argument at all without widening that alias or wrapping the default. Only the pending first-seen call takes top-level `logSync`, via the already-widened `RunManualStageForFirstSeenDeps`. Following a uniform "one property" instruction would fail typecheck or leave calls sinkless.

**The eight call sites below ARE the contract for this task.** Task 3c's own pin covers exactly these eight and nothing else; the fixed list is the whole cover claim, and no derived or import-based recognizer ships here. Two of the eight surfaced only after a six-site list was published — that history is why the DERIVED guard is filed as `BL-SYNC-LOG-ATTRIBUTION-METATEST`, and it is not a licence to build that guard inside this task. A ninth site discovered later is a new finding against the filed entry, not a failure of this pin.

| Site | Current shape |
| --- | --- |
| `app/api/admin/sync/[slug]/route.ts:94` | no `processDeps` |
| `app/admin/dev/actions.ts:622` | no `processDeps` |
| `app/admin/show/[slug]/_actions/roleToken.ts:184` | no `processDeps` |
| `app/admin/show/[slug]/_actions/useRaw.ts:168` | no `processDeps` |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:427-433` | `deps.runManualSyncForShowUnlocked(..., {})` — note the DIFFERENT callee name |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:480-488` | first-seen `stageDeps`, no logger |
| `lib/showLifecycle/unarchiveShow.ts:32` | two-arg call through a local alias (`catchUp`); reached from `app/admin/show/[slug]/_actions/unarchive.ts:34` (spec R6 F1) |
| `app/api/admin/show/pull-sheet-override/route.ts:213` | two-arg call through a local alias (`runSync`, defaulting to the real function) (spec R6 F1) |

**Also fix the two lying comments** at `app/admin/show/[slug]/_actions/useRaw.ts:162` and `app/admin/show/[slug]/_actions/useRaw.ts:173`, which assert that logging already happens here. They are false today and they are part of why this went unnoticed — a comment claiming a mechanism is the same defect class as a spec claiming one.

**Also install the two fenced gap markers (plan R1 F12).** The approved spec §6.2 requires them and no task owned them; the plan referenced a nonexistent "the filed guard". Add `// sync-log-emission-gap: BL-MANUAL-SYNC-UNEMITTED` at `app/api/admin/staged/[fileId]/apply/route.ts:152` and `app/api/admin/show/staged/[stagedId]/apply/route.ts:164`. Without them the fenced attempts stay silently unemitted rather than explicitly signaled, which is the difference between a documented limit and an undocumented one.

**Ordering:** after Task 1, which creates the DB suite this task extends. An earlier revision said "before Task 4" and a mechanical rename turned that into a claim that Task 3c precedes Task 1's oracle — backwards, since Task 3c is sequenced afterward (plan R6 F1). (the derived meta-test was descoped — so 3b/3c no longer have a guard turning red before them; their REDs are their own tests.)

## Task 5 — Migration: indexes, prune function, cron schedule

<!-- task: red=`pnpm vitest run tests/db/syncLogIndexesAndPrune.db.test.ts tests/cross-cutting/pg-cron-coverage.test.ts` ac=AC-7,AC-8 -->

**Writing the migration file is not applying it (plan R7 F4).** No task applied the migration to the LOCAL database, so every live-DB assertion in this task's red command — indexes in `pg_indexes`, `prune_sync_log` in `pg_proc`, the `cron.job` row — would stay red after a perfectly correct SQL file, and Task 7's `pnpm gen:schema-manifest` would introspect a database that has never seen the function. The only apply anywhere in the plan targeted the validation project, in Task 8, two tasks later.

The implementation step is therefore: write the new migration under `supabase/migrations/` (stem `20260809000000_sync_log_show_attribution`), then apply it to the local stack — `psql -v ON_ERROR_STOP=1 "$LOCAL_TEST_DATABASE_URL" -f supabase/migrations/20260809000000_sync_log_show_attribution.sql` — and re-run the suite. `LOCAL_TEST_DATABASE_URL`, not `TEST_DATABASE_URL`: the latter points at the validation project (`AGENTS.md:20`), and applying here by that variable is the exact hazard Task 5b's guard exists to stop. Do NOT use `supabase db reset` — it rolls back on pg_cron in this project's local stack.

**Returned count: measured-baseline equality, NOT fixture-scoped (plan R5 F7).** `prune_sync_log` returns a GLOBAL count, so a fixture-scoped count is the wrong oracle for it and the two instructions cannot both hold. Survival assertions stay scoped to the fixture marker; the RETURNED count is asserted equal to `select count(*) from public.sync_log where occurred_at < <cutoff>` read inside the same rolled-back transaction immediately before the prune. Same rule, same rationale, as the `app_events` repair in Task 5b.

**The prune assertions run inside an always-rolled-back transaction (plan R3 F6).** An uncommitted prune cannot permanently delete unrelated old local rows; a committing one can, and asserting only `>=` on the return leaves that invisible. Roll back, and scope every count to the fixture marker.

**New DB assertions are required — none exist today.** `rg "sync_log_show_id_idx|sync_log_drive_file_id_idx|prune_sync_log|sync_log_prune" tests` returns nothing, and `tests/db/schema.test.ts:293-303` inspects CHECK syntax, not indexes. Per spec §5, assert: both public indexes in `pg_indexes` with column order and DESC; both dev indexes when `to_regclass('dev.sync_log')` is non-null, plus a migration-text assertion that the `to_regclass` guard is present so an ungated form cannot ship; `prune_sync_log` in `pg_proc` with `prosecdef` and `search_path`; `has_function_privilege` positive for `service_role` and negative for `anon`/`authenticated`; prune behavior across the cutoff asserting BOTH the returned count and that newer rows survive; and the `cron.job` row's command, schedule, **and `active = true`** (plan R2 F12: a migration that schedules the correct command and then disables the job satisfies every other assertion while retention never runs). Also assert `proargdefaults` decodes to 60 days AND exercise the no-argument `prune_sync_log()` call the cron command actually issues (plan R1 F15).

the new migration under `supabase/migrations/`:

- `create index if not exists sync_log_show_id_idx on public.sync_log (show_id, occurred_at desc);` plus the `drive_file_id` companion. Naming mirrors `sync_audit_show_id_idx` (`supabase/migrations/20260501001000_internal_and_admin.sql:218`).
- **dev block MUST be existence-guarded** (SF-1). A bare `create index ... on dev.sync_log` raises on any target lacking the clone, and the validation project is exactly that. There is no `if exists` form of `create index` that guards the table, so use `do $$ ... if to_regclass('dev.sync_log') is not null then ... end if; $$`.
- `prune_sync_log(retain interval default interval '60 days')` mirroring `prune_app_events` (`supabase/migrations/20260629000002_app_events.sql:32-45`) exactly: `returns integer`, `language sql`, `security definer`, `set search_path = public, pg_temp`, revoke from `public, anon, authenticated`, grant execute to `service_role`.
- **In the SAME commit** (this is why Task 6 was merged here): `EXPECTED_NON_FXAV_NON_ORPHAN_CRONS` (`tests/cross-cutting/pg-cron-coverage.test.ts:107`) → `["app_events_prune", "sync_log_prune"]`. The assertion at `tests/cross-cutting/pg-cron-coverage.test.ts:461` is exact array equality over the live job set, so the migration without the row fails and the row without the migration fails — they are one atomic change, not two tasks.
- Self-guarded `do $$` unschedule-then-schedule for job `sync_log_prune`, mirroring `supabase/migrations/20260629000002_app_events.sql:53-64`, on an off-peak minute distinct from `17 4 * * *`.

## Task 5b — Extend the destructive-target guard to cover prune

<!-- task: red=`pnpm vitest run tests/db/_metaDestructiveDbTargetGuard.test.ts` ac=AC-8 -->

**Why this is a deliverable, not an assumption.** Spec R3 F6: the spec had claimed the existing meta-guards already covered the prune hazard. They do not. `EXECUTES_WIPE` (`tests/db/_metaDestructiveDbTargetGuard.test.ts:35`) matches only `reset_validation_data`, and `tests/db/_metaLocalDbUrlGuard.test.ts:122` scans only `LOCAL_TEST_DATABASE_URL` — never the `TEST_DATABASE_URL` that points at validation and that `lib/sync/syncLog.ts:8-14` prefers. A prune test wired through it passes both guards and deletes shared validation history.

**RED validity — the obvious RED is VACUOUS (plan R1 F8).** "The prune test is not discovered" makes the guard suite pass, not fail; an undiscovered destructive test is exactly the silent-pass defect, so absence of discovery cannot be the red signal.

The real RED is an assertion on the discovery itself: extend the existing anti-vacuity test (`tests/db/_metaDestructiveDbTargetGuard.test.ts:66-72`), which today names only the two wipe files, to also require the prune test in `destructive`. That fails against the current discovery filter and passes once `EXECUTES_PRUNE` is added — a red that comes from production source rather than from something not happening.

**Edit A** — third discovery pattern beside `EXECUTES_WIPE` (`tests/db/_metaDestructiveDbTargetGuard.test.ts:35`) and `ENABLES_WIPE_GATE` (`tests/db/_metaDestructiveDbTargetGuard.test.ts:39-41`), and widen the filter at `tests/db/_metaDestructiveDbTargetGuard.test.ts:60-62`:

```ts
/** Executes a retention prune. Deletes by time window against whatever DB it is
 *  pointed at, so it is destructive in exactly the sense this guard exists for. */
const EXECUTES_PRUNE = /\bselect\s+public\.prune_(?:sync_log|app_events)\s*\(/i;
```

`prune_app_events` is folded in deliberately: identical hazard, no current coverage, one alternation to fix. That is the class-sweep default (repair every instance of the shape in the same PR) rather than filing a peer for something free to fix here.

**Edit C — close all three name-match holes. No deferral branch (plan R1 F9, restated after R2 F5 found my removal had also deleted this section).** `CALLS_LOCAL_GUARD` (`tests/db/_metaDestructiveDbTargetGuard.test.ts:42-43`) matches a call whose NAME looks right. It does not establish (a) that the guarded value is the URL passed to `postgres`, (b) that the call precedes the connection, or (c) that the callee is the imported guard rather than a local same-named function.

Close (c) by resolving the callee to an import of `@/tests/db/_localDbUrl` — the correction `_metaLocalDbUrlGuard` already made for itself. Close (a) by asserting in the discovered file's AST that the identifier passed to `postgres(...)` is the binding the guard call returned, accepting the inline `postgres(assertLocalDbUrl(...))` form. Close (b) by requiring the guard call's position to precede the `postgres(` call in the same file.

None of these may be filed as a documented limit. The thing guarded is deletion of shared data, and R2 F6 found a live instance already.

**Each closure needs a synthetic negative, or it is a claim (plan R3 F5).** Asserting only that the two real files PASS proves nothing about (a)/(b)/(c) — both real files are already correct, so an analyzer returning `ok` unconditionally satisfies every positive assertion. Extract the per-file analysis as a pure function over source text, `analyseDestructiveFile(source: string): { ok: boolean; reason?: string }`, and drive it with fixture strings in the same suite. Three mutants, each of which MUST be rejected, each named for the hole it demonstrates:

**Mutants (a) and (b) MUST carry the real import (plan R4 F5).** Without it, an analyzer implementing only closure (c) — "a valid import of the guard is present" — rejects all three mutants and accepts both controls while binding equality and ordering stay unimplemented. Each mutant must differ from a passing control in EXACTLY the one property it names:

```ts
// (a) wrong-value binding. Valid import present, guard called, correct ORDER.
// Differs from the control only in WHICH string is guarded.
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";
const url = process.env.TEST_DATABASE_URL!;
assertLocalDbUrl("postgresql://localhost:54322/postgres");
const sql = postgres(url);

// (b) post-connection ordering. Valid import; the connected identifier IS the
// one the guard call assigns, so binding equality holds. Differs from the
// control only in ORDER - the assignment happens after the connection opens.
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";
let url = process.env.TEST_DATABASE_URL!;
const sql = postgres(url);
url = assertLocalDbUrl(url);

// (c) local shadowing. Right value, right order, NO import - the name resolves
// to a local no-op. Differs from the control only in CALLEE RESOLUTION.
const assertLocalDbUrl = (u: string | undefined) => u!;
const sql = postgres(assertLocalDbUrl(process.env.TEST_DATABASE_URL));
```

Read as a set they are a one-property-at-a-time discrimination. The earlier revision's mutant (b) passed the raw expression to `postgres` and discarded the guard's return, so it violated ordering AND binding equality at once — an analyzer implementing import resolution plus binding equality, with no ordering check at all, rejected all three mutants and accepted both controls (plan R5 F4). The `let` form above fixes that: `url` is assigned from the guard call, so a binding check sees the connected identifier bound to the guard's return and passes it; only an ordering check rejects it.

The resulting matrix — each row an analyzer implementing exactly that check, each cell whether the mutant is caught:

| Analyzer implements | (a) binding | (b) ordering | (c) import |
| --- | --- | --- | --- |
| import resolution only | missed | missed | caught |
| binding equality only | caught | missed | missed |
| ordering only | missed | caught | missed |

No single check catches more than one, and no pair catches all three, which is what makes the closure non-tautological. Note that `const`-bound forms cannot express (b) at all — using a binding before its declaration is a temporal-dead-zone error, not a mutant — which is precisely why the operator needs `let`.

Plus one positive control per accepted form — the two-step `const url = assertLocalDbUrl(...); postgres(url)` and the inline `postgres(assertLocalDbUrl(...))`, both with the real import — so an analyzer cannot pass by rejecting everything. Closure set for Edit C is those three mutants; for Edit A it stays the two regex operators (drop `sync_log`, drop `app_events`). Five operators, each breaking a named assertion.

**Edit B-pre — repair the LIVE hit the new pattern discovers (plan R2 F6).** `EXECUTES_PRUNE` folds in `prune_app_events`, and `tests/log/appEventsSchema.test.ts` executes it at `tests/log/appEventsSchema.test.ts:66` while resolving its URL from `process.env.TEST_DATABASE_URL` with **no loopback guard** (`tests/log/appEventsSchema.test.ts:5`). That is a real, present hazard — the validation project's `app_events` can be pruned by an existing test today, independent of this change — and it means Task 5b **cannot reach green** until that file calls `assertLocalDbUrl`. Repair it in this task and name it in the anti-vacuity list.

**The loopback guard is necessary and NOT sufficient (plan R4 F4).** Pinning the URL to localhost stops the validation project from being pruned; it does nothing about the LOCAL database, where that test still commits a global `prune_app_events` and accepts `n >= 1`. Old unrelated local rows are deleted permanently on every run, and a prune returning a wrong count stays green. The same repair Task 5 applies to the new sync-log suite applies here, and this task owns it:

1. Wrap the prune call in a transaction that is ALWAYS rolled back, so no committed deletion escapes the test.
2. Replace `n >= 1` with an exact oracle. The function's return is a GLOBAL count and the suite cannot know how many unrelated old rows exist, so derive it: inside the same rolled-back transaction, read `select count(*) from public.app_events where occurred_at < <cutoff>` immediately before the prune and assert the returned count equals that number exactly. That is an equality against a measured baseline, not a guess, and it fails on an off-by-one or a wrong cutoff.
3. Keep the survival assertions scoped to the fixture marker, which stays correct under rollback.

The same three points bind Task 5's new sync-log suite — its "scope every count to the fixture marker" is a survival oracle only, and the returned-count oracle is this measured-baseline equality.

**Mutation-family closure (plan R2 F6).** The anti-vacuity list must name BOTH discovered prune tests, not just the new sync-log one: deleting `|app_events` from the regex would otherwise make the existing unsafe test vanish from discovery while every planned assertion still passes. That is the mutation this guard most needs to fail on, and the closure set for this task is exactly the two operators — drop `sync_log`, drop `app_events` — each of which must break an assertion.

**Edit B** — extend the anti-vacuity list at `tests/db/_metaDestructiveDbTargetGuard.test.ts:66-72` with the new prune test file, so the pattern is proven to match something. Without it the extension can rot into a silent no-op, which is precisely what that test's own comment warns about: *"If this fails, the regexes drifted and every assertion below is vacuous."*

The existing inline exemption (`tests/db/_metaDestructiveDbTargetGuard.test.ts:46`, `// not-subject-to-destructive-target-guard:`) remains the escape hatch for a genuinely local-only helper.

## Task 6b — `observe-cli.md` note on sink-derived `--show`

<!-- task: red=`grep -q 'resolved at the sink' docs/agents/observe-cli.md` ac=AC-2 -->

**RED validity (plan R2 F8).** An earlier revision named a nonexistent suite; the real `tests/docs/specsReadmeIndexParity.test.ts` indexes spec READMEs, not this doc, and would already be green. This is a documentation deliverable with no behavioural test, so its RED is an explicit grep for the sentence the task must add — honest about being a presence check rather than dressed as test-driven.

The approved spec's tier × layer matrix requires a note in `docs/agents/observe-cli.md` explaining that `--show` attribution is derived at the sink; no task owned it (plan R1 F16). One paragraph under the `synclog` row: the flag filters `show_id`, which the sink resolves from `drive_file_id` at write time, so rows written before a show existed stay NULL and are reachable by `--file`.

**RED validity.** Documentation deliverable with no behavioural test; its proof is the doc gate plus the whole-diff review. Stated plainly rather than dressed as a test-driven task.

## Task 7 — Schema manifest regen

<!-- task: red=`pnpm gen:schema-manifest --check` ac=AC-8 -->

An index does not change the manifest; the new `prune_sync_log` function does. It regenerates from the LOCAL database, which is only correct because Task 5 applied the migration there (plan R7 F4) — `scripts/generate-schema-manifest.ts:4` states that contract. Run `pnpm gen:schema-manifest` against the local all-migrations-applied DB and commit the regenerated `supabase/__generated__/schema-manifest.json`.

## Task 8 — Validation-project apply and parity

<!-- task: red=`TEST_DATABASE_URL=<validation> pnpm vitest run tests/db/validation-schema-parity.test.ts` ac=AC-7,AC-8 -->

Apply the migration surgically to the validation project (`supabase db push` is blocked there), then `notify pgrst, 'reload schema';`. Confirm the `validation-schema-parity` gate passes all three layers.

**The bare command does not bind this task to validation (plan R7 F5).** `tests/db/validation-schema-parity.test.ts:92-103` falls back to LOCAL Postgres whenever `TEST_DATABASE_URL` is unset, and Vitest loads no `.env.local`. After Task 5's local apply and Task 7's manifest regen, `pnpm vitest run tests/db/validation-schema-parity.test.ts` is therefore GREEN before validation is touched at all — it would have re-verified Task 5's work and reported it as Task 8's.

Two corrections, both required:

1. Run the suite with `TEST_DATABASE_URL` explicitly set to the validation connection string, so Layer 2 compares against validation rather than local. The red is real only under that variable, and the task's red command is the invocation that sets it.
2. Assert the run actually reached validation rather than silently falling back — the suite's own target-reporting line, or a pre-flight `select current_database()` against the resolved URL, recorded in the closeout's `## Validation apply` section beside the exit status. A parity pass whose target was local is the failure mode this task exists to prevent, and it is indistinguishable from success without that line.

**Tracked output (plan R3 F9).** This task otherwise mutates only an external project and would owe an empty commit under the one-commit-per-task rule. Its commit creates this plan's stem-named closeout sibling (same directory, same stem, closeout suffix — the form `partitionUnits` folds into this unit) with a `## Validation apply` section recording the applied migration filename, the psql exit status, and each parity layer's result. That file is also where Task 9 writes the invariant-8 marker, so the unit gains its closeout sibling here and completes it there. The parity gate is the executable proof; the record is the tracked artifact.

## Task 9 — Invariant-8 UI gate closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-10 -->

Task 3c edits three non-API files under `app/` (`app/admin/dev/actions.ts`, `app/admin/show/[slug]/_actions/roleToken.ts`, `app/admin/show/[slug]/_actions/useRaw.ts`). `AGENTS.md:20` makes those UI surfaces by LOCATION, not by visual apparency, so invariant 8 applies even though the edits add a dependency argument and change no rendered output (plan R1 F1).

Run both halves of the v3 dual gate on the affected diff, each with the canonical v3 setup gates named in `AGENTS.md:20` — the skill's context load (PRODUCT.md + DESIGN.md), then its reference-register read — and re-verify the pre-code mechanical checklist against the three edited files. Record every finding and its disposition in a `## 12` section of the closeout file Task 8 created, then append the standalone marker line carrying the real counts.

**Why the plan does not arm the gate before this task (plan R3 F8).** `declaresGate` arms on the literal declaration phrases and `unitVerdict` then demands a valid `RAN`/`RAN-DEGRADED` marker in the same unit. A plan that arms at plan-commit time is unsatisfiable by construction: the gate has not run, so no honest marker exists, and the only available forms are the malformed `PENDING` an earlier revision carried or a `RAN` that is a lie. Arming and satisfying must become true in the SAME commit, and this task's commit is that commit — the closeout's §12 prose carries the declaration phrases, the marker line lands beside it. The suite's silence before this point is an un-armed unit behaving correctly, not an evasion.

**RED validity.** The red is observed INSIDE this task, not before it: write the §12 prose first (unit arms, no marker present, `no-marker` verdict, suite red), then append the marker line (green). Both halves land in one commit, so the red is real and witnessed rather than inferred.

## Task 10 — Archive the backlog entry (the PR's LAST commit)

<!-- task: red=`pnpm vitest run tests/docs/backlogArchiveIntegrity.test.ts` ac=AC-9 -->

**RED validity (plan R2 F9).** `_metaLedgerInProgress` is already green and stays green if the archive is skipped — it validates marker shape and origin references, not that this entry moved. The RED is a new assertion that `BL-ADMIN-PER-SHOW-HISTORY` appears in `BACKLOG-archive.md` and no longer in `BACKLOG.md`, which fails until the archive happens.

**The move is only half of AC-9 (plan R3 F11).** Relocating the entry verbatim satisfies a presence check while preserving its UI request as open-style debt, so the decision half goes unproved. Extend the same assertion to the archived entry's own body: it must carry a `**Decision:**` field naming what was built (sink-derived attribution, queryable by `--show`) and what was deliberately NOT built (the operator-facing modal sections, out of scope per the 2026-08-09 audience reframing), and it must NOT carry `**Status:** OPEN` or an `**Effort:**` estimate — the two fields that mark an entry as scheduled work rather than a settled call. Scope the assertion to the entry's own heading-to-heading slice, so a neighbouring OPEN-shaped row can neither satisfy nor break it.

Archive `BL-ADMIN-PER-SHOW-HISTORY` to `BACKLOG-archive.md` with the UI half recorded as a decision, not a debt. The `IN PROGRESS` marker comes off in the **same commit** that archives it — archives categorically reject in-flight entries (invariant 12), and this must be the PR's last commit so the marker never reaches main.

**This is why the closeout runs FIRST (plan R4 F6).** An earlier revision numbered the invariant-8 closeout after the archive, which made two commits each claim to be last: executing in order left the archive not-last, and forcing the archive last contradicted the stated order. The closeout is now Task 9 and this is Task 10. Nothing after this commit may touch tracked files — if the closeout surfaces a P0 or P1 needing a fix, that fix lands in Task 9's own commit or a fix commit BEFORE this one, never after.

<!-- tasks: end -->

---

## Commit discipline

One commit per task, conventional-commits style, `fix(sync):` / `test(sync):` / `feat(db):` scopes. The invariant-8 marker is written by Task 9 into the closeout sibling in the `RAN` form with real counts; `PENDING` is not a legal value (`tests/docs/_invariant8Closeout.ts:45`) and no revision of this plan may carry it.
