# Plan: mutation gate fidelity

**Spec:** `docs/superpowers/specs/ci/2026-08-26-mutation-gate-fidelity-design.md` (APPROVE at spec round 4; 7/3/2/1 findings, none refuted)
**Branch:** `fix/mutation-gate-fidelity` · **Base:** `origin/main` at `75b8f7a3e`
**Archives:** `BL-MUTATION-HARNESS-MAIN-RED`, `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`, `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`

`impeccable-gate: N/A - no UI surface`

---

## Pre-draft code-verification pass

Run before drafting, per `docs/agents/writing-plans.md`. Every anchor below was read on the live tree at `75b8f7a3e`, not recalled.

| claim | verified |
| --- | --- |
| `assertCleanBaseline(exitCode, suite)` takes two parameters | `tests/mutation/source/oracle.ts:33` |
| its only production caller | `tests/mutation/source/runner.ts:236` |
| its test call sites, three of them | `tests/mutation/source/oracle.test.ts:21-26` |
| the browser side ALREADY names the surface, so this is precedent not invention | `tests/mutation/browser/runner.ts:127` composes the surface id into the message it throws |
| `scripts/intraleg-killer-audit.mjs:555` defines an unrelated local function of the same name | not a call site; excluded |
| `RunRecord` is `{surfaceId, runId, startedAt, passed, score, outcomes}` with no fault field | `tests/mutation/source/records.ts:39` |
| `readRunRecord` is a bare `JSON.parse` with no key validation, so an optional field breaks no reader | `tests/mutation/source/records.ts` |
| `registerSurfaceCases` reads the source and evaluates at describe-callback scope | `tests/mutation/source/surfaceCases.ts:78`, `tests/mutation/source/surfaceCases.ts:85`, `tests/mutation/source/surfaceCases.ts:86` |
| the registrar has exactly seven `it(` literals | `88, 96, 110, 119, 126, 130, 137` |
| a gate pins that count at 7 and ties it to `(tests - 2) / 7` | `tests/mutation/guardSurfaces.gates.test.ts:44-50` |
| `surfaceCases.test.ts` already drives the REAL registrar against a mocked `spawnSync` that branches on `isBaseline` | `tests/mutation/source/surfaceCases.test.ts:20-118` |
| `GateNotice` is a discriminated union whose only member is `timeout-kill`, built inside `evaluateGate` | `tests/mutation/source/gate.ts:167-183` |
| `source-shards` job head, matrix, and the chromium precedent steps | `.github/workflows/mutation-harness.yml:154`, `.github/workflows/mutation-harness.yml:158`, `.github/workflows/mutation-harness.yml:178-179` |
| `budget` already carries `if: always()` | `.github/workflows/mutation-harness.yml:258`, `.github/workflows/mutation-harness.yml:260` |
| the integrity guard pins step 0, exactly one `$GITHUB_ENV` writer, and upload names — and pins `if:` only on STEPS INSIDE `budget`, never on a job head | `tests/mutation/_metaSourceShardIntegrity.test.ts` |
| the shared bootstrap script exists and is executable | `scripts/ci/supabase-local-bootstrap.sh` |
| the survivor site | `tests/db/_connectionCensus.ts:1641` |
| the describe block that misses it | `tests/db/connectionCensus.test.ts:2464-2536` |
| `connectionCensus` is declared `EXPECTED_ENV_TOUCHING: 0` | `tests/mutation/_metaPremiseContract.test.ts:470` |
| that guard is GREEN today: 11 passed, 46.5 s | run at plan time |
| `surfaceCases.ts` and `oracle.ts` are NOT enrolled surfaces, so R1 and AC-2 carry no scoring duty | the only `sourcePath:` values under `tests/mutation` in the registry are `tests/mutation/source/premiseScan.ts`, `tests/mutation/browser/registry.ts`, `tests/mutation/browser/mutate.ts`, `tests/mutation/source/shardPartition.ts` and `tests/mutation/source/spawnBounded.ts` |

### Reconciliation sweep, authored AND RUN

The registries this diff could disturb, swept at plan time rather than described as a check to perform later.

```
$ pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts
  Test Files 1 passed (1)   Tests 11 passed (11)
$ pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts
  Test Files 1 passed (1)   Tests 135 passed (135)
```

| registry | exposure | disposition |
| --- | --- | --- |
| `guardSurfaces.gates.test.ts` case (c), 7 `it(` literals | Task 3 edits the registrar | branch INSIDE the seven bodies; the literal count is unchanged and asserted by Task 3's own green step |
| `_metaPremiseContract` `EXPECTED_ENV_TOUCHING` | Task 6 adds a case to `connectionCensus.test.ts`, declared 0 | Task 6 re-runs the guard; if the count moves, state the case's premise or carry a `no-premise:` exemption. Baseline recorded above |
| `_metaSourceShardIntegrity` | Tasks 4 and 5 edit the workflow | step 0 unchanged, no new `$GITHUB_ENV` writer, no upload name change, and its `if:` assertions target steps inside `budget`, not job heads |
| `_metaSpawnDisposition` `CEILING_NAMES` / `CEILING_HOME` | Step A edits `spawnBounded.ts` | comment only; no constant renamed, no value moved |
| `EXPECTED_LEDGER_KINDS` | Task 6 kills a survivor | killing adds no accepted row, so no declaration changes |
| `ci-workflow-speedup.test.ts` workflow-level `concurrency` | Task 5 | not edited |
| `mutation-browser-ci-wiring.test.ts` `on.pull_request.paths` | Task 5 | the trigger and its ten globs are not edited; narrowing is at the job |

---

## Acceptance criteria this plan discharges

Restated from the spec's §6 so each id resolves in this document; the spec remains canonical.

| id | criterion | task |
| --- | --- | --- |
| **AC-1** | A faulted surface registers exactly seven cases with the same titles and order as an evaluated one, each body throws, a fault notice reaches the `write` sink, and its run record carries a `fault` naming the cause; the healthy surface on the same leg still reports. | Tasks 2, 3 |
| **AC-2** | `BaselineNotGreenError` names the surface, not only the suite paths. | Task 1 |
| **AC-3** | `retryableRpcVolatilityScan` scores on a `source-shards` leg with no `BaselineNotGreenError` in any annotation. | Task 4 writes the steps; **Step C observes the run**. A parsed-YAML assertion cannot establish that a bootstrap SUCCEEDS on a runner, only that it is declared, which is the same gap finding 3 identified for AC-5. |
| **AC-4** | `reconcileValidationEnv` reports `stale: []` for an allow row whose file still holds a `validation-env` site, and `connectionCensus` has zero unaccepted survivors. | Task 6 |
| **AC-5** | A harness-touching pull request sends exactly 2 jobs to runners, down from 19; a schedule run still sends 20 and this branch's own dispatch sends 19. | Task 5 |
| **AC-6** | `steps[0]` of every shard job is still `stamp-start`, exactly one step writes `$GITHUB_ENV`, and the two shell bring-up steps are `run:`. | Task 4 |
| **AC-7** | Every enrolled surface this diff touches carries a stated `GUARD SURFACE:` score with zero unaccepted survivors. | Scoring duty, below |
| **AC-8** | The next scheduled nightly on `main` after the merge is green. | Not dischargeable here: it lands after a merge this arc does not perform, and the orchestrator owns the observation. |

---

## Meta-test inventory

- **CREATES:** the per-surface fault-isolation cover in `tests/mutation/source/surfaceCases.test.ts` (Task 3), and a workflow-shape guard for the bring-up and the PR narrowing (Tasks 4 and 5).
- **EXTENDS:** `tests/mutation/source/oracle.test.ts` (Task 1), `tests/mutation/source/records.test.ts` (Task 2), `tests/db/connectionCensus.test.ts` (Task 6).
- **UNTOUCHED, declared:** every row of the sweep table above.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — `assertCleanBaseline` names the surface

<!-- task: red=`pnpm exec vitest run tests/mutation/source/oracle.test.ts` red-state=authored red-target=`tests/mutation/source/oracle.ts:33` why=`assertCleanBaseline takes only (exitCode, suite) and composes a message from the suite list alone, so no surface id can appear in the thrown message however the caller invokes it` ac=AC-2 -->

**What is red and why:** a new case asserts the thrown message contains the surface id; today the function has no parameter that could carry one.

RED: add to `oracle.test.ts` a case calling `assertCleanBaseline(1, "tests/x.test.ts", "someSurface")` and asserting the message matches `/someSurface/` AND `/tests\/x\.test\.ts/`. It fails to compile-or-match because the third parameter does not exist.

GREEN: add `surfaceId: string` as the third parameter; compose the message leading with the surface. Update the sole production caller at `tests/mutation/source/runner.ts:236` to pass `surface.id`, and the three existing test call sites.

**Anti-tautology:** the case asserts BOTH the surface id and the suite list, so an implementation that replaces the suite list with the id (losing information) fails too. `tests/mutation/browser/runner.ts:127` is untouched: it constructs the error directly with a composed string, and `BaselineNotGreenError`'s single-string constructor is unchanged.

## Task 2 — `RunRecord` can carry a fault

<!-- task: red=`pnpm exec vitest run tests/mutation/source/records.test.ts` red-state=authored red-target=`tests/mutation/source/records.ts:39` why=`RunRecord is {surfaceId, runId, startedAt, passed, score, outcomes} with no fault member, so a record written for a faulted surface is byte-indistinguishable from one that legitimately scored zero` ac=AC-1 -->

**What is red and why:** a new case round-trips a record carrying `fault` through `emitRunRecord` and `readRunRecord`; today the field is dropped because neither type nor the emit path carries it.

RED: emit with `fault: "BaselineNotGreenError: someSurface …"`, read the file back, assert `back.fault` equals it, and assert a record emitted WITHOUT a fault has `fault === undefined`.

**This task proves TRANSPORT only, and says so.** It shows `emitRunRecord` preserves whatever the caller passes. It cannot show the caller passes anything useful — that is Task 3's, and the split is stated here so neither task assumes the other covered it.

GREEN: add `fault?: string` to `RunRecord` and to `emitRunRecord`'s input, threaded through `writeRunRecord` with the same `...(x === undefined ? {} : {x})` shape the file already uses for its optional options.

**Anti-tautology:** the second half (absent stays absent) is what stops an implementation writing `fault: ""` or `fault: null` into every record, which would satisfy a presence-only assertion while making the field useless as a discriminator.

## Task 3 — per-surface fault isolation, with registration observable

<!-- task: red=`pnpm exec vitest run tests/mutation/source/surfaceCases.test.ts` red-state=authored red-target=`tests/mutation/source/surfaceCases.ts:86` why=`evaluateSurface is called at describe-callback scope with no guard, so a BaselineNotGreenError thrown inside it aborts vitest collection for the whole file and no case of any surface is ever registered` ac=AC-1 -->

**What is red and why:** the new case registers `[faulting, healthy]` through the real `registerSurfaceCases`. On today's tree the faulting surface throws during collection and the whole test FILE errors, so every assertion in it is unreachable. That failure comes from production behavior at `surfaceCases.ts:86` and cannot be made green by editing the test.

RED, in `surfaceCases.test.ts`:

1. Add a lever to the existing `spawnSync` mock: a `baselineRedSuite` variable, and when `isBaseline` is true and the suite matches it, return `status: 1`. This reuses the mock's existing `isBaseline` branch rather than adding a second mechanism.
2. Call `registerSurfaceCases([faulting, healthy], { write, register })` with an INJECTED registrar recording `(title, body)` pairs per describe.
3. Assert, on the FAULTED surface: exactly 7 recorded titles; the titles equal the healthy surface's 7 titles in the same order; invoking each body throws; the first body's message contains the surface id and `BaselineNotGreenError`.
4. Assert, on the HEALTHY surface: 7 titles, and invoking each body does not throw.
5. Assert the fault NOTICE reached the `write` sink naming the faulted surface.
6. Assert the fault RECORD carries `passed: false` and a `fault` that **names the error class and the message**, not merely a non-empty string. Concretely: `fault` starts with `BaselineNotGreenError`, contains the faulted surface's id, and contains the suite path the mock reddened. Derive the expected suite path from the fixture the test itself configured, never a literal typed twice.

**Why the content assertion and not a truthiness check:** an implementation writing `fault: "failed"` satisfies Task 2's transport proof and a non-empty check, while leaving the record unable to tell a red baseline from a source-read failure or an infrastructure fault — which is the whole reason AC-1 requires the field. A truthy assertion here would re-open on the record channel exactly the escape three spec rounds closed on the registration channel.

GREEN, in `surfaceCases.ts`:

- `options.register?: { describe: typeof describe; it: typeof it }`, defaulting to the module's vitest imports. Production path unchanged.
- `evaluateSurfaceOutcome(surface, options)` wraps the `readFileSync` + `evaluateSurface` pair and returns `{kind:"evaluated",…}` or `{kind:"faulted", error}`.
- On `faulted`: write the fault notice through the same `write` sink (**directly, not via `result.notices`** — `GateNotice` is a closed union built inside `evaluateGate`, which never ran for this surface), and `emitRunRecord` with `passed:false, score:0, outcomes:[], fault`.
- Register the same seven `it(` calls unconditionally; each body checks the outcome first and fails with the fault when faulted. **No branch between entering the describe callback and the seven registrations**, so a shortened list is not a reachable state.

**The failure modes this catches, each with its assertion:** evaluation moved back outside the wrapper (healthy-side registration and notices red); a fault caught and swallowed (faulted bodies do not throw); a fault reported but its cases skipped (faulted title count is not 7); a record with no cause (the `fault` assertion reds).

**Why the injected registrar does not weaken the wiring proof:** the file already carries an un-skipped case proving the REAL registrar drives real shard output through the notice sink. That case proves production wiring; this one proves what the registrar registers. Neither alone suffices.

**Guard interaction, verified at plan time:** the seven literal `it(` calls stay seven, so `guardSurfaces.gates.test.ts` case (c) and its `(tests - 2) / 7` arithmetic are unaffected.

## Task 4 — the `source-shards` job gets a database

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:154` why=`the source-shards job's only environment steps are checkout, the setup action and the two chromium installs, so no step stands up a database and a surface whose deciding suite opens one fails its baseline on every leg` ac=AC-3,AC-6 -->

**What is red and why:** a new case asserts `source-shards` runs the shared bootstrap and installs the pinned CLI. No such step exists today.

RED: add to `_metaSourceShardIntegrity.test.ts` a case asserting, for the `source-shards` job: a step whose `uses` starts with `supabase/setup-cli` and whose `with.version` equals the version `unit-suite-db` pins; a `run:` step invoking `scripts/ci/supabase-local-bootstrap.sh`; a `run:` step installing `psql`; and — the part that keeps the existing contract honest — that `steps[0].id` is still `stamp-start` and that exactly one step still writes `$GITHUB_ENV`.

GREEN: add the three steps after `./.github/actions/setup`, alongside the chromium pair, with a comment recording the cost (84 s per leg, measured) and documented limit L-1's re-file trigger.

**Anti-tautology:** the version is asserted EQUAL to the one `unit-suite-db` pins, read from that workflow, not hardcoded — so the two cannot drift apart silently, which is the actual failure this guards. The `steps[0]` and `$GITHUB_ENV` assertions are included in the SAME case so a repair that satisfies the new requirement by breaking the old one cannot pass.

## Task 5 — narrow the PR trigger to the smoke leg

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:158` why=`parser-shards and source-shards carry no job-level if:, so every matrix leg is dispatched on a path-filtered pull_request exactly as on a schedule` ac=AC-5 -->

**What is red and why:** a new case asserts the three long jobs are gated on the event and that the two gates jobs are not. No job head carries a condition today.

RED: assert `parser-shards.if` and `source-shards.if` are exactly `github.event_name != 'pull_request'`; that `budget.if` is the compound form retaining `always()`; that `parser-gates` and `source-gates` carry NO job-level `if:`; and that `on.pull_request.paths` still holds all ten globs unchanged.

GREEN: add the conditions. `budget` becomes `if: ${{ always() && github.event_name != 'pull_request' }}` — a second `if:` key would be a duplicate-key parse error, and dropping `always()` would skip the job whenever a prerequisite fails, which is when its report matters. Add a comment above the gated jobs naming `workflow_dispatch` as the escape and stating the five signals a PR no longer sees.

**Anti-tautology:** the ten-glob assertion is in the same case, so a "narrowing" that deletes path coverage instead of gating jobs fails. Asserting the gates jobs carry NO condition stops an over-broad edit that gates everything and leaves PRs with no harness signal at all.

## Task 6 — kill the `connectionCensus` survivor

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy:mutation pnpm tsx scripts/mutation-score-surfaces.ts connectionCensus` red-state=live red-target=`tests/db/_connectionCensus.ts:1641` why=`statement-removal:1641:7 survives with no ledger row, observed on run 32958581720 leg 1, because no case asserts stale is EMPTY for an allow row whose file still holds a validation-env site` ac=AC-4 -->

**What is red and why, and why the red command is the SCORE rather than the unit suite.** The new case passes against clean production the moment it is written — that is what a killing case IS — so `pnpm exec vitest run tests/db/connectionCensus.test.ts` is green before and after and expresses no verdict. The command that is genuinely red today and green after is the scoped mutation score, which reports `unaccepted-survivor: 1` for `statement-removal:1641:7` and reports none once the case lands. That is the same-command red-then-green the contract requires, and it is the established shape for a coverage-gap task (`docs/superpowers/plans/ci/2026-08-25-mutation-shard-weight-seconds.md` uses it).

**Consequence for this plan's own gates:** the marker is `red-state=live`, so `pnpm spec:lint --exec-red` WOULD execute a ~107-minute scored run that also needs the mutation class lock. Do not run `--exec-red` against this plan without the lock held; the plan-time lint run recorded above was made before this marker existed and is not re-runnable in that form.

Probed at plan time:

```
$ pnpm tsx .scratch/r3probe.ts
premise: the fixture has a validation-env site = true
clean  stale = []
mutant stale = ["tests/db/validation-schema-parity.test.ts"]
clean  unallowed n = 0   mutant unallowed n = 0
```

`unallowed` is identical under both, which is exactly why the nearest existing case (`the same site in an allowlisted file is NOT reported`) cannot see the mutant: it asserts only `.unallowed`. The discriminating assertion has to be on `stale`.

RED then GREEN: this task adds no production code — the production behavior is already correct. The RED step is the mutation probe showing the mutant survives; the GREEN step is the same probe showing it killed, plus the new case passing. Sequence:

1. The RED is **already observed on CI** and is not re-run: run 32958581720, leg `source-shards (1)`, annotated `unaccepted-survivor: 1 survivor(s) with no ledger row: statement-removal:1641:7:withSites.add(record.file);>(removed)` against this exact content. Re-scoring to watch it fail again would cost a second ~107-minute hold of the mutation class lock to reproduce an annotation already in hand. Record the annotation as the red; the marker's command is what turns green.
2. Add the case: records carrying a `validation-env` site in file F, allow naming F with a non-empty reason, assert `stale` is `[]`, with a `premiseHolds` that the fixture really does classify as `validation-env` (else the case is vacuous — it would pass on a fixture with no sites at all).
3. Re-score; the survivor is gone.
4. **Re-run `_metaPremiseContract`** (baseline 11 passed). If this suite's declared `EXPECTED_ENV_TOUCHING` count moves off 0, state the case's premise or carry a `no-premise:` exemption.

<!-- tasks: end -->

---

## Closeout steps (deliberately OUTSIDE the task region)

Neither step below has a red-then-green cycle, and a marker whose cycle cannot complete is a plan defect rather than a formality. They are therefore not enrolled, and the region closes above them.

### Step A — record the ceiling measurement on the surface that owns it

**No red exists, stated rather than fabricated.** This is a comment edit. The check is that `pnpm exec vitest run tests/mutation/_metaSpawnDisposition.test.ts` is green before AND after, and that `MUTANT_TIMEOUT_MS` is byte-identical across the diff — any movement means the edit changed a value it was only supposed to describe.

Replace the derivation comment at `spawnBounded.ts:55-66` with one that states: the pooled measurement (50 evaluated surfaces, 6961 non-timeout children, median 1519 ms, p95 4523 ms, max 103,143 ms); that the ceiling is 1.75× the pooled max where the browser-side constant is pinned at ≥10×; that a 30 s ceiling was PROPOSED and REFUSED because 51 of the 128 children above 30 s exited zero and would become false kills; and documented limits L-2 and L-3 with their measured baselines and triggers.

**Do not** let this travel into `_metaGuardSurfaceRegistry.test.ts:130-140`, whose case deliberately accepts `millisPerBoot: 200_000` because that bound is the BUDGET, not the mutant ceiling.

### Step B — archive the three rows and remove the markers

**No red exists either.** `pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts` is green today and must stay green through the archival; it reds if a row lands in the archive still marked in flight, which is the failure this step must not cause.

Archive all three rows into `BACKLOG-archive.md` with their evidence, and remove the `IN PROGRESS` markers **in the PR's last commit, before any merge** (invariant 12: a marker that merges into main names a branch the merge just deleted).

**The AC-5 "after" number is MEASURED before archival, and this step is where it comes from.** The parsed-YAML assertions in Task 5 establish the workflow's shape, not its behavior; only a real pull request establishes the count. So, in order:

1. Push the branch and open the PR. The harness fires on it, because `tests/mutation/**` is in the path filter.
2. Count runner jobs by CONCLUSION, not by row: `gh api repos/edweiss412/FX-Webpage-Template/actions/runs/<id>/jobs --paginate --jq '[.jobs[] | select(.conclusion != "skipped")] | length'`. Expect **2**.
3. Only then write the fan-out row's archive entry, carrying that measured 2 against the 19 measured on run 32958581720 by the same command.

**The merge sha cannot be in this entry, and an earlier draft of this step wrongly asked for it.** The markers come off in the PR's last commit, before the merge, so the merge commit does not exist yet — nothing written here can name it. `BL-MUTATION-HARNESS-MAIN-RED`'s entry therefore records: the repair, **this branch's head sha and the PR number**, that the verification is the first scheduled `mutation-harness` run on `main` after the merge, and that the orchestrator owns observing it and writing both the merge sha and the outcome into the entry's own text. That is consistent with §6.1 assigning the observation to the orchestrator: the entry is authored with a hole its owner fills, not with a fact its author cannot have.

The budget row's entry carries the subsumption arithmetic and its warn-band residue with the re-file trigger.

**BACKLOG.md conflict rule if main moves under this:** a conflict here is a row archived by one side and still open on the other. Resolve by set arithmetic with one extractor on both parents; never keep-both, which resurrects the row.


---

### Step C — the Actions observations, which no local command can provide

Two acceptance criteria turn on what a real runner does, and finding 3 of the plan's round-1 review established that parsed-YAML assertions do not reach them. Both are obtained here, before archival.

1. **`gh workflow run mutation-harness.yml --ref fix/mutation-gate-fidelity`.** Mandatory, not advisory: this arc removes the pull-request trigger, and a change to a workflow's own trigger cannot be validated by the trigger it removes. Expect **19** runner jobs (`notify` is gated to `schedule` or a default-branch dispatch).
2. **Read that run PER-ANNOTATION**, never per-job status: `gh api repos/edweiss412/FX-Webpage-Template/check-runs/<job_id>/annotations`. AC-3 is met when `retryableRpcVolatilityScan` appears with a score and **no `BaselineNotGreenError` appears on any leg**. A leg that hits `timeout-minutes` reports NOTHING and is not a green leg.
3. **Count the PR's runner jobs by conclusion** as Step B describes. AC-5 is met at 2.

Report all three in the readiness message with the run URL and its per-leg `elapsed.txt` seconds.

## Scoring duty

`surfaceCases.ts` and `oracle.ts` are not enrolled, so Tasks 1 to 3 owe no score. Scored under `pnpm heavy:mutation` with the orchestrator's class-lock take, started detached:

```
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy:mutation pnpm tsx \
  scripts/mutation-score-surfaces.ts connectionCensus retryableRpcVolatilityScan spawnBounded
```

| surface | why | estimate |
| --- | --- | --- |
| `connectionCensus` | Task 6 edits its deciding suite | ~107 min measured, 8 timeouts at the ceiling |
| `retryableRpcVolatilityScan` | Task 4 makes it scorable at all; first score ever | ~30 min |
| `spawnBounded` | Step A edits its source file | 12 mutants, minutes |

Each score goes on the round-1 diff brief's `GUARD SURFACE:` line in the comma form the validator accepts: `GUARD SURFACE: <surface>, MUTATION SCORE: k/n, 0 unaccepted survivors, OPERATORS: all`.

## Close-out

Whole tree green under `pnpm heavy` before every push. Twelve required checks by name. One real full run on this branch via `gh workflow run mutation-harness.yml --ref fix/mutation-gate-fidelity`, which sends **19** runner jobs (`notify` is gated to schedule or a default-branch dispatch) — mandatory because a change to a workflow's own trigger cannot be validated by the trigger it removes. Then READINESS to the orchestrator; this arc does not merge.
