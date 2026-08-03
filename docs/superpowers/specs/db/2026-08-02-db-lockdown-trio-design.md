# DB lockdown trio — statement-level lockdown, RLS coverage promotion, canonical-email aperture

**Status:** draft 2026-08-02. Autonomous-ship cluster approved by Eric upfront.
**Backlog items closed:** `BL-ADMIN-POSTGREST-DML-LOCKDOWN`, `BL-RLS-COVERAGE-CROSSCUTTING`, `BL-X5-INTROSPECTION-GAP` (verification + residual).
**impeccable-gate: N/A — no UI surface.**

<!-- spec-lint: not-ui — app/ paths appear only as writer call sites being classified in §4.1; this cluster modifies no file under app/ or components/. -->

---

## 1. Summary

Three backlog items, filed independently across three milestones, are the same defect in three places:

> **Every one of the three guards derives its table set from a source that cannot represent the absence it exists to detect.**

| Guard | Derives its set from | Blind to |
| --- | --- | --- |
| `tests/db/postgrest-dml-lockdown.test.ts:817-901` (Layer 4) | `REVOKE` statements found in `supabase/migrations/` | a table with **no** `REVOKE` — the exact thing lockdown means to find |
| `tests/db/admin-rls-runtime.test.ts:85-98` | live `pg_policies` rows named `admin_only` | a §4.3 table with **no** `admin_only` policy |
| `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:126` | constraint **names** containing `email_canonical` | a canonical CHECK named anything else |

Each guard is rigorous about what it can see and silent about what it cannot. The fix in all three cases is the same: **re-derive from the authoritative source, so absence fails.** For the first two that source is spec §4.3 via the generated `ADMIN_TABLES` registry (`lib/audit/admin-tables.generated.ts`); for the third it is the CHECK **body shape** rather than its name.

Shipped in this cluster:

1. `REVOKE INSERT, UPDATE, DELETE` on **8** admin-only tables + registry rows (§4).
2. A spec-derived completeness assertion so an unclassified §4.3 table fails CI (§4.4).
3. **A full public-schema classification registry** reconciled against the live catalog, so a new table fails by default for being a new table (§4.5) — the prerequisite the other two rest on.
4. The RLS probe re-derived from §4.3, relocated cross-cutting, with `relrowsecurity`, policy-count, and non-vacuous behavioral assertions (§6).
5. A live-catalog completeness assertion for canonical-email CHECKs, closing 3 name-invisible ones (§5).

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| `app_settings` and `admin_alerts` are **NOT** locked down in this cluster. RLS is their *documented authoritative* write gate, not an accident. | `app/admin/settings/_actions/setAutoPublish.ts:47-48` ("The authoritative write gate is the app_settings admin_only RLS"); `app/admin/actions.ts:139-143`; `BACKLOG.md:556` records the `admin_alerts` posture as explicitly ACCEPTED. See §4.1 class (c) and §9. |
| No 9th required GitHub status check is added. | Adding one requires a manual branch-protection admin step by Eric and risks the documented fork-PR deadlock (master spec §17.2.1). The new assertions run in the existing PR-blocking `unit-suite` serial project. See §6.4. |
| `BL-X5-INTROSPECTION-GAP`'s archived COMPLETE claim **holds** for its stated scope. This cluster does not redo it; it closes only the residual aperture defect found while verifying it. | `BACKLOG-archive.md:2080`; verification transcript §5.1. |
| The 4 M11.5-dropped tables (`crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces`) are out of scope — their relations do not exist. | `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:23-26`; `scripts/generate-admin-tables.ts:31-34` `removedByPickerPivot`. |
| `admin_field_overrides.created_by`'s canonical CHECK is **not** a gap. The table was dropped; only stale migration text remains. | `supabase/migrations/20260710000000_remove_admin_field_overrides.sql`; live `to_regclass('public.admin_field_overrides')` returns NULL (§5.1 probe). |
| Prose §4.3 count is **23**; live `ADMIN_TABLES.length` is **19**. Both are correct; the delta is the 4 dropped tables. | master spec footnote `[^admintables-22]` at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:643`. |
| Statement-level lockdown does **not** replace RLS. It is the statement-level half of a two-half contract; RLS remains the row-level half. | `BACKLOG.md:918`. |
| The catalog assertion gets its **own** registry, not `expectedBoundaryChecks`. The two police different contracts, and merging them would drag in the AC-X.5 manifest coupling. | R1 finding 2; `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202`; `scripts/extract-email-boundaries.ts:87`. See §5.3. |
| `email_deliveries` having **zero** RLS policies is correct, not a coverage hole — zero policies under enabled RLS is deny-all, stronger than `admin_only`. | §2.4 probe; `supabase/migrations/20260602000004_b3_email_deliveries.sql:21`. |
| Registering `role_token_mappings.decided_by` in the AC-X.5 manifest is a **separate** cycle, not part of this cluster. Its write paths already canonicalize correctly. | `app/admin/show/[slug]/_actions/roleToken.ts:57`; §5.3 follow-up. |
| The 8 new registry rows are `selectAnon: true` / `selectAuthenticated: true`. SELECT is retained by design and the original grant covered both roles. | R2 finding 1; §4.2; the `true`/`true` posture of every comparable REVOKE-only row in `tests/db/postgrest-dml-lockdown.test.ts:147-511`. |
| The generator fails loud via a **declared-count tripwire**, NOT via "throw on any unresolved name". The latter fails on today's corpus because 4 backticked prose identifiers in §4.3 are not tables. | R2 finding 2 probe; §4.5. |
| AC-2.5's four-verb contract is satisfied by the UNION of the RLS test and the lockdown test; `42501` is literally AC-2.5's stated pass condition for the write verbs. No spec amendment needed. | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3792` ("permission-denied / zero-affected-rows"); §6.3. |
| `scripts/generate-traceability.ts` is NOT touched. Its extractor omits the drop-list intentionally — it tracks the prose 23 against the plan's 23-name `ADMIN_BOOTSTRAP_NAMES`. Unifying it turns the traceability gate red. R3 finding 2 is REVERSED. | `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md:765`; `scripts/generate-traceability.ts:381`; `pnpm gen:traceability` green. |
| Keeping the generator does NOT reopen the R1-R4 parser vector. Direction C catches a missing admin table by its existence as a relation, independent of how the parser failed. The parser is non-load-bearing, not trusted. | §4.5 directions A/B/C. |
| The generator STAYS. The guarantee moves to a full public-schema classification registry reconciled against the catalog (direction C: every live table must be classified). Parsing §4.3 is no longer load-bearing. | R1-R4 vector history; §4.5. |
| The behavioral witness is a PAIRED assertion (`admin_count > 0 AND nonadmin_count = 0`), never a seed. No admin table is mutated, so invariant 2 is not engaged. | R3 finding 3 + R4 finding 4; §6.2, §8. |
| `email_deliveries`' SELECT cell is grant-layer, not RLS — it revokes ALL, so `authenticated` never reaches RLS. | R4 finding 2; `supabase/migrations/20260602000004_b3_email_deliveries.sql:21`. |
| `app_settings`' INSERT cell is structurally unavailable — pre-seeded singleton with a `id = 'default'` CHECK. Claiming it would be a tautology. | R4 finding 3; `supabase/migrations/20260501001000_internal_and_admin.sql:246`. |
| `__test_singleton_rls_probe` is unimplemented prose that cannot be built usefully either way it is specified. Not a deliverable here. | `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/02-schema-rls.md:417` (DEFINER) vs the spec's INVOKER; §6.3(c). |

---

## 2. Current state (probe-backed)

### 2.1 The §4.3 admin-only set

Master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:640-641` enumerates 23 admin-only tables (22 in the bullet + `shows_internal` from the adjacent bullet). `scripts/generate-admin-tables.ts` parses that bullet at build time and emits the live 19-entry `ADMIN_TABLES` (`lib/audit/admin-tables.generated.ts`), regenerated by `scripts/pretest-gen.mjs` before every test run and consumed by the auth-chain audit at `lib/audit/authPrimitives.ts:92`.

### 2.2 Grant state across the live 19

Nine of the 19 already carry a `REVOKE INSERT, UPDATE, DELETE ... FROM anon, authenticated`:

| Table | Closed at |
| --- | --- |
| `shows_internal` | `supabase/migrations/20260619000001_lockdown_shows_internal.sql:18` |
| `pending_syncs`, `pending_ingestions`, `deferred_ingestions` | `supabase/migrations/20260601000000_b2_show_lifecycle.sql:163-165` |
| `onboarding_scan_manifest`, `wizard_finalize_checkpoints`, `shows_pending_changes` | `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql:14-16` |
| `email_deliveries` | `supabase/migrations/20260602000004_b3_email_deliveries.sql:21` |
| `validation_state` | `supabase/migrations/20260527204241_validation_state.sql:89` |

The other **10** retain `anon`+`authenticated` INSERT/UPDATE/DELETE from the original blanket grant pair in `supabase/migrations/20260501002000_rls_policies.sql`, with no `REVOKE` ever issued: `sync_log`, `reports`, `app_settings`, `admin_alerts`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `pending_snapshot_uploads`, `revision_race_cooldowns`, `recovery_drift_cooldowns`.

No blanket `grant ... on all tables in schema public` and no `alter default privileges` in `public` exists anywhere in `supabase/migrations/` — the only such statements are scoped to schema `dev`, grantee `service_role` (`supabase/migrations/20260502000000_dev_schema_clone.sql:362-365`).

### 2.3 Probe: what the gap actually permits

All 10 carry `admin_only` RLS `FOR ALL` with `is_admin()` in both `qual` and `with_check` (live `pg_policies` probe, 2026-08-02, all 10 rows `qual_is_admin=true wc_is_admin=true`). So **non-admin crew are blocked at the row level** — the exposure is narrower than "any authenticated caller."

What it does permit, demonstrated rather than argued (local DB, transaction rolled back):

```
-- role authenticated, JWT app_metadata.role=admin
admin_session_direct_UPDATE_rows=1     -- forged resolved_by='attacker@example.com'
admin_session_direct_INSERT_rows=1     -- forged alert row, bypassing upsert_admin_alert
admin_session_direct_DELETE_rows=2
```

An **admin-authenticated session** can INSERT/UPDATE/DELETE these tables directly through PostgREST, bypassing every SECURITY DEFINER RPC gate — its advisory locks, its atomicity, and its audit emission. On `admin_alerts` specifically this bypasses `upsert_admin_alert` and forges `resolved_by`, which is the precise exposure `BACKLOG.md:556` describes.

Statement-level baseline for all 10 (`delete ... where false` as `authenticated`): **`STATEMENT_PERMITTED` on every one.** This is the "before" fixture the new Layer 1 rows invert.

### 2.4 Probe: what the RLS guard cannot see

Three findings from probing `tests/db/admin-rls-runtime.test.ts` directly. Each is the cluster's root defect in the row-level half, and each drives an assertion in §6.2.

**(i) `DISABLE ROW LEVEL SECURITY` ships green.** The probe's derivation reads `pg_policies`, never `pg_class.relrowsecurity`:

```
begin;
alter table public.recovery_drift_cooldowns disable row level security;
--> policy_rows_after_disable=1 | qual_still_is_admin=true
--> relrowsecurity=false
rollback;
```

The `admin_only` row survives with its `is_admin` qual intact, so the derivation still finds the table and every structural arm still passes — while row-level gating is entirely off.

**(ii) The behavioral arm is vacuous on empty tables.** It asserts `nonadmin_count=0`, which cannot distinguish "RLS denied the rows" from "there are no rows". Live counts: `recovery_drift_cooldowns=0`, `revision_race_cooldowns=0`, `pending_snapshot_uploads=0`, `drive_watch_channels=0`, `sync_audit=0`; only `sync_log=4073` is populated. So (i) is not caught here either, for 5 of the 6 tables sampled.

**(iii) The two 19-element sets are not the same 19.** `ADMIN_TABLES` (spec-derived) and the live `admin_only`-derived set have equal cardinality but differ by one in each direction:

```
in ADMIN_TABLES, no admin_only policy : email_deliveries
admin_only policy, not in ADMIN_TABLES: ignored_warnings
```

`tests/db/admin-rls-runtime.test.ts:111`'s `toHaveLength(19)` and `tests/db/admin-rls-runtime.test.ts:115`'s frozen-baseline comparison both stay green through a swap — a count cannot see one, and the baseline was frozen from the very query it is compared against.

`email_deliveries` is not a defect: it has RLS enabled with **zero** policies, which is deny-all and stronger than `admin_only`, and `supabase/migrations/20260602000004_b3_email_deliveries.sql:21` revokes ALL from anon+authenticated as well. It is the motivating case for §6.2's two declared postures.

---

## 3. Threat model and what lockdown buys

| Actor | Today | After lockdown |
| --- | --- | --- |
| `anon` (no session) | statement permitted, RLS denies rows | statement denied (`42501`) |
| crew `authenticated` (non-admin) | statement permitted, RLS denies rows | statement denied (`42501`) |
| **admin `authenticated`** | **full direct DML, RPC gates bypassed** | statement denied; must go through the RPC |
| `service_role` / raw SQL (`postgres`) | unaffected | unaffected |

The value is not "stop an attacker" — Doug is the trusted business owner, and that framing was already rejected at `BACKLOG.md:910`. The value is that **the RPC becomes the only door**, so its advisory locks (invariant 2), its atomicity, and its audit emissions (invariant 10) cannot be routed around by a refactor, a console session, or a future admin UI that reaches for the table builder because it is one line shorter.

---

## 4. Item 1 — statement-level lockdown

### 4.1 Classification matrix (all 19; audited at 2026-08-02, not from the backlog snapshot)

Class per `BACKLOG.md:906`: **(a)** SECURITY DEFINER RPC is the intended mutation gate; **(b)** admin-only RLS, no non-service writer — lockdown as defense-in-depth; **(c)** intentionally writable by a non-service role — NOT a candidate, reason documented.

| # | Table | Class | Non-service-role writers | Action |
| --- | --- | --- | --- | --- |
| 1 | `sync_log` | (b) | none (0 PostgREST writes; read-only at `lib/observe/query/syncLog.ts:24`) | **REVOKE** |
| 2 | `reports` | (a) `reset_validation_data` | none (service-role scripts only) | **REVOKE** |
| 3 | `sync_audit` | (b) | none (raw SQL only) | **REVOKE** |
| 4 | `drive_watch_channels` | (b) | none (reads only) | **REVOKE** |
| 5 | `report_rate_limits` | (a) `validation_seed_rate_limit` | none (service-role scripts only) | **REVOKE** |
| 6 | `pending_snapshot_uploads` | (b) | none (reads only) | **REVOKE** |
| 7 | `revision_race_cooldowns` | (a) `reset_validation_data` | none (raw SQL only) | **REVOKE** |
| 8 | `recovery_drift_cooldowns` | (b) | none (read only at `lib/sync/assetRecovery.ts:775`) | **REVOKE** |
| 9 | `app_settings` | **(c)** | 4 × user-session UPDATE: `setAutoPublish.ts:50`, `setAlertOnSyncProblems.ts:40`, `setDailyReviewDigest.ts:37`, `setAlertOnAutoPublish.ts:41` | **no change** — see §9 |
| 10 | `admin_alerts` | **(c)** | 2 × user-session UPDATE: `app/admin/actions.ts:145` (`resolveAdminAlertFormAction`), `app/admin/actions.ts:259` (`resolveHealthAlertFormAction`) | **no change** — see §9 |
| 11-19 | `shows_internal`, `pending_syncs`, `pending_ingestions`, `deferred_ingestions`, `onboarding_scan_manifest`, `wizard_finalize_checkpoints`, `shows_pending_changes`, `email_deliveries`, `validation_state` | (a)/(b) | — | already closed (§2.2) |

Rows 9 and 10 are class (c) **as the code stands today**, not as a permanent verdict. Both write paths name RLS as the authoritative gate in their own comments; a REVOKE inverts that contract rather than reinforcing it, which is a trust-boundary change and a product decision. §9 states the promotion path.

### 4.2 Migration

One new timestamped `lockdown_admin_only_tables` migration under `supabase/migrations/`, following the established shape at `supabase/migrations/20260611000002_lockdown_wizard_staging_tables.sql` verbatim (idempotent; `REVOKE`/`GRANT` are no-ops when re-applied):

```sql
begin;
revoke insert, update, delete on table public.sync_log                 from anon, authenticated;
-- … 7 more …
grant all privileges on table public.sync_log                 to service_role;
-- … 7 more …
commit;
```

SELECT is **retained** on all 8 — admin UI reads and the observe CLI depend on it, and RLS remains the row-level gate for reads.

### 4.3 Registry rows

Eight new `RPC_GATED_TABLES` entries in `tests/db/postgrest-dml-lockdown.test.ts` (registry at `tests/db/postgrest-dml-lockdown.test.ts:147-511`, row shape at `tests/db/postgrest-dml-lockdown.test.ts:138`). Each carries `table`, `closed_at` (the new migration's `file:line`), **`selectAnon: true`, `selectAuthenticated: true`**, plus a `postBody`/`rowFilter`.

**Why both SELECT flags are `true`.** §4.2 revokes only INSERT/UPDATE/DELETE and explicitly retains SELECT, and the original blanket pair in `supabase/migrations/20260501002000_rls_policies.sql` granted SELECT to **both** `anon` and `authenticated`. So `has_table_privilege('anon', …, 'SELECT')` stays `true` after this migration. An earlier draft said `selectAnon: false`, which contradicted §4.2 and would have failed Layer 1 on all eight rows (R2 finding 1). This matches the established posture for every comparable REVOKE-only lockdown — `shows_internal`, `onboarding_scan_manifest`, `wizard_finalize_checkpoints`, `validation_state` are all `true`/`true`; only `email_deliveries` is `false`/`false`, because its migration revokes ALL rather than the three DML verbs. Anon SELECT stays harmless because `admin_only` RLS returns zero rows to it.

`postBody` needs only well-formed column names, not a constraint-satisfying row: the grant check rejects the statement before NOT NULL and CHECK constraints are ever evaluated (which is why the existing `show_share_tokens` row carries a single column). Layer 4 (`tests/db/postgrest-dml-lockdown.test.ts:873`, `tests/db/postgrest-dml-lockdown.test.ts:897`) already enforces the migration↔registry lockstep in both directions, so the rows are mandatory, not optional.

Adding the rows automatically extends Layers 1-3: the `has_table_privilege` matrix (`tests/db/postgrest-dml-lockdown.test.ts:521`), and live PostgREST POST/PATCH/DELETE probes asserting `42501` + `permission denied for table <t>` (`tests/db/postgrest-dml-lockdown.test.ts:759`).

### 4.4 The completeness assertion (the actual fix)

Layer 4 is REVOKE-derived, so it can never fail for a table that was simply forgotten. New **Layer 5**, spec-derived:

```
for each table in ADMIN_TABLES (generated from spec §4.3):
  assert table ∈ RPC_GATED_TABLES
      OR table ∈ ADMIN_DML_EXEMPTIONS  (classified, with reason + citation)
```

`ADMIN_DML_EXEMPTIONS` ships with exactly two rows — `app_settings` and `admin_alerts` — each carrying its class-(c) reason and the `file:line` of the write path that justifies it. A 20th §4.3 table added tomorrow lands in neither set and **fails CI by default**, which is the property all three items were filed to obtain.

Anti-tautology: the assertion is scoped against `ADMIN_TABLES` (the spec-derived registry), never against `RPC_GATED_TABLES` itself — asserting a registry against itself is the failure mode this whole spec is about.

### 4.5 The §4.3 projection — put the guarantee in the catalog, not the parser

Both Layer 5 and §6.2 rest on `ADMIN_TABLES` being a faithful projection of §4.3. Four review rounds attacked that projection and **every parser-based repair was defeated**:

| Round | Repair attempted | How it was defeated |
| --- | --- | --- |
| R1 | widen the CREATE TABLE regex; throw on unresolved | 4 backticked §4.3 identifiers are prose, not tables — throws on today's corpus |
| R2 | declared-count tripwire + continuation-line read | R3: quoted schema, spaced qualification dot, comment between keywords |
| R3 | stop parsing DDL; subtract a prose denylist | R4: `` `public.future_admin` ``, bare `future_admin`, `` `_future_admin` ``, `` `"future_admin"` ``, blank-line continuation |
| R4 | retire prose derivation; hand-maintained list | blast radius: 5 `x-audits.yml` steps, and `scripts/generate-traceability.ts:284` *asserts those steps exist* |

The recurring error was treating this as a parsing problem. **It is not.** No parser of human prose is trustworthy, and R4's retirement bought that insight at the price of touching nine sites including the CI guard that mandates the generator. The guarantee never came from the derivation — it comes from reconciliation against the database, which has no grammar to defeat.

**Design: keep the generator, move the authority to the catalog.** `scripts/generate-admin-tables.ts` and its wiring stay exactly as they are (no `package.json`, `scripts/pretest-gen.mjs`, `.github/workflows/x-audits.yml`, `tests/cross-cutting/pretest-gen-manifest.test.ts`, or `scripts/generate-traceability.ts` changes). Its output is no longer *trusted* — it is *checked*, by a single registry in the cross-cutting test classifying **every table in the public schema**:

```
PUBLIC_TABLE_CLASSIFICATION: Record<tableName, {
  posture: "admin_only" | "deny_all" | "crew_readable" | "infra";
  reason: string;   // carries a file:line
}>
```

Live shape today: **41** public base tables, 39 with RLS enabled — a registry of that size is reviewable in one sitting.

Three reconciliations, run against `information_schema` / `pg_class` / `pg_policies`:

- **A — forward.** Every `ADMIN_TABLES` entry is classified `admin_only` or `deny_all`, and exists as a live relation. Catches a generator over-read and a retired table.
- **B — reverse.** Every table classified `admin_only` or `deny_all` is in `ADMIN_TABLES`. Catches the generator silently dropping a §4.3 table — the entire R1-R4 family, regardless of which grammar defeated the parser.
- **C — total.** Every live relation in `public` that can carry or expose rows appears in the registry. **This is the fail-by-default property.** A new table is caught because it is a *new relation*, not because it has RLS, a REVOKE, a particular policy name, or a particular prose spelling. Nothing about its shape can hide it.

  **Enumerate by `pg_class.relkind IN ('r','p','v','m','f')`, not by `information_schema.tables … BASE TABLE`.** Today `public` holds exactly 41 ordinary tables (`relkind='r'`) and nothing else — zero views, zero materialized views, zero foreign tables, zero partitioned parents (probe, 2026-08-02). A `BASE TABLE` filter is therefore indistinguishable from the `relkind` filter *right now*, and would silently stop covering the schema the day someone adds a view. That matters here specifically: PostgREST exposes views, and a simple view over an admin table is **auto-updatable**, so it would accept INSERT/UPDATE/DELETE and route around both the table's REVOKE and its classification. Partitioned parents and foreign tables have the same property. Covering all five relkinds costs one predicate and closes the class before it exists.

Direction C is what the previous four attempts were all reaching for. It does not read the spec, the migrations, or any DDL; it reads the list of relations that exist.

**Retained from earlier rounds, as cheap defense-in-depth, not as the guarantee:** the count tripwire against §4.3's own declared counts (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:641`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:643`) still runs, because it costs one integer comparison and localizes a §4.3 edit to the moment it happens. If it disagrees with directions A-C, the catalog wins.

**R3 finding 2 is REVERSED — `scripts/generate-traceability.ts` is not touched at all.** R3 flagged its `extractAdminTablesFromSpec` as a duplicate carrying the same defects "and it does not even apply `removedByPickerPivot`". Probing that claim (which I should have done before accepting it) shows the omission is **intentional and load-bearing**: traceability compares the spec's set against the plan's `ADMIN_BOOTSTRAP_NAMES` at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md:765`, which is deliberately the **23-name prose baseline** — it lists all four M11.5-dropped tables. Substituting the 19-entry `ADMIN_TABLES` would emit four `-extra_in_ac25` findings at `scripts/generate-traceability.ts:381` and turn the traceability gate red. `pnpm gen:traceability` is green today.

The two extractors therefore serve **different contracts** — one tracks the live 19, the other the prose 23 — and their difference is the contract, not a defect. Fenced in both directions so neither side relitigates: do not unify them, and do not add `removedByPickerPivot` to the traceability copy.

**Mutation-family closure set**, pinned by the cross-cutting test: (i) a live table absent from the registry (expect fail, direction C); (ii) a table classified `admin_only` but missing from `ADMIN_TABLES` (expect fail, direction B); (iii) an `ADMIN_TABLES` entry naming no live relation (expect fail, direction A); (iv) an `ADMIN_TABLES` entry classified `crew_readable` (expect fail, direction A); (v) count declarations disagreeing (expect fail, tripwire); (vi) the current real repo (expect green, 41 classified, 19 admin). The R1-R4 grammar families are **retired as irrelevant** — direction C catches their outcome without modelling their cause. A new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

## 5. Item 2 — canonical-email aperture

### 5.1 Verification of the archived claim

`BACKLOG-archive.md:2080` claims `BL-X5-INTROSPECTION-GAP` COMPLETE. Verified sub-claim by sub-claim:

| Sub-claim | Verdict |
| --- | --- |
| All 8 tables covered, at the cited lines | **HOLDS** — `_canonicalEmailCheckContract.test.ts:31-49`, exact |
| Walks `supabase/migrations` (not a hardcoded file list) | **HOLDS** — `readdirSync` at `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:59` |
| Fail-by-default | **HOLDS within its aperture** — unmatched parsed check throws at `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:179` |
| CI-gated | **HOLDS** — serial project via `BASE_INCLUDE` (`vitest.projects.ts:34`), run by `.github/workflows/unit-suite.yml:133`; not in `ENV_BOUND_EXCLUDES` |
| "asserts the widened body" | **OVERSTATED** — three independent substring regexes (`tests/cross-cutting/_canonicalEmailCheckContract.test.ts:138`), not the grouped predicate. `email IS NULL OR email = lower(trim(email)) OR email <> ''` would pass. Documented limit, not a defect (§9). |

COMPLETE is **defensible for the item's stated scope.** The residual below is a different defect, uncovered while verifying.

### 5.2 The residual: name-scoped aperture

`tests/cross-cutting/_canonicalEmailCheckContract.test.ts:126` — `if (!constraint?.includes("email_canonical")) continue;` — makes constraint **naming** load-bearing. Live catalog probe (`pg_constraint` where the body matches `lower(btrim|trim)`) returns **19** canonical-shaped CHECKs. The test covers 16. Three are invisible purely because of their names:

| Table.column | Constraint | Pinned elsewhere? |
| --- | --- | --- |
| `admin_emails.email` | `admin_emails_canonical_email` (word order) | yes — `tests/db/admin-emails.test.ts:135` |
| `ignored_warnings.ignored_by` | `ignored_warnings_ignored_by_canonical` (no `email_`) | yes — `tests/db/ignored-warnings-schema.test.ts:39` |
| `role_token_mappings.decided_by` | `role_token_mappings_decided_by_canonical` | **no — unpinned anywhere** |

A 20th table named outside the convention passes silently today.

### 5.3 Fix

Add a **live-catalog completeness assertion** to `_canonicalEmailCheckContract.test.ts`: query `pg_constraint` for CHECKs whose body matches `= lower(btrim|trim(<col>))`, and assert that set equals a **new, separate `CATALOG_CANONICAL_CHECKS` registry**. Sourcing from the catalog rather than migration text is deliberately drop-aware — it is exactly why `admin_field_overrides` correctly does not appear (§1.1).

**The new registry is deliberately NOT `expectedBoundaryChecks`.** R1 finding 2 established why: `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202` requires every `expectedBoundaryChecks` row to have BOTH a check parsed by the name-filtered static walk AND an AC-X.5 manifest entry in `lib/audit/email-boundaries.generated.ts`. Adding the 3 tables there would fail on both counts, because the static parser skips their constraint names and `EMAIL_BOUNDARIES` derives from master spec AC-X.5 prose (`scripts/extract-email-boundaries.ts:87`). The two registries police different contracts:

| Registry | Contract | Source of truth |
| --- | --- | --- |
| `expectedBoundaryChecks` | an app write path must call `canonicalize()`, and the DB CHECK is its safety net | master spec AC-X.5 |
| `CATALOG_CANONICAL_CHECKS` (new) | every canonical-shaped CHECK that exists in the live catalog is known and intended | `pg_constraint` |

So the existing static walk, its per-column body assertions, and the AC-X.5 manifest coupling are all **unchanged**; the catalog assertion is a pure addition alongside them. The earlier draft's "registry grows by the 3 tables" was inconsistent with "unchanged" — that contradiction is what R1 finding 2 correctly flagged, and this split is the resolution.

Probe confirms **zero** non-email canonical-shaped CHECKs exist (19 live, all email/identity columns), so body-shape detection has no false positives today; if one ever lands it registers with an explicit non-email row rather than widening the predicate.

**Separable follow-up, filed not smuggled.** `role_token_mappings.decided_by` is a genuine AC-X.5 coverage gap: both write paths canonicalize correctly today (`app/admin/show/[slug]/_actions/roleToken.ts:57`, `app/admin/settings/_actions/roleTokenMappings.ts:38`) but the boundary is absent from the AC-X.5 manifest, so removing a `canonicalize()` call there would not fail the x5 gate. Registering it requires a **master spec §17.2 AC-X.5 amendment**, which has lockstep consequences for `pnpm gen:email-boundaries`, the `x5-email-canonicalization` gate, and traceability. That belongs in its own review cycle, not riding along inside a lockdown cluster. This cluster pins the CHECK's existence via `CATALOG_CANONICAL_CHECKS`; the manifest registration is filed as `BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY`.

---

## 6. Item 3 — RLS coverage promotion

### 6.1 What the current probe cannot see

`tests/db/admin-rls-runtime.test.ts:85-94` derives its 19 tables from live `pg_policies` where `policyname='admin_only' AND cmd='ALL' AND qual ILIKE '%is_admin%'`. It is fail-by-default for a new table that **has** such a policy (`tests/db/admin-rls-runtime.test.ts:111` length, `tests/db/admin-rls-runtime.test.ts:115` baseline diff), and blind to a §4.3 table that has **no** `admin_only` policy, one named differently, or one with `cmd != 'ALL'` — i.e. blind to precisely the missing-coverage case.

### 6.2 Fix — re-derive from §4.3

Relocate to a new RLS-coverage test under `tests/cross-cutting/` (the placement `BACKLOG.md:862` asks for) and invert the derivation: iterate `ADMIN_TABLES` rather than `pg_policies`.

**Per-table posture assertion.** For every `ADMIN_TABLES` member assert `pg_class.relrowsecurity = true`, AND exactly one of two declared postures:

- **`admin_only`** — exactly one policy, named `admin_only`, `cmd=ALL`, `is_admin()` in both `qual` and `with_check`, and `qual = with_check`.
- **`deny_all`** — **zero** policies. Under enabled RLS this denies every non-owner role, which is *stronger* than `admin_only`.

The posture is declared per table in the registry, never inferred. `email_deliveries` is the live `deny_all` member (§2.4). An earlier draft asserted `admin_only` for every member and would have false-failed on it.

**Three assertions the current probe lacks**, each closing a probe-demonstrated blind spot (§2.4):

1. **`relrowsecurity`** — `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` leaves every `admin_only` row intact in `pg_policies`, so today's derivation, length, baseline, structural and equivalence arms all stay green while row-level gating is off.
2. **Policy count** — Postgres ORs permissive policies together, so an added permissive policy reopens a table while `admin_only` remains present and correct. Pinning the count (1 for `admin_only`, 0 for `deny_all`) is what catches it.
3. **Non-vacuous behavioral arm** — the existing arm asserts `nonadmin_count=0`, which on an empty table passes whether RLS denies the rows or no rows exist. 5 of 6 sampled §4.3 tables are empty locally and emptier in a fresh CI bootstrap, so the arm cannot currently fail for them.

   The witness is a **paired assertion, not a seed**: assert `admin_count > 0 AND nonadmin_count = 0` in the same transaction. The admin arm proves rows are visible to *someone*, which is exactly the fact an empty table cannot supply; the non-admin arm then proves RLS filters them. A table with rows therefore gets a genuinely falsifiable cell, and `DISABLE ROW LEVEL SECURITY` flips `nonadmin_count` non-zero and fails.

   Where a table is empty at test time, the pair is unprovable and the test records **`behavioral: unavailable — no rows`** for that table rather than passing silently. Coverage there rests on `relrowsecurity` + policy-count + the structural arms, which is stated, not implied.

   **Why not seed.** Seeding was the R3 draft and it dragged in invariant 2 (`pending_syncs`, `pending_ingestions` are lock-scoped) and, for `app_settings`, was structurally impossible anyway (§6.3). The paired assertion needs no INSERT into any admin table, so neither problem arises.

**Second direction.** Every `admin_only` table found live must be in `ADMIN_TABLES` or an explicit non-§4.3 allowlist (today exactly `ignored_warnings`; `admin_emails` carries an `admin_only` policy but is excluded by the current derivation's own `tablename <> 'admin_emails'` clause and gets an explicit row). Both directions are required because the two sets genuinely disagree (§2.4).

`tests/db/admin-rls-runtime.baseline.json` and its frozen 19-name list are retired — the spec-derived registry is the baseline, and the baseline could only ever detect drift from itself, never disagreement with the spec. Its sole consumer is the test being relocated (verified: `grep -rl admin-rls-runtime.baseline` matches only `tests/db/admin-rls-runtime.test.ts`). `tests/db/admin-rls-runtime.test.ts:111`'s stale title ("18" asserting 19) dies with it.

### 6.3 AC-2.5's four-verb contract — how this cluster satisfies it

R2 finding 3 raised master spec AC-2.5 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3792`), which requires the full §4.3 list denied to non-admin sessions **across all four verbs**, exercised via a `__test_singleton_rls_probe` helper. Under invariant 7 the spec wins, so this needs a real answer rather than a waiver. Three findings settle it.

**(a) AC-2.5's own pass condition is grant-layer-compatible.** Its text requires "zero rows for SELECT; **permission-denied / zero-affected-rows for INSERT/UPDATE/DELETE**". A `42501 permission denied for table <t>` *is* permission-denied. For a REVOKEd table the write cells are therefore satisfied — and already asserted twice, per table per verb, by `tests/db/postgrest-dml-lockdown.test.ts:521` (catalog `has_table_privilege`) and `tests/db/postgrest-dml-lockdown.test.ts:759` (live PostgREST POST/PATCH/DELETE asserting the exact code and message).

**(b) A behavioral RLS write probe is not expressible on a REVOKEd table.** Postgres evaluates the ACL before row-level security, so after the REVOKE a write as role `authenticated` aborts at `42501` and no policy is ever evaluated — for an admin session too, since the role is `authenticated` regardless of JWT claims. Probe, on an already-REVOKEd table with full admin claims:

```
set local role authenticated; -- app_metadata.role=admin
delete from public.onboarding_scan_manifest where false;
--> ERROR: permission denied for table onboarding_scan_manifest
```

Adding the three write verbs to the relocated RLS test would assert `42501` while claiming to test RLS — duplicating (a)'s coverage under a misleading name.

**(c) The helper has never existed, and the omission was deliberate.** `__test_singleton_rls_probe` appears in no migration, test, lib, or script — only in spec and plan prose, where the two even disagree on whether it is SECURITY INVOKER (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3792`) or SECURITY DEFINER (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/02-schema-rls.md:417`). Neither is usable: INVOKER inherits the caller's revoked grants and hits `42501` identically; DEFINER runs as owner and bypasses grants *and* RLS, which makes it useless as a denial probe. And the shipped test documents at `tests/db/admin-rls-runtime.test.ts:31-39` that the v1 behavioral write probe was **removed because it false-passed** when NOT NULL / CHECK constraints fired before RLS — an anti-tautology fix, not an oversight.

**What this cluster therefore does.** The four-verb contract is met by the **union** of the two tests, and the spec says so explicitly rather than leaving it implied:

| Table class | SELECT | INSERT | UPDATE / DELETE |
| --- | --- | --- | --- |
| REVOKEd, SELECT retained (16 after this cluster) | behavioral **when rows exist**, else declared `unavailable — no rows` (§6.2) | grant-layer `42501` | grant-layer `42501` |
| REVOKEd ALL — `email_deliveries` only | **grant-layer `42501`** — `authenticated` has no SELECT | grant-layer `42501` | grant-layer `42501` |
| class (c) — `admin_alerts` | behavioral **when rows exist** | **behavioral when rows exist — new here** | **behavioral when rows exist — new here** |
| class (c) — `app_settings` | behavioral (singleton row always exists) | **structurally unavailable** — see below | **behavioral — new here** (singleton row always exists) |

The genuine residual AC-2.5 gap is exactly the two class-(c) tables: the grant remains, so RLS really is their only write gate, and today they have structural coverage only. The relocated test adds behavioral write cells **for them**, dodging the v1 false-pass by targeting rows that already validate: `UPDATE`/`DELETE` against an existing row under a non-admin session must affect **zero rows**, and no NOT NULL or CHECK constraint can fire on a row that is already valid.

Two cells cannot be produced as stated, and the spec says so rather than claiming them:

- **`email_deliveries` SELECT is grant-layer, not RLS** (R4 finding 2). `supabase/migrations/20260602000004_b3_email_deliveries.sql:21` revokes **ALL** from `anon, authenticated`, so a non-admin SELECT is rejected before its zero-policy RLS posture is ever reached — the paired witness is impossible, and `tests/db/postgrest-dml-lockdown.test.ts:292` already records `selectAnon: false` / `selectAuthenticated: false`. AC-2.5's SELECT cell is satisfied for it at the grant layer, which is strictly stronger than "zero rows".
- **`app_settings` INSERT is structurally unavailable** (R4 finding 3). It is a pre-seeded singleton: `id text primary key default 'default'` with `constraint app_settings_singleton check (id = 'default')` and the row already inserted (`supabase/migrations/20260501001000_internal_and_admin.sql:233`). A non-admin INSERT can only ever raise a duplicate-key error or affect zero rows with conflict suppression — identically whether RLS is enabled or disabled — so the cell would pass under an `ALTER TABLE … DISABLE ROW LEVEL SECURITY` mutant and proves nothing. Its INSERT coverage is the `relrowsecurity` and policy-count assertions plus the singleton CHECK itself. `admin_alerts`, which is not a singleton, does get a real behavioral INSERT cell.

**Row-dependence is a property of the matrix, not a footnote.** Every cell marked "behavioral when rows exist" degrades to `unavailable — no rows` on an empty table and is reported as such rather than passing (§6.2). Exhaustively, the row-dependent cells are: SELECT for any empty member of the 16-table SELECT-retaining class, and `admin_alerts`' SELECT/UPDATE/DELETE. The cells that are **not** row-dependent are `app_settings`' SELECT/UPDATE/DELETE (pre-seeded singleton, always present), `app_settings`' INSERT and `email_deliveries`' SELECT (both declared unavailable for structural reasons), and every grant-layer `42501` cell.

Any future admin-only table that is not REVOKEd inherits the same treatment by registry posture.

This closes AC-2.5 where it is testable and documents the grant-layer equivalence where it is not. No spec amendment is required — (a) shows the AC's own wording already admits the grant-layer proof.

### 6.4 CI placement

The test stays in the serial vitest project, PR-blocking via `unit-suite`, which already boots a Postgres for `tests/db`. It is deliberately **not** added to the `x3-trust-domain` file list (`package.json:36`) — that job runs `vitest run <file>` without a database, so a live-DB test there would fail or vacuously skip.

No 9th required status check (§1.1). The honest accounting: relocation buys spec-derivation and discoverability, **not** additional gating — `tests/db/admin-rls-runtime.test.ts` was already PR-blocking in the same suite. The coverage win is §6.2's inverted derivation, and claiming otherwise would overstate it.

---

## 7. Tier × domain completeness matrix

| Layer | `sync_log`+7 (§4.1 rows 1-8) | `app_settings`, `admin_alerts` | canonical-email | RLS coverage |
| --- | --- | --- | --- | --- |
| Table DDL | N/A — no DDL change | N/A | N/A | N/A |
| Grants | `REVOKE` I/U/D from anon+authenticated; `GRANT ALL` service_role | N/A — class (c) | N/A | N/A |
| Inline CHECK | N/A | N/A | unchanged (assertion only) | N/A |
| RLS policy | unchanged (`admin_only` already present, §2.3 probe) | unchanged | N/A | assertions only, no policy change |
| RPC read path | unaffected (SELECT retained) | unaffected | N/A | N/A |
| RPC write path | unaffected — SECURITY DEFINER runs as owner | unaffected | N/A | N/A |
| Trigger / cleanup fn | unaffected — raw SQL as `postgres` | unaffected | N/A | N/A |
| Frontend | none — no non-service writer (§4.1) | untouched by design | none | none |
| Tests | `RPC_GATED_TABLES` ×8 + Layer 5 | `ADMIN_DML_EXEMPTIONS` ×2 | live-catalog assertion + 3 rows | relocated + inverted |
| Schema manifest | `pnpm gen:schema-manifest` regenerated | N/A | N/A | N/A |
| Validation project | migration applied surgically (§10) | N/A | N/A | N/A |

## 8. Meta-test inventory

**Extends** (never parallels — `BACKLOG.md:912`):

- `tests/db/postgrest-dml-lockdown.test.ts` — 8 registry rows + new spec-derived Layer 5 + `ADMIN_DML_EXEMPTIONS`.
- `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` — live-catalog completeness assertion + 3 registry rows.

**Relocates:** `tests/db/admin-rls-runtime.test.ts` → a new RLS-coverage test under `tests/cross-cutting/`, derivation inverted; `tests/db/admin-rls-runtime.baseline.json` retired.

**Creates:** the `PUBLIC_TABLE_CLASSIFICATION` registry and its three catalog reconciliations (§4.5), pinned by the §4.5 mutation-family closure set. Note this is a **catalog** test, not a parser-extraction test — no generator mutants are exercised, because §4.5 makes the parser non-load-bearing rather than trustworthy.

**Advisory-lock topology:** N/A, and this time for a verified reason rather than an assumption. R3 correctly rejected the first N/A claim because §6.2 seeded every `ADMIN_TABLES` member, two of which (`pending_syncs`, `pending_ingestions`) are named in invariant 2. R4 then showed the repaired holder enumeration was itself wrong (`_archive_show_core` and `_unarchive_show_apply` are lock-free delegated helpers whose wrappers hold the lock, and `set_pull_sheet_override` was omitted). Rather than enumerate a 20-site lock landscape correctly, §6.2 no longer seeds lock-scoped tables at all — so no code path in this cluster mutates any invariant-2 table, and the invariant is not engaged. No SECURITY DEFINER function is added. The REVOKE itself acquires no lock (grants are catalog-level), and it makes the existing RPC holders *more* authoritative, not less.

**Invariant 10 (mutation-surface observability):** N/A — no new route handler and no new `"use server"` action. The 8 REVOKEd tables have no non-service-role mutation surface to instrument.

## 9. Documented limits and the promotion path

1. **`app_settings` + `admin_alerts` remain admin-session-writable.** Closing them requires choosing a replacement gate — service-role-after-`requireAdmin`, or a SECURITY DEFINER RPC per write — and either inverts the documented "RLS is authoritative" contract at `setAutoPublish.ts:47-48` and `actions.ts:139-143`. For `admin_alerts` the RPC path additionally has to encode the HEALTH-code developer-gate (`actions.ts:114-131`) in SQL, which is the "materially larger, whole-resolve-path change" already scoped at `BACKLOG.md:556`. Both stay class (c) with `ADMIN_DML_EXEMPTIONS` rows; §11 names the decision Eric owns.
2. **The DDL-spelling class survives in three migration-parsing sites, and the catalog assertion is its backstop.** A repo-wide sweep found exactly two §4.3 *spec* extractors (both unified in §4.5). Three further files run `create table` regexes over `supabase/migrations/` for table attribution: `lib/audit/emailCanonicalization.ts`, `tests/cross-cutting/_canonicalEmailCheckContract.test.ts` (its `tableAtOffset`, which attributes a parsed CHECK to a table), and `tests/db/schema.test.ts`. A migration written `create table public."foo"` could mis-attribute in the first two. This is not fixed here — but §5.3's live-catalog assertion is exactly the backstop for it: `pg_constraint` carries the true `conrelid`, so a mis-attributed or missed CHECK in the static walk surfaces as a catalog/registry mismatch. The residual is that the static walk's per-column body assertion could be attributed to the wrong table while the catalog assertion still balances; no live migration uses a quoted or qualified CREATE TABLE today.
3. **Body-structure of canonical CHECKs is still unverified** (§5.1). The three substring regexes accept a wrong boolean grouping. Widening to a full predicate parse is a separate, larger change; filed rather than smuggled in.
4. **`role_token_mappings.decided_by` stays outside the AC-X.5 manifest** until its own amendment cycle (§5.3). Its canonicalization is correct today but unpoliced by the `x5-email-canonicalization` gate; this cluster pins only that the CHECK exists.
5. **The `deny_all` posture is declared, not derived.** A table wrongly declared `deny_all` when it should carry `admin_only` passes. The posture column is one greppable word per table, which makes a wrong declaration visible at review; no test can adjudicate intent.
6. **Layer 5 proves classification exists, not that it is correct.** A future table wrongly classed (c) with a plausible reason passes. The reason string must carry a `file:line`, which makes a wrong row falsifiable at review time, but no test can adjudicate intent.

## 10. Migration → validation parity checklist (per AGENTS.md)

Lands in the same PR as the migration:

1. Apply locally + TDD red→green (`psql "$DATABASE_URL" -f supabase/migrations/<file>.sql`).
2. `pnpm gen:schema-manifest`; commit the regenerated `supabase/__generated__/schema-manifest.json`.
3. Apply surgically to validation project `vzakgrxqwcalbmagufjh` (`supabase db push` is blocked there), then `notify pgrst, 'reload schema';`.
4. `validation-schema-parity` CI job green (Layer 1 catches a skipped step 2; Layer 2 catches a skipped step 3).

Note: grants are not columns. The schema manifest tracks `public` tables/columns, so a REVOKE-only migration may produce an empty manifest diff — step 2 is still run and its no-op result recorded, and step 3 remains mandatory because the parity job cannot see grant drift at all.

## 11. Open decision for Eric (non-blocking; does not gate this cluster)

Should `app_settings` and `admin_alerts` be promoted from class (c) to locked-down, accepting the trust-boundary inversion in §9.1? Shipping this cluster does not foreclose either answer, and the `ADMIN_DML_EXEMPTIONS` rows make the current state explicit and greppable rather than silent.

## 12. Closeout

**impeccable-gate: N/A — no UI surface.** No file under `app/` (except none), `components/`, `app/globals.css`, `DESIGN.md`, or `tailwind.config.*` is modified. The diff is `supabase/migrations/**`, `tests/**`, `docs/**`.
