# Implementation plan — pre-review gate arms (cluster A)

Spec: `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md`
Branch: `feat/pre-review-gate-arms`

<!-- tasks: depth=2 -->

This plan is the **first enrolled plan** under the convention it ships. Its own task markers are inert until Task 3 lands, at which point `pnpm spec:lint` on this file begins checking them. That is deliberate dogfooding: if the convention is unusable, this plan is where it shows.

## Pre-draft verification (run, not described)

Every claim below was verified against this branch's merge base before drafting.

| Claim | Verification |
| --- | --- |
| `Check` union has 5 members | `lib/specLint/types.ts:2` |
| `CHECK_ORDER` maps every `Check` | `lib/specLint/run.ts:8` |
| plans short-circuit out of section checks | `lib/specLint/sections.ts:27` |
| `parseDoc` exposes `lines`, `fencedInfo`, `headings` | `lib/specLint/parse.ts:65` |
| waiver regex is prefix `spec-lint:`, so `<!-- task: -->` cannot collide | `lib/specLint/parse.ts:35` |
| CLI renders checks from a literal list | `scripts/spec-lint.ts:46` |
| `--artifact` requires `--fallback` | `scripts/codex-guard.mjs:147` |
| prompt composed once at startup | `scripts/codex-guard.mjs:254` |
| result contract written by one function | `scripts/codex-guard.mjs:580` |
| codex-guard test harness exists | `tests/codexGuard/harness.ts` |
| specLint tests are per-module | `tests/specLint/run.test.ts`, `tests/specLint/cli.test.ts` |

**Consequence for Task 2 that the spec did not pin:** `extractSpans` (`lib/specLint/parse.ts:37`) turns the marker's backticked `red=` command into an inline-code span, which the citation checker then sees as a candidate. Commands containing whitespace are excluded from the candidate domain by the ratified rule at `docs/superpowers/specs/2026-07-19-spec-lint.md:23`, so realistic `red=` values are safe — but a single-token dotted command (`` `foo.ts` ``) would be read as a citation. Task 2 pins this with an explicit fixture rather than leaving it to be discovered in review.

## Meta-test inventory (mandatory declaration)


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **CREATES:** `tests/specLint/taskContract.test.ts` — the check's own behavioral suite.
- **EXTENDS:** `tests/specLint/_metaPureCore.test.ts` — the new module must stay I/O-free, and that guard walks the core; adding a file that imports `node:fs` must fail it.
- **EXTENDS:** `tests/specLint/cli.test.ts` — new check must appear in rendered output ordering.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **CREATES:** `tests/codexGuard/lintDoc.test.ts` — flag parsing, embedding, exit-2 refusal, `lintArm` field.
- **Advisory-lock topology:** N/A — this plan touches no `pg_advisory*` path, no DB, and no `shows`/`crew_members` mutation.
- **Layout-dimensions task:** N/A — no UI surface. The diff touches no file under `app/`, none under `components/`, and neither `app/globals.css` nor `DESIGN.md`.
- **Transition-audit task:** N/A — same reason.
- **Mutation-surface observability (invariant 10):** N/A — no HTTP route handler and no `"use server"` action is added.

impeccable-gate: N/A — no UI surface

## Mutation-family closure (guard surface, mandatory)

`taskContract` is a structural guard, so its mutation-operator families are enumerated up front. **This enumeration is the closure set the review converges against.** A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| Family | Mutation | Killed by |
| --- | --- | --- |
| M1 enrollment presence | delete the enrollment line | AC-7 fixture flips to zero findings |
| M2 enrollment arity | add a second enrollment line | `TASK_ENROLL_DUPLICATE` |
| M3 enrollment value | `depth=0`, `depth=7`, `depth=x`, `depth=` | `TASK_ENROLL_MALFORMED` |
| M4 fence evasion | move enrollment or marker inside a fence | AC-9: inert, plan unenrolled |
| M5 marker presence | delete a task's marker | `TASK_MARKER_MISSING` |
| M6 marker arity | duplicate a marker in one extent | `TASK_MARKER_DUPLICATE` |
| M7 marker placement | move a marker above the first task | `TASK_MARKER_ORPHANED` |
| M8 key set | add `foo=bar`; drop `red=`; drop `ac=` | `TASK_MARKER_MALFORMED` / `TASK_RED_EMPTY` / `TASK_AC_MISSING` |
| M9 value shape | `red=` unbackticked; `red=``` empty; `ac=` empty; `ac=NOTANID` | `TASK_RED_EMPTY` / `TASK_AC_MISSING` / `TASK_MARKER_MALFORMED` |
| M10 depth confusion | add headings above and below the enrolled depth | AC-12: neither satisfies nor violates |
| M11 self-satisfaction | cite an `ac=` id that appears only in markers | `TASK_AC_UNRESOLVED` (AC-13) |
| M12 kind leakage | lint the same text as `kind=spec` | AC-10: zero findings |

## Tasks

## Task 1 — enrollment and task segmentation, pure

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-7,AC-9,AC-12 -->


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**RED.** Create `tests/specLint/taskContract.test.ts` covering, against in-memory `DocModel` values built through `parseDoc` (never hand-built objects, so the fence model under test is the real one):

- families M1, M3, M4, M10 from the closure table;
- a plan whose enrolled depth is 2 with `###` sub-headings inside a task, asserting the sub-headings do not end the extent;
- a plan with headings at the enrolled depth *before* the enrollment line, asserting they are not tasks.

Each case states the mutant it kills. Confirm every case fails before implementation, for the stated reason.


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN.** Create `lib/specLint/taskContract.ts` exporting `checkTaskContract(model, kind)`. It reads only `model.lines`, `model.fencedInfo`, and `model.headings`. No `node:fs`, no `node:child_process` — `tests/specLint/_metaPureCore.test.ts` enforces this.

**Verify.** AC-7, AC-9, AC-12. Plus: the module appears in the pure-core guard's walked set.

**Raise the walker floor in the same commit.** `tests/specLint/_metaPureCore.test.ts:28` asserts `files.length >= 7`, and `lib/specLint/` holds exactly 7 files today. Adding an eighth satisfies the floor without moving it, so a later deletion of the new module would leave the suite green — the floor would still be met by the seven survivors. Bump it to 8 when the file lands, so the guard actually pins the new module's existence rather than merely tolerating it.

**Commit.** `feat(spec-lint): segment plan tasks from a declared depth, never from heading text`

## Task 2 — marker grammar and the nine codes

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-6,AC-8,AC-11,AC-13 -->

**RED.** Extend the Task 1 suite with families M2, M5, M6, M7, M8, M9, M11 — one case per code, each asserting the code fires on a fixture exhibiting it **and does not fire** on a sibling fixture exhibiting only the neighbouring defect. That negative half is what makes AC-8 non-tautological: a checker that returned every code on every input would pass the positive half alone.

Add the citation-collision fixture the pre-draft pass surfaced: a marker whose `red=` is a single dotted token, asserting the interaction with the citations check is whatever the implementation actually does, pinned rather than assumed.

Add the **inline-mention fixture**, from a live probe against this very plan. Extracting `ac=` values with a naive substring scan over this file returns `NOTANID` — a string that appears only as an illustrative cell inside the M9 row of the closure table above, never as a marker. The spec anchors markers to a full line (`^<!-- task: (.*) -->$`), so the shipped checker must ignore it. Fixture: a plan whose prose and table cells contain `ac=`, `red=`, and a complete marker-shaped string mid-sentence, asserting zero findings from those and correct findings from the real full-line markers. Failure mode caught: a checker that scans for the marker substring anywhere on a line, which would report phantom tasks in any plan that documents the convention — including this one.


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN.** Implement the nine codes in `lib/specLint/taskContract.ts`.

**Verify.** AC-6, AC-8, AC-11, AC-13, and closure families M2 and M5 through M11.

**Commit.** `feat(spec-lint): nine hard task-contract codes, fail-closed on every unmodelled shape`

## Task 3 — wire the check into the run and the CLI

<!-- task: red=`pnpm vitest run tests/specLint/run.test.ts tests/specLint/cli.test.ts` ac=AC-10 -->

**RED.** Extend `tests/specLint/run.test.ts` with a plan-kind document producing a `taskContract` finding, and a spec-kind document with identical text producing none (AC-10). Extend `tests/specLint/cli.test.ts` asserting `taskContract` findings render under their own heading in the documented check order.

**GREEN.** Add `"taskContract"` to the `Check` union (`lib/specLint/types.ts:2`), give it an entry in `CHECK_ORDER` (`lib/specLint/run.ts:8`), call `checkTaskContract` from `runLint`, and add it to the CLI's rendered check list (`scripts/spec-lint.ts:46`). Confirm the waiver machinery suppresses `taskContract` failures the same way it suppresses other hard findings, and pin that with a case — an undocumented interaction between the two is exactly the silent-acceptance hole §3.4 warns about.

**Verify.** AC-10. From this commit on, `pnpm spec:lint docs/superpowers/plans/2026-08-03-pre-review-gate-arms.md` checks this plan's own markers; run it and record the output in the commit body.

**Commit.** `feat(spec-lint): run the task-contract check for plans, render it in the CLI`

## Task 4 — codex-guard `--lint-doc`

<!-- task: red=`pnpm vitest run tests/codexGuard/lintDoc.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5 -->


**Harness API, verified.** `tests/codexGuard/harness.ts` exports `mkRun` (`tests/codexGuard/harness.ts:107`), `writeScenario` (`tests/codexGuard/harness.ts:133`), `guardEnv` (`tests/codexGuard/harness.ts:148`), `runGuard` (`tests/codexGuard/harness.ts:162`), `readResult` (`tests/codexGuard/harness.ts:201`), and `readCalls` (`tests/codexGuard/harness.ts:205`). `readCalls` returns the `CallRecord` shape at `tests/codexGuard/harness.ts:74`, carrying each invocation's `argv` — which is what makes AC-3's "dispatched nothing" directly assertable (empty array) and AC-1's embed assertable against the real composed prompt rather than a restatement of it.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->

**RED.** Create `tests/codexGuard/lintDoc.test.ts` using that harness, covering:

- AC-1 the embedded block's delimiters and that its body equals the CLI's stdout for the same doc (captured by running the CLI in the test, not by hardcoding expected text — a hardcoded expectation would pass against a broken embed);
- AC-2 `--lint-doc` without `--fallback`, and composed with `--artifact` under `--fallback`;
- AC-3 a doc that makes the CLI exit 2 (a tracked symlink) causes codex-guard to exit 2 and dispatch nothing — asserted by the fake-codex fixture recording zero invocations;
- AC-4 a doc with hard findings still dispatches;
- AC-5 `lintArm` is `"present"` or `"absent"` in the written result.

**GREEN.** Add the flag to `parseArgs`/`buildConfig`, spawn the CLI per doc, embed in `composePrompt` (`scripts/codex-guard.mjs:254`), and add `lintArm` in `writeResult` (`scripts/codex-guard.mjs:580`).

**Verify.** AC-1 through AC-5.

**Commit.** `feat(codex-guard): embed spec:lint output in the brief, and record whether it was asked for`

## Task 5 — the two documentation rules

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-14 -->

**RED.** The existing docs meta-tests are the RED surface: add the §4.1 accept-set rule and the §3.2 plus §3.3 marker convention to `docs/agents/spec-self-review.md`, and confirm `pnpm vitest run tests/docs` plus `pnpm spec:lint` on the edited file stay green. Where no existing guard asserts the rule's presence, state that plainly rather than inventing a test that only proves a string exists.

**GREEN.** The doc edits, plus the `--lint-doc` usage line in the AGENTS.md codex-guard section so the cross-CLI contract records it.

**Verify.** AC-14.

**Commit.** `docs(agents): accept-set discipline for detector specs, and the task-marker convention`

## Task 6 — full local gate

<!-- task: red=`pnpm test` ac=AC-1,AC-14 -->

**RED.** `pnpm test`, `pnpm typecheck` (vitest and playwright projects both), `pnpm lint`, `pnpm format:check`, and `pnpm spec:lint` on both the spec and this plan. Env-bound and e2e suites are excluded from `pnpm test` by configuration and are not implicated by this diff.

**GREEN.** Fix whatever the gate surfaces.

**Verify.** All gates green, output recorded in the commit body.

**Commit.** `test: full local gate for the pre-review gate arms`

## Task 7 — adversarial review (cross-model), CI, merge

<!-- task: red=`gh pr checks` ac=AC-1,AC-14 -->

**BLOCKED — see the note below.** Whole-diff cross-model review, then push, real CI green, `gh pr merge --merge`, fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`. Stage 4.4 then removes the cron nudge and both herdr labels.

## Blocking note — the cross-model review gate is unavailable

Dispatched 2026-08-03 20:5x CDT; three attempts, each exiting 1 in ~10s with:

```
ERROR: You've hit your usage limit. ... try again at Aug 10th, 2026 6:16 PM.
```

This is not the documented silent-death shape (`failureShape: "nonzero_exit"`, not `"no_o_file"`; no reaper involvement). `~/.codex/` holds a single account with no alternate profile, so the spec gate, the plan gate, and the whole-diff gate are all unavailable for approximately seven days. `docs/agents/writing-plans.md:15` makes cross-model review mandatory and says to escalate genuine ambiguity rather than resolve it unilaterally. This is that escalation; the disposition is the user's call.
