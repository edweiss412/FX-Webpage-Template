# Agenda per-viewer day folding (option C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A crew member who works one day of a four-day show stops having to scan the whole show's agenda. Their day renders expanded and marked; the other days fold to one-line disclosure rows they can open. When no day resolves for them, everything expands — the pre-change behaviour — because a silently folded own-day is the worst outcome this feature can produce.

**Architecture:** One new pure matcher beside `lib/crew/agendaDayForToday.ts` returning ROW INDICES into `extraction.days` (spec §2.5 fact 1: `AgendaDay.date` is always null, so dates cannot identify a row), one hoist of the *restriction* derivation above `agendaArea` in `ScheduleSection.tsx`, and one presentational change in `AgendaScheduleBlock.tsx` using native `<details>`/`<summary>`. No client JS, no DB change. It DOES add one optional prop (`viewerDays`) to `AgendaScheduleBlock` — spec §2; an earlier summary said "no new prop threading", which was wrong.

**Tech Stack:** Next.js 16 App Router Server Components, Tailwind v4 + hand-written CSS in `app/globals.css` for the one animated affordance, Vitest + Testing Library for unit, Playwright (`tests/e2e/standalone.config.ts`) for real-browser layout, conventional commits.

**Spec:** `docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` — §1.1 "Resolved scope" is RATIFIED; do not relitigate during implementation or review. Section references below (§N) point there.

**Routing:** Entire PR = **Opus / Claude Code**. `components/**` is UI by the AGENTS.md hard rule, so invariant 8 (impeccable critique + audit) applies. **Codex = reviewer.** Branch: `feat/agenda-perday-viewer-fold`.

**DB changes: NO** — no migration, no manifest regen, no validation-project apply. The post-migration checklist does not fire.

---

## Pre-draft code-verification pass (writing-plans rule) — RUN, not described

Every file, symbol, and line this plan names was verified against `origin/main` @ `36638e063` before drafting. Output, not a claim that it was done:

| Claim | Verified |
| --- | --- |
| `components/crew/AgendaScheduleBlock.tsx` exists, 137 lines | yes; gate at `components/crew/AgendaScheduleBlock.tsx:58` is `if (!data \|\| data.confidence !== "high" \|\| data.days.length === 0) return null;` |
| its `day.date` guard | `components/crew/AgendaScheduleBlock.tsx:74` is `{day.date ? (` |
| `components/crew/sections/ScheduleSection.tsx`, 422 lines | yes; `resolveViewerContext` `components/crew/sections/ScheduleSection.tsx:101`, `agendaArea` `components/crew/sections/ScheduleSection.tsx:147`, `unknown_asterisk` return `components/crew/sections/ScheduleSection.tsx:172`, `{agendaArea}` `components/crew/sections/ScheduleSection.tsx:187`, drift comment `components/crew/sections/ScheduleSection.tsx:200`, `allowedShowDays` `components/crew/sections/ScheduleSection.tsx:201`, `visibleDays` `components/crew/sections/ScheduleSection.tsx:202` |
| the ORDER invariant the hoist needs | `components/crew/sections/ScheduleSection.tsx:101` < `components/crew/sections/ScheduleSection.tsx:147`, same function body |
| `visibleShowDays` is total | `lib/crew/agendaDisplay.ts:144`; `grep -c throw lib/crew/agendaDisplay.ts` → `0` |
| `AggregateDay` / `aggregateDays` | `lib/crew/agendaDisplay.ts:94` / `lib/crew/agendaDisplay.ts:113` |
| `parseIsoFromDayLabel` | `lib/crew/agendaDayForToday.ts:36` |
| `agendaSessionsForToday` + its 4 fallback conditions | `lib/crew/agendaDayForToday.ts:47`, conditions at `lib/crew/agendaDayForToday.ts:64` |
| `WrappedSection`'s containment contract | `components/crew/WrappedSection.tsx:22` — "The throwable block is passed as a `render: () => ReactNode`" |
| the intentional out-of-boundary throw | `ScheduleSection.tsx:99` — "throws MalformedProjectionError (INTENTIONALLY outside Wr…" |
| the CI registry row | `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` — `"tests/e2e/agendaScheduleLayout.spec.ts": UNSEEN,` inside `LOCAL_ONLY_ALLOWLIST` (`tests/ci/_metaE2eWorkflowCoverage.test.ts:35`) |
| the spec is standalone-config only | matched at `tests/e2e/standalone.config.ts:36`; **no** match in `playwright.config.ts` |
| the standalone job precedent | `.github/workflows/modal-header-layout-e2e.yml` runs `pnpm test:e2e:modal-header`; `package.json:52` expands to `playwright test --config=tests/e2e/standalone.config.ts …` |
| `--duration-fast` is a real token; the Tailwind utility is not | `app/globals.css:223` defines `--duration-fast: 120ms`, `app/globals.css:419` zeroes it under `prefers-reduced-motion`; `grep -c transition-duration-fast app/globals.css` → `0` |

## Meta-test inventory (writing-plans rule)

- **EXTENDS** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — the CI task CHANGES the `LOCAL_ONLY_ALLOWLIST` row's value at `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` from `UNSEEN` to `PATH_GATED`. **It does NOT delete the row** — corrected after review R3 (MEDIUM) flagged that this inventory still said "delete" and wrongly claimed the shadowing assertion forces it. The target workflow is path-gated, the scanner rejects path-filtered workflows from `covered` (`tests/ci/_workflowCoverageScan.ts:105`), so a deleted row would trip the DARK assertion. `PATH_GATED` is the category that satisfies both assertions; precedent at `tests/ci/_metaE2eWorkflowCoverage.test.ts:39-40`.
- **CREATES** no new registry. The new matcher is a pure function with no Supabase call boundary, no admin mutation, no alert code, no tile sentinel.
- **Advisory-lock topology** (`tests/auth/advisoryLockRpcDeadlock.test.ts`): **UNAFFECTED.** This plan touches no `pg_advisory*` surface — no RPC, no transaction, no mutation of any kind. Declared explicitly per the rule.
- `tests/auth/_metaInfraContract.test.ts`: **N/A** — no new Supabase client call sites. `ScheduleSection` receives already-fetched `data`.
- `tests/log/_metaMutationSurfaceObservability.test.ts`: **N/A** — invariant 10 covers mutation surfaces; this PR adds no route handler and no `"use server"` action.

## Advisory-lock holder topology

N/A — declared above. No task in this plan opens a transaction or acquires a lock.

## New test files — collection and environment wiring (writing-plans rule)

Verified rather than assumed, because a missing environment pragma costs a round on its own:

- **Collection needs no wiring.** `vitest.projects.ts:34` sets `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so both new files are collected by the default suite with no `testMatch` entry to add.
- **Project partition: SERIAL, by default.** Neither `tests/agenda` nor `tests/components/crew` appears in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:64`), and the file's own comment at `vitest.projects.ts:18` says new directories default to SERIAL, which is the safe side. Nothing to add.
- **`tests/components/crew/agendaScheduleBlockFold.test.tsx (NEW)` MUST carry `// @vitest-environment jsdom` as its FIRST line.** The default environment is `node` (`vitest.config.ts:68`), so a render test without the pragma fails on `document` being undefined. The sibling `tests/components/crew/sourceLink.test.tsx:1` carries exactly that pragma — copy the shape.
- **`tests/agenda/agendaViewerDays.test.ts (NEW)` needs NO pragma** — it tests a pure function and `node` is correct for it.
- No new e2e spec file is created, so no `playwright.config.ts` `testMatch` change is needed. Task 7 wires the EXISTING `agendaScheduleLayout.spec.ts`, which `tests/e2e/standalone.config.ts:36` already matches.

## Execution order (green at every commit)

**T1 → T2 → T3 → T4 → T5 → T6 → T7**

**RESTRUCTURED after review R3 (CRITICAL).** The previous order violated invariant 1, TDD-per-task, which
is non-negotiable: it had T4 implement the chevron CSS with no failing test, then T5 and T6 add tests for
behaviour T3 and T4 had already made green, and T7 change CI with no preceding red test. Tests-after-the-fact
in a separate task cannot produce the required red → green → commit sequence — by the time the test lands
it is already green, so it proves nothing about the implementation that preceded it.

The fix is not a reordering but a **re-partitioning**: each task now owns its own red test AND the
implementation that makes it green. The former "test tasks" (real-browser layout, transition audit) are
folded into the tasks whose behaviour they assert, so the assertion is written first and fails first.

| Task | Red test written first | Then implemented |
| --- | --- | --- |
| T1 | matcher unit tests (`tests/agenda/agendaViewerDays.test.ts (NEW)`) | `lib/crew/agendaViewerDays.ts (NEW)` |
| T2 | the matcher is CALLED once per link with the hoisted day set (spied), above `agendaArea` | the hoist of the three existing `visibleDays` lines + the per-link matcher call |
| T3 | fold/marker render tests, INCLUDING the §5.1 real-browser dimension assertions | the `<details>` markup |
| T4 | the chevron's `transition-duration` asserted in a real browser (fails: no CSS yet) | the `app/globals.css` rule |
| T5 | a refresh-driven marked-ness flip is asserted instant; before T5 nothing renders the post-refresh state at all, so the assertion errors on a missing marker | the markup that keeps the marker correct across a server re-render |
| T6 | a meta-test assertion that THIS spec's registry row reads `PATH_GATED`, which fails today because it reads `UNSEEN` | the script + workflow `paths:` + the row value |
| T7 | **not a TDD task** — it is a review gate and is labelled as such rather than pretending to a red state | impeccable dual-run + cross-model review |

**On T6's red state, corrected after review R4 (CRITICAL).** An earlier version said the red state was
"the standalone command collects zero tests for this spec". That is not a failing ASSERTION — the existing
alias collects four other specs and exits 0, so nothing is red. The real red state is a meta-test
expectation on the registry row's value: assert it reads `PATH_GATED`, which fails while it reads `UNSEEN`,
and passes once the wiring and the row land together. That is a genuine red → green pair.

**On T7, also corrected (CRITICAL).** It has no red test because it is not a code task — it runs the
impeccable dual-gate and the cross-model review. Calling it a TDD task was the defect; invariant 1 governs
tasks that change behaviour, and a review gate changes none. It is now labelled a gate, so nobody looks for
the failing test it cannot have.

T2's red test is the one that needs care: see T2 for why it cannot assert through
`AgendaScheduleBlock`'s props until T3, and what it asserts instead.

Baseline note: run the FULL suite before every push, not a scoped subset — PR2 of this sequence had a stale assertion in a file no scoped run covered, caught only by `npx vitest run` with no path filter.

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `lib/crew/agendaViewerDays.ts (NEW)` | CREATE | day-SET matcher: which of an extraction's days belong to this viewer |
| `tests/agenda/agendaViewerDays.test.ts (NEW)` | CREATE | T1's unit tests |
| `components/crew/sections/ScheduleSection.tsx` | EDIT | hoist the restriction derivation above `agendaArea`; pass the viewer day set down |
| `components/crew/AgendaScheduleBlock.tsx` | EDIT | fold non-viewer days into `<details>`; expand + mark the viewer's; THE MARKER RULE |
| `tests/components/crew/agendaScheduleBlockFold.test.tsx (NEW)` | CREATE | T3's render tests |
| `app/globals.css` | EDIT | chevron rotation consuming `var(--duration-fast)` |
| `tests/e2e/agendaScheduleLayout.spec.ts` | EDIT | add the §5.1 dimensional assertions for the new summary rows |
| `package.json` | EDIT | add the spec to a standalone-config `test:e2e:*` script |
| `.github/workflows/modal-header-layout-e2e.yml` | EDIT | add the spec + its components to `paths:`; run it |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | EDIT | change the row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` from `UNSEEN` to `PATH_GATED` — do NOT delete it |

---

### Task 1: `visibleAgendaDaysForViewer` — pure matcher returning ROW INDICES

- [ ] **Test first** — `tests/agenda/agendaViewerDays.test.ts (NEW)`. Every case names the failure mode it catches.
- [ ] Return type is `ViewerAgendaDays` from spec §2 — **`{ kind: "subset"; rows: ReadonlySet<number> }`, indices into `extraction.days`, NOT ISO dates.** Spec §2.5 fact 1: `AgendaDay.date` is always `null` in production (`lib/agenda/extractAgendaSchedule.ts:653` is its only constructor), so a date set gives the component nothing to match on. Implement the spec's type; do not redefine it.
- [ ] **`R` is the restriction ∩ AGGREGATE day set, not `visibleShowDays`.** Spec §2.5 fact 3: `effectiveViewerDateRestriction` builds its days from `aggregateDays` (`lib/crew/stageSchedule.ts:56`), so travel-in/out dates are legitimately in a viewer's restriction and intersecting with `showDays` would DROP them.
- [ ] Cases:
  - every restriction day located → `rows` holds exactly those indices. *Catches a matcher that returns all rows and lets the caller filter.*
  - **completeness compares distinct DATES, not located rows.** Fold iff `L.size === R.size`, `L` ⊆ `R` as date sets. *Catches the R3 scenario: restriction May 5 + May 6, two May 5 headings, `"Day 3"` for May 6 — counting rows gives `2 == 2` and folds May 6.*
  - **PARTIAL location fails open.** Fixture: one label parses, another reads `"Day 3"`, and a third parses so `!someDateParsed` is false and the positional fallback cannot fire. Assert `{ kind: "all" }`. *Catches folding a day the viewer works while the page looks normal.*
  - **a travel-day assignment does NOT fail open forever.** Fixture: viewer assigned a travel-in date plus a show day, extraction covers both. `R` comes from the hoisted `visibleDays` (spec §2), which is the aggregate intersected with the restriction, so the travel day is IN `R`, completeness holds, and folding proceeds. *Catches an `R` narrowed to `visibleShowDays`' show-day-only output, which would drop the travel day and fail open for every stage-restricted viewer.*
  - **a date appearing TWICE still folds.** Two blocks, same date, both the viewer's → both indices in `rows`. *Catches count-based completeness.*
  - all four positional-fallback conditions negated independently, including the null-element guard. *Catches a fallback firing when it must not.*
  - **the positional fallback indexes the FULL aggregate day list.** Fixture built so a filtered list maps to different extraction rows. *Catches indexing the viewer's subset.*
  - `{ kind: "all" }` is returned, never `{ kind: "subset"; rows: <empty> }`. *Catches the empty-subset trap in spec §2.*
  - every expected index derived from fixture dimensions, never hardcoded.
- [ ] **Signature takes ONE normalized extraction, not the link array.** `agendaSessionsForToday`
      (`lib/crew/agendaDayForToday.ts:47`) takes `agendaLinks[]` and aggregates across every link, because
      it answers "what is on today" for the whole show. This matcher answers a per-link question (T2: called
      once per link, results never shared), so mirroring that shape would be wrong. Take the already-
      normalized `AgendaExtraction` plus the two date lists and return this link's `ViewerAgendaDays`.
      Normalization stays at the caller, matching the boundary `AgendaScheduleBlock` already uses
      (`components/crew/AgendaScheduleBlock.tsx:55`).
- [ ] **Reuse the existing fixture builders** in `tests/crew/agendaDayForToday.test.ts:5-17` — `sess()` and
      `ext()` — rather than writing new ones. `ext()` hardcodes `date: null`, which is both what production
      does (spec §2.5 fact 1) and a useful default for these tests. For the non-null-date cases the narrowed
      fact 1 requires, construct those days explicitly instead of changing the shared builder.
- [ ] Implement `lib/crew/agendaViewerDays.ts (NEW)`, reusing `parseIsoFromDayLabel` (`lib/crew/agendaDayForToday.ts:36`) and mirroring the positional rule at `lib/crew/agendaDayForToday.ts:64`.
- [ ] Green; `npx tsc --noEmit`; commit `feat(crew-page): row-index matcher for the viewer's agenda days`.

### Task 2: Hoist the restriction derivation and thread the matcher result

- [ ] **Test first — what T2's red test can and cannot assert (review R3 HIGH; sharpened by R4 CRITICAL).** `AgendaScheduleBlock` has no `viewerDays` prop until T3, so a test asserting the prop arrives would not compile — excess-property checking rejects it. T2's red test therefore asserts the **hoist's own observable**: that `ScheduleSection` computes the viewer row set once, above `agendaArea`, and passes it to the matcher — verified by spying on `visibleAgendaDaysForViewer` and asserting it is called with the aggregate-day domain before the agenda area renders. That test fails today (nothing calls it) and passes when the hoist lands, with no dependency on T3's prop.
- [ ] **Hoist the three EXISTING `visibleDays` lines** (`components/crew/sections/ScheduleSection.tsx:193-207`: `allDays`, `allowedShowDays`, `visibleDays`) above `agendaArea` (`components/crew/sections/ScheduleSection.tsx:147`), unmodified. Spec §2 as corrected in review R4: the earlier instruction to move the restriction derivation but NOT `aggregateDays` rested on a false premise — `grep -c throw lib/crew/agendaDisplay.ts` is `0`, so `aggregateDays` cannot throw and hoisting it adds no exposure. The viewer's day set already exists in that callback, computed correctly including travel days; this task moves it earlier, it does not invent it.
- [ ] `R = new Set(visibleDays.map((d) => d.date))`. No new domain expression — reusing the existing derivation is what keeps the drift-guard comment at `components/crew/sections/ScheduleSection.tsx:200` meaningful.
- [ ] **Per-link, not per-section (review R3, HIGH).** `hasAgenda` allows multiple PDFs and each is matched independently: call the matcher **once per link**, inside that link's block, and never reuse one link's result for another. T2's test asserts the CALL SHAPE only — two links produce two matcher calls with that link's own extraction. *Catches computing one result and sharing it.* The rendering consequence (A folds, B expands) is asserted in **T3**, where the fold markup exists; asserting it here would require T3's implementation and is what made an earlier version of T2 unable to go green.
- [ ] Leave the in-callback `visibleDays` derivation reading the hoisted value — one derivation, no duplicate (drift comment at `components/crew/sections/ScheduleSection.tsx:200`).
- [ ] Verify the order precondition first: `git show origin/main:components/crew/sections/ScheduleSection.tsx | grep -n "resolveViewerContext(viewer\|const agendaArea"` — the former must be the smaller line. If inverted, STOP; spec §2 is void.
- [ ] Green; commit `refactor(crew-page): hoist the restriction derivation above the agenda area`.

### Task 3: Fold the agenda days (markup + its dimensions, in one task)

- [ ] **Test first**, `tests/components/crew/agendaScheduleBlockFold.test.tsx (NEW)` plus the §5.1 real-browser assertions in the same task so the markup is never written before an assertion that fails on its absence:
  - **BOTH suppression directions of THE MARKER RULE**: one day total → no marker; every day the viewer's → no marker anywhere. *The second is what the spec's first draft got wrong.*
  - **the positive mixed case** — marker on exactly the viewer's rows. *Without it, "no marker" passes for an implementation that never renders the marker.*
  - **`{ kind: "subset"; rows: <empty> }` renders as `{ kind: "all" }`** — every day expanded, no marker. *Catches "fold iff my index is absent", which folds every day including the viewer's.*
  - the admin caller's shape: render with NO `viewerDays` → today's whole-schedule render. *Catches a default that folds the admin preview.*
  - **an empty `dayLabel` still renders its row** (spec §5). *Catches a truthiness guard dropping the day.*
  - a folded day with zero sessions renders `0 sessions`. *Catches a silently empty fold.*
  - `day.date === null` → label only. Per spec §2.5 fact 1 this is the ONLY production shape, so it is the primary case, not an edge one.
  - **no silent cap**: a fixture with more days than fit the viewport renders every row. *Catches a `.slice()` added "for layout".*
  - the marker survives collapse — toggle the marked row shut, assert the marker is still in the accessible tree. *Catches putting it in the disclosure body.*
  - **two links, independent outcomes** (moved here from T2, which cannot assert rendering): PDF A resolves every viewer day, PDF B has unparsed labels. A folds its non-viewer days; B renders every day `<details open>`. *Catches reusing A's row set for B, which would fold B's viewer row.*
- [ ] **Uniform markup for `{ kind: "all" }` — resolve the contradiction (review R3, HIGH).** Spec §4 requires every day to use the same `<details>` element in all states, with fail-open and the admin default rendering `<details open>` rather than plain rows. An earlier draft of this task asserted "no `<details>` at all" for those cases, which contradicts it. Uniform markup wins: one code path, and a screen reader hears the same structure regardless of how the viewer's days resolved. Assert `<details open>` for the fail-open and admin cases, NOT the absence of `<details>`.
- [ ] `<summary>` carries `min-h-tap-min`, a visible focus ring, `w-full` and `min-w-0` (spec §5.1 — `min-w-0` alone does not fill the cross axis).
- [ ] **Add the four new test ids from spec §5.1's inventory** (`agenda-day-<i>`, `agenda-day-summary-<i>`, `agenda-day-marker-<i>`, `agenda-day-count-<i>`) as part of the markup. The component has no per-day test id today, so without these the layout assertions have nothing to select. Indexed, not date-keyed — per §2.5 fact 1 the date is `null` on every row the current extractor produces, so a date-keyed id would collapse to one value.
- [ ] **Real-browser dimensions, in this task:** `getBoundingClientRect()` on every test id in that inventory at 320px and 390px within 0.5px, measuring the CONTENT box (padding-blind rects were the PR #586 lesson); assert `details.width === parent content width` for every row; assert the summary row in BOTH open states. **Also assert an over-long non-null `day.date` does not force the summary past the viewport, and that it TRUNCATES rather than wrapping** — spec §5.1 caps the date at `max-w-[12ch] truncate` precisely so this assertion and the never-truncate guarantee can both hold: well-formed dates fit inside the cap and never truncate, a malformed one degrades instead of breaking every row beside it. Per §2.5 fact 1 as narrowed by review R4, a non-null date IS reachable from legacy or hand-edited JSONB, so this is a live case.
- [ ] **Accessibility proof must run in a REAL BROWSER, not jsdom (review R3 HIGH, tightened by R4 HIGH).** Two separate gaps: the standalone harness transcribes static HTML so it cannot prove the production component's semantics (the fold could be deleted and every dimension assertion would still pass), AND spec §6.1 says explicitly that jsdom cannot decide the heading-versus-disclosure shape — so a jsdom-only snapshot does not close the question either. Do BOTH:
  - a jsdom render of the REAL `AgendaScheduleBlock` asserting each day heading is reachable as a heading, each `<summary>` exposes a disclosure with its expanded state, and the marker is in the accessible name of the viewer's rows. *Catches the copied harness drifting from the component.*
  - a **real-browser accessibility snapshot of the REAL component** — render it (not a transcription) in the Playwright standalone project and assert the accessibility tree's roles and expanded states. *Catches the semantics jsdom cannot compute, which is precisely what §6.1 defers to a browser.*
- [ ] **The mechanism for that is settled, not an open risk — verified before implementation.** An earlier
      version of this task said to escalate if rendering the real component in the harness proved
      infeasible. It is feasible, and it is strictly better than what the harness does today:
      - `tests/e2e/agendaScheduleLayout.spec.ts` currently builds its DOM from `agendaHtml()`, HTML
        "transcribed VERBATIM from the components" (its own words at
        `tests/e2e/agendaScheduleLayout.spec.ts:58`). That transcription is the drift R4 flagged.
      - Replace it with `renderToStaticMarkup(<AgendaScheduleBlock … />)` at test time. `react-dom` 19.2.4
        is present, `renderToStaticMarkup` is an established pattern in this repo
        (`tests/messages/_metaEmphasisRenderContract.test.ts:32`, `tests/auth/signInPageRedirect.test.ts:2`),
        and `AgendaScheduleBlock` contains **zero hooks** (`grep -cE "useState|useEffect|useRef|useMemo" `
        → `0`), so it renders to static markup with no client runtime.
      - The harness keeps every property that makes it standalone: it still compiles the real token CSS from
        `app/globals.css` via the Tailwind CLI, still serves over HTTP, still boots no app and no Supabase.
      - Native `<details>`/`<summary>` needs no hydration to toggle, so a browser exercises the real
        disclosure behaviour against SSR'd markup. This is where the no-client-JS decision in §1.1 pays off
        — with a client component this approach would not work.
      Doing this makes the layout assertions measure the component instead of a copy of it, which closes the
      "fold could be deleted and the harness still passes" hole rather than working around it.
- [ ] Green; commit `feat(crew-page): fold non-viewer agenda days to one-line rows`.

### Task 4: Chevron affordance — assertion first, then the CSS

- [ ] **Test first, and it must fail for the right reason.** Assert in a real browser that the chevron's computed `transition-duration` is non-zero (and `0s` under `prefers-reduced-motion`). Before the CSS lands this fails because there is no transition at all — that is the red state T4 owns.
- [ ] **The duration MUST come from `var(--duration-fast)` in hand-written CSS.** A Tailwind `duration-fast` class emits NOTHING here: `grep -c "transition-duration-fast" app/globals.css` → `0`, while Tailwind v4 resolves `duration-<name>` from `--transition-duration-<name>`. (Spec §5.2 records why the count of existing class-based uses was removed from both documents: it was grep-flavour dependent, drew a finding in three consecutive rounds, and carried none of the argument.) So the class also misses the reduced-motion block at `app/globals.css:417`, which only rewrites `--duration-*`.
- [ ] **Precedents, located before implementation so this is copied rather than invented.** Three exist,
      and the one this task's earlier wording pointed at was the wrong shape:
      - `app/globals.css:709-710` is NOT a `<details>` accordion — it height-morphs
        `[data-testid="admin-alert-panel"]` inside an `@supports (interpolate-size: allow-keywords)` block.
        It IS a valid precedent for the load-bearing point (hand-written CSS consuming
        `var(--duration-fast)`, which inherits reduced motion for free), and that is the only reason to
        look at it.
      - **The real disclosure precedent is `app/globals.css:684`** —
        `[data-testid="admin-alert-banner"] details[open] summary .caret::after` — a CSS-driven caret keyed
        off native `details[open]`, with a label swap at `app/globals.css:692-695`. Note it swaps an `after` pseudo-element's
        CONTENT rather than rotating, so there is no existing `rotate` in this stylesheet
        (`grep -n rotate app/globals.css` finds only prose). A rotation is new here and needs its own
        `transition: transform var(--duration-fast)`.
      - Reduced motion still comes free via the token rewrite at `app/globals.css:419`.
- [ ] **Suppress the NATIVE disclosure triangle, or the row shows two markers.** A `<summary>` renders a UA
      triangle by default. The repo's established class set is at `components/messages/ErrorExplainer.tsx:113`:
      `list-none [&::-webkit-details-marker]:hidden [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none`.
      Apply it (and keep `<summary>` semantics — the marker is removed for typography, not to change the
      accessibility role, which `ErrorExplainer.tsx:106-109` states explicitly). *Catches shipping a
      duplicate glyph beside the chevron, which no dimension assertion would flag.*
- [ ] Green; commit `style(crew-page): chevron rotation on the agenda day disclosure`.

### Task 5: Transition audit — compound states, including the reachable ones

- [ ] **Test first, with a state nothing currently renders.** Spec §5.2: 4 states (open-ness × marked-ness), 6 unordered pairs, all reachable. The red assertion is the post-refresh one: re-render with a changed restriction and assert the marker moved to the newly-assigned day and left the old one. Before T5 there is no marker-after-refresh behaviour to observe, so the assertion fails on a missing marker rather than passing vacuously.
- [ ] **Pairs 3–6 ARE reachable — corrected after review R3 (MEDIUM).** The spec called them unreachable because marked-ness is decided server-side. But `ShowRealtimeBridge` triggers `router.refresh()`, which re-renders server-sourced section bodies while the client stays mounted (`components/crew/CrewSections.tsx:13`), so a sync that changes the viewer's assignment from May 5 to May 6 moves May 5 expanded+marked → collapsed+unmarked and May 6 the reverse. Assert these are deliberately instant rather than claiming they cannot happen. Spec §5.2 must be updated in the same commit.
- [ ] Compound cases: sibling toggled while the viewer's day stays open; viewer's day collapsed then a sibling expanded; every day collapsed including the marked one (must not reach an empty state); **and a refresh that reassigns days mid-session.**
- [ ] Green; commit `test(crew-page): transition audit for the agenda disclosure`.

### Task 6: Make the layout spec actually run in CI

- [ ] **Red state first, and it must be an ASSERTION.** Add a meta-test expectation that this spec's registry row reads `PATH_GATED`; it fails today because the row reads `UNSEEN`. Corrected after review R4 (CRITICAL): an earlier version called "the command collects zero tests for this spec" the red state, but the existing alias collects four other specs and exits 0, so nothing was red — observing an absence is not a failing test.
- [ ] Add `tests/e2e/agendaScheduleLayout.spec.ts` to a standalone-config script in `package.json`. **Decide the naming explicitly** — `test:e2e:modal-header` running an agenda spec is a misnomer; rename it or add a sibling alias.
- [ ] Add the spec plus `components/crew/AgendaScheduleBlock.tsx` and `components/crew/sections/ScheduleSection.tsx` to `.github/workflows/modal-header-layout-e2e.yml`'s `paths:` filter.
- [ ] **CHANGE the registry row's value from `UNSEEN` to `PATH_GATED`** at `tests/ci/_metaE2eWorkflowCoverage.test.ts:49`. **Do NOT delete it** — that workflow is path-gated (`.github/workflows/modal-header-layout-e2e.yml:45`) and the scanner rejects path-filtered workflows from `covered` (`tests/ci/_workflowCoverageScan.ts:105`), so a deleted row trips the DARK assertion. Precedent: `tests/ci/_metaE2eWorkflowCoverage.test.ts:39-40`.
- [ ] **RUN the command and record a NON-ZERO collected count in the commit message.** A step that matched nothing passes vacuously.
- [ ] Verify on a real Actions run via `gh workflow run`; local-green is not sufficient for CI-bound surfaces.
- [ ] **State the guarantee honestly in the handoff:** runs when the filter matches, not on every PR. Do not write "verified in a real browser" unqualified.
- [ ] Commit `ci(crew-page): run the agenda layout spec in the standalone-config job`.

### Task 7: Gates — impeccable dual-run, then cross-model review

**This is not a TDD task** and has no red state, deliberately — invariant 1 governs tasks that change behaviour, and a review gate changes none. Review R4 (CRITICAL) was right that claiming a red state here was the defect.

- [ ] **Pre-code mechanical checklist FIRST** (the gate verifies, it does not discover): em-dash ban in user-visible copy, apostrophes as literals, 44px tap targets (`min-h-tap-min`), canonical type/token classes.
- [ ] `/impeccable critique` AND `/impeccable audit` on the diff, with the canonical v3 setup gates. P0/P1 fixed or deferred via `DEFERRED.md`; findings and dispositions into §12 of THIS PR's handoff doc (invariant 8's location — not a section of this plan or of the spec, both of which stop at §9/§7).
- [ ] Cross-model adversarial review → Codex, fresh-eyes, REVIEWER ONLY, iterate to APPROVE with no round budget.
- [ ] **Verify the brief's scope against the diff before dispatching:** `git diff --name-only origin/main...HEAD -- <every file the brief names>`; any name printing nothing does not belong. Run it with `while IFS= read -r`, never `for f in $FILES` — zsh does not word-split unquoted params.
- [ ] **Tell the reviewer the sandbox is read-only** — PR3's spec R1 produced no verdict after burning its budget on `browserType.launch: EPERM`.
- [ ] Do-not-relitigate block citing spec §1.1 ratifications at `file:line`.


## Anti-tautology rules applied to every task above

- Every test names the concrete failure mode it catches. Any test proving only "the function is called" is strengthened before it lands.
- Expected values derive from fixture dimensions, never hardcoded literals.
- When scanning rendered DOM for the marker, clone the tree and remove siblings that independently render that text before asserting.
- Both polarities for every rule: THE MARKER RULE gets its two suppression cases AND its positive case, because a suppression-only suite passes for an implementation that never renders the marker.

## Fix-round regression budget

When a review round patches surface S for class C: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test still passes, (c) note both in the round closure. If three consecutive rounds land findings on the same vector, stop patching prose and ship a structural defense in that round's repair commit — and if the class is nameable at first occurrence, ship it in the FIRST repair commit rather than waiting for recurrence.
