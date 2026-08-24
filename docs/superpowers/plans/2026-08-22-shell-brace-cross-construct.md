# Plan — the delimiter walk delegates to the constructs it crosses

Design: `docs/superpowers/specs/ci/2026-08-22-shell-brace-cross-construct-design.md`.
Ledger row: `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND` (`BACKLOG.md:263`).
Probes: `docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/`.

One production function changes: `matchBraceSpan`. Everything else in this plan is the apparatus
that proves it changed the right thing and nothing else.

**This plan is executed by a DIFFERENT session than the one that wrote it, and not yet.**
`arc-yamlquote` (`fix/yaml-run-scalar-quoting-decode`) edits the same file's YAML decode path and
merges first. Task 1 is the rebase-and-re-key that opens the arc; every number below is stamped to
`50ca72a56` and Task 1 is what re-establishes them on the merged tree.

## Anchors, base-stamped, symbol-identified

Every citation is stamped at `50ca72a56`, where `scan.ts` is blob `61adf448c344`. **There is
deliberately no HEAD column.** Task 3 edits `matchBraceSpan`, so every line below it moves, and a
re-verified HEAD column is stale within the hour — the sibling arc wrote one, verified it by reading,
and watched its own later repairs invalidate it. The durable identity is the SYMBOL; resolve any
row by grepping it.

| symbol | at base |
| --- | --- |
| `matchBraceSpan` | `tests/cross-cutting/psqlStartupFiles/scan.ts:973` |
| `matchBrace` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1009` |
| `matchBraceEnd` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1025` |
| `closingBacktick` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1042` |
| `attachedTargetEnd`, and its private `closeDoubleQuoted` | `tests/cross-cutting/psqlStartupFiles/scan.ts:1085`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1102` |
| `acceptedExpansionOperand`'s whole-span boundary test | `tests/cross-cutting/psqlStartupFiles/scan.ts:1975` |
| the six `matchBrace` call sites | `tests/cross-cutting/psqlStartupFiles/scan.ts:1561`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1600`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1630`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1728`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1745`, `tests/cross-cutting/psqlStartupFiles/scan.ts:1975` |
| the one `matchBraceEnd` call site | `tests/cross-cutting/psqlStartupFiles/scan.ts:1131` |
| the two nearest pin blocks in the deciding suite | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6674`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6700` |

## Global constraints

- **`psqlStartupScan` is an ENROLLED guard surface.** Any edit to `scan.ts` — a comment included —
  invalidates its registry keys. `pnpm mutation:sites` runs after EVERY edit, not once at the end.
  This cost the sibling arc two review rounds in two disguises.
- **Heavy phases wrap at the outermost entry**: `pnpm heavy pnpm mutation:guards`, `pnpm heavy pnpm test`.
  Slots are two, machine-wide, contended.
- **Scoping the mutation gate**: `-t` does NOT bound it (`runSurface` executes at module scope during
  collection). Write a temporary `guardSurfaces.shardTmp*.test.ts` filtering `GUARD_SURFACES` to the
  one id, run it FOREGROUND under `pnpm heavy`, then DELETE it —
  `tests/mutation/_metaSourceShardIntegrity.test.ts` pins the shard set byte-for-byte.
- **Blob-hash before any re-measure.** The score is a pure function of (source, operators, deciding
  suites); verify with `git hash-object` rather than re-running on faith.
- **A scratch `.ts` in the worktree root is walked like source.** A probe file containing psql
  spellings put the sibling arc's deciding suite red and its gate into `BaselineNotGreenError`.
  `git status --short` before believing a red baseline. This arc's own probes live under `docs/`,
  which the walk skips at the root — measured, not assumed: with all SEVEN present the AC-5 digest is
  unchanged at 76 rows / `8ebe8b08…` (re-measured 2026-08-24, after `weaker-walks.mts` was added).
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
- **`NUMERIC_NOUN_MISMATCH`, every instance** — on `rows`, `sites`, `asserts`, `and`, `accept-set`,
  `executes`, `passed`, `runs`. Every one pairs a number with the word that happens to follow it — `§1.2 row`
  against `76 rows`, `Task 3 asserts` against `Task 4 asserts`, `Step 3 runs` against `--runs 3`. The
  nouns are genuinely different quantities in different scopes.

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
| `a construct whose LAST character is its delimiter without closing is REPORTED, not resolved` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6674`) | **HELD.** Six rows, each 0 sites / 1 advisory. The FIRING CONDITION is unchanged; which spans are undelimitable does move (design §3.2), and none of these six is among them. Task 3 asserts all six unmoved. |
| `a quote character that is LITERAL inside a double-quoted target does not open a span` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6700`) | **HELD**, and it is the nearest neighbour: it pins the per-context alphabet on the TARGET path that Task 3 introduces on the WALK path. |
| `documented limits - quote-concatenated spellings outside the assignment family` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6165`) | **HELD.** Unrelated family (assignment values); named because it is a declared-limit block on the same suite. |
| `R40 — hypothetical gaps closed cheaply; the rest are documented limits` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:4151`) | **HELD.** |
| `each quote-concatenated keyword/operand spelling is a declared miss` (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6173`) | **HELD.** Named because `spec:lint`'s own arm named it and my hand-built table had guessed the enclosing block heading instead — which is exactly why this table is reconciled against `DECLARED_LIMIT_PIN_UNNAMED` output rather than assembled from a reading of the suite. Unrelated family (quote-concatenated assignment spellings); the crossing repair does not reach it. |
| the five NEW limits of design §7 (`L1`–`L5`) | **AUTHORED** in Task 4 as `shapes.mts` limit rows. ONE named widening mutant proves the population discriminates: under the `#`-comment rule `L2` reports `MOVED` and the run exits 1. The other four are pinned but NOT individually mutant-proved — they share one instrument, so a mutant that moves any row proves the channel for all five, and claiming five separate proofs was round 1 finding 5. Design §7's items 6 and 7 are deliberately NOT in this population: item 6 is asserted by `syntax-error-class.mts` and item 7 by the AC-5 digest. |

## Strictly weaker implementations, and the fixture that kills each

**This table is produced, not written down.** The previous one contradicted
itself (round 1, finding 4) — `w1` scored 18/22 while naming two fixtures, `w4` and the `#` candidate scored 20/22 while
naming no accept-set killer at all — and the cause was that each walk had been built from whatever
the prototype was on the day, so the ones predating spec round 4 carried TWO weakenings. A table
nobody can re-run cannot be caught being wrong, which is how that survived four rounds.

```
SCAN_MODULE=<candidate> pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/weaker-walks.mts
```

Every walk is rebuilt FROM THE CANDIDATE by anchored substitution, ONE weakening each, and run
against the fixture set. The probe gates on ATTRIBUTION rather than counts: a walk must die to
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

## Every assertion about a scanner outcome asserts ATTRIBUTION, never counts alone

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
| AC-5 | 5 | `baseline-corpus.mts --expect 8ebe8b08…` |
| AC-6 | 5 | `corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base` |
| AC-7 | 6 | `pnpm heavy pnpm mutation:guards`, counts pasted into close-out |
| AC-8 | 7 | the §6 prose sweep, run and pasted |

**AC-3's tally line has three states, not two, and only one of them is a pass.** `UNCHANGED` means
the limit rows compared against the merge-base scanner and agreed. `MOVED` names a row that drifted.
`VACUOUS` means candidate and baseline were byte-identical — which is correct before Task 3 lands and
is a FALSE PASS after it, so Task 4 asserts the line is not VACUOUS as well as not MOVED.

## Every `red=` was RUN at plan time, and two claims did not survive it

The task-marker contract is red-then-green on the SAME command, and a `red-state=live` marker asserts
the command fails on the CURRENT tree. Run, at plan-authoring time, in this worktree:

| marker | command | observed | disposition |
| --- | --- | --- | --- |
| Task 5 | `corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base` | **exit 1**, `FAIL: the candidate is byte-identical to tests/cross-cutting/psqlStartupFiles/scan.ts at merge-base 50ca72a566b0, so the ratio would compare the scanner with itself.` | `red-state=live` STANDS, on the command as written — re-run 2026-08-24 |
| Task 6 | `pnpm mutation:sites` | **exit 0**, `all accepted rows resolve` | corrected to `red-state=authored` — the failing case is created by Task 3 |
| Task 7 | `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` | **exit 0**, 17 passed | corrected to `red-state=authored` — the failing case is written by Task 7's own archive move |

Two of three `live` claims were false, and both would have read as healthy to anyone who did not run
them: a marker claiming a red that does not exist describes a cycle the task never performs, and the
green half then proves nothing because the command was green all along.

**Task 5's row survived that pass and still failed round 1 finding 1**, which is the sharper lesson.
Running the command is necessary and not sufficient: the old marker fixed `--baseline-cpu-ms 1`, so
its GREEN step had to substitute the measured baseline and became a DIFFERENT command. A red and a
green on two different commands is not a cycle. `--baseline-from-merge-base` measures the baseline
in-process, so the command text is now stable across both halves — and it refuses a byte-identical
comparison rather than reporting a flattering ratio of 1.0, which is what makes the red live today
and the green meaningful after Task 3. The Tasks 3 and 4 markers are
`authored` by construction and are not in this table.

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

Outputs, not intentions, at `50ca72a56`:

- Deciding suite: **1009 passed (1009)**.
- Live census: **76 sites, 0 indirections, 0 unreadable**, digest `8ebe8b08d43e6308aa471112d9f086d0118e6238`.
- Median CPU over the live corpus: **14222 ms** shipped, **14132 ms** for the prototype.
- Registry: `psqlStartupScan`, thirty `equivalent` rows, no accepted gap, `scoreFloor: 1`.
- `shapes.mts` against the shipped walk: **11/22 accept-set**, limits VACUOUS (the shipped walk IS
  the merge-base, so that population certifies nothing until Task 3 lands), **2/4 bash-rejected**.

<!-- tasks: depth=2 red-contract -->

## Task 3: the walk delegates to the constructs it crosses

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1000` why=`matchBraceSpan counts ONLY its own delimiter pair. The target line is the depth-decrement inside the else-if on the closing character - VERIFIED BY READING it at the base commit 50ca72a56, not merely by confirming the citation resolves, which establishes nothing: the line above it is the matching depth-increment and an off-by-one would still have resolved. Cited by CONTENT because this task edits that function. It tracks quotes and escapes and knows no other construct, so a } belonging to a nested $() decrements the ${ walk to zero. Step 1 authors every accept-set case of design section 2.1 in the deciding suite, each ALONE, each asserting sites AND nested/nestedInBacktick because a presence assertion cannot discriminate a delimiting defect. Step 2 observes them red against that counting: re-measured 2026-08-24, ELEVEN of the twenty-two accept-set rows fail on the merge-base walk, several reporting a site with the wrong nested value rather than no site at all, which is why the assertions are attribution-shaped. Step 3 adds the delegation plus the two per-context helpers. Step 4 re-runs the SAME command green and asserts both nearest pin blocks unmoved. Steps 5 and 6 then run the probe channel that AC-1 and AC-2 actually name, and re-key the enrolled surface this task's own edit invalidated` ac=AC-1,AC-2,AC-4 -->

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

**Step 6 re-keys the enrolled surface, in THIS task, because this task is what invalidated it.**
`pnpm mutation:sites`, then every `equivalent` row re-read AT ITS NEW SITE. Round 1 finding 2: the
re-key used to live in Task 6, which meant `pnpm mutation:sites` was red across this task's commit
and Tasks 4 and 5 — contradicting the global constraint that it runs after EVERY `scan.ts` edit, and
handing Task 6 a red it did not author. A task does not commit leaving an enrolled guard red for
three tasks. No row is carried across on the strength of having been true before: a source edit voids
the argument as well as the key.

## Task 4: the documented-limit surface, red against a NAMED MUTANT

<!-- task: red=`SCAN_MODULE=tests/cross-cutting/psqlStartupFiles/scan.ts pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts --expect-repaired` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:973` why=`every documented-limit row pins behaviour that is CORRECT today and must not move, so a non-regression pin cannot go red against correct code. Its red is authored against a NAMED MUTANT applied to the function at the target line above, matchBraceSpan, cited by SYMBOL because this arc moves it: the comment-rule widening of design section 2.1b, which makes a # inside $() close the construct the way bash does. Step 2 applies it and observes L2 report MOVED with exit 1, proving the limit rows discriminate scope creep rather than merely printing. Step 3 reverts the mutant - it is never committed - and Step 4 re-runs the SAME command green. The mutant is deliberately an IMPROVEMENT in bash fidelity and is still refused, which is what makes the no-parser-growth fence executable` ac=AC-3 -->

The FIVE documented-limit rows `L1`–`L5` pin behaviour that is CORRECT today and must stay, so a
non-regression pin cannot red against correct code. (Design §7 lists seven limits; items 6 and 7 are
not in this population — §7.6 is asserted by `syntax-error-class.mts` in Task 7 and §7.7 by the AC-5
digest in Task 5. Calling all seven part of this proof was round 1 finding 5.) Its red is authored against a named mutant instead: the
`#`-comment widening from design §2.1b, applied inside this task and reverted before the commit.
Under it, `L2` reports `MOVED` and the run exits 1; restored, it exits 0.

The task also asserts the tally line is not `VACUOUS`. Before Task 3 lands, candidate and baseline
are the same bytes and every limit row passes trivially — which is exactly the shape round 1 finding
1 removed from the probe, and re-introducing it by running this task too early would restore it.

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

## Task 5: the digest and the cost bound

<!-- task: red=`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base` red-state=live why=`RUN 2026-08-24 AND IT EXITS 1, printing FAIL: the candidate is byte-identical to tests/cross-cutting/psqlStartupFiles/scan.ts at merge-base 50ca72a566b0, so the ratio would compare the scanner with itself. That refusal IS the live red, and it is the honest one: before Task 3 lands there is nothing to compare, and a gate that reported a flattering ratio of 1.0 there would be measuring the scanner against itself. Round 1 finding 1 killed the previous marker, which fixed --baseline-cpu-ms 1 so that its GREEN step had to substitute the measured baseline and became a DIFFERENT command - a red and a green on two commands is not a cycle. This command is now byte-identical across both halves: --baseline-from-merge-base extracts the scanner at the merge base and measures it IN THIS PROCESS, so contention cancels between the two figures, which is what AC-6 asked for anyway. Step 3 lands nothing; the same command simply exits 0 once Task 3 has made the candidate differ from the base and the ratio is within 1.5x. AC-5 s digest assertion runs beside it against the value Task 1 re-established on the rebased tree` ac=AC-5,AC-6 -->

AC-5 and AC-6 together, in one session so contention cancels: the baseline from the merge-base
scanner, the measurement from HEAD, the ratio asserted at 1.5×. Both gates were proved to fire
(design §2.1b); this task is where they are pointed at the shipped repair.

**`consumers.mts --expect-repaired` runs here too**, and round 1 finding 7 is why it has to run
somewhere. `matchBrace` has six call sites; the accept-set covers the crossing, not the other routes
through the changed matcher, and design §2.1d's claim of seven unchanged routes plus one recorded
movement had no task pointing at it. Task 1 cannot discharge it — it runs before the implementation,
when the probe is explicitly VACUOUS. The flag is new for exactly that reason: without it the probe
exits 0 on a byte-identical comparison, which is correct before the repair and a false pass after it.
Measured against the §3 prototype on 2026-08-24: `7/7 unmoved consumer routes IDENTICAL, 1 recorded
movement(s)`.

## Task 6: re-key the registry and score the surface

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`tests/mutation/_metaSourceShardIntegrity.test.ts:67` why=`RUN AT PLAN TIME AND IT EXITS 0 on the untouched tree, so this is an AUTHORED red. The failing case is created by THIS task and by no other: scoping the mutation gate to one surface requires a temporary guardSurfaces.shardTmp*.test.ts, because -t does NOT bound the gate (runSurface executes at module scope during collection), and the target line above is the source-shards entry whose stem and glob pin the shard FILE SET byte-for-byte - so the moment the temp shard exists this guard is red. Step 2 creates the shard and observes exactly that. Step 3 runs the scoped gate FOREGROUND under pnpm heavy and reads the score and the unaccepted-survivor set, which is AC-7. Step 4 deletes the temp shard and runs the SAME command green. The cycle is entirely inside this task, which round 1 finding 2 is why it matters: the previous marker claimed pnpm mutation:sites, a red that Task 3 s edit creates and that would therefore have stood red across Task 3 s own commit and Tasks 4 and 5, against this plan s global constraint that it runs after EVERY scan.ts edit. That re-key now lives in Task 3 step 6, where the edit that invalidates it lives` ac=AC-7 -->

The re-key is NOT here — Task 3 step 6 owns it, because Task 3 is the edit that invalidates it. What
is here is the SCORE.

Step 2 creates the temporary `guardSurfaces.shardTmp*.test.ts` filtering `GUARD_SURFACES` to
`psqlStartupScan` alone, and observes `_metaSourceShardIntegrity` go red on the shard set it pins.
Step 3 executes the scoped gate FOREGROUND under `pnpm heavy` — a slot held by a backgrounded run is a
slot nobody can account for — and records the score and the unaccepted-survivor set. Step 4 DELETES
the temp shard and re-runs the same guard green; a shard left behind is a permanent red on a guard
nobody edited, and it is the reason the deletion is a numbered step rather than a note.

**Blob-hash before re-scoring.** The score is a pure function of (source, operators, deciding
suites), so `git hash-object` settles whether a re-run is needed more cheaply than the re-run does.

The `GUARD SURFACE:` line of the round-1 diff brief carries the score and the empty
unaccepted-survivor set, measured BEFORE the first dispatch.

## Task 7: the prose sweep and the ledger closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:81` why=`RUN AT PLAN TIME AND IT EXITS 0 - 17 tests pass on the untouched tree, because the in-progress marker on the ledger row names a branch that still exists on origin, which is exactly what the guard requires. The red-target names the GUARD's archive assertion (archived work cannot be in flight) rather than the ledger row itself, because BACKLOG.md sits at the repository root and a root-level filename classifies as bare-filename shorthand, which a marker may not cite. So this is an AUTHORED red: the failing case is written by THIS task. Step 2 moves the row into BACKLOG-archive.md while the marker is still on it, and the guard's archive assertion - an archive may not hold in-flight work - fails. Step 3 removes the marker in the SAME commit as the archive move. Step 4 runs the SAME command green. The ordering is the whole point rather than an implementation detail: a marker that merges into main names a branch the merge has just deleted, and the origin-existence rule then fails on main until somebody clears it` ac=AC-8 -->

**The sweep is a command, and round 1 finding 8 is why it could not stay a promise.** The previous
text said "swept by command and pasted" and supplied neither the command nor its output nor a
disposition per hit, which leaves §6's six named sites as the only prose anyone checks — and a
checklist of six is exactly what a sweep is supposed to be able to exceed.

```
rg -n 'matchBraceSpan|matchBraceEnd|only ever wanted the index|blind spot|expansion whole|BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND' \
  tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts BACKLOG.md
```

Twelve hits at `50ca72a56`, run 2026-08-24, each disposed:

| hit | disposition |
| --- | --- |
| `scan.ts:359` | **MOVES** — §6 site 4, the lexer header's ONE-blind-spot claim. True again only after the repair. |
| `scan.ts:973` | **MOVES** — §6 site 1, `matchBraceSpan`'s block comment and its quoted-`)` example. |
| `scan.ts:1008` | **MOVES** — §6 site 2. The measured figure is SIX callers, not four. |
| `scan.ts:1010`, `scan.ts:1026`, `scan.ts:1131` | **no action** — call sites, not prose. |
| `scan.ts:1025` | **MOVES** — §6 site 3, `matchBraceEnd`'s comment, which describes the walk it delegates to. |
| `scan.ts:1566` | **MOVES** — §6 site 5, the `${…}` branch on consuming the expansion whole. |
| `psqlStartupFileSuppression.test.ts:5323` | **MOVES — NOT IN §6.** The suite-side twin of site 5, same claim about consuming a `${…}` expansion whole. Found by this sweep, added to design §6 as site 7. |
| `psqlStartupFileSuppression.test.ts:6664` | **MOVES — NOT IN §6.** A diff-round-1 comment describing what `matchBraceEnd` asked of a character. Found by this sweep, added to design §6 as site 8. |
| `BACKLOG.md:263` | **MOVES** — §6 site 6, the ledger row, archived at closeout. |
| `BACKLOG.md:1800` | **false positive, no action** — an unrelated `probe:citations` entry using "blind spot" in its ordinary sense. Recorded rather than filtered out of the pattern, because a sweep that is tuned until it returns only true positives has been tuned against its own corpus. |

**Two of the eight prose sites were found by the sweep and not by §6**, which settles what the sweep
is for: it is the channel, and §6 is a reading of it that was two sites short.

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
