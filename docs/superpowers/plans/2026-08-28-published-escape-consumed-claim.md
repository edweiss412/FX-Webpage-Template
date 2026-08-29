# Escape on the published review modal: a claim that outlives the panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the published review modal from closing on an Escape aimed at its attention panel, by holding a claim in the modal that outlives the panel and classifies a transient unmount apart from an intentional dismissal. Convert the arc's six DB-free probe arms into a permanent contract suite. Graduate `BL-PUBLISHED-ATTENTION-ESCAPE-CLOSES-MODAL-RACE`.

**Spec:** `docs/superpowers/specs/2026-08-28-published-escape-consumed-claim.md` — read in full first. §1.1 is binding; do not relitigate any row. §3.3 (the seven writes, classified) is the contract every task argues from, §4 the guard conditions, §5 the transition inventory, §6 the test plan, §8 the documented limits.

**Tech stack:** TypeScript, React 19, vitest + Testing Library (jsdom), Playwright for the e2e reds.

## Global constraints

- Worktree-only (invariant 11); TDD per task (invariant 1); commit per task, conventional commits (invariant 6); push after every commit.
- Full-suite vitest and every non-interactive Playwright run go under the semaphore: `pnpm heavy <cmd>`. Scoped vitest runs with an explicit file list stay unwrapped.
- Every local Playwright run sets `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` and `BASELINE_SERVER_ONLY=1`. The first is the live trap in `BL-LOCAL-E2E-APP-SERVER-QUERIES-VALIDATION`: without it the app server resolves `.env.local`'s validation pooler and the resolve route 404s. The second confines the run to the baseline webServer on port 3000, which is the only one this spec touches; the arc's first trace attempt died when a dev-gate cold build on ports 3001 to 3003 overran its 300s budget under load.
- No new error code, so §12.4 and `lib/messages/catalog.ts` are untouched.
- impeccable-gate: deferred to the closeout commit per the invariant-8 marker rule.

**Meta-test inventory (writing-plans rule):** this plan CREATES no meta-test and EXTENDS none. No Supabase call boundary (invariant 9), no mutation surface, no admin alert, no advisory lock, no tile. `tests/components/**/*.test.tsx` is already in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:104-105`), so the new suite is wired by the existing glob and needs no `testMatch` task. Declared explicitly per the rule rather than left silent.

**Mutation-family closure:** N/A. This plan ships no recognizer, detector or structural guard, and enrols no surface in `tests/mutation/source/registry.ts`. The suite it adds is a behavioral contract over a React component, which the registry cannot express (the step3-a11y precedent, `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4).

**Pre-draft code verification (run 2026-08-28, base `60dece4d5`):**

| claim | verified |
| --- | --- |
| shell's Escape handler calls `requestClose` unconditionally, and the lint advisory that `defaultPrevented` is absent from these lines IS the claim | `components/admin/review/ReviewModalShell.tsx:245-250` |
| shell's Escape effect re-subscribes per render on `[requestClose]` | `components/admin/review/ReviewModalShell.tsx:251-256` |
| `ReviewModalShellProps` is the prop type to extend | `components/admin/review/ReviewModalShell.tsx:71` |
| modal renders the shell here | `components/admin/showpage/PublishedReviewModal.tsx:912` |
| frame claims Escape and calls `stopPropagation` | `components/admin/showpage/AttentionMenu.tsx:354-363` |
| harness exports `publishedModalElement` | `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:169` |
| harness exports `actionableAlertItem` and `installModalDomStubs` | `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:246` |
| `premise` and `premiseHolds` signatures | `tests/_shared/premise.ts:26` |
| the e2e click-outside case exists and is the regression surface | `tests/e2e/published-show-attention.spec.ts`, case "click outside closes the menu; the pill toggles it back open" |
| skeleton renders its own shell with the same `testIdBase` | `components/admin/showpage/ShowReviewModalSkeleton.tsx:44-53` |

## Acceptance criteria

- AC-1 The shell delegates the key to the modal's handler and closes only when it declines: absent the new prop its behavior is byte-identical to today, and the wizard modal and skeleton are unaffected.
- AC-2 The claim classifies per spec §3.3: it survives W1 and W5 (transient) and is cleared by W2, W3 and all five sources of W4 (intentional).
- AC-3 The contract suite covers arms A, C, D, E, F and G against the real component through the committed harness, with executable premises and no instrumentation, each asserting the outcome in spec §6.1's table rather than a uniform survival.
- AC-4 The three regression paths hold end to end: click-outside, menu-Escape, and row-selection, each followed by an Escape that closes the modal.
- AC-6 The claim is consumed exactly once: from state N the first Escape is deferred and the second closes the modal.
- AC-7 The claim is ACQUIRED before paint, on both entry paths (auto-open and pill), and CLEARED on every row of spec §4's coverage matrix, including the two intentional writes that never pass through `onClose` (W2 and W3) and the focus-out source round 3 found uncovered.
- AC-5 The row graduates with its documented limits recorded, F and G named by their disjoint trace signatures. (discharged by Task 4)

<!-- tasks: depth=3 red-contract -->

### Task 1: the contract suite

<!-- task: red=`pnpm vitest run tests/components/admin/showpage/publishedEscapeClaim.test.tsx` red-state=authored red-target=`components/admin/review/ReviewModalShell.tsx:246` why=`arm E asserts the modal SURVIVES an Escape delivered while the panel is down from a transient data change, and the single-consumption case asserts a deferred claim is spent by exactly one key; today the shell closes on any Escape with no test of whether anything consumed it, so both observe requestClose and fail. Arms A, C, D, F and G pass at authoring: A and D pin the shipped contract, C is the positive control, and F and G record documented limits this repair does not close.` ac=AC-3,AC-6,AC-7 -->

**Files:**

- Create: tests/components/admin/showpage/publishedEscapeClaim.test.tsx

**Steps:**

- [ ] Port arms A, C, D, E, F and G from the arc's probe, preserved at the scratchpad path recorded in the marker, dropping every `escprobe` emit. Observation is the shell's own outcome: spy the modal's close path rather than an event record.
- [ ] Assert per spec §6.1's table, which is NOT uniform: A, D and E assert the modal survives; C, F and G assert it CLOSES. F and G are executable records of the §8 documented limits, since a modal-held claim cannot survive either window; asserting a survival there would be red forever.
- [ ] Each arm states its premise with `premiseHolds` immediately above the assertion that rests on it, executing unconditionally and proven on that arm's OWN inputs: arm D asserts `k >= 1` for its fixture, arm A asserts the panel is in the DOM before the key, arm C asserts it is absent.
- [ ] Derive every fixture from the harness builders. No hardcoded counts.
- [ ] Add the pre-listener case, spec §6.2 case 11: deliver Escape after the panel commits but BEFORE its passive listener installs, assert the PANEL is dismissed and the modal stays, then that a second Escape closes the modal. Construct the window with the probe's arm-1 technique, a synchronous commit with the passive queue unflushed. A veto-only implementation passes every other case and swallows this key silently.
- [ ] Add the single-consumption case, spec §6.2 red 10: from state N, the FIRST Escape leaves the modal open and the SECOND closes it. Without it a predicate that returns true forever passes every other assertion here while swallowing every later Escape. The existing two-Escape e2e case cannot substitute: it starts in state M, where the frame consumes and clears the first key, so it never observes N.
- [ ] Add the two intentional dismissals that never pass through `onClose`, spec §6.2 reds 6 and 7: resolving the last actionable item (W2) and the pill toggle (W3), each followed by an Escape that CLOSES the modal. No W4 red reaches either, so without these an implementation can leave the claim pending on an ordinary dismissal and swallow the next key.
- [ ] Add the acquisition case, spec §6.2 red 8: open the panel with the PILL rather than the auto-open, take it down transiently, then Escape leaves the modal open. Arms A, D and E all auto-open, so an implementation that acquires the claim only on that path passes every one of them and fails the first operator who opens the panel by hand. This is an acquisition gap, not a clearing gap.
- [ ] RED: run the command. Arm E fails because the shell closes on an Escape nothing consumed; the rest pass at authoring. Arm E alone is the red, and the task body says so rather than implying every new arm fails.
- [ ] Commit.

### Task 2: the claim and the shell predicate

<!-- task: red=`pnpm vitest run tests/components/admin/showpage/publishedEscapeClaim.test.tsx` red-state=live red-target=`components/admin/review/ReviewModalShell.tsx:246` why=`Task 1 leaves this command failing BEHAVIORALLY on arm E, the acquisition case and the exact-once case; this task is the production change that turns it green, and the SAME command is the gate on both sides. red-state=live is declared relative to THIS task's starting tree, which includes Task 1's commit: run at plan time the same command also exits non-zero, but only because the suite does not exist yet, and a collection failure expresses no verdict in either direction.` ac=AC-1,AC-2 -->

**Files:**

- Modify: components/admin/review/ReviewModalShell.tsx (optional predicate prop; the Escape handler consults it)
- Modify: components/admin/showpage/PublishedReviewModal.tsx (holds the claim; writes it per spec §3.3)

**Steps:**

- [ ] Add the optional HANDLER to `ReviewModalShellProps`, not a boolean veto (spec §3.2). Absent, the shell closes exactly as today. Present, the shell asks it first and closes only when it declines the key. A veto-only shape leaves the pre-listener state P swallowing a key with nothing dismissed, which round 4 found.
- [ ] Hold the claim in a ref in `PublishedReviewModal` and write it at every row of spec §4's coverage matrix.
- [ ] ACQUIRE the claim in a LAYOUT effect, not a passive one (spec §3.4). A passive acquisition leaves a painted panel with neither a claim nor the frame's capture listener behind it, since that listener is passive too, and an Escape in that window reaches the shell with nothing to defer it. That is this spec's own defect reintroduced by its repair; round 3 found it.
- [ ] Ref, not state: read at event time, never re-rendering the panel.
- [ ] GREEN: the Task 1 command passes in full.
- [ ] Commit.

### Task 3: the three regression paths, end to end

<!-- task: red=`BASELINE_SERVER_ONLY=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm exec playwright test tests/e2e/published-show-attention.spec.ts --project=desktop-chromium` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:912` why=`the two new cases assert that an Escape AFTER an intentional dismissal still closes the modal. They are the permissive-direction guard on Task 2's claim: if the claim is set but never cleared at W3, W4 or W5, the modal stops closing and both cases fail. Authored here because the cases do not exist yet.` ac=AC-4 -->

**Files:**

- Modify: tests/e2e/published-show-attention.spec.ts

**Steps:**

- [ ] Add "click outside dismisses the menu, and the next Escape closes the modal".
- [ ] Add "Escape dismisses the menu, and a second Escape closes the modal" as its sibling. The existing Esc-contract case already covers the second half; this one asserts the pair explicitly so a claim that is set and never cleared fails here rather than silently.
- [ ] Add "focus moving outside the menu dismisses it, and the next Escape closes the modal" (spec §6.2 case 5a). Round 3 found this promised in §4 and absent from §6.2; the existing frame test proves only that focus-out calls `onClose`, which says nothing about the claim.
- [ ] Add "selecting a menu row dismisses the menu, and the next Escape closes the modal", alert and sheet warning separately (cases 5b and 5c). Row selection is the fifth source of W4 (`components/admin/showpage/AttentionMenu.tsx:182-185` for the alert row and `components/admin/showpage/AttentionMenu.tsx:221-224` for the sheet-warning row) and the one an enumeration by handler misses; adversarial review round 1 found it absent from the first draft.
- [ ] Both cases run under the harness-readiness contract already in the file: `openModal` awaits `awaitModalHydrated`, never `networkidle`.
- [ ] RED then GREEN on the same command, under `pnpm heavy`.
- [ ] Commit.

<!-- tasks: end -->

### Task 4: closeout

**Red for this task, stated in prose because the marker grammar names production surfaces and this one's surface is a ledger file:** `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` fails while the row is being graduated, because archives categorically reject in-progress entries, and goes green once the `IN PROGRESS` marker comes off in this same commit. AC-5.

**Files:**

- Modify: BACKLOG.md (graduate the row; F and G recorded as documented limits with their trace signatures)

**Steps:**

- [ ] Record the documented limits from spec §8 on the graduating entry, F and G each named by the disjoint signature that re-files it.
- [ ] Remove the `IN PROGRESS` marker in this commit, which is the PR's last, per invariant 12.
- [ ] Full suite under `pnpm heavy`; `pnpm typecheck`; `pnpm exec eslint .`; `pnpm format:check`.
- [ ] Commit.

## Adversarial review (cross-model)

Between self-review and execution handoff, dispatch the plan to Codex through `codex-guard` at `--stage plan`, and the whole diff at `--stage diff`. The brief carries the spec's §1.1 verbatim as its do-not-relitigate list.
