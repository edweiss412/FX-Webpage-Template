# Plan — main's nightly mutation harness, green again

No sibling spec. The arc brief is the untracked launch brief for arc-mutharness; the
attribution it asked for is in "What is actually red" below, and it replaces the brief's premise
rather than extending it.

impeccable-gate: N/A — no UI surface

## What is actually red, and since when

The brief says main's scheduled `mutation-harness` has been red since 2026-08-27 across five shas.
It has been red since **2026-08-16**, for sixteen consecutive scheduled runs, with no gap in the
schedule to explain any of it:

```
gh run list --workflow mutation-harness.yml --branch main --limit 30 \
  --json databaseId,conclusion,event,headSha,createdAt
```

green through 2026-08-15 (run `31871859884`, head `1e503d714`), red every night from 2026-08-16
(run `31933821808`, head `9e949297f`) to 2026-08-31 (run `33404224554`, head `47e9544e6`).

The brief's second premise — that branch runs pass in the same window — is not a comparison. Both
failing matrices carry `if: github.event_name != 'pull_request'`
(`.github/workflows/mutation-harness.yml`, on `parser-shards` and on `source-shards`, ruled
2026-08-26), so a pull-request run SKIPS every leg that is failing. A green branch run is silent
about this defect, not evidence against it.

**The red is three independent defects.** Failing job sets per night, read from the jobs API:

| night | failing jobs |
| --- | --- |
| 08-16 | (single-job era) parser ledger drift + one source survivor |
| 08-17 | source 0,1,2,3 |
| 08-18 | source 0,2,3 + budget |
| 08-19 | source 0,1,2 + budget |
| 08-20 | source 0,2 + budget |
| 08-21 | source 1,2 + budget |
| 08-22 | budget |
| 08-23 | budget |
| 08-24 | budget |
| 08-25 | source 0 + budget |
| 08-26 | source 3 + budget |
| 08-27 | budget |
| 08-28 | source 2 + budget |
| 08-29 | parser 0-7 + source 3 + budget |
| 08-30 | parser 0-7 + source 1 + budget |
| 08-31 | parser 0-7 + source 2 + budget |

### A — `budget`, the only defect present on every night it could be

Run `33404224554`, job `99552250195`, verbatim:

```
leg source-shards-0 took 4624s, over the 3600s budget
leg source-shards-5 took 3610s, over the 3600s budget
```

This is the mechanism the archived `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` documents, and **its
re-file trigger has fired as written** — "a `budget` job FAILURE on a SCHEDULED `main` run", the
observation that row could not make because that arc did not merge.

**That row's named lever does not work, and this plan's first job is to say why.** Its prescription
is `SOURCE_SHARD_COUNT`, 4 then 8. The live partition at `2156ea7ef`:

```
shard 0: modelled 2493s  n=1  controlOutlineResidue
shard 1: modelled 2419s  n=7
shard 2: modelled 2413s  n=8
shard 3: modelled 2416s  n=9
shard 4: modelled 2415s  n=8
shard 5: modelled 2415s  n=9
shard 6: modelled 2421s  n=9
shard 7: modelled 2421s  n=9
```

Shard 0 holds ONE surface. LPT has already isolated it, so no larger count moves it — which is
exactly what `docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md` L-2 predicted:
"when the heaviest single surface's projected cost exceeds `SHARD_BUDGET_MINUTES` … the unit must
become the mutant". That condition is now met. The two levers that remain are the two
`docs/superpowers/specs/ci/2026-08-26-mutation-shard-budget-fit.md` L-1 names: splitting the surface
into separately-enrolled parts, or moving the budget. Moving the budget is editing a gate so it
passes; this plan splits.

**Splitting alone is not enough, because the model is also wrong.** The table above is in MODELLED
seconds and is nearly flat; the measured legs are not:

| leg | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| elapsed s | 4624 | 2912 | 2007 | 2518 | 2427 | 3610 | 3255 | 3263 |
| child s | 4413 | 2733 | 1812 | 2259 | 2218 | 3414 | 3054 | 2999 |

`weightOf` prices a surface as `bootsOf(surface) * surface.millisPerBoot`, and the declared rates
under-price by up to 1.97x (`reportDraftStore`: declared 970 ms/boot, observed 1907). The same run's
`check-rate-drift` step measured all sixty; substituting those observed rates into the model
reproduces the measured total (22,903 s) and the measured makespan (4,413 s) exactly, which is what
licenses using the model to predict the repair.

**So the repair is three moves, and the arithmetic below is why it is those three.** Modelled
makespan with observed rates substituted, `controlOutlineResidue` split in two, LPT re-run:

| N | makespan (child s) | % of 3600s | binding leg |
| --- | --- | --- | --- |
| 8 | 2869 | 79.7 | 8 surfaces |
| 9 | 2548 | 70.8 | 8 surfaces |
| 10 | 2333 | 64.8 | `connectionCensus` alone |
| 11 | 2333 | 64.8 | `connectionCensus` alone |

Ten is the smallest count at which the makespan reaches its floor — the heaviest single remaining
surface — and eleven buys nothing. **That is the derivation for `SOURCE_SHARD_COUNT = 10`, and the
reason it is not eight** even though eight passes. The budget compares ELAPSED leg seconds, and the
measured legs run about 200 s above their child time (leg 0: 4624 elapsed against 4413 child; leg 1:
2912 against 2733). At N=8 that puts the binding leg near 3069 s elapsed, 531 s of headroom; at N=10
near 2533 s, 1067 s. Measured enrolment growth between the two runs on record is about 490 s/day of
total child time (52 surfaces on 2026-08-26 summing 22,158 s elapsed; 60 on 2026-08-31 summing
24,616 s), which is roughly 61 s/day per leg at N=8 and 49 s/day at N=10. Eight would re-red inside
two weeks of merging, which is a timer on the defect this arc exists to clear, not a repair of it.

### B — `source-shards`, a verdict that MOVES

Different shard on almost every night, absent entirely on four. The 2026-08-31 instance, job
`99527677140`:

```
FAIL tests/mutation/guardSurfaces.shard2.test.ts > source-mutation gate — describeClientValue
  > kills THIS surface's own control mutant, proving the overlay is live (AC-3)
AssertionError: the suite did not notice this surface's control mutant: expected +0 not to be +0
```

Fifty-five of that file's fifty-six tests passed.

**The obvious hypothesis is refuted, and the refutation is why B is not repaired here.** The
tempting read is that B is downstream of A: a child starved on a leg already running 77 minutes
reports nothing and is scored as "the overlay is dead". The assertion says otherwise.
`tests/mutation/source/surfaceCases.ts:262-266` asserts `runControl(...)` `.not.toBe(0)`, and
`runControl` (`tests/mutation/source/runner.ts:284-303`) returns the CHILD'S EXIT CODE. A timeout or
a crash exits non-zero, so a starved child makes this case PASS. It fails only when every deciding
suite exits **0** on text carrying the control mutant. Starvation cannot produce that.

So B is a real fail-open somewhere else — a deciding suite that exits 0 without deciding, an overlay
write that did not land, or an anchor that stopped being pinned — and the moving surface (shard 2 on
08-31, shard 1 on 08-30, shard 3 on 08-29) says it is intermittent rather than a property of one
registry row. **Repairing it needs a probe this plan has not run.** A is a known, derived repair with
its own red; B is a diagnosis. Bundling them would put an unprobed change in the same diff as the
one that clears sixteen nights of red. B is re-observed on the post-A run and dispositioned at
closeout; the note above is the whole handover, so the next reader does not re-derive the refutation.

**One thing the refutation exposes in passing, recorded rather than repaired:** because the case
reads only the exit code, a child that times out or crashes is indistinguishable from a genuine
kill, and the AC-3 case reports PASS for both. That is a documented limit of
`tests/mutation/source/surfaceCases.ts:262-266`, not a finding this arc mints a row for.

### C — `parser-shards`, ledger fingerprint drift, second instance

Parser legs were GREEN 08-22 through 08-28 and went red again on 08-29, so this is not the same
continuous failure as 08-16. Run `33404224554`, job `99527677390`:

```
AssertionError: DRIFTED fingerprints — benign IF output changed on purpose; regenerate the ledger
(BL-MUTATION-LEDGER-*):  … expected [ …(74) ] to deeply equal []
```

Attribution window `2588554bf` (08-28, parser green) .. `e7751f61d` (08-29, parser red). The only
parser-behaviour change merged inside it is PR #939 `fix/nearmiss-non-field-blocks`
(`lib/parser/blocks/_rowScan.ts` +54/-8, `lib/parser/fieldNearMiss.ts` +52/-1); PR #948
`feat/ref-error-cell-anchors` merged after and adds more drift on top. Both are intentional parser
changes whose ledger refresh was never run.

The 08-16 instance is separately attributed and was re-blessed by somebody in the meantime: shard 4
drifted exactly eleven keys, all on fixture `2026-04-asset-mgmt-cfo-coo-waldorf` block B4, and
commit `1ed69d9b1` (PR #790) is the sole edit to that fixture in `1e503d714..9e949297f` — it
rewrote one Internet cell to `SSID: WaldorfMeeting Password: Astoria2026`.

**Five instances of one class now sit in `BACKLOG-archive.md`** (ROLETOKEN-DRIFT,
AUTOCORRECT-DRIFT, REFRESH-AMBIGUITY, plus these two). The structural reason it recurs, stated as an
observation: a fixture or parser edit CANNOT fire this harness before merge — `parser-shards` is
nightly-only on pull requests, and neither `fixtures/**` nor `lib/parser/**` is in the workflow's
`pull_request.paths`. The drift is always found after the merge that caused it. This plan does not
change that trigger; it makes the RECOVERY mechanical, which is the half that is currently a
scratchpad script somebody wrote once and never committed
(`docs/superpowers/plans/ci/2026-07-06-mutation-harness-sharding/plan.md:836`).

## Meta-test inventory

CREATES: none. EXTENDS:

- `tests/mutation/_metaSourceShardIntegrity.test.ts` — the shard-file set, the workflow matrix and
  the budget-step env all key off `SOURCE_SHARD_COUNT`; moving it 8 → 10 moves all three.
- `tests/mutation/_metaShardRangeTracked.test.ts` — derives the tracked range from the same
  constant, so the `.gitignore` scratch rule moves with it.
- `tests/mutation/source/shardPartition.test.ts` — holds the modelled-makespan-under-budget
  assertion this plan's recalibration turns red and its split turns green again.
- `tests/parser/mutation/knownHoles.test.ts` — regex-pins the ledger's own header census against
  the live rows, so a re-bless that changed counts would be caught there.

No advisory-lock surface. No Supabase call boundary. No admin mutation surface.

## Acceptance criteria

- AC-1 every enrolled surface's `millisPerBoot` equals the value measured on run `33404224554`,
  and the constant carries that run id
- AC-2 `controlOutlineResidue` is two enrolled rows whose `operators` are disjoint and union to
  `OPERATOR_NAMES` exactly, whose generated mutants sum to the whole surface's 255, and whose
  `accepted` rows sum to the original 14 with every row under a part that declares its operator
- AC-3 `SOURCE_SHARD_COUNT === 10`, with the modelled binding leg under `SHARD_BUDGET_SECONDS`
- AC-4 the tracked shard range and the `.gitignore` scratch rule both follow the new count
- AC-5 the parser legs collect their alarms when, and only when, a `workflow_dispatch` input asks
  for it — schedule and pull-request behaviour byte-identical when it is unset
- AC-6 a committed re-bless tool turns collected `alarms-shard*.json` into the ledger text, and
  refuses when the reconciliation is not the benign class
- AC-7 the parser ledger is re-blessed and `reconcileLedger` reports zero new holes and zero fixed
  holes against the collected run — fingerprint movement only
- AC-8 a real `mutation-harness` run, green on every leg (discharged by the closeout)
- AC-9 the thirteen required checks green (discharged by the closeout)
- AC-10 B re-observed after A lands, and its disposition recorded (discharged by the closeout)

## Pre-draft code-verification pass

Every symbol, path and line below was grepped against the live tree at `308845507` (main absorbed
2026-09-01, after merge 48 / PR #963).

| claim | verified |
| --- | --- |
| `SOURCE_SHARD_COUNT = 8` | `tests/mutation/source/shardPartition.ts:42` |
| `SHARD_BUDGET_SECONDS = 60 * 60` | `tests/mutation/source/budget.ts:13` |
| the makespan assertion, fully derived, no literal | `tests/mutation/source/shardPartition.test.ts:259` |
| `controlOutlineResidue` row | `tests/mutation/source/registry.ts:3085`, rate at `tests/mutation/source/registry.ts:3086`, `operators: [...OPERATOR_NAMES]` at `tests/mutation/source/registry.ts:3089` |
| its `accepted` rows: 5 integer-literal, 2 logical-connector, 7 relational-boundary = 14 | counted from `registry.ts:3103`ff |
| `OPERATOR_NAMES` is SIX names | `tests/mutation/source/operators.ts:17-24` |
| `control.from` must occur exactly once per row | `tests/mutation/source/registry.ts:127-135` |
| an accepted row's operator must be declared by ITS row | `tests/mutation/source/registry.ts:141-146` |
| nothing keys a map by `sourcePath`; two rows may share one file | id-keyed at `shardPartition.test.ts:119`, `scripts/check-rate-drift.ts:58`; `enrolmentPresence.test.ts:44-49` lists 4 ids, none of them this one |
| tracked-range guard reads the constant | `tests/mutation/_metaShardRangeTracked.test.ts:92-96` |
| the scratch ignore rule | root gitignore line 137, holding the character-class glob for shard indices eight and nine |
| `mutation:guards` names shard files one by one | root package.json, line 58 (shard0 through shard7 plus the gates file) |
| `parser-shards.if` is pinned to an exact string | `tests/mutation/_metaSourceShardIntegrity.test.ts:626` |
| only the first step may write the step-env file | `tests/mutation/_metaSourceShardIntegrity.test.ts:243` |
| an extra upload step is a subset check, safe unless its name starts with `elapsed-` | `tests/mutation/_metaSourceShardIntegrity.test.ts:262`, ceiling derivation at `tests/mutation/_metaSourceShardIntegrity.test.ts:538` |
| `on.pull_request.paths` pinned at length 10 | `tests/mutation/_metaSourceShardIntegrity.test.ts:654` |
| a new static workflow `env:` key needs an allowlist row | `tests/ci/_workflowCoverageScan.ts:692`, mutation-harness keys registered at `tests/ci/_workflowCoverageScan.ts:1578` |
| `workflow_dispatch: {}` today; `inputs:` is allowed by the scanner | `.github/workflows/mutation-harness.yml:33`, `tests/ci/_workflowCoverageScan.ts:288` |
| an inputs block to copy the style from | `.github/workflows/lifecycle-layout-e2e.yml:45-52` |
| the collector writes one per-shard alarms JSON into the directory named by `COLLECT_MUTATION_ALARMS`, before the assertions run | `tests/parser/mutation/runShard.ts:142` |
| ledger text block | `tests/parser/mutation/knownHoles.ts:249` opens it and `tests/parser/mutation/knownHoles.ts:1269` closes it, 1019 rows, parsed at `tests/parser/mutation/knownHoles.ts:1271` |
| row format `siteId\|kind\|fingerprint\|finding\|note` | `tests/parser/mutation/knownHoles.ts:250` |
| the ledger's header census is regex-pinned against live rows | `tests/parser/mutation/knownHoles.test.ts:214` |
| NO re-bless emitter is committed anywhere | searched the scripts and tests trees and the root package.json; the only readers of the per-shard alarms JSON are `tests/parser/mutation/runShard.ts:145` and its own test |
| `runControl` returns the child exit code | `tests/mutation/source/runner.ts:284-303`, asserted at `tests/mutation/source/surfaceCases.ts:262-266` |

### The split, computed rather than asserted

```
node --import tsx  # enumerateSites + generateMutants over tests/styles/controlOutlineResidue.ts
A: ops=integer-literal,equality-flip,regex-quantifier-bound  mutants=129 boots=130 rate=16146
B: ops=relational-boundary,logical-connector,statement-removal mutants=126 boots=127 rate=18220
WHOLE: mutants=255                       (the 2026-08-31 record holds 255 outcomes)
```

129 + 126 = 255, the operator sets are disjoint, and their union is `OPERATOR_NAMES` exactly. The
rates are the parts' own observed cost from run `33404224554`, apportioned by operator:
integer-literal 1270 s, statement-removal 1094 s, equality-flip 829 s, logical-connector 737 s,
relational-boundary 483 s, regex-quantifier-bound 0 s (no site in this file).

`bootsOf` adds `+ suites` per row, so the split costs one extra modelled boot. It is in the model
above.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the weight model tells the truth, the indivisible surface stops being indivisible, and ten shards fit

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts tests/mutation/_metaShardRangeTracked.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:3086` why=`this line declares 9737 ms per boot for controlOutlineResidue while run 33404224554 measured 17240, and every one of the sixty declared rates is wrong in the same direction, so the derived makespan assertion at shardPartition.test.ts:259 passes today on prices that do not match the legs it is meant to bound; correcting the rates makes it fail at 4413s against a 3600s budget and only the split plus the higher count makes it pass again` ac=AC-1,AC-2,AC-3,AC-4 -->

**RED, in two recorded steps, both failing before anything is made to pass, both quoted in the
commit message.**

Step A — tell the truth about the prices. Set every enrolled surface's `millisPerBoot` to the value
`check-rate-drift` measured on run `33404224554` (job `99552250195`). Change nothing else. Run the
command: `tests/mutation/source/shardPartition.test.ts:259` fails, modelled makespan 4413 s against
a 3600 s budget. **This is the whole diagnosis in one assertion.** The guard was always right; it
was being fed prices that under-stated the binding leg by 1.77x, which is why sixteen nights of red
never reached it.

Step B — split, and raise the count. Give `controlOutlineResidue` two registry rows over the same
`sourcePath` with the operator partition above, move its fourteen `accepted` rows to the part that
declares each row's operator (5 to A, 9 to B), give part B its own `control.from`
(`tests/styles/controlOutlineResidue.ts:195`, the two-value weak test, verified to occur exactly
once in that file, whose collapse is caught by `tests/styles/_metaControlOutlineResidue.test.ts:547`), and raise `SOURCE_SHARD_COUNT` to 10 with
nothing else changed. Run the command again and record every red: `_metaSourceShardIntegrity` on the
shard-file set, the workflow matrix, the budget-step env and the `mutation:guards` target list;
`_metaShardRangeTracked` reporting shard8 and shard9 as ignored, which is the `.gitignore` scratch
rule at line 137 still keyed to the old count.

**GREEN.** Add shard files for indices eight and nine, byte-identical to their siblings modulo the
index. Extend the workflow matrix to the range zero through nine on `source-shards` and set the
source shard count to ten in the budget step's env. Add both files to the `mutation:guards` script
in the root package.json at line 58. Move the root gitignore's scratch rule at line 137 off the
single-digit character class and onto the two-digit one:

```
-tests/mutation/guardSurfaces.shard[8-9].test.ts
+tests/mutation/guardSurfaces.shard1[0-9].test.ts
```

Index ten is the first scratch index, and a character class cannot express "ten or more", so the
two-digit form is what makes the guard's above-count half true again.

**Anti-tautology.** The makespan assertion is derived from `SOURCE_SHARD_COUNT` and
`SHARD_BUDGET_SECONDS` with no literal (`shardPartition.test.ts:117` refuses to write the count
down), so it cannot pass by matching a number this task also wrote. The split's arithmetic is
asserted mechanically rather than in prose: a case that the two parts' operator sets are disjoint,
that their union equals `OPERATOR_NAMES`, that their generated mutant counts sum to the whole
surface's, and that every `accepted` row sits under a part declaring its operator — the last one is
already enforced at `registry.ts:141-146`, so the new case is the first three.

**Which red belongs to which move, stated exactly, because they are not the same red.** The makespan
assertion is red after step A and green once the SPLIT lands: recalibrated and split at the old count
of 8 it already reads 2869 s against 3600 s. So the count raise is not what turns that assertion
green, and claiming it were would be a plan asserting a red it does not have. The count raise carries
its own red on the same command — `_metaSourceShardIntegrity` and `_metaShardRangeTracked`, both
derived from `SOURCE_SHARD_COUNT`, fail the moment it moves and the workflow, the script list and the
ignore rule have not followed. Its JUSTIFICATION is the headroom arithmetic above and not an
assertion: 2869 s modelled is about 3069 s elapsed, 531 s of margin against measured growth of 61
s/day per leg, so eight is a repair with a two-week fuse. Ten is the smallest count at which the
makespan reaches the floor no count can go below.

The three moves are one task because they are inseparable in the tree, not because they share a
failure: `_metaSourceShardIntegrity` pins the constant against the workflow matrix, the budget env
and the shard-file set simultaneously, so moving any one of them alone leaves the suite red until the
others follow.

## Task 2 — collecting the parser alarms from CI, and a re-bless tool that refuses

<!-- task: red=`pnpm vitest run tests/parser/mutation/reblessLedger.test.ts tests/ci/workflow-coverage.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`scripts/rebless-parser-ledger.ts` why=`this file does not exist, so every case in the new suite fails to import it; the ledger has been re-blessed five times by a scratchpad script nobody committed and the sixth instance is open on main right now` ac=AC-5,AC-6 -->

**Why a committed tool at all.** The ledger has drifted and been re-blessed five times before this one
(ROLETOKEN-DRIFT, AUTOCORRECT-DRIFT, REFRESH-AMBIGUITY, the 08-16 waldorf instance, and the one open
now). Every one of those re-blesses was done by hand or by a script that was never committed — the
sharding plan's own closeout names a regeneration script that exists nowhere in the tree
(the sharding plan's closeout at `docs/superpowers/plans/ci/2026-07-06-mutation-harness-sharding/plan.md:836`
names a regeneration script that exists nowhere in the tree). The sixth instance should not
re-derive it.

**RED.** Write a new suite, reblessLedger.test.ts, beside the other parser-mutation tests, against a
module that does not exist yet. Cases, each named with the failure it catches:

1. Given collected alarms whose reconciliation against a ledger is drift-only, the tool emits ledger
   text whose rows carry the NEW fingerprints and the SAME siteIds, kinds, findings and notes.
2. Given alarms introducing a siteId with no ledger row at all (`newHoles` non-empty), the tool
   REFUSES with a non-zero exit and names the sites. This is the case that matters: a re-bless that
   accepts a new hole launders a coverage regression into a baseline.
3. Given alarms where a ledgered `(siteId, kind)` has stopped surviving (`fixedHoles` non-empty),
   the tool REFUSES. A shrink is a deliberate act with its own commit note, never a side effect of
   a fingerprint refresh.
4. Row order and row count are preserved exactly on the drift-only path, so a re-bless diff is
   fingerprints and nothing else — the reviewable property.
5. The tool reads the union of `alarms-shard*.json` in a directory and fails loudly on a missing
   shard index rather than re-blessing a partial run against a whole ledger. **This is the one that
   would silently destroy the ledger**: seven shards' alarms reconciled against all 1019 rows makes
   every row of the eighth look like a fixed hole.

Case 5 is the reason the tool takes a directory and a shard count rather than a glob.

**The workflow half.** Replace `workflow_dispatch: {}` at `.github/workflows/mutation-harness.yml:33`
with an `inputs:` block carrying one boolean-shaped input, default `"false"`, styled after
`.github/workflows/lifecycle-layout-e2e.yml:45-52`. On the `parser-shards` job only, add
`COLLECT_MUTATION_ALARMS` to the existing `env:` of the run step, valued
`${{ inputs.collect_alarms == 'true' && 'alarms' || '' }}` — empty when unset, and
`runShard.ts:142` treats empty as absent, so schedule and pull-request behaviour are byte-identical
with the input unset. Add one `actions/upload-artifact` step conditioned on the same expression,
named `alarms-parser-shards-<n>`.

**Three constraints this must not walk into**, each verified above rather than assumed:

- the gate cannot go on the job's `if:` — `tests/mutation/_metaSourceShardIntegrity.test.ts:626` pins
  it to the exact string `github.event_name != 'pull_request'`;
- the new step's artifact name must not start with `elapsed-`, or the job is pulled into the
  ceiling derivation at `tests/mutation/_metaSourceShardIntegrity.test.ts:538`;
- a new static workflow `env:` key needs a row in `tests/ci/_workflowCoverageScan.ts:692`'s
  allowlist, beside the mutation-harness keys already at `tests/ci/_workflowCoverageScan.ts:1578`.

**GREEN.** Write the tool as rebless-parser-ledger.ts under the scripts tree, importing
`reconcileLedger` from
`tests/parser/mutation/knownHoles.ts` — one reconciliation implementation, never a second copy of
the bucket logic. Land the workflow edits. Both suites green.

## Task 3 — the ledger, re-blessed from a real collected run

<!-- task: red=`node --import tsx scripts/rebless-parser-ledger.ts --check --alarms .alarms --shards 8` red-state=authored red-target=`tests/parser/mutation/knownHoles.ts:250` why=`the ledger rows from this line on carry fingerprints main's own nightly contradicts, 74 of them in shard 0 alone, so the check-mode invocation this task introduces exits non-zero against alarms collected from the current tree and exits 0 only once those rows carry the new fingerprints` ac=AC-7 -->

**The marker is `authored` and not `live`, and the distinction is not cosmetic.** The command exits
non-zero on today's tree too, but for the wrong reason: the tool does not exist until Task 2 lands.
A `live` marker would be claiming a red the tree gives for free, which is the borrowed-failure shape
the plan rules reject. The meaningful red is observed after Task 2, against real collected alarms.

**And this task has no local red that costs less than a 28-minute mutation phase per shard, which it
says rather than inventing one.** Observing the drift locally means running the parser harness; the
gate amendment of 2026-08-31 retires local full-suite runs on this box and makes CI the oracle. So
the alarms come from a `workflow_dispatch` of the branch with the Task 2 input set, and the red is
the tool's own `--check` exit against those artifacts.

Steps:

1. Push Task 1 and Task 2. `gh workflow run mutation-harness.yml --ref fix/mutation-harness-main-schedule -f collect_alarms=true`.
2. Download the `alarms-parser-shards-*` artifacts. Run the tool in `--check` mode: it exits
   non-zero, reporting drift-only reconciliation across all eight shards and naming the counts.
   **If it reports any `newHoles` or `fixedHoles`, STOP** — that is not a re-bless, it is a parser
   regression or a coverage change, and it goes to bl-orch rather than into the ledger.
3. Run the tool for real. Commit `tests/parser/mutation/knownHoles.ts` with the new fingerprints and
   a dated re-bless note in the header block naming both causes (PR #939, PR #948), matching the
   form of the notes already at `tests/parser/mutation/knownHoles.ts:118`.
4. Re-check: the tool exits 0.

**The benign-class proof is a site SET comparison and never a count.** Equal counts are satisfied by
any permutation, and the whole failure mode here is fingerprints moving under stable siteIds. The
tool compares sets, which is what `reconcileLedger` already does by partitioning into `newHoles`,
`fixedHoles`, `driftedAlarms` and `driftedStale`; the re-bless is licensed only when the first two
are empty.

<!-- tasks: end -->

## Closeout

- AC-8: `gh workflow run mutation-harness.yml --ref fix/mutation-harness-main-schedule` with the
  collect input UNSET, every leg green, `budget` green. This is the run that proves the repair,
  because a pull-request run skips both matrices.
- AC-9: the thirteen required checks green on the shipping head, read by name from the
  branch-protection API.
- AC-10: B re-observed on that run. If the AC-3 control case fails again with A landed, the
  starvation reading is dead by construction (see the refutation above) and B is a fail-open needing
  its own probe; if it passes, record that and leave the documented limit standing.
- After merge: the SCHEDULED run on main green, which is this arc's actual done condition. The
  nightly fires at 07:00 UTC; a `workflow_dispatch` on `main` is the same content and is the
  acceptable substitute the archived budget row already treats as evidence, but the scheduled run is
  what the brief asks for.

## Documented limits

- **`SOURCE_SHARD_COUNT` is finished as a lever.** At ten the makespan equals `connectionCensus`
  alone at 2333 s and eleven changes nothing. The next breach will be a surface that outgrew a leg,
  and the repair will be another split or a cheaper deciding suite — not a count. Re-file trigger: a
  `budget` FAILURE on a scheduled `main` run at N=10.
- **The AC-3 control case cannot tell a kill from a crash** (`tests/mutation/source/surfaceCases.ts:262-266`
  reads only the child exit code). Re-file trigger: an AC-3 failure that survives the post-A run.
- **A fixture or parser edit still cannot fire this harness before merge.** `parser-shards` is
  nightly-only on pull requests and neither `fixtures/**` nor `lib/parser/**` is in
  `on.pull_request.paths`. This arc makes the recovery mechanical; it does not move the trigger. Six
  instances of the drift class are now on record. Re-file trigger: a seventh.
