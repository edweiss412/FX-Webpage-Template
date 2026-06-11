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

| # | testid (after) | Host surface (after) | Target | `visibleAt` | Disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | `help-affordance--dashboard-active-shows--tooltip` | ShowsTable header HoverHelp (`ShowsTable.tsx:236`) | `/help/admin/dashboard#active-shows` | `both` | Re-pointed |
| 2 | `help-affordance--dashboard-needs-attention--tooltip` | Dashboard desktop "Needs attention" header HoverHelp (`Dashboard.tsx:512`) | `/help/admin/review-queues#first-seen` | `desktop` | Renamed from `dashboard-pending-ingestion`, re-pointed |
| 3 | `help-affordance--needs-attention-page--tooltip` | NEW "?" HoverHelp in `/admin/needs-attention` page header via `AdminPageHeader` `titleAppendSlot` (`components/admin/nav/AdminPageHeader.tsx:20`; page header at `app/admin/needs-attention/page.tsx:34`) | `/help/admin/review-queues#first-seen` | `both` | New (mobile twin of #2) |
| 4 | `help-affordance--dashboard-restage--legend` | NEW conditional legend line under ShowsTable (§4.3) | `/help/admin/review-queues#re-stage` | `both` | Replaces `dashboard-restage-badge--tooltip` (leaves `DEFERRED_TESTIDS`) |
| 5 | `help-affordance--dashboard-archived-shows--tooltip` | Archived-bucket header HoverHelp (`Dashboard.tsx:428`) | `/help/admin/dashboard#archived` (new anchor) | `both` | New (renders only at `?bucket=archived`) |
| 6 | `help-affordance--dashboard-footer--tour` | `components/admin/DashboardFooter.tsx` (unchanged) | `/help/tour` | `both` | Unchanged |
| 7 | `help-affordance--per-show-sync-footer--tooltip` | NEW "?" HoverHelp beside the StatusIndicator in the quiet sync footer (`app/admin/show/[slug]/page.tsx:616-621`) | `/help/admin/per-show-panel#sync-health` | `both` | Renamed from `per-show-sync-health`, re-pointed |
| 8 | `help-affordance--per-show-alerts--tooltip` | PerShowAlertSection header HelpTooltip (`PerShowAlertSection.tsx:156`) | `/help/admin/parse-warnings` | `both` | Renamed from `per-show-parse-warnings`, re-pointed (renders only when the show has alerts — fixture, §6.3) |
| 9 | `help-affordance--per-show-crew--tooltip` | NEW "?" HoverHelp on the per-show Crew section header (`app/admin/show/[slug]/page.tsx:442`) | `/help/admin/preview-as-crew` | `both` | Renamed from `per-show-preview-links`, re-pointed |
| 10 | `help-affordance--first-seen-review-card--tooltip` | `components/admin/StagedReviewCard.tsx` (unchanged) | `/help/admin/review-queues#first-seen` | `both` | Unchanged |
| 11 | `help-affordance--settings-administrators--tooltip` | `AdministratorsSection.tsx:88` HoverHelp | `/help/admin/settings#administrators` (new page) | `both` | New |
| 12 | `help-affordance--settings-drive-connection--tooltip` | `DriveConnectionPanel.tsx:133` HoverHelp | `/help/admin/settings#drive-connection` (new page) | `both` | New |
| 13 | `help-affordance--settings-drive-health-badge--tooltip` | `DriveConnectionPanel.tsx:176` HoverHelp (badge trigger) | `/help/admin/settings#drive-health` (new page) | `both` | New (renders only when Drive health ≠ healthy — fixture, §6.3) |
| 14 | `help-affordance--settings-preferences--tooltip` | `app/admin/settings/page.tsx:124` HoverHelp | `/help/admin/settings#preferences` (new page) | `both` | New |
| 15–17 | `help-affordance--wizard-step{1,2,3}--tooltip` | `components/admin/wizard/Step{1Share,2Verify,3Review}.tsx` (unchanged) | `/help/admin/onboarding-wizard#…` | `both` | Unchanged |
| 18 | `help-affordance--per-show-restage-card--tooltip` | (not shipped) | `/help/admin/review-queues#re-stage` | `both` | Stays in `DEFERRED_TESTIDS` (M11-G-D-2) |
| 19 | `help-affordance--preview-banner--tooltip` | (not shipped) | `/help/admin/preview-as-crew#impersonation-banner` | `both` | Stays in `DEFERRED_TESTIDS` (M11-G-D-3) |

`visibleAt` claims for rows whose hosts I could not gate-check from source (#5 archived header, #11–14 settings) are verified at plan time by rendering at both viewports; any that prove viewport-gated get their `visibleAt` corrected, not their UI changed (except where §4 explicitly adds UI).

## 4. UI changes

All UI work is Opus-owned (AGENTS.md routing hard rule) and gated by the external impeccable dual-gate (invariant 8).

### 4.1 `HoverHelp` API extension (`components/admin/HoverHelp.tsx`)

Two new optional props; all existing call sites compile unchanged:

- `rootTestId?: string` — placed on the existing root `<span className="relative inline-flex">` (`HoverHelp.tsx:115-119`). Matrix rows pass their exact matrix testid here; the existing `testId` prop keeps its `-trigger`/`-body` convention untouched.
- `learnMore?: { href: string }` — when present, the popover body renders a `Learn more →` link **after** the children.

**A11y consequence (do not relitigate at review without reading this):** the current body is `role="tooltip"` (`HoverHelp.tsx:144`) with `aria-describedby` from the trigger. A tooltip must not contain interactive content. When `learnMore` is present, the body switches to a **disclosure** pattern: `role="tooltip"` is dropped, the trigger gains `aria-controls={bodyId}` (it already has `aria-expanded`, `HoverHelp.tsx:107`), and `aria-describedby` is re-pointed to an inner span wrapping ONLY the children (so the description excludes the link text). Keyboard reachability of the link: the body element when closed is `visibility:hidden` (`invisible` class, `HoverHelp.tsx:149`), which removes the link from the tab order; when open, Tab from the trigger reaches the link as the next focusable in DOM order. When `learnMore` is absent, nothing changes for existing call sites.

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

`playwright.config.ts`: the `help-docs` project (390×844, `playwright.config.ts:154-168`) is joined by `help-docs-desktop` (1280×800, same `dependencies: ["help-docs-setup"]`, same baseURL/locale/timezone). Each walker run filters rows by `visibleAt`: mobile walks `mobile|both`, desktop walks `desktop|both`. Implementation detail (project-name detection vs env var) is a plan decision.

### 6.2 `assertTarget` HoverHelp arm

Current arms: direct-href (`:219-223`) and `<details>`/summary (`:226-229`) before the nested-link assertion (`:231-236`). New arm between them: if the row root contains `button[aria-expanded]` (the HoverHelp trigger), click it, then run the existing nested-link assertion (the popover body is inside the root span, so `root.locator("a")` resolves; the link is visible once open).

### 6.3 Fixture seeding (extends `prepareAdminState` / dedicated helpers)

- **Row 4 (legend):** seed one show with `last_sync_status = 'pending_review'` (maps to bucket `review` — `lib/admin/syncStatus.ts:29-30`).
- **Row 8 (alerts):** seed one unresolved `admin_alerts` row for the fixture show so PerShowAlertSection renders its header.
- **Row 13 (drive-health badge):** seed the non-healthy Drive state the badge requires (exact column set verified at plan time against `DriveConnectionPanel`'s data source).
- **Row 5 (archived):** `routeFor` returns `/admin?bucket=archived`; seed ≥1 archived show.
- All seeding follows the existing loud-failure pattern (`deep-link-walker.spec.ts:53-99`: destructure `{ error }`, throw with message — invariant 9).
- The walker keeps its matrix-shape sanity test (`:239-244`).

## 7. Structural meta-test (new, default unit suite)

`tests/help/_metaAffordanceMatrixParity.test.ts` (DB-free, no rendering — static source analysis, registry style per the recurring-bug ladder):

1. **Call-site sweep:** walk `components/**` + `app/**` (file-tree walk, not a named list) for every `<HoverHelp` / `<HelpTooltip` call site and every `help-affordance--` string literal. Each must either (a) reference a non-deferred concrete matrix testid (via `rootTestId`/literal), or (b) carry an inline `// not-a-help-affordance: <reason>` exemption comment.
2. **Inverse sweep:** every non-deferred concrete row's testid occurs in **exactly one** file under `components/**`/`app/**`.
3. **Deferred-set consistency:** every `DEFERRED_TESTIDS` entry corresponds to a matrix row, and no deferred testid appears in any component file.

Failure messages name the file and the rule, so a violating PR fails in seconds with a actionable message rather than at the e2e walker. The meta-test is declared in the plan's meta-test inventory (writing-plans rule); it **extends** the §5.6 class-sweep guarantee from prose to CI.

## 8. Dead component deletion

- `components/admin/ActiveShowsPanel.tsx`: delete the `ActiveShowsPanel` component. Move `formatRelative`, `formatDateRange`, and the `ActiveShowRow` type to `lib/admin/format.ts` (new) — importers re-pointed: `ShowsTable.tsx:26`, `NeedsAttentionInbox.tsx:13-14`, `app/admin/show/[slug]/page.tsx:28`, `ChangeFeedTime.tsx:11`, `ArchivedShowRow.tsx:30`, `Dashboard.tsx:21`.
- `components/admin/PendingPanel.tsx`: delete the `PendingPanel` component; relocate its still-used type exports (`PendingIngestionRow`, `FirstSeenStagedRow` — consumers enumerated at plan time) alongside.
- Affected tests (enumerated by grep at plan time; currently 13 files reference the two components): component-level tests of dead bodies (e.g. `tests/components/admin/PendingPanel-awaiting-approval.test.tsx`, `DashboardPanels.test.tsx`) are deleted or migrated to live equivalents; pure-helper tests (`formatDateRange.test.ts`, `class-sweep-now-utility.test.ts`) re-point imports; `tests/help/_uiLabelExceptions.ts` and `forbidden-prose-registry.test.ts` entries are updated.

## 9. Spec §5.6 amendment + bookkeeping

- The §5.6 row table in `2026-05-12-user-facing-docs-design.md:361-378` is replaced by §3.1's table (with `visibleAt` column), with an amendment note crediting this spec and recording: the two-row needs-attention split, the five renames, the `--legend` affordance kind, and the two-viewport walker contract. The class-sweep guarantee paragraph (`:382`) gains: "enforced by `tests/help/_metaAffordanceMatrixParity.test.ts`".
- `DEFERRED.md` (user-facing-docs tree): M11-G-D-6 and M11-G-D-1 → RESOLVED with PR link; G-D-2/G-D-3 untouched (their `DEFERRED_TESTIDS` entries stay).

## 10. CI (`.github/workflows/help-affordances.yml`, new)

- **Triggers:** `pull_request` filtered to paths `components/admin/**`, `app/admin/**`, `app/help/**`, `lib/messages/**`, `lib/admin/**`, `app/help/_affordanceMatrix.ts`, `tests/e2e/**`, `playwright.config.ts`, the workflow itself; plus `workflow_dispatch`.
- **Job:** checkout → pnpm install → supabase local stack (`supabase start`) → migrations apply (local stack applies `supabase/migrations/**` natively) → `pnpm build` artifact for the :3004 server → run `help-docs-setup` + both walker projects.
- The unit meta-test (§7) runs in the existing default test job on **every** PR — the path filter above only bounds the expensive e2e leg.
- **Close-out gate:** real-CI green via `workflow_dispatch` AND one organic path-matching PR run, per the local-passes-CI-fails discipline (AGENTS.md cross-cutting). Budget ≥2 adversarial rounds for the CI surface (heavy-audit precedent).

## 11. Out of scope

- M11-G-D-2 / M11-G-D-3 affordances (stay deferred; rows + skip entries untouched).
- Full help-content freshness audit (M12 UX-validation walk owns it).
- Crew-facing help affordances (Phase-2 widening per §5.6).
- Screenshot baselines: none of the captured-selector surfaces change geometry by default — the legend renders only under seeded `pending_review` rows and the capture seed path is checked at plan time; if any captured route's bytes change, the sanctioned amd64 regen procedure applies (known discipline, not new scope).
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
- **`DEFERRED_TESTIDS` survives** for G-D-2/G-D-3 — this milestone does not zero the set.
- **Helpers move, not duplicate** (§8): `formatRelative`/`formatDateRange` get ONE new home; no transitional re-export layer is kept after importers re-point (single-commit move).
- **Hover-only is banned** (PRODUCT.md): all new affordances are HoverHelp/HelpTooltip instances whose click/keyboard paths already passed M12.5's three-round a11y convergence; the legend is a plain link.
