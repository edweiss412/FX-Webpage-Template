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

**A claim in the previous draft was false and is corrected here rather than quietly dropped.** That
draft asserted `tests/mutation/_metaPremiseContract.test.ts` already covered this arc's premise by
existing membership. It does not: that suite derives its universe from
`GUARD_SURFACES.flatMap((s) => s.suitePaths)` (`tests/mutation/_metaPremiseContract.test.ts:334`), and
the browser rows contribute only `tests/mutation/browser/registry.test.ts` and
`tests/mutation/browser/mutate.test.ts`. A new suite is covered by it only if a registry row lists it,
and this arc adds no registry row (spec §8 — `runner.ts` is not enrollable and `spawnBounded` is
unmodified).

So: **no meta-test governs this arc's new suites, and that is stated rather than assumed.** The
premise discipline here is convention, enforced by review, not by a walker.

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

## Strictly-weaker-implementation pass — one exhaustive sweep over every AC

Anti-tautology asks whether a test can fail at all. This asks a different question: **can it fail for
the RIGHT REASON, or is the fixture set also satisfied by something weaker than what was specified?**
Run as ONE pass over all acceptance criteria, not per finding. For each: the weaker implementation
that would satisfy the naive fixtures, and the fixture that kills it.

| AC | strictly weaker implementation that would still pass | the fixture that kills it |
| --- | --- | --- |
| AC-1 (no `node:child_process` import) | `runner.ts` imports nothing from `node:child_process` but calls a HELPER in another module that spawns unbounded — the import assertion passes while the defect is intact | AC-3's constructed hang: a module that still spawns unbounded cannot time out a hanging child. The behavioral case is what closes the binding case, which is why AC-1 is not asserted on source alone |
| AC-2 (constant + derivation) | the constant is exported and correct but the call site passes `MUTANT_TIMEOUT_MS` — every AC-2 assertion passes and the shipped ceiling is 180 s | spy on `spawnBounded` and call `runChild` with NO explicit ceiling: assert the `timeoutMs` it actually received `=== BROWSER_MUTANT_TIMEOUT_MS`. Asserting the constant's value never proves the call site uses it |
| AC-3 (hang → infra) | throw `MutantRunInfraError` for EVERY child — the hanging case passes | a fast HEALTHY child in the same suite that must NOT throw and must return its numeric exit status. Without this negative case the timeout proof is satisfied by a runner that scores nothing at all |
| AC-4 (cause distinguishability) | emit three arbitrary distinct strings unrelated to what happened — inequality holds | attribution: the timeout cause must be the one produced BY the constructed hang (AC-3's case), and the sentinel cause the one produced by a sentinel-absent child. Inequality alone is satisfied by noise |
| AC-5 (signal + code preserved) | hardcode one signal/code pair into the message — a single-case fixture passes | two cases with DIFFERENT signal/code pairs, each asserted to carry its own values through |
| AC-6 (`perl`-absent fallback still bounded) | **presence is not forwarding** — an implementation that OVERWRITES the direct spawn's ceiling with `MUTANT_TIMEOUT_MS` passes the earlier tasks, the current fallback fixture, an assertion that merely checks `calls[1]!.timeout` is set, and the `perl`-PRESENT closeout gate, while shipping a `perl`-absent browser child the source ceiling instead of the ratified one. See Task 3 for the two probed citations | the task below asserts **caller-value forwarding** — the fallback case passes a distinctive `timeoutMs`, and `calls[1]!.timeout` must equal THAT value, which neither module default can satisfy |
| AC-7 (gate green, 19/19) | none — this is the real gate executing the real surface | n/a: the gate is not a fixture set, which is why it is the closeout gate rather than a task |

**Why this table is derived rather than enumerated.** Its rows are the acceptance criteria themselves,
taken from spec §7 in full — every AC gets a row, so a new AC cannot silently skip the pass. The rule
it defends against is the one plan review round 1 demonstrated on AC-1: a source-substring check was
satisfied by `import { execFileSync as legacyRun }`, an ordinary alias refactor, while the unbounded
call stayed live.

<!-- tasks: depth=2 -->

## Task 1 — the ceiling constant, and a test that pins its derivation

<!-- task: red=`pnpm vitest run tests/mutation/browser/timeout.test.ts` ac=AC-2 -->

**What is red and why — and why it is NOT an unresolved import.** The previous draft made this task's
red an import of a symbol that does not exist, which fails before any assertion runs. That is one of
the fail-open shapes this plan's own RED-form section rejects, and shipping it was the defect plan
review round 1 caught first. The suite instead imports the MODULE — `tests/mutation/browser/runner.ts`
resolves today — and asserts on the exported binding:

```ts
import * as runner from "./runner";
// resolves now; the ASSERTION is what fails, and it fails on the missing export
expect(Object.keys(runner)).toContain("BROWSER_MUTANT_TIMEOUT_MS");
```

The production line that makes it pass is the `export const` below; nothing test-local can turn it
green.

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

**AC-2** is satisfied by assertions that all read the exported constant, never a literal re-declared
in the test:

- the export exists (above), and `BROWSER_MUTANT_TIMEOUT_MS === 660_000`;
- `BROWSER_MUTANT_TIMEOUT_MS >= 10 * MEASURED_HEALTHY_MAX_MS`, where `MEASURED_HEALTHY_MAX_MS = 65_111`
  is a named local carrying the probe path in a comment — this is the derivation, and it fails if the
  number is lowered without a re-measurement;
- `BROWSER_MUTANT_TIMEOUT_MS !== MUTANT_TIMEOUT_MS`, so an import-and-reuse regression reds.

## Task 2 — swap the call site, and prove the ceiling by RUNNING a hanging child

<!-- task: red=`pnpm vitest run tests/mutation/browser/childLifetime.test.ts` ac=AC-1,AC-3,AC-4,AC-5 -->

**What is red and why.** `runChild` still calls `execFileSync` (`tests/mutation/browser/runner.ts:152`),
so a child that exceeds the ceiling is never killed and no timeout-shaped `MutantRunInfraError` is
ever thrown. Authored red: the failing cases arrive with this task.

Replace the `execFileSync` call with `spawnBounded` per spec §5.2 and map per §5.3.

**Two seams, and the ORDER between them is what makes the red honest.** Round 2 established that the
previous draft's red was unproducible: `runChild` is private — it is absent from the export list at
`tests/mutation/browser/runner.ts:44-101` — so a suite calling it with a small ceiling fails on
missing ACCESS, which is the same wrong-reason shape Task 1 was repaired for. This task therefore
lands in three observable steps, and the RED is taken between the second and the third:

1. **Export the seam, unchanged behaviour.** `export function runChild(root, suite, manifestPath,
   timeoutMs: number = BROWSER_MUTANT_TIMEOUT_MS)`. The parameter is accepted and NOT yet used; the
   body still calls `execFileSync`. Every production call site keeps today's arity. Nothing is red
   here and nothing is claimed to be — this step exists so the red can fail for the right reason.
2. **Write the suite and OBSERVE THE RED.** The access and the parameter now exist, so the failure is
   behavioural: with a deciding suite pointed at a command that sleeps **6 s** and a ceiling of
   **2 s**, the unbounded `execFileSync` lets the child run to completion and `runChild` returns
   normally, so the `expect(...).toThrow(MutantRunInfraError)` assertion FAILS. Deliberately an
   assertion failure rather than a hang: the child terminates on its own in 6 s, well inside vitest's
   default case timeout, so the red is fast, deterministic, and cannot be mistaken for an infra stall.
3. **Swap to `spawnBounded` and go green.** The 2 s ceiling now kills the 6 s child and the throw
   arrives.

The production line whose absence makes step 2 red is the `spawnBounded` call itself; nothing
test-local can turn it green.

- **AC-3 — a CONSTRUCTED HANGING CHILD, not an injected outcome.** The previous draft injected
  `{kind:"timeout"}` into a fake spawn seam, which can pass while the real caller never generates
  `ETIMEDOUT` and kills nothing; plan review round 1 rejected it and the spec never permitted it. The
  suite instead points a deciding suite at a real command that sleeps well past a 2000 ms ceiling and
  asserts the call throws `MutantRunInfraError`. What is executed is `spawnBounded` itself, the
  supervisor, and the kill — the whole path, not a stub of it.
- **AC-4 — the throw is ATTRIBUTED to the timeout arm, not merely observed.** `runChild` is not the
  only source of `MutantRunInfraError` in this file: the sentinel/report path throws its own
  (`tests/mutation/browser/runner.ts:227`). "It threw" therefore proves nothing. The assertion matches
  the timeout cause specifically AND asserts it is **not equal** to the signal cause and not equal to
  the sentinel cause — inequality of produced messages, never a literal match on any one of them, so
  re-wording a message cannot silently make two paths identical.
- **AC-1 — asserted at the BINDING level and behaviorally, because a source substring is defeated by
  an ordinary alias.** Plan review round 1 probed exactly this: `import { execFileSync as legacyRun }`
  plus a live `legacyRun(file, args)` passes a bare `execFileSync(` absence check while the unbounded
  call is still there. So AC-1 asserts that `tests/mutation/browser/runner.ts` **imports nothing from
  `node:child_process` at all** — a binding-level property no alias evades, since the module's only
  spawn route becomes `spawnBounded` — and the AC-3 execution above is the behavioral half: a module
  still spawning unbounded cannot make a constructed hanging child time out.
- **AC-5** — a child killed by a signal still reaches the infra path with `signal` and `code`
  preserved.

**Pre-dispatch mutants, results recorded in the task's commit.** Each names the assertion it must
defeat: delete the `timeout` arm and the constructed-hang case fails (AC-3); make the timeout and
sentinel cause strings identical and the inequality assertion fails (AC-4); re-introduce
`execFileSync` under an alias beside the bounded call and the `node:child_process` import assertion
fails (AC-1) — this is the mutant the previous draft's four did not cover; drop `timeoutMs` from the
`spawnBounded` call and the constructed-hang case fails, because the default ceiling no longer yields
to the suite's small value (AC-3).

**The `perl`-absent fallback IS a task again, for a reason round 1 did not have.** Round 1 correctly
killed the previous Task 3: it could not be red in task order, and it duplicated coverage
`spawnBounded` already had. Round 2 then probed that the coverage does not actually exist — the
ceiling is asserted on `calls[0]` only, so a fallback that drops `timeout` from the direct spawn
passes every current fixture and leaves a `perl`-absent hanging child unbounded. That is a breach of
the consequence bound, not a duplicate. Task 3 below closes it with ONE assertion, and its red is
ordinary.

## Task 3 — the `perl`-absent fallback forwards the CALLER'S ceiling

<!-- task: red=`pnpm vitest run tests/mutation/source/spawnBounded.test.ts` ac=AC-6 -->

**What is red and why, and why "timeout is set" is the wrong assertion.** The fallback path's ceiling was found unasserted in the
second plan round, and the obvious repair was found still too weak in the third:
the fallback case in `spawnBounded.test.ts` supplies **no** `timeoutMs`
(`tests/mutation/source/spawnBounded.test.ts:258`), and
the only distinctive caller value in the suite, `4_242`, is asserted solely on `calls[0]`
(`tests/mutation/source/spawnBounded.test.ts:225`). An assertion that `calls[1]!.timeout` is merely
SET is therefore satisfied by an implementation that overwrites the direct spawn's ceiling with
`MUTANT_TIMEOUT_MS` — and that implementation ships a `perl`-absent browser child a 180 s ceiling
instead of the ratified 660 s, silently, past every other gate in this plan including the
`perl`-PRESENT closeout run.

So the assertion is **caller-value forwarding**, on the fallback case specifically:

```ts
spawnBounded(ARGV, { cwd: "/root", env: {} as unknown as NodeJS.ProcessEnv, timeoutMs: 4_242 });
// ...
expect(calls[1]!.timeout).toBe(4_242); // the CALLER's value reached the DIRECT spawn
```

The distinctive value is what discriminates: it is neither `MUTANT_TIMEOUT_MS` nor
`BROWSER_MUTANT_TIMEOUT_MS`, so an overwrite by either constant fails, and so does an omission.

**Two pre-dispatch mutants, both recorded in the task's commit with before/after**, because they are
the task's entire justification:

1. drop `timeout` from the fallback `spawnSync` options — the new assertion fails (round 2's shape);
2. replace the fallback's `timeout` with `MUTANT_TIMEOUT_MS` — the new assertion fails (round 3's
   shape), where an assertion checking only presence would have passed.

Both mutants are reverted after being observed. On unmutated `main` the assertion passes immediately,
which is stated plainly rather than dressed as a red: **this task closes a coverage hole, and its
evidence is the two mutants the new assertion kills and the old fixtures did not.** Round 3 also
confirmed the enrolled operator set cannot generate either object-option mutation, so no mutation
score would have caught them.

**This changes a SUITE, not the `spawnBounded` module.** Spec §8's rule — a repair that modifies
`spawnBounded.ts` makes that surface's score the convergence criterion — is not triggered: the source
file is untouched, and a strengthened suite can only raise its score. `pnpm mutation:guards` is
therefore not required, and no score is claimed.

<!-- tasks: end -->

## Closeout gate — OUTSIDE the task region, deliberately

`pnpm heavy pnpm mutation:browser`, run at closeout. **It is not a task and carries no `red=`.** It is
green on the current tree (measured twice, probe §1) and must still be green after the swap; a
knowingly-green command inside the enrolled task region misrepresents the red-then-green contract,
which is what plan review round 1 found. Declaring it here keeps the obligation to RUN it without
dressing it as a RED.

`pnpm heavy` is mandatory — the gate spawns a real Playwright child per mutant, and roughly nine
concurrent arcs exhausted this machine's memory once already. `FX_HEAVY_SLOT_DIR` is never set.

**AC-7** acceptance: the gate suite passes in full, exit 0, `tapTargetFloor` still 19/19 with an empty
ledger. The swap changes lifetime, not verdicts — a changed score is a defect in Task 2, not a number
to update. **Collection is proved by running it and reading the output**, never by `spec:lint`.

- The plain invocation makes NO collection claim: `synthesizeCollectionFindings` returns `[]` when no
  probes ran (`lib/specLint/redContract.ts:754`).
- Under `--exec-red` the arm is silent for anything wrapped in `pnpm heavy`:
  `collectionProbePlan` continues past it (`lib/specLint/redContract.ts:721`).

AGENTS.md mandates `pnpm heavy` for every heavy phase, so that arm cannot see the class the repo
requires wrapping — which is why this gate's collection is proved by execution.

## Checklist

- [ ] Task 1 — constant + derivation test
- [ ] Task 2 — call-site swap, executed hanging-child proof
- [ ] Task 3 — fallback ceiling assertion
- [ ] Closeout gate — full gate green (`pnpm heavy`)
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — `codex-guard --stage plan`
- [ ] Execution handoff

## Out of scope

Everything in spec §10, plus: raising `timeout-minutes` on the nightly (spec §6.6 — a CI-capacity
decision belonging to whoever owns that budget), and enrolling `runner.ts` in the mutation registry
(spec §8 — not enrollable, and enrolling it symbolically is forbidden).
