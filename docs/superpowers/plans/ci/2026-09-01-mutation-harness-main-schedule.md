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

`weightOf` prices a surface as `bootsOf(surface) * surface.millisPerBoot`, and the declared rates are
wrong by up to 1.97x (`reportDraftStore`: declared 970 ms/boot, observed 1907). **Not all in one
direction, and an earlier draft of this plan said they were:** of the sixty, 48 increase, 12 decrease
(`spawnBounded` 1400 -> 934, `citationIntent` 1328 -> 888), 0 unchanged. What makes the binding leg
wrong is that the biggest under-prices land on the biggest surfaces, not a uniform bias.

**What substituting the measured rates does and does not prove.** With them in place the model puts
`controlOutlineResidue` at 4,413.440 s against a measured 4,413 s of child time, and the corpus at
22,896.840 s against 22,902.664 s summed from the records. That is a CONSISTENCY check and nothing
stronger: the rates are the measurement divided by `bootsOf`, so multiplying them back is arithmetic,
not corroboration. It confirms the model is being fed the run it claims and that no rounding step
lost anything material. The 5.8 s gap is one surface, `controlOutlineScan`, whose source changed
after the run so its `bootsOf` differs at this head.

**The prediction below therefore rests on a stated assumption**: that per-surface cost is stable from
one nightly to the next. Two runs' legs are on record and the ordering of surfaces is unchanged
between them, which is evidence but not proof. It is the same assumption the archived budget rows
made, and it is written down here rather than left implicit.

**So the repair is three moves, and the arithmetic below is why it is those three.** Modelled
makespan with observed rates substituted, `controlOutlineResidue` split in two, LPT re-run:

| N | makespan (child s) | % of 3600s | binding leg |
| --- | --- | --- | --- |
| 8 | 2867 | 79.6 | 8 surfaces |
| 9 | 2548 | 70.8 | 8 surfaces |
| 10 | 2490 | 69.2 | the heavier split part alone |
| 11 | 2490 | 69.2 | the heavier split part alone |
| 12 | 2490 | 69.2 | the heavier split part alone |

Ten is the smallest count at which the makespan reaches its floor — the heaviest single remaining
surface — and no larger count moves it. **That is the derivation for `SOURCE_SHARD_COUNT = 10`, and the
reason it is not eight** even though eight passes. The budget compares ELAPSED leg seconds, and the
measured legs run above their child time by a margin that is itself measured rather than assumed:
across the eight legs of run `33404224554` the overhead sorts to 178.817, 195.097, 196.181, 200.758,
208.738, 210.598, 259.274 and 263.873 s. Eight values, so the median is the mean of the middle pair —
204.748 s — the way `lib/mutationWeight/weights.ts:16` computes one. (An earlier draft took the fifth
element, 208.738, which is not the median of an even sample.) Against the exact modelled makespans of
2866.564 s and 2490.111 s that is **3071 s elapsed and 529 s of headroom at N=8**, and **2695 s and
905 s at N=10**; at the worst observed overhead, 2754 s and 846 s.

Enrolment growth between the two runs on record is about 490 s/day, measured on the ELAPSED leg sums
because that is what both runs recorded (52 surfaces on 2026-08-26 summing 22,158 s; 60 on
2026-08-31 summing 24,616 s). That is roughly 61 s/day per leg at N=8 and 49 s/day at N=10, so eight
would re-red in about nine days and ten in about eighteen. Nine days is a timer on the defect this
arc exists to clear, not a repair of it.

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
`runControl` (`tests/mutation/source/runner.ts:284-303`) returns the CHILD'S EXIT CODE. It fails only
when every deciding suite exits **0** on text carrying the control mutant.

Neither shape starvation produces can do that, and the two are handled differently rather than
identically — `tests/mutation/source/runner.ts:159-170` separates them on purpose. A TIMEOUT returns
`MUTANT_TIMEOUT_EXIT`, a non-zero code, so the case passes. A signal kill — an OOM, this machine's
idle reaper — is not a code at all: `spawnBounded` reports it as an infra outcome and the runner
THROWS `MutantRunInfraError` rather than returning, so the case errors out loudly instead of
reporting `expected +0 not to be +0`. An earlier draft of this plan said "a crash makes this case
PASS", which is wrong; the conclusion survives the correction because neither shape yields exit 0.

So B is a real fail-open somewhere else — a deciding suite that exits 0 without deciding, an overlay
write that did not land, or an anchor that stopped being pinned — and the moving surface (shard 2 on
08-31, shard 1 on 08-30, shard 3 on 08-29) says it is intermittent rather than a property of one
registry row. **Repairing it needs a probe this plan has not run.** A is a known, derived repair with
its own red; B is a diagnosis. Bundling them would put an unprobed change in the same diff as the
one that clears sixteen nights of red. B is re-observed on the post-A run and dispositioned at
closeout; the note above is the whole handover, so the next reader does not re-derive the refutation.

**One narrower thing the refutation exposes, recorded rather than repaired:** a child that times out
IS indistinguishable from a genuine kill at this case, because both are a non-zero code. A signal
kill is not — the runner throws. So the limit is one shape, not two, and it is bounded by
`MUTANT_TIMEOUT_MS`. An earlier draft of this plan claimed the case "cannot tell a kill from a
crash", which overstates it in the direction that would have excused the very defect B might be.

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

**Five instances of one class are on record, and they are not all on record the same way.** Three
carry archived `BL-MUTATION-LEDGER-*` rows — ROLETOKEN-DRIFT, AUTOCORRECT-DRIFT and
REFRESH-AMBIGUITY. The 08-16 waldorf instance has no row at all: it is attributed here from the run
log and the fixture diff, and was re-blessed by somebody without one. The fifth is the one open now.
(An earlier draft said all five "sit in `BACKLOG-archive.md`", which is true of three of them; the
review caught the count and this is the same over-claim one level down.) The structural reason it recurs, stated as an
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
- AC-6 a committed re-bless tool turns one run's collected alarms into the ledger text, and refuses
  a new hole, a fixed hole, a missing shard, a `(siteId, kind)` carrying two fingerprints, or files
  that do not all declare the same run
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
| a signal kill is NOT a code: the runner throws instead | `tests/mutation/source/runner.ts:159-170` |
| ledger kinds are declared per surface id, and an undeclared id is a mismatch | `tests/mutation/source/expectedLedgerKinds.ts:443`, compared at `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts:75` |
| an empty ledger-kind declaration is the established form | 26 rows already carry `{}`, e.g. `tests/mutation/source/expectedLedgerKinds.ts:37` |
| the corpus gate compares the exact id set | `tests/mutation/guardSurfaces.gates.test.ts:17` |
| the allowlist pins a VALUE, and the budget env's is the literal `"8"` | `tests/ci/_workflowCoverageScan.ts:1631` |
| an off-allowlist workflow env pair reds a real suite | `tests/ci/_metaE2eWorkflowCoverage.test.ts:1981` |
| the elapsed upload beside the new one already carries `if: always()` | `.github/workflows/mutation-harness.yml:117` |
| the three other files naming `controlOutlineResidue` are prose or historical fixtures | `tests/mutation/source/mutantOverlay.config.ts:62` and `tests/mutation/_metaOverlayConfigParity.test.ts:56` are comments; `tests/mutation/source/fixtures/heldout/pair-1.json` records two past runs and `tests/mutation/source/shardBalance.test.ts` never imports `GUARD_SURFACES` |

### The split, computed rather than asserted — and chosen against a sweep, not a hunch

The first draft split on the operator sets that BALANCE best: `equality-flip`, `integer-literal` and
`regex-quantifier-bound` against the other three, 2099 s and 2314 s (`regex-quantifier-bound` has no
site in this file, so it costs nothing and sits on whichever side needs the name). The class sweep the split's own rationale demanded then
overturned it.

```
$ python3 banner-straddle-sweep.py equality-flip,integer-literal,regex-quantifier-bound
14 accepted rows under 8 rationale banners
  STRADDLES: a pre-filter dominated by the conjunct beside it
    B  relational-boundary:415:29:>>>=
    A  integer-literal:415:31:0>1
  STRADDLES: the same domination, one step downstream
    B  relational-boundary:595:81:>>>=
    A  integer-literal:595:83:0>1
banners straddling the split: 2          (exit 1)

$ python3 banner-straddle-sweep.py equality-flip,statement-removal,regex-quantifier-bound
14 accepted rows under 8 rationale banners
banners straddling the split: 0          (exit 0)
```

The sweep walks every `// ---- ... ----` banner in the registry block and every `siteId:` under it,
so a banner added later is covered without editing a list. Two things it settled that prose had got
wrong: no accepted row cites a line that would move to the other part (a separate derivation, zero
hits), and the number of straddling banners is TWO, not the three an earlier draft claimed. The two
it found are a chain — the second banner's text refers back to the first — so a split on the
balanced sets leaves one part's rows under an antecedent that is no longer in front of them.

**So the split is by rationale family, not by balance:**

```
A  controlOutlineResidueRewrites     equality-flip, statement-removal, regex-quantifier-bound
                                     139 mutants, boots 140, 1,923,298 ms, rate 13738,  0 accepted
B  controlOutlineResidueBoundaries   integer-literal, relational-boundary, logical-connector
                                     116 mutants, boots 117, 2,490,104 ms, rate 21283, 14 accepted
                                     139 + 116 = 255, the whole surface
```

The operator sets are disjoint and union to `OPERATOR_NAMES` exactly. All fourteen accepted rows
move to B as one intact block and A takes none, so no rationale is separated from its rows and no
comment has to be rewritten. **A's zero-survivor status is a claim to MEASURE at the shipping head,
not to inherit**: the 2026-08-31 record's fourteen SURVIVED outcomes are exactly the fourteen
accepted siteIds and every one is `integer-literal`, `relational-boundary` or `logical-connector`,
which is why A is expected to be clean — but both parts get their own scored run and both scores are
stated separately.

Costs, both of them real: the split adds one modelled boot (`bootsOf` adds `+ suites` per row), and
choosing family over balance costs **157 s of makespan** — 2490.111 s against the balanced split's
2333.122 s at N=10, both pinned by their own heaviest remaining part. An earlier draft said 176 s,
which subtracted the balanced split's PART cost from the family split's MAKESPAN; the comparison has
to be makespan against makespan or it is not a comparison.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the weight model tells the truth, the indivisible surface stops being indivisible, and ten shards fit

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts tests/mutation/_metaShardRangeTracked.test.ts tests/mutation/_metaLedgerKindsDeclarationParity.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:3086` why=`this line declares 9737 ms per boot for controlOutlineResidue while run 33404224554 measured 17240, and all sixty declared rates are wrong, 48 of them too low and 12 too high, so the derived makespan assertion at shardPartition.test.ts:259 passes today on prices that do not match the legs it is meant to bound; correcting the rates makes it fail at 4413s against a 3600s budget and only the split makes it pass again` ac=AC-1,AC-2,AC-3,AC-4 -->

**RED, in two recorded steps, both failing before anything is made to pass, both quoted in the
commit message.**

Step A — tell the truth about the prices. Set every enrolled surface's `millisPerBoot` to the value
`check-rate-drift` measured on run `33404224554` (job `99552250195`). Change nothing else. Run the
command: `tests/mutation/source/shardPartition.test.ts:259` fails, modelled makespan 4413 s against
a 3600 s budget. **This is the whole diagnosis in one assertion.** The guard was always right; it
was being fed prices that under-stated the binding leg by 1.77x, which is why sixteen nights of red
never reached it.

Step B — split, and raise the count. Give `controlOutlineResidue` two registry rows over the same
`sourcePath` with the operator partition above. All fourteen `accepted` rows move to
`controlOutlineResidueBoundaries`, which also keeps the existing `control.from`;
`controlOutlineResidueRewrites` takes none and gets its own anchor at
`tests/styles/controlOutlineResidue.ts:195`, the two-value weak test, verified to occur exactly once
in that file, whose collapse is caught by `tests/styles/_metaControlOutlineResidue.test.ts:547`.
Declare both ids in `tests/mutation/source/expectedLedgerKinds.ts`, which is keyed by surface id and
whose one `controlOutlineResidue: { equivalent: 14 }` row at
`tests/mutation/source/expectedLedgerKinds.ts:443` becomes `{ equivalent: 14 }` on Boundaries and
`{}` on Rewrites — an empty declaration is the established form, 26 rows already carry one. Then
raise `SOURCE_SHARD_COUNT` to 10 with nothing else changed. Run the command again and record every red: `_metaSourceShardIntegrity` on the
shard-file set, the workflow matrix, the budget-step env and the `mutation:guards` target list;
`_metaShardRangeTracked` reporting shard8 and shard9 as ignored, which is the `.gitignore` scratch
rule at line 137 still keyed to the old count; `_metaLedgerKindsDeclarationParity` on the two new ids if their declarations are not yet in place;
**and NOT `_metaE2eWorkflowCoverage`**, which an earlier draft claimed and which does not red here:
at this checkpoint the workflow's budget-step env and the allowlist both still read `"8"`, so the
pair agrees and the suite passes. It reds only if the workflow env moves to `"10"` while the
allowlist does not. That is a LOCKSTEP constraint rather than a red in this task's sequence, and it
is why the two move in one command — `apply-count` writes both or refuses. The suite stays in the
task's command because it is what catches the lockstep being broken, not because it is expected to
fail at Step B.

`tests/mutation/guardSurfaces.gates.test.ts` also compares the exact id set
(`tests/mutation/guardSurfaces.gates.test.ts:17`) and is deliberately NOT in the marker's command:
it lives in the env-gated `mutation` project, so a plain `vitest run` cannot collect it and a marker
naming it would assert a red no one can observe. Run it separately, gated:
`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts`.

**GREEN.** Add shard files for indices eight and nine, byte-identical to their siblings modulo the
index. Extend the workflow matrix to the range zero through nine on `source-shards` and set the
source shard count to ten in the budget step's env. Add both files to the `mutation:guards` script
in the root package.json at line 58. Move the allowlisted VALUE TEXT for that env key from `"8"` to
`"10"` at `tests/ci/_workflowCoverageScan.ts:1631` — the allowlist pins values, not just keys, and
this site is not derived from the constant. Move the root gitignore's scratch rule at line 137 off the
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
that their union equals `OPERATOR_NAMES`, and that their generated mutant counts sum to the whole
surface's 255. That every `accepted` row sits under a part declaring its operator is already
enforced at `registry.ts:141-146`, so the new case is the first three; the 255 is derived by
generating over the union rather than written down, or it would pass by matching itself.

**The six hand-moved sites are a derivation, not a list.** Everything else follows the constant.

```
$ grep -rln 'SOURCE_SHARD_COUNT' tests lib scripts .github package.json   # 13 files
$ grep -rln 'guardSurfaces.shard' tests scripts .github package.json .gitignore vitest.projects.ts
```

Every file that NAMES a shard file does so by glob or in prose (`vitest.projects.ts:90` and `vitest.projects.ts:99`
are globs; the two hits under `tests/mutation/` are comments), so only these move by hand: the
constant, the workflow's matrix and budget env, the `mutation:guards` script list, the `.gitignore`
scratch range, `tests/ci/_workflowCoverageScan.ts:1631`, and the two new shard files. **Re-run both
commands at the SHIPPING head, not now** — the literal-pin class re-drifts under later edits, so a
sweep run before the edits verifies a tree that no longer exists.

**Which red belongs to which move, stated exactly, because they are not the same red.** The makespan
assertion is red after step A and green once the SPLIT lands: recalibrated and split at the old count
of 8 it already reads 2867 s against 3600 s. So the count raise is not what turns that assertion
green, and claiming it were would be a plan asserting a red it does not have. The count raise carries
its own red on the same command — `_metaSourceShardIntegrity` and `_metaShardRangeTracked`, both
derived from `SOURCE_SHARD_COUNT`, fail the moment it moves and the workflow, the script list and the
ignore rule have not followed. Its JUSTIFICATION is the headroom arithmetic above and not an
assertion: 2866.564 s modelled is 3071 s elapsed at the median measured overhead of 204.748 s, 529 s
of margin against measured growth of 61 s/day per leg, so eight is a repair with a nine-day fuse. Ten is the
smallest count at which the makespan reaches the floor no count can go below.

The three moves are one task because they are inseparable in the tree, not because they share a
failure: `_metaSourceShardIntegrity` pins the constant against the workflow matrix, the budget env
and the shard-file set simultaneously, so moving any one of them alone leaves the suite red until the
others follow.

## Task 2 — collecting the parser alarms from CI, and a re-bless tool that refuses

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/parser/mutation/runShard.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:112` why=`this step's env block gains COLLECT_MUTATION_ALARMS with no matching row in the allowlist at tests/ci/_workflowCoverageScan.ts:692, so unreviewedLivePairs reports the pair and _metaE2eWorkflowCoverage reds on a real workflow surface; the same command also carries the two inertness cases, which fail against a collector that treats the empty string as a directory` ac=AC-5,AC-6 -->

**Why a committed tool at all.** Five instances of this class are on record and FOUR have been
re-blessed: ROLETOKEN-DRIFT, AUTOCORRECT-DRIFT, REFRESH-AMBIGUITY and the 08-16 waldorf instance.
The fifth is the one open now, and re-blessing it is this arc's Task 3 — so this work COMPLETES the
fifth rather than opening a sixth. (An earlier draft counted the open instance among the re-blessed
ones and then called this work the sixth, which double-counted it; the numbers are stated here once
and the limits section below reads from the same five.)

Every one of those four re-blesses was done by hand or by a script that was never committed — the
sharding plan's closeout at
`docs/superpowers/plans/ci/2026-07-06-mutation-harness-sharding/plan.md:836` names a regeneration
script that exists nowhere in the tree. The fifth should not re-derive it, and the sixth should not
either.

**RED, and it is deliberately NOT "the module does not exist yet".** An unresolved import is a
test-local failure: it goes green when the test file changes rather than when an implementation
lands, which `docs/agents/writing-plans.md:15` rejects by name. An earlier draft of this task made
exactly that mistake, and named a workflow-coverage suite that does not exist under that name
either. The red here is on a production surface: adding `COLLECT_MUTATION_ALARMS` to the workflow's
env block with no allowlist row makes `unreviewedLivePairs` report the pair and
`tests/ci/_metaE2eWorkflowCoverage.test.ts:1981` fail. The re-bless module's own suite is ordinary
TDD inside the task and is not what the marker claims.

**The suite is tests/parser/mutation/rebless.test.ts**, a new file beside runShard.test.ts, and
it is collected by the DEFAULT vitest project — `vitest.projects.ts:148` includes
`tests/mutation/**` and the parser tree is picked up by the ordinary `tests/**` include, so no
wiring is added and none is needed; the env-gated `mutation` project is not involved because this
suite spawns nothing. Its own cycle, on its own command:

```
pnpm vitest run tests/parser/mutation/rebless.test.ts
```

RED once the cases exist against the not-yet-written module, GREEN once
tests/parser/mutation/rebless.ts lands. That cycle is ORDINARY TDD inside this task and is
deliberately not what the task marker claims as its red — an unresolved import goes green when the
test file changes rather than when an implementation lands, which is why the marker points at the
workflow scanner instead. Both statements are true at once and an earlier draft of this task stated
neither, which is the finding.

Cases for that suite, each named with the failure it catches:

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
6. Given two DIFFERENT fingerprints for one `(siteId, kind)` in the collected alarms, the tool
   REFUSES. `reconcileLedger` partitions by `(siteId, kind)` membership, so both refusal buckets
   come back empty for that input and the drift path would accept it — then write whichever
   fingerprint the map happened to see last. The re-bless must be a bijection onto the ledger's rows,
   and cardinality is the half set membership cannot see.
7. Given files that do not all come from ONE run, the tool REFUSES. Today an alarms file carries
   `{ alarms }` and nothing else, so seven current files beside one left over from a previous
   download satisfy every presence check and re-bless a mixed snapshot. The collector at
   `tests/parser/mutation/runShard.ts:142` therefore also writes the shard index it was called for
   and a run identity (`GITHUB_RUN_ID`, or `local`), and the tool refuses when a file's declared
   index disagrees with its filename or when the identities differ across files. The existing
   collector case at `tests/parser/mutation/runShard.test.ts:65` compares `dumped.alarms` to
   `r.alarms` and is unaffected by the added fields — **but leaving it there is not coverage of the
   new ones.** A consumer test built from constructed JSON cannot show that `runShard` writes the
   shard it was CALLED with, or the real `GITHUB_RUN_ID`; an implementation stamping one constant
   passes every such test and then lets mixed-run files satisfy case 7 silently. So the producer
   side is proved at the producer: that case is extended to assert the stamped `shard` equals the
   argument for TWO different shard indices (a constant fails the second), and that `runId` tracks a
   stubbed `GITHUB_RUN_ID` rather than any fixed string.

8. Given a LEDGER carrying two rows with the same `(siteId, kind)`, the tool REFUSES — the exact
   twin of case 6, on the other side. One current alarm for that pair makes `reconcileLedger`
   classify BOTH old rows as `driftedStale` while `newHoles` and `fixedHoles` stay empty; rewriting
   both to the current fingerprint preserves order, count and the header census, and the internal
   `Set` then deduplicates them so the next reconciliation reports clean. The ledger is 1019 rows
   over 1019 distinct pairs today (probed), so this is one ordinary edit away rather than live —
   which is exactly why it is checked rather than argued. The `rewritten !== drifted` cross-check
   does catch it, but it reports "the ledger text and the parsed ledger disagree", which is not a
   diagnosis anyone can act on.

Cases 5, 6, 7 and 8 are one class seen from four sides — the collected set must be exactly one run's
whole output, and neither a missing file, a duplicated pair, nor a stale file may pass as that.
They are why the tool takes a directory and a shard COUNT rather than a glob, and why cardinality is
checked on BOTH sides rather than only where today's data could break it.

**Inertness is executable at BOTH boundary values**, in `tests/parser/mutation/runShard.test.ts`
beside its existing positive control. A schedule produces the env key PRESENT AND EMPTY where today
it is ABSENT, so one case per state, plus the positive control that already exists. Each asserts no
file is written anywhere and none lands in the working directory, under a `premiseHolds` that the
slice actually produced alarms — without which "no file was written" is true for the wrong reason.
CATCHES: a later `collectDir !== undefined` refactor, which passes the unset state and starts writing
an alarms file into the repo root on every scheduled run under the empty one.

**The workflow half.** Replace `workflow_dispatch: {}` at `.github/workflows/mutation-harness.yml:33`
with an `inputs:` block carrying one boolean-shaped input, default `"false"`, styled after
`.github/workflows/lifecycle-layout-e2e.yml:45-52`. On the `parser-shards` job only, add
`COLLECT_MUTATION_ALARMS` to the existing `env:` of the run step, valued
`${{ inputs.collect_alarms == 'true' && 'alarms' || '' }}` — empty when unset, and
`runShard.ts:142` treats empty as absent, so schedule and pull-request behaviour are byte-identical
with the input unset. Add one `actions/upload-artifact` step named
`alarms-parser-shards-<n>`, with `path: alarms/` — the action has no default and uploads nothing
without it — and `if-no-files-found: error`, matching the records upload beside it. Condition it on
`always() && <the same input test>`.

**The `always()` is load-bearing and an earlier draft of this task omitted it.** The collector writes
its file inside `runShard` before returning (`tests/parser/mutation/runShard.ts:142`), but the ledger
assertion runs after and FAILS — that is the entire reason a collection run is being asked for. On a
failed step GitHub skips every later step whose condition does not tolerate failure, so without
`always()` the artifacts never upload and Task 3 receives nothing. The elapsed upload beside it
already carries `if: always()` for this exact reason
(`.github/workflows/mutation-harness.yml:117`).

**Three constraints this must not walk into**, each verified above rather than assumed:

- the gate cannot go on the job's `if:` — `tests/mutation/_metaSourceShardIntegrity.test.ts:626` pins
  it to the exact string `github.event_name != 'pull_request'`;
- the new step's artifact name must not start with `elapsed-`, or the job is pulled into the
  ceiling derivation at `tests/mutation/_metaSourceShardIntegrity.test.ts:538`;
- a new static workflow `env:` key needs a row in `tests/ci/_workflowCoverageScan.ts:692`'s
  allowlist, beside the mutation-harness keys already at `tests/ci/_workflowCoverageScan.ts:1578`.

**GREEN.** Write tests/parser/mutation/rebless.ts and the thin adapter rebless-parser-ledger.ts
under the scripts tree, importing `reconcileLedger` from
`tests/parser/mutation/knownHoles.ts` — one reconciliation implementation, never a second copy of
the bucket logic. Land the workflow edits. All three suites green: the workflow scanner, runShard.test.ts, and
tests/parser/mutation/rebless.test.ts.

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
2. Download the `alarms-parser-shards-*` artifacts into a fresh directory. **`gh run download` with
   a `--pattern` lays each artifact down in its OWN directory named after the artifact**, so the
   files arrive one level down, under a directory named for the artifact, and not flat. The tool
   therefore searches one level below its `--alarms` root as well as the root itself, and accepts
   both layouts; nothing flattens anything by hand. Run the tool in `--check` mode: it exits
   non-zero, reporting drift-only reconciliation across all eight shards and naming the counts.
   **If it reports any `newHoles` or `fixedHoles`, STOP** — that is not a re-bless, it is a parser
   regression or a coverage change, and it goes to bl-orch rather than into the ledger.
3. Run the tool for real. Commit `tests/parser/mutation/knownHoles.ts` with the new fingerprints and
   a dated re-bless note in the header block naming both causes (PR #939, PR #948), matching the
   form of the notes already at `tests/parser/mutation/knownHoles.ts:118`.
4. Re-check: the tool exits 0. Then run `tests/parser/mutation/knownHoles.test.ts` and confirm the
   header census is green UNCHANGED — the independent second guard described below.

**The benign-class proof is a site SET comparison and never a count.** Equal counts are satisfied by
any permutation, and the whole failure mode here is fingerprints moving under stable siteIds. The
tool compares sets, which is what `reconcileLedger` already does by partitioning into `newHoles`,
`fixedHoles`, `driftedAlarms` and `driftedStale`; the re-bless is licensed only when the first two
are empty, one run supplied every shard, and no `(siteId, kind)` carries two fingerprints.

**A second, independent guard on the same claim, asserted rather than left incidental.** The ledger's
header carries a breakdown by operator and by kind
(`tests/parser/mutation/knownHoles.ts:236`, `total 1019 = 1002 wrong + 13 text_drift + 4 signal_loss`)
and `tests/parser/mutation/knownHoles.test.ts:207` compares it to the live rows under an executable
premise that its regex matched at all. A fingerprint-only re-bless moves no row's kind and no row's
operator, so **the header needs no edit, and that is the check**: run that suite after the rewrite
and confirm it is green with the census UNCHANGED. It knows nothing about the tool's refusal logic,
so it reds from a different direction if the re-bless was ever not drift-only. The verification
checklist for step 4 is therefore three conditions, all checked: the site set is identical, only
fingerprints moved, and the by-operator and by-kind census is unmoved.

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

- **`SOURCE_SHARD_COUNT` is finished as a lever, and the floor is now this arc's own split part.**
  At ten the makespan is 2490 s, which is the heavier of the two parts alone; eleven and twelve give
  the same 2490 s. So the floor is no longer a surface somebody else enrolled — it is
  `controlOutlineResidueBoundaries`, and the next count raise would be measuring nothing. The next
  breach is a surface that outgrew a leg, and the repair is another split or a cheaper deciding
  suite. Worth naming: the family-preserving split costs 157 s of makespan against the
  operator-balanced one (2490.111 s against 2333.122 s at N=10, both makespans), and that 157 s was
  spent deliberately to keep two rationale banners from losing their antecedents. Re-file trigger: a `budget` FAILURE on a scheduled `main`
  run at N=10.
- **The AC-3 control case cannot tell a genuine kill from a TIMEOUT** — both are a non-zero code at
  `tests/mutation/source/surfaceCases.ts:262-266`. A signal kill is a different matter and is
  handled: `tests/mutation/source/runner.ts:159-170` throws `MutantRunInfraError` rather than
  returning a code. Re-file trigger: an AC-3 failure that survives the post-A run.
- **A fixture or parser edit still cannot fire this harness before merge.** `parser-shards` is
  nightly-only on pull requests and neither `fixtures/**` nor `lib/parser/**` is in
  `on.pull_request.paths`. This arc makes the recovery mechanical; it does not move the trigger.
  FIVE instances of the drift class are on record, the fifth being the one this arc re-blesses.
  Re-file trigger: a sixth.
