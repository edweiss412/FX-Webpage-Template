# Plan-lint: the AC coverage table's producing command must be a command, and must be able to see its criterion

<!-- spec-lint: not-ui — no UI surface; the one `components/**` path in this document is quoted as a corpus citation inside another plan's AC row, not a surface this spec changes -->

**Row:** `BL-PLANLINT-AC-COMMAND-OBSERVABILITY` (BACKLOG.md) · **Branch:** `feat/planlint-ac-command-observability` · **Facing:** process · **Date:** 2026-08-25

## 0. What this ships, in one paragraph

A new `spec:lint` arm, `acCoverage`, over PLAN documents. A plan opts one markdown table in by writing a declaration comment above it that names which column holds the producing command. In a declared table the arm asserts, hard, that every data row's command cell carries commands and that every one of them parses, and advises, softly, when a row cites an executable pin under `tests/` that the command cannot reach. The arm recognizes nothing in open English. It reads a declaration, an integer, markdown table structure, and inline code spans.

## 1. The defect class

A plan's AC coverage table asserts, per row: the criterion, the task that proves it, and the command that produces the proof. Two failures recurred on `feat/pane-compaction-send-auth`, one per review round, three rounds running.

**(a) The cell is prose, not a command.** Nobody can run it, so nothing produces the proof.

**(b) The command runs, but its resolved file list omits the file holding that row's criterion-specific pin.** The command goes green while the criterion goes unobserved. This is the silent direction: green is exactly the reading a passing AC table is supposed to license.

### 1.1 Resolved scope — do not relitigate

Each decision below is settled, with the evidence that settled it. Verify the citation; do not re-derive the decision.

- **Declaration instead of recognition.** Section 2 measures it. Do not propose header-name matching, enclosing-heading matching, or a last-column heuristic.
- **The ledger row's arm-(a) mechanism is CORRECTED, not widened.** `sh -nc` alone exits 0 on all four of the row's own prose cells (section 3, executed transcript). The added assertion is "the cell contains an inline code span", which is markdown structure and not English. This came out of the row's own first scheduled step.
- **Hard for (a), advisory for (b).** Ratified in the ledger row itself (`BACKLOG.md`, `BL-PLANLINT-AC-COMMAND-OBSERVABILITY`, under "Shape of the repair"), quoted verbatim:

  ```
  Advisory for (b) — a criterion can legitimately be proved by a new case the plan authors — hard for (a).
  ```

- **The `--` repair to the shared shell seam ships in this PR.** `scripts/spec-lint.ts:864` spawns `sh` with no `--`. It is the same defect class as the arm's own trap, in the one seam the arm calls, and the class-sweep disposition rule's default is repair every instance in the same PR. "Same defect, different file" is explicitly not a sufficient reason to defer it.
- **EVERY non-blank span in a command cell must parse, not just the first** (round-1 finding 1). A command cell may therefore not carry backticked text that is not a command. An aside belongs outside the code span. Section 6.3 measures what that costs on the live corpus.
- **Arm (b) matches a WHOLE ARGUMENT, never a substring** (round-1 finding 2).
- **Arm (b) validates, it does not discover.** Documented limit L-2, with the reason. Do not file "arm (b) would not have caught r4 F2" as a finding; this spec says so first.
- **Thirty-three corpus tables go unlinted on day one.** Documented limit L-3, accepted deliberately as the price of refusing a recognizer.
- **The five true corpus instances in section 6.3 are not repaired here.** Class-sweep disposition exception (c): the repair spans a tree this PR does not otherwise touch, and each is a judgment call about what that plan's third column means.

### 1.2 The incidents, recovered verbatim

Recovered from the plan's own history rather than restated from the ledger row. Command: `git show <sha>:docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md`.

| Round | AC | The command cell as authored | Shape |
| --- | --- | --- | --- |
| r2 F4 | AC-3 | `task commits carry the outputs` | (a) prose |
| r2 F4 | AC-14 | `adapter suite + meta-test` | (a) prose |
| r2 F4 | AC-15 | `the three red commands` | (a) prose |
| r2 F4 | AC-12 | ``​`pnpm heavy` mutation run, backgrounded`` | (a) variant: a code span that is not the producing command |
| r3 F5 | AC-5 | `both red commands above` | (a) prose |
| r4 F2 | AC-14 | a runnable command whose file list omitted `tests/paneCompaction/driver.test.ts` | (b) blind command; the pin is `tests/paneCompaction/driver.test.ts:72` |

Blobs: `173bfccfe` (as authored), `b1db667e0` (r2 repaired), `f921a138b` (r3 repaired), `b3705cebd` (r4 repaired).

## 2. Probe 1: the AC-table grammar is NOT stable, and the ledger row's first scheduled step is why

The row scheduled this first. It settles the design.

```
$ grep -rl '^| AC-' docs/superpowers/plans/ --include='*.md' | wc -l
32
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

**Consequence.** Keying the arm on the header name is a recognizer over open English, which the row forbids and which this repo has measured as the losing move. Keying it on the enclosing heading is the same thing with 24 spellings instead of 34. Keying it on "the last column" is worse than either: it is a silent guess, and section 6.3 shows it producing 42 hard findings on six v1-era tables whose last column is a Notes column.

**The design this forces: declaration, not recognition.** That is not a novel move here. It is what `spec:lint` already does everywhere. The task contract fires on `<!-- task: red=... ac=... -->`, the gate arm on `<!-- gate: cmd=... -->`, suppression on `<!-- spec-lint: ignore — <reason> -->`. None of them recognizes prose. Invariant 12 solved the identical problem in the ledger and wrote down why: nothing in a corpus means "this one counts", so the corpus only ever reports what an author wrote down, and the convention costs nothing until it is used and becomes self-enforcing the moment it is.

## 3. Probe 2: `sh -nc` alone is vacuous against every incident it was proposed for

The ledger row proposes, for arm (a), that "every producing-command cell must parse as a command (`sh -nc`, the existing red-arm machinery)". Executed against all four of the row's own cited prose cells:

```
$ for s in 'task commits carry the outputs' 'adapter suite + meta-test' \
           'the three red commands' 'both red commands above'; do
    sh -nc -- "$s"; printf 'exit=%s for: %s\n' "$?" "$s"; done
exit=0 for: task commits carry the outputs
exit=0 for: adapter suite + meta-test
exit=0 for: the three red commands
exit=0 for: both red commands above
```

All four prose cells are syntactically valid shell: a command word followed by argument words. `sh -n` checks syntax and nothing else. **The ratified mechanism for arm (a), taken literally, cannot fire on a single one of the four instances that motivated the row.** It is the vacuous-criterion shape, face (b): a criterion whose truth value is independent of the thing it names.

This is a correction to the row, not a widening of it. The narrowing that does fire is structural and adds no grammar: **a producing-command cell must contain at least one inline code span.** All four prose instances carry no backticks at all. `sh -nc` is kept, as a second and narrower assertion over each span's content, because a span with an unbalanced quote is a real and distinct defect that the span test alone would pass.

## 4. Probe 3: retroactive validation, run where the defects are known to have been

A prototype of the arm was pointed at the four historical blobs before any shipping code was written. Re-run after the round-1 repairs (every span, whole-argument pins, trailing-pipe tolerance); the counts are unchanged.

| Blob | State | hard | advisory | Reproduces |
| --- | --- | --- | --- | --- |
| `173bfccfe` | as authored | 4 | 0 | r2 F4, all four cells |
| `b1db667e0` | r2 repaired | 1 | 0 | r3 F5, the one remaining cell |
| `f921a138b` | r3 repaired | 0 | 0 | clean |
| `b3705cebd` | r4 repaired | 0 | 0 | clean |
| `HEAD` | shipped | 0 | 0 | clean |

The arm reproduces r2 F4 exactly (4 of 4) and r3 F5 exactly (1 of 1), and reports clean at every point the arc itself reported clean. It does **not** reproduce r4 F2, for a reason stated as a limit in section 7 rather than papered over.

## 5. Probe 4: plant-both, on the shipped fixture

Each plant is a single-cell edit to the current fixture. The unplanted fixture scores 0 hard, 0 advisory (row `HEAD` above), so the criterion moves on every plant and on no correct form. Two of the four plants are the round-1 reviewer's own probes, kept as regression cases.

```
PLANT (a), AC-1's command cell replaced with prose "both red commands above":
  HARD  AC_COMMAND_CELL_NOT_RUNNABLE  line 365
  -> 1 hard, 0 advisory

PLANT (b), driver.test.ts removed from AC-14's command cell (re-breaks r4 F2):
  ADVISORY  AC_COMMAND_PIN_UNOBSERVED  line 378: tests/paneCompaction/driver.test.ts:72
  -> 0 hard, 1 advisory

PLANT (c), r1 F1 — an unmatched quote in AC-15's SECOND of three commands:
  HARD  AC_COMMAND_UNPARSABLE  line 379: "pnpm vitest run 'tests/paneCompaction/adapter.test.ts"
  -> 1 hard, 0 advisory

PLANT (d), r1 F2 — AC-14's command names driver.test.tsx, a strict superstring of the pin:
  ADVISORY  AC_COMMAND_PIN_UNOBSERVED  line 378: tests/paneCompaction/driver.test.ts:72
  -> 0 hard, 1 advisory
```

**The prototype is a spec input, so its own limits are stated.** `proto2.py` is a throwaway Python approximation, not the shipped code. Its span pairing mirrors `extractSpans` at `lib/specLint/parse.ts:37` (equal-length backtick runs, unclosed runs literal). Its first version spawned `sh` WITHOUT `--`, which is how correction 1 in section 6.1 was found rather than shipped, and checked only a cell's first span, which is how round-1 finding 1 reached a reviewer rather than a suite. It iterates every data row of the table it is given, with no cap and no truncation, and prints the row count beside the finding count so a silent under-read is visible. Numbers quoted from it in sections 4, 5 and 6 are re-derived by the shipped suites in AC-6 and AC-7 rather than trusted.

## 6. Probe 5: the corpus audit, and the three design corrections it forced

### 6.1 Correction 1: the `sh -nc` argv trap

A command string beginning with `-` is consumed by `sh` as an option.

```
$ sh -nc '--stat'
sh: --: invalid option        (exit 2)
$ sh -nc -- '--stat'
                              (exit 0)
$ sh -c -- 'echo NORMAL_OK'
NORMAL_OK                     (exit 0)
```

The failure is reported as unparsable, which is indistinguishable from a genuine syntax error and is the wrong verdict. **This bug is live in the shipped red arm today**, at `scripts/spec-lint.ts:864`, which spawns `sh` with `[mode === "parse" ? "-nc" : "-c", command]` and no `--`. No current `red=` command begins with `-`, so it is latent rather than firing:

```
$ git grep -hoE '<!-- task: red=`[^`]*`' -- '*.md' | sed 's/.*red=`//; s/`$//' | wc -l
572
$ git grep -hoE '<!-- task: red=`[^`]*`' -- '*.md' | sed 's/.*red=`//; s/`$//' | grep -cE '^[[:space:]]*-'
0
```

The `--` is added once, at the one seam, with a test in both directions. Adding it does not disturb the normal path, as the third transcript line above shows.

### 6.2 Correction 2: a cited pin may be the subject, not the proof

In `docs/superpowers/plans/2026-08-18-control-outline-border-token.md:70` the row cites `components/admin/Mi11GateActions.tsx:69`, a source file that is the thing under test. Requiring a test command's argument list to name a `.tsx` source file is wrong, and the prototype advised on it. **Arm (b) fires only on cited pins whose path is under `tests/`.** An executable pin, which is what arm (b) is about, is an assertion, and assertions live under `tests/` in this repo. This keeps the r4 F2 case (`tests/paneCompaction/driver.test.ts:72`) in range.

### 6.3 The audit, with full accounting

The arm was run over every AC coverage table whose last column carries a code span in at least 80 percent of its rows (11 of the 34), as a stand-in for the convention spreading. Full accounting, so no reader recomputes a different total:

| Population | Tables | hard | What they are |
| --- | --- | --- | --- |
| `v1-pre-deployment-amendments/**` handoffs | 6 | 42 | `AC / Phase X status / Notes` tables whose last column is a Notes column. Every one is a mis-declaration under L-4, not a defect. They are the reason the declaration names its column instead of guessing the last one. |
| 2026-08 plans | 5 | 6 | one is the fixture (0 hard); the other four carry 6, and all six are true instances of the class |
| total | 11 | 48 | |

The six true instances, across three documents, are listed so a reader can check the arm against them rather than take the count on trust. They are not repaired by this PR; none of those plans declares a table, so the arm never sees them.

| Document | Line | Code | Cell or span |
| --- | --- | --- | --- |
| `docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md` | 21 | `AC_COMMAND_CELL_NOT_RUNNABLE` | `worktree-only; conventional commits; invariant-12 marker riding the branch` |
| `docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md` | 844 | `AC_COMMAND_CELL_NOT_RUNNABLE` | `folded into the two halves' own suites as their RED cases ...` |
| `docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md` | 849 | `AC_COMMAND_UNPARSABLE` | `pnpm spec:lint <doc>` (a placeholder; `<doc>` is an unbalanced redirection) |
| `docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md` | 369 | `AC_COMMAND_CELL_NOT_RUNNABLE` | `suite summary line` |
| `docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md` | 378 | `AC_COMMAND_CELL_NOT_RUNNABLE` | `exit code` |
| `docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md` | 385 | `AC_COMMAND_UNPARSABLE` | `expect(major).toBe(4)`, a JS expression in a Channel column |

**Correction 3, and what the all-spans rule costs.** Under the round-1 repair every non-blank span must parse, and the last row above is the only new finding it produces across the whole 11-table stand-in. It is in a table whose third column is headed `Channel`, so it is a mis-declaration under L-4 rather than a false positive. The `--` repair simultaneously REMOVED two prior false positives (`--stat` and `-` in `2026-08-18-control-outline-border-token.md`), which is why that table now scores zero and is absent from the list.

### 6.4 Table-reader hazards, measured

Each behaviour in section 8.2.1 is specified because the corpus contains the input, not because it was imagined. Counted over unfenced table-shaped rows in `docs/superpowers/plans/`:

```
unfenced table-shaped rows in the plan corpus: 9493
  carrying an escaped pipe (\|):                 75
  with leading whitespace before the pipe:      675
  with a code span containing an unescaped |:    17
```

## 7. Documented limits

Stated here, not discovered in a review round.

**L-1. A code span that is a plausible command but is not THE producing command is not caught.** Incident r2 F4 / AC-12, ``​`pnpm heavy` mutation run, backgrounded``, carries a span that parses. Whether `pnpm heavy` with no child command is the producing command is a semantic claim about what the command does, and only execution decides it. No structural test over markdown can. Out of scope; execution of AC-table commands is not proposed.

**L-2. Arm (b) validates a declared pin; it discovers no absent one.** At `b1db667e0`, the state r4 F2 was raised against, the AC-14 row cited no pin at all: the reviewer knew the pin existed by reading the suite. Arm (b) compares two cells of one row, so it can only fire once someone has written the pin down. Its value is that it makes the r4 repair permanent: an edit that drops `driver.test.ts` from the command now advises, as plants (b) and (d) show. It is not, and must not be cited as, protection against a criterion whose pin nobody named.

**L-3. A table nobody declares is not linted.** By construction. Thirty-three of the corpus's thirty-four AC tables are unlinted on the day this ships. That is the price of refusing a recognizer, and it is the same trade invariant 12 took.

**L-4. A mis-declaration is the author's error and the arm reports it as one.** Declaring column 3 of an `AC / Status / Notes` table produces hard findings on every row. The arm cannot tell a mis-declaration from a table full of defects, and does not try. The declaration is deliberate; the fix is to remove it.

**L-5. `sh -n` is whatever `/bin/sh` is on the host.** It is bash in POSIX mode on macOS and dash on the Ubuntu runners. The arm inherits whatever divergence that implies, exactly as the existing red arm already does. No new exposure.

**L-6. Arm (b)'s whole-argument match does not resolve globs or shell expansion.** A command that reaches the pin's file only through `tests/**` or a variable draws an advisory it does not deserve. Advisory is the correct severity precisely because this case exists; the author reads it and moves on.

## 8. Design

### 8.1 The declaration

```
<!-- ac-coverage: command-col=N -->
```

above a table's header row, separated from it by nothing or by blank lines only. `N` is a 1-based column index. One field, because everything else is derivable and every field is a thing an author can get wrong.

Grammar, matching the strictness of the existing marker grammars (`MARKER_ANY` at `lib/specLint/taskContract.ts:32`, `GATE` at `lib/specLint/redContract.ts:37`, `WAIVER` at `lib/specLint/parse.ts:35`): `^ {0,3}<!-- ac-coverage: command-col=([1-9][0-9]*) -->[ \t]*$`. A line matching `^ {0,3}<!-- ac-coverage:` and not the full grammar is `AC_COVERAGE_MALFORMED`, on the same "there is no third form" rule that governs `TASK_MARKER_MALFORMED`. A declaration inside a fence is inert, as every marker is.

**The blank-line allowance is load-bearing, and was found by running the rule against this document.** Prettier leaves both the adjacent form and the blank-line-separated form untouched, and prettier-idiomatic markdown puts a blank line there. An earlier draft of this spec said "the line immediately preceding", and prettier had already put a blank line above this spec's own example, so the rule as written failed its own illustration.

### 8.2 Findings

| Code | Severity | Fires when |
| --- | --- | --- |
| `AC_COVERAGE_MALFORMED` | fail | a declaration-shaped line does not match the grammar |
| `AC_COVERAGE_NO_TABLE` | fail | skipping blank lines forward, the next line is not a table header row followed by a delimiter row |
| `AC_COVERAGE_COL_OUT_OF_RANGE` | fail | `command-col` exceeds the header row's column count, or a data row has fewer cells than that |
| `AC_COVERAGE_EMPTY_TABLE` | advisory | the declared table has a header and a delimiter but no data rows, so the declaration checks nothing |
| `AC_COVERAGE_NOT_A_PLAN` | advisory | a declaration appears in a document whose kind is not `plan`, where the arm does not run |
| `AC_COMMAND_CELL_NOT_RUNNABLE` | fail | a data row's command cell contains no non-blank inline code span |
| `AC_COMMAND_UNPARSABLE` | fail | ANY non-blank inline code span in the command cell fails `sh -nc --` |
| `AC_COMMAND_PIN_UNOBSERVED` | advisory | a `tests/`-rooted `path:line` pin cited in another cell of the row is named by no whole argument of the command cell's spans |

Hard for (a) and advisory for (b) is the row's ratified split, and it is right for a reason worth stating: a criterion can legitimately be proved by a case the plan is about to author, so the file need not exist in the command yet.

**The arm runs on `plan`-kind documents only.** `lib/specLint/run.ts:135` seats the parse plan as `doc.kind === "plan" ? parseCheckPlan(model) : []`, and `checkSections` takes the same posture in the other direction (`lib/specLint/sections.ts:26`). The row calls this a plan-lint arm. A declaration elsewhere would then be read by nothing, which is the vacuous shape, so it draws `AC_COVERAGE_NOT_A_PLAN` rather than silence.

### 8.2.1 The accept-set, and every boundary input

The arm is a decider, so it states what it ACCEPTS, keyed on structure. **A command cell is accepted when it contains at least one non-blank inline code span fully inside the cell, and EVERY such span exits 0 under `sh -nc --`.** Everything else is reported by name in the table above. There is no denylist of rejected spellings, because a denylist accepts whatever it did not model.

Every-span rather than first-span is round-1 finding 1: three of the fixture's rows carry more than one producing command, and a first-span rule accepts a broken second one. The cost is that a command cell may not carry backticked text that is not a command; section 6.3 measures that cost at one finding across the whole 11-table stand-in, in a table that should not have declared.

Every boundary input, so none of these is discovered in a round:

| Input | Behaviour |
| --- | --- |
| command cell is empty, or whitespace only | no span, so `AC_COMMAND_CELL_NOT_RUNNABLE` |
| the cell's only span is empty or whitespace | treated as no span, so `AC_COMMAND_CELL_NOT_RUNNABLE`. Blank commands are excluded on the same rationale `parseCheckPlan` already uses at `lib/specLint/redContract.ts:346`: `sh -nc ''` exits 0, so admitting one manufactures a clean parse for a cell that carries no command |
| a span straddles a cell boundary, because an unescaped `\|` sits inside backticks | GFM splits cells on unescaped pipes even inside code, and `extractSpans` pairs over the WHOLE LINE, so such a span is fully inside no cell and counts for none. The cell then reports as carrying no command, which tells the author to escape the pipe. 17 rows in the plan corpus already carry this shape (section 6.4) |
| a data row has fewer cells than `command-col` | `AC_COVERAGE_COL_OUT_OF_RANGE` at that row's line, never silence |
| a row omits the trailing pipe | GFM allows it, and prettier does NOT normalize it away (probed). End-of-line closes the final cell, so the command cell is not silently dropped |
| a row carries an escaped pipe `\|` | not a cell boundary; the reader splits on unescaped pipes only. 75 rows in the plan corpus carry one |
| a row has leading whitespace before its first pipe | tolerated; the reader matches `^\s*\|`. 675 rows in the plan corpus do |
| the declared table has a header and a delimiter but zero data rows | `AC_COVERAGE_EMPTY_TABLE`, advisory. A declaration that checks nothing must not be silent |
| `command-col=0`, or a non-integer | rejected by the grammar, so `AC_COVERAGE_MALFORMED` |
| blank lines between the declaration and the table | the declaration governs the table; blank lines are skipped forward |
| a non-blank, non-table line between them | `AC_COVERAGE_NO_TABLE` |
| two declarations on consecutive lines | the first is followed by a comment, not a header row, so it draws `AC_COVERAGE_NO_TABLE`; the second governs the table |
| a declaration on the file's last line | `AC_COVERAGE_NO_TABLE` |
| a declaration inside a fenced block | inert, like every marker; the arm skips lines whose `fencedInfo` is set |
| a declaration in a non-`plan` document | `AC_COVERAGE_NOT_A_PLAN`, advisory |
| a document with no declaration at all | the arm contributes no findings and reads no tables |

### 8.2.2 Arm (b)'s matching rule

A candidate `path:line` substring is extracted from the row's other cells with one path-shaped regex and handed to `classifySpan` at `lib/specLint/citations.ts:28` for the verdict, so the arm holds no second opinion about what a citation is. It fires when `classifySpan` returns a citation with a line coordinate whose `path` starts with `tests/`.

**The path must match a WHOLE ARGUMENT of the command, never a substring** (round-1 finding 2). The command cell's span contents are joined, split on whitespace, each token stripped of surrounding quotes, and the pin matches when a token equals the path, equals `./` plus the path, or ends with `/` plus the path. Substring containment would accept a command naming the pin's path with one extra character appended (`tests/paneCompaction/driver.test.ts` plus an `x`, a file that does not exist) for a pin naming `tests/paneCompaction/driver.test.ts`, which is one character of ordinary editing away and is the exact wrong-accept the advisory exists to catch.

### 8.3 Seams reused, and the one thing that is new

- **Span extraction.** `extractSpans` at `lib/specLint/parse.ts:37` already pairs inline code spans and records each one's line and 1-based column, and `parseDoc` exposes them as `DocModel.spans`. The arm filters those by the cell's column range rather than re-pairing backticks, so there is one span recognizer in the codebase and it cannot drift. `line.slice(column - 1, column - 1 + content.length)` recovers the content exactly; probed against a real table row.
- **Citation classification.** `classifySpan` at `lib/specLint/citations.ts:28` is the authority, as section 8.2.2 states. This matters because the fixture's own pin is written as bare text, not in a span: `the executable payload pin at tests/paneCompaction/driver.test.ts:72`.
- **Shell parse check.** `scripts/spec-lint.ts` owns every subprocess; `lib/specLint/` is pure and a recursive walker enforces it (`tests/specLint/_metaPureCore.test.ts:11`, rooted at `lib/specLint`). The arm therefore produces a parse plan the way `parseCheckPlan` at `lib/specLint/redContract.ts:346` does, the adapter spawns, and the outcomes come back as data.
- **Ownership of the parse synthesis.** `synthesizeParseFindings` at `lib/specLint/redContract.ts:510` already branches on `ParseCheckEntry.source`. Rather than adding a third branch there, `acCoverage` owns its own plan and its own synthesizer, and the ADAPTER spawns the concatenation of both plans and hands the one shared `ParseResults` to both. The results map is keyed by LINE and an AC row's line can never collide with a marker's, so one spawn batch serves both and `acCoverage` findings are produced by the `acCoverage` module. The AC entries are NOT fed to `parseFailedLines` (`lib/specLint/run.ts:141`), whose job is excluding red markers from EXECUTION; AC commands are never executed. A cell with several spans contributes several entries, keyed by line and by span index.
- **New:** a column-aware markdown table reader. `parseDoc` has no table model; `TABLE_ROW` at `lib/specLint/universals.ts:37` detects that a line is a table row and stops there. This is the only genuinely new recognizer, it is over markdown pipe structure and nothing else, and it is where escaped pipes, leading whitespace and the optional trailing pipe are handled.

### 8.4 Where the arm registers

Derived by probing a member. `claimSweep` is the most recently added arm; every place it appears was enumerated and each site classified.

| Site | Why |
| --- | --- |
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
| `lib/specLint/acCoverage.ts` | the module, pure |
| `lib/specLint/types.ts` | the `Check` union (`lib/specLint/types.ts:2`) |
| `lib/specLint/redContract.ts` | `ParseCheckEntry.source` gains a member (`lib/specLint/redContract.ts:340`) |
| `lib/specLint/run.ts` | import, `CHECK_ORDER` entry (`lib/specLint/run.ts:44`), invocation |
| `scripts/spec-lint.ts` | the adapter: the parse-plan spawn at `scripts/spec-lint.ts:864`, and the `--` repair there |
| `tests/specLint/acCoverage*.test.ts` | the suites |
| `tests/mutation/source/registry.ts` | enrolment, before round 1 of the diff review |
| `tests/mutation/_metaPremiseContract.test.ts` | per-enrolled-suite premise counts |
| `docs/superpowers/specs/ci/README.md` | the index row for this document |

`tests/specLint/_metaPureCore.test.ts:11` walks `lib/specLint/` recursively, so the new module is covered by default rather than needing a row. `tests/mutation/_metaGuardSurfaceRegistry.test.ts` validates registry rows it is given and discovers no absent one, so it is not protection against forgetting to enrol.

### 8.5 Mutation enrolment

<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
`lib/specLint/acCoverage.ts` is enrolled in `tests/mutation/source/registry.ts` before the first diff dispatch, per the convergence rule that enrolment precedes review. It is authored as an importable module with referring suites, never a terminal script. `operators` is `[...OPERATOR_NAMES]` (`tests/mutation/source/operators.ts:17`), and the `OPERATORS:` tail of the round-1 diff brief is read off the shipped registry row rather than retyped.

### 8.6 The fixture declares, and so does this arc's plan

`docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md` gains the one declaration line above its AC coverage table. It is the row's named fixture, it scores 0 hard and 0 advisory today, and declaring it makes the r2, r3 and r4 repairs permanent instead of leaving them as prose somebody could undo. This arc's own plan declares its AC coverage table too. Without live customers the arm ships as a zombie; with two, the convention is exercised the day it lands.

This SPEC does not declare. It is a spec, the arm is plan-only, and a declaration here would claim a check that does not happen.

## 9. Threat fence, probe domain, convergence criterion

**Threat fence.** Accidental authoring mistakes by an ordinary contributor writing a plan. Adversarial obfuscation is out of scope and files to section 7, not to a finding. A contributor who wants the arm silent removes the declaration, which is one line and leaves a diff.

**Probe domain.** The plan corpus under `docs/superpowers/plans/`, plus the four historical blobs of the fixture named in section 1.2. An admissible probe is an input drawn from that set, or one ordinary authoring edit away from an input in it. A constructed fixture outside it files to section 7.

**Consequence bound.** Every data row of every declared table is handled correct or signaled, never silently wrong. There is no input for which the arm silently accepts an unrunnable cell in a declared column. A conservative outcome plus a surfaced finding is a documented limit, not a defect.

**Closed criterion.** Three parts, all mechanical:

1. Zero hard findings and zero advisories across the live plan corpus after this lands. Settled by running `pnpm spec:lint` over every declaring document; on the day this ships there are exactly two, and both measure 0/0.
2. Every plant of section 5 moves the criterion and every correct form leaves it unmoved.
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
3. The mutation score on `lib/specLint/acCoverage.ts` at or above its registry floor with an empty unaccepted-survivor set, over the declared operator set.

Enumerating the inputs on which the arm could conceivably be confused is **not** the convergence criterion; that enumeration does not terminate. The corpus scan does.

## 10. Acceptance criteria

| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (a declared table's prose command cell is a hard finding) | Task 4 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-2 (EVERY non-blank span must parse, and `sh -nc --` does not misreport a leading-dash command) | Task 4 + Task 8 | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/redExec.test.ts` |
| AC-3 (an undeclared table draws nothing, over the whole walked corpus) | Task 6 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-4 (malformed, table-less, out-of-range, EMPTY-TABLE and NOT-A-PLAN declarations each draw their own code) | Task 1 + Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-5 (a `tests/`-rooted pin the command cannot reach advises; a source-file pin does not; a strict superstring does NOT satisfy the match) | Task 5 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-6 (the four historical blobs score 4/1/0/0 hard) | Task 3 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-7 (plant-both: each of the four plants moves the criterion, each correct form does not) | Task 5 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-8 (the arm reaches the CLI's rendered report and its exit code) | Task 7 | `pnpm vitest run tests/specLint/acCoverageCli.test.ts tests/specLint/cli.test.ts` |
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
| AC-9 (`lib/specLint/acCoverage.ts` stays pure) | the existing recursive walker | `pnpm vitest run tests/specLint/_metaPureCore.test.ts` |
| AC-10 (the fixture plan declares, and the arm reports zero over it) | Task 9 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-11 (mutation score at or above the registry floor, unaccepted survivors empty) | Task 10 | `pnpm heavy pnpm mutation:guards` |
| AC-12 (every `red-target=` in this arc's plan resolves, AND its cited line matches the symbol its `why=` names) | Task 11, verified by reading | `pnpm spec:lint docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md` |
| AC-13 (every code named anywhere in this spec appears in the section 8.2 catalog, and vice versa) | Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
