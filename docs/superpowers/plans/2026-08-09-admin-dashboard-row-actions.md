# Plan — admin dashboard row actions

**Spec:** `docs/superpowers/specs/admin/2026-08-09-admin-dashboard-row-actions-design.md` (converged R4-repaired; round record `docs/review-rounds/feat/admin-dashboard-row-actions/7e04cd6f04e9.md`) · **Branch:** `feat/admin-dashboard-row-actions` · **Ledger:** `BL-ADMIN-DASHBOARD-ROW-ACTIONS`

Implementer: Opus / Claude Code (UI arc; `components/admin/**`, help mdx). Impeccable dual-gate applies (invariant 8).

## Meta-test inventory (mandatory declaration)

CREATES: none. EXTENDS: none. None applies because: no new mutation surface (dashboard adds callers of registered surfaces — `AUDITABLE_MUTATIONS` keys on surfaces, spec §1.1), no new Supabase call site EXCEPT the widened crew select inside the existing dashboard loader query (Task 1 carries its invariant-9 disposition inline at the existing call site), no admin alert, no advisory-lock code (both holders shipped — spec §4 table restated below).

## Invariant-2 lock enumeration (restated verbatim from spec §4)

Re-sync: JS-side `withShowLock` via `lib/sync/runManualSyncForShow.ts` (single holder, unchanged). Archive: in-RPC `pg_advisory_xact_lock` in `archive_show` (single holder, unchanged). This arc adds ZERO lock code; no new holder at any layer.

## Pre-draft verification pass (2026-08-09; spec R1-R4 probes are the citation record)

Key verified facts the tasks lean on: `ShowsTable.tsx` props :40-61, row render :518-636, `rowAction` slot :627-634, rows wrapper `overflow-hidden` :496; `Dashboard.tsx` is an async Server Component mounting ShowsTable with no `rowAction`; `ActiveShowRow` at `lib/admin/showDisplay.ts:21`; `archiveShowAction(slug)` + sentinels at `app/admin/show/[slug]/_actions/archive.ts:24-53` and `shared.ts`; sync route codes + 409 + `shrink_held` at `app/api/admin/sync/[slug]/route.ts:75-129`; `ReSyncButton.tsx` held flow :148-196, safe focus :125-146, restoration :326-330, inverted amber :338-347; `ArchiveShowButton.tsx` sentinel branches :165-181, destructive recipe :184-199, 290-353; `CrewRowActions.tsx` menu roles/keys :87-152, 258-305, preview link :288-300; `openHref`/`useShowModalNav.ts:25-27`; DESIGN.md destructive-action block :478-497. Implementer re-greps each cited anchor at task start (anchors are drafting-time locators; the claims are the contract).

## Task order note

Task 1 is data-only (loader widening), Tasks 2-5 build the component bottom-up (portal primitive → menu shell + a11y → actions), Task 6 wires Dashboard + help. Each task's RED runs before its implementation lands.

<!-- tasks: depth=2 -->

## Task 1 — `ActiveShowRow.crew` loader widening

<!-- task: red=`pnpm vitest run tests/admin` ac=AC-3 -->

RED: a loader test asserts active published rows carry `crew: { id, name }[]` — fails against the current `fetchDashboardData` (crew count only; implementer locates the exact query the pre-draft pass cites via `crewCount` grep). Implement: widen the existing `crew_members` query to `id, name` for active published rows, derive `crewCount` from the same result (one query, no second read — the invariant-9 disposition stays at the existing call site's shape). `ActiveShowRow` gains optional `crew?`; producers that omit it are untouched (`dataGaps?` precedent).

## Task 2 — anchored portal primitive (collision contract)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-7 -->

Check first whether a reusable anchored-portal exists (BellPanel, modal shells); reuse if so — this task then only pins its contract for this consumer. Otherwise build minimal `components/admin/AnchoredPortal.tsx`: body portal, trigger-anchored, vertical flip in lower viewport region, close-on-scroll (table container) and close-on-anchor-unmount. RED: RTL tests for mount/close semantics fail against the absent component; the GEOMETRY half (AC-7's real-browser assertions — last-row menu fully in viewport via `getBoundingClientRect` containment, close-on-scroll) lands as a Playwright spec in Task 5 (jsdom cannot compute layout — the layout-dimensions rule).

## Task 3 — ShowRowActions menu shell + keyboard/ARIA contract

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-1,AC-2 -->

**Pre-code mechanical checklist runs FIRST in this task** (plan R1 F8): em-dash ban in copy, typographic apostrophes, 44px targets, canonical type/token classes — swept over every string and class this task authors, before the impeccable gate ever sees them. RED: RTL suite for the menu shell against the absent component: trigger (`min-h-tap-min`/`min-w-tap-min`, `aria-label` with title→slug fallback, `aria-haspopup="menu"`, `aria-expanded` both states — plan R1 F5), `role="menu"`/`role="menuitem"`, focus-in on open, ArrowUp/Down wrap, Home/End, Escape+restore, Tab-close. All four item testids asserted (`row-action-open|preview|resync|archive-<slug>`) and EVERY menu item (the four top-level items included) carries the 44px floor classes. Published row: four items (Open via `openHref(row.slug)`). Held/Publishing row (both `finalizeOwned` values): Open only. Implement inside the Task-2 portal. **Commit:** `feat(admin): ShowRowActions menu shell with keyboard contract`.

## Task 4 — Preview-as submenu + Re-sync action (incl. shrink_held)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions tests/components/ReSyncButton.test.tsx` ac=AC-3,AC-4 -->

RED: submenu tests (crew list from `row.crew`, cap 12 + overflow item using `openHref`, disabled-on-empty helper text, ArrowRight/Enter + ArrowLeft/Escape, each crew item AND the overflow item at the 44px floor, each item links `/admin/show/[slug]/preview/[crewId]`, null crew name renders the literal `Unnamed` — the live precedent at `components/admin/wizard/step3ReviewSections.tsx:1688`, plan R1 F6) and Re-sync tests (plain path: exactly one POST, pending disables siblings, catalog copy for UPPERCASE route codes, no-raw-code + no-empty-region negatives, refresh on success; held path: `shrink_held` prompt, Accept with §3.8 tier-2 treatment + second version-bound POST carrying `heldModifiedTime`, Keep fires zero further requests). Implementation EXTRACTS ReSyncButton's request/decision logic behavior-preservingly; **`tests/components/ReSyncButton.test.tsx` is IN this task's red= command and must pass unmodified at the commit boundary — it is the extraction fence** (plan R1 F4). **Commit:** `feat(admin): preview-as submenu + row re-sync with shrink_held flow`.

## Task 5 — Archive action + destructive contract

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions tests/components/admin/ArchiveShowButton.test.tsx` ac=AC-5,AC-6 -->

RED: Archive tests (confirm step: consequence prose naming the show, inverted-amber recipe + style-registry entry, initial focus on safe control, cancel restoration; confirm calls `archiveShowAction(row.slug)` once; per-sentinel branches `show_not_found`/`infra_error` render the shared extracted generic copy; `FINALIZE_OWNED_SHOW` typed result renders catalog copy derived FROM `lib/messages/catalog.ts`; success refresh moves the row). **`tests/components/admin/ArchiveShowButton.test.tsx` is IN the red= command and must pass unmodified — the second extraction fence** (plan R1 F4). **Commit:** `feat(admin): row archive with destructive confirm contract`.

## Task 6 — Dashboard wiring + help doc

<!-- task: red=`pnpm vitest run tests/components/admin tests/help` ac=AC-1,AC-8 -->

RED: Dashboard integration test asserts the ACTIVE bucket's ShowsTable renders row-action triggers (`showRowActions` boolean per spec §1.6) and the ARCHIVED bucket does not; help test asserts `/help/admin/dashboard` documents the four actions + Held rule and the archive sentence names both paths. Implement `ShowsTable.showRowActions` + Dashboard flag + `app/help/admin/dashboard/page.mdx`. Fan-out check (run at implementation time): grep the help-screenshot manifest for `/admin` + `/help/admin/dashboard`; if captured, regenerate FROM the pinned Docker image only; restore committed WebPs after local verification. **Commit:** `feat(admin): dashboard row-actions wiring + help doc`.

## Task 7 — geometry e2e (AFTER wiring; plan R1 F1)

<!-- task: red=`pnpm exec playwright test tests/e2e/rowactions-geometry.spec.ts` ac=AC-7 -->

The geometry spec runs against the REAL wired dashboard (Task 6 landed), so its RED fails on geometry, not on an absent trigger. Deliverables beyond the spec file (plan R1 F2): (a) `playwright.config.ts` testMatch row registering `rowactions-geometry.spec.ts` in the admin-layout project family; (b) `.github/workflows/admin-layout-e2e.yml` gains the spec in its path filters AND its invocation list; (c) deterministic authenticated fixture — mirror the existing admin geometry specs' auth + seeding pattern (e.g. `admin-nav-layout-dimensions.spec.ts`) with enough seeded active shows that the LAST row requires scrolling and carries crew. Assertions: last row's open menu, submenu, and Archive confirm fully within the viewport (`getBoundingClientRect` containment ≤0.5px tolerance at the edges), menu closes on table scroll. e2e readiness restated: server boot per the existing config, row-hydration gate before the first assertion, detach-safe locators. **Commit:** `test(admin): row-actions geometry e2e + workflow wiring`.

<!-- tasks: end -->

## Close-out (not a TDD task)

Impeccable dual-gate with the CANONICAL v3 setup sequence (plan R1 F7): the skill's context loader (PRODUCT.md + DESIGN.md) → the register reference read (brand or product register file, per the skill) → `/impeccable critique` → `/impeccable audit`, on the affected diff. Findings + dispositions recorded in §12 below (P0/P1 fixed or DEFERRED.md'd). Full ladder INCLUDING the geometry rerun after all wiring (plan R1 F8): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec playwright test tests/e2e/rowactions-geometry.spec.ts`. Whole-diff codex review (fresh-eyes; REVIEWER ONLY; consequence bound: every row action performs its documented effect or surfaces its coded copy — handled correctly OR signaled, never silently wrong; fence: admin-only surface, accidental misuse; convergence: the AC suite is the closure — new findings need a concrete probe). Push → real CI green (12 contexts) → invariant-12 marker off in last commit → merge → main sync `0  0` (AC-9, AC-10).

## §12 Impeccable closeout (populated at close-out)

Findings and dispositions from the critique+audit pair land HERE, one row per finding (id, tier, disposition). At close-out the implementer writes the machine-valid marker as a STANDALONE line in this section per the parser grammar in `tests/docs/_invariant8Closeout.ts` (`impeccable-gate: critique=RAN audit=RAN p0=<...> p1=<...> dispositions=<...>`); NO placeholder line exists until then — an invalid placeholder fails the parser.

## AC map

AC-1 Tasks 3+6 · AC-2 Task 3 · AC-3 Tasks 1+4 · AC-4 Task 4 · AC-5 Task 5 · AC-6 Task 5 · AC-7 Tasks 2+3+7 · AC-8 Task 6 · AC-9/AC-10 Close-out (+§12).
