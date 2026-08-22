# BL-VALIDATION-PRUNE-DB-SIDE-GATE — gate `prune_sync_log` / `prune_app_events` at the database, so no client, spelling, or channel can prune the validation project

**Row:** `BL-VALIDATION-PRUNE-DB-SIDE-GATE` (BACKLOG.md) · **Facing:** product · **Filed by:** `feat/destructive-guard-discovery-by-connection`, spec `docs/superpowers/specs/ci/2026-08-21-destructive-guard-discovery-by-connection-design.md` §4.1 / §7 · **Branch:** `feat/validation-prune-db-side-gate`

---

## §0 The bound this arc is held to

**Consequence bound.** On a database that declares the validation posture — or declares no posture at
all — `public.prune_sync_log()` and `public.prune_app_events()` delete zero rows and raise, through
every client and every spelling. On a database that declares the production posture they behave exactly
as they do today, including the cron rows and both existing suites. There is no third outcome: the
posture is read on every call, and anything other than an explicit `false` is a refusal.

**Probe domain.** The two function bodies (`supabase/migrations/20260809000000_sync_log_show_attribution.sql`
`prune_sync_log`, `supabase/migrations/20260629000002_app_events.sql` `prune_app_events`), their callers
(the two `cron.job` rows, `tests/db/syncLogIndexesAndPrune.db.test.ts`, `tests/log/appEventsSchema.test.ts`),
the posture marker `public.destructive_reset_gate` and its ratified contract
(`docs/superpowers/specs/admin/2026-06-22-validation-reset-button-design.md:32`), and the live
grant/marker/population state of the validation project `vzakgrxqwcalbmagufjh` and the local stack, as
probed in §3. A probe outside that domain — a database posture nobody operates, a hostile actor who
already holds service-role credentials — files to §4, not to a round.

**Threat fence.** The gate defends against **accidental deletion by a caller that legitimately holds
service-role reach**: a suite, script, or one-off whose connection happens to point at validation. That
is the whole live population, because `anon` and `authenticated` have no EXECUTE on either function
already (§3.1) — the gap this closes is not a missing grant, it is that every holder of the grant the
system does hand out (the pooler DSN in `.env.local`, the service-role key) can prune validation by
accident. It does **not** defend against a hostile holder of those credentials, who can flip the posture
marker; that is out of scope by declaration, the same fence `destructive_reset_gate` carries
(`tests/db/destructiveResetGate.test.ts` header).

**Closed criterion.** Both prunes refuse on the validation project; every legitimate caller on local and
prod is unaffected; proven by the executable criteria in §6, of which AC-6 is the live half: BOTH functions, in both call
forms, refusing on the validation project. §3.3 is the BEFORE half of that comparison and covers
`prune_sync_log` only, so it is cited as the measurement of what the gate prevents (2,488 rows), never
as the closing evidence. That criterion is finite and settled by running commands, not by enumerating
inputs.

**This is not a recognizer.** Nothing here reads SQL text, file paths, connection URLs, or anything a
test authors. The gate is one boolean read inside the function body, so the spelling axis that produced
the filing row's limit is not merely narrowed, it is absent.

---

## §1 The measured case

### §1.1 Resolved scope — do not relitigate

| Decision | Ratified at | Why it is closed |
| --- | --- | --- |
| **Widening the SQL recognizer** is not the repair | `BACKLOG.md` row, "Eliminated on the way here"; `tests/db/_metaDestructiveDbTargetGuard.test.ts:45` | The spelling axis is open; the r15/r16 history of that guard is the ratchet. |
| **Discovery by connection** is not the repair | filing spec §4.1 | It shipped as the census; its documented limit IS this row. |
| **A psql-side or REST-side guard** is not the repair | `BACKLOG.md` row | Different channels, same spelling problem. Both channels are probed live in §3.4 and §3.5. |
| **The gate lives at the database, inside the function body** | filing spec §4.1 "The terminating answer is DB-side" | Every client, spelling and channel converges there. |
| **The posture marker is the EXISTING `destructive_reset_gate`, read at runtime — this arc adds no second marker** | §2.2, and the R1 finding that killed the two-marker design (§3.9) | Two rows encoding one fact can disagree, and every lifecycle hole R1 found was an instance of that disagreement. |
| **A database that declares no posture refuses** (`enabled IS NOT FALSE`, so NULL refuses too) | §2.3 | The failure direction that matters is a validation project silently pruning. |
| **Retention pausing while a database declares the validation posture is intended, not a regression** | §2.5, §4.2 | The refusal in `cron.job_run_details` is the gate's own durable evidence. |
| **The threat fence** — a caller who can already flip the marker is out of scope | §0, §4.1 | Same fence `destructive_reset_gate` ships with. |
| **No mutation-registry enrolment** | §4.4 | `tests/mutation/source/registry.ts:15` keys a surface by a TypeScript `sourcePath`; a SQL function is not expressible there. Stated, not enrolled symbolically. |
| **"Delete-then-raise" is NOT a live wrong-implementation for AC-2** | §3.9, R1 reviewer refutation | An uncaught exception rolls the statement back, so the ordering is unobservable in Postgres. Recorded so no later round re-derives it; AC-2 asserts the committed outcome instead. |

### §1.2 What the filing row inferred, and what the probe measured

The row shipped `**Reachability:** INFERRED, NOT PROBED`. §3 settles it: reachability is **CONFIRMED**,
and the magnitude is larger than the row assumed. A default `select public.prune_sync_log()` issued
against the validation project from the DSN that `.env.local` hands every `tests/**` file deletes
**2,488 live rows** (§3.3). The same call through the PostgREST `rpc` endpoint with the validation
service-role key is accepted (§3.5). No layer in either probed channel refuses it.

The incident is not hypothetical either: `tests/log/appEventsSchema.test.ts:5-9` records that this file
once resolved its URL from `TEST_DATABASE_URL` and "a plain `pnpm test` therefore pruned live validation
history". That was repaired client-side, on that one file, by `assertLocalDbUrl`
(`tests/log/appEventsSchema.test.ts:10-12`, `const url = assertLocalDbUrl(`) — the exact class of repair
this row exists to terminate.

---

## §2 The design

### §2.1 One sentence

Both prune functions call `public.assert_prune_enabled()` before deleting anything, and it refuses
unless this database's existing posture marker says, explicitly, that this is not a validation database.

### §2.2 The marker already exists, and adding a second one was the R1 P0

`destructive_reset_gate.enabled` is this repo's in-database statement of "this is the validation
database". Its contract is ratified and durable, not a temporary arm:
`docs/superpowers/specs/admin/2026-06-22-validation-reset-button-design.md:32` (D4) specifies the row is
migration-owned at `false` **in every environment**, and that it is set `true` "**only in the validation
DB, out-of-band** (one-time `update ...`, exactly like the `ALLOW_DESTRUCTIVE_RESET` env var)", with prod
keeping `false` permanently and no runtime session able to flip it **through PostgREST** — D4 grants the
marker to `service_role` and describes the flip itself as a service-role/psql `update`
(`supabase/migrations/20260622000001_validation_reset_rpc.sql:10-11`). §4.1 states that boundary as the
threat fence; this paragraph does not widen it.

The first draft of this spec introduced a second table, `prune_gate`, seeded at migration-apply time from
that marker. Spec review R1 refuted it with three lifecycle states in which the two markers disagree and
the disagreement is silently permissive (§3.9). The repair is subtraction: there is one fact — the
database's posture — so there is one row that records it, read where it is needed.

What this deliberately accepts, stated plainly: while a database declares the validation posture, its
retention prunes refuse. On validation that is permanent and intended. On production it can only happen
if someone flips a marker that D4 says production never flips, and the consequence would be paused
retention with a daily error in `cron.job_run_details` — conservative and loud, never a silent deletion.
§4.2 records it as a limit rather than hiding it.

### §2.3 The check

```sql
create or replace function public.assert_prune_enabled() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_validation boolean;
begin
  select enabled into v_validation from public.destructive_reset_gate where id = 'default';
  -- true => this database declares the validation posture (D4) => refuse
  -- null => no posture marker at all                           => refuse
  if v_validation is not false then
    raise exception 'prune not enabled for this database';
  end if;
end;
$$;
revoke all on function public.assert_prune_enabled() from public, anon, authenticated;
grant execute on function public.assert_prune_enabled() to service_role;
```

`is not false` is the whole fail-closed contract in one predicate: `true` refuses because the database
said it is validation, `null` refuses because the database said nothing. Only an explicit `false` — the
value D4 ships to every environment and prod keeps forever — allows a prune. R1's third hole was exactly
the state a `coalesce(..., false)` read would have waved through, and this predicate is why it cannot
recur.

### §2.4 The two function bodies

Each gains one statement:

```sql
create or replace function public.prune_sync_log(retain interval default interval '60 days')
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  perform public.assert_prune_enabled();
  with deleted as (
    delete from public.sync_log where occurred_at < now() - retain returning 1
  )
  select count(*)::int into v_deleted from deleted;
  return v_deleted;
end;
$$;
```

`prune_app_events` changes identically against `public.app_events`.

**What must not move**, because live assertions pin it — every row re-measured after the rewrite in §3.8:

| Property | Pinned at | After this change |
| --- | --- | --- |
| `prosecdef = true` | `tests/db/syncLogIndexesAndPrune.db.test.ts:109` (`expect(fn!.prosecdef)`) | unchanged (`security definer`) |
| `proconfig = ["search_path=public, pg_temp"]` | `tests/db/syncLogIndexesAndPrune.db.test.ts:110` (`expect(fn!.config)`) | unchanged |
| argument list `retain interval DEFAULT '60 days'` | `tests/db/syncLogIndexesAndPrune.db.test.ts:114` (`expect(fn!.args)`) | unchanged |
| `service_role` execute yes, `anon`/`authenticated` no | `tests/db/syncLogIndexesAndPrune.db.test.ts:117-129` | unchanged (`create or replace` preserves grants; measured in §3.8) |
| return equals the global deleted count | `tests/db/syncLogIndexesAndPrune.db.test.ts:154-157` | unchanged; the count is computed the same way |
| the explicit-cutoff parameter is read | `tests/db/syncLogIndexesAndPrune.db.test.ts:200-206` | unchanged |
| cron command is the no-argument form | `tests/db/syncLogIndexesAndPrune.db.test.ts:219` | unchanged; the cron rows are not touched |

The language changes from `sql` to `plpgsql` because a `language sql` body cannot raise. No assertion in
the corpus pins `prolang`; §6 AC-5 adds one for the new state so the change is declared rather than
incidental.

### §2.5 What happens to the daily cron on validation

It fails, daily, with `prune not enabled for this database`, recorded in `cron.job_run_details`. That is
the intended end state and it is the gate's own durable evidence. Three consequences, all stated so no
reviewer has to guess:

- **Validation telemetry stops being pruned.** Measured population at probe time: 149,861 `sync_log`
  rows and 45,261 `app_events` rows (§3.1, §3.3). Growth is bounded by validation traffic, which is test
  traffic. This is the accepted cost of the row.
- **Nothing in the repo reads cron success**, so no suite reds. `tests/cross-cutting/pg-cron-coverage.test.ts:111-118`
  asserts these two jobs exist and are deliberately outside the `fxav_cron_` namespace; it makes no claim
  about their outcome, and the repo has no reader of `cron.job_run_details` under `app/`, `lib/`, or
  `supabase/`.
- **Deliberate pruning of validation stays possible**, by one motion an operator already knows: set the
  posture marker to `false`, run the prune, set it back to `true`. §4.2 records why that is not automated.

### §2.6 Obligations this change inherits

| Obligation | Where | Action |
| --- | --- | --- |
| PostgREST DML lockdown registry | `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES` | **None.** No table is created and no table-level REVOKE is added, so Layer 4's migration walk (`tests/db/postgrest-dml-lockdown.test.ts:1007-1055`) has nothing new to register. This is a saving the two-marker draft did not have. |
| Schema manifest | `supabase/__generated__/schema-manifest.json` | Regenerate with `pnpm gen:schema-manifest` after the local apply and commit in the same PR. |
| Validation parity | `tests/db/validation-schema-parity.test.ts` | Apply the migration surgically to `vzakgrxqwcalbmagufjh` (`supabase db push` is blocked) in ONE `psql -v ON_ERROR_STOP=1 -1` invocation, then `notify pgrst, 'reload schema';`. Atomicity matters because parity compares signatures, not bodies (§4.3), so a half-applied file would not be caught by the gate — only by AC-6, which probes both functions live. |

---

## §3 Probes

**What §3 is, and the one thing it is not.** These are the one-time reachability measurements that
settled the filing row's `INFERRED, NOT PROBED` field. They ran BEFORE any gate existed, against a
database where every call was expected to succeed, and two of them committed deliberately: §3.2's seeded
round-trip committed its own two seeds and their deletion, and the 100-year calls in §3.2 and §3.5
committed a delete of zero rows guarded by the §3.1 precondition rather than by a transaction. §3.3 is
the exception that proves the shape — the one measurement whose magnitude made rollback mandatory used
one.

They are therefore a RECORD, not a harness, and the §6 rollback rule does not reach backwards to claim
otherwise. **Do not re-run §3.2 or §3.5 as written**: a precondition counted in a separate autocommitted
statement bounds nothing on a live project (R4's finding, and R6's when the same shape was left standing
in the history). The re-runnable form of every one of these questions is AC-6, whose calls are inside one
`begin; … rollback;` and whose blocks fail on success.



All commands were run 2026-08-22 from the branch worktree. The validation DSN is
`TEST_DATABASE_URL` from `.env.local` (host `aws-1-us-east-2.pooler.supabase.com`, user
`postgres.vzakgrxqwcalbmagufjh`), pinned explicitly on every command rather than resolved through a
fallback chain, because a fallback evaluated in two processes is two databases wearing one name.

### §3.1 Posture, grants and population on the validation project

```
psql "$TEST_DATABASE_URL" -f probe/p0.sql
```

```
 current_user | session_user | current_database | remote
 postgres     | postgres     | postgres         | t

             fn             | security_definer |  owner
 prune_app_events(interval) | t                | postgres
 prune_sync_log(interval)   | t                | postgres

             fn             | anon | authenticated | service_role | postgres_role
 prune_app_events(interval) | f    | f             | t            | t
 prune_sync_log(interval)   | f    | f             | t            | t

   id    | enabled          -- destructive_reset_gate
 default | t

 total  |            oldest             | older_than_60d | older_than_100y   -- sync_log
 149853 | 2026-06-23 04:25:02.197847+00 |           2469 |               0

 total | oldest                        | older_than_60d | older_than_100y    -- app_events
 45261 | 2026-06-30 11:15:02.545833+00 |              0 |               0
```

Three facts fall out. The prunes exist on validation with the same posture as local. `anon` and
`authenticated` cannot execute them, so the reachable client is anything holding the pooler DSN or the
service-role key — which is every `tests/**` file, since `.env.local` hands them the former.
`destructive_reset_gate.enabled = true` confirms the marker §2.3 derives from. And the zero in
`older_than_100y` is the precondition that makes the next two probes non-destructive.

### §3.2 Authorization observed with a window that deletes nothing, then a seeded round-trip

```
select public.prune_sync_log(interval '100 years');    -- 0
select public.prune_app_events(interval '100 years');  -- 0
```

Both are accepted and delete nothing: authorization is observed without touching a live row.

The seeded round-trip proves the delete actually fires rather than merely returning zero. One row is
inserted into each table at `now() - interval '150 years'` — older than any live row by a century — then
pruned with the same 100-year window:

```
 sync_log_seeded | app_events_seeded
               1 |                 1
 sync_log_pruned                      1
 app_events_pruned                    1
 sync_log_seed_remaining | app_events_seed_remaining
                       0 |                         0
```

Collateral: zero, by the §3.1 precondition. A `delete ... where message = '<marker>'` ran afterward as a
belt-and-braces cleanup and reported `DELETE 0`, confirming the prune had already taken both seeds.

### §3.3 The magnitude of the DEFAULT call, bounded by ROLLBACK

The call an errant test actually makes is the no-argument form. Running it for real would delete live
validation history, so it ran inside a transaction that was rolled back:

```
 sync_log_rows_before            149861
 BEGIN
 default_call_would_delete         2488
 ROLLBACK
 sync_log_rows_after_rollback    149861
```

**2,488 live rows** would be deleted by one unguarded `select public.prune_sync_log()`. The before and
after counts are equal, so the probe cost nothing. This is the number the filing row could only infer.

The counts move between §3.1 and §3.3 (149,853 → 149,861 total; 2,469 → 2,488 past the cutoff) because
validation is a live project taking test traffic while the probe runs. Every number here is a reading at
its own moment, not a constant, and each is reported with the command that produced it.

### §3.4 The `postgres` DSN channel is the one `tests/**` gets by default

Every statement in §3.1-§3.3 ran as role `postgres` over the pooler DSN held in `TEST_DATABASE_URL` —
the same variable much of `tests/` and `lib/` resolve (42 files under `lib/` and `app/` name it). `has_function_privilege('postgres', …)`
is `t` for both functions, and `postgres` is the table owner, so no grant-level layer stands in the way.

### §3.5 The PostgREST channel is live too

```
POST {VALIDATION_SUPABASE_URL}/rest/v1/rpc/prune_sync_log     {"retain":"100 years"}
  validation service-role key → HTTP 200, body 0
POST .../rpc/prune_app_events {"retain":"100 years"}
  validation service-role key → HTTP 200, body 0
```

A second, entirely different client reaches the same function. This is why the guard cannot live in a
client: there is more than one client, and the census's URL-provenance classification does not see this
one at all.

**Honest limit of this probe.** The same two calls with the LOCAL anon key returned
`HTTP 401 {"message":"Invalid API key"}`. That is the API gateway rejecting a key minted for another
project, not PostgREST refusing the `anon` role, so it is evidence about the gateway and nothing else.
The anon question is settled by the catalog read in §3.1 (`has_function_privilege('anon', …) = f`), which
is the authority here.

### §3.6 Local posture, so the change can be shown not to break it

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f probe/p5.sql
```

```
 current_database | server
 postgres         | 172.18.0.10

   id    | enabled       -- destructive_reset_gate
 default | f

             fn             | service_role
 prune_app_events(interval) | t
 prune_sync_log(interval)   | t

     jobname      |  schedule  |              command              | active
 app_events_prune | 17 4 * * * | select public.prune_app_events(); | t
 sync_log_prune   | 23 4 * * * | select public.prune_sync_log();   | t
```

The same two cron rows exist on validation with identical schedules and commands. Local's reset gate is
`false` — the production posture — so `assert_prune_enabled()` (§2.3) permits both prunes locally and
every existing suite keeps passing, which AC-4 proves by execution rather than by this paragraph.

### §3.7 Prod was NOT probed

This worktree holds no production credentials (`SUPABASE_URL` resolves to `http://127.0.0.1:54321`).
Prod's behaviour is derived, not measured: prod has never flipped `destructive_reset_gate`
(`tests/db/destructiveResetGate.test.ts` header, "Production never flips the gate"; D4 at
`docs/superpowers/specs/admin/2026-06-22-validation-reset-button-design.md:32`), so the marker reads
`false` there and both prunes keep running exactly as today. The derivation has one premise — prod's
marker is `false` — and it is the same premise the reset RPC has depended on since 2026-06-22, so this
arc adds no new assumption about production. If it were ever wrong the consequence is §4.2's: retention
pauses loudly, nothing is deleted.

---

### §3.8 The shipped design, dry-run against local inside a rolled-back transaction

Run 2026-08-22, after R1, from a scratchpad SQL script reproduced by the four states below. Four states, one transaction, `rollback` at the
end; the local database was re-read afterward and holds neither the function change nor any probe row.

```
--- state A: marker false (local/prod posture) => prune runs ---
 reset_gate
 f
 expected            1
 pruned_state_a      1

--- state B: marker true (validation posture) => refuses ---
 UPDATE 1
 NOTICE:  state B refused as designed: prune not enabled for this database
 p7_b_row_survived   1

--- state C: marker row ABSENT => refuses (fail-closed, R1's third hole) ---
 DELETE 1
 NOTICE:  state C refused as designed: prune not enabled for this database

--- state D: explicit-cutoff form is gated in every state ---
 NOTICE:  state D refused as designed: prune not enabled for this database
 ROLLBACK
```

An earlier run of the same shape, against the two-marker draft, measured the property table §2.4
promises, and those measurements carry unchanged because the function bodies are identical apart from
the check they call:

```
     proname      | prosecdef |            proconfig            | lanname |                    args                     | service_role | anon | authenticated
 prune_app_events | t         | {"search_path=public, pg_temp"} | plpgsql | retain interval DEFAULT '60 days'::interval | t            | f    | f
 prune_sync_log   | t         | {"search_path=public, pg_temp"} | plpgsql | retain interval DEFAULT '60 days'::interval | t            | f    | f
```

`create or replace` preserved both function-level grants: `anon` and `authenticated` stay `f` without
the migration restating a REVOKE.

### §3.9 Spec round 1 — two findings, both admissible, both repaired

**P0 — the seed lifecycle could leave validation pruning.** The draft created a second table,
`prune_gate`, seeded from `destructive_reset_gate` at apply time. The reviewer produced three states in
which the two rows disagree permissively: a fresh validation project seeded before its one-time posture
flip; a production dump restored into validation, where `on conflict do nothing` blocks any repair on
re-apply; and a missing SOURCE row with an existing TARGET row, where the draft's `raise` guard checked
the target and therefore passed while claiming the migration would fail. The third is the sharpest,
because the draft's prose asserted the opposite of what its SQL did.

Repaired by subtraction, not by patching the seed: the second table is gone (§2.2), the one existing
marker is read at runtime, and `is not false` refuses on both `true` and `null` (§2.3). All three states
are now refusals; states B and C of §3.8 are the executable form of the reviewer's second and third.

**P1 — the closeout proved only one of the two bodies landed.** AC-8 in the draft re-ran the §3.3 probe,
which calls only `prune_sync_log`, and the parity gate compares tables, columns and function SIGNATURES
(`tests/db/validation-schema-parity.test.ts:25`), so a partial surgical apply that updated one body and
not the other passed every criterion while validation's `prune_app_events` kept deleting. Repaired in
§2.6 (one atomic `psql -v ON_ERROR_STOP=1 -1` invocation) and AC-6 (the live probe covers BOTH functions,
and asserts `prolang` on both).

**Refuted, recorded so no later round re-derives it.** The reviewer refuted the draft's claim that AC-2
kills a "delete-then-raise" body: an uncaught exception rolls back the statement's deletion, so the
ordering is unobservable in Postgres and no such wrong implementation is distinguishable. AC-2 is
restated in §6 to assert what is actually observable — the committed outcome — and §1.1 carries the
refutation.

---

### §3.10 Grants, RLS and triggers on the two prune targets, derived rather than recalled

Run 2026-08-22 against the local stack, because R3 found two matrix claims that lumped the tables
together when they differ:

```
        relname         | rls | policies | policy_names | anon_sel | anon_del | auth_sel | auth_del | svc_del
 app_events             | t   |        0 |              | f        | f        | f        | f        | t
 destructive_reset_gate | t   |        0 |              | f        | f        | f        | f        | t
 sync_log               | t   |        1 | admin_only   | t        | f        | t        | f        | t

  relname   | triggers        -- non-internal only
 app_events |        0
 sync_log   |        0
```

`sync_log` retains `anon`/`authenticated` SELECT behind its `admin_only` policy; `app_events` grants
them nothing. Neither grants DELETE to `anon` or `authenticated`, so no runtime session can delete from either table.
`service_role` holds full DML on both (`supabase/migrations/20260629000002_app_events.sql:29`,
`supabase/migrations/20260803000000_lockdown_admin_only_tables.sql:54`), so a direct
`delete from public.sync_log` remains reachable to a service-role caller: this gate closes the PRUNE
path, not every path. That residue is the client-side destructive-statement guard's subject (a literal
DELETE is exactly the shape `DESTRUCTIVE_STATEMENT_PATTERNS` does match), which is why the filing row
scoped this work to the prunes — the functions no recognizer reliably sees. Recorded as §4.6.

### §3.11 AC-6's block shape, falsified in both directions

R5 found AC-6 asserting the absence of a wrong error rather than the presence of a refusal. The repaired
shape was then run against a deliberately UNGATED function and a deliberately GATED one, on local,
inside transactions that were rolled back:

```
-- ungated stand-in: `create function ungated_probe_fn() ... select 1`
ERROR:  GATE MISSING: ungated_probe_fn() succeeded on this database
psql exit code (ungated, expect nonzero): 3

-- gated stand-in: raises 'prune not enabled for this database'
psql exit code (gated, expect 0): 0

select to_regproc('public.ungated_probe_fn') is null
   and to_regproc('public.gated_probe_fn')   is null as both_rolled_back;
 t
```

The positive control is the half that matters: without the `raise` on the success path, the ungated run
also exits 0, which is precisely the false green R5 named. Exit codes were read directly from `$?` on the
`psql` process, not through a pipe — a pipeline's status is the last command's.

---

## §4 Documented limits

Each is conservative-plus-loud or out of the threat fence; none is silent.

### §4.1 A caller who can flip the posture marker can prune

Anything holding the validation service-role key or the pooler DSN can `update
public.destructive_reset_gate set enabled = false` and then prune. This is the declared threat fence
(§0) and the identical limit `destructive_reset_gate` already carries for the reset itself. What the
gate buys is that the deletion is no longer reachable by ACCIDENT: it takes a deliberate, separately
spelled write to a table whose name says what it is.

### §4.2 Retention pauses wherever the validation posture is declared

Stated in §2.2 and §2.5. On validation that is the point. On production it requires flipping a marker
that D4 says production never flips, and its worst case is accumulating rows plus a daily error in
`cron.job_run_details` — never a silent deletion. Automating a flip-prune-unflip cycle on validation
would reinstate exactly the unguarded window this row closes, on a schedule. Declined. Re-file trigger:
validation `sync_log` growth becoming an operational problem, which is a storage measurement, not a
review finding.

### §4.3 A database that has declared no posture at all refuses, and parity cannot see a body

Two limits with one shape — the gate is only as good as what the database records:

- A brand-new database, before any migration seeds the marker, has no posture and therefore refuses.
  That is the correct direction (nothing to prune yet, and no silent deletion), and it is loud.
- `tests/db/validation-schema-parity.test.ts` compares tables, columns and function signatures, not
  bodies. A validation project holding an OLD body with a current signature passes parity. That is why
  §2.6 applies the migration atomically and AC-6 probes behaviour live rather than trusting the gate.

### §4.4 The surface is not mutation-registry expressible

`tests/mutation/source/registry.ts:15` keys every enrolled surface on a TypeScript `sourcePath` overlaid
into a Vitest run; every current row points at a `.ts` file. A SQL function in a migration cannot be
overlaid by that runner, so this arc enrols nothing rather than enrolling symbolically — the disposition
the step3 tap-target probe reached for its Playwright surface. The equivalent proof here is AC-1 to AC-5:
the refusal is asserted by execution against a real database, in every posture state.

### §4.6 A direct `delete from` remains reachable to a service-role caller

`service_role` holds full DML on both tables (`supabase/migrations/20260629000002_app_events.sql:29`,
`supabase/migrations/20260803000000_lockdown_admin_only_tables.sql:54`), so this gate closes the PRUNE
path and not every path: a caller who writes `delete from public.sync_log where …` still deletes. That
is deliberate scope, not an oversight. A literal DELETE is the shape the client-side
destructive-statement recognizer DOES match reliably, which is why the filing row scoped this arc to the
two functions — the calls no recognizer sees. Re-file trigger: a measured incident where a literal
DELETE reaches validation despite that recognizer.

### §4.5 `dev.*` is untouched

The shadow schema is local-seed infrastructure and holds no prune function; `to_regclass('dev.sync_log')`
is consulted only for indexes (`supabase/migrations/20260809000000_sync_log_show_attribution.sql:26-30`).
Out of scope, no action.

---

## §5 DB completeness matrix

Every affected domain × layer. Every cell is an action or an `N/A — reason`.

| Layer | `assert_prune_enabled` | `prune_sync_log` | `prune_app_events` | `destructive_reset_gate` | `sync_log` / `app_events` |
| --- | --- | --- | --- | --- | --- |
| Table DDL | N/A — a function, not a relation | N/A — a function | N/A — a function | N/A — unchanged; created at `supabase/migrations/20260622000001_validation_reset_rpc.sql:6` | N/A — unchanged; no column, index or constraint moves |
| Inline CHECK | N/A — functions carry no CHECK | N/A — same | N/A — same | N/A — existing `id = 'default'` CHECK unchanged | N/A — the existing `*_drive_file_id_nonblank` and `app_events_level_check` CHECKs are unchanged; this diff adds none |
| Grants / REVOKE | REVOKE public/anon/authenticated; GRANT service_role | unchanged (`create or replace` preserves; measured §3.8) | unchanged (same) | N/A — unchanged | N/A — table grants unchanged, and they DIFFER by table: `app_events` gives `anon`/`authenticated` nothing (`supabase/migrations/20260629000002_app_events.sql:28`), while `sync_log` deliberately RETAINS their SELECT behind RLS (`supabase/migrations/20260803000000_lockdown_admin_only_tables.sql:31-32`, registry `selectAnon: true` at `tests/db/postgrest-dml-lockdown.test.ts:201-206`). Neither grants DELETE to either role; measured in §3.10 |
| RLS | N/A — functions have no row security | N/A — same | N/A — same | N/A — already enabled, no policy | N/A — RLS already enabled on both, but only `app_events` has zero policies; `sync_log` carries the `admin_only` policy (`supabase/migrations/20260501002000_rls_policies.sql:67-73`) that gates its retained SELECT. Measured in §3.10 |
| RPC read path | reads the marker | calls the assert before deleting | calls the assert before deleting | read by the assert AND by the existing reset RPCs | read by each prune's `occurred_at < now() - retain` cutoff predicate, unchanged |
| RPC write path | N/A — never writes anything | **the write this whole spec is about**: `delete from public.sync_log where occurred_at < now() - retain` (`supabase/migrations/20260809000000_sync_log_show_attribution.sql:46`), now reached only after the assert | same against `public.app_events` (`supabase/migrations/20260629000002_app_events.sql:39`) | N/A — this arc never writes it; the one-time posture flip is the existing out-of-band step (D4) | written by exactly those two deletes and by nothing else this arc adds; both are gated |
| Trigger | N/A — no trigger fires on or from it | N/A — no propagation trigger exists on either prune path | N/A — same | N/A — no trigger on the marker table | N/A — neither table carries a non-internal trigger (measured, §3.10); retention is the cron, not a trigger |
| Cleanup / cron | N/A — not a cron target | cron row `sync_log_prune` unchanged (`supabase/migrations/20260809000000_sync_log_show_attribution.sql:63-67`); the job now refuses under the validation posture (§2.5) | cron row `app_events_prune` unchanged (`supabase/migrations/20260629000002_app_events.sql:58-62`); same refusal | N/A — no retention on a one-row marker table | these ARE the cleanup targets: pruned daily at 60 days on a production-posture database, never pruned on a validation-posture one |
| Advisory lock (invariant 2) | N/A — acquires nothing | N/A — not in the invariant-2 table set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`) and the prune is not show-keyed | N/A — same | N/A — unchanged; the reset RPC's own lock topology is untouched | N/A — neither table is in the invariant-2 set, so no holder is added at any layer |
| Mutation-surface telemetry (invariant 10) | N/A — no HTTP route and no `"use server"` action; this diff is SQL functions, tests and docs | N/A — same, and its caller is a `cron.job` row, not a route | N/A — same | N/A — untouched by this arc | N/A — this diff adds no mutating route and no `"use server"` action; the existing sync writers to `sync_log` are untouched |
| PostgREST lockdown registry | N/A — no new table and no new table-level REVOKE (§2.6) | N/A — function-level grants are asserted by `tests/db/syncLogIndexesAndPrune.db.test.ts:117-129`, not by the table registry | N/A — same | N/A — already registered (`tests/db/postgrest-dml-lockdown.test.ts:552`) | N/A — both already registered: `sync_log` at `tests/db/postgrest-dml-lockdown.test.ts:199`, `app_events` at `tests/db/postgrest-dml-lockdown.test.ts:323` |
| Schema manifest | regenerate + commit | regenerate + commit | regenerate + commit | N/A — unchanged | N/A — unchanged |
| Validation project | atomic surgical apply + `notify pgrst` | same | same | N/A — its row already reads `true` there (§3.1); this arc does not write it | N/A — no DDL reaches either table |
| Frontend | N/A — no UI surface in this diff | N/A — no component or route reads either prune | N/A — same | N/A — the admin reset UI that reads this marker is untouched | N/A — this diff changes no UI; existing admin readers of `sync_log` are untouched |
| Tests | `tests/db/pruneGate.db.test.ts (new)` (§6) | AC-1..AC-5 | AC-1..AC-5 | AC-3 forces each posture state | AC-4 (existing suites stay green, unedited) |

**CHECK/enum migration matrix:** no CHECK and no enum changes anywhere in this diff — the only new
object is a function. There is therefore no transitional window, no old/new value overlap, and no
`DROP ... IF EXISTS` + `ADD` idempotency question. Apply-twice idempotency is carried by
`create or replace function` alone, and re-applying the migration is a no-op on an already-current
database.

**Flag lifecycle table** (this spec introduces no new flag; it adds a reader to an existing one):

| Flag | Storage | Write path(s) | Read path(s) | Effect on output |
| --- | --- | --- | --- | --- |
| `destructive_reset_gate.enabled` | `public.destructive_reset_gate`, one row `id='default'`, migration-owned at `false` everywhere (`supabase/migrations/20260622000001_validation_reset_rpc.sql:13`) | the one-time out-of-band `update` on the validation DB (D4); no application code and no migration in this arc writes it | existing: `assert_destructive_reset_enabled()`, `reset_validation_data()` (`supabase/migrations/20260622000001_validation_reset_rpc.sql:23`). **New: `assert_prune_enabled()`**, via both prune functions | `false` → the reset refuses and both prunes run (today's behaviour); `true` → the reset is permitted and both prunes refuse; row absent → the reset refuses and both prunes refuse |

No column is empty, so this is not a zombie flag. The last row of that table is the whole design.

---

## §6 Acceptance criteria

**Rollback discipline — binding on every criterion below, and the reason it is stated first.** These
prunes delete GLOBALLY: an ungated call takes every row past the cutoff, not the fixture's rows
(`supabase/migrations/20260809000000_sync_log_show_attribution.sql:45-48`,
`supabase/migrations/20260629000002_app_events.sql:38-41`). A probe written to CATCH a missing, inverted
or half-applied gate is therefore a probe that PERFORMS that deletion when the gate is broken — the
exact failure the arc exists to prevent, committed by its own acceptance test. So:

1. **Every call to either prune function in every EXECUTABLE ARTIFACT this arc ships — the suite, the
   acceptance criteria, the closeout script — runs inside a transaction that is ALWAYS rolled back** — including the marker-`false` cases that are
   SUPPOSED to delete, and including the live validation limb of AC-6. No call is exempted by an
   argument that it cannot delete: R3 and R4 each found one such argument to be wrong (an unbounded
   default call, then a 100-year window whose emptiness was checked in a separate autocommitted
   statement), so the rule is structural and admits no per-call reasoning. The rollback is asserted by
   re-reading outside the transaction and the suite asserts the rollback
   happened by re-reading outside it (`tests/db/syncLogIndexesAndPrune.db.test.ts:180-186` is the precedent, and its header at
   `tests/db/syncLogIndexesAndPrune.db.test.ts:6-8` records why: a committing prune permanently deletes
   unrelated rows and nothing notices).
2. Each EXPECTED exception is isolated — its own transaction, savepoint, or plpgsql block with an
   exception handler that re-raises anything not matching `prune not enabled%`. An uncaught exception
   aborts the enclosing transaction, so a naive shared transaction would make every assertion after the
   first vacuous.
3. `withPosture(marker, body)` restores `destructive_reset_gate.enabled = false` in a `finally`, so a
   crashed run cannot leave the local stack refusing its own prunes — and it never leaves it `true`,
   which would also disable the reset gate's own suite.

- **AC-1 — refusal under the validation posture, both functions.** With the marker `true`,
  `select public.prune_sync_log()` and `select public.prune_app_events()` each reject with a message
  containing `prune not enabled for this database`.
- **AC-2 — the refusal is a NON-DELETION at the committed outcome.** With the marker `true`, seed a row
  past the default cutoff in each table, call the prune, assert it rejects AND that the row is still
  present when read back. The wrong implementations this excludes are the live ones: a gate wired into
  only one call path, and a "gate" that never reaches the database at all. (It does NOT claim to exclude
  delete-then-raise — §1.1 records why that is not a distinguishable implementation in Postgres.)
- **AC-3 — every posture state, including the absent marker.** Three states asserted per function:
  marker `false` → the prune runs and returns the global count measured in the same rolled-back
  transaction; marker `true` → rejects; marker row DELETED → rejects. The wrong implementation this
  excludes is a `coalesce(..., false)` read, which waves the third state through — R1's P0 hole 3, now
  executable. The marker deletion and the prune both live inside the rolled-back transaction, so the
  marker is restored by the rollback as well as by `withPosture`.
- **AC-4 — the explicit-cutoff form is gated too, and every existing caller is unaffected.**
  `prune_sync_log(interval '5 days')` and `prune_app_events(interval '5 days')` reject under the
  validation posture (excluding a gate placed on the default-argument path only, which the no-argument
  cron call would satisfy while every parameterised test call walked past it). With the marker `false`,
  `tests/db/syncLogIndexesAndPrune.db.test.ts` and `tests/log/appEventsSchema.test.ts` pass UNCHANGED —
  a no-edit criterion: any edit to either file to accommodate the gate is a design failure, not a repair.
- **AC-5 — the pinned function properties survive, for BOTH functions.** `prosecdef`, `proconfig`, the
  `retain interval DEFAULT '60 days'` argument list, and the execute grants (`service_role` yes,
  `anon`/`authenticated` no — the owner `postgres` executes too, as every `security definer` function's
  owner does, §3.1) are asserted after the change, plus `prolang` = `plpgsql` so the language move is declared. This criterion reads the
  catalog and calls nothing, so it carries no deletion risk at all. The wrong implementation it excludes
  is a rewrite that quietly drops `security definer`, the pinned `search_path`, or the shipped default
  while every refusal assertion still passes.
- **AC-6 — the live validation probe, two limbs, no call outside a transaction, and a SUCCESS is a
  failure.** Run after the atomic surgical apply, in ONE `psql -v ON_ERROR_STOP=1` script against
  `vzakgrxqwcalbmagufjh`:
  1. **Pre-check limb — reads only, calls nothing, and is not the oracle.** Both functions report
     `prolang` = `plpgsql`. It exists to fail fast when the apply did not land; it is deliberately NOT
     asserted as proof that the gate is wired, because a substring search over `prosrc` matches a
     comment or an unreachable branch just as happily as a live `perform`. Limb 2 is the oracle.
  2. **Behavioural limb — the ENTIRE limb inside one `begin;` … `rollback;`.** Both functions, in both
     the default no-argument form and the `interval '5 days'` form: four calls, one transaction, one
     rollback. Each call takes this exact shape, in which a SUCCESSFUL prune is what fails the probe:

     ```sql
     do $$
     begin
       perform public.prune_sync_log();
       raise exception 'GATE MISSING: prune_sync_log() succeeded on this database';
     exception when others then
       if sqlerrm not like 'prune not enabled%' then raise; end if;
     end;
     $$;
     ```

     The `raise` on the success path is the whole point: a handler that only re-raises unexpected errors
     is an ABSENCE predicate, and an ungated function satisfies it by never erroring at all — every call
     succeeds, no handler runs, the transaction rolls back, and `psql` exits 0 on a permissive database.
     `'GATE MISSING: …'` does not match `prune not enabled%`, so the handler re-raises it and the script
     stops with `ON_ERROR_STOP`.

  **The rule this instance obeys, stated once for the whole arc:** every refusal assertion here fails
  when the call SUCCEEDS, not merely when it errors wrongly. In the test suite that is
  `rejects.toThrow(/prune not enabled/i)`, which fails on a resolved promise by construction; in SQL it
  is the `raise` after the `perform` above. R5 found the SQL half missing while the suite half was
  already correct.

  Together the two limbs answer what the parity gate structurally cannot (§4.3): parity compares
  signatures, not bodies, so only a live behavioural probe distinguishes an applied migration from a
  half-applied one. The R1 P1 finding is why both limbs name BOTH functions.
- **AC-7 — parity gates pass.** `pnpm gen:schema-manifest` output is committed and
  `tests/db/validation-schema-parity.test.ts` passes at all three layers.

## §7 Ledger disposition

- **Graduates:** `BL-VALIDATION-PRUNE-DB-SIDE-GATE`, on its stated close condition, with the
  `**Reachability:** INFERRED, NOT PROBED` field replaced by the §3 measurement in the archive entry.
- **Files:** nothing new expected. §4.2's re-file trigger is a storage measurement, and §4.1 is the
  declared fence, so neither is an open queue row.

## §8 Lint disposition

`pnpm spec:lint` output for this document and its plan is attached to every review dispatch, with the
`summary:` line, every finding, and an explicit statement if anything is abridged.
