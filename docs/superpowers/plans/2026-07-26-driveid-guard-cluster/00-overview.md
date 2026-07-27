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
| **`echo >>` discipline** | Applies to T6 (doc edits) — `Edit`/`Write` only, never shell append. |
| **Typecheck pasted snippets** | Done pre-dispatch; every snippet below compiled under the repo tsconfig via `pnpm tsc --noEmit` on the assembled files. |

### Meta-test inventory

**CREATES:**
- the probe-registry completeness meta-test inside `tests/db/driveFileIdNonblank.db.test.ts`
  (spec §3.4): census ⊆ registry ∪ exemptions, plus the stale-probe reverse check;
- the dual-source census cross-check inside `tests/db/driveIdCoverage.db.test.ts` (spec §3.3).

**EXTENDS:** `tests/db/validation-schema-parity.test.ts` (identity assert + audit layer, spec
§3.1/§3.2) · `tests/cross-cutting/pg-cron-coverage.test.ts` (identity assert, spec §3.1).

**SUBJECT TO:** `tests/db/_metaLocalDbUrlGuard.test.ts` — every file reading
`process.env.LOCAL_TEST_DATABASE_URL` must route through `assertLocalDbUrl`
(`tests/db/_localDbUrlScan.ts:29`); the probes suite already does and keeps doing so, and
pg-cron's resolver JOINS this class (spec §3.1, R5-1 — scan scope extended to the cross-cutting
reader if needed). Invariant 9
(`tests/auth/_metaInfraContract.test.ts`) **N/A** — no Supabase client call added (raw `postgres`
/ psql only). Invariant 10 **N/A** — no route, no server action; test-only mutations inside
always-rolled-back transactions.

### Vitest / CI wiring (verified 2026-07-26)

- `tests/db/**` runs in the serial project → CI `unit-suite-db` (required aggregator worker). The
  NEW files are `_`-prefixed helpers (`_validationTargetIdentity.ts`, `_censusRunner.ts`) — helper
  convention already established in `tests/db/`, not matched as test files. No `testMatch` or
  workflow path-filter changes needed.
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

## Tasks (TDD each; commit per task, conventional commits)

### T1 — identity module + per-connection target binding (spec §3.1)

1. RED: new `tests/db/validationTargetIdentity.test.ts` (serial project):
   - `assertValidationIdentity(LOCAL_URL)` rejects with the MISMATCH error (local identifier ≠
     pinned; message contains both identifiers + remediation text). Failure mode caught: a future
     edit that weakens the compare to substring/prefix, or pins the local identifier.
   - unreachable host (`postgresql://postgres:postgres@127.0.0.1:1/postgres`) rejects with the
     INFRA-shaped error, never the mismatch error. Failure mode: infra faults masquerading as
     "wrong database" (or vice versa) — the two must stay discriminable.
   - `withValidationIdentityGuard("select 1")` run against the LOCAL stack aborts with the guard
     exception (spec §3.1 negative control). Failure mode: a guard block that executes but never
     raises (e.g. dropped `raise`, wrong comparison type).
   - redaction: force a failure through the shared psql runner with a sentinel-password DSN
     (`postgresql://u:SENTINELPW@127.0.0.1:1/x`) and assert `SENTINELPW` appears NOWHERE in the
     thrown error (spec §3.1, R2-1). Failure mode: `execFileSync` argv echo leaking credentials.
   - constructed messages: the pg-cron CI-unreachable message builder, invoked with the sentinel
     DSN, contains no sentinel (spec §3.1, R3-1). Failure mode: reintroduced raw `databaseUrl`
     interpolation in a suite-built message.
   - `resolvePgCronMode` five cases (spec §3.1, R3-2 redesigned per R4-1/R5-1 — NO DSN
     judgment): `"validation"` → validation mode consuming `testDatabaseUrl` (existing refusals
     if missing); unset / `""` / `"local"` → local mode with
     `assertLocalDbUrl(localTestDatabaseUrl ?? LOCAL_LOOPBACK_URL)` — supplied remote
     `testDatabaseUrl` IGNORED (negative control: returned dbUrl is the loopback value even when
     a remote `testDatabaseUrl` is passed; a loopback `localTestDatabaseUrl` IS honored); any
     other string → THROW. Failure modes: misspelled workflow target silently downgrading;
     ambient dev-box `TEST_DATABASE_URL` reaching a remote cluster from local mode.
   - source-structural resolver binding (spec §3.1, R4-2/R5-1): scan
     `tests/cross-cutting/pg-cron-coverage.test.ts` source — `process.env.PG_CRON_COVERAGE_TARGET`,
     `process.env.TEST_DATABASE_URL`, and `process.env.LOCAL_TEST_DATABASE_URL` appear ONLY as
     `resolvePgCronMode` arguments; `coverageTarget`/`databaseUrl` derive only from its return.
     Failure mode: resolver exists, passes its unit tests, and nothing calls it.
   - pgCronCiVacuity controls re-pointed (spec §3.1, R5-1): dead-endpoint injection via
     `LOCAL_TEST_DATABASE_URL` = loopback port 1; both controls (CI-fail at
     `tests/cross-cutting/pgCronCiVacuity.test.ts:99`, local-skip at `:107`) stay red-proving.
     `_metaLocalDbUrlGuard` scan scope extended to the cross-cutting reader if not already
     covered (`tests/db/_localDbUrlScan.ts`). Rewrite the pg-cron header mode comment (`:27-29`)
     and both vacuity-control comments (spec §9).
2. GREEN: implement `tests/db/_validationTargetIdentity.ts` — pinned constant,
   `assertValidationIdentity` (two discriminable error shapes; timeout posture of
   `validation-schema-parity.test.ts:95-96`), `withValidationIdentityGuard(sql)` prepending the
   `DO` guard block (constant interpolated once, no second literal), and the REDACTING psql
   runner (rethrows any failure with the DSN replaced by `<TEST_DATABASE_URL redacted>`) that
   every validation-targeting call below uses.
3. Wire per spec §3.1 binding contract: `validation-schema-parity.test.ts` — first validation
   test runs `assertValidationIdentity`; layer-2 `introspectManifest` and the CHECK-parity call
   route through the redacting runner with `withValidationIdentityGuard`-wrapped SQL when
   `TEST_DATABASE_URL` is set; `canConnect` stays guard-EXEMPT with the spec's comment.
   `pg-cron-coverage.test.ts` — mode resolution replaced by `resolvePgCronMode` (fail-closed);
   every live query under the validation gate (`:157-171`) wrapped + redacted; the two raw
   `databaseUrl` message emissions (`:174-183`, `:184-190`) rewritten redacted;
   `livePsqlReachable` (`:115-124`) becomes tri-state
   (`reachable`/`identity_mismatch`/`unreachable`), classifying the guard exception text, and the
   CI gate reports `identity_mismatch` as an identity failure, never "unreachable". Verify vs
   live validation: `TEST_DATABASE_URL=<validation> pnpm test:audit:validation-schema-parity`
   green; mutate pinned constant last digit → red mismatch (then revert).
4. Commit `test(db): bind every validation-targeting query to the cluster identity`.

### T2 — census runner extraction + injective tuple key (mechanical enabler)

1. Extract `censusInPinnedTx` from `driveIdCoverage.db.test.ts:105-129` to
   `tests/db/_censusRunner.ts`, parameterized by client handle; suite imports it. Export
   `censusTupleKey = JSON.stringify([schema, table, column])` and `EXPECTED_DEV_CENSUS` (six
   tuples) from the same module (spec §3.2/§3.3, R2-2).
   No behavior change to the live suite: `pnpm vitest run tests/db/driveIdCoverage.db.test.ts`
   green before and after (negative control + canaries are the behavioral pins).
2. RED→GREEN: collision negative control in the DB-free unit suite
   (`tests/db/driveIdCoverage.test.ts`): `public.a."b.drive_file_id"` vs
   `public."a.b".drive_file_id` produce DISTINCT `censusTupleKey`s. Failure mode: a future
   refactor to dot-joined keys silently collapsing quoted identifiers.
3. Commit `refactor(db): extract the pinned-tx census runner; injective tuple key`.

### T3 — dual-source census self-check (spec §3.3)

1. RED: in `driveIdCoverage.db.test.ts`, add the DUAL-SOURCE CROSS-CHECK test importing
   `CENSUS_COLUMNS_PG_CATALOG_SQL` (does not exist yet → suite fails to compile = red).
   Assertion: `(schema,table,column)` tuple set from the information_schema census set-equals the
   pg_catalog census, both taken inside the SAME pinned tx. Failure mode caught: any single-site
   narrowing of either query (predicate, schema list, added filter, relkind drift).
2. RED (second test): cross-check negative control — run the pg_catalog SQL with the predicate
   text-replaced to `'drive_file_idX'` (string substitution on the exported constant, asserted to
   have actually changed it) → resulting tuple set is empty/strict-subset AND set-equality against
   the primary census FAILS. Failure mode: a cross-check comparator weakened to subset/length.
3. GREEN: add `CENSUS_COLUMNS_PG_CATALOG_SQL` to `lib/driveIdCoverage/introspect.ts` — fully
   literal (own `in ('public','dev')`, own `~ 'drive_file_id'`, `relkind in ('r','p')`,
   `attnum > 0`, `not attisdropped`), with the independence comment on BOTH queries forbidding
   deduplication (spec §3.3).
4. Commit `feat(db): dual-source census cross-check for the Drive-ID guard`.

### T4 — auditor-on-validation layer (spec §3.2)

1. RED-by-construction: new layer in `validation-schema-parity.test.ts` gated on
   `TEST_DATABASE_URL` (skip unset, throw set-but-empty — existing posture): open `postgres`
   client; run the §3.1 guard block inside the census tx BEFORE the census queries; shared census
   runner; `auditDriveIdCoverage(..., DRIVE_ID_COVERAGE_EXEMPTIONS)` `.toEqual([])`;
   manifest-derived public membership (every manifest column matching the census regex appears in
   the validation census public slice); `EXPECTED_DEV_CENSUS` SET-EQUALITY on the dev slice (six
   committed tuples in `_censusRunner.ts`, spec §3.2 — both directions red). All set comparisons
   key by `censusTupleKey` (spec AC-7). Bite-proofs: the
   local suite's negative control covers the auditor; one-off manual runs with (a) the
   manifest-membership regex mutated to a non-matching literal and (b) one tuple removed from
   `EXPECTED_DEV_CENSUS` → each red (recorded in task log, then reverted).
2. GREEN vs validation: `TEST_DATABASE_URL=<validation> pnpm test:audit:validation-schema-parity`.
3. Commit `feat(db): definition-based Drive-ID audit against the validation project`.

### T5 — behavioral probe registry (spec §3.4)

1. Restructure `driveFileIdNonblank.db.test.ts` to the `DRIVE_ID_PROBES` registry (spec §3.4
   type: `schema`/`table`/`column`/`nullable`/`constraintName`/`siblings`/`siblingValues`/
   optional `setup` — NO free-form insert; the generator constructs
   `insert into ${schema}.${table} (${siblings}, ${column}) values (${siblingValues}, $1)`).
   Port the 7 existing probes as rows (keep their comments). Generated per-row tests: reject
   ''/'   '/'\t' asserting `code === '23514'` AND `constraint_name === row.constraintName` AND
   `schema_name`/`table_name` match the claim (driver fields measured, spec §2 item 5); accept
   valid; nullable → accept NULL. Failure mode caught: a row claiming tuple X while probing Y, or
   passing on a 23514 raised by an unrelated CHECK. Suite green with 7 rows.
2. RED: completeness meta-test — every live census tuple ∈ registry ∪ `PROBE_EXEMPTIONS` → fails
   listing exactly the 16 missing tuples. Same test verifies per-row `constraintName` (exists on
   the claimed table with definition exactly `canonicalBare/Nullable(column)`) and `nullable`
   against the live census, rejects probes∩exemptions overlap (R1-4), and rejects registry rows
   for non-census tuples (stale-probe guard). All membership keyed by `censusTupleKey` (AC-7). Bite-proofs in-run: temporarily mislabel one row's
   `constraintName`, temporarily add a bogus tuple row — each red, then reverted.
3. GREEN: add the 16 rows using the plan-time shapes (§Plan-time introspection). FK parents via
   row `setup` inside the same rolled-back transaction, zero residue.
4. Adopt `unreachableDbFailure` (CI fail-not-skip) in this suite, mirroring
   `driveIdCoverage.db.test.ts:79-91`.
5. Commit `feat(db): registry-enforced behavioral probes for every Drive-ID column`.

### T6 — doc lockstep (spec §9)

1. Graduate the four entries from repo-root `BACKLOG.md` → `BACKLOG-archive.md` (move, statused
   RESOLVED with spec path; `tests/docs/_metaDeferralLedgerGraduation.test.ts` green).
2. Parent spec §10 items 1/2/4/5 + §11 rows: one-line "closed by" notes. `BL-PG-CRON-COVERAGE-UNRUN`
   inheritance sentence updated.
3. Retire the two falsified comments (spec §9, R3-4): rewrite
   `lib/driveIdCoverage/introspect.ts:7-10` (dual-source cross-check is now the mechanical
   control; review remains for the identical-two-site residue) and the x-audits "INHERITED
   CEILING" block (`.github/workflows/x-audits.yml:365-370`) (identity guard proves the target).
4. `pnpm spec:lint` on both spec docs: no new hard failures.
5. Commit `docs: graduate the four Drive-ID guard backlog entries`.

### T7 — close-out

1. Full local suite (`pnpm test` equivalent used by CI legs) green; targeted audit scripts green.
2. Whole-diff cross-model review (fresh-eyes posture) → APPROVE.
3. Push, PR, real CI green — including an `x-audits` run on the PR (fires on `pull_request`) with
   the two validation jobs green; `workflow_dispatch` re-run if needed.
4. Merge, fast-forward main, `git rev-list --left-right --count main...origin/main` == `0  0`.

## Task order rationale

T1 first: every later validation-touching run inherits the identity guarantee. T2 before T3/T4/T5
(all three consume the shared runner). T5's meta-test lands AFTER its registry port so the RED it
produces is the genuine 16-tuple gap, not a refactor artifact.
