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

### 0.2 The shell every command below assumes

Stated once, because plan review r4's finding was a command relying on a shell fact the plan did not
carry, and the honest version of that repair is to say what the shell IS rather than to fix one
variable.

Every command runs from the worktree root with the toolchain AGENTS.md invariant 11 already
establishes: `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`. `psql` is on `PATH`. The local
Supabase stack is up, which Task 1's hardcoded loopback DSN needs; if it is not, `psql` refuses the
connection loudly, so that assumption fails safe and is not the r4 shape.

**Two environment variables do NOT follow from invariant 11, and they are the reason §0.2 exists.**

`TEST_DATABASE_URL` — `pnpm preflight` parses `.env.local` itself (`scripts/preflight-env.mjs:12`,
whose comment notes vitest does not auto-load it either) and it does NOT require this key: its `HARD`
set is `HASH_FOR_LOG_PEPPER`, `PICKER_COOKIE_SIGNING_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`GOOGLE_SERVICE_ACCOUNT_JSON` (`scripts/preflight-env.mjs:53-61`). So a green preflight does not even
promise the validation DSN is on disk, let alone in your environment. Task 2 step 0 is where it enters
the shell, and it checks the value rather than assuming it.

`SCHEMA_MANIFEST_DB_URL` — **must be UNSET, and nothing in this repo's setup unsets it for you.** When
present it overrides the local default in `localManifestDbUrl()`
(`scripts/generate-schema-manifest.ts:41-46`), so `pnpm gen:schema-manifest` would introspect whatever
it names and commit THAT as the manifest. The same variable also selects parity's Layer 3 target
(`tests/db/validation-schema-parity.test.ts:105-106`), and Layer 3 RETURNS EARLY rather than failing
when its target is unreachable (`tests/db/validation-schema-parity.test.ts:238-239`) — so a stale
value silently removes the local-freshness comparison from every parity run in this plan, including
Task 2's red, Task 2 step 4, and the full suite in Task 4. Plan review r5 found this; it is the same
shape as `TEST_DATABASE_URL`'s, one variable over.

Check both before Task 2, and treat a set `SCHEMA_MANIFEST_DB_URL` as a stop rather than a curiosity:

```
$ echo "TEST_DATABASE_URL=${TEST_DATABASE_URL:+set} SCHEMA_MANIFEST_DB_URL=${SCHEMA_MANIFEST_DB_URL:+SET-UNSET-IT}"
TEST_DATABASE_URL= SCHEMA_MANIFEST_DB_URL=
```

### 0.1 Every command this plan names was run

Plan review r2 raised two instances of one shape — a command that cannot run as written — and r3 raised
two more. Every command in this document has since been extracted and run, at the head this plan is
repaired on, and each runs as written. Where an outcome is itself load-bearing it is written into the
task that owns it — Task 2 carries the manifest-perturbation transcript, Task 3 the three cron
mutations and their expected reds. The rest ran and are simply correct; that is all this section
claims for them.

Three commands are NOT run, all for one reason: the surgical apply, its `notify pgrst`, and AC-6's
probe each need an applied migration on `vzakgrxqwcalbmagufjh`, which is Task 2's own deliverable.
They also need a shell that has loaded `.env.local`, which nothing does on its own — Task 2 step 0 is
that step, added after plan review r4 found these commands relying on a variable no worktree shell
defines. From such a shell the DSN resolves to the pooler over TCP and validation answers, and its
posture marker reads `enabled=true`, so the gate will refuse there once applied.

**This section used to be a forty-line table with an extractor, and shrinking it is the repair, not an
evasion.** The table produced a finding in r2 (it missed the parity suite's ambient form) and two more
in r3 (its `awk` anchored fences at column zero and so skipped both validation `psql` calls; its `rg`
was offered as a derivation while actually returning sixty hits across seven files, most of them the
destructive-statement guard's own corpus strings). Each round hardened it and each hardening was a
larger surface for the next round — the arms race AGENTS.md's round-economy rule names, whose
prescribed answer is to narrow rather than to grow the recognizer. The commands being correct is what
this plan owes; a proof inside the plan that they are correct is not, and it was costing more rounds
than it closed.

## 1. Meta-test inventory

- **CREATES:** none.
- **EXTENDS:** none. The R1 repair removed the new table, so no table-level REVOKE is added and
  `tests/db/postgrest-dml-lockdown.test.ts` Layer 4 has nothing to register. Registry reconciliation,
  run at plan time:
  `sed -n '158,621p' tests/db/postgrest-dml-lockdown.test.ts | grep -c '^    table: "'` → **34** rows in
  `RPC_GATED_TABLES` (declared at `tests/db/postgrest-dml-lockdown.test.ts:158`, closed at
  `tests/db/postgrest-dml-lockdown.test.ts:621`; scoped to those lines so the separate
  `ADMIN_DML_EXEMPTIONS` array at `tests/db/postgrest-dml-lockdown.test.ts:959-975` cannot inflate it). This plan adds zero rows and removes
  zero, so the post-change count is **34** — asserted by re-running the same command in Task 4.
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
(`tests/db/destructiveResetGate.test.ts:49` is the shape).

**Every case that CALLS a prune runs inside a transaction that is rolled back**, per spec §6. The
`withGate` precedent at `tests/db/destructiveResetGate.test.ts:67-76` is NOT transactional — it flips a
marker and restores it in a `finally` — so this suite composes two helpers rather than copying one:

- `withPosture(marker, body)` sets `destructive_reset_gate.enabled` and restores it to `false` in a
  `finally`. Marker writes commit; that is safe, and it is the only thing that does.
- `rolledBack(body)` runs `body` inside `sql.begin(...)` and always throws a `RollbackSignal` at the
  end, which the caller swallows. EVERY `select public.prune_*` in this suite is inside it, including
  the marker-`false` cases that are supposed to delete, and including AC-3's marker-row DELETE so the
  rollback restores the row as well as `withPosture` does.

One case then asserts the rollback ACTUALLY happened, by re-reading its fixture rows outside the
transaction and expecting zero — the shape at `tests/db/syncLogIndexesAndPrune.db.test.ts:180-186`.

**Every call that is EXPECTED to raise is additionally isolated in a SAVEPOINT.** The `postgres`
client (`postgres` 3.4.9, `package.json`) exposes `savepoint` on the transaction handle
`sql.begin` yields, so the form is `tx.savepoint((sp) => sp`select public.prune_*()`)`. Postgres aborts
a transaction at its first uncaught error, so a refusal sharing the enclosing transaction with any
later statement makes that statement UNRUNNABLE rather than failing — AC-2's read-back is where that
difference decides whether the criterion is proven or merely reported as an error. Spec §6 rule 2 is
the requirement and names three permitted mechanisms; the savepoint is the one this suite uses.

**That isolation rule is stated once and ranges over every case below**, rather than being attached to
the case that first needed it. In the new suite, every case whose assertion is `rejects.toThrow(...)` —
cases 1, 2, 3's `true` and DELETED states, and 4 — takes the savepoint form; in AC-6's SQL script,
every call already sits in its own `do $$ … exception when others then … $$;` block, which is the
plpgsql-handler mechanism of the same spec rule.

**FOUR artifacts in this arc's scope call a prune, not two** — plan review r3 corrected an earlier
claim here that named only the two the arc authors.

The candidate set is `rg -n 'public\.prune_(sync_log|app_events)\(' tests/`. That command is where to
start and it is NOT the answer: it returns roughly sixty hits across seven files, and most are not
calls. `tests/db/destructiveFileAnalysis.test.ts`, `tests/db/_metaDestructiveDbTargetGuard.test.ts` and
`tests/db/_destructiveFileAnalysis.ts` hold `select public.prune_sync_log()` as CORPUS STRINGS — that
literal is the input the destructive-statement guard is tested against, so the guard's own suite is
necessarily full of it — and `tests/db/connectionCensus.test.ts` and
`tests/cross-cutting/pg-cron-coverage.test.ts` mention it only in comments. The discriminator is
whether the file sends the statement to a live database, which is read off the hit, not off the
command. Two files do, and the arc authors two more:

| artifact | calls | expected-refusal case? | rollback? |
| --- | --- | --- | --- |
| `tests/db/pruneGate.db.test.ts (new)` — Task 1 | every case | yes — savepoint-isolated | yes, `rolledBack` |
| AC-6's SQL script (Task 2) | four | yes — plpgsql handler per call | yes, one `begin; … rollback;` |
| `tests/db/syncLogIndexesAndPrune.db.test.ts:155` and `tests/db/syncLogIndexesAndPrune.db.test.ts:200` | two | **no** | yes, already `sql.begin` + `RollbackSignal` |
| `tests/log/appEventsSchema.test.ts:88` | one | **no** | yes, already rolled back |

The last two are pre-existing and neither expects a refusal, so the savepoint rule does not bind them;
the rollback rule does, and both already satisfy it. `tests/log/appEventsSchema.test.ts` is edited by
Task 3, which makes it an artifact this arc ships — the reason it belongs in this table rather than
outside it. Task 3's edit adds cron-row assertions and calls no prune, so it changes nothing here.

Cases, per function:

1. **AC-1.** Marker `true` → both prunes reject with `prune not enabled for this database`. Asserted
   with `rejects.toThrow(/prune not enabled/i)`, which fails on a RESOLVED promise by construction — a
   suite that only caught the wrong error would pass against an ungated function, which is what spec R5
   found in the SQL half of AC-6.
2. **AC-2.** Marker `true`, a row seeded past the default cutoff inside the transaction → the call
   rejects and the row is still present when read back inside that same transaction. The prune call is
   the savepoint-isolated one described above; without that isolation the rejection aborts the
   transaction and the read-back — the statement that carries the whole non-deletion claim — cannot
   execute at all. Excludes a gate wired into one call path only, and a "gate" that never reaches the
   database.
3. **AC-3.** Three posture states per function: `false` → runs, returning a count equal to a global
   count measured in the same transaction; `true` → rejects; marker row DELETED → rejects. The third
   state is the killer for a `coalesce(..., false)` read — spec R1's P0 hole 3.
4. **AC-4.** `prune_sync_log(interval '5 days')` and `prune_app_events(interval '5 days')` reject under
   the validation posture. Excludes a gate on the default-argument path only.
5. **AC-9.** The `prosrc` of all three functions equals a literal held IN THIS TEST FILE, whitespace
   normalised, plus an assertion that no shipped body mentions `request.jwt.claims` or
   `current_setting`. **Amended after whole-diff review r1** — see spec §6 AC-9's dated note. Pinning
   against the migration's own body was circular (both sides move together), and the companion
   `perform`-before-`delete` check was a substring-ORDER oracle a conditional wrapper satisfies. Excludes the spec R8 implementation: a gate keyed on
   `current_setting('request.jwt.claims', true)` passes every psql-driven case above while both
   PostgREST RPCs keep deleting.

   **AC-9 is the one criterion this plan proves in TWO tasks, and that is the spec's own doing.**
   Spec §6 AC-9 says the body pin is "asserted on local, and on validation as part of AC-6's pre-check
   limb" — two databases, and validation does not have the migration until Task 2 applies it, so no
   single task can hold both halves. Task 1 owns the local assertion; Task 2 owns the validation one
   inside AC-6's limb 1, and both task markers name AC-9 so neither half is claimed by a task that
   does not run it. Plan review r1 introduced the one-task-per-criterion rule after finding a criterion
   split between two tasks and therefore checked by neither, and r3 found this plan doing exactly that
   to AC-9 while asserting the opposite in this sentence. The rule's purpose is that no criterion goes
   unproven because each task assumed the other had it; naming both tasks serves that purpose, and a
   silent split does not. AC-9 is the only such case: every other criterion is proven in exactly one
   task.
6. **AC-5.** For BOTH functions: `prosecdef` true, `proconfig` `["search_path=public, pg_temp"]`,
   `pg_get_function_arguments` matching `retain interval DEFAULT '60 days'`, execute granted to
   `service_role` and not to `anon`/`authenticated`, and `prolang` = `plpgsql`. Excludes a rewrite that
   quietly drops `security definer`, the pinned `search_path`, or the shipped default while every
   refusal assertion still passes. Reads the catalog and calls nothing, so it carries no deletion risk.

**Production line whose absence makes this red:** `perform public.assert_prune_enabled();` in each
function body, and `assert_prune_enabled()` itself. At plan time both bodies are `language sql` with no
gate read (`supabase/migrations/20260629000002_app_events.sql:32-42`,
`supabase/migrations/20260809000000_sync_log_show_attribution.sql:39-49`), so case 1 sees a successful
call and case 6 sees `prolang = sql` — comparisons that fail, not a missing relation. The command is not
run at plan time: the file is created by this task (the ordinary invariant-1 shape).

**GREEN.**

1. Write `supabase/migrations/20260822000000_prune_posture_gate.sql (new)`, exactly the SQL in spec §2.3
   and §2.4: `assert_prune_enabled()` with its REVOKE/GRANT, then `create or replace` for both prune
   functions with `perform public.assert_prune_enabled();` first. One file, because the assert and its
   two callers are one contract and a half-applied pair is the spec R1 P1 hazard.
2. **Apply it locally** — without this the suite cannot go green and Task 2 cannot regenerate the
   manifest, which introspects the LOCAL all-migrations-applied database
   (`scripts/generate-schema-manifest.ts:1-10`):
   `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20260822000000_prune_posture_gate.sql`
3. Re-run the suite; it passes.

**Commit:** `feat(db): both retention prunes refuse under the validation posture`

## Task 2 — manifest, atomic validation apply, and the live probe on both functions

<!-- task: red=`env -u TEST_DATABASE_URL pnpm vitest run tests/db/validation-schema-parity.test.ts` ac=AC-6,AC-7,AC-9 -->

**RED, and why the obvious command is the WRONG one.** After Task 1's local apply the committed manifest
is stale, but a bare `pnpm vitest run tests/db/validation-schema-parity.test.ts` STILL PASSES: Layer 1 is
a DB-free tripwire over added columns and created tables only, so a new FUNCTION is invisible to it
(`tests/db/validation-schema-parity.test.ts:14-23`); Layer 2 asks only that validation be a SUPERSET of
the stale manifest; and Layer 3, the exact local-freshness comparison, SKIPS whenever `TEST_DATABASE_URL`
is set (`tests/db/validation-schema-parity.test.ts:231-239`), which `.env.local` always sets here.
`env -u TEST_DATABASE_URL` is therefore load-bearing, and an EMPTY value is not a substitute — the suite
fails loudly on an empty string by design.

Layer 3's discrimination was verified at plan time rather than assumed, by perturbing the committed
manifest and observing the red, then restoring it:

```
$ SCRATCH=$(mktemp -d)   # any directory outside the worktree; nothing here is committed
$ cp supabase/__generated__/schema-manifest.json "$SCRATCH/manifest.backup.json"
$ python3 -c "
import pathlib
p = pathlib.Path('supabase/__generated__/schema-manifest.json')
s = p.read_text()
a = 'prune_sync_log(retain interval) -> integer [DEFINER]'
b = 'prune_sync_log_PERTURBED(retain interval) -> integer [DEFINER]'
assert s.count(a) == 1, f'expected exactly one occurrence, found {s.count(a)}'
p.write_text(s.replace(a, b, 1))
"
$ env -u TEST_DATABASE_URL pnpm vitest run tests/db/validation-schema-parity.test.ts
  AssertionError: ... does not match a fresh introspection of the local DB
  -     "prune_sync_log_PERTURBED(retain interval) -> integer [DEFINER]",
  +     "prune_sync_log(retain interval) -> integer [DEFINER]",
  ❯ tests/db/validation-schema-parity.test.ts:247:7
  Tests  2 failed | 6 passed (8)
$ cp "$SCRATCH/manifest.backup.json" supabase/__generated__/schema-manifest.json
$ env -u TEST_DATABASE_URL pnpm vitest run tests/db/validation-schema-parity.test.ts
  Tests  8 passed (8)
```

Two details of that transcript are load-bearing rather than incidental. The `assert s.count(a) == 1`
is what makes the perturbation a known one-site edit instead of a silent no-op that would report the
same green twice. And the restore is a **copy back from a backup taken first**, not
`git checkout -- supabase/__generated__/schema-manifest.json`: `git checkout --` restores the file to
HEAD, so on the Task 2 sequence — where the manifest has been REGENERATED and not yet committed — it
would discard the regenerated manifest that is the task's actual deliverable. The backup copy restores
what was there, which is what the step means.

**GREEN.**

0. **Put the validation DSN in the shell, and prove it is VALIDATION.** `TEST_DATABASE_URL` lives in
   `.env.local`, and NOTHING in a worktree shell loads that file: not the shell, and not vitest —
   `tests/setup.ts` sets test defaults and reads no dotenv file, which is why
   `scripts/preflight-env.mjs:12` says so in a comment and parses `.env.local` itself. Every step below
   that names validation begins from this, once per shell:

   ```
   $ export TEST_DATABASE_URL="$(grep -m1 '^TEST_DATABASE_URL=' .env.local | cut -d= -f2-)"
   $ case "$TEST_DATABASE_URL" in
       *vzakgrxqwcalbmagufjh*) : ;;
       *) echo "REFUSING: TEST_DATABASE_URL does not name the validation project" >&2; exit 1 ;;
     esac
   $ psql "$TEST_DATABASE_URL" -tAc \
       "select current_database(),
               inet_server_addr()::text,
               (inet_server_addr() <<= inet '10.0.0.0/8'
                or inet_server_addr() <<= inet '172.16.0.0/12'
                or inet_server_addr() <<= inet '192.168.0.0/16'
                or inet_server_addr() <<= inet '127.0.0.0/8') as is_private"
   postgres|2600:1f16:15be:6700:…|f
   ```

   **Both guards are here because plan review r5 killed the single weaker one.** This step used to
   check `current_database()` and that the connection was over TCP, and LOCAL SATISFIES BOTH: its
   database is also named `postgres` and the local stack answers on `172.18.0.2`, so the old check
   returned `postgres|t` against exactly the database it was meant to exclude. A guard that passes on
   the value it exists to reject is worse than no guard, because it reads as one.

   **One variable is extracted rather than the file being sourced, and that is not fastidiousness.**
   `set -a; . ./.env.local; set +a` is the obvious form and it FAILS: `.env.local` holds values a shell
   cannot parse, and under zsh it aborts with `parse error near '\n'` partway through. It appears to
   work today only because `TEST_DATABASE_URL` sits at line 50 and the parse error is at line 61 — the
   assignment happens before the abort. Reorder the file and the variable silently stops being set,
   which lands straight back in the failure this step exists to prevent. Extracting the one key needed
   has no such ordering dependency.

   The first guard is the authoritative one: `vzakgrxqwcalbmagufjh` is the validation project ref
   (AGENTS.md names it), and the session pooler routes by it — it appears in the DSN's username as
   `postgres.vzakgrxqwcalbmagufjh`. A DSN that does not carry it cannot reach validation. The second is
   a cross-check on the answering server: validation reports a public address and `is_private = f`,
   local reports a private one and `is_private = t`, so a DSN pointed somewhere unexpected is caught
   even if it spells the ref. Verified in both directions against both databases before this step was
   written.

   **What is at stake if this step is wrong**, and it is the reason it is step 0 rather than a note:
   the next step applies a migration, and `psql ""` does not error on an empty DSN — it falls back to
   the local socket. Getting this wrong applies the gate to the wrong database, makes AC-6 refuse for
   the wrong reason, and lets AC-7 pass comparing local to local. Every one of those reports success.

1. `pnpm gen:schema-manifest`; commit the regenerated `supabase/__generated__/schema-manifest.json`.
   The named red command now passes.
2. Apply to `vzakgrxqwcalbmagufjh` in ONE atomic invocation, then reload PostgREST in a SECOND psql
   call — `notify` is SQL, not a shell command:

   ```
   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20260822000000_prune_posture_gate.sql
   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "notify pgrst, 'reload schema';"
   ```

   `-1` is load-bearing and covers the `do $$` block too: parity compares signatures, not bodies (spec
   §4.3), so a half-applied file would pass the gate.
3. **AC-6, the closing probe, two limbs, in ONE `psql -v ON_ERROR_STOP=1` script against validation**,
   invoked as `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f <script>` from the step-0 shell.
   Limb 1 reads the catalog only: `prolang = plpgsql` for both functions plus the body pin. Limb 2 is
   four calls — both functions, default and `interval '5 days'` forms — inside ONE `begin; … rollback;`,
   each in the spec §6 block shape whose `raise` after the `perform` makes a SUCCESSFUL prune fail the
   probe. Transcript into §12. The block shape was falsified in both directions at spec §3.11; re-run
   it rather than re-deriving it.
4. **AC-7, and it needs the exported variable, not an "ambient" one.**
   `pnpm vitest run tests/db/validation-schema-parity.test.ts` from the step-0 shell. Layer 2 is the
   layer that reaches validation, and `resolveParityDbUrl()` returns `LOCAL_DB_URL` when
   `TEST_DATABASE_URL` is undefined (`tests/db/validation-schema-parity.test.ts:92-93`), so run without
   the export this command passes while comparing local to local — green, and proving nothing about
   validation. Contrast the RED command at the head of this task, which unsets the variable on purpose
   to reach Layer 3; the two commands differ ONLY in that variable and prove different things.

**Commit:** `chore(db): regenerate the schema manifest for the prune posture gate`

## Task 3 — pin the `app_events_prune` cron row

<!-- task: red=`pnpm vitest run tests/log/appEventsSchema.test.ts tests/db/syncLogIndexesAndPrune.db.test.ts` ac=AC-8 -->

**AC-8** is the criterion this task proves, and it names BOTH cron rows, so this task runs both suites
that hold them. `app_events_prune`'s three assertions are what this task ADDS; `sync_log_prune`'s
already exist at `tests/db/syncLogIndexesAndPrune.db.test.ts:219-223` and are run here rather than
being left to Task 4's gate sweep. Plan review r3 was right that a criterion half-proven in one task
and half-run in another is owned by neither.

**Why it is in this arc at all:** spec review R7. A cron row
rewritten to `select public.prune_app_events(interval '5 days');` passes every gate criterion, refuses
on validation exactly as designed, and silently deletes production events aged 5 to 60 days. The gate
has no opinion about the argument, so the argument needs its own pin.

**RED, demonstrated by mutation because the production line is already correct.**
`tests/log/appEventsSchema.test.ts:108-111` selects `jobname` and asserts one row — the name and nothing
else. Extend that case to assert `command`, `schedule` and `active`, mirroring
`tests/db/syncLogIndexesAndPrune.db.test.ts:214-223`. The shipped row already satisfies all three
(`supabase/migrations/20260629000002_app_events.sql:58-62`), so the assertions go green immediately and
an assertion nobody has seen fail is the tautology the anti-tautology rule forbids. **Each of the three
new assertions gets its own mutation, run against the local database, its failure recorded in the
commit message, and the shipped state restored before the next one:**

```sql
-- (a) command  — expect the command assertion to fail
select cron.unschedule('app_events_prune');
select cron.schedule('app_events_prune', '17 4 * * *', 'select public.prune_app_events(interval ''5 days'');');
-- (b) schedule — expect the schedule assertion to fail
select cron.unschedule('app_events_prune');
select cron.schedule('app_events_prune', '19 4 * * *', 'select public.prune_app_events();');
-- (c) active   — expect the active assertion to fail
select cron.alter_job((select jobid from cron.job where jobname = 'app_events_prune'), active := false);
-- restore, after each of the three
select cron.unschedule('app_events_prune');
select cron.schedule('app_events_prune', '17 4 * * *', 'select public.prune_app_events();');
select cron.alter_job((select jobid from cron.job where jobname = 'app_events_prune'), active := true);
```

Three mutations, three recorded reds, one restore each — because a single command-only mutation leaves
the `schedule` and `active` assertions never having been seen to fail, which is the same defect one
level down.

**Commit:** `test(db): pin the app_events prune cron command, schedule and active`

<!-- tasks: end -->

## Task 4 — regression gates on every existing caller (NOT a TDD task, and it says so)

This task writes no production line and has no red of its own, so it sits OUTSIDE the declared task
region rather than carrying a `red=` marker it cannot honour. Plan review R1 was right that a gate-run
step dressed as a TDD task is a false claim; the honest form is to say what it is.

**AC-10 is a NO-EDIT criterion**: `tests/db/syncLogIndexesAndPrune.db.test.ts` and
`tests/log/appEventsSchema.test.ts` must pass with the marker `false` and **no edit made for the gate's
sake** — Task 3's cron pin is an addition to the second file, and it is the only permitted change to
either. Any edit that accommodates the gate is a design failure, not a repair.

Run, in order, recording each transcript in §12:

1. The two caller suites, scoped.
2. `tests/db/destructiveResetGate.test.ts` — the marker's own suite, which flips it. Proves the two
   gates coexist rather than fighting over one row.
3. `tests/db/postgrest-dml-lockdown.test.ts`, plus the registry-count reconciliation this plan promised:
   `sed -n '158,621p' tests/db/postgrest-dml-lockdown.test.ts | grep -c '^    table: "'` → still **34**,
   because this arc adds no table.
4. `tests/docs/specsReadmeIndexParity.test.ts`, `tests/docs/_metaReviewRoundEconomy.test.ts`,
   `tests/docs/_metaLedgerMintBar.test.ts`, `tests/docs/_metaLedgerInProgress.test.ts`.
5. `pnpm heavy pnpm test` — the wrapper takes the command as its argument and exits 2 with a usage
   line when given none (`scripts/with-heavy-slot.py`), so the command it wraps is named here rather
   than implied. Then `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.


---

## 12. Closeout

impeccable-gate: N/A — no UI surface

- Ledger: `BL-VALIDATION-PRUNE-DB-SIDE-GATE` graduates to `BACKLOG-archive.md` with the §3 measurement
  replacing its `INFERRED, NOT PROBED` reachability field. The invariant-12 IN PROGRESS marker comes
  off in the PR's LAST commit, before the merge.
- Review-round record: filed if any stage reaches four counted rounds
  (the sibling `.md` of the arc's round corpus, `docs/review-rounds/feat/validation-prune-db-side-gate/50ca72a566b0.md`, filed at the cap).
- Gate transcripts (Task 4) land here.

### AC-6 — the live validation probe, run 2026-08-24

Run after the atomic surgical apply to `vzakgrxqwcalbmagufjh`, from the Task 2 step 0 shell. The
project's posture marker reads `enabled=true`, which is what makes this the real test rather than a
rehearsal.

```
$ psql "$TEST_DATABASE_URL" -tAc "select id||' enabled='||coalesce(enabled::text,'NULL')
                                  from public.destructive_reset_gate"
default enabled=true

$ psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f ac6-validation-probe.sql
── limb 1: pre-check. Reads only, calls nothing, and is NOT the oracle. ──
NOTICE:  limb 1 ok: prune_app_events is plpgsql and calls the assert
NOTICE:  limb 1 ok: prune_sync_log is plpgsql and calls the assert
DO
── limb 2: behavioural. FOUR calls, ONE transaction, ONE rollback. ──
BEGIN
NOTICE:  limb 2 ok: prune_sync_log() refused
NOTICE:  limb 2 ok: prune_sync_log(interval '5 days') refused
NOTICE:  limb 2 ok: prune_app_events() refused
NOTICE:  limb 2 ok: prune_app_events(interval '5 days') refused
ROLLBACK
── AC-6 passed: both functions, both argument forms, all four refused. ──
exit=0
```

**Every `refused` line above is an exception that was RAISED and matched `prune not enabled%`.** Had any
call succeeded, the `raise exception 'GATE MISSING: …'` on its success path would have fired, failed to
match the handler's filter, been re-raised, and stopped the script under `ON_ERROR_STOP` — a successful
prune fails this probe, which is the property spec R5 found missing from the SQL half.

This is the measurement that closes the ledger row's `Reachability: INFERRED, NOT PROBED` field. The
2026-08-22 probe measured a default `prune_sync_log()` deleting 2,488 live rows on this project; the
same call now refuses.

### AC-7 — parity, both forms, run 2026-08-24

```
$ pnpm vitest run tests/db/validation-schema-parity.test.ts                      # Layer 2 → validation
  Tests  8 passed (8)
$ env -u TEST_DATABASE_URL pnpm vitest run …/validation-schema-parity.test.ts    # Layer 3 → local freshness
  Tests  8 passed (8)
```
