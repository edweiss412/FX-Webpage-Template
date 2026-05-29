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

## Bands A–E (Phase 1 Task 1.0 — authored 2026-05-29)

> **Status: COMPLETE.** Band F above (report-pipeline outcomes) was authored in Phase 0.E.0 and is **preserved verbatim** — these bands are appended, not overwritten. Derived from the 6 sources per spec §4.1.1: master-spec UI headings (§§7–9, 12–13), spec-id/AC anchors, the 13 M11 `/help` routes (`app/help/**/page.mdx` + `page.tsx`), the live route inventory (`find app -name page.tsx -o -name layout.tsx`), the §12.4 catalog (`lib/messages/catalog.ts` — 187 rows each carrying `dougFacing` + `crewFacing` + `helpfulContext`), and the §9.0.1 affordance matrix (`app/help/_affordanceMatrix.ts` — 13 concrete + 1 template-family + 1 negative row).
>
> **This file is FROZEN as of the Task 1.0 commit.** The matrix walk references it; no per-cell write-backs during Phase 1.

### Row schema (spec §4.1.1 Step 8) + coverage policy

Each row carries: **Surface band** (A/B/C/D/E/F per spec §4.2) · **Persona scope** (which of the 8 personas reach it — §3, subset not crossproduct) · **Mode×VP** (mode × viewport sub-checks; default **4** = light×dark × mobile×desktop, FULL per §3.4) · **Real-iPhone** (yes only for the §3.1 curated subset on personas 5/6/7/8; else emulated) · **Coverage** (FULL / PAIRWISE / SMOKE-SAMPLE per §3.4) · **Disposition** (INCLUDED / EXCLUDED+reason / BAND-OVERLAP+link).

**Single-source counts (cross-referenced, not restated — per AGENTS.md numeric-sweep):** personas = 8 (§3.1); role variants = 9, 5a–5c + 6a–6f (§3.2); R-combos = 10, R1–R6 + R7a/R7b + R8a/R8b (§3.3); show-wide states = 6 (§3.3.1); Right-Now day-states = 10 + 6 = 16 (§3.3.1); role×restriction = the **11 explicit pairs** in §3.4.1 (NOT full 9×10). Color-mode + viewport are FULL on every cell; role + restriction are SMOKE-SAMPLE. Real-iPhone curated subset = role variants **5b/6a/6d/6f** + surfaces {Right Now, schedule, picker first-contact via `<SignInOrSkipGate>` Mode A, sign-in, share-token-rotated reload (`PICKER_SHOW_UNAVAILABLE`), epoch-reset reload (`PICKER_EPOCH_STALE_BANNER`), `/me`} for personas 5/6/7/8 (§3.1, §3.4).

---

### Band A — Admin surfaces (personas 2 steady / 3 cold-start / 4 preview)

Per master spec §9 (§9.0 wizard, §9.1 dashboard, §9.1.1 staged-review, §9.2 per-show panel, §9.3 preview). Route source: `app/admin/**`.

| # | Surface | Route / component | Persona | Mode×VP | Real-iPhone | Coverage | Disposition |
|---|---|---|---|---|---|---|---|
| A.1 | `/admin` — Active Shows panel | `app/admin/page.tsx` (§9.1) | 2 | 4 | emulated | FULL | **INCLUDED** |
| A.2 | `/admin` — "Sheets we couldn't auto-apply" first-seen panel | `app/admin/page.tsx` (§9.1.1) | 2 | 4 | emulated | FULL | **INCLUDED** |
| A.3 | `/admin` — "Review staged changes" re-stage badge | `app/admin/page.tsx` (§9.1.1) | 2 | 4 | emulated | FULL | **INCLUDED** |
| A.4 | Onboarding wizard steps 1–3 (cold start) | `app/admin/page.tsx` (§9.0) | 3 | 4 | emulated | FULL | **INCLUDED** |
| A.5 | `/admin/show/[slug]` per-show panel: sync-health · parse-warnings · preview-links · staged-review card | `app/admin/show/[slug]/page.tsx` (§9.2) | 2 | 4 | emulated | FULL | **INCLUDED** |
| A.6 | Per-show share-link resting UX: `CurrentShareLinkPanel` + `ShareLinkCopyButton` (copy-to-clipboard) | `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`, `ShareLinkCopyButton.tsx` (M11.5) | 2 | 4 | emulated | FULL | **INCLUDED** |
| A.7 | Per-show destructive admin actions resting/two-tap render: `RotateShareTokenButton` + `ResetPickerEpochButton` | `app/admin/show/[slug]/RotateShareTokenButton.tsx`, `ResetPickerEpochButton.tsx` | 2 | 4 | emulated | SMOKE | **INCLUDED** (resting UX = band A; the *actions* are walked in J3 legs (a)/(b) — BAND-OVERLAP J3) |
| A.8 | `/admin/show/staged/[stagedId]` first-seen staged review | `app/admin/show/staged/[stagedId]/page.tsx` | 2 | 4 | emulated | FULL | **INCLUDED** |
| A.9 | `/admin/onboarding/staged/[wizardSessionId]/[driveFileId]` staged onboarding review | route file | 2,3 | 4 | emulated | FULL | **INCLUDED** |
| A.10 | `/admin/settings` + `/admin/settings/admins` | `app/admin/settings/page.tsx`, `settings/admins/page.tsx` | 2 | 4 | emulated | SMOKE | **INCLUDED** |
| A.11 | `/admin/show/[slug]/preview/[crewId]` impersonation banner chrome | `preview/[crewId]/page.tsx` (§9.3) | 4 | 4 | emulated | SMOKE | **BAND-OVERLAP → J4 (Task 1.7)**: banner/impersonation chrome = band A; the previewed crew content's role-hiding = band B composition |
| A.12 | `/admin/layout.tsx` admin chrome / nav | `app/admin/layout.tsx` | 2,3,4 | — | — | — | **BAND-OVERLAP**: renders with every A.* page; no standalone cell |
| A.13 | `/admin/dev` | `app/admin/dev/page.tsx` | — | — | — | — | **EXCLUDED** — gated behind `scripts/with-admin-dev-flag.mjs`; not in the production artifact (§4.3) |

---

### Band B — Crew surfaces (personas 5 picker-LEAD / 6 picker-non-LEAD / 7 OAuth crew / 8 /me)

Per master spec §8 (crew page UX) + §7.3/§7.4 (routing + role-hiding). Route: `app/show/[slug]/[shareToken]/page.tsx` (`_ShowBody`) + `app/me/page.tsx`. Access path = share URL → `<SignInOrSkipGate>` Mode A → skip-pick identity (post-2026-05-26 picker pivot; "signed-link" persona prose is historical).

| # | Surface | Route / component | Persona | Mode×VP | Real-iPhone | Coverage | Disposition |
|---|---|---|---|---|---|---|---|
| B.1 | Crew page section inventory (`_ShowBody`) | `app/show/[slug]/[shareToken]/page.tsx` (§8.1) | 5,6,7 | 4 | 5b/6a/6d/6f | FULL (surface×persona) | **INCLUDED** |
| B.2 | Right Now card — 16 day-states | §8.2 + §3.3.1 (10 R-combos + 6 show-wide) | 5 (LEAD baseline) | 4 | yes (curated) | SMOKE-SAMPLE (each state ×1) | **INCLUDED** — see §3.3.1 for the 16 states |
| B.3 | Schedule tile (restriction-sensitive) | `_ShowBody` schedule section | 5,6 | 4 | yes | SMOKE (10 R-combos ×1) | **INCLUDED** |
| B.4 | Pack-list tile (stage-restriction + day-phase gated; master spec line 2395) | `_ShowBody` pack-list | 5,6 | 4 | yes | SMOKE | **INCLUDED** |
| B.5 | Scope tiles — audio / video / lighting / transport (role-only) | `lib/visibility/scopeTiles.ts`: `audioScopeVisible` / `videoScopeVisible` / `lightingScopeVisible` / `transportTileVisible` | 6 (role variants) | 4 | 6a/6d | SMOKE (9 role variants ×1) | **INCLUDED** |
| B.6 | Financials (`shows_internal`, LEAD-only) | `scopeTiles.ts`: `financialsVisible` | 5 | 4 | — | SMOKE | **INCLUDED** |
| B.7 | Role × restriction — 11 explicit pairs | §3.4.1 pair table | 5,6 | 4 | partial (5b/6a/6d) | SMOKE-SAMPLE explicit pairs | **INCLUDED** — see §3.4.1 for the 11 pairs (NOT 9×10) |
| B.8 | Empty-state discipline (incl. `6f` empty-flags edge) | `_ShowBody` (§8.3) | 5,6 | 4 | 6f | SMOKE | **INCLUDED** |
| B.9 | Dimensional invariants (page layout) | §8.4 | 5 | 4 | — | SMOKE | **BAND-OVERLAP**: pinned by the M-series Playwright `getBoundingClientRect` assertions; band B does the visual confirm only |
| B.10 | Responsive desktop posture | §8.5 | 5 | desktop ×2 modes | — | SMOKE | **INCLUDED** |
| B.11 | `/me` cross-show identity surface | `app/me/page.tsx` (§7.3; `validateGoogleIdentity` — distinct validator per master spec ~line 2266) | 8 | 4 | yes (curated) | FULL | **INCLUDED** |
| B.12 | Crew page chrome: `IdentityChip` "Not you?" + `/show/[slug]/layout.tsx` | `components/auth/IdentityChip.tsx`, `app/show/[slug]/layout.tsx` | 5,6,7 | 4 | yes | SMOKE | **INCLUDED** |
| B.13 | `ReportModal` crew-surface render | `components/shared/ReportModal.tsx` (§13.1) | 5,6 | 4 | — | SMOKE | **BAND-OVERLAP → band F**: modal *render* = band B; the report *outcome states* = band F (already dispositioned above) |

---

### Band C — Auth surfaces / picker render arms (persona 1 anon + signed-in arms)

Per spec §4.2 band C + Task 1.2 Step 3 + Task 1.6 J3. Resolver topology: `resolveShowPageAccess.ts` calls `validateGoogleSession` BEFORE `resolvePickerSelection`; arm citations below are the spec/plan's.

| # | Arm / surface | Citation | Persona | Mode×VP | Real-iPhone | Coverage | Disposition |
|---|---|---|---|---|---|---|---|
| C.1 | Anonymous → `<SignInOrSkipGate>` Mode A (`no_auth/first_contact`) on tokenized URL | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx` | 1 | 4 | yes (curated) | FULL | **INCLUDED** |
| C.2 | Admin route while anon → 401/403 / redirect-to-sign-in | `app/admin/**` | 1 | 2 (desktop) | — | SMOKE | **INCLUDED** |
| C.3 | `/auth/sign-in` page | `app/auth/sign-in/page.tsx` | 1,7 | 4 | yes | FULL | **INCLUDED** |
| C.4 | `epoch_stale` arm → `PICKER_EPOCH_STALE_BANNER` + `<StaleCleanupAutoSubmit>` | `resolvePickerSelection.ts:88-90` | 5,6 | 4 | yes (curated) | SMOKE | **BAND-OVERLAP → J3 leg (b)** |
| C.5 | `removed_from_roster` arm → `PICKER_REMOVED_FROM_ROSTER_BANNER` | picker resolver | 5,6 | 4 | — | SMOKE | **INCLUDED** |
| C.6 | `claimed_after_pick` arm → `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` | `resolvePickerSelection.ts:110-120` | 5,7 | 4 | — | SMOKE | **BAND-OVERLAP → J3 leg (c) step 3** |
| C.7 | `identity_invalidated/session_mismatch` arm | `resolvePickerSelection.ts:122-143` | — | — | — | — | **EXCLUDED — rely-on-structural**: wired but structurally unreachable from the page-route (API-route callers only, per spec §5.3 leg (c) closing disclosure + H8 two-reasons doc-guard). No render cell. |
| C.8 | Share-token rotated, old URL reload → `showUnavailable()` → `PICKER_SHOW_UNAVAILABLE` | M11.5 R2 | 5,6 | 4 | yes (curated) | SMOKE | **BAND-OVERLAP → J3 leg (a)** |
| C.9 | `no_auth/google_mismatch` → `<SignInOrSkipGate>` Mode B "signed in as someone else" (TERMINAL) | `resolveShowPageAccess.ts:176-178` (P-R27 Fix-1) | 7 | 4 | — | SMOKE | **BAND-OVERLAP → J3 leg (c) step 4** |
| C.10 | `validateNextParam` slug-only rejection (forged `?next` w/o token segment) | H2 allowlist | — | — | — | — | **EXCLUDED — rely-on-structural**: routing-time reject, not a render surface |
| C.11 | Sign-out | auth chrome | 2,7 | 2 | — | SMOKE | **INCLUDED** |
| C.12 | `needs_picker_bootstrap` auto-redirect (user-invisible interstitial) | `resolveShowPageAccess.ts:204-208` | 7 | 4 | — | SMOKE | **BAND-OVERLAP → J3 leg (c) step 2** (verify via `OAUTH_IDENTITY_CLAIMED` alert, not a visible picker) |

---

### Band D — M11 `/help` surfaces (persona 2 admin-reader; `/help` is public so persona 1 too)

13 routes per `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` §4. Source files under `app/help/`. All INCLUDED, mode×VP FULL (the `Screenshot` light/dark switch is the load-bearing mode behavior).

| # | Route | Source file | Persona | Mode×VP | Coverage | Disposition |
|---|---|---|---|---|---|---|
| D.1 | `/help` (index) | `app/help/page.mdx` | 1,2 | 4 | FULL | **INCLUDED** |
| D.2 | `/help/getting-started` | `getting-started/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.3 | `/help/daily-rhythm` | `daily-rhythm/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.4 | `/help/tour` | `tour/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.5 | `/help/whats-different` | `whats-different/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.6 | `/help/errors` (catalog-driven §12.4 codes + `RefAnchor`) | `errors/page.tsx` | 2 | 4 | FULL | **INCLUDED** |
| D.7 | `/help/admin/dashboard` | `admin/dashboard/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.8 | `/help/admin/onboarding-wizard` | `admin/onboarding-wizard/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.9 | `/help/admin/parse-warnings` | `admin/parse-warnings/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.10 | `/help/admin/per-show-panel` | `admin/per-show-panel/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.11 | `/help/admin/preview-as-crew` | `admin/preview-as-crew/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.12 | `/help/admin/review-queues` | `admin/review-queues/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.13 | `/help/admin/sharing-links` | `admin/sharing-links/page.mdx` | 2 | 4 | FULL | **INCLUDED** |
| D.14 | `Screenshot` light/dark switching + `ScreenshotPlaceholder` | `app/help/_components/Screenshot.tsx`, `ScreenshotPlaceholder.tsx` | 2 | 4 | SMOKE | **BAND-OVERLAP**: renders inside every D.* page; the mode-switch behavior gets one dedicated walk |
| D.15 | Help chrome: `RefAnchor` · `Breadcrumb` · `Sidebar` · `Callout` · `Step` · `TipFromSheets` | `app/help/_components/*` | 2 | 4 | SMOKE | **BAND-OVERLAP**: renders with every D.* page |

---

### Band E — cross-cutting affordances (`?` tooltips / "Learn more →" / "Take the tour")

Source: `app/help/_affordanceMatrix.ts` (§9.0.1, walked by help test #13 — `tests/help/_affordance-matrix-shape.test.ts`). Each affordance is **BAND-OVERLAP** with the band-A/B surface it physically lives on, but band E owns the **link-target navigation** behavior specifically. All concrete rows: persona per host surface, mode×VP 4, emulated mobile (admin desktop-primary), SMOKE-SAMPLE (each affordance ×1).

| # | Affordance (`data-testid`) | Host surface / route | → target | Persona | Disposition |
|---|---|---|---|---|---|
| E.1 | `help-affordance--dashboard-active-shows--tooltip` | `/admin` Active Shows header | `/help/admin/dashboard#active-shows` | 2 | **INCLUDED** |
| E.2 | `help-affordance--dashboard-pending-ingestion--tooltip` | `/admin` "couldn't auto-apply" header | `/help/admin/review-queues#first-seen` | 2 | **INCLUDED** |
| E.3 | `help-affordance--dashboard-restage-badge--tooltip` | `/admin` re-stage badge | `/help/admin/review-queues#re-stage` | 2 | **INCLUDED** |
| E.4 | `help-affordance--dashboard-footer--tour` ("Take the tour") | `/admin` footer | `/help/tour` | 2 | **INCLUDED** |
| E.5 | `help-affordance--per-show-restage-card--tooltip` | `/admin/show/[slug]` staged card | `/help/admin/review-queues#re-stage` | 2 | **INCLUDED** |
| E.6 | `help-affordance--first-seen-review-card--tooltip` | `/admin/show/staged/[id]` | `/help/admin/review-queues#first-seen` | 2 | **INCLUDED** |
| E.7 | `help-affordance--per-show-sync-health--tooltip` | `/admin/show/[slug]` sync-health | `/help/admin/per-show-panel#sync-health` | 2 | **INCLUDED** |
| E.8 | `help-affordance--per-show-parse-warnings--tooltip` | `/admin/show/[slug]` parse-warnings | `/help/admin/parse-warnings` | 2 | **INCLUDED** |
| E.9 | `help-affordance--per-show-preview-links--tooltip` | `/admin/show/[slug]` preview-links | `/help/admin/preview-as-crew` | 2 | **INCLUDED** |
| E.10 | `help-affordance--preview-banner--tooltip` (`?` icon) | preview-as-crew sticky banner | `/help/admin/preview-as-crew#impersonation-banner` | 4 | **INCLUDED** — admin-context affordance DOES emit (cross-ref J4 step 6) |
| E.11 | `help-affordance--wizard-step1--tooltip` (`?` icon) | onboarding wizard step 1 | `/help/admin/onboarding-wizard#service-account` | 3 | **INCLUDED** |
| E.12 | `help-affordance--wizard-step2--tooltip` | onboarding wizard step 2 | `/help/admin/onboarding-wizard#step-2` | 3 | **INCLUDED** |
| E.13 | `help-affordance--wizard-step3--tooltip` | onboarding wizard step 3 | `/help/admin/onboarding-wizard#step-3` | 3 | **INCLUDED** |
| E.14 | `help-affordance--error-message--<code>--learn-more` (template-family "Learn more →") | any `messageFor(code)` render in `/admin/*` | `/help/errors#<code>` | 2 | **INCLUDED** (walk a sampled subset of codes) |
| E.15 | **NEGATIVE**: NO `data-testid^="help-affordance--"` element in rendered DOM | crew page `/show/<slug>/<shareToken>` | (none) | 5,6 | **INCLUDED — negative assertion**; BAND-OVERLAP band B + J4 step 5 (admin-context boundary: "Learn more →" must NOT appear in crew content) |

---

### Bands A–E disposition sum

- **Band A (admin):** 11 INCLUDED · 1 BAND-OVERLAP (A.11→J4) · 1 EXCLUDED (A.13 dev-flagged) — plus A.12 chrome overlap.
- **Band B (crew):** 11 INCLUDED · 2 BAND-OVERLAP (B.9 dimensional-invariants→Playwright, B.13 ReportModal→band F).
- **Band C (auth arms):** 5 INCLUDED · 5 BAND-OVERLAP→J3 (C.4/C.6/C.8/C.9/C.12) · 2 EXCLUDED-rely-on-structural (C.7 session_mismatch API-route-only, C.10 validateNextParam routing-reject).
- **Band D (/help):** 13 INCLUDED routes · 2 BAND-OVERLAP chrome (D.14/D.15).
- **Band E (affordances):** 13 concrete INCLUDED + 1 template-family INCLUDED + 1 negative INCLUDED (all BAND-OVERLAP their host surface for *placement*; band E owns *navigation*).

Every candidate row dispositioned INCLUDED / EXCLUDED+reason / BAND-OVERLAP+link — no silent drops. Band F (9 of 9 INCLUDED-via-harness) preserved above unchanged.
