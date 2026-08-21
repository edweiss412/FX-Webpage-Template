# Intra-leg process-boundary probe — design

**Row:** `BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG` (`BACKLOG.md`, heading `## BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG`). **Branch:** `feat/mutation-verdict-intraleg-probe`. **Parent design:** `docs/superpowers/specs/ci/2026-08-21-mutation-outcome-attribution-design.md` (the closing arc of `BL-MUTATION-SCORE-NONDETERMINISM`; cited below as "the parent spec").

---

## 1. Problem

A mutation verdict has been observed moving on byte-identical inputs — four observations of one site disagreeing with itself, recorded on the archived `BL-MUTATION-SCORE-NONDETERMINISM` row — and the mechanism is unexplained. The row this arc closes carries the unmet half of that archived row's original close condition, re-scoped: the first scheduled step is an INSTRUMENT, not another run.

The one branch genuinely still open is **intra-leg correlated within-process state**, and the reason it is open is structural, established by the parent spec §2.4: probe 3 ran the known-flaky site six times SERIALLY IN ONE PROCESS and got 6/6 identical. Under independent trials that excludes only a flip rate of roughly 40% per run or more — and `p^6 + (1-p)^6` presumes INDEPENDENCE, while serial runs in one process share cache, ordering, environment and load state. **Correlated within-process state is exactly what an intra-leg mechanism WOULD BE, so a perfectly correlated 50% mechanism yields six identical results with probability 1. More trials in the same process carry NO information at any sample size.** The only probe that can constrain this branch varies the PROCESS BOUNDARY and the ORDERING across trials, rather than repeating within one.

### 1.0 The negatives, read at their real strength

The historical record of verdict movement in this repo is **CI-only and failure-only** (parent spec §2.5): an annotation fires only when a surface FAILS THE GATE, in CI. `psqlStartupScan` — the surface with the CLEANEST reproduction in the corpus, three documented local flips — appears ZERO times in that channel, because its flips happened in local gate runs. So the advance-prediction row in the eliminated set below reads **"no recorded gate-failing movement", never "no movement"**, and no null below is proof of absence. The durable per-run record the parent arc shipped (`tests/mutation/source/records.ts`, uploaded by the `source-shards` job with `if: always()` at `.github/workflows/mutation-harness.yml:195-210`) exists precisely to remove that blind spot; this instrument is its first consumer.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **The eliminated set is SIX deep and is CITED, not re-run.** Co-tenancy (pre-registered experiment at ~30x perturbation, zero flips across 38 surfaces, `ledgerGit` itself moved shards and stayed green); timeouts at the locus (0 of 93 kills, three runs); headroom correlation (positive, stuck at n = 2, observed not sampled); duration-drives-instability by advance prediction (zero recorded movement across 19 failing CI runs — a CI-only, failure-only channel, §1.0); duration-drives-instability directly (mutant-duration max swung 19.8 s to 39.1 s while the survivor set reproduced EXACTLY); the bimodal tail (did not reproduce; run 3's tail is flat). Any spec- or review-round re-running one of these is out of scope by construction. | The row's own table (`BACKLOG.md`, `## BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG`, "THE ELIMINATED SET, SIX DEEP"); parent spec §1.1, §2.2-§2.5 |
| **More in-process repetition carries no information.** Any proposal to raise probe 3's trial count, or to add serial same-process trials of any size, is wrong by construction — the row states it and §1 restates the argument. | Row, "More trials in the same process carry no further information at any sample size"; parent spec §2.4 |
| **Two instruments, not one.** `pnpm mutation:determinism` (`scripts/mutation-determinism.ts`, core at `tests/mutation/source/determinism.ts`) stays exactly as shipped: its core is deliberately in-process so the source-mutation runner can overlay it (parent spec AC-9), and merging an across-process mode into it would make those in-process assertions unreachable — the CLI-shaped-surface trap. This arc ships a DIFFERENT instrument with a different contract that COMPOSES the shipped exports and edits none of them (§5.1, AC-13). | Row, "Do not attempt this by widening the existing determinism harness"; parent spec §5.4, AC-9 |
| **The load observation is sized at ONE.** The parent arc's two baselines differed in measured load with every verdict identical — ONE paired observation against the load mechanism, not six, because the other runs held load fixed and unmeasured. This arc adds exactly ONE more pre-registered pair (§5.2 arm C). A test requires the independent variable to move. | Row, "AND ONE LOAD OBSERVATION, sized honestly at ONE"; parent spec §2 |
| **A timeout still scores `KILLED`.** The verdict mapping is not this arc's subject; the reclassification decision is filed with its blast radius at parent spec §5.5 and belongs to `bl-orch`. | Parent spec §5.5, §1.1 |
| **The flaky site's ledger row is not touched on any single run's say-so.** The registry row records four observations and instructs re-run-first (`tests/mutation/source/registry.ts:2585`). No outcome of this campaign edits that row on fewer than the standing evidence rules. | `tests/mutation/source/registry.ts:2585` (the "Do NOT remove this row on a single stale-row report" sentence) |
| **Enrolment posture mirrors the parent.** The probe core is authored enrolable (importable module, referring suite, in-process assertions) and is NOT enrolled, for the parent's stated reason: a score computed by the machinery under audit cannot certify that machinery. §8. | Parent spec §8, §1.2 |

### 1.2 Convergence bound — what closes this design

**Consequence bound.** Every trial outcome is REPORTED with the condition that produced it — process identity, order seed, prefix set and position, and (for arm C) the measured load samples — and with its per-child evidence in the parent spec's record shape. The instrument certifies NOTHING beyond its reported observations: a null is stated as the numeric bound the trial count supports UNDER ITS STATED INDEPENDENCE ASSUMPTION, never as a closed branch, and a positive is stated as a reproduction with its evidence attached, never as a mechanism. The forbidden directions are **false certification** (claiming an exclusion the arithmetic or the independence assumption does not support; adjudicating a load pair whose load delta was not measured) and **wrong attribution** (binding an observation to a condition, an order, or inputs that did not produce it). A conservative REFUSAL plus a surfaced reason — including refusing to adjudicate — is a documented limit, not a defect.

**PROBE DOMAIN:** the surfaces enrolled in `tests/mutation/source/registry.ts` (`GUARD_SURFACES`, read live — deliberately not a pinned count) and their generated site sets read through the shipped `enumerateSites`/`generateMutants`; primarily the documented flaky site `relational-boundary:3578:35:<><=` on `psqlStartupScan` (`tests/mutation/source/registry.ts:2388`, evidence record at `tests/mutation/source/registry.ts:2585`); the synthetic control surface this spec adds under `tests/mutation/source/fixtures/processProbe/` (§5.3); and the measured duration distributions in parent spec §2. An admissible reviewer probe is drawn from this set or is one ordinary edit away from a member.

**Threat fence.** Ordinary variability of the harness under real machine conditions, local. Adversarial process manipulation — a deliberately wedged child, a tampered clock, a hostile reaper, an operator racing the state directory — is out of scope and files to documented limits, not to a finding.

**Closed criterion for the arc.** Three parts, each machine-checkable or pre-registered here: (1) the instrument ships as an importable core with a referring suite whose assertions decide in-process, plus a thin CLI adapter, and its discrimination is PROVEN both directions — it reports the manufactured correlated mechanism of §5.3 and stays quiet on `spawnBounded` while agreeing with the shipped `runSurface` verdicts (AC-4, AC-5); (2) the campaign of §5.2 is executed with its readings adjudicated exactly as pre-registered in §3 — no reading may be composed after the results land; (3) the row graduates per §3, both branches of which are written here before any trial runs. A finding against this spec is admissible with a probe from the domain showing silent corruption or wrong attribution, or a named weaker implementation the shipped fixtures fail to kill; a hypothetical trial condition outside the domain files to §6, and a proposal that re-opens §1.1 is not admissible.

---

## 2. Prior measurements this design rests on

All cited from the parent spec rather than re-run; §1.1 fences re-litigation.

| figure | value | source |
| --- | --- | --- |
| flaky-site serial trials | 6/6 SURVIVED, one process | parent §2.4 |
| what six serial trials exclude | one-sided `p > 0.393`; two-sided `0.4019 < p < 0.5981`; both CONDITIONAL on independence the design cannot support | parent §2.4 |
| flaky-site observation record | site survives 9 of 10 recorded observations (the anomalous outcome is `KILLED`) | `docs/superpowers/specs/ci/probes/2026-08-21-mutation-outcome-attribution.md:433`; the four originals at `tests/mutation/source/registry.ts:2585` |
| per-child wall clock, `psqlStartupScan` | 14.8-20.8 s per child; baseline ~15.2 s | parent §2.4 |
| per-mutant rate spread across surfaces | 19.7x (1.19 s `spawnBounded` to 23.45 s `ledgerGit`) — cross-surface extrapolation is invalid | parent §2, rule-207 record |
| child ceiling | `MUTANT_TIMEOUT_MS = 180_000` (`tests/mutation/source/spawnBounded.ts:67`) | shipped source |
| stability under measured load | one paired observation: 100%-co-tenanted vs quiet, verdicts identical | parent §2, row |

**What N all-identical independent trials exclude** (the command is the derivation; re-run it rather than trusting the table):

```
node -e 'const os=N=>1-Math.pow(0.05,1/N);[6,12,16].forEach(N=>console.log(N,os(N).toFixed(4)))'
6  0.3930
12 0.2209
16 0.1707
```

One-sided (`(1-p)^N = 0.05`, conditioned on the anomalous direction `KILLED`) is primary, matching the parent's choice and the question asked; the two-sided figure for N=12 is `0.2209 < p < 0.7791`. **The statistic is named on every report** (parent §2.4 measured the cost of not naming it).

---

## 3. Graduation posture — pre-registered, both branches

This section is the pre-registration. It is written before the instrument exists and MUST NOT be edited to fit results; adjudication quotes it verbatim. The base rate that makes the interesting branch real rather than a courtesy: the anomalous outcome (`KILLED`) has been observed in 1 of 10 recorded observations of the primary site (§2), so a flip inside a ~20-trial campaign is a genuine possibility, not a formality.

**Branch NULL — no trial in any arm flips.** Reading: the intra-leg branch's LOCAL reproduction is now bounded — across-process independent flip rate `p > 0.2209` excluded (arm A, N=12, one-sided) at the primary site; no ordering-dependent flip observed up to and including a full-complement gate-order replay (arm B, per-condition n too small for a rate claim and none is made); the load column moves from one paired observation to two (arm C). The row GRADUATES on a re-scoped condition stated first in its archive entry (the `BL-MUTATION-SCORE-NONDETERMINISM` precedent): the instrument exists and is proven discriminating, the local branch is bounded as above, and the remaining open space is weighted toward the CI environment — which local trials cannot reach (§6 limit 1) and which the parent arc's uploaded `.mutation-records` artifacts are the standing evidence channel for. The archive entry carries the eliminated/bounded table (six rows + these bounds) WITH how each was established. The CI-side question files as a documented limit with a re-file trigger (the next observed CI-resident flip, with its record pair as the incident), NOT as a fresh open row — the mint bar wants a measured incident, and a null here is not one.

**Branch POSITIVE — any trial flips.** Reading: first controlled local reproduction of the phenomenon WITH evidence attached — the trial's per-child records, stamps, condition (process/order/prefix/load) identify the axis. Specifically pre-registered sub-readings: a flip in arm A but not arm B localizes to process-boundary state; a flip under prefix burden (arm B) but not isolated (arm A) is the intra-leg signature the row names — accumulated in-process state; a flip only in arm C's loaded half moves the load mechanism from "one paired null" to "one positive" and redirects there. The arc still ships — the instrument catching it is its purpose — the row graduates on instrument-plus-reproduction, and a NEW row is minted with the reproduction as its `**Incident:**` (mint-bar satisfied by construction), naming the localized axis as its subject.

**Either branch:** the campaign's raw outputs, pre-registrations and controls land in `docs/superpowers/specs/ci/probes/` as a dated probe record (parent §2.6 convention), and no number from it is quoted anywhere without its producing command.

---

## 4. Approaches considered

- **Widen `mutation:determinism` with a `--processes` flag.** Rejected; fenced at §1.1 (row: the merge makes the in-process assertions unreachable).
- **A CI-side campaign first.** Deferred. The CI-resident anomaly (`ledgerGit`) is real, but a CI campaign costs a workflow surface, competes with the breached shard budget (`BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`, a filed peer this arc must not widen into), and cannot be iterated at probe cadence. The local instrument comes first; the CI half has a standing evidence channel already (the records upload) and is the null branch's named residue.
- **Composition over the shipped exports** — chosen. Each trial child invokes the SAME primitives the gate and the determinism harness use (`enumerateSites`, `generateMutants`, `runMutantRecorded`, `stampInputs`), so a difference between this instrument's observations and the gate's cannot be an artifact of a reimplemented runner. Zero edits to `determinism.ts`, `runner.ts`, `gate.ts` (AC-13).

---

## 5. Design

### 5.1 The trial, and what composes it

A **trial** is one observation of one TARGET site under one declared condition, executed in a FRESH PROCESS. The child process (spawned by the parent core through an injectable seam) executes, in order: a green-baseline check of the surface's deciding suites (red baseline = the trial REFUSES, composing the parent's rule — against a red baseline every mutant scores `KILLED` and the observation is meaningless); the trial's PREFIX — zero or more OTHER mutants of the same surface, in the plan's declared order, each run once through `runMutantRecorded`; then the TARGET mutant once. It reports, on a machine channel to the parent (a JSON file in the trial's own scratch dir, never parsed from stdout prose): the target verdict, per-child `ChildRecord` evidence for every prefix and target child (`tests/mutation/source/runner.ts:40`), the input stamp pair via the shipped `stampInputs` (`tests/mutation/source/determinism.ts:158`), the child's own pid and a per-process nonce generated INSIDE the child, and the executed order as observed (derived from the child records, not echoed from the plan).

The importable core is a NEW module under `tests/mutation/source/` (stem processProbe; described, not cited, because it does not exist yet) carrying: trial PLANNING (pure: seeded shuffles, arm layout; reproducible from a recorded seed), SPAWNING (injectable `deps`, `DEFAULT_DEPS` bound to the real child entry — the `scripts/mutation-determinism.ts:36` pattern, with the impostor-discrimination proof), AGGREGATION (distributions per arm, the §2 arithmetic emitted with its statistic named), REFUSALS (accept-sets with the complement default-denied, the shape of `parseRuns` at `tests/mutation/source/determinism.ts:111`), and RENDER (pure). Two thin NEW adapters under `scripts/` (stem mutation-process-probe): the child entry, which turns one trial plan into core calls inside a fresh process, and the operator CLI (`pnpm mutation:process-probe`). Neither adapter holds a decision.

### 5.2 The campaign — three arms

All arms target the primary site (`relational-boundary:3578:35:<><=` on `psqlStartupScan`) unless a plan-time derivation shows the site id has moved, in which case the successor id is derived through the shipped enumerator (`pnpm mutation:sites`), never by offset arithmetic. Cost figures use the measured 14.8-20.8 s/child + ~15.2 s baseline + process startup; they are sizing aids, not pins.

- **Arm A — process boundary, isolated. N = 12** fresh-process trials, prefix length 0, one target run each (~40-45 s per trial; ~9 min). Under cross-process independence, 12/12 identical excludes `p > 0.2209` one-sided (§2). This is probe 3's exact question re-asked with the correlated-state objection removed as far as a single machine allows.
- **Arm B — ordering. N = 6** trials with prefix burden: three at prefix 8 (distinct seeded shuffles; ~2.5-3.5 min each), two at prefix 24 (~6.5-9 min each), one FULL-COMPLEMENT replay in generation order — every other mutant of the surface before the target (~19-26 min) — the closest local approximation of the gate-run condition the historical flips occurred in. No pooled rate claim (heterogeneous conditions, small n); the pre-registered reading is presence/absence per condition (§3).
- **Arm C — load, exactly ONE paired observation.** Two arm-A-shaped trials, one during deliberately generated machine load and one quiet, with load MEASURED on both halves by a sampler writing the whole slot/process table every 30 s to an artifact (the parent arc's sampler shape). The pair is adjudicable ONLY if the loaded half's measured load exceeds the quiet half's by a stated margin; otherwise the instrument REFUSES to adjudicate and says so — a test requires the independent variable to move, and asserting the load rather than measuring it is the exact defect the row's own history warns about.

Whole-campaign wall clock ≈ 50-70 min (the sum of the per-arm ranges above), one `pnpm heavy` slot, launched with `run_in_background` (a foreground Bash call dies at the documented 600 s cap). The campaign command transitively launches vitest children, so its outermost entry is heavy-wrapped by the AGENTS.md transitive-shape rule.

### 5.3 The manufactured correlated mechanism — the instrument's positive control

A synthetic surface under `tests/mutation/source/fixtures/processProbe/` (source + deciding suite; NOT enrolled in the registry — it is apparatus, not a guard): its deciding suite's verdict depends on cross-invocation state in a directory named by an env var the harness sets per SCOPE (per-process in across-process mode, shared in a deliberately provided in-process comparison mode used only by this control's own proof). The state schedule is authored so that serial same-scope runs FLIP the verdict at a known run index while fresh-scope runs are stable — a correlated intra-leg mechanism, manufactured.

**The instrument must report the flip, with per-trial conditions, in the shared-state configuration, and report stability in the fresh-state configuration.** That is the discrimination proof: a harness that cannot see a KNOWN correlated mechanism reports "stable" vacuously, and every campaign null it later produces is worth nothing (a zero needs a positive control; a detector that has never fired earns no zeros). Authoring hazard, stated now because the fixture-satisfiability discipline predicts it: the green-baseline check ITSELF runs the deciding suite and consumes state, so the schedule must be authored against the full observation sequence (baseline + trials), and the control's proof must assert WHICH rule decided each observation — a flip caused by baseline consumption rather than by trial-index state proves the wrong thing while rendering the same verdicts.

### 5.4 Read-out and record discipline

Per-trial results are written through the parent's record module where the shape fits and alongside it where it does not: campaign records live under a probe-owned directory passed as `MUTATION_RECORD_DIR` (`tests/mutation/source/records.ts:56` — the AC-18 isolation seam, reused rather than re-implemented), inside the already-gitignored `.mutation-records/` tree, so a campaign can never mix records into a gate run's channel. Trial evidence uses the shipped `ChildRecord`/`MutantOutcome` shapes verbatim. Every aggregate the renderer prints carries its population size beside it (`0 of 0` and `0 of 12` render identically otherwise), names its statistic, and REFUSES on an empty completed-trial population rather than printing a distribution — infra-faulted trials are excluded from the distribution and reported by name, composing the parent's `MutantRunInfraError` discipline (`runner.ts:113`).

### 5.5 The CLI

`pnpm mutation:process-probe --site <siteId> [--surface <id>] --arm <A|B|C|control> --trials <n> --seed <s> ...` — a thin adapter over the core, `scripts/mutation-determinism.ts`'s documented shape: every decision in the core, `main` takes `deps`, a spy proves the wiring, `DEFAULT_DEPS` separately asserted bound to the real core. Every refusal exits 2 naming WHICH input failed and emits no distribution. The seed defaults to a generated value the tool PRINTS, so every plan is reproducible from its own output.

### 5.6 What is touched

NEW files only, plus the `package.json` scripts block and index rows. The new artifacts, DESCRIBED rather than cited because a citation to a path this arc's own plan creates is valid only while it stays uncreated: the probe core module and its referring suite, both new under `tests/mutation/source/` with the basename stem processProbe; the control-surface fixture tree under `tests/mutation/source/fixtures/processProbe/`; the operator CLI and the child entry, both new under `scripts/` with the stem mutation-process-probe; the `mutation:process-probe` script entry; this spec's row in `docs/superpowers/specs/ci/README.md`; and (at implementation time) the dated probe record under `docs/superpowers/specs/ci/probes/`. **No edit to `determinism.ts`, `runner.ts`, `gate.ts`, `records.ts`, `registry.ts`, any `guardSurfaces.*` shard file, or any workflow** — asserted at close by AC-13's diff command, whose pathspec IS this list (stated once, in AC-13; this sentence references it so the two cannot drift), which is the two-instruments guarantee made mechanical, and the reason no enrolled surface's score is retired by this arc (rule 27 never fires: no source, suite, operator or fixture of any enrolled surface moves). The probe suite is collected by the merge-gating unit project by default (`vitest.projects.ts:148` includes the mutation tree, with only the named nightly gate files excluded at `vitest.projects.ts:98-101`); the live child-spawning integration case is env-gated out of the fast suite (`RUN_PROCESS_PROBE_LIVE=1`, the `build-artifact-gate` precedent) so the fast suite stays fast and the live case still has a named, runnable gate — its placement is verified at plan time by a collection probe, not assumed.

---

## 6. Documented limits

1. **Local machine only.** Every trial runs on one developer machine; the CI-resident anomaly (`ledgerGit`, both original observations straddling the local/CI boundary) is outside this instrument's reach. The CI half's standing evidence channel is the parent arc's uploaded records; a CI campaign is future work gated on an incident (§3 null branch).
2. **Cross-process is not full independence.** Fresh process, env, and scratch per trial — but one machine, one hour, shared OS page cache and load regime. The arm-A bound is CONDITIONAL on cross-process independence, stated on every report; a mechanism correlated at machine scope (thermal state, cache residency, a co-tenant arc) survives it. Arm C probes exactly one point of that space, at n = 1 pair, per §1.1.
3. **Ordering coverage is a sample.** Arm B covers prefix lengths {8, 24, full} and a handful of shuffles; position-within-shuffle and prefix-identity effects at other lengths are unprobed. No pooled ordering rate is claimed, and none may be quoted.
4. **The stamp covers DECLARED inputs only** (inherited verbatim from parent §6 limit 10): `psqlStartupScan`'s suite walks the repository, so an undeclared-input change can move a child's exit with both stamps identical. Trials are therefore run from a frozen tree (the campaign refuses on a dirty tree over the surface's declared inputs), and the residue is the parent's, not new.
5. **A within-child A→B→A input flip is invisible** (parent §6 limit 11, inherited).
6. **The load generator shapes load coarsely.** Arm C's "loaded" condition is whatever the generator plus ambient machine state produce, measured but not controlled; a null there is one paired observation under ONE load shape, and says nothing about other shapes.
7. **A timeout still scores `KILLED`** (parent §5.5, unruled). A trial whose target times out is reported with `kind: "timeout"` evidence and counted as `KILLED` in the distribution, with the kind visible — the instrument surfaces the ambiguity rather than resolving a decision that is not this arc's to take.
8. **The control surface proves detectability, not coverage.** §5.3 proves the instrument can see A correlated mechanism — the one manufactured. A real mechanism with a different state carrier (fd table, DNS cache, kernel entropy) flips through the same read-out but its detection is not separately proven per carrier.

---

## 7. Acceptance criteria

Every row names the executable step that proves it and the weaker implementation it kills. A green suite is not proof for any row unless the row says so.

| id | criterion | proved by | the weaker implementation it kills |
| --- | --- | --- | --- |
| AC-1 | Every CLI/core input is an accept-set with the complement default-denied: `--trials` (integer >= 1), `--seed`, `--arm`, `--site`, `--surface`, prefix lengths. Each refusal exits 2, names WHICH input failed, and emits NO distribution. | Drive the core with every invalid form (missing, empty, `NaN`, `Infinity`, fractional, zero, negative, unknown arm, unknown surface, unresolvable site, duplicate surface id via the injectable `surfaces` seam) and assert the refusal names the input; assert no distribution text is emitted on any refusal path. | One that coerces a fraction into a trial count; one whose refusal is a bare "not found"; one that prints a partial distribution before refusing. |
| AC-2 | Each trial executes in a genuinely FRESH process. | Trial reports carry a pid and a nonce generated INSIDE the child; the live integration case asserts N trials yield N distinct nonces, and the in-process suite asserts the aggregator REFUSES a trial set with duplicate nonces. | An implementation looping in one process and fabricating trial boundaries — which reproduces probe 3 while reporting it as the across-process result. |
| AC-3 | The executed order IS the planned order, and the report's order field is DERIVED from execution, not echoed. | The trial report's order is reconstructed from the per-child records (suite/context sequence); a fixture where the injected child seam deliberately executes a DIFFERENT order must produce a reported order matching execution and a loud plan/executed mismatch flag. | A planner that prints shuffled plans while running a fixed order; a reporter that echoes the plan field. |
| AC-4 | The instrument DETECTS the manufactured correlated mechanism: shared-state configuration reports the flip with per-trial conditions; fresh-state configuration reports stability. Each assertion names which rule decided the observation (§5.3's baseline-consumption hazard). | The §5.3 control surface run both ways in the live integration case; assert the flip's run index equals the authored schedule's, not merely "some flip". | A harness that cannot see a known correlated mechanism and reports every campaign as stable — the vacuous-null instrument. |
| AC-5 | Negative control: on `spawnBounded`, trial verdicts agree with the shipped `runSurface`, all stable. | Live integration case, one arm-A-shaped trial set on `spawnBounded` (cheapest surface, 1.19 s/mutant); assert verdict agreement per site with the shipped gate path. | A reimplemented runner whose verdicts agree by luck; caught here or not at all, since AC-13 forbids touching the real one. |
| AC-6 | Record isolation: campaign records land ONLY under the probe-owned `MUTATION_RECORD_DIR`, never the default. | Run with the redirect set; assert records exist there and the default dir gained nothing. | A sink hard-coded to `.mutation-records`, mixing campaign records into the gate's channel — wrong attribution in the attribution channel. |
| AC-7 | Every rendered aggregate carries its population size, its statistic BY NAME (one-sided/two-sided, N, the independence condition), and contains no exclusion vocabulary beyond it — the renderer never emits "closed", "ruled out", or "eliminated". | Render fixtures for null and positive campaigns; assert the bound text quotes §2's form; assert the forbidden tokens are absent from every render path (comment-stripped, use-vs-mention safe). | A renderer that upgrades a bound to an exclusion — the overclaim the parent arc was refuted on, made unrepresentable. |
| AC-8 | Infra-faulted trials are EXCLUDED from the distribution and reported by name; zero completed trials ABORTS rather than printing a distribution. | A fixture child seam throwing `MutantRunInfraError` on run k: assert the distribution's denominator excludes it and the fault is listed; all-faulting fixture: assert refusal, not an empty distribution. | One folding a fault into `KILLED` (score inflation); one printing `0 of 0` as a clean result. |
| AC-9 | The core's assertions decide IN-PROCESS; `DEFAULT_DEPS` is bound to the REAL child entry and the REAL spawn path. | The suite imports the module directly; a spy proves `main` calls its collaborators with the operator's arguments; the `DEFAULT_DEPS` identity assertion is proven discriminating by pointing it at an impostor. | A CLI-shaped surface the runner cannot overlay; an injectable seam certifying a production path wired to a stub. |
| AC-10 | Arm C adjudicates ONLY on a measured load delta; otherwise it refuses and says so. | Fixture load-sample sets: delta present → adjudicated with both samples attached; delta absent/reversed → refusal naming the margin; samples missing → refusal naming the sampler. | A pair adjudicated on asserted-not-measured load — the exact evidential defect §1.1's load row fences. |
| AC-11 | Plans are reproducible: same seed → byte-identical plan; the seed appears in every plan, report and render. | Pure planner property test plus a render assertion. | An unseeded `Math.random` planner whose campaign no one can re-run. |
| AC-12 | Each trial carries the shipped stamp pair over the surface's declared inputs; a moved input marks the trial UNATTRIBUTABLE and excludes it from any bound, reported. | Fixture where an input hash differs between stamps: assert the trial is flagged, excluded from the arithmetic, and listed. | One averaging an unattributable trial into the bound. |
| AC-13 | The two-instruments guarantee: `git diff origin/main...HEAD -- tests/mutation/source/determinism.ts tests/mutation/source/runner.ts tests/mutation/source/gate.ts tests/mutation/source/records.ts tests/mutation/source/registry.ts 'tests/mutation/guardSurfaces.*' .github/workflows/` is EMPTY at close — the same set §5.6's no-edit sentence names, stated once here and referenced there so the two cannot drift. | The closeout runs the command and gates on empty output (enforced by exit, not printed beside a comment); the plan's closeout block is dry-run against the current tree before it is depended on. | The widening §1.1 forbids, arriving as an "innocent" helper edit; and a closeout check that reports without gating. |
| AC-14 | The campaign artifacts are complete before adjudication: every trial's report file exists and parses, and the count equals the plan's. | The aggregator reconciles produced-vs-planned per arm and refuses on a shortfall, naming missing trials. | An aggregator reading whatever files happen to exist — a crashed trial silently shrinking the denominator toward the null. |

**Derivation note.** Fourth columns were authored by asking, per row, which implementation passes the other thirteen — the parent table's method. A row whose fourth column is empty is unfinished.

---

## 8. Mutation enrolment — stated, not enrolled symbolically

The core is authored enrolable from the start: importable module, referring suite collected by the merge-gating unit project, assertions in-process, spawn boundary injectable. It is NOT enrolled by this arc, for the parent's §8 reason, which applies with equal force one instrument out: this probe audits the runner's verdict stability, and a mutation score for the probe is computed by that same runner machinery — the criterion would be circular. The substitute convergence evidence is the killer audit run against §7's fourth column (every named weaker implementation ABSENT, PRESENT-BUT-UNPROVEN, or PROVEN — reported as the three-state split, with each PROVEN entry demonstrated by applying the mutant and observing the named case red), plus the §5.3 both-directions discrimination proof. Review briefs for this arc state the convergence criterion in §1.2's terms and say explicitly that the score criterion is unavailable here and why; a survivor-based finding is therefore not available to a reviewer of this arc, and the brief says that too.

---

## 9. Peers and class-sweep disposition

The class: "a probe whose trials share the state its subject lives in." Swept across the repo's probe surfaces:

| site | disposition |
| --- | --- |
| Probe 3 (parent §2.4) | SUPERSEDED by this instrument for the intra-leg question; its record stands as history and is not edited. |
| `pnpm mutation:determinism` in-process core | NOT AN INSTANCE — its contract is explicitly in-process (overlayability, parent AC-9); documented at §1.1 here. |
| The parent arc's load observation (n = 1) | EXTENDED by arm C to n = 2, per §1.1's sizing rule; not re-interpreted. |
| CI-resident observations (`ledgerGit`) | OUT OF REACH of any local probe — §6 limit 1, with the records upload as the standing channel; not a deferral of work this instrument could do. |

---

## 10. Out of scope

- Explaining the flake. A positive redirects per §3; a null bounds. Neither explains.
- Any CI-side campaign or workflow edit.
- Re-running any member of the eliminated set (§1.1).
- Changing the verdict mapping (parent §5.5).
- Repairing `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` or `BL-MUTATION-HARNESS-MAIN-RED`.
- Enrolling the probe core (§8), and any edit to the files AC-13 freezes.
