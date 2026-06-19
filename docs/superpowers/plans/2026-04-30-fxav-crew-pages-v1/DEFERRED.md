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

### M12.2-A-DEF-1 — rotate/reset RPC server-side mutation gate (finalize-owned / archived)

**Status:** Deferred 2026-05-31 from M12.2 Phase A; orchestrator-ratified (spec §16 DEF-1, R29/R30 finding 1).
**Source:** M12.2 Phase A spec `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-31-m12.2-phase-a-admin-dashboard-per-show-design.md` §16; plan Task 13.
**Description:** `rotate_show_share_token` + `reset_picker_epoch_atomic` only check admin-role + show-exists; they do NOT reject finalize-owned / `published=false` / `archived` rows (unlike the re-sync path's `FINALIZE_OWNED_SHOW` gate at `runManualSyncForShow.ts:231-303`). A stale-UI or direct-action call could mutate `show_share_tokens` / `shows.picker_epoch` mid-finalize or on a retired show.
**Why deferred (pre-existing, NOT a Phase-A regression):** these RPCs never gated finalize-owned rows; the per-show page was always slug-reachable. Phase A only changes UI visibility and, via §6, *reduces* exposure. Hardening the mutation boundary is DB/RPC work that requires Phase B's migration layer; pulling it into Phase A would violate the §11 no-DB-writes/no-migrations invariant.
**Phase-A interim mitigation (shipped):** rotate + reset are hidden in the UI unless `published && !archived` (per-show page §6 gating, branch `m12.2-phase-a-admin-redesign`); `RotateShareTokenButton` also takes `isCrewLinkActive` so an inactive context never surfaces a crew URL.
**Suggested home:** Concrete trigger: **Phase B's settings/archive work** (which already touches these share/picker surfaces + the migration layer). Phase-B action: re-read the show inside the locked txn and reject unless `published && !archived` (return `FINALIZE_OWNED_SHOW` or an archived-specific code); add stale-UI / direct-action tests on publishing + archived rows. Phase B (the M12.2 umbrella's second plan — nav + settings) is unscheduled; needs planning before pickup.

### M12.2-A-DEF-2 — archived apply/discard semantics + server-side guard

**Status:** Deferred 2026-05-31 from M12.2 Phase A; orchestrator-ratified (spec §16 DEF-2, R30 finding 2).
**Source:** M12.2 Phase A spec §16; plan Task 13.
**Description:** The apply/discard path (`lib/sync/applyStaged.ts` / `discardStaged.ts`) does not define or guard what applying staged data to an `archived` (retired) show means. The per-show page loads by slug regardless of archived state (the inbox routes archived existing shows there so their staged work isn't hidden), so the mutation path is reachable.
**Why deferred (pre-existing, NOT a Phase-A regression):** the apply/discard path already lacks this guard today; the page was always slug-reachable. Defining archived mutation semantics requires Phase B's archive/unarchive lifecycle model, and the server-side guard is DB/RPC work outside Phase A's UI-only charter (§11).
**Phase-A interim mitigation (shipped):** an archived show's staged change is surfaced + routed (R10 — work isn't hidden) but rendered **READ-ONLY** on the per-show page — apply/discard controls suppressed via `ParsePanel readOnly` → `StagedReviewCard readOnly` (branch `m12.2-phase-a-admin-redesign`). This removes the *invitation* into the undefined archived mutation path; a direct route/RPC call could still attempt it — that pre-existing server gap is what this item closes.
**Suggested home:** Concrete trigger: **Phase B's archive/unarchive model** (which defines the archived lifecycle). Phase-B action: decide read-only vs guarded mutation for archived staged changes, add server-side archived guards + direct route/RPC tests + `pending_sync` consumption expectations. Phase B is unscheduled; needs planning before pickup.

### M12.2-A-DEF-3 — manual re-sync server-side archived guard

**Status:** Deferred 2026-05-31 from M12.2 Phase A close-out (Codex impl-diff review [high], branch `m12.2-phase-a-admin-redesign`).
**Description:** The manual re-sync path (`POST /api/admin/sync/[slug]` → `lib/sync/runManualSyncForShow.ts`) gates only on **finalize-ownership** (`readFinalizeOwnershipGuard_unlocked`, line 98-132 — checks onboarding-wizard / pending-changes finalize checkpoints; `FINALIZE_OWNED_SHOW`). It does **NOT** reject `archived` rows. Because the NeedsAttentionInbox routes archived `existing_staged` shows into `/admin/show/[slug]` (per DEF-2, so retired work isn't hidden), a stale-UI or direct POST could re-sync a retired show — mutating `shows` / `pending_syncs` / sync status+history despite the page being the archived read-only surface. Sibling of DEF-1 (rotate/reset) and DEF-2 (apply/discard) — same "archived mutation reachable server-side" class, different path.
**Why deferred (pre-existing, NOT a Phase-A regression):** the re-sync path already lacked an archived guard before M12.2; archived mutation semantics require Phase B's archive/unarchive lifecycle model, and the server-side guard is DB/RPC work outside Phase A's UI-only charter (§11).
**Phase-A interim mitigation (shipped):** the per-show page suppresses the `ReSyncButton` for archived shows (renders `admin-show-resync-archived` "Re-sync is paused while this show is archived." in place of the CTA), matching the ParsePanel `readOnly={archived}` + share/rotate/preview `!archived` gating. This removes the UI invitation; a direct route call could still attempt it — that pre-existing server gap is what this item closes. Regression: `tests/app/admin/perShowPage.test.tsx` ("archived show: Re-sync CTA suppressed + read-only note shown").
**Suggested home:** Concrete trigger: **Phase B's archive/unarchive model** (alongside DEF-1/DEF-2). Phase-B action: re-read the show inside the locked txn and reject `archived` (return an archived-specific catalog code) before any mutation; add stale-UI / direct-POST tests on archived rows. Phase B is unscheduled; needs planning before pickup.

### M11.5-PLAYWRIGHT-HELPERS — Picker-shaped e2e helper layer

**Status:** Deferred 2026-05-25 from M11.5 close-out; scope refined 2026-05-27 from M12 Phase 0.A Block 2.3 escalation (handoff `7c58315`).
**Source:** §B continuation report (Opus, `ed1a3ab`); Block 2.3 scoping pass (Opus, `46b6512` + `7c58315`).
**Description:** `tests/e2e/picker-flow.spec.ts` currently ships 1 active scenario (slug-only-404) and 5 .skip scenarios that need a picker-shaped e2e helper layer. Block 2.3 scoping pass discovered the real work is **3 new helpers + 5 test bodies + local-Supabase debugging**, not just "enable 4 .skip scenarios" as the M11.5 close-out had estimated:
- **3 new helpers** — `seedShowWithCrew` (DB-side fixture: show + roster + claim_stamps), `seedPickerCookie` (HTTP-side fixture: signed `__Host-fxav_picker` cookie with byte-identical envelope shape), `claimStamp` (mutate `crew_member_auth.claimed_via_oauth_at` for the staleness-ladder paths).
- **5 test bodies** — the 5 .skip scenarios at `tests/e2e/picker-flow.spec.ts` (was "4" pre-Block-2.3; one additional was discovered during scoping). Each body wires the helpers above to exercise picker UX end-to-end: cookie-only / cookie+session-fresh / cookie+session-stale / cookie+session-mismatch / re-bootstrap-mint.
- **Local-Supabase debugging surface** — `seedShowWithCrew` requires test-isolation against a real Supabase instance; integration with the existing `supabase/seed.sql` + per-test cleanup non-trivial. Implementer flagged this is the primary cost driver.
**Why deferred:** Block 2 escalation: Block 2 dispatch was originally sized as "4 .skip scenarios"; the real shape is significantly larger and deserves a standalone sized dispatch rather than getting absorbed into Block 2's M11.5-carryovers scope. Implementer recommended dispatch with TDD discipline on each helper.
**Suggested home:** Concrete trigger: **before Phase 1 J3 ("Share-link + picker crew end-to-end") at `06-phase1-matrix-walk.md:161`**. Task 1.6 J3 is the downstream consumer — these helpers are not pure tech-debt, they are Phase 1 J3 infrastructure. Earliest start: after Phase 0.B closes (Phase 0.B is independent — `validation_state` migration + master-spec amendments). Dispatch as standalone sized brief with implementer's revised scope (3+5+debug).

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

**M12.1 cross-reference (2026-05-27).** M12.1 sub-amendment added an 8th audit check `x6-pg-cron-pivot` (M12.1 pg_cron pivot defenses: no-vercel-cron + pg-cron-pivot-doc-guard + m12-plan-pg-cron-pivot-amendment). The master spec AC-X.6 paragraph + the `BRANCH_PROTECTION_DRIFT` catalog row + §17.2.1 resolution prose were amended in T5 to include the 8th check name. Both `verify-branch-protection` + `verify-branch-protection-status` workflow jobs remain `if: false` (X6-D-1 dormancy preserved); the 8 audit checks now ALL run on PR + push but none block merges. The amendment is **prep work** so that when X6-D-1 reopens, the re-PUT of branch protection naturally reads the current spec inventory via `loadRequiredChecksFromSpec()` and includes `x6-pg-cron-pivot` — without M12.1's amendment the reopener would have re-PUT with the stale 7-check set. **When X6-D-1 reopens**, the re-PUT step must include `x6-pg-cron-pivot` in the required-checks list (the AC-X.6 inventory + the BRANCH_PROTECTION_DRIFT resolution prose are now correct; verify via `pnpm test:audit:x6-pg-cron-pivot` assertion P which dynamic-imports `loadRequiredChecksFromSpec` and asserts the 8th name is present).

**Trigger to resume.** Pick this back up if/when ANY of these become true:
1. A second developer or admin gains write access to `edweiss412/FX-Webpage-Template`.
2. FXAV crew-pages is forked / moved to a team org.
3. The user explicitly wants drift detection on their solo configuration for audit / compliance reasons.

**Concrete work to land at that point:**
- R4 Codex repair: env-gated `BRANCH_PROTECTION_VARIANT` (solo|team, default team) in `scripts/verify-branch-protection.ts` + tests for both variants + spec §17.2.1 amendment + plan Task X.6 Step 3c amendment + workflow YAML reads variant from gh vars.
- Re-PUT branch protection with the 8 required checks (M12.1 added gate #8 `x6-pg-cron-pivot` — see M12.1 cross-reference above) + the appropriate variant.
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

### M2-D5 — Seed's hardcoded restage fixture filename — **RESOLVED 2026-06-10**

**Status:** **Resolved** in the 2026-06-10 deferred-residue sweep (commit `a5c42cba`). The entry's concern was "if that fixture is renamed or replaced, seed silently breaks" — the seed kept running but the restage scenario silently seeded as `complete`. A glob-derived pick was rejected (any deterministic selection rule changes WHICH fixture gets the restage treatment as fixtures are added — unstable across fixture additions). Landed the loud-failure form instead: `loadFixtures()` throws when `restageRequiredFixture` is absent from `fixtures/shows/raw/`, and `tests/db/seed-restage-fixture.test.ts` pins the contract DB-free (named fixture exists on disk + the throw guard stays in `loadFixtures`), so a rename trips CI before it can degrade the seeded DB.

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

### M11.5-IMP-3 — /me consumes extended TerminalFailure (deduplication) — **RESOLVED 2026-05-27**

**Status:** Resolved 2026-05-27 — refactor landed at SHA `93684b1` (M12 Phase 0.A Block 2.1).
**Source:** External impeccable audit, M11.5 §B close-out.
**Description:** `app/me/page.tsx:105-126` rendered its own inline terminal-failure block; refactor swapped both render branches (mid-chain failure + post-chain `listShowsForCrew` failure) to use the `<TerminalFailure>` component with appropriate `code` / `title` / `retryHref` props per call site.
**Resolution:** External impeccable v3 critique + audit attestations APPROVED (zero HIGH/CRITICAL findings). Tests pass; manual verification at validation env.

### M11.5-IMP-4 — DESIGN.md §1.2 contrast amendments for picker color pairs — **RESOLVED 2026-05-26**

**Status:** Resolved 2026-05-26 — folded into M12 amendment scope at SHA `77687d8` (M12 amendment Commit 10). Execution lands in Phase 0.A.3 of the M12 plan (`01-phase0-infra.md` Task 0.A.3) when M12 enters its execution phase.
**Source:** External impeccable audit, M11.5 §B close-out.
**Description:** DESIGN.md §1.2 "Contrast summary" doesn't list two color pairs the picker uses: `text-text on bg-stale-tint` (the picker banner row) and `text-text-subtle on bg-surface-sunken` (claimed-row treatment). Both pairs almost certainly hit AA body floor on the chosen tints but the table doesn't pre-compute them.
**Why deferred:** Small mechanical doc update (compute the two ratios, add two rows to the table). Out of §B scope; lands cleanly alongside any DESIGN.md edit.
**Suggested home:** M12 amendment scope (resolved 2026-05-26).

### M11.5-IMP-5 — Admin Reset/Rotate destructive-action UX polish set — **PARTIALLY RESOLVED 2026-05-27**

**Status:** Items 4 + 5 resolved 2026-05-27 (SHA `65bb627`, M12 Phase 0.A Block 2.2); items 1, 2, 3 remain open with Phase 1 walk trigger.
**Source:** External impeccable critique + audit, M11.5 §B close-out.

**Resolved items (landed at `65bb627`, impeccable v3 APPROVED):**
4. ✅ `aria-describedby` link from destructive Confirm button to its warning paragraph (A6).
5. ✅ Confirm-row layout primitive consistency — Reset + Rotate now share the same layout primitive (A5).

**Open items (Phase 1 walk trigger):**
1. The simplified "Crew" section + "Preview as a crew member" list are adjacent rosters with similar content. Consider folding the simplified roster into "Share & access" as context (C3).
2. Two confirm rows (Reset + Rotate) can be open simultaneously — visually noisy, not destructive (C6).
3. 2s Copy-button success-state duration is borderline short for venue-floor phone glance-back (A3).

**Why open items deferred:** Per M12 Phase 0.A Block 2 implementer escalation (handoff `7c58315`) — each of items 1-3 is a UX tuning decision that requires Doug's actual usage feedback to ground the trade-off. Local critique cannot resolve (e.g., 2s vs 5s copy timing depends on Doug's typical scroll cadence; whether to fold the simplified roster depends on which path Doug actually uses; simultaneous-confirm-row state machine UX depends on observed admin task patterns).
**Suggested home:** Concrete trigger: **observation during Phase 1 J1-J4 walks** at `06-phase1-matrix-walk.md` (specifically Task 1.4 J1 cold-start admin path, Task 1.5 J2 pending-sync triage, Task 1.7 J4 preview-as-crew). Once Doug walks the validation env and exposes actual usage patterns, dispatch sized fixes per item.

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

## M12.2-B2-DEF-1 — cron-apply requires_resync clearing real-DB assertion

**What:** A dedicated real-DB assertion that a CRON (non-manual) Phase-2 apply-success clears `shows.requires_resync` (the show-writer UPDATE in `runScheduledCronSync.ts` apply branches, ~`:984/:1009`).
**Why deferred:** The clearing is structurally present (both apply-success UPDATE branches set `requires_resync = false`, verified non-breaking across the full 4760-test suite) and the BEHAVIORAL contract ("a clean apply clears requires_resync") is already proven by the DEF-3 manual-clean test (`tests/sync/def3-manual-resync.test.ts`) — the manual catch-up routes through the same show-writer. The cron-specific end-to-end assertion needs a real-DB `runPhase2`/`applyShowSnapshot` harness that does not yet exist (current phase2 tests are mock-based; no real-DB apply harness in the repo).
**Concrete trigger / home:** Build it as part of the real-CI integration pass (Phase 10 real-CI) OR the next task that stands up a real-DB apply-pipeline harness; assert: seed an existing show with `requires_resync=true` → run a cron apply that reconciles it → `requires_resync=false`.

## M12.5-DEF-1 — self-revoke refusal at the RPC (DB) boundary, not only the Server Action

**What:** Enforce the "an admin can never revoke their own access" policy inside the `revoke_admin_email_rpc` SECURITY DEFINER function (DB boundary), so a direct PostgREST `rpc('revoke_admin_email_rpc', { p_email: <self> })` call is also refused — not only the Next Server Action path. Today the RPC returns `last_admin_lockout` for a self-revoke ONLY when the actor is the last active admin (`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql`, the `v_canonical = v_actor_canonical` block); a self-revoke with peers present still returns `ok`.

**Why deferred:** M12.5 removed the self-Revoke UI control (the actor's own row renders no Revoke button) AND added the Server-Action enforcement (`revokeAdminAction` refuses a self-targeted revoke against the authenticated actor's canonical email, `app/admin/settings/admins/actions.ts`; tests in `tests/admin/admins-actions.test.ts`). That closes the realistic mutation path (the UI form + any Server-Action caller). The residual — a forged direct PostgREST RPC call — is reachable ONLY by an authenticated **admin** (the RPC gates on `is_admin()`) targeting **their own** email: i.e. self-harm (loss of one's own admin access, recoverable by another admin re-adding them), not a privilege escalation or an attack on others. The clean DB fix is a new migration redefining `revoke_admin_email_rpc` to return a self-revoke-forbidden status unconditionally + a new `SELF_REVOKE_FORBIDDEN` §12.4 catalog code (three-lockstep prose/regen/catalog + x1-catalog-parity) + flipping the `tests/db/admin-emails.test.ts:~501` "self-revoke ALLOWED when other actives exist" contract — a backend/catalog change disproportionate to land inside a cosmetic-fidelity batch.

**Concrete trigger / home:** The next admin/auth backend milestone (or any milestone that already touches `revoke_admin_email_rpc` / the §12.4 admin-error catalog). Implement: RPC returns `self_revoke_forbidden` whenever `v_canonical = v_actor_canonical` (drop the peer-count condition); add the `SELF_REVOKE_FORBIDDEN` catalog code; map it through `lib/data/adminEmails.ts` + `revokeAdminAction` (accepting BOTH old `last_admin_lockout` and new status during the transitional apply window); flip the db-test contract to assert self-revoke is refused even with peers.

## ONBOARDING-FIXUPS-DEF-1 — Scan-vs-finalize session exclusion (pre-existing race)

**Found:** M-onboarding-fixups whole-milestone close-out review R2 (2026-06-12). **Pre-existing on main** (the `finalize-cas` sample-then-promote shape at `unresolvedManifestCount`/`approvedCount` predates this branch; `lib/sync/runOnboardingScan.ts` has zero diff in the milestone): a `runOnboardingScan` started before final-CAS can write `pending_syncs`/`onboarding_scan_manifest` rows for the same wizard session AFTER the unresolved check, leaving rows in a retired session while finalize returns `finalize_complete`. The scan's writes use a plain EXISTS currency check, not the `finalize:<session>` lock.

**Why deferred, not fixed here:** scan spans multiple transactions with long Drive I/O, so the fix is a session-level exclusion design (scan acquiring/honoring the finalize lock or a DB-visible `finalizing` state), not a one-line guard — it needs its own reviewed task. The milestone REDUCES the blast radius to self-healing debris: F4's stale-session reap sweeps retired-session orphan rows (incl. `final_cas_done` supersessions), and F5's `WIZARD_SESSION_SUPERSEDED_RACE` alert surfaces stale-tab actions. Single-operator admin usage bounds the race window today.

**Trigger:** MUST be resolved (fix or explicit accept-with-rationale) in the M13 launch-gate checklist, or sooner if any onboarding milestone reopens `runOnboardingScan`.

## ONBOARDING-FIXUPS-DEF-2 — Per-row discard/recovery affordance for corrupt-retained Phase D shadow rows

**Found:** External impeccable delta-critique of `8f5bf84d` (2026-06-12), HIGH: the corrupt-row catalog copy (`STAGED_PARSE_RESULT_CORRUPT` / `STAGED_REVIEW_ITEMS_CORRUPT`) promised "Discard this setup and start over," but where the per-row panels render that affordance is absent (`components/admin/ReadyToPublish.tsx:7-9` — no cleanup affordance on the fresh branch, per plan §M10 Task 10.1 finding 2) or 409-refused for up to 24h (`lib/onboarding/sessionLifecycle.ts` `session_too_fresh` gate). The copy was rewritten to the developer-escape register in the same fix; this entry tracks the real affordance.

**What:** A per-row discard/recovery affordance for corrupt-retained Phase D shadow rows — let Doug clear a single corrupt `pending_syncs` shadow row (or the blocking session) from the finalize-cas per-row panel instead of contacting the developer.

**Why deferred, not fixed here:** The corrupt-retained state is near-unreachable post-lockdown — migration `20260611000002_lockdown_wizard_staging_tables.sql` revoked the only forge path (direct PostgREST DML on the wizard staging tables), so a corrupt `parse_result` / `triggered_review_items` jsonb can no longer be planted by any supported write path. Recovery today is developer-side SQL, or "Discard this setup and start over" once the 24h freshness window lapses (`session_too_fresh` gate). Building a reachable per-row affordance is new UI + a new RPC surface, disproportionate to a copy-fidelity fixup.

**Noted, not fixed (MEDIUMs from the same critique):** (a) outdated rows (`STAGED_PARSE_OUTDATED_AT_PHASE_D`) self-heal on the next finalize click, but the per-row panel gives no "click publish again" hint; (b) the per-row panel uses the raw `drive_file_id` as the row identifier rather than a human-readable sheet/show name. Fold both into whatever milestone picks this entry up.

**Trigger:** M13 launch-gate checklist, or sooner if any milestone reopens the finalize-cas UI (`components/admin/RunFinalCASButton.tsx` / `components/admin/FinalizeButton.tsx` per-row panels).

## ONBOARDING-FIXUPS-DEF-3 — Reject-discarded shadows lack completion provenance for the legacy preflight

**Found:** WM-R8 fix follow-up (2026-06-12). A Phase D shadow resolved as `discarded_by_reviewer_choice` (MI-12 reject) writes no `sync_audit` row (ratified live reject contract), so on a published=false existing show it leaves no durable completion provenance. If a SIBLING shadow then blocks final-CAS, the retry's `ONBOARDING_LEGACY_ROW_AMBIGUOUS` preflight classifies the completed-by-reject row as legacy-ambiguous and 409s. **Recovery exists and is correct** (the cataloged copy: re-run setup → restage, or developer clears) — this is an availability annoyance on a narrow path (unpublished existing show + reject choice + partial batch + retry), not data loss; fail-closed is the safe direction. Proper fix needs a design decision: a durable per-row completion marker that doesn't violate the no-audit reject contract (e.g., manifest-row completion stamp written by Phase D for ALL terminal row outcomes).

**Trigger:** M13 launch-gate checklist, or any milestone reopening finalize-cas / the reject contract.

## AUDIT-2026-06-18-PARSE-FIDELITY — End-to-end parser/exporter fidelity findings (consolidated)

**Found:** Sheet-data grounding audit, 2026-06-18 (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/sheet-data-grounding-audit-2026-06-18.md`). The **end-to-end** layer ran the real production pipeline — Drive XLSX export → `synthesizeMarkdownFromXlsx` (`lib/drive/exportSheetToMarkdown.ts`) → `parseSheet` — against all 7 live `fxav-test-shows` workbooks (fixtures now committed at `fixtures/shows/exporter-xlsx/`). It surfaced a class of bugs invisible to the `fixtures/shows/raw/` (Drive-MCP) corpus: the parser silently loses or corrupts major sections on every show, with `warnings: []` / `raw_unrecognized: []` (fail-silent).

**What — disposition of each bug class:**

| Class | Severity | Disposition |
|---|---|---|
| `event_details` empty + `openingReel` null — exporter collapses 2-col DETAILS to label-only (4 shows: redefining/consultants/east-coast/ria) | CRITICAL | **SPEC DECISION → DEF-1 below** (intentional contract, contradicted by live data) |
| `pullSheet` null (RIA, header rewrite) / empty (East Coast, block-orphan) / **stale `OLD PULL SHEET`** wrong-show data (redefining) | CRITICAL | **SPEC DECISION (stale-tab) → DEF-2**; null/empty are clean-fix in branch |
| General Session room dropped (fintech/fixed-income/rpas); breakouts dropped (east-coast/redefining); phantom `Additional Room Name(s)` + FORM-harvest rooms | HIGH | **Clean-fix** (branch `worktree-parser-exporter-fidelity`) — `lib/parser/blocks/rooms.ts` |
| `transportation` → null on v4 shows (header shape `[label,value,PHONE,EMAIL,LICENSE]` unrecognized); `vehicle` dropped (ria/east-coast); `assigned_names` echoes stage label | HIGH | **Clean-fix** — `lib/parser/blocks/transport.ts` |
| Hotel `check_in`/`check_out` null or inverted; conf# dropped; address glued into `hotel_name`; raw `&#10;` | HIGH | **Clean-fix** — `lib/parser/blocks/hotels.ts` |
| East Coast `dates` all-null (trailing free-text qualifiers like `- AFTER 8PM` defeat the label classifier) | HIGH | **Clean-fix** — `lib/parser/blocks/dates.ts` |
| Phantom `DOCUMENTS` crew member (east-coast crew scanner over-reads into the DOCUMENTS section) | HIGH | **Clean-fix** — `lib/parser/blocks/crew.ts` boundary |
| `agenda_links=[]` on East Coast (label `AGENDA`, regex requires `AGENDA LINK`) | MEDIUM | **Clean-fix** — `lib/parser/index.ts:233` |
| Filename-only agenda links (2/7: redefining/ria) never resolve — no Drive fileId, so `AgendaEmbed` renders nothing | MEDIUM | Feature gap — Drive resolution of non-`/d/<id>` agenda entries is deferred per `parseAgendaLinks` docstring; leave as-is, track here |
| Fail-silent: dropped sections emit no warning / `raw_unrecognized` | MEDIUM | **Clean-fix** — emit warnings when a recognized section header yields no mapped fields |
| Embedded DIAGRAMS images unreachable via Sheets API | LOW | **Existing backlog** → `BL-DIAGRAMS-EMBEDDED-SOURCE`. The 2026-06-18 Drive probe **confirms its proposed fix**: the XLSX export carries the images as `xl/media/*` (2–7 per workbook, well under any cap — closes audit SP-040/042). |
| Watermark: `headRevisionId`/`md5` null on native Sheets → binding token falls back to `modifiedTime`; Drive monotonic `version` unused | LOW | Design note (no current correctness gap); candidate `version`-as-watermark hardening — track here |
| Reel/image byte-stability (SCH-29) | INFO | Inherently temporal (needs ≥2 captures over time) — still open; baseline captured |

**Why deferred (the SPEC-DECISION items only — clean-fix items land in this branch):** Per invariant #7 (spec is canonical; open a question rather than silently fixing). The two DEF items below are *intentional, contract-pinned* behaviors that the live data contradicts — changing them needs an owner decision, not a code patch.

**Trigger:** Clean-fix items: this branch (`worktree-parser-exporter-fidelity`), TDD against the new `fixtures/shows/exporter-xlsx/` fixtures. SPEC-DECISION items (DEF-1/DEF-2): owner decision, then a parser milestone. All remaining items: M13 launch-gate parser-fidelity review.

## AUDIT-2026-06-18-PARSE-FIDELITY-DEF-1 — v2 "DETAILS" block: exporter label-only collapse vs live col-B values — **RESOLVED 2026-06-18 (commit 5364c4c7)**

**Resolution:** The "investigate first" decision led to reading the live ORIGINAL Doug sheets via gsheets MCP. Asset-Mgmt (an original OUTSIDE the test folder) populates DETAILS col B (Stage Size, Opening Reel "YES - LOOP VIDEO", Polling, Power, …) — "label-only" was a Drive-MCP `read_file_content` rendering artifact, not the source. Removed the `normalizeBlock` DETAILS collapse so the value column survives; the (unchanged) parser now fills `event_details` on all 4 affected shows. Re-baselined the pinned exporter test; regenerated the v2 fixtures. Original analysis retained below.

**Found:** Same audit (end-to-end). On the 4 v2/v1 shows the parser returns `event_details: {}` and `openingReel: null`, dropping stage size, opening-reel mode, LED/scenic, podium, polling, internet, power — every show-level detail a crew member consults.

**What / why it's a spec decision, not a bug:** The collapse is **intentional and contract-pinned**. `lib/drive/exportSheetToMarkdown.ts:135-137` (`normalizeBlock`) maps any block whose first cell is `DETAILS` to label-only single-column rows; `lib/parser/blocks/event.ts` documents variant 2 ("v2 'DETAILS' block … values do not appear in this block; return empty record for these"); and `tests/drive/exportSheetToMarkdown.test.ts:120` pins it ("keeps the DETAILS checklist label-only to match the fixture parser contract"). The premise is that a v2 `DETAILS` header is a label-only checklist. **The live v2 sheets contradict it:** Redefining/Consultants/RIA all carry real values in INFO col B alongside the DETAILS labels (verified live, e.g. `INFO!B62 = "YES - LOOP VIDEO"`). So the contract is wrong for these sheets, but it was deliberately authored — flipping it requires deciding (a) whether all v2 `DETAILS` blocks should now preserve col B (and re-baselining the exporter test + the `event.ts` variant-2 empty-record path), or (b) whether these specific sheets are atypical and the label-only assumption holds for the production corpus. Note: only the **`EVENT DETAILS`** (v4) and **`DETAILS/Room Diagram`** (v1) headers currently parse values; the bare **`DETAILS`** header is the label-only case.

**Trigger:** Owner decision on the v2 `DETAILS` contract; then a parser milestone implements it TDD against `fixtures/shows/exporter-xlsx/{redefining-fi,consultants,ria}.md`. Do NOT unilaterally change the exporter/parser until decided.

## AUDIT-2026-06-18-PARSE-FIDELITY-DEF-2 — `OLD PULL SHEET` stale-tab ingestion (wrong-show gear) — **RESOLVED 2026-06-18 (commit e2594e89)**

**Resolution:** Owner chose "skip OLD tabs". The exporter now skips any tab whose name matches `/\bOLD\b/i` before processing, so Redefining `pullSheet` is `null` instead of RIA-Chicago's gear. Two existing exporter tests had borrowed an "OLD PULL SHEET" fixture name — repointed them to a non-archived "PULL SHEET" name (merge-expansion / title-band-collapse assertions intact) and added a skip test. Original analysis retained below.

**Found:** Same audit. Redefining FI's `pullSheet` parses 91 items from a tab named **`OLD PULL SHEET`** whose body is a *different, prior* show (caseLabel `RIA - CHICAGO, IL … Set: 4/15/24` — 13 months before this May-2025 show). The exporter's `normalizePullSheetGrid` (`exportSheetToMarkdown.ts:109`) and the parser both match `/PULL SHEET/i`, which catches `OLD PULL SHEET`, so a crew member would see a wrong show's gear list.

**What / why it's (partly) a spec decision:** Dropping/ignoring a tab because its name contains "OLD" is a heuristic with product judgment (what marks a tab stale?). The clean half — *not* attributing one show's gear to another — is real, but the disambiguation rule (tab-name denylist? freshest-tab-wins? require the case title to match the show?) needs an owner steer. Pairs with the RIA `pullSheet: null` and East-Coast `items: 0` defects (clean-fix in branch).

**Trigger:** Owner steer on stale-tab disambiguation; then implement with the pull-sheet detection fixes. Until then, the linked agenda PDF + GEAR remain the gear sources for affected shows.

## AUDIT-2026-06-18-PARSE-FIDELITY — status (branch `worktree-parser-exporter-fidelity`)

Empirically re-verified against `fixtures/shows/exporter-xlsx/` after each fix; full parser+invariants+drive suite green (804) throughout.

**Landed (TDD, regression-pinned):**
- DETAILS col-B preserved → `event_details` populated (DEF-1, `5364c4c7`).
- `OLD PULL SHEET` skipped → no wrong-show gear (DEF-2, `e2594e89`).
- Bare `AGENDA` agenda-link label captured (`ae6db66f`).
- Phantom `DOCUMENTS` crew member dropped via TECH block boundary (`e98e5f0a`).
- East Coast `dates` 3-col v1 routing (`571c0938`).

**Still open — need a focused, cross-version TDD pass (attempted during drive-through; deferred because each is format-specific AND entangled with heavily-pinned existing tests — forcing them produced incomplete/regressive changes):**
- **Rooms phantom "Additional Room Name(s)"** (6/7 shows): suppressing the contentless stub BREAKS the pre-existing `tests/parser/blocks/rooms.test.ts` "finds 1 additional room" contract, AND is incomplete — Consultants' stub carries leaked content because `extractBoBlock` over-reads into the following section. Fix the additional-room contract + the block-extraction over-read together.
- **Rooms GS dropped on v4** (fintech/fixed-income/rpas): their GS header is multi-line (`GENERAL SESSION\n<name>\n<dims>\n<floor>` → `&#10;`); `parseV4Rooms`'s `!col0.includes("&#10;")` guard rejects it → falls to the v2/v1 path which only reads `GS Setup`-prefixed rows, not v4's bare `Setup`. Removing the guard risks v2 regressions — needs cross-version TDD. (redefining: breakouts LASALLE A / WALTON also dropped — related header-shape gap.)
- **Hotels check_in/out null** on redefining + ria: `parseHotelTable` false-positive-matches the inline "Hotel Reservations" cell and returns first, pre-empting `parseInlineHotelRow` (whose `resolveDate` WOULD back-fill the yearless `5/11`). Fix is in the table-vs-inline routing, not the date logic. Also: rpas reservation #4 inverted check_in/out (multi-reservation grid col mis-map); east-coast "Hotel Stays" names parse to 1 (em-dash `–-` variants) instead of 3.
- **Transport NULL on v4** (fintech/fixed-income/rpas): `parseV4Transport` requires a `TRANSPORTATION/…`-prefixed merged header, but these shows label the block `Load In:` / `Load Out:` with a `[label,value,PHONE,EMAIL,LICENSE]` header → no path matches → null. Also east-coast `vehicle` empty (`Transportation | Van` header-value not read).
- **Fail-loud observability**: emit a warning / `raw_unrecognized` entry when a recognized section header yields zero mapped fields, so silent section drops surface.

Queued for a focused parser pass after the cross-model adversarial review of this branch.

## AUDIT-2026-06-18-PARSE-FIDELITY — round 2 outcome (branch worktree-parser-fidelity-rooms-hotels-transport)

Planned via a per-defect characterization workflow; executed TDD against `fixtures/shows/exporter-xlsx/`. Full parser+invariants+drive suite green (815) throughout.

**Landed (8 fixes, regression-pinned):**
- A1 hotels: yearless inline `Check In: M/D` back-fills the year (redefining/ria).
- A2 hotels: 5-col multi-reservation per-reservation check-out (fixes rpas res#4 inversion + fintech/rpas shared-checkout) + `check_out >= check_in` invariant.
- B1 transport: `assigned_names` skips the col0 stage label (redefining real crew).
- B2 transport: v1 vehicle read from the `| Transportation | Van |` row above Driver (east-coast).
- B3 transport: exporter v2 header (`TRANSPORTATION` in col1) routes to v2 (ria vehicle + no Vehicle-stage leak).
- B4 transport: v4 plain (exporter) header + body-row driver (fintech/fixed-income/rpas were null).
- C1 rooms: v4 General Session detected under the column-duplicated header + bare-label lookahead (fintech/fixed-income/rpas; also auto-suppresses their phantom additional room).
- C2 rooms: phantom `Additional Room Name(s)` suppressed via case-sensitive block-header match (v2 shows).

**Still deferred (attempted/assessed; each genuinely needs more than a clean edit):**
- **A3 — east-coast "Hotel Stays" guest-name split.** REVERTED: the cell `Four Seasons Fort Lauderdale Doug--- 103317 …` is token-shape-ambiguous — `"Lauderdale Doug"` (hotel-word + name) is indistinguishable from consultants' `"Doug Larson"` (name + name) by any regex, and the corpus mixes 1-word (east-coast) and 2-word (consultants) name conventions. Needs a name/place dictionary or a structured source. Names collapse to 1 + glued hotel_name on east-coast remains (one v1 show; low impact).
- ~~**C1b — redefining `&#10;`/no-digit v2 breakouts (LASALLE A, WALTON).**~~ **RESOLVED (AR R9/R10).** `parseBoRooms` now matches numberless `BREAKOUT` headers (case-SENSITIVE so it doesn't catch mixed-case `Breakout Room Setup…` field labels) and derives the name from the remaining header via `deriveBreakoutName` (drops the `BREAKOUT` word + `Dimensions Floor` suffix, flattens the in-cell newline). Numbered headers keep their `firstLine` name, so the raw-2025-04 pinned name is preserved. Numberless headers are content-gated (R10) so pull-sheet `BREAKOUT SESSION N - X` sections are rejected. redefining emits LASALLE A + WALTON ROOM with their real fields; regression in `tests/parser/exporterFixtures.test.ts`.
- ~~**Rooms DETAILS `Digital Signage` global-match leak (NEW, pre-existing).**~~ **RESOLVED (AR R14).** `parseGsRoom` now scopes the bare `Digital Signage` row to the GS block via `extractGsBlock` (the contiguous `GS <label>` rows + trailing bare-field rows up to the next room/section header). consultants' GS `digital_signage` is now correctly `null` (the ~300-char DETAILS sentence at line 288 no longer leaks); redefining `N/A`, ria/east-coast `NONE` (adjacent in-block rows) are preserved. Regression in `tests/parser/exporterFixtures.test.ts` (AR R14 describe).
- **D1 — fail-loud `SECTION_HEADER_NO_FIELDS` warning.** Adds a §12.4 catalog code (three-lockstep + x1-catalog-parity); separable observability, not a data-fidelity fix. Author as admin-log-only per the plan; owner to confirm severity + code name.

## AUDIT-2026-06-18-PARSE-FIDELITY — round 3 (audit residuals, branch worktree-parser-conf-entity-decode)

A whole-audit reconciliation (verified against `origin/main` + an empirical parse of all 7 exporter fixtures) found two audit items that the consolidated table had folded into "hotels clean-fix" but that neither shipped in round 1/2 nor were explicitly deferred. Both now **RESOLVED** (commit `faa5c61e`):

- ~~**#8 — raw `&#10;`/`&#9;` HTML entities surfaced to crew.**~~ **RESOLVED.** Was leaking into `transportation.parking` (consultants), `venue.loadingDock` (east-coast), `rooms[].setup` (fixed-income/redefining), table-path `hotelReservations[].names` (rpas), and `venue.address`. Added `decodeEntities` in `lib/parser/blocks/_helpers.ts`, applied inside `presence()` (the value-STORAGE boundary) — NOT `clean()`, because the `rooms.ts` v4-header guards key on `col0.includes("&#10;")` and the inline-hotel/pull-sheet/contacts parsers split on `&#10;` before storing. Net: **zero raw entities across all 7 shows**. Meta-regression in `tests/parser/exporterFixtures.test.ts` asserts no field surfaces a raw entity.
- **#4 sub-item — hotel confirmation numbers.** **PARTIALLY RESOLVED + remainder DEFERRED (AR R1, privacy).** Table path: `parseGuestCell` splits the `&#10;`-separated guest cell into clean names + lifts each `<dash> #?<digits>` conf#. Inline path: a separate conf# scan in `buildInlineHotel` (does not touch the AR-hardened name regexes). **Privacy gate (`reservationConf`):** a reservation row reaches EVERY listed guest (`getShowForViewer` filters reservations by name; `LodgingTile.tsx:131` renders the row-level `confirmation_no`), so a row-level conf# is stored ONLY for a **single-guest** reservation (reaches just that guest) — consultants' solo Eric `2035937`, fintech×3, rpas×3 single-guest rows. **Multi-guest reservations suppress the conf# (deferred):** showing one guest's number to the others would leak it, and the `HotelReservationRow` schema (`names: string[]` + one `confirmation_no`) can't carry a per-guest mapping. consultants-3 / redefining-3 / ria-2 / rpas-2 stay null. **Trigger for the deferred remainder:** a per-guest name→conf# schema (`names: {name, confirmation_no}[]`) through storage + `getShowForViewer` projection + `LodgingTile`, rendering only the viewer's entry. Regressions: single-guest extraction (table+inline) + a multi-guest privacy invariant (no `names.length > 1` row carries a conf#).
