# M12.12 — Affordance-matrix realignment (full reconciliation)

**Status:** Draft for adversarial review · owner-approved design 2026-06-11 (user review of written spec waived by owner; cross-model adversarial review still mandatory)
**Resolves:** `M11-G-D-6` cluster + `M11-G-D-1` (folded) — `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md`
**Amends:** §5.6 of `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` (lines 355–384) — amendment ratified by this spec per invariant 7
**Does NOT touch:** master spec §12.4 (no new error codes), crew-facing surfaces (negative row unchanged)

---

## 1. Problem

M11 ratified the §5.6 help-affordance matrix (`app/help/_affordanceMatrix.ts`) and its enforcement gate, the deep-link walker (`tests/e2e/deep-link-walker.spec.ts`). The M12.x admin redesigns then diverged from the contract in **both directions**, and no gate noticed because the `help-docs` Playwright project (`playwright.config.ts:154-168`) is not wired into any CI workflow.

**Direction 1 — orphaned matrix rows (6 of 13 concrete rows are broken at HEAD):**

| Row testid | Why broken | Live analog |
| --- | --- | --- |
| `help-affordance--dashboard-active-shows--tooltip` | Carrier `components/admin/ActiveShowsPanel.tsx:131-133` is no longer rendered anywhere (only its helper exports are imported) | ShowsTable header `<HoverHelp testId="shows-help">` (`components/admin/ShowsTable.tsx:236`) — non-matrix testid, no Learn-more link |
| `help-affordance--dashboard-pending-ingestion--tooltip` | Carrier `components/admin/PendingPanel.tsx` no longer rendered | Desktop: "Needs attention" header `<HoverHelp testId="needs-attention-help">` (`components/admin/Dashboard.tsx:512`), inside the desktop-only `hidden min-[720px]:flex` block (`Dashboard.tsx:502`). Mobile: `NeedsAttentionSummaryCard` → `/admin/needs-attention` page, which has **no help affordance at all** |
| `help-affordance--per-show-sync-health--tooltip` | The standalone Sync health section was replaced by the "quiet sync footer" (`app/admin/show/[slug]/page.tsx:616-618`, `data-testid="admin-show-sync-footer"`); no element carries the testid | The footer's `StatusIndicator` |
| `help-affordance--per-show-parse-warnings--tooltip` | The standalone Parse warnings section no longer exists; alerts now surface via `PerShowAlertSection` ("Alerts for this show") | The section's existing `<HelpTooltip testId="per-show-alert-help">` (`components/admin/PerShowAlertSection.tsx:156-168`) — non-matrix testid, no Learn-more link |
| `help-affordance--per-show-preview-links--tooltip` | The standalone Crew-preview-links section no longer exists; per-crew "Preview as" links render inside the Crew section (`app/admin/show/[slug]/page.tsx:442` header; links at ~`:507`) | The Crew section header |
| `help-affordance--dashboard-restage-badge--tooltip` | Never shipped (was M11-G-D-1, in the walker's `DEFERRED_TESTIDS`); the M12.2 redesign then moved the staged-changes signal into ShowsTable's `SyncCell` ("Changes to review", `lib/admin/syncStatus.ts:29-30`), which renders **inside the whole-row `<Link>`** (`components/admin/ShowsTable.tsx:334-338` desktop cell; mobile sub-line `:351-358`) where a `<button>`-based affordance cannot legally nest | Owner-selected placement: conditional footer legend under the table (§4.3) |

Note: the DEFERRED entry filed 2026-06-10 recorded only the two dashboard rows; the pre-draft citation pass for this spec found the three per-show rows are equally orphaned (M12.5/M12.7/M12.9 per-show redesign). The walker at HEAD fails **five** non-deferred rows.

**Direction 2 — unregistered live tooltips (7 `HoverHelp` instances violate the §5.6 class-sweep guarantee):** `shows-help` (`ShowsTable.tsx:236`), `needs-attention-help` (`Dashboard.tsx:512`), `archived-help` (`Dashboard.tsx:428`, renders only when `?bucket=archived` — `DashboardBucketSegmentedControl.tsx:8`), `admins-help` (`components/admin/settings/AdministratorsSection.tsx:88`), `drive-help` (`components/admin/settings/DriveConnectionPanel.tsx:133`), `drive-connection-health-help` (`DriveConnectionPanel.tsx:176`, custom badge trigger, renders only when Drive health is NOT healthy), `prefs-help` (`app/admin/settings/page.tsx:124`). None has a matrix row or a Learn-more link. (`per-show-alert-help`, a `HelpTooltip`, is the eighth unregistered affordance — it becomes the carrier for the re-pointed alerts row.)

**Direction 3 — no enforcement:** no CI workflow runs any Playwright project except the screenshots pair (`.github/workflows/screenshots-drift.yml` / `screenshots-regen.yml`). The divergence has been silent since M12.2 merged (2026-06-01).

## 2. Resolved decisions (owner, 2026-06-11)

1. **Scope: full matrix reconciliation.** Re-point all 6 broken rows AND register all unregistered tooltips with matrix rows + Learn-more links + help-content targets. M11-G-D-2 (per-show staged-review-card header tooltip) and M11-G-D-3 (preview-banner tooltip) stay deferred — their rows remain in `DEFERRED_TESTIDS` untouched.
2. **Two-viewport walker.** `ConcreteRow` gains `visibleAt: "mobile" | "desktop" | "both"`; the walker runs as mobile (390×844, existing) + desktop (1280×800) projects, asserting each row at its declared viewport(s). Desktop-only affordances are legal but must declare it.
3. **Restage affordance = conditional footer legend** (owner picked option C over sync-header "?" and title-popover extension): one line under the ShowsTable, rendered only when ≥1 *visible* row's sync bucket is `review`, containing a direct link — no popover.
4. **CI = path-filtered `pull_request` + `workflow_dispatch`.** Not every-PR, not nightly-only.
5. **Enforcement architecture = walker + fast structural meta-test** (option B over walker-only and codegen coupling): a unit-speed meta-test in the default suite catches call-site drift on every PR; the e2e walker catches rendering/visibility/href drift on path-matching PRs.

## 3. Matrix schema changes (`app/help/_affordanceMatrix.ts`)

- `ConcreteRow` gains a required `visibleAt: "mobile" | "desktop" | "both"` field.
- `affordance` values widen to admit `"legend link"` (a direct link rendered as a conditional legend line, not a popover).
- Rows are renamed where the old name describes dead UI (renames are part of the §5.6 amendment, §9 below). Old testids disappear from the codebase in the same commit that deletes their dead carriers.

### 3.1 Canonical row table (the single source of truth for this milestone)

Concrete rows after this milestone — **19** (was 13): 7 unchanged, 6 re-pointed/renamed, 6 new. Plus the template-family row and the crew negative row, both unchanged (21 total).

`sourceRoute` values use the existing matrix placeholder conventions (`rpas-central-2026`/`eric-weiss`/`STAGED_ID_PLACEHOLDER` are rewritten to seeded fixtures by `routeFor` — `deep-link-walker.spec.ts:202-216`). **`routeFor` performs ONLY placeholder substitution (R4 fix):** the per-testid wizard special case (`deep-link-walker.spec.ts:195-200`) is deleted — wizard steps 2/3 carry their `?step=N` query in `sourceRoute` itself (matching how the wizard actually deep-links, `components/admin/OnboardingWizard.tsx:62-65`, `:337-340`) — and a walker unit assertion pins that every non-placeholder `sourceRoute` passes through `routeFor` unchanged.

| # | testid (after) | `sourceRoute` | Host surface (after) | Target | `visibleAt` | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `help-affordance--dashboard-active-shows--tooltip` | `/admin` | ShowsTable header HoverHelp (`ShowsTable.tsx:236`) | `/help/admin/dashboard#active-shows` | `both` | Re-pointed |
| 2 | `help-affordance--dashboard-needs-attention--tooltip` | `/admin` | Dashboard desktop "Needs attention" header HoverHelp (`Dashboard.tsx:512`) | `/help/admin/review-queues#first-seen` | `desktop` | Renamed from `dashboard-pending-ingestion`, re-pointed |
| 3 | `help-affordance--needs-attention-page--tooltip` | `/admin/needs-attention` | NEW "?" HoverHelp in the page header via `AdminPageHeader` `titleAppendSlot` (`components/admin/nav/AdminPageHeader.tsx:20`; page header at `app/admin/needs-attention/page.tsx:34`) | `/help/admin/review-queues#first-seen` | `both` | New (mobile twin of #2) |
| 4 | `help-affordance--dashboard-restage--legend` | `/admin` | NEW conditional legend line under ShowsTable (§4.3) | `/help/admin/review-queues#re-stage` | `both` | Replaces `dashboard-restage-badge--tooltip`: the old row AND its `DEFERRED_TESTIDS` entry (`deep-link-walker.spec.ts:21`) are **removed**; the new legend row is live (never deferred) |
| 5 | `help-affordance--dashboard-archived-shows--tooltip` | `/admin?bucket=archived` | Archived-bucket header HoverHelp (`Dashboard.tsx:428`) | `/help/admin/dashboard#archived` (new anchor) | `both` | New (renders only at `?bucket=archived` — `DashboardBucketSegmentedControl.tsx:8`) |
| 6 | `help-affordance--dashboard-footer--tour` | `/admin` | `components/admin/DashboardFooter.tsx` (unchanged) | `/help/tour` | `both` | Unchanged |
| 7 | `help-affordance--per-show-sync-footer--tooltip` | `/admin/show/rpas-central-2026` | NEW "?" HoverHelp beside the StatusIndicator in the quiet sync footer (`app/admin/show/[slug]/page.tsx:616-621`) | `/help/admin/per-show-panel#sync-health` | `both` | Renamed from `per-show-sync-health`, re-pointed |
| 8 | `help-affordance--per-show-alerts--tooltip` | `/admin/show/rpas-central-2026` | PerShowAlertSection header HelpTooltip (`PerShowAlertSection.tsx:156`) | `/help/admin/parse-warnings` | `both` | Renamed from `per-show-parse-warnings`, re-pointed (renders only when the show has alerts — fixture, §6.3) |
| 9 | `help-affordance--per-show-crew--tooltip` | `/admin/show/rpas-central-2026` | NEW "?" HoverHelp on the per-show Crew section header (`app/admin/show/[slug]/page.tsx:442`) | `/help/admin/preview-as-crew` | `both` | Renamed from `per-show-preview-links`, re-pointed |
| 10 | `help-affordance--first-seen-review-card--tooltip` | `/admin/show/staged/STAGED_ID_PLACEHOLDER` | `components/admin/StagedReviewCard.tsx` (unchanged) | `/help/admin/review-queues#first-seen` | `both` | Unchanged |
| 11 | `help-affordance--settings-administrators--tooltip` | `/admin/settings` | `AdministratorsSection.tsx:88` HoverHelp | `/help/admin/settings#administrators` (new page) | `both` | New |
| 12 | `help-affordance--settings-drive-connection--tooltip` | `/admin/settings` | `DriveConnectionPanel.tsx:133` HoverHelp | `/help/admin/settings#drive-connection` (new page) | `both` | New |
| 13 | `help-affordance--settings-drive-health-badge--tooltip` | `/admin/settings` | `DriveConnectionPanel.tsx:176` HoverHelp (badge trigger) | `/help/admin/settings#drive-health` (new page) | `both` | New (renders only when Drive health ≠ healthy — fixture, §6.3) |
| 14 | `help-affordance--settings-preferences--tooltip` | `/admin/settings` | `app/admin/settings/page.tsx:124` HoverHelp | `/help/admin/settings#preferences` (new page) | `both` | New |
| 15 | `help-affordance--wizard-step1--tooltip` | `/admin` | `components/admin/wizard/Step1Share.tsx` (unchanged) | `/help/admin/onboarding-wizard#service-account` | `both` | `sourceRoute` unchanged |
| 16 | `help-affordance--wizard-step2--tooltip` | `/admin?step=2` | `components/admin/wizard/Step2Verify.tsx` (unchanged) | `/help/admin/onboarding-wizard#step-2` | `both` | `sourceRoute` gains `?step=2` (was a `routeFor` special case — R4 fix) |
| 17 | `help-affordance--wizard-step3--tooltip` | `/admin?step=3` | `components/admin/wizard/Step3Review.tsx` (unchanged) | `/help/admin/onboarding-wizard#step-3` | `both` | `sourceRoute` gains `?step=3` (was a `routeFor` special case — R4 fix) |
| 18 | `help-affordance--per-show-restage-card--tooltip` | `/admin/show/rpas-central-2026` | (not shipped) | `/help/admin/review-queues#re-stage` | `both` | Stays in `DEFERRED_TESTIDS` (M11-G-D-2) |
| 19 | `help-affordance--preview-banner--tooltip` | `/admin/show/rpas-central-2026/preview/eric-weiss` | (not shipped) | `/help/admin/preview-as-crew#impersonation-banner` | `both` | Stays in `DEFERRED_TESTIDS` (M11-G-D-3) |

`visibleAt` claims for rows whose hosts I could not gate-check from source (#5 archived header, #11–14 settings) are verified at plan time by rendering at both viewports; any that prove viewport-gated get their `visibleAt` corrected, not their UI changed (except where §4 explicitly adds UI).

## 4. UI changes

All UI work is Opus-owned (AGENTS.md routing hard rule) and gated by the external impeccable dual-gate (invariant 8).

### 4.1 `HoverHelp` API extension (`components/admin/HoverHelp.tsx`)

Two new optional props; all existing call sites compile unchanged:

- `rootTestId?: string` — placed on the root wrapper, which **becomes `<div className="relative inline-flex">`** (currently `<span>` — `HoverHelp.tsx:115-119`; a span root containing the now-`<div>` body would itself be invalid HTML, R6 fix). Matrix rows pass their exact matrix testid here; the existing `testId` prop keeps its `-trigger`/`-body` convention untouched.
- `learnMore?: { href: string }` — when present, the popover body renders a `Learn more →` link **after** the children.

**A11y consequence (do not relitigate at review without reading this):** the current body is `role="tooltip"` (`HoverHelp.tsx:144`) with `aria-describedby` from the trigger. A tooltip must not contain interactive content. When `learnMore` is present, the body switches to a **disclosure** pattern: `role="tooltip"` is dropped, the trigger gains `aria-controls={bodyId}` (it already has `aria-expanded`, `HoverHelp.tsx:107`), and `aria-describedby` is re-pointed to an inner **`<div>`** wrapping ONLY the children (so the description excludes the link text). A `<span>` wrapper is NOT valid here — existing call sites pass block `<p>` children (`ShowsTable.tsx:237-241`, `Dashboard.tsx:429-432`, etc.), and `<span><p>` is invalid HTML that risks browser reparsing/hydration mismatches; for the same reason the popover body element itself (currently `<span role="tooltip">` — `HoverHelp.tsx:142-150`, already span-wrapping `<p>` children at HEAD) becomes a `<div>` in the same change. Keyboard reachability of the link: the body element when closed is `visibility:hidden` (`invisible` class, `HoverHelp.tsx:149`), which removes the link from the tab order; when open, Tab from the trigger reaches the link as the next focusable in DOM order. When `learnMore` is absent, nothing changes for existing call sites.

### 4.2 Per-surface wiring

- **ShowsTable header** (`ShowsTable.tsx:236`): existing HoverHelp gains `rootTestId` (row 1) + `learnMore`.
- **Dashboard needs-attention header** (`Dashboard.tsx:512`): gains `rootTestId` (row 2) + `learnMore`. Stays desktop-only.
- **`/admin/needs-attention` page**: `AdminPageHeader` call (`page.tsx:34`) gains a `titleAppendSlot` HoverHelp (row 3) with body copy explaining the queue + `learnMore`.
- **Archived header** (`Dashboard.tsx:428`), **settings ×4** (`AdministratorsSection.tsx:88`, `DriveConnectionPanel.tsx:133`, `:176`, `settings/page.tsx:124`): each gains `rootTestId` + `learnMore` per the row table.
- **Per-show quiet sync footer** (`page.tsx:616-621`): a new compact "?" HoverHelp after the `StatusIndicator`, outside any link (row 7). Body explains what the sync status means for this show.
- **Per-show Crew header** (`page.tsx:442`): a new "?" HoverHelp (row 9). Body explains crew rows + the per-crew "Preview as" links.
- **PerShowAlertSection** (`PerShowAlertSection.tsx:156`): the existing `HelpTooltip` (`<details>`-based — `components/admin/HelpTooltip.tsx:8`) gains the matrix testid on its root and a `Learn more →` link inside the disclosure body (row 8). `HelpTooltip` gets the analogous `rootTestId`/`learnMore` props if it lacks them.

### 4.3 The restage legend (owner pick C)

A one-line legend renders under the ShowsTable list container, **only when ≥1 currently-visible row** (post-Find-filter, post-cap, active bucket only) has `syncStatusBucket(...).bucket === "review"`:

> ⚠ **Changes to review** means a sheet edit is staged and waiting for your approval. [What the sync statuses mean →](/help/admin/review-queues#re-stage)

- The link carries `data-testid="help-affordance--dashboard-restage--legend"` and is a plain `<a>`/`<Link>` (walker's direct-href arm — `deep-link-walker.spec.ts:219-223` — handles it; no popover).
- **Mode boundary:** ShowsTable active bucket only. The archived bucket renders `ArchivedShowRow`s and never shows the legend.
- **Guard conditions:** zero rows → no legend; rows visible but none `review` → no legend; Find filter hides all `review` rows → no legend (the condition reads the same `visible` array the rows render from, NOT the unfiltered input — anti-tautology: the test asserts against the filtered source).
- **Cap interaction:** the legend condition reads only the rendered (capped) rows, consistent with M12.10's capped-list-honesty precedent (the overflow notice already discloses that Find/sort scope to shown rows).
- **Transition inventory:** legend appears/disappears instantly (no animation) on: Find-filter change, bucket switch, data refresh. Compound case (bucket switch while Find non-empty): legend state recomputes from the new bucket's visible set; still instant. HoverHelp popover open/close transitions (`duration-fast` opacity) are unchanged. No other visual-state pairs introduced.

## 5. Help content

- **New page `/help/admin/settings/page.mdx`** with `<h2 id>` sections: `#administrators`, `#drive-connection`, `#drive-health`, `#preferences`. Registered in `app/help/_nav.ts` (`NAV`, `admin-surface` group) — the existing nav-consistency meta-test (M11 Phase A.7) pins page↔nav parity. Prose follows the existing help voice (plain language, Doug-facing, no raw error codes — invariant 5).
- **New `#archived` section** on `app/help/admin/dashboard/page.mdx`.
- **Stale-prose touch-ups, scoped:** only sections this matrix targets get rewritten to name the live UI — `#active-shows` (`page.mdx:10` — currently "The Active shows panel") and `#pending-ingestion` (`page.mdx:31` — currently "The Sheets-we-couldn't-auto-apply panel"; retitled for the needs-attention model; the anchor id `#pending-ingestion` is KEPT — it is not a matrix target after this milestone, but renaming anchors breaks nothing-gained external links). The full help-content freshness audit remains with the M12 UX-validation walk (out of scope, §11).
- Anchors verified live: `review-queues#first-seen` (`page.mdx:25`), `review-queues#re-stage` (`page.mdx:42`), `per-show-panel#sync-health` (`page.mdx:13`), `preview-as-crew` (page), `dashboard#active-shows` (`page.mdx:10`).

## 6. Walker changes (`tests/e2e/deep-link-walker.spec.ts`)

### 6.1 Two viewports

`playwright.config.ts`: the `help-docs` project (390×844, `playwright.config.ts:154-168`) is joined by `help-docs-desktop` (1280×800, same `dependencies: ["help-docs-setup"]`, same baseURL/locale/timezone). **Registration is unconditional (R7 fix):** the spec file registers a test for EVERY non-deferred concrete row in both projects (one shared array — no module-level viewport filter, no env var, which would silently drop rows when unset); viewport filtering happens at runtime via `test.skip` keyed on `test.info().project.name` against the row's `visibleAt`. A desktop-only row therefore shows as `skipped` on mobile and `passed`/`failed` on desktop — never absent.

### 6.2 `assertTarget` HoverHelp arm

Current arms: direct-href (`:219-223`) and `<details>`/summary (`:226-229`) before the nested-link assertion (`:231-236`). New arm between them: if the row root contains `button[aria-expanded]` (the HoverHelp trigger), click it, then run the existing nested-link assertion (the popover body is inside the root span, so `root.locator("a")` resolves; the link is visible once open).

### 6.3 Fixture seeding (extends `prepareAdminState` / dedicated helpers)

- **Advisory-lock posture (R2 fix — invariant 2 applies to fixtures):** `shows` is a locked table; any fixture write to it must hold `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`. The compliant design: the show-state fixtures (`pending_review`, archived) are seeded by a **walker-only seed extension** — a function exported from the seed module that reuses `seedSql`'s locked-transaction pattern (`begin; select pg_advisory_xact_lock(hashtext('show:' || <drive_file_id>)); …` — `supabase/seed.ts:517-523`), invoked by `help-docs-setup` AFTER its existing `pnpm db:seed` step (`help-docs-setup.ts:16-19`). The lock is held at exactly one layer (that transaction — single-holder rule; no new holder is introduced). **Why an extension and not base `db:seed` (R3 interaction):** the screenshot captures seed from the same base `db:seed`; putting a `pending_review` show into the base seed would add a visible row + the §4.3 legend to the `dashboard-overview` capture and silently churn its baseline. The extension keeps capture DB state byte-identical. Its fixture rows use the seed-prefix naming convention (`seedDrivePrefix = "seed-fixture:"` — `supabase/seed.ts:16`) so any subsequent `pnpm db:seed` (which every capture setup runs first) clears them — no cross-contamination on a shared local stack. **Cleanup lock (R6 CRITICAL fix):** `seed.ts`'s cleanup deletes `shows` by wildcard prefix (`seed.ts:530-537`) while its lock acquisition covers only the enumerated base fixture ids (`:517-523`) — once walker rows exist, that wildcard delete would mutate `shows` rows whose locks it does not hold. The base `seedSql` therefore gains, BEFORE its wildcard deletes and in the same transaction, a prefix-wide lock sweep: `select pg_advisory_xact_lock(hashtext('show:' || drive_file_id)) from public.shows where drive_file_id like 'seed-fixture:%' order by drive_file_id;` — locking every row the wildcard can touch (base + walker + any future prefix-named fixture), still single-holder (one transaction). **Lock ordering is deterministic everywhere (R7 CRITICAL):** the sweep carries `order by drive_file_id`, and the walker extension acquires its per-id locks in the same `drive_file_id`-sorted order before any delete/insert — two transactions taking overlapping lock sets in different orders is the textbook advisory-lock deadlock (concurrent `db:seed` cleanup vs extension re-run). Per-test direct service-role writes remain ONLY for tables outside the invariant-2 locked list (`app_settings`, `admin_alerts`) — precedent: `admin-banner.spec.ts:355-357` explicitly avoids mutating `shows` for the same reason. **The walker becomes read-only on every locked table (R10 CRITICAL):** the existing `firstSeenStagedId` fixture delete/inserts `pending_syncs` — an invariant-2 locked table — through the PostgREST admin client with no advisory lock (`deep-link-walker.spec.ts:136-168`, a pre-existing latent violation this milestone's walker rework inherits). PostgREST cannot hold a multi-statement `pg_advisory_xact_lock` transaction, so that fixture MOVES into the locked seed extension (lock `'show:' || 'g5-first-seen-fixture'` in the same sorted-order transaction, then delete+insert with the existing fixed staged UUID); the walker's `firstSeenStagedId` becomes a pure lookup that loud-throws when absent. A structural pin asserts the walker spec + its helpers contain NO `.insert(`/`.update(`/`.delete(` builder call on any invariant-2 locked table (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`) — per-test mutations stay legal only for non-locked tables.
- **Row 4 (legend):** seed (via `seed.ts`) one show with `last_sync_status = 'pending_review'` (maps to bucket `review` — `lib/admin/syncStatus.ts:29-30`).
- **Row 8 (alerts):** seed one unresolved `admin_alerts` row for the fixture show so PerShowAlertSection renders its header (not a locked table; direct write or seed — plan decides).
- **Row 13 (drive-health badge):** drive health derives from `shows.last_sync_status` over active shows (`lib/admin/driveConnectionHealth.ts:163-187`) — so the non-healthy state is one more show seeded by the SAME walker-only locked extension, with `last_sync_status = 'drive_error'`. (Corrected from an earlier draft that guessed `app_settings`-adjacent: this IS a locked-table write.)
- **Row 5 (archived):** `routeFor` returns `/admin?bucket=archived`; seed (via `seed.ts`) ≥1 archived show.
- All per-test seeding follows the existing loud-failure pattern (`deep-link-walker.spec.ts:53-99`: destructure `{ error }`, throw with message — invariant 9).
- **`prepareAdminState` keys on parsed pathname, not exact string (R4 fix):** the current branch `if (row.sourceRoute === "/admin")` (`deep-link-walker.spec.ts:96-98`) would skip `/admin?bucket=archived` and `/admin?step=N`, leaving the dashboard in whatever state the previous row (or `help-docs-setup`'s wizard-active default, `pending_wizard_session_id` non-null) left it — making row 5's archived header unreachable behind the wizard. The rewrite parses `sourceRoute` with `new URL(..., BASE_URL)` and selects wizard-state prep for wizard rows vs dashboard-state prep for every other `pathname === "/admin"` row, query string notwithstanding. A dedicated walker unit test pins the row-5 prep path (wizard state set → prepare → dashboard renderable at `?bucket=archived`).
- The walker keeps its matrix-shape sanity test (`:239-244`).

## 7. Structural meta-test (new, default unit suite)

`tests/help/_metaAffordanceMatrixParity.test.ts` (DB-free, no rendering — static source analysis, registry style per the recurring-bug ladder).

**Scan domain (precise, R1 fix):** the *component domain* is `components/**` + `app/**` MINUS `app/help/_affordanceMatrix.ts` (the source of truth — its literals are row definitions, not call sites) and MINUS any `*.test.*`/`__generated__` files. Matrix-side facts are read by **importing `AFFORDANCE_MATRIX`**, never by grepping the matrix file.

1. **Call-site sweep:** walk the component domain for every `<HoverHelp` / `<HelpTooltip` call site and every `help-affordance--` string literal. Each must either (a) reference a non-deferred concrete matrix testid (via `rootTestId`/literal), or (b) carry an inline `// not-a-help-affordance: <reason>` exemption comment. To keep this statically resolvable, `rootTestId` values at call sites MUST be inline string literals (no variables, no imports, no template interpolation); a call site whose `rootTestId` the sweep cannot resolve to a literal is itself a failure.
2. **Inverse sweep:** every non-deferred concrete row's testid (from the imported matrix) occurs in **exactly one** file in the component domain.
3. **Deferred-set consistency:** `DEFERRED_TESTIDS` **moves into `app/help/_affordanceMatrix.ts`** (R5 fix — deferred status is matrix metadata; the module is runner-neutral, already excluded from the scan domain, and already imported by the walker). It must NOT live in or be re-exported from any `*.spec.ts` — `deep-link-walker.spec.ts` imports `@playwright/test` and registers tests at module top level (`:1`, `:246-258`), so a Vitest import of it would execute Playwright registration inside the audit job. The walker imports the set instead of defining it (`deep-link-walker.spec.ts:17-30` is deleted); the meta-test imports ONLY the matrix module and asserts the set contains exactly the still-deferred rows' testids — after this milestone, exactly the two G-D-2/G-D-3 testids — each corresponding to a concrete matrix row, and no deferred testid appears anywhere in the component domain. Matrix row uniqueness (no duplicate testids across rows) is asserted on the imported array itself.

Failure messages name the file and the rule, so a violating PR fails in seconds with an actionable message rather than at the e2e walker. The meta-test is declared in the plan's meta-test inventory (writing-plans rule); it **extends** the §5.6 class-sweep guarantee from prose to CI.

**Relationship to existing tests (division of responsibility):** `tests/help/deep-link-walker-reverse.test.ts` already sweeps `app/`+`components/` for literal `data-testid="help-affordance--…"` attributes and maps them to matrix rows + target help files — it KEEPS that responsibility (extended for `rootTestId` literals), but it cannot catch the M12.x drift class: a `HoverHelp` with a non-matrix `testId` contains no `help-affordance--` literal, and a literal in never-rendered dead code still passes it. The new meta-test owns the call-site sweep, inverse uniqueness, and deferred-set rules. `tests/help/_affordance-matrix-shape.test.ts` keeps row-shape pinning and is extended for `visibleAt` and the `--legend` testid suffix (its `CONCRETE_TESTID_RE` at `:9` currently admits only `tooltip|tour|learn-more`).

## 8. Dead component deletion

- `components/admin/ActiveShowsPanel.tsx`: delete the `ActiveShowsPanel` component. Move `formatRelative`, `formatDateRange`, and the `ActiveShowRow` type to `lib/admin/format.ts` (new) — importers re-pointed: `ShowsTable.tsx:26`, `NeedsAttentionInbox.tsx:13-14`, `app/admin/show/[slug]/page.tsx:28`, `ChangeFeedTime.tsx:11`, `ArchivedShowRow.tsx:30`, `Dashboard.tsx:21`.
- `components/admin/PendingPanel.tsx`: delete the `PendingPanel` component; relocate its still-used type exports (`PendingIngestionRow`, `FirstSeenStagedRow` — consumers enumerated at plan time) alongside.
- Affected tests (enumerated by grep at plan time; currently 13 files reference the two components): component-level tests of dead bodies (e.g. `tests/components/admin/PendingPanel-awaiting-approval.test.tsx`, `DashboardPanels.test.tsx`) are deleted or migrated to live equivalents; pure-helper tests (`formatDateRange.test.ts`, `class-sweep-now-utility.test.ts`) re-point imports; `tests/help/_uiLabelExceptions.ts` and `forbidden-prose-registry.test.ts` entries are updated.

## 9. Spec §5.6 amendment + bookkeeping

- The §5.6 row table in `2026-05-12-user-facing-docs-design.md:361-378` is replaced by §3.1's table (with `visibleAt` column), with an amendment note crediting this spec and recording: the two-row needs-attention split, the five renames, the `--legend` affordance kind, and the two-viewport walker contract. The class-sweep guarantee paragraph (`:382`) gains: "enforced by `tests/help/_metaAffordanceMatrixParity.test.ts`".
- `DEFERRED.md` (user-facing-docs tree): M11-G-D-6 and M11-G-D-1 → RESOLVED with PR link; G-D-2/G-D-3 untouched (their `DEFERRED_TESTIDS` entries stay).

## 10. CI (`.github/workflows/help-affordances.yml`, new)

- **Triggers:** `pull_request` filtered to paths `components/admin/**`, `app/admin/**`, `app/help/**`, `lib/messages/**`, `lib/admin/**`, `tests/e2e/**`, `playwright.config.ts`, `scripts/ci/**` (the shared bootstrap — R2 fix), `supabase/migrations/**` (a new GUC-guarded migration must not silently break the boot path — same incident class as M12.3's stale regen hold-aside), `supabase/seed.ts` (the walker's show-state fixtures live there per §6.3), and the workflow itself; plus `workflow_dispatch`.
- **Job (R1 fix — vanilla `supabase start` does NOT work in this repo):** the boot must reuse the guarded-migration bootstrap that `screenshots-drift.yml:25-80` already encodes — two cron migrations (`20260527000003_schedule_cron_jobs.sql`, `20260602000005_b3_schedule_notify_cron.sql`) refuse to apply unless the `app.fxav_vercel_url` GUC is set, and a failed migration during `supabase start` aborts the stack; the working recipe is (1) hold the guarded migrations aside, (2) boot the stack, (3) `alter database` to set the placeholder GUC, (4) restore the migrations, (5) `supabase migration up --include-all`. This milestone **factors that bootstrap into a shared script** (e.g. `scripts/ci/supabase-local-bootstrap.sh`) consumed by BOTH `screenshots-drift.yml`/`screenshots-regen.yml` and the new workflow, so the hold-aside list can never drift between workflows again (the M12.3 stale-regen-hold-aside incident is the precedent). Then: `pnpm db:seed` runs via `help-docs-setup` (`tests/e2e/help-docs-setup.ts:16-19`), the :3004 server is built/started by Playwright's own `webServer` entry (`playwright.config.ts:276-286` — `pnpm build && next start --port 3004`), and the job runs `playwright test --project=help-docs --project=help-docs-desktop` with `ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture` (the values `help-docs-setup.ts:13-14` asserts) plus the Supabase env the seed/admin client needs.
- The unit meta-test (§7) gets a **dedicated `affordance-matrix-parity` job in `x-audits.yml`** running `pnpm vitest run tests/help/_metaAffordanceMatrixParity.test.ts` — mirroring the `postgrest-dml-lockdown` job pattern (`x-audits.yml:307-341`). `x-audits.yml` triggers on unfiltered `pull_request` + push-to-main + weekly cron + dispatch (`x-audits.yml:3-10`), which delivers the every-PR guarantee; there is NO repo workflow that runs the default unit suite on PRs (R2 fix — the earlier draft assumed one), so explicit wiring is mandatory. The path filter above only bounds the expensive e2e leg.
- **Close-out gate:** real-CI green via `workflow_dispatch` AND one organic path-matching PR run, per the local-passes-CI-fails discipline (AGENTS.md cross-cutting). Budget ≥2 adversarial rounds for the CI surface (heavy-audit precedent).

## 11. Out of scope

- M11-G-D-2 / M11-G-D-3 affordances (stay deferred; rows + skip entries untouched).
- Full help-content freshness audit (M12 UX-validation walk owns it).
- Crew-facing help affordances (Phase-2 widening per §5.6).
- ~~Screenshot baselines out of scope~~ — **WRONG, corrected in R3: baseline regen IS in scope.** The screenshot manifest (`scripts/help-screenshots.manifest.ts:48-87`) captures four entries; row 3's new header "?" lands inside `needs-attention-mobile`'s `captureSelector` (`[data-testid=admin-needs-attention-page]`, manifest `:81-85`) → the `needs-attention-mobile` (+ dark variant) baselines MUST be regenerated via the sanctioned pinned-amd64 procedure (`screenshots-regen.yml` dispatch), budgeted as a milestone task. The other three entries (`dashboard-overview`, `review-queues-empty-state`, `preview-as-crew-banner`) are expected byte-stable: their visible pixels gain no new element (existing "?" triggers keep their closed-state rendering; Learn-more links live inside closed popovers; the legend needs a `pending_review` row the capture DB does not contain — see seeding isolation below), but the drift gate verdict on the PR is the proof, not this prediction.
- No DB schema changes, no new RPCs, no §12.4 catalog changes.

## 12. Testing strategy

- **TDD per task** (invariant 1): each UI wiring, the legend, the HoverHelp API extension, the meta-test, the walker arms, fixture seeding — failing test first.
- **Anti-tautology:** the legend test derives its expectation from the fixture's `last_sync_status` values and asserts against the same filtered `visible` array the component renders (not against any parent container that also renders SyncCell labels — the row cells independently render "Changes to review", so the legend assertions must scope to the legend testid). Negative-regression: stash the legend condition and confirm the test fails.
- **Concrete failure modes named per test** (writing-plans rule), e.g.: meta-test catches "M12.x adds a HoverHelp without a matrix row"; desktop walker catches "needs-attention HoverHelp deleted during a dashboard refactor"; mobile walker catches "affordance moved into a desktop-only block".
- **Walker is the only browser-real gate**; jsdom is not used for any layout/visibility claim. No fixed-dimension parent/child relationships are introduced (no Dimensional Invariants section needed — the legend is a normal-flow block).
- **External attestation:** impeccable critique + audit run externally (fresh subagent) on the affected diff before close-out; cross-model Codex adversarial review on this spec, the plan, each execution round, and a whole-milestone fresh-eyes pass at the end.

## 13. Watchpoints / do-not-relitigate (for reviewers)

- **Tooltip-with-link a11y:** resolved in §4.1 (disclosure semantics when `learnMore` present). Do not re-flag "link inside role=tooltip" — the role is conditionally dropped.
- **Legend reads capped/filtered rows by design** (§4.3), consistent with M12.10 capped-list honesty (`project_m12_10` precedent; overflow notice already discloses scope).
- **Desktop-only needs-attention HoverHelp is legal** under decision 2 (`visibleAt: "desktop"`); mobile coverage comes from row 3, not from forcing the dashboard block visible at 390px.
- **`DEFERRED_TESTIDS` shrinks to exactly two entries** (G-D-2 `per-show-restage-card--tooltip`, G-D-3 `preview-banner--tooltip`); the G-D-1 `dashboard-restage-badge--tooltip` entry is removed along with its row (replaced by the live legend row). The milestone does not zero the set.
- **Helpers move, not duplicate** (§8): `formatRelative`/`formatDateRange` get ONE new home; no transitional re-export layer is kept after importers re-point (single-commit move).
- **Hover-only is banned** (PRODUCT.md): all new affordances are HoverHelp/HelpTooltip instances whose click/keyboard paths already passed M12.5's three-round a11y convergence; the legend is a plain link.
