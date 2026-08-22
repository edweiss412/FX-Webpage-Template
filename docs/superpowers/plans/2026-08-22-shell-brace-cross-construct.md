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
  which the walk skips at the root — measured, not assumed (the AC-5 digest is unchanged with all
  four present).
- **Mutation-operator families are closed at two**, `relational-boundary` and
  `regex-quantifier-bound`, as the registry row ratifies. A third family is a registry change
  carrying its own before/after numbers, not a finding on this plan.

## Meta-test inventory

- **Creates:** none.
- **Extends:** none structurally — the deciding suite gains cases, not a registry.
- **Must keep passing, each named by the task that runs it:** `_metaSourceShardIntegrity` (Task 6 —
  the temp shard is created AND deleted there), `_metaLedgerInProgress`, `_metaLedgerMintBar`,
  `_metaReviewRoundEconomy` (Task 7).
- **"None applies" is not claimed anywhere in this plan.**

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
| the five NEW limits of design §7 | **AUTHORED** in Task 4, each red against a named widening mutant. |

## Strictly weaker implementations, and the fixture that kills each

Every row was BUILT and MEASURED, not reasoned about — seven weaker walks compiled and run against
the acceptance set of design §2.1b. **Four of the seven passed the set as first authored**, which is
why this table exists before the tasks rather than after a review round. The design's §2.1b table is
canonical; this restates it with the fixture names an implementer needs.

Populations: **22 accept-set, 5 documented-limit, 4 bash-rejected** (`shapes.mts` prints
`ROWS: 31 total = 22 + 5 + 4`; that line is the authority, not this sentence).

| walk | weakening | accept-set | limits | bash-rejected | caught by |
| --- | --- | --- | --- | --- | --- |
| `w1` | quotes are not openers in the bare walk | **18/22** | 5/5 | **2/4** | `C4`, `Q1` — attribution, not presence |
| `w2` | ONE recognizer for both lexical contexts | **18/22** | 5/5 | **2/4** | `W2k-*`: a single quote inside double quotes inside `$()` |
| `w3` | backticks are not openers | **18/22** | 5/5 | **1/4** | `Q2`, `Q3` |
| `w4` | an unclosed foreign construct keeps counting | **20/22** | 5/5 | **1/4** | `W4k-*`: bash runs NOTHING, `w4` resolves a site |
| `w6` | `$$` taught to the walk but NOT to `attachedTargetEnd` | **20/22** | 5/5 | **3/4** | `P2`, plus `P4`/`P5` |
| `w7` | `$$` taught nowhere | **20/22** | 5/5 | **2/4** | `P1`, `P2`, `P4`, `P5` |
| the `#`-comment rule | parser growth toward bash fidelity | **20/22** | **4/5** | 4/4 | `L2` only |

**Three of the seven are invisible to the accept-set.** `w6`, `w7` and the `#` widening each pass
every accept-set row and die only to the merge-base comparison. Two are UNDER-repairs and one is an
OVER-repair, which is why both populations exist: the accept-set measures whether the repair landed,
the limit rows whether it stayed in scope.

**What each of the four impostors needed, stated as an axis** — the transferable part, because an
acceptance set assembled from the ledger row's own shapes saw none of them:

- `w2` needs a character whose meaning DIFFERS between the two contexts (`'`).
- `w4` needs an input where bash executes NOTHING, so a resolved site is a fabrication rather than a
  mis-attribution.
- `w6` needs the same rule to be required in MORE THAN ONE recognizer, so partial application is
  observable. There are THREE — the delimiter walk, `attachedTargetEnd`, and `lexShellWords`' own
  `$`-branches — and each spec round found one more of them, the last on the terminal round.
- the `#` widening needs a change that makes the walk MORE bash-faithful and is still out of scope.

**An implementer weakening any of these fixtures is removing the only thing that catches its
impostor.** Kill attribution here is measured, not assumed: each row above is the fixture set that
actually failed when that walk was run, with the §3 design passing all 28 rows as the no-defect
baseline.

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

| id | task | channel |
| --- | --- | --- |
| AC-1 | 3 | `shapes.mts --expect-repaired` prints `N/N accept-set rows meet` and exits 0 |
| AC-2 | 3 | the same run; a bash disagreement ABORTS with exit 2 |
| AC-3 | 4 | the same run's SECOND tally line, `N/N documented-limit rows UNCHANGED against tests/cross-cutting/psqlStartupFiles/scan.ts at <merge-base>`. If that line says VACUOUS, the run proves NOTHING about scope and the task is not done |
| AC-4 | 3, 4 | the deciding suite, with the two nearest pin blocks asserted unmoved |
| AC-5 | 5 | `baseline-corpus.mts --expect 8ebe8b08…` |
| AC-6 | 5 | `corpus-time.mts --max-cpu-ratio 1.5 --baseline-cpu-ms <same-session baseline>` |
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
| Task 5 | `corpus-time.mts --runs 1 --max-cpu-ratio 1.5 --baseline-cpu-ms 1` | **exit 1**, `median cpu 16721 ms exceeds 1.5 x baseline 1 ms = 2 ms` | `red-state=live` STANDS |
| Task 6 | `pnpm mutation:sites` | **exit 0**, `all accepted rows resolve` | corrected to `red-state=authored` — the failing case is created by Task 3 |
| Task 7 | `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` | **exit 0**, 17 passed | corrected to `red-state=authored` — the failing case is written by Task 7's own archive move |

Two of three `live` claims were false, and both would have read as healthy to anyone who did not run
them: a marker claiming a red that does not exist describes a cycle the task never performs, and the
green half then proves nothing because the command was green all along. The Tasks 3 and 4 markers are
`authored` by construction and are not in this table.

## Task 1: rebase onto the merged tree, re-key, and re-establish every number

Not a TDD task and it carries no red: it is the arc's opening move, and it exists because every
number in the design was measured before `arc-yamlquote` merged.

1. `git fetch origin && git rebase origin/main`, after bl-orch signals that yamlquote has merged.
2. `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`.
3. `pnpm mutation:sites` — the sibling's edit moves sites in this same file.
4. Re-run all four probes and record the outputs in the close-out doc. **The AC-5 digest and the
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
- `shapes.mts` against the shipped walk: **8/17 accept-set**, 5/5 limits reported.

<!-- tasks: depth=2 red-contract -->

## Task 3: the walk delegates to the constructs it crosses

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:998` why=`matchBraceSpan counts ONLY its own delimiter pair - the else-if on the closing character that decrements depth, at scan.ts:998-1002 in the base commit 50ca72a56, cited by CONTENT because this task edits that function and a line number in it still resolves after the edit while pointing elsewhere. It tracks quotes and escapes and knows no other construct, so a } belonging to a nested $() decrements the ${ walk to zero. Step 1 authors every accept-set case of design section 2.1 in the deciding suite, each ALONE, each asserting sites AND nested/nestedInBacktick because a presence assertion cannot discriminate a delimiting defect. Step 2 observes them red against that counting: measured today, nine of seventeen fail, four of them reporting a site with the wrong nested value rather than no site at all, which is why the assertions are attribution-shaped. Step 3 adds the delegation plus the two per-context helpers. Step 4 re-runs the SAME command green and asserts both nearest pin blocks unmoved` ac=AC-1,AC-2,AC-4 -->

RED: the §2.1 accept-set cases authored in the deciding suite, failing against `matchBraceSpan`'s
bare `depth--`. GREEN: the delegation.

Step 1 authors every accept-set row as a suite case — the ledger row's four shapes in both
placements, the three argument-position spellings, `Q1`–`Q3`, the two `W2k-*` rows, `W4k-*`, `P3`,
and the controls — each asserting sites AND `nested`/`nestedInBacktick`, because a PRESENCE assertion
cannot discriminate a DELIMITING defect: a mis-delimited span still leaves something reporting, and
the sibling arc measured three of its four named killers wrong for exactly that reason.

Step 2 observes them red.

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

## Task 4: the documented-limit surface, red against a NAMED MUTANT

<!-- task: red=`SCAN_MODULE=tests/cross-cutting/psqlStartupFiles/scan.ts pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts --expect-repaired` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:973` why=`every documented-limit row pins behaviour that is CORRECT today and must not move, so a non-regression pin cannot go red against correct code. Its red is authored against a NAMED MUTANT applied to the function at the target line above, matchBraceSpan, cited by SYMBOL because this arc moves it: the comment-rule widening of design section 2.1b, which makes a # inside $() close the construct the way bash does. Step 2 applies it and observes L2 report MOVED with exit 1, proving the limit rows discriminate scope creep rather than merely printing. Step 3 reverts the mutant - it is never committed - and Step 4 re-runs the SAME command green. The mutant is deliberately an IMPROVEMENT in bash fidelity and is still refused, which is what makes the no-parser-growth fence executable` ac=AC-3 -->

The seven documented limits pin behaviour that is CORRECT today and must stay, so a non-regression
pin cannot red against correct code. Its red is authored against a named mutant instead: the
`#`-comment widening from design §2.1b, applied inside this task and reverted before the commit.
Under it, `L2` reports `MOVED` and the run exits 1; restored, it exits 0.

The task also asserts the tally line is not `VACUOUS`. Before Task 3 lands, candidate and baseline
are the same bytes and every limit row passes trivially — which is exactly the shape round 1 finding
1 removed from the probe, and re-introducing it by running this task too early would restore it.

That mutant is the one worth having: it makes the walk agree with bash on a case where today it does
not, and it is still refused, because it is the parser growth §1.2 row 2 fences. A limit surface
whose red is a genuine improvement is the strongest evidence that the fence is executable rather
than aspirational.

## Task 5: the digest and the cost bound

<!-- task: red=`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-cpu-ms 1` red-state=live why=`the ratio gate exits 1 whenever the median CPU exceeds 1.5x the declared baseline, and at a baseline of 1 ms every possible scan breaches it - so this command fails on the live tree TODAY, for the stated reason, and is the executable proof that the gate can fail at all rather than only print. Measured at authoring time: exits 1 printing median cpu 16636 ms exceeds 1.5 x baseline 10 ms. Step 3 replaces the placeholder baseline with the merge-base scanner s median CPU measured in the SAME session, so contention cancels, and the same command then exits 0. AC-5 s digest assertion runs beside it against the value Task 1 re-established on the rebased tree` ac=AC-5,AC-6 -->

AC-5 and AC-6 together, in one session so contention cancels: the baseline from the merge-base
scanner, the measurement from HEAD, the ratio asserted at 1.5×. Both gates were proved to fire
(design §2.1b); this task is where they are pointed at the shipped repair.

## Task 6: re-key the registry and score the surface

<!-- task: red=`pnpm mutation:sites` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:998` why=`RUN AT PLAN TIME AND IT EXITS 0 - all accepted rows resolve on the untouched tree, so this is an AUTHORED red and NOT a live one. The failing case is created inside the arc, by Task 3 editing the delimiter walk at the target line above (matchBraceSpan's depth decrement, cited by CONTENT since the edit moves it): every psqlStartupScan row keyed below the walk goes stale. The sibling arc measured that failure twice, once after a behavioural fix and once through a COMMENT-only edit, 28 of 30 rows stale the first time and all 30 the second. Step 2 of THIS task runs the command against the post-Task-3 tree and observes it naming those rows; Step 3 re-reads each equivalent row AT ITS NEW SITE; Step 4 runs the SAME command green. Re-reading is the work - no row is carried across on the strength of having been true before, because a source edit voids the argument as well as the key` ac=AC-7 -->

`pnpm mutation:sites`, then every `equivalent` row re-read AT ITS NEW SITE — none carried across on
the strength of having been true before — then `pnpm heavy pnpm mutation:guards`. The
`GUARD SURFACE:` line of the round-1 diff brief carries the score and the empty unaccepted-survivor
set, measured BEFORE the first dispatch.

## Task 7: the prose sweep and the ledger closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:81` why=`RUN AT PLAN TIME AND IT EXITS 0 - 17 tests pass on the untouched tree, because the in-progress marker on the ledger row names a branch that still exists on origin, which is exactly what the guard requires. The red-target names the GUARD's archive assertion (archived work cannot be in flight) rather than the ledger row itself, because BACKLOG.md sits at the repository root and a root-level filename classifies as bare-filename shorthand, which a marker may not cite. So this is an AUTHORED red: the failing case is written by THIS task. Step 2 moves the row into BACKLOG-archive.md while the marker is still on it, and the guard's archive assertion - an archive may not hold in-flight work - fails. Step 3 removes the marker in the SAME commit as the archive move. Step 4 runs the SAME command green. The ordering is the whole point rather than an implementation detail: a marker that merges into main names a branch the merge has just deleted, and the origin-existence rule then fails on main until somebody clears it` ac=AC-8 -->

Design §6's six sites, swept by command and pasted. `syntax-error-class.mts` runs here too: it
ASSERTS that all five ordinary syntax errors still fabricate, and a failure means §7 limit 6's scope
claim has stopped being true and must be re-read rather than left standing. The ledger row is archived with the measured
outcome, INCLUDING its two corrections — six call sites plus one, not five callers; and the
population, which the row scoped to attached targets and this arc widens to any position. The
IN PROGRESS marker comes off in this commit, one before the whole-diff review, never after.

<!-- tasks: end -->
