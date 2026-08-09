# Plan — Step-3 a11y cluster: sub-44px targets and a skipped heading level

**Spec:** `docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` (canonical; adversarially APPROVEd at spec R8; this plan never supersedes it — spec §1.1 R1–R10 are ratified and not relitigated here)
**Branch:** `fix/step3-a11y-cluster`
**Closes:** `NEWTAB-A11Y-RESIDUE-1` (fully — archived); `STEP3-GALLERY-TAP-TARGETS-1` items (a)(b)(c) (struck; (d) stays deferred)

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded

(The marker followed the `2026-08-03-nojs-loading-shell-notice.md` lifecycle: PENDING
while the arc was live, replaced with real counts in the close-out commit after both gate
halves ran. While it read PENDING, `tests/docs/_metaInvariant8Closeout.test.ts` reported it
as malformed — the expected mid-arc state, resolved at Task 10 step 2. **Interim "full
suite green" checkpoints (Tasks 1–9) therefore meant: green except EXACTLY that one
declared failure** — one test, this file's marker line, nothing else; any other red was a
real defect. Task 10 step 3's battery runs AFTER this fill and tolerates nothing (R3 F1).)

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
  that archives it** (Task 9 — archives categorically reject in-flight entries).
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
| AC-4 (heading sequence skips no level, document order) | Task 6 |
| AC-5 (diagram tile: one accessible name; blank alt still named) | Task 7 |
| AC-6 (no internal link renders `↗`) | Task 8 |
| AC-7 (two ledger filings with named exceptions; NO structural guard ships) | Filed with the plan-R1 repair commit; Task 9 verifies + strikes/archives |
| AC-8 (impeccable dual gate) | Task 10 |

## 2. Meta-test inventory (mandatory declaration)

- **CREATES:** none. The repo-wide tap-target guard is DESCOPED and FILED
  (spec §5, AC-7 — an implementation that adds one has exceeded the spec).
- **EXTENDS:** `tests/e2e/_metaFontWaitCoverage.test.ts` — its `CALLERS` list is a MANUAL
  registry (`tests/e2e/_metaFontWaitCoverage.test.ts:30`); Task 2 enrolls the new spec's
  stem and satisfies its fonts-awaited analysis (R1 F5). The sibling
  `tests/e2e/_metaFontFidelityWiring.test.ts` is filesystem-walked (fails-by-default on
  any new spec containing `compileEntryCss`, `tests/e2e/_metaFontFidelityWiring.test.ts:27`)
  — not extended, satisfied by importing `test` from `./helpers/fontFidelityFixture`.
- **N/A with reasons** (mirrors spec §5): no Supabase call boundary
  (`tests/auth/_metaInfraContract.test.ts`) — no Supabase client call is added or moved
  (the extraction moves only presentational functions; `app/me/page.tsx` keeps every
  server call). No advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`)
  — no `pg_advisory*` in scope. No mutation surface
  (`tests/log/_metaMutationSurfaceObservability.test.ts`) — no route handler or
  `"use server"` action added or modified; every change is presentational.
- **Affected but not extended:** `tests/ci/_metaSpecRegistration.test.ts` +
  `tests/e2e/standalone-baseline.json` (identity-multiset baseline regenerated in each
  of Tasks 2–5 — R2 F1, mechanics in Task 2), `tests/docs/_metaLedgerInProgress.test.ts`,
  `tests/docs/_metaLedgerReferentialIntegrity.test.ts` (Task 9 edits must keep them
  green; the referential-integrity suite was RED on this branch until the two
  `BL-TAP-TARGET-*` rows — cited by the committed spec — were filed in `BACKLOG.md` in
  the same commit as this plan revision, R1 F6), `tests/styles/_metaBgAccentInventory.test.ts`
  (Task 1 moves the `app/me/page.tsx` row with the extraction, R1 F4),
  `tests/docs/_metaInvariant8Closeout.test.ts` (marker lifecycle above),
  `tests/docs/_metaReviewRoundEconomy.test.ts` (corpus rows appended by every review
  dispatch; filing updated when counts change).

## 3. Existing-test impact (pre-verified against live code)

| Test | Impact |
| --- | --- |
| `tests/components/onboardingWizardNav.test.tsx:274` — `active.className` contains `bg-accent` | **Updates in Task 3**: visual classes move to the inner span; assertion re-targets `wizard-step-indicator-3-visual`. |
| `tests/components/onboardingWizardNav.test.tsx:146-153, 280-286` — tagName `A`, `aria-current`, `aria-disabled`, href on `wizard-step-indicator-N` | **Unchanged** — the testid stays on the target element (anchor/span), which keeps every reachability assertion byte-identical. |
| `tests/components/onboardingWizardNav.test.tsx:276` — `done1.querySelector("svg")` | **Unchanged** — `querySelector` descends into the new inner span. |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx:899, 906, 919` | **Rewritten in Task 7** exactly per spec §2.4's three-row table (img `alt` → `""`; anchor assertions preserved; **all THREE test names updated** to state the new contract — spec §2.4: "Each test's name is updated"; R3 F3). |
| `tests/components/admin/bellPanelHelpLink.test.tsx` | **Extended in Task 8** — glyph-absence + link-present premise on both rendering branches. No existing assertion pins the `↗`. |
| `tests/e2e/me-page.spec.ts` | **Must stay green untouched** after Task 1 — the extraction is a pure relocation; this spec is the regression net for `/me` rendering. |
| `tests/e2e/step3-review-page.layout.spec.ts:203-216` | **Re-run as DI-7** (preservation invariant; spec §8 exempts it from discriminating-form). Not edited. |
| `tests/styles/_metaBgAccentInventory.test.ts:86` — `L("app/me/page.tsx", 0, "bg-accent text-accent-text")` | **Row moves in Task 1** to **app/me/meShowSections.tsx** (the extraction relocates `chipToneClass`'s occurrence; the guard reports both the unregistered new occurrence and the stale row). |
| `tests/e2e/_metaFontFidelityWiring.test.ts` (filesystem-walked) + `tests/e2e/_metaFontWaitCoverage.test.ts:30` (`CALLERS`) | **Fail-by-default / enrolled in Task 2** — the new spec imports `test` from `./helpers/fontFidelityFixture` (never `@playwright/test`), awaits `document.fonts.ready` between navigation and measurement, and adds its stem to `CALLERS`. |
| `tests/ci/_metaSpecRegistration.test.ts:82` + `tests/e2e/standalone-baseline.json` (comparator `scripts/check-standalone-baseline.mjs:180`) | **Regenerated in EACH of Tasks 2–5** (`node scripts/check-standalone-baseline.mjs --write`, JSON committed with the growth commit) — the baseline pins per-file test-identity multisets exactly, so every commit that adds describes fails it until regenerated (R2 F1). |
| `tests/components/admin/HelpSheet.test.tsx`, `tests/components/admin/PreviewBannerHelpAffordance.test.tsx`, `tests/components/ErrorExplainer.test.tsx`, `tests/app/admin/admins-page-developer.test.tsx`, `tests/app/admin/settings-developer-visibility.test.tsx`, crew `ScheduleSection.*.test.tsx` | **Expected unchanged** (class-string additions don't alter structure/naming). Task-level rule: if any needs editing beyond a class-string literal, STOP and check the spec's R6 "looks different = defect" fence before touching it. |

## 4. Harness architecture (one section, referenced by Tasks 1–5)

New standalone Playwright spec **tests/e2e/tap-target-floor.layout.spec.ts** with live
entry **tests/e2e/_tapTargetFloorLiveEntry.tsx**, modeled on
`tests/e2e/attention-pill-focus.spec.ts:30-90`:

- **Boot:** `mkdtemp` workdir; static live.html shell; bundle built out-of-process via
  `execFileSync(node, tests/e2e/_step3ReviewModalBundle.mjs, <entry>, <outfile>, tsconfig.json)`
  (the bundler is UNMODIFIED — spec §8, ratified R10); Tailwind CSS compiled through
  `compileEntryCss` with `@source` lines for **every** directory the entry's import graph
  paints from: `components/admin` (recursive — covers `nav`, `settings`, `wizard`),
  `components/messages`, `components/crew/primitives`, **`components/layout`**
  (`AdminNav` always renders `ThemeToggle` from there,
  `components/admin/nav/AdminNav.tsx:38` — R1 F5), `app/me`, and the entry file itself.
  A missing `@source` silently drops the repaired utilities from the stylesheet and
  every DI fails with a misleading rect — list is part of Task 2's body.
- **Font meta-guard compliance (R1 F5):** the spec file imports `test` from
  `./helpers/fontFidelityFixture` — NEVER `@playwright/test` — because
  `tests/e2e/_metaFontFidelityWiring.test.ts:27` walks every `*.spec.ts` containing
  `compileEntryCss` and fails-by-default on the wrong binding. It awaits
  `document.fonts.ready` between navigation and first measurement, and its stem is
  enrolled in the `CALLERS` registry at `tests/e2e/_metaFontWaitCoverage.test.ts:30`
  (manual list — a forgotten row is silent, which is why it is named here and in Task 2).
- **Readiness gate:** the entry sets `data-harness-ready="true"` on `document.body` after
  `createRoot(...).render(...)` commits (via a `useEffect` in a top-level wrapper);
  every test awaits `page.waitForSelector('body[data-harness-ready="true"]')`, then
  `document.fonts.ready`, before its first assertion. Never `networkidle`.
- **Detach-safety:** the harness never unmounts anything except the HelpSheet dialog
  (opened by a real click in the DI-15 test). All rect/style sampling runs through
  `locator.evaluate` on elements that exist for the page's whole life; the DI-15 test
  re-queries after the open-click rather than holding a pre-click handle.
- **Mounts (spec §8, all states from §3):** `HelpAffordance` (code with non-null
  `helpfulContext`); `OperatorErrorBlock` (exported in Task 2 — its RED is this harness bundle failing on the unexported symbol) with `helpfulContext`
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

### 4.1 Transition audit (doctrine task, distributed — R1 F2)

This is the plan's **transition-audit content**. It is NOT a standalone task: a
transition-audit task sequenced after the repair tasks would assert only already-landed
work — no RED state exists, which R1 F2 correctly flagged. Instead the assertions land in
the task that creates their subject, and this section is the audit's single home: the
inventory, the conditional-render enumeration, and the placement map.

**Inventory (spec §6.1, verbatim charter):** disclosure pair collapsed ↔ expanded =
instant, native `<details>`; six step-pill pairs — three span/Link boundary crossings =
instant remounts, three within-`<Link>` pairs = `transition-colors duration-fast`; no
pair animates geometry; the unreached pill has neither target nor span; four compound
rows (colour-while-hovered, colour-while-focus-visible, hover-enters-over-band,
summary-toggled-while-hovered).

**Conditional-render / animation enumeration (corrected against live code — R1 F3):**
the touched components contain NO `AnimatePresence` (grepped). Swap points:
`StepIndicator`'s span/Link ternary (`components/admin/OnboardingWizard.tsx:161-179`),
`RunOfShowList`'s `isLong` ternary (`components/crew/primitives/RunOfShowList.tsx:79-89`),
and the conditional disclosures listed in spec §3 — instant, none gains transition props.
**`HelpSheet`'s portal mount is NOT instant and is NOT claimed to be:** the overlay
animates its scrim (`motion-safe:animate-[step3-details-scrim-in_160ms_ease-out]`,
`components/admin/HelpSheet.tsx:125`) and the sheet rises
(`motion-safe:animate-[sheet-rise_220ms_cubic-bezier(...)]`,
`components/admin/HelpSheet.tsx:133`). **Treatment: preserved untouched.** Task 4 edits
the trigger (`components/admin/HelpSheet.tsx:68-78`) and close-button (`components/admin/HelpSheet.tsx:139-151`) class
strings only; lines 120–137 are byte-identical in the diff, verified at Task 4, and the
DI-15 open-click flow exercises the animated open path in-browser.

**Assertion placement map:**

| Assertion | Shape | Lands in |
| --- | --- | --- |
| Summary toggled while hovered: hover `help-affordance-trigger`, click, `details.open` flips AND `hover:underline` computed `text-decoration` persists (element not remounted). Failure mode: a repair that remounts the summary (e.g. a key change). | Preservation — passes before AND after the repair; chartered by spec §6.1's "no transition is added, removed, or retimed" | Task 2 |
| `<details>` toggles under `display: inline-flex` (probe P2's committed form) | Preservation, same charter | Task 2 |
| Band-hover == centre-hover on the forward-visited pill (both ≠ resting) | Discriminating — fails without `group`/`group-hover:` rewiring | Task 3 (DI-9) |
| Pill crossfade wiring survives the class move: with pointer parked in the expansion band, the visual span's computed `transition-property` contains `color` | Discriminating — fails pre-split (no span exists) | Task 3 |

The two preservation-shaped rows are NOT additions to spec AC-3b's exemption list — that
list scopes the DI set only (DI-5, DI-7, complete). These are §6.1 behaviour-unchanged
assertions; spec §6.1 is their charter. The instant span/Link remount pairs get no
assertion: remounting is React semantics, and asserting non-animation of a remount proves
nothing — stated so a reviewer does not ask for six vacuous tests.

---

<!-- tasks: depth=2 -->

## Task 1 — Extraction seam (spec §8, ratified R10; probe P7)

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
3. **Move the path-keyed style-registry row (R1 F4):** `chipToneClass` owns the
   `bg-accent text-accent-text` occurrence registered at
   `tests/styles/_metaBgAccentInventory.test.ts:86` as
   `L("app/me/page.tsx", 0, ...)` — the extraction relocates it, and the guard reports
   both the unregistered new occurrence and the stale row. Rewrite the row to
   `L("app/me/meShowSections.tsx", 0, "bg-accent text-accent-text")` in this commit.
   (Registry-sweep note: the OnboardingWizard and Step3Review rows in the same registry
   are unaffected — Task 3 moves classes within the SAME file preserving occurrence
   order/count, and Task 6 changes tags only. The em-dash, new-tab-announcement, and
   ring-offset registries key no row this diff moves: BellPanel carries no `target` and
   the diagram anchor's aria-label logic is unchanged.)

**Verify:** new test green; `pnpm exec tsc --noEmit`;
`pnpm vitest run tests/styles/_metaBgAccentInventory.test.ts`; full vitest suite green per the header rule (sole tolerated red: the declared invariant-8 marker failure)
(`tests/e2e/me-page.spec.ts` runs env-bound in CI and is the /me regression net — do not
edit it). Zero behavior change is the contract: `git diff` on `app/me/page.tsx` shows
only deletions of the moved functions plus one import.

Commit: `refactor(crew-page): extract MeShowSections to app/me/meShowSections.tsx (spec §8 seam)`

## Task 2 — Harness + layout-dimensions spec + Class A repairs (six summaries)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor` ac=AC-1,AC-3b -->

This is the plan's **layout-dimensions task**. Body carries the spec's exact Dimensional
Invariants list (§6): DI-1 through DI-15 as written there, including the DI-2 six-of-seven
scoping (`HelpTooltip` exempt by construction, width pinned by DI-10), the DI-5/DI-12
margin-box formulas, DI-9's per-site property enumeration (both `color` AND
`background-color` for HelpSheet trigger and HelpTooltip; `color` only for the step pill),
DI-13's computed-style (not geometry) measurement, DI-14's non-zero AND equal radius, and
the corner-exclusion rule (edge midpoints only — probe P4 measured corners unreliable).

**Growth-and-green discipline (R1 F1), binding on Tasks 2–5:** the standalone spec file
grows per task, and every task's RED command is the WHOLE file
(`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor`) —
no `--grep` selection, so nothing a task adds can be silently skipped. The RED run
(before the task's production edit) fails on exactly the task's new describes; the
committed state is the whole file green. No commit ever carries a red or
expected-failing assertion.

**Baseline regeneration rides every growth commit (R2 F1):** the committed
`tests/e2e/standalone-baseline.json` pins the standalone suite's per-file test-identity
multisets exactly — new files AND changed identity sets both fail the comparator
(`scripts/check-standalone-baseline.mjs:180`, run by
`tests/ci/_metaSpecRegistration.test.ts:82` and by the standalone CI workflow). Each of
Tasks 2–5 changes the new spec's identities, so EACH of those commits regenerates the
baseline (`node scripts/check-standalone-baseline.mjs --write`) and commits the JSON,
then verifies with `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts`.

**DI-1's seven-summary scope lands in two steps, stated so neither looks like a
weakening:** this task's DI-1 describe iterates the six Class-A summaries; Task 4
EXTENDS the same describe to `HelpTooltip` (the seventh) in the commit that repairs it.
The premise (rendered `<summary>` count == 7) is asserted from THIS task onward; spec
§6 DI-1's full seven-element claim is green at Task 4 and stays green through close-out.

**This task's TDD runs in TWO explicit stages (R4 F1) — the bundle gate, then the
dimension gate; neither is guessed:**

**RED-a (bundle gate):** build the new _tapTargetFloorLiveEntry.tsx + the new tap-target-floor.layout.spec.ts per §4
above, with the premise set, the DI-1 (six Class-A) + DI-2 describes, and the two
preservation transition assertions from §4.1's placement map (toggle-under-hover
persistence; `<details>` toggles under `inline-flex`). Add the stem to
`tests/e2e/standalone.config.ts:86` testMatch, import `test` from
`./helpers/fontFidelityFixture`, await `document.fonts.ready`, and enroll the stem in
the `_metaFontWaitCoverage` `CALLERS` registry — all in this commit (§4). Run the spec:
it fails IN `beforeAll`, at the bundle step —
`No matching export in "components/admin/OnboardingWizard.tsx" for import
"OperatorErrorBlock"` — because the symbol is private
(`components/admin/OnboardingWizard.tsx:547`). That build failure IS the export's
failing-first consumer (R3 F2).

**GREEN-a:** add `export` + the precedent comment
(`components/admin/OnboardingWizard.tsx:112-114` pattern) to `OperatorErrorBlock`.

**RED-b (dimension gate):** re-run the spec. The bundle now builds and the browser
mounts; premises pass (7 summaries mount, unrepaired); DI-1 FAILS (20.3px / 16.8px
heights — spec §2.1 table). "Fails on exactly the task's new describes" refers to THIS
run.

**GREEN-b:** apply the Class A recipe — add
`inline-flex w-fit min-h-tap-min items-center` to the six class strings:
`components/admin/HelpAffordance.tsx:95`, `components/admin/OnboardingWizard.tsx:561`,
`components/messages/ErrorExplainer.tsx:114`,
`components/admin/settings/AdministratorsSection.tsx:131` (keep `p-3` — it is the
disclosure's own padding), **app/me/meShowSections.tsx** (the relocated `me-past-summary`
string, cited pre-move at `app/me/page.tsx:239`),
`components/crew/primitives/RunOfShowList.tsx:82` (inside the template literal).
**NOT `HelpTooltip`** — Class B wins (spec §2.2 precedence); its repair and its DI
coverage are Task 4's.

**Anti-tautology (per spec §8):** each summary's own `getBoundingClientRect`, never a
container; the "no element under 44px" phrasing is forbidden — iterate and assert each.
Failure mode caught: an unrepaired production class string (harness imports REAL
components, so a repaired-copy-in-harness cannot mask it — that is AC-3b).

Commit: `fix(admin): Class A summary floors + tap-target-floor live-entry harness (DI-1 six, DI-2)`

## Task 3 — StepIndicator split + hover/focus rewiring (DI-3…DI-6, DI-9, DI-13/DI-14 for pills)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor` ac=AC-2,AC-2b,AC-3 -->

**RED (whole-file run, per Task 2's growth-and-green discipline):** add DI-3, DI-4, DI-5,
DI-6, DI-9 describes, DI-13/DI-14 for the pill anchors, and §4.1's two discriminating
transition assertions (band-hover parity; span `transition-property` contains `color`).
DI-3/DI-4 fail on the unsplit build (28×28 target, no inner span); Task 2's describes
stay green. Premises: exactly three pill targets; DI-9's centre-hover ≠ resting on the
forward-visited pill (`step=2, maxReachedStep=3` — pill 3 is a visited `<Link>` carrying
`group-hover:text-text-strong` after the rewiring; on active/done pills band-hover ==
centre-hover vacuously, spec §6.1).

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

**Verify additionally (AC-3 / DI-7):** re-run the pre-existing overflow pin —
`pnpm exec playwright test --config tests/e2e/standalone.config.ts step3-review-page` —
green after the split (`tests/e2e/step3-review-page.layout.spec.ts:203-216`, not edited).

Commit: `fix(admin): step-pill 44px targets — anchor/span split with group-hover rewiring`

## Task 4 — HelpSheet trigger + close, HelpTooltip (DI-8, DI-10, DI-14, DI-15; DI-1 completes)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor` ac=AC-1,AC-2,AC-2b -->

**RED (whole-file run):** add DI-8/DI-10/DI-15 describes, DI-13/DI-14 for these targets,
and EXTEND the DI-1 describe to `HelpTooltip` (completing spec §6 DI-1's seven — Task 2's
two-step note). All fail on the unsplit builds; earlier tasks' describes stay green.
DI-15 premise: sheet OPEN — the test clicks `help-sheet-trigger`, awaits the portal
dialog (`help-sheet-body`), re-queries the close button (detach-safety, §4), then
measures.

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
- **Portal animations preserved (§4.1, R1 F3):** the scrim and sheet-rise animations at
  `components/admin/HelpSheet.tsx:125` and `components/admin/HelpSheet.tsx:133` are NOT
  part of this repair — verify those lines are byte-identical in the diff. The DI-15
  open-click exercises the animated open path in-browser.

Commit: `fix(admin): HelpSheet + HelpTooltip 44px targets — fused-string split per ownership table`

## Task 5 — AdminNav brand link (DI-11, DI-12)

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor` ac=AC-2,AC-2c -->

**RED (whole-file run):** DI-11/DI-12 describes at 320/360/390/440/768/1280 — the file's
final describes; after this task's GREEN the whole spec is green and stays green.
Premise: the "FXAV" span's
measured visibility matches the viewport's expected breakpoint state (`min-[360px]:inline`
— spec §2.2). DI-11 fails on the unrepaired 28px-tall link.

**GREEN:** add `min-h-tap-min -mx-2 px-2` to the brand `<Link>` class string
(`components/admin/nav/AdminNav.tsx:88-114`). **No inner span, no hover rewiring** — the
link has no `hover:` variant (`components/admin/nav/AdminNav.tsx:91`) and its focus ring already sits on the element that
becomes the target (spec §2.2). DI-12 is the cancellation formula
(`marginLeft === -8 && marginRight === -8 && paddingLeft === 8 && paddingRight === 8`),
no baseline (spec §8). No topbar row-height assertion (AC-2c exclusion).

Commit: `fix(admin): AdminNav brand link 44px floor — min-h + cancelling mx/px`

## Task 6 — Heading promotion (spec §2.3)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx` ac=AC-4 -->

**RED:** add to `tests/components/admin/wizard/Step3Review.test.tsx` (jsdom — structural,
not dimensional): render the page fixture (`tests/components/admin/wizard/_step3ReviewFixture.ts`)
with BOTH promoted sections present. **Premise — TAG-AGNOSTIC, so it holds on the
unrepaired build too (R5 F1):** a premise phrased "find two `h2`s" encodes the
POST-repair state and makes RED die at the premise, misreporting the production defect
as an invalid environment (`tests/_shared/premise.ts:36` — "not a claim that the code
under test is wrong"). Instead, `premiseHolds` locates both promoted headings
structurally, by identity rather than tag: (a) the element with
`id="wizard-step3-needs-attention-heading"` (`components/admin/wizard/Step3Review.tsx:1407`
— the id sits on the heading itself and survives the tag change); (b) at least one
grouped-rows section present (`wizard-step3-ignored` / `wizard-step3-deferred` /
`wizard-step3-skipped`, rendered at `components/admin/wizard/Step3Review.tsx:1467-1484`)
with a heading element (`h1`–`h6`) inside it — the `components/admin/wizard/Step3Review.tsx:749` code site renders through all
three. This is spec §8's "both promoted h2s present" premise expressed in the only form
that can execute at RED. THEN collect ALL heading tags in document order and assert the
level sequence never skips (derive: `h1 → h2 → h2` passes; `h1 → h3` fails). Asserting
"an h2 exists" is forbidden (spec §8 anti-tautology — passes on a page that also skips
to h4). RED run: premise passes (headings exist, as `h3`), sequence check fails on
`h1, h3, …` (DEFERRED.md:47-52 probe).

**GREEN:** `components/admin/wizard/Step3Review.tsx:749` `h3` → `h2`;
`components/admin/wizard/Step3Review.tsx:1406` `h3` → `h2`. Class strings byte-identical
(spec §2.3 font-size guard — a visual diff is a defect). `aria-labelledby` wiring
unchanged (`components/admin/wizard/Step3Review.tsx:1295`, `components/admin/wizard/Step3Review.tsx:1400`). `step3ReviewSections.tsx:897` NOT touched (ratified R3).

Commit: `fix(admin): promote Step3Review page section headings h3 -> h2 (no visual change)`

## Task 7 — Diagram tile single accessible name (spec §2.4)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx` ac=AC-5 -->

**RED:** rewrite the three tests exactly per spec §2.4's table —
`tests/components/admin/wizard/step3ReviewSections.test.tsx:899` (img alt → `""`, ADD
anchor `aria-label` fallback assertion), `step3ReviewSections.test.tsx:906` (img alt → `""`, both existing anchor
assertions unchanged — the "never a nameless link" contract), `step3ReviewSections.test.tsx:919` (img alt → `""`,
anchor assertion unchanged). **ALL THREE test names are updated to state the new
contract** — spec §2.4: "Each test's name is updated to state the new contract; leaving
a name that promises the old one is how the next reader concludes the change was a
mistake." The :899 name stops describing an img-alt fallback, the :906 name stops
promising "BOTH the img alt and the anchor aria-label", and :919 states the
anchor-names-the-tile contract (R3 F3). All three fail against the unrepaired component
(img still carries the alt).

**GREEN:** `components/admin/wizard/step3ReviewSections.tsx:3704-3724` — inner `<img>`
becomes `alt=""`; the anchor's `aria-label` logic at `components/admin/wizard/step3ReviewSections.tsx:3706` is UNCHANGED including the
empty-alt fallback and new-tab suffix.

Commit: `fix(admin): diagram tile names itself once — img decorative, anchor keeps the name`

## Task 8 — BellPanel internal-link glyph (spec §2.5)

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

## Task 9 — Ledger dispositions (spec header + §9.1)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts` ac=AC-7 -->

Docs task; TDD shape is verify-after (no failing-first state exists for prose edits — the
meta-suite above pins the invariants and must be green after every step).

1. `DEFERRED.md`: strike items (a)(b)(c) from `STEP3-GALLERY-TAP-TARGETS-1` with a
   pointer to the spec; item (d) and its un-defer trigger stay; entry NOT archived; its
   IN PROGRESS marker STAYS (comes off in the PR's last commit — invariant 12).
2. Move `NEWTAB-A11Y-RESIDUE-1` to `DEFERRED-archive.md` **removing its IN PROGRESS
   marker in this same commit** (archives reject in-flight entries).
3. **The two `BL-TAP-TARGET-*` rows are ALREADY FILED** — `BACKLOG.md` gained
   `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` (exception (a), eight sites + heights,
   Reachability PROBED) and `BL-TAP-TARGET-STRUCTURAL-GUARD` (exception (c), 340/139/94
   counts, first step = the non-literal-className policy decision, Reachability PROBED)
   in the plan-R1 repair commit, because the committed spec already cited both ids and
   `tests/docs/_metaLedgerReferentialIntegrity.test.ts:394` fails any cited id with no
   ledger definition (R1 F6 — the suite was red on the branch until then). This task
   VERIFIES both rows still match spec §9.1 and does not re-file them.
4. NO structural guard ships (AC-7).

Commit: `docs(plan): ledger dispositions — archive NEWTAB-A11Y-RESIDUE-1, strike (a)-(c)`

## Task 10 — Close-out gates

<!-- task: red=`pnpm exec playwright test --config tests/e2e/standalone.config.ts tap-target-floor` ac=AC-8 -->

**Gates task — verify-after shape, like Task 9 (R3 F2):** no failing-first state exists;
the red= command above is the close-out battery's standalone-suite leg (green here, all
DIs — it went green at Task 5 and staying green is what this task verifies), not a RED
expectation. **Ordered so every gate runs against a fully-valid tree (R3 F1):**

1. **Spec §11 mechanical checklist** re-verified on the diff (no em-dash copy, literal
   apostrophes, canonical type classes carried verbatim, no new color token).
2. **Impeccable dual gate** (invariant 8): `/impeccable critique` then
   `/impeccable audit` on the affected diff, canonical v3 setup gates. P0/P1 fixed or
   deferred via `DEFERRED.md` entries; findings + dispositions recorded in §12 below;
   **replace this plan's PENDING marker line with real counts** in the same commit —
   from this commit on, NO tolerated red remains anywhere.
3. **Full verification battery** (pre-push gates, all mandatory, AFTER the marker fill
   so everything is green with zero exemptions): full vitest suite (including
   `tests/docs/` — ledger + corpus + invariant-8, now valid); `pnpm exec tsc --noEmit`
   (vitest strips types; playwright tsconfig too); `pnpm exec eslint .`; `pnpm exec
   prettier --check .`; the full standalone spec at every viewport.
4. Whole-diff cross-model review (codex-guard, `--stage diff`) to APPROVE — dispatched by
   the implementation session per its brief; class-sweep every finding shape before
   resubmitting.
5. Stage 4.4 (implementation brief): STEP3-GALLERY marker off in the PR's last commit;
   push; real CI green; merge; `0 0` verify; CronDelete + label clear.

<!-- tasks: end -->

---

## 12. Impeccable gate findings + dispositions

Run 2026-08-08 on the whole diff against merge-base `61281c23e8ce`, scoped to the thirteen
invariant-8 UI-surface files, and **RE-RUN 2026-08-09 over the post-gate delta** (§12.5).
Canonical v3 setup gates ran first: `context.mjs` loaded `PRODUCT.md` + `DESIGN.md`, and the
**product** register was read (this is admin/app UI — design serves the product), plus
`reference/critique.md` and `reference/audit.md`.

### 12.0 Provenance — ⚠️ DEGRADED, declared rather than silent

`reference/critique.md` requires Assessments A (design review) and B (detector evidence) to
run as two isolated sub-agents. **They were dispatched and did not return**, through two
status requests and ~18 minutes of waiting; a third agent dispatched for the audit half did
not return either. The gate was therefore completed **single-context**, which the reference
permits only with a declared banner. This is that banner. It is recorded here rather than
in chat because the disposition record is what a later reviewer reads.

What the degradation costs and does not cost: the detector half is deterministic and was
run directly with the same command and scope, so Assessment B lost nothing but isolation.
The design-review half lost its independence from the detector output, which is a real
weakening — the reference isolates them precisely so detector findings do not anchor
judgment. Mitigation actually applied: the review was driven from executable checks
(measured geometry, a mutation, class-delta greps) rather than from impression, so its two
findings are reproducible rather than asserted.

### 12.1 Detector (Assessment B, run directly)

```
node <impeccable>/scripts/detect.mjs --json <13 UI files>
```

Two findings, both `broken-image`, both in `components/admin/wizard/step3ReviewSections.tsx`.
NEW-vs-PRE-EXISTING was established by re-running the detector against the same file at the
merge base, which returns exactly one.

| Rule | Location | New? | Disposition |
| --- | --- | --- | --- |
| `broken-image` | `step3ReviewSections.tsx:3673` | PRE-EXISTING (present at merge base) | **False positive.** The line is a CODE COMMENT containing the literal `<img>` while documenting the deliberate `next/image` revert. Already ratified: `DEFERRED.md:61-65`, spec §9. |
| `broken-image` | `step3ReviewSections.tsx:3704` | **NEW** | **False positive, and the rule is misreporting its own subject.** Its description is about a missing/empty/placeholder `src`; this `<img>` has `src={src}`, a required runtime prop. What changed on this line is `alt={alt}` → `alt=""`, which is the standards-correct marking for a DECORATIVE image whose accessible name is carried by its wrapping link (spec §2.4, AC-5). Same class as the eight hits already ratified at `DEFERRED.md:61-65`. **Not suppressed** — classified here, so a later reader sees the reasoning instead of an ignore rule. |

The same rule fires on three test files for the same reason (they assert `alt=""` in string
literals). Same classification.

### 12.2 Findings, with disposition

**[P1] AC-2's edge-midpoint claim had no coverage for the `AdminNav` brand link — FIXED in
branch (`9607ed11f`).** AC-2 names seven targets that must expose a ≥44×44 box "whose four
edge midpoints hit it". Six had it (DI-6, DI-8, DI-10, DI-15); the brand link had only
DI-11's size check and DI-12's cancellation formula, so nothing proved its grown box takes
the pointer. It is also the only repaired target whose growth reaches into a live row rather
than empty chrome: `-mx-2` pulls the footprint back, so 8px per side overhangs the topbar's
`gap-3` (12px) toward four irreducible 44px action controls. Fixed by measuring the four
edge midpoints and counting overlaps against every other interactive element in the mounted
topbar, derived from the live DOM. **Negative-regression verified twice**, because the
obvious mutant did not isolate the new assertion: `-mx-4 px-4` fails on DI-12's margin check
first and proves nothing about overlap, while `gap-3 → gap-0` (mx/px untouched) fails at
320px with "brand link right midpoint resolved outside the target" and passes at the other
five widths where `ml-auto` still leaves slack.

**[P0] none.**

**[P2 → DOCUMENTED LIMIT, not filed] The `AdministratorsSection` revoked disclosure's
clickable row narrows from full-width to content-width.** `w-fit` is what stops a repaired
`<summary>` becoming a full-width invisible 44px band that swallows pointer events aimed at
neighbouring content (spec §2.1, probe P2), and the spec ratifies it for all six Class-A
sites. At `AdministratorsSection.tsx:131` the summary is a bordered card's header with no
neighbouring content to protect, so `w-fit` costs hit area there without buying anything —
the row goes from card-width to roughly 124px wide. It stays a real change worth naming.
It is recorded as a limit rather than filed because the worst case is conservative and
surfaced: the target still clears the floor on BOTH axes (44px tall, ~124px wide — the
actual contract), the height went UP from 40.8px, and the change is pinned by DI-1/DI-2 at
four viewports. Per the ledger filing bar, an accepted outcome whose alternative is worse is
a limits record, not schedulable work. Deviating per-site would also exceed the ratified
recipe (spec §1.1 R6/§2.1).

### 12.3 Audit dimensions

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | The diff's entire subject. Thirteen targets raised to the floor with painted boxes preserved, a skipped heading level closed, a double accessible name reduced to one, a lying new-tab glyph removed. Pinned by 49 real-browser cases at 320/360/390/440/768/1280 (§12.5). |
| 2 | Performance | 4 | No animation added, removed or retimed (spec §6.1). The HelpSheet portal's scrim and rise are byte-identical — `git diff` matches no animate/scrim/sheet-rise/backdrop line. No new render work: every change is a class string or one wrapper `<span>`. |
| 3 | Theming | 4 | Zero hard-coded colors added — `grep -E "#[0-9a-f]{3,8}\|rgba?\(\|hsla?\(\|oklch\("` over added lines in the UI files returns nothing. Every color-bearing class removed has a matching one added: `hover:bg-surface` ×2 → `group-hover:bg-surface` ×2, `hover:bg-surface-sunken` ×1 → `group-hover:` ×1, `hover:text-text-strong` ×4 → `group-hover:` ×4. Both themes are unaffected because no token changed. |
| 4 | Responsive | 4 | The floor is met on both axes at every asserted width, DI-7's 320px no-overflow pin still holds, and DI-5/DI-12 pin that neither repair spends layout — which matters because the connectors measure 0px wide at 320/390 (probe P3). |
| 5 | Anti-patterns | 4 | No new visual language at all: no side-stripe border, no gradient text, no glassmorphism, no card grid, no eyebrow, no numbered scaffold. R6 makes "looks different" a defect, and the diff adds no painted surface. |
| **Total** | | **20/20** | Excellent. The score is high because the diff is deliberately narrow: it changes hit boxes, one tag pair, one `alt`, and one glyph, and asserts the result in a real browser. |

### 12.4 Not re-raised, verified against their ratification

The repo-wide structural tap-target guard (descoped with its measurement, spec §5, filed as
`BL-TAP-TARGET-STRUCTURAL-GUARD`); the eight further inline text controls (filed as
`BL-TAP-TARGET-INLINE-TEXT-CONTROLS` pending a per-site prose-vs-chrome product call); and
spec §4's four documented limits. Each was checked against its citation, not re-derived.

### 12.5 Gate re-run over the post-gate delta (2026-08-09)

**Why this section exists at all:** diff-review round 2 found that the gate above predated
three further UI-surface commits, so its "whole diff" claim and its 46-case figure no longer
described HEAD. That is a real invariant-8 violation — a gate that evaluated an earlier tree
is not a gate on the shipped one — and it is repaired by re-running rather than by rewording.

**Delta evaluated** (`git diff 167a279cb HEAD -- app components`, plus the working-tree change
that landed with it): `components/admin/OnboardingWizard.tsx`,
`components/admin/settings/AdministratorsSection.tsx`, `components/admin/nav/AdminNav.tsx`.
Three visible changes: the two restored disclosure carets, and the brand link's `aria-label`.

**Detector, re-run on all thirteen UI files at HEAD:** still exactly two `broken-image` hits at
`step3ReviewSections.tsx:3673` and `:3704`, the same pair classified in §12.1. The delta files
produce none.

**Design/audit pass over the delta:**

- The carets restore a cue the repair had removed; they are the treatment
  `app/me/meShowSections.tsx` already ships, so they add no new visual language. `▸` is
  `aria-hidden`, so the disclosure's accessible name is unchanged.
- `aria-label="FXAV Admin"` fixes a P1 the review found (below 360px the link had NO accessible
  name at all — WCAG 2.4.4 / 4.1.2). It matches the visible wordmark at wide widths, so it never
  contradicts what is on screen (WCAG 2.5.3), and it is stable across every breakpoint.
- Both are pinned by new real-browser cases, each with an isolating negative-regression mutant
  recorded in the commit that added it.

**Counts at HEAD: P0 = 0, P1 = 1 (fixed in branch), and the standalone spec is 49 cases, not
46.** The marker at the top of this file carries the same numbers.

**Second re-run, 2026-08-09, after the cross-model review closed.** Rounds 4-9 changed only
test files plus this plan and the ledgers — `git diff` over `app` and `components` between the
§12.5 delta above and the review-close HEAD is EMPTY, so no further UI surface entered the
diff and the gate above still describes the shipped tree. Recorded rather than assumed,
because "the gate predated the last commits" is exactly the BLOCKING finding §12.5 exists to
answer, and it would be worth nothing if it were only checked once.
