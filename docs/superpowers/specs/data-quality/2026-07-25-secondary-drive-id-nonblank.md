# Secondary-name Drive-ID nonblank CHECKs + a fail-by-default coverage guard

**Date:** 2026-07-25 · **Branch:** `fix/secondary-drive-id-nonblank` · **Class:** DEFENSE-IN-DEPTH + STRUCTURAL GUARD

Parent spec: `docs/superpowers/specs/data-quality/2026-07-02-empty-drive-file-id-check-design.md` (the primary `drive_file_id` nonblank CHECK work; §9 is where the two backlog items below were deferred).

Closes `BL-OPENING-REEL-DRIVE-ID-NONBLANK` and `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` (`BACKLOG.md`, the two entries under the shared 2026-07-02 heading).

---

## 0. Files this spec creates

These do not exist yet, so citations to them cannot resolve; the waiver below covers that.

<!-- spec-lint: ignore — these four paths are CREATED by this spec, so they are not in the tracked set at spec time -->
```
supabase/migrations/20260725000000_secondary_drive_id_nonblank.sql   "the migration"
supabase/__generated__/drive-id-coverage.json                        "the census artifact"
tests/db/driveIdCoverage.test.ts                                     "the DB-free guard suite"
tests/db/driveIdCoverage.db.test.ts                                  "the local-DB guard suite"
```

The quoted short names are used throughout the rest of this document instead of repeating the paths, so the paths have exactly one definition site.

---

## 1.1 Resolved scope — do not relitigate

Each of these is decided. Verify the citation; do not re-derive the decision.

1. **Coverage is decided by the constraint DEFINITION, never by its name.** §4.2. This is not an oversight in the naming convention — it is the reason a hand-edited `…_nonblank` constraint cannot fake coverage. Ratified by a prior review arc on this repo that spent 7 rounds on a text-normalizing predicate comparison: the normalizer equated 11 operator families that are not equivalent, and the same defect then reappeared in the sibling comparison path. The durable rule taken from it: never compare SQL predicates as normalized text — compare against a canonical rendering the database itself produced.
2. **`wizard_finalize_checkpoints`'s constraint deliberately breaks the `<table>_<column>_nonblank` convention.** The conventional name is **65 bytes**, past Postgres's 63-byte identifier limit, and would be silently truncated. Measured, not assumed (§3.1). The chosen name is `wizard_finalize_checkpoints_cursor_nonblank` (43 bytes). Because coverage is definition-based (item 1), the deviation costs nothing.
3. **Both canonical CHECK forms are accepted for a column of either nullability.** §3, §4.2. A CHECK fails only on FALSE and `NULL ~ '…'` is NULL, so the bare form and the `is null or …` form are behaviorally identical. Requiring the stylistically-matching form would produce false failures with no safety gain.
4. **`public.onboarding_rebuild_attempts.drive_file_id` (U4) is in scope even though no backlog item covers it.** It is a column named *exactly* `drive_file_id` — inside the ORIGINAL 2026-07-02 scope rule — created 16 days after that migration and never covered (§2.2, verified live §2). Landing the guard without landing U4's CHECK would ship a red gate. This is not scope creep; it is the first thing the guard found.
5. **The exemption list ships EMPTY and that is correct.** §4.3. It is not a zombie flag: all three of its rules are exercised by synthetic-input unit tests (§4.4, AC-8), and the two stale-row rules are what stop an empty list from silently becoming a permanent blindfold later.
6. **Layer 3 (validation) is not redundant with the existing `validation-schema-parity` gate.** That gate's manifest records tables and columns ONLY (`scripts/schema-manifest/lib.ts:238-246`), so a constraint-only migration cannot move it. §4.6. This is the specific hole Layer 3 exists to close.
7. **The census scans `public` + `dev` only, enforced by a pin rather than a vendor blocklist.** §4.4. Vendor schemas (`auth`, `storage`, `realtime`, …) cannot receive our constraints; a blocklist of them would go stale the moment Supabase adds a schema. The migration-side pin on repo-owned schemas is the fail-by-default form.
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

Census query — `information_schema.columns where column_name like '%drive_file_id%'`, all schemas:

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
- **U3** — a cursor copy of a `drive_file_id` already covered by the primary CHECK. A blank cannot originate here. Severity: low.
- **U4** — written at `app/api/admin/onboarding/resolve-blocker/route.ts:267-272` from the route's `driveFileId`, and it is **half of a composite primary key** (`primary key (wizard_session_id, drive_file_id)`, `20260718000000:10`). A blank would not be rejected by the PK (blank is a legal distinct value), so a blank here silently creates a real row keyed on nothing. Severity: low-to-medium, and strictly higher than U1/U3 — this is the one that was genuinely *missed* rather than deliberately deferred.

---

## 3. Write scope — the migration

The migration (§0) follows the exact shape of `20260702120200_drive_file_id_nonblank.sql`:

- **Predicate:** `~ '[^[:space:]]'` — "contains at least one non-whitespace character", the faithful SQL translation of the JS `/\S/` guard. `btrim(x) <> ''` is wrong here: `btrim` strips only ASCII space U+0020, so it would wrongly ACCEPT a tab-only or newline-only value.
- **NULLABLE columns** (U1, U2, U3) use the explicit `is null or …` form; the **NOT NULL** column (U4) uses the bare regex form. (Both forms are behaviorally identical with respect to NULL — a CHECK fails only on FALSE, and `NULL ~ '…'` is NULL — but matching the parent migration's stylistic convention keeps the two files readable side by side.)
- **Apply-twice safe:** every constraint is `drop constraint if exists` then `add constraint`, per row.
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
| RPC read path | N/A — no RPC reads this column | N/A | N/A | N/A — read over the privileged postgres-js connection at `app/api/admin/onboarding/resolve-blocker/route.ts:224` and `app/api/admin/onboarding/finalize-cas/route.ts:107`, not PostgREST |
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

### 4.1 Shape: a pure auditor + three layers

The guard is one pure function plus three layers that feed it from different sources. The pure function is what gets unit-tested exhaustively; the layers are thin.

```ts
// scripts/schema-manifest/driveIdCoverage.ts  (or a sibling module)
export type DriveIdColumn = { schema: string; table: string; column: string; nullable: boolean };
export type DriveIdConstraint = { schema: string; table: string; name: string; definition: string };
export type CoverageExemption = { schema: string; table: string; column: string; reason: string };

export type CoverageFinding =
  | { kind: "uncovered"; column: DriveIdColumn }
  | { kind: "stale_exemption"; exemption: CoverageExemption; why: "now_covered" | "column_absent" }
  | { kind: "empty_reason"; exemption: CoverageExemption };

export function auditDriveIdCoverage(
  columns: DriveIdColumn[],
  constraints: DriveIdConstraint[],
  exemptions: CoverageExemption[],
): CoverageFinding[];
```

A run is green iff `auditDriveIdCoverage(...)` returns `[]`.

### 4.2 What "covered" means — canonical-definition equality, never text matching

A column is **covered** iff the constraint list contains, for that exact `(schema, table)`, a constraint whose `pg_get_constraintdef(oid)` is **string-equal** to one of the two canonical renderings Postgres produces for that column:

```
CHECK ((<column> ~ '[^[:space:]]'::text))
CHECK (((<column> IS NULL) OR (<column> ~ '[^[:space:]]'::text)))
```

Both forms are accepted for a column of either nullability, because they are behaviorally identical on NULL (§3). Coverage is decided by the **definition**, never by the constraint's name — a constraint named `…_nonblank` whose body was edited to something weaker must not count as coverage.

This is deliberately **equality against a rendering Postgres itself produced**, not a regex over an arbitrary predicate. A prior 7-round review arc on this repo landed on exactly this mistake: a normalizing text comparison over predicates equates operator families that are not equivalent (see §1.1 item 1). Postgres's `pg_get_constraintdef` output is canonical and deterministic for a given expression, so equality against a constructed expected string is sound where a fuzzy match is not.

Consequence, accepted deliberately: a semantically-equivalent but differently-written CHECK (e.g. `char_length(btrim(col)) > 0`) does not count as coverage. It must either be rewritten to the canonical form or carry an exemption row. The guard's job is to make the *canonical* shape the only silent path.

Second consequence: the canonical string embeds an explicit cast to text. A non-text column (say `drive_file_id_count int`) can never match, so it necessarily requires an exemption row. That is the intended behavior — a new column matching the name pattern should force a human decision, not be silently classified.

### 4.3 The exemption list

```ts
export const DRIVE_ID_COVERAGE_EXEMPTIONS: CoverageExemption[] = [];
```

Ships **empty**: after §3 lands, every one of the 23 census columns is covered. The mechanism still exists because the *next* Drive-ID column may legitimately not want a scalar nonblank CHECK, and the alternative to an exemption row is an untracked failing gate.

Three rules, each enforced by the auditor and each with its own unit test (§4.4):

1. **Non-empty reason.** An exemption whose `reason` is empty or whitespace-only yields `empty_reason` — the row must say *why*, in the file, next to the exemption.
2. **No stale rows — now-covered.** An exemption for a column that *is* covered yields `stale_exemption/now_covered`. Without this, an exemption added during a gap survives the repair and permanently blinds the guard for that column.
3. **No stale rows — column absent.** An exemption naming a column not in the census yields `stale_exemption/column_absent`. A dropped or renamed column must not leave a live exemption behind.

Rules 2 and 3 are what keep an empty list from becoming a growth medium. They are also the answer to "is an empty list a zombie flag?" — the mechanism is proven by §4.4's synthetic-input tests, which exercise every branch without needing a production row.

### 4.4 Layer 1 — DB-free (always runs, including CI)

The DB-free guard suite (§0; no DB, runs in the unit suite):

- **Auditor unit tests** over synthetic inputs, one per branch: covered-NOT-NULL, covered-NULLABLE, covered-by-the-other-canonical-form, uncovered, name-matches-but-definition-differs (must be **uncovered**), exempted-with-reason (green), exempted-with-empty-reason, exempted-but-now-covered, exempted-column-absent, constraint-on-a-different-table-with-the-same-column-name (must **not** count as coverage).
- **Migration tripwire.** Parse every file in `supabase/migrations/` for columns whose name matches `%drive_file_id%`, introduced by either `create table <schema>.<t> ( … )` or `alter table <schema>.<t> add column … `, and assert each appears in the committed census artifact (§4.5). This is the layer that catches "new column, census regen skipped" in CI where no local stack exists — the same role Layer 1 of `validation-schema-parity` plays for the schema manifest (`tests/db/validation-schema-parity.test.ts:14-24`).
- **Repo-owned-schema pin.** Assert the set of schemas the migrations create tables in is exactly `{public, dev}`. The census (§4.5) scans those two schemas; a migration introducing a third repo-owned schema must fail here and force the census scope to be widened, rather than silently creating an unscanned region. Vendor schemas (`auth`, `storage`, `realtime`, …) are out of scope by construction — we cannot add constraints there — and are excluded by scanning repo-owned schemas rather than by maintaining a blocklist that would go stale when Supabase adds a schema.
- **Identifier-length pin.** Parse every `add constraint <name>` in the nonblank migrations and assert each `<name>` is ≤ 63 bytes — i.e. that the name written in the source is the name Postgres will store, with no silent truncation (§3.1). This pins names as *declared*, not names *derived* from table+column: no test derives an expected name from a column, because coverage is definition-based (§1.1 item 1).

### 4.5 Layer 2 — local DB freshness + coverage (skips when local Postgres is unreachable)

The census is a **committed normative artifact** — the census artifact (§0), generated by `pnpm gen:drive-id-coverage` from the local all-migrations-applied database. It records, per row, `{schema, table, column, nullable, constraint}` — sorted deterministically, serialized byte-stably, exactly as `scripts/generate-schema-manifest.ts` does for the schema manifest.

The local-DB guard suite (§0):

- Re-introspect local; assert byte-equality with the committed artifact (freshness — the manifest gate's Layer 3 pattern).
- Feed the live introspection to `auditDriveIdCoverage`; assert `[]`.
- **Anchor assertion (vacuous-green defense):** assert the census contains a fixed set of columns known to exist — at minimum `public.shows.drive_file_id`, `public.shows.opening_reel_drive_file_id`, `dev.shows.drive_file_id` — and that its total size is ≥ 23. A census that came back empty because the query targeted the wrong database, or because a `like` pattern was mistyped, would otherwise pass every assertion above trivially. This is the anti-tautology requirement applied to a guard whose natural failure mode is "found nothing, therefore nothing is wrong."
- Loopback-guarded via `assertLocalDbUrl` (`tests/db/_localDbUrl.ts`) — this suite reads `LOCAL_TEST_DATABASE_URL`, and that helper refuses a non-loopback host.

### 4.6 Layer 3 — validation-project coverage (runs in CI's `validation-schema-parity` job)

**This layer is the reason the guard exists in this form.** `supabase/__generated__/schema-manifest.json` records tables and columns only — `INTROSPECT_PUBLIC_COLUMNS_SQL` selects `c.table_name, c.column_name` and nothing else (`scripts/schema-manifest/lib.ts:238-246`). A constraint-only migration adds no column, so the manifest does not change, so **the existing `validation-schema-parity` gate cannot detect that this migration was never applied to the validation project.** Verified: `pnpm gen:schema-manifest --check` is expected to report the manifest fresh *after* this migration lands, and the plan asserts that rather than assuming it.

Layer 3 closes that hole for this column class: when `TEST_DATABASE_URL` is set (CI's `validation-schema-parity` job supplies the validation session-pooler URL, `.github/workflows/x-audits.yml:336`), introspect **`public` only** — the validation project has no `dev` clone — and assert every public census row is covered live. A forgotten `supabase db query --linked` apply then fails the gate.

Wiring: extend `test:audit:validation-schema-parity` (`package.json:42`) to include the new file. No new workflow job — the existing job already installs `psql`, already holds the secret, and already carries the "did the migration reach validation" mandate.

Read-only by construction: Layer 3 issues `select` against `information_schema` and `pg_constraint` and nothing else. It therefore does **not** use `assertLocalDbUrl` (which exists to stop *mutating* suites from reaching a remote host); it mirrors `tests/db/postgrest-dml-lockdown.test.ts`'s env handling, including the set-but-empty → loud mis-config error.

### 4.7 Behavioral proof (anti-tautology split)

Introspection proves the constraint is **declared**. It does not prove the predicate **behaves**. `tests/db/driveFileIdNonblank.db.test.ts` already carries that half for the original 14; it gains probes for the four new columns: each rejects `""`, `"   "`, and `"\t"` with SQLSTATE `23514`, and accepts a valid id. Every probe runs inside a transaction that is always rolled back (by the 23514 abort or by a sentinel throw), leaving zero residue — the existing `expectRejected` / `expectAccepted` helpers already enforce this.

U3 and U4 need insert shapes that satisfy their NOT NULL siblings and composite PKs; the plan pins the exact shape for each from the live table definitions rather than guessing.

---

## 5. Guard conditions (per input, per the spec self-review checklist)

| input | null | empty | malformed | absent |
| ----- | ---- | ----- | --------- | ------ |
| `columns` census | n/a | `[]` → anchor assertion fails loudly (§4.5), never a silent pass | n/a | n/a |
| `constraints` | n/a | `[]` → every column reports `uncovered` (correct) | definition string not matching either canonical form → `uncovered` (correct — see §4.2) | n/a |
| `exemptions` | n/a | `[]` → the shipping state; auditor returns `[]` when all columns covered | `reason: ""` / whitespace → `empty_reason` | n/a |
| `LOCAL_TEST_DATABASE_URL` | unset → loopback default | set-but-empty → `assertLocalDbUrl` throws on unparseable | non-loopback host → refused | — |
| `TEST_DATABASE_URL` | unset → Layer 3 falls back to local (trivially passing; the meaningful run is CI) | set-but-empty → loud mis-config error | — | — |
| committed census artifact | — | missing file → treated as drift, Layer 1 and Layer 2 both fail | unparseable JSON → test fails loudly, never coerced to `{}` | — |

---

## 6. Self-consistency sweep

Shared values are defined once and referenced, not restated:

- **The predicate** `~ '[^[:space:]]'` appears in exactly two places: the migration SQL, and a single exported constant used to construct both canonical definition strings in §4.2. No test re-spells it inline.
- **23** — the census size as of 2026-07-25 — appears in §2 (17 public + 6 dev), §4.5's `>= 23` anchor floor, and AC-4. It is a **floor**, not an equality: a future migration adding a covered Drive-ID column must not fail this assertion. The exact set lives in the committed artifact, which is the normative record.
- **19 covered / 4 uncovered** in §2 sums to 23. After §3 lands: 23 covered, 0 uncovered, 0 exemptions.
- **63 bytes** — the Postgres identifier limit (`NAMEDATALEN - 1`) — appears in §1.1 item 2, §3, §3.1, and §4.4, always as the same limit.
- **65 bytes** — the conventional-but-too-long U3 name — appears only in §1.1 item 2 and §3.1, both citing the same `wc -c` measurement.
- **Four constraint names** are stated once each in §3's table and referenced nowhere else by literal; §3.1 restates only U3's, as the subject of that section.

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

- **AC-1** The migration (§0) adds all four constraints from §3, apply-twice safe, dev block guarded by `if exists`.
- **AC-2** All four columns reject `""`, `"   "`, `"\t"` with SQLSTATE 23514 and accept a valid id, proven behaviorally against local Postgres, with zero row residue.
- **AC-3** `auditDriveIdCoverage` is a pure function with unit tests covering every branch in §4.4, including the two false-coverage traps (name matches but definition differs; same column name on a different table).
- **AC-4** The census artifact (§0) is committed, byte-stable, and contains all 23 census rows, each with a constraint name.
- **AC-5** Layer 1 fails when a migration introduces a `%drive_file_id%` column absent from the committed census; Layer 1 fails when a migration creates a table in a schema outside `{public, dev}`.
- **AC-6** Layer 2 fails when the local DB and the committed census disagree; Layer 2's anchor assertion fails on an empty or short census.
- **AC-7** Layer 3 runs against `TEST_DATABASE_URL` in the `validation-schema-parity` job and asserts public-schema coverage live; `test:audit:validation-schema-parity` includes the new file.
- **AC-8** The exemption list ships empty, and its three rules (non-empty reason, no now-covered row, no absent-column row) each have a failing-input unit test.
- **AC-9** `BL-OPENING-REEL-DRIVE-ID-NONBLANK` and `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` move whole to `BACKLOG-archive.md` with provenance (ids unchanged), and the drift finding U4 is recorded there as part of the closure rather than filed as a new open item.
- **AC-10** `pnpm gen:schema-manifest --check` reports the manifest fresh (no column change), and the migration is applied to the validation project.
- **AC-11** Every `add constraint <name>` in the nonblank migrations is ≤ 63 bytes, pinned by a test, so no name is silently truncated (§3.1).
- **AC-12** The migration applies cleanly to the local DB despite the `no_global_cursor_columns` `ddl_command_end` event trigger re-scanning `public` on every statement (§3.1.1), and adds no `_allowed_watermark_columns` row.
