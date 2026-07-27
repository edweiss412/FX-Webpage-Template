# Drive-ID coverage guard cluster — soundness upgrades (2026-07-26)

Closes the four follow-ups filed by
`docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md` §11:
`BL-VALIDATION-TARGET-BINDING`, `BL-VALIDATION-PARITY-DEFINITION-MATCH`,
`BL-DRIVEID-CENSUS-QUERY-SELF-CHECK`, `BL-DRIVEID-BEHAVIORAL-COVERAGE` (the 2026-07-25 "Drive-ID
coverage guard — deliberately-undone parts" heading in the repo-root `BACKLOG.md`).
One PR, per the owner's 2026-07-26 scope decision. That parent spec's seven review rounds are the
analysis substrate here; nothing below re-derives what it already ratified.

## 0. Files this spec creates or edits

The two NEW files do not exist yet, so citations to them cannot resolve; the waiver covers that.

<!-- spec-lint: ignore — every path in this fence is CREATED by this spec, so none is in the tracked set at spec time -->
```
tests/db/_validationTargetIdentity.ts   "the identity module" — pinned validation system_identifier + assertValidationIdentity
tests/db/_censusRunner.ts               "the census runner" — censusInPinnedTx extracted from tests/db/driveIdCoverage.db.test.ts:105-129
```

Also EDITED (all tracked, cited normally elsewhere):

| file | action |
| ---- | ------ |
| `lib/driveIdCoverage/introspect.ts` | EDIT — add `CENSUS_COLUMNS_PG_CATALOG_SQL` (independent second census) |
| `tests/db/driveIdCoverage.db.test.ts` | EDIT — import shared runner; add dual-source cross-check tests |
| `tests/db/driveFileIdNonblank.db.test.ts` | EDIT — probe registry, 16 new probes, completeness meta-test, CI fail-not-skip |
| `tests/db/driveIdCoverage.test.ts` | EDIT — DB-free collision negative control for `censusTupleKey` (AC-7) + `resolvePgCronMode` five-case test + source-structural resolver-binding test (§3.1) |
| `tests/db/validation-schema-parity.test.ts` | EDIT — identity assert; new drive-id audit layer vs validation |
| `tests/cross-cutting/pg-cron-coverage.test.ts` | EDIT — identity assert when `PG_CRON_COVERAGE_TARGET=validation`; resolver-routed mode + header comment rewrite |
| `tests/cross-cutting/pgCronCiVacuity.test.ts` | EDIT — dead-endpoint injection moves to loopback `LOCAL_TEST_DATABASE_URL` (§3.1, R5-1) |
| `tests/db/_metaLocalDbUrlGuard.test.ts` | EDIT — guarded-reader census 56 → 57 + message (§3.1, R6-1; the scanner itself needs no change — it already walks all of `tests/`) |
| `BACKLOG.md` / `BACKLOG-archive.md` | EDIT — graduate the four entries (archive move, not in-place terminal status) |
| `.github/workflows/x-audits.yml` | EDIT — comment block only: the "INHERITED CEILING" rewrite (§9); no wiring change |
| parent spec §10/§11 | EDIT — status notes pointing here (see §9) |

No migrations. No UI. No advisory-lock surfaces. No workflow WIRING changes — jobs, steps, and
env untouched (both CI jobs already carry what this design needs:
`.github/workflows/x-audits.yml:313-346` and `.github/workflows/x-audits.yml:348-394`) — but one
comment block in `x-audits.yml` is rewritten by §9's lockstep (its "inherited ceiling" claim
becomes false when §3.1 lands).

## 1. Problem

Four holes in the Drive-ID coverage guard family, each documented as a known limitation in the
parent spec §10 and filed rather than fixed:

1. **Target binding** (§10 item 5): `validation-schema-parity` and `pg-cron-validation-parity`
   trust `TEST_DATABASE_URL`'s authority string. libpq `?host=`/`hostaddr=`/duplicate keyword
   fields override the displayed authority, so a URL that *looks* like the validation pooler can
   connect anywhere and every authority-based check passes. The existing pg-cron precheck
   (`tests/cross-cutting/pg-cron-coverage.test.ts:168-171`) is substring containment — same class.
2. **Definition match** (§10 item 4): the validation CHECK layer
   (`tests/db/validation-schema-parity.test.ts:223-291`) matches bare `conname`s. A same-named
   constraint on another public table, or one weakened to `CHECK (true)`, satisfies it.
3. **Census self-check** (§10 item 2): if `CENSUS_COLUMNS_SQL`
   (`lib/driveIdCoverage/introspect.ts:32-41`) is narrowed — predicate, schema list, added filter —
   the lost columns vanish from census AND audit, and the suite stays green. Four anti-vacuity
   mechanisms were tried in parent rounds R2-R4 and each was defeated; the ratified interim control
   is review of ~15 lines.
4. **Behavioral coverage** (§10 item 1): 7 of 23 constrained columns carry an execution probe
   (`tests/db/driveFileIdNonblank.db.test.ts`); the other 16 are declaration-covered only, and
   nothing forces a probe for a FUTURE constrained column.

## 1.1 Resolved scope — do not relitigate

- **One PR for all four entries** — owner decision 2026-07-26 (this session), after an explicit
  one-vs-split question. Do not propose splitting.
- **The parent spec's defeated mechanisms stay defeated.** Count floors, committed census
  artifacts, broad-predicate cross-checks, and runtime-derived canonical templates were each tried
  and shown unsound (parent §4.2, §10 item 2, `lib/driveIdCoverage/audit.ts:57-63`). This design
  does not resurrect any of them; the census self-check below is a *different* mechanism
  (independent second derivation), not a repaired floor.
- **Authority/username parsing of the DSN is ratified theatre** (parent §10 item 5, restated in
  the repo-root `BACKLOG.md` entry's fix direction). The fix interrogates the connected server.
  Do not propose parsing the URL harder.
- **The conname CHECK layer stays** alongside the new audit layer (§3.2). It anchors to migration
  text — a different root of trust than the live census — and catches name-only drift the auditor
  deliberately ignores. Deleting it is out of scope.
- **Both canonical forms accepted for either nullability** — parent §1.1 item 3, implemented at
  `lib/driveIdCoverage/audit.ts:113-121`. Unchanged here.
- **Exemption lists cannot catch unjustified rows** (parent §10 item 3). Inherited by the new
  probe-exemption list; not solvable mechanically; not re-argued.
- **`workflow_dispatch` verification before merge** is the close-out gate for the CI-bound
  surfaces (AGENTS.md "local-passes-CI-fails" rule); local green is necessary, not sufficient.

## 2. Ground truth (measured 2026-07-26, this session's probes)

All four probes ran against the LIVE validation project (session pooler,
`TEST_DATABASE_URL` from `.env.local`) and the local all-migrations-applied stack:

1. **`pg_control_system()` is reachable through the validation session pooler** under the job's
   role, and returns `system_identifier = 7642734024280108049`. The local stack returns
   `7663370806147170344`. Distinct, stable, initdb-time facts of the *connected* cluster —
   exactly the identity fact the `BL-VALIDATION-TARGET-BINDING` entry calls for.
2. **Validation census == local census**: the exact `CENSUS_COLUMNS_SQL` predicate run on both
   returns 23 identical `(schema, table, column)` tuples; validation carries the full `dev`
   schema.
3. **A pg_catalog-derived census agrees with the information_schema census** on the local stack:
   23 = 23, set-identical.
4. **Every validation constraint renders canonically**: all 23 columns' CHECKs on validation
   deparse to exactly `canonicalBare`/`canonicalNullable` form
   (`lib/driveIdCoverage/audit.ts:65-71`) — the new audit layer passes on day one.
5. **The `postgres` driver surfaces the violated constraint's identity** on a 23514 error:
   measured fields `code`, `schema_name`, `table_name`, `constraint_name` (probe: blank insert
   into `agenda_extract_leases` → `constraint_name =
   'agenda_extract_leases_drive_file_id_nonblank'`). §3.4's rejection binding rests on this.

## 3. Design

### 3.1 E1 — target binding: pin the cluster's `system_identifier`

New module (§0's identity module):

```ts
export const VALIDATION_SYSTEM_IDENTIFIER = "7642734024280108049";
```

plus `assertValidationIdentity(dbUrl)`: run
`select system_identifier from pg_control_system()` on the given DSN (psql, same
`PGCONNECT_TIMEOUT`/process-timeout posture as `tests/db/validation-schema-parity.test.ts:95-96`)
and throw unless the result equals the pinned constant. Two distinguishable failures:

- **connection/query failure** → error says the identity probe itself failed (infra), with the
  underlying psql error;
- **mismatch** → error prints BOTH identifiers and the remediation: if validation was
  re-provisioned, update `VALIDATION_SYSTEM_IDENTIFIER` in a reviewed diff; otherwise the job is
  pointed at the wrong database and the DSN must be fixed.

**The guarantee rides the SAME connection as each assertion** (R1 finding 2). A once-per-suite
probe binds nothing: both suites launch a fresh `psql` process per query
(`tests/db/validation-schema-parity.test.ts:98-106` and
`tests/db/validation-schema-parity.test.ts:262-276`;
`tests/cross-cutting/pg-cron-coverage.test.ts:111`), and a multi-host or failover DSN could pass
identity on one connection and run assertions on another cluster. So the identity module also
exports `withValidationIdentityGuard(sql)`, which PREPENDS a guard block to the query text:

```sql
do $$ begin
  if (select system_identifier::text from pg_control_system())
     <> '7642734024280108049' then
    raise exception 'validation identity guard: connected cluster is not validation';
  end if;
end $$;
```

`DO` emits no rows (no output pollution for `-qAt` parsing) and aborts the script under
`ON_ERROR_STOP=1`, so every guarded query proves its OWN connection before its payload runs.
(The literal in the module is interpolated from `VALIDATION_SYSTEM_IDENTIFIER`; shown inline here
for concreteness.)

Call sites — every statement a validation-targeting suite sends, enumerated (the R1-2 class
sweep):

- `tests/db/validation-schema-parity.test.ts`: the layer-2 manifest introspection psql call and
  the CHECK-parity psql call wrap their SQL in `withValidationIdentityGuard` when
  `TEST_DATABASE_URL` is set; the §3.2 audit layer runs the same guard block INSIDE its census
  transaction, on its own `postgres` connection, before the census queries. Unset (local dev)
  skips the guard: the local target is deliberate there.
- `tests/cross-cutting/pg-cron-coverage.test.ts` — every query it issues under
  `PG_CRON_COVERAGE_TARGET=validation` is wrapped
  (`tests/cross-cutting/pg-cron-coverage.test.ts:157-171` is the gate). The existing env-presence
  refusals stay; the ref-containment check stays as a cheap pre-connect misconfiguration message,
  but the *guarantee* becomes the per-connection guard.

`assertValidationIdentity(dbUrl)` remains as the suite's FIRST validation-touching test so the
mismatch case fails with the discriminable two-identifier message above; the per-query guard is
what makes the guarantee non-detachable from the work.

**Reachability probes are exempt from the guard, deliberately** (R2 finding 3). `canConnect`
(`tests/db/validation-schema-parity.test.ts:108-120`) and pg-cron's module-scope reachability
probe feed no assertion with data; their job is routing between skip/throw. On a wrong-cluster
target they return true and the FIRST GUARDED query then aborts with the identity message — a
correct red with the right diagnosis. The exemption is stated at both probe sites in a comment.
One probe needs more than a comment: pg-cron's `livePsqlReachable`
(`tests/cross-cutting/pg-cron-coverage.test.ts:115-124`) currently catches everything into `false`,
which would relabel an identity abort as generic "psql unreachable" in the CI `beforeAll`. It
becomes tri-state — `reachable` / `identity_mismatch` / `unreachable` — by running one guarded
`select 1` when the target is validation and classifying a caught guard exception (matched on
the guard's exception text) as `identity_mismatch`; the gate test reports the identity message
for that state.

**Mode resolution fails closed, with NO DSN judgment** (R3 finding 2; redesigned after R4
finding 1 showed a loopback-authority classification reintroduces the ratified theatre —
`?host=`/`hostaddr=` override the displayed authority, so no string test on the DSN may ever
route trust). `coverageTarget` defaults to `"local"` and only the exact string `"validation"`
activates the ref check and the guards (`tests/cross-cutting/pg-cron-coverage.test.ts:98`,
`tests/cross-cutting/pg-cron-coverage.test.ts:141`,
`tests/cross-cutting/pg-cron-coverage.test.ts:154`) — today a removed, empty, or misspelled
`PG_CRON_COVERAGE_TARGET` with the remote DSN still wired runs every reachable query
IDENTITY-UNGUARDED against whatever the DSN reaches. The pure resolver
(`unreachableDbFailure` is the template, `lib/driveIdCoverage/introspect.ts:103-119`) removes the
DSN from the decision entirely:

`resolvePgCronMode({ target, testDatabaseUrl, localTestDatabaseUrl })` →

- `target === "validation"` → `{ mode: "validation", dbUrl: testDatabaseUrl }` (throwing the
  existing refusals if the DSN or ref env is missing/empty). Every query on this path is
  per-connection identity-guarded, so DSN games are answered by the guard, not by parsing.
- `target` unset, empty, or `"local"` → `{ mode: "local", dbUrl: localTestDatabaseUrl ??
  LOCAL_LOOPBACK_URL }`. Local mode joins the established local-DB class (R5 finding 1): the
  override var is `LOCAL_TEST_DATABASE_URL`, and — so the existing scanner recognizes the guard
  in its established shape (R6 finding 1: `tests/db/_localDbUrlScan.ts` recognizes only direct
  calls to the imported guard at the reading file) — the SINGLE env read at the pg-cron call
  site is wrapped directly: `localTestDatabaseUrl:
  assertLocalDbUrlIfSet(process.env.LOCAL_TEST_DATABASE_URL)`. The value reaching the pure
  resolver is therefore already loopback-enforced (`tests/db/_localDbUrl.ts`), governed by the
  `_metaLocalDbUrlGuard` structural regime, absent from `.env.local`, and already the var every
  `*.db.test.ts` uses for exactly this purpose. The scanner already walks all of `tests/`
  recursively — no scan-scope change; the lockstep edit is the guarded-reader census in
  `tests/db/_metaLocalDbUrlGuard.test.ts:393-403` (56 → 57, message updated). `TEST_DATABASE_URL` is IGNORED in local mode, so
  an ambient remote DSN (the `.env.local` dev-box case, or a workflow that dropped the target
  line but kept the secret) can never be reached unguarded — retiring the pre-existing exposure
  where a dev-box run with ambient `TEST_DATABASE_URL` ran pg-cron live assertions against
  validation while claiming local coverage. The loopback-only override keeps the executable
  anti-vacuity controls workable: `tests/cross-cutting/pgCronCiVacuity.test.ts:99` and
  `tests/cross-cutting/pgCronCiVacuity.test.ts:107` currently inject their dead endpoint via
  `TEST_DATABASE_URL`; they switch to `LOCAL_TEST_DATABASE_URL` with a dead LOOPBACK endpoint
  (loopback host, port 1), which `assertLocalDbUrl` admits and nothing answers — both controls
  keep proving fail/skip, now against the variable local mode actually reads. And because the
  vacuity harness's child inherits ambient `process.env`
  (`tests/cross-cutting/pgCronCiVacuity.test.ts:45`), ALL THREE local-mode child invocations —
  the CI-fail control at `tests/cross-cutting/pgCronCiVacuity.test.ts:99`, the local-skip
  control at `tests/cross-cutting/pgCronCiVacuity.test.ts:107`, and the reachable control at
  `tests/cross-cutting/pgCronCiVacuity.test.ts:116` — explicitly pin
  `PG_CRON_COVERAGE_TARGET: "local"`, so an ambient `validation` target on the invoking shell
  cannot reroute them (R6 finding 2).
- any OTHER target string (misspelling) → THROW. Unknown mode names never downgrade.

DB-free unit tests cover all five cases; the negative controls are the misspelled-target throw
and the local-mode result ignoring a supplied remote `testDatabaseUrl` while honoring a loopback
`localTestDatabaseUrl`. (Verified: the only other pg-cron x-audits job, `x6-pg-cron-pivot` at
`.github/workflows/x-audits.yml:244-274`, runs four static audit files — not this suite — and
sets neither env var; the live local consumer is `unit-suite-db`, whose stack listens on the
loopback default.)

**The resolver is bound to its consumer structurally** (R4 finding 2 — an unused helper passes
its own unit tests while the fail-open path survives). A source-structural test (same file as the
resolver's unit tests) asserts `tests/cross-cutting/pg-cron-coverage.test.ts` reads
`process.env.PG_CRON_COVERAGE_TARGET`, `process.env.TEST_DATABASE_URL`, AND
`process.env.LOCAL_TEST_DATABASE_URL` ONLY as arguments to `resolvePgCronMode`, and derives
`coverageTarget`/`databaseUrl` only from its return value — so the module cannot compile a
second, unresolved path to any of the three env vars without going red. The
`_metaLocalDbUrlGuard` scan already reaches the new `LOCAL_TEST_DATABASE_URL` read (recursive
`tests/` walk); the only lockstep edit is the census bump named above. So the binding contract, stated precisely: **every statement whose result any
assertion consumes travels through the guard on its own connection; reachability probes either
carry the guard with tri-state classification (pg-cron) or are guard-exempt with the
first-guarded-query backstop (parity `canConnect`).** AC-1 uses this contract.

**No thrown error may carry the DSN** (R2 finding 1 — `execFileSync` errors embed every argv
verbatim, including a credential-bearing `TEST_DATABASE_URL`; reviewer probe-confirmed on Node
20). The identity module exports the single psql runner both suites use for validation-targeting
calls: it invokes psql, and on ANY failure rethrows with the DSN replaced by
`<TEST_DATABASE_URL redacted>` in message, argv echo, and stderr passthrough. The identity
assert's "underlying psql error" clause means the REDACTED error. All touched call sites
(identity assert, layer-2 introspection, CHECK parity, all pg-cron live queries, the tri-state
probe) route through it — which also retires the PRE-EXISTING leak on those paths: today a
failed `introspectManifest` or CHECK-parity exec already prints the DSN via the raw
`execFileSync` error. A unit test forces a failure through the runner with a
sentinel-password DSN and asserts the sentinel appears nowhere in the thrown error.

**The contract covers CONSTRUCTED messages, not only runner throws** (R3 finding 1). pg-cron
builds two messages that interpolate `databaseUrl` raw — the CI-unreachable throw
(`tests/cross-cutting/pg-cron-coverage.test.ts:174-183`) and the local skip warning
(`tests/cross-cutting/pg-cron-coverage.test.ts:184-190`); those are the only two raw-DSN
emissions in either touched suite (swept: every `databaseUrl`/`dbUrl` interpolation into a
message string; `validation-schema-parity.test.ts` interpolates none — its messages name the env
VAR, and its `LOCAL_DB_URL` literal carries no secret). Both are rewritten to the redacted form,
and the sentinel unit test additionally exercises the message-builder path for the CI-unreachable
error so a reintroduced raw interpolation goes red, not just runner throws.

Negative controls that run on every developer box: asserting identity against the LOCAL stack
must throw with the mismatch message (local identifier ≠ pinned), and a
`withValidationIdentityGuard`-wrapped `select 1` against the LOCAL stack must abort with the
guard exception. Positive control is the CI run itself.

Why not `cluster_name` (frequently empty), `current_user` (a role name is creatable anywhere),
or the DSN (ratified theatre): none is a fact OF the connected cluster that a mis-target could
not coincidentally satisfy. `system_identifier` is set at initdb and unique per cluster.

### 3.2 E2 — definition match: run the real auditor against validation

Extract `censusInPinnedTx` (verbatim semantics, including the `set local search_path` pin and
in-tx `current_setting` assert — `tests/db/driveIdCoverage.db.test.ts:105-129`) into §0's shared
census-runner module, parameterized by the `postgres` client handle. The live local suite imports
it unchanged.

New layer in `tests/db/validation-schema-parity.test.ts` (runs only when `TEST_DATABASE_URL` is
set, mirroring the CHECK layer's skip posture at `tests/db/validation-schema-parity.test.ts:247-248`;
identity-bound per §3.1):

1. open a `postgres` client on `TEST_DATABASE_URL`, run the shared census runner;
2. `auditDriveIdCoverage(columns, constraints, DRIVE_ID_COVERAGE_EXEMPTIONS)` → expect `[]`.
   Tuple-keyed, definition-matched, column-substituted — the exact three properties the
   `BL-VALIDATION-PARITY-DEFINITION-MATCH` fix direction asks for, from the same single source of canonicality
   (`lib/driveIdCoverage/audit.ts`), so validation and local can never disagree about what
   "covered" means.

Anti-vacuity (two independent floors, neither a bare count):

- **Manifest-derived expected set**: every column in the committed
  `supabase/__generated__/schema-manifest.json` whose name matches the census regex must appear
  in the validation census's public slice. The manifest is BASE-TABLE/public-only introspection
  (`scripts/schema-manifest/lib.ts:238-246`) with its own layer-1 freshness tripwires, so this
  cross-anchors the validation census to a committed artifact that cannot silently go stale.
- **Dev-slice anchor** (R1 finding 3 — a presence floor let any proper subset of the six dev
  tuples vanish silently): the validation census's `dev` slice must SET-EQUAL a committed
  six-tuple list `EXPECTED_DEV_CENSUS` in the census-runner module. Both directions bite: a
  missing dev tuple is red (drift — a migration that never reached validation), and a NEW dev
  tuple is red until the list is extended in a reviewed diff. This is not the parent's defeated
  committed-artifact class: that artifact tried to make the census query self-checking and was
  defeated by regeneration; this list anchors a REMOTE database's expected content and is
  hand-maintained exactly like `PUBLIC_NONBLANK_TABLES`
  (`tests/db/driveFileIdNonblank.db.test.ts:27-43`) and the CHECK layer's lockstep count 17
  (`tests/db/validation-schema-parity.test.ts:243`), both already in-tree and load-bearing.
  The `public`+`dev` schema floor (same shape as the local floor,
  `tests/db/driveIdCoverage.db.test.ts:260-266`) is subsumed by the two anchors and kept only in
  the local suite.

The auditor's correctness under mutation is already proven by the local suite's negative control
(`tests/db/driveIdCoverage.db.test.ts:151-209`); this layer reuses, not re-proves, it.

### 3.3 E3 — census self-check: an independently-derived second census

Add to `lib/driveIdCoverage/introspect.ts`:

```sql
-- CENSUS_COLUMNS_PG_CATALOG_SQL (fully literal, zero bind parameters)
select n.nspname as table_schema, c.relname as table_name, a.attname as column_name
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'dev')
   and c.relkind in ('r', 'p')
   and a.attnum > 0
   and not a.attisdropped
   and a.attname ~ 'drive_file_id'
 order by 1, 2, 3
```

Independence is the mechanism, so it is structural, not stylistic:

- **No shared constants.** The schema list and predicate are literals here, deliberately NOT
  `CENSUS_SCHEMAS`/`CENSUS_COLUMN_PREDICATE`. A comment on both queries states that narrowing the
  guard's scope requires editing BOTH sites in one diff and forbids deduplication. This is what
  makes the defeat visible: the four parent-round mechanisms all derived their check from the
  same artifact they checked; this one does not.
- **Different catalog path.** `information_schema.columns` + `information_schema.tables` vs
  `pg_attribute`/`pg_class`/`pg_namespace`. `relkind in ('r','p')` mirrors `BASE TABLE`
  semantics (plain + partitioned tables), excluding views and foreign tables exactly as the
  primary census does (`lib/driveIdCoverage/introspect.ts:26-31`).

New tests in `tests/db/driveIdCoverage.db.test.ts`, same pinned-tx discipline:

1. **DUAL-SOURCE CROSS-CHECK**: the `(schema, table, column)` tuple set from
   `CENSUS_COLUMNS_SQL` set-equals the set from `CENSUS_COLUMNS_PG_CATALOG_SQL`. A narrowing edit
   to either query alone goes red.
2. **Cross-check negative control**: run the pg_catalog query inline with a narrowed predicate
   (`'drive_file_idX'`) and assert the resulting set is a strict subset that the comparison in
   (1) would reject — proving the set-equality actually bites, not merely that today's sets agree.

Comparison is on tuples only; nullability is out of scope for the cross-check because coverage
matching accepts both canonical forms for either nullability (`lib/driveIdCoverage/audit.ts:117-120`)
— a nullability lie changes no audit outcome.

**One injective tuple key for every set mechanism** (R2 finding 2). Postgres identifiers may
contain dots when quoted, so `schema.table.column` string-joins are not injective — the audit
already keys by JSON-encoded tuples for exactly this reason
(`lib/driveIdCoverage/audit.ts:88-97`). The census-runner module exports `censusTupleKey` =
`JSON.stringify([schema, table, column])`, and ALL FOUR new set mechanisms use it: the §3.2
manifest membership and `EXPECTED_DEV_CENSUS` equality, this section's dual-source equality, and
§3.4's completeness/stale/duplicate/overlap checks. Collision negative control in the DB-free
unit suite: `public.a."b.drive_file_id"` and `public."a.b".drive_file_id` produce distinct keys.

**Honest residue** (stated in §8): a deliberate, *identical* narrowing of both literal sites in
one diff still wins. That is irreducible by construction — any in-repo mechanism can be edited in
the same diff that defeats it. What this buys over the ratified status quo: an accidental or
single-site narrowing goes red instead of green, and the deliberate defeat now requires two
suspicious-looking edits in one reviewable diff (R1 finding 5: exactly two — an identical
narrowing complies with the comment's edit-both-sites instruction, so the comment adds review
salience, not a third required edit).

### 3.4 E4 — behavioral coverage: probe registry with fail-by-default completeness

Restructure `tests/db/driveFileIdNonblank.db.test.ts` around a registry:

```ts
type DriveIdProbe = {
  schema: "public" | "dev";
  table: string;
  column: string;
  nullable: boolean;
  constraintName: string;       // the canonical CHECK this probe exercises, verified live
  siblings: string;             // column-list fragment for the NOT NULL siblings, e.g. "wizard_session_id"
  siblingValues: string;        // values fragment for those siblings (literals/functions), e.g. "gen_random_uuid()"
  setup?: string;               // optional in-tx parent insert (FK targets), rolled back with everything else
};
export const DRIVE_ID_PROBES: DriveIdProbe[] = [ /* 23 rows */ ];
export const PROBE_EXEMPTIONS: { schema: string; table: string; column: string; reason: string }[] = [];
```

- **The claim IS the execution** (R1 finding 1 — a free-form `insert` string could claim tuple X
  while probing tuple Y, and both the completeness check and the generated test would pass).
  Rows carry NO free-form statement. The generated test CONSTRUCTS the insert from the claimed
  tuple itself — `insert into ${schema}.${table} (${siblings}, ${column}) values
  (${siblingValues}, $1)` — so the probed column and table cannot diverge from the claim; only
  sibling scaffolding is row-authored.
- **The rejection is bound to the claimed column's constraint.** Reject assertions require
  SQLSTATE 23514 AND `error.constraint_name === row.constraintName` AND
  `error.schema_name`/`error.table_name` equal to the claimed tuple's (all four fields measured
  on the driver, §2 item 5) — a 23514 thrown by some OTHER check on the row no longer passes. The
  completeness meta-test verifies each row's `constraintName` live: it must exist on the claimed
  `(schema, table)` in the census constraints with definition exactly
  `canonicalBare(column)`/`canonicalNullable(column)` (`lib/driveIdCoverage/audit.ts:65-71`) —
  chaining claim → constraint → canonical definition → observed rejection. (Explicit
  `constraintName` rather than a derived `<table>_<column>_nonblank`, because U3 broke that
  convention — parent §3.1.)
- **`nullable` is not self-reported either**: the meta-test compares each row's `nullable`
  against the live census's nullability for that tuple.
- **Generated tests** (`test.for` over the registry): reject `''`, `'   '`, `'\t'` with the bound
  constraint; accept a valid id; nullable columns additionally accept `NULL`. Reuses the existing
  rollback-always probe helpers (`tests/db/driveFileIdNonblank.db.test.ts:68-98`) — zero residue
  even while red; a row's optional `setup` (FK parent insert) runs inside the same rolled-back
  transaction.
- **The existing 7 hand-written probes become registry rows** (their load-bearing comments — the
  composite-PK note, the defaults notes — move to the rows). The 16 missing rows are added: 11
  public (`pending_syncs`, `pending_ingestions`, `sync_audit`, `deferred_ingestions`,
  `onboarding_scan_manifest`, `pending_snapshot_uploads`, `revision_race_cooldowns`,
  `shows_pending_changes`, `show_change_log`, `sync_holds`, `sync_log`) and 5 dev mirrors
  (`dev.pending_ingestions`, `dev.pending_syncs`, `dev.shows.drive_file_id`, `dev.sync_audit`,
  `dev.sync_log`). Per-table NOT NULL sibling shapes are enumerated at plan time from live
  introspection (the parent's "mechanical, bounded, unglamorous", per the
  `BL-DRIVEID-BEHAVIORAL-COVERAGE` entry).
- **Completeness meta-test**: run the shared census runner live; every census tuple must appear
  in `DRIVE_ID_PROBES ∪ PROBE_EXEMPTIONS`. A FUTURE constrained column therefore fails this suite
  by default until it gets a probe or a reviewed exemption row — the upgrade from "sample" to
  "registry-enforced total". Exemption hygiene mirrors ALL of the audit's applicable rules (empty
  reason, duplicate key, row for a column the census no longer returns → red;
  `lib/driveIdCoverage/audit.ts:141-177` is the template) PLUS the `now_covered` analogue (R1
  finding 4): a tuple present in BOTH `DRIVE_ID_PROBES` and `PROBE_EXEMPTIONS` is red — otherwise
  a stale exemption silently takes over if its probe is later deleted. List ships EMPTY.
- **Stale-probe guard**: registry rows for tuples the census does NOT return also fail (dead
  probes lie about coverage).
- **CI fail-not-skip**: this suite currently `skipIf(!dbUp)`s everything. Now that it hosts a
  guard, it adopts `unreachableDbFailure` (`lib/driveIdCoverage/introspect.ts:103-119`) exactly as
  `tests/db/driveIdCoverage.db.test.ts:79-91` does: skip locally without a stack, throw in CI.

## 4. Guard conditions (per input)

| input | absent / degenerate | behavior |
| ----- | ------------------- | -------- |
| `TEST_DATABASE_URL` unset | local dev | validation layers + identity assert skip (local guard covers locally) |
| `TEST_DATABASE_URL` empty string | CI misconfig | loud throw (existing posture, `tests/db/validation-schema-parity.test.ts:77-83`) |
| identity probe cannot connect | infra fault | throw as infra failure, never "identity mismatch" |
| `system_identifier` mismatch | wrong DB / re-provisioned | throw with both values + remediation |
| guarded query lands on a non-validation connection | multi-host / failover DSN | in-script `DO` guard aborts under `ON_ERROR_STOP` (§3.1) |
| psql invocation fails, DSN in argv | any failure incl. forced identity aborts | shared runner rethrows with DSN redacted (§3.1, R2-1) |
| suite-constructed message embeds `databaseUrl` | pg-cron CI throw / local warn | both rewritten redacted; sentinel test covers the builder (§3.1, R3-1) |
| `PG_CRON_COVERAGE_TARGET` unset/empty/`local` with ambient remote DSN | fail-open bypass of guards | local mode reads only the `assertLocalDbUrlIfSet`-guarded override or the loopback constant; the remote DSN is never touched (§3.1, R3-2/R4-1/R6-3) |
| `PG_CRON_COVERAGE_TARGET` misspelled | unknown mode | `resolvePgCronMode` throws — never downgrades (§3.1) |
| env vars read outside the resolver | detached helper | source-structural binding test red (§3.1, R4-2) |
| pg-cron reachability probe hits wrong cluster | identity abort in probe | tri-state `identity_mismatch`, reported as identity failure, never "unreachable" (§3.1, R2-3) |
| local DB down, `CI` set (incl. empty string) | CI infra fault | throw (`unreachableDbFailure`, presence-not-truthiness) — now also in the probes suite |
| local DB down, `CI` unset | dev box, no stack | skip |
| census returns 0 rows / one schema | narrowed or wrong DB | schema floor red locally (`tests/db/driveIdCoverage.db.test.ts:260-266`); manifest + dev anchors red on validation (§3.2) |
| validation dev slice ≠ committed six-tuple list | drift or new dev column | red both directions (§3.2 dev-slice anchor) |
| exemption row empty reason / duplicate / stale | malformed list | red (audit rules; probe list mirrors) |
| tuple in BOTH probes and probe-exemptions | blinding overlap | red (§3.4, R1-4) |
| registry row for a non-census tuple | stale probe | red (§3.4 stale-probe guard) |
| registry `constraintName`/`nullable` disagree with live census | mislabeled row | red (§3.4 binding checks) |

## 5. Self-consistency anchors

Single named definitions later sections reference; no other section restates the values:

- `VALIDATION_SYSTEM_IDENTIFIER = "7642734024280108049"` — only in §0's identity module (the
  `withValidationIdentityGuard` SQL interpolates it; no second literal).
- `EXPECTED_DEV_CENSUS` (six tuples, §3.2) and `censusTupleKey` (§3.3, R2-2) — only in §0's
  census-runner module.
- The redacting psql runner (§3.1, R2-1) — only in §0's identity module; both suites import it.
- Census scope (`public`+`dev`, BASE TABLE semantics, `drive_file_id` POSIX regex) — defined by
  the two queries in `lib/driveIdCoverage/introspect.ts`; every count in this spec (23 columns,
  7 probed, 16 missing, 17 public / 6 dev) is a 2026-07-26 measurement of that scope, cited from
  §2, and appears in prose only — never as a hardcoded test assertion. The tests assert set
  relations (cross-source equality, manifest-derived membership, registry completeness), which
  move with the schema without a lockstep constant.

## 6. Non-goals

- No change to what "covered" means (canonical templates, both-forms acceptance).
- No re-architecture of the conname CHECK layer or the manifest layers 1-3.
- No sweep of other suites' target-binding (only the two validation jobs' suites named here);
  a broader adoption is trivial once the identity module exists but is not this PR.
- No nullability cross-check between the two census sources (§3.3, no audit consequence).
- No attempt to make exemption lists judge their own justification (parent §10 item 3).

## 7. Acceptance criteria

- **AC-1** `assertValidationIdentity` throws on the local stack (mismatch path, runs on every dev
  box + CI), passes against validation in both x-audits jobs; infra vs mismatch failures are
  distinguishable; the §3.1 binding contract holds — every assertion-feeding statement guarded on
  its own connection, pg-cron's reachability probe tri-state, parity `canConnect` exempt with the
  first-guarded-query backstop; a guarded `select 1` against the local stack aborts (negative
  control); no error thrown by the shared psql runner AND no constructed message in either suite
  contains the DSN (sentinel-password unit test covers both the runner path and the pg-cron
  CI-unreachable message builder); `resolvePgCronMode` decides mode from the TARGET alone —
  local mode reads only the loopback-enforced `LOCAL_TEST_DATABASE_URL` override or the loopback
  constant, ignores `TEST_DATABASE_URL`, misspelled targets throw (five-case DB-free test) — the
  source-structural binding test proves pg-cron reads all three env vars only through the
  resolver, and both pgCronCiVacuity controls still prove fail/skip via the loopback dead
  endpoint.
- **AC-2** The validation audit layer runs `auditDriveIdCoverage` over a pinned-tx census of the
  validation DB and reports `[]`; manifest-derived public membership + the `EXPECTED_DEV_CENSUS`
  set-equality both assert; layer skips when `TEST_DATABASE_URL` unset.
- **AC-3** Dual-source cross-check asserts set-equality of the two censuses; its negative control
  proves a narrowed predicate would be caught; both queries carry the no-dedup comment.
- **AC-4** All 23 census tuples are probed or exempted; probes execute SQL constructed FROM the
  claimed tuple; rejections assert `code` + `constraint_name` + `schema_name`/`table_name`
  against the row; the meta-test verifies each `constraintName` and `nullable` against the live
  census, fails on an unregistered census tuple, a registered non-census tuple, AND a
  probes∩exemptions overlap; `PROBE_EXEMPTIONS` ships empty; the probes suite throws (not skips)
  on unreachable DB in CI.
- **AC-7** All four set mechanisms key by `censusTupleKey` (JSON-encoded tuples); the collision
  negative control (quoted-identifier pair → distinct keys) passes in the DB-free unit suite.
- **AC-5** The four BACKLOG entries graduate to `BACKLOG-archive.md` in this PR (no in-place
  terminal statuses — `tests/docs/_metaDeferralLedgerGraduation.test.ts` enforces); parent spec
  §10/§11 and the `BL-PG-CRON-COVERAGE-UNRUN` inheritance note get pointers here (§9).
- **AC-6** `pnpm spec:lint` on this doc adds zero hard failures; full local suite green; real CI
  green including an `x-audits` `workflow_dispatch` run observed before merge.

## 8. Known limitations (deliberate, stated so review does not rediscover them)

1. **Identical two-site narrowing defeats the cross-check** (§3.3). Irreducible in-repo; the win
   is that the defeat is now a two-edit diff instead of silence (R1-5: the comment adds review
   salience, not a third required edit).
2. **`system_identifier` proves cluster identity, not semantic role.** If validation is ever
   re-provisioned the constant must be updated deliberately; until then the jobs are red, loudly.
   A future provider change that hides `pg_control_system()` behind the pooler is also a loud red,
   never a silent pass.
3. **The registry totalizes over the CENSUS, not over reality.** Parent §10 item 6's scope edges
   (third schema, unrelated column names, foreign tables) bound every mechanism here too.
4. **Probe sibling scaffolding freezes sibling requirements.** A future NOT NULL sibling added to
   a probed table breaks that probe loudly (the constructed insert fails with a non-23514 error,
   surfaced by the helper's strict error filtering) — mildly noisy, never silently green.
5. **Validation-layer anchors depend on their own maintenance.** The manifest anchor rides
   layer-1 freshness tripwires; `EXPECTED_DEV_CENSUS` is hand-maintained (set-equality makes
   staleness loud in both directions, but a reviewer approving a wrong list edit is out of scope,
   same as any committed expectation).

## 9. Doc lockstep (same PR)

- Move the four entries (with provenance) from the repo-root `BACKLOG.md` to
  `BACKLOG-archive.md`, statused RESOLVED with this spec's path.
- Parent spec §10 items 1/2/4/5: append one-line status notes ("closed by this spec's §3.x");
  §11 table rows likewise. §10 items 3/6 stand.
- The `BL-PG-CRON-COVERAGE-UNRUN` entry ("this job inherits `BL-VALIDATION-TARGET-BINDING`"):
  update to record the ceiling is closed by §3.1.
- The pg-cron suite header's mode description
  (`tests/cross-cutting/pg-cron-coverage.test.ts:27-29` — "runs against whatever
  TEST_DATABASE_URL points at") and the two vacuity-control comments describing
  `TEST_DATABASE_URL` injection (`tests/cross-cutting/pgCronCiVacuity.test.ts:95-107` spans
  both) are rewritten with the resolver-era semantics (R5 finding 2).
- Two source comments this design makes false are rewritten in the same PR (R3 finding 4):
  `lib/driveIdCoverage/introspect.ts:7-10` ("a regression in THIS query is not self-detecting …
  the control on it is review of these ~15 lines") — rewritten to name the §3.3 dual-source
  cross-check as the mechanical control, with review remaining only for the identical-two-site
  residue; and the `x-audits.yml` "INHERITED CEILING" block
  (`.github/workflows/x-audits.yml:365-370`) — rewritten to record that the connected-server
  identity guard now proves the target, citing this spec.
- No §12.4 catalog rows touched (no error-code changes).
