# Plan — mutation outcome attribution

**Spec:** `docs/superpowers/specs/ci/2026-08-21-mutation-outcome-attribution-design.md`
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-21-mutation-outcome-attribution.md`
**Row:** `BL-MUTATION-SCORE-NONDETERMINISM` (`BACKLOG.md:53`)
**Base:** `a54a779de7` on `fix/mutation-score-nondeterminism`; spec APPROVED after five review rounds (11, 9, 7, 4, 1).

`impeccable-gate: N/A — no UI surface` (nothing under `app/` outside `app/api/**`, nothing under `components/`, no token or `DESIGN.md` change).

---

## What this plan builds, in one paragraph

`KILLED` names two events — an assertion-or-compile rejection and a wall-clock timeout — and the harness records neither. This plan adds the evidence, changes no verdict, and ships a determinism harness that can be pointed at any site. Every change lands in modules that are NOT mutation-enrolled, so no enrolled surface's score is retired (spec §5.6).

## Acceptance criteria this plan discharges

AC-1 through AC-17 of the spec's §7 table. Each AC row already names the strictly weaker implementation it kills; the tasks below inherit those killers rather than restating them, and **a task is not done until the killer named in its AC row is demonstrably killed by a shipped test.**

**Two ACs are discharged by tasks that carry NO marker, deliberately.** `AC-10` (no enrolled surface's verdict or score moves) is a before/after MEASUREMENT — Task 1 captures, Task 8 re-captures and compares. An authored red for it would be pre-satisfied the moment `children` exists, since a `siteId -> verdict` projection ignores the new field, and it has no implementation that could legitimately turn it green; it is a gate on the diff rather than a TDD cycle. `AC-7` (the measured timeout count is recorded in the probe record and the ledger row) is discharged by the Task 9 closeout, which is a documentation move with nothing to observe red. Both are stated here so their absence from the marker set reads as a decision rather than an omission.

**Coverage check, run at authoring time:** every AC id declared in the spec appears either in a task marker's `ac=` list or in the two exceptions above — verified by extracting `AC-\d+` from the spec and the `ac=` values from this plan and differencing the sets.

## The implementation surface, stated whole

| file | change | enrolled? |
| --- | --- | --- |
| `tests/mutation/source/runner.ts` | `ChildRecord`, `MutantOutcome.children`, injectable ceiling on `runSuite` | no |
| `tests/mutation/source/gate.ts` | `GateNotice` with structured fields, `GateResult.notices` | no |
| `tests/mutation/source/surfaceCases.ts` | emit notices, write the durable record | no |
| **NEW** — a `records` module beside the runner, in `tests/mutation/source/` | the per-run sink | no |
| **NEW** — a `determinism` module beside the runner | the harness core, importable | no |
| **NEW** — a `mutation-determinism` adapter under `scripts/` | thin CLI adapter over the core | no |
| `.github/workflows/mutation-harness.yml` | records upload on the `source-shards` job | n/a |
| `.gitignore` | already carries `.mutation-records/` at this base | n/a |
| `package.json` | `mutation:determinism` script | n/a |

**`tests/mutation/source/spawnBounded.ts` is NOT touched** — enrolled at `tests/mutation/source/registry.ts:2663`, `scoreFloor: 1`, measured 12/12. Editing it would retire that score for no gain.

## Global constraints

1. **No verdict, score, denominator or pass/fail outcome may move.** `classify` is untouched; `passed` stays computed from `failures` alone. Task 7 proves it by measurement rather than by assertion.
2. **The record is additive.** A record-write failure reports on stderr and never reds a gate (AC-14).
3. **Never write an AC whose red depends on a SURVIVOR appearing unless a declared operator can express the defect.** A perfect score with an empty survivor set has coexisted with a live defect class on a sibling surface precisely because no declared operator could generate it; a red resting on a survivor that no operator can produce is a red that can never fire.
4. **Every red is a VALUE assertion and an expect-a-REPORT case.** A red that passes because something is missing is not a red.
5. **Heavy phases run under `pnpm heavy`.** The full-gate runs in Tasks 1 and 7 are heavy by the transitive-shape rule.
6. **`tests/_probe_nondet/` and `.mutation-records/` are git-ignored.** Stage by path; never `git add -A` (`git ls-tree` across the branch before pushing).

## Meta-test inventory

- **EXTENDS** `tests/mutation/source/runner.test.ts`, `gate.test.ts` — the record and notice contracts.
- **CREATES** a `records` suite beside the runner — sink contract incl. the two-run non-overwrite (AC-16) and pruning (AC-17).
- **CREATES** a `determinism` suite beside the runner — harness core, in-process (AC-8, AC-9).
- **NOT extended:** `tests/mutation/_metaSourceShardIntegrity.test.ts` — the shard file set does not change. `tests/mutation/_metaPremiseContract.test.ts` — no new enrolled surface, so no new premise obligations. Declared explicitly rather than left silent.

---

## Task 1: pin the base (measurement, no red)

Capture, on the UNCHANGED tree, the outcome projection `siteId -> verdict` for the AC-10 comparison set — `spawnBounded` (single-suite, 12 mutants), `ledgerGit` and `premiseScan` (two suites each), `psqlStartupScan` (single-suite, heaviest) — into a scratch file OUTSIDE the repo.

Run it **twice** and assert the two captures agree. A base-vs-base disagreement VOIDS AC-10 rather than being averaged in: this spec's own premise is that byte-identical inputs can produce different outcomes, and §2.3 measured a 2x duration swing across three runs whose verdicts were identical. The double capture is what makes a single before/after pair interpretable.

**No red.** This is a measurement, not a TDD cycle, and it carries no marker.

<!-- tasks: depth=2 red-contract -->

## Task 2: a mutant outcome carries the evidence that decided it

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:28` why=`MutantOutcome is declared {siteId, verdict} at the line named here, so runSurface has nowhere to record a child and the exit code is consumed inline at :165 and discarded. Step 1 authors two VALUE assertions against a surface with MORE THAN TWO deciding suites: for a SURVIVOR, the recorded children array deep-equals that registry row full suitePaths in execution order with every child kind exit and exitCode 0; and for a mutant killed at suite 3, the spawn seam spy records exactly three invocations in order and ZERO for suites 4 and beyond. Step 2 observes both red as value assertions - the shipped outcome exposes no children field, so the observed suite array is undefined against a populated expectation and the recorded invocation list is empty against a three-element one. Step 3 adds ChildRecord and threads it through runSuite, runAllSuites and runSurface; Step 4 re-runs the SAME command green` ac=AC-4,AC-5 -->

Discharges **AC-4** and **AC-5**. Adds `ChildRecord` and `MutantOutcome.children` (spec §5.1): every child actually run, in execution order, rather than a `decidedBy` summary — the deciding child is derivable as the last one and the reverse is not true.

**Cardinality is pinned, not implied.** The survivor case runs on a surface with MORE THAN TWO deciding suites (the registry's largest declares ten, `tests/mutation/source/registry.ts:232`), and the kill case kills at **suite 3** with suites 4+ asserted never spawned. A survivor on a two-suite row with a "later" kill at suite 2 is passed by a runner capped at two children, which is the implementation AC-5 exists to kill.

## Task 3: the timeout arm becomes reachable, and durations are real

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:110` why=`runSuite hardcodes timeoutMs to MUTANT_TIMEOUT_MS at the line named here, so a ceiling passed by a caller is IGNORED. Step 1 authors a VALUE assertion on the recorded duration: run a deliberately hanging fixture with a 2000ms ceiling injected and assert the recorded durationMs is under 10000. Step 2 observes it red on the NUMBER rather than on the kind - the hardcoded ceiling ignores the injected value, the child runs to the 180-second wall, and the assertion reports roughly 180000 against a 10000 bound. The kind is deliberately NOT the discriminator here because a hanging child reports kind timeout under both the shipped and the repaired code. Step 3 adds the optional ceiling parameter defaulting to MUTANT_TIMEOUT_MS so every existing call site is unchanged by construction; Step 4 re-runs the same command green` ac=AC-1,AC-2,AC-3,AC-15 -->

**The red is a value assertion on `durationMs`, not on `kind`** — a hanging child produces `kind: "timeout"` under BOTH the shipped and the repaired code, so kind cannot discriminate and only the duration can.

**AC-3 is the no-blast-radius guarantee, asserted not assumed:** both the timeout case and the assertion case still read `verdict === "KILLED"`.

**AC-2 uses TWO fixtures with DIFFERENT non-zero exit codes**, each asserted to carry its own code. One fixture admits an implementation hard-coding that single value.

**AC-15 asserts durations are BOUNDED ON BOTH SIDES** — at least the sleep interval AND below a generous ceiling, exactly as the spec's AC-15 row requires. A lower bound alone is satisfied by a constant such as `Number.MAX_SAFE_INTEGER`, which is the constant-duration implementation that row names.

## Task 4: the gate reports a timeout kill, on a run that stays green

<!-- task: red=`npx vitest run tests/mutation/source/gate.test.ts` red-state=authored red-target=`tests/mutation/source/gate.ts:34` why=`GateResult is declared {passed, failures, score} at the line named here, with no channel for a non-failing observation. Step 1 authors a VALUE assertion over a run carrying THREE timed-out mutants among others: the notice count is exactly 3, and the set of site, suite and durationMs triples deep-equals the set derived from those three mutants own records. It additionally asserts the timeout-bearing run is AFFIRMATIVELY passed true with an empty failures array, not merely equal to a peer, because comparing passed for equality is satisfied when BOTH runs are false. Step 2 observes it red as a value assertion: the shipped GateResult exposes no notices, so the derived triple set is empty against a three-element expectation. Step 3 adds GateNotice with structured fields and populates it; Step 4 re-runs the same command green` ac=AC-6 -->

Discharges **AC-6**. `GateNotice` carries `site`, `suite` and `durationMs` as FIELDS, not only a rendered `detail` string — a proof comparing fields requires fields to exist.

**Three timed-out mutants, not one.** A single-timeout fixture is satisfied by an implementation emitting at most one notice globally.

**The unchanged-pass half is asserted AFFIRMATIVELY** (`passed === true`, `failures` empty) rather than by equality against a peer run, because an equality check is satisfied when a pre-existing failure makes both runs `false`.

## Task 4b: the console channel actually emits

<!-- task: red=`npx vitest run tests/mutation/source/gate.test.ts` red-state=authored red-target=`tests/mutation/source/surfaceCases.ts:28` why=`surfaceCases runs a surface at the line named here and prints nothing on a passing run, which is the condition probe 1 measured - a passing gate output is the empty string. Spec section 5.2 declares TWO emission channels and Task 4 proves only the structured notices field, so without this task an implementation that never writes to the console satisfies every other test while contradicting the spec. Step 1 authors a VALUE assertion spying the console with a PASSING surface carrying one timed-out mutant: the captured output contains the site id of that mutant. Step 2 observes it red - nothing is written, so the captured output is empty against a populated expectation. Step 3 emits notices at module scope after the run; Step 4 re-runs the same command green` ac=AC-6 -->

The console half of spec §5.2's two channels. Emission is at module scope after the run, so notices appear whether the gate passed or failed.

## Task 5: the durable per-run sink

<!-- task: red=`npx vitest run tests/mutation/source/records.test.ts` red-state=authored red-target=`tests/mutation/source/surfaceCases.ts:28` why=`surfaceCases runs a surface at the line named here and writes no artifact anywhere, so a passing leg leaves nothing behind - the blind spot spec section 1.0 measures. Step 1 authors VALUE assertions: an entry per mutant after a PASSING run with CI set; all four cells of passing-or-failing crossed with CI-or-local; whole-entry deep equality over a fixture whose per-mutant children are DISTINGUISHABLE; a write failure that reports on stderr while the gate stays passed true; a two-run case asserting BOTH records persist with the first still holding its original entries; and a pruning case that EXCEEDS the retention cap, asserting the oldest records were actually removed AND the immediately-previous run of each surface survived. Step 2 observes them red - no record file exists, so each case reports an absent artifact against a populated expectation. Step 3 adds the records module and calls it from surfaceCases; Step 4 re-runs the same command green` ac=AC-12,AC-13,AC-14,AC-16,AC-17 -->

**AC-16 is the row that decides this task and the only one that can fail on overwrite.** Run a surface, run it AGAIN, assert both records persist — exactly the sequence `BACKLOG.md:108` instructs an operator to perform before acting on a stale-row report. **The AC executes the documented operator procedure**, which is what closes the tool-versus-document loop. Existence, the environment matrix, entry count and whole-entry round-trip are each satisfied by a file that has just overwritten its predecessor.

**AC-17's proof EXCEEDS the cap and asserts the oldest were actually pruned.** "Pruning never evicts run N-1" is otherwise passed by a pruner that never prunes.

**AC-13 asserts WHOLE entries** — `siteId`, `verdict` and `children` bound together — over distinguishable children. Checking `children` alone admits a writer that attaches correct evidence to the WRONG mutant.

**AC-12 is the four-cell matrix, not two points.** `passed && !CI` satisfies a passing-local case and a passing-case-with-CI-unset while omitting passing CI runs entirely.

## Task 6: the determinism harness

<!-- task: red=`npx vitest run tests/mutation/source/determinism.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:141` why=`runSurface at the line named here runs every generated mutant exactly once and offers no per-site repetition, which is why a new module is required rather than a caller. Step 1 authors the suite AND a declared STUB module whose core returns an empty result set and refuses nothing - the stub is written in this step so the import resolves and the red is a VALUE assertion rather than a module-resolution failure. The assertions: a named site run N times returns N results, each carrying one record per deciding suite in execution order on a surface with more than two suites, with the verdict and kind distributions deep-equal to the per-run results and the before and after input stamps present and identical; and every invalid input - runs missing, empty, non-numeric, NaN, Infinity, negative Infinity, fractional, zero, negative, an unknown surface, an unresolvable site, a red baseline - exits with code 2, names which input failed, and emits NO distribution. Step 2 observes them red against the stub: zero results against N, absent distributions, and no refusals where exit code 2 is expected. Step 3 implements the core; Step 4 re-runs the same command green` ac=AC-8,AC-9 -->

Discharges **AC-8** and **AC-9**. `--runs` is an ACCEPT-SET — an integer >= 1 — with the complement default-denied; enumerating rejects would be a denylist, and a denylist accepts whatever it did not model. The invalid-input list above is the accept-set's complement sampled, not the specification.

**Refusals exit with code 2 specifically**, and that code is asserted. A refusal that throws, or exits 1, is indistinguishable from an ordinary failure.

**AC-9: the assertions decide IN-PROCESS.** The suite imports the core directly; no assertion's verdict is carried by a spawned child's exit code. A CLI-shaped surface would score as if untested — the runner overlays modules in memory and a spawned `tsx` child reads from disk.

**The abort-when-vacuous rule:** zero completed runs ABORTS rather than printing a distribution over an empty population.

## Task 6b: the adapter carries what the core produces

<!-- task: red=`npx vitest run tests/mutation/source/determinism.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:141` why=`Task 6 proves the CORE only, so a correct core behind a broken adapter satisfies it - and the shipped harness has no adapter at all, because runSurface at the line named here is the only entry point and it takes a whole surface. Step 1 authors a VALUE assertion that invokes the adapter as an operator would and asserts its captured stdout carries the same verdict distribution the core returns for the same arguments, and that an invalid runs value exits 2 through the adapter. Step 2 observes it red - no adapter exists, so the captured stdout is empty against a populated expectation. Step 3 adds the adapter and the package script; Step 4 re-runs the same command green` ac=AC-8 -->

The CLI adapter and its `package.json` script. Task 6 proves the core; this proves the operator-facing path carries the core's results and its refusal codes.

## Task 7: the workflow uploads what the leg produced

<!-- task: red=`npx vitest run tests/mutation/source/records.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:170` why=`the source-shards job uploads only elapsed.txt at the line named here, so a records directory written into that workspace dies with it and the CI half of the record does not survive - rebuilding the blind spot spec section 1.0 measures. Step 1 authors a VALUE assertion that PARSES the workflow and asserts the records upload-artifact step is a step OF THE source-shards JOB with if always, comparing the resolved job name rather than searching the file. Step 2 observes it red as a value assertion: the source-shards job step list contains no records upload, so the resolved step is undefined against a populated expectation. A file-scoped existence check is deliberately NOT used - the same step under source-gates would satisfy it while all four shard workspaces are still discarded. Step 3 adds the step; Step 4 re-runs the same command green` ac=AC-11 -->

Discharges **AC-11**'s workflow half. Task 5 discharges the record-exists half; this task owns the upload, so neither task depends on the other's later work to go green.

<!-- tasks: end -->

## Task 8: no enrolled surface moved (measurement, no red)

Re-capture the Task 1 comparison set on the CHANGED tree and assert the `siteId -> verdict` projections are EQUAL. `runner.ts` is shared by all 40 surfaces, so `spawnBounded`'s blob being unchanged proves nothing about the other 39.

**No red, and deliberately so.** This is the same measurement as Task 1 taken on the other side of the change; an authored red here would be pre-satisfied by Task 2 (a `siteId -> verdict` projection ignores `children` and is green the moment the field exists) and has no implementation that could legitimately turn it green. It is a GATE on the diff, not a TDD cycle.

**Two limits stated rather than papered over.** The remaining 36 surfaces are covered by ARGUMENT — the change is in a shared path exercised identically by all of them — not by measurement. And a base-vs-base disagreement in Task 1 voids AC-10 rather than being averaged in.

Discharges **AC-10**.

## Task 9: ledger closeout

ONE commit, BEFORE whole-diff review (invariant 12 as ruled): file any peer rows, archive `BL-MUTATION-SCORE-NONDETERMINISM` with the arc's findings recorded on it — including the measured **0 of 93** timeout count (**AC-7**) and the five measurements that declined to support the duration hypothesis — and remove the in-progress marker. Then re-verify set arithmetic: union of `BL-`/`DEF-` ids exact, `comm -12` archived-versus-open empty, in-progress marker count zero.

## 12. Close-out

- Whole-diff cross-model review to APPROVE after the ledger commit.
- Real CI green, read sha-keyed with `(.check_runs|length) == .total_count` asserted.
- `impeccable-gate: N/A — no UI surface`.
- Round-economy filing if any stage reaches four counted rounds. **The spec stage reached five** (11, 9, 7, 4, 1), so the arc's round-corpus filing at `docs/review-rounds/fix/mutation-score-nondeterminism/c80f844278bd.md` is owed a `## spec — 5 rounds` heading with `**Examined:**` and at least one of `**Mechanizable:** / **Judgment:** / **Infra:**`.
