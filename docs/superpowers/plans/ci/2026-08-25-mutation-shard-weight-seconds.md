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

**Task 1 exists because that mechanism did not reach two of the tasks that depend on
it.** The harness resolves its target and its suite from two hardcoded constants
(`scripts/mutation-weight-plant.mjs:27-28`), so a plant aimed anywhere outside
`lib/mutationWeight` reports ANCHOR-FAIL rather than exercising anything. The
binding-leg task and the drift task both plant outside it. Generalising the harness is therefore the first task rather than
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

**Current state of every planned `red=` command:**

```
  PASSES today: scripts/mutation-weight-plant.mjs          (no out-of-tree plant declared yet)
  PASSES today: tests/mutation/_metaGuardSurfaceRegistry.test.ts
  PASSES today: tests/mutation/source/shardPartition.test.ts
  ABSENT: tests/mutation/source/shardBalance.test.ts
  ABSENT: tests/ci/rateDrift.test.ts
  ABSENT: scripts/check-rate-drift.ts
  FAILS today: the Task 6 score run (below its floor, dated observation in the marker)
```

Every `red=` except Task 6's names the production line whose absence or defect makes its
new case fail, verified by READING that line. Task 6's is `red-state=live` because the
tree fails it today.

## The acceptance criteria these tasks discharge

Restated here rather than left as bare ids in the task markers, so a reader can check a
task against its criterion without opening the spec. The spec is authoritative for the
wording; this is the index.

| id | what it requires | discharged by |
| --- | --- | --- |
| **AC-1** | Verdict neutrality over three populations that are not one population: untouched surfaces keep every verdict, `sourceShardPartition` keeps no unaccepted survivor and its floor, and the two newly enrolled modules meet their floor with no prior verdict to compare. Both sides of the comparison come from the same trigger. | Closeout, and the reason it is not a task is argued there |
| **AC-2** | The partition stays total and disjoint over whatever registry size is live at merge. | Task 3 |
| **AC-3** | On every held-out pair, the binding leg under the seconds-calibrated weight is at or below the shipped model's on the same target and the same scored population. | Task 4 |
| **AC-4** | A surface cannot enrol without a rate: absent fails to compile, and out-of-range fails a named test. | Task 2 |
| **AC-5** | The drift report names every measured surface, marks which are actionable, keeps declared-but-unmeasured and measured-but-undeclared distinct, and changes no exit status. | Task 5 |
| **AC-6** | Every weight handed to `lptAssign` is an integer, so its documented platform-independence stays true. | Task 3 |
| **AC-7** | No verdict-deciding input moves for a surface enrolled before this diff. | Task 6 |

<!-- tasks: depth=2 red-contract -->

## Task 1 — the plant harness reaches outside `lib/mutationWeight`

<!-- task: red=`node scripts/mutation-weight-plant.mjs` red-state=authored red-target=`scripts/mutation-weight-plant.mjs:27` why=`SRC and SUITE are hardcoded to lib/mutationWeight and instrument.test.ts, so a plant naming a file outside that directory is never applied and the harness reports ANCHOR-FAIL` ac=AC-3,AC-5 -->

**Files:** `scripts/mutation-weight-plant.mjs`.

The binding-leg task and the drift task both declare plants on files the harness cannot
currently reach: the held-out fixtures under `tests/mutation/source/`, and the new drift
script. Until this lands,
those two tasks' plants report ANCHOR-FAIL, which the harness correctly refuses to score
as a pass. That refusal is the point: the harness already declines to call an unapplied
plant a success, so the gap is loud rather than silent, and this task is what closes it.

Each defect entry gains an optional target-root and suite. Existing entries keep their
current shape and default to today's two constants, so the 37 already declared neither
move nor get rewritten. The harness copies each distinct target root it sees into the
scratch tree and runs the suite the entry names.

**RED:** add a single entry naming `tests/mutation/source/shardPartition.ts` before
touching the resolution logic, then `node scripts/mutation-weight-plant.mjs`. Expect
`ANCHOR-FAIL` for that entry and a non-zero exit — the file is never copied, so its
anchor cannot be found.

**GREEN:** the same command, with the entry reported CAUGHT and every pre-existing entry
still CAUGHT.

**Commit:** `test(mutation): let the weight plant harness target files outside lib/mutationWeight`

## Task 2 — `millisPerBoot` becomes a required field, guarded over the whole registry

<!-- task: red=`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:56` why=`validateSurface accepts a surface with no millisPerBoot, so the new range arms have nothing to reject` ac=AC-4 -->

**Files:** `tests/mutation/source/registry.ts` (type, 45 rows, `validateSurface`),
`tests/mutation/_metaGuardSurfaceRegistry.test.ts` (range arms),
`scripts/mutation-shard-weight-report.ts` (the bootstrap flag below).

Add the field to `GuardSurface`, seed every live row, extend `validateSurface`.

Absent is a compile error, not a test. The runtime arms are rows in the existing
`reject(patch)` harness: `0`, negative, `NaN`, non-integer, and above
`SHARD_BUDGET_SECONDS * 1000`. The guard iterates `GUARD_SURFACES`, so a surface
enrolled later is covered without an edit.

**The upper bound is the shard budget and NOT `MUTANT_TIMEOUT_MS`.** An earlier draft of
this task said the timeout, and spec round 3 refuted it using this design's own evidence:
the rate is per MODELLED boot, one modelled boot stands for up to 4.60 observed children,
so two honest 100-second children give 200,000 ms per modelled boot while neither child
approaches a 180,000 ms timeout. The tighter bound would reject an ordinary enrolment
after an ordinary suite slowdown. Restated here because the plan reintroduced it once
already.

**The bootstrap is one command, which it was not.** `--emit-registry` refuses to emit a
partial table, and the two rows this arc enrolled have no records to emit from, so the
seeding step as previously written could not run: the flag would refuse, and the
insertion guard would equally refuse a table missing two rows. Deadlock by construction.
The report gains `--seed-rate <id>=<millis>` (repeatable), applied BEFORE the
completeness check rather than after, so the guard still holds over the merged table and
a bootstrap rate has to be stated explicitly rather than defaulted. The two values come
from Task 6's score run, which prints `millisPerBoot` per surface; this task consumes
them as literals with the run that produced them named beside each.

Seeding is mechanical and asserted: the insertion script keys on each row's `id`,
requires every seeded surface to match exactly once, and refuses to run if the registry
holds a row it cannot place or the seed holds a rate matching no row. A partial
application here is the enrolment cliff by another route.

**RED:** `pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` with the five
range arms added and `validateSurface` untouched. Expect all five to fail — the field is
unvalidated, so nothing rejects.

**GREEN:** the same command, all arms passing, after `validateSurface` learns the field.

**Commit:** `feat(mutation): require a per-surface millisPerBoot and range-guard it`

## Task 3 — `bootsOf` extraction and the new `weightOf`

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:53` why=`weightOf returns bootsOf(surface) with no rate applied, so the delta case sees 4 rather than 4 x millisPerBoot` ac=AC-6,AC-2 -->

**Files:** `tests/mutation/source/shardPartition.ts`,
`tests/mutation/source/shardPartition.test.ts`.

`bootsOf` is already exported with today's expression VERBATIM and `weightOf` already
wraps it; this task makes `weightOf` the product.

**Verbatim is a requirement, not an accident.** `sourceShardPartition`'s registry row
uses `"surface.accepted.length * (suites - 1) + suites"` as its control anchor, and
`validateSurface` rejects a row whose anchor does not occur exactly once. Reformatting
that line breaks enrolment, and the failure reads as an unrelated registry error.

The existing delta case becomes `4 * millisPerBoot`, still derived from the fixture
rather than hardcoded.

**Its discriminating power depends on a fixture value, so the fixture CONSTRUCTS that
value rather than hoping for it.** Under a `*`-to-`+` mutant the delta is `4` instead of
`4 * rate`, so the two are distinguishable only when the fake surface's rate is not 1.
`tests/_shared/premise.ts` is explicit that where the environment can be constructed you
construct it rather than writing a premise that reds, so the fixture sets a distinctive
rate outright and `premiseHolds` stands behind it as the executable statement of why that
value matters. Left to a default, one edit to the fixture would destroy the discriminator
while the test kept passing — the same self-consistent-mutant trap the
`sourceShardPartition` row already documents about `SOURCE_SHARD_COUNT`.

New assertion: every weight handed to `lptAssign` is an integer.

**The consumer that reads a weight as a boot count is pinned here, because it was
already wrong.** `modelledFrom` in the report called `weightOf` and treated the result as
raw boots, under a comment observing the two agree "until the rate multiplies it" — which
is exactly this task. It was repaired at `75e63a2a2` to call `bootsOf`; this task adds
the assertion that keeps it repaired, by running the report's own reconciliation over a
registry whose rate is not 1 and requiring the recovered mutant count to match. Without
it the repair is a comment.

Also here, since the suite is where it belongs: a source-scan assertion that the module
header no longer claims "NO committed weight table" and no longer names `runAllSuites`,
which does not exist. **That assertion is about ABSENCE, and the commit that removes the
claim also quotes it in its own message, so the scan matches on the module's header
region only and the four plants declared for it are: the phrase restored verbatim, the
phrase restored with different capitalisation, `runAllSuites` restored in a comment, and
`runAllSuites` restored in code. Use-versus-mention is the failure mode here and it is
tested, not assumed.**

**RED:** `pnpm vitest run tests/mutation/source/shardPartition.test.ts` after the delta
case is rewritten to expect `4 * millisPerBoot` and before `weightOf` applies the rate.
Expect the delta case to fail: it sees the bare boot count where the fixture's
product is required.

**GREEN:** the same command once `weightOf` returns the product.

**Commit:** `feat(mutation): price the shard weight in milliseconds per boot`

## Task 4 — the binding-leg bound, held out

<!-- task: red=`pnpm vitest run tests/mutation/source/shardBalance.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:53` why=`the unapplied rate makes the seconds-calibrated partition identical to the shipped one, so both binding legs are equal and the strict margin the fixtures record is absent` ac=AC-3 -->

**Files:**

```
tests/mutation/source/shardBalance.test.ts         (new)
tests/mutation/source/fixtures/heldout-*.json      (new, three pairs)
```

Committed dated fixtures: rates seeded from one run, per-surface seconds from a LATER
one. All three pairs, named by the runs they came from:

| pair | seed run | scored run | surfaces | seconds-calibrated binding | shipped binding | margin |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `32703467609` | `32822546867` | 42 | 5174s | 6138s | 965s |
| 2 | `32625602788` | `32703467609` | 42 | 5783s | 6974s | 1191s |
| 3 | `32559529251` | `32625602788` | 41 | 5409s | 6569s | 1160s |

**The assertion is STRICTLY less, not at-or-below, and that difference is the whole red.**
AC-3 states the criterion as a bound, and a bound is the right shape for a criterion —
but before `weightOf` applies the rate the two partitions are IDENTICAL, so both binding
legs are equal, and equality satisfies at-or-below. A test asserting only the criterion
passes on the unimplemented tree and proves nothing. That is the shape the red-contract
rejects by name: a guard test that passes the moment it is authored. The fixtures record a
strictly positive margin on every one of the three pairs, so the test asserts the
measured fact. It implies the criterion and it can fail.

Direction, stated so a sign error cannot pass: the SECONDS-calibrated binding leg is the
SMALLER number on all three pairs.

Two constructions are forbidden and the test pins both: seeding and scoring on one run,
and pricing a seed-unknown surface from the scored run's own rate. The second is the
defect spec review caught, and the fixtures include a pair with an arrival — pair 1
excludes `controlOutlineResidue`, pair 3 excludes `connectionCensus` — so the exclusion
path is exercised rather than assumed.

The expectation comes from the SECONDS FIXTURE, never from `weightOf` — an expectation
derived from the thing under test cannot notice a rate mutant.

**Plant, executable through Task 1:** perturb pair 2's seeded rate for its heaviest
surface by the observed 8.33x. Pair 2 has the narrowest shipped spread (1.541x) and the
largest margin, so if any pair can absorb a perturbation without inverting it is that
one; inverting there is the strongest of the three. Expect the strict assertion to fail.

**RED:** the marker's command, with the suite and all three fixtures committed,
before Task 3's rate lands. Expect three failures, each
reporting equal binding legs where a strict margin was required.

**GREEN:** the same command after Task 3, all three passing with the tabulated margins.

**Commit:** `test(mutation): hold out three nightly pairs and bound the binding leg`

## Task 5 — the drift report

<!-- task: red=`pnpm vitest run tests/ci/rateDrift.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:280` why=`the budget job has one step and downloads only elapsed artifacts, so no drift report exists to assert against` ac=AC-5 -->

**Files:**

```
scripts/check-rate-drift.ts                        (new)
tests/ci/rateDrift.test.ts                         (new)
.github/workflows/mutation-harness.yml             (job steps AND the PR path filter)
tests/mutation/_metaSourceShardIntegrity.test.ts   (pins)
```

A NEW drift-check script beside the budget checker, added by this task and named for what
it does, not an extension of the budget checker: that file's header states it decides
nothing and takes environment rather than argv as the class repair for three rounds of
argv-guard defects, and the new script mirrors both properties. The registry read stays
in the script; `driftReport` already takes the declared rates as a plain map, so nothing
under `lib/` imports `tests/`.

The `budget` job gains the records download and a second step.

**The drift step runs `if: always()`, and this is the finding rather than a detail.**
Placed after the budget checker without it, an over-budget failure — the single case where
knowing which rate drifted matters most — skips the drift step entirely. The step whose
whole purpose is explaining a breach would be silent exactly when there is a breach. So
`_metaSourceShardIntegrity` pins three things by equality, not two: the step's `env:`
mapping, its WHOLE `run:` command, and its `if:` condition. The first two because a shell
assignment prefix in `run:` shadows the step's `env:` and a guard reading only the mapping
is fail-open; the third because a step order that looks harmless is what removes the
report.

**The PR path filter gains two entries, or later changes to this harness merge without
running it.** The filter names `scripts/check-shard-budget.ts` but nothing under
`lib/mutationWeight`, and it will not name the new script unless this task adds it. This
PR fires the workflow because it edits the workflow itself, which conceals the gap
precisely on the PR that introduces it. Add both the new drift script's path and
`lib/mutationWeight/**`.

Arms: every measured surface named whatever its ratio; actionable marked separately;
declared-but-unmeasured and measured-but-undeclared as two distinct states; and the
process exit status identical with and without drift.

**RED:** the marker's command, with the suite committed and the drift script absent.
Expect a module-resolution failure naming the missing script, then — once the script
exists as a stub — the four arms failing.

**GREEN:** the same command with all arms passing, plus
`pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` green over the three
new pins.

**Commit:** `feat(ci): report per-surface rate drift beside the shard budget`

## Task 6 — re-score every surface this diff moved

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm tsx scripts/mutation-score-surfaces.ts sourceShardPartition mutationWeightRecords mutationWeightWeights` red-state=live red-target=`tests/mutation/source/registry.ts:3302` why=`mutationWeightWeights scored 0.7279 against this 0.90 floor with 37 unaccepted survivors, observed 2026-08-25` ac=AC-7 -->

**Files:** `tests/mutation/source/registry.ts` (ledger rows only),
`tests/mutation/source/expectedLedgerKinds.ts`.

Three surfaces have moved: `sourceShardPartition` (its source is edited), and
`mutationWeightRecords`/`mutationWeightWeights` (their source gains nothing but their
partition changes). **All three are named in the one command above** — an earlier draft
scored two and claimed to have measured the third.

Re-score, record each score with the `OPERATORS:` tail, and reconcile every ledger.

**The starting point is measured and the marker's `why=` cites it: 0.7279 against a 0.90
floor, 37 unaccepted survivors, observed 2026-08-25.** That figure is DATED and already
partly superseded — kill passes have landed since, including three at `75e63a2a2`. It is
kept as the observation that justifies `red-state=live` rather than updated on paper,
because the number that replaces it comes from a run and not from arithmetic over what I
believe I fixed. **The count of fixtures I have added is not a count of survivors I have
closed, and this document said otherwise once.**

The triage order is the orchestrator's and is not mine to reorder:

1. **Kill** what the suite should pin.
2. **Delete** code the gate has just proved unnecessary — a defensive branch for an input
   that cannot occur, a sort no consumer needs. A gate that cannot kill dead code is
   telling you it is dead.
3. **Ledger** only what survives both, each with a MECHANISM argument: no input
   distinguishes the mutant from the original. Never an unreachable-on-corpus
   observation, which is a statement about today's inputs rather than about the program.

**The blanket equivalence argument this task used to carry was wrong, and plan review
round 1 caught it before it became a ledger.** The residue is dominated by `?? 0`
coalesces that `noUncheckedIndexedAccess` REQUIRES on every indexed read, and the
argument was that the index is proven in range by the guard immediately above, so the
default is never evaluated. That is FALSE wherever the exported signature admits the
missing case — and at three sites in `legSeconds` it did: an assignment naming a surface
with no measurement, an out-of-range leg, and an unassigned leg were all reachable
through a signature that accepts any map. One of them was not even a wrong number: the
coalesced out-of-range write left `[0,0,0,null,null,100]`, so the binding leg came back
NaN. All three were killed at `75e63a2a2`, not ledgered. **Compiler-mandated is not the
same as unobservable, and each residual row is argued on its own inputs.**

**No `accepted` row may be added to `sourceShardPartition`.** It was enrolled before this
diff, so a new accepted row there is a verdict-deciding input that moved, which is
exactly what AC-7 forbids. If that surface produces an unaccepted survivor, the repair is
a kill or a deletion, never a ledger row.

ONE slot turn measures the final state. An intermediate measurement would cost a second
turn under `slots=1` and describe a tree that never ships.

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
- [x] Every `red=` validated: the `red-state=live` one observed failing, the six
      `red-state=authored` ones each naming a production line read rather than resolved
- [x] Self-review
- [ ] **Adversarial review (cross-model)** — Codex, `--stage plan`. Round 1 returned
      BLOCKING with twelve findings and drove this rewrite; two of them were about code
      already on the branch and were repaired at `75e63a2a2` rather than planned around.
- [ ] Execution handoff

