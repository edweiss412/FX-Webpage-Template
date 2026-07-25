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
supabase/__generated__/drive-id-coverage.json                        "the census artifact"
lib/driveIdCoverage/audit.ts                                         "the auditor"      (pure; §4.1)
lib/driveIdCoverage/introspect.ts                                    "the census query" (§4.5)
scripts/generate-drive-id-coverage.ts                                "the generator"    (pnpm gen:drive-id-coverage)
tests/db/driveIdCoverage.test.ts                                     "the DB-free guard suite"
tests/db/driveIdCoverage.db.test.ts                                  "the local-DB guard suite"
```

Also MODIFIED (all tracked, so cited normally elsewhere): `package.json` (the `gen:drive-id-coverage`
script), `tests/db/schema.test.ts` (static parse of the migration), `tests/db/driveFileIdNonblank.db.test.ts`
(behavioral probes + the 14→15 list), `tests/db/validation-schema-parity.test.ts` (Layer 3 generalization),
`BACKLOG.md` and `BACKLOG-archive.md` (entry graduation).

The quoted short names are used throughout the rest of this document instead of repeating the paths, so
each path has exactly one definition site. R1 finding 8 flagged the original inventory for omitting the
auditor, the census query, and the generator — the most security-sensitive code in the change.

---

## 1.1 Resolved scope — do not relitigate

Each of these is decided. Verify the citation; do not re-derive the decision.

1. **Coverage is decided by the constraint DEFINITION, never by its name.** §4.2. This is not an oversight in the naming convention — it is the reason a hand-edited `…_nonblank` constraint cannot fake coverage. Ratified by a prior review arc on this repo that spent 7 rounds on a text-normalizing predicate comparison: the normalizer equated 11 operator families that are not equivalent, and the same defect then reappeared in the sibling comparison path. The durable rule taken from it: never compare SQL predicates as normalized text — compare against a canonical rendering the database itself produced.
2. **`wizard_finalize_checkpoints`'s constraint deliberately breaks the `<table>_<column>_nonblank` convention.** The conventional name is **65 bytes**, past Postgres's 63-byte identifier limit, and would be silently truncated. Measured, not assumed (§3.1). The chosen name is `wizard_finalize_checkpoints_cursor_nonblank` (43 bytes). Because coverage is definition-based (item 1), the deviation costs nothing.
3. **Both canonical CHECK forms are accepted for a column of either nullability.** §3, §4.2. A CHECK fails only on FALSE and `NULL ~ '…'` is NULL, so the bare form and the `is null or …` form are behaviorally identical. Requiring the stylistically-matching form would produce false failures with no safety gain.
4. **`public.onboarding_rebuild_attempts.drive_file_id` (U4) is in scope even though no backlog item covers it.** It is a column named *exactly* `drive_file_id` — inside the ORIGINAL 2026-07-02 scope rule — created 16 days after that migration and never covered (§2.2, verified live §2). Landing the guard without landing U4's CHECK would ship a red gate. This is not scope creep; it is the first thing the guard found.
5. **The exemption list ships EMPTY and that is correct.** §4.3. It is not a zombie flag: all four of its rules (§4.3) are exercised by synthetic-input unit tests (§4.4, AC-8), and the two stale-row rules are what stop an empty list from silently becoming a permanent blindfold later.
6. **Layer 3 GENERALIZES the existing validation CHECK-parity test rather than adding a second mechanism.** §4.6. `tests/db/validation-schema-parity.test.ts:223-285` already asserts validation carries every public nonblank CHECK — but hardcoded to one migration file (`tests/db/validation-schema-parity.test.ts:224-227`) and to the literal `14` (`tests/db/validation-schema-parity.test.ts:237`), a count its own comment says must move in lockstep by hand. That literal is an instance of the drift being removed here. Separately and additionally, the schema MANIFEST records columns only (`scripts/schema-manifest/lib.ts:238-246`) and so cannot see a constraint-only migration at all. Both facts are true; the original draft of this spec conflated them and overstated the gap.
7. **The census scans `public` + `dev` only — an allowlist of repo-owned schemas, not a vendor blocklist.** §4.5. Vendor schemas (`auth`, `storage`, `realtime`, …) cannot receive our constraints, and a blocklist naming them would go stale the moment Supabase adds a schema. (The earlier draft additionally proposed a migration-side pin asserting migrations create tables only in those two schemas; that pin died with the SQL parser it depended on — see §4.0 — and §10 records the residual exposure.)
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

So the deliverable is not just "add the two deferred CHECKs." It is: add every missing CHECK, then replace the prose scope rule with an executable artifact that fails red when a new Drive-ID-bearing column appears uncovered.

**Framing note (durable lesson from a prior 8-round spec arc on this repo):** a prose enumeration of an executable property never completes — test bodies, adversary lists, observables, and transitions each failed the same way, one omission at a time. The fix that worked was to make the enumeration a NORMATIVE artifact and compare against it mechanically. This spec therefore makes the census a **normative committed artifact** and compares the live database against it, rather than restating a list in prose that a future migration can silently invalidate.

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
| U3 `public.wizard_finalize_checkpoints.last_processed_drive_file_id` | `wizard_finalize_checkpoints_cursor_nonblank` (43 bytes) — **deviates from the convention on purpose**, see §3.1 |
| U4 `public.onboarding_rebuild_attempts.drive_file_id` | `onboarding_rebuild_attempts_drive_file_id_nonblank` (50 bytes) |

### 3.1 Why U3's name breaks the convention

The conventional `<table>_<column>_nonblank` name for U3 is `wizard_finalize_checkpoints_last_processed_drive_file_id_nonblank`. Measured 2026-07-25:

```
$ printf '%s' wizard_finalize_checkpoints_last_processed_drive_file_id_nonblank | wc -c
65
```

Postgres's identifier limit is 63 bytes (`NAMEDATALEN - 1`), so that name would be **silently truncated** to `…_drive_file_id_nonbla`. Truncation is deterministic and applied consistently to both the `drop constraint if exists` and the `add constraint`, so apply-twice safety would technically survive — but a name that does not appear anywhere in the source it was written in is a latent collision and a debugging trap. U3 therefore takes an explicit 43-byte name.

This is safe precisely because **coverage is definition-based, never name-based** (§1.1 item 1, §4.2). No test derives an expected constraint name from a table/column pair; the census artifact records whatever name the database reports.

§4.4 pins the general form of this hazard: every constraint name declared by a nonblank migration must be ≤ 63 bytes, so the next long-named column fails at test time rather than silently truncating.

**The `cursor` token in that name is safe, and deliberately checked.** The AC-X.4 event trigger `no_global_cursor_columns` (`supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql:75-77`) fires on `ddl_command_end` and raises `check_violation` for any `public` column whose name matches `(^|_)cursor($|_)` (among other watermark shapes) and is absent from `_allowed_watermark_columns`. It scans **`information_schema.columns` only** (`supabase/migrations/20260501004000_no_global_cursor_event_trigger.sql:57-64`) — constraint names are not columns, so `wizard_finalize_checkpoints_cursor_nonblank` cannot trip it.

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
 public.wizard_finalize_checkpoints :: wizard_finalize_checkpoints_cursor_nonblank        :: CHECK (((last_processed_drive_file_id IS NULL) OR (last_processed_drive_file_id ~ '[^[:space:]]'::text)))
ROLLBACK
```

What this settles:

1. **AC-12** — the `no_global_cursor_columns` `ddl_command_end` trigger does not reject the migration,
   and no `_allowed_watermark_columns` row is needed. The `cursor` token in a CONSTRAINT name is
   invisible to a trigger that scans `information_schema.columns` (§3.1).
2. **Idempotency** — a second full pass succeeds with no error.
3. **§4.2's two canonical renderings are byte-exact on this server** — both templates appear verbatim,
   so self-calibration (§4.2) has a measured basis.

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
bare `conname` can be satisfied by a same-named constraint on a different table. §4.6 previously
compared bare names and is corrected accordingly.

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
| tests | behavioral probe (§4.7) + census row | behavioral probe + census row | behavioral probe + census row | behavioral probe + census row |
| schema manifest | no change (constraint-only, §4.6) | dev not in manifest (public only) | no change | no change |
| validation apply | **required** (§8) | no-op there (`if exists`) | **required** | **required** |

**Flag lifecycle table:** N/A — this change introduces no boolean config field, feature flag, or toggle. **Dimensional invariants / transition inventory:** N/A — no component, no rendered surface, no visual state (§7).

---

## 4. The coverage guard

### 4.0 What changed after adversarial review R1, and why

R1 returned BLOCKING on the guard's original shape. Two findings were structural rather than
patchable, and the design below is the response, recorded here so a later reader does not
re-derive it:

- **The DB-free layer originally parsed migration SQL** to discover newly-introduced
  `%drive_file_id%` columns. R1 enumerated the bypasses: quoted / unqualified identifiers,
  `ONLY`, `IF [NOT] EXISTS`, comma-separated `ALTER` actions, `RENAME COLUMN`, `RENAME TABLE`,
  `SET SCHEMA`, `CREATE TABLE AS`, top-level `SELECT INTO`, `LIKE`, `INHERITS`, `PARTITION OF`,
  `CREATE TABLE OF`, `CREATE FOREIGN TABLE`, dynamic DDL inside `DO … EXECUTE`, plus false
  positives from comments, string literals, and dollar-quoted bodies. That list is not
  exhaustible by patching — a regex SQL parser cannot carry a fail-by-default guarantee.
  **The parser is deleted, not hardened.** Layer 1 now asserts only what is genuinely provable
  without a database, and §10 states plainly what that costs.
- **The census predicate was `LIKE '%drive_file_id%'`,** which is wrong: SQL `LIKE` treats `_`
  as a single-character wildcard. Measured on local, 2026-07-25:

  ```
  select 'driveXfileYid' like '%drive_file_id%',      -- t   ← matches a column that is NOT a Drive ID
         'driveXfileYid' like '%drive\_file\_id%',    -- f
         'driveXfileYid' ~ 'drive_file_id';           -- f
  ```

  The census now uses the POSIX-regex operator `~ 'drive_file_id'`, where `_` is literal. This
  also aligns the SQL predicate with any JS-side use of the same pattern, which the `LIKE` form
  silently did not.

### 4.1 Shape: a pure auditor + three layers

The guard is one pure function plus three layers that feed it from different sources. The pure
function is what gets unit-tested exhaustively; the layers are thin.

```ts
// lib/driveIdCoverage/audit.ts
export type DriveIdColumn = { schema: string; table: string; column: string; nullable: boolean };
export type DriveIdConstraint = { schema: string; table: string; name: string; definition: string };
export type CoverageExemption = { schema: string; table: string; column: string; reason: string };

export type CoverageFinding =
  | { kind: "uncovered"; column: DriveIdColumn }
  | { kind: "stale_exemption"; exemption: CoverageExemption; why: "now_covered" | "column_absent" }
  | { kind: "empty_reason"; exemption: CoverageExemption }
  | { kind: "duplicate_column"; key: string }
  | { kind: "duplicate_exemption"; key: string };

export function auditDriveIdCoverage(
  columns: DriveIdColumn[],
  constraints: DriveIdConstraint[],
  exemptions: CoverageExemption[],
): CoverageFinding[];
```

A run is green iff `auditDriveIdCoverage(...)` returns `[]`. The two `duplicate_*` findings exist
because the census is keyed on `(schema, table, column)` and every count in this spec is a count of
DISTINCT keys — a duplicated row must never be able to satisfy a size floor (R1 finding 6).

### 4.2 What "covered" means — canonical-definition equality, and its limits

A column is **covered** iff the constraint list contains, for that exact `(schema, table)`, a
constraint whose `pg_get_constraintdef(oid)` is **string-equal** to one of the two canonical
renderings for that column:

```
CHECK ((<column> ~ '[^[:space:]]'::text))
CHECK (((<column> IS NULL) OR (<column> ~ '[^[:space:]]'::text)))
```

Both forms are accepted for a column of either nullability, because they are behaviorally identical
on NULL (§3). Coverage is decided by the **definition**, never by the constraint's name — a
constraint named `…_nonblank` whose body was edited to something weaker must not count.

This is equality against a rendering Postgres itself produced, not a regex over an arbitrary
predicate. A prior 7-round review arc on this repo landed on exactly that mistake: a normalizing
text comparison over predicates equates operator families that are not equivalent (§1.1 item 1).

**Two limits, both raised in R1 finding 4, both real:**

1. **The rendering is deparser output, not a semantic identity.** `pg_get_constraintdef` prints the
   operator as it is *visible* under the current `search_path`. A `public.~(text,text)` operator
   shadowing `pg_catalog.~`, with `public` ahead of `pg_catalog`, could deparse to the same string
   while accepting blanks. The introspection therefore pins the path — but `SET LOCAL` is
   **transaction-scoped and connection-scoped**, so issuing it as a bare autocommit statement, or
   letting the following query land on a different pooled connection, silently restores the ambient
   path and voids the guarantee (R2 finding 5). The contract is therefore: **open an explicit
   transaction, issue `set local search_path = pg_catalog, public`, run every introspection query,
   and commit — all on one connection** — and the layer asserts `current_setting('search_path')`
   inside that transaction before trusting any rendering.
2. **The exact rendering is server-version dependent.** Rather than hardcoding the two strings and
   hoping they survive a Postgres upgrade, the expected strings are **self-calibrated** from
   constraints the repo already knows are correct. **Two calibrators are required, not one**
   (R2 finding 4): the bare form and the `IS NULL OR` form are structurally different renderings, and
   no column-name substitution turns one into the other. They are:

   | form | calibrator | source |
   | ---- | ---------- | ------ |
   | bare (NOT NULL) | `public.shows` → `shows_drive_file_id_nonblank` | `supabase/migrations/20260702120200_drive_file_id_nonblank.sql:20-22` |
   | `IS NULL OR` (nullable) | `public.sync_log` → `sync_log_drive_file_id_nonblank` | `supabase/migrations/20260702120200_drive_file_id_nonblank.sql:68-70` |

   Each is selected by its `(schema, table, column)` tuple, never by name (§3.1.3 — the bare name
   `shows_drive_file_id_nonblank` also exists on `dev.shows`). Calibration itself is guarded: if
   either calibrator is **absent**, or the tuple lookup returns **more than one** constraint, or the
   rendering does not contain the expected column name, the layer FAILS with that as the reported
   reason. It never falls back to a hardcoded string, because a silent fallback would defeat the
   purpose of calibrating.

**What this does NOT prove, stated plainly:** that any given constraint actually rejects blanks.
Only execution proves that, which is why §4.7's behavioral probes exist and why they are a separate,
non-negotiable half of the guard. Definition equality is a completeness mechanism (did every column
get one?), not a correctness mechanism (does it work?).

Consequence, accepted deliberately: a semantically-equivalent but differently-written CHECK (e.g.
`char_length(btrim(col)) > 0`) does not count as coverage. It must be rewritten to canonical form or
carry an exemption. The guard's job is to make the canonical shape the only silent path.

Second consequence: the canonical rendering embeds an explicit cast to text, so a non-text column
(say `drive_file_id_count int`) can never match and necessarily requires an exemption row. That is
intended — a new column matching the name pattern should force a human decision.

### 4.3 The exemption list

```ts
export const DRIVE_ID_COVERAGE_EXEMPTIONS: CoverageExemption[] = [];
```

Ships **empty**: after §3 lands, every one of the 23 census columns is covered.

Rules, each enforced by the auditor and each with its own unit test (§4.4):

1. **Non-empty reason.** Empty or whitespace-only `reason` yields `empty_reason`.
2. **No stale rows — now-covered.** An exemption for a column that IS covered yields
   `stale_exemption/now_covered`, so an exemption added during a gap cannot survive the repair.
3. **No stale rows — column absent.** An exemption naming a column not in the census yields
   `stale_exemption/column_absent`.
4. **No duplicate exemptions** for one `(schema, table, column)` key.

**Honest limit (R1 finding 6):** none of these rules can tell whether an exemption is *justified*.
A developer who adds a real Drive-ID column and writes `reason: "not needed"` silences the guard
permanently, and no mechanical rule can catch that. The exemption list is therefore deliberately a
**reviewed surface**, not a self-policing one: it ships empty, every future row appears in a diff,
and §10 names this as a residual risk rather than pretending the rules close it.

### 4.4 Layer 1 — DB-free (always runs, including CI)

Layer 1 asserts what is provable with **no database and no SQL parsing**. The DB-free suite (§0):

- **Auditor unit tests** over synthetic inputs, one per branch: covered-NOT-NULL, covered-NULLABLE,
  covered-by-the-other-canonical-form, uncovered, **name matches but definition differs → uncovered**,
  **same column name on a different table → not coverage**, exempted-with-reason, empty reason,
  exempted-but-now-covered, exempted-column-absent, duplicate census key, duplicate exemption.
- **Artifact shape contract.** The committed census artifact (§0) is validated against a runtime
  schema, not merely `JSON.parse`d: it must be a non-empty array; every row must carry exactly the
  expected fields with the expected types; `(schema, table, column)` must be unique across rows;
  every `schema` must be `public` or `dev`; every recorded constraint name must be ≤ 63 bytes.
  Missing file, unparseable JSON, and a valid-but-wrong shape (`[]`, missing field, wrong type,
  duplicate key) each fail — R1 finding 6 noted the original spec covered only the first two.
- **An artifact floor that does NOT come from the artifact** (R2 finding 3). The shape contract above
  is satisfied by a *truncated* artifact — one well-formed row passes it, Layer 2 skips without a
  local database, and Layer 3 would then derive an expected set and a floor of one from that same
  file and pass. Every layer green; nothing checked. So Layer 1 additionally asserts the artifact
  against expectations **hardcoded in the test**, independent of the file it is checking: a required
  tuple set (at minimum `public.shows.drive_file_id`, `public.shows.opening_reel_drive_file_id`,
  `public.wizard_finalize_checkpoints.last_processed_drive_file_id`,
  `public.onboarding_rebuild_attempts.drive_file_id`, `dev.shows.drive_file_id`,
  `dev.shows.opening_reel_drive_file_id`) must all be present, and the count of distinct
  `(schema, table, column)` keys must be ≥ 23. A deliberate reduction below that floor must edit the
  test, in the diff, on purpose — which is the whole point.
- **Migration-declared identifier lengths — across ALL migrations** (R2 finding 7). Every
  `add constraint <name>` appearing anywhere in `supabase/migrations/` is ≤ 63 bytes. Scoping this to
  the two nonblank migrations, as the previous draft did, would let a third migration declare a
  65-byte name, have Postgres truncate it to 63, and pass both this lexical scan (wrong files) and
  the artifact's live-name check (which sees the already-truncated name). This is a *lexical* check on
  names the repo wrote, not a semantic claim about what the migrations do — the distinction that
  killed the parser survives, because a name written in a file either is or is not over the limit.

**What Layer 1 cannot do:** notice that a NEW Drive-ID column exists. That requires a database.
§10 states the consequence.

### 4.5 Layer 2 — local DB freshness + coverage (skips when local Postgres is unreachable)

The census is a **committed normative artifact** (§0), generated by `pnpm gen:drive-id-coverage`
from the local all-migrations-applied database, recording per row
`{schema, table, column, nullable, constraint}` — sorted deterministically and serialized byte-stably,
exactly as `scripts/generate-schema-manifest.ts` does for the schema manifest.

Census query contract (each clause load-bearing):

- `c.column_name ~ 'drive_file_id'` — POSIX regex, `_` literal (§4.0). **Not** `LIKE`.
- `c.table_schema in ('public','dev')` — the repo-owned schemas.
- joined to `information_schema.tables` with `t.table_type = 'BASE TABLE'` — views appear in
  `information_schema.columns` but cannot carry a table CHECK, so admitting them would manufacture
  permanently-uncoverable rows (R1 finding 7).
- constraints selected from `pg_constraint` with `contype = 'c'` only.
- `set local search_path = pg_catalog, public` before introspecting (§4.2 limit 1).

A column with **multiple** CHECK constraints records the one matching a canonical form; if none
matches, the row records `null` and the auditor reports it `uncovered`. The artifact's `constraint`
field is therefore "the constraint that establishes coverage," not "some constraint on this column"
(R1 finding 7).

**Determinism when several canonical constraints exist on one column** (R2 finding 10). Two
equivalent CHECKs under different names are legal, and "the one matching" would then be
order-dependent — which breaks the byte-stability the artifact promises. The contract: candidates are
ordered by `conname` ascending and the first is recorded, so the choice is total and reproducible; and
the auditor additionally emits a `duplicate_canonical` finding naming the column and every candidate,
because two canonical nonblank CHECKs on one column is redundant DDL someone should collapse rather
than a state to normalize silently.

The local-DB guard suite (§0) then asserts:

- **Freshness:** re-introspect local, assert byte-equality with the committed artifact.
- **Coverage:** feed live introspection to `auditDriveIdCoverage`, assert `[]`.
- **Anchors (vacuous-green defense):** the census must contain `public.shows.drive_file_id`,
  `public.shows.opening_reel_drive_file_id`, and `dev.shows.drive_file_id`, and its count of
  DISTINCT `(schema, table, column)` keys must be ≥ 23.
- Routes `LOCAL_TEST_DATABASE_URL` through `assertLocalDbUrl` (`tests/db/_localDbUrl.ts`), which the
  structural half of `tests/db/_metaLocalDbUrlGuard.test.ts` requires of every `tests/db/` file that
  reads that variable (AST scan keyed on `LOCAL_TEST_DATABASE_URL`, `tests/db/_localDbUrlScan.ts:29`).

**The shared-blind-spot problem is real and only partly mitigated** (R2 finding 6). The previous draft
claimed the coverage assertion catches a narrowed census query. It does not: coverage is computed from
the *same* narrowed result, so a column the query stopped returning is simply absent from both sides —
freshness matches, anchors match, coverage is vacuously satisfied for a row nobody looked at. Once the
census legitimately grows past 23, a regression dropping one unanchored column regenerates a
same-shaped artifact and every assertion passes.

Two mitigations, and then the residue:

- **An independent second predicate.** The layer separately counts columns matching the deliberately
  broader `~ 'drive'` over the same schemas and base tables, and asserts that every column matched by
  the narrow predicate is also matched by the broad one, and that the broad count has not *dropped*
  relative to the artifact's recorded `broadCount`. A regression that narrows the primary predicate
  moves the two counts apart, which is detectable even though neither count alone is.
- **The hardcoded floor in Layer 1** (§4.4) bounds how far the census can shrink before a human must
  edit a test.

**Residue, recorded in §10:** neither mitigation catches a regression that drops a column matching
*both* predicates while the artifact is regenerated in the same commit. Nothing short of comparing
against an independently-derived source of truth would, and the census IS the source of truth here.
What remains is that the shrink appears in the artifact diff as a deleted row.

### 4.6 Layer 3 — validation-project coverage

**The gap here is narrower than "validation is unchecked," and the original spec overstated it.**
Two mechanisms must be told apart:

- `supabase/__generated__/schema-manifest.json` records tables and columns ONLY —
  `INTROSPECT_PUBLIC_COLUMNS_SQL` selects `c.table_name, c.column_name` and nothing else
  (`scripts/schema-manifest/lib.ts:238-246`). A constraint-only migration adds no column, so the
  manifest does not move and the manifest-driven layers cannot see this migration at all.
  `pnpm gen:schema-manifest --check` is therefore expected to report "fresh" after this change; §8
  asserts that rather than assuming it.
- A sibling test in the same file, `tests/db/validation-schema-parity.test.ts:223-285`, DOES check
  constraints: it parses `20260702120200_drive_file_id_nonblank.sql` for
  `alter table public.<t> add constraint <name> check` (`tests/db/validation-schema-parity.test.ts:230`), pins the parse at exactly 14 names
  (`tests/db/validation-schema-parity.test.ts:237`), and asserts the validation project's `pg_constraint` is a superset (`tests/db/validation-schema-parity.test.ts:277-284`).

So validation CHECK parity is **not** unguarded today — it is guarded for ONE file by a
hand-maintained count whose own comment says it "must move in lockstep with any deliberate count
change." That literal is an instance of the drift this change exists to remove, and it is exactly the
failure that left `onboarding_rebuild_attempts` uncovered for 16 days.

**Layer 3 therefore generalizes that test rather than adding a second overlapping mechanism.** Its
expectation comes from the census artifact instead of a hardcoded file plus a literal. The assertion's
shape — validation must be a superset, missing entries listed in the failure message — and its
`TEST_DATABASE_URL` postures are preserved. Because the existing assertion is a superset check, the new
constraints do **not** break it as it stands; this is a deliberate generalization, not a repair.

**What is compared: tuples and definitions, never bare names** (R2 finding 2). The previous draft said
"the public rows' constraint names," which silently abandoned this spec's own coverage contract.
Constraint names are unique per TABLE, not per schema (§3.1.3, measured), so a name-only superset check
is satisfied when validation carries that name **on a different table**, or carries it on the right
table with a **weaker predicate**. Layer 3 therefore introspects validation exactly as Layer 2
introspects local — `(schema, table, column)` plus `pg_get_constraintdef` — and asserts that for every
public census row, validation has a constraint on that same tuple whose definition matches a
self-calibrated canonical form (§4.2). Calibration is performed against the validation server, so a
deparser difference between the two servers cannot masquerade as missing coverage.

**Target identity binding** (R2 finding 1). The previous draft named
`assertSupabaseTargetMatchesProjectRef` (`scripts/lib/validation-target.ts:84-133`), which is the wrong
tool: it validates an **HTTPS Supabase API URL** against a project ref, and rejects anything that is not
`https://<ref>.supabase.{co,in}`. `TEST_DATABASE_URL` is a Postgres **session-pooler DSN**, so that
helper would reject every legitimate value — and dropping the check entirely is what lets a DSN aimed
at local, prod, a branch preview, or another clone pass while validation stays stale.

The binding that actually fits the input: a Supabase session-pooler DSN carries the project ref in its
**username**, as `postgres.<project-ref>`. Verified on this machine's configured value (shape only, no
secret):

```
scheme postgresql · user postgres.vzakgrxqwcalbmagufjh · host aws-1-us-east-2.pooler.supabase.com · port 5432 · db postgres
```

Layer 3 parses the username, requires the `postgres.<ref>` shape, requires the host to be a
`*.pooler.supabase.com` endpoint, and requires `<ref>` to equal the expected validation project ref —
`vzakgrxqwcalbmagufjh`, the persistent validation project this repo has used since Phase 0 and which
`AGENTS.md` names. A local loopback DSN has no ref in its username and fails the shape check; a
different project's pooler DSN carries a different ref and fails the equality check. The expected ref
is a constant in the test, not read from the same environment that supplies the DSN, so a single
mis-set variable cannot move both sides together.

**Skip-versus-fallback, resolved explicitly** (the original spec contradicted itself here):

| `TEST_DATABASE_URL` | Layer 3 behavior |
| ------------------- | ---------------- |
| unset | **SKIP** with a reported reason. Local development; there is no validation target, and silently auditing local would be a green that proves nothing. |
| set, empty/whitespace | **FAIL** — a GitHub Actions secret registered with an empty value, the existing posture at `tests/db/validation-schema-parity.test.ts:243-249`. |
| set, unreachable | **FAIL** — never a skip. Matches `tests/db/validation-schema-parity.test.ts:250-255`. |
| set, reachable, username/host/ref binding fails | **FAIL** — wrong target, named in the message. |
| set, reachable, binding confirmed | Audit: every public census tuple must carry a canonical-form constraint live. |

There is deliberately **no** local fallback. Auditing local here would compare local against a census
generated from local — trivially green, and indistinguishable in the logs from a real validation pass.

Wiring: the generalized test stays in the existing `validation-schema-parity` job, which already
installs `psql`, holds the secret, and carries the "did the migration reach validation" mandate
(`.github/workflows/x-audits.yml:313-346`).

### 4.7 Behavioral proof (anti-tautology split)

Introspection proves a constraint is **declared**. It does not prove the predicate **behaves** — and
per §4.2's limits, definition equality is explicitly not a correctness proof.

**How much behavioral proof actually exists today, corrected** (R2 finding 9). The previous draft said
`tests/db/driveFileIdNonblank.db.test.ts` "carries the behavioral half for the original 14." It does
not. That file holds **three** execution probes — `agenda_extract_leases`, `shows`, and `app_events`
(`tests/db/driveFileIdNonblank.db.test.ts:97-133`) — plus a fourth test that checks only that 14
constraint **names** exist (`tests/db/driveFileIdNonblank.db.test.ts:136-147`), which is declaration, not behavior. So 3 of 19 constrained
columns have execution proof today; after this change, 7 of 23. That is a deliberate sampling of the
class — one NOT NULL, one nullable, one lease table, plus every column this spec touches — not full
coverage, and §10 states it as such rather than implying the class is behaviorally proven.

The file gains probes for the four new columns:
each rejects `""`, `"   "`, and `"\t"` with SQLSTATE `23514`, and accepts a valid id. Every probe runs
inside a transaction that is always rolled back (by the 23514 abort or by a sentinel throw), leaving
zero residue — the existing `expectRejected` / `expectAccepted` helpers already enforce this.

That file also hardcodes `expect(PUBLIC_NONBLANK_TABLES.length).toBe(14)` (`tests/db/driveFileIdNonblank.db.test.ts:147`) over a list used to
assert every `%_drive_file_id_nonblank` constraint exists. `onboarding_rebuild_attempts` is a 15th
public table in that class, so the list and the literal both move to 15 — another hand-maintained
count in the same drift family.

U3 and U4 need insert shapes satisfying their NOT NULL siblings and composite PKs; the plan pins the
exact shape for each from the live table definitions rather than guessing.

---

## 5. Guard conditions (per input, per the spec self-review checklist)

| input | empty | malformed | absent / unset |
| ----- | ----- | --------- | -------------- |
| `columns` census | `[]` → the anchor assertion fails loudly (§4.5); never a silent pass | duplicate `(schema,table,column)` key → `duplicate_column`, so a duplicate can never satisfy the ≥ 23 floor | — |
| `constraints` | `[]` → every column reports `uncovered` (correct) | definition not string-equal to either self-calibrated canonical form → `uncovered` (correct; §4.2) | a column with several CHECKs records the canonical one, else `null` → `uncovered` |
| `exemptions` | `[]` → the shipping state; auditor returns `[]` when all columns are covered | `reason` empty/whitespace → `empty_reason`; duplicate key → `duplicate_exemption` | row naming an absent column → `stale_exemption/column_absent` |
| committed census artifact | valid JSON `[]` → **fails** the Layer 1 shape contract (non-empty required) | wrong shape, missing field, wrong type, duplicate key, `schema` outside `{public,dev}`, constraint name > 63 bytes → each fails Layer 1 | missing file or unparseable JSON → Layer 1 and Layer 2 both fail; never coerced to `[]` or `{}` |
| `LOCAL_TEST_DATABASE_URL` | set-but-empty → `assertLocalDbUrl` refuses (unparseable) | non-loopback host → refused by `assertLocalDbUrl` | unset → loopback default; unreachable → Layer 2 **skips** (and §10 records the cost) |
| `TEST_DATABASE_URL` | set-but-empty → **FAIL** (mis-registered CI secret) | reachable but identity check fails → **FAIL** (wrong project; §4.6) | unset → Layer 3 **SKIPS** with a reported reason. There is no local fallback — auditing local against a census generated from local is trivially green (§4.6) |
| live server deparser output | — | renders differently after a Postgres upgrade → self-calibration moves the expectation with it (§4.2 limit 2) | `search_path` pinned to `pg_catalog, public` so the rendering is taken under a known resolution order (§4.2 limit 1) |

---

## 6. Self-consistency sweep

Shared values are defined once and referenced, not restated:

- **The predicate** `~ '[^[:space:]]'` appears in exactly two places: the migration SQL, and a single exported constant used to construct both canonical definition strings in §4.2. No test re-spells it inline.
- **23** — the census size as of 2026-07-25 — appears in §2 (17 public + 6 dev), §4.5's `>= 23` anchor floor, and AC-4. It is a **floor**, not an equality: a future migration adding a covered Drive-ID column must not fail this assertion. The exact set lives in the committed artifact, which is the normative record.
- **19 covered / 4 uncovered** in §2 sums to 23. After §3 lands: 23 covered, 0 uncovered, 0 exemptions.
- **63 bytes** — the Postgres identifier limit (`NAMEDATALEN - 1`) — appears in §1.1 item 2, §3, §3.1, and §4.4, always as the same limit.
- **65 bytes** — the conventional-but-too-long U3 name — appears only in §1.1 item 2 and §3.1, both citing the same `wc -c` measurement.
- **Four constraint names** are stated once each in §3's table and referenced nowhere else by literal; §3.1 restates only U3's, as the subject of that section.
- **14** appears only as a quotation of the EXISTING hardcoded literals being removed — `tests/db/validation-schema-parity.test.ts:237` (§1.1 item 6, §4.6) and `tests/db/driveFileIdNonblank.db.test.ts:147` (§4.7, AC-14). It is never this spec's own count. **15** is the post-change public exactly-named count, in §4.7 and AC-14 only.
- **Acceptance criteria run AC-1 … AC-18** with no gaps and no duplicates; AC-5's scope was narrowed (not deleted) when the SQL parser was removed in §4.0, and §10 item 1 carries what it no longer claims.
- **Behavioral-probe counts** appear as `3 of 19` (today) and `7 of 23` (after this change) in §4.7 and §10 item 4, and nowhere else.
- **8 / 16 / 4** — statements per pass, results across two passes, and first-pass NOTICEs — appear only in §3.1.2, all from the one measurement.
- **The predicate** `~ '[^[:space:]]'` is spelled in the migration (§3) and in §4.2's two canonical renderings, which §4.2 additionally derives at runtime by self-calibration rather than hardcoding — so the two spellings cannot drift apart silently.

**Artifact-mutation rule (from that same arc — a later edit to a normative artifact must update the spec and any recorded proof):** the census artifact (§0) is normative. Any later edit to it must be accompanied by the migration that justifies it; the Layer 1 tripwire and Layer 2 byte-equality check are what make a hand-edit fail rather than stick.

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

Scope of that measurement, stated honestly: it was taken on the local UTF8 stack. `[:space:]` remains locale-dependent in principle, so a target with a different `lc_ctype` could classify differently. The behavioral probes in §4.7 therefore assert only the ASCII cases (`""`, `"   "`, `"\t"`) — the set the parent migration committed to and the set that cannot vary — and this section records the Unicode result as a local measurement rather than a cross-target guarantee.
- **Extending the guard to other column classes** (`slug`, `share_token`, …). The mechanism generalizes; applying it elsewhere is a separate change with its own census.
- **Touching `assertNonEmptyDriveFileId`** (`lib/drive/fetch.ts:145`) or any JS write path. This is DB-layer defense-in-depth only; no application behavior changes.

---

## 8. Migration post-checklist (AGENTS.md cross-cutting rule)

Lands in the same PR as `supabase/migrations/**`:

1. Apply locally + test (TDD invariant 1 already requires this).
2. `pnpm gen:schema-manifest` — **expected to be a no-op** for a constraint-only migration (§4.6). The plan runs `pnpm gen:schema-manifest --check` and asserts "fresh", so the expectation is verified rather than assumed. If it *does* change, that is a signal something unintended landed and the run stops.
3. `pnpm gen:drive-id-coverage` and commit the census artifact (§0).
4. Apply surgically to the validation project — `supabase db query --linked "<SQL>"` (or `psql "$TEST_DATABASE_URL" -f …`), then `notify pgrst, 'reload schema';`. Public schema only; `dev.*` is local-seed infrastructure, not a deploy target, and the migration's `alter table if exists` makes the dev block a no-op there.
5. Verify Layer 3 green against validation before pushing.

---

## 9. Acceptance criteria

- **AC-1** The migration (§0) adds all four constraints from §3, wrapped in a single `begin; … commit;`, apply-twice safe, dev block guarded by `alter table if exists`.
- **AC-2** All four columns reject `""`, `"   "`, `"\t"` with SQLSTATE 23514 and accept a valid id, proven behaviorally against local Postgres, with zero row residue.
- **AC-3** `auditDriveIdCoverage` is a pure function with unit tests covering every branch in §4.4, including the false-coverage traps (name matches but definition differs; same column name on a different table; **same constraint NAME on a different table in the same schema**, per §3.1.3) and the duplicate-key and `duplicate_canonical` findings.
- **AC-4** The census artifact (§0) is committed, byte-stable, and contains all 23 census rows keyed uniquely on `(schema, table, column)`, each with the constraint that establishes its coverage.
- **AC-5** Layer 1 fails on every artifact-shape violation in §4.4: missing file, unparseable JSON, valid-but-empty array, missing/wrong-typed field, duplicate key, schema outside `{public, dev}`, constraint name > 63 bytes. It additionally fails a TRUNCATED artifact via the test-hardcoded required-tuple set and ≥ 23 distinct-key floor, neither derived from the artifact. **Layer 1 makes no claim to detect a newly-added column** — see §10.
- **AC-6** Layer 2 fails when the local DB and the committed census disagree; its anchor assertion fails on an empty or short census; its size floor counts DISTINCT keys.
- **AC-7** Layer 3 audits the validation project only after confirming target identity from the pooler DSN (`postgres.<ref>` username, `*.pooler.supabase.com` host, `<ref>` equal to a test-constant project ref), compares `(schema, table, column)` tuples against self-calibrated canonical definitions rather than bare constraint names, and FAILS (never skips) on set-but-empty, unreachable, or binding failure; it SKIPS with a reported reason only when `TEST_DATABASE_URL` is unset.
- **AC-8** The exemption list ships empty, and each of its four rules has a failing-input unit test.
- **AC-9** `BL-OPENING-REEL-DRIVE-ID-NONBLANK` and `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` move whole to `BACKLOG-archive.md` with provenance (ids unchanged), and the U4 drift finding is recorded there as part of the closure rather than filed as a new open item.
- **AC-10** `pnpm gen:schema-manifest --check` reports the manifest fresh (no column change), and the migration is applied to the validation project.
- **AC-11** Every `add constraint <name>` anywhere in `supabase/migrations/` is ≤ 63 bytes, pinned by a test that walks the whole directory (§3.1, §4.4) — not just the nonblank migrations.
- **AC-12** The migration applies cleanly to the local DB despite the `no_global_cursor_columns` `ddl_command_end` event trigger re-scanning `public` on every statement (§3.1.1), and adds no `_allowed_watermark_columns` row.
- **AC-13** `tests/db/validation-schema-parity.test.ts`'s CHECK-parity test is driven by the census artifact rather than by `20260702120200_drive_file_id_nonblank.sql` plus the literal `14`, retains a non-vacuity floor that does NOT come from the artifact alone (§4.4), and retains its documented `TEST_DATABASE_URL` postures.
- **AC-14** `tests/db/driveFileIdNonblank.db.test.ts`'s public list and its length assertion cover all 15 public columns named exactly `drive_file_id` (was 14), including `onboarding_rebuild_attempts`.
- **AC-15** The census predicate is the POSIX-regex form (`~ 'drive_file_id'`), never `LIKE`, and is restricted to `BASE TABLE` relations; a test pins that `driveXfileYid` is NOT in scope.
- **AC-16** Self-calibration derives BOTH canonical forms from two distinct calibrator tuples (§4.2), and FAILS — never falls back to a hardcoded string — when a calibrator is absent, ambiguous, or renders unexpectedly.
- **AC-17** All introspection runs inside one explicit transaction on one connection with `set local search_path = pg_catalog, public`, and asserts `current_setting('search_path')` inside that transaction before trusting any rendering.
- **AC-18** The census records a `broadCount` from the independent `~ 'drive'` predicate; Layer 2 fails if any narrow-predicate column is absent from the broad set, or if `broadCount` has shrunk relative to the artifact.

---

## 10. Known limitations (what this guard does NOT guarantee)

Stated because R1 showed the original draft's claims outran its mechanism. Each item is a deliberate
acceptance, not an oversight.

1. **A new Drive-ID column can merge uncovered if nobody runs the DB-backed layers.** Layer 1 is the
   only layer that runs everywhere, and after §4.0 it cannot discover columns — that needs a database.
   CI has **no Postgres service** (verified: no `services:` block in any workflow), so Layer 2 never
   runs there. The practical mitigation is that Layer 2 runs in the standard `pnpm test` path for
   anyone with a local stack — including the pre-push gate this repo's ship pipeline runs — and that
   any migration author necessarily has one, since applying and testing a migration locally is already
   required by TDD invariant 1. It is a real hole, and closing it properly means giving CI a database.
2. **None of these checks BLOCK a merge.** Only `quality` is a required status check on `main`; the
   `x-audits` jobs — including `validation-schema-parity`, where Layer 3 lives — are advisory by an
   explicit 2026-06-22 owner decision recorded in `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md`
   (minimal branch protection re-added requiring `quality` only; audit checks deliberately left out of
   the required set). A red Layer 3 surfaces in the PR UI and does not stop the merge. R1 finding 3
   raised this; it is accurate and is a property of the repo's protection posture, not of this design.
3. **An exemption row can silence the guard permanently.** The four rules in §4.3 catch stale and
   malformed rows, not unjustified ones. Nothing mechanical can distinguish "this column legitimately
   cannot carry a scalar nonblank CHECK" from "I wanted the gate green." The list ships empty and every
   future row lands in a reviewable diff; that is the whole control.
4. **Definition equality is not a correctness proof, and behavioral proof is a SAMPLE.** §4.2's limits:
   the deparser renders what is visible under `search_path` (pinned inside an explicit transaction, but
   a sufficiently privileged actor controls the schema anyway), and the rendering is version-dependent
   (mitigated by two-form self-calibration). Execution is the only proof a predicate rejects blanks, and
   §4.7 measures that **7 of 23** constrained columns will carry an execution probe after this change —
   up from 3 of 19, and deliberately not all of them. The remaining 16 are covered by declaration only.
6. **A census-query regression that is regenerated in the same commit is invisible.** §4.5 adds a broad
   second predicate and a non-shrinking `broadCount`, and §4.4 adds a hardcoded floor, but a change that
   drops a column matching *both* predicates while regenerating the artifact leaves every assertion
   green. The deleted row is visible in the artifact diff; that is the only control.
5. **Schema scope is an allowlist that a new repo-owned schema would escape.** The census covers
   `public` and `dev`. The migration-side pin that would have caught a third repo-owned schema died with
   the SQL parser (§4.0). A migration creating tables in a new schema would put them outside the census
   silently until someone widened it.
