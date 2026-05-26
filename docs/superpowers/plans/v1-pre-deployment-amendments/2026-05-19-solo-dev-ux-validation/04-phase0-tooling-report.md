# Phase 0.E — `validation:report-fixtures` (Band F report-pipeline harness)

> Per spec §4.2 band F + §9.0 task 0.E (R24 BLOCKING gate) + §9.1.2. Estimate: 0.5 day.
>
> Goal: ship the report-pipeline fault-injection harness. BLOCKING by default per spec §9.0 — unblocked only by pre-dispositioning every deep report outcome as EXCLUDED-rely-on-structural in MATRIX-INVENTORY.md.

---

### Task 0.E.0: Derive MATRIX-INVENTORY.md band F slice FIRST (R1 P1 amendment — was Phase 1 Task 1.0, moved here)

**Files:**
- Create: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md` (start)

Phase 0.E's disposition decision (INCLUDED-via-harness vs EXCLUDED-rely-on-structural per spec §4.2 band F) depends on MATRIX-INVENTORY rows for the band F report-pipeline outcomes. R1 finding F3: the full MATRIX-INVENTORY can't wait until Phase 1 because Phase 0.E + Phase 0.F smoke 7 both gate on its band F slice.

**Plan amendment:** Phase 1 Task 1.0 (full MATRIX-INVENTORY derivation) splits — its band F slice is created HERE in Phase 0.E.0 (before Phase 0.E.1 disposition decision); the rest of MATRIX-INVENTORY can be filled in Phase 1 Task 1.0 (the file already exists by then, just gets expanded for bands A–E).

- [ ] **Step 1: Create `MATRIX-INVENTORY.md` with the band F section ONLY.** Enumerate every report-pipeline outcome per master spec §13.2.3:
  - `success` (admin parse-panel report button submitted)
  - `success` (crew "Something looks wrong?" modal submitted)
  - `IDEMPOTENCY_IN_FLIGHT` (in-flight idempotency hit)
  - `RATE_LIMIT_ADMIN` (admin 429)
  - `RATE_LIMIT_CREW` (crew 429)
  - `LOOKUP_INCONCLUSIVE` (GitHub lookup 502)
  - `LEASE_EXPIRED` (per spec §13.2 lease pattern)
  - `HORIZON_EXPIRED` (`REPORT_HORIZON_EXPIRED` 410)
  - `ORPHANED_LOST_LEASE` (`REPORT_ORPHANED_LOST_LEASE`)

- [ ] **Step 2: For each row, set disposition** — INCLUDED-via-harness OR EXCLUDED-rely-on-structural with structural-test cite.

- [ ] **Step 3: Sum the dispositions.** If ALL deep outcomes (LOOKUP_INCONCLUSIVE / LEASE_EXPIRED / HORIZON_EXPIRED / ORPHANED_LOST_LEASE) are EXCLUDED with cites, Phase 0.E.1-0.E.3 are N/A → skip to Phase 0.F. Otherwise (at least one INCLUDED-via-harness), proceed with the harness.

- [ ] **Step 4: Commit MATRIX-INVENTORY.md (partial — band F section only):**

```bash
git add docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/MATRIX-INVENTORY.md
git commit -m "docs(m12): MATRIX-INVENTORY band F slice for Phase 0.E disposition"
```

---

### Task 0.E.1: Decide INCLUDED-via-harness vs EXCLUDED-rely-on-structural

Phase 0.E is BLOCKING under the default disposition. If the dev wants to skip authoring this harness, they MUST instead pre-disposition every deep report-pipeline outcome (lookup-inconclusive, lease-expired, horizon-expired, orphaned-lost-lease) as EXCLUDED-rely-on-structural in MATRIX-INVENTORY.md (Task 0.E.0 above).

- [ ] **Step 1: Decide.** If unsure, default to INCLUDED-via-harness (build the harness). The alternative (EXCLUDED) requires careful per-outcome justification with structural-test cites — and the cites must be REAL (a test file path + assertion that pins the contract).

- [ ] **Step 2: Record the decision in MATRIX-INVENTORY.md band F rows** (each deep outcome's disposition column).

---

### Task 0.E.1: Implement `validation-report-fixtures` (per-outcome producer-state harness — R31 rewrite)

**Files:**
- Create: `scripts/validation-report-fixtures.ts`
- Create: `tests/scripts/validation-report-fixtures.test.ts`

Per spec §9.1.2: `--outcome <success|in-flight|rate-limit-admin|rate-limit-crew|lookup-inconclusive|lease-expired|horizon-expired|orphaned-lost-lease>`. **R31 commit 65 rewrite (was-versus-is):** the prior R-series draft said "Materializes the named outcome's row shape in the `reports` table directly via service role." That was a producer-state mismatch (handoff §9 R31 F30): 4 of 8 outcomes do NOT primary-surface through the `reports` table — `rate-limit-admin` / `rate-limit-crew` materialize through `report_rate_limits`; `lookup-inconclusive` / `orphaned-lost-lease` materialize through `admin_alerts` (read by `AlertBanner`, not by any reports-list route, which does not exist).

The R31 rewrite makes the harness write the SAME table the real production code writes for each outcome — the canonical per-outcome producer-state map is in handoff §9 amendment R31 row §A. Harness behavior for each outcome follows that map row-by-row.

**Per-outcome harness behavior (canonical R31 map):**

| `--outcome` | Producer-table write(s) | UI surface to verify | Cleanup tables |
|---|---|---|---|
| `success` (admin) | INSERT `reports` row with `github_issue_url` set + lease released (`lease_holder=NULL`, `processing_lease_until=now()`). | `ReportModal` succeeded-state with `github_issue_url` (admin only) | `reports` |
| `success` (crew) | INSERT `reports` row with `reported_by_kind='crew'`, `github_issue_url` set + lease released. | `ReportModal` succeeded-state (crew flavour omits url) | `reports` |
| `in-flight` | INSERT `reports` row with `processing_lease_until = now() + interval '90 seconds'`, `github_issue_url = NULL`, `lease_holder = gen_random_uuid()`. The next `/api/report` call with the same `idempotency_key` will see `lease_live=true` and return 409 `IDEMPOTENCY_IN_FLIGHT`. | `ReportModal` failed-retryable banner code `IDEMPOTENCY_IN_FLIGHT` on subsequent POST | `reports` |
| `rate-limit-admin` | INSERT `report_rate_limits` row with `kind='admin'`, `identity=<canonical($VALIDATION_ADMIN_EMAIL)>`, `hour_bucket=date_trunc('hour', now())`, `count=11` (admin limit is 10 per `lib/reports/rateLimit.ts:53-55`; first request after this seed sees count=12 → quota denied). NO `reports` row. | `ReportModal` failed-retryable banner code `REPORT_RATE_LIMITED_ADMIN` on next admin POST | `report_rate_limits` |
| `rate-limit-crew` | INSERT `report_rate_limits` row with `kind='crew'`, `identity=<a known crew_member_id from the reseed fixture>`, `hour_bucket=date_trunc('hour', now())`, `count=4` (crew limit is 3). NO `reports` row. | `ReportModal` failed-retryable banner code `REPORT_RATE_LIMITED_CREW` on next crew POST | `report_rate_limits` |
| `lookup-inconclusive` | **Two-write producer:** (i) INSERT `reports` row in post-lease-expired state (`processing_lease_until = now() - interval '60 seconds'`, `github_issue_url=NULL`, `created_at = now()`, `lease_holder=NULL`); (ii) INSERT `admin_alerts` row with `code='REPORT_LOOKUP_INCONCLUSIVE'`, `context={idempotency_key, reason:'lookup_inconclusive_fixture', code:'BOT_LOGIN_MISSING', validation_tag:'m12-fixture-lookup-inconclusive'}`, `show_id=<fixture show id>` (matches the live `resolveStateGatedAlert` upsert shape at `lib/reports/submit.ts:583-606`). | `AlertBanner` row with code `REPORT_LOOKUP_INCONCLUSIVE` rendered on admin show page (admin_alerts SELECT at `components/admin/AlertBanner.tsx:97`) | `admin_alerts` + `reports` |
| `lease-expired` | INSERT `reports` row with `processing_lease_until = now() - interval '60 seconds'`, `github_issue_url=NULL`, `created_at = now()`, `lease_holder=NULL`. The next `/api/report` call enters the `expiredLeaseRetry` path (`lib/reports/submit.ts:742-870`); UI rendering value of pure-lease-expired-row without retry trigger is zero — this outcome's value is structural (proves `expired_pending_recovery` dispatch fires). Cleanup must NOT depend on a subsequent retry exercise. | UI observable only via subsequent retry; harness asserts row state + lets Phase 0.F.7 smoke trigger it via real POST | `reports` |
| `horizon-expired` | INSERT `reports` row with `created_at = now() - interval '25 hours'`, `github_issue_url=NULL`. **Note:** this REQUIRES a direct service-role INSERT — the live `acquireReportLease` path uses `default now()` for `created_at` (`lib/reports/leaseProtocol.ts:80-126`), so the live submit path cannot materialize this state. | `ReportModal` failed-retryable with code `REPORT_HORIZON_EXPIRED` (HTTP 410) → `expired` modal status branch at `components/shared/ReportModal.tsx:331-333` on next POST with same `idempotency_key` | `reports` |
| `orphaned-lost-lease` | INSERT `admin_alerts` row with `code='REPORT_ORPHANED_LOST_LEASE'`, `context={idempotency_key, orphan_url:'https://github.com/<bot>/<repo>/issues/<n>', orphan_issue_number:<n>, lease_holder:<uuid>, row_reaped:false, stored_url:null, orphan_close_failed:false, orphan_close_error:null, validation_tag:'m12-fixture-orphaned-lost-lease'}` (matches `lib/reports/submit.ts:901-922` UPSERT shape exactly). Optionally INSERT a stub `reports` row in the lost-lease state (created_at within 24h, github_issue_url=NULL, lease_holder=NULL, processing_lease_until in the past). | `AlertBanner` row with code `REPORT_ORPHANED_LOST_LEASE` rendered on admin show page | `admin_alerts` (+ optional `reports`) |

**Tagging convention (CRITICAL for cleanup correctness):** every harness-INSERTed row carries `validation_tag = 'm12-fixture-<outcome>'` somewhere addressable:

- `reports` rows → `context->>'validation_tag'` (jsonb field) — `reports.context` is `jsonb not null` per `supabase/migrations/20260501001000_internal_and_admin.sql:315`.
- `report_rate_limits` rows → no jsonb column; instead the `identity` field uses a reserved prefix `validation:m12-fixture-<outcome>:` so the cleanup pattern is `WHERE identity LIKE 'validation:m12-fixture-%'`. For the rate-limit-admin outcome where the harness needs to actually deny admin POSTs, the dev's real admin email is used (NOT the prefix); cleanup for this outcome separately tracks the canonical email via a `--cleanup --include-admin-email <email>` flag (default cleanup is conservative and does NOT touch real admin email rows).
- `admin_alerts` rows → `context->>'validation_tag'` (jsonb field) — `admin_alerts.context` is `jsonb not null` per `supabase/migrations/20260501001000_internal_and_admin.sql:272`.

**Steps:**

- [ ] **Step 1: Write failing test** in `tests/scripts/validation-report-fixtures.test.ts`:
  - rejects unknown outcome name (exit 1 + stderr contains `unknown outcome`)
  - for each of the 8 outcomes (use a `describe.each`), invoking the harness produces the row shape per the R31 map row above; assertions read DIRECTLY from each producer table (NOT from a wrapper) — e.g. for `rate-limit-admin`, `SELECT * FROM report_rate_limits WHERE kind='admin' AND identity LIKE 'validation:%' AND count=11` returns exactly one row.
  - returns structured stdout: `materialized <outcome> report row <id>` (where `<id>` is `reports.id`, `admin_alerts.id`, or `report_rate_limits.(kind, identity, hour_bucket)` tuple depending on producer)
  - has a `--cleanup` flag that DELETEs validation-tagged rows from ALL three tables in order: `admin_alerts` first → `report_rate_limits` second → `reports` last (per handoff §9 R31 cleanup-order rationale)
  - cleanup test runs a fresh harness invocation for each outcome, then cleanup, then asserts row counts in all 3 tables match the pre-fixture baseline

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Verify producer-state map against live code** by grepping the cited file:line refs in handoff §9 R31 §A:
  - `lib/reports/submit.ts:935-998` for entry-point dispatch
  - `lib/reports/rateLimit.ts:71-98` for quota UPSERT shape
  - `lib/reports/submit.ts:583-606` for state-gated alert upsert shape
  - `lib/reports/submit.ts:901-922` for orphaned-lost-lease alert shape
  - `components/admin/AlertBanner.tsx:97` for admin_alerts SELECT predicate

  If any cited line/shape has drifted since R31 was authored, halt and surface in the handoff §9 — do NOT proceed to implementation against stale citations.

- [ ] **Step 4: Implement** `scripts/validation-report-fixtures.ts` using `assertProdEquivalentTarget` guard. Per-outcome dispatch with the table-write recipe from the map above. Service-role client (`createSupabaseServiceRoleClient`) for INSERT/UPSERT; advisory lock unnecessary (none of these writes mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions` per plan-wide invariant 2).

- [ ] **Step 5: Tag every harness write** per the tagging convention above. Specifically:
  - `reports.context` ← `jsonb_build_object('validation_tag', 'm12-fixture-' || $outcome, ...)`
  - `admin_alerts.context` ← `jsonb_build_object('validation_tag', 'm12-fixture-' || $outcome, ...payload-fields-per-live-shape)`
  - `report_rate_limits.identity` ← `'validation:m12-fixture-' || $outcome || ':' || gen_random_uuid()` (except for `rate-limit-admin`, which MUST use the real admin email to actually trigger the quota deny path)

- [ ] **Step 6: Run — expect PASS.** Commit.

---

### Task 0.E.2: Integration test against the rendered UI (R31 rewrite — per-outcome rendering predicate)

The harness's value is rendering. **R31 rewrite (was-versus-is):** the prior step asserted "for each materialized outcome, `messageFor(<outcome-code>)` returns a non-null `dougFacing`." That predicate works for the 4 outcomes that flow through `ReportModal` (codes `IDEMPOTENCY_IN_FLIGHT` / `REPORT_HORIZON_EXPIRED` / `REPORT_RATE_LIMITED_ADMIN` / `REPORT_RATE_LIMITED_CREW`) but is structurally wrong for the 4 outcomes that primary-surface through `AlertBanner` reading `admin_alerts` — the rendering predicate for those is "admin_alerts row exists + AlertBanner SELECT returns it," NOT "messageFor lookup is non-null."

**Per-outcome rendering assertion (R31 canonical):**

| `--outcome` | Rendering-predicate assertion |
|---|---|
| `success` (admin) | `reports` row with `github_issue_url IS NOT NULL` exists; `ReportModal` succeeded-state shows the url. Unit-test asserts: API response body shape `{ ok: true, status: 'created'\|'duplicate'\|'recovered', github_issue_url: <string> }` per `lib/reports/submit.ts:179-186`. |
| `success` (crew) | Same as admin success minus `github_issue_url` field in body. |
| `in-flight` | `messageFor('IDEMPOTENCY_IN_FLIGHT').dougFacing` is non-null (catalog `lib/messages/catalog.ts:154-162`). |
| `rate-limit-admin` | `messageFor('REPORT_RATE_LIMITED_ADMIN').dougFacing` is non-null (catalog `:846-854`); `report_rate_limits` row count for the canonical admin identity is exactly 11 after harness write. |
| `rate-limit-crew` | `messageFor('REPORT_RATE_LIMITED_CREW').dougFacing` is non-null (catalog `:856-...`); `report_rate_limits` row count for the fixture crew identity is exactly 4. |
| `lookup-inconclusive` | `admin_alerts` row with `code='REPORT_LOOKUP_INCONCLUSIVE'` AND `context->>'validation_tag' LIKE 'm12-fixture-%'` exists; `AlertBanner`'s admin-RLS SELECT (`components/admin/AlertBanner.tsx:97`) returns it for an admin session. Catalog code `messageFor('REPORT_LOOKUP_INCONCLUSIVE').dougFacing` is also non-null (defense-in-depth, since the lookup path also returns 502 via `ReportModal`'s failed-retryable banner). |
| `lease-expired` | NO direct UI surface for pure-lease-expired-row; assertion is structural: `reports` row count after harness write is +1, lease state matches the recipe. Phase 0.F.7 smoke triggers the retry-path UI surface via real POST. |
| `horizon-expired` | `messageFor('REPORT_HORIZON_EXPIRED').dougFacing` is non-null (catalog `:1466-1474`); also `ReportModal` `expired` modal-status branch fires (`components/shared/ReportModal.tsx:331-333`). The `expired` status is the ONLY outcome-distinguishable branch in the modal beyond `failed-retryable` — assertion can rely on this asymmetry. |
| `orphaned-lost-lease` | `admin_alerts` row with `code='REPORT_ORPHANED_LOST_LEASE'` AND validation_tag exists; `AlertBanner` SELECT returns it. Catalog code `messageFor('REPORT_ORPHANED_LOST_LEASE').dougFacing` is non-null (`:1166-1174`). |

- [ ] **Step 1: Write rendering-predicate assertions** per the R31 canonical table above. For `admin_alerts`-surfacing outcomes (`lookup-inconclusive`, `orphaned-lost-lease`), assert BOTH that the row was written AND that an admin-RLS SELECT returns it (use the same query shape as `components/admin/AlertBanner.tsx:97`). For `report_rate_limits` outcomes, assert the bucket row + count match the recipe.

  **Anti-tautology guard:** when asserting the `admin_alerts` row triggers AlertBanner rendering, the test MUST clone the rendered AlertBanner DOM tree and remove unrelated sibling alerts (other admin_alerts rows for the same show) before asserting the specific code label appears — a broken implementation could otherwise pass if any other admin_alerts row happened to render with overlapping text. Per AGENTS.md anti-tautology rule.

  **Dual-write awareness (handoff §9 R31 out-of-scope flag):** `lib/reports/submit.ts:565-581` has a private `upsertAdminAlert` helper that duplicates the `lib/adminAlerts/upsertAdminAlert.ts` shape but writes via raw SQL UPSERT instead of the `upsert_admin_alert` RPC. The harness writes via service-role INSERT/UPSERT (matching the raw-SQL path); the live production code paths use BOTH writers — the harness assertion should treat the `admin_alerts` table as the single source of truth (read both shapes back from the table; don't assert which writer fired).

- [ ] **Step 2: Run.** Commit.

---

### Task 0.E.3: End-to-end Phase 0.E verification (R31 rewrite — real rendering surface, no nonexistent admin route)

**R31 rewrite (was-versus-is):** prior Step 1 said "Run `pnpm validation:report-fixtures --outcome lookup-inconclusive` against prod-equivalent Supabase. Expect exit 0 + report row visible in admin UI." There is no admin reports route — `ls app/admin/` confirms `_finalizeCheckpoint.ts`, `actions.ts`, `dev/`, `layout.tsx`, `onboarding/`, `page.tsx`, `settings/`, `show/` only; no `reports/`. The correct rendering surface is `AlertBanner` on the admin show page (the show whose `show_id` matches the harness write).

- [ ] **Step 1: Run `pnpm validation:report-fixtures --outcome lookup-inconclusive`** against prod-equivalent Supabase. Expect exit 0 + harness stdout `materialized lookup-inconclusive report row <id>` + `admin_alerts` row with `code='REPORT_LOOKUP_INCONCLUSIVE'` visible in `AlertBanner` when the dev opens `/admin/show/<fixture-slug>` while signed in as admin.

- [ ] **Step 2: Verify cleanup works:** `pnpm validation:report-fixtures --cleanup`. Confirm DELETE removed ALL three tables' validation-tagged rows in order — query each table directly to verify zero `validation:m12-fixture-%` matches remain.

- [ ] **Step 3: Move to Phase 0.F** (`05-phase0-smokes.md` — renamed from `06` in 2026-05-26 picker-pivot rebase).

---

## Phase 0.E failure modes

- **Harness INSERT fails CHECK constraint.** `reports.reported_by_kind` CHECK accepts `'admin'|'crew'` (`supabase/migrations/20260501001000_internal_and_admin.sql:312`); `report_rate_limits.kind` CHECK accepts `'admin'|'crew'` (`:329`); `admin_alerts.code` is free text (no CHECK — verified `:271`) so any code value is acceptable. If any harness write fails, re-read the cited migration line + the R31 §A producer-shape recipe.
- **Row materialized in WRONG table for the outcome.** The pre-R31 trap: writing `reports` rows for rate-limit-admin/crew when the real producer is `report_rate_limits`. Fix: re-check the R31 §A producer-state map against the harness dispatch table per-outcome.
- **Rendering predicate is `messageFor` but the real surface is `AlertBanner`.** Pre-R31 trap. Fix: per the R31 rendering-predicate table above, outcomes `lookup-inconclusive` and `orphaned-lost-lease` MUST assert `admin_alerts` row + `AlertBanner` SELECT return — NOT just catalog lookup.
- **Cleanup misses rows across tables.** All three producer tables must be cleaned. `admin_alerts.context->>'validation_tag'`, `report_rate_limits.identity LIKE 'validation:m12-fixture-%'`, and `reports.context->>'validation_tag'` are the three predicates. Order: admin_alerts → report_rate_limits → reports (per handoff §9 R31 cleanup-order rationale). If the cleanup invocation skips a table, the dev's prod-equivalent Supabase project accumulates fixture noise that will trip future admin-only-table audits.
- **Real admin email used for `rate-limit-admin` outcome.** The dev's actual admin email goes into `report_rate_limits.identity` (canonicalized via `lib/email/canonicalize.ts`) to make the quota path actually deny on the next admin POST. Cleanup is gated behind `--cleanup --include-admin-email <email>` so an inadvertent run doesn't nuke real admin rate-limit state.
