# BL-VALIDATION-PRUNE-DB-SIDE-GATE — gate `prune_sync_log` / `prune_app_events` at the database, so no client, spelling, or channel can prune the validation project

**Row:** `BL-VALIDATION-PRUNE-DB-SIDE-GATE` (BACKLOG.md) · **Facing:** product · **Filed by:** `feat/destructive-guard-discovery-by-connection`, spec `docs/superpowers/specs/ci/2026-08-21-destructive-guard-discovery-by-connection-design.md` §4.1 / §7 · **Branch:** `feat/validation-prune-db-side-gate`

---

## §0 The bound this arc is held to

**Consequence bound.** On a database whose prune gate is disabled, `public.prune_sync_log()` and
`public.prune_app_events()` delete zero rows and raise, through every client and every spelling. On a
database whose gate is enabled they behave exactly as they do today, including the cron rows and both
existing suites. There is no third outcome: the gate is read on every call, and a gate that cannot be
read is a refusal (`coalesce(..., false)`), never a silent pass.

**Probe domain.** The two function bodies (`supabase/migrations/20260809000000_sync_log_show_attribution.sql`
`prune_sync_log`, `supabase/migrations/20260629000002_app_events.sql` `prune_app_events`), their callers
(the two `cron.job` rows, `tests/db/syncLogIndexesAndPrune.db.test.ts`, `tests/log/appEventsSchema.test.ts`),
and the live grant/gate/population state of the validation project `vzakgrxqwcalbmagufjh` and the local
stack, as probed in §3. A probe outside that domain — a hypothetical database posture nobody operates, a
hostile actor who already holds service-role credentials — files to §4, not to a round.

**Threat fence.** The gate defends against **accidental test-authored deletion**: a suite, script, or
one-off that reaches a prune through a connection that happens to point at validation. It does **not**
defend against a hostile actor holding the validation service-role key or the pooler DSN; such an actor
can flip the gate, and that is out of scope by declaration. This is the same fence
`destructive_reset_gate` carries (`tests/db/destructiveResetGate.test.ts` header).

**Closed criterion.** Both prunes refuse on the validation project with the gate disabled; every
legitimate caller on local and prod is unaffected; proven by executable tests (§6) plus a re-run of the
§3 live probe showing refusal where it previously showed deletion. That criterion is finite and settled
by running two commands, not by enumerating inputs.

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
| **The mechanism mirrors `destructive_reset_gate`** — dedicated table, no anon/authenticated grant, RLS-deny, read through `coalesce(..., false)`, flipped out of band | `supabase/migrations/20260622000001_validation_reset_rpc.sql:6-13` and `supabase/migrations/20260622000001_validation_reset_rpc.sql:23-25` | Proven pattern with a shipped test surface. |
| **The POLARITY is inverted relative to `destructive_reset_gate`, deliberately** | §2.2 of this spec | The reset must never run on prod; the prunes MUST run on prod. Same mechanism, opposite default. Argued, not assumed. |
| **The seed is DERIVED at apply time, not flipped by hand** | §2.3 | Removes the out-of-band step that the reset gate needs, and with it the window where a fresh validation project is unprotected. |
| **A failing prune cron on validation is the intended end state**, not a regression | §2.6 | The refusal in `cron.job_run_details` is the durable evidence the gate holds. |
| **No mutation-registry enrolment** | §4.4 | `tests/mutation/source/registry.ts:15` keys a surface by a TypeScript `sourcePath`; a SQL function is not expressible there. Stated, not enrolled symbolically. |

### §1.2 What the filing row inferred, and what the probe measured

The row shipped `**Reachability:** INFERRED, NOT PROBED`. §3 settles it: reachability is **CONFIRMED**,
and the magnitude is larger than the row assumed. A default `select public.prune_sync_log()` issued
against the validation project from the DSN that `.env.local` hands every `tests/**` file deletes
**2,488 live rows** (§3.3). The same call through the PostgREST `rpc` endpoint with the validation
service-role key is accepted (§3.5). No layer in either probed channel refuses it.

The incident is not hypothetical either: `tests/log/appEventsSchema.test.ts:5-9` records that this file
once resolved its URL from `TEST_DATABASE_URL` and "a plain `pnpm test` therefore pruned live validation
history". That was repaired client-side, on that one file, by `assertLocalDbUrl`
(`tests/log/appEventsSchema.test.ts:10-12`, `const url = assertLocalDbUrl(`) — the exact class of repair this row exists to terminate.

---

## §2 The design

### §2.1 One sentence

A `public.prune_gate` table carrying one boolean, seeded at migration time from the database's existing
posture marker, read by both prune functions before they delete anything.

### §2.2 Polarity, argued rather than mirrored

`destructive_reset_gate` ships `enabled=false` everywhere and validation flips it **true**, because
`reset_validation_data()` is a feature that must never run on production. The prunes are the opposite:
they are production retention (`supabase/migrations/20260629000002_app_events.sql:53-64`,
`supabase/migrations/20260809000000_sync_log_show_attribution.sql:58-69` schedule them daily), and the
database that must not run them is validation.

So the mechanism is copied and the default is inverted:

- **The read is fail-closed.** `coalesce((select enabled from public.prune_gate where id = 'default'), false)`
  — a missing row, a truncated table, or a gate nobody seeded means REFUSE. The column default is
  `false` for the same reason.
- **The seeded VALUE is per-database**, derived in §2.3. On local and prod it is `true`, so retention
  is unchanged. On validation it is `false`, so the prunes refuse.

Stating it as the brief does: default DISABLED is the code path's fallback whenever the gate cannot be
read; the shipped row is what decides an actual database, and it is computed rather than remembered.

### §2.3 The seed is derived, so no database is unprotected between two operator actions

```sql
insert into public.prune_gate (id, enabled)
select 'default',
       not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false)
where exists (select 1 from public.destructive_reset_gate where id = 'default')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.prune_gate where id = 'default') then
    raise exception 'prune_gate seed: no destructive_reset_gate row to derive posture from';
  end if;
end;
$$;
```

`destructive_reset_gate.enabled = true` is already this repo's in-database statement of "this is a
validation project": it is seeded false by `supabase/migrations/20260622000001_validation_reset_rpc.sql:13`
and only validation flips it. Reading it ONCE, at apply time, gives the new gate the right value on every
database with no out-of-band step and no window in which a freshly-provisioned validation project prunes
freely.

The derivation is **apply-time only**. After the insert the two gates are independent rows; flipping the
reset gate later does not move the prune gate. That is deliberate: coupling them at read time would mean
enabling a one-off reset silently stops retention that day, which is lesson 300's "reusing a code
inherits its promise" in table form.

The `raise` is the loud half. If `destructive_reset_gate` has no `'default'` row the migration FAILS
rather than seeding a permissive default, because the failure direction that matters here is a validation
project silently seeded `true`.

### §2.4 The table

```sql
create table if not exists public.prune_gate (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false
);
revoke all on table public.prune_gate from anon, authenticated, public;
grant all on table public.prune_gate to service_role;
alter table public.prune_gate enable row level security; -- no policy => PostgREST deny-all
```

Byte-for-byte the shape of `destructive_reset_gate`
(`supabase/migrations/20260622000001_validation_reset_rpc.sql:6-12`), including the single-row CHECK, so
the lockdown registry row (§2.7) is the same shape too.

### §2.5 The check, and the two function bodies

```sql
create or replace function public.assert_prune_enabled() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce((select enabled from public.prune_gate where id = 'default'), false) then
    raise exception 'prune not enabled for this database';
  end if;
end;
$$;
revoke all on function public.assert_prune_enabled() from public, anon, authenticated;
grant execute on function public.assert_prune_enabled() to service_role;
```

Both prunes gain one statement and keep every property their tests pin:

```sql
create or replace function public.prune_sync_log(retain interval default interval '60 days')
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare v_deleted integer;
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

**What must not move**, because live assertions pin it:

| Property | Pinned at | After this change |
| --- | --- | --- |
| `prosecdef = true` | `tests/db/syncLogIndexesAndPrune.db.test.ts:109` (`expect(fn!.prosecdef)`) | unchanged (`security definer`) |
| `proconfig = ["search_path=public, pg_temp"]` | `tests/db/syncLogIndexesAndPrune.db.test.ts:110` (`expect(fn!.config)`) | unchanged |
| argument list `retain interval DEFAULT '60 days'` | `tests/db/syncLogIndexesAndPrune.db.test.ts:114` (`expect(fn!.args)`) | unchanged |
| `service_role` execute yes, `anon`/`authenticated` no | `tests/db/syncLogIndexesAndPrune.db.test.ts:117-129` | unchanged (`create or replace` preserves grants) |
| return equals the global deleted count | `tests/db/syncLogIndexesAndPrune.db.test.ts:154-157` | unchanged; the count is computed the same way |
| the explicit-cutoff parameter is read | `tests/db/syncLogIndexesAndPrune.db.test.ts:200-206` | unchanged |
| cron command is the no-argument form | `tests/db/syncLogIndexesAndPrune.db.test.ts:219` | unchanged; the cron rows are not touched |

The language changes from `sql` to `plpgsql` because a `language sql` body cannot raise. No assertion in
the corpus pins `prolang`; §6 AC-7 adds one for the new state so the change is declared rather than
incidental.

### §2.6 What happens to the daily cron on validation

It fails, daily, with `prune not enabled for this database`, recorded in `cron.job_run_details`. That is
the intended end state and it is the gate's own durable evidence. Three consequences, all stated so no
reviewer has to guess:

- **Validation telemetry stops being pruned.** Measured population at probe time: 149,861 `sync_log`
  rows and 45,261 `app_events` rows (§3.1). Growth is bounded by validation traffic, which is test
  traffic. This is the accepted cost of the row.
- **Nothing in the repo reads cron success**, so no suite reds. `tests/cross-cutting/pg-cron-coverage.test.ts:111-118`
  asserts these two jobs exist and are deliberately outside the `fxav_cron_` namespace; it makes no claim
  about their outcome, and the repo has no reader of `cron.job_run_details` under `app/`, `lib/`, or
  `supabase/`.
- **Deliberate pruning of validation stays possible**, by the same motion the reset gate already
  documents: flip `prune_gate.enabled` to true via a service-role connection, run the prune, flip it
  back. §4.2 records why that is not automated.

### §2.7 Registry and parity obligations this change inherits

| Obligation | Where | Action |
| --- | --- | --- |
| PostgREST DML lockdown registry | `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES`, Layer 4 at `tests/db/postgrest-dml-lockdown.test.ts:1007-1055` | Add a `prune_gate` row (`table`, `closed_at`, `selectAnon: false`, `selectAuthenticated: false`, `postBody`, `rowFilter`). Layer 4 walks `supabase/migrations/` for table-level REVOKEs and fails on any REVOKE'd table with no row, so the row is not optional — the guard fails by default. |
| Schema manifest | `supabase/__generated__/schema-manifest.json` | Regenerate with `pnpm gen:schema-manifest` after the local apply and commit in the same PR. |
| Validation parity | `tests/db/validation-schema-parity.test.ts` | Apply the migration surgically to `vzakgrxqwcalbmagufjh` (`supabase db push` is blocked) and `notify pgrst, 'reload schema';`. |

---

## §3 Probes

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
`false`, so §2.3 seeds the prune gate `true` locally and every existing suite keeps passing — which AC-4
proves by execution rather than by this paragraph.

### §3.7 Prod was NOT probed

This worktree holds no production credentials (`SUPABASE_URL` resolves to `http://127.0.0.1:54321`).
Prod's behaviour is derived, not measured: prod has never flipped `destructive_reset_gate`
(`tests/db/destructiveResetGate.test.ts` header, "Production never flips the gate"), so §2.3 seeds
`prune_gate.enabled = true` there and retention is unchanged. The derivation's single premise — that
prod's reset gate is `false` — is exactly what the §2.3 `raise` makes loud if it is ever wrong, since a
missing row aborts the migration rather than seeding a guess.

---

## §4 Documented limits

Each is conservative-plus-loud or out of the threat fence; none is silent.

### §4.1 A caller who can flip the gate can prune

Anything holding the validation service-role key or the pooler DSN can `update public.prune_gate set
enabled = true` and then prune. This is the declared threat fence (§0) and the identical limit
`destructive_reset_gate` carries. What the gate buys is that the deletion is no longer reachable by
ACCIDENT: it takes a deliberate, separately-spelled write to a table whose name says what it is.

### §4.2 Validation retention becomes a manual operation

Stated in §2.6. Automating it — a nightly job that flips the gate, prunes, and flips back — would
reinstate exactly the unguarded window this row closes, on a schedule. Declined. Re-file trigger:
validation `sync_log` growth becoming an operational problem, which is a storage measurement, not a
review finding.

### §4.3 The gate is per-database, not per-table

One row governs both prunes. They are one class (time-window telemetry retention) and no operator has
ever wanted one without the other. If that changes the repair is a second row keyed by function name, not
a redesign.

### §4.4 The surface is not mutation-registry expressible

`tests/mutation/source/registry.ts:15` keys every enrolled surface on a TypeScript `sourcePath` overlaid
into a Vitest run; every current row points at a `.ts` file. A SQL function in a migration cannot be
overlaid by that runner, so this arc enrols nothing rather than enrolling symbolically — the disposition
the step3 tap-target probe reached for its Playwright surface. The equivalent proof here is AC-1/AC-2:
the refusal is asserted by execution against a real database, in both gate states.

### §4.5 `dev.*` is untouched

The shadow schema is local-seed infrastructure and holds no prune function; `to_regclass('dev.sync_log')`
is consulted only for indexes (`supabase/migrations/20260809000000_sync_log_show_attribution.sql:26-30`).
Out of scope, no action.

---

## §5 DB completeness matrix

Every affected domain × layer. Every cell is an action or an `N/A — reason`.

| Layer | `prune_gate` | `prune_sync_log` | `prune_app_events` | `sync_log` / `app_events` tables |
| --- | --- | --- | --- | --- |
| Table DDL | CREATE (§2.4) | N/A — function | N/A — function | N/A — unchanged |
| Inline CHECK | `id = 'default'` single-row CHECK | N/A | N/A | N/A — no CHECK change |
| Grants / REVOKE | REVOKE anon+authenticated+public; GRANT service_role | unchanged (`create or replace` preserves) | unchanged | N/A — unchanged |
| RLS | ENABLE, no policy (deny-all) | N/A | N/A | N/A — already enabled |
| RPC read path | read by `assert_prune_enabled()` | reads gate before deleting | reads gate before deleting | N/A |
| RPC write path | seeded once at apply time (§2.3); no runtime writer | N/A | N/A | N/A |
| Trigger | N/A — no propagation | N/A | N/A | N/A |
| Cleanup / cron | N/A — no retention on a one-row table | cron row unchanged; refuses on validation (§2.6) | same | N/A |
| Advisory lock (invariant 2) | N/A — `prune_gate` is not in the invariant-2 table set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`) and the prune is not show-keyed | N/A — same | N/A — same | N/A — same |
| Mutation-surface telemetry (invariant 10) | N/A — no HTTP route, no `"use server"` action; this diff is DDL, SQL functions, tests and docs | N/A | N/A | N/A |
| PostgREST lockdown registry | ADD row (§2.7) | N/A — function-level grants already asserted | N/A — same | N/A — already registered (`sync_log` at `tests/db/postgrest-dml-lockdown.test.ts:199-200`) |
| Schema manifest | regenerate + commit | regenerate + commit | regenerate + commit | N/A — unchanged |
| Validation project | surgical apply + `notify pgrst` | same | same | N/A |
| Frontend | N/A — no UI surface in this diff | N/A | N/A | N/A |
| Tests | new `tests/db/pruneGate.db.test.ts (new)` (§6) | AC-1..AC-3, AC-7 | AC-1..AC-3, AC-7 | AC-4 (existing suites stay green) |

**CHECK/enum migration matrix:** the only CHECK introduced is `id = 'default'` on a new table. No
existing CHECK or enum changes, so there is no transitional window and no old/new value overlap to model.
Apply-twice idempotency is carried by `create table if not exists` + `on conflict (id) do nothing` +
`create or replace function`; the §2.3 `raise` is the one non-idempotent-looking statement and it is a
read-only assertion, so a second apply re-passes.

**Flag lifecycle table** (the one boolean this spec introduces):

| Flag | Storage | Write path(s) | Read path(s) | Effect on output |
| --- | --- | --- | --- | --- |
| `prune_gate.enabled` | `public.prune_gate`, one row `id='default'` | seeded once by the migration from `destructive_reset_gate` (§2.3); afterwards only a service-role/owner `update` — no application code writes it | `public.assert_prune_enabled()`, called by both prune functions | `false` → both prunes raise `prune not enabled for this database` and delete zero rows; `true` → today's behaviour exactly |

No column is empty, so this is not a zombie flag.

---

## §6 Acceptance criteria

All assertions run against a real database (`tests/db/pruneGate.db.test.ts (new)`, loopback-pinned via
`assertLocalDbUrl` like `tests/db/destructiveResetGate.test.ts:49-51` (`const DB_URL = assertLocalDbUrl(`)), with a `withPruneGate(enabled, …)`
helper that restores the gate afterward and always leaves it `true` locally.

- **AC-1 — refusal, both functions, gate disabled.** With `prune_gate.enabled = false`,
  `select public.prune_sync_log()` and `select public.prune_app_events()` both raise, and the raised
  message contains `prune not enabled for this database`.
- **AC-2 — refusal is a NON-DELETION, not just an error.** With the gate disabled, seed a row older than
  the default cutoff in each table, call the prune, assert it raises AND that the seeded row is still
  present. An assertion on the exception alone would pass against a function that raises after deleting.
- **AC-3 — the explicit-cutoff form is gated too.** `prune_sync_log(interval '5 days')` and
  `prune_app_events(interval '5 days')` raise while the gate is disabled. The killer this excludes: a gate
  placed on the default path only, which the no-argument cron call would satisfy while any parameterised
  test call walked past it.
- **AC-4 — every existing caller is unaffected with the gate enabled.**
  `tests/db/syncLogIndexesAndPrune.db.test.ts` and `tests/log/appEventsSchema.test.ts` pass unchanged
  against the local stack, whose seeded value is `true` (§3.6). Not a new test: the criterion is that
  those two suites stay green with no edit.
- **AC-5 — the gate table is PostgREST-unreachable.** `prune_gate` appears in `RPC_GATED_TABLES` and the
  existing Layers 1-4 of `tests/db/postgrest-dml-lockdown.test.ts` pass for it: no anon/authenticated
  SELECT or DML, RLS enabled with no policy.
- **AC-6 — the seed derives, and derives BOTH ways.** Executable: with `destructive_reset_gate.enabled`
  set to each value in turn, run the seed statement against a scratch copy of `prune_gate` and assert the
  derived value is its negation. A one-directional test would pass against a seed hardcoded to the local
  answer.
- **AC-7 — the pinned function properties survive.** `prosecdef`, `proconfig`, the
  `retain interval DEFAULT '60 days'` argument list, and the `service_role`-only execute grant are asserted
  for BOTH functions after the change, plus `prolang = 'plpgsql'` so the language move is declared.
- **AC-8 — the live probe re-runs to a refusal.** After the surgical validation apply, the §3.3 command
  re-run against validation raises `prune not enabled for this database` instead of reporting 2,488. The
  transcript lands in §7 of the plan's closeout.
- **AC-9 — parity gates pass.** `pnpm gen:schema-manifest` output is committed and
  `tests/db/validation-schema-parity.test.ts` passes at all three layers.

---

## §7 Ledger disposition

- **Graduates:** `BL-VALIDATION-PRUNE-DB-SIDE-GATE`, on its stated close condition, with the
  `**Reachability:** INFERRED, NOT PROBED` field replaced by the §3 measurement in the archive entry.
- **Files:** nothing new expected. §4.2's re-file trigger is a storage measurement, and §4.1 is the
  declared fence, so neither is an open queue row.

## §8 Lint disposition

`pnpm spec:lint` output for this document and its plan is attached to every review dispatch, with the
`summary:` line, every finding, and an explicit statement if anything is abridged.
