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
| `tests/db/validation-schema-parity.test.ts` | EDIT — identity assert; new drive-id audit layer vs validation |
| `tests/cross-cutting/pg-cron-coverage.test.ts` | EDIT — identity assert when `PG_CRON_COVERAGE_TARGET=validation` |
| `BACKLOG.md` / `BACKLOG-archive.md` | EDIT — graduate the four entries (archive move, not in-place terminal status) |
| parent spec §10/§11 | EDIT — status notes pointing here (see §9) |

No migrations. No UI. No advisory-lock surfaces. No workflow YAML changes (both CI jobs already
carry the env this design needs: `.github/workflows/x-audits.yml:313-346` and
`.github/workflows/x-audits.yml:348-394`).

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

Call sites (assert once per suite run, before any target-dependent assertion):

- `tests/db/validation-schema-parity.test.ts` — when `TEST_DATABASE_URL` is set (layer 2, CHECK
  layer, and the new §3.2 layer all inherit the guarantee). Unset (local dev) skips the assert:
  the local target is deliberate there.
- `tests/cross-cutting/pg-cron-coverage.test.ts` — when `PG_CRON_COVERAGE_TARGET=validation`
  (`tests/cross-cutting/pg-cron-coverage.test.ts:157-171`). The existing env-presence refusals stay; the ref-containment check stays as a
  cheap pre-connect misconfiguration message, but the *guarantee* becomes the identity assert.

Negative control that runs on every developer box: asserting identity against the LOCAL stack
must throw with the mismatch message (local identifier ≠ pinned). Positive control is the CI run
itself.

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
- **Schema floor**: the validation census must span both `public` and `dev` (same shape as the
  local floor, `tests/db/driveIdCoverage.db.test.ts:260-266` — dev is not in the manifest, so
  the first floor cannot see it).

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

**Honest residue** (stated in §8): a deliberate, *identical* narrowing of both literal sites in
one diff still wins. That is irreducible by construction — any in-repo mechanism can be edited in
the same diff that defeats it. What this buys over the ratified status quo: an accidental or
single-site narrowing goes red instead of green, and the deliberate defeat now requires two
suspicious-looking edits plus a comment deletion in one reviewable diff.

### 3.4 E4 — behavioral coverage: probe registry with fail-by-default completeness

Restructure `tests/db/driveFileIdNonblank.db.test.ts` around a registry:

```ts
type DriveIdProbe = {
  schema: "public" | "dev";
  table: string;
  column: string;
  nullable: boolean;
  insert: string;            // parameterized insert; $N slot for the probed column
  params: (value: string | null) => (string | null)[];
};
export const DRIVE_ID_PROBES: DriveIdProbe[] = [ /* 23 rows */ ];
export const PROBE_EXEMPTIONS: { schema: string; table: string; column: string; reason: string }[] = [];
```

- **Generated tests** (`test.for` over the registry): reject `''`, `'   '`, `'\t'` with SQLSTATE
  23514; accept a valid id; nullable columns additionally accept `NULL`. Reuses the existing
  rollback-always probe helpers (`tests/db/driveFileIdNonblank.db.test.ts:68-98`) — zero residue
  even while red.
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
  "registry-enforced total". Exemption hygiene mirrors the audit's rules that apply here (empty
  reason, duplicate key, row for a column the census no longer returns → red;
  `lib/driveIdCoverage/audit.ts:141-177` is the template). List ships EMPTY.
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
| local DB down, `CI` set (incl. empty string) | CI infra fault | throw (`unreachableDbFailure`, presence-not-truthiness) — now also in the probes suite |
| local DB down, `CI` unset | dev box, no stack | skip |
| census returns 0 rows / one schema | narrowed or wrong DB | schema floor red (local suite `tests/db/driveIdCoverage.db.test.ts:260-266`; validation layer §3.2) |
| exemption row empty reason / duplicate / stale | malformed list | red (audit rules; probe list mirrors) |
| registry row for a non-census tuple | stale probe | red (§3.4 stale-probe guard) |

## 5. Self-consistency anchors

Single named definitions later sections reference; no other section restates the values:

- `VALIDATION_SYSTEM_IDENTIFIER = "7642734024280108049"` — only in §0's identity module.
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
  distinguishable in the message.
- **AC-2** The validation audit layer runs `auditDriveIdCoverage` over a pinned-tx census of the
  validation DB and reports `[]`; manifest-derived membership + schema floor both assert; layer
  skips when `TEST_DATABASE_URL` unset.
- **AC-3** Dual-source cross-check asserts set-equality of the two censuses; its negative control
  proves a narrowed predicate would be caught; both queries carry the no-dedup comment.
- **AC-4** All 23 census tuples are probed or exempted; the completeness meta-test fails on an
  unregistered census tuple AND on a registered non-census tuple; `PROBE_EXEMPTIONS` ships empty;
  the probes suite throws (not skips) on unreachable DB in CI.
- **AC-5** The four BACKLOG entries graduate to `BACKLOG-archive.md` in this PR (no in-place
  terminal statuses — `tests/docs/_metaDeferralLedgerGraduation.test.ts` enforces); parent spec
  §10/§11 and the `BL-PG-CRON-COVERAGE-UNRUN` inheritance note get pointers here (§9).
- **AC-6** `pnpm spec:lint` on this doc adds zero hard failures; full local suite green; real CI
  green including an `x-audits` `workflow_dispatch` run observed before merge.

## 8. Known limitations (deliberate, stated so review does not rediscover them)

1. **Identical two-site narrowing defeats the cross-check** (§3.3). Irreducible in-repo; the win
   is that the defeat is now a two-edit-plus-comment-deletion diff instead of silence.
2. **`system_identifier` proves cluster identity, not semantic role.** If validation is ever
   re-provisioned the constant must be updated deliberately; until then the jobs are red, loudly.
   A future provider change that hides `pg_control_system()` behind the pooler is also a loud red,
   never a silent pass.
3. **The registry totalizes over the CENSUS, not over reality.** Parent §10 item 6's scope edges
   (third schema, unrelated column names, foreign tables) bound every mechanism here too.
4. **Probe insert shapes freeze sibling requirements.** A future NOT NULL sibling added to a
   probed table breaks that probe loudly (insert fails with a non-23514 error, surfaced by the
   helper's strict error filtering) — mildly noisy, never silently green.
5. **Validation-layer floors depend on the manifest's own freshness tripwires** (layer 1). A
   simultaneously-stale manifest AND narrowed validation census is caught only by the dev-schema
   floor and the local dual-source check, not by the manifest floor itself.

## 9. Doc lockstep (same PR)

- Move the four entries (with provenance) from the repo-root `BACKLOG.md` to
  `BACKLOG-archive.md`, statused RESOLVED with this spec's path.
- Parent spec §10 items 1/2/4/5: append one-line status notes ("closed by this spec's §3.x");
  §11 table rows likewise. §10 items 3/6 stand.
- The `BL-PG-CRON-COVERAGE-UNRUN` entry ("this job inherits `BL-VALIDATION-TARGET-BINDING`"):
  update to record the ceiling is closed by §3.1.
- No §12.4 catalog rows touched (no error-code changes).
