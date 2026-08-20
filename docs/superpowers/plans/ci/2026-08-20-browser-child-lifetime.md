# Browser mutation gate — child lifetime bound — plan

**Spec:** `docs/superpowers/specs/ci/2026-08-20-browser-child-lifetime-design.md` (APPROVE, spec round 1, 0 findings).
**Probe:** `docs/superpowers/specs/ci/probes/2026-08-20-browser-child-wallclock-probe.md`.
**Ledger:** `BL-MUTATION-BROWSER-CHILD-LIFETIME`. **Branch:** `fix/mutation-browser-child-lifetime`.

`impeccable-gate: N/A — no UI surface` (this arc touches `tests/**` only).

## Pre-draft code-verification pass — run, not described

Every symbol this plan names, verified against the live tree at `039533373` + this branch:

| claim | verified |
| --- | --- |
| `runChild` spawns via `execFileSync`, no timeout, no group | `tests/mutation/browser/runner.ts:141` (fn), `tests/mutation/browser/runner.ts:152` (call) |
| infra discrimination (NOT to be touched) | `tests/mutation/browser/runner.ts:164` |
| the sole `catch` in the browser runner is inside `runChild` | `tests/mutation/browser/runner.ts:162` — `rg -n 'catch' tests/mutation/browser/runner.ts tests/mutation/browser/browserSurfaces.gate.test.ts` returns exactly this one hit |
| `spawnBounded(argv, {cwd, env, timeoutMs?})` | `tests/mutation/source/spawnBounded.ts:122` |
| `SpawnOutcome` = `exit` \| `timeout` \| `infra` | `tests/mutation/source/spawnBounded.ts:69-72` |
| `MUTANT_TIMEOUT_MS = 180_000` | `tests/mutation/source/spawnBounded.ts:67` |
| `MUTANT_TIMEOUT_EXIT = 124` (source's KILLED mapping — NOT used here) | `tests/mutation/source/runner.ts:51`, mapping at `tests/mutation/source/runner.ts:112` |
| `childRun`'s infra mapping (the reading this caller takes) | `tests/mutation/source/childRun.ts:41-45` |
| `classifyChild` verdict table | `tests/mutation/browser/mutate.ts:159`, non-numeric-exit arm `tests/mutation/browser/mutate.ts:184-190` |
| `MutantRunInfraError` | `tests/mutation/source/runner.ts:75-79` |
| gate job budget `timeout-minutes: 60` | `.github/workflows/mutation-browser.yml:60` |
| the gate file is nightly-only | `vitest.projects.ts:101` (`NIGHTLY_ONLY_EXCLUDES`) |
| browser surface set: 1 surface, 19 mutants, 2 deciding suites | `tests/mutation/browser/registry.ts`, `tapTargetFloor` |

## Class sweep — authored AND RUN, cover derived from a walk root

The class is "a mutation-harness child spawned with no lifetime bound." The cover is the **walk root
plus the call shape**, never an identifier: a helper that walks a directory and spawns what it finds
contains none of this arc's names by construction, so a clean name-grep would prove nothing.

```
$ rg -n 'execFileSync|spawnSync|\bspawn\(' tests/mutation/ | grep -v '\.test\.ts'
tests/mutation/browser/runner.ts:1:import { execFileSync } from "node:child_process";
tests/mutation/browser/runner.ts:152:    execFileSync(file, args, {
tests/mutation/source/spawnBounded.ts:1:import { type StdioOptions, spawnSync } from "node:child_process";
tests/mutation/source/spawnBounded.ts:147:  const grouped = spawnSync("perl", [...WATCHDOG_ARGV, ...argv], spawnOptions);
tests/mutation/source/spawnBounded.ts:149:  const result = fellBack ? spawnSync(argv[0], argv.slice(1), spawnOptions) : grouped;
  (+ 9 hits in tests/mutation/source/premiseScan.ts, ALL of them prose in comments
     about the token `spawnSync`, no call site — read individually, not filtered by pattern)
```

**Disposition, per hit rather than in aggregate:** `runner.ts:152` is the defect and Task 2 repairs
it. `tests/mutation/source/spawnBounded.ts:147` and `tests/mutation/source/spawnBounded.ts:149` ARE the bounding mechanism. The `premiseScan.ts` hits are comments —
and they are the reason each hit is read: a pattern tight enough to exclude them would have been
tight enough to miss a real site spelled slightly differently.

**One unrepaired member. No peer is deferred, so no `BL-` filing is owed by this sweep.**

## Meta-test inventory

**CREATES:** none. **EXTENDS:** none.
`tests/mutation/_metaPremiseContract.test.ts` already governs premise statements in mutation-enrolled
suites and covers Task 3's premise by existing membership; no registry row is added because no new
surface is enrolled (spec §8 — `runner.ts` is not enrollable, and `spawnBounded` is unmodified).

## RED-command form — probed per target, both directions of the trap

Measured on this tree (spec §7 carries the table):

| target | invocation | observed |
| --- | --- | --- |
| unit tests (`tests/mutation/browser/*.test.ts`) | `pnpm vitest run <file>` | collects — `mutate.test.ts` ran its full case set (41) |
| unit tests, WRONG form | `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm vitest run --project mutation <file>` | **exit 0, nothing collected** |
| the nightly gate file | `pnpm mutation:browser` | collects the gate suite, ~617-652 s |
| the nightly gate file, WRONG form | `pnpm vitest run tests/mutation/browser/browserSurfaces.gate.test.ts` | **exit 0, nothing collected** |

Every task below therefore records **the invocation, the observed failure line, and the production
line that makes it fail** — running the command is not the check; matching the failure to the
asserted reason is.

<!-- tasks: depth=2 -->

## Task 1 — the ceiling constant, and a test that pins its derivation

<!-- task: red=`pnpm vitest run tests/mutation/browser/timeout.test.ts` ac=AC-2 -->

**What is red and why.** The suite this task writes cannot resolve `BROWSER_MUTANT_TIMEOUT_MS`, because the production line that exports it — in `tests/mutation/browser/runner.ts` — does not exist yet. Authored red: the failing case arrives with this task.

Add to `tests/mutation/browser/runner.ts`:

```ts
/**
 * Wall-clock ceiling for ONE browser-gate child.
 *
 * 10x the pooled measured healthy maximum (65111 ms across 82 children in two
 * green runs; probe 2026-08-20 §2). NOT `MUTANT_TIMEOUT_MS`: that is 180 s
 * against a ~2 s source suite, and only 2.76x THIS surface's measured max.
 *
 * Re-measure rather than re-argue when a second browser surface enrols.
 */
export const BROWSER_MUTANT_TIMEOUT_MS = 660_000;
```

New test file (created by this task) tests/mutation/browser/timeout.test.ts asserts BOTH the value and its **derivation
relationship**, so editing the number without re-measuring fails:

**AC-2** is satisfied by three assertions, all reading the exported constant:

- `BROWSER_MUTANT_TIMEOUT_MS === 660_000`.
- `BROWSER_MUTANT_TIMEOUT_MS >= 10 * MEASURED_HEALTHY_MAX_MS`, where `MEASURED_HEALTHY_MAX_MS = 65_111`
  is a named local constant carrying the probe path in a comment.
- `BROWSER_MUTANT_TIMEOUT_MS !== MUTANT_TIMEOUT_MS` — the whole point of the arc is that the source
  ceiling does not transfer, and an import-and-reuse regression must fail here.

**Failure mode this catches:** someone lowering the constant to "make CI faster" without a
re-measurement, and someone `import`ing `MUTANT_TIMEOUT_MS` instead. **Anti-tautology:** the
assertions read the exported constant, not a literal re-declared in the test.

**RED, observed:** the suite cannot resolve `BROWSER_MUTANT_TIMEOUT_MS` from `runner.ts`. The failure
line is an unresolved-import error naming that symbol — recorded in the task's RED commit — and the
production line that fixes it is the `export const` above. Per the spec's shape (2), an
unresolved-import red is itself one of the fail-open shapes, so this task's GREEN is not
that the command exits 0, but that all three assertions execute and pass.

## Task 2 — swap the call site, and map the outcomes

<!-- task: red=`pnpm vitest run tests/mutation/browser/childLifetime.test.ts` ac=AC-1,AC-3,AC-4,AC-5 -->

**What is red and why.** `runChild` still calls `execFileSync` (`tests/mutation/browser/runner.ts:152`), so a child that exceeds the ceiling is never killed and no timeout-shaped `MutantRunInfraError` is ever thrown. Authored red: the failing cases arrive with this task.

Replace the `execFileSync` call in `runChild` with `spawnBounded`, per spec §5.2, and map per §5.3:

| `outcome.kind` | mapping |
| --- | --- |
| `exit` | `exitStatus = outcome.code`, `classifyChild` unchanged |
| `timeout` | `MutantRunInfraError` whose cause names the ceiling |
| `infra` | `MutantRunInfraError` preserving `signal` and `code` |

New test file (created by this task) tests/mutation/browser/childLifetime.test.ts, driving `runChild` through an **injected spawn
seam** rather than a real 11-minute child (the ceiling itself is not exercised in wall clock):

- **AC-1** — no `execFileSync` remains: assert on the module source read from disk, scoped to
  `tests/mutation/browser/runner.ts`. Not a substring search for `spawnBounded` (which the import
  line alone would satisfy) but the absence of `execFileSync(` **and** the presence of a
  `timeoutMs: BROWSER_MUTANT_TIMEOUT_MS` argument at the call.
- **AC-3** — a seam returning `{kind:"timeout"}` produces `MutantRunInfraError` and **no** verdict.
  Asserted as: the call throws, AND neither KILLED nor SURVIVED is ever returned. The negative half is
  the point — a test that only asserts the throw would pass if the code threw for any reason.
- **AC-4** — the timeout cause string `!==` the signal cause string. Asserted as inequality of the
  two produced messages, never as a literal match on either, so re-wording one does not silently
  make them identical.
- **AC-5** — a seam returning `{kind:"infra", signal:"SIGKILL", code:"ERR"}` reaches
  `MutantRunInfraError` with both fields preserved.

**Anti-tautology:** each case asserts against the value the seam returned, never against a container
that would also be satisfied by the default path. **Four pre-dispatch mutants**, results recorded in
the task's commit — delete the `timeout` arm and the timeout assertion fails (AC-3); make both
cause strings identical and the distinguishability assertion fails (AC-4); leave `execFileSync`
in place beside the new call and the source assertion fails (AC-1); drop `timeoutMs` from the
call and the argument assertion fails (AC-1).

## Task 3 — the `perl`-absent fallback still bounds the child

<!-- task: red=`pnpm vitest run tests/mutation/browser/childLifetime.fallback.test.ts` ac=AC-6 -->

**What is red and why.** Without Task 2's swap there is no `spawnBounded` call in `tests/mutation/browser/runner.ts` at all, so the fallback path this asserts does not exist to be exercised. Authored red.

`spawnBounded` falls back to a direct spawn with `ownGroup: false` when `perl` is missing
(`tests/mutation/source/spawnBounded.ts:117-121`); the ceiling still applies, the group reap does not.
Assert that `runChild` inherits that behavior.

**AC-6** is this task's acceptance. **Premise, stated executably** with `premise` / `premiseHolds` from `tests/_shared/premise.ts`, and
placed **unconditionally relative to what it guards** — never inside a `.each` callback:

> the constructed environment actually lacks a resolvable `perl`

Where that environment cannot be constructed the case is **skipped with a surfaced signal**, never
silently passed. This is the exact shape `BL-GUARD-PREMISE-REACHABILITY` records: a guard whose
condition is false where it runs passes unconditionally and would forever.

## Task 4 — the gate is still green, and still scores 19/19

<!-- task: red=`pnpm heavy pnpm mutation:browser` ac=AC-7 -->

**What is red and why — nothing is, and that is declared rather than hidden.** This is a GATE command: it passes on the current tree (measured, twice) and must still pass after the swap. It is listed so the closeout RUNS it instead of assuming the swap was verdict-neutral.

Run the full gate end to end under the semaphore. **`pnpm heavy` is mandatory** — the gate spawns a
real Playwright child per mutant, and roughly nine concurrent arcs exhausted this machine's memory
once already. `FX_HEAVY_SLOT_DIR` is never set.

**AC-7** acceptance: the gate suite passes in full, exit 0, `tapTargetFloor` still 19/19 with an empty ledger. The swap changes
lifetime, not verdicts — a changed score here is a defect in Task 2, not a number to update.

**This command is declared `red-state=live` and passes today.** It is a merge gate, not a RED: its
purpose is that the closeout executes it rather than assuming the swap was verdict-neutral. Recorded
explicitly because a gate command that is green from the start is otherwise indistinguishable from a
red that never worked.

<!-- tasks: end -->

## Checklist

- [ ] Task 1 — constant + derivation test
- [ ] Task 2 — call-site swap + outcome mapping
- [ ] Task 3 — fallback premise
- [ ] Task 4 — full gate green (`pnpm heavy`)
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — `codex-guard --stage plan`
- [ ] Execution handoff

## Out of scope

Everything in spec §10, plus: raising `timeout-minutes` on the nightly (spec §6.6 — a CI-capacity
decision belonging to whoever owns that budget), and enrolling `runner.ts` in the mutation registry
(spec §8 — not enrollable, and enrolling it symbolically is forbidden).
