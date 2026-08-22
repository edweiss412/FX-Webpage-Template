# Plan — a database-side gate for `prune_sync_log` / `prune_app_events`

Spec: `docs/superpowers/specs/db/2026-08-22-validation-prune-db-side-gate-design.md` (canonical; every
§ reference below is to it). Ledger row: `BL-VALIDATION-PRUNE-DB-SIDE-GATE`.

Both prune functions delete by time window and are reachable on the validation project by anything
holding the pooler DSN or the service-role key. Probed 2026-08-22: a default `select
public.prune_sync_log()` there deletes 2,488 live rows (spec §3.3). This plan adds `public.assert_prune_enabled()`,
called first in both function bodies. It reads the database's existing posture marker
`destructive_reset_gate` and refuses unless that marker says explicitly this is not a validation
database, so validation refuses and local/prod keep their retention. No new table: spec review R1
killed the two-marker draft (spec §3.9).

impeccable-gate: N/A — no UI surface

The diff touches `supabase/migrations/`, `tests/db/`, `supabase/__generated__/schema-manifest.json`,
and docs. Nothing under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`.
The marker sits on its own line because the gate reads the LINE.

---

## 0. Pre-draft code-verification pass — authored AND RUN

Every citation was read, not merely resolved.

| citation | what the line holds |
| --- | --- |
| `supabase/migrations/20260622000001_validation_reset_rpc.sql:6` | `create table if not exists public.destructive_reset_gate (` |
| `supabase/migrations/20260622000001_validation_reset_rpc.sql:12` | `alter table public.destructive_reset_gate enable row level security;` |
| `supabase/migrations/20260622000001_validation_reset_rpc.sql:13` | `insert into public.destructive_reset_gate (id) values ('default') on conflict do nothing;` |
| `supabase/migrations/20260622000001_validation_reset_rpc.sql:23` | `if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false) then` |
| `supabase/migrations/20260629000002_app_events.sql:32` | `create or replace function public.prune_app_events(retain interval default interval '60 days')` |
| `supabase/migrations/20260629000002_app_events.sql:44` | `revoke all on function public.prune_app_events(interval) from public, anon, authenticated;` |
| `supabase/migrations/20260809000000_sync_log_show_attribution.sql:39` | `create or replace function public.prune_sync_log(retain interval default interval '60 days')` |
| `supabase/migrations/20260809000000_sync_log_show_attribution.sql:51` | `revoke all on function public.prune_sync_log(interval) from public, anon, authenticated;` |
| `tests/db/syncLogIndexesAndPrune.db.test.ts:109` | `expect(fn!.prosecdef).toBe(true);` |
| `tests/db/syncLogIndexesAndPrune.db.test.ts:110` | `expect(fn!.config).toEqual(["search_path=public, pg_temp"]);` |
| `tests/db/syncLogIndexesAndPrune.db.test.ts:114` | `expect(fn!.args).toMatch(/retain interval DEFAULT '60 days'/i);` |
| `tests/db/syncLogIndexesAndPrune.db.test.ts:219` | `expect(job!.command).toBe("select public.prune_sync_log();");` |
| `tests/db/destructiveResetGate.test.ts:49` | `const DB_URL = assertLocalDbUrl(` |
| `tests/db/destructiveResetGate.test.ts:67` | `async function withGate<T>(enabled: boolean, body: () => Promise<T>): Promise<T> {` |
| `tests/db/postgrest-dml-lockdown.test.ts:552` | `table: "destructive_reset_gate",` |
| `tests/db/postgrest-dml-lockdown.test.ts:1007` | the Layer 4 registry meta-assertion `describe` block |
| `tests/log/appEventsSchema.test.ts:10` | `const url = assertLocalDbUrl(` |
| `tests/mutation/source/registry.ts:15` | `sourcePath: string;` |

## 1. Meta-test inventory

- **CREATES:** none.
- **EXTENDS:** none. The R1 repair removed the new table, so no table-level REVOKE is added and
  `tests/db/postgrest-dml-lockdown.test.ts` Layer 4 has nothing to register. Registry reconciliation,
  run at plan time:
  `sed -n '158,621p' tests/db/postgrest-dml-lockdown.test.ts | grep -c '^    table: "'` → **34** rows in
  `RPC_GATED_TABLES` (declared at `tests/db/postgrest-dml-lockdown.test.ts:158`, closed at
  `tests/db/postgrest-dml-lockdown.test.ts:621`; scoped to those lines so the separate
  `ADMIN_DML_EXEMPTIONS` array at `tests/db/postgrest-dml-lockdown.test.ts:959-975` cannot inflate it). This plan adds zero rows and removes
  zero, so the post-change count is **34** — asserted by re-running the same command in Task 3.
- **Not applicable, declared:** `tests/auth/_metaInfraContract.test.ts` (no Supabase JS call boundary
  changes); `tests/auth/advisoryLockRpcDeadlock.test.ts` (§2 below); `tests/log/_metaMutationSurfaceObservability.test.ts`
  (invariant 10 — no HTTP route, no `"use server"` action; spec §5).

## 2. Advisory-lock holder topology

This plan touches no `pg_advisory*` call. `sync_log` and `app_events` are not in invariant 2's table
set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`), the prune is
not show-keyed, and neither new function acquires a lock. No holder is added at any layer, so the
single-holder rule is untouched and `tests/auth/advisoryLockRpcDeadlock.test.ts` needs no extension.

## 3. Mutation-family closure

The deliverable is SQL DDL plus a database-backed suite. `tests/mutation/source/registry.ts:15` keys
each enrolled surface on a TypeScript `sourcePath` overlaid into a Vitest run, so a SQL function body
cannot be expressed there (spec §4.4). This plan enrols nothing and declares that, rather than
enrolling symbolically. The equivalent proof is executable: Task 2's assertions run both prune
functions against a real database in both gate states.

---

<!-- tasks: depth=2 -->

## Task 1 — both prune functions read the posture marker

<!-- task: red=`pnpm vitest run tests/db/pruneGate.db.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-9 -->

**RED.** New suite `tests/db/pruneGate.db.test.ts (new)`, loopback-pinned with `assertLocalDbUrl`
(`tests/db/destructiveResetGate.test.ts:49` is the shape), with a `withPosture(marker, body)` helper
that restores `destructive_reset_gate.enabled = false` in a `finally` — the value local ships with, so
a crashed run cannot leave the local stack refusing its own prunes (`withGate` at
`tests/db/destructiveResetGate.test.ts:67` is the precedent). Cases, per function:

1. **AC-1.** Marker `true` → both prunes reject with `prune not enabled for this database`.
2. **AC-2.** Marker `true`, a row seeded past the default cutoff → the call rejects and the row is
   still present when read back. Excludes a gate wired into one call path only, and a "gate" that never
   reaches the database. It does NOT claim to exclude delete-then-raise (spec §1.1 records the
   refutation).
3. **AC-3.** Three posture states asserted per function: `false` → runs, returning a count equal to a
   global count measured in the same transaction; `true` → rejects; the marker ROW DELETED → rejects.
   The third state is the killer for a `coalesce(..., false)` read, which is exactly the shape R1's P0
   hole 3 walked through.
4. **AC-4.** `prune_sync_log(interval '5 days')` and `prune_app_events(interval '5 days')` reject under
   the validation posture. Excludes a gate on the default-argument path only, which the cron's
   no-argument call satisfies while every parameterised call walks past it.
5. **AC-9.** `prosrc` of `assert_prune_enabled()` equals the migration's body with whitespace
   normalised, and each prune's `prosrc` contains `perform public.assert_prune_enabled();` ahead of its
   `delete`. Excludes the R8 implementation: a gate keyed on `current_setting('request.jwt.claims',
   true)` passes every psql-driven case above while both PostgREST RPCs keep deleting. A body pinned to
   one exact program has an accept-set of one, which is why this is a pin and not a denylist of
   session-scoped functions.
6. **AC-5.** For BOTH functions after the change: `prosecdef` true, `proconfig`
   `["search_path=public, pg_temp"]`, `pg_get_function_arguments` matching
   `retain interval DEFAULT '60 days'`, `service_role` execute true with `anon`/`authenticated` false,
   and `prolang` = `plpgsql`. Excludes a rewrite that quietly drops `security definer`, the pinned
   `search_path`, or the shipped default while every refusal assertion still passes.

Every refusal case asserts with `rejects.toThrow(/prune not enabled/i)`, which fails on a RESOLVED
promise by construction — a suite that only caught the wrong error would pass against an ungated
function, which is exactly what spec R5 found in the SQL half of AC-6.

**Production line whose absence makes this red:** `perform public.assert_prune_enabled();` in each
function body, and the function itself. At plan time both bodies are `language sql` with no gate read
(`supabase/migrations/20260629000002_app_events.sql:32-42`,
`supabase/migrations/20260809000000_sync_log_show_attribution.sql:39-49`), so case 1 sees a successful
call and case 5 sees `prolang = sql` — both fail on a comparison, not on a missing relation.
`pnpm vitest run tests/db/pruneGate.db.test.ts` is not run at plan time: the file is created by this
task (the ordinary invariant-1 shape).

**GREEN.** `supabase/migrations/20260822000000_prune_posture_gate.sql (new)`, exactly the SQL in spec §2.3 and
§2.4: `assert_prune_enabled()` with its REVOKE/GRANT, then `create or replace` for both prune functions
with `perform public.assert_prune_enabled();` first. One file, because the assert and its two callers
are one contract and a half-applied pair is the R1 P1 hazard.

**Commit:** `feat(db): both retention prunes refuse under the validation posture`

## Task 2 — manifest, atomic validation apply, and the live probe on both functions

<!-- task: red=`pnpm vitest run tests/db/validation-schema-parity.test.ts` ac=AC-6,AC-7 -->

**RED.** After Task 1 lands locally, `pnpm vitest run tests/db/validation-schema-parity.test.ts` fails:
the committed manifest does not yet carry `assert_prune_enabled` and validation does not yet hold the
migration. A red on the CURRENT tree at that point, observed and recorded rather than asserted.

**GREEN.**

1. `pnpm gen:schema-manifest`; commit the regenerated `supabase/__generated__/schema-manifest.json`.
2. Apply to `vzakgrxqwcalbmagufjh` in ONE atomic invocation (`supabase db push` is blocked):
   `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20260822000000_prune_posture_gate.sql`,
   then `notify pgrst, 'reload schema';`. `-1` is load-bearing: parity compares signatures, not bodies
   (spec §4.3), so a half-applied file would pass the gate.
3. **AC-6, the closing probe, two limbs.** Against validation, in ONE `psql -v ON_ERROR_STOP=1`
   script. Limb 1 reads the catalog only: `prolang = plpgsql` for both functions, plus AC-9's body pin
   there. Limb 2 is four calls — both functions, default and `interval '5 days'` forms — inside ONE
   `begin; … rollback;`, each in the spec §6 block shape whose `raise` after the `perform` makes a
   SUCCESSFUL prune fail the probe. Transcript into §12. The falsification of that block shape in both
   directions is spec §3.11; do not re-derive it, re-run it if in doubt.
4. `pnpm vitest run tests/db/validation-schema-parity.test.ts` passes at all three layers (AC-7).

**Commit:** `chore(db): regenerate the schema manifest for the prune posture gate`

## Task 3 — pin the `app_events_prune` cron row

<!-- task: red=`pnpm vitest run tests/log/appEventsSchema.test.ts` ac=AC-8 -->

**RED.** `tests/log/appEventsSchema.test.ts:108-111` selects `jobname` and asserts one row — the job's
name and nothing else. Extend that case to assert `command`, `schedule` and `active`, mirroring
`tests/db/syncLogIndexesAndPrune.db.test.ts:214-223`. The new assertions fail against a job row whose
command carries an explicit interval; they pass against the shipped row.

**Production line whose absence makes this red:** none — and that is the point, so this task states its
red differently from the others. The cron row is already correct on disk
(`supabase/migrations/20260629000002_app_events.sql:58-62`), so the assertions go GREEN immediately.
The red is demonstrated by MUTATION, recorded in the commit: reschedule the local job to
`select public.prune_app_events(interval '5 days');`, observe the new case fail, restore the shipped
command, observe it pass. Without that demonstration this task ships an assertion nobody has seen fail
— the exact tautology the anti-tautology rule forbids.

**AC-8** is the criterion this task proves. **Why it is in this arc at all:** spec review R7. A cron row rewritten that way passes every gate
criterion, refuses on validation exactly as designed, and silently deletes production events aged 5 to
60 days. The gate has no opinion about the argument, so the argument needs its own pin.

**Commit:** `test(db): pin the app_events prune cron command, schedule and active`

## Task 4 — regression gates on every existing caller

<!-- task: red=`pnpm heavy pnpm test` ac=AC-4 -->

AC-4's second half is a **no-edit criterion**: `tests/db/syncLogIndexesAndPrune.db.test.ts` and
`tests/log/appEventsSchema.test.ts` must pass UNCHANGED against the local stack, whose marker is
`false`. Any edit to either file to accommodate the gate is a design failure, not a repair, and this
task's diff is empty for both paths.

Run, in order: those two suites scoped; `tests/db/destructiveResetGate.test.ts` (the marker's own
suite, which flips it — proving the two gates coexist); `tests/db/postgrest-dml-lockdown.test.ts`;
`tests/docs/specsReadmeIndexParity.test.ts`; then the full suite under `pnpm heavy`, plus
`pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.

**Commit:** none of its own — this task's output is the recorded gate transcripts in §12.

<!-- tasks: end -->

---

## 12. Closeout

impeccable-gate: N/A — no UI surface

- Ledger: `BL-VALIDATION-PRUNE-DB-SIDE-GATE` graduates to `BACKLOG-archive.md` with the §3 measurement
  replacing its `INFERRED, NOT PROBED` reachability field. The invariant-12 IN PROGRESS marker comes
  off in the PR's LAST commit, before the merge.
- Review-round record: filed if any stage reaches four counted rounds
  (the sibling `.md` of the arc's round corpus, `docs/review-rounds/feat/validation-prune-db-side-gate/50ca72a566b0.md`, filed at the cap).
- Gate transcripts (Task 4) and the AC-6 validation probe transcript (Task 2) land here.
