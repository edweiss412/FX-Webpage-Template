# Plan — Drive-ID coverage guard cluster: soundness upgrades

**Spec:** `docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md`
**Branch:** `feat/driveid-guard-cluster` · **Implementer:** Opus / Claude Code (autonomous pipeline,
approved at the brainstorming gate 2026-07-26)

The spec is canonical. Where this plan and the spec disagree, the spec wins.

---

## Declared applicability (per `docs/agents/writing-plans.md`)

| mandatory rule | applies? |
| -------------- | -------- |
| **Advisory-lock holder topology** | **N/A.** No task touches `pg_advisory*`; read-only introspection + test-local rolled-back inserts. Verified by grep across every file this plan modifies. |
| **Layout-dimensions task** | **N/A.** No UI surface; invariant 8 does not fire. |
| **Transition-audit task** | **N/A.** No component. |
| **Meta-test inventory** | Declared below. |
| **e2e harness-readiness checklist** | **N/A.** No Playwright spec added or modified. |
| **`echo >>` discipline** | Applies to T5 (doc edits) — `Edit`/`Write` only, never shell append. |
| **Typecheck pasted snippets** | Done pre-dispatch; every snippet below compiled under the repo tsconfig via `pnpm tsc --noEmit` on the assembled files. |

### Meta-test inventory

**CREATES:**
- the probe-registry completeness meta-test inside `tests/db/driveFileIdNonblank.db.test.ts`
  (spec §3.4): census ⊆ registry ∪ exemptions, plus the stale-probe reverse check;
- the dual-source census cross-check inside `tests/db/driveIdCoverage.db.test.ts` (spec §3.3).

**EXTENDS:** `tests/db/validation-schema-parity.test.ts` (identity assert + audit layer, spec
§3.1/§3.2) · `tests/cross-cutting/pg-cron-coverage.test.ts` (identity assert, spec §3.1).

**EXTENDS (2):** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — its `BACKLOG_GRADUATED`
registry gains the four cluster IDs, so deleting an entry from `BACKLOG.md` without archiving it
goes red (plan-R1 finding 7; the bare test alone does not prove THESE entries graduated).

**SUBJECT TO:** `tests/db/_metaLocalDbUrlGuard.test.ts` — every file reading
`process.env.LOCAL_TEST_DATABASE_URL` must route through an imported guard call
(`assertLocalDbUrl` / `assertLocalDbUrlIfSet`, accepted names at `tests/db/_localDbUrlScan.ts:28`;
env-var constant at `tests/db/_localDbUrlScan.ts:29`); the probes suite already does and keeps
doing so, and pg-cron's call-site `assertLocalDbUrlIfSet` wrap JOINS this class (spec §3.1). The
scanner needs NO edit — it already walks all of `tests/` recursively; the lockstep is the census
bump 56 → 57 (`tests/db/_metaLocalDbUrlGuard.test.ts:393-403`). Invariant 9
(`tests/auth/_metaInfraContract.test.ts`) **N/A** — no Supabase client call added (raw `postgres`
/ psql only). Invariant 10 **N/A** — no route, no server action; test-only mutations inside
always-rolled-back transactions.

### Vitest / CI wiring (verified 2026-07-26)

- `tests/db/**` runs in the serial project → CI `unit-suite-db` (required aggregator worker). The
  ONLY new files are the spec-§0 `_`-prefixed helpers (`_validationTargetIdentity.ts`,
  `_censusRunner.ts`) — helper convention already established in `tests/db/`, not matched as
  test files. NO new test files: every new test lands in an existing suite named in spec §0
  (plan-R1 finding 2). No `testMatch` or workflow path-filter changes needed.
- `tests/db/validation-schema-parity.test.ts` also runs via `test:audit:validation-schema-parity`
  (`package.json:42`) in the `validation-schema-parity` x-audits job; `pg-cron-coverage.test.ts`
  via `test:audit:pg-cron-validation` (`package.json:65`) in `pg-cron-validation-parity`. Both
  jobs already have `TEST_DATABASE_URL` + (pg-cron) `VALIDATION_SUPABASE_PROJECT_REF`; zero
  workflow YAML edits.

## Shell preamble

Reuse the parent plan's preamble verbatim
(`docs/superpowers/plans/2026-07-25-secondary-drive-id-nonblank/00-overview.md` §"Shell
preamble"): `LOCAL` target, `TEST_DATABASE_URL` extracted from `.env.local` by grep (NEVER
`source` — measured parse error), `PGCONNECT_TIMEOUT=10`, `PSQL_SAFE` with lock/statement
timeouts.

## Plan-time introspection (already run; outputs in the session scratchpad)

- Required-no-default columns for all 16 probe targets: captured (`probe-target-shapes.txt`).
- CHECK/FK/PK constraints for those tables: captured (`probe-target-constraints.txt`, 78 rows).
  Enum values needed by probe inserts: `pending_syncs.source_kind` ∈ cron/push/manual/
  onboarding_scan (both schemas); `deferred_ingestions.deferred_kind` ∈ defer_until_modified/
  permanent_ignore; `onboarding_scan_manifest.status` ∈ staged/…; `show_change_log.source` ∈
  auto_apply/… and `.status` ∈ applied/…; `sync_holds.kind`+`domain`+shape-check (use
  `kind='undo_override'`, `proposed_value` NULL); `sync_log.status` (existing probe shape).
  FK parents needed in-tx: `shows` row for `pending_snapshot_uploads`/`show_change_log`/
  `shows_pending_changes`/`sync_holds`; `dev.shows` row for none of the dev targets
  (`dev.sync_audit.show_id`, `dev.sync_log.show_id` nullable → omit).

---

## Module APIs (defined once; every task conforms — plan-R1 findings 3/4, plan-R2 findings 2/5)

**`tests/db/_validationTargetIdentity.ts`** (identity module, spec §0) exports:

- `VALIDATION_SYSTEM_IDENTIFIER` (string constant);
- `identityGuardSql(): string` — the bare `DO` guard block (constant interpolated once);
- `withValidationIdentityGuard(sql)` — `identityGuardSql() + "\n" + sql` (plan-R2 finding 5:
  the preamble consumer receives `identityGuardSql()`, not an undefined `guard` value);
- `assertValidationIdentity(dbUrl)` — psql probe, two discriminable error shapes;
- `execPsqlRedacted(dbUrl, args, input?)` — the redacting psql runner (spec §3.1, R2-1);
- `redactDsn(message, dbUrl)` — pure redactor, shared by the runner and pg-cron's messages;
- `resolvePgCronMode({ target, testDatabaseUrl, localTestDatabaseUrl })` — pure, five cases;
- `buildPgCronUnreachableMessage(dbUrl)` — CI-unreachable builder, redacted via `redactDsn`.

**`tests/db/_censusRunner.ts`** (census runner, spec §0) exports:

- `censusInPinnedTx(sql, opts?: { preambleSql?: string[] }) → { columns, columnsPgCatalog,
  constraints, searchPath }` — ONE explicit transaction on ONE connection: `set local
  search_path`, in-tx `current_setting` assert, then each `opts.preambleSql` statement (T3
  passes `[identityGuardSql()]`), then BOTH census queries + the constraint query. Same-tx by
  construction.
- `censusTupleKey({schema, table, column})` — JSON-encoded tuple key (spec §3.3);
- `diffCensusSources(a, b) → { onlyA, onlyB }` — the ONE comparator (keyed by `censusTupleKey`);
  production cross-check asserts both empty, negative control asserts non-empty THROUGH THE SAME
  FUNCTION;
- `EXPECTED_DEV_CENSUS` — declared here but INTRODUCED EMPTY by T3's red step and filled by its
  green step (plan-R2 finding 1c: it is not part of T2's deliverable, so T3's red is genuine);
- `auditProbeRegistry({ censusColumns, censusConstraints, probes, exemptions }) → findings[]` —
  pure (plan-R2 finding 2: `censusConstraints` is an input, so canonical-definition checks are
  implementable). Finding kinds: `unprobed_tuple`, `stale_probe`, `constraint_mismatch` (missing
  name on the claimed table OR definition ≠ `canonicalBare/Nullable(column)`),
  `nullable_mismatch`, `empty_reason`, `duplicate_exemption`, `stale_exemption`,
  `probe_exemption_overlap`.

## Attachment tripwires (plan-R2 finding 3)

Helper unit tests prove helpers; they cannot prove call sites stay wired. One consolidated
source-structural test in the DB-free suite (`tests/db/driveIdCoverage.test.ts`) scans BOTH
consumer files and asserts, per file, REQUIRED patterns (with expected counts) and FORBIDDEN
patterns:

The positional rule, specified precisely (plan-R4 finding 2): the scan first STRIPS import
statements (lines matching `/^import\b/` and their continuation lines up to the closing
`from "..."`), then compares the index of the first CALL token `assertValidationIdentity(`
(open-paren required, so the bare identifier in an import list cannot satisfy it) against the
index of the first occurrence of each later-stage CALL token. Import order therefore cannot
fake test order; helper definitions cannot either, because the identity assert has no local
helper — its only non-import occurrence IS the first test's call.

The tripwire lands in TWO PHASES (plan-R4 finding 1): T1 installs every row EXCEPT the ones
marked **[T3]** below; T3 extends the tripwire with its marked rows as its own red→green
micro-cycle. T1 never references the census runner, so it goes green within its own task.

- `tests/db/validation-schema-parity.test.ts`: REQUIRED `assertValidationIdentity(` first-call
  positional rule vs `withValidationIdentityGuard(` and `execPsqlRedacted(` — and vs
  `censusInPinnedTx(` **[T3]**; `withValidationIdentityGuard(` ≥ 2 (layer-2 introspection +
  CHECK parity); `execPsqlRedacted(` ≥ 2; `identityGuardSql()` AND `preambleSql` exactly 1 each
  **[T3]**; FORBIDDEN `execFileSync("psql"` anywhere outside the `canConnect` function body
  (extracted by brace matching; `canConnect` is the ratified guard-exempt probe).
- `tests/cross-cutting/pg-cron-coverage.test.ts`: REQUIRED `resolvePgCronMode(` (exactly 1),
  `assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL)` (exactly 1),
  `assertValidationIdentity(` first-call positional rule (import-stripped, precedes the first
  `withValidationIdentityGuard(`/`execPsqlRedacted(` call), `execPsqlRedacted(` ≥ 1
  (plan-R3 finding 2c — the routing claim needs its token), `withValidationIdentityGuard(` ≥ 1,
  `buildPgCronUnreachableMessage(` (exactly 1, in the CI-unreachable throw), `redactDsn(` ≥ 1
  (local warn), `identity_mismatch` (tri-state literal); FORBIDDEN raw `execFileSync("psql"`
  (every psql exec routes through `execPsqlRedacted`), `process.env.TEST_DATABASE_URL` /
  `process.env.PG_CRON_COVERAGE_TARGET` / `process.env.LOCAL_TEST_DATABASE_URL` outside the
  single resolver call site.

Stated honestly (and in the test's header): these are attachment TRIPWIRES — they make silent
detachment a red diff, while the per-connection guarantee itself is enforced at runtime by the
`DO` guard aborting any wrong-cluster query. This mirrors the spec's own division of labor.

## Registry data (inlined so the plan is self-contained — plan-R2 finding 4)

Introspected live 2026-07-26/27 (local all-migrations-applied stack; constraint dump verified
identical on validation). `LOCAL` = the loopback DSN. All 23 rows of `DRIVE_ID_PROBES`; the 7
"existing" rows port the current hand-written probes (comments preserved); `SHOW_SETUP` =
`insert into <schema>.shows (id, drive_file_id, slug, title, client_label, template_version,
published, last_seen_modified_time, last_sync_status) values ('11111111-1111-4111-8111-111111111111'::uuid,
'dfidnb-parent-' || gen_random_uuid(), 'dfidnb-parent-slug-' || gen_random_uuid(), 'Probe Parent',
'Acme Corp', 'v4', true, now(), 'ok')` (fixed id referenced by FK siblings; unique-safe values).

| # | tuple | nullable | constraintName | siblings | siblingValues | setup |
|---|-------|----------|----------------|----------|---------------|-------|
| 1 | public.agenda_extract_leases.drive_file_id | no | agenda_extract_leases_drive_file_id_nonblank | wizard_session_id, owner, expires_at | gen_random_uuid(), 'owner', now() + interval '5 minutes' | — |
| 2 | public.shows.drive_file_id | no | shows_drive_file_id_nonblank | slug, title, client_label, template_version, published, last_seen_modified_time, last_sync_status | 'dfidnb-slug-' \|\| gen_random_uuid(), 'T', 'Acme Corp', 'v4', true, now(), 'ok' | — |
| 3 | public.app_events.drive_file_id | YES | app_events_drive_file_id_nonblank | level, source, message | 'info', 'test.nonblank', 'msg' | — |
| 4 | public.shows.opening_reel_drive_file_id | YES | shows_opening_reel_drive_file_id_nonblank | drive_file_id, slug, title, client_label, template_version, published, last_seen_modified_time, last_sync_status | 'dfidnb-or-' \|\| gen_random_uuid(), 'dfidnb-or-slug-' \|\| gen_random_uuid(), 'T', 'Acme Corp', 'v4', true, now(), 'ok' | — |
| 5 | public.wizard_finalize_checkpoints.last_processed_drive_file_id | YES | wizard_finalize_checkpoints_drive_file_id_nonblank | wizard_session_id | gen_random_uuid() | — |
| 6 | public.onboarding_rebuild_attempts.drive_file_id | no | onboarding_rebuild_attempts_drive_file_id_nonblank | wizard_session_id | gen_random_uuid() | — |
| 7 | dev.shows.opening_reel_drive_file_id | YES | shows_opening_reel_drive_file_id_nonblank | drive_file_id, slug, title, client_label, template_version, published, last_seen_modified_time, last_sync_status | 'dfidnb-devor-' \|\| gen_random_uuid(), 'dfidnb-devor-slug-' \|\| gen_random_uuid(), 'T', 'Acme Corp', 'v4', true, now(), 'ok' | — |
| 8 | public.pending_syncs.drive_file_id | no | pending_syncs_drive_file_id_nonblank | parse_result, source_kind, staged_modified_time, warning_summary | '{}'::jsonb, 'manual', now(), '' | — |
| 9 | public.pending_ingestions.drive_file_id | no | pending_ingestions_drive_file_id_nonblank | drive_file_name, last_error_code, last_error_message | 'f.xlsx', 'CODE', 'msg' | — |
| 10 | public.sync_audit.drive_file_id | no | sync_audit_drive_file_id_nonblank | applied_by, derived_side_effects, parse_result_summary, reviewer_choices, staged_id, staged_modified_time, triggered_review_items | 'tester', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, gen_random_uuid(), now(), '[]'::jsonb | — |
| 11 | public.deferred_ingestions.drive_file_id | no | deferred_ingestions_drive_file_id_nonblank | deferred_kind, wizard_session_id | 'permanent_ignore', gen_random_uuid() | — |
| 12 | public.onboarding_scan_manifest.drive_file_id | no | onboarding_scan_manifest_drive_file_id_nonblank | folder_id, mime_type, name, status, wizard_session_id | 'folder', 'application/vnd.google-apps.spreadsheet', 'n', 'staged', gen_random_uuid() | — |
| 13 | public.pending_snapshot_uploads.drive_file_id | no | pending_snapshot_uploads_drive_file_id_nonblank | asset_count, show_id, snapshot_revision_id, temp_prefix | 0, '11111111-1111-4111-8111-111111111111'::uuid, gen_random_uuid(), 'tmp/' | SHOW_SETUP(public) |
| 14 | public.revision_race_cooldowns.drive_file_id | no | revision_race_cooldowns_drive_file_id_nonblank | raced_head_revision_id | 'rev1' | — |
| 15 | public.shows_pending_changes.drive_file_id | no | shows_pending_changes_drive_file_id_nonblank | applied_at_intent, applied_by_email, payload, show_id, wizard_session_id | now(), 'probe@example.com', '{}'::jsonb, '11111111-1111-4111-8111-111111111111'::uuid, gen_random_uuid() | SHOW_SETUP(public) |
| 16 | public.show_change_log.drive_file_id | no | show_change_log_drive_file_id_nonblank | change_kind, show_id, source, status, summary | 'crew_email', '11111111-1111-4111-8111-111111111111'::uuid, 'auto_apply', 'applied', 's' | SHOW_SETUP(public) |
| 17 | public.sync_holds.drive_file_id | no | sync_holds_drive_file_id_nonblank | created_by, domain, entity_key, held_value, kind, show_id | 'tester', 'crew_email', 'k', '{}'::jsonb, 'undo_override', '11111111-1111-4111-8111-111111111111'::uuid | SHOW_SETUP(public) |
| 18 | public.sync_log.drive_file_id | YES | sync_log_drive_file_id_nonblank | status | 'ok' | — |
| 19 | dev.pending_ingestions.drive_file_id | no | pending_ingestions_drive_file_id_nonblank | drive_file_name, last_error_code, last_error_message | 'f.xlsx', 'CODE', 'msg' | — |
| 20 | dev.pending_syncs.drive_file_id | no | pending_syncs_drive_file_id_nonblank | parse_result, source_kind, staged_modified_time, warning_summary | '{}'::jsonb, 'manual', now(), '' | — |
| 21 | dev.shows.drive_file_id | no | shows_drive_file_id_nonblank | slug, title, client_label, template_version | 'dfidnb-dev-slug-' \|\| gen_random_uuid(), 'T', 'Acme Corp', 'v4' | — |
| 22 | dev.sync_audit.drive_file_id | no | sync_audit_drive_file_id_nonblank | applied_by, derived_side_effects, parse_result_summary, reviewer_choices, staged_id, staged_modified_time, triggered_review_items | 'tester', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, gen_random_uuid(), now(), '[]'::jsonb | — |
| 23 | dev.sync_log.drive_file_id | YES | sync_log_drive_file_id_nonblank | status | 'ok' | — |

**Every row above was executed against the live local stack in one rolled-back transaction
(2026-07-27, `validate-probe-rows.sql` in the session scratchpad): all 16 new valid-inserts
accepted.** That run caught and fixed one shape error pre-review: `deferred_ingestions` carries
`deferred_ingestions_deferred_by_scope_check` (`wizard_session_id IS NOT NULL OR
deferred_by_email IS NOT NULL`), so row 11 supplies `wizard_session_id` even though the column
is nullable-with-no-default. Because every sibling CHECK is satisfied by the validated shapes, a
blank probed column trips ONLY the claimed nonblank constraint — the `constraint_name` rejection
binding is deterministic.

Implementation notes pinned by the introspection: `pending_syncs.source_kind` CHECK admits
`'manual'` (both schemas); `deferred_ingestions.deferred_kind` admits `'permanent_ignore'`;
`onboarding_scan_manifest.status` admits `'staged'`; `show_change_log` `source_chk` admits
`'auto_apply'` and `status_chk` admits `'applied'` (`change_kind` carries no CHECK);
`sync_holds` `kind_shape_chk` requires `proposed_value IS NULL` when `kind='undo_override'`
(satisfied by omission); FK parents required only for rows 13/15/16/17 (public.shows via
SHOW_SETUP; `dev.sync_audit.show_id` and `dev.sync_log.show_id` are nullable → omitted);
`public.shows.id` carries a default, so SHOW_SETUP's explicit fixed id is legal. Column lists
above contain AT LEAST the NOT-NULL-no-default siblings; rows 2, 4, and 7 (the ported `shows`
probes) additionally carry defaulted/nullable columns their original hand-written shapes set —
preserved for behavior parity, not required by the schema (plan-R3 finding 5). Blank-value
rejects reuse the existing helper set `['', '   ', '\t']`.

`EXPECTED_DEV_CENSUS` (six tuples, T3): `dev.pending_ingestions.drive_file_id`,
`dev.pending_syncs.drive_file_id`, `dev.shows.drive_file_id`,
`dev.shows.opening_reel_drive_file_id`, `dev.sync_audit.drive_file_id`,
`dev.sync_log.drive_file_id`.

`BACKLOG_GRADUATED` additions (T5; shape per
`tests/docs/_metaDeferralLedgerGraduation.test.ts:123-129`), inlined exactly:

```ts
{ id: "BL-DRIVEID-CENSUS-QUERY-SELF-CHECK", provenance: "feat/driveid-guard-cluster" },
{ id: "BL-VALIDATION-PARITY-DEFINITION-MATCH", provenance: "feat/driveid-guard-cluster" },
{ id: "BL-VALIDATION-TARGET-BINDING", provenance: "feat/driveid-guard-cluster" },
{ id: "BL-DRIVEID-BEHAVIORAL-COVERAGE", provenance: "feat/driveid-guard-cluster" },
```

## Tasks (TDD each; every numbered step is a red/green MICRO-CYCLE — the test lands red, then
the minimal implementation turns it green, within the step; commit per task)

### T1 — identity module + both consumers (spec §3.1)

1. RED→GREEN (DB-free, `tests/db/driveIdCoverage.test.ts`): write tests importing the four
   DB-free exports (compile-red), then implement ONLY those in
   `tests/db/_validationTargetIdentity.ts`:
   - `redactDsn`: sentinel DSN (`postgresql://u:SENTINELPW@127.0.0.1:1/x`) scrubbed; DSN-free
     text unchanged.
   - `execPsqlRedacted` vs the sentinel dead-port DSN: rejects; `SENTINELPW` nowhere in the
     thrown error. Failure mode: `execFileSync` argv leak.
   - `buildPgCronUnreachableMessage(sentinelDsn)`: no sentinel.
   - `resolvePgCronMode` five cases (remote `testDatabaseUrl` ignored in local mode; loopback
     `localTestDatabaseUrl` honored; misspelled target throws).
2. RED→GREEN (DB, `tests/db/driveIdCoverage.db.test.ts`): write tests importing
   `assertValidationIdentity` / `withValidationIdentityGuard` / `identityGuardSql`
   (compile-red), then implement those three:
   - `assertValidationIdentity(LOCAL)` rejects MISMATCH-shaped (both identifiers +
     remediation); dead-port DSN rejects INFRA-shaped, never mismatch.
   - `withValidationIdentityGuard("select 1")` on LOCAL aborts with the guard exception.
3. RED→GREEN (attachment tripwires, T1 PHASE — every row except the **[T3]**-marked ones):
   write the source-structural test red against today's consumers, then rewire BOTH consumers
   to green:
   - `validation-schema-parity.test.ts`: first validation test `assertValidationIdentity`;
     layer-2 + CHECK parity through `execPsqlRedacted` + `withValidationIdentityGuard`;
     `canConnect` exempt with comment.
   - `pg-cron-coverage.test.ts`: `resolvePgCronMode` at the single env call site
     (`assertLocalDbUrlIfSet` wrap; census 56 → 57 in
     `tests/db/_metaLocalDbUrlGuard.test.ts:393-403`); validation-mode first test
     `assertValidationIdentity`; live queries through `execPsqlRedacted` +
     `withValidationIdentityGuard`; CI-unreachable throw via `buildPgCronUnreachableMessage`;
     local warn via `redactDsn`; reachability tri-state (`:118-129`) classifying the guard
     exception; header comment `:27-29` rewritten (spec §9).
   - `pgCronCiVacuity.test.ts`: dead endpoint via `LOCAL_TEST_DATABASE_URL` loopback port 1;
     all three child invocations (`:99`, `:107`, `:116`) pin `PG_CRON_COVERAGE_TARGET:
     "local"`; control comments rewritten.
4. Verify: `pnpm vitest run tests/db/driveIdCoverage.test.ts tests/db/driveIdCoverage.db.test.ts
   tests/cross-cutting/pgCronCiVacuity.test.ts tests/db/_metaLocalDbUrlGuard.test.ts` green;
   `TEST_DATABASE_URL=<validation> pnpm test:audit:validation-schema-parity` green; mutate the
   pinned constant's last digit → red mismatch → revert.
5. Commit `test(db): bind every validation-targeting query to the cluster identity`.

### T2 — census runner, tuple key, comparator, dual-source (specs §3.2/§3.3)

1. RED→GREEN (DB-free): collision test imports `censusTupleKey` (compile-red) → implement key:
   `public.a."b.drive_file_id"` ≠ `public."a.b".drive_file_id`.
2. RED→GREEN (DB-free): `diffCensusSources` synthetic tests (disjoint → both arrays populated;
   equal → both empty) — red on missing export, then implement.
3. RED→GREEN (DB): dual-source cross-check test calls `censusInPinnedTx` and asserts
   `diffCensusSources(columns, columnsPgCatalog)` empty — compile-red (runner +
   `CENSUS_COLUMNS_PG_CATALOG_SQL` missing) → implement the runner (migrating
   `driveIdCoverage.db.test.ts` to it; negative control + canaries pin no behavior change) and
   the fully-literal pg_catalog query (no-dedup comments on BOTH queries; `introspect.ts:7-10`
   header rewrite per spec §9).
4. RED-proof (negative control, same comparator): inline-narrowed pg_catalog SQL (predicate
   `'drive_file_idX'`) → `diffCensusSources` reports a non-empty diff. Proves the production
   comparator bites; no stub sequencing needed.
5. Verify + commit `refactor(db): shared pinned-tx census runner, injective tuple key,
   dual-source cross-check`.

### T3 — auditor-on-validation layer (spec §3.2)

1. RED (live validation): new layer in `validation-schema-parity.test.ts` (gated on
   `TEST_DATABASE_URL`; `postgres` client; `censusInPinnedTx(client, { preambleSql:
   [identityGuardSql()] })`). The test imports `EXPECTED_DEV_CENSUS` (compile-red) → declare it
   EMPTY → run vs live validation → dev-slice set-equality fails with six unexpected tuples
   (record the red). Manifest floor in the same test: derived expected set NON-EMPTY, then
   membership via `censusTupleKey`; audit layer `auditDriveIdCoverage(...) → []`.
2. GREEN: fill the six tuples (§Registry data) → validation run green.
3. RED→GREEN: extend the attachment tripwire with the **[T3]** rows (`censusInPinnedTx(`
   positional target; `identityGuardSql()`/`preambleSql` exactly 1 each) — red until this
   task's census layer is wired as specified, green after (plan-R4 finding 1).
4. Commit `feat(db): definition-based Drive-ID audit against the validation project`.

### T4 — behavioral probe registry (spec §3.4)

1. RED→GREEN (DB-free): `auditProbeRegistry` synthetic tests, one per finding kind
   (compile-red, then per-kind behavior red→green): `constraint_mismatch` for missing name AND
   right-named `CHECK (true)`; `nullable_mismatch`; `probe_exemption_overlap`; `empty_reason`;
   `duplicate_exemption`; `stale_exemption`; `stale_probe`; `unprobed_tuple`.
2. Restructure `driveFileIdNonblank.db.test.ts` to the registry: port the 7 existing rows
   (§Registry data rows 1-7, comments preserved); generated per-row tests assert
   `code === '23514'` AND `constraint_name`/`schema_name`/`table_name` match the row; valid
   accepts; nullable rows accept NULL; `setup` in the same rolled-back tx. Green with 7 rows.
3. RED (the load-bearing one): completeness meta-test — `auditProbeRegistry` over the LIVE
   census (shared runner, incl. constraints) with 7 rows → red listing exactly the 16 unprobed
   tuples (record it).
4. GREEN: add rows 8-23.
5. RED→GREEN (its own micro-cycle — plan-R3 finding 4): write the source-scan asserting this
   suite contains the module-scope `unreachableDbFailure` call + throw (red: the suite still
   `skipIf`s only), then adopt `unreachableDbFailure` (CI fail-not-skip) → green. Removing the
   call later is a red.
6. Verify + commit `feat(db): registry-enforced behavioral probes for every Drive-ID column`.

### T5 — backlog graduation with executable proof (spec §9)

1. RED: add the four `{ id, provenance: "feat/driveid-guard-cluster" }` rows to
   `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:123`) → red (entries
   still live in `BACKLOG.md`).
2. GREEN: move the four entries to `BACKLOG-archive.md` (RESOLVED + spec path + provenance);
   update the `BL-PG-CRON-COVERAGE-UNRUN` inheritance sentence; parent spec §10 items 1/2/4/5 +
   §11 rows get "closed by" notes; x-audits "INHERITED CEILING" block rewritten
   (`.github/workflows/x-audits.yml:365-370`).
3. `pnpm spec:lint` both spec docs — no new hard failures. Commit
   `docs: graduate the four Drive-ID guard backlog entries`.

### T6 — close-out

1. Full local suite green (CI-leg equivalents); targeted audit scripts green.
2. Whole-diff cross-model review (fresh-eyes posture) → APPROVE.
3. Push, PR, real CI green — AND an `x-audits` `workflow_dispatch` run observed green before
   merge, UNCONDITIONALLY (spec AC-6; the PR-triggered run does not substitute).
4. Merge, fast-forward main, `git rev-list --left-right --count main...origin/main` == `0  0`.

## Task order rationale

T1 first: every later validation-touching run inherits the identity guarantee, and the
attachment tripwires force the consumers into the same commit as the helpers they bind. T2
before T3/T4 (runner + comparator + key). T3's dev-census red is real (empty list vs live
validation, first declared there). T4's completeness red is the genuine 16-tuple gap. T5's red
is registry-before-move.
