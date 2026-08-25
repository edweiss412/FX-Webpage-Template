# Plan — price the source-mutation shard partition in seconds

**Spec:** `docs/superpowers/specs/ci/2026-08-25-mutation-shard-weight-seconds-design.md`
**Row:** `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` · **Branch:** `fix/mutation-shard-weight-seconds`

impeccable-gate: N/A — no UI surface

## What is already on the branch, and why the plan starts where it does

The measurement instrument (`lib/mutationWeight/{records,weights}.ts`,
`scripts/mutation-shard-weight-report.ts`), its suite
(`tests/mutationWeight/instrument.test.ts`), its plant harness
(`scripts/mutation-weight-plant.mjs`) and its two registry rows all landed during the
spec phase. That was not optional: every figure in the spec comes out of that
instrument, so it is a spec input, and spec review found four defects in it across two
rounds. Shipping it without tests or enrolment would have left an invariant-1 P0
standing on the branch that no later plan could cure.

**Sizes are commands, not numbers.** Every count below was retyped once and was wrong
within a day. Plan review round 1 found this document claiming 28 instrument cases
while the suite held twice that, and giving three different plant totals in three
different sentences. A count that invalidates itself on the
next commit is stored as the command that recomputes it:

| quantity | command |
| --- | --- |
| instrument cases | `pnpm vitest run tests/mutationWeight/instrument.test.ts` |
| planted defects, and how many escaped | `node scripts/mutation-weight-plant.mjs` |
| registry rows | `pnpm tsx -e 'import("./tests/mutation/source/registry").then(m=>console.log(m.GUARD_SURFACES.length))'` |

Observed at `75e63a2a2`: 56 cases, 37 plants with 0 escaped, 45 rows. That is a dated
observation of what those commands printed, not a claim this document maintains.

So the plan below starts at the weight change itself. Tasks that touch the instrument
EXTEND an existing suite and an existing plant list rather than creating them.

## Earning RED on code that already exists

For a task on existing code, "write a failing test" is unavailable: a test written
against working code passes on its first run and proves nothing. Every such task instead
earns its RED by **adding the planted defect to `scripts/mutation-weight-plant.mjs`
FIRST**, watching that harness report ESCAPED, then adding the assertion and watching it
report CAUGHT. The harness is the RED signal, and it already refuses to score an
unapplied plant or a non-compiling mutant as a pass.

Tasks on code that does not exist yet are ordinary test-first.

### How a plant is declared, and why two forms are needed

Two consecutive review rounds landed on plant coverage, so this is stated once as a rule
rather than repaired instance by instance. The harness substitutes literal text: it counts
occurrences with `text.split(from)` and rewrites with `text.replace(from, to)`, and it
refuses anything that does not occur exactly once. A prose description of a defect is
therefore not a plant, and neither is an anchor phrased as an ABSENCE — an anchor saying that a
surface is missing from the seed cannot occur exactly once, because it does not occur at
all.

**Form A, for a defect in code that exists NOW.** The literal `from` and `to` strings are
given in the plan and can be pasted into the harness unchanged. Every Form A entry in this
document has been checked against the live file for exactly-one occurrence.

**Form B, for a defect in code THIS TASK CREATES.** No literal anchor can honestly be
given at plan time, because the text it must match does not exist yet and any string
written now is a guess that will not match. A Form B entry declares the DEFECT, the SUITE
that must catch it, and nothing else. The literal pair is written during implementation,
when the code is there to anchor against, and the task's GREEN is not satisfied until
`node scripts/mutation-weight-plant.mjs` reports CAUGHT for it.

Form B is weaker at plan time and that is honest rather than convenient: it is
plan-time-uncertifiable by construction, so the certification moves to the task's own
GREEN where it can actually be run. What is NOT acceptable, and what both those rounds
correctly rejected, is prose in the `from` column dressed as a literal — that reads as a
certified plant while being unpasteable.

A fixture plant is Form A whenever the fixture is committed by an earlier task, because a
JSON value is a literal like any other: `"millisPerBoot": 41200` is a perfectly good
anchor. It is Form B only when the fixture itself is new in the same task.

**Task 1 exists because that mechanism did not reach two of the tasks that depend on
it.** The harness resolves its target and its suite from two hardcoded constants
(`scripts/mutation-weight-plant.mjs:27-28`), so a plant aimed anywhere outside
`lib/mutationWeight` reports ANCHOR-FAIL rather than exercising anything. The
pricing task and the drift task both plant outside it. Generalising the harness is therefore the first task rather than
an aside, and it is sequenced before any task that plants through it.

## Pre-draft code-verification pass

| claim | verified at |
| --- | --- |
| `bootsOf` holds the expression at `tests/mutation/source/shardPartition.ts:45`, and `weightOf` wraps it at `tests/mutation/source/shardPartition.ts:53` | both by `grep -n` |
| `validateSurface` returns a problems list and range-guards a numeric field already | `tests/mutation/source/registry.ts:56` |
| the plant harness hardcodes both its source dir and its suite | `scripts/mutation-weight-plant.mjs:27` and `scripts/mutation-weight-plant.mjs:28` |
| the `reject` helper exists at `tests/mutation/_metaGuardSurfaceRegistry.test.ts:35`, and `tests/mutation/_metaGuardSurfaceRegistry.test.ts:41` runs it over every row | both by `grep -n` |
| `sourceShardPartition`'s control anchor sits INSIDE the body task 3 rewrites | `tests/mutation/source/registry.ts`, row `sourceShardPartition` |
| that row already documents the self-consistent-mutant trap for constants | same row's comment |
| `lptAssign` documents integer arithmetic | `tests/parser/mutation/shardPartition.ts:17` |
| the env mapping is pinned at `tests/mutation/_metaSourceShardIntegrity.test.ts:274` and the whole `run:` command at `tests/mutation/_metaSourceShardIntegrity.test.ts:282`, both by equality | both by `grep -n` |
| `check-shard-budget.ts` deliberately decides nothing and takes env, not argv | that file's header |
| the `budget` job's only step runs the budget checker | `.github/workflows/mutation-harness.yml:280` |
| the workflow's PR path filter names `scripts/check-shard-budget.ts` but nothing under `lib/mutationWeight` | `.github/workflows/mutation-harness.yml:43-53` |
| `mutationWeightWeights` carries `scoreFloor: 0.9` | `tests/mutation/source/registry.ts:3302` |
| no file under `lib/` imports `tests/` | `rg` over `lib/` |
| enrolling a surface owes TWO further registrations | `tests/mutation/source/expectedLedgerKinds.ts` (per surface) and `tests/mutation/_metaPremiseContract.test.ts:32` (per suite) — both caught this arc by failing |

Line numbers are drafting-time locators and rot at every merge; each is anchored to a
searchable symbol beside it, and re-verified only when the claim it supports is in
question. The known limit of a line-form citation is that it is checked for being
in range, never for what is at it, so closeout re-verifies by READING each line and
matching it to the symbol its `why=` names.

## Meta-test inventory (mandatory declaration)

**Creates:** none. **Extends:** four, and every one of them is a registry this arc
already had to satisfy, which is why they are named rather than discovered later.

| meta-test | what this arc adds to it |
| --- | --- |
| `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | `millisPerBoot` range arms in the existing `reject(patch)` harness |
| `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` | two rows in `expectedLedgerKinds.ts`, already landed |
| `tests/mutation/_metaPremiseContract.test.ts` | one per-suite env-touching count, already landed |
| `tests/mutation/_metaSourceShardIntegrity.test.ts` | the drift step's `env:` mapping, its whole `run:` command, and its `if:` condition, all pinned by equality |

**Not applicable, declared rather than omitted:** no advisory-lock topology (the diff
touches no `pg_advisory*`), no layout-dimensions task and no transition inventory (no
UI surface), no e2e harness (no Playwright), and no Supabase call boundary.

**One guard outside this arc must be extended at merge, and it is named here so it is
not discovered in CI.** `#881` added a scratch-root cleanup meta-test,
which pins a DERIVED subject list of every deciding suite that creates a scratch root.
`tests/mutationWeight/instrument.test.ts` calls `mkdtempSync`, so it joins that
derivation and must be added to the pinned list in sorted position. The guard is
walked-population by design: it reds on THIS branch because of a merge from another,
and that is the guard working, not a conflict.

## Mutation-family closure (mandatory for guard work)

The closure set the review converges against is the SIX declared operators — the whole
of `OPERATOR_NAMES`: `relational-boundary`, `equality-flip`, `logical-connector`,
`integer-literal`, `regex-quantifier-bound`, `statement-removal`. Both surfaces this arc
enrols take `[...OPERATOR_NAMES]`, not a scoped subset, so no operator's sites go
unscored while the number still reads as the surface's score.

A reviewer-proposed NEW family is admissible only with a live escaping mutant
demonstrated against the shipped guard. The hand-authored plant list in
`scripts/mutation-weight-plant.mjs` is a SEPARATE instrument with a different purpose —
it proves the SUITE discriminates, where the registry proves the SOURCE is pinned — and
its defects are not a claim about operator coverage.

## Reconciliations, RUN at plan time and pasted

Not "a check to perform later". These are the outputs, today, on the live tree.

**Registry against the seed table** — the input to Task 2:

```
GUARD_SURFACES rows: 45
seed table rates:    43
rows with NO seeded rate: ['mutationWeightRecords', 'mutationWeightWeights']
seeded rates with NO row: []
```

The two unseeded rows are the surfaces this arc enrolled, which have never been
measured. That is the bootstrap the spec's §2.4.1 describes, and Task 2 below carries
the executable step that closes it — plan review round 1 found that no step did.

**`EXPECTED_LEDGER_KINDS` against the registry** — already reconciled:

```
registry 45, ledger-kinds 45, registry-not-declared [], declared-not-registry []
```

**Every Form A plant anchor, checked for exactly-one occurrence** — the harness refuses
anything else, so an anchor that is not unique is not a plant. Run now, on the live tree:

```
count  file                                       anchor
    1  tests/mutation/source/shardPartition.ts    return mutants.length + surface.accepted.length * (s…
    1  scripts/mutation-shard-weight-report.ts    const boots = bootsOf(s);
    1  scripts/mutation-shard-weight-report.ts    if (missing.length > 0) {
    1  .github/workflows/mutation-harness.yml     SHARD_BUDGET_SECONDS: "3600"
    1  .github/workflows/mutation-harness.yml     run: pnpm tsx scripts/check-shard-budget.ts
    1  tests/mutation/source/registry.ts          scoreFloor: 0.94,
    1  tests/mutation/source/registry.ts          id: "mutationWeightRecords",
```

This sweep is why the immutability plant anchors on `0.94` rather than the `0.9` an earlier
draft used: that string occurs twelve times and would have been refused. Running the check
rather than declaring it is the only way that surfaces.

**Current state of every planned `red=` command:**

```
  task 1  PASSES today: node scripts/mutation-weight-plant.mjs   (no out-of-tree entry declared yet)
  task 2  PASSES today: tests/mutation/_metaGuardSurfaceRegistry.test.ts
  task 3  PASSES today: tests/mutation/source/shardPartition.test.ts
  task 4  PASSES today: tests/mutationWeight/instrument.test.ts
  task 5  ABSENT:       tests/ci/rateDrift.test.ts
  task 6  ABSENT:       tests/mutation/_metaPreexistingSurfaceImmutability.test.ts
  task 7  FAILS today:  the score run, below its floor (dated observation in the marker)
```

The count is derived rather than asserted, because asserting it is the class this document
has already got wrong twice:

```
$ grep -o '<!-- task: [^>]*red-state=[a-z]*' <this file> | grep -o 'red-state=[a-z]*' | sort | uniq -c
      6 red-state=authored
      1 red-state=live
```

Every `authored` marker names the production line whose absence or defect makes its new
case fail, verified by READING that line rather than by confirming it resolves. The single
`live` marker is Task 7, whose command the tree fails today.

## The acceptance criteria these tasks discharge

Restated here rather than left as bare ids in the task markers, so a reader can check a
task against its criterion without opening the spec. The spec is authoritative for the
wording; this is the index.

| id | what it requires | discharged by |
| --- | --- | --- |
| **AC-1** | Verdict neutrality over three populations that are not one population: untouched surfaces keep every verdict, `sourceShardPartition` keeps no unaccepted survivor and its floor, and the two newly enrolled modules meet their floor with no prior verdict to compare. Both sides of the comparison come from the same trigger. | Task 4 makes the evidence PRODUCIBLE; closeout produces it, and the reason that half is not a task is argued there |
| **AC-2** | The partition stays total and disjoint over whatever registry size is live at merge. | Task 3 |
| **AC-3** | On every held-out pair, the binding leg under the seconds-calibrated weight is at or below the shipped model's on the same target and the same scored population. | Task 3 |
| **AC-4** | A surface cannot enrol without a rate: absent fails to compile, and out-of-range fails a named test. | Task 2 |
| **AC-5** | The drift report names every measured surface, marks which are actionable, keeps declared-but-unmeasured and measured-but-undeclared distinct, and changes no exit status. | Task 5 |
| **AC-6** | Every weight handed to `lptAssign` is an integer, so its documented platform-independence stays true. | Task 3 |
| **AC-7** | No verdict-deciding input moves for a surface enrolled before this diff. | Task 6 proves it against the merge base; Task 7's triage runs under that guard |

<!-- tasks: depth=2 red-contract -->

## Task 1 — the plant harness reaches outside `lib/mutationWeight`

<!-- task: red=`node scripts/mutation-weight-plant.mjs` red-state=authored red-target=`scripts/mutation-weight-plant.mjs:27` why=`SRC and SUITE are hardcoded to lib/mutationWeight and instrument.test.ts, so an entry naming a file outside that directory is never copied and readFileSync throws before any anchor is looked for` ac=AC-3,AC-5 -->

**Files:** `scripts/mutation-weight-plant.mjs`.

Three later tasks declare plants on files this harness cannot reach. Until it can, those
plants report nothing, which the harness correctly refuses to score as a pass.

Each defect entry gains an optional target root and suite; existing entries keep their
shape and default to today's two constants, so the declared 37 neither move nor get
rewritten. The harness copies each distinct root it sees and runs the suite the entry
names.

**An unresolvable target must report ANCHOR-FAIL rather than throw, and that is part of
this task rather than a nicety.** The per-entry body is `try`/`finally` with no `catch`
(`scripts/mutation-weight-plant.mjs:267` and `scripts/mutation-weight-plant.mjs:311`), so
today a target outside the copied root dies on an ENOENT from `readFileSync` before any
anchor is examined. Once the harness copies several roots there are strictly more ways
for a target to be unresolvable. A harness whose whole contract is that an unapplied
plant is never scored as a pass should say so in its own vocabulary instead of dying
with a stack trace.

**Plant for this task** — Form A, and its anchor exists on the tree TODAY:

| defect | file | anchor | becomes | suite |
| --- | --- | --- | --- | --- |
| boot count miscomposed | `tests/mutation/source/shardPartition.ts` | `return mutants.length + surface.accepted.length * (suites - 1) + suites;` | `return mutants.length + surface.accepted.length * suites + suites;` | `tests/mutation/source/shardPartition.test.ts` |

**This entry, and not the priced-weight one an earlier draft declared, because a task must
be able to reach its own GREEN.** The priced anchor does not exist until Task 3, so after
generalisation that plant would move from `ENOENT` to `ANCHOR-FAIL` — never to `CAUGHT` —
and Task 1 could not close. The anchor above is `bootsOf`'s current expression, and
`tests/mutation/source/shardPartition.test.ts:43` already asserts the three-suite minus
one-suite delta is exactly 4, which the mutation changes. Both halves of the cycle exist
before this task starts, which is what makes it a cycle.

**RED:** add that entry, then `node scripts/mutation-weight-plant.mjs`. Expect a non-zero
exit from an uncaught `ENOENT` naming a path under the scratch `mutationWeight/`
directory that was never copied. Not `ANCHOR-FAIL` — reaching that line requires the file
to exist.

**GREEN:** the same command. The new entry reports `CAUGHT`, every pre-existing entry
still reports `CAUGHT`, and a deliberately misspelled target reports `ANCHOR-FAIL` with a
zero exit for the suite and a non-zero exit overall.

**Commit:** `test(mutation): let the weight plant harness target files outside lib/mutationWeight`

## Task 2 — `millisPerBoot` becomes a required field, guarded over the whole registry

<!-- task: red=`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:56` why=`validateSurface accepts a surface with no millisPerBoot, so neither the range arms nor the accept-arm at 200000 have anything to exercise` ac=AC-4 -->

**Files:** `tests/mutation/source/registry.ts` (type, 45 rows, `validateSurface`),
`tests/mutation/_metaGuardSurfaceRegistry.test.ts` (arms),
`tests/mutation/_metaSourceShardIntegrity.test.ts` (the constant pin below),
`scripts/mutation-shard-weight-report.ts` (`--seed-rate`).

**Step 1 is a measurement, and it is the first of exactly TWO heavy turns this arc
spends.** The two rows this arc enrolled have never been scored, so no records exist to
derive their rates from, and `--emit-registry` refuses a partial table rather than
inventing them. An earlier draft said these rates come from the final score run — four
tasks later — which is circular: the registry cannot require a field that the run
validating it has not yet produced. So:

```
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm tsx \
  scripts/mutation-score-surfaces.ts mutationWeightRecords mutationWeightWeights
```

records `millisPerBoot` for each, with the run that produced it named beside the value.
**Two turns is the honest count and the plan states it rather than claiming one.** The
bootstrap measures a tree that cannot yet be final (the rate is not applied until Task 3),
and the closing run measures the tree that ships. Neither substitutes for the other.

**Step 2, the seeding, uses named commands and no mythical script.** A previous draft
credited an "insertion script" with exact-once and population-parity checks; no such
script existed, none was in `Files`, and no command ran it. What actually closes the
bootstrap is one flag: `--seed-rate <id>=<millis>`, repeatable, merged into the seed map
BEFORE the completeness check at `scripts/mutation-shard-weight-report.ts:456`, so the
existing refusal still ranges over the merged table and a bootstrap rate must be stated
explicitly rather than defaulted. Population parity is then not a separate script's
promise but the refusal itself: a rate matching no row and a row matching no rate both
fail there.

**Step 3, the arms.** Absent is a compile error, not a test. The runtime arms are rows in
the existing `reject(patch)` harness, and the list is FIVE REJECTS PLUS ONE ACCEPT:

| arm | value | expected |
| --- | --- | --- |
| zero | `0` | reject |
| negative | `-1` | reject |
| not a number | `NaN` | reject |
| non-integer | `1.5` | reject |
| above the budget | `3_600_001` | reject |
| **above the mutant timeout, below the budget** | **`200_000`** | **ACCEPT** |

**That last row is the whole point of the table and it was missing.** Every one of the
five rejects is ALSO rejected by a validator wrongly capped at `MUTANT_TIMEOUT_MS`
(180,000), and every live rate sits far below that cap, so the previous five-arm table
was green under the exact defect the plan claims to fence. The accept-arm is the spec's
own refutation example made executable: two honest 100-second children charged to one
modelled boot give 200,000 ms per modelled boot, which is legitimate and which the
forbidden bound rejects.

**The bound reuses machinery that already exists, and this task adds no pin.** An earlier
draft proposed a new `MAX_MILLIS_PER_BOOT` constant plus a meta-test asserting it matches
the workflow. Both already exist: `SHARD_BUDGET_SECONDS` is exported from
`tests/mutation/source/shardPartition.ts:29`, and
`tests/mutation/_metaSourceShardIntegrity.test.ts:274` already asserts the workflow env
value equals it. So `validateSurface` compares against `SHARD_BUDGET_SECONDS * 1000` using
the existing export, and the drift this task was going to guard against is guarded already.
Inventing the pin would have put a second source of truth beside a working one.

**Requiredness cannot rot silently either.** Changing the field from required to optional
leaves every current row and every runtime arm green, since all 45 rows would still carry
a rate. The guard is therefore compile-time: a `@ts-expect-error` on a surface literal
that omits `millisPerBoot`, which stops compiling the moment the field becomes optional.

**Step 4, the flag gets its own tests, because nothing else exercises it.** `--seed-rate`
carries four obligations: repeatable parsing, merging BEFORE the completeness check,
refusing a rate that matches no row, and refusing a row that no rate matches. None of the
commands above invokes the report CLI at all, so a `--seed-rate` that silently ignored its
argument would leave every named command green while the bootstrap stayed impossible. The
cases drive the CLI directly, beside the existing report tests.

**Plants** — Form B for the flag this task creates, Form A for the refusal it must not
undermine:

| form | defect | file | anchor | becomes | suite |
| --- | --- | --- | --- | --- | --- |
| B | later `--seed-rate` occurrences dropped | `scripts/mutation-shard-weight-report.ts` | written at implementation | written at implementation | report CLI tests |
| B | seeded rates merged AFTER the completeness check | `scripts/mutation-shard-weight-report.ts` | written at implementation | written at implementation | report CLI tests |
| A | completeness refusal disabled | `scripts/mutation-shard-weight-report.ts` | `if (missing.length > 0) {` | `if (false) {` | report CLI tests |

The third is Form A because that refusal exists today at
`scripts/mutation-shard-weight-report.ts:456`. It is the guard the new flag must not
weaken, and planting it proves the MERGED table is still checked rather than merely
assembled.

**The requiredness guard needs `pnpm typecheck`, and the marker's command cannot run it.**
Vitest strips types, so an unused `@ts-expect-error` does not fail
`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` — the directive is
simply invisible to it. Declaring the type case under a Vitest-only command would have left
the requiredness half of AC-4 provable by nothing: making `millisPerBoot` optional would
keep every arm, every plant and every named command green. So the compile-time arm is
carried by `pnpm typecheck`, named explicitly in both steps below, and the marker's command
covers the runtime arms only.

**RED, two commands.** `pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts`
with all six arms added and `validateSurface` untouched: expect the five rejects to fail,
since nothing rejects. Then `pnpm typecheck` with the `@ts-expect-error` case added and the
field still optional: expect it to fail as an unused directive. Then the report CLI cases
with `--seed-rate` unimplemented: expect the flag to be rejected or ignored, and the
completeness refusal still firing for the two enrolled rows.

**GREEN:** all three commands — the Vitest run with six arms passing, `pnpm typecheck`
clean with the field required, and the four flag obligations passing — plus
`node scripts/mutation-weight-plant.mjs` reporting CAUGHT for all three entries above.

**Commit:** `feat(mutation): require a per-surface millisPerBoot and range-guard it`

## Task 3 — price the weight, and bound the binding leg

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:53` why=`weightOf returns bootsOf(surface) with no rate applied, so the delta case sees the bare boot count and the held-out pairs produce identical partitions with equal binding legs` ac=AC-6,AC-2,AC-3 -->

**Files:**

```
tests/mutation/source/shardPartition.ts
tests/mutation/source/shardPartition.test.ts
tests/mutation/source/shardBalance.test.ts        (new)
tests/mutation/source/fixtures/heldout-*.json     (new, three pairs)
```

**The rate change and the binding-leg bound are ONE task because they are one red-green
cycle.** An earlier draft split them and the split was incoherent: the bound's test
asserts a margin that only exists once the rate is applied, so with the rate committed in
an earlier task the bound's declared RED — "before the rate lands" — described a state
that no longer existed at its own starting point. Either the test is written before the
implementation, which is this task, or its red is fictional.

`bootsOf` is already exported with today's expression VERBATIM and `weightOf` already
wraps it; this task makes `weightOf` the product.

**Verbatim is a requirement, not an accident.** `sourceShardPartition`'s registry row uses
`"surface.accepted.length * (suites - 1) + suites"` as its control anchor, and
`validateSurface` rejects a row whose anchor does not occur exactly once. Reformatting
that line breaks enrolment, and the failure reads as an unrelated registry error.

The existing delta case becomes `4 * millisPerBoot`, still derived from the fixture rather
than hardcoded. **Its discriminating power depends on a fixture value, so the fixture
CONSTRUCTS that value rather than hoping for it.** Under a `*`-to-`+` mutant the delta is
`4` instead of `4 * rate`, so the two are distinguishable only when the fake surface's
rate is not 1. `tests/_shared/premise.ts` is explicit that where the environment can be
constructed you construct it rather than writing a premise that reds, so the fixture sets
a distinctive rate outright and `premiseHolds` stands behind it as the executable
statement of why that value matters.

The held-out fixtures: rates seeded from one run, per-surface seconds from a LATER one.

| pair | seed run | scored run | surfaces | seconds-calibrated binding | shipped binding | margin |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `32703467609` | `32822546867` | 42 | 5174s | 6138s | 965s |
| 2 | `32625602788` | `32703467609` | 42 | 5783s | 6974s | 1191s |
| 3 | `32559529251` | `32625602788` | 41 | 5409s | 6569s | 1160s |

**The assertion is STRICTLY less, not at-or-below.** AC-3 states the criterion as a bound,
and a bound is the right shape for a criterion, but before the rate is applied the two
partitions are IDENTICAL and equality satisfies at-or-below. A test asserting only the
criterion passes on the unimplemented tree. That is the shape the red-contract rejects by
name: a guard test that passes the moment it is authored. The fixtures record a strictly
positive margin on all three pairs, so the test asserts the measured fact, which implies
the criterion and can fail. Direction, stated so a sign error cannot pass: the
SECONDS-calibrated binding leg is the SMALLER number on all three.

Two constructions are forbidden and the test pins both: seeding and scoring on one run,
and pricing a seed-unknown surface from the scored run's own rate. The first pair
excludes `controlOutlineResidue`, the third excludes `connectionCensus`, so the exclusion
path is exercised rather than assumed. The expectation comes from the SECONDS FIXTURE, never from
`weightOf` — an expectation derived from the thing under test cannot notice a rate mutant.

New assertion: every weight handed to `lptAssign` is an integer. **It holds by
construction, so it guards the validator rather than the arithmetic.** Both factors are
integers — `bootsOf` counts mutants and suites, and Task 2 rejects a non-integer rate — so
the product cannot be fractional and no rounding step is needed. An earlier draft declared
a plant removing a `Math.round` call: that anchor appears nowhere in the implementation
this task specifies, and even if it did, no valid input would distinguish it. What the
assertion actually catches is the validator's integrality arm being weakened later, which
is why it belongs in the suite even though it cannot fail today.

**The consumer that reads a weight as a boot count is pinned here, because it was already
wrong.** `modelledFrom` in the report called `weightOf` and treated the result as raw
boots, under a comment noting the two agree "until the rate multiplies it" — which is this
task. Repaired at `75e63a2a2` to call `bootsOf`; the assertion that keeps it repaired runs
the report's own reconciliation over a registry whose rate is not one, then requires
the recovered mutant count to match. Without it the repair is a comment.

Also here: a source-scan assertion over two stale strings in
`tests/mutation/source/shardPartition.ts`. Its header claims the partition has no
committed weight table, which this task makes false, and it attributes the short-circuit to
`runAllSuites` — a name that exists nowhere in the repository. The behaviour it describes is
real and sits at `tests/mutation/source/runner.ts:218`, but under no such name, so that
citation has been stale independently of this arc.

**The scan is FILE-WIDE for both strings, not header-bounded.** An earlier draft bounded it
to the leading comment and then claimed one of its plants covered a restoration in code
OUTSIDE that boundary, which is a straight contradiction: a header-bounded scan cannot see
outside the header. The boundary description was also wrong on its own terms, since the
header is a run of `//` lines rather than a block comment with opening and closing tokens.
Neither string has a legitimate home anywhere in this file once the claim is false and the
name is absent, so the simple contract is the correct one, and it makes the
outside-the-header plant meaningful instead of self-contradictory.

**Plants** — every assertion above has one:

**Form A entries carry literal anchors verified for exactly-one occurrence on the live
tree. Everything this task itself writes or rewrites is Form B**, including all three
fixture plants, because the fixtures are new here, and all four header plants, because
they act on text this task rewrites.

| form | defect | file | anchor | becomes | suite |
| --- | --- | --- | --- | --- | --- |
| A | consumer reads a priced weight as boots | `scripts/mutation-shard-weight-report.ts` | `const boots = bootsOf(s);` | `const boots = weightOf(s);` | `shardPartition.test.ts` |
| B | rate dropped from the product | `tests/mutation/source/shardPartition.ts` | written at implementation | written at implementation | `shardPartition.test.ts` |
| B | rate added rather than multiplied | `tests/mutation/source/shardPartition.ts` | written at implementation | written at implementation | `shardPartition.test.ts` |
| B | stale weight-table claim restored verbatim | `tests/mutation/source/shardPartition.ts` | written at implementation | written at implementation | `shardPartition.test.ts` |
| B | same claim restored in different case | `tests/mutation/source/shardPartition.ts` | written at implementation | written at implementation | `shardPartition.test.ts` |
| B | `runAllSuites` restored in the header | `tests/mutation/source/shardPartition.ts` | written at implementation | written at implementation | `shardPartition.test.ts` |
| B | `runAllSuites` restored in CODE, outside the header | `tests/mutation/source/shardPartition.ts` | written at implementation | written at implementation | `shardPartition.test.ts` |
| B | seed and score drawn from the SAME run | held-out fixture, pair 2 | written at implementation | written at implementation | shardBalance.test.ts |
| B | an arrival priced from the scored run's own rate | held-out fixture, pair 1 | written at implementation | written at implementation | shardBalance.test.ts |
| B | one seeded rate perturbed until the margin inverts | held-out fixture, pair 2 | written at implementation | written at implementation | shardBalance.test.ts |

**Three of these were prose dressed as literals in an earlier draft and one was worse than
prose.** The header anchors were written in block-comment style (` * `) against a header
that is a run of `//` lines, so they matched nothing and would have reported ANCHOR-FAIL
while reading as certified. The fixture entries described a rate in
prose rather than quoting it, and one named an ABSENCE as the anchor — which cannot occur exactly once
because it does not occur at all. Under the Form A/B rule they are Form B and honest: the
defect and the deciding suite are fixed here, the literal pair is written when the text
exists, and the task's GREEN is not met until each reports CAUGHT.

The perturbation uses pair 2 because it has the narrowest shipped spread (1.541x) and the
largest margin, so it is the pair most able to absorb a perturbation without inverting;
inverting there is the strongest of the three. **The `runAllSuites`-in-code entry is why
the scan is file-wide** — a header-bounded scan cannot see it, and an earlier draft claimed
both at once.

The fixture entries are why Task 1 comes first. Pair 2 is chosen for the inversion because it
has the narrowest shipped spread (1.541x) and the largest margin, so it is the pair most
able to absorb a perturbation without inverting; inverting there is the strongest of the
three. **The eighth row exists because a header-only scan does not, on its own, catch
`runAllSuites` restored in code** — that plant is what proves the assertion covers the
name rather than merely the comment.

**RED:** the marker's command plus `pnpm vitest run tests/mutation/source/shardBalance.test.ts`,
with both suites and all three fixtures committed and `weightOf` still returning
`bootsOf(surface)`. Expect the delta case to see the bare boot count where the fixture's
product is required, and all three pairs to report equal binding legs where a strict
margin was required.

**GREEN:** the same two commands, everything passing with the tabulated margins, and
`node scripts/mutation-weight-plant.mjs` reporting CAUGHT for all ten entries above.

**Commit:** `feat(mutation): price the shard weight in milliseconds per boot`

## Task 4 — the instrument reconciles a priced partition

<!-- task: red=`pnpm vitest run tests/mutationWeight/instrument.test.ts` red-state=authored red-target=`lib/mutationWeight/weights.ts:270` why=`reconcile recomputes the partition with w: v.boots, so a modelled set carrying rates disagrees with legs computed from the priced weight and reports them as moved` ac=AC-1 -->

**Files:** `lib/mutationWeight/weights.ts`, `scripts/mutation-shard-weight-report.ts`,
`tests/mutationWeight/instrument.test.ts`,
`scripts/mutation-weight-plant.mjs`.

**Without this task the AC-1 evidence cannot be produced at all, which is why it is a
task and not a closeout note.** `reconcile` rebuilds the shipped assignment by
recomputing the partition itself, weighting each surface by `v.boots`
(`lib/mutationWeight/weights.ts:270`). Once production partitions by
`bootsOf * millisPerBoot`, a branch run's observed legs no longer match that
recomputation: this arc's own measurement expects 29 of 43 surfaces to change leg, so
`moved` is large, `rec.ok` is false, and the report prints RECONCILIATION FAILED and
returns before reaching `verdictDelta`. The closeout procedure would have nothing to read.

`ModelledSurface` gains an optional `millisPerBoot`, and `reconcile` weights by
`boots * (millisPerBoot ?? 1)`.

**The rate is OPTIONAL and the fallback is 1, deliberately.** A dump taken at a sha before
this arc has no rate because the field did not exist, and at that sha the partition really
was by boots alone. Reproducing an old tree's partition with a rate of 1 is therefore not
a default standing in for a missing value — it is the correct model of that tree. The
held-out fixtures are exactly such dumps, so this is the ordinary case rather than a
degraded one. `modelledFrom` records the rate from the checked-out registry, and the
spec's dump command records it whenever the field exists.

**Plants:**

All three are Form B: this task writes the weighting expression they mutate, so no anchor
written now can match it. An earlier draft supplied guessed literals here — written before
the Form A/B rule existed and not revisited when it landed — and none of them appears in
the uniqueness sweep above, which is exactly the tell.

| form | defect | file | anchor | becomes | suite |
| --- | --- | --- | --- | --- | --- |
| B | rate ignored in the recomputation | `lib/mutationWeight/weights.ts` | written at implementation | written at implementation | `instrument.test.ts` |
| B | missing rate defaults to zero | `lib/mutationWeight/weights.ts` | written at implementation | written at implementation | `instrument.test.ts` |
| B | rate applied to the wrong factor | `lib/mutationWeight/weights.ts` | written at implementation | written at implementation | `instrument.test.ts` |

The second is the one that matters most: a zero fallback silently collapses every
old-dump surface to weight 0, which reads as a perfectly balanced partition rather than
as an error.

**The red is a unit case, not the report CLI, and an earlier draft had this wrong twice
over.** That draft pointed the marker at
`scripts/mutation-shard-weight-report.ts --run docs/fixtures/mutationWeight/branch-run`.
`docs/fixtures/` does not exist and is not this repo's convention — fixtures for this area
live under `tests/mutation/source/fixtures` — so the command would have failed on a
missing directory, a non-zero exit that resembles the red without being it. That is the
same shape as the ENOENT confusion found in Task 1, which means finding it once did not
make me sweep for peers; the sweep is what turned this one up. The deeper problem is that
no artifact from a priced partition can exist at Task 4, since the priced partition has
never run in CI by then. The fixture would have to be hand-built, and hand-building the
very leg assignment under test writes the expected answer into the input.

So the property is asserted where it is directly expressible: hand `reconcile` a modelled
set CARRYING rates together with observed legs computed from the priced partition, and
expect `ok`. The report CLI keeps its role as the closeout's evidence path rather than
doubling as a task's red signal.

**The zero-fallback plant needs a fixture that can see it, and none of the existing ones
can.** The priced case carries rates, so it never evaluates the fallback at all; and the
rate-less cases already in the suite cannot discriminate either, because their
single-surface cases always land on the first leg, and their cases with one surface per
leg place identically whether every weight is zero or positive. This task therefore adds a rate-less
dump with MORE surfaces than legs and unequal boot counts, where an all-zero weighting
packs differently from a boots weighting. Without it the `?? 1` to `?? 0` plant would
report CAUGHT-by-luck or not at all.

**RED:** the marker's command with the three cases above added and `reconcile` still
weighting by `v.boots`. Expect the priced case to report the surfaces as moved and `ok`
false.

**GREEN:** the same command with all three passing, plus
`node scripts/mutation-weight-plant.mjs` reporting CAUGHT for the three entries above, plus
the report reconciling clean against a committed held-out fixture — which requires the flag
the command takes:

```
pnpm tsx scripts/mutation-shard-weight-report.ts --run <held-out fixture dir>
```

A bare invocation is not a weaker check, it is no check: `main` throws its usage error
immediately when no `--run` is supplied
(`scripts/mutation-shard-weight-report.ts:235`), so the earlier form would have failed for
a reason having nothing to do with reconciliation.

**Commit:** `fix(mutation): reconcile a partition priced in milliseconds per boot`

## Task 5 — the drift report

<!-- task: red=`pnpm vitest run tests/ci/rateDrift.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:280` why=`the budget job has one step and downloads only elapsed artifacts, so no drift report exists to assert against` ac=AC-5 -->

**Files:**

```
scripts/check-rate-drift.ts                        (new)
tests/ci/rateDrift.test.ts                         (new)
.github/workflows/mutation-harness.yml             (job steps AND the PR path filter)
tests/mutation/_metaSourceShardIntegrity.test.ts   (pins)
scripts/mutation-weight-plant.mjs                  (plants)
```

A NEW drift-check script beside the budget checker, named for what it does rather than
folded into the budget checker: that file's header states it decides nothing and takes
environment rather than argv, as the class repair for three rounds of argv-guard defects,
and the new script mirrors both properties. The registry read stays in the script;
`driftReport` already takes the declared rates as a plain map, so nothing under `lib/`
imports `tests/`.

The `budget` job gains the records download and a second step.

**The drift step runs `if: always()`.** Placed after the budget checker without it, an
over-budget failure — the one case where knowing which rate drifted matters most — skips
the drift step entirely. The step whose whole purpose is explaining a breach would be
silent exactly when there is a breach.

**What `_metaSourceShardIntegrity` pins, and the four it did not.** An earlier draft pinned
the step's `env:`, its whole `run:`, and its `if:`. Those three are necessary and they
leave the load-bearing wiring unpinned — every named GREEN command passed with the path
filter absent, which is the concealment this task exists to remove. The pins are:

1. the step's `env:` mapping, by equality (a shell assignment prefix in `run:` shadows it,
   so a guard reading only the mapping is fail-open);
2. its whole `run:` command, by equality;
3. its `if:` condition, by equality;
4. the records artifact's download PATTERN and DESTINATION, by equality — a step that
   downloads to the wrong path reports every surface unmeasured, which reads as a clean
   run with nothing to say;
5. both new `pull_request.paths` entries, by membership: the new script's path and
   `lib/mutationWeight/**`.

Point 5 is the one this PR cannot demonstrate for itself: the workflow fires here because
this diff edits the workflow, so the filter's absence is invisible on exactly the PR that
introduces it. A later change under `lib/mutationWeight` would merge without the harness
ever running.

The script's own contract gets two arms the suite runs directly: it reads REQUIRED values
from the environment with NO defaults, and it exits 2 when a required variable is missing
or malformed. A checker that defaults a missing input is a checker that passes on a
misconfigured job.

Report arms: every measured surface named whatever its ratio; actionable marked
separately; declared-but-unmeasured and measured-but-undeclared as two distinct states;
and the process exit status identical with and without drift.

**Plants:**

**The script's four plants are Form B: it does not exist yet, so no literal anchor written
now would match it.** Declared as defect and deciding suite; the literal pair is written at
implementation and the task's GREEN requires CAUGHT for each.

| form | defect | file | suite |
| --- | --- | --- | --- |
| B | drift changes the process exit status | scripts/check-rate-drift.ts | rateDrift.test.ts |
| B | declared-but-unmeasured folded in with drifted | scripts/check-rate-drift.ts | rateDrift.test.ts |
| B | measured-but-undeclared omitted from the output | scripts/check-rate-drift.ts | rateDrift.test.ts |
| B | a required environment value gains a default | scripts/check-rate-drift.ts | rateDrift.test.ts |
| B | a malformed required value is accepted instead of exiting 2 | scripts/check-rate-drift.ts | rateDrift.test.ts |
| B | only actionable surfaces reported, the rest dropped | scripts/check-rate-drift.ts | rateDrift.test.ts |

**The five wiring pins get planted broken arms of their own, and an earlier draft had
none.** Running an equality assertion against correct wiring shows only that the wiring is
correct today; it does not show that WEAKENING the assertion is detected, which is the
whole claim a pin makes. The workflow exists, so four of these are Form A with literal
anchors, and the two path-filter entries are Form B because the lines they must match are
added by this task:

**Every one of these is Form B, and an earlier draft got that wrong in a way worth naming.**
It declared two Form A plants that mutate the EXISTING budget step — its `env` mapping and
its `run` command. Both are already caught by the assertions at
`tests/mutation/_metaSourceShardIntegrity.test.ts:266`, which have been green since long
before this arc. So they would have reported CAUGHT while demonstrating nothing about the
NEW pins this task adds: the drift step's pins could be missing entirely and those two
plants would still pass. A plant that is caught by a pre-existing assertion proves that
assertion, not the one being added.

| form | what is weakened | file | suite |
| --- | --- | --- | --- |
| B | drift step's own `env:` mapping changed | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | drift step's own `run:` command changed | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | a shell prefix in the drift step's `run:` shadows its `env:` | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | drift step's `if: always()` removed | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | records artifact pattern changed | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | records artifact destination changed | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | the new script's path-filter entry deleted | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |
| B | `lib/mutationWeight/**` path-filter entry deleted | `.github/workflows/mutation-harness.yml` | `_metaSourceShardIntegrity.test.ts` |

The third row is the shell-shadow case as a mutation rather than as prose: a `run:` prefix
that shadows the step's `env:` must fail the whole-command equality pin, and if it does
not, the pin reads the mapping only and is fail-open.

**RED, and the collection failure does NOT count as one.** An earlier draft offered a
module-resolution failure naming the missing script as its first red. That is a command
that never reached a deciding assertion, and the project's red-validity rule rejects it for
exactly that reason — an unresolved import is indistinguishable from a mistyped path, which
is the failure mode `--exec-red`'s collection probe exists to name. So the script is
committed as a STUB first, exporting the right shape and returning nothing useful, and the
observed red is the marker's command with all six arms failing against it. Every one of
those failures is an assertion that ran.

**GREEN:** the marker's command with every arm passing, plus
`pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` green over all five
pins, plus `node scripts/mutation-weight-plant.mjs` reporting CAUGHT for ALL FOURTEEN
entries this task declares — the six script plants and the eight wiring plants. An earlier
draft's completion condition said "the four plants" while the task declared eleven, which
left the wiring demonstrations outside the condition that closes the task.

**Commit:** `feat(ci): report per-surface rate drift beside the shard budget`

## Task 6 — nothing verdict-deciding moved on a surface enrolled before this diff

<!-- task: red=`pnpm vitest run tests/mutation/_metaPreexistingSurfaceImmutability.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:151` why=`GUARD_SURFACES is the whole population and no assertion compares any of its pre-existing rows against their values at the merge base, so lowering a scoreFloor or adding an accepted row is invisible to every command this plan runs` ac=AC-7 -->

**Files:**

```
tests/mutation/_metaPreexistingSurfaceImmutability.test.ts   (new)
tests/mutation/fixtures/preexisting-surfaces.json            (new, generated at the merge base)
scripts/mutation-weight-plant.mjs                            (plants)
```

**AC-7 had no executable proof, and the score run is not one.** The score command
establishes floors and empty unaccepted-survivor sets. It says nothing about whether an
EXISTING surface's operators, suite paths, accepted ledger, source path, control anchor or
score floor changed — and a LOWERED floor makes the score command greener, not redder, so
the one command the plan offered would actively conceal the violation it was supposed to
catch. Everything AC-7 asserts was prose.

The snapshot is generated FROM THE MERGE BASE, never from HEAD:

```
git show $(git merge-base origin/main HEAD):tests/mutation/source/registry.ts
```

Taking it from HEAD would snapshot whatever this diff had already done and then assert the
diff against itself, which is the tautology this plan's own anti-tautology rule names. Each
row records the verdict-deciding fields: `operators` sorted, `suitePaths` sorted,
`accepted` sorted by site id, `sourcePath`, `control`, `scoreFloor`.

**Deletions and additions are both covered, because a subset check is not immutability.** A
guard that walks only the snapshot's ids passes when a surface is DELETED from the registry.
So the assertion is two-sided: every snapshot id must be present and field-identical, and
the live set minus the snapshot set must equal exactly the two ids this arc enrols. A third
enrolment appearing here fails, which is correct — it would be a registry change this plan
never reviewed.

**The snapshot and both Form A anchors are generated AFTER the registry seam closes, not
now.** Two other arcs are live registry writers — `#882` enrols two surfaces, and
`feat/review-round-arc-sum` enrols a new instant-rounds module at `651c21c13` — and the
orchestrator's ruling is that every registry and partition commit holds until BOTH merge
and this branch absorbs them. That has a consequence specific to this task, beyond the
ordering: the merge base MOVES, so a snapshot taken today would pin a registry that is not
the one this diff is measured against, and the guard would then report every absorbed
surface as an unexpected addition. Both Form A anchors need re-verifying at the same point
for the same reason — `scoreFloor: 0.94,` is unique across today's 45 rows, and a surface
arriving with that floor makes it non-unique and the plant unpasteable. The uniqueness
sweep is re-run after the absorb, not trusted from this document.

**Placed BEFORE the re-score deliberately.** The guard exists to constrain the triage in
Task 7, where the temptation to lower a floor or ledger a row on `sourceShardPartition` is
strongest. A guard that lands after the work it constrains is documentation.

**Plants** — Form A, since every anchor is a live registry row today:

**One plant per recorded field, because a guard that compares six fields and demonstrates
one has demonstrated one.** An earlier draft planted `scoreFloor` alone and left
`operators`, `suitePaths`, `accepted`, `sourcePath` and `control` asserted but never
exercised. Every anchor below is Form A on `specLintUniversals`, a surface enrolled well
before this diff and therefore in the merge-base snapshot; its `scoreFloor: 0.94,` is the
registry's only occurrence of that value, which is what makes the row addressable by a
unique literal at all.

| form | field exercised | file | anchor | becomes |
| --- | --- | --- | --- | --- |
| A | `scoreFloor` lowered | `tests/mutation/source/registry.ts` | `scoreFloor: 0.94,` | `scoreFloor: 0.5,` |
| A | a pre-existing surface DELETED | `tests/mutation/source/registry.ts` | `id: "specLintUniversals",` | `id: "specLintUniversalsRenamed",` |
| B | `operators` narrowed | `tests/mutation/source/registry.ts` | that row's operator list | a scoped subset | — |
| B | `suitePaths` shortened | `tests/mutation/source/registry.ts` | that row's suite list | one path dropped | — |
| B | `accepted` gains a row | `tests/mutation/source/registry.ts` | that row's accepted list | one row added | — |
| B | `sourcePath` repointed | `tests/mutation/source/registry.ts` | that row's source path | a different file | — |
| B | `control` anchor altered | `tests/mutation/source/registry.ts` | that row's control string | one token changed | — |

The five Form B rows are Form B for a mechanical reason rather than a temporal one: their
anchors are field values shared across many rows — `operators: [...OPERATOR_NAMES],` alone
occurs 38 times — so no unique literal exists for them until the entry names enough
surrounding text to disambiguate, which is written when the plant is applied. The rule's
exactly-once requirement is what forces this, and it is the same requirement that caught
the `scoreFloor: 0.9,` anchor.

The first row is the case the score command cannot see: a LOWERED floor makes that command
greener. Its anchor is `0.94` and not `0.9` for a mechanical reason worth recording, since
it is what the uniqueness sweep exists to catch — `scoreFloor: 0.9,` occurs TWELVE times in
the registry, so it is not a valid Form A anchor at all and the harness would refuse it.

The second row proves the two-sided check rather than the subset check, and it must rename
a PRE-EXISTING surface to do so. An earlier draft renamed `mutationWeightRecords`, which
this branch enrols: that surface is absent from the merge-base snapshot, so renaming it
exercises the allowed-additions comparison and never the deletion arm at all. Renaming
`specLintUniversals` removes a snapshot row from the live set, which is the deletion a
one-sided guard would report clean.

**RED:** the marker's command with the suite and the merge-base snapshot committed, and one
plant applied. Expect a failure naming the changed field and surface.

**GREEN:** the same command passing on the unplanted tree, plus
`node scripts/mutation-weight-plant.mjs` reporting CAUGHT for all seven entries — one per
recorded field, plus the deletion.

**Commit:** `test(mutation): pin every pre-existing surface against the merge base`

## Task 7 — re-score every surface this diff moved

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm tsx scripts/mutation-score-surfaces.ts sourceShardPartition mutationWeightRecords mutationWeightWeights` red-state=live red-target=`tests/mutation/source/registry.ts:3302` why=`mutationWeightWeights scored 0.7279 against this 0.90 floor with 37 unaccepted survivors, observed 2026-08-25` ac=AC-7 -->

**Files:** whatever the triage reaches, which is not knowable before the run. Declaring
only the ledger files would have presupposed the outcome, and it contradicted this task's
own required order: a KILL lands in `tests/mutationWeight/instrument.test.ts` or
`tests/mutation/source/shardPartition.test.ts`, and a DELETE lands in
`lib/mutationWeight/weights.ts` or `lib/mutationWeight/records.ts`. Only the third
disposition touches `tests/mutation/source/registry.ts` and
`tests/mutation/source/expectedLedgerKinds.ts`.

```
tests/mutationWeight/instrument.test.ts            kills
tests/mutation/source/shardPartition.test.ts       kills
lib/mutationWeight/weights.ts                      deletions
lib/mutationWeight/records.ts                      deletions
tests/mutation/source/registry.ts                  ledger rows only
tests/mutation/source/expectedLedgerKinds.ts       ledger-kind declarations
```

The run decides which of these are touched. Naming all six is the honest declaration; the
constraint that matters is the one below about `sourceShardPartition`, not a narrow file
list that the procedure would have had to violate.

Three surfaces have moved: `sourceShardPartition` (its source is edited by Task 3), and
`mutationWeightRecords`/`mutationWeightWeights` (their source is edited by Task 4 and
their partition changes). All three are named in the one command above.

**This is heavy turn TWO of two, and the count is stated because an earlier draft claimed
one.** Turn one is Task 2's bootstrap, which cannot measure the final tree because the
rate is not applied until Task 3. This turn measures the tree that ships. A repair
prompted by THIS run needs its own confirming run, and if that happens it is a third turn
rather than a promise broken: the honest statement is that this arc spends two turns and
budgets for a third if the final score moves.

The starting point is measured and the marker's `why=` cites it: 0.7279 against a 0.90
floor, 37 unaccepted survivors, observed 2026-08-25. That figure is DATED and already
partly superseded — three of those survivors were killed at `75e63a2a2`, and Task 3 adds
new mutation sites to `sourceShardPartition` that the figure predates. It is kept as the
observation that justifies `red-state=live` rather than updated on paper, because the
number that replaces it comes from a run and not from arithmetic over what I believe I
fixed. **A count of fixtures added is not a count of survivors closed, and this document
said otherwise once.**

The triage order is the orchestrator's and is not mine to reorder:

1. **Kill** what the suite should pin.
2. **Delete** code the gate has just proved unnecessary — a defensive branch for an input
   that cannot occur, a sort no consumer needs. A gate that cannot kill dead code is
   telling you it is dead.
3. **Ledger** only what survives both, each with a MECHANISM argument: no input
   distinguishes the mutant from the original. Never an unreachable-on-corpus observation,
   which is a statement about today's inputs rather than about the program.

**The blanket equivalence argument this task used to carry was wrong, and plan review
round 1 caught it before it became a ledger.** The residue is dominated by `?? 0`
coalesces that `noUncheckedIndexedAccess` REQUIRES on every indexed read, and the argument
was that the index is proven in range by the guard immediately above, so the default is
never evaluated. That is FALSE wherever the exported signature admits the missing case —
and at three sites in `legSeconds` it did: an assignment naming a surface with no
measurement, an out-of-range leg, and an unassigned leg were all reachable through a
signature accepting any map. One was not even a wrong number: the coalesced out-of-range
write left `[0,0,0,null,null,100]`, so the binding leg came back NaN. All three were
killed, not ledgered. **Compiler-mandated is not the same as unobservable, and each
residual row is argued on its own inputs.**

**No `accepted` row may be added to `sourceShardPartition`.** It was enrolled before this
diff, so a new accepted row there is a verdict-deciding input that moved, which is exactly
what AC-7 forbids. If that surface produces an unaccepted survivor, the repair is a kill
or a deletion, never a ledger row.

Check the binding leg against budget before and after enrolment. This arc's own modules
are the first customers of its design and must not be the surfaces that breach it.

**RED:** the marker's command. Expect `mutationWeightWeights` below its floor with
unaccepted survivors listed — dated above, re-measured by this run.

**GREEN:** the same command, all three surfaces at or above floor with zero unaccepted
survivors.

**Commit:** `test(mutation): close the survivor residue on the three surfaces this diff moved`

<!-- tasks: end -->

## Closeout — deliberately OUTSIDE the task region, and this is not an oversight

Archive the row, drop the IN PROGRESS marker in the PR's last commit, add
`tests/mutationWeight/instrument.test.ts` to `_metaScratchRootCleanup`'s pinned list,
write the closeout with the review-round dispositions, and name the re-partition seam
with its measured magnitude.

**AC-1 is discharged here rather than as a task, and the reason is the red-contract
itself.** Verdict neutrality is a MEASUREMENT over two CI runs, not a code change. The
comparison function it uses, `verdictDelta`, already exists and is already tested; a new
suite comparing two neutral artifacts would pass the moment it was authored, and its
`red-target` would name the absence of a test rather than any defect in production
behaviour. That is the one shape the contract rejects by name. Writing a marker for it
would have been inventing a red to satisfy a grammar, which is precisely what the
existing closeout note below says this document declines to do. Plan review round 1 was
right to call the task invalid; the honest repair is to move it, not to dress it.

The measurement itself, unchanged in substance:

- Derive the three populations FROM THE DIFF at claim time, never from this sentence, and
  state each count with the ref it was derived at.
- Compare population (i) against an old-weight baseline with `verdictDelta`.
- **Both sides must come from the SAME TRIGGER**, an orchestrator ruling rather than a
  preference: `workflow_dispatch` and `pull_request` are separate populations on this
  repo and mixing them is banked as a misreading.
- **The baseline is a FRESH dispatch at the FINAL merge base.** Run `32844208485` is a
  cross-check and NOT the anchor: it captured 43 surfaces under the old weight at
  `300a9f937`, which stopped being the merge base once `#881` and `#882` landed. The
  spec calls it superseded and so does this.
- **Verify the trigger and head of both runs rather than assuming them.** Mutation
  artifacts carry neither, so read them from the API:
  `gh run view <id> --json event,headSha,conclusion`. A comparison whose two sides differ
  in trigger or base is not a neutrality result.
- Schedule the branch dispatch against capacity: it is another fourteen legs and the
  semaphore is at one slot as a deliberate interim. If it cannot be had at all, the
  fallback the ruling allows is a PARTITION-LEVEL claim, which is weaker and must be
  labelled as such rather than presented as verdict equality.
- The bar was measured before the claim: 1 of 4328, 0 of 4360, 0 of 3692 across
  consecutive nightlies, the single mover being the inherited `ledgerGit` survivor. Any
  other mover is re-run with its surface ALONE on a leg before attribution.

The closeout carries no `red=` because it has no red-then-green cycle to claim. Both
meta-tests it would name — `tests/docs/_metaLedgerInProgress.test.ts` and
`tests/docs/_metaInvariant8Closeout.test.ts` — pass on the tree TODAY and pass after the
work. The multi-region design allows headings outside a region and leaves them unchecked,
so this sits after `tasks: end`.

## Plan checklist

Outside the task region for the same reason the closeout is: these are process gates, not
red-then-green cycles, and inventing a `red=` for one would be satisfying a grammar.

- [x] Pre-draft code-verification pass (table above, every claim re-read at drafting)
- [x] Meta-test inventory declared, including the one guard outside this arc
- [x] Mutation-family closure declared as the six-operator set
- [x] Reconciliations run at plan time and pasted, not described
- [x] Every `red=` validated: the single `red-state=live` marker observed failing, and
      each `red-state=authored` marker naming a production line read rather than resolved.
      The split is derived by the command in the reconciliations section, not retyped —
      an earlier draft asserted a number here and had it wrong.
- [x] Self-review
- [ ] **Adversarial review (cross-model)** — Codex, `--stage plan`. Three rounds so far,
      BLOCKING each time, and every finding across all three was accepted rather than
      refuted. Round 1 drove the rebuild of the task bodies and turned up two live code
      defects, repaired at `75e63a2a2`. Round 2 showed the reconciler could not model a
      priced partition, which had made the AC-1 evidence unproducible. Round 3 identified
      plant declarations as the recurring vector, which is why the Form A/B rule above
      exists as a rule rather than as five more repairs.
- [ ] Execution handoff

