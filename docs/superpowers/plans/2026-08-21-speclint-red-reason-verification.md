# Plan — the unprobeable-command silent drop in the red-contract collection arm

Spec: `docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md` (canonical;
every § reference below is to it). Ledger row: `BL-SPECLINT-RED-REASON-VERIFICATION`.

`collectionProbePlan` discards every v2 marker whose command it cannot derive a collection probe
from, emitting neither a finding nor a plan entry. Fifteen live markers land there. The repair routes
that derivation through the decline path that already ships, so the entry draws the existing
`RED_PROBE_UNVERIFIED` advisory. No new finding code, no new predicate, no new severity decision.

impeccable-gate: N/A — no UI surface

Every file this plan touches is under `lib/specLint/`, `probe/`, `tests/`, or `fixtures/`; nothing
under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. The marker sits
on its own line because the gate reads the LINE.

---

## 0. Pre-draft code-verification pass — authored AND RUN

Every citation below was READ, not merely resolved. The distinction matters here because two of them
name lines this plan's own execution will move.

| citation | what the line holds |
| -------- | ------------------- |
| `lib/specLint/redContract.ts:717` | `if (state === null) continue; // v1: no declared state to probe against` |
| `lib/specLint/redContract.ts:721` | `if (derived.kind === "none") continue;` |
| `lib/specLint/redContract.ts:580` | `const VITEST_SHAPE =` |
| `lib/specLint/redContract.ts:637` | `export function deriveCollectionProbe(` |
| `lib/specLint/run.ts:151` | `doc.kind === "plan" && probes !== undefined && probes !== null` |
| `lib/specLint/taskContract.ts:49` | `const V2_FIELDS = "( red-state=(live\|authored))?…"` |
| `tests/mutation/source/expectedLedgerKinds.ts:137` | `redContract: { equivalent: 7 },` |

`ProbeDerivation` is declared at `lib/specLint/redContract.ts:605` and `CollectionProbeEntry` at
`lib/specLint/redContract.ts:610`. The `skipped` reason union is
`"compound-command" | "unstrippable-filter"` in both, so a third reason is a two-site type change,
not one. The two lines are named individually rather than as a range: on an arc whose subject is
citation accuracy, "around" is the wrong register.

**Two helpers this plan deliberately does NOT use.** `ownedContractLines` and `wellFormedMarkers` are
not exported. Any probe reconstructing the guard sequence around them would be a MODEL of
`collectionProbePlan` rather than the function itself, which is why `probe/reach.mts` runs the CLI
instead.

## 1. Meta-test inventory

- **EXTENDS** `tests/specLint/cli.test.ts`, specifically the collection-probe describe block opened at
  `tests/specLint/cli.test.ts:837`. The block's title is not quoted here: it carries an em-dash, and
  `COPY_EM_DASH` is a hard finding this arm raises against quoted copy, so a verbatim source title in
  prose reds the very lint this plan is checked by. **This is the declared consumer of the fixture plans**, and it is
  where every claim in this plan is asserted, because every claim is about the CLI path under
  `--exec-red`. Round 1 found the fixtures had no declared consumer; that block is it. Its `execCli`
  helper spawns the real `scripts/spec-lint.ts` and its `codesOf` helper reads the emitted code list,
  which is the VALUE every assertion below is written against.
- **EXTENDS** `tests/specLint/redExec.test.ts` (core synthesis) for the unit-level half.
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

The plan carries exactly ONE `red-target=`, and it names line 721, the line Task 1 edits. Once the
`continue` becomes a push, that line holds something else. The citation is stale by the time the task
that declares it is done.

`RED_TARGET_INVALID` cannot see this. It checks that the path is tracked and the line is in range, not
that the line still holds what `why=` describes. So the citation is RE-READ at closeout, by reading
the line rather than confirming it resolves, and corrected in the closing commit.

The re-read is a STEP rather than a habit, because the arm being repaired here is the one that would
otherwise catch it.

Line 717 is ABOVE the edit and therefore unaffected. It is cited in §0's verification table and in the
Task 1 assertion table at row 4, and those citations survive the change untouched.

## 4. The cycle every task runs, stated once

1. Write the failing case. Run it. **Read the failure text** and confirm it fails on the VALUE the
   task names, not on a missing symbol, a bad path, or a collection that found nothing.
2. Make the minimal change.
3. Re-run. Confirm green, and confirm the paired negative in the same task is still green.
4. `pnpm exec tsx scripts/spec-lint.ts --json <this plan>` and report the result.
5. Commit.

Step 1's read is not ceremony. This arc exists because a red that exits non-zero for the wrong reason
looks identical to one that exits non-zero for the right one, and the task below carries an authored
red that no one will ever watch fail again.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the unprobeable drop reports, and only where the design says it does

<!-- task: red=`pnpm vitest run tests/specLint/cli.test.ts tests/specLint/redExec.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:721` why=`collectionProbePlan continues past a kind none derivation, so the three new unprobeable fixture plans produce no plan entry and the CLI returns a code list with no RED_PROBE_UNVERIFIED where the new cases require it by name` ac=AC-1,AC-2,AC-3,AC-4 -->

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

**Reachability.** The path is reached only under `--exec-red`: `lib/specLint/run.ts:151` calls
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
exit at line 717. Row 3 is what fails an implementation that files `none` behind the live gate.

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
this arc edits at  : 721 in redContract.ts, plus the deciding suites
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

Two v2 shapes rather than one, because a fixture set holding only the heavy-wrapped shape is satisfied
by the narrowed implementation.

**The broken-by-design fixture fan-out does not apply.** No syntactically invalid file is added, so
nothing needs excluding from `tsconfig.json`, the eslint ignore list, or `.prettierignore`.

## 6. The corpus oracle: when it runs, and why it is deliberately NOT a CI gate

Round 1's second blocking finding was that `probe/reach.mts` was cited as the closed criterion and
then never scheduled: no task command and no package script invoked it, so every declared command
could pass without the criterion being satisfied. A criterion nothing runs is a description.

**It is scheduled at three sites.**

1. A package script `probe:reach`, with body `node --import tsx probe/reach.mts`, so the oracle is
   invocable by name rather than by remembering an interpreter flag.
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
documents; the five fixture assertions in Task 1 pin the behaviour forever, over documents this repo
controls. Neither substitutes for the other, and saying so here is cheaper than a reviewer deriving it.

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

**All four ACs land on one task on purpose.** Round 1 established that the repair is indivisible, so
splitting the criteria across tasks would only recreate the ordering defect at the level of the
acceptance table.

## 8. Obligations before dispatch

- Run `pnpm spec:lint` on this plan and report the result. This arc's own arm reads it.
- Add the `probe:reach` package script in the same commit as Task 1, per §6. Without it the plan cites
  a criterion no command can invoke, which is the defect round 1 found.
- **Run `EXPECT_ADVISORY=1 pnpm probe:reach` as the LAST command before the closing commit**, after
  every source edit including any prompted by Task 2's mutation validation. §6 names this as the
  oracle's third scheduling site and round 2 found the site was named and never written. Without it, a
  source repair made after Task 1's own post-change run leaves every other command green while the
  final tree fails the closed criterion.
- The plan's single `red=` is not `pnpm heavy`-wrapped and IS vitest-shaped at the anchor, so it sits
  inside the arm's sighted domain rather than demonstrating the blind spot. The oracle invocation is
  NOT a second red and is not a marker command: `EXPECT_ADVISORY=1 pnpm probe:reach` derives
  `{ kind: "none" }`, which is the very class this arc repairs, and it is scheduled as a step in §6
  rather than declared as a marker red.
- Re-read the single `red-target=` line at closeout per §3.
- No fenced block carries an em-dash: `FENCE_EM_DASH` is a plan-fence rule and
  `tests/docs/planFencesBaseline.ts` is a DECREASE-ONLY ratchet, so a new hit fails unlisted.
- `pnpm typecheck` before push. It was red on this branch for two rounds because `tsx` resolved an
  import the compiler rejects, and no review round could have seen it.
