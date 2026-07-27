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

## Module APIs (defined once; every task below conforms — plan-R1 findings 3 and 4)

**`tests/db/_validationTargetIdentity.ts`** (identity module, spec §0) exports:

- `VALIDATION_SYSTEM_IDENTIFIER` (string constant);
- `assertValidationIdentity(dbUrl)` — psql probe, two discriminable error shapes;
- `withValidationIdentityGuard(sql)` — prepends the `DO` guard block;
- `execPsqlRedacted(dbUrl, args, input?)` — the redacting psql runner (spec §3.1, R2-1);
- `redactDsn(message, dbUrl)` — pure string redactor `execPsqlRedacted` uses; ALSO used by
  pg-cron's message builders so constructed messages share the mechanism (R3-1);
- `resolvePgCronMode({ target, testDatabaseUrl, localTestDatabaseUrl })` — pure, five cases
  (spec §3.1);
- `buildPgCronUnreachableMessage(dbUrl)` — the CI-unreachable message builder, redacted via
  `redactDsn` (its sentinel test lives with the resolver tests).

**`tests/db/_censusRunner.ts`** (census runner, spec §0) exports:

- `censusInPinnedTx(sql, opts?) → { columns, columnsPgCatalog, constraints, searchPath }` — ONE
  explicit transaction on ONE connection: `set local search_path`, in-tx `current_setting`
  assert, then `opts.preambleSql` statements (T4 passes the identity `DO` block here, satisfying
  spec §3.1 "guard inside its own census tx"), then BOTH census queries and the constraint query.
  Both censuses come from the SAME transaction by construction — no caller can split them
  (plan-R1 finding 4).
- `censusTupleKey({schema, table, column})` — JSON-encoded tuple key (spec §3.3);
- `diffCensusSources(a, b) → { onlyA, onlyB }` — the ONE comparator, keyed by `censusTupleKey`;
  the production cross-check asserts both arrays empty, the negative control asserts a non-empty
  diff THROUGH THE SAME FUNCTION — weakening the comparator to length/subset breaks both
  (plan-R1 finding 5);
- `EXPECTED_DEV_CENSUS` (six tuples, spec §3.2).

Exemption/registry hygiene logic for the probes suite is a pure function
`auditProbeRegistry({censusColumns, probes, exemptions}) → findings[]` in
`tests/db/_censusRunner.ts` too — DB-free-testable with synthetic inputs, mirroring
`auditDriveIdCoverage`'s pure split (plan-R1 finding 6). Findings kinds: `unprobed_tuple`,
`stale_probe`, `constraint_mismatch` (missing OR non-canonical definition for the claimed
column), `nullable_mismatch`, `empty_reason`, `duplicate_exemption`, `stale_exemption`,
`probe_exemption_overlap`.

## Tasks (TDD each; strict RED first; commit per task, conventional commits)

### T1 — identity module: constants, guard, redaction, resolver, builder (spec §3.1)

1. RED: in `tests/db/driveIdCoverage.test.ts` (DB-free), write FIRST — imports fail to compile
   until step 2 (genuine red):
   - `redactDsn`: sentinel-password DSN (`postgresql://u:SENTINELPW@127.0.0.1:1/x`) → sentinel
     absent from output; DSN-free messages pass through unchanged.
   - `execPsqlRedacted` against the sentinel DSN (dead loopback port — no DB needed): rejects,
     and `SENTINELPW` appears NOWHERE in the thrown error (message, stack, argv echo). Failure
     mode: `execFileSync` argv leak (R2-1, reviewer probe-confirmed).
   - `buildPgCronUnreachableMessage(sentinelDsn)`: no sentinel in output (R3-1).
   - `resolvePgCronMode` five cases incl. both negative controls: remote `testDatabaseUrl`
     ignored in local mode; misspelled target throws (R4-1/R5-1). Failure modes: fail-open
     downgrade; ambient remote DSN reached from local mode.
   - source-structural binding: `tests/cross-cutting/pg-cron-coverage.test.ts` reads the three
     env vars ONLY as `resolvePgCronMode` arguments / inside the `assertLocalDbUrlIfSet` wrap,
     and derives `coverageTarget`/`databaseUrl` only from the resolver return (R4-2). It asserts
     the FINAL contract, which is why the pg-cron rewiring is part of THIS task (step 4) rather
     than a later one — the binding test stays red until the consumer is actually rewired, and
     never passes against an unused helper.
2. GREEN: implement `tests/db/_validationTargetIdentity.ts` (API above).
3. RED (DB-required, `tests/db/driveIdCoverage.db.test.ts`): `assertValidationIdentity(LOCAL)`
   rejects with the MISMATCH shape (both identifiers + remediation in message); dead-port DSN
   rejects with the INFRA shape, never mismatch; `withValidationIdentityGuard("select 1")` on the
   LOCAL stack aborts with the guard exception. Failure modes: weakened compare; conflated
   infra/mismatch; guard that never raises.
4. GREEN: wire consumers.
   - `tests/db/validation-schema-parity.test.ts`: first validation-targeting test runs
     `assertValidationIdentity`; layer-2 introspection + CHECK-parity route through
     `execPsqlRedacted` with `withValidationIdentityGuard`-wrapped SQL when `TEST_DATABASE_URL`
     is set; `canConnect` stays exempt with the spec's comment.
   - `tests/cross-cutting/pg-cron-coverage.test.ts`: mode resolution replaced by
     `resolvePgCronMode` (env reads only at its call site; `LOCAL_TEST_DATABASE_URL` wrapped in
     `assertLocalDbUrlIfSet` — census in `_metaLocalDbUrlGuard.test.ts:393-403` bumps 56 → 57);
     every live query under validation mode wrapped + redacted; the two raw `databaseUrl`
     emissions (`tests/cross-cutting/pg-cron-coverage.test.ts:174-183` via
     `buildPgCronUnreachableMessage`, and the local warn at
     `tests/cross-cutting/pg-cron-coverage.test.ts:184-190` via `redactDsn`); reachability probe
     tri-state (`reachable`/`identity_mismatch`/`unreachable`, actual span
     `tests/cross-cutting/pg-cron-coverage.test.ts:118-129`), identity mismatch reported as
     identity failure; header comment `:27-29` rewritten (spec §9).
   - `tests/cross-cutting/pgCronCiVacuity.test.ts`: dead endpoint via `LOCAL_TEST_DATABASE_URL`
     loopback port 1; ALL THREE child invocations (`:99`, `:107`, `:116`) pin
     `PG_CRON_COVERAGE_TARGET: "local"`; control comments rewritten (spec §9).
5. Verify: `pnpm vitest run tests/db/driveIdCoverage.test.ts tests/db/driveIdCoverage.db.test.ts
   tests/cross-cutting/pgCronCiVacuity.test.ts tests/db/_metaLocalDbUrlGuard.test.ts` green;
   `TEST_DATABASE_URL=<validation> pnpm test:audit:validation-schema-parity` green; mutate the
   pinned constant's last digit → red mismatch → revert.
6. Commit `test(db): bind every validation-targeting query to the cluster identity`.

### T2 — census runner: extraction, tuple key, comparator, dual-source (specs §3.2/§3.3)

1. RED (DB-free, `tests/db/driveIdCoverage.test.ts`): collision negative control — imports
   `censusTupleKey` (does not exist → compile red); `public.a."b.drive_file_id"` vs
   `public."a.b".drive_file_id` produce DISTINCT keys. Failure mode: dot-joined key collapse.
2. RED (same file): `diffCensusSources` on synthetic inputs — disjoint sets → both arrays
   populated; equal sets → both empty. Failure mode: comparator weakened to length/subset.
3. GREEN: implement `tests/db/_censusRunner.ts` (API above), including
   `CENSUS_COLUMNS_PG_CATALOG_SQL` in `lib/driveIdCoverage/introspect.ts` (fully literal, own
   predicate + schema list, `relkind in ('r','p')`, no-dedup comments on BOTH queries) and the
   `introspect.ts:7-10` header rewrite (spec §9). Migrate `driveIdCoverage.db.test.ts` to the
   shared runner — suite green before and after (negative control + canaries pin behavior).
4. RED (DB, `driveIdCoverage.db.test.ts`): DUAL-SOURCE CROSS-CHECK via `diffCensusSources` over
   ONE `censusInPinnedTx` result — red until step 3's pg_catalog query is correct (written
   against a deliberately-wrong stub first: predicate `'drive_file_idX'` in the stub → the test
   proves the comparator bites, then the real query lands). Negative control: run the pg_catalog
   SQL with the narrowed predicate inline and assert `diffCensusSources` (SAME function) reports
   a non-empty diff.
5. Verify + commit `refactor(db): shared pinned-tx census runner, injective tuple key,
   dual-source cross-check`.

### T3 — auditor-on-validation layer (spec §3.2)

1. RED against live validation: new layer in `validation-schema-parity.test.ts` (gated on
   `TEST_DATABASE_URL`; `postgres` client; `censusInPinnedTx(client, { preambleSql: [guard] })`).
   Written RED-first for real: `EXPECTED_DEV_CENSUS` ships EMPTY in this step, so the dev-slice
   set-equality FAILS against live validation (six unexpected tuples) — run
   `TEST_DATABASE_URL=<validation> pnpm test:audit:validation-schema-parity` and record the red.
   Also in this step: manifest floor asserts the manifest-derived expected set is NON-EMPTY
   before membership (plan-R1 finding 1's vacuity note — a broken regex yields an empty
   expected set and must be red, not vacuously green), then membership of every derived tuple in
   the validation public slice via `censusTupleKey`; audit layer
   `auditDriveIdCoverage(...) → []`.
2. GREEN: fill `EXPECTED_DEV_CENSUS` with the six measured tuples → validation run green.
3. Commit `feat(db): definition-based Drive-ID audit against the validation project`.

### T4 — behavioral probe registry (spec §3.4)

1. RED (DB-free): `auditProbeRegistry` synthetic-input tests, one per finding kind — including
   `constraint_mismatch` for BOTH a missing name and a right-named `CHECK (true)` definition,
   `nullable_mismatch` for a false claim, `probe_exemption_overlap`, `empty_reason`,
   `duplicate_exemption`, `stale_exemption`, `stale_probe`, `unprobed_tuple`. Compile-red first
   (function does not exist), then behavior-red per kind. Failure modes: each hygiene rule
   individually deletable without a test going red (plan-R1 finding 6).
2. GREEN: implement `auditProbeRegistry`.
3. Restructure `driveFileIdNonblank.db.test.ts` to the registry; port the 7 existing probes;
   generated per-row tests assert `code === '23514'` AND
   `constraint_name`/`schema_name`/`table_name` match the row (spec §2 item 5); valid accepts;
   nullable rows accept NULL; row `setup` runs in the same rolled-back tx.
4. RED (the load-bearing one): completeness meta-test — `auditProbeRegistry` over the LIVE
   census (via shared runner) with the 7-row registry → red listing exactly the 16 unprobed
   tuples (recorded in the task log).
5. GREEN: add the 16 rows from §Plan-time introspection (FK parents via `setup`; `sync_holds`
   uses `kind='undo_override'` with `proposed_value` NULL; enum values as inventoried).
6. Adopt `unreachableDbFailure` (CI fail-not-skip) in this suite, mirroring
   `tests/db/driveIdCoverage.db.test.ts:79-91` — bound structurally: the DB-free suite asserts
   this file's source contains the module-scope `unreachableDbFailure` call + throw (same
   source-scan mechanism as the resolver binding; removing the call goes red — plan-R1
   finding 6 last bullet).
7. Verify + commit `feat(db): registry-enforced behavioral probes for every Drive-ID column`.

### T5 — backlog graduation with executable proof (spec §9; plan-R1 findings 1 and 7)

1. RED: add the four IDs (`BL-DRIVEID-CENSUS-QUERY-SELF-CHECK`,
   `BL-VALIDATION-PARITY-DEFINITION-MATCH`, `BL-VALIDATION-TARGET-BINDING`,
   `BL-DRIVEID-BEHAVIORAL-COVERAGE`) to `BACKLOG_GRADUATED` in
   `tests/docs/_metaDeferralLedgerGraduation.test.ts` FIRST → red (entries still live in
   `BACKLOG.md`; registry demands archive rows). Failure mode: entries deleted without archival,
   or graduation claimed without the move.
2. GREEN: move the four entries to `BACKLOG-archive.md` (RESOLVED + spec path + provenance);
   update the `BL-PG-CRON-COVERAGE-UNRUN` inheritance sentence; parent spec §10 items 1/2/4/5 +
   §11 rows get "closed by" notes; x-audits "INHERITED CEILING" block rewritten
   (`.github/workflows/x-audits.yml:365-370`).
3. `pnpm spec:lint` both spec docs — no new hard failures. Commit
   `docs: graduate the four Drive-ID guard backlog entries`.

### T6 — close-out

1. Full local suite green (`pnpm test:fast` + the serial db project, per CI legs); targeted
   audit scripts green.
2. Whole-diff cross-model review (fresh-eyes posture) → APPROVE.
3. Push, PR, real CI green — AND an `x-audits` `workflow_dispatch` run observed green before
   merge, UNCONDITIONALLY (spec AC-6; the PR-triggered run does not substitute — plan-R1
   finding 8).
4. Merge, fast-forward main, `git rev-list --left-right --count main...origin/main` == `0  0`.

## Task order rationale

T1 first: every later validation-touching run inherits the identity guarantee, and the vacuity
controls stay coherent within one commit. T2 before T3/T4 (both consume the runner + comparator +
key). T3's dev-census RED is real (empty list vs live validation). T4's completeness RED is the
genuine 16-tuple gap. T5's RED is the registry-before-move ordering. Six tasks, not the draft's
seven: the identity module and its pg-cron consumer merged into T1 because the source-structural
binding test asserts the final contract and forces co-location; doc lockstep and graduation
consolidated into T5.
