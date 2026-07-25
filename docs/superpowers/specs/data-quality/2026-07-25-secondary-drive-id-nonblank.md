# Secondary-name Drive-ID nonblank CHECKs + a fail-by-default coverage guard

**Date:** 2026-07-25 · **Branch:** `fix/secondary-drive-id-nonblank` · **Class:** DEFENSE-IN-DEPTH + STRUCTURAL GUARD

Parent spec: `docs/superpowers/specs/data-quality/2026-07-02-empty-drive-file-id-check-design.md` (the primary `drive_file_id` nonblank CHECK work; §9 is where the two backlog items below were deferred).

Closes `BL-OPENING-REEL-DRIVE-ID-NONBLANK` and `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` (`BACKLOG.md`, the two entries under the shared 2026-07-02 heading).

<!-- spec-lint: not-ui — DB-layer only: no file under app/ (except none), components/, globals.css, or DESIGN.md is touched; see §7 -->

---

## 0. Files this spec creates

These do not exist yet, so citations to them cannot resolve; the waiver below covers that.

<!-- spec-lint: ignore — every path here is CREATED by this spec, so none is in the tracked set at spec time -->
```
supabase/migrations/20260725000000_secondary_drive_id_nonblank.sql   "the migration"
lib/driveIdCoverage/audit.ts                                         "the auditor"   (pure; §4.1)
lib/driveIdCoverage/introspect.ts                                    "the census query" (§4.1)
tests/db/driveIdCoverage.test.ts                                     "the auditor unit tests" (DB-free)
tests/db/driveIdCoverage.db.test.ts                                  "the local-DB guard suite"
```

Also MODIFIED (all tracked, cited normally elsewhere): `tests/db/schema.test.ts` (static parse of the
migration), `tests/db/driveFileIdNonblank.db.test.ts` (behavioral probes + the 14→15 list),
`tests/db/validation-schema-parity.test.ts` (the two-line parse extension, §4.4), `BACKLOG.md` and
`BACKLOG-archive.md` (entry graduation).

**No committed census artifact and no generator script.** Both existed only to give a DB-free layer
something to check; §4.0 explains why that layer is gone. An earlier draft of this section inventoried a generated census JSON under `supabase/__generated__/`
and a generator under `scripts/`; neither is created.

---

## 1.1 Resolved scope — do not relitigate

Each of these is decided. Verify the citation; do not re-derive the decision.

1. **Coverage is decided by the constraint DEFINITION, never by its name.** §4.2. This is not an oversight in the naming convention — it is the reason a hand-edited `…_nonblank` constraint cannot fake coverage. Ratified by a prior review arc on this repo that spent 7 rounds on a text-normalizing predicate comparison: the normalizer equated 11 operator families that are not equivalent, and the same defect then reappeared in the sibling comparison path. The durable rule taken from it: never compare SQL predicates as normalized text — compare against a canonical rendering the database itself produced.
2. **`wizard_finalize_checkpoints`'s constraint shortens the conventional name, and the shortening is constrained from BOTH ends.** The conventional `<table>_<column>_nonblank` form is **65 bytes**, past Postgres's 63-byte identifier limit, and would be silently truncated (§3.1, measured). But it must ALSO keep the `_drive_file_id_nonblank` suffix, because the validation parity test's live query filters on `conname like '%\_drive\_file\_id\_nonblank'` (`tests/db/validation-schema-parity.test.ts:261-263`) — R4 finding 3 caught an earlier draft's `…_cursor_nonblank`, which would have put the parity test PERMANENTLY RED: the name would be in `expected` and could never appear in `live`. The chosen name drops the column-name prefix instead: `wizard_finalize_checkpoints_drive_file_id_nonblank`, 50 bytes, suffix intact.
3. **Both canonical CHECK forms are accepted for a column of either nullability.** §3, §4.2. A CHECK fails only on FALSE and `NULL ~ '…'` is NULL, so the bare form and the `is null or …` form are behaviorally identical. Requiring the stylistically-matching form would produce false failures with no safety gain.
4. **`public.onboarding_rebuild_attempts.drive_file_id` (U4) is in scope even though no backlog item covers it.** It is a column named *exactly* `drive_file_id` — inside the ORIGINAL 2026-07-02 scope rule — created 16 days after that migration and never covered (§2.2, verified live §2). Landing the guard without landing U4's CHECK would ship a red gate. This is not scope creep; it is the first thing the guard found.
5. **The exemption list ships EMPTY and that is correct.** §4.5. It is not a zombie flag: all four of its rules are exercised by synthetic-input unit tests (§4.5, AC-9), and the two stale-row rules are what stop an empty list from silently becoming a permanent blindfold later.
6. **The existing validation CHECK-parity test is EXTENDED, not re-architected.** §4.4. `tests/db/validation-schema-parity.test.ts:223-285` already asserts validation carries every public nonblank CHECK. Earlier drafts replaced it with a census-driven, identity-bound layer; R3 finding 1 showed that layer's identity binding was unsound (a URI's authority is not libpq's effective target). The change is now minimal: parse both nonblank migrations, move the pinned count. Separately, the schema MANIFEST records columns only (`scripts/schema-manifest/lib.ts:238-246`) and cannot see a constraint-only migration at all — a true and distinct fact that an early draft conflated with the above.
7. **The census scans `public` + `dev` only — an allowlist of repo-owned schemas, not a vendor blocklist.** §4.1. Vendor schemas (`auth`, `storage`, `realtime`, …) cannot receive our constraints, and a blocklist naming them would go stale the moment Supabase adds a schema. §10 records the residual exposure if a third repo-owned schema ever appears.
8. **No data-repair step, deliberately.** §3.3, §7. Zero violating rows exist on local (measured). If a target holds one, the apply must fail loudly rather than mutate operator data silently.
9. **No JS/application behavior changes.** §7. `assertNonEmptyDriveFileId` (`lib/drive/fetch.ts:145`) and every write path are untouched; this is DB-layer defense-in-depth only.

---

## 1. Problem

The 2026-07-02 migration `supabase/migrations/20260702120200_drive_file_id_nonblank.sql` adopted a deliberately crisp scope rule: **"every column named exactly `drive_file_id`"** — 14 public + 5 `dev.*` mirror columns. Two Drive-ID-bearing columns carrying a *secondary* name were documented out of scope in that spec's §9 and filed to `BACKLOG.md`.

That scope rule was a reasonable line to draw once. It has two defects as a *durable* mechanism:

1. **It is prose, not executable.** Nothing in the repo compares the set of Drive-ID-bearing columns against the set that carries a CHECK. The rule is enforced only by whoever remembers it.
2. **It has already drifted.** `public.onboarding_rebuild_attempts.drive_file_id` — a column named *exactly* `drive_file_id`, and therefore inside the original scope rule — was created 16 days later by `supabase/migrations/20260718000000_onboarding_rebuild_attempts.sql:6` and carries **no** nonblank CHECK. Verified live 2026-07-25:

   ```
   $ psql "$LOCAL" -At -c "select conname from pg_constraint con
       join pg_class c on c.oid=con.conrelid
       where c.relname='onboarding_rebuild_attempts' and con.contype='c'"
   onboarding_rebuild_attempts_attempts_check
   ```

   (the `attempts >= 0` CHECK only — no `_drive_file_id_nonblank`).

So the deliverable is not just "add the two deferred CHECKs." It is: add every missing CHECK, then replace the prose scope rule with an executable check that fails red when a new Drive-ID-bearing column appears uncovered — subject, after the R4 scope decision, to the limits §10 states plainly.

**Framing note (durable lesson from a prior 8-round spec arc on this repo):** a prose enumeration of an executable property never completes — test bodies, adversary lists, observables, and transitions each failed the same way, one omission at a time. The fix that worked was to make the enumeration a NORMATIVE artifact and compare against it mechanically. This spec applies that lesson as far as it goes: after the R3 collapse (§4.0) there is no committed census file — the enumeration is recomputed from the live database on every run, so no stored list can drift from the schema. What it does NOT fix is the query that computes it; §10 item 2 owns that.

---

## 2. Ground truth (verified live 2026-07-25, local all-migrations-applied DB)

Census query — `information_schema.columns` where the column name matches, across all schemas. (The
counts below were taken with `like '%drive_file_id%'`; that predicate is subtly wrong and §4.0 replaces
it with the POSIX-regex form `~ 'drive_file_id'`. The counts are unaffected: no column in this database
matches one predicate and not the other — re-verified 2026-07-25 — but the census implementation uses
the regex form.)

| schema | matching columns |
| ------ | ---------------- |
| `public` | 17 |
| `dev` | 6 |
| everything else (`auth`, `storage`, `realtime`, `cron`, `net`, `graphql*`, `extensions`, `vault`, `supabase_functions`, `supabase_migrations`, `_realtime`) | 0 |

### 2.1 Covered today (19 of 23)

The 14 public + 5 `dev` columns named exactly `drive_file_id` listed in `20260702120200_drive_file_id_nonblank.sql`, each carrying `<table>_drive_file_id_nonblank`. Confirmed present in `pg_constraint` (19 rows).

### 2.2 Uncovered today (4 of 23) — this spec's write scope

| # | column | nullability | source | classification |
| - | ------ | ----------- | ------ | -------------- |
| U1 | `public.shows.opening_reel_drive_file_id` | NULLABLE | `supabase/migrations/20260501000000_initial_public_schema.sql:16` | `BL-OPENING-REEL-DRIVE-ID-NONBLANK` — secondary name, not reachable-empty |
| U2 | `dev.shows.opening_reel_drive_file_id` | NULLABLE | `supabase/migrations/20260502000000_dev_schema_clone.sql:58` | dev mirror of U1 |
| U3 | `public.wizard_finalize_checkpoints.last_processed_drive_file_id` | NULLABLE | `supabase/migrations/20260501001000_internal_and_admin.sql:423` | `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` — secondary name, cursor copy |
| U4 | `public.onboarding_rebuild_attempts.drive_file_id` | NOT NULL | `supabase/migrations/20260718000000_onboarding_rebuild_attempts.sql:6` | **scope-rule drift** — exactly-named, created after the primary migration |

`wizard_finalize_checkpoints` and `onboarding_rebuild_attempts` are **not** in the `dev` clone (`20260502000000_dev_schema_clone.sql` creates 12 `dev.*` tables; neither is among them), so U3 and U4 take no dev mirror. `dev.shows` **does** carry `opening_reel_drive_file_id`, so U2 is required — a public-only migration would leave the dev clone asymmetric.

### 2.3 Reachability of each uncovered column

Reachability determines *severity*, never *whether the CHECK lands* — a nonblank CHECK on a Drive-ID column is correct regardless, and the guard in §4 requires one.

- **U1** — write source `extractOpeningReel()` (`lib/parser/opening-reel.ts:27`) returns `{ driveFileId: string } | null`, called at `lib/parser/index.ts:629`. Reads flow through `assertNonEmptyDriveFileId` (`lib/drive/fetch.ts:145`, invoked at `lib/drive/fetch.ts:354`). Not reachable-empty. Severity: low.
- **U3** — **no production write path exists at all.** The backlog entry described this column as "a cursor copy of an already-CHECK'd id"; R1 finding 9 challenged that, and it is wrong as a description of live code. Verified 2026-07-25 — every non-DDL reference to `last_processed_drive_file_id` in `app/` and `lib/` is a READ or a type: the projection and mapping at `app/admin/_finalizeCheckpoint.ts:64` and `app/admin/_finalizeCheckpoint.ts:77`, the column's type at `app/admin/_finalizeCheckpoint.ts:24`, and the AC-X.4 allowlist entries at `lib/audit/noGlobalCursor.ts:39` and `lib/audit/noGlobalCursor.ts:45`. No `insert`/`update` anywhere sets it; the finalize paths write only status, batch count, and timestamps. So a blank cannot originate here because **nothing writes here** — a stronger statement than the backlog's, and one that makes the CHECK purely forward-looking protection for a column a future writer might populate. Severity: low.
- **U4** — written at `app/api/admin/onboarding/resolve-blocker/route.ts:267-272` from the route's `driveFileId`, and it is **half of a composite primary key** (`primary key (wizard_session_id, drive_file_id)`, `20260718000000:10`). A blank would not be rejected by the PK (blank is a legal distinct value), so a blank here silently creates a real row keyed on nothing. Severity: low-to-medium, and strictly higher than U1/U3 — this is the one that was genuinely *missed* rather than deliberately deferred.

---

## 3. Write scope — the migration

The migration (§0) follows the exact shape of `20260702120200_drive_file_id_nonblank.sql`:

- **Predicate:** `~ '[^[:space:]]'` — "contains at least one non-whitespace character", the faithful SQL translation of the JS `/\S/` guard. `btrim(x) <> ''` is wrong here: `btrim` strips only ASCII space U+0020, so it would wrongly ACCEPT a tab-only or newline-only value.
- **NULLABLE columns** (U1, U2, U3) use the explicit `is null or …` form; the **NOT NULL** column (U4) uses the bare regex form. (Both forms are behaviorally identical with respect to NULL — a CHECK fails only on FALSE, and `NULL ~ '…'` is NULL — but matching the parent migration's stylistic convention keeps the two files readable side by side.)
- **Apply-twice safe:** every constraint is `drop constraint if exists` then `add constraint`, per row.
- **Wrapped in an explicit transaction** (`begin; … commit;`). R1 finding 5: the parent migration's
  statements are standalone, so under the `psql -f` path this spec's §8 prescribes, each DROP commits
  before its ADD — a reapply briefly drops enforcement, and a failure partway (a data violation, an
  event-trigger rejection) leaves the schema partially migrated with a previously-existing constraint
  removed. DDL is transactional in Postgres, so a single wrapping transaction makes the file all-or-nothing.
  This follows the existing in-repo precedent for security-sensitive DDL — `20260611000001_onboarding_fixups_remediation.sql`,
  `20260611000002_lockdown_wizard_staging_tables.sql`, and `20260619000001_lockdown_shows_internal.sql`
  are the three migrations that already wrap themselves this way.
- **dev block** uses `alter table if exists dev.shows` so the file is a no-op on any target lacking the dev clone (the validation project), exactly as the parent migration does. The `if exists` is mandatory, not decorative: a bare `alter table dev.shows` errors on validation.

Constraint names (each `<table>_<column>_nonblank`, extending the parent's `<table>_drive_file_id_nonblank` convention to secondary-name columns):

| column | constraint name |
| ------ | --------------- |
| U1 `public.shows.opening_reel_drive_file_id` | `shows_opening_reel_drive_file_id_nonblank` (41 bytes) |
| U2 `dev.shows.opening_reel_drive_file_id` | `shows_opening_reel_drive_file_id_nonblank` (41 bytes) |
| U3 `public.wizard_finalize_checkpoints.last_processed_drive_file_id` | `wizard_finalize_checkpoints_drive_file_id_nonblank` (50 bytes) — **deviates from the convention on purpose**, see §3.1 |
| U4 `public.onboarding_rebuild_attempts.drive_file_id` | `onboarding_rebuild_attempts_drive_file_id_nonblank` (50 bytes) |

### 3.1 Why U3's name breaks the convention

The conventional `<table>_<column>_nonblank` name for U3 is `wizard_finalize_checkpoints_last_processed_drive_file_id_nonblank`. Measured 2026-07-25:

```
$ printf '%s' wizard_finalize_checkpoints_last_processed_drive_file_id_nonblank | wc -c
65
```

Postgres's identifier limit is 63 bytes (`NAMEDATALEN - 1`), so that name would be **silently truncated** to `…_drive_file_id_nonbla`. Truncation is deterministic and applied consistently to both the `drop constraint if exists` and the `add constraint`, so apply-twice safety would technically survive — but a name that does not appear anywhere in the source it was written in is a latent collision and a debugging trap. U3 therefore takes a name that DROPS the column-name prefix `last_processed_`: 50 bytes.

This is safe precisely because **coverage is definition-based, never name-based** (§1.1 item 1, §4.2). No test derives an expected constraint name from a table/column pair; coverage is matched on the constraint's definition (§4.2).

AC-12 pins the general form of this hazard: every `add constraint <name>` anywhere in `supabase/migrations/` must be ≤ 63 bytes, so the next long-named column fails at test time rather than silently truncating.

**Note on the earlier `cursor`-token name (superseded).** An earlier draft named this constraint
`wizard_finalize_checkpoints_cursor_nonblank`; §1.1 item 2 records why it was replaced. The
observation below is retained because it is what made that name look safe, and it remains true of any
constraint name containing a watermark-shaped token.

**A watermark-shaped token in a CONSTRAINT name is safe, and deliberately checked.** The AC-X.4 event trigger `no_global_cursor_columns` (`supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql:75-77`) fires on `ddl_command_end` and raises `check_violation` for any `public` column whose name matches `(^|_)cursor($|_)` (among other watermark shapes) and is absent from `_allowed_watermark_columns`. It scans **`information_schema.columns` only** (`supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql:57-64`) — constraint names are not columns, so `wizard_finalize_checkpoints_drive_file_id_nonblank` cannot trip it.

### 3.1.1 This migration DOES fire that event trigger

`ddl_command_end` fires on *every* DDL statement, including `alter table … add constraint`. So each statement in this migration triggers a full re-scan of `public`'s watermark-shaped columns. That scan is expected to pass — `wizard_finalize_checkpoints.last_processed_drive_file_id` is already allowlisted at `supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql:41`, as is `last_processed_at` at `supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql:40` — but "expected" is not "verified": the plan applies the migration to the local DB and asserts a clean apply, which is what proves the trigger does not reject it. No new allowlist row is needed, because this migration adds no column.

### 3.1.2 Measured: idempotency, the event trigger, and the deparser

The migration body was applied TWICE inside a single `begin; … rollback;` against the local
all-migrations-applied DB with `ON_ERROR_STOP=1`, then the constraints were read back — zero residue.
Measured 2026-07-25. The body holds **8** `alter table` statements (4 constraints × DROP + ADD), so a
double pass is **16** results and **4** `NOTICE`s (the first pass's `drop constraint if exists` on
constraints that do not yet exist):

```
$ grep -c '^alter table' 20260725000000_secondary_drive_id_nonblank.sql   →  8
$ psql "$LOCAL" -v ON_ERROR_STOP=1 -f tx-probe.sql
ALTER TABLE results: 16
NOTICEs: 4

 dev.shows                          :: shows_opening_reel_drive_file_id_nonblank          :: CHECK (((opening_reel_drive_file_id IS NULL) OR (opening_reel_drive_file_id ~ '[^[:space:]]'::text)))
 public.onboarding_rebuild_attempts :: onboarding_rebuild_attempts_drive_file_id_nonblank :: CHECK ((drive_file_id ~ '[^[:space:]]'::text))
 public.shows                       :: shows_opening_reel_drive_file_id_nonblank          :: CHECK (((opening_reel_drive_file_id IS NULL) OR (opening_reel_drive_file_id ~ '[^[:space:]]'::text)))
 public.wizard_finalize_checkpoints :: wizard_finalize_checkpoints_drive_file_id_nonblank        :: CHECK (((last_processed_drive_file_id IS NULL) OR (last_processed_drive_file_id ~ '[^[:space:]]'::text)))
ROLLBACK
```

What this settles:

1. **AC-13** — the `no_global_cursor_columns` `ddl_command_end` trigger does not reject the migration,
   and no `_allowed_watermark_columns` row is needed. The `cursor` token in a CONSTRAINT name is
   invisible to a trigger that scans `information_schema.columns` (§3.1).
2. **Idempotency** — a second full pass succeeds with no error.
3. **§4.2's two canonical renderings are byte-exact on this server** — both templates appear verbatim,
   so §4.2's template constants are the renderings this server actually produces.

**What this probe does NOT establish, and why** (R2 finding 8): the file as specified in §3 wraps
itself in `begin; … commit;`, and a file carrying its own `COMMIT` cannot be exercised inside an outer
`BEGIN/ROLLBACK` — the inner `COMMIT` would end the outer transaction and the "rollback" would discard
nothing. The probe above therefore ran the **unwrapped body**. The wrapper's own properties
(all-or-nothing on a mid-file failure) are verified at implementation time against a scratch database,
not by this probe, and the plan carries that as an explicit step rather than inheriting a false claim
from here.

### 3.1.3 Constraint names are unique per TABLE, not per schema

An earlier draft of this spec claimed per-schema uniqueness, reasoning from the two
`shows_opening_reel_drive_file_id_nonblank` rows above (which are in *different* schemas). R2 finding 2
challenged it. Measured 2026-07-25 — two tables in ONE schema accepted the same constraint name:

```
create schema dupprobe;
create table dupprobe.a (x text);  create table dupprobe.b (x text);
alter table dupprobe.a add constraint same_name check (x ~ 'q');
alter table dupprobe.b add constraint same_name check (x ~ 'q');   -- accepted
→ count = 2
```

Postgres enforces uniqueness on `(conrelid, contypid, conname)` — per **table**. The consequence is
load-bearing and applies to every layer: **coverage is a property of a
`(schema, table, column)` tuple and its definition, never of a constraint name.** Any lookup keyed on
bare `conname` can be satisfied by a same-named constraint on a different table. §4.4 records where
this still bites the validation parity path.

### 3.2 CHECK migration matrix

| dimension | resolution |
| --------- | ---------- |
| (a) values the CHECK must ACCEPT | any string containing ≥1 non-whitespace character; plus NULL for U1/U2/U3 (nullable) — U4 is NOT NULL so NULL cannot occur |
| (b) values the CHECK must REJECT | `""`, and any all-whitespace string incl. `" "`, `"\t"`, `"\n"`, `" "`-free ASCII whitespace runs. (`[:space:]` is locale-dependent for multibyte; the parent migration accepted this and this spec does not widen it — see §7) |
| (c) NULL / disabled rows | U1/U2/U3 nullable → explicit `is null or` form. U4 NOT NULL, retains its NOT NULL; a bare regex CHECK passes NULL anyway, so the two layers do not conflict |
| (d) transitional window (`tables/` running before `migrations/`) | N/A — this repo has no `tables/` inline-DDL tree that runs ahead of `migrations/`; the four columns' DDL lives only in the migrations cited in §2.2 |
| (e) apply-twice idempotency | every constraint is `drop constraint if exists <name>` then `add constraint <name>`; dev block additionally `alter table if exists dev.shows` |
| (f) one-shot lifecycle | none — this migration is permanent DDL, not a one-shot backfill, and retires no column |

### 3.3 Pre-existing data

A CHECK cannot be added to a table holding a violating row, so all four columns were counted before the ADD. Measured 2026-07-25 against the local all-migrations-applied DB:

```
$ psql "$LOCAL" -At -c "select 'shows.opening_reel', count(*) from public.shows
    where opening_reel_drive_file_id ~ '^[[:space:]]*$' union all …"
shows.opening_reel|0
dev.shows.opening_reel|0
wfc.last_processed|0
ora.drive_file_id|0
```

The migration carries **no** data-repair step. If a violating row exists on validation or prod, the apply must fail loudly rather than silently mutate operator data (§1.1 item 8).

### 3.4 Tier × domain × layer completeness matrix

Every layer the project's DB-touching checklist enumerates, per affected column:

| layer | U1 `shows.opening_reel_…` | U2 `dev.shows.opening_reel_…` | U3 `wfc.last_processed_…` | U4 `ora.drive_file_id` |
| ----- | --- | --- | --- | --- |
| table DDL (column) | unchanged | unchanged | unchanged | unchanged |
| CHECK constraint | **ADD** (nullable form) | **ADD** (nullable form, `if exists`) | **ADD** (nullable form) | **ADD** (bare form) |
| RPC read path | N/A — no RPC reads this column | N/A | N/A | N/A — read over the privileged postgres-js connection at `app/api/admin/onboarding/resolve-blocker/route.ts:224` and `app/api/admin/onboarding/finalize-cas/route.ts:430-439`, not PostgREST |
| RPC write path | N/A — written by the parser upsert, not an RPC | N/A | N/A | N/A — written at `app/api/admin/onboarding/resolve-blocker/route.ts:267-272` |
| propagation trigger | N/A — no trigger references these columns (verified: `20260501004000_no_global_cursor_event_trigger.sql:41` names `wizard_finalize_checkpoints.last_processed_drive_file_id` only in the no-global-cursor ALLOWLIST, and that trigger inspects DDL, not row data) | N/A | same as U1 cell | N/A |
| cleanup function | N/A | N/A | N/A | rows deleted at `lib/onboarding/sessionLifecycle.ts:575` and `lib/onboarding/sessionLifecycle.ts:892` — deletion is unaffected by a CHECK |
| PostgREST DML lockdown | N/A — `shows` lockdown posture unchanged by this spec | N/A | N/A | already locked down (`20260718000000_onboarding_rebuild_attempts.sql:21-22`); unchanged |
| frontend form / audit page | N/A — no UI surface touched (§7) | N/A | N/A | N/A |
| tests | behavioral probe (§4.3) + live census coverage (§4.1) | same | same | same |
| schema manifest | no change (constraint-only, §8) | dev not in manifest (public only) | no change | no change |
| validation apply | **required** (§8) | no-op there (`if exists`) | **required** | **required** |

**Flag lifecycle table:** N/A — this change introduces no boolean config field, feature flag, or toggle. **Dimensional invariants / transition inventory:** N/A — no component, no rendered surface, no visual state (§7).

---

## 4. The coverage guard

### 4.0 The premise that was wrong, and the collapse it allows

R1 and R2 both returned BLOCKING, and R3 returned BLOCKING again with a finding that invalidates the
architecture all three rounds had been patching. **The design assumed CI has no Postgres.** It does:

- `.github/workflows/unit-suite.yml:93-123` — the `unit-suite-db` job boots local Supabase via
  `scripts/ci/supabase-local-bootstrap.sh` and runs `supabase migration up --include-all`, then runs
  `pnpm exec vitest run --project=serial` across 8 shards.
- `tests/db/**` is in the **serial** project: it is absent from `PARALLEL_TEST_GLOBS` and from
  `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48-52`), and the serial project takes everything not
  claimed by the parallel one (`vitest.config.ts:76-93`).
- the **`unit-suite` aggregator** is the required status check; `unit-suite-db` is a worker the
  aggregator depends on, so it is *transitively* merge-blocking rather than itself the required
  context (R4 finding 7). The workflow states the intent at the pinned-CLI comment: "unit-suite is a REQUIRED check, so a setup rate-limit flake would block merges."

So an ordinary `tests/db/*.db.test.ts` runs against an all-migrations-applied database, on every PR,
in a job that blocks the merge. Every mechanism below was invented to work around a database that was
never missing:

| mechanism | why it existed | status |
| --------- | -------------- | ------ |
| committed census artifact | give the DB-free layer something to check | **deleted** |
| Layer 1 shape contract + hardcoded floor | stop a truncated artifact passing (R2-3, R3-4) | **deleted with the artifact** |
| broad-predicate `broadCount` cross-check | detect a narrowed census query (R2-6, R3-2 — never actually worked) | **deleted** |
| self-calibrated canonical templates | survive a deparser change without hardcoding (R3-3 poisoning) | **replaced by a canary, see §4.2** |
| Layer 3 DSN identity binding | prove the validation target is validation (R3-1 override bypass) | **deleted; see §4.4** |

What replaces them is one DB-backed test plus a two-line extension of a mechanism that already works.
The guard now runs in a **merge-blocking** path rather than the advisory `x-audits` job it was
previously specified into — a real improvement in *placement*. Its *detection surface* is not
strictly larger, since the removed mechanisms were themselves defeatable; §10 states both halves.

### 4.1 The guard: one live query, one auditor, one exemption list

The local-DB guard suite (§0) runs in `tests/db/`, therefore in `unit-suite-db`. It introspects the
live database and audits it. There is no committed artifact and nothing to keep fresh.

```ts
// lib/driveIdCoverage/audit.ts
export type DriveIdColumn = { schema: string; table: string; column: string; nullable: boolean };
export type DriveIdConstraint = { schema: string; table: string; definition: string };
export type CoverageExemption = { schema: string; table: string; column: string; reason: string };

export type CoverageFinding =
  | { kind: "uncovered"; column: DriveIdColumn }
  | { kind: "stale_exemption"; exemption: CoverageExemption; why: "now_covered" | "column_absent" }
  | { kind: "empty_reason"; exemption: CoverageExemption }
  | { kind: "duplicate_exemption"; key: string };

export function auditDriveIdCoverage(
  columns: DriveIdColumn[],
  constraints: DriveIdConstraint[],
  exemptions: CoverageExemption[],
): CoverageFinding[];
```

Green iff the result is `[]`. The auditor is pure and takes no calibrated input — R3 finding 6 flagged
that ambiguity in the previous draft; canonical templates are now module constants (§4.2), not values
threaded in at runtime.

**Census query contract** (each clause load-bearing):

- `c.column_name ~ 'drive_file_id'` — POSIX regex, `_` literal. **Not** `LIKE`: SQL `LIKE` treats `_`
  as a wildcard, so `'driveXfileYid' LIKE '%drive_file_id%'` is TRUE. Measured 2026-07-25.
- `c.table_schema in ('public','dev')` — the repo-owned schemas.
- joined to `information_schema.tables` on `t.table_type = 'BASE TABLE'` — views appear in
  `information_schema.columns` but cannot carry a table CHECK, so admitting them would manufacture
  permanently-uncoverable rows.
- constraints from `pg_constraint` with `contype = 'c'`, carrying `(schema, table, definition)` —
  keyed on the table's tuple, **never on the constraint name** (§3.1.3: names are unique per table,
  not per schema, so a name-keyed lookup can be satisfied by a different table's constraint).
- all of it inside **one explicit transaction on one connection**, opened with
  `set local search_path = pg_catalog, public`, asserting `current_setting('search_path')` inside that
  transaction before trusting any rendering. `SET LOCAL` is transaction- and connection-scoped; issued
  autocommit, or followed by a query on another pooled connection, it silently expires (R2 finding 5).

**Fail-not-skip when the database is missing** (R4 finding 2). The sibling suite this one extends guards its tests with
`test.skipIf(!dbUp)` (`tests/db/driveFileIdNonblank.db.test.ts:44-58`) — 1 of the 5
`tests/db/*.db.test.ts` files, not a repo-wide convention; an earlier draft overstated that. The
posture is right locally — a developer without a stack should not get a wall of red — but wrong in CI, where a
connection failure would let the guard skip and `unit-suite` stay green. "The job provides a database"
is not proof the guard reached it. So this suite skips only when `process.env.CI` is unset; under CI a
failed probe **throws**, naming the DSN host (redacted) and the underlying error.

**No anti-vacuity floors, deliberately** (user scope decision, 2026-07-25). Earlier drafts carried a
required-tuple set, a `>= 23` count floor, an artifact shape contract, and a broad-predicate
cross-check. Each was an attempt to detect a census query that silently stopped returning rows; each
was shown to be defeatable (R2-3, R3-2, R3-4, R4-1), and the repairs were generating new defects
faster than they closed old ones. They are gone. What remains is the honest statement in §10: a
regression in the census query is not self-detecting, and the control on it is code review of that
query. A guard that says plainly what it does not cover is worth more than one whose floors imply a
completeness it never had.

### 4.2 What "covered" means

A column is covered iff some constraint on its `(schema, table)` has a `pg_get_constraintdef` exactly
equal to one of two templates, with the column name substituted:

```
CHECK ((<column> ~ '[^[:space:]]'::text))
CHECK (((<column> IS NULL) OR (<column> ~ '[^[:space:]]'::text)))
```

Both forms are accepted for a column of either nullability (§1.1 item 3). Coverage is decided by the
**definition**, never by the constraint's name.

**The templates are literal constants in the module, plus a canary — not derived at runtime.** The
previous draft derived them from live "known-good" constraints so a Postgres upgrade could not break
every row at once. R3 finding 3 showed that hands an attacker the definition of canonicality itself: a
poisoned `CHECK (col IS NULL OR true)` on the calibrator becomes the accepted nullable template, and
every nullable column then passes while accepting blanks. So the direction is inverted — the templates
are constants a reviewer sees in a diff, and two **canaries** assert that the parent migration's own
constraints still render as those constants:

| canary tuple | expected template |
| ------------ | ----------------- |
| `public.shows` · `drive_file_id` (`supabase/migrations/20260702120200_drive_file_id_nonblank.sql:20-22`) | bare form |
| `public.sync_log` · `drive_file_id` (`supabase/migrations/20260702120200_drive_file_id_nonblank.sql:69-71`) | `IS NULL OR` form |

A deparser change then fails **two named canary assertions** with a clear message instead of failing
every column mysteriously — the diagnosis benefit calibration was for — while a poisoned constraint
fails its canary rather than redefining the standard.

**What this does not prove:** that any given constraint actually rejects blanks. Only execution proves
that; §4.3 is that half, and §10 states how much of the class it covers.

### 4.3 Behavioral proof (anti-tautology split)

Introspection proves a constraint is **declared**, not that it **behaves**.
`tests/db/driveFileIdNonblank.db.test.ts` holds three execution probes today — `agenda_extract_leases`,
`shows`, and `app_events` (`tests/db/driveFileIdNonblank.db.test.ts:97-133`) — plus a fourth test
asserting that 14 constraint **names** exist (`tests/db/driveFileIdNonblank.db.test.ts:136-147`), which
is declaration, not behavior. So 3 of 19 constrained columns have execution proof today; 7 of 23 after
this change. That is a deliberate sample, not full coverage, and §10 says so.

It gains probes for the four new columns: each rejects `""`, `"   "`, and `"\t"` with SQLSTATE `23514`
and accepts a valid id, every probe inside an always-rolled-back transaction (the existing
`expectRejected` / `expectAccepted` helpers enforce zero residue). That file's `PUBLIC_NONBLANK_TABLES`
list and its `toBe(14)` assertion (`tests/db/driveFileIdNonblank.db.test.ts:147`) both move to 15,
since `onboarding_rebuild_attempts` joins the exactly-named public class.

U3 and U4 need insert shapes satisfying their NOT NULL siblings and composite PKs; the plan pins each
from the live table definitions rather than guessing.

### 4.4 Validation-project parity: extend what already works

`tests/db/validation-schema-parity.test.ts:223-285` already asserts the validation project carries every
public nonblank CHECK, by parsing `20260702120200_drive_file_id_nonblank.sql` for
`alter table public.<t> add constraint <name> check` (`tests/db/validation-schema-parity.test.ts:230`), pinning the parse at 14 names
(`tests/db/validation-schema-parity.test.ts:237`), and asserting `pg_constraint` is a superset (`tests/db/validation-schema-parity.test.ts:277-284`).

The previous draft proposed replacing this with a census-driven, identity-bound Layer 3. R3 finding 1
then showed the identity binding was unsound anyway: a URI's authority is not libpq's effective target,
since `?host=` / `hostaddr=` query parameters (and duplicate keyword-form fields) override it, so a DSN
displaying `postgres.<validation-ref>@…pooler.supabase.com` can connect to a loopback Postgres on port 54322 and pass
every authority check.

So this spec does **not** re-architect that test. It makes the minimal change the new migration
requires: the parse covers **both** nonblank migration files, and the pinned count moves from 14 to 17
(14 + the three PUBLIC constraints the new migration declares; the `dev.shows` one is excluded by the
pattern's `public.` scoping). The mechanism, its
superset assertion, its failure message, and its `TEST_DATABASE_URL` postures are otherwise untouched,
because they are already reviewed, already shipping, and not what this change is about.

Count note: the migration declares four constraints, three on `public` (`shows`,
`wizard_finalize_checkpoints`, `onboarding_rebuild_attempts`) and one on `dev.shows`, and the existing
regex is scoped to `alter table public.` (`tests/db/validation-schema-parity.test.ts:228-230`), so the pinned public count becomes 14 + 3 = 17.
**Verified against the real regex, not asserted** (2026-07-25): running the test's own pattern
`/alter\s+table\s+public\.\w+\s+add\s+constraint\s+(\w+)\s+check/gi` over both files yields **14**
public names from the parent migration and **3** from the new one
(`shows_opening_reel_drive_file_id_nonblank`, `wizard_finalize_checkpoints_drive_file_id_nonblank`,
`onboarding_rebuild_attempts_drive_file_id_nonblank`) — the `dev.shows` constraint is correctly
excluded by the `public.` scoping. The pinned count therefore moves 14 → **17**. Note the pattern's
`\s+` spans newlines, so the new migration's multi-line `alter table … / add constraint …` statements
are matched; a formatting choice that a line-anchored pattern would have silently dropped.

**The wrong-target problem is out of scope and stays open.** It predates this change, affects the whole
`validation-schema-parity` job equally, and R3 finding 1 is the first time it has been articulated;
§10 item 5 records it and the plan files it to `BACKLOG.md` rather than attempting a fix inside a
defense-in-depth CHECK change.

### 4.5 The exemption list

```ts
export const DRIVE_ID_COVERAGE_EXEMPTIONS: CoverageExemption[] = [];
```

Ships **empty**: after §3 lands, all 23 census columns are covered. Four rules, each with a
synthetic-input unit test: non-empty `reason`; no row for a column that IS covered
(`stale_exemption/now_covered`); no row naming a column absent from the census
(`stale_exemption/column_absent`); no duplicate `(schema, table, column)` key.

**Honest limit:** no rule can tell whether an exemption is *justified*. Someone who adds a real
Drive-ID column and writes `reason: "not needed"` silences the guard permanently. The list ships empty,
every future row lands in a reviewable diff, and §10 records this rather than pretending otherwise.

## 5. Guard conditions (per input, per the spec self-review checklist)

| input | empty | malformed | absent / unset |
| ----- | ----- | --------- | -------------- |
| live census result | `[]` → the audit is vacuously green. This is §10 item 2, disclosed rather than defended: the four mechanisms tried against it were each defeated, and the control is review of the census query | duplicate `(schema,table,column)` from a bad join → harmless; the auditor keys on the tuple and a duplicate covered row cannot mask an uncovered one | a column present in the DB but missed by the predicate → invisible (§10 item 2) |
| live constraints | `[]` → every column reports `uncovered` (correct) | definition not string-equal to either template → `uncovered` (correct) | a column with several CHECKs is covered if ANY of them matches a template |
| canonical templates | — | a deparser change → the two named canaries (§4.2) fail with a clear message, rather than every column failing | templates are module constants, so they cannot be absent |
| `exemptions` | `[]` → the shipping state | `reason` empty/whitespace → `empty_reason`; duplicate key → `duplicate_exemption` | row naming an absent column → `stale_exemption/column_absent` |
| `LOCAL_TEST_DATABASE_URL` | set-but-empty → `assertLocalDbUrl` refuses (unparseable) | non-loopback host → refused by `assertLocalDbUrl` | unset → loopback default; unreachable → the suite skips locally, but `unit-suite-db` always provides a database in CI (§4.0) |
| `search_path` | — | not pinned → the layer asserts `current_setting('search_path')` inside its own transaction and fails if it is not the pinned value | `SET LOCAL` issued outside a transaction expires silently — hence the one-transaction-one-connection contract (§4.1) |

---

## 6. Self-consistency sweep

Shared values are defined once and referenced, not restated:

- **The predicate** `~ '[^[:space:]]'` appears in exactly two places: the migration SQL, and a single exported constant used to construct both canonical definition strings in §4.2. No test re-spells it inline.
- **23** — the census size as of 2026-07-25 (17 public + 6 dev) — appears in §2, §2.1/§2.2's 19+4 split, and §10 item 1's `7 of 23`. It is descriptive of today's database, not an assertion: no test pins it after the scope decision removed the count floor (§4.1).
- **19 covered / 4 uncovered** in §2 sums to 23. After §3 lands: 23 covered, 0 uncovered, 0 exemptions.
- **63 bytes** — the Postgres identifier limit (`NAMEDATALEN - 1`) — appears in §1.1 item 2, §3, §3.1, and AC-12, always as the same limit.
- **65 bytes** — the conventional-but-too-long U3 name — appears only in §1.1 item 2 and §3.1, both citing the same `wc -c` measurement.
- **Constraint names** are defined in §3's table; U3's recurs in §1.1 item 2, §3.1, and §3.1.2, and the parent migration's two canaries recur in §4.2 — each recurrence is a deliberate cross-reference to the same definition, not an independent restatement.
- **14** appears as a quotation of the EXISTING hardcoded literals being changed — `tests/db/validation-schema-parity.test.ts:237` (§1.1 item 6, §4.4) and `tests/db/driveFileIdNonblank.db.test.ts:147` (§4.3, AC-11). plus §2/§2.1's description of the parent migration's scope, where it is the historical count. It is never this spec's own post-change count. **15** is the post-change public exactly-named count (§4.3, AC-11). **17** is the new pinned parse count (§4.4, and §11's provenance note).
- **Acceptance criteria run AC-1 … AC-15** with no gaps and no duplicates; the set was renumbered when §4 collapsed in R3, and every AC now maps to a mechanism that still exists.
- **Behavioral-probe counts** `3 of 19` (today) and `7 of 23` (after) appear in §4.3 and §10 item 1, and are referenced again in this sweep — all from the single measurement in §4.3.
- **8 / 16 / 4** — statements per pass, results across two passes, and first-pass NOTICEs — appear only in §3.1.2, all from the one measurement.
- **The predicate** `~ '[^[:space:]]'` is spelled in the migration (§3) and in §4.2's two template constants; §4.2's two canaries assert the parent migration's constraints still render as those constants, so the spellings cannot drift apart silently.

**Where the normative enumeration lives, after the R3 collapse:** there is no committed census file to keep honest — the census is recomputed from the live database on every run (§4.1). The enumeration is therefore normative by construction rather than by artifact discipline. That removes one drift surface — no stored list can fall behind the schema — but not the other: the ~15-line query that computes the census is itself hand-written, and §10 items 2 and 6 own what happens when it narrows.

---

## 7. Non-goals / out of scope

- **Widening the guard beyond the `%drive_file_id%` name pattern.** A Drive ID stored in a column named nothing like `drive_file_id` is undetectable by name and is not in scope; nothing in this change claims otherwise.
- **Rewriting non-canonical equivalent CHECKs.** None exist today (§2 verified all 19 existing constraints render in canonical form). If one appears, §4.2 forces an exemption row or a rewrite; this spec does not pre-decide which.
- **A data-repair migration.** §3.3 verified zero violating rows across all four columns on local. If validation or prod holds one, the apply fails loudly and that becomes its own scoped decision — deliberately not automated here.
- **Changing the `[^[:space:]]` predicate.** Inherited verbatim from the parent migration; this spec does not introduce a second, differently-strict predicate into the same column class. See §7.1 for the measurement that says inheriting it is safe.

### 7.1 Unicode whitespace: measured, not assumed

The parent migration calls `~ '[^[:space:]]'` "the faithful SQL translation of the JS `/\S/` guard." That claim is exactly true for ASCII whitespace and is worth checking for Unicode, because JS `\s` includes U+00A0 NBSP while Postgres's `[:space:]` is documented as locale-dependent — a plausible divergence where the DB would ACCEPT a value the JS guard REJECTS.

Probed on the local UTF8 database, 2026-07-25:

```
$ psql "$LOCAL" -At -f nbsp-probe.sql
160|f|f|f|f|f|t
   ▲  ▲ ▲ ▲ ▲ ▲ ▲
   │  │ │ │ │ │ └─ ' x '        ~ '[^[:space:]]' → TRUE  (accepted, correct)
   │  │ │ │ │ └─── '   '        ~ … → false (rejected)
   │  │ │ │ └───── E'\t'        ~ … → false (rejected)
   │  │ │ └─────── U&'\000b' VT ~ … → false (rejected)
   │  │ └───────── U&'\2003' EM ~ … → false (rejected)
   │  └─────────── U&'\00a0' NBSP ~ … → false (rejected)
   └────────────── ascii(NBSP) = 160, server_encoding = UTF8
```

So there is **no divergence** on this database: NBSP, em-space, and vertical tab are all inside `[:space:]` and all rejected, matching `/\S/`. The predicate is inherited on measured grounds, not on the parent's assertion.

Scope of that measurement, stated honestly: it was taken on the local UTF8 stack. `[:space:]` remains locale-dependent in principle, so a target with a different `lc_ctype` could classify differently. The behavioral probes in §4.3 therefore assert only the ASCII cases (`""`, `"   "`, `"\t"`) — the set the parent migration committed to and the set that cannot vary — and this section records the Unicode result as a local measurement rather than a cross-target guarantee.
- **Extending the guard to other column classes** (`slug`, `share_token`, …). The mechanism generalizes; applying it elsewhere is a separate change with its own census.
- **Touching `assertNonEmptyDriveFileId`** (`lib/drive/fetch.ts:145`) or any JS write path. This is DB-layer defense-in-depth only; no application behavior changes.

---

## 8. Migration post-checklist (AGENTS.md cross-cutting rule)

Lands in the same PR as `supabase/migrations/**`:

1. Apply locally + test (TDD invariant 1 already requires this).
2. `pnpm gen:schema-manifest` — **expected to be a no-op** for a constraint-only migration: the manifest records tables and columns only (`scripts/schema-manifest/lib.ts:238-246`) and this migration adds no column. The plan runs `pnpm gen:schema-manifest --check` and asserts "fresh", so the expectation is verified rather than assumed. If it *does* change, something unintended landed and the run stops.
3. Apply surgically to the validation project — `supabase db query --linked "<SQL>"` (or `psql "$TEST_DATABASE_URL" -f …`), then `notify pgrst, 'reload schema';`. Public schema only; `dev.*` is local-seed infrastructure, not a deploy target, and the migration's `alter table if exists` makes the dev block a no-op there.
4. Verify the extended `validation-schema-parity` CHECK-parity test (§4.4) is green against validation before pushing.

---

## 9. Acceptance criteria

- **AC-1** The migration (§0) adds all four constraints from §3, wrapped in a single `begin; … commit;`, apply-twice safe, dev block guarded by `alter table if exists`.
- **AC-2** All four columns reject `""`, `"   "`, `"\t"` with SQLSTATE 23514 and accept a valid id, proven behaviorally against local Postgres, with zero row residue.
- **AC-3** `auditDriveIdCoverage` is pure, takes no calibrated input, and has unit tests for every branch: covered (both forms), uncovered, definition-differs-despite-matching-name, **same constraint NAME on a different table** (§3.1.3), and all four exemption findings.
- **AC-4** The guard suite runs in `tests/db/`, therefore in `unit-suite-db`, a worker of the required `unit-suite` aggregator; a deliberately uncovered column makes it RED, demonstrated by a test that drops a constraint inside a rolled-back transaction and asserts the auditor reports `uncovered` — a negative-control that fails if the audit is vacuous.
- **AC-5** The census query uses the POSIX-regex predicate (`~ 'drive_file_id'`), never `LIKE`, restricted to `BASE TABLE`; a test pins that `driveXfileYid` is NOT in scope.
- **AC-6** The suite FAILS rather than skips when the database is unreachable under `CI` (R4-2), and skips only when `CI` is unset; a test proves the CI branch throws.
- **AC-7** All introspection runs in one explicit transaction on one connection with `set local search_path = pg_catalog, public`, asserting `current_setting('search_path')` inside that transaction before any rendering is trusted.
- **AC-8** The canonical templates are module constants, and two canaries (§4.2) assert the parent migration's own constraints still render as those constants — the canaries check the templates, they never derive them.
- **AC-9** The exemption list ships empty, and each of its four rules has a failing-input unit test.
- **AC-10** `tests/db/validation-schema-parity.test.ts`'s CHECK-parity test parses BOTH nonblank migrations and its pinned public count moves from 14 to the verified new value; its superset assertion, failure message, and `TEST_DATABASE_URL` postures are otherwise unchanged.
- **AC-11** `tests/db/driveFileIdNonblank.db.test.ts`'s public list and length assertion cover all 15 public columns named exactly `drive_file_id` (was 14), including `onboarding_rebuild_attempts`.
- **AC-12** Every `add constraint <name>` anywhere in `supabase/migrations/` is ≤ 63 bytes, pinned by a test that walks the whole directory (§3.1).
- **AC-13** The migration applies cleanly to the local DB despite the `no_global_cursor_columns` `ddl_command_end` event trigger re-scanning `public` on every statement (§3.1.1), and adds no `_allowed_watermark_columns` row.
- **AC-14** `pnpm gen:schema-manifest --check` reports the manifest fresh (constraint-only migration, no column change), and the migration is applied to the validation project.
- **AC-15** `BL-OPENING-REEL-DRIVE-ID-NONBLANK` and `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` move whole to `BACKLOG-archive.md` with provenance (ids unchanged), with the U4 drift finding recorded there as part of the closure; and all four §11 follow-ups are filed to `BACKLOG.md` with their review-round provenance.

---

## 10. Known limitations (what this guard does NOT guarantee)

Stated because four review rounds showed earlier drafts' claims outrunning their mechanism. Each is a
deliberate acceptance, and each has a filed follow-up in §11 where follow-up is warranted.

1. **Behavioral proof is a SAMPLE.** §4.2's templates prove a constraint was *declared* in canonical
   form; only execution proves it rejects blanks. §4.3 measures **7 of 23** constrained columns
   carrying an execution probe after this change, up from 3 of 19. The other 16 are declaration-only.
2. **A census-query regression is not self-detecting** (R2-3, R3-2, R3-4, R4-1). If the query stops
   returning a column — a narrowed name predicate, a changed schema list, an added filter — that
   column is simply absent from both the census and the audit, and the suite is green. Four rounds of
   floors and cross-checks failed to close this, and the user's scope decision was to stop trying and
   say so. The control is code review of the census query itself, which is ~15 lines in one file.
3. **An exemption row can silence the guard permanently.** §4.5's four rules catch stale and
   malformed rows, not unjustified ones. The list ships empty; every future row lands in a diff.
4. **Validation parity still matches on bare constraint NAMES** (R4-4). The existing test asserts
   validation contains each expected `conname` (`tests/db/validation-schema-parity.test.ts:256-284`);
   a same-named constraint on another public table, or one with a weakened definition, satisfies it.
   This spec extends that test's parse and count (§4.4) and deliberately does not re-architect it.
5. **`validation-schema-parity` cannot prove which database it connected to** (R3-1). A libpq URI's
   authority is not its effective target — `?host=` / `hostaddr=` and duplicate keyword fields
   override it. Pre-existing, affects the whole job, explicitly not fixed here; an earlier draft's
   authority-parsing check would have been theatre against exactly this bypass.
6. **Scope edges.** A third repo-owned schema falls outside the census (§4.1 scans `public`+`dev`);
   a Drive ID under an unrelated column name is undetectable by name matching; and `BASE TABLE`
   excludes `FOREIGN` tables. Postgres does PERMIT a CHECK on a foreign table — it simply does not
   enforce or validate it — so this exclusion is about enforceability, not DDL legality; an earlier
   draft said "cannot carry", which was wrong. Either way such a column is silently absent rather than
   reported as unprotectable.

**What it DOES guarantee — narrowly, because earlier drafts overclaimed in both directions:** a new
column whose name matches `drive_file_id`, on a BASE TABLE in `public` or `dev`, landing without a
canonical nonblank CHECK and without an exemption row, and which the census query returns, makes the
guard suite RED — in `unit-suite-db`, a worker of the required `unit-suite` aggregator, against a real
all-migrations-applied database, on the PR that introduces it. Every clause is load-bearing; items
1–6 are where it does not apply.

---

## 11. Filed follow-ups

Per the user's scope decision (2026-07-25), the work this spec deliberately does not do is filed
rather than dropped. The plan lands these entries in the same PR.

| id | `BACKLOG.md` entry | source |
| -- | ------------------ | ------ |
| `BL-DRIVEID-CENSUS-QUERY-SELF-CHECK` | Detect a census-query regression that silently narrows the audited set. Four mechanisms were tried and defeated; a real fix likely needs an independently-derived column set (e.g. `pg_attribute` vs `information_schema`) or a mutation test that narrows the query and asserts the suite goes red. | §10 item 2; R2-3, R3-2, R3-4, R4-1 |
| `BL-VALIDATION-PARITY-DEFINITION-MATCH` | Make `validation-schema-parity`'s CHECK comparison definition-based and tuple-keyed instead of `conname`-based, so a same-named or weakened constraint cannot satisfy it. | §10 item 4; R4-4 |
| `BL-VALIDATION-TARGET-BINDING` | `TEST_DATABASE_URL` cannot be bound to the validation project by parsing its authority. Needs a check that interrogates the *connected* server for an identity fact, not the DSN string. | §10 item 5; R3-1 |
| `BL-DRIVEID-BEHAVIORAL-COVERAGE` | 16 of 23 constrained columns have no execution probe. Extending the probe set needs per-table insert shapes; mechanical, bounded, unglamorous. | §10 item 1; R2-9 |

Each entry carries its review-round provenance so the next implementer inherits the analysis rather
than rediscovering it — four rounds of adversarial findings on this guard are a genuine asset.
