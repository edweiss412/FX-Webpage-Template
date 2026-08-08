# Plan — Step-3 a11y cluster: sub-44px targets and a skipped heading level

**Spec:** `docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` (canonical; adversarially APPROVEd at spec R8; this plan never supersedes it — spec §1.1 R1–R10 are ratified and not relitigated here)
**Branch:** `fix/step3-a11y-cluster`
**Closes:** `NEWTAB-A11Y-RESIDUE-1` (fully — archived); `STEP3-GALLERY-TAP-TARGETS-1` items (a)(b)(c) (struck; (d) stays deferred)

impeccable-gate: critique=PENDING audit=PENDING p0=- p1=- dispositions=pending

(The marker above follows the `2026-08-03-nojs-loading-shell-notice.md` lifecycle: PENDING
while the arc is live, replaced with real counts in the close-out commit after both gate
halves run. Until that commit, `tests/docs/_metaInvariant8Closeout.test.ts` reports the
PENDING line as malformed — expected mid-arc state, resolved at Task 11, and the final
pre-push full suite runs after it is resolved.)

---

## 0. Invariants that bind this plan

- **TDD per task, commit per task** (AGENTS.md invariants 1, 6). Conventional-commit scopes
  used here: `crew-page` (extraction), `admin` (wizard/help/nav/bell repairs), `test`
  (harness), `docs` (ledger).
- **Invariant 8** — UI surface. Both gate halves (`/impeccable critique`, `/impeccable
  audit`) run at close-out, before whole-diff adversarial review. Marker lifecycle above.
- **Invariants 2, 3, 9, 10 — N/A with reasons** (§2 below).
- **Invariant 12** — this branch's two ledger claims are already marked IN PROGRESS and
  pushed. `NEWTAB-A11Y-RESIDUE-1` graduates: its marker comes off **in the same commit
  that archives it** (Task 10 — archives categorically reject in-flight entries).
  `STEP3-GALLERY-TAP-TARGETS-1` stays in `DEFERRED.md`: its marker comes off in the PR's
  **last** commit (Stage 4.4), never earlier.
- **Spec is canonical** (invariant 7): every recipe, class-ownership row, DI, premise, and
  fixture requirement below is stated by the spec; this plan adds sequencing, test
  wiring, and file mechanics only.

## 1. Acceptance-criteria map

| AC (spec §10) | Landed by |
| --- | --- |
| AC-1 (seven summaries ≥44×44; six Class-A narrower than container) | Tasks 2, 4 |
| AC-2 (seven Class-B/composite targets; painted box + radius preserved) | Tasks 3, 4, 5 |
| AC-2b (hover covers whole target; focus outlines target) | Tasks 3, 4 |
| AC-2c (brand-link margin/padding cancellation; no row-height assert) | Task 5 |
| AC-3 (margin box 28×28; no 320px overflow) | Task 3 |
| AC-3b (live-entry harness, real components; DI-5/DI-7 sole exemptions) | Tasks 1, 2 |
| AC-4 (heading sequence skips no level, document order) | Task 7 |
| AC-5 (diagram tile: one accessible name; blank alt still named) | Task 8 |
| AC-6 (no internal link renders `↗`) | Task 9 |
| AC-7 (two ledger filings with named exceptions; NO structural guard ships) | Task 10 |
| AC-8 (impeccable dual gate) | Task 11 |

## 2. Meta-test inventory (mandatory declaration)

- **CREATES:** none. The repo-wide tap-target guard is DESCOPED and FILED
  (spec §5, AC-7 — an implementation that adds one has exceeded the spec).
- **EXTENDS:** none.
- **N/A with reasons** (mirrors spec §5): no Supabase call boundary
  (`tests/auth/_metaInfraContract.test.ts`) — no Supabase client call is added or moved
  (the extraction moves only presentational functions; `app/me/page.tsx` keeps every
  server call). No advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`)
  — no `pg_advisory*` in scope. No mutation surface
  (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler or
  `"use server"` action added or modified; every change is presentational.
- **Affected but not extended:** `tests/docs/_metaLedgerInProgress.test.ts`,
  `tests/docs/_metaLedgerReferentialIntegrity.test.ts` (Task 10 edits must keep them
  green), `tests/docs/_metaInvariant8Closeout.test.ts` (marker lifecycle above),
  `tests/docs/_metaReviewRoundEconomy.test.ts` (corpus rows appended by every review
  dispatch; filing updated when counts change).

## 3. Existing-test impact (pre-verified against live code)

| Test | Impact |
| --- | --- |
| `tests/components/onboardingWizardNav.test.tsx:274` — `active.className` contains `bg-accent` | **Updates in Task 3**: visual classes move to the inner span; assertion re-targets `wizard-step-indicator-3-visual`. |
| `tests/components/onboardingWizardNav.test.tsx:146-153, 280-286` — tagName `A`, `aria-current`, `aria-disabled`, href on `wizard-step-indicator-N` | **Unchanged** — the testid stays on the target element (anchor/span), which keeps every reachability assertion byte-identical. |
| `tests/components/onboardingWizardNav.test.tsx:276` — `done1.querySelector("svg")` | **Unchanged** — `querySelector` descends into the new inner span. |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx:899, 906, 919` | **Rewritten in Task 8** exactly per spec §2.4's three-row table (img `alt` → `""`; anchor assertions preserved; test renamed at :919). |
| `tests/components/admin/bellPanelHelpLink.test.tsx` | **Extended in Task 9** — glyph-absence + link-present premise on both rendering branches. No existing assertion pins the `↗`. |
| `tests/e2e/me-page.spec.ts` | **Must stay green untouched** after Task 1 — the extraction is a pure relocation; this spec is the regression net for `/me` rendering. |
| `tests/e2e/step3-review-page.layout.spec.ts:203-216` | **Re-run as DI-7** (preservation invariant; spec §8 exempts it from discriminating-form). Not edited. |
| `tests/components/admin/HelpSheet.test.tsx`, `tests/components/admin/PreviewBannerHelpAffordance.test.tsx`, `tests/components/ErrorExplainer.test.tsx`, `tests/app/admin/admins-page-developer.test.tsx`, `tests/app/admin/settings-developer-visibility.test.tsx`, crew `ScheduleSection.*.test.tsx` | **Expected unchanged** (class-string additions don't alter structure/naming). Task-level rule: if any needs editing beyond a class-string literal, STOP and check the spec's R6 "looks different = defect" fence before touching it. |

## 4. Harness architecture (one section, referenced by Tasks 1–6)

New standalone Playwright spec **tests/e2e/tap-target-floor.layout.spec.ts** with live
entry **tests/e2e/_tapTargetFloorLiveEntry.tsx**, modeled on
`tests/e2e/attention-pill-focus.spec.ts:30-90`:

- **Boot:** `mkdtemp` workdir; static live.html shell; bundle built out-of-process via
  `execFileSync(node, tests/e2e/_step3ReviewModalBundle.mjs, <entry>, <outfile>, tsconfig.json)`
  (the bundler is UNMODIFIED — spec §8, ratified R10); Tailwind CSS compiled through
  `compileEntryCss` with `@source` lines for **every** directory the entry's import graph
  paints from: `components/admin`, `components/admin/nav`, `components/messages`,
  `components/crew/primitives`, `app/me`, and the entry file itself. A missing `@source`
  silently drops the repaired utilities from the stylesheet and every DI fails with a
  misleading rect — list is part of Task 2's body.
- **Readiness gate:** the entry sets `data-harness-ready="true"` on `document.body` after
  `createRoot(...).render(...)` commits (via a `useEffect` in a top-level wrapper);
  every test awaits `page.waitForSelector('body[data-harness-ready="true"]')` before its
  first assertion. Never `networkidle`.
- **Detach-safety:** the harness never unmounts anything except the HelpSheet dialog
  (opened by a real click in the DI-15 test). All rect/style sampling runs through
  `locator.evaluate` on elements that exist for the page's whole life; the DI-15 test
  re-queries after the open-click rather than holding a pre-click handle.
- **Mounts (spec §8, all states from §3):** `HelpAffordance` (code with non-null
  `helpfulContext`); `OperatorErrorBlock` (exported in Task 1) with `helpfulContext`
  present; `ErrorExplainer` (known code, helpful context enabled);
  `AdministratorsSection` (≥1 revoked admin); `MeShowSections` (from
  **app/me/meShowSections.tsx**, ≥1 past show, title > 80 chars is NOT needed here — the
  `/me` past-summary is unconditional once `past.length > 0`); `RunOfShowList` (title
  **> 80 characters** — `lib/crew/agendaDisplay.ts:25` `TITLE_TRUNCATE_AT = 80`;
  shorter renders a `<span>`, no `<summary>` at all); `HelpTooltip` (mounted directly);
  `StepIndicator` in the **forward-visited** fixture `step=2, maxReachedStep=3` (DI-9's
  only discriminating state); `HelpSheet` (trigger + close); `AdminNav` wrapped in
  `PathnameContext.Provider value="/admin"`
  (`tests/e2e/_pusherRowsHarness.tsx:17-21` precedent).
- **Selector scheme:** interactive targets keep their existing testids
  (`wizard-step-indicator-N` at `components/admin/OnboardingWizard.tsx:164`,
  `help-sheet`-derived `-trigger`/`-close` at `components/admin/HelpSheet.tsx:70` and `components/admin/HelpSheet.tsx:142`,
  `help-tooltip-trigger` at `components/admin/HelpTooltip.tsx:57`, `admin-nav-brand` at
  `components/admin/nav/AdminNav.tsx:90`, `me-past-summary`). The four split targets gain
  **new inner-span testids** suffixed `-visual` (e.g. `wizard-step-indicator-3-visual`)
  so DI-3 (target) and DI-4 (visual) are asserted on DIFFERENT elements, per spec §8.
  Summaries are counted structurally: `document.querySelectorAll("summary")` inside the
  harness == 7 (premise), with HelpTooltip's identified by `help-tooltip-trigger` for
  DI-2's six-of-seven scoping.
- **Viewports:** 320/390/768/1280 for all DIs; DI-11/DI-12 additionally at 360 and 440
  (the `AdminNav` wordmark breakpoints).
- **Wiring:** the spec stem `tap-target-floor.layout` is added to the `testMatch`
  allow-list at `tests/e2e/standalone.config.ts:86` **in the same commit as Task 2** — a
  spec not listed there runs nowhere and silently proves nothing.
- **Premises:** every table row from spec §8's premise table is implemented with
  `premise(description, actual, mustExceed)` / `premiseHolds(description, condition)`
  from `tests/_shared/premise.ts:26` and `tests/_shared/premise.ts:36`, unconditionally relative to the assertion each
  guards — never inside a `.each` callback.

---

<!-- tasks: depth=2 -->

## Task 1 — Extraction seam + exports (spec §8, ratified R10; probe P7)

<!-- task: red=`pnpm vitest run tests/components/meShowSections.test.tsx` ac=AC-3b -->

**RED:** new unit test a NEW file tests/components/meShowSections.test.tsx imports
`{ MeShowSections }` from `@/app/me/meShowSections` (module does not exist yet — the
import fails), renders it in jsdom with one future + one past `CrewShowSummary` fixture
(shape: `lib/data/listShowsForCrew.ts:28-35`), and asserts `me-past-summary` renders and
`me-show-sections` is present. This pins the module boundary the live entry depends on
and proves the module's import graph is jsdom-loadable (no server reach).

**GREEN:**
1. Create **app/me/meShowSections.tsx**: move, VERBATIM, the seven functions from
   `app/me/page.tsx` — `formatShowDate` (:67), `MeShowSections` (:192), `UndatedShowRow`
   (:289), `NextUpCard` (:323), `ShowListRow` (:367), `chipToneClass` (:412),
   `pickVenueLabel` (:430) — with exactly the import block spec §8 states (`next/link`;
   `partitionMeShows`, `resolveDisplayDate`, type `PartitionedMeShow` from
   `@/lib/me/partitionMeShows`; `relativeDayChip` from `@/lib/time/relative`; type
   `CrewShowSummary` from `@/lib/data/listShowsForCrew`). Export `MeShowSections` with
   the precedent comment naming the spec (`components/admin/OnboardingWizard.tsx:112-114`
   pattern). The other six stay private to the new module.
2. `app/me/page.tsx` imports `MeShowSections` back; `MePage` and all server logic stay.
3. Add `export` + precedent comment to `OperatorErrorBlock`
   (`components/admin/OnboardingWizard.tsx:547`).

**Verify:** new test green; `pnpm exec tsc --noEmit`; full vitest suite green
(`tests/e2e/me-page.spec.ts` runs env-bound in CI and is the /me regression net — do not
edit it). Zero behavior change is the contract: `git diff` on `app/me/page.tsx` shows
only deletions of the moved functions plus one import.

Commit: `refactor(crew-page): extract MeShowSections to app/me/meShowSections.tsx (spec §8 seam)`

## Task 2 — Harness + layout-dimensions spec + Class A repairs (six summaries)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor --grep "DI-1"` ac=AC-1,AC-3b -->

This is the plan's **layout-dimensions task**. Body carries the spec's exact Dimensional
Invariants list (§6): DI-1 through DI-15 as written there, including the DI-2 six-of-seven
scoping (`HelpTooltip` exempt by construction, width pinned by DI-10), the DI-5/DI-12
margin-box formulas, DI-9's per-site property enumeration (both `color` AND
`background-color` for HelpSheet trigger and HelpTooltip; `color` only for the step pill),
DI-13's computed-style (not geometry) measurement, DI-14's non-zero AND equal radius, and
the corner-exclusion rule (edge midpoints only — probe P4 measured corners unreliable).

**RED:** build the new _tapTargetFloorLiveEntry.tsx + the new tap-target-floor.layout.spec.ts per §4
above, with the premise set and describe blocks for DI-1/DI-2 implemented. Add the stem to
`tests/e2e/standalone.config.ts:86` testMatch. Run: premises pass (7 summaries mount,
unrepaired), DI-1 FAILS (20.3px / 16.8px heights — spec §2.1 table).

**GREEN:** apply the Class A recipe — add
`inline-flex w-fit min-h-tap-min items-center` to the six class strings:
`components/admin/HelpAffordance.tsx:95`, `components/admin/OnboardingWizard.tsx:561`,
`components/messages/ErrorExplainer.tsx:114`,
`components/admin/settings/AdministratorsSection.tsx:131` (keep `p-3` — it is the
disclosure's own padding), **app/me/meShowSections.tsx** (the relocated `me-past-summary`
string, cited pre-move at `app/me/page.tsx:239`),
`components/crew/primitives/RunOfShowList.tsx:82` (inside the template literal).
**NOT `HelpTooltip`** — Class B wins (spec §2.2 precedence); its DI-1 clause goes green in
Task 4.

DI-1 green for the six + DI-2 green (each narrower than container; `w-fit` held). DI-1's
HelpTooltip clause and DI-8/DI-10/DI-15 land in Tasks 3–4 — the spec file gains describes
per task; the whole file is green only after Task 5 (stated here so a partial run is not
misread as done).

**Anti-tautology (per spec §8):** each summary's own `getBoundingClientRect`, never a
container; the "no element under 44px" phrasing is forbidden — iterate and assert each.
Failure mode caught: an unrepaired production class string (harness imports REAL
components, so a repaired-copy-in-harness cannot mask it — that is AC-3b).

Commit: `test(admin): tap-target-floor live-entry harness + DI-1/DI-2; fix(admin,crew-page): Class A summary floors` (two commits if cleaner: harness+RED first is NOT committable alone — failing tests never land; land as one `fix(admin)` commit carrying both)

## Task 3 — StepIndicator split + hover/focus rewiring (DI-3…DI-6, DI-9, DI-13/DI-14 for pills)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor --grep "DI-3|DI-4|DI-9"` ac=AC-2,AC-2b,AC-3 -->

**RED:** add DI-3, DI-4, DI-5, DI-6, DI-9 describes (+DI-13/DI-14 for the pill anchors).
DI-3/DI-4 fail on the unsplit build (28×28 target, no inner span). Premises: exactly three
pill targets; DI-9's centre-hover ≠ resting on the forward-visited pill (`step=2,
maxReachedStep=3` — pill 3 is a visited `<Link>` carrying `group-hover:text-text-strong`
after the rewiring; on active/done pills band-hover == centre-hover vacuously, spec §6.1).

**GREEN:** apply spec §2.2's recipe and class-ownership table to
`components/admin/OnboardingWizard.tsx:126-179`:
- Anchor (target): `-m-2 flex size-tap-min shrink-0 items-center justify-center` +
  `group` + `focusRing` (stays, `components/admin/OnboardingWizard.tsx:128-129`) + `rounded-pill` + `cursor-pointer` +
  existing testid `wizard-step-indicator-${n}`.
- New inner `<span data-testid={`wizard-step-indicator-${n}-visual`}>`: `base` visual
  string (`components/admin/OnboardingWizard.tsx:126-127`) with `hover:text-text-strong` in `pillState` (`components/admin/OnboardingWizard.tsx:157`) rewritten
  `group-hover:text-text-strong`; span carries `rounded-pill`, `items-center
  justify-center shrink-0 flex` per the BOTH rows of the ownership table.
- Unreached pill (`components/admin/OnboardingWizard.tsx:172` `<span aria-disabled="true">`): UNTOUCHED — spec §6.1: growing
  it exceeds the spec.
- Update `tests/components/onboardingWizardNav.test.tsx:274` to assert `bg-accent` on
  `wizard-step-indicator-3-visual`; every other assertion in that file stays
  byte-identical (§3 table above).

DI-5 note (preservation, spec §8): margin-box formula
`rect.width + marginLeft + marginRight === 28 ±0.5` — passes before AND after; do not
"strengthen" it. DI-6: four edge midpoints via `document.elementFromPoint` return the
pill's own anchor, never a sibling (adjacency gap is exactly 0.0 at 320/390 — probe P6).

Commit: `fix(admin): step-pill 44px targets — anchor/span split with group-hover rewiring`

## Task 4 — HelpSheet trigger + close, HelpTooltip (DI-8, DI-10, DI-14, DI-15; DI-1 completes)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor --grep "DI-8|DI-10|DI-15"` ac=AC-1,AC-2,AC-2b -->

**RED:** add DI-8/DI-10/DI-15 describes (+DI-13/DI-14 for these targets; DI-1's
HelpTooltip clause). All fail on the unsplit builds. DI-15 premise: sheet OPEN — the test
clicks `help-sheet-trigger`, awaits the portal dialog (`help-sheet-body`), re-queries the
close button (detach-safety, §4), then measures.

**GREEN:** apply the same recipe with the fused-string split per the ownership table
(spec §2.2 — the table is exhaustive; the residual rule sends unlisted classes to the
span):
- `components/admin/HelpSheet.tsx:68-78` (trigger): target gets `-m-2 inline-flex
  size-tap-min shrink-0 items-center justify-center` + `group` + `cursor-pointer` +
  `focus-visible:*` + `rounded-pill`; inner span (testid `help-sheet-trigger-visual` via
  the component's `testId` prop pattern) gets `size-7`, colors, `align-middle`,
  `transition-colors duration-fast`, `hover:*` → `group-hover:*`.
- `components/admin/HelpSheet.tsx:139-151` (close): same, except the visual is
  **`size-9` (36×36)** and the radius is **`rounded-sm`** on BOTH; the existing `-m-1` is
  **dropped** (no matching padding today — spec §2.2 table row).
- `components/admin/HelpTooltip.tsx:57-63` (summary): Class B recipe ONLY (precedence);
  `list-none` stays on the `<summary>`; `group` on the `<summary>`, NOT the outer
  `<details>` (hovering disclosed content must not light the trigger — spec §2.2).
- DI-9 parity for these two asserts BOTH `color` and `background-color`
  (`hover:bg-surface hover:text-text-strong` — a `color`-only sample passes with
  `group-hover:bg-*` dropped; spec §6).

Commit: `fix(admin): HelpSheet + HelpTooltip 44px targets — fused-string split per ownership table`

## Task 5 — AdminNav brand link (DI-11, DI-12)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor --grep "DI-11|DI-12"` ac=AC-2,AC-2c -->

**RED:** DI-11/DI-12 describes at 320/360/390/440/768/1280. Premise: the "FXAV" span's
measured visibility matches the viewport's expected breakpoint state (`min-[360px]:inline`
— spec §2.2). DI-11 fails on the unrepaired 28px-tall link.

**GREEN:** add `min-h-tap-min -mx-2 px-2` to the brand `<Link>` class string
(`components/admin/nav/AdminNav.tsx:88-114`). **No inner span, no hover rewiring** — the
link has no `hover:` variant (`components/admin/nav/AdminNav.tsx:91`) and its focus ring already sits on the element that
becomes the target (spec §2.2). DI-12 is the cancellation formula
(`marginLeft === -8 && marginRight === -8 && paddingLeft === 8 && paddingRight === 8`),
no baseline (spec §8). No topbar row-height assertion (AC-2c exclusion).

Commit: `fix(admin): AdminNav brand link 44px floor — min-h + cancelling mx/px`

## Task 6 — Transition audit (spec §6.1)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor --grep "transition"` ac=AC-2b -->

This is the plan's **transition-audit task**. Body carries the spec's §6.1 inventory
verbatim: the disclosure pair (collapsed ↔ expanded — instant, native `<details>`); the
six step-pill pairs (three span/Link boundary crossings = instant remounts; three
within-Link pairs = `transition-colors duration-fast`); no pair animates geometry; the
unreached pill has neither target nor span; and the four compound rows (colour-while-
hovered, colour-while-focus-visible, hover-enters-over-band, summary-toggled-while-
hovered).

**Conditional-render inventory (doctrine requirement, enumerated against live code):**
the touched components contain NO `AnimatePresence`; the swap points are
`StepIndicator`'s span/Link ternary (`components/admin/OnboardingWizard.tsx:161-179`),
`RunOfShowList`'s `isLong` ternary (`components/crew/primitives/RunOfShowList.tsx:79-89`),
`HelpSheet`'s portal mount (`components/admin/HelpSheet.tsx:120`), and the conditional
disclosures listed in spec §3 — all deliberately instant, none gains transition props.

**RED then GREEN (assertions extend the standalone spec):**
- Summary toggled while hovered: hover `help-affordance-trigger`, click, assert
  `details.open` flips AND the `hover:underline` computed `text-decoration` persists
  across the toggle (element not remounted — spec §6.1). Fails if the repair remounts
  the summary (e.g. a key change) — its concrete failure mode.
- Band-hover compound: covered by DI-9 (Task 3) — cross-referenced, not duplicated.
- Pill crossfade target under hover: on the forward-visited pill, with pointer parked in
  the expansion band, assert the span's computed `transition-property` still contains
  `color` (crossfade wiring survived the class move).

(The instant span/Link remount pairs need no assertion: remounting is React semantics,
and asserting non-animation of a remount proves nothing — stated so a reviewer does not
ask for six vacuous tests. The inventory rows above are the complete set with
discriminating power.)

Commit: `test(admin): transition audit — toggle-under-hover persistence + crossfade wiring`

## Task 7 — Heading promotion (spec §2.3)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx` ac=AC-4 -->

**RED:** add to `tests/components/admin/wizard/Step3Review.test.tsx` (jsdom — structural,
not dimensional): render the page fixture (`tests/components/admin/wizard/_step3ReviewFixture.ts`)
with BOTH promoted sections present; **premise:** both `wizard-step3-heading`-adjacent
sections render their headings (`premiseHolds` on the two `h2`s being found — spec §8
premise table row 2); then collect ALL heading tags in document order and assert the
level sequence never skips (derive: `h1 → h2 → h2` passes; `h1 → h3` fails). Asserting
"an h2 exists" is forbidden (spec §8 anti-tautology — passes on a page that also skips
to h4). Fails today: sequence is `h1, h3, h3` (DEFERRED.md:47-52 probe).

**GREEN:** `components/admin/wizard/Step3Review.tsx:749` `h3` → `h2`;
`components/admin/wizard/Step3Review.tsx:1406` `h3` → `h2`. Class strings byte-identical
(spec §2.3 font-size guard — a visual diff is a defect). `aria-labelledby` wiring
unchanged (`components/admin/wizard/Step3Review.tsx:1295`, `components/admin/wizard/Step3Review.tsx:1400`). `step3ReviewSections.tsx:897` NOT touched (ratified R3).

Commit: `fix(admin): promote Step3Review page section headings h3 -> h2 (no visual change)`

## Task 8 — Diagram tile single accessible name (spec §2.4)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx` ac=AC-5 -->

**RED:** rewrite the three tests exactly per spec §2.4's table —
`tests/components/admin/wizard/step3ReviewSections.test.tsx:899` (img alt → `""`, ADD
anchor `aria-label` fallback assertion), `step3ReviewSections.test.tsx:906` (img alt → `""`, both existing anchor
assertions unchanged — the "never a nameless link" contract), `step3ReviewSections.test.tsx:919` (img alt → `""`,
anchor assertion unchanged, test RENAMED to state the anchor-names-the-tile contract).
All three fail against the unrepaired component (img still carries the alt).

**GREEN:** `components/admin/wizard/step3ReviewSections.tsx:3704-3724` — inner `<img>`
becomes `alt=""`; the anchor's `aria-label` logic at `components/admin/wizard/step3ReviewSections.tsx:3706` is UNCHANGED including the
empty-alt fallback and new-tab suffix.

Commit: `fix(admin): diagram tile names itself once — img decorative, anchor keeps the name`

## Task 9 — BellPanel internal-link glyph (spec §2.5)

<!-- task: red=`pnpm vitest run tests/components/admin/bellPanelHelpLink.test.tsx` ac=AC-6 -->

**RED:** extend `tests/components/admin/bellPanelHelpLink.test.tsx` with both
link-rendering branches (spec §3): the health entry, AND the non-health entry that is the
watch code with `viewerIsDeveloper` true (`components/admin/BellPanel.tsx:318`, `components/admin/BellPanel.tsx:289` —
the ONLY non-health state that renders the link). **Premise per fixture:** the telemetry
link IS present before asserting glyph absence — without it the non-health case renders
no link and passes on an unrepaired build (spec §8). Assert no `↗` text within the link.
Both fail today.

**GREEN:** drop the `<span aria-hidden="true">↗</span>` from
`components/admin/BellPanel.tsx:324-329`. Link text and destination unchanged.

Commit: `fix(admin): BellPanel telemetry link drops the external-tab glyph (internal route)`

## Task 10 — Ledger dispositions (spec header + §9.1)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts` ac=AC-7 -->

Docs task; TDD shape is verify-after (no failing-first state exists for prose edits — the
meta-suite above pins the invariants and must be green after every step).

1. `DEFERRED.md`: strike items (a)(b)(c) from `STEP3-GALLERY-TAP-TARGETS-1` with a
   pointer to the spec; item (d) and its un-defer trigger stay; entry NOT archived; its
   IN PROGRESS marker STAYS (comes off in the PR's last commit — invariant 12).
2. Move `NEWTAB-A11Y-RESIDUE-1` to `DEFERRED-archive.md` **removing its IN PROGRESS
   marker in this same commit** (archives reject in-flight entries).
3. `BACKLOG.md`: add `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` (exception (a) — per-site
   product judgment under `PRODUCT.md:59`'s inline-prose exception; the eight sites +
   computed heights from spec §2.6; **Reachability: PROBED**) and
   `BL-TAP-TARGET-STRUCTURAL-GUARD` (exception (c); the 340/139/94 counts + six-bucket
   table; first scheduled step = the non-literal-className policy decision;
   **Reachability: PROBED**).
4. NO structural guard ships (AC-7).

Commit: `docs(plan): ledger dispositions — archive NEWTAB-A11Y-RESIDUE-1, strike (a)-(c), file two BL entries`

## Task 11 — Close-out gates

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor` ac=AC-8 -->

1. **Full verification battery** (pre-push gates, all mandatory): full vitest suite;
   `pnpm exec tsc --noEmit` (vitest strips types; playwright tsconfig too); `pnpm exec
   eslint .`; `pnpm exec prettier --check .`; the full standalone spec at every viewport
   (the red= command above — green here, all DIs); `pnpm vitest run tests/docs/` (ledger
   + corpus + invariant-8 after the marker fill below).
2. **Spec §11 mechanical checklist** re-verified on the diff (no em-dash copy, literal
   apostrophes, canonical type classes carried verbatim, no new color token).
3. **Impeccable dual gate** (invariant 8): `/impeccable critique` then
   `/impeccable audit` on the affected diff, canonical v3 setup gates. P0/P1 fixed or
   deferred via `DEFERRED.md` entries; findings + dispositions recorded in §12 below;
   **replace this plan's PENDING marker line with real counts** in the same commit.
4. Whole-diff cross-model review (codex-guard, `--stage diff`) to APPROVE — dispatched by
   the implementation session per its brief; class-sweep every finding shape before
   resubmitting.
5. Stage 4.4 (implementation brief): STEP3-GALLERY marker off in the PR's last commit;
   push; real CI green; merge; `0 0` verify; CronDelete + label clear.

<!-- tasks: end -->

---

## 12. Impeccable gate findings + dispositions

(Filled at Task 11. The marker at the top of this file is updated from PENDING to real
counts in the same commit.)
