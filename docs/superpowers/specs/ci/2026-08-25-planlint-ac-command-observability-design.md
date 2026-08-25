# Plan-lint: the AC coverage table's producing command must be a command, and must be able to see its criterion

<!-- spec-lint: not-ui — no UI surface; the one `components/**` path in this document is quoted as a corpus citation inside another plan's AC row, not a surface this spec changes -->

**Row:** `BL-PLANLINT-AC-COMMAND-OBSERVABILITY` (BACKLOG.md) · **Branch:** `feat/planlint-ac-command-observability` · **Facing:** process · **Date:** 2026-08-25

## 0. What this ships, in one paragraph

A new `spec:lint` arm, `acCoverage`, over plan documents. A plan opts one markdown table in by writing a declaration comment above it that names which column holds the producing command. In a declared table the arm asserts, hard, that every data row's command cell actually carries a command, and advises, softly, when a row cites an executable pin under `tests/` that the command cannot reach. The arm recognizes nothing in open English. It reads a declaration, an integer, markdown table structure, and inline code spans.

## 1. The defect class

A plan's AC coverage table asserts, per row: the criterion, the task that proves it, and the command that produces the proof. Two failures recurred on `feat/pane-compaction-send-auth`, one per review round, three rounds running.

**(a) The cell is prose, not a command.** Nobody can run it, so nothing produces the proof.

**(b) The command runs, but its resolved file list omits the file holding that row's criterion-specific pin.** The command goes green while the criterion goes unobserved. This is the silent direction: green is exactly the reading a passing AC table is supposed to license.

### 1.1 Resolved scope — do not relitigate

Each decision below is settled, with the evidence that settled it. Verify the citation; do not re-derive the decision.

- **Recognizing the AC table without a declaration.** Refused, with the measurement in section 2. Do not propose header-name matching, heading matching, or last-column heuristics.
- **Executing AC-table commands.** Refused. L-1 is the cost and it is accepted.
- **Repairing the five live corpus instances in section 6.** Those four plans are merged history and this PR does not otherwise touch them. Class-sweep disposition exception (c): the repair spans a tree the PR does not touch, and each is a judgment call about what that plan's third column means.
- **Widening arm (b) beyond `tests/`.** Refused, with the false positive in section 6 as the evidence.
- **The ledger row's arm-(a) mechanism is CORRECTED, not widened.** `sh -nc` alone exits 0 on all four of the row's own prose cells (section 3, executed transcript). The added assertion is "the cell contains an inline code span", which is markdown structure and not English. This came out of the row's own first scheduled step.
- **Hard for (a), advisory for (b).** Ratified in the ledger row itself (`BACKLOG.md`, `BL-PLANLINT-AC-COMMAND-OBSERVABILITY`, under "Shape of the repair"), quoted verbatim:

  ```
  Advisory for (b) — a criterion can legitimately be proved by a new case the plan authors — hard for (a).
  ```

- **The `--` repair to the shared shell seam ships in this PR.** `scripts/spec-lint.ts:864` spawns `sh` with no `--`. It is the same defect class as the arm's own trap, in the one seam the arm calls, and the class-sweep disposition rule's default is repair every instance in the same PR. "Same defect, different file" is explicitly not a sufficient reason to defer it.


### 1.2 The incidents, recovered verbatim

Recovered from the plan's own history rather than restated from the ledger row. Command: `git show <sha>:docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md`.

| Round | AC | The command cell as authored | Shape |
| --- | --- | --- | --- |
| r2 F4 | AC-3 | `task commits carry the outputs` | (a) prose |
| r2 F4 | AC-14 | `adapter suite + meta-test` | (a) prose |
| r2 F4 | AC-15 | `the three red commands` | (a) prose |
| r2 F4 | AC-12 | ``​`pnpm heavy` mutation run, backgrounded`` | (a) variant: a code span that is not the producing command |
| r3 F5 | AC-5 | `both red commands above` | (a) prose |
| r4 F2 | AC-14 | ``​`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/docs/_metaPaneCompactionContract.test.ts`​`` | (b) blind command; the pin is `tests/paneCompaction/driver.test.ts:72` |

Blobs: `173bfccfe` (as authored), `b1db667e0` (r2 repaired), `f921a138b` (r3 repaired), `b3705cebd` (r4 repaired).

## 2. Probe 1: the AC-table grammar is NOT stable, and the ledger row's first scheduled step is why

The row scheduled this first. It settles the design.

```
$ rg -l '^\| AC-' docs/superpowers/plans/
32 files
```

Refined to actual tables (a table is a header row, a delimiter row, and data rows; an AC coverage table is one where at least half the data rows begin with an `AC-<digit>` id):

```
total markdown tables in plan corpus: 827
AC coverage tables:                    34
distinct header rows among them:       34     <- zero repeats
distinct enclosing headings:           24
column counts observed:                2 to 6
```

Every AC coverage table in the corpus has a header row unlike every other one. The header naming the command column is spelled, among others, `Producing command`, `Channel`, `Channel the proof arrives on`, `Executable step that PROVES it`, `The executable step, and the channel it arrives on`, `Evidence`, `Notes`, `Task`, `proved by`, `discharged by`, `claimed by`. Exactly one table repo-wide uses `| AC | Proved by | Producing command |`, and it is the fixture, because it is the only plan that has been through four review rounds on this class.

**Consequence.** Keying the arm on the header name is a recognizer over open English, which the row forbids and which this repo has measured as the losing move. Keying it on the enclosing heading is the same thing with 24 spellings instead of 34. Keying it on "the last column" is worse than either: it is a silent guess, and section 6 shows it produces false hard failures on tables whose last column is a Notes column.

**The design this forces: declaration, not recognition.** That is not a novel move here. It is what `spec:lint` already does everywhere. The task contract fires on `<!-- task: red=... ac=... -->`, the gate arm on `<!-- gate: cmd=... -->`, suppression on `<!-- spec-lint: ignore — <reason> -->`. None of them recognizes prose. Invariant 12 solved the identical problem in the ledger and wrote down why: nothing in a corpus means "this one counts", so the corpus only ever reports what an author wrote down, and the convention costs nothing until it is used and becomes self-enforcing the moment it is.

## 3. Probe 2: `sh -nc` alone is vacuous against every incident it was proposed for

The ledger row proposes, for arm (a), that "every producing-command cell must parse as a command (`sh -nc`, the existing red-arm machinery)". Executed against the row's own cited cells:

```
$ for s in 'both red commands above' 'the three red commands' 'task commits carry the outputs'; do
    sh -nc "$s"; echo "exit=$? for: $s"; done
exit=0 for: both red commands above
exit=0 for: the three red commands
exit=0 for: task commits carry the outputs
```

All three prose cells are syntactically valid shell: a command word followed by argument words. `sh -n` checks syntax and nothing else. **The ratified mechanism for arm (a), taken literally, cannot fire on a single one of the four instances that motivated the row.** It is the vacuous-criterion shape, face (b): a criterion whose truth value is independent of the thing it names.

This is a correction to the row, not a widening of it. The narrowing that does fire is structural and adds no grammar: **a producing-command cell must contain at least one inline code span.** All four prose instances carry no backticks at all. `sh -nc` is kept, as a second and narrower assertion over the span's content, because a span with an unbalanced quote is a real and distinct defect that the span test alone would pass.

## 4. Probe 3: retroactive validation, run where the defects are known to have been

A prototype of the arm was pointed at the four historical blobs before any shipping code was written.

| Blob | State | hard | advisory | Reproduces |
| --- | --- | --- | --- | --- |
| `173bfccfe` | as authored | 4 | 0 | r2 F4, all four cells |
| `b1db667e0` | r2 repaired | 1 | 0 | r3 F5, the one remaining cell |
| `f921a138b` | r3 repaired | 0 | 0 | clean |
| `b3705cebd` | r4 repaired | 0 | 0 | clean |
| `HEAD` | shipped | 0 | 0 | clean |

The arm reproduces r2 F4 exactly (4 of 4) and r3 F5 exactly (1 of 1), and reports clean at every point the arc itself reported clean. It does **not** reproduce r4 F2, for a reason stated as a limit in section 7 rather than papered over.

## 5. Probe 4: plant-both, on the shipped fixture

Each plant is a single-cell edit to the current fixture. The correct form scores 0 hard, 0 advisory (row `HEAD` above), so the criterion moves on both plants and on neither correct form.

```
PLANT (a), AC-1's command cell replaced with prose "both red commands above":
  HARD  AC_COMMAND_CELL_NOT_RUNNABLE  line 365
  -> 1 hard

PLANT (b), driver.test.ts removed from AC-14's command cell (re-breaks r4 F2):
  ADVISORY  AC_COMMAND_PIN_UNOBSERVED  line 378: tests/paneCompaction/driver.test.ts:72
  -> 1 advisory
```

**The prototype is a spec input, so its own limits are stated.** `proto.py` is a throwaway Python approximation, not the shipped code. Its span pairing mirrors `extractSpans` at `lib/specLint/parse.ts:37` (equal-length backtick runs, unclosed runs literal); its cell split is the naive one the shipped reader replaces; and it spawned `sh` WITHOUT `--`, which is how correction 1 in section 6 was found rather than shipped. It iterates every data row of the table it is given, with no cap and no truncation, and prints the row count beside the finding count so a silent under-read is visible. Numbers quoted from it in sections 4, 5 and 6 are re-derived by the shipped suites in AC-6 and AC-7 rather than trusted.

## 6. Probe 5: the corpus false-positive audit, and the two design corrections it forced

The arm was run over every AC coverage table whose last column carries a code span in at least 80 percent of its rows (11 of the 34), as a stand-in for the convention spreading. Full accounting, so no reader recomputes a different total:

| Population | Tables | hard | What they are |
| --- | --- | --- | --- |
| `v1-pre-deployment-amendments/**` handoffs | 6 | 19 | `\| AC \| Phase X status \| Notes \|` tables whose last column is a Notes column. Every one is a mis-declaration under L-4, not a defect. They are the reason the declaration names its column instead of guessing the last one. |
| 2026-08 plans | 5 | 7 | one is the fixture (0 hard); the other four carry 7, of which 2 are false positives designed out below and 5 are true instances of the class |
| total | 11 | 26 | |

The audit surfaced two genuine false positives, both now designed out, and five true instances of the class across three live plans.

**Correction 1: the `sh -nc` argv trap.** A command string beginning with `-` is consumed by `sh` as an option.

```
$ sh -nc '--stat'
sh: --: invalid option        (exit 2)
$ sh -nc -- '--stat'
                              (exit 0)
$ sh -c -- 'echo NORMAL_OK'
NORMAL_OK                     (exit 0)
```

The failure is reported as unparsable, which is indistinguishable from a genuine syntax error and is the wrong verdict. **This bug is live in the shipped red arm today**, at `scripts/spec-lint.ts:864`, which spawns `sh` with `[mode === "parse" ? "-nc" : "-c", command]` and no `--`. No current `red=` command begins with `-` (538 markers scanned, zero matches), so it is latent rather than firing, but the new arm calls the same seam and would reach it. The `--` is added once, at the one seam, with a test in both directions. Adding it does not disturb the normal path, as the third line above shows. This is the class-sweep disposition rule's default: repair every instance of one shape in the same PR, since the marginal cost while already in that code is near zero.

**Correction 2: a cited pin may be the subject, not the proof.** In `2026-08-18-control-outline-border-token.md:70` the row cites `components/admin/Mi11GateActions.tsx:69`, a source file that is the thing under test. Requiring a test command's argument list to name a `.tsx` source file is wrong, and the prototype advised on it. **Arm (b) fires only on cited pins whose path is under `tests/`.** An executable pin, which is what arm (b) is about, is an assertion, and assertions live under `tests/` in this repo. This is a narrowing, and it keeps the r4 F2 case (`tests/paneCompaction/driver.test.ts:72`) in range.

The five true instances the audit found, all shape (a), across three documents, are listed here so a reader can check the arm against them rather than take the count on trust. They are not repaired by this PR; none of those plans declares a table, so the arm never sees them.

| Document | Line | Cell |
| --- | --- | --- |
| `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md` | 21 | `worktree-only; conventional commits; invariant-12 marker riding the branch` |
| `2026-08-20-claim-sweep-after-repair.md` | 844 | `folded into the two halves' own suites as their RED cases ...` |
| `2026-08-20-claim-sweep-after-repair.md` | 849 | `pnpm spec:lint <doc>` (a placeholder; `<doc>` is also an unbalanced redirection) |
| `2026-08-21-control-outline-forward-guard.md` | 369 | `suite summary line` |
| `2026-08-21-control-outline-forward-guard.md` | 378 | `exit code` |

## 7. Documented limits

Stated here, not discovered in a review round.

**L-1. A code span that is not the producing command is not caught.** Incident r2 F4 / AC-12, ``​`pnpm heavy` mutation run, backgrounded``, carries a span, and that span parses. Whether `pnpm heavy` with no child command is the producing command is a semantic claim about what the command does, and only execution decides it. No structural test over markdown can. Out of scope; execution of AC-table commands is not proposed.

**L-2. Arm (b) validates a declared pin; it discovers no absent one.** At `b1db667e0`, the state r4 F2 was raised against, the AC-14 row cited no pin at all: the reviewer knew the pin existed by reading the suite. Arm (b) compares two cells of one row, so it can only fire once someone has written the pin down. Its value is that it makes the r4 repair permanent: an edit that drops `driver.test.ts` from the command now advises, as probe 4 shows. It is not, and must not be cited as, protection against a criterion whose pin nobody named.

**L-3. A table nobody declares is not linted.** By construction. Thirty-three of the corpus's thirty-four AC tables are unlinted on the day this ships. That is the price of refusing a recognizer, and it is the same trade invariant 12 took.

**L-4. A mis-declaration is the author's error and the arm reports it as one.** Declaring column 3 of a `| AC | Status | Notes |` table produces hard findings on every row. The arm cannot tell a mis-declaration from a table full of defects, and does not try. The declaration is deliberate; the fix is to remove it.

**L-5. `sh -n` is bash's `-n` on this machine.** `/bin/sh` is bash in POSIX mode on macOS and dash on the Ubuntu runners. The arm inherits whatever divergence that implies, exactly as the existing red arm already does. No new exposure.

## 8. Design

### 8.1 The declaration

```
<!-- ac-coverage: command-col=N -->
```

on the line immediately preceding a table's header row. `N` is a 1-based column index. One field, because everything else is derivable and every field is a thing an author can get wrong.

Grammar, matching the strictness of the existing marker grammars (`MARKER_ANY` at `lib/specLint/taskContract.ts:32`, `GATE` at `lib/specLint/redContract.ts:37`, `WAIVER` at `lib/specLint/parse.ts:35`): `^ {0,3}<!-- ac-coverage: command-col=([1-9][0-9]*) -->[ \t]*$`. A line matching `^ {0,3}<!-- ac-coverage:` and not the full grammar is `AC_COVERAGE_MALFORMED`, on the same "there is no third form" rule that governs `TASK_MARKER_MALFORMED`. A declaration inside a fence is inert, as every marker is.

### 8.2 Findings

| Code | Severity | Fires when |
| --- | --- | --- |
| `AC_COVERAGE_MALFORMED` | fail | a declaration-shaped line does not match the grammar |
| `AC_COVERAGE_NO_TABLE` | fail | the declaration is not immediately followed by a header row and a delimiter row |
| `AC_COVERAGE_COL_OUT_OF_RANGE` | fail | `command-col` exceeds the header row's column count |
| `AC_COMMAND_CELL_NOT_RUNNABLE` | fail | a data row's command cell contains no inline code span |
| `AC_COMMAND_UNPARSABLE` | fail | the command cell's first inline code span fails `sh -nc --` |
| `AC_COMMAND_PIN_UNOBSERVED` | advisory | a `tests/`-rooted `path:line` pin cited in another cell of the row has a path present in no code span of the command cell |

A data row with fewer cells than the declared column draws `AC_COVERAGE_COL_OUT_OF_RANGE` at that row's line, not silence.

Hard for (a) and advisory for (b) is the row's ratified split, and it is right for a reason worth stating: a criterion can legitimately be proved by a case the plan is about to author, so the file need not exist in the command yet.

### 8.2.1 The accept-set, and every boundary input

The arm is a decider, so it states what it ACCEPTS, keyed on structure. **A command cell is accepted when it contains at least one inline code span whose content is not blank, and whose first such span exits 0 under `sh -nc --`.** Everything else is reported by name in the table above. There is no denylist of rejected spellings, because a denylist accepts whatever it did not model.

Every boundary input, so none of these is discovered in a round:

| Input | Behaviour |
| --- | --- |
| command cell is empty, or whitespace only | no span, so `AC_COMMAND_CELL_NOT_RUNNABLE` |
| the cell's only span is empty or whitespace (``​`` ``​``) | treated as no span, so `AC_COMMAND_CELL_NOT_RUNNABLE`. Blank commands are excluded on the same rationale `parseCheckPlan` already uses at `lib/specLint/redContract.ts:346`: `sh -nc ''` exits 0, so admitting one manufactures a clean parse for a cell that carries no command |
| the cell's first span is blank but a later one is not | the first NON-BLANK span is the one checked; blankness is not a way to select which span is judged |
| a data row has fewer cells than `command-col` | `AC_COVERAGE_COL_OUT_OF_RANGE` at that row's line, never silence |
| the declared table has a header and a delimiter but zero data rows | `AC_COVERAGE_EMPTY_TABLE`, advisory. A declaration that checks nothing is the vacuous shape and must not be silent |
| `command-col=0`, or a non-integer | rejected by the grammar, so `AC_COVERAGE_MALFORMED` |
| two declarations on consecutive lines | the first is followed by a comment, not a header row, so it draws `AC_COVERAGE_NO_TABLE`; the second governs the table |
| a declaration on the file's last line | `AC_COVERAGE_NO_TABLE` |
| a declaration inside a fenced block | inert, like every marker (`lib/specLint/parse.ts:63` sets `fencedInfo` and the arm skips fenced lines) |
| a cell containing an escaped pipe `\|` | not a cell boundary; the table reader splits on unescaped pipes only |
| a document with no declaration at all | the arm contributes no findings and reads no tables |

### 8.3 Seams reused, and the one thing that is new

- **Span extraction.** `extractSpans` at `lib/specLint/parse.ts:37` already pairs inline code spans and records each one's line and 1-based column. The arm filters `model.spans` by the cell's column range rather than re-pairing backticks, so there is one span recognizer in the codebase and it cannot drift.
- **Citation classification.** `classifySpan` at `lib/specLint/citations.ts:28` is the authority on what a `path:line` citation is. Arm (b) extracts candidate substrings with one path-shaped regex and hands each to `classifySpan` for the verdict, so the arm adds no second opinion about citation validity. This matters because the fixture's own pin is written as bare text, not in a span: `the executable payload pin at tests/paneCompaction/driver.test.ts:72`.
- **Shell parse check.** `scripts/spec-lint.ts` owns every subprocess; `lib/specLint/` is pure and a recursive walker enforces it (`tests/specLint/_metaPureCore.test.ts:11`, rooted at `lib/specLint`). The arm therefore produces a parse plan the way `parseCheckPlan` at `lib/specLint/redContract.ts:346` does, the adapter spawns, and the outcomes come back as data. `ParseCheckEntry.source` (`lib/specLint/redContract.ts:340`) gains `"ac-command"` alongside `"red"` and `"gate"`.
- **New:** a column-aware markdown table reader. `parseDoc` has no table model; `TABLE_ROW` at `lib/specLint/universals.ts:37` detects that a line is a table row and stops there. This is the only genuinely new recognizer, it is over markdown pipe structure and nothing else, and it is where escaped pipes are handled.

### 8.4 Where the arm registers

Derived by probing a member. `claimSweep` is the most recently added arm; every place it appears was enumerated, and each site classified as generic (a new arm must be added) or `claimSweep`-specific.

| Site | Why |
| --- | --- |
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
| `lib/specLint/acCoverage.ts` | the module, pure |
| `lib/specLint/types.ts` | the `Check` union (`lib/specLint/types.ts:2`) |
| `lib/specLint/redContract.ts` | `ParseCheckEntry.source` gains a member (`lib/specLint/redContract.ts:340`) |
| `lib/specLint/run.ts` | import, `CHECK_ORDER` entry, invocation |
| `scripts/spec-lint.ts` | the adapter: the parse-plan spawn at `scripts/spec-lint.ts:864`, and the `--` repair there |
| `tests/specLint/acCoverage*.test.ts` | the suites |
| `tests/mutation/source/registry.ts` | enrolment, before round 1 |
| `tests/mutation/_metaPremiseContract.test.ts` | per-enrolled-suite premise counts |
| `docs/superpowers/specs/ci/README.md` | the index row for this document |

`tests/specLint/_metaPureCore.test.ts:11` walks `lib/specLint/` recursively, so the new module is covered by default rather than needing a row. `tests/mutation/_metaGuardSurfaceRegistry.test.ts` validates registry rows it is given and discovers no absent one, so it is not protection against forgetting to enrol.

### 8.5 Mutation enrolment

<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
`lib/specLint/acCoverage.ts` is enrolled in `tests/mutation/source/registry.ts` before the first review dispatch, per the convergence rule that enrolment precedes review. It is authored as an importable module with referring suites, never a terminal script. `operators` is `[...OPERATOR_NAMES]`, and the `OPERATORS:` tail of the round-1 diff brief is read off the shipped registry row rather than retyped.

### 8.6 The fixture declares

`docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md` gains the one declaration line above its AC coverage table. This is the row's named fixture, it scores 0 hard and 0 advisory today, and declaring it makes the r2, r3 and r4 repairs permanent instead of leaving them as prose somebody could undo. Without it the arm ships with no live customer, which is how a gate becomes a zombie.

## 9. Threat fence, probe domain, convergence criterion

**Threat fence.** Accidental authoring mistakes by an ordinary contributor writing a plan. Adversarial obfuscation is out of scope and files to section 7, not to a finding. A contributor who wants the arm silent removes the declaration, which is one line and leaves a diff.

**Probe domain.** The plan corpus under `docs/superpowers/plans/`, plus the four historical blobs of the fixture named in section 1.1. An admissible probe is an input drawn from that set, or one ordinary authoring edit away from an input in it. A constructed fixture outside it files to section 7.

**Consequence bound.** Every declared table's every data row is either checked correctly or reported. There is no input for which the arm silently accepts an unrunnable cell in a declared column. A conservative outcome plus a surfaced finding is a documented limit, not a defect.

**Closed criterion.** Three parts, all mechanical:

1. Zero hard findings and zero advisories across the live plan corpus after this lands. Settled by running `pnpm spec:lint` over every declaring document; on the day this ships there is exactly one, and it measures 0/0 (section 4).
2. Both plants move the criterion and both correct forms leave it unmoved (section 5).
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
3. The mutation score on `lib/specLint/acCoverage.ts` at or above its registry floor with an empty unaccepted-survivor set, over the declared operator set.

Enumerating the inputs on which the arm could conceivably be confused is **not** the convergence criterion; that enumeration does not terminate. The corpus scan does.

## 10. Acceptance criteria

<!-- ac-coverage: command-col=3 -->

| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (a declared table's prose command cell is a hard finding) | Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-2 (a declared table's unparsable span is a hard finding, and `sh -nc --` does not misreport a leading-dash command) | Task 2 + Task 4 | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/redExec.test.ts` |
| AC-3 (an undeclared table draws nothing, including the 33 corpus tables that would otherwise report) | Task 2 corpus case | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-4 (a malformed, table-less, or out-of-range declaration is a hard finding, each with its own code) | Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-5 (a `tests/`-rooted pin the command cannot reach advises; a source-file pin does not) | Task 3 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-6 (retroactive validation: the four historical blobs of section 4 score 4/1/0/0 hard) | Task 3 incident-replay fixtures | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-7 (plant-both: each plant of section 5 moves the criterion, each correct form does not) | Task 3 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-8 (the arm is wired into the orchestrator and reaches the CLI's rendered output and exit code) | Task 5 | `pnpm vitest run tests/specLint/acCoverageCli.test.ts tests/specLint/cli.test.ts` |
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
| AC-9 (`lib/specLint/acCoverage.ts` stays pure) | existing recursive walker | `pnpm vitest run tests/specLint/_metaPureCore.test.ts` |
| AC-10 (the fixture plan declares, and lints clean) | Task 6 | `pnpm spec:lint docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md` |
| AC-11 (mutation score at or above the registry floor, unaccepted survivors empty) | Task 7 | `pnpm heavy pnpm mutation:guards` |
