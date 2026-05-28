# MATRIX-INVENTORY — solo-dev UX validation milestone

> Per Phase 0.E plan Task 0.E.0 (R1 P1 amendment — was Phase 1 Task 1.0). This file enumerates every contract surface the validation harness must materialize and its disposition (INCLUDED-via-harness vs EXCLUDED-rely-on-structural).
>
> **Status: PARTIAL — band F (report-pipeline outcomes) only.** Bands A–E (crew-page right-now states / restriction modes / role-flag matrix / admin gates / picker flow) get filled by Phase 1 Task 1.0 when that phase opens.

---

## Band F — report-pipeline outcomes (Phase 0.E gates on these)

Per master spec §13.2.3 amendments + plan `04-phase0-tooling-report.md` Task 0.E.1 producer-state map (R31 commit 65 rewrite, R43 commit 81 F40 split). Disposition column drives Phase 0.E.1 entry: if ALL of the four deep outcomes (lookup-inconclusive / lease-expired / horizon-expired / orphaned-lost-lease) are EXCLUDED-rely-on-structural with real test-file cites, Phase 0.E.1–0.E.3 are N/A. Otherwise the harness MUST ship.

| # | `--outcome` enum value | Producer table(s) | UI surface | Disposition | Rationale / cite |
|---|---|---|---|---|---|
| F.1 | `success-admin` (R43 F40 split — was `success` admin variant) | `reports` row with `reported_by_kind='admin'` + `github_issue_url` + released lease | `ReportModal` succeeded-state with `github_issue_url` (admin-only body field per `lib/reports/submit.ts:184`) | **INCLUDED-via-harness** | Validation harness lets the solo dev physically see the admin success state in `vzakgrxqwcalbmagufjh` without a real GitHub POST. Live unit tests cover `submitReport` happy-path; the harness covers the UX-rendering predicate which unit tests cannot. |
| F.2 | `success-crew` (R43 F40 split — was `success` crew variant) | `reports` row with `reported_by_kind='crew'` + `github_issue_url` + released lease | `ReportModal` succeeded-state without `github_issue_url` (crew body shape per `lib/reports/submit.ts:185`) | **INCLUDED-via-harness** | Same reasoning as F.1 for the crew actor; the body-shape divergence (admin includes url; crew omits it) is a separate UX surface that the validation harness materializes independently. |
| F.3 | `in-flight` | `reports` row with live lease (`processing_lease_until = now() + interval '90 seconds'`, `lease_holder=gen_random_uuid()`, `github_issue_url=NULL`) | `ReportModal` failed-retryable banner `IDEMPOTENCY_IN_FLIGHT` on subsequent POST (catalog `lib/messages/catalog.ts:154-162`) | **INCLUDED-via-harness** | The in-flight branch is rare in real prod traffic (would require concurrent POSTs with identical `idempotency_key` colliding mid-lease). Direct producer-state materialization is the only practical way the solo dev can render the in-flight banner in the validation environment. |
| F.4 | `rate-limit-admin` | `report_rate_limits` row at `(kind='admin', identity=canonicalize($VALIDATION_ADMIN_EMAIL), hour_bucket=now(), count=11)` | `ReportModal` failed-retryable banner `REPORT_RATE_LIMITED_ADMIN` on next admin POST (catalog `:846-854`) | **INCLUDED-via-harness** | Real-identity outcome — must use canonical admin email (per `lib/reports/rateLimit.ts:76`) so live `enforceQuota` hits the seeded bucket. R35 F34 snapshot+restore lifecycle protects prod state. |
| F.5 | `rate-limit-crew` | `report_rate_limits` row at `(kind='crew', identity=<resolved fixture crew_member_id UUID>, hour_bucket=now(), count=4)` | `ReportModal` failed-retryable banner `REPORT_RATE_LIMITED_CREW` on next crew POST (catalog `:856-…`) | **INCLUDED-via-harness** | Real-identity outcome — must use raw fixture UUID (per `lib/reports/submit.ts:168`; no canonicalization). R39 F36 snapshot+restore lifecycle protects prod state. R41 F38 `--combo` flag resolves the fixture UUID. |
| F.6 | `lookup-inconclusive` (with `--alert-code` selector for 4 variants per R43 F40 + `lib/reports/submit.ts:202-208`) | (i) `reports` row in post-lease-expired state + (ii) `admin_alerts` row with `code` resolved per selector | `AlertBanner` admin-RLS SELECT (`components/admin/AlertBanner.tsx:97`) on admin show page | **INCLUDED-via-harness** | Triggering live requires a real GitHub-API fault (bot-login-missing / duplicate-live-matches / open-orphan-label / generic 502 inconclusive). Direct service-role INSERT into `admin_alerts` is the only way the solo dev can render the AlertBanner for these variants without breaking real GitHub state. This is THE deep outcome the harness is designed for. |
| F.7 | `lease-expired` | `reports` row at `processing_lease_until = now() - interval '60 seconds'`, `github_issue_url=NULL`, `lease_holder=NULL` | No direct UI surface for pure-lease-expired-row; subsequent retry POST triggers `expiredLeaseRetry` path at `lib/reports/submit.ts:742` | **INCLUDED-via-harness** | The materialized row is the prerequisite state that Phase 0.F.7 smoke triggers via real POST to exercise the `expired_pending_recovery` dispatch. Without the harness, the smoke has no upstream producer for this state — production traffic never lands on a pure-lease-expired-row outside the harness window. |
| F.8 | `horizon-expired` | `reports` row at `created_at = now() - interval '25 hours'`, `github_issue_url=NULL` | `ReportModal` `expired` modal-status branch on next POST (`components/shared/ReportModal.tsx:331-333`) + catalog `lib/messages/catalog.ts:1466-1474` | **INCLUDED-via-harness** | Live `acquireReportLease` uses `default now()` for `created_at` (`lib/reports/leaseProtocol.ts:80-126` INSERT omits `created_at` → migration default at `supabase/migrations/20260501001000_internal_and_admin.sql:321`). The horizon-expired state is structurally unreachable via the live submit path; direct service-role INSERT is the ONLY producer. |
| F.9 | `orphaned-lost-lease` | `admin_alerts` row matching `lib/reports/submit.ts:901-922` UPSERT shape (code `REPORT_ORPHANED_LOST_LEASE`, full `context` payload including `orphan_url` / `orphan_issue_number` / `lease_holder` / `row_reaped` / `stored_url` / `orphan_close_failed`) | `AlertBanner` admin-RLS SELECT renders the alert on the admin show page | **INCLUDED-via-harness** | Live-triggering requires a real `writeIssueUrl` tail-update miss followed by a successful `createIssue` (mid-orphan-cleanup race) — practically unreachable in a validation environment. Direct service-role INSERT into `admin_alerts` is the only way the solo dev can render the orphaned-lost-lease alert. |

---

### Disposition sum (Phase 0.E.1 entry-condition)

The canonical contract for these outcomes' env-var dependencies (notably `VALIDATION_ADMIN_EMAIL` for the rate-limit-admin identity) lives at **spec §9.1.2** and the **handoff §9 R31 producer map**; the rows below are a disposition summary, not a second contract source.

- **Deep outcomes** (lookup-inconclusive / lease-expired / horizon-expired / orphaned-lost-lease): **4 of 4 INCLUDED-via-harness**.
- Surface outcomes (success-admin / success-crew / in-flight / rate-limit-admin / rate-limit-crew): **5 of 5 INCLUDED-via-harness** (rate-limit-admin's identity = `canonicalize($VALIDATION_ADMIN_EMAIL)` per spec §9.1.2).
- **Total: 9 of 9 INCLUDED-via-harness** → Phase 0.E.1–0.E.3 PROCEED. The harness MUST ship.

EXCLUDED-rely-on-structural was considered for the surface outcomes (F.1–F.5) since their happy-path / quota-deny paths already have unit-test coverage (`VALIDATION_ADMIN_EMAIL` contract per spec §9.1.2). Rejected: per AGENTS.md `feedback_mocked_only_tests_invite_tautological_approve`, unit tests on `submitReport` and `enforceQuota` observe what the test author thought the surface requires, not what the rendered UI requires. The validation harness's value is wiring the solo dev's eyes onto the rendered modal/banner with a real Supabase round-trip — that's a different surface than the unit-test contract pin, and no existing test covers it.

---

## Bands A–E

> **DEFERRED to Phase 1 Task 1.0.** Bands A–E (crew-page right-now states / restriction modes / role-flag matrix / admin gates / picker flow) are not load-bearing for Phase 0.E disposition; Phase 0.E gates on band F only per R1 P1 amendment. When Phase 1 opens, append the remaining bands here.
