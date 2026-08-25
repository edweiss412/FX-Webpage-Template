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
- **Arm (b) tests a LEXICAL PATH BOUNDARY and claims nothing about shell words** (round-1 finding 2, superseded by the round-3 repair). An earlier draft of this bullet said "whole argument", which the round-3 repair expressly abandoned; the surviving statement is section 8.2.2 and L-6.
- **Arm (b) validates, it does not discover.** Documented limit L-2, with the reason. Do not file "arm (b) would not have caught r4 F2" as a finding; this spec says so first.
- **Thirty-three corpus tables go unlinted on day one.** Documented limit L-3, accepted deliberately as the price of refusing a recognizer.
- **remark parses the markdown; the arm hand-rolls no grammar.** Section 8.3, with the ratification it rests on. Do not propose a regex for any pipe, whitespace, backslash or delimiter question — those were three rounds of findings and the class is closed by delegation, not by another pattern.
- **Arm (b) tests a lexical path boundary and stops there.** Section 8.2.2 and L-6. A shell lexer for an advisory is refused; the quoting families file to documented limits under the threat fence.
- **The six true corpus instances in section 6.3 are not repaired here.** Class-sweep disposition exception (c): the repair spans a tree this PR does not otherwise touch, and each is a judgment call about what that plan's third column means.

### 1.2 The incidents, recovered verbatim, per blob

Recovered from the plan's own history rather than restated from the ledger row, and stated PER BLOB, because a cell's text changes at every repair and an earlier draft attributed one blob's text to another. Command: `git show <sha>:docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md`.

| Round | AC | The command cell, at the blob the round reviewed | Shape | Caught? |
| --- | --- | --- | --- | --- |
| r2 F4 | AC-3 | `task commits carry the outputs` (`173bfccfe`) | (a) prose | yes |
| r2 F4 | AC-14 | `adapter suite + meta-test` (`173bfccfe`) | (a) prose | yes |
| r2 F4 | AC-15 | `both red commands` (`173bfccfe`); `the three red commands` after the r1 repair (`08fa33bbf`) | (a) prose | yes |
| r2 F4 | AC-12 | ``​`pnpm heavy` mutation run, backgrounded`` (`173bfccfe`) | (a) variant: a span that parses but is not the producing command | **no — L-1** |
| r3 F5 | AC-5 | `both red commands above` (`173bfccfe` and still at `b1db667e0`) | (a) prose | yes |
| r4 F2 | AC-14 | a runnable command whose file list omitted `tests/paneCompaction/driver.test.ts` | (b) blind command; the pin is `tests/paneCompaction/driver.test.ts:72` | **no — L-2** |

Blobs: `173bfccfe` (as authored), `08fa33bbf` (r1 repaired), `b1db667e0` (r2 repaired), `f921a138b` (r3 repaired), `b3705cebd` (r4 repaired).

## 2. Probe 1: the AC-table grammar is NOT stable, and the ledger row's first scheduled step is why

The row scheduled this first. It settles the design.

```
$ grep -rl '^| AC-' docs/superpowers/plans/ --include='*.md' | wc -l
32          # at origin/main; 33 at HEAD, this plan being the addition
```

**Every figure in this section is taken at `origin/main`**, the corpus WITHOUT this arc, for the reason section 6.3 gives: this plan joins `docs/superpowers/plans/` when it lands, so a count over that directory moves with the branch. The HEAD figures are given beside each so the difference is visible rather than surprising, and no conclusion here turns on the delta.

Refined to actual tables (a table is a header row, a delimiter row, and data rows; an AC coverage table is one where at least half the data rows begin with an `AC-<digit>` id):

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs census
total markdown tables in plan corpus: 929
AC coverage tables:                   34
distinct header rows among them:      34
distinct enclosing headings:          24
column counts observed:               2 to 6
tables in the PLAN CORPUS using the fixture's exact header: 1

# at HEAD, with this arc's plan in the corpus: 933 tables, 35 AC tables,
# 34 distinct headers still, 25 enclosing headings, and 2 using the fixture's
# header — this plan's own AC table being the second.
```

Every AC coverage table in the corpus has a header row unlike every other one. The header naming the command column is spelled, among others, `Producing command`, `Channel`, `Channel the proof arrives on`, `Executable step that PROVES it`, `The executable step, and the channel it arrives on`, `Evidence`, `Notes`, `Task`, `proved by`, `discharged by`, `claimed by`. Exactly one table in the plan corpus AT `origin/main` uses `| AC | Proved by | Producing command |`, and it is the fixture, because it is the only plan that had been through four review rounds on this class. At HEAD there are two: this arc's plan adopted the same header, which is the convention spreading rather than a counter-example. The claim is scoped to a rev for that reason — an earlier draft scoped it to the plan corpus instead of the repository, which was the right narrowing and still moved the moment this arc's own plan landed in that corpus.

**The load-bearing number is 34 distinct headers over 34 tables, and it is unchanged at HEAD** (34 distinct over 35, the new one being a repeat of the fixture's). Nothing about the grammar's instability turns on the delta.

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

A prototype of the arm was pointed at the four historical blobs before any shipping code was written. Re-run after every repair round; the counts are unchanged.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs blobs <dir of the five blobs>
173bfccfe: rows=16 4 hard, 0 advisory
b1db667e0: rows=16 1 hard, 0 advisory
f921a138b: rows=16 0 hard, 0 advisory
b3705cebd: rows=16 0 hard, 0 advisory
HEAD:      rows=16 0 hard, 0 advisory
```

| Blob | State | hard | advisory | Reproduces |
| --- | --- | --- | --- | --- |
| `173bfccfe` | as authored | 4 | 0 | r2 F4, all four cells |
| `b1db667e0` | r2 repaired | 1 | 0 | r3 F5, the one remaining cell |
| `f921a138b` | r3 repaired | 0 | 0 | clean |
| `b3705cebd` | r4 repaired | 0 | 0 | clean |
| `HEAD` | shipped | 0 | 0 | clean |

**The four at `173bfccfe` are NOT r2 F4's four, and the earlier draft's "reproduces r2 F4 exactly" was an identity substitution behind a coincidental count** (round-4 finding 2). Read against section 1.2: the four caught are AC-3, AC-5, AC-14 and AC-15. Three of those are r2 F4 instances; the fourth, AC-5, is the instance r3 F5 raised a round LATER and which was already present at the authored blob. r2 F4's own fourth instance, AC-12, is not caught and is documented limit L-1.

So the honest statement is: **three of r2 F4's four, all of r3 F5's one, and r3 F5's instance surfaced one round earlier than the reviewer found it.** The arm reports clean at every point the arc reported clean, and does not reproduce r4 F2, for the reason stated as L-2. Two of the six incidents are accepted misses with named limits, which is a weaker and truer claim than the count alone suggests.

## 5. Probe 4: plant-both, on the shipped fixture

Each plant is a single-cell edit to the live fixture, applied by the tracked generator so the anchors are asserted unique rather than eyeballed. The unplanted fixture scores 0 hard, 0 advisory, so the criterion moves on every plant and on no correct form. Seven of the nine are review findings kept as regression cases: (c) and (d) from round 1, (c2), (e) and (f) from round 2, (a2) and (g) from round 3.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs plants
unplanted:                             rows=16 0 hard, 0 advisory
a_prose_cell:                          rows=16 1 hard, 0 advisory
a2_comment_only_span:                  rows=16 1 hard, 0 advisory
b_pin_dropped:                         rows=16 0 hard, 1 advisory
c_later_span_broken:                   rows=16 1 hard, 0 advisory
c2_FIRST_span_broken:                  rows=16 1 hard, 0 advisory
d_superstring_appended:                rows=16 0 hard, 1 advisory
e_superstring_prepended:               rows=16 0 hard, 1 advisory
f_prose_in_a_row_without_leading_pipe: rows=16 1 hard, 0 advisory
g_backslash_parity:                    rows=16 1 hard, 0 advisory
```

Three of them exist because an earlier plant could not have caught the defect it was supposed to cover, and that is worth stating rather than hiding in a list:

- **(c2) exists because (c) was ordering-lucky.** Round-2 finding 2 is that a line-keyed results map keeps only the last span's outcome, so a broken FIRST span followed by a clean one is silently accepted. Plant (c) breaks the second of two spans and survived the collision by accident. The pair covers both orderings.
- **(f) plants prose AND removes the leading pipe.** Removing the pipe alone moves nothing, because the row still holds a valid command; that plant would have been decoration. This one is red only if the row is SEEN at all, which is what round-2 finding 1 showed the old reader getting wrong.
- **(a2) and (g)** are round-3 findings 1 and 3: a comment-only span, and a doubled backslash before a pipe, where GFM splits the cell and the old reader did not.

**The generator is a spec input, it is TRACKED, and its own defect history is part of the evidence.** `docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs` produces every number in sections 2, 4, 5, 6.1, 6.3 and 6.4; each carries its exact subcommand, and the full transcripts are at `docs/superpowers/specs/ci/probes/2026-08-25-ac-coverage-prototype-probes.md`. It is not the shipped arm: in the shipped design the adapter parses and injects a view (section 8.3), while here the parse and the decisions sit together. Every defect it has carried is one the spec would otherwise have shipped — it first spawned `sh` without `--`; then checked only a cell's first span; then keyed span outcomes by line alone; its corpus filter tested the whole ROW where its stated criterion says the last CELL, which admitted a twelfth table and ten spurious findings; and its Python predecessor hand-rolled the markdown reader that three rounds found defects in, which is why it is now a Node script over remark. Every number here is re-derived by the shipped suites in AC-6 and AC-7 rather than trusted.

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
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs markers origin/main
rev: origin/main
red= markers in tracked markdown: 572
  beginning with a dash:          0
```

The `--` is added once, at the one seam, with a test in both directions. Adding it does not disturb the normal path, as the third transcript line above shows.

### 6.2 Correction 2: a cited pin may be the subject, not the proof

In `docs/superpowers/plans/2026-08-18-control-outline-border-token.md:70` the row cites `components/admin/Mi11GateActions.tsx:69`, a source file that is the thing under test. Requiring a test command's argument list to name a `.tsx` source file is wrong, and the prototype advised on it. **Arm (b) fires only on cited pins whose path is under `tests/`.** An executable pin, which is what arm (b) is about, is an assertion, and assertions live under `tests/` in this repo. This keeps the r4 F2 case (`tests/paneCompaction/driver.test.ts:72`) in range.

### 6.3 The audit, with full accounting

The arm was run over every AC coverage table whose last column carries a code span in at least 80 percent of its rows (11 of the 34), as a stand-in for the convention spreading. Full accounting, so no reader recomputes a different total:

**Pinned to `origin/main`, for the same reason the census in section 2 is.** This arc's own plan joins the corpus when it lands, so at HEAD the modern bucket reads 6 tables and the total 12 — the extra table being this plan's own, which scores zero. The HARD counts are identical either way, and so is the itemised list below; only the population size moves. An earlier draft pinned the census and left this table unpinned, which is the same self-referential exposure fixed at one site and not its twin.

| Population | Tables (at `origin/main`) | hard | What they are |
| --- | --- | --- | --- |
| `v1-pre-deployment-amendments/**` handoffs | 6 | 42 | `AC / Phase X status / Notes` tables whose last column is a Notes column. Every one is a mis-declaration under L-4, not a defect. They are the reason the declaration names its column instead of guessing the last one. |
| 2026-08 plans | 5 | 6 | one is the fixture (0 hard); the other four carry 6, and all six are true instances of the class |
| total | 11 | 48 | at HEAD: 12 tables, 48 hard — this plan's own table added, scoring zero |

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

### 6.4 What the corpus looks like to the parser

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs hazards
tables in the plan corpus, per remark:        929
data rows across them:                        7551
documents carrying MORE THAN ONE AC table:    1
   docs/superpowers/plans/ci/2026-08-20-browser-child-lifetime.md (2)
every pipe/whitespace/backslash question above is remark's, not this arm's
```

Earlier drafts counted the inputs a hand-rolled reader had to survive: 75 rows with an escaped pipe, 675 with leading whitespace, 17 with a code span containing an unescaped pipe. Those counts are RETIRED rather than corrected. Section 8.3's parser answers each of them and section 8.2.1 no longer carries a row for any of them. What remains is the one structural fact the arm must still handle itself, and one plan already exercises it: a document may declare more than one AC coverage table.

## 7. Documented limits

Stated here, not discovered in a review round.

**L-1. A span that is a plausible command but is not THE producing command is not caught.** Incident r2 F4 / AC-12, ``​`pnpm heavy` mutation run, backgrounded``, carries a span that parses. Whether `pnpm heavy` with no child command is the producing command is a semantic claim about what the command DOES, and only execution decides it. Round-3 finding 1 carved the decidable part out of this limit — a comment-only span is structurally not a command and is now rejected — but the residue stands. Out of scope; execution of AC-table commands is not proposed.

**L-2. Arm (b) validates a declared pin; it discovers no absent one.** At `b1db667e0`, the state r4 F2 was raised against, the AC-14 row cited no pin at all: the reviewer knew the pin existed by reading the suite. Arm (b) compares two cells of one row, so it can only fire once someone has written the pin down. Its value is that it makes the r4 repair permanent: an edit that drops `driver.test.ts` from the command now advises, as plants (b) and (d) show. It is not, and must not be cited as, protection against a criterion whose pin nobody named.

**L-3. A table nobody declares is not linted.** By construction. This arc adds one plan to the corpus, so after it lands there are 35 AC coverage tables, two of them declared (the fixture and this arc's plan) and **33 unlinted**. That is the price of refusing a recognizer, and it is the same trade invariant 12 took.

**L-4. A mis-declaration is the author's error and the arm reports it as one.** Declaring column 3 of an `AC / Status / Notes` table produces hard findings on every row. The arm cannot tell a mis-declaration from a table full of defects, and does not try. The declaration is deliberate; the fix is to remove it.

**L-5. `sh -n` is whatever `/bin/sh` is on the host.** It is bash in POSIX mode on macOS and dash on the Ubuntu runners. The arm inherits whatever divergence that implies, exactly as the existing red arm already does. No new exposure.

**L-6. Arm (b) tests a lexical path boundary, and knows nothing about shell words.** Two directions of cost, both accepted deliberately (section 8.2.2). It draws an advisory it does not deserve when a command reaches the pin's file through a glob, a variable, or a path relative to another directory. And it withholds one it should give when a correctly-bounded path sits inside quotes, after an escaped space, or behind a `#` — round-3 finding 2's four families. Deciding those needs a shell lexer, this repo has measured what shell lexers cost, and the arm is ADVISORY. The threat fence puts deliberately-constructed cases out of scope; an ordinary contributor dropping a file from a command's list is what the advisory catches, and it does.

## 8. Design

### 8.1 The declaration

```
<!-- ac-coverage: command-col=N -->
```

before a table. `N` is a 1-based column index. One field, because everything else is derivable and every field is a thing an author can get wrong.

Grammar, matching the strictness of the existing marker grammars (`MARKER_ANY` at `lib/specLint/taskContract.ts:32`, `GATE` at `lib/specLint/redContract.ts:37`, `WAIVER` at `lib/specLint/parse.ts:35`): `^ {0,3}<!-- ac-coverage: command-col=([1-9][0-9]*) -->[ \t]*$`. A line matching `^ {0,3}<!-- ac-coverage:` and not the full grammar is `AC_COVERAGE_MALFORMED`, on the same "there is no third form" rule that governs `TASK_MARKER_MALFORMED`. A declaration inside a fence is inert, as every marker is.

**A declaration governs the next TABLE, and adjacency is the parser's question, not a rule here.** In the AST a declaration is an `html` node, and it governs the next `table` block in document order PROVIDED no other declaration lies between them; a declaration with another declaration before the next table draws `AC_COVERAGE_NO_TABLE`. The proviso is load-bearing and was self-found by probe: without it, two consecutive declarations both bind to the same table and check it against contradictory command columns, which is what section 8.2.1's row already promised would not happen. Whitespace between a declaration and its table is irrelevant, because blocks are the unit. An earlier draft said "the line immediately preceding", which failed on this document's own example because prettier had put a blank line there; that rule no longer exists to fail. A declaration with no following table draws `AC_COVERAGE_NO_TABLE`.

A document may carry SEVERAL declarations, each governing its own table. One plan corpus document already carries two AC coverage tables (section 6.4).

### 8.2 Findings

| Code | Severity | Fires when |
| --- | --- | --- |
| `AC_COVERAGE_MALFORMED` | fail | a declaration-shaped line does not match the grammar |
| `AC_COVERAGE_NO_TABLE` | fail | no table follows the declaration |
| `AC_COVERAGE_COL_OUT_OF_RANGE` | fail | `command-col` exceeds the header row's cell count, or a data row has fewer cells than that |
| `AC_COVERAGE_EMPTY_TABLE` | advisory | the declared table has a header row and no data rows, so the declaration checks nothing |
| `AC_COVERAGE_NOT_A_PLAN` | advisory | a declaration appears in a document whose kind is not `plan`, where the arm does not run |
| `AC_COMMAND_CELL_NOT_RUNNABLE` | fail | a data row's command cell carries no span that could be a command |
| `AC_COMMAND_UNPARSABLE` | fail | ANY command-carrying span in the cell fails `sh -nc --` |
| `AC_COMMAND_PIN_UNOBSERVED` | advisory | a `tests/`-rooted `path:line` pin cited in another cell of the row occurs nowhere in the command cell's span text at a path boundary |

Hard for (a) and advisory for (b) is the row's ratified split, and it is right for a reason worth stating: a criterion can legitimately be proved by a case the plan is about to author, so the file need not exist in the command yet.

**The arm runs on `plan`-kind documents only.** `lib/specLint/run.ts:135` seats the parse plan as `doc.kind === "plan" ? parseCheckPlan(model) : []`, and `checkSections` takes the same posture in the other direction (`lib/specLint/sections.ts:26`). The row calls this a plan-lint arm. A declaration elsewhere would then be read by nothing, which is the vacuous shape, so it draws `AC_COVERAGE_NOT_A_PLAN` rather than silence.

### 8.2.1 The accept-set, and the boundary inputs that remain

**A command cell is accepted when it carries at least one COMMAND-CARRYING span, and EVERY such span exits 0 under `sh -nc --`.** A span carries a command when its trimmed content is neither empty nor beginning with `#`. Everything else is reported by name. There is no denylist of rejected spellings, because a denylist accepts whatever it did not model.

Two of those three clauses are review findings rather than design:

- **Every span, not the first** (round-1 finding 1). One fixture row carries three producing commands, and a first-span rule accepts a broken second one. The cost is that a command cell may not carry backticked non-command text; section 6.3 measures that cost at one finding across the whole 11-table stand-in, in a table that should not have declared.
- **Comment-only spans carry no command** (round-3 finding 1). `sh -nc -- '# both red commands above'` exits 0, so parseability alone accepts a cell holding no command at all. The test is one character and needs no grammar. What it does NOT decide is whether a syntactically valid span is THE producing command; that is L-1, and only execution settles it.

**Most of this section's former contents are gone, and section 8.3 says why.** Escaped pipes, leading whitespace, the optional leading pipe, the optional trailing pipe, delimiter indentation, backslash parity and code spans straddling a cell boundary were all rows here. They are now the parser's answers, not this arm's rules.

What genuinely remains:

| Input | Behaviour |
| --- | --- |
| command cell is empty, or whitespace only | no span, so `AC_COMMAND_CELL_NOT_RUNNABLE` |
| the cell's only spans are blank or comment-only | no command-carrying span, so `AC_COMMAND_CELL_NOT_RUNNABLE` |
| a data row has fewer cells than `command-col` | `AC_COVERAGE_COL_OUT_OF_RANGE` at that row's line, never silence |
| the declared table has a header row and no data rows | `AC_COVERAGE_EMPTY_TABLE`, advisory. A declaration that checks nothing must not be silent |
| `command-col=0`, or a non-integer | rejected by the grammar, so `AC_COVERAGE_MALFORMED` |
| a declaration with no table after it | `AC_COVERAGE_NO_TABLE` |
| two declarations, the first with no table between them | the first draws `AC_COVERAGE_NO_TABLE`; the second governs the table |
| several declarations, each with its own table | each governs its own; there is no one-per-document limit |
| a declaration inside a fenced block | inert, like every marker |
| a declaration in a non-`plan` document | `AC_COVERAGE_NOT_A_PLAN`, advisory |
| a table nested in a blockquote or list item | it participates, in document order — a reader's next table is the nested one. Top-level-only iteration would bind PAST it to a silently different table |
| a data row with MORE cells than the header | checked, not skipped; the command cell exists and the surplus is ignored, as GFM ignores it |
| a document with no declaration at all | the arm contributes no findings and reads no tables |

### 8.2.2 Arm (b)'s matching rule, and why it stopped growing

A candidate `path:line` substring is extracted from the row's other cells with one path-shaped regex and handed to `classifySpan` at `lib/specLint/citations.ts:28` for the verdict, so the arm holds no second opinion about what a citation is. It fires when `classifySpan` returns a citation with a line coordinate whose `path` starts with `tests/`.

**The pin must occur in the command cell's span text at a PATH BOUNDARY**: neither the character before it nor the character after it may be one that can continue a path (`[A-Za-z0-9_./-]`).

Three rounds each found a false accept in a matcher that tried to identify a shell ARGUMENT — a superstring (r1), a wrong prefix (r2), then quoting, escaped whitespace and comment text (r3). Splitting on whitespace is a shell-word approximation, and each round found another way it is wrong. The arm therefore stops approximating and claims nothing about shell words. The boundary test keeps both repaired cases firing (an appended character fails the right boundary, a prepended segment fails the left) and needs no grammar at all.

What it does not do is notice a correctly-bounded path sitting inside quotes, after an escape, or behind a `#`. Those are round-3 finding 2's families. None is an ordinary authoring mistake in an AC command cell, the threat fence puts them out of scope, and they are recorded in L-6 rather than chased with a fourth epicycle. Writing a shell lexer for an ADVISORY is not a trade this arc will make.

### 8.3 Who parses markdown: remark, not this arm

**The arm hand-rolls no markdown grammar.** Three consecutive rounds each found a defect in a hand-rolled table reader — the optional trailing pipe (r1), the optional leading pipe (r2 finding 1), backslash parity (r3 finding 3) — and a fourth was self-found, a delimiter pattern anchored at column 0 that made 106 indented tables invisible. Growing that recognizer is the losing move, and this repo already ratified the alternative, at `docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md` §1.1 item 2:

```
Regex reimplementation of markdown grammar is out of scope (r30 ratification).
The AST port IS the sanctioned resolution — grammar questions go to the parser.
```

`remark` and `remark-gfm` are declared dependencies, and `lib/reviewRounds/filing.ts:60` is the live lib-layer call site with the synchronous pattern (`remark().use(remarkGfm)`, then `parser.parse(text)` at `lib/reviewRounds/filing.ts:183`).

**mdast lives in the ADAPTER, and the arm receives a view.** `lib/specLint/*.ts` imports no third-party package today; every import is relative. `tests/specLint/_metaPureCore.test.ts:12` forbids only `node:fs`, `node:child_process` and `node:process`, so a remark import there would be legal, but the module's own architecture is better (`lib/specLint/types.ts:118-120`): data the adapter resolves and INJECTS, so nothing foreign crosses the purity boundary. `scripts/spec-lint.ts` parses and injects an ordered list of `{kind:"html", line, value}` and `{kind:"table", line, rows}` where each cell carries its rendered text and its `inlineCode` values. The arm decides everything from that shape, unit tests construct it directly, and `lib/specLint` keeps its zero-third-party-import property.

Other seams:

- **Citation classification.** `classifySpan` at `lib/specLint/citations.ts:28` is the authority, per section 8.2.2. This matters because the fixture's own pin is bare text, not a span: `the executable payload pin at tests/paneCompaction/driver.test.ts:72`.
- **Shell parse check, and its own results type.** `scripts/spec-lint.ts` owns every subprocess. `synthesizeParseFindings` at `lib/specLint/redContract.ts:510` already branches on `ParseCheckEntry.source`, so a third branch there is the obvious move, and it is refused: `ExecResults.outcomes` is keyed by LINE ALONE (`lib/specLint/types.ts:179`), which has always held for `red=` and `gate` because a line carries one marker. An AC row contributes one entry PER SPAN, so a line-keyed store keeps only the last — round-2 finding 2's probe showed exits `[2, 0, 0]` collapsing to a single clean entry, silently accepting a broken first command. `acCoverage` therefore owns its own entry type, its own results map keyed by `(line, spanIndex)`, and its own synthesizer. The adapter runs a second spawn loop with the same `sh -nc --` invocation, so the `--` repair still lands once, and `ParseResults` and the red arm are untouched. The AC entries are NOT fed to `parseFailedLines` (`lib/specLint/run.ts:141`), whose job is excluding red markers from EXECUTION; AC commands are never executed.

### 8.4 Where the arm registers

Derived by probing a member: `claimSweep` is the most recently added arm, and every place it appears was enumerated.

| Site | Compiler-enforced? | Why |
| --- | --- | --- |
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
| `lib/specLint/acCoverage.ts` | n/a | the module, pure, no third-party imports |
| `lib/specLint/types.ts` | **yes** | the `Check` union (`lib/specLint/types.ts:2`), plus the injected view's type |
| `lib/specLint/run.ts` | no | import, `CHECK_ORDER` entry, invocation |
| `scripts/spec-lint.ts` | no | the remark parse, the view, the AC spawn loop, and the `--` repair at `scripts/spec-lint.ts:864` |
| `tests/specLint/acCoverage*.test.ts` | no | the suites |
| `tests/mutation/source/registry.ts` | no | enrolment, before round 1 of the diff review |
| `tests/mutation/_metaPremiseContract.test.ts` | no | per-enrolled-suite premise counts |
| `docs/superpowers/specs/ci/README.md` | no | the index row for this document |
| `docs/superpowers/specs/ci/probes/README.md` | no | the index row for the probe document |

Two of these cannot be forgotten silently and one nearly caused this arm's own defect class on the lint's output path, so the distinction is worth stating rather than leaving as nine equal rows. `CHECK_ORDER` is declared `as const satisfies readonly Check[]` with an exhaustiveness type at `lib/specLint/types.ts:45`, so a missing entry is a COMPILE error. And the renderer derives its groups from the findings, using `CHECK_ORDER` only to order them and appending anything unrecognised last — because, as `lib/specLint/types.ts:12-33` records, an earlier hand-written array decided VISIBILITY, and `claimSweep` once shipped complete, tested and scored while every one of its findings was filtered out before reaching a human.

`tests/specLint/_metaPureCore.test.ts:11` walks `lib/specLint/` recursively, so the new module is covered by default. `tests/mutation/_metaGuardSurfaceRegistry.test.ts` validates the rows it is given and discovers no absent one, so it is not protection against forgetting to enrol.

**An arm may also emit under an EXISTING `Check`** — `lib/specLint/redContract.ts:69` and `lib/specLint/fixtureContract.ts:47` both emit `check: "taskContract"`. A new member is still right here (compile-time registration, and this is not a task-contract arm), but the alternative is named rather than left looking unconsidered.

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
| AC-1 (a declared table's prose command cell is a hard finding, and so is a cell whose only spans are comment-only) | Task 4 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-2 (EVERY non-blank span must parse, in EITHER order — a broken FIRST span followed by clean ones is reported, which a line-keyed outcome store loses; and `sh -nc --` does not misreport a leading-dash command) | Task 4 + Task 8 | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/redExec.test.ts` |
| AC-3 (an undeclared table draws nothing, over the whole walked corpus) | Task 6 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-4 (malformed, table-less, out-of-range, EMPTY-TABLE and NOT-A-PLAN declarations each draw their own code) | Task 1 + Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-5 (a `tests/`-rooted pin the command cannot reach advises; a source-file pin does not; neither an appended character nor a prepended path segment satisfies the path-boundary match) | Task 5 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-6 (the four historical blobs score 4/1/0/0 hard) | Task 3 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-7 (plant-both: each of the NINE plants of section 5 moves the criterion, each correct form does not) | Task 5 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-8 (the arm reaches the CLI's rendered report and its exit code) | Task 7 | `pnpm vitest run tests/specLint/acCoverageCli.test.ts tests/specLint/cli.test.ts` |
<!-- spec-lint: ignore — lib/specLint/acCoverage.ts is created by this spec's implementation; not yet tracked -->
| AC-9 (`lib/specLint/acCoverage.ts` stays pure) | the existing recursive walker | `pnpm vitest run tests/specLint/_metaPureCore.test.ts` |
| AC-10 (the fixture plan declares, and the arm reports zero over it) | Task 9 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-11 (mutation score at or above the registry floor, unaccepted survivors empty) | Task 10 | `pnpm heavy pnpm mutation:guards` |
| AC-12 (every `red-target=` in this arc's plan resolves, AND its cited line matches the symbol its `why=` names) | Task 11, verified by reading | `pnpm spec:lint docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md` |
| AC-13 (every code named anywhere in this spec appears in the section 8.2 catalog, and vice versa) | Task 2 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-14 (the arm hand-rolls no markdown grammar: a row without a leading pipe, a doubled backslash before a pipe, and a code span crossing a cell boundary all behave as remark parses them) | Task 2, with plants (f) and (g) | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/acCoverageIncidents.test.ts` |
| AC-15 (`lib/specLint/` gains no third-party import: the adapter parses and injects the view) | Task 7, pinned structurally | `pnpm vitest run tests/specLint/_metaPureCore.test.ts tests/specLint/acCoverageCli.test.ts` |
