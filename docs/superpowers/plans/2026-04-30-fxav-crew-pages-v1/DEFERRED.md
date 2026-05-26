# Deferred Items Log

Non-blocking findings from milestone adversarial reviews that were intentionally deferred rather than fixed in-milestone. Each item names a suggested home milestone where it should be picked up. **This is not a TODO list to clear automatically** — every entry has context for why it was deferred and where the right place to address it is.

When picking up a deferred item:

1. Move it from "Open" to "In progress" with the milestone it landed in.
2. Resolve it in that milestone's handoff doc convergence log.
3. Update the row to "Resolved" with the commit SHA + milestone reference.

**De facto practice (codified post-M9):** small-scope items resolved in the same milestone they were deferred under MAY stay physically in the `## Open` section with `— **RESOLVED <date>**` suffixed to the heading + a Status: Resolved bullet. The single source of truth for "is this open?" is the heading suffix, NOT section placement. This matches the existing M6-D12 / M7-D4 / M9-D-C1-2 / M9-D-C9-1 / M9-D-C4-1 / M2-D2 / M2-D1 pattern. Larger items that resolved in a DIFFERENT milestone (e.g., M6-D12 which closed in M6.5 coda) move to `## Resolved`. Grep `RESOLVED` to find every resolved entry regardless of section.

**Deferral discipline (codified post-M10, 2026-05-19):** an item belongs in DEFERRED.md ONLY when (a) blocked by planned future work, or (b) needing design/planning before implementation. Small mechanical fixes (TS discipline additions, one-line test pins, trivial refactors, dead-code removal, catalog routing of existing inline strings) should land NOW, not be filed. `/impeccable` and adversarial-review `defer-to-harden` recommendations are advisory inputs, not authority — the orchestrator must scrutinize whether the fix is small enough to ship. The `Suggested home` field must say WHY the item is parked there, not just where; "next time someone touches this file" is wishful thinking, not a real home. **Aspirational milestones (M11+, future post-v1 cycles) are NOT real homes** — items routed there must explicitly acknowledge the milestone is unscheduled and needs planning. See memory `feedback_deferral_discipline.md` for the full rationale. Post-mortem: M2-D4 (filed M2 R1, May 2) was a phantom constraint that didn't exist; six milestones tracked it as Open before the obsolescence was noticed. POLISH-D1/D2/D3 (filed May 19 from `/impeccable audit`) were ~10 lines total and got tagged `defer-to-harden`; landing them took 10 minutes vs the multi-week tracking they would otherwise have lived through.

**Note on milestone numbering:** the planned FXAV crew-pages milestone set in THIS plan tree is M0-M10 + X.\* (cross-cutting tasks in `11-cross-cutting.md` — the "11" is the file number, NOT an M11 milestone). **Codas** — focused follow-ups that ship as a single handoff doc rather than a new plan tree — live inside `handoffs/` alongside their parent milestone's handoff. Two codas exist: **M6.5** (amendment-9 first-seen auto-publish — closed at SHA `badbb15`) and **M9.5** (signed-link admin controls: Revoke all + Issue new — drafted 2026-05-20, see [`handoffs/M9.5-signed-link-controls.md`](handoffs/M9.5-signed-link-controls.md)). Codas don't get their own plan tree; they reuse the parent's. **M11 (user-facing docs / `/help`)** is the next planned post-v1 milestone, living in a sibling plan tree at `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/` with its own spec at `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md`; M11 depends only on M10 (already closed) and is independent of X.\*. The user-facing-docs spec was originally drafted as "Milestone 12" — that label was retired on 2026-05-19 in favor of sequential numbering since no real M11 existed. Adversarial-review logs on the M11 spec preserve the original M12 references as historical record. **Speculative post-v1 work** (operator-log sink, push notifications, private-image-pipeline `next/image` migration, admin-UX surfacing polish split from M11-E-D1/D3/D4) lives in the project-wide [BACKLOG.md](../BACKLOG.md), not here. See memory `feedback_deferral_discipline.md` for the deferred-vs-backlog distinction.

---

## Open

### M11.5-PLAYWRIGHT-HELPERS — Picker-shaped e2e helper layer

**Status:** Deferred 2026-05-25 from M11.5 close-out (Playwright `.skip` cleanup).
**Source:** §B continuation report (Opus, `ed1a3ab`).
**Description:** `tests/e2e/picker-flow.spec.ts` ships 5 scenarios; 1 active (slug-only-404), 4 `.skip` with inline TODOs. The 4 `.skip` scenarios need a picker-shaped e2e helper layer (`signInAs`/`pickIdentity`/`mintShareLink` shapes) that doesn't exist yet — Codex's G1 commit `05ecf7e` correctly deleted the M9.5 signed-link helpers; picker-equivalents weren't authored in either §A or §B because the helper layer wasn't called out as a discrete task in the plan and fell between the two sessions' do-not-touch lists.
**Why deferred:** Helper layer is a small but non-trivial new surface (~80-150 lines + fixtures + at least one passing scenario per helper). Authoring it requires Playwright project config + Supabase test-isolation conventions that are partly §A (test database setup) and partly §B (front-end interaction shapes). Right home is a focused follow-up dispatch, not the M11.5 close-out scramble.
**Suggested home:** Land BEFORE M11.5 deployment to prod (concrete trigger: "M11.5 deployment readiness checklist"). Helper-shape signatures pinned in TODOs at `tests/e2e/picker-flow.spec.ts`. Alternatively: M12 UX validation pass picks up alongside its own e2e suite if M12 ships before deployment.

---

### M4-E2E-SUITES-MIGRATION — M4-era `test.describe.skip` Playwright suites: triage outcome

**Status:** Deferred 2026-05-25 from per-suite redundancy audit.
**Source:** Two-stage triage of 14 hard-skipped M4-era Playwright suites in `tests/e2e/` (each had inline TODO citing the retired `?crew=/?as=admin` mock surface from Task 5.7 follow-up). Originally treated as a single blocker on `M11.5-PLAYWRIGHT-HELPERS`; the audit showed only 2 of the 14 actually need that helper layer.

**Triage outcome (4 categories):**

- **DELETED 2026-05-25** (2 suites — visibility predicates fully redundant with `tests/visibility/` unit layer):
  - `tests/e2e/scope-tiles.spec.ts` (whole file — A1/V1/L1/LEAD scope-tile visibility matrix covered exhaustively by `tests/visibility/scopeTiles.test.ts` `audioScopeVisible`/`videoScopeVisible`/`lightingScopeVisible`).
  - `tests/e2e/status-financials.spec.ts:99` FinancialsTile block (LEAD-only visibility covered by `tests/visibility/scopeTiles.test.ts` `financialsVisible` admin/LEAD/non-LEAD matrix).
  - `playwright.config.ts` testMatch regex updated to drop `scope-tiles` from both `mobile-safari` and `desktop-chromium` projects.
  - Note: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2388` (§8.1-A1 amendment) cites `tests/e2e/scope-tiles.spec.ts` as a historical amendment-time artifact; left intact as historical record.

- **PARKED on `M11.5-PLAYWRIGHT-HELPERS`** (2 suites — genuine signed-in/role-spoof or real-browser-layout dependencies):
  - `tests/e2e/role-spoof.spec.ts:72` — asserts `?role=` URL param is ignored at the SSR boundary; requires signed-in identity helper from M11.5 picker-shaped helper layer.
  - `tests/e2e/layout-dimensions.spec.ts:208` — Task 4.13 / §8.4 / AC-4.4 `getBoundingClientRect()` invariants; cannot move to jsdom per AGENTS.md "Dimensional Invariants" rule (jsdom doesn't compute real layout). Whether the assertions also need signed-in fixture or run anonymously is unresolved — pin during M11.5 helper work.

- **PARTIAL-PORT — visibility predicate redundant, integration assertions are not** (3 suites — keep `test.describe.skip` in place; pick up alongside the migrate-now batch below):
  - `tests/e2e/transport-tile.spec.ts:225` — visibility branches (driver / passenger / unrelated) covered by `tests/visibility/transportTransitions.test.ts` matrix. Unique residue: vehicle-name / passenger-sentinel rendering + the test 4 end-to-end `getShowForViewer.transportation.schedule[0].assigned_names` projection contract.
  - `tests/e2e/empty-state.spec.ts:88` — opening_reel hide/render predicates covered by `tests/visibility/emptyState.test.ts` `shouldHideOpeningReel` and `tests/visibility/openingReelText.test.ts` `stripOpeningReelText`. `power` field hide covered by `shouldHideGenericOptional`. Unique residue: the "no `https://` or `drive.google.com` anywhere in `main` text" integration assertion + the "no `<video src="/api/asset/reel/*">` element on M4 page" deferred-to-M7 negative assertion (likely obsolete now since M7 shipped — confirm before porting).
  - `tests/e2e/pack-list.spec.ts:219` — visibility (3 schedule phases) + cardinality cap + overflow. Subagent audit claimed `tests/visibility/packList.test.ts` covers all three; the cardinality/overflow assertions are rendering behavior and should be re-verified during port.

- **FULL-MIGRATE to jsdom + RTL** (10 suites — no equivalent component-test coverage exists; estimated ~34h):
  - `tests/e2e/right-now.spec.ts:128` (Task 4.11 RightNowCard; partial gap on `RightNowCardRecovery.test.tsx`, ~2h)
  - `tests/e2e/right-now-transitions.spec.ts:152` (§8.2 66-pair pairwise transition audit, ~8h)
  - `tests/e2e/right-now-transitions.spec.ts:289` (§8.2 6 compound transition audits, ~3h)
  - `tests/e2e/theme-toggle.spec.ts:57` (data-theme flip + localStorage + no-FOUC, ~3h)
  - `tests/e2e/status-financials.spec.ts:72` ShowStatusTile (COI status rendering, ~2h)
  - `tests/e2e/crew-page.spec.ts:559` LodgingTile (~2h)
  - `tests/e2e/crew-page.spec.ts:596` VenueTile (~2h)
  - `tests/e2e/crew-page.spec.ts:619` CrewTile (~3h; existing `PerShowCrewSection.test.tsx` is admin-side, not equivalent)
  - `tests/e2e/crew-page.spec.ts:652` ContactsTile (~2h)
  - `tests/e2e/schedule-tile.spec.ts:123` ScheduleTile (date_restriction.kind branches, ~3h)
  - `tests/e2e/notes-tile.spec.ts:144` NotesTile (4-source aggregation + truncation + cardinality, ~4h)
  - `tests/e2e/crew-page.spec.ts:508` layout shell — actually a real-browser layout assertion (mobile 2-col grid via `getBoundingClientRect()`); should join `layout-dimensions.spec.ts:208` in the M11.5-helpers parked bucket rather than this migrate bucket. (Recategorize at migration-coda kickoff.)

**Why deferred:** ~36h of jsdom + RTL port work is too large to land inline alongside M11.5 deployment readiness, and it does NOT block the M11.5 picker pivot (only 2 of the 14 suites have genuine auth/URL contract dependencies). The picker pivot is changing the URL/auth contract these suites currently target — migrating them to component tests *before* the pivot lands future-proofs them against the contract change (component tests with mocked props are stable across auth-flow refactors; E2E suites would need re-pointing at the new picker URL contract).

**Suggested home:** Dedicated test-migration coda after M11.5 deployment readiness but before M13 v1 launch. Coda body = one task per "FULL-MIGRATE" entry above + the 3 "PARTIAL-PORT" entries (~36h total estimate). Coda explicitly does NOT include `role-spoof.spec.ts` or `layout-dimensions.spec.ts` — those stay parked under `M11.5-PLAYWRIGHT-HELPERS` for genuine signed-in / real-browser-layout helper work. Audit underlying triage in conversation log 2026-05-25; if any of the PARTIAL-PORT residue is obsolete by then (e.g., M7 `<video>` element negative-assertion), drop those without porting.

---

### X6-D-1 — Branch-protection drift-detector + 7th required check deferred until team workflow exists

**Status:** Deferred 2026-05-20. **Suggested home:** post-v1 milestone *if/when* FXAV onboards a second developer/admin.

**Context.** X.6 shipped the privileged `verify-branch-protection` drift-detector + the PR-required `verify-branch-protection-status` reader as the 7th audit check. Three review rounds (R2 R1-retroactive REVERSAL; R3 Supabase-optional; R4 in flight as of 2026-05-20) closed environment-shape gaps as they surfaced. R4 in particular exposed that the drift-detector hardcodes a team-workflow contract (`required_approving_review_count >= 1` + `dismiss_stale_reviews = true`) that doesn't fit a solo-developer repo: the user's chosen solo-dev variant (`review_count = 0` + `dismiss_stale = false` + `enforce_admins = true`) is a legitimate protection configuration but causes the drift-detector to exit 1 permanently → reader fails closed → merge deadlock.

The R4 finding is REAL — the drift-detector contract needs an `BRANCH_PROTECTION_VARIANT=solo|team` env gate to support both. But the user is currently a solo developer on this repo with no near-term team plans. The X.6 gate's VALUE-ADD (audit checks block merges + protection cannot be silently weakened by a co-admin) doesn't apply when there is no co-admin to silently weaken anything. Implementing R4's variant gate solves a problem the user does not have.

**Resolution (2026-05-20).** Branch protection removed via `gh api -X DELETE repos/edweiss412/FX-Webpage-Template/branches/main/protection`. The 6 audit checks (`traceability-audit`, `x1-catalog-parity`, `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`) STILL run on every PR + push to main and surface red checks in the GitHub UI; they just no longer BLOCK merges. The privileged `verify-branch-protection` job continues to exist in `.github/workflows/x-audits.yml` but its admin-alert path is dormant (no production Supabase per X.6 R3 finding; no protection to evaluate per this deferral). The `verify-branch-protection-status` reader continues to exist but always passes (no required-checks gate to fail closed against).

**Trigger to resume.** Pick this back up if/when ANY of these become true:
1. A second developer or admin gains write access to `edweiss412/FX-Webpage-Template`.
2. FXAV crew-pages is forked / moved to a team org.
3. The user explicitly wants drift detection on their solo configuration for audit / compliance reasons.

**Concrete work to land at that point:**
- R4 Codex repair: env-gated `BRANCH_PROTECTION_VARIANT` (solo|team, default team) in `scripts/verify-branch-protection.ts` + tests for both variants + spec §17.2.1 amendment + plan Task X.6 Step 3c amendment + workflow YAML reads variant from gh vars.
- Re-PUT branch protection with the 7 required checks + the appropriate variant.
- Set `gh variable set BRANCH_PROTECTION_VARIANT --body 'solo'` (or `'team'` per the new workflow shape).
- Trigger a privileged workflow run; confirm exit 0; confirm reader passes; confirm merges work.

**Memory codification (post-deferral 2026-05-20).** This is the FIFTH X.6 round (R1 → R1-retroactive → R2 → R3 → R4 deferred). The pattern of "spec assumed team workflow; user is solo; environment-shape gap; live integration surfaces it post-bootstrap" recurs across X.6 R3 (Supabase-availability) + R4 (workflow-shape). Refinement candidate for memory `feedback_mocked_only_tests_invite_tautological_approve.md`: "BEFORE specifying any 'must-have' contract value (review_count ≥ N, dismiss_stale = true, etc.), interrogate WHO the user actually is. Solo-dev repos break team-workflow assumptions just as silently as the no-prod-Supabase environment broke X.6 R2's admin_alerts contract." Codifying this requires one more data point; until then, the lesson is captured here.

**Cost-of-tracking acknowledged.** Per memory `feedback_deferral_discipline.md`, aspirational future homes are NOT real homes. The trigger above (a second admin joins) is concrete; the suggested-home is appropriately "post-v1 IF that happens." If the user is still a solo developer in 12 months, this entry stays Open without urgency. If FXAV never becomes a team project, this entry stays Open forever — which is a correct outcome, not a failure.

### M10-D-PHASE2-1 — Cluster I-5 impersonation / preview-as — **RESOLVED 2026-05-19**

**Status:** **Resolved.** Shipped in M10 Phase 3 §B at SHA `9a36419` (`feat(admin): preview-as impersonation via identity-only admin_preview kind (§9.3)`). §A Pin-3 contract extension (Viewer kind `'admin_preview'`) landed at `f74a1ed` + `84a8bed`. Phase 3 §B convergence-log entry documents the full implementation; Codex cross-CLI adversarial review (7 rounds) APPROVE'd the §B slice at R7 with one routed §A finding (M10-D-PHASE3-1) which itself resolved at `e54babe`.

**Source:** M10 §B Phase 2 implementation, 2026-05-18 critical-path-first delivery decision.
**Description:** Cluster I-5 per plan §M10 Task 10.8: `app/admin/show/[slug]/preview/[crewId]/page.tsx` Server Component preview-as + `components/admin/PreviewBanner.tsx` sticky banner + a third `Viewer` kind (`'admin_preview'`) on the locked `getShowForViewer` signature. Phase 2 ships the wizard end-to-end (Step 2 verify + Step 3 review + finalize loop + finalize re-entry) plus the post-onboarding Dashboard (active shows + pending panel + per-show alerts), all of which are on Doug's critical path. Preview-as is admin tooling that Doug does NOT need to complete first-onboarding or steady-state operation.
**Why deferred:** The "third Viewer kind" requires extending `getShowForViewer` in `lib/` — §A territory. The full preview surface also requires rendering the crew-page view from an admin identity, which crosses M4 (crew-page) and M5 (auth) abstractions. Phase 2's scope was already dominated by the wizard finalize loop + re-entry dispatcher; preview-as was triaged out.
**Suggested home:** Phase 3 (after the rest of M10 §B closes). Implementation steps: (a) §A extends `getShowForViewer` with `admin_preview` Viewer kind (Pin-3 contract); (b) §B authors the preview page + banner.

### M10-D-PHASE2-2 — Cluster I-6 help / tour / ErrorExplainer + helpfulContext fill-in — **RESOLVED 2026-05-19**

**Status:** **Resolved.** Shipped in M10 Phase 3 §B at SHA `e8eca04` (`feat(admin): help/tour/help-affordance for §9.0.1 first-class help (Cluster I-6)`). Delivered `<HelpAffordance>` + `<HelpTooltip>` + `<Tour>` + admin-wide wirings per spec §9.0.1. Catalog `helpfulContext` audit was a no-op — every M10 dougFacing-non-null code already had the field from §A Pin-2 + §B Phase 1 blocks. Phase 3 §B convergence-log entry documents the full implementation; impeccable v3 dual-gate APPROVE across 4 rounds (R1 CRITICAL Tour em-dash, R2 CRITICAL HTML-entity regression, R3/R4 SHIP) + Codex cross-CLI review APPROVE.

**Source:** Same as M10-D-PHASE2-1.
**Description:** Cluster I-6 per plan §M10 Task 10.9 + §9.0.1: `components/admin/HelpTooltip.tsx` + `components/admin/Tour.tsx` + `components/admin/ErrorExplainer.tsx` (the latter already exists at `components/messages/ErrorExplainer.tsx` from M5/M7 — would be extended for admin surfaces). Plus `helpfulContext` fill-in for any M10 catalog codes that don't already have one.
**Why deferred:** Help/tour/ErrorExplainer are quality-of-life polish — they don't block the operator's onboarding or steady-state flow. Every M10-§B-emitted code already has Doug-facing copy via `messageFor()` (AGENTS.md §1.5 invariant holds without this cluster). The "Take the tour" affordance per spec §9.0.1 is post-onboarding polish.
**Suggested home:** Phase 3. Implementation includes: (a) `helpfulContext` audit pass of M10 catalog codes; (b) `<HelpTooltip />` mounted next to every section header on the dashboard + per-show page; (c) `<Tour />` linked from the dashboard footer; (d) Resolve M10-D-PHASE1-1 (ONBOARDING_OPERATOR_ERROR durable notification — Sentry + admin-visible banner wiring) at the same time since the admin_alerts producer surface gets touched.

### POLISH-D1 — Semantic-wrong fallback if `isKnownCode` gate ever loosens — **RESOLVED 2026-05-19**

**Status:** **Resolved at SHA `a193fac`** (`fix(messages): close POLISH-D1/D2/D3 — opposite-surface fallback + null-render guards`). The fallback at `ReportModal.tsx:631` was replaced with an IIFE-level opposite-surface fallback (admin-null code → crewFacing; final `?? ""` rescue). Catalog-routed, no inline literals. External `/impeccable critique` + `/impeccable audit` dual-gate APPROVED on `a193fac` with verification: surface-flip fallback is spec-faithful (multiple catalog codes legitimately carry `dougFacing: null`; crew copy IS the canonical row).

**Source:** `/impeccable critique` on commit `36a2671` (post-spec-debt closure, pre-X.\*), 2026-05-19, Finding C2 (MEDIUM)
**Description:** `ReportModal.tsx:631` previously fell back to `copyForCode("NETWORK_UNREACHABLE", surface)` when `errorCopy` was null — semantically wrong copy for non-network errors. Resolved by tightening the IIFE to always return `string` and falling back to opposite-surface facing instead of network-unreachable.

### POLISH-D2 — `messageFor(...).crewFacing` null-render risk in Bootstrap — **RESOLVED 2026-05-19**

**Status:** **Resolved at SHA `a193fac`** (same commit as POLISH-D1/D3). `Bootstrap.tsx:548` now renders `{messageFor("BOOTSTRAP_GENERIC").crewFacing ?? ""}` — TS-discipline `?? ""` rescue closes the `string | null` flow-through. Runtime behavior unchanged (catalog test contract pins `crewFacing` non-null on this row).

**Source:** `/impeccable audit` on commit `36a2671`, 2026-05-19, Finding A2 (P2)
**Description:** `.crewFacing` is typed `string | null` per `MessageCatalogEntry`; the JSX render expression previously flowed the union through unchecked. One-line `?? ""` addition silences the type without behavior change.

### POLISH-D3 — Same `string | null` flow-through in ReportModal lookups — **RESOLVED 2026-05-19**

**Status:** **Resolved at SHA `a193fac`** (same commit as POLISH-D1/D2). The `errorCopy` IIFE was refactored to return `string` instead of `string | null`; all three branches (no error / network / code) terminate in a string literal or `?? ""` rescue. JSX render site at line 631 simplified from `{errorCopy ?? copyForCode("NETWORK_UNREACHABLE", surface)}` to `{errorCopy}`.

**Source:** `/impeccable audit` on commit `36a2671`, 2026-05-19, Finding A3 (P2)
**Description:** Type-discipline gap in two `copyForCode(...)` flow-through sites. Same root cause as POLISH-D1 viewed from the type-narrowing angle; resolved by the IIFE refactor.

### M2-D1 — Hardcoded admin allow-list rotation — **RESOLVED 2026-05-17**

**Status:** **Resolved.** Shipped via M9 Cluster C9 (commits `e060766` through `c8281a9` covering the full convergence loop; final commits `4e438b0` + `72af2f1` for the impeccable critique+audit polish; spec integration in `f669e18`). Ratified spec amendment at `docs/superpowers/specs/master-spec-patches/2026-05-14-admin-allowlist-runtime-mutable.md` retires the migration-hardcoded array + zombie `ADMIN_EMAILS` env var; replaces with `public.admin_emails` table + two atomic SECURITY DEFINER RPCs (`upsert_admin_email_rpc` + `revoke_admin_email_rpc`) holding `pg_advisory_xact_lock` + `/admin/settings/admins` CRUD UI. JWT-role override arm preserved verbatim. SELECT-only grant + `for select` policy for authenticated; mutations route exclusively through the RPCs which enforce `is_admin()` + last-admin-lockout + email-shape validation. Canonical spec §14.3 row retired with cross-reference; 00-overview.md ratified-amendments index updated. Eleven adversarial-review rounds + impeccable dual-gate + final-review whole-M9 R1/R2 all closed.

**Source:** M2 adversarial review, Round 1 advisory note.
**Original description:** admin allow-list HARDCODED IN A POSTGRES MIGRATION (`supabase/migrations/20260501002000_rls_policies.sql:23-37`); no rotation procedure, audit trail, or in-product UX. Only path was "edit migration, deploy."

### M2-D2 — Static-vs-runtime breadth for the 21 admin-table RLS matrix — **RESOLVED 2026-05-17**

**Status:** **Resolved.** `tests/db/admin-rls-runtime.test.ts` shipped with `tests/db/admin-rls-runtime.baseline.json` (M9 final-review R2 fix; R3 strengthening at `69d4c6f`). Probe DERIVES the Class A admin_only FOR ALL table list from `pg_policies` at runtime (so a future migration that adds a 22nd table automatically enters the matrix). Per-table gates: BEHAVIORAL admin/non-admin SELECT + STRUCTURAL qual ILIKE '%is_admin()%' + with_check ILIKE '%is_admin()%' + cmd=ALL + qual=with_check predicate-equivalence. Closes the M2-D2 worry — a future migration that silently drops or weakens an admin policy trips EITHER the SELECT-returns-0 behavioral OR the structural-predicate-equivalence assertion on the affected table OR the baseline-mismatch gate. INSERT/UPDATE/DELETE verbs are NOT directly probed (see Coverage paragraph below for the rationale).

**Coverage (post-R3 strengthening at commit `69d4c6f`):**
- BEHAVIORAL: 21 tables × 2 roles × SELECT verb = 42 assertions (admin sees rows without RLS denial; non-admin gets 0 rows).
- STRUCTURAL: 21 tables × 2 gates (qual+with_check + cmd=ALL + qual=with_check predicate-equivalence) = 63 cells across 3 test.each blocks.
- META: 1 derived-count assertion + 1 baseline-equality assertion = 65 total cells.
- The v1 R2 probe attempted per-table DEFAULT VALUES INSERT but false-passed when NOT NULL constraints fired before RLS (caught by R3). R3 replaced the INSERT behavioral with structural pinning of qual + with_check + their equivalence — for FOR ALL admin_only policies one predicate gates every verb, so structural-equivalence + the SELECT behavioral proves the write paths are gated without needing per-table INSERT payload fixtures.
- admin_emails is excluded (it has its own FOR SELECT policy under C9's SELECT-only grant pattern, exhaustively covered in `tests/db/admin-emails.test.ts`).
- Class B (crew-readable `admin_insert`/`admin_update`/`admin_delete`) is out of scope for this probe — exercising the crew-session-bound SELECT branch requires fixture infrastructure not yet built; the existing `tests/db/rls.test.ts` text-based policy audit mitigates that gap.

**Source:** M2 adversarial review, Round 1 advisory note. Pulled into C9 at Task 9.C9.0.5 per M9-polish handoff §A.9.C9.0.5; surfaced AGAIN at M9 final-review R2 as the missing artifact. Built in the same session.

### M2-D3 — `transportation.show_id` single-row uniqueness model

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Schema treats `(show_id)` as the unique key on `transportation`, allowing only one transport row per show. Spec §4 / parser output supports a single transport block per show, but production-shaped sheets sometimes carry multiple drivers/vehicles per show.
**Why deferred:** Matches current spec + parser. Changing it requires a spec amendment, not a fix-in-place. Until a real fixture demands multi-driver, the constraint is intentional.
**Suggested home:** Treat as a spec question. If/when a fixture surfaces with multi-driver, open a brainstorming session for a spec amendment, then schema-bump in a new migration (NOT an edit of the M2 file).

### M2-D4 — Missing introspection pin for `crew_members_show_id_name_key` — **RESOLVED 2026-05-19 (obsolete — phantom target)**

**Status:** **Resolved as obsolete.** Sweep on 2026-05-19 (pre-X.\* deferral-discipline audit) confirmed via `grep -rn "crew_members_show_id_name_key"` that the constraint DOES NOT EXIST anywhere in the schema. The only unique constraint on `crew_members` is `crew_members_show_email_unique` on `(show_id, email)` (already pinned in `tests/db/schema-introspection.test.ts:119`). The M2 reviewer who filed this in Round 1 appears to have hallucinated the constraint name or referenced a pre-migration draft that was later restructured. No code path needs the pin; nothing to add to the introspection allow-list. Closes without code change.

**Source:** M2 adversarial review, Round 1 advisory note (2026-05-02).
**Description (original, retained for record):** "The `crew_members_show_id_name_key` named unique constraint exists in the migration but is not asserted by name in `tests/db/schema-introspection.test.ts`." The constraint did not in fact exist.
**Discipline learning:** Captured in memory `feedback_deferral_discipline.md` — six milestones tracked this as Open before the obsolescence was noticed. Future DEFERRED entries that reference a specific code symbol (constraint, function, route) by name MUST be verified against the live codebase at filing time, not accepted on reviewer assertion alone.

### M2-D5 — Seed's hardcoded restage fixture filename

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** `supabase/seed.ts` hardcodes a specific raw-fixture filename for the restage scenario rather than deriving it from `fixtures/shows/raw/`. If that fixture is renamed or replaced, seed silently breaks.
**Why deferred:** Works against today's fixture set. The general fix (glob + filter) is mild refactoring that's easier to do alongside the next seed change rather than in isolation.
**Suggested home:** Whenever seed is next touched (likely during M4 tile development when a new fixture variant is needed for testing).

### M4-D1 — ShowStatusTile event_details key probing should route through parser canonical-key authority

**Source:** M4 catch-up code-quality review, 2026-05-03 Important Minor 2
**Description:** `components/tiles/ShowStatusTile.tsx` probes for the dress-code value across stringly-typed key candidates `["dress_code", "dress code", "dress", "attire"]`. Tile should consume the canonical key only; parser should expose a `CANONICAL_KEY_MAP` (or similar) that decides the variant collapse upstream.
**Why deferred:** Crosses into M1-parser territory. Out of M4 catch-up scope; the tile-side variant-tolerant probe is acceptable until the parser exposes canonical keys.
**Suggested home:** M1 follow-up touch OR a cross-cutting key-canonicalization task. When picked up, simplify the tile to read `event_details.dress_code` only, parser-side guarantees the canonical form.

### M4-D2 — Tile reorder by persona urgency — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved. Shipped in M9 Cluster C1 (Crew-page IA redesign). See `handoffs/M9-polish.md` §Convergence log → Cluster C1 (R8 APPROVE). TODAY-band promotion + visibility-aware filter + sm:grid-cols-2 stretch test landed across the 4 C1 commits documented in the handoff.

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 1 HIGH)
**Description:** Tile mount order in `app/show/[slug]/page.tsx` is parser-output order (Lodging→Venue→Crew→Contacts→Schedule→Audio→Video→Lighting→Transport→ShowStatus→Financials→PackList→Notes). Crew on the venue floor scans top-to-bottom; the answer to "what's my call time" (ScheduleTile + relevant scope tile) sits buried 5+ tiles in. PackListTile (set/strike-day primary answer) renders 12th.
**Why deferred:** Reorder is a UX/IA judgment call that benefits from a proper `/impeccable shape` session — the canonical v3 flow we skipped on this milestone. Doing it under M4 close-out pressure would risk a parser-order-to-persona-order refactor without the design context.
**Suggested home:** M9 polish with explicit `/impeccable shape <crew page reorder>` session before crafting. Group tiles by Today / Logistics / People / Reference, OR introduce a "Today" cluster that promotes 1-2 today-relevant tiles above the general grid.

### M4-D3 — Header weight competes with RightNowCard for the page hero — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved in M9 Cluster C1 (commit `c68a60b` per handoff convergence log R2 row: "Header eyebrow gated on truthy client_label").

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 5 MEDIUM)
**Description:** `components/layout/Header.tsx` show title is `text-2xl sm:text-3xl font-bold` — same scale as the RightNowCard lead. The eyebrow `client_label` is the same `text-xs uppercase` as every tile heading. Result: header competes visually with both the hero card and the tile grid; nothing dominates.
**Why deferred:** Visual-rebalance call that benefits from a `/impeccable shape` session.
**Suggested home:** M9 polish. Either shrink the header (smaller title, condense to a sticky-thin bar) so the RightNowCard wins the page's primary moment unambiguously, OR commit to header-as-context (smaller title, drop the orange hairline which fights the RightNowCard's accent dot for the eye).

### M4-D4 — RightNowCard data-\* test attribute relocation — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved in M9 Cluster C1 (commit `9c5b98a` in recent log: "relocate RightNowCard debug attributes off AT-traversed p (M4-D4)").

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 6 MEDIUM)
**Description:** `components/right-now/RightNowCard.tsx` carries 3 `data-*` test attributes (`data-state`, `data-rendered-state`, `data-treatment`) on a screen-reader-traversed `<p>`. Over-instrumented for a hero element.
**Why deferred:** Relocation requires updating the e2e tests that read these attributes (transition matrix, AC-4.3 tests). Mechanical but non-trivial; safer to do alongside the broader M9 polish pass.
**Suggested home:** M9 polish. Move test-only attributes onto a sibling `<span data-testid="right-now-debug" hidden>` outside the AT tree. Update e2e tests at the same time.

### M4-D5 — `--tracking-eyebrow` token consolidation — **RESOLVED 2026-05-17 via M9 Cluster C2**

**Status:** Resolved in M9 Cluster C2 (Tokens). See `handoffs/M9-polish.md` §Convergence log → Cluster C2 (R4 APPROVE).

**Source (original):**

**Source:** M4 catch-up `/impeccable critique`, 2026-05-03 (Finding 7 LOW)
**Description:** Five different `tracking-[...]` values for uppercase eyebrows across Section + KeyValue + Header + RightNowCard + Footer (`0.12em` / `0.14em` / `0.18em` / `0.22em` / inline arbitrary values). Token-discipline contract violation — inline arbitrary values where a named token would unify the spec.
**Why deferred:** LOW finding; cosmetic. Easy to do but not blocking anything.
**Suggested home:** M9 polish. Add `--tracking-eyebrow` (and maybe `-eyebrow-strong`) to `app/globals.css` `@theme`, document in DESIGN.md §2, replace the 5 inline values.

### M4-D6 — `tests/e2e/crew-page.spec.ts:118` desktop-chromium viewport bug — **RESOLVED 2026-05-17 via M9 Cluster C1**

**Status:** Resolved in M9 Cluster C1 (commit `fe16928` per recent git log: "pin mobile viewport for tile-grid 2-col assertion (M4-D6)").

**Source (original):**

**Source:** Task 4.13 spec compliance review, 2026-05-03 (pre-existing failure flagged)
**Description:** Task 4.2's `crew-page.spec.ts:118` test asserts 2-col grid without `setViewportSize(390, ...)`. On `desktop-chromium` (1280×800 default) the grid renders 4 cols, so the assertion fails. Pre-existing failure introduced at commit `c518006` (predates Task 4.13). The current `playwright.config.ts` testMatch may be excluding it from `desktop-chromium` — verify.
**Why deferred:** Not introduced by Task 4.13; pre-existing. Minor scope.
**Suggested home:** Next M4-touching change OR M9 polish. Either add `await page.setViewportSize({ width: 390, height: 667 })` at the top of the test, OR scope the test's testMatch to `mobile-safari` only.

### M5-D1 — /me page lacks "what's next" anchor — **RESOLVED 2026-05-17 via M9 Cluster C3**

**Status:** Resolved in M9 Cluster C3 (Auth flow + /me page + Bootstrap). See `handoffs/M9-polish.md` §Convergence log → Cluster C3 (R16 APPROVE). 16-round convergence covered the partition logic (active/upcoming/past/undated), chip-anchor sorting, ISO-date gate, calendar-impossible date rejection. Final commit `6114abc`.

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C1, P0)
**Description:** `app/me/page.tsx` renders shows as an identical card grid (DESIGN.md anti-pattern: "no identical card grids"). Crew member with multiple shows must visually scan every card to find the one happening today/tomorrow. The most-soonest show should be visually emphasized (larger card, "Tomorrow" / "In 3 days" relative-time chip) and the rest grouped under "Upcoming" / "Past" headers.
**Why deferred:** UX/IA judgment call best handled in a dedicated `/impeccable shape /me page reorder with what's-next anchor` session, not under M5 close-out pressure. Spec §7.3 says `/me` lists shows; visual hierarchy across the list is M9 polish territory.
**Suggested home:** M9 polish.

### M5-D2 — Bootstrap shell has no liveness signal or timeout — **RESOLVED 2026-05-17 via M9 Cluster C3**

**Status:** Resolved in M9 Cluster C3 (Bootstrap retry race + StrictMode + signal-aware fetch + 6s still_working flip + Retry button). Final commit `6114abc`.

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C2, P0)
**Description:** `app/show/[slug]/p/Bootstrap.tsx` "Connecting…" state has no animated indicator and no timeout. On slow venue Wi-Fi, frozen and working states look identical. User stares at static text for 2-8 seconds with no feedback. No retry mechanism if the bootstrap mint or redeem-link POST stalls.
**Why deferred:** Animation choice + timeout-with-retry UX is best designed in a `/impeccable animate` + `/impeccable shape` session, not bolted on under M5 close-out. The §A redeem-link route is correct; this is a pure §B presentation polish.
**Suggested home:** M9 polish. Consider: animated dot per `--duration-normal` + 6s timeout flipping to "Still working… [Retry]" intermediate state.

### M5-D3 — AlertBanner shows only top alert, no queue depth, no Resolve confirmation — **RESOLVED 2026-05-17 via M9 Cluster C4**

**Status:** Resolved in M9 Cluster C4 (queue chip + two-tap Resolve + raised_at relative time). See `handoffs/M9-polish.md` §Convergence log → Cluster C4 (R3 APPROVE). Final commit `b6e4cc1`. The useFormStatus hardening follow-up (M9-D-C4-1) also resolved in commit `c195747`.

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C3, P1)
**Description:** `components/admin/AlertBanner.tsx` SELECTs `LIMIT 1` and shows only the topmost unresolved alert. Doug has no signal that more alerts are queued. Resolve button has no confirmation step — accidental tap on a P0 alert (REPORT_ORPHANED_LOST_LEASE etc.) silently resolves without undo. Also missing `raised_at` display ("Raised 14 minutes ago").
**Why deferred:** Banner UX (queue badge, two-tap confirm, raised_at format) is shape work that benefits from a `/impeccable shape components/admin/AlertBanner.tsx` session. M5 ships the catalog wiring + RLS + Server Action correctly; the visual polish around queue depth and confirmation is M9 territory.
**Suggested home:** M9 polish.

### M5-D4 — Sign-in page lacks FXAV brand mark and Google G icon — **RESOLVED 2026-05-17 via M9 Cluster C5**

**Status:** Resolved in M9 Cluster C5 (Sign-in brand). See `handoffs/M9-polish.md` §Convergence log → Cluster C5 (R4 APPROVE — closed via FXAV wordmark sourced from fxav.net + official Google sign-in-button SVG from Google's signin-assets.zip; no hand-recreation; brand-compliant).

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C4, P1)
**Description:** `app/auth/sign-in/page.tsx` has no FXAV wordmark above the headline. `SignInButton.tsx` has text-only "Sign in with Google" with no Google G SVG. Trust signal missing on the highest-stakes form on the site (where users hand over Google credentials). Also violates Google's official Sign-In button brand guidelines.
**Why deferred:** Requires brand asset sourcing (FXAV wordmark; Google's official G SVG download). Better handled in a coordinated polish pass with proper assets + Google brand-guide conformance, not under M5 close-out.
**Suggested home:** M9 polish.

### M5-D5 — Help/recovery copy assumes Doug is reachable (P2) — **RESOLVED 2026-05-17 via M9 Cluster C3**

**Status:** Resolved in M9 Cluster C3 (sign-in error block placement above secondary path + View show list affordance per R8 disposition; brief §5.3 deviation documented in JSX comment per user authorization).

**Source (original):**

**Source:** M5 §B `/impeccable critique`, 2026-05-04 (Finding C5, P2 — non-blocking, recorded for completeness)
**Description:** Bootstrap.tsx error path and SignInButton inline error both fall back to "Try again" or "ask Doug." Doug-on-stage cannot be reached. Self-serve fallbacks ("Sign in with Google instead" link from bootstrap error; "Go to my shows" link from no-fragment state; "View show list" secondary path on sign-in) would let crew members recover without Doug.
**Why deferred:** P2 — copy iteration is best handled with `/impeccable clarify` after the structural shape work in M5-D1 / M5-D2 lands.
**Suggested home:** M9 polish, after M5-D1 / M5-D2.

### M5-D6 — Audit-pass minor findings batched (P2-P3) — **RESOLVED 2026-05-17 via M9 Cluster C8**

**Status:** Resolved in M9 Cluster C8 (A11y batch). See `handoffs/M9-polish.md` §Convergence log → Cluster C8 (R3 APPROVE).

**Source (original):**

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Findings P2 #3, P2 #5, P2 #7, P3 #2, P3 #3 — batched)
**Description:** Five small audit findings deferred:

1. `<details>` UA marker not styled / no `list-style: none` reset (`components/messages/ErrorExplainer.tsx:93-98`).
2. SignInButton inline error not associated with button via `aria-describedby` (`app/auth/sign-in/SignInButton.tsx:118-145`).
3. AlertBanner `role="status" aria-live="polite"` on SSR-only region — comment-documented; consider `aria-atomic="true"` for future client-injection.
4. Bootstrap connecting state has no `aria-live` for state transitions.
5. Sign-in page `<header>` lacks `aria-labelledby` (only matters when multiple `<header>` elements stack).
   **Why deferred:** All P2/P3. Low-impact a11y polish that benefits from a coordinated pass rather than scattered fixes.
   **Suggested home:** M9 polish.

### M5-D7 — Accent button drift across §B surfaces (Systemic)

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Patterns & Systemic Issues #1)
**Description:** SignInButton, AlertBanner Resolve, /me sign-out — three "accent button" variants across §B with diverging className composition. SignInButton has the canonical pattern (transition-colors, focus-ring-offset, disabled treatment). AlertBanner Resolve was aligned in commit `1678000`; the systemic concern remains: there's no shared `<AccentButton>` atom. Future button surfaces will continue to diverge.
**Why deferred:** Atom extraction is M6+ territory (when M6's UI components introduce a 4th button variant, the case for extraction will be clear). Premature extraction at 3 variants is YAGNI.
**Suggested home:** M6 or first M-task that introduces a 4th accent button variant.

### M5-D8 — Inline error copy duplication; no catalog routing (Systemic) — **RESOLVED 2026-05-17 via M9 Cluster C7**

**Status:** Resolved in M9 Cluster C7 (Inline-error consolidation). See `handoffs/M9-polish.md` §Convergence log → Cluster C7 (R3 APPROVE).

**Source (original):**

**Source:** M5 §B `/impeccable audit`, 2026-05-04 (Patterns & Systemic Issues #2)
**Description:** SignInButton (`app/auth/sign-in/SignInButton.tsx:139-141`) and Bootstrap (`app/show/[slug]/p/Bootstrap.tsx:96-99`) both hand-code generic operator-friendly copy with no routing through `lib/messages/lookup.ts`. As §A's catalog grows (`BOOTSTRAP_NETWORK_ERROR`, `OAUTH_INITIATE_FAILED` candidates), these strings should route through ErrorExplainer.
**Why deferred:** §A coordination ask. §A would add the catalog entries; §B would swap the inline strings for ErrorExplainer renders. Not a §B-internal fix.
**Suggested home:** Coordinate with §A in M6 or whenever the catalog next gets touched.

### M7-D1 — Gallery + agenda lightbox entry/exit motion — **RESOLVED 2026-05-17 via M9 Cluster C6**

**Status:** Resolved in M9 Cluster C6 (Lightbox motion). See `handoffs/M9-polish.md` §Convergence log → Cluster C6 (R3 APPROVE).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable critique`, 2026-05-11 (round 1)
**Description:** Wrap `GalleryLightbox` and `AgendaSheet` openings in a `framer-motion` `AnimatePresence` transition: opacity 0→1 and `scale: 0.96 → 1` enter / reverse exit. Duration consumes `--duration-normal` (220ms) and easing consumes `--ease-out-quart` from DESIGN.md §5. Gate motion via `prefers-reduced-motion` so the existing `app/globals.css` reduction sets duration to 0ms.
**Why deferred:** Shipping the lightbox + sheet without an entry crossfade is a perceptible "first-pass implementation" tell against native phone galleries (Apple Photos / Google Photos both use a brief shared-element scale). v1 ships functional + accessible (focus trap, page counter, swipe carries information about position) but the polish moment is M9's job to land alongside the other motion-touch tasks. AC-7.1 / AC-7.2 / AC-7.7 do not require entry motion; M7 close was not blocked.
**Suggested home:** M9 polish.

### M7-D2 — AgendaPdfViewer error states routed through messageFor — **RESOLVED 2026-05-17 via M9 Cluster C6**

**Status:** Resolved in M9 Cluster C6 (Lightbox + sentinel + error routing). The new §12.4 catalog rows AGENDA_GONE_FOR_CREW + AGENDA_UNAUTHENTICATED (ratified spec amendment `2026-05-12-catalog-agenda-codes.md`) are consumed by `components/agenda/AgendaPdfViewer.tsx`. See `handoffs/M9-polish.md` §Convergence log → Cluster C6 (R3 APPROVE).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (Finding G.3)
**Description:** Replace the single "couldn't open the agenda right now" copy in `components/agenda/AgendaPdfViewer.tsx` with a `messageFor(...)` lookup so 410 / 401 / 500 surface distinct crew-facing copy (per AGENTS.md §1.5 — no raw error codes, but also: distinct user-facing messages should map to distinct catalog entries). Inspect `react-pdf`'s `onLoadError` payload to derive an HTTP status hint. If `react-pdf` doesn't expose status, run a HEAD fetch against the proxy URL first and route on its status. Add new §12.4 catalog rows where needed: `AGENDA_GONE_FOR_CREW` (410) and `AGENDA_UNAUTHENTICATED` (401) with crew-facing copy that suggests reopening Doug's link.
**Why deferred:** v1 collapses every PDF load failure to a single retry-able message. The retry-able framing is correct for transient infra faults but wrong for permanent 410 (file removed / non-PDF / drift) where retrying spins. The fix needs new catalog rows and the X.1 spec extractor parity test pinned, which is more scope than the M7 close-out could absorb. AC-7.1 closes at M7 — the proxy route + inline embed works; only the failure-state copy is deferred.
**Suggested home:** M9 polish OR earlier if a §12.4 catalog row for crew-facing PDF errors lands.

### M7-D4 — Pinch-zoom inside lightbox figures — RESOLVED 2026-05-13 (M9 C6c)

**Source:** M7 Task 7.9 §12 `/impeccable critique`, 2026-05-11 (LD persona red flag)
**Description:** Add `react-zoom-pan-pinch` (or equivalent) inside each `<figure>` of `GalleryLightbox.tsx` so a crew member can pinch-zoom a diagram for detail (truss positions, stage plot dimensions). Embla's swipe gesture must be temporarily disabled while a zoom is in flight; restore on pinch-end. Verify gesture priority: pinch wins over swipe when two fingers are down; single-finger swipe still navigates between images.
**Resolution (M9 C6c, 2026-05-13):** Shipped via `react-zoom-pan-pinch@4.0.3`. Single-finger pan when zoomed; Embla `watchDrag` gated on `wasZoomedRef` boundary; chevrons auto-reset zoom. Reset chip absolutely-positioned inside the relative image container so the figure does not reflow on mount. 28 jsdom unit tests + impeccable critique + audit dual gate passed. See shape brief `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/shape-sessions/2026-05-13-pinch-zoom-lightbox.md` and handoff §12 for the convergence log. Real-device iOS smoke is the remaining manual verification per shape brief §14.

### M9-D-C1-2 — Next 16 + Turbopack `next/font/google` dev-mode fetch hang — RESOLVED 2026-05-14 (Next 16.2.4 upgrade)

**Resolution:** Bumped `next` from 16.0.0 → 16.2.4 in commit `889347a`. Next.js 16.2.4 included PR #92713 (reqwest v0.13.2) which resolved the upstream Turbopack font-fetch issue (#91653 / #92671). Worktree smoke-test confirmed: `/show/[slug]` renders in 1.7s cold compile / 37-84ms warm under `pnpm dev` with admin auth (vs. 180s+ hang on 16.0.0). The MS_ONLY env-guard was removed from `playwright.config.ts` and the run-sequence comment in `tests/e2e/crew-page.spec.ts` was simplified — the layout-invariant suite now runs under the default `pnpm exec playwright test` command path with no manual pre-build required. All 3 layout-invariant Playwright tests pass under the standard webserver-spawn flow (1.0min total including the other 3 webservers building).



**Source:** M9 C1 R3+R4 e2e implementation, 2026-05-14. Discovered while wiring the active layout-invariants suite and its sm:>=640px companion.
**Description:** `pnpm dev` (Next 16 + Turbopack default bundler) hangs the first request to any route whose layout imports `next/font/google` Inter — `app/show/[slug]/layout.tsx:31` is the trigger for the crew page. Reproducer:
1. Start the dev server.
2. Authenticate via `/api/test-auth/set-session` (admin email).
3. Curl `/show/<slug>` with the admin cookies.
4. The dev server holds 8 ESTABLISHED HTTPS connections to `fonts.gstatic.com` (and 1 to `fonts.googleapis.com`) and never sends a render response. The fonts URLs themselves are reachable in <100ms via direct curl from the same shell, so the network is fine — Next 16's font-fetch path (or its Turbopack integration) drops the responses on the floor.

This is the same class of bug tracked upstream:
- vercel/next.js#78472 — "Error while requesting resource" with `next/font/google` using `next dev --turbopack`
- vercel/next.js#71618 — Google fonts not bundled in Next.js 15 turbopack dev builds
- vercel/next.js#92671 — `next/font/google` fails to build on 16.2.3 — Turbopack font resolution broken

**Historical workaround (no longer required as of commit 889347a):** while pinned to Next.js 16.0.0, the C1 R3+R4 e2e suites required a manually pre-built production server with an `MS_ONLY=1` env-guard on `playwright.config.ts` to elide the other webservers. That workaround has been removed; the suite now runs under the default `pnpm exec playwright test` command path. See the resolution note above for the verification timing.

### M9-D-C6c-1 — Pinch discoverability hint (declined HIGH from C6c critique)

**Source:** M9 C6c `/impeccable critique`, 2026-05-13 (HIGH-1 finding from the LLM design review)
**Description:** Reviewer flagged the absence of a first-time discoverability hint for pinch-zoom on the lightbox. Suggested mitigations: a one-shot subtle chip ("Pinch to zoom · double-tap to reset") that fades out after 2s on first open per session, OR a persistent low-contrast hint in the header alongside "Diagrams · N of M".
**Why deferred (accepted residual risk, AGENTS.md invariant 8):** Pinch-zoom is a gesture-universal convention on mobile (iOS Photos, every consumer image viewer teaches it culturally). Mobile crew members will instinctively try pinch on any photographic image. The "stuck while zoomed" failure mode the hint primarily protects against is already handled by the Reset chip (which is visible by definition when scale > 1, the only state where the user could be stuck). Adding a persistent hint chip would compete for header chrome real-estate against the page indicator (1 of N) and the close button on a 390px viewport; a session-scoped one-shot hint adds localStorage state machinery and an additional dismiss interaction surface. No user-research signal that discoverability is an actual barrier on this surface. Recommendation revisits if FXAV venue-floor crew feedback explicitly identifies pinch-discovery friction in a future round.
**Suggested home:** Re-open when there is a real-user data point. Currently no scheduled milestone.

### M9-D-C4-1 — `useFormStatus` hardening for Resolve failure path — **RESOLVED 2026-05-17 (impeccable gate re-run 2026-05-17 via M9 final-review R10)**

**Status:** **Resolved.** `components/admin/ResolveAlertButton.tsx` refactored to derive the "Resolving…" / disabled-controls state from `useFormStatus().pending` instead of a local `ui="resolving"` flag.

**Impeccable dual-gate (re-run post-c195747 per AGENTS.md invariant 8, M9 final-review R10):**

| Gate | Score | Detector | Verdict |
|---|---|---|---|
| `/impeccable critique` | 33/40 Nielsen (+3 vs prior C4 baseline of 30/40 — useFormStatus is a net win on H1 Visibility, H5 Error Prevention, H9 Error Recovery) | `[]` | Clean. No CRITICAL/P0/P1. |
| `/impeccable audit` | 19/20 (Excellent) | `[]` | Same as prior C4 baseline. |

**c195747 critique dispositions (2 findings; both DEFERRED with rationale):**

- **P2 — Double-tap window between pending=false and banner re-mount on happy path.** When `revalidatePath` fires, there's a brief window where Confirm re-enables before the server re-render swaps the banner; Doug could double-tap Confirm against an already-resolved row. **DEFERRED** — the Server Action is idempotent (the `WHERE resolved_at IS NULL AND show_id IS NULL` guard at `app/admin/actions.ts:80-86` makes the second UPDATE a no-op). Not destructive. A `useActionState` migration could close this window but adds complexity for a benign no-op race. Re-open if a real-world double-tap surfaces a visible UX glitch.
- **P3 — No live-region announcement on pending→idle failure transition.** Doug glancing away mid-show wouldn't hear that a failed submit silently re-enabled. **DEFERRED** — the parent banner's `role="status" aria-live="polite"` covers the alert's content; explicit failure-announcement would require a visually-hidden span toggled by a derived `failureTransition` state. Re-open if Doug-on-phone feedback shows the silent re-enable is missed in practice.

**Mechanism:** Removed the `"resolving"` UiState entirely. The retained `idle | confirm` states are local, but pending submission lifecycle is owned by the parent `<form action={resolveAdminAlertFormAction}>` via a small `ConfirmRow` child component (required because `useFormStatus` must be called from a descendant of the form, not the form itself). When pending=true the Confirm button shows "Resolving…" + disabled + aria-busy; when the action returns (success OR failure), pending naturally flips back to false. On happy path the page revalidates and the banner re-mounts as before; on failure path Doug now sees Confirm + Cancel re-enabled without needing to reload.

**Regression test added:** `tests/components/ResolveAlertButton.test.tsx` — new case `"M9-D-C4-1: pending flips back to false on action failure → Confirm + Cancel re-enabled (no stuck Resolving…)"` uses a controlled async action that rejects mid-flight; asserts the disabled controls re-enable + label reverts to "Confirm resolve" after the failed submission. The existing `confirm → resolving` case was also rewritten to use a real `<form action={fn}>` with a controlled promise so useFormStatus has an actual submission lifecycle to track.

**Source:** M9 C4 R3 adversarial review (Codex), 2026-05-15 — MEDIUM finding from APPROVE verdict.

### M9-D-dead-admin-href — Sweep `/admin` dead-href class — **RESOLVED 2026-05-17 via M9 final-review R12 + R13 + R14 + R15**

**Status:** **Resolved.** Four review rounds converged the dead-href class:
- R12/R13 caught that `href="/admin"` 404'd because the route tree had no `app/admin/page.tsx` — retargeted all UI links to `/admin/dev`.
- R14 caught the same class in the auth-redirect default `DEFAULT_AUTH_NEXT_PATH = "/admin"` and `ALLOWED_NEXT_RE` — retargeted to `/admin/dev`.
- **R15** caught that `/admin/dev` is itself build-gated out of production via `scripts/with-admin-dev-flag.mjs` (ADMIN_DEV_PANEL_ENABLED env var unset = `/admin/dev/page.tsx` renamed away). The `/admin/dev` fallback would 404 in prod the same way `/admin` did before.

**R15 final resolution:**
- Created `app/admin/page.tsx` — an always-built admin landing page with links to available admin sub-pages (Administrators settings + Dev parse panel when ADMIN_DEV_PANEL_ENABLED). Section anchored as `id="alerts"` so the AlertBanner queue chip's `#alerts` fragment lands meaningfully (the layout's AlertBanner renders above this).
- All four UI links + DEFAULT_AUTH_NEXT_PATH + ALLOWED_NEXT_RE restored to `/admin`.

| File | Source | Final R15 Fix |
|---|---|---|
| `app/admin/settings/admins/error.tsx:88` | R11 | `/admin` (Back to admin) |
| `components/admin/AlertBanner.tsx:188` | M9 C4 commit `eaf9fe9` | `/admin#alerts` |
| `app/admin/layout.tsx:62` | pre-M9 commit `1a777ea` | `/admin` (Try again) |
| `app/admin/show/[slug]/page.tsx:130` | pre-M9 commit `098b820` | `/admin` (← Admin home) |
| `lib/auth/validateNextParam.ts:DEFAULT_AUTH_NEXT_PATH` | M5 sign-in flow | `/admin` (production-safe landing now exists) |

**Defense going forward:** route-reachability tests in:
- `tests/components/admins-error-boundary.test.tsx` asserts `app/admin/page.tsx` exists.
- `tests/components/AlertBanner.test.tsx` asserts `app/admin/page.tsx` exists.

If a future refactor moves `app/admin/page.tsx`, both gates trip before the dead-link reaches production.

### M9-D-error-tsx-1 — `app/admin/settings/admins/error.tsx` post-R1 impeccable dispositions — **RESOLVED 2026-05-17 via M9 final-review R11**

**Status:** **Resolved.** Impeccable dual-gate ran on the R1-added `error.tsx` route-segment error boundary per AGENTS.md invariant 8 (R11 finding caught the missed gate from R1 commit `f669e18`).

| Gate | Score | Detector | Findings |
|---|---|---|---|
| `/impeccable critique` | mixed (4-heuristic targeted): H1=2 (improved to 3 post-fix), H9=3, H6=3, H10=1 → improved to ~2-3 post-fix | `[]` | 1 P1 + 2 P2 + 1 P3 — all fixed except P3 (deferred). |
| `/impeccable audit` | mirrored prior C9 baseline (token discipline + 44×44 tap targets preserved) | `[]` | No CRITICAL/HIGH. |

**R11 c195747-style polish dispositions on `error.tsx`:**
- **P1 — Retry-loop trap.** No fallback if Retry keeps failing on a persistent infra fault. **FIXED** (R11 first commit, **R12 retargeted**): added "Back to admin dev" `Link` to `/admin/dev`. R11 originally targeted `/admin` which 404'd because the route tree has no `app/admin/page.tsx`; R12 caught the dead-end and retargeted to `/admin/dev` (the only `/admin/*` page that doesn't depend on `admin_emails` and therefore can't re-fail the same way). New route-reachability test asserts `app/admin/dev/page.tsx` exists so a future refactor that moves the page breaks the test before silently breaking the escape Link.
- **P2 — Retry button no pending state.** `reset()` is sync-fire-and-forget but the segment re-render is async; user got no signal the tap registered. **FIXED:** wrapped `reset()` in `useTransition()`; button shows "Retrying…" + `disabled` + `aria-busy="true"` during the transition.
- **P2 — No escalation/help line.** Catalog message alone didn't tell Doug what to do if retry fails twice. **FIXED:** added a `text-sm` sub-line: "If this keeps happening, the server-side log has the stack — check Supabase health or page the on-call admin." (Non-catalog UX text per invariant 5; no error code surfaced.)
- **P3 — Decorative `<h1>Administrators</h1>` header eats vertical space when the page hasn't loaded.** **DEFERRED:** the consistent page-title chrome preserves Doug's sense of place when the route segment re-mounts on Retry. Re-open if a future user-research signal shows the title is misleading mid-failure.

**Tests:** 7 cases in `tests/components/admins-error-boundary.test.tsx` cover catalog message render, defense-in-depth coverage for unknown throws, Retry wiring, role="alert" contract, the new "Back to admin" Link, the Retry idle-state contract, and the escalation sub-line presence.

### M9-D-9.3-1 — AC-9.2 empty-state reachability e2e spec is `test.describe.skip` pending auth-fixture migration — **RESOLVED 2026-05-17**

**Status:** **Resolved.** Migration shipped in the same session as the deferral. `tests/e2e/empty-state-reachability.spec.ts` is now `test.describe()` (no skip); all 4 §8.3 scenarios pass and have committed screenshot baselines at `tests/e2e/empty-state-reachability.spec.ts-snapshots/`.

**Migration changes:**
- `tests/e2e/empty-state-reachability.spec.ts`: dropped `test.describe.skip` → `test.describe`. `beforeAll` now creates a per-suite `crew_members` row tied to `NON_ADMIN_CREW_FIXTURE.email` with `role_flags=['LEAD']` so categories 1/2/4 see a LEAD viewer; category 3 stays valid because the test crew is NOT on any seed `hotel_reservations` row. `beforeEach` calls `signInAs(NON_ADMIN_CREW_FIXTURE)` per-test. `afterAll` deletes the crew row + restores show state.
- Dropped all `?crew=${s.leadCrewId}` query params from `goto()` calls (the retired query-mock); the route resolves crew identity from auth cookies → canonical email → crew_members lookup.
- Snapshot type pruned to remove `leadCrewId` field (no longer needed).
- `playwright.config.ts` testMatch regex extended to include `empty-state-reachability` (previously only matched `empty-state.spec.ts` exactly).
- One DOM contract assertion fixed: the spec's "Doug hasn't filled this in yet" copy was hypothetical; actual `VenueTile.tsx:70` copy is "Venue details haven't been added yet." — corrected.

**Verification:** ran `pnpm test:e2e tests/e2e/empty-state-reachability.spec.ts --project=mobile-safari` twice — first run generated baselines via `--update-snapshots`; second run vs baselines passed 4/4 in 5.6 minutes.

**Source:** M9 final-review R8 (Codex), 2026-05-17 — HIGH finding.

### M9-D-C9-1 — `/impeccable critique` + `/impeccable audit` dual gate pending on `/admin/settings/admins` UI — **RESOLVED 2026-05-17**

**Status:** **Resolved.** Both impeccable gates closed cleanly on the C9 UI surfaces (`app/admin/settings/admins/page.tsx`, `AddAdminForm.tsx`, `RevokeRowButton.tsx`, `ReAddRowButton.tsx`). All dispositions:

| Gate | Score | Verdict | Findings + dispositions |
|---|---|---|---|
| `/impeccable critique` | 30/40 Nielsen, detector `[]` | Solid — ship after P1 fixes | 2 P1 + 2 P2 + 1 P3, all FIXED in commit `4e438b0` (lockout error placement; success confirmation + form reset; one-tap re-add affordance on RevokedRow; "You" pill + meta-line typography; re-add cancel result reset via formKey bump) |
| `/impeccable audit` | 19/20 Excellent, detector `[]` | Excellent (minor polish) | 1 P2 + 1 P3, both FIXED in follow-up commit (this entry): P2 "You" pill contrast (`text-[10px]` on `bg-accent` = 4.07:1 fails WCAG 1.4.3 for small text — swapped to neutral high-contrast pill `border border-border bg-surface-raised text-text-strong text-xs`); P3 disabled-Revoke `title` tooltip → visible inline hint with `aria-describedby` (mobile devices don't surface `title`; screen readers often ignore `title` on disabled buttons) |

Both passes ran with the canonical v3 preflight gates (PRODUCT.md ✓, DESIGN.md ✓, command_reference ✓, shape not-required, image-gate skipped:critique-evaluate-only, mutation closed→open for fixes). Detector returned `[]` (zero pattern matches) on both passes. No new tokens introduced (brief §11 anti-goal preserved).

**Source:** M9 C9 R10 adversarial review (Codex), 2026-05-17 — CRITICAL finding (process gate).
**Resolution path traversed:** User ran `/impeccable critique` → 5 findings dispositioned in commit `4e438b0`. User ran `/impeccable audit` on patched code → 2 findings dispositioned in follow-up commit. M9 C9 is now structurally + technically + process-gate complete.

### M7-D5 — Sentinel-hiding helper for diagrams + agenda emptiness — **RESOLVED 2026-05-17 via M9 Cluster C6**

**Status:** Resolved in M9 Cluster C6 (sentinel hiding consolidation). See `handoffs/M9-polish.md` §Convergence log → Cluster C6 (R3 APPROVE).

**Source (original):**

**Source:** M7 Task 7.9 §12 `/impeccable audit`, 2026-05-11 (Finding G.5)
**Description:** Add `shouldHideDiagrams(diagrams, agendaLinks)` to `lib/visibility/emptyState.ts` so the §8.3 generic-optional sentinel-hiding contract has a single source of truth for diagram-tile emptiness. Register the new helper in `tests/components/tiles/_metaSentinelHidingContract.test.ts` so the meta-contract walks DiagramsTile alongside the other sentinel-bearing tiles.
**Why deferred:** DiagramsTile currently uses inline boolean checks (`items.length > 0`, `agendaLinks.some((link) => Boolean(link.fileId))`). Both are MEDIA-presence checks, not text-sentinel checks — they don't pattern-match the existing `shouldHideGenericOptional` (which hides "TBD" / "N/A" / "TBA"). The audit flagged this as a §1.9 meta-test coverage gap rather than a bug. v1 works correctly; the helper extraction is a discipline polish. AC-7.2 + AC-7.7 close at M7 — DiagramsTile returns null on whole-tile-missing per §8.3 already.
**Suggested home:** M9 polish.

### M11.5-IMP-1 — SignInOrSkipGate reassurance footer copy + catalog code — **RESOLVED 2026-05-26**

**Status:** Resolved 2026-05-26 — folded into M12 amendment scope at SHA `77687d8` (M12 amendment Commit 10 "fold M11.5-IMP-1 + IMP-2 + IMP-4 into amendment scope"). Execution lands in Phase 0.A.1 of the M12 plan (`01-phase0-infra.md` Task 0.A.1) when M12 enters its execution phase.
**Source:** External impeccable critique, M11.5 §B close-out. Picker spec §7.1a item 7 (reassurance footer "Crew don't have to sign in. Skip works for everyone.").
**Description:** SignInOrSkipGate currently renders header + cataloged prompt + CTA pair without the spec-mandated reassurance footer at the bottom. The footer requires a new catalog code (suggested `SIGN_IN_OR_SKIP_FOOTER_REASSURANCE`) whose crewFacing copy reassures Skip-side users that signing in is optional.
**Why deferred:** Adding catalog codes is §A territory (`lib/messages/catalog.ts` + the `lib/messages/__generated__/spec-codes.ts` generator). M11.5 §B UI session did not own that surface. The component-side wiring is trivial once the catalog code exists.
**Suggested home:** M12 amendment scope (resolved 2026-05-26). Trigger: catalog code is registered.

### M11.5-IMP-2 — Picker `picker-show-strip` (show identifier line) — **RESOLVED 2026-05-26**

**Status:** Resolved 2026-05-26 — folded into M12 amendment scope at SHA `77687d8` (M12 amendment Commit 10). Execution lands in Phase 0.A.2 of the M12 plan (`01-phase0-infra.md` Task 0.A.2) when M12 enters its execution phase. Implementation option (α extend resolver shape vs β separate metadata fetch) is decided at task start by the executing dev.
**Source:** External impeccable critique, M11.5 §B close-out. Picker spec §7.1 item 2 + §7.6 inventory.
**Description:** Spec §7.1 item 2 requires a show identifier strip with `data-testid="picker-show-strip"` between the brand strip and the "Who are you?" heading. Currently absent — PickerInterstitial has no `show.title`/`show.dates` available because `resolveShowPageAccess` returns only `showId` for the picker-rendering arms.
**Why deferred:** Adding the strip requires extending the resolver's return shape OR adding a separate metadata fetch in the route page (which already loads roster via `loadRoster`). Both options are minor but non-trivial — shape change is §A coordination; fetch addition is §B scope but compounds the route's complexity.
**Suggested home:** M12 amendment scope (resolved 2026-05-26).

### M11.5-IMP-3 — /me consumes extended TerminalFailure (deduplication)

**Status:** Deferred 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 2 — TerminalFailure).
**Source:** External impeccable audit, M11.5 §B close-out.
**Description:** `app/me/page.tsx:105-126` renders its own inline terminal-failure block (`<main>` shell + `<h1>` + `<p>` + "Try again" link). The C0 commit's `<TerminalFailure>` component now accepts optional `title` + `retryHref` props (landed in `c1936f2`) so /me's inline block can be replaced by `<TerminalFailure code="..." title="..." retryHref="/me" />`.
**Why deferred:** Refactor touches two render branches in /me (mid-chain failure + post-chain `listShowsForCrew` failure). Each call site has different catalog codes and slightly different copy. Out of M11.5 §B scope; mechanical follow-up that benefits from a dedicated diff.
**Suggested home:** M12 UX validation. Trigger: M12 touches `app/me/page.tsx` for any reason.

### M11.5-IMP-4 — DESIGN.md §1.2 contrast amendments for picker color pairs — **RESOLVED 2026-05-26**

**Status:** Resolved 2026-05-26 — folded into M12 amendment scope at SHA `77687d8` (M12 amendment Commit 10). Execution lands in Phase 0.A.3 of the M12 plan (`01-phase0-infra.md` Task 0.A.3) when M12 enters its execution phase.
**Source:** External impeccable audit, M11.5 §B close-out.
**Description:** DESIGN.md §1.2 "Contrast summary" doesn't list two color pairs the picker uses: `text-text on bg-stale-tint` (the picker banner row) and `text-text-subtle on bg-surface-sunken` (claimed-row treatment). Both pairs almost certainly hit AA body floor on the chosen tints but the table doesn't pre-compute them.
**Why deferred:** Small mechanical doc update (compute the two ratios, add two rows to the table). Out of §B scope; lands cleanly alongside any DESIGN.md edit.
**Suggested home:** M12 amendment scope (resolved 2026-05-26).

### M11.5-IMP-5 — Admin Reset/Rotate destructive-action UX polish set

**Status:** Deferred 2026-05-24 from M11.5 §B impeccable v3 attestation (Unit 4 — admin affordances).
**Source:** External impeccable critique + audit, M11.5 §B close-out.
**Description:** Four small polish items the attestation surfaced that need Doug feedback rather than local critique:
1. The simplified "Crew" section + "Preview as a crew member" list are adjacent rosters with similar content. Consider folding the simplified roster into "Share & access" as context (C3).
2. Two confirm rows (Reset + Rotate) can be open simultaneously — visually noisy, not destructive (C6).
3. 2s Copy-button success-state duration is borderline short for venue-floor phone glance-back (A3).
4. `aria-describedby` link from destructive Confirm button to its warning paragraph (group-label suffices for WCAG 2.1; tighter SR experience available) (A6).
5. Confirm-row layout primitive inconsistency: Reset uses `flex flex-wrap items-center justify-end`; Rotate uses `flex flex-col items-end` containing a nested flex row (A5).
**Why deferred:** Each is a UX tuning decision that benefits from Doug's actual usage feedback. Local critique can't ground the trade-offs (e.g., 2s vs 5s copy timing depends on Doug's typical scroll cadence).
**Suggested home:** M12 UX validation. Trigger: M12 admin-surface validation pass.

---

## Resolved

### M10-D-PHASE3-1 — `/api/report` auth precedence (admin preview reports can downgrade to crew)

**Status:** **Resolved at SHA `e54babe` (M10 §A post-Pin-3 report auth hotfix)**.

**Source:** M10 §B Phase 3 adversarial review, Codex R6 (commit `259fb6f`).
**Description:** `app/api/report/route.ts` accepted a valid link / Google session before it checked `requireAdminIdentity`, so an admin previewing a show in a browser that ALSO carried a valid crew session for the same show submitted the "Report this view" POST with `auth.kind === "crew"` despite the client setting `surface: "admin"` + `crewPreview` autocapture. `submitReport` then built the crew issue body, omitted `crewPreview`, labeled it `reporter:crew`, and withheld the GitHub URL from the admin's modal. The Phase 3 §B client surfaces were correct (the override + autocapture were wired through both PreviewBanner and Footer); the downgrade happened server-side at the auth-ordering boundary.
**Resolution:** `app/api/report/route.ts` now gives admin identity precedence when `body.surface === "admin"`: it attempts `requireAdminIdentity()` before link/Google session validation, submits with `{ kind: "admin", email }` on success, returns 403 without falling through to crew auth on auth-denial, and preserves `AdminInfraError` as a cataloged 500. Route-level regressions in `tests/reports/auth.test.ts` cover mixed admin+link sessions, claimed-admin-without-admin, admin-auth infra failure, crew link behavior, and crew-surface admin fallback.

### M6-D12 — Amendment 9 first-seen auto-publish + 24h unpublish undo

**Status:** **Resolved at SHA `badbb15` (M6.5 coda — Amendment 9 first-seen auto-publish + 24h unpublish undo)**. Cross-model adversarial review APPROVED. M6 amended AC-6.11 now satisfied.

**Source:** M6 §A adversarial review round 3, 2026-05-09
**Description:** Retire live-path `FIRST_SEEN_REVIEW` emission for first-seen sheets in `cron`, `push`, and `manual` modes. Auto-apply first-seen live sheets when MI-1..MI-14 all pass; continue hard-failing MI-1..MI-5b to `pending_ingestions` and staging MI-6..MI-14 trips with the specific MI sentinel. Add `shows.unpublish_token` and `shows.unpublish_token_expires_at`. Emit `SHOW_FIRST_PUBLISHED` after auto-publish. Implement `POST /api/show/[slug]/unpublish?token=...` with token consumed, expired, and success branches; emit `SHOW_UNPUBLISHED` and revoke affected links on success. Keep onboarding-scan first-seen sheets in explicit-review mode with `ONBOARDING_SCAN_REVIEW`.
**Resolution:** Shipped in M6.5 coda (see `handoffs/M6.5-amendment-9.md`). Schema columns added with paired-NULL CHECK; live-path FIRST_SEEN_REVIEW retired and replaced with `auto_publish_ready` branch in Phase1Result; auto-publish wired through phase2 under the per-show advisory lock with 24h undo token, SHOW_FIRST_PUBLISHED emission, and Realtime broadcast invalidation; POST /api/show/[slug]/unpublish route handles success/expired/consumed/not-found branches with idempotent re-attempt + link revocation + SHOW_UNPUBLISHED emission. Onboarding-scan ONBOARDING_SCAN_REVIEW preserved per the exception. Meta-test registries (Supabase call-boundary, advisory-lock single-holder, admin_alert catalog) extended.

### M2-D6 — App-side advisory-lock helper shape deferred to consumer milestones

**Status:** **Resolved at SHA `dc68471` (M5 Pin-2 extension #2 — `feat(auth): add show advisory lock helper`)**. A Git commit cannot contain its own final SHA without changing that SHA, so this row was authored in the same commit that ships `lib/db/advisoryLock.ts` with a reference-by-name; the SHA is backfilled here in a follow-up orchestrator commit.

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Plan-wide invariant §1.2 mandates per-show advisory locks on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`, with tests asserting the lock is held. M2 ships the schema that supports this; the actual helper and the lock-held tests live with the code paths that hold the lock (M5 auth, M6 sync).
**Resolution:** Added `lib/db/advisoryLock.ts` with `withShowAdvisoryLock(showId, mode, fn)` where `mode ∈ { 'try' | 'block' }`. The lock key is derived from `hashtext('show:' || shows.drive_file_id)` per spec §1.2, and `tests/db/advisory-lock.test.ts` asserts a competing transaction cannot acquire the same advisory key while the callback runs.
