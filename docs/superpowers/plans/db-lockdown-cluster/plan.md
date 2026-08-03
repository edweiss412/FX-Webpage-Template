# Plan — DB lockdown trio

**Spec:** `docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md` (APPROVED at R8, cross-model, 2026-08-03).
**Branch:** `feat/db-lockdown-cluster`.
**impeccable-gate: N/A — no UI surface.**

<!-- spec-lint: not-ui — app/ paths appear only as classified writer call sites; no file under app/ or components/ is modified. -->

---

## 0. Pre-draft code verification (run, not promised)

Every claim below was verified against the live repo/DB during spec drafting. Restated here so a task body never names an API that does not exist.

| Claim | Verified |
| --- | --- |
| `RPC_GATED_TABLES` row shape and 26 existing rows | `tests/db/postgrest-dml-lockdown.test.ts:138`, `tests/db/postgrest-dml-lockdown.test.ts:147` |
| Layer 1 privilege matrix idiom | `tests/db/postgrest-dml-lockdown.test.ts:521` |
| Layer 4 bidirectional migration↔registry lockstep | `tests/db/postgrest-dml-lockdown.test.ts:873`, `tests/db/postgrest-dml-lockdown.test.ts:897` |
| RLS probe derivation + arms | `tests/db/admin-rls-runtime.test.ts:85`, `tests/db/admin-rls-runtime.test.ts:131`, `tests/db/admin-rls-runtime.test.ts:177` |
| the baseline fixture's only consumer is the test being relocated | `grep -rl admin-rls-runtime.baseline` → 1 hit |
| Canonical-CHECK parser + aperture filter | `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:59`, `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:126` |
| `expectedBoundaryChecks` also requires an AC-X.5 manifest entry | `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202` |
| `ADMIN_TABLES` generated, 19 entries | `lib/audit/admin-tables.generated.ts` |
| Established lockdown migration shape | `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql` |
| 41 public relations, all `relkind='r'`; 39 RLS-enabled; 0 views/matviews/foreign/partitioned | live catalog probe |
| 19 canonical-email CHECKs live; 16 name-visible, 3 not | live `pg_constraint` probe |
| `tests/cross-cutting/**` runs in the serial project, which `unit-suite-db` boots Postgres for | `vitest.projects.ts:34`, `.github/workflows/unit-suite.yml:101`, `.github/workflows/unit-suite.yml:133` |

## 1. Meta-test inventory (declared before tasks, per writing-plans)

- **Creates:** a new an `admin-table-classification` test file under `tests/cross-cutting/` — `PUBLIC_TABLE_CLASSIFICATION` + reconciliations A/B/C + count tripwire (Task 1).
- **Creates:** a new an `rls-coverage` test file under `tests/cross-cutting/` — relocated and inverted RLS probe (Task 5).
- **Extends:** `tests/db/postgrest-dml-lockdown.test.ts` — 8 rows, Layer 5, `ADMIN_DML_EXEMPTIONS` (Tasks 3-4).
- **Extends:** `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` — `CATALOG_CANONICAL_CHECKS` (Task 6).
- **Retires:** `tests/db/admin-rls-runtime.test.ts` + its baseline fixture beside it.
- **Untouched by contract:** `scripts/generate-admin-tables.ts` (the count tripwire lives in the test), `scripts/generate-traceability.ts` (spec §4.5 — its drop-list omission is the contract).

## 2. Advisory-lock topology

**N/A, verified.** No task mutates any invariant-2 table. The behavioral witness is a paired read (`admin_count > 0 AND nonadmin_count = 0`), never a seed — this is exactly why the spec chose it over seeding (spec §6.2, §8). The REVOKE acquires no lock; grants are catalog-level. No SECURITY DEFINER function is added.

## 3. Anti-tautology rules applied to every task

Each task below states the concrete failure mode it catches. Rules held throughout:

- Assert against the **catalog**, never against the registry being validated (the defect this whole cluster is about).
- Every mutant case names the exact regression it prevents; a test that only proves "the query ran" is strengthened.
- Derive expected values from the live catalog, never hardcode a count that a fixture cannot reach.

---

## Task 1 — `PUBLIC_TABLE_CLASSIFICATION` + three catalog reconciliations

**Catches:** a new admin-data-bearing relation shipping with no classification, no RLS, or no REVOKE — the R1-R4 silent-drop family, caught by existence rather than by parsing.

**Red:** write a new an `admin-table-classification` test file under `tests/cross-cutting/` with the registry covering all 41 live relations (`posture: "admin_only" | "deny_all" | "crew_readable" | "infra"`, each with a `reason` carrying a `file:line`) and reconciliations:

- **A** every `ADMIN_TABLES` entry is classified `admin_only`/`deny_all` and exists live.
- **B** every `admin_only`/`deny_all`-classified table is in `ADMIN_TABLES`.
- **C** every live relation in `public` with `relkind IN ('r','p','v','m','f')` is in the registry.
- **Tripwire** parse §4.3's declared counts (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:643`); assert `ADMIN_TABLES.length === declaredLive` and `declaredLive + dropped === declaredProse`.

Enumerate by `pg_class.relkind`, **not** `information_schema.tables … BASE TABLE` (spec §4.5).

**Green:** registry populated; all four pass.

**Mutants** (each in its own transaction, rolled back): (i) drop a registry row → C fails; (ii) reclassify an admin table `crew_readable` → A fails; (iii) add a fake name to the ADMIN_TABLES fixture → A fails; (iv) `create view public.v_probe as select * from public.admin_alerts` → **C fails** (this is the one with teeth — an auto-updatable view routes PostgREST DML around the base table's REVOKE); (v) same for a matview, a partitioned parent, a foreign table; (vi) perturb a declared count → tripwire fails.

**Commit:** `test(db): classify every public relation and reconcile against the catalog`

## Task 2 — REVOKE migration for the 8

**Catches:** admin-session PostgREST DML bypassing the SECURITY DEFINER RPC gates (spec §2.3 probe).

**Red:** add the 8 rows to `RPC_GATED_TABLES` first (Task 3's registry edit); Layer 1 fails on all 8 (`authenticated:INSERT:true` ≠ expected `false`).

**Green:** a new timestamped `lockdown_admin_only_tables` migration, shaped exactly like `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql` — `revoke insert, update, delete … from anon, authenticated;` + `grant all privileges … to service_role;` for `sync_log`, `reports`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `pending_snapshot_uploads`, `revision_race_cooldowns`, `recovery_drift_cooldowns`. **SELECT is retained.** Header comment names the registry rows and the Layer 4 lockstep.

**Verify:** re-run the §2.3 probe — the admin-session UPDATE/INSERT/DELETE that succeeded before must now raise `42501`.

**Commit:** `feat(db): revoke PostgREST DML on eight admin-only tables`

## Task 3 — registry rows

**Catches:** a future migration silently re-granting DML (Layer 4 enforces the lockstep both ways).

8 rows, each `selectAnon: true`, `selectAuthenticated: true` (spec §4.3 — SELECT is retained and the original grant covered both roles), `closed_at` pointing at Task 2's migration, plus `postBody`/`rowFilter`. `postBody` needs only well-formed column names; the grant check rejects before constraints evaluate.

**Commit:** `test(db): register the eight newly locked tables`

## Task 4 — Layer 5 + `ADMIN_DML_EXEMPTIONS`

**Catches:** a §4.3 table that is neither locked down nor consciously exempted.

**Red:** Layer 5 asserts every `ADMIN_TABLES` member is in `RPC_GATED_TABLES` or `ADMIN_DML_EXEMPTIONS`; fails on `app_settings` and `admin_alerts`.

**Green:** two exemption rows, each carrying its class-(c) reason and the `file:line` of the write path justifying it (`app/admin/settings/_actions/setAutoPublish.ts:47`, `app/admin/actions.ts:139`).

Scope the assertion against `ADMIN_TABLES`, never against `RPC_GATED_TABLES` itself.

**Commit:** `test(db): fail by default on an unclassified admin-only table`

## Task 5 — relocate and invert the RLS probe

**Catches:** `DISABLE ROW LEVEL SECURITY` shipping green; an added permissive policy ORing access open; a §4.3 table with no policy at all.

**Red:** a new an `rls-coverage` test file under `tests/cross-cutting/` iterating `ADMIN_TABLES`, asserting per table `relrowsecurity = true` plus its declared posture — `admin_only` (exactly one policy, `cmd=ALL`, `is_admin()` in `qual` and `with_check`, `qual = with_check`) or `deny_all` (zero policies; `email_deliveries` is the live member). Reverse direction: every live `admin_only` table is in `ADMIN_TABLES` or the allowlist (`ignored_warnings`, `admin_emails`).

Behavioral cells per spec §6.3's matrix, including the row-dependence rule: assert `admin_count > 0 AND nonadmin_count = 0`; where a table is empty, record `unavailable — no rows` rather than passing. `app_settings` INSERT and `email_deliveries` SELECT are declared unavailable with their reasons.

**Green:** delete `tests/db/admin-rls-runtime.test.ts` and its baseline fixture beside it (sole consumer verified).

**Mutants:** disable RLS on a table → fails; add a second permissive policy → fails; empty table → reports unavailable, does not silently pass.

**Commit:** `test(db): derive RLS coverage from spec 4.3, not from pg_policies`

## Task 6 — `CATALOG_CANONICAL_CHECKS`

**Catches:** a canonical-email CHECK whose constraint name hides it from the existing name-scoped walk.

**Red:** new registry + assertion in `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` querying `pg_constraint` for CHECK bodies matching `= lower(btrim|trim(<col>))`; the live set (19) must equal the registry. Fails until the 3 name-invisible constraints are registered.

**Green:** register `admin_emails.email`, `ignored_warnings.ignored_by`, `role_token_mappings.decided_by`.

**Do not** add these to `expectedBoundaryChecks` — that registry also requires an AC-X.5 manifest entry (`tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202`) which they lack by design (spec §5.3; follow-up filed as `BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY`).

**Commit:** `test(db): pin every canonical-email CHECK from the live catalog`

## Task 7 — migration → validation parity

Per spec §10's evidence table, which supersedes the generic checklist:

1. Applied locally in Task 2 (Layer 1 red→green is the proof).
2. `pnpm gen:schema-manifest` — diff is empty by construction for a REVOKE-only migration; run it, record the no-op.
3. Apply surgically to validation project `vzakgrxqwcalbmagufjh` (`supabase db push` is blocked there), then `notify pgrst, 'reload schema';`. **No automated gate covers this** — point the lockdown test's Layer 1 at the validation project once, post-apply, and paste the output in the PR body.
4. `validation-schema-parity` green — necessary, not sufficient here.

**Commit:** `chore(db): apply the lockdown migration to validation`

## Task 8 — close-out

Full local suite; `pnpm spec:lint` on both documents; update `BACKLOG.md` to mark the three cluster entries resolved and move them to `BACKLOG-archive.md` with resolution notes; whole-diff Codex review to APPROVE; push; **real CI green**; `gh pr merge --merge`; fast-forward `main` until `git rev-list --left-right --count main...origin/main` reports `0  0`.

**impeccable-gate: N/A — no UI surface**

---

## Checklist

- [x] Spec written, self-reviewed, adversarially reviewed to APPROVE (8 rounds)
- [ ] Plan self-review
- [ ] Adversarial review (cross-model) — Codex, to APPROVE
- [ ] Tasks 1-8, TDD each, commit per task
- [ ] Whole-diff cross-model review to APPROVE
- [ ] Real CI green, merge, `0  0`
