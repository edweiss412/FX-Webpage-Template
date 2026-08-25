# Plan — plan-lint arm for AC-table command observability

**Spec:** `docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md` (spec stage closed at 4 rounds; round-economy filing at `docs/review-rounds/feat/planlint-ac-command-observability/9b1bd6715029.md`) · **Row:** `BL-PLANLINT-AC-COMMAND-OBSERVABILITY` · **Branch:** `feat/planlint-ac-command-observability`

impeccable-gate: N/A — no UI surface

## 1. Meta-test inventory

| Meta-test | CREATES / EXTENDS / covered by default | Why |
| --- | --- | --- |
| `tests/specLint/_metaPureCore.test.ts` | covered by default | it walks `lib/specLint/` recursively from `CORE_DIR` (`tests/specLint/_metaPureCore.test.ts:11`), so the new module is in scope the moment it exists and no row is added. |
| `tests/mutation/_metaPremiseContract.test.ts` | EXTENDS | it walks the enrolled suites with a per-suite expected premise count; each newly enrolled suite needs its row (Task 10). |
| `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | covered by default | it VALIDATES the rows it is given and DISCOVERS no absent one, so it is not protection against forgetting to enrol. Enrolment is a task step. |
| a new registry-style meta-test | NONE, with the reason | the arm adds no Supabase call boundary, no admin mutation surface, no DB artifact, and no new mutation-surface KIND. The one registry it joins already has a validating meta-test, and the suite-derivation pattern it needs exists at `tests/mutation/_metaClaimSweepSuiteDerivation.test.ts`. |

## 2. Mutation-operator family closure

The closure set the diff review converges against, declared up front. The registry row's `operators` is `[...OPERATOR_NAMES]`, the whole set declared at `tests/mutation/source/operators.ts:17`:

`relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal`.

A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard, never hypothesized. The round-1 diff brief's `OPERATORS:` tail is read off the shipped registry row, never retyped.

## 3. Citation lifetime — this plan's own execution invalidates its own red-targets

Stated up front, because it is a temporal dependency that costs arcs a hard failure with no edit to the plan at all.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
`targetProblem` (`lib/specLint/redContract.ts:160`) accepts a PATH-ONLY `red-target=` only while the path is UNTRACKED: a tracked path draws "is tracked; cite the defective line instead of the bare path" (`lib/specLint/redContract.ts:169`). `lib/specLint/acCoverage.ts` does not exist today, so every task below legally cites it path-only AT PLAN TIME. **Task 1 tracks it, and from that commit every path-only citation in this plan, Task 1's own included, is a hard `RED_TARGET_INVALID` — the lint reads the whole plan at any later time and does not care that a task's red already happened.**

Counted, not estimated. The command is anchored to `^<!-- task:` on purpose: a bare count also matches the prose that discusses the citation, including this paragraph's own command.

```
$ grep -c '^<!-- task: .*red-target=`lib/specLint/acCoverage.ts`' <this plan>
6
```

The repair is to RE-POINT, never to waive (Task 11), and two rules make the re-pointing durable:

- **Every `why=` names a SYMBOL or quoted content, never a line.** A symbol survives a shift; a line number does not.
- **`RED_TARGET_INVALID` verifies only that a tracked path has an IN-RANGE line, never what is AT it.** A citation that drifts onto unrelated code stays green by design, so Task 11 re-verifies by READING each cited line and matching it to the symbol its `why=` names. Confirming that a citation resolves establishes nothing.

**Anchor table.** Task 11 fills the HEAD column by reading. The BASE column is what the plan cites now.

```
| Task | red-target at BASE (plan time)              | What the why= names, by symbol            | HEAD (Task 11) |
| ---- | ------------------------------------------- | ----------------------------------------- | -------------- |
| 1    | lib/specLint/acCoverage.ts (untracked)      | `checkAcCoverage`, the stub this creates  | (fill)         |
| 2    | lib/specLint/acCoverage.ts                  | `readDeclaredTables`                      | (fill)         |
| 3    | lib/specLint/acCoverage.ts                  | `commandSpanOf`                           | (fill)         |
| 4    | lib/specLint/acCoverage.ts                  | `acCommandPlan`                           | (fill)         |
| 5    | lib/specLint/acCoverage.ts                  | `code: "AC_COMMAND_PIN_UNOBSERVED"`       | (fill)         |
| 6    | lib/specLint/acCoverage.ts                  | `checkAcCoverage`'s declaration gate      | (fill)         |
| 7    | lib/specLint/run.ts:44 (tracked)            | `CHECK_ORDER`                             | (verify)       |
| 8    | scripts/spec-lint.ts:864 (tracked)          | the `spawnSync("sh", …)` parse invocation | (verify)       |
| 9    | docs/…/2026-08-21-pane-compaction-send-authorization.md:363 (tracked) | the AC coverage table's header row | (verify) |
| 10   | tests/mutation/_metaPremiseContract.test.ts:37 (tracked) | the enrolled-suite expected-count map | (verify) |
```

## 4. Pre-draft code-verification pass, run against the live tree

| Name | Anchor | Verified |
| --- | --- | --- |
| `parseDoc`, `DocModel`, `InlineSpan` | `lib/specLint/parse.ts:65`, `lib/specLint/parse.ts:19`, `lib/specLint/parse.ts:3` | yes |
| span `column` is 1-based and `line.slice(column-1, column-1+len)` recovers the content | probed with `tsx` against a real table row | yes |
| `classifySpan`, `SpanClass` | `lib/specLint/citations.ts:28`, `lib/specLint/citations.ts:5` | yes |
| `targetProblem`'s untracked-path-only allowance | `lib/specLint/redContract.ts:160-171` | yes |
| `ParseCheckEntry` (`line`, `command`, `source`) | `lib/specLint/redContract.ts:340` | yes |
| `parseCheckPlan` | `lib/specLint/redContract.ts:346` | yes |
| `Check` union, 8 members | `lib/specLint/types.ts:2` | yes |
| `CHECK_ORDER` | `lib/specLint/run.ts:44` | yes |
| `exitCodeForResult`: only `fail` exits 1 | `lib/specLint/run.ts:281` | yes |
| the `sh` parse spawn, with NO `--` | `scripts/spec-lint.ts:864` | yes |
| the summary line | `scripts/spec-lint.ts:200` | yes |
| `premise`, `premiseHolds` | `tests/_shared/premise.ts:26`, `tests/_shared/premise.ts:36` | yes |
| `OPERATOR_NAMES`, 6 names | `tests/mutation/source/operators.ts:17` | yes |
| `tests/specLint/redExec.test.ts` passes today (88 tests) | run at plan time | yes, which is why Task 8's red is `authored`, not `live` |

## 5. Reconciliation sweeps, authored AND RUN at plan time

**Sweep A — RETIRED at spec round 3, and recorded so nobody re-derives it.** Earlier drafts counted the inputs a hand-rolled table reader had to survive (75 rows with an escaped pipe, 675 with leading whitespace, 17 with a code span holding an unescaped pipe). The reader is gone; remark answers every one of those, and no task below carries a rule for any of them. The sweep that replaced it is the corpus population and the one structural fact the arm still owns:

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs hazards
tables in the plan corpus, per remark:        929
data rows across them:                        7551
documents carrying MORE THAN ONE AC table:    1
   docs/superpowers/plans/ci/2026-08-20-browser-child-lifetime.md (2)
every pipe/whitespace/backslash question above is remark's, not this arm's
```

**Sweep B — the declaring-document population.** After Task 9 it must return exactly two documents, both PLANS: the fixture and this plan. Run at plan time:

```
$ grep -rl 'ac-coverage: command-col=' docs/
docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md
docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md
```

The spec hit is its own prose describing the grammar, not a declaration — the spec carries no AC-table declaration, because the arm is plan-only (spec §8.6). Task 9 adds the fixture and the assertion becomes: two plan documents declare, and the arm reports zero over both.

**Sweep C — registry array diff.** Task 10's body carries the mechanical before/after of `tests/mutation/source/registry.ts`'s id list and of `_metaPremiseContract`'s suite map, run and pasted, not described.

## 6. Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — the module skeleton

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Creates `lib/specLint/acCoverage.ts` exporting `checkAcCoverage(model: DocModel): Finding[]` returning `[]`, and creates `tests/specLint/acCoverage.test.ts` with the declaration-grammar cases. The stub exists so the red is an ASSERTION on the arm's output, never an unresolved import, which the RED-validity rule rejects by construction.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts` why=`checkAcCoverage is a stub returning [], so every declaration-grammar assertion fails on the arm's output` ac=AC-4 -->

## Task 2 — the declaration and the table reader

`readDeclaredTables` lands: the declaration grammar, the governed-table rule (a declaration is an `html` block and the table it governs is the next `table` block), the column-count check, the empty-table advisory, and the non-plan advisory. A document may carry several declarations, each governing its own table; one corpus plan already does.

**This task hand-rolls no markdown grammar** (spec section 8.3). It consumes the injected view Task 7 builds, so pipes, escapes, whitespace, backslash parity and cell boundaries are remark's answers and appear nowhere in this module. That is the round-3 repair and it is why this task is small.

`AC_COVERAGE_NOT_A_PLAN` needs `doc.kind`, which `checkAcCoverage` receives as a parameter the way `checkSections` does (`lib/specLint/sections.ts:23`).

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts` why=`readDeclaredTables does not exist, so no declaration-level code is ever emitted and the catalog-completeness check has nothing to range over` ac=AC-4,AC-13 -->

## Task 3 — incident replay, which is arm (a)'s red

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Creates `tests/specLint/acCoverageIncidents.test.ts`. The four historical AC tables of spec section 1.2 are checked in as literal fixture text, so the suite is hermetic and cannot be voided by history rewriting. Expected: 4 / 1 / 0 / 0 hard. This suite is the RED for the next task; the counts come from the spec's measurement, not from the arm.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts` why=`commandSpanOf does not exist, so the arm emits zero hard findings against fixtures that must produce four` ac=AC-6 -->

## Task 4 — arm (a), the hard cell checks

`commandSpansOf` and the two hard codes, plus `acCommandPlan` emitting one `AcCommandEntry { line, spanIndex, command }` per COMMAND-CARRYING span. A span carries a command only when its trimmed content is neither empty nor beginning with `#` — `sh -nc -- '# anything'` exits 0, so parseability alone admits a cell holding no command (spec round-3 finding 1). The entry type is the arm's OWN, not `ParseCheckEntry`, and the outcomes come back in the arm's own map keyed by `(line, spanIndex)` — `ExecResults.outcomes` is keyed by line alone (`lib/specLint/types.ts:179`), which silently keeps only the last span of a row (spec round-2 finding 2). `ParseResults` and the red arm are untouched. **EVERY non-blank span must parse, not just the first** (spec section 8.2.1, round-1 finding 1): three of the fixture's rows carry more than one producing command, and a first-span rule accepts a broken second one. A span counts for a cell only when it is FULLY inside that cell's column range; a span straddling a GFM cell boundary belongs to no cell (17 corpus rows carry that shape), so the cell reports as carrying no command. Task 3's suite goes green here.

Four pre-dispatch mutants, run and recorded in the commit, for each string-presence assertion: the value emptied; the value with an appended suffix; the value present but not live (inside a fence in the fixture); each discriminating parameter varied in turn.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts` why=`acCommandPlan does not exist, so no cell is ever parse-checked and neither the first-span nor the later-span unparsable case draws anything` ac=AC-1,AC-2 -->

## Task 5 — arm (b), the advisory, and plant-both

`AC_COMMAND_PIN_UNOBSERVED`. Candidate `path:line` substrings are extracted from the row's other cells with one path-shaped regex and each handed to `classifySpan` for the verdict, so this module holds no second opinion about what a citation is. Fires only where `classifySpan` returns a citation with a line coordinate whose `path` starts with `tests/`.

**Lexical path-boundary match** (spec section 8.2.2). The pin occurs in the command cell's span text with neither neighbour a character that can continue a path (`[A-Za-z0-9_./-]`). Three rounds each found a false accept in a matcher that tried to identify a shell ARGUMENT by splitting on whitespace, so the arm claims nothing about shell words. An absence-only rule is REJECTED and the rejection is a test: it silently drops plant (d).

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Adds all NINE plants of spec section 5 to `acCoverageIncidents.test.ts`, six of which are reviewer probes kept as regression cases. Two are repairs of earlier plants rather than additions, and each carries a comment saying so: (c2) mirrors (c)'s span ordering because (c) survived the line-key collision by luck, and (f) plants prose as well as removing the leading pipe because removing the pipe alone moves nothing. Each plant carries a `premiseHolds` immediately above its assertion, proven on that case's OWN inputs, stating that the unplanted form of the same fixture scores zero, so a fixture that cannot express the difference cannot report a pass.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts` why=`no branch emits AC_COMMAND_PIN_UNOBSERVED, so a tests/-rooted pin the command cannot reach draws nothing, while a components/ pin and a strict-superstring command must each keep drawing exactly what the accept-set says` ac=AC-5,AC-7 -->

## Task 6 — the live-corpus zero case

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Creates `tests/specLint/acCoverageCorpus.test.ts`. Walks `docs/superpowers/plans/` from disk, so a document added later is covered by default, and asserts the arm contributes zero findings to every document carrying no declaration. Carries a `premise` that the walk found more than 30 documents, stated unconditionally relative to what it guards and never inside a `.each` callback, so an empty walk cannot report a pass.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts` why=`the suite does not exist; its planted-declaration case asserts the count moves when a declaration is added to a walked document, which no shipped code yet does` ac=AC-3 -->

## Task 7 — wiring: Check union, orchestrator, adapter, CLI

`types.ts` gains the `Check` member and the injected view's type, `run.ts` gains the import, the `CHECK_ORDER` entry and the invocation, and `scripts/spec-lint.ts` gains three things: the remark parse (`remark().use(remarkGfm)`, the pattern at `lib/reviewRounds/filing.ts:60`), the view it injects, and a SECOND spawn loop for the AC plan keyed by `(line, spanIndex)`.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
The `CHECK_ORDER` entry is compiler-enforced (`lib/specLint/types.ts:45`), so that half cannot be forgotten silently; the `runLint` invocation cannot, which is the half this task's red actually pins. `tests/specLint/acCoverageCli.test.ts` runs the CLI over a document with a prose cell and asserts both that the finding appears in the rendered report and that the process exits 1. This is the exact defect `lib/specLint/types.ts:15` records for `claimSweep`, which shipped complete, tested, scored, and unrendered.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageCli.test.ts` red-state=authored red-target=`lib/specLint/run.ts:44` why=`CHECK_ORDER carries no acCoverage entry and runLint never calls the arm, so the CLI renders nothing and exits 0 on a document with a prose command cell` ac=AC-8 -->

## Task 8 — the `--` repair to the shared shell seam

One token at `scripts/spec-lint.ts:864`. Tested in both directions: a command beginning with `-` no longer reports unparsable, and a genuinely malformed command still does. `red-state` is `authored` and not `live`, because the suite passes today (88 tests, run at plan time) and the failing case is one this task writes.

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:864` why=`the spawnSync("sh", …) parse invocation passes no --, so sh reads a command beginning with a dash as an option and exits 2, which the arm reports as a syntax error` ac=AC-2 -->

## Task 9 — the fixture declares

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Adds the one declaration line above the AC coverage table in `docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md`, and adds the case to `acCoverageCorpus.test.ts` that the fixture declares and the arm reports zero over it. Sweep B is re-run and its output pasted into the commit.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md:363` why=`the AC coverage table's header row carries no declaration above it, so the arm reads nothing there and the declaring-document assertion finds zero declared tables` ac=AC-10 -->

## Task 10 — mutation enrolment and the scored run

Adds the registry row (`operators: [...OPERATOR_NAMES]`, `suitePaths` DERIVED as every `tests/specLint/acCoverage*.test.ts`, with the derivation asserted in BOTH directions so a suite added under either rule reds rather than silently buying zero score), adds the `_metaPremiseContract` rows, and runs the score under `pnpm heavy`, coordinated with the orchestrator so only one fleet-wide score runs at a time.

`EXPECTED_ENV_TOUCHING` (`tests/mutation/_metaPremiseContract.test.ts:37`) declares a per-suite count of environment-touching cases, MEASURED against this tree rather than guessed, and the scanner reads the test BODY, so **each environment-touching case carries its OWN premise naming that case's own population** — a premise in a shared helper executes but is not attributable. That binds Task 6's corpus walk and Task 9's fixture case, both of which read from disk. The counts land in the commit as measured output, not as an estimate.

The scored run is SLOT-TURN PREFLIGHTED before it queues: the invocation is derived from the `package.json` script definition so every `VAR=value` prefix survives, and it is proved cold in a dry mode first, because a first-second crash behind a scarce slot costs the whole queue wait rather than the crash time.

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` red-state=authored red-target=`tests/mutation/_metaPremiseContract.test.ts:37` why=`the enrolled-suite expected-count map has no acCoverage rows, so the walk over the new registry row's suitePaths finds no expected count for them` ac=AC-11 -->

## Task 11 — re-point every invalidated citation, by reading

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Task 1 tracked `lib/specLint/acCoverage.ts`, so the six path-only citations counted in section 3 are now hard `RED_TARGET_INVALID`. Re-point each to `path:line`, and verify by READING the cited line and matching it against the symbol its `why=` names. Fill the anchor table's HEAD column. Confirming a citation resolves establishes nothing.

<!-- task: red=`pnpm spec:lint docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md` red-state=authored red-target=`lib/specLint/redContract.ts:169` why=`the tracked-path-only branch reports "is tracked; cite the defective line instead of the bare path" once Task 1 lands, so this plan fails its own lint until every citation is re-pointed` ac=AC-12 -->

<!-- tasks: end -->

## 7. AC coverage

**AC-9 is claimed by no task marker, deliberately.** Twelve of the spec's thirteen criteria are claimed by an `ac=` field below; AC-9 (the module stays pure) is discharged by a STANDING GATE that predates this arc — `tests/specLint/_metaPureCore.test.ts:11` walks `lib/specLint/` recursively, so the new module is in its population the moment it exists. It has no task and no red BY DESIGN: a guard that passes the moment it is authored is rejected by the red contract, and manufacturing a red for it would mean deliberately shipping an impure module first. Stated here so a reviewer meets the accounting instead of filing the absence as a gap.


This plan declares its own AC coverage table, so the arm's second live customer is this arc's own plan. The declaration is the one this arc ships.

<!-- ac-coverage: command-col=3 -->

| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (prose command cell is a hard finding, and so is a cell whose only spans are comment-only) | Task 4 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-2 (EVERY non-blank span must parse, in EITHER order; a leading-dash command is not misreported) | Task 4 + Task 8 | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/redExec.test.ts` |
| AC-3 (an undeclared table draws nothing, over the whole walked corpus) | Task 6 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-4 (malformed, table-less, out-of-range, empty-table and not-a-plan declarations each draw their own code) | Task 1 + Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-5 (a `tests/`-rooted pin the command cannot reach advises; a source-file pin does not; neither an appended character nor a prepended path segment satisfies the path-boundary match) | Task 5 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-6 (the four historical blobs score 4/1/0/0 hard) | Task 3 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-7 (plant-both: each of the NINE plants moves the criterion for the reason it names, each correct form does not) | Task 5, with the `premiseHolds` pin in the `acCoverageIncidents` suite | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-8 (the arm reaches the CLI's rendered report and its exit code) | Task 7 | `pnpm vitest run tests/specLint/acCoverageCli.test.ts tests/specLint/cli.test.ts` |
| AC-9 (the `acCoverage` module stays pure) | the existing recursive walker | `pnpm vitest run tests/specLint/_metaPureCore.test.ts` |
| AC-10 (the fixture plan declares, and the arm reports zero over it) | Task 9 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-11 (mutation score at or above the registry floor, unaccepted survivors empty) | Task 10 | `pnpm heavy pnpm mutation:guards` |
| AC-12 (every `red-target=` resolves AND its cited line matches the symbol its `why=` names) | Task 11, verified by reading, not by the citation resolving | `pnpm spec:lint docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md` |
| AC-13 (every code named anywhere in the spec is in its section 8.2 catalog, and vice versa) | Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-14 (the arm hand-rolls no markdown grammar: a row without a leading pipe, a doubled backslash before a pipe, and a span crossing a cell boundary all behave as remark parses them) | Task 2, with plants (f) and (g) | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/acCoverageIncidents.test.ts` |
| AC-15 (`lib/specLint/` gains no third-party import; the adapter parses and injects) | Task 7 | `pnpm vitest run tests/specLint/_metaPureCore.test.ts tests/specLint/acCoverageCli.test.ts` |
