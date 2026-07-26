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
| T2 | ScheduleSection passes `viewerDays` to the block | the hoist + the threading |
| T3 | fold/marker render tests, INCLUDING the §5.1 real-browser dimension assertions | the `<details>` markup |
| T4 | the chevron's `transition-duration` asserted in a real browser (fails: no CSS yet) | the `app/globals.css` rule |
| T5 | the compound transition + a11y-snapshot assertions | any markup fix they expose |
| T6 | the CI wiring's own red state: the standalone command must collect a NON-ZERO count for this spec, which fails before the wiring | `package.json` + workflow `paths:` + the registry row value |
| T7 | — | impeccable dual-gate + cross-model review (process gates, not code) |

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
  - **a travel-day assignment does NOT fail open forever.** Fixture: viewer assigned a travel-in date plus a show day, extraction covers both. With the aggregate domain, completeness holds and folding proceeds. *Catches an `R` built from `visibleShowDays`.*
  - **a date appearing TWICE still folds.** Two blocks, same date, both the viewer's → both indices in `rows`. *Catches count-based completeness.*
  - all four positional-fallback conditions negated independently, including the null-element guard. *Catches a fallback firing when it must not.*
  - **the positional fallback indexes the FULL aggregate day list.** Fixture built so a filtered list maps to different extraction rows. *Catches indexing the viewer's subset.*
  - `{ kind: "all" }` is returned, never `{ kind: "subset"; rows: <empty> }`. *Catches the empty-subset trap in spec §2.*
  - every expected index derived from fixture dimensions, never hardcoded.
- [ ] Implement `lib/crew/agendaViewerDays.ts (NEW)`, reusing `parseIsoFromDayLabel` (`lib/crew/agendaDayForToday.ts:36`) and mirroring the positional rule at `lib/crew/agendaDayForToday.ts:64`.
- [ ] Green; `npx tsc --noEmit`; commit `feat(crew-page): row-index matcher for the viewer's agenda days`.

### Task 2: Hoist the restriction derivation and thread the matcher result

- [ ] **What T2's red test can and cannot assert (review R3, HIGH).** `AgendaScheduleBlock` has no `viewerDays` prop until T3, so a test asserting the prop arrives would not compile — excess-property checking rejects it. T2's red test therefore asserts the **hoist's own observable**: that `ScheduleSection` computes the viewer row set once, above `agendaArea`, and passes it to the matcher — verified by spying on `visibleAgendaDaysForViewer` and asserting it is called with the aggregate-day domain before the agenda area renders. That test fails today (nothing calls it) and passes when the hoist lands, with no dependency on T3's prop.
- [ ] Move ONLY the restriction derivation above `agendaArea` (`components/crew/sections/ScheduleSection.tsx:147`). **Do NOT move `aggregateDays`/`allDays`** — spec §2: the aggregate sits inside `WrappedSection`'s `render` callback so a malformed-date throw degrades one block instead of the section (`components/crew/WrappedSection.tsx:22`).
- [ ] **Per-link, not per-section (review R3, HIGH).** `hasAgenda` allows multiple PDFs and each is matched independently: call the matcher **once per link**, inside that link's block, and never reuse one link's result for another. A test renders two links where PDF A resolves fully and PDF B has unparsed labels, asserting A folds and B expands. *Catches reusing A's row set for B, which would fold B's viewer row.*
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
- [ ] **Uniform markup for `{ kind: "all" }` — resolve the contradiction (review R3, HIGH).** Spec §4 requires every day to use the same `<details>` element in all states, with fail-open and the admin default rendering `<details open>` rather than plain rows. An earlier draft of this task asserted "no `<details>` at all" for those cases, which contradicts it. Uniform markup wins: one code path, and a screen reader hears the same structure regardless of how the viewer's days resolved. Assert `<details open>` for the fail-open and admin cases, NOT the absence of `<details>`.
- [ ] `<summary>` carries `min-h-tap-min`, a visible focus ring, `w-full` and `min-w-0` (spec §5.1 — `min-w-0` alone does not fill the cross axis).
- [ ] **Real-browser dimensions, in this task:** `getBoundingClientRect()` on every documented `data-testid` at 320px and 390px within 0.5px, measuring the CONTENT box (padding-blind rects were the PR #586 lesson); assert `details.width === parent content width` for every row; assert the summary row in BOTH open states. **Also assert an over-long non-null `day.date` does not force the summary past the viewport** (spec §5.1 gives it `shrink-0`; a 200-character date would otherwise overflow).
- [ ] **Accessibility snapshot, in this task (review R3, HIGH).** The standalone harness transcribes static HTML, so it cannot prove the production component's semantics — the fold could be deleted and the harness would still pass every dimension assertion. Add a jsdom render of the REAL `AgendaScheduleBlock` asserting: each day heading is still reachable as a heading, each `<summary>` exposes a disclosure with its expanded state, and the marker is in the accessible name of the viewer's rows. *Catches the copied harness drifting from the component it claims to describe.*
- [ ] Green; commit `feat(crew-page): fold non-viewer agenda days to one-line rows`.

### Task 4: Chevron affordance — assertion first, then the CSS

- [ ] **Test first, and it must fail for the right reason.** Assert in a real browser that the chevron's computed `transition-duration` is non-zero (and `0s` under `prefers-reduced-motion`). Before the CSS lands this fails because there is no transition at all — that is the red state T4 owns.
- [ ] **The duration MUST come from `var(--duration-fast)` in hand-written CSS.** A Tailwind `duration-fast` class emits NOTHING here: `grep -rn "duration-fast" components/ | grep -c className` → `118`, while `grep -c "transition-duration-fast" app/globals.css` → `0`, and Tailwind v4 resolves `duration-<name>` from `--transition-duration-<name>`. (That 118 is scoped to `components/` with a `className` filter — the exact command matters; including `app/` gives 142. Review R3 measured 124 with a different command and was right that the number is command-dependent, though the mechanism claim it checked is sound.) So the class also misses the reduced-motion block at `app/globals.css:417`, which only rewrites `--duration-*`.
- [ ] Follow the existing accordion at `app/globals.css:709-710`; reduced motion then comes free via the token rewrite at `app/globals.css:419`.
- [ ] Green; commit `style(crew-page): chevron rotation on the agenda day disclosure`.

### Task 5: Transition audit — compound states, including the reachable ones

- [ ] **Test first.** Spec §5.2: 4 states (open-ness × marked-ness), 6 unordered pairs.
- [ ] **Pairs 3–6 ARE reachable — corrected after review R3 (MEDIUM).** The spec called them unreachable because marked-ness is decided server-side. But `ShowRealtimeBridge` triggers `router.refresh()`, which re-renders server-sourced section bodies while the client stays mounted (`components/crew/CrewSections.tsx:13`), so a sync that changes the viewer's assignment from May 5 to May 6 moves May 5 expanded+marked → collapsed+unmarked and May 6 the reverse. Assert these are deliberately instant rather than claiming they cannot happen. Spec §5.2 must be updated in the same commit.
- [ ] Compound cases: sibling toggled while the viewer's day stays open; viewer's day collapsed then a sibling expanded; every day collapsed including the marked one (must not reach an empty state); **and a refresh that reassigns days mid-session.**
- [ ] Green; commit `test(crew-page): transition audit for the agenda disclosure`.

### Task 6: Make the layout spec actually run in CI

- [ ] **Red state first:** run the standalone command and record that it collects ZERO tests for this spec today. That is the failure the task closes, and it is what makes "the step passed" meaningful afterwards.
- [ ] Add `tests/e2e/agendaScheduleLayout.spec.ts` to a standalone-config script in `package.json`. **Decide the naming explicitly** — `test:e2e:modal-header` running an agenda spec is a misnomer; rename it or add a sibling alias.
- [ ] Add the spec plus `components/crew/AgendaScheduleBlock.tsx` and `components/crew/sections/ScheduleSection.tsx` to `.github/workflows/modal-header-layout-e2e.yml`'s `paths:` filter.
- [ ] **CHANGE the registry row's value from `UNSEEN` to `PATH_GATED`** at `tests/ci/_metaE2eWorkflowCoverage.test.ts:49`. **Do NOT delete it** — that workflow is path-gated (`.github/workflows/modal-header-layout-e2e.yml:45`) and the scanner rejects path-filtered workflows from `covered` (`tests/ci/_workflowCoverageScan.ts:105`), so a deleted row trips the DARK assertion. Precedent: `tests/ci/_metaE2eWorkflowCoverage.test.ts:39-40`.
- [ ] **RUN the command and record a NON-ZERO collected count in the commit message.** A step that matched nothing passes vacuously.
- [ ] Verify on a real Actions run via `gh workflow run`; local-green is not sufficient for CI-bound surfaces.
- [ ] **State the guarantee honestly in the handoff:** runs when the filter matches, not on every PR. Do not write "verified in a real browser" unqualified.
- [ ] Commit `ci(crew-page): run the agenda layout spec in the standalone-config job`.

### Task 7: Gates — impeccable dual-run, then cross-model review

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
