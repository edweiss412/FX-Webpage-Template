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
3. **Hardening `ADMIN_TABLES`' generator so a §4.3 table can never drop out silently** (§4.5) — the prerequisite the other two rest on.
4. The RLS probe re-derived from §4.3, relocated cross-cutting, with `relrowsecurity`, policy-count, and non-vacuous behavioral assertions (§6).
5. A live-catalog completeness assertion for canonical-email CHECKs, closing 3 name-invisible ones (§5).

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| `app_settings` and `admin_alerts` are **NOT** locked down in this cluster. RLS is their *documented authoritative* write gate, not an accident. | `app/admin/settings/_actions/setAutoPublish.ts:47-48` ("The authoritative write gate is the app_settings admin_only RLS"); `app/admin/actions.ts:139-143`; `BACKLOG.md:556` records the `admin_alerts` posture as explicitly ACCEPTED. See §4.1 class (c) and §9. |
| No 9th required GitHub status check is added. | Adding one requires a manual branch-protection admin step by Eric and risks the documented fork-PR deadlock (master spec §17.2.1). The new assertions run in the existing PR-blocking `unit-suite` serial project. See §6.3. |
| `BL-X5-INTROSPECTION-GAP`'s archived COMPLETE claim **holds** for its stated scope. This cluster does not redo it; it closes only the residual aperture defect found while verifying it. | `BACKLOG-archive.md:2080`; verification transcript §5.1. |
| The 4 M11.5-dropped tables (`crew_member_auth`, `revoked_links`, `link_sessions`, `bootstrap_nonces`) are out of scope — their relations do not exist. | `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:23-26`; `scripts/generate-admin-tables.ts:31-34` `removedByPickerPivot`. |
| `admin_field_overrides.created_by`'s canonical CHECK is **not** a gap. The table was dropped; only stale migration text remains. | `supabase/migrations/20260710000000_remove_admin_field_overrides.sql`; live `to_regclass('public.admin_field_overrides')` returns NULL (§5.1 probe). |
| Prose §4.3 count is **23**; live `ADMIN_TABLES.length` is **19**. Both are correct; the delta is the 4 dropped tables. | master spec footnote `[^admintables-22]` at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:643`. |
| Statement-level lockdown does **not** replace RLS. It is the statement-level half of a two-half contract; RLS remains the row-level half. | `BACKLOG.md:918`. |
| The catalog assertion gets its **own** registry, not `expectedBoundaryChecks`. The two police different contracts, and merging them would drag in the AC-X.5 manifest coupling. | R1 finding 2; `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:202`; `scripts/extract-email-boundaries.ts:87`. See §5.3. |
| `email_deliveries` having **zero** RLS policies is correct, not a coverage hole — zero policies under enabled RLS is deny-all, stronger than `admin_only`. | §2.4 probe; `supabase/migrations/20260602000004_b3_email_deliveries.sql:21`. |
| Registering `role_token_mappings.decided_by` in the AC-X.5 manifest is a **separate** cycle, not part of this cluster. Its write paths already canonicalize correctly. | `app/admin/show/[slug]/_actions/roleToken.ts:57`; §5.3 follow-up. |

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

Eight new `RPC_GATED_TABLES` entries in `tests/db/postgrest-dml-lockdown.test.ts` (registry at `tests/db/postgrest-dml-lockdown.test.ts:147-511`, row shape at `tests/db/postgrest-dml-lockdown.test.ts:138`). Each carries `table`, `closed_at` (the new migration's `file:line`), `selectAnon: false`, `selectAuthenticated: true`, plus a `postBody`/`rowFilter` that satisfies the table's NOT NULL columns. Layer 4 (`tests/db/postgrest-dml-lockdown.test.ts:873`, `tests/db/postgrest-dml-lockdown.test.ts:897`) already enforces the migration↔registry lockstep in both directions, so the rows are mandatory, not optional.

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

### 4.5 Hardening the generator — the load-bearing prerequisite

Both Layer 5 and §6.2 rest on `ADMIN_TABLES` being a faithful projection of §4.3. R1 finding 1 established, by probe, that it is not. `scripts/generate-admin-tables.ts:29-30` intersects the §4.3 bullet names with

```js
Array.from(spec.matchAll(/create table ([a-z][a-z0-9_]*)/g), (m) => m[1])
```

then `.filter((name) => tableDefinitions.has(name) && …)`. The regex is case-sensitive, requires an unqualified name, and does not accept `if not exists`. Three valid CREATE TABLE spellings each drop the table **silently** — no throw, no diff, so regeneration stays clean and the X.3 freshness check passes:

```
create table public.future_admin (id uuid);        => generated=19, future_admin absent
CREATE TABLE future_admin (id uuid);               => generated=19, future_admin absent
create table if not exists future_admin (id uuid); => generated=19, future_admin absent
```

A §4.3 table written any of those ways is invisible to Layer 5, to the RLS test, and to `PROTECTED_TABLES` in `lib/audit/authPrimitives.ts:92` — i.e. the generator's silent intersection-drop is the same defect class the cluster exists to close, sitting upstream of all of it.

Two changes, and the second is the real fix:

1. **Widen the regex** to `/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z][a-z0-9_]*)/gi`.
2. **Make the drop loud.** Every §4.3 bullet name must resolve to a CREATE TABLE block or be a declared member of `removedByPickerPivot`; anything else **throws** with the offending name. Regex-widening alone only moves the goalpost to the next unanticipated spelling — a name the generator cannot resolve must fail the build, never vanish.

Pinned by a test that runs the generator's extraction against synthetic §4.3 mutants covering all three spellings above plus an unresolvable name (expecting a throw). This is the mutation-family closure set for the generator surface; a new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

---

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
3. **Non-vacuous behavioral arm** — the existing arm asserts `nonadmin_count=0`, which on an empty table passes whether RLS denies the rows or no rows exist. 5 of 6 sampled §4.3 tables are empty locally and emptier in a fresh CI bootstrap, so the arm cannot currently fail for them. The relocated test seeds a sentinel row inside the test transaction before the non-admin SELECT, so the assertion can actually fail.

**Second direction.** Every `admin_only` table found live must be in `ADMIN_TABLES` or an explicit non-§4.3 allowlist (today exactly `ignored_warnings`; `admin_emails` carries an `admin_only` policy but is excluded by the current derivation's own `tablename <> 'admin_emails'` clause and gets an explicit row). Both directions are required because the two sets genuinely disagree (§2.4).

`tests/db/admin-rls-runtime.baseline.json` and its frozen 19-name list are retired — the spec-derived registry is the baseline, and the baseline could only ever detect drift from itself, never disagreement with the spec. Its sole consumer is the test being relocated (verified: `grep -rl admin-rls-runtime.baseline` matches only `tests/db/admin-rls-runtime.test.ts`). `tests/db/admin-rls-runtime.test.ts:111`'s stale title ("18" asserting 19) dies with it.

### 6.3 CI placement

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

**Creates:** a generator-extraction test pinning `scripts/generate-admin-tables.ts` against the §4.5 mutant set (three CREATE TABLE spellings + an unresolvable name expecting a throw).

**Advisory-lock topology:** N/A — this cluster acquires no `pg_advisory*` lock and adds no SECURITY DEFINER function. Grants and test assertions only. (Invariant 2 unaffected: locks live inside the RPCs, which the REVOKE makes *more* authoritative, not less.)

**Invariant 10 (mutation-surface observability):** N/A — no new route handler and no new `"use server"` action. The 8 REVOKEd tables have no non-service-role mutation surface to instrument.

## 9. Documented limits and the promotion path

1. **`app_settings` + `admin_alerts` remain admin-session-writable.** Closing them requires choosing a replacement gate — service-role-after-`requireAdmin`, or a SECURITY DEFINER RPC per write — and either inverts the documented "RLS is authoritative" contract at `setAutoPublish.ts:47-48` and `actions.ts:139-143`. For `admin_alerts` the RPC path additionally has to encode the HEALTH-code developer-gate (`actions.ts:114-131`) in SQL, which is the "materially larger, whole-resolve-path change" already scoped at `BACKLOG.md:556`. Both stay class (c) with `ADMIN_DML_EXEMPTIONS` rows; §11 names the decision Eric owns.
2. **Body-structure of canonical CHECKs is still unverified** (§5.1). The three substring regexes accept a wrong boolean grouping. Widening to a full predicate parse is a separate, larger change; filed rather than smuggled in.
3. **`role_token_mappings.decided_by` stays outside the AC-X.5 manifest** until its own amendment cycle (§5.3). Its canonicalization is correct today but unpoliced by the `x5-email-canonicalization` gate; this cluster pins only that the CHECK exists.
4. **The `deny_all` posture is declared, not derived.** A table wrongly declared `deny_all` when it should carry `admin_only` passes. The posture column is one greppable word per table, which makes a wrong declaration visible at review; no test can adjudicate intent.
5. **Layer 5 proves classification exists, not that it is correct.** A future table wrongly classed (c) with a plausible reason passes. The reason string must carry a `file:line`, which makes a wrong row falsifiable at review time, but no test can adjudicate intent.

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
