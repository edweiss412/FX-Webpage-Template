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

## Task 1: pin the base

Capture, on the UNCHANGED tree, the full outcome set (`siteId` to `verdict`) for the AC-10 comparison set — `spawnBounded`, `ledgerGit`, `premiseScan`, `psqlStartupScan` — into a scratch file outside the repo. Run it TWICE and assert the two captures agree; a base-vs-base disagreement VOIDS AC-10 rather than being averaged in (spec §7 AC-10), and this spec's own premise is that byte-identical inputs can produce different outcomes.

No production edit. This is a measurement, so it carries no red.

<!-- tasks: depth=2 red-contract -->

## Task 2: a mutant outcome carries the evidence that decided it

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:28` why=`MutantOutcome is declared as {siteId, verdict} at the line named here, so runSurface has nowhere to put a child record and the exit code is consumed inline and discarded. Step 1 authors cases asserting a survivor's children equal the registry row's suitePaths in order with every child kind exit and exitCode 0, and that a killed mutant on a multi-suite surface records only the suites actually run. Step 2 observes them red as VALUE assertions against the shipped two-field type - the tests read a children field that the type does not declare and the assertions report the missing evidence rather than merely erroring. Step 3 adds ChildRecord and threads it through runSuite, runAllSuites and runSurface; Step 4 re-runs the SAME command green` ac=AC-4,AC-5 -->

Discharges **AC-4** (a survivor's children equal `suitePaths` in order, every child `exit`/`0`) and **AC-5**. Adds `ChildRecord` and `MutantOutcome.children` (spec §5.1). Records EVERY child actually run, in execution order, rather than a `decidedBy` summary — the deciding child is derivable as the last one, and the reverse is not true.

**AC-5's killer is the run-both-and-discard implementation**, which a `children.length === 1` assertion admits. The test therefore spies the spawn seam and asserts invocation counts, for a kill at suite 1 AND a kill at a later suite on a surface with more than two deciding suites.

## Task 3: the timeout arm becomes reachable in a test

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:110` why=`runSuite hardcodes timeoutMs to MUTANT_TIMEOUT_MS at the line named here, so no test can exercise the timeout arm without a real 180-second hang - which is why the spec's own probe had to reach past runSuite to spawnBounded. Step 1 authors a case that injects a small ceiling against a deliberately hanging fixture and asserts the record reads kind timeout with exitCode null and durationMs at or above the injected ceiling, plus a paired fixture differing in ONE variable that exits non-zero fast and records its own real code. Step 2 observes them red: with the ceiling hardcoded the injected value is ignored, the hanging child runs to the 180s wall, and the assertion reports the wrong kind. Step 3 adds the optional parameter defaulting to MUTANT_TIMEOUT_MS so every existing call site is unchanged by construction; Step 4 re-runs the same command green` ac=AC-1,AC-2,AC-3,AC-15 -->

**AC-3 is the no-blast-radius guarantee and is asserted here, not assumed:** both the timeout case and the assertion case still read `verdict === "KILLED"`.

**AC-2 uses TWO fixtures with different non-zero exit codes.** One fixture admits an implementation hard-coding that single value.

**AC-15 pins that an ordinary exit's `durationMs` is MEASURED** — a fixture whose suite sleeps a known interval, asserted at least that interval. AC-1 bounds only the timeout case, so without AC-15 an implementation writing `durationMs: 0` for every ordinary exit passes and corrupts every determinism distribution built on the field.

## Task 4: the gate reports a timeout kill without being able to fail on it

<!-- task: red=`npx vitest run tests/mutation/source/gate.test.ts` red-state=authored red-target=`tests/mutation/source/gate.ts:34` why=`GateResult is declared as {passed, failures, score} at the line named here, with no channel for a non-failing observation. Step 1 authors a case feeding evaluateGate two runs identical but for one child's kind, asserting the notice COUNT is three for three timed-out mutants and that the set of site, suite and durationMs triples equals the set derived from those mutants' own records, while passed and score compare EQUAL across the two runs. Step 2 observes it red as a value assertion: the shipped GateResult exposes no notices, so the derived triple set is empty against a three-element expectation. Step 3 adds GateNotice with structured fields and populates it; Step 4 re-runs the same command green` ac=AC-6 -->

Discharges **AC-6**. `GateNotice` carries `site`, `suite` and `durationMs` as FIELDS, not only a rendered `detail` string — a proof that compares fields requires fields to exist.

**Three timed-out mutants, not one.** A single-timeout fixture is satisfied by an implementation emitting at most one notice globally.

`passed` remains computed from `failures` alone. The notice channel cannot red a surface; that decision is fenced in spec §5.5 and belongs to the orchestrator.

## Task 5: the durable per-run sink

<!-- task: red=`npx vitest run tests/mutation/source/records.test.ts` red-state=authored red-target=`tests/mutation/source/surfaceCases.ts:28` why=`surfaceCases runs a surface at the line named here and writes nothing anywhere, so a passing leg leaves no artifact at all - the blind spot the spec's section 1.0 measures. Step 1 authors the sink cases: an entry per mutant after a PASSING run with CI set, all four cells of passing-or-failing by CI-or-local, whole-entry round-trip by deep equality over distinguishable per-mutant children, a write failure that reports on stderr and leaves the gate passing, and the two-run case asserting BOTH records persist. Step 2 observes them red as value assertions - no record file exists, so each case reports an absent artifact against a populated expectation. Step 3 adds records.ts and calls it from surfaceCases; Step 4 re-runs the same command green` ac=AC-11,AC-12,AC-13,AC-14,AC-16,AC-17 -->

**AC-16 is the row that decides this task, and it is the only one that can fail on overwrite.** Run a surface, run it AGAIN, assert both records persist with the first still holding its original entries. That is exactly the sequence `BACKLOG.md:108` instructs an operator to perform before acting on a stale-row report — so the AC executes the documented operator procedure, which is what closes the tool-versus-document loop. Existence, the environment matrix, entry count and whole-entry round-trip are each satisfied by a file that has just overwritten its predecessor.

**AC-13 asserts WHOLE entries** — `siteId`, `verdict` and `children` bound together, by deep equality over a fixture whose per-mutant children are distinguishable. Checking `children` alone admits a writer that attaches correct evidence to the WRONG mutant.

**AC-17:** pruning never evicts run N-1.

**AC-12 is the four-cell matrix, not two points.** `passed && !CI` satisfies a passing-local case and a passing-case-with-CI-unset while omitting passing CI runs entirely.

## Task 6: the determinism harness

<!-- task: red=`npx vitest run tests/mutation/source/determinism.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:141` why=`runSurface at the line named here runs every generated mutant once and offers no way to run ONE site repeatedly, so the repetition the spec's probe 3 performed by hand has no shipped form. Step 1 authors the core cases: a named site run N times returns N results each carrying one record per deciding suite in order on a surface with more than two suites, and every invalid input - runs missing, empty, non-numeric, NaN, Infinity, fractional, zero, negative, an unknown surface, an unresolvable site, a red baseline - REFUSES with a named reason and emits no distribution. Step 2 observes them red as value assertions against an absent module: the imported core does not exist, and once stubbed it returns no distribution where one is expected. Step 3 implements determinism.ts as an importable core with the CLI as a thin adapter; Step 4 re-runs the same command green` ac=AC-8,AC-9 -->

`--runs` is an ACCEPT-SET — an integer >= 1 — with the complement default-denied. Enumerating rejects would be a denylist, and a denylist accepts whatever it did not model.

**AC-9: the assertions decide IN-PROCESS.** The suite imports the core directly; no assertion's verdict is carried by a spawned child's exit code. A CLI-shaped surface would score as if untested — the runner overlays modules in memory and a spawned `tsx` child reads from disk.

**The abort-when-vacuous rule:** zero completed runs ABORTS rather than printing a distribution over an empty population. A positive control proves an instrument CAN fire; an abort proves it REFUSES to report when it cannot.

## Task 7: no enrolled surface moved

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:165` why=`runSurface builds each outcome by calling classify on the short-circuited exit code at the line named here, and Tasks 2 and 3 rewrite that expression, so the risk this task exists to catch is a verdict moving under a shared code path used by all 40 enrolled surfaces. Step 1 authors a case asserting that for a fixture surface the outcome SET - siteId to verdict - is byte-equal to a committed expectation captured before the change. Step 2 observes it red by construction: the expectation is captured from the pre-change run in Task 1 and the case is authored to read a children-bearing outcome, so it reports a shape mismatch against the two-field outcome until Task 2 lands. Step 3 confirms the verdict half is unchanged; Step 4 re-runs the same command green` ac=AC-10 -->

Re-capture the Task 1 comparison set and assert the outcome sets are EQUAL. `runner.ts` is shared by all 40 surfaces, so `spawnBounded`'s blob being unchanged proves nothing about the other 39.

**Two limits stated rather than papered over.** The remaining 36 surfaces are covered by ARGUMENT — the change is in a shared path exercised identically by all of them — not by measurement. And this spec's own premise is that byte-identical inputs can produce different outcomes, so Task 1's double capture is what makes a single before/after pair interpretable; a base-vs-base disagreement voids the AC.

<!-- tasks: end -->

## Task 8: the workflow uploads what the leg produced

Add the records `upload-artifact` step to the **`source-shards` job** of `.github/workflows/mutation-harness.yml`, `if: always()`, mirroring the `elapsed.txt` upload at `.github/workflows/mutation-harness.yml:170`. Add `mutation:determinism` to `package.json`.

AC-11's proof PARSES the workflow and asserts the step belongs to the `source-shards` job — the surfaces run in that matrix, so a correct step under `source-gates` uploads nothing and all four shard workspaces are still discarded.

## Task 9: ledger closeout

ONE commit, BEFORE whole-diff review (invariant 12 as ruled): file any peer rows, archive `BL-MUTATION-SCORE-NONDETERMINISM` with the arc's findings recorded on it — including the measured **0 of 93** timeout count (AC-7) and the four measurements that declined to confirm the duration hypothesis — and remove the in-progress marker. Then re-verify set arithmetic: union of `BL-`/`DEF-` ids exact, `comm -12` archived-versus-open empty, in-progress marker count zero.

---

## 12. Close-out

- Whole-diff cross-model review to APPROVE after the ledger commit.
- Real CI green, read sha-keyed with `(.check_runs|length) == .total_count` asserted.
- `impeccable-gate: N/A — no UI surface`.
- Round-economy filing if any stage reaches four counted rounds. **The spec stage reached five** (11, 9, 7, 4, 1), so the arc's round-corpus filing at `docs/review-rounds/fix/mutation-score-nondeterminism/c80f844278bd.md` is owed a `## spec — 5 rounds` heading with `**Examined:**` and at least one of `**Mechanizable:** / **Judgment:** / **Infra:**`.
