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

## Class sweep — authored AND RUN, and the first attempt was UNSOUND

The class is "a mutation-harness child spawned with no lifetime bound." The cover is the **walk root
plus the call shape**, never an identifier.

**The first version of this sweep excluded real members of the class before inspecting them**, and
the fourth plan round caught it. It piped through `grep -v '\.test\.ts'` while claiming walk-root
coverage — so it could not have proved "one unrepaired member," because the filter removed candidates
by filename before any hit was read. A confident clean result from an unsound method is
indistinguishable from a real one at the point of authorship, which is exactly why the method and not
the output is what has to be defensible. The exclusion is removed:

```
$ rg -n 'execFileSync\(|spawnSync\(|\bspawn\(' tests/mutation/
tests/mutation/browser/runner.ts:152          execFileSync(file, args, {...})
tests/mutation/browser/overlayWiring.test.ts:48    execFileSync(process.execPath, [BUNDLE, ...])
tests/mutation/browser/overlayWiring.test.ts:97    execFileSync("mkdir", ["-p", decoyDir])
tests/mutation/browser/overlayWiring.test.ts:123   execFileSync(process.execPath, [probe, manifest])
tests/mutation/browser/overlayWiring.test.ts:152   execFileSync("pnpm", ["exec","vitest","run",...])
tests/mutation/source/spawnBounded.ts:147,149      spawnSync(...)  <- the bounding mechanism itself
tests/mutation/source/spawnBounded.live.test.ts    spawn/spawnSync  (live-integration suite)
tests/mutation/source/runner.test.ts:220,256       real.spawnSync / real.execFileSync
tests/mutation/source/premiseScan.test.ts          ~90 hits, ALL of them fixture STRINGS
```

**Per-hit disposition — every hit, not a summary:**

| site | disposition |
| --- | --- |
| `tests/mutation/browser/runner.ts:152` | **the filed defect.** Task 2 |
| `tests/mutation/browser/overlayWiring.test.ts:152` (`runFixture`) | **IN CLASS, repaired by Task 4.** Spawns a full `pnpm exec vitest run` with no `timeout`; if that child wedges the wiring suite hangs indefinitely — the same shape, the same tree, inside the threat fence |
| `tests/mutation/browser/overlayWiring.test.ts:48` and `tests/mutation/browser/overlayWiring.test.ts:123` | **IN CLASS, repaired by Task 4.** Node bundle and probe children; terminating in practice, unbounded by construction |
| `tests/mutation/browser/overlayWiring.test.ts:97` | **IN CLASS, repaired by Task 4.** `mkdir -p` terminates trivially, but it is bounded for uniformity rather than argued about — a per-site judgement call is how the next one gets missed |
| `tests/mutation/source/spawnBounded.ts:147` and `tests/mutation/source/spawnBounded.ts:149` | **not a member** — this IS the bounding mechanism; both calls carry `spawnOptions.timeout` |
| `tests/mutation/source/spawnBounded.live.test.ts` | **not a member** — the live-integration suite deliberately spawns unbounded, detached and orphaned trees as its FIXTURES; bounding them would delete the property under test |
| `tests/mutation/source/runner.test.ts:220` and `tests/mutation/source/runner.test.ts:256` | **not a member** — both construct deliberate timeout/hang fixtures for the source harness's own ceiling; the second is a 600 s sleep whose whole purpose is to be killed |
| `tests/mutation/source/premiseScan.test.ts` (~90) | **not members** — every hit is a source string inside a fixture template, never an executed call. Read individually; a pattern tight enough to exclude them by shape would have been tight enough to miss a real site |

**The table above is EVIDENCE, not the cover.** A committed list re-opens the moment someone adds a
spawn site — the enumeration failure the class-sweep rule names by name, and the reason this sweep was
wrong the first time. Task 5 turns it into a derived guard: the sweep runs, and every line it returns
must map to a disposition row or the guard fails. A new spawn site then fails by default instead of
silently joining the uncovered set.

**No peer is deferred, so no `BL-` filing is owed** — the four in-class test-harness sites are repaired
in this branch by Task 4 rather than filed, which is the class-sweep default: the marginal cost of
instances 2..N while already holding the context is near zero.

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

**Second pass over the SAME fixtures: is any of them neutralized by another rule in this spec?**
A fixture can be sound in isolation and stop discriminating once the whole rule set runs — the likely
culprits are rules that operate BETWEEN cases rather than within one. Run exhaustively, not per
finding:

| AC | neutralized by another rule? |
| --- | --- |
| AC-1 | no — nothing else in the set constrains this module's imports |
| AC-2 | **nearly.** AC-3 always passes an EXPLICIT small ceiling, so it can never exercise the default. AC-2's spy case must therefore call with NO explicit ceiling; if it were folded into AC-3's construction the default path would go untested and a call site passing `MUTANT_TIMEOUT_MS` would ship |
| AC-3 | no |
| AC-4 | no — its discriminator is inequality across three causes, which no other rule collapses |
| AC-5 | no |
| AC-6 | **YES, and this is the instance that proves the pass is worth running.** The closeout gate runs with `perl` PRESENT, so it never exercises the fallback: an implementation that overwrites the direct spawn's ceiling passes every other criterion and the gate, and only a fixture asserting caller-value forwarding on `calls[1]` discriminates it. Found by review, not by this table |
| AC-7 | n/a — the gate is not a fixture set |

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

<!-- plan-fences: ignore UNIMPORTED_IDENTIFIER — `expect` is vitest's own global under this repo's config; the fragment is the body of a case inside a new suite, not a standalone module -->

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
   assertion failure rather than a hang: the child terminates on its own in 6 s, so the red is fast,
   deterministic, and cannot be mistaken for an infra stall.

   **Corrected at implementation time — the original sentence said "well inside vitest's default case
   timeout", which implied a backstop that cannot exist here.** Both `execFileSync` and `spawnBounded`
   spawn SYNCHRONOUSLY, blocking the test thread, so vitest cannot fire a per-case timeout until the
   call returns — the outer layer is unreachable exactly when the inner one is stuck. What makes this
   red fast is the child terminating on its own, not any timeout catching it. Observed: 16.25 s for
   the whole suite before the swap, 5.7 s after.
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

## Task 4 — bound the sweep's peer spawn sites

<!-- task: red=`pnpm vitest run tests/mutation/browser/overlayWiring.test.ts` ac=AC-8 -->

**What is red and why.** The four `execFileSync` calls in `tests/mutation/browser/overlayWiring.test.ts`
(four sites: 48, 97, 123, 152) pass no `timeout`, so each can hang the suite indefinitely — line 152
spawns a full `pnpm exec vitest run`. Add an assertion that every `execFileSync` options object in
that file carries a `timeout`, and it fails on the current tree because none does.

**AC-8** — every spawn in `tests/mutation/browser/overlayWiring.test.ts` carries an explicit
`timeout`. The value is a suite-local constant, NOT `BROWSER_MUTANT_TIMEOUT_MS`: these are wiring
children, not mutant children, and reusing the ratified ceiling here would imply a derivation that the
probe does not support.

**Strictly weaker implementation:** bound only line 152, the one review named, and leave the other three
— which is per-instance whack-a-mole and is what the class-sweep rule exists to prevent. **Killed by**
asserting over EVERY `execFileSync` options object in the file rather than a named line, so a site
added later fails by default.

## Task 5 — make the disposition cover DERIVED, so a new spawn site fails by default

<!-- task: red=`pnpm vitest run tests/mutation/_metaSpawnDisposition.test.ts` ac=AC-9 -->

**What is red and why.** No guard exists, so the sweep's cover is a static list in a markdown file and
nothing notices when it goes stale. The new suite walks `tests/mutation/` itself, collects every spawn
call site, and asserts each one maps to a disposition row. It reds on the current tree because the
registry of rows does not exist yet; the production line that makes it pass is that registry.

**AC-9** — every spawn site under `tests/mutation/` maps to exactly one disposition row, and an
unmapped site fails the guard.

Shape, so the guard cannot repeat the defect it exists to prevent:

- **The walk is the cover.** The suite walks the directory tree from `tests/mutation/` with `readdir`
  and matches the call SHAPE (`execFileSync(`, `spawnSync(`, `spawn(`). It does **not** take a
  filename filter, and it does not take a list of files to check — a guard given the list it is
  meant to derive proves nothing.
- **Rows may be keyed by file OR by `file:line`.** A file-keyed row carries a reason that applies to
  every hit in it (`premiseScan.test.ts` — all hits are fixture strings inside templates;
  `spawnBounded.live.test.ts` — unbounded spawns ARE the property under test). A line-keyed row
  disposes of one site. Both forms are checked; neither is assumed.
- **Failure is by NAME.** An unmapped hit fails with its `file:line` and the matched text, so the
  repair is obvious rather than a hunt.
- **The registry lives in the suite, not in the plan.** Markdown cannot be executed, and a table a
  guard does not read is decoration.

Derivation command, printed so the guard's claim is reproducible by hand:

```
rg -n 'execFileSync\(|spawnSync\(|\bspawn\(' tests/mutation/
```

**Strictly weaker implementation:** assert only that the registry's rows all still resolve to real
sites — a direction check that passes while a NEW undispositioned site sits uncovered, which is the
enumeration failure wearing a guard's clothes. **Killed by** asserting the other direction as the
primary one: every SWEPT hit must map to a row. Both directions are asserted, and the swept-to-row
direction is the one that fails on a new site.

**Premise, stated executably** (`tests/_shared/premise.ts`): the walk found at least one spawn site.
A guard whose walk silently returns nothing passes vacuously and would forever — the exact shape
`BL-GUARD-PREMISE-REACHABILITY` records.

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
- [ ] Task 4 — bound the sweep's peer spawn sites
- [ ] Task 5 — derived disposition guard
- [ ] Closeout gate — full gate green (`pnpm heavy`)
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — `codex-guard --stage plan`
- [ ] Execution handoff

## Out of scope

Everything in spec §10, plus: raising `timeout-minutes` on the nightly (spec §6.6 — a CI-capacity
decision belonging to whoever owns that budget), and enrolling `runner.ts` in the mutation registry
(spec §8 — not enrollable, and enrolling it symbolically is forbidden).
