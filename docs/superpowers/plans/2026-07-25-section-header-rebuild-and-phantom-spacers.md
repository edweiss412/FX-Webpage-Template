# Plan — section-header rebuild + childless-spacer sweep

**Spec:** `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md` (APPROVED, adversarial round 8).
**Worktree:** `../FX-worktrees/section-header-rebuild`, branch `feat/section-header-rebuild-phantom-spacers`.
**Closes:** `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`, `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET`.

Every task is TDD: failing test → minimal implementation → passing test → commit (invariant 1). One
commit per task, conventional-commits style (invariant 6). All work stays in the worktree
(invariant 11).

---

## 0. Pre-draft declarations

### 0.1 Meta-test inventory

**CREATES none. EXTENDS none.** The static guard that would have created one is **DESCOPED** by
spec §6 (it survived three adversarial rounds without converging; it becomes a backlog spike in T8).
Each candidate registry from `docs/agents/writing-plans.md` was checked:

| Candidate registry | Applies? |
| ------------------ | -------- |
| `tests/auth/_metaInfraContract.test.ts` (Supabase call boundaries) | No — no Supabase call site added or changed |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | No — no sentinel-in-optional-text surface |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | No — no `admin_alerts` upsert, no catalog row |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | No — no `pg_advisory*` path touched |
| `tests/admin/no-inline-email-normalization.test.ts` | No — no email handling |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | No — no mutating route or server action added (invariant 10 N/A) |
| `tests/cross-cutting/codes.test.ts` (§12.4 parity) | No — no error codes (spec §7) |

### 0.2 Advisory-lock holder topology

**N/A — no `pg_advisory*` path is touched.** The diff is presentational components, two small count
predicates, one CSS token, test files, one workflow file, `DESIGN.md`, and the backlog files. No RPC,
no migration, no table write — so `validation-schema-parity` and `pnpm gen:schema-manifest` are N/A too.

### 0.3 e2e harness-readiness checklist

| | Static harness (new layout tests) | Real-route probe (archived bucket) |
| - | --------------------------------- | ---------------------------------- |
| **Boot** | none — `tests/e2e/standalone.config.ts`; markup rendered by a `tsx` subprocess, CSS compiled by the Tailwind CLI, served from `node:http` | `phantom-gap-e2e.yml` boots local Supabase + the :3000 baseline server (`BASELINE_SERVER_ONLY=1`) |
| **Readiness gate** | `waitUntil: "load"` **plus** `emulateMedia({ reducedMotion: "reduce" })` so the entrance animation is collapsed and geometry is final. **Never `networkidle` alone.** | existing `expect(getByTestId("admin-dashboard")).toBeVisible()` **plus** `expect(locator("[data-testid^='archived-show-row-']").first()).toBeAttached()` — an empty bucket is a different tree and must fail loudly rather than measure nothing |
| **Detach-safety** | each measurement is a single `page.evaluate` reading all rects synchronously in one pass; no `locator.evaluate` sampler that can outlive its element | anchors asserted attached before `scanForPhantomGaps` walks |
| **Env** | `HASH_FOR_LOG_PEPPER` + `JWT_SIGNING_SECRET` required or the harness throws at import (`lib/email/hashForLog.ts:9`) | the workflow already sets both |

### 0.4 Reconciliation sweeps — authored AND RUN, with output

**Do not reuse the grep sweeps from spec drafting: they undercounted.** `grep` needs the
`className="…"` and the `/>` on one line, so it missed `components/admin/BulkIgnoreControls.tsx:200`
(className spans lines). The AST census below is the authoritative record; it is a one-off
measurement, not a shipped guard (spec §6 descope).

**Sweep A — AST census of childless elements carrying a growable token or an unresolvable
className,** over `components/**` + `app/**` (244 files, 109 childless DOM elements with a
className). Result: **17 rows — 13 DOM-tag + 4 component-tag.** Growable DOM-tag rows and their
disposition in this plan:

| Site | Disposition |
| ---- | ----------- |
| `components/admin/wizard/step3ReviewSections.tsx:916` | **T1** deletes it |
| `components/admin/BellPanel.tsx:323` | **T2** deletes it, `ml-auto` on both trailing branches |
| `components/admin/nav/AdminNav.tsx:144` | **T2** deletes it, `ml-auto` on the cluster at `components/admin/nav/AdminNav.tsx:146` |
| `components/admin/nav/OnboardingTopBar.tsx:67` | **T2** deletes it, `ml-auto` on the cluster at `components/admin/nav/OnboardingTopBar.tsx:69` |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | **T3** floors it (`min-w-4`) |
| `components/admin/BulkIgnoreControls.tsx:200` | untouched — the already-repaired precedent (`hidden` + `min-w-6`) |
| `components/admin/OnboardingWizard.tsx:196` | untouched — **measured safe**, see below |
| `components/crew/RightNowHero.tsx:549` | untouched — **reasoned safe**, see below |

Component-tag growable: `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` (spec §1.1
item 7 — its row is `flex w-full items-center gap-2` with one sibling, so the bar always has width)
and `components/admin/telemetry/EventFilters.tsx:74` (`<FilterTextInput />` renders an `<input>`; not
a spacer). Both untouched.

**Sweep B — the two untouched growable sites, closed by measurement rather than assumption:**

- `components/crew/RightNowHero.tsx:549` — N progress segments, all `h-1.5 flex-1`, share
  `flex items-stretch gap-1.5` equally. `progressTotal` is show days (small); at 320px with 7
  segments each still gets ~36px. **Safe.**
- `components/admin/OnboardingWizard.tsx:196` — a childless `h-px max-w-[60px] flex-1` connector in
  `<nav className="flex items-center gap-2 sm:gap-3">` (`components/admin/OnboardingWizard.tsx:132`), so a collapse would charge 8px on
  both sides of each of two connectors. **Measured: 50.3px at 320px, capped at 60px from 360px up,
  no nav overflow at 320/360/375/390/430/640/768/1024.** Safe; below `sm` only the active step's
  label renders (`components/admin/OnboardingWizard.tsx:183`), which is why. Its pre-existing `max-w-[60px]` is **out of scope**.

**Sweep C — arbitrary growable tokens.** `grep -rnoE 'flex-\[[^]]+\]' components/ app/` → **0 hits.**

**Sweep D — tests asserting the five repaired spacers exist.** None; no test update needed.

**Sweep E — `ModalSectionChrome` usages, all of which T1 must cover.**
`components/admin/wizard/step3ReviewSections.tsx:1000` (via `BreakdownSection`), `components/admin/wizard/step3ReviewSections.tsx:3405` (wizard agenda), `components/admin/wizard/step3ReviewSections.tsx:3454` (published agenda). The `sub`
variant arrives via the context provider at `components/admin/wizard/step3ReviewSections.tsx:3714-3715` and `components/admin/wizard/step3ReviewSections.tsx:3769-3770` (Diagrams), both hardcoding
`flagged: false`.

**Sweep F — callers of the two count predicates (T1's shared-boundary edit).**
`shouldShowSectionCount` has exactly one caller: `ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:876`). The legacy
`BreakdownSection` count renders on `count !== null` at `components/admin/wizard/step3ReviewSections.tsx:1010`. Both change in T1.

### 0.5 New files and their wiring — VERIFIED, not assumed

| New file | Wiring |
| -------- | ------ |
| tests/e2e/section-header-layout.layout.spec.ts | **Config edit REQUIRED as an explicit step.** `tests/e2e/standalone.config.ts:35` `testMatch` is a hardcoded regex allow-list, and its own comment at `tests/e2e/standalone.config.ts:29-31` warns "a new standalone spec is NOT discovered until its name is added here. A spec file that merely exists runs nowhere and silently proves nothing." T1 adds section-header-layout\.layout to that regex **and** a run step to `.github/workflows/phantom-gap-e2e.yml`, then confirms the spec actually executes (non-zero test count) rather than trusting a green CI. |
| tests/e2e/pusher-alignment.layout.spec.ts | Same allow-list edit + workflow step (T2). |

Unit tests added to existing files need no config edit: `BASE_INCLUDE` is
`["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), and
`tests/components/**` matches `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:65`), which is correct for
DB-free tests.

### 0.6 Snippet typecheck gate

Every code snippet in a task body is typechecked against the repo tsconfig
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) before dispatch. Specific traps here: do
not bare-index `Range.getClientRects()` or `querySelectorAll` results — use `Array.from(...)`; and
`getComputedStyle(...).minWidth` is a string, so compare `parseFloat`, not `=== 16`.

---

## 1. Tasks

### T1 — `ModalSectionChrome` header rebuild  `feat(admin):`

Covers all three call sites (sweep E) and both heading levels. **Failure mode caught:** a flagged
section header at phone width crushes its own name — 2 lines at 375px, 5 lines and 124px of row
height at 320px.

1. **Failing tests** — new tests/e2e/section-header-layout.layout.spec.ts (real browser, standalone
   config), covering the spec §4.1a matrix: **15 (row, status) cells**, each fixture bound to exactly
   one cell, at 320/375/430/1280.
   - **Name line count + heights:** exactly one text line box per cell; header 44px with no pill,
     72.8px with one. *Anti-tautology:* count lines from `Range.getClientRects()` on the name's own
     TEXT NODE, never the heading's bounding box — the box is inflated by the link and reports
     "1 line" even when the text wraps (this exact error produced a wrong reading during spec
     measurement). Set `box-sizing: content-box` on the width-pinned wrapper (spec §11 item 4).
   - **Width chain (spec §5):** `registrySection.width === pane.clientWidth − paddingLeft −
     paddingRight` — the pane carries `p-tile-pad` and `clientWidth` INCLUDES padding, so a naive
     equality is off by 40px; then `breakdownSection`, `outerColumn`, `headerLine`, `pillLine`, and
     `panelCard.width === outerColumn.width`. All ±0.5px. GUARANTEED boundaries fail if
     `w-full`/`items-stretch` is omitted; the three ASSERTED upstream boundaries, if they fail on the
     untouched tree, are escalated as pre-existing defects, **not** patched here.
   - **Centring (spec §9.1):** formula oracle `+4px − (6px gap + measured count width) / 2`, using the
     COUNT element's own measured box (a different element from the name under test). Name text centre
     within **±2px** of the formula centre; §3.1.5's per-state offsets reproduced within **±1px**.
   - **Hit target:** `document.elementFromPoint` returns the link or a descendant just inside all four
     edges of the intended 44×44 area, and not just outside. **Not** a rect read — the anchor's own
     rect stays 20×20 and excludes the `before:` overlay.
   - **Accessible names:** link name still `Open the source sheet for <label>`; heading name is the
     section name WITHOUT the count.
   - **Pill line keyed to the PILL, not `flagged`:** clean ⇒ exactly one child line and no pill
     wrapper in the DOM; flagged ⇒ two lines, amber pill; judgment ⇒ two lines, info pill.
2. **Failing unit test** for the shared count predicate: `NaN`, `Infinity`, **and `-Infinity`** render
   no chip, asserted at BOTH render paths.
3. **Implement** (spec §3.1):
   - delete the childless spacer at `components/admin/wizard/step3ReviewSections.tsx:916`;
   - outer column `flex w-full flex-col items-stretch gap-1.5`, carrying the existing `mb-2`/`mb-3`;
     the panel card at `components/admin/wizard/step3ReviewSections.tsx:942` stays a sibling **outside** it;
   - header line and pill line each `w-full`;
   - centred group `flex min-w-0 flex-1 items-center justify-center gap-1.5`, plus
     `pr-header-link-slot` when `linkless`;
   - add `--spacing-header-link-slot: 30px` to the `@theme` spacing block in `app/globals.css` beside
     `--spacing-tap-min`, with a measured comment (`--spacing-confirm-box` at `app/globals.css:169` is the style
     precedent). **Not** `pr-[30px]`, which `DESIGN.md:361` forbids;
   - count inside the group, outside `<Heading>`;
   - sheet link → corner glyph: `relative inline-grid size-5 shrink-0 place-items-center rounded-sm`
     + **`before:-inset-3`** (tokenized; `HoverHelp.tsx:547` precedent) + the existing
     `aria-label`/`target`/`rel`; glyph `size-3.5` → `size-4`;
   - pill on its own `w-full justify-center` line, **no wrapper emitted when there is no pill**;
   - add exported `hasRenderableCount(count) => count !== null && Number.isFinite(count)`; call it
     first inside `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708-714`) and **replace** the legacy conditional at
     `components/admin/wizard/step3ReviewSections.tsx:1010` with it.
4. Delete the 2 `KNOWN_SHOW_MODAL_PHANTOM_ITEMS` rows
   (`tests/e2e/admin-layout-dimensions.spec.ts:500`).
5. Add the new spec to `standalone.config.ts` `testMatch` and to `phantom-gap-e2e.yml`; confirm it
   executes with a non-zero test count.
6. Commit.

### T2 — three childless pushers → `ml-auto`  `fix(admin):`

**Failure mode caught:** each is a latent version of T1's bug — they hold width today only because
those rows are not crowded. Per spec §9.3, the two parts catch different failures and **neither
substitutes for the other**: (a) catches a spacer that exists or returns, (b) catches a missing
`ml-auto`.

1. **Failing tests** — new tests/e2e/pusher-alignment.layout.spec.ts. **Per site, never
   aggregated** (an aggregate can go red on the nav rows while never exercising BellPanel):
   - **(a) reintroduction detection.** `AdminNav.tsx:144` and `OnboardingTopBar.tsx:67` — non-wrapping
     rows, so narrowing is monotonic: crowded fixture, assert no in-flow child of the row has zero
     main-axis extent. `BellPanel.tsx:323` — **structural absence** instead, because its row is
     `flex-wrap` (`components/admin/BellPanel.tsx:288`) and narrowing moves the trailing item to another line where the spacer
     regains width: assert the action row directly contains no childless growable child element.
   - **(b) trailing alignment.** Trailing cluster's right edge flush with the parent content-box right
     edge (±0.5px) at a wide width; no overflow at 320px. For `BellPanel`, **both** mutually exclusive
     trailing branches — `entry.isAutoResolving` true (auto-note `<p>`) and false (resolve `<button>`),
     `components/admin/BellPanel.tsx:324-338` — with unwrapped asserted at a wide width and wrapped at 320px for EACH branch.
2. **Implement:** delete each spacer; `ml-auto` on `BellPanel`'s auto-note `<p>` AND resolve
   `<button>`, on `AdminNav`'s cluster at `components/admin/nav/AdminNav.tsx:146`, and on `OnboardingTopBar`'s cluster at `components/admin/nav/OnboardingTopBar.tsx:69`.
   `ml-auto` not `justify-between` — `CompactAlertCard.tsx:138` records why ("a lone child under
   `justify-between` sits at the START edge").
3. Wire the new spec into `standalone.config.ts` + the workflow; confirm it executes.
4. Commit.

### T3 — event-detail hairline floor  `fix(admin):`

**Measured branch (spec §3.2): floor only, no breakpoint.** It never collapses in the supported
range — 22.94px at the narrowest real row (240px), reaching 0 only at ≤215px.

1. **Failing test** — with the LONGEST real title ("Wardrobe & key moments", longest of the five in
   `EVENT_DETAIL_GROUPS`, `components/admin/wizard/step3ReviewSections.tsx:386-401`), at a 240px row, assert all three: (a) the rule is DRAWN
   (`width > 0`); (b) the resolved `min-width` is exactly **16px** — `width > 0` alone passes on
   today's NO-FLOOR tree (22.94px, no wrap), so without this the test is not red; (c) the label does
   **not** wrap, which is what rules `min-w-6` out (24px exceeds the 22.94px available and would bind).
   *Anti-tautology:* a short title cannot collapse, so the longest is mandatory or the test is vacuous.
2. **Implement:** add `min-w-4` to `components/admin/wizard/step3ReviewSections.tsx:2150`. No breakpoint.
3. Commit.

### T4 — TravelRow eyebrow `empty:hidden`  `fix(crew-page):`

1. **Failing test**, real browser, measured as **sibling DISPLACEMENT** (spec §9.2 test 8): an empty
   `<p>` can be zero-height and still displace via the parent's gap, so "eyebrow height is 0" passes
   before the fix. For a **blank** eyebrow the primary line's top equals the `.tcol` stack's
   content-box top with **no 2px displacement**; for a **labelled** eyebrow the displacement equals
   the eyebrow height **plus** the 2px `gap-0.5`. Geometry, not class presence — a class assertion
   cannot catch the `{" "}` regression.
2. **Implement:** add `empty:hidden` to `components/crew/sections/TravelSection.tsx:121`. (Verified by
   compilation: `.empty\:hidden { &:empty { display: none } }` generates.)
3. Delete the 2 `KNOWN_CREW_PHANTOM_ITEMS` rows (`tests/e2e/crew-layout-dimensions.spec.ts:1037`).
4. Commit.

### T5 — archived-bucket probe  `test(admin):`

1. Add `pnpm dlx tsx supabase/seedWalkerFixtures.ts` after the existing `pnpm db:seed` step in
   `.github/workflows/phantom-gap-e2e.yml`. The archived fixture already exists —
   `walker-archived-2026` with `archived: true` (`supabase/seedWalkerFixtures.ts:117-123`) — so this
   is wiring, not a new fixture.
2. Add `T-NOPHANTOM-DASH [archived]` at both existing widths (390, 1280) against
   `/admin?bucket=archived`.
3. Anchor non-vacuity on `archived-show-row-walker-archived-2026`
   (`components/admin/ArchivedShowRow.tsx:48` is the testid template), **captured from a live
   `visited` dump** — `tests/e2e/admin-layout-dimensions.spec.ts:370-376` records why guessing fails.
4. Gate on an archived row being attached first, so an empty bucket fails loudly.
5. Commit.

### T6 — transition audit  `test(admin):`

Body carries the spec §8 inventory verbatim. Heading level is fixed per call site and excluded, so the
transitionable axes are status × count × link = **12 states, 66 pairs**, all instant. Enumerate every
conditional render in the rebuilt header (pill, count, link) and assert each is deliberately instant —
no `AnimatePresence`, no `initial`/`animate`/`exit` introduced, and **no layout transition attached to
the 44px→72.8px growth**, which DOES occur on a mounted header via same-key reconciliation
(`router.refresh()` on the same show; `app/admin/_showReviewModal.tsx:413-419`). Compound cases per
§8, including count-changes-while-a-pill-is-present.

### T7 — `DESIGN.md` updates  `docs(design):`

(a) The centred section-header pattern with its measured offsets and the `pr-header-link-slot`
compensation rule. (b) An explicit note that a childless **growable** element used as a right-pusher
is replaced by `ml-auto`, not hidden at a breakpoint — the existing §7a decorative-hairline rule does
not cover pushers, which is why five sites drifted. (c) The corrected hairline guidance: measure
before hiding; a rule that never collapses gets a floor, not a breakpoint. (d) **Reconcile the
now-false sentence at `DESIGN.md:327`** — both real decorative rules ARE childless spans, so the
empty-element selector DOES match them; the distinction §7a needs is painted-empty-element (keep
visible; `empty:hidden` is exactly wrong for it) vs empty-content-slot (`empty:hidden` is right).
(e) Document `--spacing-header-link-slot`. (f) **Update §7a's "Current sites" list** at
`DESIGN.md:325`, which today names only `OverviewSection.tsx` and `ScheduleDayRow` — TravelRow becomes
a third.

### T8 — backlog lifecycle  `docs:`

BACKLOG.md:5 (root) requires a shipped item to move **wholesale** into `BACKLOG-archive.md` rather
than being annotated in place, or the open queue silently becomes a changelog.

1. Move all three closed entries — `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`,
   `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET` — into
   `BACKLOG-archive.md` with provenance (branch + spec path).
2. Add `BL-CHILDLESS-GROWABLE-STATIC-GUARD` to the OPEN queue, carrying the R1–R3 constraints from
   spec §6 so a future attempt starts from them: axis-awareness (a one-axis size token is not proof of
   extent), DOM-vs-component tags (`FilterTextInput` renders an `<input>`; `Skeleton` forwards to one
   div), runtime-empty children (`{null}`), style-prop and indirected-style pushers, shrink-to-zero
   items with no growable token, and the unresolved core — how opacity must propagate through composed
   classNames, with the census reconciled against a run (the written rule gives 27 rows, a
   static-parts prototype gives 17).
3. Commit.

### T9 — impeccable dual gate (invariant 8)

Pre-code mechanical sweep FIRST (it is a discovery step, not a verifier): em-dash ban in user-visible
copy, apostrophe literals, 44px tap targets, canonical type/token classes. Then `/impeccable critique`
**and** `/impeccable audit` on the diff, each with the canonical v3 setup gates — the skill's
context.mjs context load (PRODUCT.md + DESIGN.md) → register reference read (brand.md or product.md).
P0/P1 fixed or explicitly deferred via `DEFERRED.md`. Findings + dispositions recorded.

### T10 — close-out

Whole-diff fresh-eyes Codex review (split by surface per the tight-scope rule), then **real CI green**
as a separate gate from local green, then `gh pr merge --merge`, then fast-forward local `main` and
verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 2. Verification before push

`pnpm typecheck` · `pnpm lint` · `pnpm format:check` · full `pnpm test` (not a scoped subset — scoped
gates miss registry suites) · the two new Playwright specs under the standalone config · `pnpm
spec:lint` on both the spec and this plan. Then push and watch real CI.
