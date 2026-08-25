# Plan — the delimiter walk delegates to the constructs it crosses

Design: `docs/superpowers/specs/ci/2026-08-22-shell-brace-cross-construct-design.md`.
Ledger row: `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND` (`BACKLOG.md:299`).
Probes: `docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/`.

**Three production functions change**, all in `tests/cross-cutting/psqlStartupFiles/scan.ts`, plus
two new per-context helpers: `matchBraceSpan` gains the delegation, and the `$$` precedence rule
lands in `attachedTargetEnd`'s `substitutionOpenerEnd` and in `lexShellWords`' own `$`-branches.
Round 2 finding 4: an earlier draft said "one production function changes", which was true of the
first design and false from spec round 4 onward — the whole point of that round is that ONE guard per
lexical context means THREE recognizers. Everything else in this plan is the apparatus that proves
they changed the right thing and nothing else.

**This plan is executed by a DIFFERENT session than the one that wrote it.** `arc-yamlquote`
(`fix/yaml-run-scalar-quoting-decode`) edited the same file's YAML decode path and merged first, as
#879 on 2026-08-24. Task 1 — the rebase-and-re-key that opens the arc — ran on 2026-08-25 and is
DONE: the base is now `300a9f937b8a` and every number below has been re-established on the merged
tree. **The re-key CONFIRMED the figures rather than replacing them**, which was not the expected
outcome and is the more useful one: `scan.ts` moved 293 insertions and 20 deletions, and the
crossing did not budge.

## Anchors, base-stamped, symbol-identified

Every citation is stamped at `300a9f937b8a`, where `scan.ts` is blob `65a7cdcd2505`. **There is
deliberately no HEAD column.** Task 3 edits `matchBraceSpan`, so every line below it moves, and a
re-verified HEAD column is stale within the hour — the sibling arc wrote one, verified it by reading,
and watched its own later repairs invalidate it. The durable identity is the SYMBOL; resolve any
row by grepping it.

| symbol | at base `300a9f937b8a` |
| --- | --- |
| `matchBraceSpan` | `tests/cross-cutting/psqlStartupFiles/scan.ts:986` |
| `matchBrace` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1022` |
| `matchBraceEnd` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1038` |
| `closingBacktick` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1055` |
| `attachedTargetEnd`, and its private `closeDoubleQuoted` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1098`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1115` |
| `acceptedExpansionOperand`'s whole-span boundary test | `tests/cross-cutting/psqlStartupFiles/scan.ts:1988` |
| the six `matchBrace` call sites | `tests/cross-cutting/psqlStartupFiles/scan.ts:1574`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1613`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1643`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1741`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1758`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1988` |
| the one `matchBraceEnd` call site | `tests/cross-cutting/psqlStartupFiles/scan.ts:1144` |
| the two nearest pin blocks in the deciding suite | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6699`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6725` |

## Global constraints

- **`psqlStartupScan` is an ENROLLED guard surface.** Any edit to `scan.ts` — a comment included —
  invalidates its registry keys. `pnpm mutation:sites` runs after EVERY edit, not once at the end.
  This cost the sibling arc two review rounds in two disguises.
- **Heavy phases wrap at the outermost entry**: `pnpm heavy pnpm mutation:guards`, `pnpm heavy pnpm test`.
  Slots are two, machine-wide, contended.
- **Scoping the mutation gate, and why the scoped run is NOT the acceptance channel.** `-t` does NOT
  bound the gate (`runSurface` executes at module scope during collection). Write a temporary
  `guardSurfaces.shardTmp*.test.ts` filtering `GUARD_SURFACES` to the one id, then DELETE it —
  `tests/mutation/_metaSourceShardIntegrity.test.ts` pins the shard set byte-for-byte.
  **`pnpm mutation:guards` will not run it.** That script hard-codes `guardSurfaces.shard0..3` plus
  `guardSurfaces.gates` and matches no `shardTmp` file (verify with
  `rg -n 'mutation:guards' package.json`), so the scoped shard needs
  its own invocation:

  ```
  pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shardTmp.test.ts
  ```

  Round 3 finding 1: naming `pnpm mutation:guards` as AC-7's channel while the task body ran the
  scoped shard meant the mapped command and the executed command were different things. **The scoped
  run is for ITERATION only.** AC-7 is discharged by the full `pnpm heavy pnpm mutation:guards`,
  because a scoped substitute cannot establish that the gate is green — a scoped local run on a
  sibling arc missed twelve survivors that the PR's own harness job then found.
- **Blob-hash before any re-measure.** The score is a pure function of (source, operators, deciding
  suites); verify with `git hash-object` rather than re-running on faith.
- **A scratch `.ts` in the worktree root is walked like source.** A probe file containing psql
  spellings put the sibling arc's deciding suite red and its gate into `BaselineNotGreenError`.
  `git status --short` before believing a red baseline. This arc's own probes live under `docs/`,
  which the walk skips at the root — measured, not assumed: with all SEVEN present the AC-5 digest is
  unchanged at 76 rows / `8ebe8b08…` (re-measured 2026-08-25 by Task 1 on the rebased tree).
- **Mutation-operator families are closed at two**, `relational-boundary` and
  `regex-quantifier-bound`, as the registry row ratifies. A third family is a registry change
  carrying its own before/after numbers, not a finding on this plan.

## Meta-test inventory

- **Creates:** none.
- **Extends:** none structurally — the deciding suite gains cases, not a registry.
- **Must keep passing, each named by the task that runs it.** Round 1 finding 9: this list named
  work that appeared in no task body. Each row below is now a command inside the named task, and the
  task text carries it.
  - `_metaSourceShardIntegrity` — **Task 6**, which creates the temporary scoping shard and deletes
    it in the same step. The shard set is pinned byte-for-byte, so a shard left behind fails here.
  - `_metaLedgerInProgress` — **Task 7**, the archive move that is its own authored red.
  - `_metaLedgerMintBar`, `_metaReviewRoundEconomy` — **Task 7**, run together with the above as one
    `pnpm vitest run tests/docs/` invocation over the three ledger guards.
- **"None applies" is not claimed anywhere in this plan.**

## Plan-lint disposition — every advisory read, none suppressed

```
pnpm spec:lint docs/superpowers/plans/2026-08-22-shell-brace-cross-construct.md
```

**Hard failures: none.** The obligation is to read the whole advisory tier rather than grep for FAIL,
so every advisory is disposed by CLASS below. The count is deliberately not written down: this
section names numbers, so recording a literal here changes the number it records — a self-
invalidating count is a defect this repo has paid for before. Run the command.

- **`CITATION_SYMBOL_ABSENT`** on the declared-limit preamble — the arm resolves
  `DECLARED_LIMIT_PIN_UNNAMED` in `lib/specLint/declaredLimitPins.ts`, which is where it lives; the
  same line also cites the suite, and the checker looks for both identifiers in the suite. Correct as
  written, pre-existing.
- **`NUMERIC_NOUN_MISMATCH`, every instance** — one CLASS, not a list, because a list of the flagged
  nouns goes stale on the next edit and this document has retired enumerations elsewhere for exactly
  that reason. Every instance pairs a number with the word that happens to follow it — `§1.2 row`
  against `76 rows`, `Task 3 asserts` against `Task 4 asserts`, `round 1 caught` against `round 2
  caught`. The nouns are genuinely different quantities in different scopes, and most of them are not
  quantities at all — they are ordinals naming a task, a round, or a finding.

**Two of these were minted by this round's own prose and then reworded away, and the third rewording
was abandoned deliberately.** "Round 1 finding 4 caught" reads to the arm as "4 caught"; rephrasing
to "(round 1, finding 4)" cleared it. Doing the same for step verbs does not converge — the arm
pairs a step number with whatever verb follows, so renaming `runs` to `executes` simply moved the
advisory onto `executes`. Chasing a heuristic that fires on "Step N <verb>" is parser-appeasement,
not plan quality, and it is the shape this repo has retired elsewhere. The class is left standing and
named instead.

## Declared-limit pins this plan is answerable for

**Files:** `tests/cross-cutting/psqlStartupFiles/scan.ts`,
`tests/cross-cutting/psqlStartupFileSuppression.test.ts`, `tests/mutation/source/registry.ts`,
`docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/`, `BACKLOG.md`,
`BACKLOG-archive.md`.

The planlint obligation (`DECLARED_LIMIT_PIN_UNNAMED`) is to NAME every declared-limit pin in the
deciding suites of an enrolled surface the `**Files:**` declaration above touches, and to say for
each whether it retires or is deliberately left alone. Resolving them is not the obligation; naming
them is. Naming is a VERBATIM SUBSTRING test (`lib/specLint/declaredLimitPins.ts:548`), so each title
below is copy-pasted rather than paraphrased, and the table is RECONCILED against the arm's own
output at plan-lint time rather than assembled from a reading of the suite — an arm that discovers
pins from disk knows the set, and a hand-built list is the enumeration this repo keeps retiring.

| pin | disposition under this plan |
| --- | --- |
| `a construct whose LAST character is its delimiter without closing is REPORTED, not resolved` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6699`) | **HELD.** Six rows, each 0 sites / 1 advisory. The FIRING CONDITION is unchanged; which spans are undelimitable does move (design §3.2), and none of these six is among them. Task 3 asserts all six unmoved. |
| `a quote character that is LITERAL inside a double-quoted target does not open a span` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6725`) | **HELD**, and it is the nearest neighbour: it pins the per-context alphabet on the TARGET path that Task 3 introduces on the WALK path. |
| `documented limits - quote-concatenated spellings outside the assignment family` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6190`) | **HELD.** Unrelated family (assignment values); named because it is a declared-limit block on the same suite. |
| `R40 — hypothetical gaps closed cheaply; the rest are documented limits` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:4154`) | **HELD.** |
| `each quote-concatenated keyword/operand spelling is a declared miss` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6198`) | **HELD.** Named because `spec:lint`'s own arm named it and my hand-built table had guessed the enclosing block heading instead — which is exactly why this table is reconciled against `DECLARED_LIMIT_PIN_UNNAMED` output rather than assembled from a reading of the suite. Unrelated family (quote-concatenated assignment spellings); the crossing repair does not reach it. |
| the five NEW limits of design §7 (`L1`–`L5`) | **ALREADY TRACKED** as `shapes.mts` limit rows (`L1-ansi-c-inside-subst` through `L5-squote-in-brace-in-dquote`); what Task 4 authors is the temporary MUTANT that proves they discriminate, not the rows (round 3 finding 3). ONE named widening mutant proves the population discriminates: under the `#`-comment rule `L2` reports `MOVED` and the run exits 1. The other four are pinned but NOT individually mutant-proved — they share one instrument, so a mutant that moves any row proves the channel for all five, and claiming five separate proofs was round 1 finding 5. Design §7's items 6 and 7 are deliberately NOT in this population: item 6 is asserted by `syntax-error-class.mts` and item 7 by the AC-5 digest. |

## Wrong implementations, and the fixture that kills each

**This table is produced, not written down.** The previous one contradicted
itself (round 1, finding 4) — `w1` scored 18/22 while naming two fixtures, `w4` and the `#` candidate scored 20/22 while
naming no accept-set killer at all — and the cause was that each walk had been built from whatever
the prototype was on the day, so the ones predating spec round 4 carried TWO weakenings. A table
nobody can re-run cannot be caught being wrong, which is how that survived four rounds.

```
SCAN_MODULE=<candidate> pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/weaker-walks.mts
```

Every walk is rebuilt FROM THE CANDIDATE by anchored substitution, ONE DEVIATION each — seven
weakenings and one OVER-repair, the `#`-comment widening, which is why this section is not headed
"strictly weaker" (round 3 finding 3) — and run against the fixture set. The probe gates on ATTRIBUTION rather than counts: a walk must die to
exactly the rows named below. A walk that SURVIVES is a wrong implementation the fixtures cannot see;
a walk that dies to the WRONG rows is a coincidence being read as proof. Both fail. A hunk that
matches zero or many times ABORTS rather than yielding a clone of the candidate that would pass
everything.

Populations: **22 accept-set, 5 documented-limit, 4 bash-rejected** (`shapes.mts` prints
`ROWS: 31 total = 22 + 5 + 4`; that line is the authority, not this sentence).

Output against the §3 prototype, 2026-08-24:

| walk | weakening | accept-set | limits | bash-rejected | dies to |
| --- | --- | --- | --- | --- | --- |
| `w1` | quotes are not openers in the bare walk | **20/22** | 5/5 | 4/4 | `Q1`, `C4` |
| `w2` | ONE recognizer shared by both lexical contexts | **20/22** | 5/5 | 4/4 | both `W2k-*` |
| `w3` | backticks are not openers | **20/22** | 5/5 | **3/4** | `Q2`, `Q3`, `W4k` |
| `w4` | an unclosed foreign construct keeps counting | 22/22 | 5/5 | **3/4** | `W4k` |
| `w6` | `$$` missing from `attachedTargetEnd` only | 22/22 | 5/5 | **3/4** | `P2` |
| `w7` | `$$` missing from BOTH delimiter recognizers | 22/22 | 5/5 | **2/4** | `P1`, `P2` |
| `w8` | `$$` missing from `lexShellWords` (spec round 4's defect, isolated) | **20/22** | 5/5 | 4/4 | `P4`, `P5` |
| the `#`-comment rule | parser growth toward bash fidelity | 22/22 | **4/5** | 4/4 | `L2` |

**Four of the eight score a clean 22/22 on the accept-set** — `w4`, `w6`, `w7` and the `#` widening.
Three are UNDER-repairs and one is an OVER-repair, and every one is a wrong implementation that the
population carrying AC-1 cannot see. That is why the populations are separate: the accept-set
measures whether the repair landed, the limit rows whether it stayed in scope, and the bash-rejected
rows whether it moved anything on input the shell refuses to parse.

**`w8` is the one that carries the transferable claim, and it carries it alone.** It is the §3 design
with spec round 4's guard removed and nothing else — which is what ANY implementation written before
that round would have been. Against the accept-set AS IT STOOD THEN it scored a clean 20/20. Two rows
were added and it scores 20/22. Nothing about the implementation changed; the set caught up. The
earlier draft credited that clean score to four walks, which was the contamination talking: the other
three failed `P4`/`P5` because they too predated the guard, not because of the weakening each was
built to model.

The two rows that caught it were not clever. `P4` is round 1's own spelling with its inner `}`
deleted, and `P5` is that one lexical context deeper — both one ordinary edit from an input already
in the set, both inside the threat fence, and both fabricating on the MERGE-BASE scanner, so they
were live defects before this arc opened.

**What each impostor needed, stated as an axis** — the transferable part, because an acceptance set
assembled from the ledger row's own shapes saw none of them:

- `w2` needs a character whose meaning DIFFERS between the two contexts (`'`).
- `w4` needs an input where bash executes NOTHING, so a resolved site is a fabrication rather than a
  mis-attribution.
- `w6`, `w7` and `w8` need the same rule to be required in MORE THAN ONE recognizer, so partial
  application is observable. There are THREE — the delimiter walk, `attachedTargetEnd`, and
  `lexShellWords`' own `$`-branches — and each spec round found one more of them, the last on the
  terminal round.
- the `#` widening needs a change that makes the walk MORE bash-faithful and is still out of scope.

**An implementer weakening any of these fixtures is removing the only thing that catches its
impostor** — and `weaker-walks.mts` is what says so out loud rather than leaving it to a reader.

## Every assertion this plan AUTHORS asserts ATTRIBUTION, never counts alone

**This is a hard constraint on every case this plan authors, and it is the fourth arrival of the same
lesson on this file family.** State it as a rule the implementer applies mechanically, because the
three earlier arrivals were each stated as prose and each recurred.

An assertion of the form `expect(sites).toHaveLength(1)` — or any comparison of site and advisory
COUNTS — cannot discriminate a defect that moves a boundary, because a mis-delimited span still
leaves exactly one thing reporting. The discriminating fields are `nested` and `nestedInBacktick`,
and for the corpus-level checks the whole record.

**Measured on this arc's own instrument, which is why it is a rule and not a reminder.** The
bash-rejected row class in `shapes.mts` was first written as a pair of COUNTS. Both `$$`
under-repairs — `w6` (the rule taught to one recognizer of two) and `w7` (taught to neither) — then
passed the ENTIRE probe, because their defect flips `nested` from `false` to `true` while leaving one
site and zero advisories exactly where they were. The probe built to teach presence-versus-attribution
was itself defeated by presence. The candidate half now carries the full attribution check
(design §2.1c) and both walks die again.

**Two count-based assertions are deliberately outside this rule, named so the heading is not read
wider than it is** (round 3 finding 3). The two nearest declared-limit pin blocks
(`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6699` and
`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6725`) are PRE-EXISTING and
count-shaped; this plan asserts them UNMOVED rather than rewriting them, and rewriting them would be
scope creep on a surface the repair does not otherwise touch. And `syntax-error-class.mts` asserts a
POPULATION count — five of five ordinary syntax errors still fabricate — which is the right shape for
a claim about how many members of a class behave one way, as opposed to a claim about which span a
single site belongs to. The rule governs the rows this plan AUTHORS.

Applied to this plan's tasks:

- **Task 3's suite cases** assert sites AND `nested` AND `nestedInBacktick` per row. A row asserting
  only a count is a defect in the case, not a lighter version of the same case.
- **Task 4's limit rows** compare the whole record, every field derived from the record rather than
  listed — a five-field hand list was round 1 finding 1's second half.
- **A reviewer or implementer who weakens any assertion to a count** is removing the only thing that
  catches that row's impostor. The killer table above names which impostor each row catches.

## Acceptance criteria this plan discharges

Design §4 is canonical. Each row names the task that performs the proof and the channel it arrives
on; a green suite is the proof for none of them.

Round 1 finding 6: `AC-3b` was missing outright, and three rows named a task that does not run the
channel they name. A row here is a promise that THAT task executes THAT command, so the mapping is
now written from the task bodies rather than from which task the criterion feels closest to.

| id | task | channel |
| --- | --- | --- |
| AC-1 | 3 | Task 3 step 5 executes `SCAN_MODULE=… shapes.mts --expect-repaired`; its FIRST tally line reads `22/22 accept-set rows meet their post-repair expectation` |
| AC-2 | 3 | the same run; a bash disagreement ABORTS with exit 2, so no subject result rests on an unestablished snippet |
| AC-3 | 4 | the same command, run again in Task 4 around the mutant; its SECOND tally line, `N/N documented-limit rows UNCHANGED against tests/cross-cutting/psqlStartupFiles/scan.ts at <merge-base>`. If that line says VACUOUS, the run proves NOTHING about scope and the task is not done |
| AC-3b | 4 | the same run's THIRD tally line, `N/N bash-rejected rows hold their RECORDED base -> candidate movement` |
| AC-4 | 3 | `pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`, with the two nearest pin blocks asserted unmoved. Task 4 does NOT run this suite and no longer claims it |
| AC-5 | 5 | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08…` — Task 5 runs this command by name. `corpus-time.mts` PRINTS a digest and never compares one, so it does not discharge AC-5 (round 2 finding 2) |
| AC-6 | 5 | `corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base` |
| AC-7 | 6 | `pnpm heavy pnpm mutation:guards` — the FULL gate, counts pasted into close-out. Task 6's temporary single-surface shard is for ITERATION and is not this channel: `pnpm mutation:guards` hard-codes `shard0..3` + `gates` and never matches a `shardTmp` file — `rg -n 'mutation:guards' package.json` (round 3 finding 1) |
| AC-8 | 7 | the §6 prose sweep, run and pasted |

**AC-3's tally line has three states, not two, and only one of them is a pass.** `UNCHANGED` means
the limit rows compared against the merge-base scanner and agreed. `MOVED` names a row that drifted.
`VACUOUS` means candidate and baseline were byte-identical — which is correct before Task 3 lands and
is a FALSE PASS after it, so Task 4 asserts the line is not VACUOUS as well as not MOVED.

## Every LIVE-claiming `red=` was RUN at plan time, and none of the three survived unchanged

The task-marker contract is red-then-green on the SAME command, and a `red-state=live` marker asserts
the command fails on the CURRENT tree. **Only markers that CLAIMED to be live are runnable at plan
time**, which is what this table covers — Tasks 3 and 4 are `authored` by construction, their failing
cases are written inside the arc, and there is nothing to run today (round 3 finding 3: the previous
heading said "every `red=`" and meant a subset). Run, at plan-authoring time, in this worktree:

| marker | command | observed | disposition |
| --- | --- | --- | --- |
| Task 5 | `corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base` | **exit 1**, `FAIL: the candidate is byte-identical … so the ratio would compare the scanner with itself.` | **marker WITHDRAWN.** The red is real but belongs to Task 3: it fires only while the candidate matches the base, and Task 5 runs after Task 3 has landed. Task 5 is now a declared measurement task outside the region |
| Task 6 | `pnpm mutation:sites` | **exit 0**, `all accepted rows resolve` | re-homed to Task 3 step 6, which is the edit that invalidates the keys. Task 6's red is now its own temporary shard |
| Task 7 | `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` | **exit 0**, 17 passed | corrected to `red-state=authored` — the failing case is written by Task 7's own archive move |

Two of three `live` claims were false, and both would have read as healthy to anyone who did not run
them: a marker claiming a red that does not exist describes a cycle the task never performs, and the
green half then proves nothing because the command was green all along.

**Task 5's row survived that pass, then failed round 1 finding 1, then failed round 2 finding 1** —
three passes to kill one marker, and the sequence is the lesson.

Running the command caught the first defect and nothing more. Round 1 caught the second: the marker
fixed `--baseline-cpu-ms 1`, so its GREEN step had to substitute the measured baseline and became a
DIFFERENT command, and a red and a green on two commands is not a cycle. The repair made both halves
byte-identical. Round 2 caught the third, which the repair had walked straight past: the command is
the same, but the FAILING CASE is created by Task 3, so by the time execution reaches Task 5 it is
already green.

**Three properties, and a marker needs all of them** — the command must fail today, the green half
must run the SAME command, and THIS task must be what makes it fail. The round-1 sweep checked the
first two across all five markers and did not think to check the third, which is how a finding
already fixed on Task 6 survived one more round on Task 5.

The Tasks 3 and 4 markers are `authored` by construction and are not in this table.

## Task 1: rebase onto the merged tree, re-key, and re-establish every number

Not a TDD task and it carries no red: it is the arc's opening move, and it exists because every
number in the design was measured before `arc-yamlquote` merged.

1. `git fetch origin && git rebase origin/main`, after bl-orch signals that yamlquote has merged.
2. `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`.
3. `pnpm mutation:sites` — the sibling's edit moves sites in this same file.
4. Re-run all SEVEN probes and record the outputs in the close-out doc — `shapes.mts`,
   `weaker-walks.mts`, `consumers.mts`, `corpus-time.mts`, `syntax-error-class.mts`, and the two
   reporters `cost-curve.mts` and `depth.mts`. Round 1 finding 7: "all four" predated three of them.
   `weaker-walks.mts` and `consumers.mts --expect-repaired` ABORT before the repair lands and are
   re-run in Tasks 4 and 5 respectively; here they establish only that they still execute. **The AC-5 digest and the
   AC-6 baseline are re-established here, on the rebased tree, and the design's `8ebe8b08…` is
   treated as a claim about `50ca72a56` until this task confirms or replaces it.** A baseline is a
   measurement of a specific tree; comparing against the old one after the base moves attributes
   the sibling's corpus changes to this branch.
5. Re-verify the anchor table above by grepping each SYMBOL, and update the base stamp.

## Task 2: pin the base (executed at plan time, re-executed by Task 1)

Outputs, not intentions, at `300a9f937b8a`. **Every figure carries the command that produced it**,
per the derived-numbers provenance convention now on main (`BL-...`-archived with #876): a stated
number either names its producing command or is script-assembled. **Re-executed by Task 1 on
2026-08-25 against the rebased tree**, which is what the figures below are stamped to; where a
figure MOVED across the base change it is shown as `50ca72a56 → 300a9f937b8a` rather than silently
overwritten, because a pin that changes without saying so is indistinguishable from one that was
never re-measured.

- **Deciding suite: 1009 → 1045 passed (1045).** The one pin the base change MOVED: `arc-yamlquote`
  added 36 cases to this suite. Nothing was removed and no pinned zero moved.
  `pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`
- **Live census: 76 sites, 0 indirections, 0 unreadable**, digest
  `8ebe8b08d43e6308aa471112d9f086d0118e6238` — UNCHANGED across the base move, and separately
  confirmed by the AC-5 instrument (`--expect 8ebe8b08…` exits 0, `PASS` over 76 rows).
  `pnpm exec tsx …/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts --runs 1`
  (reads `TOTAL ROWS` and `DIGEST`), or the AC-5 instrument
  `pnpm exec tsx …/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts`.
- **Registry: `psqlStartupScan`, thirty `equivalent` rows, no accepted-gap ROW, `scoreFloor: 1`.**
  Derived by slicing `tests/mutation/source/registry.ts` from the `id: "psqlStartupScan"` line to the
  next `id: "` and counting within that slice — a bare grep spans neighbouring surfaces and reports
  three. The two `accepted-gap` matches inside the slice are both PROSE in comments, not rows.
- **`shapes.mts` against the shipped walk: 11/22 accept-set**, limits VACUOUS (the shipped walk IS
  the merge-base, so that population certifies nothing until Task 3 lands), **2/4 bash-rejected**,
  `ROWS: 31 total = 22 + 5 + 4`, and the bash oracle clean on every row. **All four tallies are
  UNCHANGED across the base move**, which is the headline of Task 1: `scan.ts` moved 293 insertions
  and 20 deletions and not one row of the crossing population shifted.
  `pnpm exec tsx …/probes/2026-08-22-shell-brace-cross-construct/shapes.mts` with no `SCAN_MODULE`.
  The eleven unmet rows are the seven `R*` spellings, `Q2`, `Q3`, `P4`, `P5`.
- **Median CPU over the live corpus: NOT PINNED HERE, deliberately.** An earlier draft carried
  `14222 ms` shipped and `14132 ms` for the prototype; re-running the same instrument on 2026-08-24
  read a merge-base median between 16898 ms and 17720 ms across three sessions. Those absolutes are a
  property of a contended machine, not of the scanner, and §2.4 already says so. **AC-6's bound is a
  same-session RATIO**, which is why `corpus-time.mts --baseline-from-merge-base` measures both
  figures in one process. Task 5 produces the number that matters; nothing should be compared against
  a wall-clock absolute recorded on a different day.

<!-- tasks: depth=2 red-contract -->

## Task 3: the walk delegates to the constructs it crosses, and the prose moves with it

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1013` why=`matchBraceSpan counts ONLY its own delimiter pair. The target line is the depth-decrement inside the else-if on the closing character - VERIFIED BY READING it at the base commit 300a9f937b8a, re-read after Task 1's rebase, not merely by confirming the citation resolves, which establishes nothing: the line above it is the matching depth-increment and an off-by-one would still have resolved. Cited by CONTENT because this task edits that function. It tracks quotes and escapes and knows no other construct, so a } belonging to a nested $() decrements the ${ walk to zero. Step 1 authors every accept-set case of design section 2.1 in the deciding suite, each ALONE, each asserting sites AND nested/nestedInBacktick because a presence assertion cannot discriminate a delimiting defect. Step 2 observes them red against that counting: re-measured 2026-08-24, ELEVEN of the twenty-two accept-set rows fail on the merge-base walk, several reporting a site with the wrong nested value rather than no site at all, which is why the assertions are attribution-shaped. Step 3 adds the delegation plus the two per-context helpers. Step 4 re-runs the SAME command green and asserts both nearest pin blocks unmoved. Steps 5 and 6 then run the probe channel that AC-1 and AC-2 actually name, and re-key the enrolled surface this task's own edit invalidated` ac=AC-1,AC-2,AC-4 -->

RED: the §2.1 accept-set cases authored in the deciding suite, failing against `matchBraceSpan`'s
bare `depth--`. GREEN: the delegation.

Step 1 authors every accept-set row as a suite case, each asserting sites AND
`nested`/`nestedInBacktick`, because a PRESENCE assertion cannot discriminate a DELIMITING defect: a
mis-delimited span still leaves something reporting, and the sibling arc measured three of its four
named killers wrong for exactly that reason.

**The population is DERIVED from the probe, never retyped.** The hand-built list was wrong
both ways at once (round 1, finding 3) — it omitted `P4` and `P5`, the two rows that independently kill a missing
`lexShellWords` guard, and it included `W4k-*`, which `shapes.mts` classifies as BASH-REJECTED. A
list that is wrong in both directions can go green while claiming to exercise a population it does
not. Get the ids from the probe that owns them:

```
SCAN_MODULE=<candidate> pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts \
  | rg -o '^(\S+)\s+\S+\s+\d+\s+\S+\s+\S+\s+\d+\s+(MEETS after|UNMET)' -r '$1'
```

Twenty-two ids, 2026-08-24 — the eight ledger-row spellings `R1-attached`, `R1-detached`,
`R2-attached`, `R2-detached`, `R1-bare-word`, `R2-bare-word`, `R1-attached-nodq`, `R2-attached-dq`;
the three quote crossings `Q1-dq-inside-subst-inside-dq`, `Q2-backtick-inside-subst`,
`Q3-subst-inside-backtick-in-brace`; the two `W2k-squote-in-dq-in-subst` and
`W2k-squote-in-dq-in-dq-target`; the three `$$` rows `P3-dollardollar-control`,
`P4-dollardollar-relexed-operand`, `P5-dollardollar-relexed-in-dq`; and the six controls
`C1-psql-before-crossing`, `C2-plain-attached-subst`, `C3-plain-call`, `C4-quoted-paren-in-subst`,
`C5-nested-same-pair`, `C6-arith-not-subst`. The `ROWS:` line is the authority on the count; if the
command above returns anything but 22, the probe moved and this paragraph is stale.

Step 2 observes them red. Eleven of the twenty-two fail on the merge-base walk (2026-08-24):
the seven `R*` spellings, `Q2`, `Q3`, `P4` and `P5`.

Step 3 adds the delegation to `matchBraceSpan` plus the two per-context helpers of design §3.1, AND
the `$$` precedence rule in `attachedTargetEnd`'s `substitutionOpenerEnd` as well as in the walk's own
recognizer. Three constraints, each with a measured impostor behind it:

- the two contexts stay TWO recognizers — one parameterised by a flag is `w2`;
- `$$` lands in ALL THREE recognizers, and as ONE GUARD PER LEXICAL CONTEXT rather than a patch per
  `$`-branch — the rule is about the FIRST `$`, and a per-branch fix has to be repeated by whoever
  adds the next branch, which is how it went missing from two recognizers across three review
  rounds. Half-applied is `w6`; applied to two of three is spec round 4's BLOCKING finding;
- an unclosed foreign construct FAILS its enclosing span rather than being skipped — the permissive
  reading is `w4`, and it fabricates a call for input bash refuses to parse.

Step 4 re-runs the SAME command green, and asserts the two nearest pin blocks unmoved.

Step 5 executes the channel AC-1 and AC-2 actually name — `SCAN_MODULE=tests/cross-cutting/psqlStartupFiles/scan.ts pnpm exec tsx …/shapes.mts --expect-repaired`
— and reads the FIRST tally line as `22/22`. The deciding suite and the probe carry SEPARATE
fixtures, so a green suite is not evidence about the probe's population and the plan may not treat
one as standing in for the other.

**Step 5b moves the prose, in THIS task, because this task is what falsifies it.** Design §6's eight
sites — five comments in `scan.ts`, two in the deciding suite, and the ledger row, which is Task 7's
because it is not a source edit. Round 2 finding 3: these used to live in Task 7, AFTER Task 6 scored
the surface, and the plan's own global constraint says any `scan.ts` edit invalidates the registry
keys while the score depends on both source AND deciding suites. A score taken before seven comment
edits does not describe the final bytes. Moving them here means ONE source edit, ONE re-key, ONE
score — and it puts each comment repair in the same commit as the behaviour change that falsifies it,
which is where a reader looking for the reason will go.

**Step 6 re-keys the enrolled surface, in THIS task, because this task is what invalidated it.**
`pnpm mutation:sites`, then every `equivalent` row re-read AT ITS NEW SITE. Round 1 finding 2: the
re-key used to live in Task 6, which meant `pnpm mutation:sites` was red across this task's commit
and Tasks 4 and 5 — contradicting the global constraint that it runs after EVERY `scan.ts` edit, and
handing Task 6 a red it did not author. A task does not commit leaving an enrolled guard red for
three tasks. No row is carried across on the strength of having been true before: a source edit voids
the argument as well as the key.

## Task 4: the documented-limit surface, red against a NAMED MUTANT, and every impostor killed

<!-- task: red=`SCAN_MODULE=tests/cross-cutting/psqlStartupFiles/scan.ts pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts --expect-repaired` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:986` why=`every documented-limit row pins behaviour that is CORRECT today and must not move, so a non-regression pin cannot go red against correct code. Its red is authored against a NAMED MUTANT applied to the function at the target line above, matchBraceSpan, cited by SYMBOL because this arc moves it: the comment-rule widening of design section 2.1b, which makes a # inside $() close the construct the way bash does. Step 2 applies it and observes L2 report MOVED with exit 1, proving the limit rows discriminate scope creep rather than merely printing. Step 3 reverts the mutant - it is never committed - and Step 4 re-runs the SAME command green. The mutant is deliberately an IMPROVEMENT in bash fidelity and is still refused, which is what makes the no-parser-growth fence executable` ac=AC-3 -->

The FIVE documented-limit rows `L1`–`L5` pin behaviour that is CORRECT today and must stay, so a
non-regression pin cannot red against correct code. (Design §7 lists seven limits; items 6 and 7 are
not in this population — §7.6 is asserted by `syntax-error-class.mts` in Task 7 and §7.7 by the AC-5
digest in Task 5. Calling all seven part of this proof was round 1 finding 5.) Its red is authored against a named mutant instead: the
`#`-comment widening from design §2.1b, applied inside this task and reverted before the commit.
Under it, `L2` reports `MOVED` and the run exits 1; restored, it exits 0.

The task also asserts the tally line is not `VACUOUS`. Before Task 3 lands, candidate and baseline
are the same bytes and every limit row passes trivially — which is exactly the shape round 1 finding
1 removed from the probe, and re-introducing it by running this task too early would restore it.

**The mutant is reverted to BYTE-IDENTICAL source, and that is what keeps it out of the re-key.**
Round 2 finding 3 flagged the class: a task that edits `scan.ts` invalidates the registry keys. This
one edits and restores, so `git hash-object tests/cross-cutting/psqlStartupFiles/scan.ts` must match
its pre-mutant value before the task commits — verify it rather than assume it, and if it does not
match, the revert was inexact and `pnpm mutation:sites` is owed here too.

That mutant is the one worth having: it makes the walk agree with bash on a case where today it does
not, and it is still refused, because it is the parser growth §1.2 row 2 fences. A limit surface
whose red is a genuine improvement is the strongest evidence that the fence is executable rather
than aspirational.

**The task also reads the THIRD tally line** — `N/N bash-rejected rows hold their RECORDED base ->
candidate movement` — which is AC-3b. It was absent from the acceptance mapping entirely until round
1 finding 6, and it is the line that catches a repair moving something on input the shell refuses to
parse.

**Then `weaker-walks.mts`, which is where the impostors are actually killed rather than described:**

```
SCAN_MODULE=tests/cross-cutting/psqlStartupFiles/scan.ts pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/weaker-walks.mts
```

It rebuilds all eight weaker walks from the shipped repair and asserts each dies to exactly its
declared killers. This belongs here because it answers Task 4's own question — does the instrument
discriminate — on the accept-set and bash-rejected populations the way the `#` mutant answers it on
the limit rows. A walk reported `SURVIVED` means a wrong implementation passes every fixture and the
accept-set needs a row, not that the probe is wrong. A walk reported `MISATTRIB` means the fixture
that was supposed to catch it no longer does. Either is a stop.

<!-- tasks: end -->

## Task 5: the digest and the cost bound — a MEASUREMENT task, and it carries no red

**This task is deliberately outside the red-contract region, and round 2 finding 1 is why the
previous marker had to go.** That marker's red was the `--baseline-from-merge-base` refusal, which
fires only while the candidate is byte-identical to the merge base. By the time execution reaches
Task 5, Task 3 has landed and the command is already green: the failing case belonged to Task 3, not
here. That is the same defect round 1 finding 2 removed from Task 6, and it survived one round on
this task because the round-1 repair swept for "red and green are the SAME command" without also
sweeping for "and THIS task creates the failing case".

**Neither gate can be authored red by any in-scope mutant, and that is measured, not assumed.**

- **AC-5's digest cannot move.** Every one of the nine named mutants — `w1`, `w2`, `w3`, `w4`, `w6`,
  `w7`, `w8`, the `#` widening, and the §3 design itself — leaves the live-corpus finding set at
  76 rows / `8ebe8b08d43e6308aa471112d9f086d0118e6238`. Probed 2026-08-24 by running `corpus-time.mts
  --runs 1` against each. The reason is design §2.3: the live population of the crossing is ZERO, so
  no live row exercises the changed path. AC-5 is a non-regression pin whose value is catching a
  movement nobody predicted, and a pin like that is structurally un-reddable by a correct-scope
  change.
- **AC-6's ratio does not breach on a plausible slowdown**, and round 3 finding 2 is why the number
  below comes with the command that produced it rather than on its own word. Build a span-quadratic
  variant of the candidate — recomputing across the span so far on every counted character, the shape
  a naive implementation actually takes — by anchored substitution, the same way `weaker-walks.mts`
  builds its eight:

  ```
  node -e 'import("node:fs").then(({readFileSync:r,writeFileSync:w})=>{
    const SRC="node_modules/.cache/bracecross/scan-proto.ts";
    const B="    const foreign = foreignConstructEnd(text, i);";
    const A="    let recomputed = 0;\n    for (let z = start; z < i; z++) recomputed += text.charCodeAt(z);\n    if (recomputed < 0) return { index: -1, closed: false };\n"+B;
    const s=r(SRC,"utf8");
    if(s.split(B).length-1!==1){console.error("ABORT: anchor not unique");process.exit(2);}
    w("node_modules/.cache/bracecross/wslow.ts",s.replace(B,A));})'

  SCAN_MODULE=node_modules/.cache/bracecross/wslow.ts pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts \
    --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base
  ```

  Output, 2026-08-24, measured against the §3 prototype in the untracked build cache; substitute the
  shipped scanner once Task 3 lands:

  ```
  merge-base median cpu: 16898 ms (50ca72a566b0, same session)
  MEDIAN CPU MS: 20457
  PASS: median cpu within 1.5 x baseline 16898 ms
  ```

  **1.21×**, inside the 1.5× bound. The figure is contention-sensitive — an earlier run of the same
  recipe on a busier machine read 1.15× — so what the measurement establishes is the SIGN, not the
  digit: the live corpus's spans are too short for span-quadratic cost to approach the bound.
  Manufacturing a red by making the walk absurdly slow would prove the gate's arithmetic and nothing
  about this repair, which is the theatre this repo retires.

So the honest form is a measurement task that runs both gates and asserts their outputs, with no red
to author. Tasks 1 and 2 are non-TDD for the same kind of reason and sit outside the region the same
way.

**Each gate is separately proved to fire, and round 3 finding 3 caught that claim being made too
broadly.** Design §2.1b proves `shapes.mts` and `corpus-time.mts`'s RATIO gate; it says nothing about
`baseline-corpus.mts`, which AC-5 only started naming in this round's repair. So that one is proved
here, in both directions, run 2026-08-24:

```
$ pnpm exec tsx …/baseline-corpus.mts --expect 0000000000000000000000000000000000000000
FAIL: finding set MOVED.
  expected 0000000000000000000000000000000000000000
  actual   8ebe8b08d43e6308aa471112d9f086d0118e6238
$ echo $?
1
$ pnpm exec tsx …/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238
PASS: finding set matches the pinned digest over 76 rows.
$ echo $?
0
```

A gate that cannot fail is not a check, and until this run nothing in either arc had demonstrated
that this one can.

**AC-5 — run the command the mapping names.** Round 2 finding 2: the mapping promised
`baseline-corpus.mts --expect …` and no task ran it, while `corpus-time.mts` only PRINTS its digest
and never compares. Two different instruments; only one of them fails on drift.

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238
```

That probe imports `collectPsqlUsage` from the tracked scanner STATICALLY — it does not honour
`SCAN_MODULE` — so it measures the working tree, which after Task 3 is the repair. It exits 1 naming
expected and actual, and 2 on a zero-row or thin-record read. Use the digest Task 1 re-established on
the rebased tree, not the literal above, if the rebase moved it.

**AC-6 — the ratio, both figures from one session so contention cancels.**

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base
```

The baseline is the merge-base scanner measured IN THIS PROCESS. If it prints the byte-identical
refusal, Task 3 has not landed and this task is being run too early.

**`consumers.mts --expect-repaired` runs here too**, and round 1 finding 7 is why it has to run
somewhere. `matchBrace` has six call sites; the accept-set covers the crossing, not the other routes
through the changed matcher, and design §2.1d's claim of seven unchanged routes plus one recorded
movement had no task pointing at it. Task 1 cannot discharge it — it runs before the implementation,
when the probe is explicitly VACUOUS. The flag is new for exactly that reason: without it the probe
exits 0 on a byte-identical comparison, which is correct before the repair and a false pass after it.
Measured against the §3 prototype on 2026-08-24: `7/7 unmoved consumer routes IDENTICAL, 1 recorded
movement(s)`.

<!-- tasks: depth=2 red-contract -->

## Task 6: score the surface (the re-key is Task 3's)

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`tests/mutation/_metaSourceShardIntegrity.test.ts:67` why=`RUN AT PLAN TIME AND IT EXITS 0 on the untouched tree, so this is an AUTHORED red. The failing case is created by THIS task and by no other: scoping the mutation gate to one surface requires a temporary guardSurfaces.shardTmp*.test.ts, because -t does NOT bound the gate (runSurface executes at module scope during collection), and the target line above is the source-shards entry whose stem and glob pin the shard FILE SET byte-for-byte - so the moment the temp shard exists this guard is red. Step 2 creates the shard and observes exactly that. Step 3 runs the SCOPED gate FOREGROUND under pnpm heavy, for ITERATION only - it is where a survivor gets killed cheaply, and it is NOT AC-7. Step 4 deletes the temp shard and runs the SAME command green, closing this marker's cycle. Step 5 then runs the FULL pnpm heavy pnpm mutation:guards, and THAT is AC-7: the scoped script never matches a shardTmp file, so the scoped run and the acceptance channel are different commands, and round 3 finding 1 plus round 4 finding 1 are the two halves of that same mismatch. The cycle is entirely inside this task, which round 1 finding 2 is why it matters: the previous marker claimed pnpm mutation:sites, a red that Task 3 s edit creates and that would therefore have stood red across Task 3 s own commit and Tasks 4 and 5, against this plan s global constraint that it runs after EVERY scan.ts edit. That re-key now lives in Task 3 step 6, where the edit that invalidates it lives` ac=AC-7 -->

The re-key is NOT here — Task 3 step 6 owns it, because Task 3 is the edit that invalidates it. What
is here is the SCORE.

Step 2 creates the temporary `guardSurfaces.shardTmp*.test.ts` filtering `GUARD_SURFACES` to
`psqlStartupScan` alone, and observes `_metaSourceShardIntegrity` go red on the shard set it pins.
Step 3 executes the SCOPED gate FOREGROUND under `pnpm heavy` — a slot held by a backgrounded run is
a slot nobody can account for. **This run is ITERATION, not acceptance**: it is where a survivor gets
killed without paying for four shards each time. Step 4 DELETES the temp shard and re-runs the same
guard green; a shard left behind is a permanent red on a guard nobody edited, and it is the reason
the deletion is a numbered step rather than a note.

**Step 5 runs the FULL gate, and that step is AC-7:**

```
pnpm heavy pnpm mutation:guards
```

Round 4 finding 1, which is the second half of round 3 finding 1 and the last instance of that class:
round 3 repaired the global constraint and the acceptance table to say AC-7 is the full gate, and left
THIS task's marker and body still calling the scoped result AC-7. A good-faith implementer could
complete every numbered step and leave AC-7 unproved. The scoped script matches no `shardTmp` file
and the scoped shard is not in `pnpm mutation:guards`, so these are two different commands and only
the full one discharges the criterion — a scoped local run on a sibling arc missed twelve survivors
that the PR's own harness job then found. The score and the empty unaccepted-survivor set that the
round-1 diff brief's `GUARD SURFACE:` line carries come from THIS run, not from step 3's.

**Blob-hash before re-scoring.** The score is a pure function of (source, operators, deciding
suites), so `git hash-object` settles whether a re-run is needed more cheaply than the re-run does.

**The temp shard is a `.ts` inside the scanned tree, and that is the peer of round 2 finding 3 on
this task.** `SCANNED_EXTENSIONS` (`tests/cross-cutting/psqlStartupFiles/scan.ts:487`) covers
`.ts`, so a file placed under `tests/mutation/` is walked like any other source — which is how a
sibling arc's scratch probe put its deciding suite red and its gate into `BaselineNotGreenError`.
Keep the shard free of psql spellings, and because it is created AND deleted inside this task, no
measurement outside it can see the file either way. AC-5's digest is taken in Task 5, before the
shard exists. `git status --short` before believing any red this task produces.

**The ledger archive in Task 7 cannot perturb any of this**, because `SCANNED_EXTENSIONS` has no
`.md` — checked rather than assumed, since it is the same ordering question round 2 finding 3 asked.

**The round-1 diff brief's `GUARD SURFACE:` line, in the grammar the wrapper now enforces.** #878
(jurarith) tightened this on 2026-08-24, AFTER this plan's own review stages closed; the arc's diff
stage has not opened, so the round-1 brief the implementer writes is bound by the NEW form. The
wrapper exits 2 before dispatching and names the missing element, so getting it wrong costs a
round-trip rather than a silent skip.

One line, plain or as a Markdown heading — a heading is held to the SAME grammar, separator included
— carrying all three parts:

```
GUARD SURFACE: psqlStartupScan · MUTATION SCORE: <killed>/<total> · 0 unaccepted survivors · OPERATORS: relational-boundary, regex-quantifier-bound
```

- `MUTATION SCORE: <killed>/<total>` and the literal `0 unaccepted survivors`, both from Task 6
  step 5's FULL-gate run, measured BEFORE the first dispatch.
- `OPERATORS:` is the part that is new and the part this plan previously did not mention at all. Name
  the declared families — for this surface `relational-boundary` and `regex-quantifier-bound`, the
  two the global constraints above fix — or the literal `all`.
- Both arms require their tail to BEGIN with an identifier character, optionally backticked. A tail
  that opens with anything else is nonconforming.

**`CANNOT-EXPRESS: <probe citation>` is the other arm and it is NOT an escape hatch here.** A
score-shaped line is never rescued by it — declaring a score commits you to the whole grammar. It
applies only to a surface the registry genuinely cannot express, and `psqlStartupScan` is enrolled,
so this arc uses the score arm.

The gate checks SHAPE only: it never judges the declared score against the registry floor, nor the
declared operator set against the registry row. A conforming line with wrong numbers passes the
wrapper and fails review, which is the worse outcome — read both off the actual run.

Fenced quotations neither trigger the gate nor satisfy it, so the block above is an example and not a
declaration.

## Task 7: the prose sweep VERIFIED, and the ledger closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:81` why=`RUN AT PLAN TIME AND IT EXITS 0 - 17 tests pass on the untouched tree, because the in-progress marker on the ledger row names a branch that still exists on origin, which is exactly what the guard requires. The red-target names the GUARD's archive assertion (archived work cannot be in flight) rather than the ledger row itself, because BACKLOG.md sits at the repository root and a root-level filename classifies as bare-filename shorthand, which a marker may not cite. So this is an AUTHORED red: the failing case is written by THIS task. Step 2 moves the row into BACKLOG-archive.md while the marker is still on it, and the guard's archive assertion - an archive may not hold in-flight work - fails. Step 3 removes the marker in the SAME commit as the archive move. Step 4 runs the SAME command green. The ordering is the whole point rather than an implementation detail: a marker that merges into main names a branch the merge has just deleted, and the origin-existence rule then fails on main until somebody clears it` ac=AC-8 -->

**The sweep VERIFIES here; it does not edit here.** The seven source-comment repairs are Task 3
step 5b, in the same commit as the behaviour change that falsified them (round 2 finding 3 — a score
taken in Task 6 cannot describe bytes that Task 7 goes on to edit). What runs in THIS task is the
same command as a check that nothing stale survived, plus the ledger row, which is the one §6 site
that is not a source edit and therefore cannot invalidate the registry keys.

**The sweep is a command, and round 1 finding 8 is why it could not stay a promise.** The previous
text said "swept by command and pasted" and supplied neither the command nor its output nor a
disposition per hit, which leaves §6's six named sites as the only prose anyone checks — and a
checklist of six is exactly what a sweep is supposed to be able to exceed.

```
rg -n 'matchBraceSpan|matchBraceEnd|only ever wanted the index|blind spot|expansion whole|BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND' \
  tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts BACKLOG.md
```

**THIRTEEN hits at `300a9f937b8a`, re-run by Task 1 on 2026-08-25.** It was twelve at
`50ca72a56`; the thirteenth arrived with `arc-yamlquote`'s merge and belongs to a DIFFERENT ledger
row, disposed below. That the count moved without anyone touching this arc is the argument for the
sweep being the channel and §6 a reading of it: a checklist of eight cannot notice a hit that a
sibling merge introduced. **Every row marked MOVES except the ledger one is repaired in Task 3
step 5b**; re-running the command here must show each of them already updated, and a hit still
describing the pre-repair walk means step 5b was incomplete:

| hit | disposition |
| --- | --- |
| `scan.ts:372` | **MOVES** — §6 site 4, the lexer header's ONE-blind-spot claim. True again only after the repair. |
| `scan.ts:986` | **MOVES** — §6 site 1, `matchBraceSpan`'s block comment and its quoted-`)` example. |
| `scan.ts:1021` | **MOVES** — §6 site 2. The measured figure is SIX callers, not four. |
| `scan.ts:1023`, `scan.ts:1039`, `scan.ts:1144` | **no action** — call sites, not prose. |
| `scan.ts:1038` | **MOVES** — §6 site 3, `matchBraceEnd`'s comment, which describes the walk it delegates to. |
| `scan.ts:1579` | **MOVES** — §6 site 5, the `${…}` branch on consuming the expansion whole. |
| `psqlStartupFileSuppression.test.ts:5348` | **MOVES — NOT IN §6.** The suite-side twin of site 5, same claim about consuming a `${…}` expansion whole. Found by this sweep, added to design §6 as site 7. |
| `psqlStartupFileSuppression.test.ts:6689` | **MOVES — NOT IN §6.** A diff-round-1 comment describing what `matchBraceEnd` asked of a character. Found by this sweep, added to design §6 as site 8. |
| `BACKLOG.md:299` | **MOVES — in THIS task**, §6 site 6, the ledger row archived at closeout. The only §6 site that is not a source edit. |
| `BACKLOG.md:2154` | **false positive, no action** — an unrelated `probe:citations` entry using "blind spot" in its ordinary sense. Recorded rather than filtered out of the pattern, because a sweep that is tuned until it returns only true positives has been tuned against its own corpus. |
| `BACKLOG.md:357` | **NEW at this base, no action, and it is NOT this arc's row.** It belongs to `BL-SHELL-UNTERMINATED-PROCESS-SUBSTITUTION-FABRICATES`, which states that `matchBraceEnd` "returns `-1` when a span never closed, so the suppression precedent already exists in the file". The repair does NOT falsify it: §1.2 row 5 and §3.2 both ratify that `matchBraceEnd` keeps reading the walk's OWN `closed` flag and that `matchBrace`'s return contract is unchanged for its six index-only consumers. The sentence is true before and after. Recorded because the sweep found it and a reader is owed the reason it survives untouched. |

**Two of the eight prose sites were found by the sweep and not by §6**, which settles what the sweep
is for: it is the channel, and §6 is a reading of it that was two sites short. The thirteenth hit
makes the same point a second way and from outside: it entered the corpus through a sibling arc's
merge, so no reading of §6 — however careful — could have anticipated it.

`syntax-error-class.mts` runs here too: it ASSERTS that all five ordinary syntax errors still
fabricate, and a failure means §7 limit 6's scope claim has stopped being true and must be re-read
rather than left standing.

The three ledger guards run as one invocation —
`pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts tests/docs/_metaReviewRoundEconomy.test.ts`
— which is the meta-test inventory's promise made executable rather than asserted (round 1 finding
9). The ledger row is archived with the measured outcome, INCLUDING its two corrections — six call
sites plus one, not five callers; and the population, which the row scoped to attached targets and
this arc widens to any position. The IN PROGRESS marker comes off in this commit, one before the
whole-diff review, never after.

<!-- tasks: end -->
