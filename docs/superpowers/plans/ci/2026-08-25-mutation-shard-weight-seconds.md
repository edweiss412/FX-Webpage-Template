# Plan — price the source-mutation shard partition in seconds

**Spec:** `docs/superpowers/specs/ci/2026-08-25-mutation-shard-weight-seconds-design.md`
**Row:** `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` · **Branch:** `fix/mutation-shard-weight-seconds`

impeccable-gate: N/A — no UI surface

## What is already on the branch, and why the plan starts where it does

The measurement instrument (`lib/mutationWeight/{records,weights}.ts`, `scripts/mutation-shard-weight-report.ts`), its suite (`tests/mutationWeight/instrument.test.ts`, 28 cases), its plant harness (`scripts/mutation-weight-plant.mjs`, 15 planted defects, 15 caught) and its two registry rows all landed during the spec phase. That was not optional: every figure in the spec comes out of that instrument, so it is a spec input, and spec review found four defects in it across two rounds. Shipping it without tests or enrolment would have left an invariant-1 P0 standing on the branch that no later plan could cure.

So the plan below starts at the weight change itself. Tasks that touch the instrument EXTEND an existing suite and an existing plant list rather than creating them.

## Earning RED on code that already exists

For a task on existing code, "write a failing test" is unavailable: a test written against working code passes on its first run and proves nothing. Every such task instead earns its RED by **adding the planted defect to `scripts/mutation-weight-plant.mjs` FIRST**, watching that harness report ESCAPED, then adding the assertion and watching it report CAUGHT. The harness is the RED signal, and it already refuses to score an unapplied plant or a non-compiling mutant as a pass.

Tasks on code that does not exist yet are ordinary test-first.

## Pre-draft code-verification pass

| claim | verified at |
| --- | --- |
| `bootsOf` holds the expression at `tests/mutation/source/shardPartition.ts:45`, and `weightOf` wraps it at `tests/mutation/source/shardPartition.ts:53` | both verified by `grep -n` |
| `validateSurface` returns a problems list and range-guards a numeric field already | `tests/mutation/source/registry.ts:56` |
| the `reject` helper exists at `tests/mutation/_metaGuardSurfaceRegistry.test.ts:35`, and `tests/mutation/_metaGuardSurfaceRegistry.test.ts:41` runs it over every row | both verified by `grep -n` |
| `sourceShardPartition`'s control anchor sits INSIDE the body task 2 rewrites | `tests/mutation/source/registry.ts`, row `sourceShardPartition` |
| that row already documents the self-consistent-mutant trap for constants | same row's comment |
| `lptAssign` documents integer arithmetic | `tests/parser/mutation/shardPartition.ts:17` |
| the env mapping is pinned at `tests/mutation/_metaSourceShardIntegrity.test.ts:274` and the whole `run:` command at `tests/mutation/_metaSourceShardIntegrity.test.ts:282`, both by equality | both verified by `grep -n` |
| `check-shard-budget.ts` deliberately decides nothing and takes env, not argv | that file's header |
| no file under `lib/` imports `tests/` | `rg` over `lib/` |
| enrolling a surface owes TWO further registrations | `tests/mutation/source/expectedLedgerKinds.ts` (per surface) and `tests/mutation/_metaPremiseContract.test.ts:32` (per suite) — both caught this arc by failing |

Line numbers are drafting-time locators and rot at every merge; each is anchored to a
searchable symbol beside it, and re-verified only when the claim it supports is in
question.

## Meta-test inventory (mandatory declaration)

**Creates:** none. **Extends:** four, and every one of them is a registry this arc
already had to satisfy, which is why they are named rather than discovered later.

| meta-test | what this arc adds to it |
| --- | --- |
| `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | `millisPerBoot` range arms in the existing `reject(patch)` harness |
| `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` | two rows in `expectedLedgerKinds.ts`, already landed |
| `tests/mutation/_metaPremiseContract.test.ts` | one per-suite env-touching count, already landed |
| `tests/mutation/_metaSourceShardIntegrity.test.ts` | the drift step's `env:` mapping and whole `run:` command, pinned by equality |

**Not applicable, declared rather than omitted:** no advisory-lock topology (the diff
touches no `pg_advisory*`), no layout-dimensions task and no transition inventory (no
UI surface), no e2e harness (no Playwright), and no Supabase call boundary.

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
its 30 defects are not a claim about operator coverage.

## Reconciliations, RUN at plan time and pasted

Not "a check to perform later". These are the outputs, today, on the live tree.

**Registry against the seed table** — the input to Task 1:

```
GUARD_SURFACES rows: 45
seed table rates:    43
rows with NO seeded rate: ['mutationWeightRecords', 'mutationWeightWeights']
seeded rates with NO row: []
```

The two unseeded rows are the surfaces this arc enrolled, which have never been
measured. That is the bootstrap the spec's §2.4.1 describes, not a gap: Task 1 is
BLOCKED until the score run supplies their rates, and `--emit-registry` refuses to emit
a partial table rather than inventing them.

**`EXPECTED_LEDGER_KINDS` against the registry** — already reconciled:

```
registry 45, ledger-kinds 45, registry-not-declared [], declared-not-registry []
```

**Current state of every planned `red=` command**, which is why all seven are
`red-state=authored` rather than `live`:

```
  PASSES today: tests/mutation/_metaGuardSurfaceRegistry.test.ts
  PASSES today: tests/mutation/source/shardPartition.test.ts
  ABSENT: tests/mutation/source/shardBalance.test.ts
  ABSENT: tests/ci/rateDrift.test.ts
  ABSENT: tests/mutationWeight/verdictNeutrality.test.ts
  ABSENT: scripts/check-rate-drift.ts
```

No `red=` here asserts a currently-failing tree, so none is run at plan time; each
instead names the production line whose absence or defect will make its new case fail,
and each `red-target=` below was verified by READING the cited line rather than by
confirming it resolves.

## The acceptance criteria these tasks discharge

Restated here rather than left as bare ids in the task markers, so a reader can check a
task against its criterion without opening the spec. The spec is authoritative for the
wording; this is the index.

| id | what it requires |
| --- | --- |
| **AC-1** | Verdict neutrality over three populations that are not one population: untouched surfaces keep every verdict, `sourceShardPartition` keeps no unaccepted survivor and its floor, and the two newly enrolled modules meet their floor with no prior verdict to compare. Both sides of the comparison come from the same trigger. |
| **AC-2** | The partition stays total and disjoint over whatever registry size is live at merge. |
| **AC-3** | On every held-out pair, the binding leg under the seconds-calibrated weight is at or below the shipped model's on the same target and the same scored population. |
| **AC-4** | A surface cannot enrol without a rate: absent fails to compile, and out-of-range fails a named test. |
| **AC-5** | The drift report names every measured surface, marks which are actionable, keeps declared-but-unmeasured and measured-but-undeclared distinct, and changes no exit status. |
| **AC-6** | Every weight handed to `lptAssign` is an integer, so its documented platform-independence stays true. |
| **AC-7** | No verdict-deciding input moves for a surface enrolled before this diff. |

<!-- tasks: depth=2 red-contract -->

## Task 1 — `millisPerBoot` becomes a required field, guarded over the whole registry

<!-- task: red=`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:56` why=`validateSurface accepts a surface with no millisPerBoot, so the new range arms have nothing to reject` ac=AC-4 -->

Add the field to `GuardSurface`, seed every live row from `--emit-registry`, extend `validateSurface`.

Absent is a compile error, not a test. The runtime arms are rows in the existing `reject(patch)` harness: `0`, negative, `NaN`, non-integer, and above `MUTANT_TIMEOUT_MS`. The guard iterates `GUARD_SURFACES`, so a surface enrolled later is covered without an edit.

Seeding is mechanical and asserted: the insertion script keys on each row's `id`, requires every seeded surface to match exactly once, and refuses to run if the registry holds a row it cannot place or the seed holds a rate matching no row. A partial application here is the enrolment cliff by another route.

## Task 2 — `bootsOf` extraction and the new `weightOf`

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:53` why=`weightOf returns bootsOf(surface) with no rate applied, so the delta case sees 4 rather than 4 x millisPerBoot` ac=AC-6,AC-2 -->

Export `bootsOf` with today's expression VERBATIM, and make `weightOf` the product.

**Verbatim is a requirement, not an accident.** `sourceShardPartition`'s registry row uses `"surface.accepted.length * (suites - 1) + suites"` as its control anchor, and `validateSurface` rejects a row whose anchor does not occur exactly once. Reformatting that line breaks enrolment, and the failure reads as an unrelated registry error.

The existing delta case becomes `4 * millisPerBoot`, still derived from the fixture rather than hardcoded.

**Its discriminating power depends on a fixture value, so the fixture CONSTRUCTS that value rather than hoping for it.** Under a `*`-to-`+` mutant the delta is `4` instead of `4 * rate`, so the two are distinguishable only when the fake surface's rate is not 1. `tests/_shared/premise.ts` is explicit that where the environment can be constructed you construct it rather than writing a premise that reds, so the fixture sets a distinctive rate outright and `premiseHolds` stands behind it as the executable statement of why that value matters. Left to a default, one edit to the fixture would destroy the discriminator while the test kept passing — the same self-consistent-mutant trap the `sourceShardPartition` row already documents about `SOURCE_SHARD_COUNT`, and the reason that row carries two deciding suites.

New assertion: every weight handed to `lptAssign` is an integer.

Also here, since the suite is where it belongs: a source-scan assertion that the module header no longer claims "NO committed weight table" and no longer names `runAllSuites`, which does not exist.

## Task 3 — the binding-leg bound, held out

<!-- task: red=`pnpm vitest run tests/mutation/source/shardBalance.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:53` why=`the same unapplied rate makes the seconds-calibrated partition identical to the shipped one, so the binding-leg margin is zero` ac=AC-3 -->

Committed dated fixtures: rates seeded from one run, per-surface seconds from a LATER one. Assert the binding leg under the seconds-calibrated weight is at or below what the boot-count model produces ON THE SAME TARGET over the SAME scored population, for all three available pairs.

Two constructions are forbidden and the test pins both: seeding and scoring on one run, and pricing a seed-unknown surface from the scored run's own rate. The second is the defect review caught, and the fixtures include a pair with an arrival so the exclusion path is exercised rather than assumed.

The expectation comes from the SECONDS FIXTURE, never from `weightOf` — an expectation derived from the thing under test cannot notice a rate mutant.

Plant: perturb one seeded rate by the observed 8.33x and the margin inverts.

## Task 4 — the drift report

<!-- task: red=`pnpm vitest run tests/ci/rateDrift.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:273` why=`the budget job has one step and downloads only elapsed artifacts, so no drift report exists to assert against` ac=AC-5 -->

A NEW drift-check script beside the budget checker, added by this task and named for what it does, not an extension of the budget checker: that file's header states it decides nothing and takes environment rather than argv as the class repair for three rounds of argv-guard defects, and the new script mirrors both properties. The registry read stays in the script; `driftReport` already takes the declared rates as a plain map, so nothing under `lib/` imports `tests/`.

The `budget` job gains the records download and a second step. `_metaSourceShardIntegrity` pins the new step's `env:` mapping and its WHOLE `run:` command by equality, mirroring the existing budget-check assertions, because a shell assignment prefix in `run:` shadows the step's `env:` and a guard reading only the mapping is fail-open.

Arms: every measured surface named whatever its ratio; actionable marked separately; declared-but-unmeasured and measured-but-undeclared as two distinct states; and the process exit status identical with and without drift.

## Task 5 — re-score every surface this diff moved

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm tsx scripts/mutation-score-surfaces.ts mutationWeightRecords mutationWeightWeights` red-state=live red-target=`lib/mutationWeight/weights.ts:302` why=`mutationWeightWeights scores 0.7279 against its 0.90 floor with 37 unaccepted survivors, observed 2026-08-25` ac=AC-7 -->

Three surfaces have moved: `sourceShardPartition` (its source is edited), and `mutationWeightRecords`/`mutationWeightWeights` (their source gains nothing but their partition changes). Re-score, record each score with the `OPERATORS:` tail, and reconcile every ledger.

**The starting point is measured and the marker's `why=` cites it: 0.7279 against a 0.90 floor, 37 unaccepted survivors, observed 2026-08-25.** That figure is DATED and already partly superseded — two kill passes have landed since it was taken, closing thirteen of those survivors by fixture. It is kept as the observation that justifies `red-state=live` rather than updated on paper, because the number that replaces it comes from a run, not from arithmetic over what I believe I fixed.

The triage order is the orchestrator's and is not mine to reorder:

1. **Kill** what the suite should pin. Thirteen so far, and every one was the same shape: a fixture with one element, where a sort and its absence are indistinguishable.
2. **Delete** code the gate has just proved unnecessary — a defensive branch for an input that cannot occur, a sort no consumer needs. A gate that cannot kill dead code is telling you it is dead.
3. **Ledger** only what survives both, each with a MECHANISM argument: no input distinguishes the mutant from the original. Never an unreachable-on-corpus observation, which is a statement about today's inputs rather than about the program.

**Step 2 is expected to be nearly empty here, and that is a finding rather than a skip.** The residue is dominated by `?? 0` coalesces that `noUncheckedIndexedAccess` REQUIRES on every indexed read; they are compiler-mandated rather than chosen, and they do not compile away. Their equivalence argument is that the index is proven in range by the guard immediately above, so the default operand is never evaluated.

ONE slot turn measures the final state. An intermediate measurement would cost a second turn under `slots=1` and describe a tree that never ships.

Check the binding leg against budget before and after enrolment. This arc's own modules are the first customers of its design and must not be the surfaces that breach it.

## Task 6 — verdict neutrality over three populations

<!-- task: red=`pnpm vitest run tests/mutationWeight/verdictNeutrality.test.ts` red-state=authored red-target=`lib/mutationWeight/weights.ts:1` why=`no comparison exists between the branch records and an old-weight baseline, so nothing asserts a verdict held` ac=AC-1 -->

Derive the three populations FROM THE DIFF at claim time, never from this sentence, and state each count with the ref it was derived at. Compare population (i) against the old-weight baseline (`workflow_dispatch` run `32844208485` on main at `300a9f937`) with `verdictDelta`.

**Both sides must come from the SAME TRIGGER, and this is an orchestrator ruling rather than a preference.** `workflow_dispatch` and `pull_request` are separate populations on this repo, and mixing them is banked as a misreading. The baseline is dispatch-triggered, so the branch side must be too — which is cheap, because `workflow_dispatch` takes a ref and the branch is pushed. The `pull_request` matrix still runs and is still read for CI-green; it is simply not the anchor.

**Schedule the branch dispatch against capacity, not against convenience.** It is another fourteen legs, and the semaphore is at one slot as a deliberate interim while the account's runners are congested — a baseline dispatch has already sat queued over 75 minutes. The dispatch waits until `#881` merges and capacity is restored, unless the orchestrator says otherwise. If it cannot be had at all, the fallback the ruling allows is a PARTITION-LEVEL claim, which is weaker and must be labelled as such rather than presented as verdict equality.

The bar was measured before the claim: 1 of 4328, 0 of 4360, 0 of 3692 across consecutive nightlies, the single mover being the inherited `ledgerGit` survivor. Any other mover is re-run with its surface ALONE on a leg before attribution.

<!-- tasks: end -->

## Closeout — deliberately OUTSIDE the task region, and this is not an oversight

Archive the row, drop the IN PROGRESS marker in the PR's last commit, write the closeout
with the review-round dispositions, and name the re-partition seam with its measured
magnitude.

It carries no `red=` because it has no red-then-green cycle to claim. Both meta-tests it
would name — `tests/docs/_metaLedgerInProgress.test.ts` and
`tests/docs/_metaInvariant8Closeout.test.ts` — pass on the tree TODAY and pass after the
work, so a marker asserting a cycle would be asserting one that cannot complete: exactly
the "guard test that passes the moment it is authored" shape the red-contract rejects.
The multi-region design allows headings outside a region and leaves them unchecked, so
this sits after `tasks: end` rather than inventing a red to satisfy a grammar.
