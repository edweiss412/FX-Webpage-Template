# Browser mutation gate — child lifetime bound — design

**Ledger:** `BL-MUTATION-BROWSER-CHILD-LIFETIME` (`BACKLOG.md`). **Arc:** `fix/mutation-browser-child-lifetime`.
**Probe:** `docs/superpowers/specs/ci/probes/2026-08-20-browser-child-wallclock-probe.md`.
**Sibling design (the mechanism this reuses):** `docs/superpowers/specs/ci/2026-08-17-mutation-child-lifetime-design.md`.

## 1. Problem

`runChild` calls `execFileSync` with no `timeout` and no process group
(`tests/mutation/browser/runner.ts:152`, inside `runChild` at `tests/mutation/browser/runner.ts:141`). Two consequences, the same
producer shape the sibling arc repaired in `tests/mutation/source/**`:

1. **No wall-clock ceiling.** A hung Playwright child runs until a human notices. The sibling arc
   measured what that costs on the source harness: 1h48m on a single mutant with 0 of 207 scored,
   and four wedged children from other arcs alive on the same machine at 2h28m, 2h55m, 3h53m and
   5h43m (`tests/mutation/source/spawnBounded.ts:53-66`).
2. **No process group.** A child that outlives its harness is unreachable by anything the harness
   can still do, and — per the sibling's probe P-T1 — unreachable by the `heavy:reap` backstop too,
   which declines every member of a post-`setpgrp` parent-death tree.

The repair vehicle already exists and already takes a per-caller ceiling: `spawnBounded`
(`tests/mutation/source/spawnBounded.ts:122`) accepts `timeoutMs` and wraps the child in a `perl`
supervisor that is a process-group leader with a parent-death watchdog.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **The infra discrimination in `runChild` is already correct and is NOT in scope.** `exitStatus = typeof err.status === "number" ? err.status : null` (`tests/mutation/browser/runner.ts:164`) keeps a signalled child out of the verdict space exactly as the source harness does. Do not "improve" it. | Ledger entry, `BACKLOG.md` `BL-MUTATION-BROWSER-CHILD-LIFETIME` body |
| **`MUTANT_TIMEOUT_MS` (180 s, `spawnBounded.ts:67`) is NOT adopted here.** It was derived against a ~2 s healthy source suite. | Ledger entry; probe §3 |
| **The ceiling is a NUMBER derived from measurement, not a mechanism.** No second bounding mechanism is designed, invented, or proposed. The work is a call-site swap plus one constant. | Ledger entry: "the work is a ceiling measurement plus a call-site swap, not a second mechanism" |
| **A browser-child timeout maps to INFRA, not to KILLED** — the `childRun` reading, not `runSuite`'s. §5.3 sets out the argument and the counter-argument in full so neither side is re-derived. | §5.3 |
| **`tests/mutation/browser/runner.ts` is NOT enrolled in the source-mutation registry, and is not enrollable.** The registry says so already, in the browser block's own comment: "the spawn boundary in `tests/mutation/browser/runner.ts` needs a real Playwright child, the same shape limit the step3-a11y filing recorded." Enrolling it symbolically is forbidden. | `tests/mutation/source/registry.ts`, browser-block comment above the `browserRegistry` row; §8 |
| **The probe's instrumentation is apparatus, not the repair.** It was reverted; its diff is quoted in the probe so the numbers reproduce. | Probe §5 |

### 1.2 Convergence bound — what closes this design

Stated here so no review brief has to invent it (AGENTS.md round-economy block).

- **Consequence bound.** Every browser-gate child either completes and yields a numeric exit status,
  or is killed and reported as an infrastructure fault — never silently converted into a mutation
  verdict, never left running. **A healthy-but-slow child must not become a timeout**: the ceiling
  is derived as a stated multiple of a measured healthy maximum precisely so that a timeout means a
  hang rather than a slow machine. The worst case of a ceiling that is too generous is a hung child
  living 11 minutes instead of hours — a DOCUMENTED LIMIT (§6), not a finding. A wrongly-SCORED
  verdict is the only outcome this design treats as a defect.
- **PROBE DOMAIN:** the current browser mutant set (`tests/mutation/browser/registry.ts` —
  one surface, `tapTargetFloor`, 19 mutants, 2 deciding suites) and the measured per-child
  distribution in `docs/superpowers/specs/ci/probes/2026-08-20-browser-child-wallclock-probe.md`
  §2 (82 children over two full green gate runs). A probe outside that domain, or more than one
  ordinary edit away from an input in it, files to §6 rather than to a finding.
- **Threat-model fence.** This defends against **hung or orphaned Playwright children arising from
  ordinary harness use** — an infinite-loop mutant, a wedged browser, a harness killed mid-run.
  Adversarial process manipulation (a child that re-parents itself, traps SIGKILL, forks to escape
  its group, or forges a report file) is OUT OF SCOPE and files to §6. Every admissibility clause
  below cites this fence and the probe domain above.
- **Score.** The changed surface is NOT enrollable in the source-mutation registry, and §8 states
  that with the citation that shows it rather than enrolling it symbolically. No mutation score is
  claimed for `runner.ts`, and none may be stated that was not computed.

## 2. What is filed, and what is not

Filed: the missing bound on `runChild`. Not filed, and not to be widened into: the infra
discrimination (§1.1), the `classifyChild` verdict table (`tests/mutation/browser/mutate.ts:159`),
the scoring stack, and the browser registry's contents.

## 3. The measurement, and what it changed

Full record: `docs/superpowers/specs/ci/probes/2026-08-20-browser-child-wallclock-probe.md`.
Two full `pnpm heavy pnpm mutation:browser` runs, both GREEN, 82 children timed.

| series | n | min | p50 | p90 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- |
| `playwright:tap-target-floor`, pooled | 40 | 18833 | 24451 | 32149 | 51108 | **65111** |
| `vitest:Step3Review.test.tsx`, pooled | 42 | 2864 | 3494 | 4196 | 4290 | 4898 |

Two of the ledger entry's own premises are corrected by the data, and the corrections are recorded
here so a reviewer reading the entry does not re-derive them:

1. **"Each browser child is a full Playwright run whose legitimate wall clock is minutes."** Measured,
   it is **tens of seconds** — median 24.5 s, max 65.1 s.
2. **"180 s does not transfer."** True, and for a sharper reason than the entry gives. 180 s is not
   far above the browser child's legitimate range; it is **2.76x the measured maximum**. One
   contention regime that widens the tail threefold puts healthy children past it — and run-to-run
   variance already moved the max by 4% between two adjacent low-load runs, with a max already
   2.66x its own median.

**The tail is the finding, and it is shape rather than noise because it REPRODUCES.** The slowest
playwright child was 65111 ms in the first run, 62723 ms in the second — two independent runs
agreeing to within 4%. Four of 40 playwright children exceeded 47 s. This is load-bearing for §5.1: **a
single-run maximum would not have earned this ceiling**, because one 65 s observation is
indistinguishable from a stall. Two runs agreeing within 4% is what makes the maximum a property of
the workload. A ceiling derived from the median would sit inside the healthy distribution.

## 4. Approaches considered

**A — adopt `MUTANT_TIMEOUT_MS` unchanged (180 s).** REJECTED on §3: 2.76x the measured max is not a
margin, and the failure it produces (a healthy run scored as an infra fault) is the one the ledger
entry calls worse than the bug.

**B — a per-suite-kind ceiling** (one for vitest children, one for playwright). REJECTED as
unnecessary mechanism: the playwright max already dominates the vitest series by more than an order
of magnitude (§3), so a single ceiling derived from the playwright tail is above every vitest child
by construction. A second constant would need its own derivation and its own re-measurement rule for
no behavioral gain. Recorded rather than dropped, because it is the obvious second idea.

**C — rely on `heavy:reap` alone.** REJECTED on the sibling's probe P-T1: the backstop declines every
member of a post-`setpgrp` parent-death tree, so it reaps nothing of exactly the shape this bounds.
It is complementary, not sufficient — and its 4 h age floor is not a bound on a mutation run.

**D — call-site swap to `spawnBounded` with a measured per-caller ceiling.** CHOSEN. It is the
mechanism the sibling arc already shipped and reviewed, it already accepts `timeoutMs`, and it
brings the process group with it.

## 5. Design

### 5.1 The constant

One named export, in the browser module that owns the caller:

```ts
/**
 * Wall-clock ceiling for ONE browser-gate child.
 *
 * 10x the pooled measured healthy maximum (65111 ms across 82 children in two
 * green runs; probe 2026-08-20 §2). NOT `MUTANT_TIMEOUT_MS`: that is 180 s
 * against a ~2 s source suite, and only 2.76x THIS surface's measured max.
 *
 * Re-measure rather than re-argue when a second browser surface enrols: the
 * number is a multiple of a measurement, and the measurement is per-surface-set.
 */
export const BROWSER_MUTANT_TIMEOUT_MS = 660_000;
```

**Why 10x and not 3x or 5x** (the tighter candidates the probe records): the measured max is already
2.66x its own median, so the multiple must clear observed intra-run variance rather than the typical
child; contention on this machine is unmeasured and can only lengthen the tail (AGENTS.md records
~nine concurrent arcs as normal, and the semaphore bounds how many heavy phases START, not what else
runs); and the error costs are asymmetric — 11 minutes on a hang against the 1h48m–5h43m the sibling
measured, versus manufacturing a `MutantRunInfraError` on a healthy run. 660 s also exceeds the
entire healthy gate run (617–652 s), so it is unambiguous as a hang signal.

### 5.2 The call-site swap

`runChild` replaces `execFileSync` with `spawnBounded`, keeping its existing shape:

```ts
const { outcome } = spawnBounded([file, ...args], {
  cwd: root,
  env: { ...process.env, ...(manifestPath ? { MUTATION_OVERLAY_MANIFEST: manifestPath } : {}) },
  timeoutMs: BROWSER_MUTANT_TIMEOUT_MS,
});
```

**One seam, so the ceiling can be EXECUTED rather than simulated.** `runChild` takes the ceiling as a
defaulted parameter — `timeoutMs: number = BROWSER_MUTANT_TIMEOUT_MS` — so every production call site
keeps today's arity and ships the real ceiling, while a test can pass a small value and construct a
genuine timeout in seconds. This exists because AC-3 requires a constructed hanging child: a test that
injects a `{kind: "timeout"}` outcome into a fake spawn seam can pass while the real caller never
generates `ETIMEDOUT` and kills nothing, which is a fail-open proof of exactly the property this
design exists to establish.

`spawnBounded` discards child stdio by design (`spawnBounded.ts:126-138`), which the current
`stdio: "pipe"` does not. That is a behavior change and an intended one: nothing in `runChild` reads
the child's output — the verdict comes from the exit status, the overlay sentinel, and the
Playwright report file — and piping reintroduces the 1 MB `maxBuffer` cap that made high-output
surfaces unenrollable on the source harness.

### 5.3 Outcome mapping — the one contested decision

`spawnBounded` returns three kinds (`SpawnOutcome`, `spawnBounded.ts:69-72`). The source harness
maps them **differently in its two callers, deliberately** — `runSuite` returns
`MUTANT_TIMEOUT_EXIT` on timeout and scores it KILLED (`tests/mutation/source/runner.ts:112`, constant `MUTANT_TIMEOUT_EXIT` at `tests/mutation/source/runner.ts:51`), while `childRun` throws `MutantRunInfraError` on timeout
(`tests/mutation/source/childRun.ts`). `childRun`'s header states the split outright, in one sentence:
> there a timeout is the MUTANT's own doing and scores as detection; here it is an authoring or infrastructure defect. One bounded-spawn mechanism, two caller-owned interpretations.

**This caller takes `childRun`'s reading: a timeout is INFRA, never KILLED.**

| `outcome.kind` | mapping | rationale |
| --- | --- | --- |
| `exit` | `exitStatus = outcome.code`, then `classifyChild` unchanged | today's behavior for a normally-exiting child |
| `timeout` | `MutantRunInfraError`, with a cause string naming the ceiling and distinguishing it from a signal death | §5.3 argument below |
| `infra` | `MutantRunInfraError`, preserving `signal` and `code` | today's behavior for a non-numeric death, made explicit rather than routed through `exitStatus = null` |

**The argument.** `runSuite`'s reading rests on the hang being *the mutant's doing* — its cited case
is `statement-removal` deleting a loop's advance statement, where the mutant IS the infinite loop.
That inference is weak for a Playwright child, whose hang causes are dominated by the environment:
browser launch, port contention, a wedged context, and a machine that AGENTS.md describes as
normally running ~nine concurrent arcs. The surrounding module already refuses this exact
inference: `classifyChild` returns infra for any non-numeric exit precisely because scoring it as
detection *would inflate the mutation score with a kill the suite never earned*
(`tests/mutation/browser/mutate.ts:184-190`). Mapping a timeout to KILLED would contradict the
doctrine of the file it lives in.

**The counter-argument, recorded so it is not re-derived.** Consistency with `runSuite` is a real
cost: the two mutant-scoring paths now read the same event differently, and a future reader may take
that as an inconsistency rather than a decision. It is a decision, made on the evidence above, and
`childRun`'s header already establishes that per-caller interpretation is the intended pattern rather
than an accident. **A finding that argues only "the source harness scores it KILLED" is refuted by
this section; a finding that shows a browser-child timeout is attributable to the mutant — with a
probe from the domain in §1.2 — is admissible.**

**Why the timeout cause must be distinguishable from a signal death.** `interpretSpawnOutcome`
(`spawnBounded.ts:82`) exists to tell a timeout kill apart from this machine's idle-process reaper,
because the two arrive in the same shape and "must not share a verdict." Collapsing them back into
one infra string in this caller would discard exactly the distinction the helper was written to
preserve — and the reaper case is not hypothetical here (AGENTS.md, codex/heavy reaper sections).

### 5.4 The ceiling against the JOB budget — computed, not assumed

A per-child ceiling bounds anything only if it fires INSIDE the job that contains it. The browser
gate runs nightly under `timeout-minutes: 60` (`.github/workflows/mutation-browser.yml:60`), a
**3600 s** job budget, and that workflow's own step description puts a healthy CI run at
**~20-30 min** (`.github/workflows/mutation-browser.yml:74`) — slower than the 617-652 s measured
locally (§3), which is the figure to reason from because CI is the slower environment.

Taking the pessimistic end of the workflow's own estimate, 1800 s healthy, the headroom for hung
children is `3600 - 1800 = 1800 s`, and at 660 s per hung child:

| hung children | added | total against 3600 s | outcome |
| --- | --- | --- | --- |
| 1 | 660 s | 2460 s | ceiling fires, job completes and REPORTS |
| 2 | 1320 s | 3120 s | ceiling fires, job completes and REPORTS |
| 3 | 1980 s | 3780 s | **job timeout binds first** |

**Only the first row is reachable, which makes the bound exact rather than merely comfortable.** A
timeout throws `MutantRunInfraError` (§5.3), nothing in the browser runner catches it — the sole
`catch` is inside `runChild` itself (`tests/mutation/browser/runner.ts:162`) — so the throw
propagates out of `runMutant`, out of `runBrowserSurface`'s `map`, and aborts the invocation. A
second hung child is never reached in the same run. The worst reachable case is therefore
**2460 s against a 3600 s budget**, and the multi-hang rows above are retained only to show what the
budget would have to absorb if the abort behavior ever changed.

Two further observations, now belt-and-braces rather than load-bearing:

1. **The realistic case is ONE hung child.** The failure this bounds is a mutant that does not
   terminate; the mutants run sequentially, and a single non-terminating mutant is the shape both the
   sibling's evidence and `spawnBounded`'s own header describe. Three simultaneous independent hangs
   in one nightly is not a case anyone has observed.
2. **Locally there is no job budget at all**, and local is the environment this repair primarily
   serves: every disaster the sibling measured (1h48m, 2h28m, 2h55m, 3h53m, 5h43m) was on a
   developer machine, where nothing bounds a child except this ceiling. `pnpm heavy` bounds how many
   heavy phases START, never how long one lives.

**The residual is stated rather than hidden:** the ceiling is bounded by the job budget in the sense
that a job killed by `timeout-minutes` reports no gate annotation for any surface it holds — the same
censoring failure recorded for the source shards under `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`. On
the arithmetic above that is unreachable through this design's own timeout path; it remains reachable
through a healthy run that is simply slower than the workflow's estimate. That is limit §6.6, not a
claim that the ceiling covers every case.

### 5.4 Guard conditions

| input | behavior |
| --- | --- |
| `perl` absent | `spawnBounded` falls back to a direct spawn with `ownGroup: false`; the ceiling still bounds the child, the group reap does not run. Degraded and reported by shape, not silently assumed (`spawnBounded.ts:117-121`). |
| child times out BEFORE the overlay validates | the sentinel is absent, so `classifyChild`'s first branch would return infra regardless; the timeout arm reaches `MutantRunInfraError` first and names the ceiling. Both paths are infra — no verdict is produced either way. |
| child exits 0 within the ceiling, playwright kind | unchanged: survival only if the run's own fresh report proves tests executed. |
| baseline child times out | `assertBrowserBaseline` never sees a numeric status; the run aborts through the infra path rather than scoring any mutant. Correct: a baseline that did not complete is not a green baseline. |
| `timeoutMs` of 0 or negative | not reachable from this design — the value is a module constant, not an input. Stated so the accept-set is closed rather than assumed. |

## 6. Documented limits

1. **The ceiling is calibrated on one machine at low contention.** n=40 playwright children over two
   runs, both on `slot-0` of 2. The tail is reproduced, not bounded. A run under nine concurrent arcs
   is unmeasured; §5.1's choice of 10x is the response to that gap, not a measurement of it.
2. **A hung child still costs up to 11 minutes.** That is the deliberate price of not converting
   healthy runs into timeouts, and it is a documented limit rather than a finding.
3. **One surface.** `tapTargetFloor` is the only enrolled browser surface. A second surface with a
   heavier suite moves the maximum; the constant is stated as a multiple of a MEASURED maximum so
   that re-measuring is the documented response.
4. **Adversarial process manipulation is out of scope** per the §1.2 fence: a child that forks out of
   its group, traps signals, or forges a report file defeats this design, as it defeats the sibling's.
5. **The timeout path is not exercised by the browser gate's own healthy run.** Both measured runs
   were green. Proving the timeout arm is the plan's job (§7), not the gate's.
6. **In CI the ceiling's reachable worst case is 2460 s against a 3600 s budget** (§5.4, computed
   against `timeout-minutes: 60`), because the first timeout aborts the invocation. What remains
   reachable is a HEALTHY run slower than the workflow's own ~20-30 min estimate; if that ever
   exhausts the budget the job reports nothing at all. Raising `timeout-minutes` is NOT proposed here: it is a CI-capacity
   decision on a nightly that already contends with `mutation-harness`, and it belongs to whoever
   owns that budget. Locally — the environment where every measured disaster occurred — no job budget
   exists and the ceiling is the only bound.

## 7. Acceptance criteria

- **AC-1.** `runChild` spawns through `spawnBounded`, and `tests/mutation/browser/runner.ts` imports
  NOTHING from `node:child_process`. Stated at the binding level deliberately: a source check for the
  substring `execFileSync(` is defeated by `import { execFileSync as legacyRun }` plus a live
  `legacyRun(file, args)`, which leaves the unbounded call in place while the check passes. AC-3's
  execution is the behavioral half — a module still spawning unbounded cannot time out a constructed
  hanging child.
- **AC-2.** `BROWSER_MUTANT_TIMEOUT_MS === 660_000`, and a test pins BOTH the value and its
  derivation relationship to the probe's measured maximum, so a later edit to the number without a
  re-measurement fails.
- **AC-3.** A child that exceeds the ceiling produces `MutantRunInfraError` and never a scored
  verdict — proven executably by a CONSTRUCTED HANGING CHILD run against a small injected ceiling
  (§5.2), never by injecting a timeout outcome into a fake spawn seam and never by reading the
  mapping.
- **AC-4.** The timeout cause is distinguishable from the signal/OOM cause AND from the
  sentinel/report infra cause this file already throws (`tests/mutation/browser/runner.ts:227`), so
  that "it threw `MutantRunInfraError`" cannot stand in for "the timeout arm fired". The test asserts
  inequality of the produced messages rather than a literal match on any one of them.
- **AC-5.** A child killed by a signal still reaches the infra path with its `signal` and `code`
  preserved — the existing behavior, re-asserted so the swap cannot silently drop it.
- **AC-6.** `ownGroup: false` (no `perl`) still bounds the child by the ceiling. **Satisfied by
  `spawnBounded`'s existing, enrolled coverage** (`tests/mutation/source/spawnBounded.ts:117-121`),
  not by a new suite in this arc: the fallback lives entirely inside a module this design does not
  modify, so a second gate over it here would be a regression test for another surface — and, placed
  after the Task 2 swap, could not produce a red at all.
- **AC-7.** `pnpm heavy pnpm mutation:browser` remains GREEN end to end, with the surface still
  scoring 19/19 and its ledger still empty — the swap changes lifetime, not verdicts.

**Every command asserted RED is run, and its failure is matched to the asserted REASON.** Running it
is not the check — exiting non-zero is not evidence of the defect the task names. Three fail-open
shapes, all of which this plan's `red=` commands are checked against by reading the failure output:

1. **Cannot collect — and this tree has the trap in BOTH directions, so the form is chosen per
   target and probed, never assumed.** Measured on this tree at `039533373`:

   | target | correct invocation | the wrong one, and what it does |
   | --- | --- | --- |
   | the nightly gate file `tests/mutation/browser/browserSurfaces.gate.test.ts` | `pnpm mutation:browser` (`VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation <file>`) | bare `pnpm vitest run <file>` → **exit 0, nothing collected**: it is in `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts:101`) and every default project excludes it |
   | a unit test such as `tests/mutation/browser/mutate.test.ts` | bare `pnpm vitest run <file>` → collects and runs (41 tests) | the gated form → **exit 0, nothing collected**: the `mutation` project's include list is only the four nightly gate files |

   Either mistake yields a red that is **green from birth**, which no later edit can make fail. The
   plan states the invocation per task and records the observed collection count.
2. **Fails before any assertion.** A red that dies on an unresolved import, a missing fixture, or a
   config error exits non-zero and **looks healthy to every "did it exit non-zero" check there is**,
   while proving nothing about the production defect. This is the shape that survives the other two
   repairs, so each `red=` records the failure line observed and the plan states which production
   line makes it fail.
3. **Fails for a test-local reason.** Per the RED-validity rule, a red whose failure derives from a
   helper the test has not written yet goes green when the test file changes, not when the
   implementation lands.

## 8. Mutation enrolment — stated, not enrolled symbolically

`tests/mutation/browser/runner.ts` is **not enrolled and not enrollable**, and this is pre-existing,
documented, and cited rather than asserted. The registry's own browser block says it:

> What the registry CANNOT express is stated rather than enrolled symbolically: the spawn boundary in
> `tests/mutation/browser/runner.ts` needs a real Playwright child, the same shape limit the
> step3-a11y filing recorded, so its pure seams live in the two modules below and the residual
> wrapper is covered by the wiring meta-test plus the enrolment run itself.

— `tests/mutation/source/registry.ts`, comment above the `browserRegistry` row.

Consequences for this arc's review, stated so a brief cannot invent a criterion that does not exist:

- **No mutation score is claimed for `runner.ts`**, and none may be stated that was not computed.
  A `GUARD SURFACE:` line for a round-1 `--stage diff` brief on this arc therefore carries
  `CANNOT-EXPRESS:` with the registry citation above, not a fabricated `MUTATION SCORE:`.
- **`spawnBounded` IS enrolled** (`tests/mutation/source/registry.ts`, id `spawnBounded`, suite
  `tests/mutation/source/spawnBounded.test.ts`). This design does not modify it — the repair is a
  call-site swap — so its score is unchanged by construction. If a repair round DOES modify
  `spawnBounded.ts`, that surface's score plus an empty unaccepted-survivor set becomes the
  convergence criterion for that change, computed by `pnpm mutation:guards` before the dispatch.
- The pure seams that CAN be expressed (`browserRegistry`, `browserMutate`) are already enrolled and
  are not changed here.

## 9. Peers and class-sweep disposition

The sweep for this shape — `execFileSync`/`spawnSync` on a harness child with no lifetime bound —
was run by the sibling arc across `tests/mutation/**` and named exactly two members: the source
callers (repaired there) and this one. This arc closes the second. **The sweep is re-run at
implementation time against the live tree** rather than inherited on trust, and its command and
output land in the plan per the authored-AND-RUN rule.

**The cover is derived from a WALK ROOT and a call SHAPE, never from a name.** The sweep is
`rg -n 'execFileSync|spawnSync' tests/ scripts/` — every spawn site under those roots — and it is
narrowed afterwards by reading each hit, not by adding terms. A grep for a literal identifier
(`runChild`, `spawnBounded`, a surface id) is **unsound rather than merely incomplete** for this
class: a generic helper that walks a directory tree and spawns whatever it finds contains none of
those tokens by construction, so a clean result from a name grep proves nothing about it. Any
narrowing the plan applies to the roots above is stated with the reason it cannot hide a spawn.

## 10. Out of scope

The `classifyChild` table beyond the timeout arm; the scoring stack; the browser registry's
contents; `SOURCE_SHARD_COUNT` and the nightly's wall-clock budget (that is
`BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`, a different job with a different repair); and any change to
`heavy:reap`, whose relationship to this bound is settled in §4C.
