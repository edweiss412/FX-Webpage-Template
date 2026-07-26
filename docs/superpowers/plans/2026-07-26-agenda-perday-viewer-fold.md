# Agenda per-viewer day folding (option C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A crew member who works one day of a four-day show stops having to scan the whole show's agenda. Their day renders expanded and marked; the other days fold to one-line disclosure rows they can open. When no day resolves for them, everything expands — the pre-change behaviour — because a silently folded own-day is the worst outcome this feature can produce.

**Architecture:** One new pure matcher beside `lib/crew/agendaDayForToday.ts` (day-SET, not single-day), one hoist of the *restriction* derivation above `agendaArea` in `ScheduleSection.tsx`, and one presentational change in `AgendaScheduleBlock.tsx` using native `<details>`/`<summary>`. No client JS, no new prop threading, no DB change.

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

- **EXTENDS** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — Task 7 deletes the `LOCAL_ONLY_ALLOWLIST` row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:49`. The shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:163`) FAILS while a row remains for a spec that has become covered, so the deletion is forced by the meta-test, not by discipline.
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

**T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9**

Bottom-up so every commit is green on the default suite: pure matcher → hoist → presentational fold → CSS affordance → real-browser layout → transition audit → CI wiring → impeccable dual-gate → cross-model review. T3 depends on T1's matcher and T2's hoisted value; T5/T6 assert what T3/T4 built; T7 makes T5 actually run in CI.

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
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | EDIT | DELETE the `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` allowlist row |

---

### Task 1: `visibleAgendaDaysForViewer` (pure day-SET matcher)

- [ ] **Test first** — `tests/agenda/agendaViewerDays.test.ts (NEW)`. Each case names the failure mode it catches:
  - label parsing resolves the viewer's days → returns exactly those indices. *Catches: a matcher that returns all days and lets the caller filter.*
  - **positional fallback indexes the FULL show day list, never the viewer's subset.** Fixture: a 4-day show where the viewer's restriction is days 2–3, so a filtered-list index would land on day 4. *Catches §3 constraint 1 — the assertion must FAIL if the implementation passes `visibleDays` instead of `allDays`.*
  - **PARTIAL resolution fails open (spec §3 constraint 3, review R2 HIGH).** Fixture: the viewer works
    two days; one heading parses to ISO, the other reads `"Day 3"` and does not, and a THIRD heading
    parses so `!someDateParsed` is false and the positional fallback cannot fire. Assert the matcher
    returns `{ kind: "all" }`. *Catches the worst outcome this feature can produce — a day the viewer
    actually works, folded, while the page looks perfectly normal. A suite testing only total match
    failure passes straight through this.*
  - the completeness comparison itself: `|located| == |restrictionDaysWithinShow|` decides fold vs
    fail-open. Assert both sides of the boundary with one day missing and with none missing. *Catches an
    implementation that folds on "some days matched".*
  - all four fallback conditions, each negated independently (4 cases): `matched !== null`; some label parsed; a `showDays` element is null; `ext.days.length !== showDays.length`. *Catches: a fallback that fires when it must not — the null-element case is the one the spec calls easy to miss.*
  - no day resolves → returns the fail-open variant, NOT an empty day set. **The return type must make this impossible to confuse** (see the contract below). *Catches the inversion that would hide the viewer's own day — the worst outcome this feature can produce.*
  - derive every expected index from the fixture's own dimensions; never hardcode. *A 2-day fixture must be unable to satisfy a 4-day assertion.*
- [ ] **Return-type contract, decided here rather than at implementation time.** An earlier draft of this
      task said the fail-open case "returns the empty set meaning expand everything". That is the exact
      ambiguity this feature must not contain: an empty `Set` reads equally well as "no day is the
      viewer's, so fold everything", which silently hides the viewer's own day. Make the two cases
      distinct in the TYPE so the dangerous reading cannot compile:

      ```ts
      export type ViewerAgendaDays =
        | { kind: "all" } // fail open: no day resolved, or no restriction applies
        | { kind: "subset"; days: ReadonlySet<string> }; // these ISO dates are the viewer's
      ```

      `{ kind: "subset"; days: <empty> }` must be unreachable — if the matcher resolves nothing it
      returns `{ kind: "all" }`. Assert that unreachability directly: a test that constructs the
      no-match input and asserts `kind === "all"`, plus a type-level guarantee that consumers handle
      both arms (no default branch that treats an unknown kind as "subset").

- [ ] Implement in `lib/crew/agendaViewerDays.ts (NEW)`, reusing `parseIsoFromDayLabel` (`lib/crew/agendaDayForToday.ts:36`) and mirroring the positional rule at `lib/crew/agendaDayForToday.ts:64`. Do NOT copy `visibleShowDays` logic — import it.
- [ ] Green; `npx tsc --noEmit`; commit `feat(crew-page): day-set matcher for the viewer's agenda days`.

### Task 2: Hoist the restriction derivation (NOT the aggregate)

- [ ] **Test first** — extend the ScheduleSection tests to assert the agenda area receives a viewer day set. *Catches: a hoist that computes the value but never threads it.*
- [ ] Move ONLY `const allowedShowDays = new Set(visibleShowDays(data.show.dates, dateRestriction));` above `agendaArea` (`components/crew/sections/ScheduleSection.tsx:147`). **Do NOT move `aggregateDays`/`allDays`.** §2 is explicit and load-bearing: `aggregateDays` sits inside `WrappedSection`'s `render` callback so a malformed-date throw degrades one block instead of the section. Hoisting it reverses the guarantee `WrappedSection` exists to provide (`components/crew/WrappedSection.tsx:22`).
- [ ] Leave the in-callback `visibleDays` derivation reading the hoisted `allowedShowDays` — one derivation, no duplicate. The drift comment at `components/crew/sections/ScheduleSection.tsx:200` names `visibleShowDays` the single source; a second derivation is the drift it warns about.
- [ ] Verify the order precondition still holds before editing: `git show origin/main:components/crew/sections/ScheduleSection.tsx | grep -n "resolveViewerContext(viewer\|const agendaArea"` — the former's line number must be smaller. If a refactor has inverted it, STOP: §2 is void and the approach needs re-deciding.
- [ ] Green; commit `refactor(crew-page): hoist the restriction derivation above the agenda area`.

### Task 3: Fold the agenda days

- [ ] **Test first** — `tests/components/crew/agendaScheduleBlockFold.test.tsx (NEW)`:
  - **BOTH suppression directions of THE MARKER RULE (§5)**: one day total → no marker; every day is the viewer's → no marker anywhere. *The second is the case the spec's first draft got wrong, so a test covering only the first would have passed against a defective spec.*
  - **the positive mixed case** — marker present on exactly the viewer's rows. *Without this, "no marker" passes trivially for an implementation that never renders the marker.*
  - non-viewer days render a `<summary>` row carrying label + date + session count; the viewer's day renders expanded.
  - a folded day with zero sessions still renders its row with `0 sessions`. *Catches a silently empty fold.*
  - `day.date === null` → label only, no empty date span (the `components/crew/AgendaScheduleBlock.tsx:74` guard already exists; assert it survives).
  - fail-open: the matcher returns `{ kind: "all" }` → every day expanded, no marker, no `<details>` at all. *Assert on the discriminant, not on an empty collection.*
  - **the marker lives on the `<summary>`, so it survives collapse.** Toggle the marked day shut, assert the marker is still in the accessible tree. *Catches putting it in the disclosure body, which deletes the only cue telling the viewer which day is theirs.*
- [ ] **Add ONE optional prop, `viewerDays?: ViewerAgendaDays`, defaulting to `{ kind: "all" }`.** Spec §2
      corrected: this DOES add a prop (the component's props are `{ extraction, label }` today at
      `components/crew/AgendaScheduleBlock.tsx:51`), and there is a SECOND production caller — the admin
      Step 3 review preview at `components/admin/wizard/step3ReviewSections.tsx:3230`, which has no viewer
      context. Required would break that build; optional-without-a-default would let the admin preview fold
      rows or show a "Your day" marker to an admin with no assigned days. The `{ kind: "all" }` default
      preserves today's whole-schedule render and, by THE MARKER RULE, also yields no marker — the existing
      behaviour falls out of the rule instead of needing a branch. **Do NOT edit the admin caller.**
- [ ] Add a test asserting the admin caller's shape: render with NO `viewerDays` and assert every day
      expanded, no `<details>`, no marker. *Catches a default that silently folds the admin preview.*
- [ ] Implement with native `<details>`/`<summary>`. No `useState` — the component is a Server Component and §1.1 ratifies no client JS.
- [ ] `<summary>` carries `min-h-tap-min` and a visible focus ring.
- [ ] Green; commit `feat(crew-page): fold non-viewer agenda days to one-line rows`.

### Task 4: Chevron affordance in `app/globals.css`

- [ ] **The duration MUST come from `var(--duration-fast)` in hand-written CSS.** Do NOT write a Tailwind `duration-fast` class: `--transition-duration-fast` has **0** occurrences in `app/globals.css` while Tailwind v4 resolves `duration-<name>` from that token, so the class emits no duration AND is invisible to the reduced-motion block at `app/globals.css:417`. Follow the existing accordion at `app/globals.css:709-710`.
- [ ] Reduced motion then comes free via the token rewrite at `app/globals.css:419` — no per-component opt-in, exactly as the comment at `app/globals.css:413-415` describes.
- [ ] Commit `style(crew-page): chevron rotation on the agenda day disclosure`.

### Task 5: Layout-dimensions task (real browser; mandatory per writing-plans)

- [ ] Extend `tests/e2e/agendaScheduleLayout.spec.ts` with `getBoundingClientRect()` assertions on every `data-testid` the spec's §5.1 Dimensional Invariants names, at **320px and 390px**, within 0.5px. jsdom computes no layout and this project's Tailwind v4 does not default `.flex` to `align-items: stretch` — jsdom is NOT sufficient.
- [ ] **Assert `details.width === parent content width` within 0.5px for EVERY row, at both viewports.**
      Spec §5.1 corrected in review R2: `min-w-0` alone does NOT make a flex item fill the cross axis — it
      only permits shrinking — so the guarantee is `w-full` PLUS `min-w-0`. A class-presence check would
      pass on a `<details>` that shrank anyway under an ancestor's alignment; the class and the measured
      result are separate claims.
- [ ] **Measure the content box, not just the border box** — `getBoundingClientRect()` alone is blind to padding (the PR #586 lesson the spec cites).
- [ ] **Assert the summary row in BOTH open states.** A `<summary>` measured only while open misses where the width pressure is: every folded row shows label + date + count + marker on one line.
- [ ] **e2e harness-readiness checklist** (mandatory): (a) **server boot mechanism — NONE.** This spec is standalone: it compiles token CSS via the Tailwind CLI and writes a static harness page, no app and no Supabase. (b) **readiness gate** — the harness is static HTML, so `page.goto(fileUrl)` + `waitForSelector` on the harness root; there is no hydration to await and `networkidle` is not used. (c) **detach-safety** — any `locator.evaluate` sampler must capture its values in one pass; auto-wait hangs on a node unmounted between calls.
- [ ] Commit `test(crew-page): real-browser dimensions for the folded agenda rows`.

### Task 6: Transition audit (mandatory per writing-plans)

Spec §5.2's inventory, verbatim: 4 states (open-ness × marked-ness), all 4·3/2 = **6** unordered pairs, **2 reachable** (`collapsed±marked ↔ expanded±marked`, both instant), **4 unreachable** because marked-ness is decided server-side and never changes without a new render.

- [ ] Enumerate every conditional render and ternary in the new markup; assert each is either deliberately instant or has an explicit animation. There is no `AnimatePresence` here — native disclosure only.
- [ ] **Assert the chevron actually emits a `transition-duration` in a real browser.** A class that compiles to nothing looks identical to a deliberately-instant transition in jsdom, and both look correct in review. This is the executable form of Task 4's constraint.
- [ ] Compound transitions from §5.2: sibling toggled while the viewer's day stays open; viewer's day collapsed then a sibling expanded; every day collapsed including the marked one (must not reach an empty state).
- [ ] Commit `test(crew-page): transition audit for the agenda disclosure`.

### Task 7: Make the layout spec actually run in CI

- [ ] Add `tests/e2e/agendaScheduleLayout.spec.ts` to a standalone-config script in `package.json` (either extend `test:e2e:modal-header`'s path list or add a sibling alias). **Decide the naming explicitly** — `test:e2e:modal-header` running an agenda spec is a misnomer; either rename it in this change or add the alias. Do not leave a misleading name.
- [ ] Add the spec, `components/crew/AgendaScheduleBlock.tsx`, and `components/crew/sections/ScheduleSection.tsx` to `.github/workflows/modal-header-layout-e2e.yml`'s `paths:` filter.
- [ ] **CHANGE the allowlist row's value from `UNSEEN` to `PATH_GATED`** at
      `tests/ci/_metaE2eWorkflowCoverage.test.ts:49`. **Do NOT delete it.** Corrected in review R2 (HIGH):
      `.github/workflows/modal-header-layout-e2e.yml` is path-gated (`on: pull_request:` + `paths:` at
      `.github/workflows/modal-header-layout-e2e.yml:45`), and the scanner categorically rejects
      path-filtered workflows from `covered` (`tests/ci/_workflowCoverageScan.ts:105` computes
      `hasPathsFilter`; `tests/ci/_workflowCoverageScan.ts:119` records the rejection). Running the spec
      there does NOT make it covered, so deleting the row would make the meta-test report it **dark**.
      Two precedents wired exactly this way sit at `tests/ci/_metaE2eWorkflowCoverage.test.ts:39-40`
      (`pusher-alignment.layout` and `section-header-layout.layout`, both standalone specs run by this
      same job).
- [ ] **State the guarantee honestly in the handoff:** the spec runs whenever a PR touches the agenda
      component, the Schedule section, the spec itself, or `app/globals.css` — not on every PR. Better than
      dark, weaker than PR-blocking. Do not write "verified in a real browser" without that qualifier.
- [ ] **RUN the chosen command and record a NON-ZERO collected test count in the commit message.** A step that matched nothing passes vacuously — that is exactly the failure §6.2's correction exists to prevent, and the reason the earlier `crew-e2e.yml:141` target was wrong (`agendaScheduleLayout` is matched only by `tests/e2e/standalone.config.ts:36`, never by the default config under any project).
- [ ] Verify on the real Actions run, not just locally: `gh workflow run` the workflow and confirm it collected and passed the new tests. Local-green is necessary and NOT sufficient for CI-bound surfaces.
- [ ] Commit `ci(crew-page): run the agenda layout spec in the standalone-config job`.

### Task 8: impeccable dual-gate (invariant 8 — UI surface)

- [ ] Run `/impeccable critique` AND `/impeccable audit` on the diff, both with the canonical v3 setup gates (the skill's `context` script → register reference read).
- [ ] **Pre-code mechanical checklist, run BEFORE the gate** (it is a verifier, not a discovery mechanism): em-dash ban in user-visible copy, apostrophes as literals, 44px tap targets (`min-h-tap-min`), canonical type/token classes (`text-xs`, `text-subtle`).
- [ ] P0/P1 findings fixed or explicitly deferred via a `DEFERRED.md` entry. Findings + dispositions go in the handoff's §12.

### Task 9: Cross-model adversarial review (mandatory per writing-plans)

- [ ] Dispatch to Codex, fresh-eyes posture, REVIEWER ONLY, iterate to APPROVE with no round budget.
- [ ] **Verify the brief's scope against the diff before dispatching:** `git diff --name-only origin/main...HEAD -- <every file the brief names>`; any name printing nothing does not belong in the brief. PR2 of this sequence burned eight rounds on sibling-owned merged files for want of this check. Run it with `while IFS= read -r`, never `for f in $FILES` — zsh does not word-split unquoted params, so the for-loop tests one giant path.
- [ ] **Tell the reviewer the sandbox is read-only up front.** PR3's spec review R1 produced no verdict: it was SIGTERM'd at its cap after spending the whole budget on `browserType.launch: EPERM … mkdtemp`. Briefs in this repo must say "do not run Playwright or Vitest; review statically."
- [ ] Include a do-not-relitigate block citing §1.1's ratifications at `file:line`.

---

## Anti-tautology rules applied to every task above

- Every test names the concrete failure mode it catches. Any test proving only "the function is called" is strengthened before it lands.
- Expected values derive from fixture dimensions, never hardcoded literals.
- When scanning rendered DOM for the marker, clone the tree and remove siblings that independently render that text before asserting.
- Both polarities for every rule: THE MARKER RULE gets its two suppression cases AND its positive case, because a suppression-only suite passes for an implementation that never renders the marker.

## Fix-round regression budget

When a review round patches surface S for class C: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test still passes, (c) note both in the round closure. If three consecutive rounds land findings on the same vector, stop patching prose and ship a structural defense in that round's repair commit — and if the class is nameable at first occurrence, ship it in the FIRST repair commit rather than waiting for recurrence.
