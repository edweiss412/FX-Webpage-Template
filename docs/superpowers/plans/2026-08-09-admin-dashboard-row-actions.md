# Plan — admin dashboard row actions

**Spec:** `docs/superpowers/specs/admin/2026-08-09-admin-dashboard-row-actions-design.md` (converged R4-repaired; round record `docs/review-rounds/feat/admin-dashboard-row-actions/7e04cd6f04e9.md`) · **Branch:** `feat/admin-dashboard-row-actions` · **Ledger:** `BL-ADMIN-DASHBOARD-ROW-ACTIONS`

Implementer: Opus / Claude Code (UI arc; `components/admin/**`, help mdx). Impeccable dual-gate applies (invariant 8).

## Meta-test inventory (mandatory declaration)

CREATES: none. EXTENDS: `tests/styles/_metaDestructiveConfirm.test.ts` — the destructive-recipe registry gains ShowRowActions' TWO recipe occurrences (the Task-4 shrink Accept and the Task-5 Archive confirm; the meta-test fails on every unregistered occurrence, plan R2 F3). Otherwise none applies: no new mutation surface (dashboard adds callers of registered surfaces — `AUDITABLE_MUTATIONS` keys on surfaces, spec §1.1), no new Supabase call site EXCEPT the widened crew select inside the existing dashboard loader query (Task 1 carries its invariant-9 disposition inline at the existing call site), no admin alert, no advisory-lock code (both holders shipped — spec §4 table restated below).

## Invariant-2 lock enumeration (restated verbatim from spec §4)

Re-sync: JS-side `withShowLock` via `lib/sync/runManualSyncForShow.ts` (single holder, unchanged). Archive: in-RPC `pg_advisory_xact_lock` in `archive_show` (single holder, unchanged). This arc adds ZERO lock code; no new holder at any layer.

## Pre-draft verification pass (2026-08-09; spec R1-R4 probes are the citation record)

Key verified facts the tasks lean on: `ShowsTable.tsx` props :40-61, row render :518-636, `rowAction` slot :627-634, rows wrapper `overflow-hidden` :496; `Dashboard.tsx` is an async Server Component mounting ShowsTable with no `rowAction`; its paginated crew query is `Dashboard.tsx:309-339` with the select at :317 (plan R2 F13); `ActiveShowRow` at `lib/admin/showDisplay.ts:21`; `archiveShowAction(slug)` + sentinels at `app/admin/show/[slug]/_actions/archive.ts:24-53` and `shared.ts`; sync route codes + 409 + `shrink_held` at `app/api/admin/sync/[slug]/route.ts:75-129`; `ReSyncButton.tsx` held flow :148-196, safe focus :125-146, restoration :326-330, inverted amber :338-347; `ArchiveShowButton.tsx` sentinel branches :165-181, focus/confirm flow :184-199,290-353, inverted-amber recipe tokens :447-455 (plan R2 F13); `CrewRowActions.tsx` menu roles/keys :87-152, 258-305, preview link :288-300; `openHref`/`useShowModalNav.ts:25-27`; DESIGN.md destructive-action block :478-497. Implementer re-greps each cited anchor at task start (anchors are drafting-time locators; the claims are the contract).

## Task order note

Task 1 is data-only (loader widening), Tasks 2-5 build the component bottom-up (portal primitive → menu shell + a11y → actions), Task 6 wires Dashboard + help. Each task's RED runs before its implementation lands.

<!-- tasks: depth=2 -->

## Task 1 — `ActiveShowRow.crew` loader widening

<!-- task: red=`pnpm vitest run tests/admin` ac=AC-3 -->

RED: a loader test asserts active published rows carry `crew: { id, name }[]` — fails against the current query (`Dashboard.tsx:309-339`, select :317 — crew count only). Implement: widen that query to `id, name` for active published rows, derive `crewCount` from the same result (one query; invariant-9 disposition unchanged at the site). `ActiveShowRow` gains optional `crew?` (`dataGaps?` precedent). **Commit:** `feat(admin): dashboard rows carry crew id+name`.

## Task 2 — anchored portal primitive (collision contract)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-7 -->

**Primitive selection (resolved at plan time, plan R2 F12):** reuse the tree's live placement infrastructure — `lib/popover/place.ts:25-44` (placement math) + `lib/popover/rafCoalescer.ts` + the `HoverHelp.tsx` body-portal precedent (:60-74,566-580). The new `components/admin/AnchoredPortal.tsx` composes these; it does not reinvent placement. THIS task ships portal mount/anchor/close-on-unmount semantics ONLY — the vertical FLIP and close-on-scroll behaviors are implemented in Task 7 where their Playwright RED can actually drive them (plan R2 F1: jsdom cannot exercise flip, so implementing it here would leave Task 7 without a production defect). RED: RTL tests for mount/anchor/close-on-unmount fail against the absent component. **Commit:** `feat(admin): anchored body portal (mount/anchor/unmount semantics)`.

## Task 3 — ShowRowActions menu shell + keyboard/ARIA contract

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-1,AC-2 -->

**Pre-code mechanical checklist runs FIRST in this task** (plan R1 F8): em-dash ban in copy, typographic apostrophes, 44px targets, canonical type/token classes — swept over every string and class this task authors, before the impeccable gate ever sees them. RED: RTL suite for the menu shell against the absent component: trigger (`min-h-tap-min`/`min-w-tap-min`, `aria-label` with title→slug fallback, `aria-haspopup="menu"`, `aria-expanded` both states — plan R1 F5), `role="menu"`/`role="menuitem"`, focus-in on open, ArrowUp/Down wrap, Home/End, Escape+restore, Tab-close. All four item testids asserted (`row-action-open|preview|resync|archive-<slug>`) and EVERY menu item (the four top-level items included) carries the 44px floor classes. Published row: four items (Open via `openHref(row.slug)`). Held/Publishing row (both `finalizeOwned` values): Open only. Implement inside the Task-2 portal. Four-mutant pass (plan R2 F14) on every string-presence assertion this task writes (aria-labels, item labels): empty / suffixed / present-but-not-live / discriminating-parameter-varied, results recorded in the commit. **Commit:** `feat(admin): ShowRowActions menu shell with keyboard contract`.

## Task 4 — Preview-as submenu + Re-sync action (incl. shrink_held)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions tests/components/ReSyncButton.test.tsx` ac=AC-3,AC-4,AC-6,AC-7 -->

RED: submenu tests (crew list from `row.crew`, cap 12 + overflow item using `openHref`, disabled-on-empty helper text, ArrowRight/Enter + ArrowLeft/Escape, each crew item AND the overflow item at the 44px floor, each item links `/admin/show/[slug]/preview/[crewId]`, null crew name renders the literal `Unnamed` — the live precedent at `components/admin/wizard/step3ReviewSections.tsx:1688`, plan R1 F6) and Re-sync tests (plain path: exactly one POST, pending disables siblings, catalog copy for UPPERCASE route codes, no-raw-code + no-empty-region negatives, refresh on success; held path: `shrink_held` prompt, Accept with §3.8 tier-2 treatment + second version-bound POST carrying `heldModifiedTime`, Keep fires zero further requests). Implementation EXTRACTS ReSyncButton's request/decision logic behavior-preservingly; **`tests/components/ReSyncButton.test.tsx` is IN this task's red= command and must pass unmodified at the commit boundary — it is the extraction fence** (plan R1 F4). Shrink Accept's destructive recipe registers in `tests/styles/_metaDestructiveConfirm.test.ts` (plan R2 F3). Four-mutant pass on the helper text, `Unnamed`, and catalog-copy assertions, recorded in the commit. **Commit:** `feat(admin): preview-as submenu + row re-sync with shrink_held flow`.

## Task 5 — Archive action + destructive contract

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions tests/components/admin/ArchiveShowButton.test.tsx` ac=AC-5,AC-6 -->

RED: Archive tests (confirm step: consequence prose naming the show, inverted-amber recipe + style-registry entry, initial focus on safe control, cancel restoration; confirm calls `archiveShowAction(row.slug)` once; per-sentinel branches `show_not_found`/`infra_error` render the shared extracted generic copy; `FINALIZE_OWNED_SHOW` typed result renders catalog copy derived FROM `lib/messages/catalog.ts`; success refresh moves the row). **`tests/components/admin/ArchiveShowButton.test.tsx` is IN the red= command and must pass unmodified — the second extraction fence** (plan R1 F4). Archive confirm's recipe registers in `tests/styles/_metaDestructiveConfirm.test.ts` (plan R2 F3). Four-mutant pass on consequence prose, sentinel copy, and catalog-copy assertions, recorded in the commit. **Commit:** `feat(admin): row archive with destructive confirm contract`.

## Task 6 — Dashboard wiring + help doc

<!-- task: red=`pnpm vitest run tests/components/admin tests/help` ac=AC-1,AC-8 -->

RED: Dashboard integration test asserts the ACTIVE bucket's ShowsTable renders row-action triggers (`showRowActions` boolean per spec §1.6) and the ARCHIVED bucket does not; help test asserts `/help/admin/dashboard` documents the four actions + Held rule and the archive sentence names both paths. Implement `ShowsTable.showRowActions` + Dashboard flag + `app/help/admin/dashboard/page.mdx`. Screenshot fan-out (RESOLVED at plan time, plan R2 F9 — `scripts/help-screenshots.manifest.ts:48-69`): two `/admin` captures exist. Dispositions: `dashboard-overview` (`admin-dashboard`) WILL change (rows gain the ⋮ trigger) — regenerate FROM the pinned Docker image in this PR; `review-queues-empty-state` (`dashboard-inbox-col`) captures the inbox column only — expected unchanged, verified by pixel-diff before any rebaseline (never rebaseline first). Restore committed WebPs after any local capture run. Four-mutant pass on the help-prose assertions, recorded in the commit. **Commit:** `feat(admin): dashboard row-actions wiring + help doc`.

## Task 7 — geometry e2e (AFTER wiring; plan R1 F1)

<!-- task: red=`pnpm exec playwright test tests/e2e/rowactions-geometry.spec.ts` ac=AC-7 -->

The geometry spec runs against the REAL wired dashboard (Task 6 landed). **This task's production defect (plan R2 F1): the vertical flip and close-on-scroll behaviors do NOT exist yet** — Task 2 deliberately shipped mount/anchor/unmount only. RED: the Playwright spec's lower-edge assertions fail against the flip-less portal; implementing flip + close-on-scroll in `AnchoredPortal` makes them green. Deliverables: (a) `playwright.config.ts` testMatch row in the admin-layout project family; (b) `.github/workflows/admin-layout-e2e.yml` path filters gain the spec AND the three production surfaces (`components/admin/ShowRowActions.tsx`, `components/admin/AnchoredPortal.tsx`, `components/admin/ShowsTable.tsx` — plan R2 F8; `Dashboard.tsx` already covered) plus the invocation-list entry; (c) deterministic authenticated fixture mirroring `admin-nav-layout-dimensions.spec.ts`'s auth + seeding, with enough active shows that the last row scrolls and carries crew. **Boot declaration (plan R2 F6):** local runs boot `pnpm dev`; CI boots `pnpm build && pnpm start` at `127.0.0.1:${E2E_PORT}` (default 3000) per `playwright.config.ts:259-270`, and `admin-layout-e2e.yml` sets `BASELINE_SERVER_ONLY=1` (:110-111) — the spec must run under both. Readiness: row-hydration gate before the first assertion; detach-safe locators. **Geometry premise (plan R2 F7), executed unconditionally before the flip assertions:** `premise`-style check that the table's scrollHeight exceeds its clientHeight AND the last row's trigger sits in the lower viewport region — the fixture proves on its OWN inputs that the lower-edge condition is exercised. Assertions: last row's open menu, submenu, and Archive confirm fully within the viewport (containment, 0.5px tolerance); menu closes on table scroll. **Commit:** `feat(admin): portal flip + scroll-close, geometry e2e + workflow wiring`.

## Task 8 — transition audit (spec §3.5 inventory)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-7 -->

Per the writing-plans transition-audit rule, the spec §3.5 inventory verbatim (closed→open, open→closed, open→open+pending, open+pending→open+error, open+pending→closed-on-success, open→confirm-step with safe-control focus, confirm-step→open with focus restoration, open+pending→held-decision, held-decision→open+pending on Accept, held-decision→open on Keep; compounds: row unmounts with portal open → portal closes via unmount subscription; background refresh re-mounts row → menu closes). RED: an audit test enumerating every conditional render/ternary/AnimatePresence in ShowRowActions + AnchoredPortal, asserting each inventory row is deliberately instant (or the primitive's default) and each compound row has a test asserting END-STATE DOM. **Commit:** `test(admin): row-actions transition audit`.

<!-- tasks: end -->

## Close-out (not a TDD task)

Impeccable dual-gate with the CANONICAL v3 setup sequence (plan R1 F7): the skill's context loader (PRODUCT.md + DESIGN.md) → the register reference read (brand or product register file, per the skill) → `/impeccable critique` → `/impeccable audit`, on the affected diff. Findings + dispositions recorded in §12 below (P0/P1 fixed or DEFERRED.md'd). Full ladder INCLUDING the geometry rerun after all wiring (plan R1 F8): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec playwright test tests/e2e/rowactions-geometry.spec.ts`. Whole-diff codex review (fresh-eyes; REVIEWER ONLY; consequence bound: every row action performs its documented effect or surfaces its coded copy — handled correctly OR signaled, never silently wrong; fence: admin-only surface, accidental misuse; convergence: the AC suite is the closure — new findings need a concrete probe). **Ordering (plan R2 F10 — the reviewed diff IS the merged diff):** the invariant-12 marker-off commit lands FIRST as the branch's final commit; THEN whole-diff review runs on that final SHA; then push; then real CI green (12 contexts) on that same SHA; then merge with zero commits after the reviewed SHA; main sync `0  0` (AC-9, AC-10).

## §12 Impeccable closeout (populated at close-out)

Findings and dispositions from the critique+audit pair land HERE, one row per finding (id, tier, disposition). At close-out the implementer writes the machine-valid marker as a STANDALONE line in this section per the parser grammar in `tests/docs/_invariant8Closeout.ts` (`impeccable-gate: critique=RAN audit=RAN p0=<...> p1=<...> dispositions=<...>`); NO placeholder line exists until then — an invalid placeholder fails the parser.

## AC map

AC-1 Tasks 3+6 · AC-2 Task 3 · AC-3 Tasks 1+4 · AC-4 Task 4 · AC-5 Task 5 · AC-6 Tasks 4+5 · AC-7 Tasks 2+3+4+7+8 · AC-8 Task 6 · AC-9/AC-10 Close-out (+§12).
