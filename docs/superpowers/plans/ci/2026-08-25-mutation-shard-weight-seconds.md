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
| `validateSurface` returns a problems list and range-guards a numeric field already | `tests/mutation/source/registry.ts:70` |
| the plant harness hardcodes both its source dir and its suite | `scripts/mutation-weight-plant.mjs:27` and `scripts/mutation-weight-plant.mjs:28` |
| the `reject` helper exists at `tests/mutation/_metaGuardSurfaceRegistry.test.ts:35`, and `tests/mutation/_metaGuardSurfaceRegistry.test.ts:41` runs it over every row | both by `grep -n` |
| `sourceShardPartition`'s control anchor sits INSIDE the body task 3 rewrites | `tests/mutation/source/registry.ts`, row `sourceShardPartition` |
| that row already documents the self-consistent-mutant trap for constants | same row's comment |
| `lptAssign` documents integer arithmetic | `tests/parser/mutation/shardPartition.ts:17` |
| the env mapping is pinned at `tests/mutation/_metaSourceShardIntegrity.test.ts:274` and the whole `run:` command at `tests/mutation/_metaSourceShardIntegrity.test.ts:282`, both by equality | both by `grep -n` |
| `check-shard-budget.ts` deliberately decides nothing and takes env, not argv | that file's header |
| the `budget` job's only step runs the budget checker | `.github/workflows/mutation-harness.yml:291` |
| the workflow's PR path filter names `scripts/check-shard-budget.ts` but nothing under `lib/mutationWeight` | `.github/workflows/mutation-harness.yml:43-53` |
| `mutationWeightWeights` carries `scoreFloor: 0.9` | `tests/mutation/source/registry.ts:3544` |
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

**LANDED at `af7fa122f`.** The `red-target` above cites the pre-implementation tree, which
is what a red-target is FOR — it names the defect that made the red real — and this task
removed it, so `scripts/mutation-weight-plant.mjs:27` no longer holds `const SRC`. Recorded
rather than repointed: aiming it at today's code would describe no defect at all. Note that
`spec:lint` reports this document clean with that citation drifted onto a comment, which is
its documented limit working exactly as written — the line is IN RANGE, and nothing checks
what is at it. Re-verification is by reading.

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

<!-- task: red=`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:70` why=`validateSurface accepts a surface with no millisPerBoot, so neither the range arms nor the accept-arm at 200000 have anything to exercise` ac=AC-4 -->

**Files:** `tests/mutation/source/registry.ts` (type, 45 rows, `validateSurface`),
`tests/mutation/_metaGuardSurfaceRegistry.test.ts` (arms),
`tests/mutation/_metaSourceShardIntegrity.test.ts` (the constant pin below),
`scripts/mutation-shard-weight-report.ts` (`--seed-rate`).

**Step 1 is a measurement, and it is the first of exactly TWO heavy turns this arc
spends.** A surface enrolled but never scored has no records to derive a rate from, and
`--emit-registry` refuses a partial table rather than inventing one. An earlier draft said
these rates come from the final score run — four tasks later — which is circular: the
registry cannot require a field that the run validating it has not yet produced.

**The surfaces to score are DERIVED at the time the turn runs, never the two this arc
happens to enrol.** The completeness rule ranges over the whole registry, so ANY row
without records needs a bootstrap rate, whoever enrolled it. The registry seam guarantees
there will be others: `#882` adds `supabaseRetryingFetch` and `retryableRpcVolatilityScan`,
both newly enrolled and therefore recordless exactly like this arc's two, and
`feat/review-round-arc-sum` adds a third. Naming a fixed pair here would have been correct
for about an hour and then quietly wrong, with the failure landing as a refusal in the
middle of a heavy turn. So the list comes from the tree:

```
# every enrolled row the newest records cannot price
pnpm tsx scripts/mutation-shard-weight-report.ts --run <newest records dir> --emit-registry
#   -> exits non-zero listing "ENROLLED BUT UNMEASURED, so no rate can be emitted for: ..."

VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy:mutation pnpm tsx \
  scripts/mutation-score-surfaces.ts <every id that refusal named>
```

The refusal already names exactly the set, so the emitter that blocks the bootstrap is
also what scopes it. **Run at `d3c6520a3`, after absorbing `#887`, it says:**

```
ENROLLED BUT UNMEASURED, so no rate can be emitted for: captureRenderFault,
reviewRoundInstant, mutationWeightRecords, mutationWeightWeights, replacementString.
Run the surface and read its rate, rather than guessing one. Nothing was written.
```

**FIVE surfaces, not the two an earlier draft hardcoded**, and only two of them are this
arc's. `replacementString` arrived with `#883`, `reviewRoundInstant` and
`captureRenderFault` with `#887`, and `#882` will add two more that are not in this list
yet. Deriving the set is what makes that a non-event instead of a mid-turn refusal.

Note the invocation needs the run's own modelled dump — `--run <dir>:<modelledJson>` —
because records taken at an older sha do not reconcile against today's registry, and
`reconcile` refuses rather than comparing a record set to a tree it did not come from.
That refusal is correct and is the same guard Task 4 makes rate-aware. Each rate is recorded with the run that produced it named beside the
value.
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

**LANDED.** `weightOf` returns `bootsOf(surface) * surface.millisPerBoot`, and the
`red-target` above cites the pre-implementation tree — `tests/mutation/source/shardPartition.ts:53`
held the unpriced `weightOf` at drafting and now lands on a brace. Recorded rather than
repointed, for the same reason the two earlier landed tasks carry the same note: a
red-target names the defect that made
the red real, and aiming it at today's code would describe no defect.

`bootsOf` keeps today's expression VERBATIM — it is `sourceShardPartition`'s control
anchor — and only `weightOf` changed.

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
wrong — and the FIRST attempt to pin it was itself false certification, which is worth
recording rather than quietly fixing.** That draft declared a plant mutating
`scripts/mutation-shard-weight-report.ts` and named `shardPartition.test.ts` as its
decider. Nothing drives the report, and that suite does not import it, so the mutation ran
against code the decider never loads. Probed at implementation: with the mutation applied
by hand, `shardPartition.test.ts` reports 11/11 passing. A plant whose decider cannot see
it is worse than no plant, because it reads as coverage — and this one was never even
added to the harness, so the plan asserted a Form A entry that did not exist.

The repair is not a better plant but a testable surface: the per-surface recovery is
extracted to `recoverModelled` in `lib/mutationWeight/weights.ts`, where the instrument
suite drives it directly and the two plants above mutate the code that suite actually
loads.

**The consumer itself:** `modelledFrom` in the report called `weightOf` and treated the result as raw
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
| A | `recoverModelled` derives the mutant count from a PRICED weight | `lib/mutationWeight/weights.ts` | `boots - acceptedCount * (suites - 1) - suites` | the same with `boots * millisPerBoot` | `instrument.test.ts` |
| A | `recoverModelled` drops the rate, so reconciliation falls back to 1 | `lib/mutationWeight/weights.ts` | the trailing `millisPerBoot,` of its return | `millisPerBoot: undefined,` | `instrument.test.ts` |
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
inverting there is the strongest of the three.

**DOCUMENTED LIMIT, found at implementation: the three FIXTURE plants cannot run through
the plant harness, and are verified by direct perturbation instead.** The harness works by
copying a target's directory and rewriting the deciding suite's IMPORT SPECIFIER to point
at the copy. `shardBalance.test.ts` loads its fixtures with `readFileSync` on a
repo-relative path, not by import, so there is no specifier to rewrite and a plant into the
scratch copy would be invisible — the suite would read the real fixture and report CAUGHT
for a mutation it never saw, which is worse than not planting at all. Rather than contort
the suite into importing JSON so a harness can redirect it, the three are perturbed
directly against the committed fixtures and restored. Verified at implementation, each
failing exactly one case: same-run seeding on pair 2, seeding pair 1's excluded arrival
`controlOutlineResidue`, and multiplying pair 2's heaviest seeded rate (`connectionCensus`)
by 8.33. The harness keeps the plants whose targets are reached by import; this is a limit
of the mechanism, recorded rather than papered over. **The `runAllSuites`-in-code entry is why
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

**LANDED at `0ba42979d`, reconciler half.** Same drift and the same treatment as Task 1:
`lib/mutationWeight/weights.ts:270` held `w: v.boots` at plan time and this task replaced
it, so the citation now lands on a comment. The half that has NOT landed is named at the
end of this task.

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

**STILL OWED, and held by the registry seam:** `modelledFrom` must also RECORD the rate
from the checked-out registry. That reads `GuardSurface.millisPerBoot`, which Task 2
creates, so it rides with Task 2 rather than being written defensively against a field
that does not exist. Until it lands, `reconcile` can consume a rate nothing ever supplies
it — the consumer is correct and its producer is missing, which is the quieter half of the
same defect.

**Commit:** `fix(mutation): reconcile a partition priced in milliseconds per boot`

## Task 5 — the drift report

<!-- task: red=`pnpm vitest run tests/ci/rateDrift.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:291` why=`the budget job has one step and downloads only elapsed artifacts, so no drift report exists to assert against` ac=AC-5 -->

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

**The eight WIRING plants run by direct perturbation, not through the harness**, for the
same reason as the held-out fixtures: `_metaSourceShardIntegrity` reads the workflow with
`readFileSync` on a repo-relative path, so there is no import specifier to redirect and a
plant into a scratch copy would be invisible. All eight were applied to the real workflow
and reverted, and every one failed the pin. The six SCRIPT plants do go through the
harness, because `driftCli.ts` sits under the default root and the deciding suite imports
it through the `@/` alias the harness rewrites.

**One of the six escaped on its first run, and the escape was the useful part.** Relabelling
the declared-but-unmeasured section as "drifted" left both surfaces reported on separate
lines, which is all the case originally checked — so a reader would have been told a stale
registry row had drifted. The assertion now pins what each section SAYS it is, and the
mutant is caught. A case that checks two things landed on different lines is not checking
that they are distinguishable.

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

<!-- task: red=`pnpm vitest run tests/mutation/_metaPreexistingSurfaceImmutability.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:181` why=`GUARD_SURFACES is the whole population and no assertion compares any of its pre-existing rows against their values at the merge base, so lowering a scoreFloor or adding an accepted row is invisible to every command this plan runs` ac=AC-7 -->

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

**A STALE SNAPSHOT CANNOT SILENTLY WEAKEN THIS, which is what makes the timing a
convenience rather than a correctness condition.** A snapshot older than the current merge
base is missing whatever main has enrolled since, so `live minus snapshot` stops equalling
this branch's own two ids and the additions check fails loudly, naming the surfaces it did
not expect. Regeneration is one command. Nothing in the guard shells out to git, so it also
works on a shallow CI checkout, where a merge-base call would not.

**The snapshot and both Form A anchors are regenerated AFTER each absorb, and the final one
after the registry seam closes.** Two other arcs are live registry writers — `#882` enrols two surfaces, and
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

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy:mutation pnpm tsx scripts/mutation-score-surfaces.ts sourceShardPartition mutationWeightRecords mutationWeightWeights` red-state=live red-target=`tests/mutation/source/registry.ts:3544` why=`mutationWeightWeights scored 0.7279 against this 0.90 floor with 37 unaccepted survivors, observed 2026-08-25` ac=AC-7 -->

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

## 12 — Closeout

<!-- No `impeccable-gate:` line here on purpose. The plan unit already declares it at
     line 6, and invariant 8's marker is per UNIT, not per section. A second copy in
     the same file is a second claim about the same thing, which is how two markers
     drift apart and the guard starts arbitrating between them. -->

### What the weight was actually wrong about

`weightOf` priced a leg by modelled CHILD BOOTS: `mutants + accepted * (suites - 1) + suites`.
That count is not wrong about the boots. Its unstated assumption is that every boot costs the
same, quoted in `runner.ts` at roughly 0.75 s.

Measured across the 52 enrolled surfaces, rates run from **762 ms per modelled boot**
(`supabaseRetryEligibility`) to **18212** (`psqlStartupScan`), a factor of **23.9**. The count
cannot see any of it, so the heaviest leg was being chosen by a number uncorrelated with what
that leg costs. The shipped repair is `bootsOf(surface) * surface.millisPerBoot`, with the old
formula preserved verbatim as `bootsOf` so the count remains available and exact.

**Those two figures rot, and this arc watched them do it.** The comment justifying the change
read "935 to 4963 ms per modelled boot, a 5.3x spread" — the min and max of the surfaces
enrolled the day it was written. Four later enrolments moved the max by 3.7x and nobody moved
the sentence, so the code understated the very problem it existed to justify. My own reports
carried a different stale pair, 762 to 5006, where 5006 is merely the fifth-highest. The repair
was the class rather than the literal: the comment now marks its figures as dated, records that
it has already rotted once, and carries the command that re-derives them from the registry.

### The re-partition seam, with its measured magnitude

Re-derived at claim time against the live registry, 52 surfaces at merge base
`e381de76ea87`, not carried from when this plan was written and the registry held 48. It was
re-derived a SECOND time after the absorb, and that mattered: `#890`, `#892` and `#894`
changed four surfaces' sources, which changes their mutant counts, which changes `bootsOf`,
which changes the LPT input. The headline held and the totals did not. `36 of 52` is
unchanged; the binding leg moved from 6452 s to 6467 s under boots and from 4660 s to 4666 s
under pricing, and the improvement from 1792 s to 1801 s. Numbers derived before an absorb
are numbers about a tree that is no longer shipping.

| | boots (shipped) | seconds (this diff) |
|---|---|---|
| legs, seconds | 4600 / 4842 / 2743 / 6467 | 4661 / 4664 / 4661 / 4666 |
| binding leg | 6467 s | 4666 s |

**36 of 52 surfaces change leg, 69 percent.** Pricing takes 1801 s off the binding leg,
up from the 719 s the same comparison gave at 48 surfaces, because the four surfaces main
enrolled since are not cheap ones. The 2740 next to the 6452 is the defect stated in two
numbers: under boots, one leg idles for three quarters of an hour while another runs long.

The seam is a one-time re-partition, and it is worth being plain that it does not fix the
budget. `SHARD_BUDGET_SECONDS` is 3600 and the binding leg is 4660, so four shards cannot
hold this corpus under EITHER weight. That breach is real, it is recorded as an executable
documented limit rather than a finding, and raising `SOURCE_SHARD_COUNT` from 4 to 6 is
held on the orchestrator list. This diff makes the legs level; it does not make them short.

### AC-7's proof retires here, and one half of its promise went unmet

The guard proved that no surface the merge base declared moved under this branch: not a
`scoreFloor`, not an `accepted` row, not an enrolment. It is deleted in this PR rather than
kept, because it pins a claim about ONE diff and would otherwise freeze the registry for
every arc after this one.

**It never ran in CI, and it never could have.** The plan promised the closeout would record
"the sha and CI run where the proof actually held." The CI half is unfulfillable and saying
so is better than citing a run that does not exist. The guard computes
`git merge-base origin/main HEAD`, and `actions/checkout` defaults to `fetch-depth: 1`, so
the CI checkout has no common history and no merge base exists. It failed loudly rather than
skipping, which was deliberate: its own comment argued that a check standing down on a
shallow checkout "stops existing in CI, which is the only place it matters." The reasoning
was right and its premise was wrong. What it reported loudly in CI was its own unrunnability,
on a required check, which is how this was found at all.

There is no fix inside the repo's own convention. `unit-suite.yml:110` and `:155` are the two
precedents for a test needing git history, and both fetch exactly ONE object or ONE ref at
depth 1 while explicitly refusing `fetch-depth: 0`, because full history regressed that gate
from 4.2 minutes back toward 9.1. Neither pattern yields a merge base. Buying one for a test
whose design is to be deleted at merge is the wrong trade, so it retired early instead.

**What the proof did establish is unchanged**, and it is more than a passing test: it passed
at the shipping tree, and it was made to FAIL on purpose once per case first, so its pass was
not vacuous. That probe is recorded below.

**What carries the claim in CI is AC-1**, and it is the stronger form. AC-7 asks whether a
pre-existing surface's registry ROW moved, in a local checkout. AC-1 asks whether a
pre-existing surface's VERDICTS moved, across two CI runs at one base. The second subsumes
the first for every purpose this arc cares about.

### Acceptance criteria, and where each is discharged

| AC | discharged by | state |
|---|---|---|
| AC-1 verdict neutrality | measurement over two CI runs, in this closeout | see below |
| AC-2 total and disjoint partition | `shardBalance.test.ts`, `_metaSourceShardIntegrity` at 52 surfaces | passing |
| AC-3 binding leg held out | three committed pairs of real CI runs, margins 965 s / 1191 s / 1160 s | passing |
| AC-4 no enrolment without a rate | `validateSurface` bounds, compile-time requirement | passing |
| AC-5 drift report names every measured surface | `rateDrift.test.ts`, exit status unchanged | passing |
| AC-6 integer arithmetic preserved | every weight handed to `lptAssign` is an integer | passing |
| AC-7 nothing verdict-deciding moved | `_metaPreexistingSurfaceImmutability`, 4 cases, shown to discriminate by 5 tampers | passed LOCALLY; retired early at `2f9ef9126`, never ran in CI — see below |

**AC-3's margins do not move with the absorb, and that is the point of holding them out.**
They come from three pairs of real CI runs at 41 to 42 surfaces (plan §480-482), priced
binding leg against boots binding leg: 5174 vs 6138, 5783 vs 6974, 5409 vs 6569. The suite
asserts it "reproduces the recorded margin from the fixture, not from `weightOf`", so these
are properties of committed historical measurements rather than of the live registry. They
are deliberately NOT the 52-surface figure quoted above; a held-out number that tracked the
tree would not be held out.

**AC-1, stated at claim time.** The three populations are re-derived from the diff at the
final merge base, never from the sentence that named them. Derived at `e381de76ea87`: 50
surfaces at the base, 52 live, none removed. Population (i), untouched and required to
keep every verdict, is 48. Population (ii), pre-existing and changed here, is 2. Population
(iii), newly enrolled with no prior verdict to compare, is `mutationWeightRecords` and
`mutationWeightWeights`. The three are disjoint and sum to 52.

**Population (ii) has two members, not the one the plan's sentence names, and they differ
in kind.** `sourceShardPartition` is the expected one and its SOURCE changed, so its
siteIds move. `premiseScan` is the other: its source is untouched and only a declared SUITE
changed, because this branch registers its new suite in
`tests/mutation/_metaPremiseContract.test.ts` with zero environment-touching tests, derived
from that scanner's definition rather than read off its output. So `premiseScan`'s siteIds
are fixed and only a verdict could flip. This is not a departure from the plan; it is the
plan followed. The same section that names `sourceShardPartition` also says to derive the
populations from the diff at claim time, "never from this sentence," and to state each count
with the ref it was derived at. An earlier derivation at the pre-absorb base gave 49/1/2,
which is why the instruction exists. The old-weight side is a FRESH
`workflow_dispatch` at that base; the earlier capture at `300a9f937` (run `32844208485`,
43 surfaces) is SUPERSEDED, not lost, because the merge base moved when `#881`, `#882`,
`#884` and `#893` landed. A later queued baseline was CANCELLED on bl-orch's ruling under
semaphore pressure, and the cancel is recorded here rather than left as a gap in the
record.

Both sides must carry the same trigger, verified with
`gh run view <id> --json event,headSha,conclusion` rather than assumed, because
`workflow_dispatch` and `pull_request` are separate populations on this repo. The bar is
sharp because it was measured first: 1 of 4328, 0 of 4360, 0 of 3692 movers across
consecutive nightlies, the single mover being the inherited `ledgerGit` survivor owned by
`BL-MUTATION-HARNESS-MAIN-RED`. Any other mover is re-run with its surface ALONE on a leg
before attribution: green alone and red beside a neighbour is a co-tenancy finding filed
there, red alone is this arc's.

Where the dispatch cannot be had against capacity, the fallback is a PARTITION-LEVEL
claim, and it is labelled weaker rather than dressed as verdict equality.

**The two runs, dispatched 2026-08-26T01:55Z.** Side A is main under the old weight, run
`32920754274` at `e381de76ea87`. Side B is this branch under the priced weight, run
`32920756364` at `c01ee5121`. Both are `workflow_dispatch`, which is what makes them
comparable. Side A's head is exactly the announced base, so the constraint that
`workflow_dispatch` takes a ref NAME rather than a sha never bit: main had not moved
between the announcement and the dispatch. Had it moved, the head check would have caught
it, which is why the check is run rather than assumed.

**The main side concluded FAILURE, and that is the evidence rather than a problem.**
Run `32920754274` at `e381de76ea87`, `workflow_dispatch`, on main's own tree with none of
this diff: `source-shards (0)` and `(1)` failed, `source-shards (3)` was CANCELLED, and the
`budget` job failed. All eight parser shards, `parser-gates`, `source-gates` and
`source-shards (2)` passed.

Three things follow, and one does not.

- **Non-causation is mechanical.** Main's failed log carries
  `source-mutation gate — modal-wait-disposition` as a failing case. The surface that
  failed on this branch fails without this branch. Nothing is argued.
- **The budget breach is main's, confirmed at this base.** The `budget` job failed on
  main's own run. That is `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`, which this arc reduces
  rather than causes.
- **A leg was CANCELLED on main today.** `source-shards (3)` reports cancelled, which is
  exactly the censored-leg mechanism the archived row describes: a leg that hits the job
  ceiling reports nothing for any surface it held. The defect that row documents is live at
  this very base, and the repricing is what shrinks it, 6467 s to 4666 s on the binding leg.
  That is a stronger argument for this change than any modelled figure in this document.
- **What does NOT follow:** `ledgerGit` appears zero times in main's failed log. That is
  consistent with the environment-dependence diagnosis above and is NOT proof of it, because
  `source-shards (3)` was cancelled and a cancelled leg reports nothing for any surface it
  held. Absence inside a censored leg is not absence. `ledgerGit` is therefore recorded as
  not-this-branch's rather than as proven main's, which is a weaker claim and the only one
  the evidence supports.

**THE RESULT: 4822 mutants compared across 48 surfaces, ONE verdict move, zero
timeout-tainted, zero unknowable.** The mover is
`ledgerGit logical-connector:259:20:&&>||`, SURVIVED to KILLED.

Three things converge on that one mutant, and together they settle it.

- **It is the bar's own known mover.** The bar was measured before the claim: 1 of 4328,
  0 of 4360, 0 of 3692 across consecutive nightlies, and the plan records that the single
  mover was "the inherited `ledgerGit` survivor owned by `BL-MUTATION-HARNESS-MAIN-RED`".
  Same surface, same site. One in 4822 sits inside the measured bar rather than outside it.
- **It is the site diagnosed hours earlier, from the source, before either CI run existed.**
  The local re-score failed `ledgerGit` with a stale row at this exact siteId, and the
  diagnosis from reading `ledger-git.ts` was environment dependence: it shells out to git ten
  times, and line 259 parses `<mode> blob <oid>\t<path>`. Three independent observations now
  exist — local KILLED, main CI SURVIVED, branch CI KILLED. The verdict varies with repo
  state, which is what was predicted.
- **The direction is the safe one.** SURVIVED to KILLED means this branch CAUGHT a mutant
  main let through. Whatever explains it, it is not the coverage regression AC-1 exists to
  detect; that failure mode runs the other way.

**Why re-running it alone cannot settle this one, stated rather than performed.** The
re-run-alone rule exists because the usual confound is CO-TENANCY. This surface's confound is
REPO STATE, which running it alone does not vary. Executing the ritual and reporting that it
"passed" would be a stronger-sounding claim resting on a test that cannot discriminate here.

**Two population (i) surfaces are NOT comparable, and are named rather than dropped:**
`retryableRpcVolatilityScan` and `supabaseRetryingFetch`. Main's record set holds 48 surfaces
rather than 52, because main's `source-shards (3)` was CANCELLED at the job ceiling and a
cancelled leg uploads nothing for any surface it held. So the neutrality claim covers 46 of
48 population (i) surfaces, and both gaps are caused by main's censored leg rather than by
this branch. The committed report REFUSED the incomplete sets outright — correct behaviour,
and the reason the comparison ran over an explicitly restricted, named population instead of
a silently truncated one.

Run `32844208485` at `300a9f937b8a`, 43 surfaces, is SUPERSEDED and recorded here rather
than left as a gap: its base stopped being the merge base once `#881`, `#882`, `#884` and
`#893` landed. A later queued baseline was CANCELLED under semaphore pressure on the
orchestrator's ruling, and that is recorded too.

### Scores
Every surface, with its mutant count beside its score. The two columns differ on purpose:
`score` CREDITS a ledgered survivor, `survivors` is the raw count. `acCoverage` reading
1.0000 with 4 survivors is correct, not a defect, and a table printing only one of them
would mislead in one direction or the other.

| surface | passed | score | mutants | survivors (raw) | timeout-kills |
|---|---|---|---|---|---|
| `acCoverage` | yes | 1.0000 | 72 | 4 | 1 |
| `browserMutate` | yes | 1.0000 | 40 | 1 |  |
| `browserRegistry` | yes | 1.0000 | 57 | 0 |  |
| `captureRenderFault` | yes | 1.0000 | 6 | 0 |  |
| `citationIntent` | yes | 1.0000 | 21 | 0 |  |
| `claimSweep` | yes | 1.0000 | 106 | 7 |  |
| `connectionCensus` | yes | 1.0000 | 333 | 2 | 8 |
| `controlOutlineResidue` | yes | 1.0000 | 250 | 14 |  |
| `controlOutlineScan` | yes | 1.0000 | 65 | 0 |  |
| `declaredLimitPins` | yes | 1.0000 | 113 | 5 |  |
| `destructiveFileAnalysis` | yes | 1.0000 | 237 | 8 |  |
| `executionMethodsDerivation` | yes | 1.0000 | 11 | 0 |  |
| `fieldNearMiss` | yes | 0.9722 | 37 | 2 |  |
| `fixtureContract` | yes | 1.0000 | 65 | 2 |  |
| `heavyReapClassify` | yes | 1.0000 | 17 | 0 |  |
| `interactionTimingScan` | yes | 1.0000 | 148 | 17 |  |
| `interactiveScanCore` | yes | 1.0000 | 272 | 11 | 1 |
| `ledgerClaimsCore` | yes | 1.0000 | 63 | 3 |  |
| `ledgerGit` | **no** | 1.0000 | 99 | 6 |  |
| `modal-wait-disposition` | **no** | 0.9853 | 68 | 1 |  |
| `modal-wait-helper-scan` | yes | 1.0000 | 97 | 2 | 1 |
| `mutationSurfaceEnumerate` | yes | 1.0000 | 249 | 3 | 1 |
| `mutationSurfaceTotality` | yes | 1.0000 | 20 | 0 |  |
| `mutationWeightRecords` | **no** | 0.6842 | 20 | 7 |  |
| `mutationWeightWeights` | yes | 1.0000 | 157 | 8 |  |
| `paneCompactionCore` | yes | 1.0000 | 212 | 6 |  |
| `pgCronSmokes` | yes | 1.0000 | 14 | 0 |  |
| `phantomGapExecuted` | yes | 1.0000 | 13 | 0 |  |
| `popoverOverlayExtract` | yes | 1.0000 | 78 | 2 |  |
| `premiseScan` | yes | 1.0000 | 193 | 2 |  |
| `psqlStartupScan` | yes | 1.0000 | 81 | 31 |  |
| `redContract` | yes | 1.0000 | 246 | 7 |  |
| `renderedTextHaystack` | yes | 1.0000 | 17 | 0 |  |
| `replacementString` | yes | 1.0000 | 31 | 0 |  |
| `retryableRpcVolatilityScan` | yes | 1.0000 | 54 | 0 |  |
| `reviewRoundCorpus` | yes | 1.0000 | 123 | 3 |  |
| `reviewRoundCount` | yes | 1.0000 | 15 | 0 |  |
| `reviewRoundFiling` | yes | 1.0000 | 93 | 8 |  |
| `reviewRoundInstant` | yes | 1.0000 | 67 | 16 |  |
| `rowScanOpener` | yes | 1.0000 | 17 | 2 |  |
| `sameOriginServerAction` | yes | 1.0000 | 13 | 0 |  |
| `sendAuthScan` | yes | 1.0000 | 291 | 0 | 4 |
| `serializeErrorStructure` | yes | 1.0000 | 65 | 0 |  |
| `shardBudget` | yes | 1.0000 | 31 | 0 |  |
| `sourceShardPartition` | yes | 1.0000 | 4 | 0 |  |
| `spawnBounded` | yes | 1.0000 | 12 | 0 |  |
| `specLintNumerics` | yes | 1.0000 | 520 | 50 |  |
| `specLintUniversals` | yes | 1.0000 | 114 | 6 |  |
| `supabaseRetryEligibility` | yes | 1.0000 | 13 | 0 |  |
| `supabaseRetryingFetch` | yes | 1.0000 | 48 | 0 |  |
| `tapTargetScan` | yes | 1.0000 | 1 | 0 |  |
| `taskContract` | yes | 1.0000 | 115 | 22 |  |

surfaces scored: 52
failing: ledgerGit, modal-wait-disposition, mutationWeightRecords
total timeout-kills (deciding child): 16

**Two rows above are SUPERSEDED and must be read from the re-run, not from here.**
`mutationWeightRecords` is the below-floor failure this arc repaired, and
`mutationWeightWeights` had its score invalidated by that same repair, because
`instrument.test.ts` is a declared suite of BOTH. Re-scored alone at `a66f465c7` through
the gate's own code path:

| surface | passed | mutants | killed | survivors (all ledgered) | timeout-kills |
|---|---|---|---|---|---|
| `mutationWeightWeights` | yes | 157 | 149 | 8 | 0 |
| `mutationWeightRecords` | yes | 20 | 18 | 2 | 0 |

Both at 1.0000 with every survivor carrying a row, no unaccepted survivor and no stale row
in either direction, and no timeout on either surface. `records` moved from 0.6842 with six
unaccepted survivors to this; `weights` returned the same 157/8 it had before the suite
edit, which is the point of re-running it rather than assuming an edit to a shared suite
left it alone.

The re-run went through `runSurface` + `evaluateGate` directly rather than a scratch test
file, because `registerSurfaceCases` is pinned to one call per shard file and a new file
calling it would trip a structural guard. Same code path, one layer down.

**The tree changed while the score was being taken, and that is provably harmless rather
than merely probably.** The AC-7 retirement landed mid-run, so surfaces scored before it saw
a different checkout from surfaces scored after. Whether that tears the measurement is a
decidable question here, not a judgement call, because `stampInputs` stamps each surface's
own `sourcePath` plus `suitePaths` rather than the tree. Deriving the declared set and
intersecting it with that commit's four changed files gives zero surfaces disturbed, with
`registry.ts` and `expectedLedgerKinds.ts` both untouched. Every surface's stamped inputs
are byte-identical across both heads, so the score stands for the shipping head.

**One surface fails, and it is not this branch's.** `modal-wait-disposition` scores
0.9853 over 68 mutants, which is ABOVE its 0.95 floor, so the failure is an unaccepted
survivor rather than a floor breach. The survivor is `logical-connector:502:42`, flipping
`&&` to `||` in `tests/ci/modalWaitHelper/disposition.ts`.

Two independent proofs it is not this branch's. The surface is in population (i), and none
of its three declared inputs appears in this diff. And the survivor sits on code this
branch never saw: the line is byte-identical at the pre-`#892` base, where it was line
500. `#892` inserted two comment lines above it, so the site id reads as new when only the
NUMBER moved.

**A prediction made earlier in this arc was too narrow, and recording that is more useful
than recording the conclusion.** Before absorbing, `#892` was analysed and cleared on three
checks: the row is `accepted: []` so nothing could go stale, the `expectedCount` literal
count is 26 on both sides so no new site appeared, and both deciding suites pin that field
by count drift. The first two hold. The third was true of the LITERALS and was generalised
to the whole surface. The actual survivor is on code `#892` did not touch, whose killer
would have been a count assertion whose expected VALUE `#892` changed, 17 to 18 and 18 to
19. Analysing the changed lines is not the same as analysing the surface's mutant
population. The conclusion happened to hold; the reasoning offered for it did not cover
the path that produced the failure.

Routed to a hotfix arc by the orchestrator rather than repaired here, and deliberately not
filed as a ledger row. `mutation-harness` is not a required check, so it blocks nothing.

**A second surface fails, also main's, and it is the OTHER direction of the same contract.**
`ledgerGit` scores 1.0000 over 99 mutants and still fails. Every one of its 6 survivors is
ledgered, so it is neither below-floor nor unaccepted-survivor. It carries SEVEN accept rows
for SIX survivors, and the orphan is `accepted-gap logical-connector:259:20:&&>||` — a row
whose mutant no longer survives, so it accepts nothing. That is `stale-ledger-row`, and a
perfect score sitting on a failing gate is precisely why this direction is the one that gets
missed. The two failures together are the whole contract demonstrated on main's own surfaces:
one survivor with no row, one row with no survivor.

Neither is attributable to this range. None of `ledgerGit`'s three declared inputs appears in
this diff or in the absorb.

**And the cause is worth more than the attribution.** `scripts/lib/ledger-git.ts` shells out
to git ten times, and line 259 parses `<mode> blob <oid>\t<path>`. Whether that mutant
survives depends on what git actually returns — refs, branches, tree contents. This
worktree's git state is not CI's, and neither is whatever state the row was recorded against.
So the surface's verdicts are environment-dependent by construction, and one of its rows can
go stale with nobody touching a line of code. Reporting it as a defect someone introduced
would be the wrong diagnosis and would send the next reader looking for a commit that does
not exist.

### Review-round dispositions
Twelve counted rounds across sixteen dispatches, seventy-nine declared findings. The diff
stage ran split tight-scope reviews, two dispatches per round, which is why it shows eight
rows for four rounds.

| stage | rounds | findings | last verdict |
|---|---|---|---|
| spec | 4 | 21 | NEEDS-ATTENTION / 4 |
| plan | 4 | 35 | BLOCKING / 8 |
| diff | 4 (8 dispatches) | 23 | NEEDS-ATTENTION / 1 and BLOCKING / 1 |

**No round returned APPROVE, and that is the honest close.** Every round's findings were
repaired in a named commit (`58ec7cb2d` seven, `d51440ef8` nine, `01963569c` five,
`bbada33dc` round four), but the arc closes at the four-round cap under bl-orch's ruling
rather than on a converged verdict, so there is no independent APPROVE on the final
repairs. Anyone reading this later should weigh it that way.

The round economy is filed where the corpus expects it, in
`docs/review-rounds/fix/mutation-shard-weight-seconds/`, across two merge-base files
because the arc merged main mid-flight and the rows are keyed by merge base. Counting
rounds from one file alone would undercount this arc; the filing is voluntary for exactly
that reason.

### One defect this closeout caught in itself

The score reported here is heavy turn 7, not turn 4. Turn 4 scored at 17:14 and commit
`01963569c` at 18:39 then changed both mutation targets and the shared deciding suite.
A score taken before its own target measures a tree that no longer exists, and because
accepted-survivor rows are keyed `operator:line:col`, moved lines silently convert
ledgered survivors into unaccepted ones. The turn-4 numbers were one step from being
reported as current. What did NOT cause it is worth recording too: the registry slices of
both surfaces were diffed scored-against-head and are byte-identical, and the absorb of
`ae8e9544b` touched neither target nor deciding suite. The staleness was entirely
self-inflicted by the repair, not inherited from main.

Turn 6 was the rescore that staleness prompted, and it was killed at twelve minutes
rather than run to completion. Before letting it spend another hour I asked what its gate
would say, and `pnpm mutation:sites` answered statically in seconds: two accepted rows
pointed at coordinates the round-3 repair had moved out from under them, so
`weights.ts:431` resolved to a comment closer and `records.ts:86` to prose. Neither an
`integer-literal` nor a `statement-removal` mutant can exist at either site, so the run
was already committed to a `stale-ledger-row` failure at `gate.ts:122`. Killing it cost
twelve minutes and saved fifty. The kill went to the process GROUP, not the wrapper: a
killed wrapper leaves the vitest worker reparented to PID 1, still holding its heavy
slot. Verified zero processes in the group, both pids dead, and slot-0's flock actually
free by taking it non-blocking rather than trusting the slot file. Both rows were then
re-anchored to the same sites at their new coordinates in `3507d48b6`, arguments
untouched, and all nine resolve with zero stale.

This is the quieter half of the accept-list contract. A survivor with no ledger row is
loud, because something is unaccounted for. A ledger row whose site no longer survives
accepts nothing, and can drift onto a different site and accept that one instead. The
gate treats both as hard failures, so a full run would have caught it eventually; asking
the question statically caught it for the price of one command.


### An absorb that arrived mid-flight, and why it owed nothing

`#892` merged to main as `d04d6370985f` while turn 7 was scoring, twenty-seven commits
past this branch's base. It touches one enrolled mutation surface, and that surface is
main's rather than this branch's: `tests/ci/modalWaitHelper/disposition.ts`
(`registry.ts:549`, `modal-wait-disposition`), four comment lines inserted and two
`expectedCount` literals bumped. That is the shape that has broken other arcs' guards
from a sibling merge, so it was worth settling before the fold rather than discovering
after it. Three checks settle it, all read-only:

- The row is `accepted: []`. Zero coordinate-keyed rows, so the `+2`/`+4` line drift
  below the edit points has nothing to invalidate. This is precisely the class repaired
  on this branch's own two surfaces above, and it does not recur here.
- The site count is unchanged, twenty-six `expectedCount:` literals at the base and
  twenty-six on main. The change moved values, it did not add sites, so the
  `integer-literal` mutant population is the same size.
- Both deciding suites pin the field by count drift
  (`tests/ci/_metaModalWaitHelper.test.ts:422`,
  `tests/ci/_metaModalWaitCandidateV2.test.ts:109`, each comparing
  `actual !== rule.expectedCount`), so a mutant on either literal is killed.

The range also touches none of this branch's three scored targets and none of their
deciding suites, so folding it does not void turn 7's score. Net: no rescore is owed on
`#892`'s account.

One warning strengthens rather than clears. `tests/ci/_metaModalWaitHelper.test.ts` is
the decider for both modal-wait surfaces and is the suite that hit a 180008 ms
timeout-kill during turn 6. A timeout verdict tracks runner load, not the suite, so the
same mutant can score either way with no code change at all. `#892` adds two more e2e
candidates to the corpus that suite scans. Since this arc repacks legs for 36 of 52
surfaces by design, it perturbs co-tenancy more than an ordinary diff does, which makes a
timeout-sensitive surface likelier to move for reasons that have nothing to do with the
weight. That surface sits in AC-1 population (i), so the rule stands: any mover there is
re-run with its surface alone on a leg before any attribution. Presumption is not
attribution.

### AC-7's guard was made to fail on purpose

A guard that has never failed is a guard nobody has tested, so before AC-7's pass was
reported it was made to fail on purpose, once per case, each tamper shaped like the
defect that case exists to catch. A no-defect baseline ran first and last.

| tamper | expected to red | result |
|---|---|---|
| `baseSha` set to a non-sha | the base case, on shape | red, plus the added-surfaces case |
| `baseSha` set to a real but wrong sha | the base case, on the claim | red, plus the added-surfaces case |
| `rows` emptied | the premise case | red; the row-equality case passed, vacuously |
| one recorded `scoreFloor` moved | the row-equality case | red, naming the surface |
| one recorded row dropped | the added-surfaces case | red |

Every run also reconciled its own counts, failing if any of the four cases was ABSENT
rather than merely passing, because an uncollected case reads exactly like a passing one.
The fixture came back byte-identical and the closing baseline was clean.

**The probe corrected me twice, and the guard was right both times.** I expected only the
base case to red on a corrupted `baseSha`; the added-surfaces case reds too, because it
derives the added set with `addedByThisBranch(snapshot.baseSha)` and cannot survive a base
it cannot resolve. That coupling is a feature: a corrupted base fails loudly in two places
instead of being quietly routed around. I also asserted that restoring the fixture left
`git status` clean, which is the wrong oracle right after a regeneration, when the file is
legitimately uncommitted. The byte comparison against the pre-probe content is the right
one, and it held.

The third tamper is the one worth keeping in mind. Emptying `rows` leaves the row-equality
case passing over an empty loop. That is precisely why the premise case sits outside any
`.each`, and the probe records the vacuous pass rather than hiding it.


### Four timeouts, two meanings, and why the count alone would mislead

A child that hits the 180 s ceiling scores KILLED, following Stryker and PIT. The reflex is to
treat every such verdict as unscored. This run shows why that reflex is wrong in both
directions.

| surface | site | what the mutant does | verdict |
|---|---|---|---|
| `modal-wait-helper-scan` | `statement-removal:413:5` | deletes `current = current.parent` from a `while (current !== undefined)` loop | cannot terminate — KILLED is honest |
| `interactiveScanCore` | `statement-removal:565:5` | deletes `cursor = cursor.parent`, the last statement in a `while` body | cannot terminate — KILLED is honest |
| `mutationSurfaceEnumerate` | `statement-removal:90:5` | deletes `n = n.parent`, the last statement in a walk loop | cannot terminate — KILLED is honest |
| `acCoverage` | `integer-literal:77:50` | `indexOf(path, i + 1)` becomes `i + 2`; the loop still advances | terminates fine — the timeout is a LOAD artifact and the verdict is UNPROVEN |

THREE of the four are deleted tree-walk advances — `current = current.parent`,
`cursor = cursor.parent`, `n = n.parent` — each the last statement in its loop body. They hang
at any load, on any machine, which is why the first reproduced at the identical site across
three separate runs rather than wandering. That is not a coincidence: `statement-removal`
applied to a walk's advance produces a non-terminating mutant every time, so this class is
predictable, and it costs a full 180 s ceiling per instance. Nine minutes of this run went to
mutants that were guaranteed to hang before they started. Re-running either alone would spin for 180 s and prove nothing. The third
terminates in normal time and was killed by the clock under roughly 100-way contention; it is
the one real instance of the upward score bias, since a mutant that might have survived was
recorded as killed.

So the rule this arc applies is **read the mutant, not the clock**. A deleted loop advance, a
removed `break`, or a flipped termination condition is non-termination and is honestly killed.
Anything else is a genuine re-run candidate, re-run with its surface ALONE on a leg, because
the confound is co-tenancy and re-running beside the same neighbours proves nothing. A policy
keyed on "timeout implies unscored" would have mis-scored all four — three as unproven when
they are settled, one as settled when it is unproven.

All four surfaces are population (i), untouched by this diff, so all four are main's and none
is re-run here. The predictability of the walk-advance class is recorded here as a documented
limit of the harness rather than filed as a row, per the process-facing mint freeze.

### AC-1 is measured, and the instrument was made to fail before it was believed

The neutrality claim is settled by dispatching `mutation-harness.yml` on both refs at one
merge base and comparing the uploaded `.mutation-records/` per surface per mutant. The
comparison itself is not new code: `verdictDelta` (`lib/mutationWeight/weights.ts:557`) is
committed and tested (`tests/mutationWeight/instrument.test.ts:1206`), and
`scripts/mutation-shard-weight-report.ts` drives it. It already restricts to shared
siteIds and already returns the shared counts alongside the moves, for the reason its own
comment gives: a comparison over almost nothing must not read as a clean result. The
records carry more than the verdict: each `MutantOutcome` persists
`children[].kind` as `"exit"` or `"timeout"` (`tests/mutation/source/runner.ts:42`,
written at `:171`). That matters because a child which hits the wall-clock ceiling scores
KILLED by convention, following Stryker and PIT, and that verdict tracks runner load
rather than the suite's judgment. So every mutant lands in one of five classes: verdict
unchanged; verdict moved with neither side timing out, which is the only real signal;
verdict moved where either side timed out, reported as its own number and never folded
into the other two; site present on one side only; and timeout-unknowable, where
`children` is absent, which is the honest value for the browser runner because it spawns
no per-suite children at all.

Four controls were run against real records before any of it was trusted, because an
instrument that bounds its own output is the kind that produces a confident wrong number.

- A side compared against itself: 0 moves over 334 mutants.
- A clean verdict flip on a mutant that did not time out: detected as a move.
- The same flip on the timeout-bearing mutant: classified as tainted, not as a move.
- Empty populations: exits without issuing a verdict.

The fourth control exists because the third revealed a real defect, and it was found by
running the thing rather than by reading it. The first version printed
`VERDICT NEUTRAL: YES` for two populations while having compared exactly zero mutants.
Every input check passed; the happy answer was simply reachable by the shortest path,
through an empty population list, a mistyped directory, or an artifact that failed to
download. Neutrality is a claim about mutants that were actually compared, so the count is
now asserted before the claim is made: mutants compared must exceed zero, and surfaces
found on both sides must equal surfaces declared.

**The timeout confound is systematic rather than incidental, and it is a documented limit
here rather than a ledger row.** Heavy turns 6 and 7 both hit the 180 s ceiling on
`tests/ci/_metaModalWaitHelper.test.ts`, at different mutant sites, and that suite is the
declared decider for both modal-wait surfaces (`registry.ts:475` and `:551`), both of
which sit in the untouched population. The cost is concrete: `modal-wait-helper-scan`
scores a clean 1.000 over 97 mutants, and exactly one of those verdicts was produced by
wall clock rather than by the suite. The measurement above reports such a mutant as its
own class instead of counting it as evidence in either direction, which is the whole
repair. Under the process-facing mint freeze this is recorded against the surface that
owns it and files nothing new.
