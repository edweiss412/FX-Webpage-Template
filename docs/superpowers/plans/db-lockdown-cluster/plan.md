# Plan — DB lockdown trio

**Spec:** `docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md` (APPROVED cross-model at R8, 2026-08-03).
**Branch:** `feat/db-lockdown-cluster`. **Worktree:** `/Users/ericweiss/FX-worktrees/db-lockdown-cluster`.
**Implementer:** Opus / Claude Code. **Reviewer:** Codex.
**impeccable-gate: N/A — no UI surface.**

<!-- spec-lint: not-ui — app/ paths appear only as classified writer call sites; no file under app/ or components/ is modified. -->

**Verification command for every task:** `pnpm exec vitest run <file>`, against the local Supabase at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## 0. Pre-draft code verification (run, not promised)

| Claim | Verified at |
| --- | --- |
| `RPC_GATED_TABLES` row shape; 26 existing rows | `tests/db/postgrest-dml-lockdown.test.ts:138`, `tests/db/postgrest-dml-lockdown.test.ts:147` |
| Layer 1 privilege-matrix idiom | `tests/db/postgrest-dml-lockdown.test.ts:521` |
| **Layer 4 requires migration + registry row in the SAME commit** | `tests/db/postgrest-dml-lockdown.test.ts:811` |
| RLS probe derivation and arms | `tests/db/admin-rls-runtime.test.ts:85`, `tests/db/admin-rls-runtime.test.ts:131`, `tests/db/admin-rls-runtime.test.ts:177` |
| Canonical-CHECK parser and its name filter | `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:59`, `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:126` |
| `expectedBoundaryChecks` also demands an AC-X.5 manifest entry | `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202` |
| `ADMIN_TABLES`, 19 entries, generated | `lib/audit/admin-tables.generated.ts` |
| Established lockdown-migration shape | `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql` |
| Test discovery matches only `*.test.ts` / `*.test.tsx` | `vitest.projects.ts:34` |
| Partition guard walks the same suffix | `tests/cross-cutting/vitest-projects-partition.test.ts:36` |
| `tests/cross-cutting/**` is serial; `unit-suite-db` boots Postgres for it | `.github/workflows/unit-suite.yml:101`, `.github/workflows/unit-suite.yml:133` |
| 41 public relations, all `relkind='r'`; 39 RLS-enabled; 0 views/matviews/foreign/partitioned | live catalog probe, 2026-08-02 |
| 19 canonical-email CHECKs live; 16 name-visible, 3 not | live `pg_constraint` probe |
| Only two cluster entries are open; `BL-X5-INTROSPECTION-GAP` is **already archived** | `BACKLOG.md`, `BACKLOG-archive.md:2078` |

## 1. Meta-test inventory

- **Creates** **tests/cross-cutting/adminTableClassification.test.ts** (Task 1).
- **Creates** **tests/cross-cutting/rlsCoverage.test.ts** (Task 4).
- **Extends** `tests/db/postgrest-dml-lockdown.test.ts` (Tasks 2-3).
- **Extends** `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` (Task 5).
- **Deletes** `tests/db/admin-rls-runtime.test.ts` and its `admin-rls-runtime.baseline.json` (Task 4).
- **Untouched by contract:** `scripts/generate-admin-tables.ts` (the count tripwire lives in the test, spec §4.5) and `scripts/generate-traceability.ts` (its drop-list omission is the contract, spec §4.5).

Both new files end in **.test.ts** deliberately: discovery (`vitest.projects.ts:34`) and the partition guard (`tests/cross-cutting/vitest-projects-partition.test.ts:36`) match only that suffix, and an exact `tests/cross-cutting/*.test.ts` path defaults to the DB-backed serial project. No `ENV_BOUND_EXCLUDES` entry is required.

## 2. Advisory-lock topology

**N/A, verified.** No task mutates a table named in invariant 2. The behavioral witness is a paired read, never a seed — precisely why the spec chose it (spec §6.2, §8). REVOKE acquires no lock; no SECURITY DEFINER function is added.

## 3. TDD contract for registry-shaped tests

Every task's **red** step writes the *assertion* against an **empty registry**, so it fails against the live catalog. **Green** populates the registry. Writing an assertion together with its finished registry is not TDD — that was plan-R1 finding 2, and this section is the correction.

---

## Task 1 — classify every public relation

**Catches:** a new admin-data-bearing relation shipping unclassified — the whole R1-R4 silent-drop family, caught by *existence* rather than by parsing.

**Files:** create **tests/cross-cutting/adminTableClassification.test.ts**.

**Red:** write four assertions with `PUBLIC_TABLE_CLASSIFICATION = {}`:

- **A** every `ADMIN_TABLES` entry is classified `admin_only`/`deny_all` and exists live.
- **B** every `admin_only`/`deny_all`-classified table is in `ADMIN_TABLES`.
- **C** every live `public` relation with `relkind IN ('r','p','v','m','f')` is in the registry.
- **Tripwire** parse §4.3's declared counts (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:643`); assert `ADMIN_TABLES.length === declaredLive` and `declaredLive + dropped === declaredProse`.

Run: A and C fail, naming all 41 unclassified relations. A real red — the assertions exist, the data does not.

**Green:** populate all 41 rows (`posture`, plus a `reason` carrying a `file:line`). All four pass.

**Mutant coverage** (each in its own rolled-back transaction, asserted to FAIL with its *specific* message so it cannot pass incidentally): (i) delete a registry row → C; (ii) reclassify an admin table `crew_readable` → A; (iii) inject a fake `ADMIN_TABLES` name → A; (iv) `create view public.v_probe as select * from public.admin_alerts` → C; (v) matview; (vi) partitioned parent; (vii) foreign table; (viii) perturb a declared count → tripwire.

**Commit:** `test(db): classify every public relation and reconcile against the catalog`

## Task 2 — REVOKE the eight, with their registry rows, in one commit

**Catches:** admin-session PostgREST DML bypassing the SECURITY DEFINER RPC gates (spec §2.3 probe).

Merged from the earlier draft's Tasks 2 and 3: `tests/db/postgrest-dml-lockdown.test.ts:811` requires the REVOKE migration and its registry rows in the **same commit**, so splitting them guarantees one red commit. Red and green still happen in order *within* the task.

**Files:** edit `tests/db/postgrest-dml-lockdown.test.ts`; create one timestamped `lockdown_admin_only_tables` migration under `supabase/migrations/`.

**Red:** add the 8 `RPC_GATED_TABLES` rows — `sync_log`, `reports`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `pending_snapshot_uploads`, `revision_race_cooldowns`, `recovery_drift_cooldowns` — each `selectAnon: true`, `selectAuthenticated: true` (SELECT is retained and the original grant covered both roles, spec §4.3), plus `postBody`/`rowFilter`. `postBody` needs only well-formed column names; the grant check rejects before constraints evaluate. Run: Layer 1 fails on all 8 (`authenticated:INSERT:true` where `false` is expected) and Layer 4's inverse check fails (rows with no matching REVOKE).

**Green:** write the migration — `revoke insert, update, delete … from anon, authenticated;` plus `grant all privileges … to service_role;` for the 8, shaped exactly like `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql`, header comment naming the registry rows and the Layer 4 lockstep. Apply locally. All layers pass.

**Verify:** re-run the spec §2.3 probe — the admin-session INSERT/UPDATE/DELETE that succeeded before must now raise `42501`.

**Commit:** `feat(db): revoke PostgREST DML on eight admin-only tables` — migration and rows together.

## Task 3 — Layer 5 completeness + `ADMIN_DML_EXEMPTIONS`

**Catches:** a §4.3 table that is neither locked down nor consciously exempted.

**Files:** edit `tests/db/postgrest-dml-lockdown.test.ts`.

**Red:** add Layer 5 — every `ADMIN_TABLES` member is in `RPC_GATED_TABLES` or `ADMIN_DML_EXEMPTIONS` — with `ADMIN_DML_EXEMPTIONS = []`. Fails naming `app_settings` and `admin_alerts`.

**Green:** two exemption rows, each carrying its class-(c) reason and the justifying `file:line` (`app/admin/settings/_actions/setAutoPublish.ts:47`, `app/admin/actions.ts:139`).

Scope the assertion against `ADMIN_TABLES`, never against `RPC_GATED_TABLES` itself.

**Commit:** `test(db): fail by default on an unclassified admin-only table`

## Task 4 — derive RLS coverage from §4.3

**Catches:** `DISABLE ROW LEVEL SECURITY` shipping green (spec §2.4 probe: the `admin_only` row survives in `pg_policies`); an added permissive policy ORing access open; a §4.3 table with no policy at all.

**Files:** create **tests/cross-cutting/rlsCoverage.test.ts**; delete `tests/db/admin-rls-runtime.test.ts` and its `admin-rls-runtime.baseline.json` (sole consumer verified).

**Red:** write the assertions with `RLS_POSTURE = {}` — per `ADMIN_TABLES` member, `relrowsecurity = true` plus its declared posture: `admin_only` (exactly one policy, `cmd=ALL`, `is_admin()` in `qual` and `with_check`, `qual = with_check`) or `deny_all` (zero policies). Reverse direction: every live `admin_only` table is in `ADMIN_TABLES` or the allowlist. Behavioral cells per spec §6.3, using the paired witness `admin_count > 0 AND nonadmin_count = 0`, degrading to a recorded `unavailable — no rows` on an empty table. Run: fails, naming all 19 unpostured tables.

**Green:** populate `RLS_POSTURE` (18 `admin_only`, `email_deliveries` `deny_all`) and the allowlist (`ignored_warnings`, `admin_emails`). Delete the old test and baseline.

**Mutant coverage:** disable RLS on one table → posture assertion fails; add a second permissive policy → policy-count fails; force a table empty → the cell reports `unavailable`, and the test asserts that string is present rather than passing silently.

**Commit:** `test(db): derive RLS coverage from spec 4.3, not from pg_policies`

## Task 5 — pin every canonical-email CHECK from the catalog

**Catches:** a canonical-email CHECK whose constraint name hides it from the existing name-scoped walk (3 live today).

**Files:** edit `tests/cross-cutting/_canonicalEmailCheckContract.test.ts`.

**Red:** add the assertion with `CATALOG_CANONICAL_CHECKS = []` — query `pg_constraint` for CHECK bodies matching `= lower(btrim|trim(<col>))`, assert the live set equals the registry. Fails naming all 19.

**Green:** register all 19, including the 3 name-invisible ones (`admin_emails.email`, `ignored_warnings.ignored_by`, `role_token_mappings.decided_by`).

**Do not** add these to `expectedBoundaryChecks` — that registry also demands an AC-X.5 manifest entry (`tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202`) which they lack by design (spec §5.3; follow-up filed as `BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY`).

**Commit:** `test(db): pin every canonical-email CHECK from the live catalog`

## Task 6 — validation apply

Per spec §10's evidence table, which supersedes the generic checklist.

**Files:** none tracked. This task's artifact is PR-body evidence, so it carries **no commit** by design.

1. Local apply: done in Task 2 (Layer 1 red→green is the proof).
2. `pnpm gen:schema-manifest` — the diff is empty by construction for a REVOKE-only migration; run it and record the no-op. A non-empty diff means the migration did more than intended: stop.
3. Apply surgically to validation project `vzakgrxqwcalbmagufjh` (`supabase db push` is blocked there), then `notify pgrst, 'reload schema';`.
4. **No automated gate covers step 3** (spec §10). Point the lockdown test's Layer 1 at the validation project once, post-apply, and paste the output into the PR body.

## Task 7 — backlog reconciliation

**Files:** edit `BACKLOG.md`, `BACKLOG-archive.md`.

Corpus reality (plan-R1 finding 8, verified): only **two** cluster entries are open — `BL-ADMIN-POSTGREST-DML-LOCKDOWN` and `BL-RLS-COVERAGE-CROSSCUTTING`. `BL-X5-INTROSPECTION-GAP` is already at `BACKLOG-archive.md:2078` and must not be duplicated. `BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY`, filed by this cluster, **stays open**.

Move exactly those two entries to `BACKLOG-archive.md` with resolution notes; append one line to the existing `BL-X5-INTROSPECTION-GAP` archive entry recording that its residual naming-aperture gap was closed here.

**Commit:** `docs(backlog): archive the two lockdown entries this cluster resolves`

## Task 8 — close-out

**Files:** none tracked beyond what earlier tasks committed; this task is process. No commit of its own unless review repairs require one.

Full local suite green; `pnpm spec:lint` clean on spec and plan; whole-diff Codex review to APPROVE; push; **real CI green**; `gh pr merge --merge`; fast-forward `main` until `git rev-list --left-right --count main...origin/main` reports `0  0`; `CronDelete` the nudge job; clear the herdr pane and agent labels.

**impeccable-gate: N/A — no UI surface**

---

## Checklist

- [x] Spec written, self-reviewed, adversarially reviewed to APPROVE (8 rounds, 21 findings)
- [x] Plan self-review
- [ ] Adversarial review (cross-model) — Codex, to APPROVE
- [ ] Tasks 1-8
- [ ] Whole-diff cross-model review to APPROVE
- [ ] Real CI green, merge, `0  0`
