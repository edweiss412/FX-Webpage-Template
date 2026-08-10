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
| **AC-1** | A row written for a `drive_file_id` with a committed `shows` row lands that show's id — for the cron, recovery, AND onboarding sinks alike. | Tasks 1, 3, 3b, 4, 8b |
| **AC-2** | `querySyncLog({ showId, sinceHours: null })` returns those rows, and zero for an unrelated show id. | Task 4 |
| **AC-3** | A `drive_file_id` with no committed `shows` row lands `show_id IS NULL` — no FK violation, no blocking wait. | Tasks 1, 4 |
| **AC-4** | A row with `drive_file_id IS NULL` lands `show_id IS NULL` and does not fail. | Tasks 1, 4 |
| **AC-5** | The first-seen applied path does not block, and writes `show_id IS NULL`. | Task 4 (end-to-end, bounded timeout) |
| **AC-6** | Every row written through the `logSync` helper carries non-null `duration_ms`; only the §3.3.1 writers carry NULL. | Tasks 1, 2 |
| **AC-7** | Both indexes exist on `public.sync_log`, and on `dev.sync_log` when the clone is present; the migration applies cleanly where it is absent. | Tasks 5, 8 |
| **AC-8** | `prune_sync_log` exists with the `prune_app_events` security posture, deletes exactly the rows past the cutoff, is scheduled, `active`, and registered in the cron gate. | Tasks 5, 6, 8 |
| **AC-9** | `BL-ADMIN-PER-SHOW-HISTORY` is archived with the UI half recorded as a decision, not a debt. | Task 9 |

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

**`TEST_DATABASE_URL` is the VALIDATION project**, not a local database — `postgres.vzakgrxqwcalbmagufjh@aws-1-us-east-2.pooler.supabase.com` (`BACKLOG.md:1101`, `AGENTS.md:218`). The preflight non-loopback warning is expected, not a misconfiguration.

Every new DB test resolves its URL through `assertLocalDbUrl` (`tests/db/_localDbUrl.ts:50`) and never reads `TEST_DATABASE_URL` directly; otherwise its fixtures mutate the validation project. `tests/db/_metaDestructiveDbTargetGuard.test.ts` and `_metaLocalDbUrlGuard.test.ts` already enforce this class.

Task 8's validation apply is `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260809000000_sync_log_show_attribution.sql` then `notify pgrst, 'reload schema';` — `supabase db push` is blocked on that project.

No dev counterpart is needed for `prune_sync_log`: `prune_app_events` has none, and the dev schema is not a deploy target ("Public schema only", `AGENTS.md:218`). The migration's dev block covers indexes only.

## Vacuity guards for the new suites

`tests/cross-cutting/pgCronCiVacuity.test.ts` already prevents the pg-cron coverage suite from reporting success without live assertions, so adding `sync_log_prune` to that registry inherits the protection — nothing new is owed there.

The new suites do NOT inherit it. Apply that file's method rather than a weaker one: it **executes the suite under a hostile environment and reads the outcome** instead of matching its source, because two adversarial rounds walked past the source-matching version — once via `const isCi = false; // Boolean(process.env.CI);` (every predicate preserved, vacuum restored) and once by registering the real cases with `test.skip` while a counted sentinel stayed non-zero.

## e2e harness

N/A — no Playwright surface.

---

<!-- tasks: depth=2 -->

## Task 1 — Cron sink writes `show_id` and `duration_ms`

<!-- task: red=`pnpm vitest run tests/sync/syncLog.test.ts` ac=AC-1,AC-3,AC-4,AC-6 -->

**RED validity.** `tests/sync/syncLog.test.ts:16-31` asserts `toHaveBeenCalledWith(expect.stringContaining("insert into public.sync_log"), [4 params])`. The production line whose absence makes it fail is the `insert into public.sync_log (drive_file_id, status, message, parse_warnings)` literal at `lib/sync/syncLog.ts:43` — four columns, four params. Not test-local: the string under assertion is production source.

**Know which half actually goes red.** The `stringContaining` half **still passes** after the change (the new statement also contains that substring); only the param array (4 → 5) goes red. So containment is not coverage of the column list.

**The new SQL assertion must be exact equality, not containment** — a `show_id` token inside a SQL comment satisfies containment while the column is dead, which is mutant (c) below:

```ts
const sql = (unsafe.mock.calls[0]![0] as string).replace(/\s+/g, " ").trim();
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

**Implementation.** Change the sink insert to (5 params, not 6 — there is no explicit show id; see spec §3.1.1):

```sql
insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings, duration_ms)
values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb, $5)
```

`makePostgresSyncLogSink` gains only `duration_ms` from the entry. **No explicit show-id parameter** — passing one from inside the cron transaction deadlocks the first-seen applied path against the FK check (spec §3.1.1). Mutant (d) below varies the drive file id, not a show id.

## Task 2 — Widen `SyncLogEntry` and `SyncLogDeps`; capture the attempt start

<!-- task: red=`pnpm vitest run tests/sync/runScheduledCronSync.test.ts -t logSync` ac=AC-6 -->

**RED validity — the claimed existing RED was false (plan R1 F3).** `tests/sync/runScheduledCronSync.test.ts:2662` observes the dependency object handed to a MOCKED `processOneFile`, not the `SyncLogEntry` built inside the real `logSync`, so adding a field to that entry cannot fail it; the later sink assertion is `expect.objectContaining`, not exact. This task therefore WRITES its RED: a new duration assertion against the entry the real helper constructs, with an injected clock and a known delta. The production line is the entry construction inside `logSync` (`lib/sync/runScheduledCronSync.ts:2241-2249`).

Add `durationMs?: number` to `SyncLogEntry` — **not** `showId` (plan R1 F2: an explicit show-id channel is the design the spec rejected in §3.1.1, and Task 1's own text forbids it) (`tests/sync/runScheduledCronSync.test.ts:446-456`); add **both** `attemptStartedAtMs?: number` **and** `now?: () => Date` to `SyncLogDeps` (plan R1 F2: `logSync` computes `now() - start`, so a widening carrying only the start cannot read `deps.now` under the declared parameter type and would fall back to ambient time, defeating the injected-delta oracle) (`tests/sync/runScheduledCronSync.test.ts:2218-2220`).

**Exact injection point.** `processOneFile(driveFileId, mode, fileMeta, deps: ProcessOneFileDeps = {})` (`tests/sync/runScheduledCronSync.test.ts:2707-2712`). Capture at the top, before `prepareProcessOneFile`, then bind once:

```ts
const attemptStartedAtMs = (deps.now?.() ?? new Date()).getTime();
const depsWithStart: ProcessOneFileDeps = { ...deps, attemptStartedAtMs };
```

**Both call sites must use `depsWithStart`, not `deps`** — this is the easy miss. The archived/skip branch calls `logSync(deps, ...)` with the RAW deps at `tests/sync/runScheduledCronSync.test.ts:2742`, while the main branch routes through `txBoundProcessDeps(lockedTx, deps, txDeps)` at `tests/sync/runScheduledCronSync.test.ts:2755`. Substituting only the second leaves every skip-path row with a NULL duration while the tests (which mostly exercise the main path) stay green. Propagation past `tests/sync/runScheduledCronSync.test.ts:2755` is then free, since `txBoundProcessDeps` returns a `ProcessOneFileDeps` (`tests/sync/runScheduledCronSync.test.ts:2301-2306`).

**Do not** confuse this with the outer `SyncPipelineTxBoundDeps` param (`tests/sync/runScheduledCronSync.test.ts:457-459`) — it carries no `logSync`, and since `logSync?` is optional, a change routed there typechecks and silently no-ops.

Guards: absent start → `undefined` (NULL), never NaN; non-monotonic clock → clamp at 0.

**The duration oracle is BRANCH-complete, not path-complete (spec R4 F1).** Five distinct behaviors, five assertions. A suite exercising only the applied path satisfies the known-delta assertion while leaving every one of these free — and `rg "duration_ms|attemptStartedAt" tests` confirms no existing write-side oracle covers any of them:

| # | Behavior | Assertion |
| --- | --- | --- |
| 1 | Prepared skip (`lib/sync/runScheduledCronSync.ts:2742`) | row carries the injected delta, not NULL |
| 2 | Lock-contended skip (`lib/sync/runScheduledCronSync.ts:2761`) | same |
| 3 | Manual first-seen apply (`lib/sync/runManualStageForFirstSeen.ts:147-158`) | same, via its own capture site |
| 4 | Reuse hazard (`lib/sync/runScheduledCronSync.ts:3877-3942`) | **Assert the shared object is NOT mutated**, not merely that two rows differ. Plan R1 F14: the file loop is sequential, so an implementation assigning `deps.attemptStartedAtMs = freshStart` on every invocation mutates the shared `processDeps` and STILL gives both rows correct durations — a two-file duration comparison cannot distinguish it. Snapshot the deps object's own keys before the run and assert it is unchanged after, or assert the per-file object is not reference-identical to the shared one. |
| 5 | Missing start / backward clock | NULL and 0 respectively — never NaN, never negative |

## Task 3 — Recovery sink resolves by subselect; explicit parameter retired

<!-- task: red=`pnpm vitest run tests/sync/runOfShowSyncLogChannel.test.ts` ac=AC-1 -->

**RED validity.** `tests/sync/runOfShowSyncLogChannel.test.ts:199-250` structurally pins `insertSyncLog`'s insert. Production line: `lib/sync/runScheduledCronSync.ts:1216-1219`.

`insertSyncLog(entry, showId?)` currently takes an explicit id (`lib/sync/runScheduledCronSync.ts:490`). **Retire that parameter** and resolve by the same subselect, so the recovery sink cannot reintroduce the uncommitted-reference hazard from a future caller. Update the four call sites (`lib/sync/runScheduledCronSync.ts:2581`, `lib/sync/runScheduledCronSync.ts:2636`; `lib/sync/runManualSyncForShow.ts:175`, `lib/sync/runManualSyncForShow.ts:224`).

## Task 3b — Onboarding-scan sink + its seven callers (with their regression pin)

**Pin lands WITH the repair, not before it (plan R1 F6).** An earlier revision put all fifteen assertions in a standalone Task 3a that had no implementation of its own and so could never reach green at its own boundary — seven assertions stayed red until 3b and eight until 3c, breaking the mandatory failing-test → implementation → passing-test → commit sequence. The pin is therefore split: the seven superseded assertions land in THIS task's `syncLogRepairSites` suite alongside the caller fix that makes them pass, and the eight entry-point assertions land in Task 3c with theirs.

The enumeration is still deliberate (a regression pin, not a cover — see the acceptance index), and the file is still deleted when `BL-SYNC-LOG-ATTRIBUTION-METATEST` lands.

<!-- task: red=`pnpm vitest run tests/sync/onboardingScanSyncLogAttribution.test.ts` ac=AC-1 -->

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

**Do NOT touch `lib/sync/runOnboardingScan.ts:1134`** — the run-level readiness emit is genuinely unattributable and is a seed row in `RUN_LEVEL_SYNC_LOG_SITES` (Task 8b).

## Task 3c — Manual entry points install a sink (with their regression pin) + the two fenced gap markers

<!-- task: red=`pnpm vitest run tests/sync/manualSyncInstallsSink.test.ts` ac=AC-1 -->

**Scope fence, ratified 2026-08-09 (spec §6.2).** This task wires sinks. It does **not** make manual sync observable, and must not claim to. Spec R8 F1 measured `logSyncCalls: 0` on four `runManualStageForFirstSeen` branches even with a sink installed, because those branches return before the sole emission at `lib/sync/runOnboardingScan.ts:147`; and `runManualSyncForShow` awaits `runOne` with no catch, so a throw escapes unlogged. That gap is filed as `BL-MANUAL-SYNC-UNEMITTED`.

So the RED for this task asserts **the sink is installed and reaches the pipeline**, not that a row appears for every manual outcome. A test asserting rows-per-outcome would fail for reasons this task does not own, and "fixing" it would silently pull the filed work back in.

**The largest real gap in the arc (spec R5 F1).** `SyncLogDeps.logSync` is optional and emitted via optional chaining (`lib/sync/runScheduledCronSync.ts:2218-2220`, `lib/sync/runScheduledCronSync.ts:2250`), and **no** production manual entry point supplies one — so manual applied/skipped/error outcomes write no row at all. Not NULL: absent. That is silence, which the consequence bound forbids outright, and it leaves `observe synclog --show` blind to the operator's most deliberate action even after the sink is perfect.

**RED validity.** New test asserting each entry point forwards a sink into the pipeline. The production defect is the absent `logSync` property at each call site; the test cannot pass until they carry it. It is NOT test-local — the existing `tests/sync/runOfShowSyncLogChannel.test.ts:172-185` injects `logSync` itself, which is exactly why it proved a test-only path and missed this for the whole arc.

**The entry-point set is DERIVED, not hand-listed.** My own verification grep missed `app/api/admin/pending-ingestions/[id]/retry/route.ts:427-433` because its callee is `deps.runManualSyncForShowUnlocked` — a different exported name than the four shapes I pattern-matched. That is the fourth instance in this arc of a hand-list coming up short, this time in the verification method rather than the artifact. **The entry-point set is keyed on the SINK PARAMETER (spec R13 F1), not on transitive reachability.** An export is an entry point iff its own signature accepts a deps object that can carry `logSync`. Transitive reachability had no stopping condition: `unarchiveShow` reaches a writer, so it became an entry point, so ITS caller owed a sink, and so on up the graph — and no marker was truthful there, since once the sink is wired into `unarchiveShow` the attempt does emit. Signature-keyed terminates by construction and is decidable from the callee alone. `unarchiveShow`'s `deps?: { rpc?, runManualSyncForShow? }` carries no `logSync`, so it is a CALLER that must pass one inward — which is this task — and its own callers inherit nothing.

**Key the check on the IMPORT, never the call name.** `lib/showLifecycle/unarchiveShow.ts:7` imports `runManualSyncForShow as defaultRunManualSyncForShow` and calls it at `lib/showLifecycle/unarchiveShow.ts:32` through a local alias (`catchUp = deps?.runManualSyncForShow ?? default…`); `app/api/admin/show/pull-sheet-override/route.ts` binds the same import as `runSync`. Three distinct local names for one import — a callee-name match finds none of them, and both renames are ordinary authoring, squarely inside the threat model rather than the fenced-out obfuscation limit.

The rule is therefore: **a file importing an exported sync entry point must supply a sink at some call, or carry a site exemption.** Import presence is file-local, so no interprocedural analysis is needed — the indirection through `app/admin/show/[slug]/_actions/unarchive.ts:34` never has to be traced, because the direct caller is itself in a scanned root and is the right site to name.

Census — exactly **two of seven** production entry points install a sink today (`app/api/cron/sync/route.ts:21` and `app/api/drive/webhook/route.ts:230`); the six below do not.

**No type widening is needed.** `RunManualStageForFirstSeenDeps` already carries `logSync?: ProcessOneFileDeps["logSync"]` (`lib/sync/runManualStageForFirstSeen.ts:63`). An earlier revision of this plan mandated adding it, from a grep window that stopped one line short (plan R1 F18). Callers can pass a sink today; the defect is only that they do not.

**Eight known call sites**, one property each (`logSync: writeSyncLog`) — and the count is illustrative, not the contract. The derived assertion above is the cover; two of these eight were found only after the six-site list was published, which is the fifth hand-list to come up short in this arc.

| Site | Current shape |
| --- | --- |
| `app/api/admin/sync/[slug]/route.ts:94` | no `processDeps` |
| `app/admin/dev/actions.ts:622` | no `processDeps` |
| `app/admin/show/[slug]/_actions/roleToken.ts:184` | no `processDeps` |
| `app/admin/show/[slug]/_actions/useRaw.ts:168` | no `processDeps` |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:427-433` | `deps.runManualSyncForShowUnlocked(..., {})` — note the DIFFERENT callee name |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts:480-488` | first-seen `stageDeps`, no logger |
| `lib/showLifecycle/unarchiveShow.ts:24` | two-arg call through a local alias (`catchUp`); reached from `app/admin/show/[slug]/_actions/unarchive.ts:34` (spec R6 F1) |
| `app/api/admin/show/pull-sheet-override/route.ts:213` | two-arg call through a local alias (`runSync`, defaulting to the real function) (spec R6 F1) |

**Also fix the two lying comments** at `app/admin/show/[slug]/_actions/useRaw.ts:162` and `app/admin/show/[slug]/_actions/useRaw.ts:173`, which assert that logging already happens here. They are false today and they are part of why this went unnoticed — a comment claiming a mechanism is the same defect class as a spec claiming one.

**Also install the two fenced gap markers (plan R1 F12).** The approved spec §6.2 requires them and no task owned them; the plan referenced a nonexistent "Task 8b". Add `// sync-log-emission-gap: BL-MANUAL-SYNC-UNEMITTED` at `app/api/admin/staged/[fileId]/apply/route.ts:152` and `app/api/admin/show/staged/[stagedId]/apply/route.ts:164`. Without them the fenced attempts stay silently unemitted rather than explicitly signaled, which is the difference between a documented limit and an undocumented one.

**Ordering:** before Task 4, whose DB oracle would otherwise be unable to observe a manual attempt at all. (Task 3a, the meta-test, was descoped — so 3b/3c no longer have a guard turning red before them; their REDs are their own tests.)

## Task 4 — Attribution integration test (the probe, executable)

<!-- task: red=`pnpm vitest run tests/observe/querySyncLogAttribution.test.ts` ac=AC-1,AC-2,AC-3,AC-5 -->

New DB-backed test. Write attempts through the cron sink for a drive file with a known `shows` row, then assert `querySyncLog({ showId })` returns them.

**This MUST NOT be an extension of `tests/observe/querySyncLog.test.ts`.** That suite mocks `@/lib/supabase/server` wholesale (`tests/observe/querySyncLog.test.ts:11-29`) and asserts on the recorded builder call chain — it never touches a database. A mocked read test can assert `.eq("show_id", …)` was called and stay green forever while no writer ever populates the column, which is exactly how this defect shipped and survived. Per the AGENTS.md "mocked-only tests invite tautological APPROVE" rule, the attribution proof must exercise a real write followed by a real read, in a new file.

The mocked suite still gets its expected update for the select-list change (Task 1 alters no select list, so likely none) — but it is not, and cannot be, the AC-2 evidence.

**Prune oracle (belongs to TASK 5, not here — plan R1 F13: the function does not exist until Task 5, so Task 4 could not go green owning it). Stated here only as a cross-reference; the assertions live in Task 5.** It must prove NON-deletion of rows it did not mark (spec R4 F5). Asserting only that marked-new rows survive admits a predicate equivalent to `occurred_at < cutoff OR status = 'skipped'`: the marked old row disappears, the marked new row survives, the global return stays `>= fixtureOldCount`, and every assertion passes while unrelated recent rows are destroyed. So the fixture also inserts a **recent row NOT carrying the marker**, and asserts it survives. Include at least one whose `status` differs from the marker's, since status is the most likely accidental predicate.

**The oracle CANNOT be rollback-only (plan R1 F10).** `querySyncLog` reads through a separate Supabase REST connection (`lib/observe/query/syncLog.ts:23`), so a row written inside the test transaction is invisible to it; and `writeSyncLog` opens and commits its OWN connection whose resolver prefers `TEST_DATABASE_URL` — the validation project. Either shape produces a false negative, a remote mutation, or residue.

Required shape: **commit the fixture, then clean it in a `finally`**, with the target pinned explicitly to loopback for BOTH writer and reader, and an assertion that the two resolve to the same database (compare `current_database()` and the host, or inject one resolved URL into both). A rollback-only variant is only valid for assertions that never cross the connection boundary — the direct `select … from sync_log` readbacks, not `querySyncLog`.

**One readback PER SINK (plan R1 F11).** AC-1 spans three writers and an earlier revision proved only the cron sink; recovery and onboarding had SQL-string assertions, which cannot show a row landed. Each of the three gets its own write-then-read-back, or its AC-1 clause is unproven.

**Anti-tautology:** assert against the row read back from the DB, not the param array. Derive the expected show id from the fixture. Duration asserted against a known injected delta, not `> 0`. **Negative control (AC-2):** the same query for an unrelated show id returns zero rows — without it, green is equally consistent with the filter being ignored.

**AC-5 is a separate, end-to-end test:** process a first-seen file through the full locked path against a live DB with a bounded timeout; assert it completes (no deadlock) and lands `show_id IS NULL`. A two-committed-fixture test does not exercise that topology and would have passed against the deadlocking design.

**Premise (executable, per `tests/_shared/premise.ts`):** assert the `shows` row exists before asserting attribution — otherwise the test passes vacuously on an empty fixture, which is this spec's own defect class.

**Skip hazard — closed executably, not by intention.** `TEST_DATABASE_URL` is non-loopback on this worktree, so loopback-guarded DB tests SKIP, and a skipped test is indistinguishable from a passing one in the summary line.

Use the shared helper `unreachableDbFailure` (`lib/driveIdCoverage/introspect.ts:132-148`) rather than hand-rolling the condition. It already carries the hardening this class needs: its own comment records that an earlier draft's `if (!opts.ci)` let a CI wrapper exporting `CI=` silently disable the guard, so it keys on **presence** of `CI`, not truthiness (`lib/driveIdCoverage/introspect.ts:139-142`).

Fail loudly when the probe fails and EITHER condition holds:
- `CI` is set (any value, including empty) — via `unreachableDbFailure`
- a DB URL was explicitly configured — the `DB_URL_EXPLICIT` shape at `tests/sync/qualityRegressionLifecycle.test.ts:449-459`

Only a completely unconfigured local dev environment may skip clean.

**Test-file template.** Follow `tests/db/driveFileIdNonblank.db.test.ts`: `postgres` driver, `assertLocalDbUrl` from `@/tests/db/_localDbUrl`, and every mutating probe inside a transaction that is always rolled back so the suite leaves zero residue even while red.

**`sinceHours` trap (verified at `lib/observe/query/syncLog.ts:28`).** `querySyncLog` defaults `sinceHours` to **24** when the field is `undefined`; only an explicit `null` removes the time bound. A fixture whose rows are older than 24h therefore yields `rows: []` — an empty result that looks exactly like the bug under test, inside the very test meant to prove the bug is fixed. The test MUST pass `sinceHours: null` explicitly, and must additionally assert a **negative control**: the same query against a different show's id returns zero rows, so a green result cannot come from the filter being ignored.

**Service-role requirement.** `querySyncLog` constructs `createSupabaseServiceRoleClient()` (`lib/observe/query/syncLog.ts:23`), so the test needs `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` present. Absent it, the call throws and is swallowed into `{ kind: "infra_error" }` (`lib/observe/query/syncLog.ts:52-54`) — assert on `kind === "ok"` before asserting on rows, or an infra fault reads as "no rows."

## Task 5 — Migration: indexes, prune function, cron schedule

<!-- task: red=`pnpm vitest run tests/db/syncLogIndexesAndPrune.test.ts` ac=AC-7,AC-8 -->

**New DB assertions are required — none exist today.** `rg "sync_log_show_id_idx|sync_log_drive_file_id_idx|prune_sync_log|sync_log_prune" tests` returns nothing, and `tests/db/schema.test.ts:293-303` inspects CHECK syntax, not indexes. Per spec §5, assert: both public indexes in `pg_indexes` with column order and DESC; both dev indexes when `to_regclass('dev.sync_log')` is non-null, plus a migration-text assertion that the `to_regclass` guard is present so an ungated form cannot ship; `prune_sync_log` in `pg_proc` with `prosecdef` and `search_path`; `has_function_privilege` positive for `service_role` and negative for `anon`/`authenticated`; prune behavior across the cutoff asserting BOTH the returned count and that newer rows survive; and the `cron.job` row's command and schedule.

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

**Edit C — close the three name-match holes (spec R4 F3).** Extending discovery is necessary but not sufficient: `CALLS_LOCAL_GUARD` (`tests/db/_metaDestructiveDbTargetGuard.test.ts:42-43`) matches a *call whose name looks right*. It does not establish (a) that the guarded value is the URL actually passed to `postgres`, (b) that the call precedes the connection, or (c) that the callee is the imported guard rather than a local same-named function. A prune test can call `assertLocalDbUrl` on an unrelated loopback literal, or after pruning, and pass.

Close (c) the way `_metaLocalDbUrlGuard` already does — resolve the callee to the guard module's export (that file's own whole-diff finding 1b). Close (a) and (b) by asserting, in the discovered file's AST, that the identifier passed to `postgres(...)` is the same binding returned by the guard call. If (a)/(b) prove disproportionate, they are a DOCUMENTED LIMIT recorded in the guard's header with a `BL-` filing — not silence, and not a claim of coverage the guard does not have. That distinction is the whole lesson of R3 F6.

**Edit B** — extend the anti-vacuity list at `tests/db/_metaDestructiveDbTargetGuard.test.ts:66-72` with the new prune test file, so the pattern is proven to match something. Without it the extension can rot into a silent no-op, which is precisely what that test's own comment warns about: *"If this fails, the regexes drifted and every assertion below is vacuous."*

The existing inline exemption (`tests/db/_metaDestructiveDbTargetGuard.test.ts:46`, `// not-subject-to-destructive-target-guard:`) remains the escape hatch for a genuinely local-only helper.

## Task 6 — (MERGED INTO TASK 5)

Plan R1 F7: this task's registry row must land in the same commit as Task 5's migration — the `pg-cron-coverage` assertion is exact array equality over the live job set, so a migration without the row fails it and a row without the migration fails it. Declaring them separate tasks while requiring one commit contradicted the one-commit-per-task rule. **Merged into Task 5**, whose body now carries the registry edit and whose RED covers both.


<!-- task: red=`pnpm vitest run tests/cross-cutting/pg-cron-coverage.test.ts` ac=AC-8 -->



Note `cleanup-bootstrap-nonces` is excluded by name in the query as a known orphan — not evidence the registry is optional.

## Task 6b — `observe-cli.md` note on sink-derived `--show`

<!-- task: red=`pnpm vitest run tests/docs/_metaSpecsReadmeIndex.test.ts` ac=AC-2 -->

The approved spec's tier × layer matrix requires a note in `docs/agents/observe-cli.md` explaining that `--show` attribution is derived at the sink; no task owned it (plan R1 F16). One paragraph under the `synclog` row: the flag filters `show_id`, which the sink resolves from `drive_file_id` at write time, so rows written before a show existed stay NULL and are reachable by `--file`.

**RED validity.** Documentation deliverable with no behavioural test; its proof is the doc gate plus the whole-diff review. Stated plainly rather than dressed as a test-driven task.

## Task 7 — Schema manifest regen

<!-- task: red=`pnpm gen:schema-manifest --check` ac=AC-8 -->

An index does not change the manifest; the new `prune_sync_log` function does. Run `pnpm gen:schema-manifest` against the local all-migrations-applied DB and commit the regenerated `supabase/__generated__/schema-manifest.json`.

## Task 8 — Validation-project apply and parity

<!-- task: red=`pnpm vitest run tests/db/validation-schema-parity.test.ts` ac=AC-7,AC-8 -->

Apply the migration surgically to the validation project (`supabase db push` is blocked there), then `notify pgrst, 'reload schema';`. Confirm the `validation-schema-parity` gate passes all three layers.

## Task 9 — Archive the backlog entry

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-9 -->

Archive `BL-ADMIN-PER-SHOW-HISTORY` to `BACKLOG-archive.md` with the UI half recorded as a decision, not a debt. The `IN PROGRESS` marker comes off in the **same commit** that archives it — archives categorically reject in-flight entries (invariant 12), and this must be the PR's last commit so the marker never reaches main.

<!-- tasks: end -->

---

## Commit discipline

One commit per task, conventional-commits style, `fix(sync):` / `test(sync):` / `feat(db):` scopes. `impeccable-gate: critique=PENDING audit=PENDING p0=0 p1=0 dispositions=none` in the closeout.
