# Mutation gate fidelity: stop a leg going silent, score the surface that cannot be scored, and stop taxing the PRs that touch the harness

**Arc:** arc-gatefidelity · **Branch:** `fix/mutation-gate-fidelity` · **Date:** 2026-08-26
**Archives:** `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`, `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`
**Repairs but does not archive:** `BL-MUTATION-HARNESS-MAIN-RED` — its own body requires a `workflow_dispatch` proof on `main`, which lands after a merge this arc does not perform (§6.1)
**Files:** `.github/workflows/mutation-harness.yml`, `tests/mutation/source/surfaceCases.ts`, `tests/mutation/source/oracle.ts`, `tests/db/connectionCensus.test.ts`, `tests/mutation/source/spawnBounded.ts`, `BACKLOG.md`, `BACKLOG-archive.md`

**This arc files no new `BL-` or `DEF-` row of any facing** (Eric's directive, 2026-08-25, which overrides the mint freeze's exception clauses). Every finding below is repaired here or recorded as a documented limit on the surface that owns it.

---

## 1. The problem, as measured this morning

Three failures, all read per-annotation, none of them carried from a row.

### 1.1 The nightly on `main` is red, and the failure set has turned over completely

Scheduled run [32943869448](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32943869448), head `9a621a579`, 2026-08-26 07:40 UTC, at `SOURCE_SHARD_COUNT` 4. Exactly two jobs are not `success`, and neither is any failure `BL-MUTATION-HARNESS-MAIN-RED` names:

| job | conclusion | annotation |
| --- | --- | --- |
| `source-shards (3)` | failure | `BaselineNotGreenError: mutation baseline is not green: tests/supabase/_metaRetryableRpcVolatility.test.ts, tests/supabase/_metaRetryableRpcVolatilityWalk.test.ts fails on UNMUTATED source.` |
| `budget` | failure | all four legs over: `6176s`, `5393s`, `3995s`, `4138s` against the 3600 s budget |

Every other leg is `success`. The row's own thesis about itself held: its named set turned over between filing and today.

**Its three named mechanical repairs are already landed on `main`, re-verified on this branch's base.** They are evidence that closes the row, not work:

- The ledger-kind class (`rowScanOpener`, `fieldNearMiss`) is closed by the row's own derivation, re-run at `75b8f7a3e`: **52 surfaces, 0 mismatches.** Landed at `a66f465c7`.
- The `destructiveFileAnalysis` re-key is done: the accepted rows sit at the survivor lines the row quotes, and each resolves against the live `tests/db/_destructiveFileAnalysis.ts`.
- Both `shardBudget` survivors are killed by assertions, not blessed by rows, by `tests/ci/shardBudget.test.ts` `rejects a ZERO budget on the BUDGET check` and `renders the warn band as exactly 75%`, with `expectedLedgerKinds.ts` declaring `shardBudget: {}` and the registry row carrying `accepted: []`.

### 1.2 The current failure set, on the tree this branch actually builds on

The 07:40 nightly predates the merge of #902, which took `SOURCE_SHARD_COUNT` from 4 to 8. The closest measurement of the merged content is run [32958581720](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32958581720), head `929368bf3` — the branch tip that merged as `060f5c7d8`. Read per-annotation:

| job | conclusion | seconds | annotation |
| --- | --- | --- | --- |
| `source-shards (1)` | failure | 2494 | `unaccepted-survivor: 1 survivor(s) with no ledger row: statement-removal:1641:7:withSites.add(record.file);>(removed)` |
| `source-shards (5)` | failure | 2731 | `BaselineNotGreenError` on the `retryableRpcVolatilityScan` pair |
| `budget` | **success** | 25 | six warnings, no failure; binding leg `3260s` |
| every other leg | success | 1720–3267 | — |

So on the merged tree the failure set is **two surfaces**, and the `budget` job is green.

### 1.3 The fan-out, measured on 2026-08-26 alone

`gh run list --workflow mutation-harness.yml` over today, before this branch existed:

| branch | runs | outcome |
| --- | --- | --- |
| `feat/speclint-dispatch-gates` | 5 | 4 cancelled, 1 in flight |
| `fix/mutation-shard-weight-seconds` | 5 | 3 cancelled, 2 failure |
| `fix/supabase-upstream-fault-class` | 3 | 2 cancelled, 1 failure |
| `fix/mutation-shard-budget-six` | 3 | 2 cancelled, 1 failure |

**Sixteen full-matrix fan-outs in one day, eleven of them cancelled by the next push before producing any verdict.** At `SOURCE_SHARD_COUNT` 8 the matrix is **20 jobs, 18 of them full test legs** (8 parser shards + parser gates + 8 source shards + source gates + budget + notify).

---

## 1.1 Resolved scope — do not relitigate

Each with its ratification.

| Decision | Ratified at |
| --- | --- |
| **The PR trigger is narrowed.** Full matrix nightly on `main`; a smoke leg on PRs. The reviewer may challenge WHICH leg is the smoke leg and what signal is lost; it may not reopen whether to narrow. | Eric's ruling, 2026-08-26 04:53, carried in the arc brief |
| **No new ledger row, of any facing, with no exception clause.** No `product-blocked`, no `invariant`, no class-sweep exception (a)/(b)/(c). | Eric's directive, 2026-08-25 |
| **`SHARD_BUDGET_SECONDS = 3600` and `timeout-minutes: 125` are the target, not the variable.** The sanctioned response to over-budget is raising `SOURCE_SHARD_COUNT`; `timeout-minutes` is the forbidden one. | `.github/workflows/mutation-harness.yml:426` |
| **arc-shardbudget's `N = 8` and its per-shard budget assertion are settled input, not this arc's subject.** | #902, merged `060f5c7d8` |
| **The `concurrency` block's PR-only `cancel-in-progress` is left exactly as it is.** A scheduled nightly must never cancel another. | `.github/workflows/mutation-harness.yml:64-66`; `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT` says every candidate direction wants it untouched |
| **The ten `pull_request.paths` globs are left exactly as they are.** Narrowing happens at the job, not the filter — see §3.4 for why this is strictly better. | `tests/mutation/_metaSourceShardIntegrity.test.ts:373-378` pins three of them |
| **The `millisPerBoot` upper bound stays bounded by the BUDGET, not by the mutant ceiling.** Nothing in §3.5 licenses capping that validator. | `tests/mutation/_metaGuardSurfaceRegistry.test.ts:130-140`, whose case deliberately accepts `millisPerBoot: 200_000` |
| **The `GUARD SURFACE:` validator's "plus" refusal in `scripts/codex-guard.mjs` belongs to arc-speclintgates.** This arc writes the comma form and moves on. | arc brief item 7 |
| **`BL-MUTATION-HARNESS-MAIN-RED`'s original failure list is valid as of its filing and superseded by re-measurement, not by disagreement.** Recorded once, in §1.1, and cited thereafter. | §1.1 above |

---

## 2. The class, and why it is not the one it looks like

### 2.1 The obvious reading is wrong

`BaselineNotGreenError` looks like a class of "enrolled surfaces whose deciding suites need an environment the `source-shards` job does not provide," repairable by enumerating which surfaces need what. Two derivations say otherwise.

**Derivation A — project membership over-fires by 77.** `unit-suite-nodb` runs exactly `--project=parallel` with no database (`.github/workflows/unit-suite.yml`, the `No supabase/setup-cli, no psql, no bootstrap` comment above its `--project=parallel` step), so parallel-project membership is a CI-enforced DB-free claim. Sweeping every enrolled `suitePaths` entry against `PARALLEL_TEST_GLOBS`:

```
surfaces = 52
suitePaths OUTSIDE the CI-verified DB-free parallel project: 77
```

Seventy-seven, across more than twenty surfaces that score green today. The serial project means "not yet audited", not "needs a database" — `vitest.projects.ts:18-19` says new directories default to serial deliberately. Membership is sufficient, nowhere near necessary, and a guard built on it would refuse two dozen healthy surfaces.

**Derivation B — lexical environment markers over-fire too, and for an instructive reason.** Scanning each suite and its transitive local imports for `postgres(`, `assertLocalDbUrl`, `LOCAL_TEST_DATABASE_URL`, `TEST_DATABASE_URL` and `psql` flags 16 surfaces. Almost all are false: `tests/db/_connectionCensus.ts` and `tests/db/_destructiveFileAnalysis.ts` are static analyzers **of** connection code, so the marker strings are their subject matter, not their behavior. `connectionCensus` returns real kills and one real survivor on a runner with no database, which settles it empirically.

A recognizer over either signal is a denylist that accepts whatever it did not model, and both are refuted by probe before a line of it was written.

### 2.2 The class is that a leg dies wholesale, and it is derivable

`evaluateSurface` runs at **module scope inside `describe.each`** (`tests/mutation/source/surfaceCases.ts:88`), which the file's own header calls deliberate and load-bearing. So `runSurface` throwing `BaselineNotGreenError` throws during vitest **collection**, and a collection throw aborts the whole shard file. Every other surface on that leg reports nothing.

That is measurable, and it reproduces exactly. Deriving the partition locally at `75b8f7a3e`:

```
leg 0: 1   leg 1: 5   leg 2: 5   leg 3: 7
leg 4: 8   leg 5: 8  <== holds retryableRpcVolatilityScan
leg 6: 9   leg 7: 9                       total 52
```

Leg 5 is precisely the leg that failed on run 32958581720, and it holds 8 surfaces. **Seven of them produced no gate verdict**, because collection died before a single `it` ran: `modal-wait-helper-scan`, `fixtureContract`, `acCoverage`, `rowScanOpener`, `interactiveScanCore`, `executionMethodsDerivation`, `replacementString`. 13.5% of the registry reported nothing, and nothing in the run says so.

**A second, independent channel pins the mechanism to the exact surface.** Records are written at module scope during evaluation, so they survive a collection death that the `it` cases do not. The run uploaded **50 records for 52 enrolled surfaces**, and the two absent ones are exactly `retryableRpcVolatilityScan` and `replacementString` — the surface that threw, and the one after it in slice order:

```
leg 5 slice, in registry order, against the uploaded records
  modal-wait-helper-scan       record
  fixtureContract              record
  acCoverage                   record
  rowScanOpener                record
  interactiveScanCore          record
  executionMethodsDerivation   record
  retryableRpcVolatilityScan   NO RECORD   <- threw here
  replacementString            NO RECORD   <- never reached
```

Six surfaces evaluated and wrote records whose verdicts were then thrown away with the collection; one never ran at all. Both counts are true of different channels, and neither is visible in the run's annotations.

**This is the class, and its cover is a derivation over the mechanism rather than over a list of surfaces.** Any surface that throws for any reason — a missing database today, a missing binary tomorrow, a corrupt registry row, a scratch-directory failure — takes its whole leg with it. Repairing the mechanism covers every surface present and future without anyone maintaining an enumeration. That is what §3.1 does.

The consequence bound this arc converges against follows from it: **every enrolled surface is either scored or named in an annotation a triager can act on, and a leg that reports nothing is the only unacceptable outcome.**

---

## 3. Repairs

### 3.1 R1 — per-surface fault isolation in `registerSurfaceCases` (the class cover)

**Today.** `registerSurfaceCases` calls `readFileSync(surface.sourcePath)` and `evaluateSurface(surface, options)` at describe-callback time. Either throwing aborts collection of the entire shard file.

**Change.** Evaluation becomes fallible and per surface. A surface whose evaluation throws still registers **the same seven cases**, every one of them failing and naming the fault; every other surface in the slice still evaluates, still emits its notices, and still registers its seven.

Shape:

```ts
type SurfaceOutcome =
  | { kind: "evaluated"; before: Buffer; run: RunResult; result: GateResult }
  | { kind: "faulted"; error: unknown };
```

`evaluateSurfaceOutcome(surface, options)` wraps the evaluation and returns one of the two; `registerSurfaceCases` branches on it inside each of its seven existing case bodies, which fail with the fault when the outcome is `faulted`.

**Seven, not eight, and that constraint is load-bearing.** `tests/mutation/guardSurfaces.gates.test.ts` case `(c)` reads the registrar's source and asserts `src.match(/^\s*it\(/gm)` has length exactly 7, because §2.2's enrolment arithmetic reads a run's surface count off its test count as `(tests - 2) / 7`. An eighth literal `it(` would red the corpus-wide gates file — which, after R4, is one half of the PR smoke leg, so the repair would red on the very leg this arc keeps. Branching **inside** the seven bodies keeps both the literal count and the arithmetic exact: a faulted surface contributes 7 tests exactly as an evaluated one does.

The cost of that choice, stated rather than hidden: a faulted surface produces seven failing cases instead of one. The first carries the full fault detail; the other six carry a one-line `<id> was not evaluated` so the annotation set stays readable. Seven truthful failures beat one failure plus six cases reporting green for a surface that never ran.

**One more existing registry this repair must not trip, found by sweeping the class F2 belongs to rather than the instance.** `tests/mutation/_metaPremiseContract.test.ts` walks the enrolled suites from the registry and pins a per-suite `EXPECTED_ENV_TOUCHING` count, declared independently of the classifier so a recognizer that silently stops matching reds instead of reporting a clean corpus. `tests/db/connectionCensus.test.ts` is declared at **0**, and R3 adds a case to that very file. The case is pure — it drives `classifyFile` over an in-memory string and `reconcileValidationEnv` over the result, touching no environment — so the count should stay 0, but "should" is not the contract: the implementation re-runs that guard after the case lands and, if the count moves, either states the case's premise or carries a `no-premise:` exemption. Declared here so it is a step rather than a discovery.

The same sweep cleared the other registries this diff touches. `tests/mutation/_metaSourceShardIntegrity.test.ts` pins `if:` by equality only on STEPS INSIDE the `budget` job (the `rate-drift` step and the records download, both `always()`), never on a job head, so R4's compound job-level condition is out of its scope; `_metaSpawnDisposition`'s `CEILING_NAMES` and `CEILING_HOME` are untouched because R5 renames no constant and moves no value; `EXPECTED_LEDGER_KINDS` is untouched because R3 kills a survivor rather than blessing one; and the workflow-level `concurrency` block that `tests/cross-cutting/ci-workflow-speedup.test.ts` requires is not edited.

**A faulted surface must still emit a run record.** `evaluateSurface` calls `emitRunRecord` only after `runSurface` returns, so today a throw writes nothing — which is exactly why run 32958581720 uploaded 50 records for 52 surfaces (§2.2). That collides with the workflow: the records upload sets `if-no-files-found: error`, licensed by the explicit premise that "every shard is assigned at least one surface and every evaluated surface emits a record, so zero files means the leg produced nothing." Leg 0 holds exactly **one** surface today, so under an isolation change that left the record path alone, that surface faulting would empty the directory and red the upload with `no files found` — a second, misleading red saying nothing about the cause. R1 therefore emits a record for a faulted surface too (`passed: false`, `score: 0`, `outcomes: []`, plus the fault), which keeps the upload premise true and puts the fault where the attribution artifacts and the rate-drift report can see it.

**Why the leg still fails.** A faulted surface registers failing cases, so the leg is red and the gate's verdict is unchanged. What changes is that the red is attributable and its co-tenants are visible.

**The derived cover, executable, in machinery that already exists.** `tests/mutation/source/surfaceCases.test.ts` already drives the REAL `registerSurfaceCases` against a mocked `node:child_process.spawnSync` and a synthetic `fixture(id)` surface, and its mock already branches on whether the child is running the BASELINE. One added lever — a chosen suite whose BASELINE returns non-zero — reproduces `BaselineNotGreenError` in-process with no child vitest at all. The case registers `[faulting, healthy]` in that order and asserts the healthy surface's notices still reached the sink.

RED validity: on today's tree that registrar call throws during collection and the whole file errors with `BaselineNotGreenError`, which is a production-behavior failure, not a test-local one. It cannot be made green by editing the test. The failure mode it catches: someone moves the evaluation back outside the wrapper, or catches the fault and swallows it instead of failing.

**R1 also names the surface in the error.** `BaselineNotGreenError` (`tests/mutation/source/oracle.ts:21-30`) carries only the suite list, so the annotation on run 32958581720 named two test files and no surface — a triager has to re-derive the partition to learn which surface owns them. `assertCleanBaseline` gains the surface id and the message leads with it.

### 3.2 R2 — give the `source-shards` job the database

**Both alternatives are refuted by probe, so this is not a preference.**

*The probe.* With a local database the pair is green in 1.36 s:

```
Test Files  2 passed (2)      Tests  25 passed (25)
```

With the port closed it fails in `beforeAll` and does not skip:

```
FAIL tests/supabase/_metaRetryableRpcVolatility.test.ts
Error: connect ECONNREFUSED 127.0.0.1:1
Test Files  1 failed | 1 passed (2)     Tests  3 passed | 22 skipped (25)
```

The environment is the entire cause. Fail-not-skip is deliberate and ratified in the suite's own header (`tests/supabase/_metaRetryableRpcVolatility.test.ts:17-20`): a skip would leave the retry set unverified while the suite reported pass.

*Why narrowing `suitePaths` to the DB-free walk file is refuted.* `e2ecf639e` already split the DB-free cases into `_metaRetryableRpcVolatilityWalk.test.ts`, so this looks like half-done work. It is not viable: the surface's own control mutant is

```
from: "if (set.has(name) || hasReasonedEntry(exclusions, name)) continue;"
to:   "if (set.has(name) && hasReasonedEntry(exclusions, name)) continue;"
```

which targets `completenessViolations`, a catalog-decided arm. The walk file cannot notice it, so narrowing would destroy the AC-3 overlay-liveness proof — the one assertion that stops a silently-dead overlay reporting a perfect score. Beyond the control, the walk file exercises only `literalsInProductTree`; the rest of the 334-line module is catalog-decided, so the score would crater below its 0.9 floor.

*Why de-enrolment is refused.* The surface guards a live safety property — that every retryable RPC is provably non-writing — and the registry row carries `accepted: []` with a 0.9 floor. Nothing here says the harness cannot express it; only that one job lacks a database.

**Change.** `source-shards` gains the same bring-up `unit-suite-db` uses, as `run:` steps, immediately after `./.github/actions/setup` and alongside the existing chromium pair:

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: 2.107.0
- run: command -v psql >/dev/null || (sudo apt-get update && sudo apt-get install -y postgresql-client)
- run: bash scripts/ci/supabase-local-bootstrap.sh
```

**The CLI comes from the action, and an earlier draft of this section got that wrong in a way worth recording.** It prescribed `pnpm dlx supabase@2.107.0 --version`, which runs the package in a temporary environment and leaves nothing on `PATH`; `scripts/ci/supabase-local-bootstrap.sh` then calls bare `supabase` at three separate lines and every leg would have failed during bring-up, before any surface reported. `package.json` carries no Supabase CLI dependency, so there is nothing local to resolve either. The working path is the one `unit-suite-db` already uses, pinned for the reason stated there: `latest` resolves through the GitHub API and rate-limits on shared runners.

**Using an action here is permitted, and the chromium precedent's `run:`-not-actions caution does not bind.** That caution is about step accounting, and the accounting was checked rather than assumed: `tests/mutation/_metaSourceShardIntegrity.test.ts` pins only that `steps[0]` is the `stamp-start` step, that **exactly one step writes `$GITHUB_ENV`**, and the `upload-artifact` names. Nothing counts actions on `source-shards`, and the `$GITHUB_ENV` assertion inspects `run:` strings only, which an action cannot trip. The two remaining bring-up steps stay `run:` regardless, and none of the three exports anything.

**The cost, measured rather than feared.** Off a real `unit-suite-db` leg (run 32977168722, job 98210351983): `supabase/setup-cli` 2 s, psql install 0 s, `Boot local Supabase (guarded migrations)` **82 s**. Against source legs of 2494–3267 s that is 2.6–3.4%. The binding leg goes 3267 s → ~3351 s, **93.1% of the 3600 s budget** — inside it, and inside the 7500 s job ceiling with enormous margin. For comparison, the ratified chromium precedent costs 35 s per leg (25 + 10, same run) for exactly one surface; this is the same trade at 2.4× the price.

**Unconditional on every leg, matching the chromium precedent, and the alternative is a documented limit.** A conditional bring-up — compute the leg's slice, bootstrap only if it holds a database-needing surface — would cost ~84 s on one leg instead of eight. It is rejected here because it needs a new declaration on the registry row, a new `$GITHUB_OUTPUT` step, a job-level `if:` on three steps, and a guard to keep the declaration honest; that is a new signal threaded through four files to save eleven minutes of nightly runner time on a workflow this same spec removes from every PR. Recorded as documented limit L-1 with its re-file trigger.

**`source-gates` is untouched.** Its comment at `mutation-harness.yml:176-177` states why: its one child runs an inert fixture and never a deciding suite.

### 3.3 R3 — kill the `connectionCensus` survivor with an assertion

Scope addition from bl-orch, 2026-08-26: no live arc owns it, and PR #899 leaves `connectionCensus` an unmeasured gap because its prior number was co-measured under a reseed.

**The mutant is LIVE, and the argument is from its evaluated output, never from the site's shape** (`BL-MUTATION-HARNESS-MAIN-RED` records an earlier draft getting this exactly backwards).

`statement-removal:1641:7` deletes `withSites.add(record.file);` from `reconcileValidationEnv` (`tests/db/_connectionCensus.ts:1636-1651`). `withSites` then stays empty, and

```ts
stale: allow.map((row) => row.file).filter((file) => !withSites.has(file)),
```

reports **every** allow row as stale — including rows whose file genuinely still holds a `validation-env` site. That is an observable output change on the arm whose entire job is telling a live allowance from a dead one. Not equivalent; a ledger row would bless a real defect.

**Why it survives.** The `reconcileValidationEnv` describe block (`tests/db/connectionCensus.test.ts:2464-2536`) tests `stale` in both directions that make it non-empty — a file whose site is gone, and a row naming a file absent from the walk — and never once asserts `stale` is EMPTY for a row whose file still has a site. The nearest case, `the same site in an allowlisted file is NOT reported`, asserts only `.unallowed`.

**The killing case.** Records carrying a `validation-env` site in file F, allow naming F with a reason, assert `stale` is `[]`. Clean: `[]`. Mutant: `[F]`. It fails for the deleted line and for nothing test-local — the fixture is the same `classifyFile` + `ALLOW` pair the neighbouring cases already use, so the RED comes from production behavior, not from a helper the test writes.

### 3.4 R4 — narrow the PR trigger to a smoke leg

**The mechanism is a job-level `if:`, not an edit to the trigger, and that is strictly better than editing the filter.**

```yaml
# parser-shards, source-shards — no `if:` today
if: github.event_name != 'pull_request'

# budget — ALREADY carries `if: always()`, which is load-bearing
if: ${{ always() && github.event_name != 'pull_request' }}
```

`budget` cannot take a second `if:` key, and dropping its `always()` would be worse than not gating it at all: a job whose condition loses `always()` is skipped once any prerequisite fails or skips, which is precisely when its completeness and rate-drift reporting matter.

Applied to `parser-shards`, `source-shards` and `budget`. `notify` already excludes pull requests (`mutation-harness.yml:332`).

**Why not narrow the ten globs, which is where the row points.** The globs are not loose by accident — each covers a path whose edit can change a verdict, and `_metaSourceShardIntegrity.test.ts:373-378` pins three of them by name. Removing entries would trade a capacity problem for a coverage hole and fight a guard that exists for good reason. Gating the jobs keeps every glob's coverage of the structural signal while removing the long legs, so the class of ten globs is resolved without editing any of them.

**What the smoke leg is.** `parser-gates` and `source-gates`, the two corpus-wide gates jobs. Measured on run 32958581720: **333 s and 38 s.**

**What signal a harness-touching PR PRESERVES.** Both gates files are generation-only and structural: `guardSurfaces.gates.test.ts` asserts `EXPECTED_LEDGER_KINDS` declares every enrolled surface, that the union of shard slices is exactly the registry, and that no surface lands in two slices; `mutationHarness.gates.test.ts` carries the parser harness's generation and structural gates. Every defect class an ordinary harness-touching PR introduces — a surface enrolled without a ledger declaration, a partition that drops or duplicates a surface, a shard file wired to the wrong slice — still reds at PR time in under six minutes.

**What signal it LOSES, named in full, because an earlier draft of this section named only the first item and that was not honest.** Five things stop being checked at PR time:

1. **The mutation SCORES.** A PR that weakens a deciding suite so a guard stops pinning what it claims no longer reds at PR time; it reds on the next nightly, after merge.
2. **Everything that exists only in a shard job's setup** — including, pointedly, R2's own database bring-up. That change lives in `source-shards` and nowhere else; `source-gates` stays DB-free by design. **So the two-job smoke leg cannot validate this very spec's workflow change.**
3. **Artifact upload actually working**, including the hidden-file exclusion that `if-no-files-found: error` exists to surface, which is observable only in a real Actions run.
4. **`elapsed.txt` production**, since no shard leg runs to write one.
5. **`budget` and the rate-drift report executing at all.**

Item 2 is the sharp one and it is why the `workflow_dispatch` run below is mandatory before this arc reports readiness rather than merely advisable: **a change to a workflow's own trigger cannot be validated by the trigger it removes.**

**The escape, stated in the workflow so the next arc does not rediscover it.** `workflow_dispatch` at `mutation-harness.yml:33` gives any branch a real full run on demand: `gh workflow run mutation-harness.yml --ref <branch>`. A comment above the gated jobs says so.

**Measured effect.** A harness-touching PR goes from **20 jobs (18 test legs) to 2 jobs**. Against today's sixteen fan-outs, eleven cancelled mid-flight, that is the whole of the capacity this arc returns — and it dwarfs R2's eleven added nightly minutes.

**`budget` must be gated too, and its skipping is correct rather than a loss.** It `needs:` the four harness jobs with `if: always()`, and `scripts/check-shard-budget.ts` checks completeness before any maximum — "an absent record must not read as ‘that shard was fast’" (`mutation-harness.yml:255-256`). With sixteen shard legs skipped it would fail on sixteen missing records, which is a true statement about a run that measured nothing and a useless one to put on a PR. Its subject is the legs, and on a PR there are none.

### 3.5 R5 — the 180 s mutant ceiling: the proposed direction is refuted, and the measurement is recorded

The brief carries a measurement on `connectionCensus`: eight `TIMEOUT-KILL`s at the ceiling, all non-terminating, costing 24 of that run's 107 minutes, with 325 non-timeout kills at median 1586 ms, p95 2102 ms, max 3691 ms and **nothing between 10 s and 180 s** — a bimodal distribution whose empty gulf argues the lever is a SMALLER ceiling, around 30 s.

**Pooled across every surface the run actually evaluated that is false, and lowering the ceiling would corrupt the gate's verdict in the WORST direction.** The measurement is this section's own, produced by the command beside it over every record the run uploaded:

```
gh run download 32958581720 -p 'mutation-records-source-shards-*'
# 50 records, one per EVALUATED surface (2 of the 52 never evaluated -- section 2.2);
# 6961 non-timeout children; 16 timeouts
```

```
pooled median 1519 ms   p95 4523 ms   max 103143 ms
children in the 10s..180s "gulf": 215
children >30s: 128        timeouts: connectionCensus 8, sendAuthScan 4, four others 1 each
```

The gulf is not empty; it holds 215 children. The surface `psqlStartupScan` has a **median of 31,054 ms**, so its whole distribution sits above a 30 s ceiling.

**Splitting those children by verdict settles the question, and it settles it harder than the count alone.**

```
10s..180s:  n=215   exit 0 = 61    non-zero = 154    KILLED 156   SURVIVED  59
     >30s:  n=128   exit 0 = 51    non-zero =  77    KILLED  77   SURVIVED  51
```

Of the 128 children above 30 s, **51 exited zero, so they are SURVIVORS.** A 30 s ceiling does not merely blur 77 genuine kills into timeouts; it converts 51 genuine survivors into **false kills**, and a false kill is a survivor the gate stops reporting. The `TIMEOUT-KILL` notice at `tests/mutation/source/gate.ts` says what a timeout is worth: it "scores KILLED, which is the standard verdict, but it is NOT evidence the suite rejected the mutant." The ceiling drop would therefore hide real coverage gaps behind a perfect-looking score, which is the precise defect this arc exists to remove.

**The ceiling stays at 180 s.** By the derivation shape `tests/mutation/browser/timeout.test.ts:34-38` uses — a multiple of the pooled measured healthy maximum — 180,000 ms against a pooled max of 103,143 ms is **1.75×**, well under the browser side's 10×. If the source ceiling is wrong it is wrong by being tight, not loose, and moving it in either direction is a different arc with a different measurement.

**Recorded, not filed.** The pooled distribution, the 1.75× margin and the refutation go into the derivation comment at `tests/mutation/source/spawnBounded.ts:55-66`, which is the constant's own justification and the place a reader looks. That is the brief's instruction for the not-touching case, and it is what Eric's directive requires of a finding this arc does not repair. Documented limit L-2 carries the re-file trigger.

---

## 4. Documented limits

| id | limit | re-file trigger |
| --- | --- | --- |
| **L-1** | The database bring-up runs on all eight source legs for one surface, costing ~84 s each (~11 min nightly) where a conditional bring-up would cost it once. Rejected as more machinery than the saving is worth, and as a new declaration to keep honest. | The binding leg exceeding 95% of `SHARD_BUDGET_SECONDS` with the bring-up as the marginal cause, or a second database-needing surface enrolling. Recorded in the workflow comment beside the bring-up steps. |
| **L-2** | `MUTANT_TIMEOUT_MS` is 1.75× the pooled measured healthy maximum (103,143 ms at `929368bf3`), where the browser-side constant is pinned at ≥10×. The source side has no executable derivation pin, only `tests/mutation/source/childRun.test.ts` asserting `opts.timeout` is above zero. | **Baseline, measured at `929368bf3`: 1.75×.** Re-file when the ratio falls below 1.5×, which means either the pooled max crossing 120,000 ms or someone lowering the constant. Recorded at `spawnBounded.ts:55-66`. |
| **L-3** | Sixteen non-terminating mutants per nightly each burn the full 180 s: 8 on `connectionCensus`, 4 on `sendAuthScan`, and one each on `acCoverage`, `interactiveScanCore`, `modal-wait-helper-scan`, `mutationSurfaceEnumerate`. **Measured share of leg elapsed time at `929368bf3`: shard 1 57.8%, shard 4 25.1%, shard 5 19.8%, shard 7 5.8%, the rest zero.** The cheap lever is recognizing a removed sole loop advance at generation time, which is a generator change this arc does not make. | **Baseline is the four figures above.** Re-file when the timeout count exceeds 20 in one run, or when any leg's timeout share exceeds 65%, or when a leg's timeout seconds alone would breach `SHARD_BUDGET_SECONDS`. Recorded at `spawnBounded.ts:55-66`. |
| **L-4** | A harness-touching PR no longer sees mutation scores; a suite weakened so a guard stops pinning what it claims reds on the next nightly, after merge, not at PR time. `workflow_dispatch` is the escape. | Named in §3.4 and in the workflow comment above the gated jobs. This is the ratified trade, not a defect. |

**On L-2 and L-3, because an earlier draft wrote their triggers as though the conditions had not happened yet.** They had. Timeouts already consume 57.8% of shard 1, and five surfaces already carry a timeout while every one of their non-timeout children finishes under 10 s. A re-file trigger that is already satisfied is not a limit; it is a defect with a note attached, and under this arc's no-new-row directive that is not a permitted disposition. Both are therefore restated against the **measured baseline**, which is what a documented limit actually is: a record of current behavior with the condition under which it stops being acceptable.

Neither is a fidelity defect, and that is why recording is the honest disposition rather than a dodge. A `TIMEOUT-KILL` is not silent: it emits its own notice naming the mutant and the deciding suite, so a triager can act on it, which satisfies this arc's consequence bound. What these limits record is COST, not a wrong verdict. The cost is real and large, and the lever that would reduce it is a change to mutant generation that neither this arc's scope nor its measurements support.

| **L-5** | `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`'s residue: the weight model rebalances modelled BOOTS while the budget bounds SECONDS. Measured spread at `c5518dfab` was 3.8× (1.4 s/boot against 5.3 s/boot). `N = 8` cleared the breach without touching that miscalibration. | Recorded in the row's archive entry with its subsumption arithmetic. |

---

## 5. Subsumption arithmetic for `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`

The row is closed by #902, and the arithmetic is written out rather than asserted.

At `N = 4`, run 32943869448: four legs at 6176 + 5393 + 3995 + 4138 = **19,702 s**, every one over the 3600 s budget, `budget` job FAILED.

At `N = 8`, run 32958581720: eight legs at 3165 + 2494 + 1720 + 3260 + 2873 + 2726 + 2807 + 3113 = **22,158 s**, binding leg **3260 s = 90.6% of budget**, `budget` job **SUCCESS** with six warn-band warnings and zero failures.

Total seconds rose ~12.5% because each additional leg pays its own setup and boot; makespan fell 47%, which is the number the budget bounds. Adding R2's 84 s puts the binding leg at ~3344 s = **92.9%**, still inside.

**The residue, stated as a documented limit rather than a row** (L-5): six of eight legs sit in the warn band, so the margin is ~340 s on the binding leg. The mechanism `N` does not touch is the one the row itself names — boots rebalanced, seconds bounded. Its re-file trigger is a `budget` FAILURE on a scheduled `main` run, which is self-reporting by construction.

---

## 6. Acceptance criteria

| id | criterion | how it is proved |
| --- | --- | --- |
| **AC-1** | A surface that faults during evaluation registers one failing case naming it, and every other surface on its leg still evaluates, emits notices and registers its cases. | Child-vitest fixture suite (§3.1). Red on today's tree because collection dies. |
| **AC-2** | `BaselineNotGreenError` names the surface id, not only the suite paths. | Unit case on `assertCleanBaseline`. |
| **AC-3** | `retryableRpcVolatilityScan` scores on a `source-shards` leg, with no `BaselineNotGreenError` in any annotation. | `workflow_dispatch` run on this branch; per-annotation read. |
| **AC-4** | `reconcileValidationEnv` reports `stale: []` for an allow row whose file still holds a `validation-env` site; `connectionCensus` has zero unaccepted survivors. | The killing case (§3.3) plus a scored `pnpm heavy:mutation` run. |
| **AC-5** | A harness-touching pull request **sends exactly 2 jobs to runners**; `schedule` and `workflow_dispatch` still send 20. | Counted by conclusion, not by row: a false job condition marks a job `skipped`, and GitHub evaluates job conditions before matrix expansion, so the PR's check list may still show skipped entries that consumed no runner. The assertion is on jobs whose conclusion is not `skipped`. Measured on this branch's own PR against the 20 measured in §1.3. |
| **AC-6** | The bring-up steps are `run:` steps and none writes `$GITHUB_ENV`. | `tests/mutation/_metaSourceShardIntegrity.test.ts` stays green. |
| **AC-7** | Every enrolled surface this diff touches carries a stated `GUARD SURFACE:` score with zero unaccepted survivors. | Scored runs under `pnpm heavy:mutation` with the class lock taken. |
| **AC-8** | The next scheduled nightly on `main` after the merge is green on every leg, `source-gates`, both parser jobs and `budget`. | The adjudicating observation. It lands after the merge, and this arc does not merge, which is why §6.1 does not let this PR archive the row that depends on it. |

---

## 6.1 Row dispositions, and why one of the three does not close here

`BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT` and `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` are archived by this PR. Both proofs are complete before the merge: the fan-out row closes on a job count measurable on this branch's own PR (AC-5), and the budget row closes on the arithmetic in §5, which is read off a run that has already happened.

**`BL-MUTATION-HARNESS-MAIN-RED` stays OPEN, with only its in-progress marker removed.** Its own body states the proof it requires, and a PR run is explicitly excluded:

> Confirm the clean baseline with `workflow_dispatch` on main, not by reading a PR run — and note that a PR run's head is the PR branch.

This arc can produce a `workflow_dispatch` run on its own BRANCH, which is mandatory here for the independent reason in §3.4 (a trigger cannot validate its own removal). It cannot produce one on `main`, because it does not merge. AC-8 puts the row's proof on the first scheduled nightly after the merge — after the last commit this PR will ever make. Archiving the row in that last commit would close the nightly-red row **before** the evidence it demands exists, and this arc may not file a replacement row if that nightly comes back red. So the row is left for whoever observes AC-8.

The cost of leaving it open is one queue row for one nightly cycle. The cost of closing it early is a row that says the nightly is green when nobody has looked, which is the exact failure the row was filed about.

## 7. Invariants in play

- **1 (TDD per task):** every repair is failing test → implementation → passing test → commit.
- **11, 12:** worktree off the `origin/main` containing #902; all three rows marked IN PROGRESS and pushed before the first edit; markers removed in the PR's last commit.
- **2, 3, 4, 5, 9, 10:** no advisory-lock, email, cursor, user-visible-code, Supabase-call-boundary or mutation-surface change here. N/A, declared.
- **8:** `impeccable-gate: N/A - no UI surface`.
- **Class-sweep at round 1, docs included:** §2 sweeps to a derivation over the mechanism, not to a list of surfaces; §3.4 resolves the ten-glob class without editing a glob.

## 8. Meta-test inventory

- **CREATES:** the child-vitest fixture proving per-surface fault isolation (§3.1).
- **EXTENDS:** `tests/db/connectionCensus.test.ts` (§3.3).
- **UNTOUCHED, declared:** `_metaSourceShardIntegrity.test.ts`, `_metaGuardSurfaceRegistry.test.ts`, `_metaSpawnDisposition.test.ts` — no new or renamed ceiling constant, no matrix or step-accounting change beyond `run:` steps and a job-level `if:`, and no `millisPerBoot` bound change.
