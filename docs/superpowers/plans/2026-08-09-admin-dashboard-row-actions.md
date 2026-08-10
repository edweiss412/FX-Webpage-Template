# Plan — admin dashboard row actions

**Spec:** `docs/superpowers/specs/admin/2026-08-09-admin-dashboard-row-actions-design.md` (converged R4-repaired; round record `docs/review-rounds/feat/admin-dashboard-row-actions/7e04cd6f04e9.md`) · **Branch:** `feat/admin-dashboard-row-actions` · **Ledger:** `BL-ADMIN-DASHBOARD-ROW-ACTIONS`

Implementer: Opus / Claude Code (UI arc; `components/admin/**`, help mdx). Impeccable dual-gate applies (invariant 8).

## Meta-test inventory (mandatory declaration)

CREATES: none. EXTENDS: `tests/styles/_metaDestructiveConfirm.test.ts` — the destructive-recipe registry gains ShowRowActions' TWO recipe occurrences (the Task-4 shrink Accept and the Task-5 Archive confirm; the meta-test fails on every unregistered occurrence, plan R2 F3). Otherwise none applies: no new mutation surface (dashboard adds callers of registered surfaces — `AUDITABLE_MUTATIONS` keys on surfaces, spec §1.1), no new Supabase call site EXCEPT the widened crew select inside the existing dashboard loader query (Task 1 carries its invariant-9 disposition inline at the existing call site), no admin alert, no advisory-lock code (both holders shipped — spec §4 table restated below).

## Invariant-2 lock enumeration (restated verbatim from spec §4)

Re-sync: JS-side `withShowLock` via `lib/sync/runManualSyncForShow.ts` (single holder, unchanged). Archive: in-RPC `pg_advisory_xact_lock` in `archive_show` (single holder, unchanged). This arc adds ZERO lock code; no new holder at any layer.

## Pre-draft verification pass (2026-08-09; spec R1-R4 probes are the citation record)

Key verified facts the tasks lean on: `ShowsTable.tsx` props :40-61, row render :518-636, `rowAction` slot :627-634, rows wrapper `overflow-hidden` :496; `Dashboard.tsx` is an async Server Component mounting ShowsTable with no `rowAction`; its paginated crew query is `Dashboard.tsx:309-339` with the select at :317 (plan R2 F13); `ActiveShowRow` at `lib/admin/showDisplay.ts:21`; `archiveShowAction(slug)` + sentinels at `app/admin/show/[slug]/_actions/archive.ts:24-53` and `shared.ts`; sync route codes + 409 + `shrink_held` at `app/api/admin/sync/[slug]/route.ts:75-129`; `ReSyncButton.tsx` held flow :148-196, safe focus :125-146, restoration :326-330, inverted amber :338-347; `ArchiveShowButton.tsx` sentinel branches :165-181, focus/confirm flow :184-199,290-353, inverted-amber recipe tokens :447-455 (plan R2 F13); `CrewRowActions.tsx` menu roles/keys :87-152, 258-305, preview link :288-300; `openHref`/`useShowModalNav.ts:25-27`; DESIGN.md destructive-action block :478-497. Implementer re-greps each cited anchor at task start (anchors are drafting-time locators; the claims are the contract).

## Standing rule for every UI-authoring task (Tasks 3-6; plan R3 F5)

The pre-code mechanical checklist (em-dash ban, typographic apostrophes, 44px targets, canonical type/token classes) runs as the FIRST step of EACH of Tasks 3, 4, 5, and 6, over that task's authored strings and classes — not once in Task 3.

## Task order note

Task 1 is data-only (loader widening), Tasks 2-5 build the component bottom-up (portal primitive → menu shell + a11y → actions), Task 6 wires Dashboard + help. Each task's RED runs before its implementation lands.

<!-- tasks: depth=2 -->

## Task 1 — `ActiveShowRow.crew` loader widening

<!-- task: red=`pnpm vitest run tests/admin` ac=AC-3 -->

RED: a loader test asserts active published rows carry `crew: { id, name }[]` — fails against the current query (`Dashboard.tsx:309-339`, select :317 — crew count only). Implement: widen that query to `id, name` for active published rows, derive `crewCount` from the same result (one query). Invariant-9 style note (plan R4 F1 REFUTED with citation, recorded so no future round re-derives it): the site's result-object shape (`const q = await supabase...; q.error / q.data`) is the repo-RATIFIED compliant form — the lib/data call-boundary spec (`docs/superpowers/specs/ci/2026-08-09-libdata-call-boundary-metatest-design.md` §1.2, five review rounds) rules both destructuring and result-object styles compliant: the result-object reads `.data`/`.error` off a named result and distinguishes returned-error from thrown identically. The widened select keeps the existing shape; no style migration. `ActiveShowRow` gains optional `crew?` (`dataGaps?` precedent). **Commit:** `feat(admin): dashboard rows carry crew id+name`.

## Task 2 — anchored portal primitive (collision contract)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-7 -->

**Primitive selection (resolved at plan time, plan R2 F12):** reuse the tree's live placement infrastructure — `lib/popover/place.ts:25-44` (placement math) + `lib/popover/rafCoalescer.ts` + the `HoverHelp.tsx` body-portal precedent (:60-74,566-580). The new `components/admin/AnchoredPortal.tsx` composes these; it does not reinvent placement. THIS task ships portal mount/anchor/close-on-unmount semantics; vertical flip comes FREE from the composed primitive (`lib/popover/position.ts:123-135` selects the opposite side when the preferred side lacks space — plan R3 F1 corrected the flip-less claim). Close-on-scroll is NOT implemented here — it is Task 7's production defect. RED: RTL tests for mount/anchor/close-on-unmount fail against the absent component. **Commit:** `feat(admin): anchored body portal (mount/anchor/unmount semantics)`.

## Task 3 — ShowRowActions menu shell + keyboard/ARIA contract

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions` ac=AC-1,AC-2,AC-7 -->

RED: RTL suite for the menu shell against the absent component: trigger (`min-h-tap-min`/`min-w-tap-min`, `aria-label` with title→slug fallback, `aria-haspopup="menu"`, `aria-expanded` both states — plan R1 F5), `role="menu"`/`role="menuitem"`, focus-in on open, ArrowUp/Down wrap, Home/End, Escape+restore, Tab-close. All four item testids asserted (`row-action-open|preview|resync|archive-<slug>`) and EVERY menu item (the four top-level items included) carries the 44px floor classes. Published row: four items (Open via `openHref(row.slug)`). Held/Publishing row (both `finalizeOwned` values): Open only. Implement inside the Task-2 portal. Four-mutant pass (plan R2 F14) on every string-presence assertion this task writes (aria-labels, item labels): empty / suffixed / present-but-not-live / discriminating-parameter-varied, results recorded in the commit. **Commit:** `feat(admin): ShowRowActions menu shell with keyboard contract`.

## Task 4 — Preview-as submenu + Re-sync action (incl. shrink_held)

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions tests/components/ReSyncButton.test.tsx` ac=AC-3,AC-4,AC-6,AC-7 -->

RED: submenu tests (crew list from `row.crew`, cap 12 + overflow item using `openHref`, disabled-on-empty helper text, ArrowRight/Enter + ArrowLeft/Escape, each crew item AND the overflow item at the 44px floor, each item links `/admin/show/[slug]/preview/[crewId]`, null crew name renders the literal `Unnamed` — the live precedent at `components/admin/wizard/step3ReviewSections.tsx:1688`, plan R1 F6) and Re-sync tests (plain path: exactly one POST, pending disables siblings, catalog copy for UPPERCASE route codes, no-raw-code + no-empty-region negatives, refresh on success; held path: `shrink_held` prompt, Accept with §3.8 tier-2 treatment + second version-bound POST carrying `heldModifiedTime`, Keep fires zero further requests). Implementation EXTRACTS ReSyncButton's request/decision logic behavior-preservingly; **`tests/components/ReSyncButton.test.tsx` is IN this task's red= command and must pass unmodified at the commit boundary — it is the extraction fence** (plan R1 F4). Shrink Accept's destructive recipe registers in `tests/styles/_metaDestructiveConfirm.test.ts` (plan R2 F3). Failure surfacing asserts the announcement per the SHIPPED reference pattern (plan R4 F5 corrected the anchors): `ReSyncButton.tsx:280-287` renders `role="group"` containing `role="alert"` — the row flow asserts the same alert semantics (spec §3.4 aligned in this commit). Four-mutant pass on the helper text, `Unnamed`, and catalog-copy assertions, recorded in the commit. **Commit:** `feat(admin): preview-as submenu + row re-sync with shrink_held flow`.

## Task 5 — Archive action + destructive contract

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions tests/components/admin/ArchiveShowButton.test.tsx` ac=AC-5,AC-6 -->

RED: Archive tests (confirm step: consequence prose naming the show, inverted-amber recipe + style-registry entry, initial focus on safe control, cancel restoration; confirm calls `archiveShowAction(row.slug)` once; per-sentinel branches `show_not_found`/`infra_error` render the shared extracted generic copy; `FINALIZE_OWNED_SHOW` typed result renders catalog copy derived FROM `lib/messages/catalog.ts`; success refresh moves the row). **`tests/components/admin/ArchiveShowButton.test.tsx` is IN the red= command and must pass unmodified — the second extraction fence** (plan R1 F4). Archive confirm's recipe registers in `tests/styles/_metaDestructiveConfirm.test.ts` (plan R2 F3). Failure surfacing asserts the announcement per the SHIPPED reference pattern (plan R4 F5): `ArchiveShowButton.tsx:224-253` renders `role="alert"` on all three failure branches — the row flow asserts the same. Four-mutant pass on consequence prose, sentinel copy, and catalog-copy assertions, recorded in the commit. **Commit:** `feat(admin): row archive with destructive confirm contract`.

## Task 6 — Dashboard wiring + help doc

<!-- task: red=`pnpm vitest run tests/components/admin tests/help` ac=AC-1,AC-8 -->

RED: Dashboard integration test asserts the ACTIVE bucket's ShowsTable renders row-action triggers (`showRowActions` boolean per spec §1.6) and the ARCHIVED bucket does not; help test asserts `/help/admin/dashboard` documents the four actions + Held rule and the archive sentence names both paths. Implement `ShowsTable.showRowActions` + Dashboard flag + `app/help/admin/dashboard/page.mdx`. Screenshot fan-out (RESOLVED at plan time, plan R2 F9 — `scripts/help-screenshots.manifest.ts:48-69`): two `/admin` captures exist. Dispositions: `dashboard-overview` (`admin-dashboard`) WILL change (rows gain the ⋮ trigger) — regenerate FROM the pinned Docker image in this PR; `review-queues-empty-state` (`dashboard-inbox-col`) captures the inbox column only — expected unchanged, verified by pixel-diff before any rebaseline (never rebaseline first). Restore committed WebPs after any local capture run. Four-mutant pass on the help-prose assertions, recorded in the commit. **Commit:** `feat(admin): dashboard row-actions wiring + help doc`.

## Task 7 — geometry e2e (AFTER wiring; plan R1 F1)

<!-- task: red=`pnpm exec playwright test tests/e2e/rowactions-geometry.spec.ts` ac=AC-7 -->

The geometry spec runs against the REAL wired dashboard (Task 6 landed). **This task's production defect (plan R3 F1 refined): close-on-scroll does NOT exist yet** — flip ships with the primitive in Task 2. RED: the close-on-WINDOW-scroll assertion fails; implementing the window-scroll dismiss in `AnchoredPortal` makes it green. The flip/containment assertions are REGRESSION PINS, not REDs — they may pass on first run (the primitive provides flip) and are stated as pins. Deliverables: (a) `playwright.config.ts` testMatch row in the admin-layout project family; (b) `.github/workflows/admin-layout-e2e.yml` path filters gain the spec AND the production surfaces (`components/admin/ShowRowActions.tsx`, `components/admin/AnchoredPortal.tsx`, `components/admin/ShowsTable.tsx`, and the placement dependencies `lib/popover/place.ts`, `lib/popover/rafCoalescer.ts`, `lib/popover/position.ts`, `lib/popover/viewport.ts` — plan R2 F8 + R3 F6; `Dashboard.tsx` already covered) plus the invocation-list entry; (c) deterministic authenticated fixture mirroring `admin-nav-layout-dimensions.spec.ts`'s auth + seeding, with enough active shows that the last row scrolls and carries crew. **Boot declaration (plan R2 F6):** local runs boot `pnpm dev`; CI boots `pnpm build && pnpm start` at `127.0.0.1:${E2E_PORT}` (default 3000) per `playwright.config.ts:259-270`, and `admin-layout-e2e.yml` sets `BASELINE_SERVER_ONLY=1` (:110-111) — the spec must run under both. Readiness: row-hydration gate before the first assertion; detach-safe locators. **Geometry premise (plan R3 F3 — the table does not independently scroll; the rows wrapper is `overflow-hidden` but unconstrained, so excess rows scroll the DOCUMENT):** executed unconditionally before the containment assertions — `document.scrollingElement.scrollHeight > window.innerHeight` AND the last row's trigger rect sits below the initial viewport fold; the fixture proves the lower-edge condition on its OWN inputs. Assertions: after scrolling the last row into view, its open menu, submenu, and Archive confirm are fully within the viewport (containment, 0.5px tolerance; flip pins); menu closes on WINDOW scroll (the spec §3.1 amendment in this commit records the corrected dismiss trigger). **Commit:** `feat(admin): portal flip + scroll-close, geometry e2e + workflow wiring`.

<!-- tasks: end -->

## Transition-audit distribution (plan R3 F2 — no standalone post-hoc audit task)

The spec §3.5 inventory's rows are asserted RED-first inside the tasks that IMPLEMENT each state, where they have production defects: menu open/close rows in Task 3's suite; pending, error, success-close (INCLUDING open+pending → closed, where `router.refresh()` is CALLED and the close follows — asserted as an ordering, plan R4 F2; `refresh(): void` offers no completion to await, corrected in the inventory at whole-diff R4) and held-decision rows in Task 4's suite (where the actions land); confirm-step focus rows in Task 5's; the two compound rows in Task 7's Playwright spec (row-unmount portal close; and the background-refresh row, whose original "remount close" premise was REFUTED at whole-diff R3 — a refresh preserves state, so the menu stays open and the assertion is eligibility, covered by same-instance re-render cases rather than the e2e, which unmounts for real). Each task's suite enumerates the conditional renders it introduces and asserts instant treatment (or the primitive default) per the inventory. The inventory table verbatim:

| Transition | Treatment |
| --- | --- |
| closed → open | popover pattern default (instant or ≤150ms fade per the popover primitive; whatever `AppHealthPopover` does — consistency wins) |
| open → closed (dismiss/success) | same as primitive |
| open → open+pending | instant swap of item content to spinner; other items disable |
| open+pending → open+error | instant; the error line appears in a `role="group"` naming an inner `role="alert"` message node — the shipped `ReSyncButton.tsx:280-287` reference; the alert role IS the announcement. (Aligned with §3.4 per plan R4 F5, which corrected an earlier `role="status"` here; a node cannot carry both roles, and §3.4 is the ratified one.) |
| open+pending → closed (success) | `router.refresh()` is called, THEN the menu closes — an ORDERING, not an await. Next declares `refresh(): void` (`app-router-context.shared-runtime.d.ts`), so there is no completion to wait for; the earlier "after it resolves" wording described a contract the framework does not offer (corrected at whole-diff R4). The tests assert the ordering, which is the whole of what is observable. |
| open → confirm-step (Archive) | instant in-place swap of the Archive row; initial focus lands on the SAFE control (Cancel) per the destructive-action contract |
| confirm-step → open (cancel) | instant; focus restores to the Archive item (cancel focus restoration per DESIGN.md destructive contract) |
| open+pending → held-decision (Re-sync `shrink_held`) | instant swap to the held prompt (§3.4a); other items stay disabled |
| held-decision → open+pending (Accept, second POST) | instant; pending spinner returns |
| held-decision → open (Keep) | instant dismiss, no request |
| compound: row unmounts (bucket flip after archive) while menu open | the portal closes via its row-unmount subscription (§3.1 positioning contract) — no orphaned portal; asserted |
| compound: server refresh re-renders row while menu open (background revalidate) | the menu STAYS OPEN — corrected at whole-diff R3 against the Next 16 `useRouter` docs (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`): `router.refresh()` merges the RSC payload WITHOUT losing React state, and `ShowsTable` keys rows by `row.id`, which does not change. The original row assumed a remount that does not happen. What the surface owes instead is ELIGIBILITY: if the refresh flips the row to unpublished, the submenu, the Archive confirm, the held decision and any failure banner all close, leaving Open only (AC-2) — asserted on a same-instance re-render, since a remount would not exercise it. |

## Close-out (not a TDD task)

Impeccable dual-gate with the CANONICAL v3 setup sequence (plan R1 F7): the skill's context loader (PRODUCT.md + DESIGN.md) → the register reference read (brand or product register file, per the skill) → `/impeccable critique` → `/impeccable audit`, on the affected diff. Findings + dispositions recorded in §12 below (P0/P1 fixed or DEFERRED.md'd). Full ladder INCLUDING the geometry rerun after all wiring (plan R1 F8): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm exec playwright test tests/e2e/rowactions-geometry.spec.ts`. Whole-diff codex review (fresh-eyes; REVIEWER ONLY; consequence bound: every row action performs its documented effect or surfaces its coded copy — handled correctly OR signaled, never silently wrong; fence: admin-only surface, accidental misuse; convergence: the AC suite is the closure — new findings need a concrete probe). **Ordering (plan R2 F10 — the reviewed diff IS the merged diff):** the invariant-12 marker-off commit lands FIRST as the branch's final commit; THEN whole-diff review runs on that final SHA; then push; then real CI green (12 contexts) on that same SHA; then merge with zero commits after the reviewed SHA; main sync `0  0` (AC-9, AC-10).

## §12 Impeccable closeout

Both halves of the invariant-8 gate ran on this diff's UI surfaces
(`components/admin/ShowRowActions.tsx`, `components/admin/AnchoredPortal.tsx`,
`components/admin/ShowsTable.tsx`, `app/help/admin/dashboard/page.mdx`) with the canonical v3 setup
sequence: `context.mjs` (PRODUCT.md + DESIGN.md) → the `product` register reference → `/impeccable
critique` (dual-agent: design review + deterministic detector, isolated) → `/impeccable audit`.
Browser visualization was unavailable to both — `/admin` is auth-gated and no browser tool was
exposed to the assessment agents — so both ran source-level; the real-browser evidence for this
surface is `tests/e2e/rowactions-geometry.spec.ts`, which runs against the wired dashboard.

Detector: `detect.mjs --json` over all four surfaces → exit 0, `[]`. Critique design health 29/40.
Audit dimension scores: a11y 1 · performance 3 · responsive 3 · theming 3 · anti-patterns 4.

| id | tier | finding | disposition |
| --- | --- | --- | --- |
| C-P0 | P0 | Confirm/held sub-panels sit inside `role="menu"`, so the menu's own key grammar strands a keyboard user on the safe control — Arrow keys jump back to the menu items and Tab closes the whole surface, leaving Confirm archive / Apply reduced version unreachable (WCAG 2.1.1) | FIXED — the handler yields to a sub-panel: Tab cycles the two controls, Escape cancels one level. Pinned by 5 new cases in `showRowActions.archive.test.tsx` + `showRowActions.actions.test.tsx` |
| A-P0 | P0 | The `-translate-y-1/2` on the row's menu seat makes it the containing block for `position: fixed` DESCENDANTS, collapsing the outside-click backdrop from the viewport to the 44px button — the menu never closes on an outside click | FIXED — `inset-y-0` + `items-center`, no transform. The e2e now asserts the backdrop rect equals the viewport |
| C-P1 | P1 | The ⋮ rendered in a full-width sunken bar under every row (~68px, taller than the row itself), nearly doubling the table's height for one button, while the row still ended in a chevron | FIXED — the menu takes the row's trailing seat and the chevron yields it (the menu's first item IS Open). The help copy already described this layout |
| C-P1 | P1 | `aria-disabled` menu items look identical to live ones | FIXED — `aria-disabled:opacity-60 aria-disabled:cursor-not-allowed` on the shared item recipe |
| A-P1 | P1 | Success closes with `closeMenu(false)`; the focused menuitem unmounts and focus falls to `<body>` | FIXED — `closeMenu(true)` on both success paths |
| A-P1 | P1 | The empty-crew hint used `text-text-faint` (3.36:1 light / 3.53:1 dark), a token DESIGN.md caps at 3:1 decorative | FIXED — `text-text-subtle` |
| A-P2 | P2 | `role="menu"` wrapped an error region, a decision prompt and a confirm step — none are in the ARIA menu content model | FIXED — the panel owns the chrome and the key handling; `role="menu"` now holds only menuitems and separators. Pinned by a content-model test |
| A-P2 | P2 | Raw `shadow-lg` where `--shadow-popover` is the admin popover token | FIXED — `shadow-popover` |
| C-P2 | P2 | No `role="separator"` before the destructive Archive item | FIXED, then LOST in the ARIA content-model restructure and re-fixed at whole-diff R4, which caught the §12 row claiming a repair the tree no longer had. The shell test now REQUIRES a separator before the destructive item rather than merely permitting one, so the claim and the code cannot drift apart again. |
| A-P3 | P3 | `AnchoredPortal` allocated fresh placement state every tick, re-rendering the hosted surface on every scroll frame | FIXED — unchanged placements are dropped |
| A-P3 | P3 | `onDismissRef` written during render | FIXED — moved into an effect |
| C-P3 | P3 | The fallback placement ignored `align="right"` | FIXED |
| C-P3 | P3 | Repeated identical announcements never re-fire (a live region whose text does not change is not re-read) | FIXED — the announcement carries a sequence that alternates a trailing no-break space |
| C-P3 | P3 | Archive announcement said links are "now dead" where every other surface says "stop working" | FIXED |
| C-P3 | P3 | `min-w-56` where the precedent uses `min-w-52` | FIXED |
| C-P3 | P3 | No entry motion where the precedent uses `route-enter` | DEFERRED — `ROWACTIONS-MENU-ENTRY-MOTION-1` (instant is the ratified §3.5 treatment) |
| A-P3 | P3 | `min-w-52` can override the core's computed `maxWidth` below 208px bounds | DEFERRED — `ROWACTIONS-MENU-MINWIDTH-BOUNDS-1` (unreachable above pinch-zoom; no harness) |
| A-P3 | P3 | `/help` MDX prose uses straight apostrophes | DEFERRED — `HELP-STRAIGHT-APOSTROPHES-1` (pre-existing, file-wide, not introduced here) |

Not-introduced-here observations, recorded so a later reviewer does not re-derive them: the three
`ShowsTable` interactive elements without a tap-target class (the Find input, the row Link, the
sync-legend link) and the `"—"` date placeholders at `ShowsTable.tsx:594,600` all predate this
branch. The menu's own backdrop button is `aria-hidden` with `tabIndex={-1}` and is not a target.

impeccable-gate: critique=RAN audit=RAN p0=2 p1=4 dispositions=recorded

## AC map

AC-1 Tasks 3+6 · AC-2 Task 3 · AC-3 Tasks 1+4 · AC-4 Task 4 · AC-5 Task 5 · AC-6 Tasks 4+5 · AC-7 Tasks 2+3+4+7 · AC-8 Task 6 · AC-9/AC-10 Close-out (+§12).
