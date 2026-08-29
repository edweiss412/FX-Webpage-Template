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

This arc modifies `components/`, so the invariant-8 UI quality gate applies and Task 3 runs it. **No marker line appears in this plan, deliberately.** The guard treats the template form as MALFORMED in a real plan (`tests/docs/_invariant8Closeout.ts`, the `opts.template` branch), and the RAN form cannot be written honestly before the gate has run, since its p0 and p1 must be the real counts. So the declaration and its marker land together in Task 3's commit, which is the only point at which both can be true.


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
- AC-4 Every intentional source the matrix maps to an e2e-reachable path holds end to end, each dismissal followed by an Escape that closes the modal. (discharged by Task 2)
- AC-6 The claim is consumed exactly once: from state N the first Escape is deferred and the second closes the modal.
- AC-7 The claim is ACQUIRED before paint, on both entry paths (auto-open and pill), and CLEARED on every row of spec §4's coverage matrix, including the two intentional writes that never pass through `onClose` (W2 and W3) and the focus-out source round 3 found uncovered.
- AC-5 The row graduates: archived with its documented limits recorded, registered in `BACKLOG_GRADUATED` with provenance, and F and G named by their disjoint trace signatures. (discharged by Task 4)

<!-- tasks: depth=3 red-contract -->

### Task 1: the contract suite and the claim, one red-to-green cycle

<!-- task: red=`pnpm vitest run tests/components/admin/showpage/publishedEscapeClaim.test.tsx` red-state=authored red-target=`components/admin/review/ReviewModalShell.tsx:246` why=`the shell calls requestClose on any Escape with no test of whether anything consumed the key, so every case spec §6.2 tags RED BEFORE REPAIR observes that close and fails. The suite and the production change are ONE task because the contract is red-then-green on the SAME command: splitting them put the green half in a task that authors no test, which review round 1 showed cannot complete a cycle.` ac=AC-1,AC-2,AC-3,AC-6,AC-7 -->

**Files:**

- Create: tests/components/admin/showpage/publishedEscapeClaim.test.tsx
- Modify: components/admin/review/ReviewModalShell.tsx (optional handler prop; the Escape listener asks it first)
- Modify: components/admin/showpage/PublishedReviewModal.tsx (holds the claim; writes it per spec §4's matrix)

**Steps:**

- [ ] Write every case in spec §6.2. Take each case's expected outcome and its RED BEFORE REPAIR / PASSES AT AUTHORING tag from the spec; this plan restates neither, because the ten drift instances review round 1 and the author's own sweep found were all restatements of data the spec already holds.
- [ ] Observation is the close path, not a rendered container: `handleClose` calls `useShowModalNav().close`, which is `router.push("/admin", { scroll: false })` (`components/admin/useShowModalNav.ts:30-36`). Assert that ARGUMENT PAIR, since a bare `toHaveBeenCalled` also passes on any other navigation the component performs.
- [ ] **Every case states its own premise executably** with `premiseHolds` (`tests/_shared/premise.ts:36`), proven on that case's OWN inputs and executing unconditionally. Named minimums, each catching a specific vacuous pass:
  - arm A: the panel IS in the DOM at the key.
  - arm C: the panel is absent, so nothing can claim.
  - arm D: `k >= 1` for its fixture, or the blip it stages is not the one it names.
  - arm E: its OWN data change removed the panel, not merely that a panel is absent.
  - arm F: the frame is the skeleton and is title-less, or it is staging some other unmount.
  - arm G: a remount occurred AND the auto-open has not yet fired.
  - **case 11: the frame's passive listener is ABSENT on this run.** Without it a live listener dismisses the panel and stops propagation, producing case 11's expected outcome while exercising nothing, which is the vacuous pass in the very case written to catch a vacuous implementation. Prove it by asserting the panel is mounted AND that a control Escape delivered to the frame does not reach the document, or by asserting the effect-order marker the staging helper records.
- [ ] Stage case 11 with the probed technique: render OUTSIDE `act` and `flushSync`, advance to a macrotask boundary. Spec §6.2 records why the obvious route fails on React 19.2.4.
- [ ] Derive every fixture from the harness builders. No hardcoded counts.
- [ ] RED: run the command. The cases spec §6.2 tags RED BEFORE REPAIR fail; the rest pass.
- [ ] Add the optional HANDLER to `ReviewModalShellProps`, not a boolean veto (spec §3.4). Absent, the shell closes exactly as today, so the wizard modal and the skeleton are untouched.
- [ ] Hold the claim in a ref in `PublishedReviewModal`, ACQUIRED in a layout effect (spec §3.4), and write it at every row of spec §4's matrix.
- [ ] GREEN: the same command passes in full.
- [ ] Commit.

<!-- tasks: end -->

### Task 2: end-to-end regression guards

**Not a red-to-green task, and outside the checked region for that reason.** Review round 1 established why: Task 1 already makes clearing correct for every intentional source, so these cases pass the moment they are authored, and a task that modifies only the test file cannot turn its own command green. Their value is regression detection on the real browser, not a cycle. Declaring them as guards is honest; declaring them as reds would be a marker whose cycle cannot complete.

**Files:** Modify `tests/e2e/published-show-attention.spec.ts`.

**Steps:**

- [ ] Add one case per intentional source that spec §4's matrix maps to an e2e-reachable path: click-outside, focus-out, menu-Escape, alert-row selection, sheet-warning-row selection. Each dismisses the panel, then asserts the NEXT Escape closes the modal.
- [ ] **Detach safety.** The row-selection handlers unmount the menu synchronously (`components/admin/showpage/AttentionMenu.tsx:182-185`), so no `locator.evaluate` or sampler may run against a row element after its click: auto-wait hangs on an unmounted node. Read anything needed from a row BEFORE clicking it, and assert the post-click state through the modal and menu locators only. This task adds NO sampler; that is its explicit disposition.
- [ ] Every case runs under the harness contract already in the file: `openModal` awaits `awaitModalHydrated`, never `networkidle`.
- [ ] Run under `pnpm heavy` with `BASELINE_SERVER_ONLY=1` and the loopback `TEST_DATABASE_URL`.
- [ ] Commit.

### Task 3: the UI quality gate (invariant 8)

**Required because this arc modifies `components/`.** This task both RUNS the gate and adds its marker, in one commit. Naming the two gate halves is what makes a unit "declaring" to the guard, and a declaring unit must carry a valid marker, so naming them earlier than this commit would red the guard for as long as the gap lasted.

**Steps:**

- [ ] Run the impeccable v3 pair on the arc's diff, both halves, with the canonical v3 setup gates.
- [ ] Record findings and dispositions; P0 and P1 are fixed or deferred with a `DEFERRED.md` entry.
- [ ] Add a §12 section naming both halves and carrying the RAN-form marker on its own unindented line, with p0 and p1 as the REAL counts and `dispositions=recorded` when either is non-zero, `none` when both are zero. The guard cross-checks that pair, so an inflated or empty disposition reds it.
- [ ] Commit.

### Task 4: graduation and closeout

**The graduation is not just a deletion.** Round 1 found the gate can go green on a removal: the meta-test checks archive presence only for REGISTERED ids, so deleting an unregistered row would satisfy it without an archived entry or branch provenance.

**Files:** `BACKLOG.md` (remove the row), `BACKLOG-archive.md` (add the archived entry), `tests/docs/_metaDeferralLedgerGraduation.test.ts` (add the `BACKLOG_GRADUATED` row with its provenance).

**Steps:**

- [ ] Move the row to `BACKLOG-archive.md` with spec §8's documented limits recorded, F and G each named by the disjoint trace signature that re-files it.
- [ ] Register the id in `BACKLOG_GRADUATED` with its branch provenance, so the archive assertion actually ranges over this row.
- [ ] Remove the `IN PROGRESS` marker in this commit, which is the PR's last, per invariant 12.
- [ ] `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaInvariant8Closeout.test.ts`, gated on its EXIT STATUS and not on a grep of its output.
- [ ] Full suite under `pnpm heavy`; `pnpm typecheck`; `pnpm exec eslint .`; `pnpm format:check`.
- [ ] Commit.

## Adversarial review (cross-model)

Between self-review and execution handoff, dispatch the plan to Codex through `codex-guard` at `--stage plan`, and the whole diff at `--stage diff`. The brief carries the spec's §1.1 verbatim as its do-not-relitigate list.
