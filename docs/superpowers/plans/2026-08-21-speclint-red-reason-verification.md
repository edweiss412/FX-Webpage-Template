# Plan — the unprobeable-command silent drop in the red-contract collection arm

Spec: `docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md` (canonical;
every § reference below is to it). Ledger row: `BL-SPECLINT-RED-REASON-VERIFICATION`.

`collectionProbePlan` discards every v2 marker whose command it cannot derive a collection probe
from, emitting neither a finding nor a plan entry. Fifteen live markers land there. The repair routes
that derivation through the decline path that already ships, so the entry draws the existing
`RED_PROBE_UNVERIFIED` advisory. No new finding code, no new predicate, no new severity decision.

impeccable-gate: N/A — no UI surface

This plan touches `lib/specLint/`, `probe/`, `tests/`, `fixtures/`, and `package.json` (the
`probe:reach` script, §6); nothing
under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. The marker sits
on its own line because the gate reads the LINE.

---

## 0. Pre-draft code-verification pass — authored AND RUN

Every citation below was READ, not merely resolved. The distinction matters here because THIS ARC'S
OWN EXECUTION MOVED EVERY ONE OF THEM below line 580. See §3, which round 4 corrected: the change
begins at the type declarations, not at the drop.

**The table is now stated AT HEAD, and every row moved except one.** It was authored against the
base and re-derived after implementation, by `pnpm probe:citations` rather than by reasoning about
which lines shift. The measured result is in §3.

| citation | what the line holds |
| -------- | ------------------- |
| `lib/specLint/redContract.ts:742` | `if (state === null) continue; // v1: no declared state to probe against` |
| `lib/specLint/redContract.ts:664` | `skipped: "not-vitest-shaped",` |
| `lib/specLint/redContract.ts:580` | `const VITEST_SHAPE =` |
| `lib/specLint/redContract.ts:648` | `export function deriveCollectionProbe(` |
| `lib/specLint/redContract.ts:613` | `export type ProbeDerivation =` |
| `lib/specLint/redContract.ts:621` | `export type CollectionProbeEntry =` |
| `lib/specLint/redContract.ts:930` | `export function probesToSpawn(` |
| `lib/specLint/run.ts:152` | `doc.kind === "plan" && probes !== undefined && probes !== null` |
| `lib/specLint/taskContract.ts:49` | `const V2_FIELDS =` |
| `tests/mutation/source/expectedLedgerKinds.ts:137` | `redContract: { equivalent: 7 },` |

Row 2 no longer cites the drop, **because the drop no longer exists**, and that is a design decision
worth stating rather than leaving a reader to infer from a diff. Spec §2 says the `none` case gains a
third `skipped` reason and rides the decline path that already ships. Once it does, nothing in the
module returns `{ kind: "none" }` any more, so both that union member and
`if (derived.kind === "none") continue;` become unreachable. **Keeping them was not available:** a
statement-removal mutant over an unreachable `continue` changes no behaviour and SURVIVES, which
would have owed an eighth `equivalent` row and moved `expectedLedgerKinds.ts:137` off
`{ equivalent: 7 }` — the one value Task 2's acceptance pins UNCHANGED. The plan's own acceptance
criterion chose the subtractive form. Row 2 therefore cites the line that now carries the repair.

`ProbeDerivation` and `CollectionProbeEntry` are the lines this arc EDITS, and `probesToSpawn` is
cited only in the spec, which is why an earlier site list missed it entirely. The `skipped` reason
union was `"compound-command" | "unstrippable-filter"` in both, so the third reason is a two-site
type change, not one. The two lines are named individually rather than as a range: on an arc whose
subject is citation accuracy, "around" is the wrong register.

**Two helpers this plan deliberately does NOT use.** `ownedContractLines` and `wellFormedMarkers` are
not exported. Any probe reconstructing the guard sequence around them would be a MODEL of
`collectionProbePlan` rather than the function itself, which is why `probe/reach.mts` runs the CLI
instead.

## 1. Meta-test inventory

- **EXTENDS** `tests/specLint/cli.test.ts`, specifically the collection-probe describe block, named
  here by its `execCli` and `codesOf` helpers rather than by a line number. The block's title is not
  quoted either: it carries an em-dash, and `COPY_EM_DASH` is a hard finding this arm raises against
  quoted copy, so a verbatim source title in prose reds the very lint this plan is checked by.

  **The line citation this row used to carry is GONE, and finding it is the answer to one half of §8's
  named residue.** It said `:837`; the block now opens at 847, moved by this arc's own edit to a case
  four hundred lines above it. `pnpm probe:citations` did NOT catch it, and correctly so: its declared
  population is citations into `lib/specLint/redContract.ts`, and this is a citation into a different
  file the arc happens to edit. The derived cover is complete over the population it declares, and the
  population was narrower than the hazard. Naming the symbols removes the citation rather than
  re-pinning it, which is the only repair that does not rot again on the next edit. **This is the declared consumer of the fixture plans**, and it is
  where every CLI-PATH claim in this plan is asserted, which is all five assertion rows of Task 1.
  The plan's other claims are asserted elsewhere and each names its home: the unit-level half in
  `tests/specLint/redExec.test.ts`, the corpus-level half in `probe/reach.mts` (§6), and the score in
  Task 2. Round 1 found the fixtures had no declared consumer; that block is it. Its `execCli`
  helper spawns the real `scripts/spec-lint.ts` and its `codesOf` helper reads the emitted code list,
  which is the VALUE every assertion below is written against.
- **EXTENDS** `tests/specLint/redExec.test.ts` (core synthesis) for the unit-level half.
- **EXTENDS** `tests/specLint/redContract.test.ts`, and this row was MISSING from the ratified
  plan. It is the third deciding suite of the `redContract` surface, and it carried the live pin
  of the defect: a six-case block asserting that a non-vitest-shaped command DERIVES NO ENTRY AT
  ALL, one of whose cases is the `pnpm heavy` wrapper itself. Two further cases pinned the same
  silence elsewhere, one in `redExec.test.ts` and one in `cli.test.ts`. Leaving the file out of
  the marker would have let the declared red command pass while a deciding suite was red, which
  is the criterion-that-does-not-exercise-what-it-names class the spec's round 2 retired an arm
  over. The marker's `red=` names all three files for that reason.
- **EXTENDS** the `redVerdict` fixture plan corpus.
- **EXTENDS** `probe/reach.mts`, and §6 states when it runs and why it is deliberately not a CI gate.
- **UNCHANGED and load-bearing:** `tests/specLint/_metaPureCore.test.ts`. It walks `lib/specLint/`
  recursively with a walker floor and pins that no core file imports `node:fs`,
  `node:child_process`, or `node:process`. Nothing here needs raw output, so it stays green; if a
  draft ever reaches for the child's stdout, this is the test that reds.
- **NO new registry surface.** `redContract` is already enrolled. `expectedLedgerKinds.ts:137` is
  touched only if the accepted-row COUNT changes, which it should not.
- Advisory-lock topology: N/A, no `pg_advisory*` in scope.

## 2. The purity boundary, and why the repair sits inside it

`deriveCollectionProbe` and `collectionProbePlan` are pure functions over parsed text. The change adds
a union member and a detail string, so it stays pure by construction. The adapter is untouched: no new
information crosses the boundary, because the decline is derived from the COMMAND, which the core
already has.

## 3. Citation lifetime — this plan's own execution moves its own red-target

**Round 4 corrected this section, and the correction matters more than the original claim.** Earlier
drafts said line 717 was above the edit and therefore unaffected. That was WRONG. The edit does not
begin at the drop: `ProbeDerivation` and `CollectionProbeEntry` each gain a union member, and both sit
above every other line this plan cites.

**Round 4's PREDICTION, kept as a record and NOT re-pinned.** A read-only probe applying only the two
required additions measured this, and it was right about the direction and short about the distance,
because it modelled two one-token additions rather than the shipped change:

```
CollectionProbeEntry   610 -> 614
deriveCollectionProbe  637 -> 644
the v1 exit            717 -> 721
the none drop          721 -> 725
```

**What actually landed, re-derived at HEAD by `pnpm probe:citations` after implementation:**

```
ProbeDerivation        605 -> 613
CollectionProbeEntry   610 -> 621
deriveCollectionProbe  637 -> 648
the v1 exit            717 -> 742
the none drop          721 -> DELETED
VITEST_SHAPE           580 -> 580   (the only survivor, as predicted)
```

The distance is larger than the prediction because each added union member carries a comment
explaining why it exists, and the drop is gone rather than moved for the reason §0 records. Six of the
ten table rows were stale when the probe first ran on the changed tree, which is the whole argument
for the probe: **reasoning about which lines move is exactly where four review rounds went wrong.**

So EVERY citation into `lib/specLint/redContract.ts` below line 580 goes stale, not just the
`red-target=`. `RED_TARGET_INVALID` sees none of it: it checks that the path is tracked and the line
is in range, not that the line still holds what the prose says.

**The closeout therefore re-reads a LIST, not a citation.** Every site below, by READING the line
rather than confirming it resolves. The rows marked DERIVED are covered by `pnpm probe:citations`;
the rest are bare prose references carrying no file, and they stay a manual re-read:

| site | what it cites | covered by |
| ---- | ------------- | ---------- |
| the `red-target=` in Task 1's marker | the repair line | DERIVED |
| §0's verification table, all ten rows | every structured citation this plan makes | DERIVED |
| the spec's §1.1, §2, §3 and §5.3 citations | the v1 exit, `VITEST_SHAPE`, `probesToSpawn` | DERIVED |
| Task 1's prose after the assertion table | the v1 exit | prose, manual |
| Task 2's edit map fenced block | the lines this arc edits | prose, manual |
| `probe/reach.mts`, the V1 block comment | the v1 exit and the drop | prose, manual |

`VITEST_SHAPE` is the only citation above the edit point and the only one that survived untouched,
which is why it is the one row of the ten whose number is unchanged. It is named by SYMBOL here
rather than by number, because a sentence about which lines move should not itself carry one.

**The re-read is a COMMAND, not a habit.** `pnpm probe:citations` parses §0's table out of this plan
and asserts that every cited line still CONTAINS the content the table claims. It is a command because
this defect recurred through four review rounds, and because round 4 measured that reasoning about
which lines move is exactly where it goes wrong. Reasoning is replaced by a read.

It found two stale citations on its first run, both of which had survived every spec and plan round:
`lib/specLint/run.ts:151` was cited five times across the spec and this plan as holding the gating
condition, and it holds `const collectionFindings =`; the condition is at 152. The other was a
markdown artifact, an escaped pipe and an elision in a table cell, which is why a cell now quotes a
literal substring and never an abbreviated one.

Three mutations demonstrate it can fail: bumping a cited line number, corrupting a claimed content
string, and pointing it at a document with no table, which trips its parse floor rather than reporting
a clean run over zero rows.

**Completeness is DERIVED, not enumerated.** The probe also scans this plan, the spec, and
`probe/*.mts` for every path-and-line citation into `redContract.ts` and fails on any that is not a row in §0's
table. That is what closes round 5's question mechanically for the structured citation form: an
earlier hand-written site list covered this plan and `probe/reach.mts` and omitted the SPEC entirely,
including the only citation of line 906. A hand list gets it wrong again the next time someone adds a
citation; a derivation does not.

**What the derivation does NOT cover, stated so nobody reads the command as total:** bare prose
references of the form "line 717", which carry no file and cannot be resolved mechanically. §3's table
below lists those sites and they stay a manual re-read.

## 4. The cycle the red-carrying task runs, stated once

1. Write the failing case. Run it. **Read the failure text** and confirm it fails on the VALUE the
   task names, not on a missing symbol, a bad path, or a collection that found nothing.
2. Make the minimal change.
3. Re-run. Confirm green, and confirm the paired negative in the same task is still green.
4. `pnpm exec tsx scripts/spec-lint.ts --json <this plan>` and report the result.
5. Commit.

**Task 2 does not run this cycle and is not meant to.** It carries no `red=`, for the measured reason
its own section gives, and its acceptance is stated there instead. This section is headed for the
red-carrying task rather than for every task, because the universal form was false.

Step 1's read is not ceremony. This arc exists because a red that exits non-zero for the wrong reason
looks identical to one that exits non-zero for the right one, and the task below carries an authored
red that no one will ever watch fail again.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the unprobeable drop reports, and only where the design says it does

<!-- task: red=`pnpm vitest run tests/specLint/cli.test.ts tests/specLint/redExec.test.ts tests/specLint/redContract.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:664` why=`collectionProbePlan continues past a kind none derivation, so the three new unprobeable fixture plans produce no plan entry and the CLI returns a code list with no RED_PROBE_UNVERIFIED where the new cases require it by name, and at the unit level the six non-vitest-shaped commands derive no entry at all where the flipped cases require a declined entry naming not-vitest-shaped` ac=AC-1,AC-2,AC-3,AC-4 -->

**Round 1 collapsed this from two tasks into one, and the reason is invariant 1.** The earlier draft
made the partition assertion its own task. But the repair is indivisible: once the `none` derivation
routes to the decline path, the fifteen gain the advisory AND the sixteen stay silent in the same
change. A second task authored afterwards would be GREEN the moment it was written, which is a task
whose acceptance condition is that it cannot fail. The plan's own §4 already said both directions
belong in one cycle; the split contradicted it.

**What is red and why.** `if (derived.kind === "none") continue;` drops the entry entirely, so any v2
marker whose command is not vitest-shaped at the anchor draws neither a FAIL nor an advisory. The new
cases run the CLI over the new fixture plans with `--exec-red` and assert `RED_PROBE_UNVERIFIED` by
name in the returned code list. Today that list lacks it, so the failure is on a VALUE the
implementation must PRODUCE, not on a missing symbol, a bad path, or a collection that found nothing.

**Baseline, so an implementer knows whose failure it is.** Both suites are GREEN at handoff:
`tests/specLint/redExec.test.ts` reports 87 passing and `tests/specLint/cli.test.ts` is green. A red
in either on arrival is yours, not inherited.

**Mechanism, fixed by the spec rather than left open.** `none` gains a third `skipped` reason
(`"not-vitest-shaped"`) and rides the decline path that already ships: `ProbeDerivation` and
`CollectionProbeEntry` each gain the union member, `collectionProbePlan` pushes instead of
continuing, and `synthesizeCollectionFindings` needs no edit at all, because its `skipped` branch
already emits `RED_PROBE_UNVERIFIED`. An implementation that instead adds a `pnpm heavy` recognizer to
narrow the reach to nine is forbidden by spec §2 and fails the negative half below.

**Reachability.** The path is reached only under `--exec-red`: `lib/specLint/run.ts:152` calls
`synthesizeCollectionFindings` only when probes are non-null. Every case passes the flag, or it
passes while proving nothing.

**Five assertions, all in this one cycle: three red today and two green today.** Both kinds are
required. The red ones alone are satisfied by an implementation that emits the advisory
unconditionally, and the green ones alone are satisfied by changing nothing at all.

| # | fixture | assertion | today |
| - | ------- | --------- | ----- |
| 1 | heavy-wrapped v2, `red-state=authored` | code list CONTAINS `RED_PROBE_UNVERIFIED` | **RED** |
| 2 | non-heavy unprobeable v2 (`sh -c` grep), `red-state=authored` | code list CONTAINS `RED_PROBE_UNVERIFIED` | **RED** |
| 3 | live unprobeable v2 whose red exits 0 | code list contains BOTH `RED_ALREADY_GREEN` and `RED_PROBE_UNVERIFIED` | **RED** |
| 4 | heavy-wrapped v1 (no `red-state=`) | code list does NOT contain `RED_PROBE_UNVERIFIED` | green, and must STAY green |
| 5 | `exec-genuine-red.md`, `exec-collects-nothing.md` | verdicts unchanged, byte for byte | green, and must STAY green |

Row 2 is what fails the narrowed implementation: a fixture set holding only the heavy-wrapped shape is
satisfied by a `pnpm heavy` recognizer. Row 4 is what fails the over-broad one that also moves the v1
exit at line 742, cited here in prose rather than in the table itself. Row 3 is what fails an
implementation that files `none` behind the live gate.

**The advisory is ADDED, never exclusive.** Spec §1.2 measured three of the fifteen live markers
already carrying a hard finding from an unrelated arm. Every assertion above is CONTAINMENT, never
list equality. Equality would be false at three live markers and would push the implementation toward
suppressing findings this change has nothing to do with. Row 3 makes that explicit rather than
implicit.

**No new code is minted.** `RED_PROBE_UNVERIFIED` already exists and already means collection
capability unverified.

**This task is not done until the corpus-level oracle passes.** See §6. `pnpm probe:reach` must pass
in default mode before the change and in `EXPECT_ADVISORY=1` mode after it, and both invocations are
steps of this task, not closeout decoration.

<!-- tasks: end -->

## Task 2 — the score (OUTSIDE the red-contract region, no marker, stated acceptance)

**It carries no `red=` deliberately, and the reason was measured rather than assumed.** An earlier
draft had a re-key task whose red was the gate reporting an unaccepted survivor at the new key
alongside a stale row at the old. That red cannot fire:

```
accepted-row lines : 37  110  127  190  191  257  257
this arc edits at  : 613, 621 and 648 in redContract.ts, plus the deciding suites
```

Every accepted row sits ABOVE the edit point, so none shifts. A registry edit asserting a red rather
than observing one is the manufactured-red shape, and it belongs outside the region with stated
acceptance. `BL-MUTATION-SITEID-LINE-KEYED-CHURN` (`BACKLOG.md:1428`) is the governing precedent,
cited so the chain is visible, and the honest result is that this arc does not trigger it.

**Still owed, and none of it is a red:**

- Re-measure ONCE, after the last source-or-suite edit. Editing `redContract.ts` retires the current
  score, and so does editing any deciding suite, so measuring earlier retires the number for nothing.
- **Re-VALIDATE all seven `equivalent` rows even though they are unshifted.** Not needing a re-key is
  not evidence the premise still holds, and this arc adds a branch.
- `pnpm mutation:sites` LAST before any push touching the enrolled source, confirming mechanically
  that the seven keys still resolve to the same expressions rather than inferring it from arithmetic.
- Acceptance: floor 0.95 met, unaccepted-survivor set EMPTY, `expectedLedgerKinds.ts:137`
  (`redContract: { equivalent: 7 }`) unchanged, stamped inputs hashed before and after INSIDE the
  measuring invocation.
- `pnpm mutation:guards` is a heavy phase and runs under `pnpm heavy` per AGENTS.md.

## 5. Fixture work, and what it does NOT need

Fixture PLANS live at `tests/specLint/fixtures/redVerdict/docs/superpowers/plans/`; the suites their
`red=` commands run live at `fixtures/specLint/redVerdict/`, deliberately OUTSIDE `tests/` because
every project glob in `vitest.projects.ts` is rooted at `tests/**`.

This arc needs **no new suite at all**: an unprobeable `red=` never reaches one, which is the whole
point of the blind spot. So the fixture work is four new PLAN documents:

| fixture | shape | proves |
| ------- | ----- | ------ |
| heavy-wrapped v2 | `pnpm heavy pnpm vitest run …` | AC-1, the motivating class |
| non-heavy unprobeable v2 | `sh -c "grep -q …"`, `red-state=authored` | the narrowed implementation the spec forbids fails here |
| live unprobeable v2, red exits 0 | `sh -c "true"`, `red-state=live` | the advisory coexists with `RED_ALREADY_GREEN` (§1.2) |
| heavy-wrapped v1 | no `red-state=` | AC-4's silent half |

Three v2 shapes rather than one, because a fixture set holding only the heavy-wrapped shape is
satisfied by the narrowed implementation the spec forbids.

**The broken-by-design fixture fan-out does not apply.** No syntactically invalid file is added, so
nothing needs excluding from `tsconfig.json`, the eslint ignore list, or `.prettierignore`.

## 6. The corpus oracle: when it runs, and why it is deliberately NOT a CI gate

Round 1's second blocking finding was that `probe/reach.mts` was cited as the closed criterion and
then never scheduled: no task command and no package script invoked it, so every declared command
could pass without the criterion being satisfied. A criterion nothing runs is a description.

**It is scheduled at three sites.**

1. A package script `probe:reach`, with body `node --import tsx probe/reach.mts`, so the oracle is
   invocable by name rather than by remembering an interpreter flag. Its sibling `probe:citations`
   (body `node --import tsx probe/citations.mts`) is added in the same commit, per §3.
2. Two explicit STEPS of Task 1, not closeout decoration. `pnpm probe:reach` passes in default mode
   before the change; `EXPECT_ADVISORY=1 pnpm probe:reach` passes after it. Before the change the
   second must FAIL on all fifteen v2 lines, and observing that failure is how the implementer knows
   the corpus-level red is real rather than assumed.
3. A closeout obligation in §8, re-run after the last source edit.

**It is NOT a CI gate, and that is a decision rather than an omission.** The oracle asserts against a
DATED corpus snapshot: thirty-one named `file:line` pairs. Any ordinary edit to one of those
thirty-one documents moves a line and fires `MARKER_DRIFT` — which is exactly the behaviour that makes
it a good acceptance instrument and a terrible standing gate. As CI it would fail on edits that have
nothing to do with this arm, and the repair would be to re-pin it, which trains everyone to re-pin it,
which is how a gate stops meaning anything.

**What protects the behaviour permanently is the fixture set, which DOES run in CI.** The division is
deliberate: the oracle proves the corpus-level claim ONCE, at implementation time, over real
documents; the five assertions in Task 1, over six unique fixture documents (four new ones plus the
two pre-existing ones row 5 re-runs), pin the behaviour forever over documents this repo controls. Neither substitutes for the other, and saying so here is cheaper than a reviewer deriving it.

## 7. Acceptance criteria → the task that PROVES each

| AC | claimed by | note |
| -- | ---------- | ---- |
| AC-1 | Task 1, row 1 and row 2 | the advisory fires on an unprobeable v2 marker, in both shapes |
| AC-2 | Task 1, row 5 | probeable markers unaffected, verdicts identical |
| AC-3 | Task 1, §6 step 2 | no hard finding added, asserted over the real population by the oracle |
| AC-4 | Task 1, row 4 + §6 step 2 | the fifteen/sixteen partition. The fixture half pins it in CI; the oracle half asserts it over the real thirty-one |
| AC-5 | **no task, stated not omitted** | satisfied by `probe/population.mts` and `probe/reach.mts`, both committed with the spec |

Every AC is claimed by a marker or carries a written reason for not being. An unclaimed AC reads as an
oversight even when it is not.

**AC-1 through AC-4 land on one task on purpose, and AC-5 lands on none.** Round 1 established that the repair is indivisible, so
splitting the criteria across tasks would only recreate the ordering defect at the level of the
acceptance table.

## 8. Disposition: the plan stage closed by RULING, and one residue is NAMED not closed

Four counted rounds, nine findings, **none refuted**. No round returned APPROVE. The orchestrator
closed the stage DISPOSITIONED at the cap. **Not CONVERGED**, and the distinction is recorded rather
than smoothed over: a fifth confirming round was authorized and never ran, because the Codex API hit
its weekly limit before it could be dispatched.

**The design was settled at round 1** and confirmed by every round after it. What kept moving was
whether the plan's promises would actually reach the tree that lands, asked one layer deeper each
round: the oracle was named and never scheduled (R1), scheduling it before the commit was not enough
because `lint-staged` rewrites the tree (R3), and the citation list was under-scoped because the edit
begins above every cited line (R4).

**NAMED RESIDUE, for the implementation's whole-diff review to attack when the wall lifts.** This was
round 5's closed set and it did not get its read:

1. **Is §3's site list complete for the PROSE form?** The structured form, a path with a line
   number, is now derived and checked by `pnpm probe:citations`. Bare references
   like "line 717" carry no file and cannot be resolved mechanically, so §3's table lists them by
   hand, and a hand list is what was wrong before.
2. **Is §8's closing fixpoint actually closed?** Is there an ordering in which the tree that lands is
   not the tree that passed?

**Two repairs ship without a review round having read them:** the citation probe with its completeness
derivation, and the five corrected `run.ts:151` citations. What verifies them is mutation rather than
opinion, the same standard the reach oracle was held to. The probe's own first draft carried a
DEAD-row check that could never fire, because a table row is itself an occurrence of the citation it
declares; that half was removed rather than worked around.

## 9. Obligations before dispatch

- Run `pnpm spec:lint` on this plan and report the result. This arc's own arm reads it.
- Add the `probe:reach` and `probe:citations` package scripts in the same commit as Task 1, per §6 and
  §3. Without them the plan cites criteria no command can invoke, which is the defect round 1 found.
- **Verify the COMMITTED tree, not the pre-commit tree.** `simple-git-hooks` runs `lint-staged` on
  every commit, which applies `prettier --write` and `eslint --fix` to staged sources and
  `prettier --write --ignore-unknown` to staged Markdown and JSON. The wiring is the
  `simple-git-hooks` and `lint-staged` blocks of the repository-root package manifest, named without a
  line citation on purpose: the bare filename matches three tracked files and the arm reads it as
  `CITATION_AMBIGUOUS`, while a `./` prefix is an illegal path. So a commit can MUTATE the tree after
  any check that ran before it, and round 3 found both closing obligations open to exactly
  that: the tree that passed the oracle need not be the tree that landed, and a formatter-induced line
  shift can invalidate a `red-target=` that was corrected moments earlier. The closing sequence is
  therefore ordered so the hook cannot invalidate it:

  1. `pnpm exec prettier --write` and `pnpm exec eslint --fix` over everything the closing commit will
     stage, so the hook has nothing left to change.
  2. Make the closing commit.
  3. **On the COMMITTED tree**, run `EXPECT_ADVISORY=1 pnpm probe:reach` and `pnpm probe:citations`,
     then manually re-read the prose sites §3 lists that no table row covers.
  4. If ANY of the three fails, repair and `--amend`, then return to step 3. It is a fixpoint, not a checklist:
     the obligation is that the tree which lands is the tree that passed, and only a check run after
     the commit can establish that.

  Step 3 must run after every source edit, including any prompted by Task 2's mutation validation. §6
  names this the oracle's third scheduling site; round 2 found the site named and never written, and
  round 3 found that writing it before the commit was not enough.
- The plan's single `red=` is not `pnpm heavy`-wrapped and IS vitest-shaped at the anchor, so it sits
  inside the arm's sighted domain rather than demonstrating the blind spot. The oracle invocation is
  NOT a second red and is not a marker command: `EXPECT_ADVISORY=1 pnpm probe:reach` runs commands
  the arm cannot derive a probe from, which is the very class this arc repairs, and it is scheduled as
  a step in §6 rather than declared as a marker red. Before the change those commands derived a
  reasonless decline the plan dropped; after it they derive `not-vitest-shaped` and are reported.
- Re-read EVERY citation in §3's table at closeout, not just the `red-target=`. Round 4 measured that
  the union-member additions at `ProbeDerivation` and `CollectionProbeEntry` shift every cited line
  below them, so a closeout that re-reads only the marker lands a tree with stale citations everywhere
  else, including a comment inside `probe/reach.mts`. Measured at implementation: SIX of the ten rows
  were stale, and the `probe/reach.mts` comment was one of them, exactly as predicted.
- No fenced block carries an em-dash: `FENCE_EM_DASH` is a plan-fence rule and
  `tests/docs/planFencesBaseline.ts` is a DECREASE-ONLY ratchet, so a new hit fails unlisted.
- `pnpm typecheck` before push. It was red on this branch for two rounds because `tsx` resolved an
  import the compiler rejects, and no review round could have seen it.
