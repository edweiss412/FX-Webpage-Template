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

AC-1 through AC-18 of the spec's §7 table. Each AC row already names the strictly weaker implementation it kills; the tasks below inherit those killers rather than restating them, and **a task is not done until the killer named in its AC row is demonstrably killed by a shipped test.**

**THE PLAN DOES NOT RESTATE AC CONTENT — that is a structural decision, taken after the same class was found twice.** Review rounds 1 and 2 each found tasks whose prose restated an approved AC more WEAKLY than the spec's row: a lower bound without its upper bound, a retention rule without its exceed-the-cap clause, a `passed` check without its score half, an invalid-input list missing a member. Every instance came from the same act — paraphrasing an approved requirement into a task body — so the repair removes the act rather than the instances. **Each task below names the AC it discharges and states ONLY what is task-specific: what its red rests on, which surface it runs against, and where it sits in the order. The assertion list is the spec's AC row, which is normative and is not duplicated here.** A task body that appears to enumerate assertions is a defect in this plan, not a specification.

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
| `tests/mutation/browser/runner.ts` | `children: []` at its one `MutantOutcome` construction site | no |

**The browser row is NOT a scope widening — it is the touched set being complete.** `tests/mutation/browser/**` consumes both changed types and was absent from an earlier draft of spec §5.6, which now carries the per-file probe. The enrolled file there (`tests/mutation/browser/mutate.ts`, `browserMutate`, floor 1) only CONSUMES `MutantOutcome` and constructs none, so it needs no edit and **its score is not retired**; only the non-enrolled `tests/mutation/browser/runner.ts` constructs one. `GateInput.outcomes` is OPTIONAL precisely so the remaining call sites — including the committed, evidentiary probe scripts — stay untouched.

**`tests/mutation/source/spawnBounded.ts` is NOT touched** — enrolled at `tests/mutation/source/registry.ts:2663`, `scoreFloor: 1`, measured 12/12. Editing it would retire that score for no gain.

## Global constraints

1. **No verdict, score, denominator or pass/fail outcome may move.** `classify` is untouched; `passed` stays computed from `failures` alone. **Task 8** proves it by measurement rather than by assertion. (Named as well as numbered: the no-movement re-capture. A derived sweep of every `Task N` cross-reference against the actual task headings was run after the renumbering and reports this as the only stale one.)
2. **The record is additive.** A record-write failure reports on stderr and never reds a gate (AC-14).
3. **Never write an AC whose red depends on a SURVIVOR appearing unless a declared operator can express the defect.** A perfect score with an empty survivor set has coexisted with a live defect class on a sibling surface precisely because no declared operator could generate it; a red resting on a survivor that no operator can produce is a red that can never fire.
4. **Every red is a VALUE assertion and an expect-a-REPORT case.** A red that passes because something is missing is not a red.
5. **Heavy phases run under `pnpm heavy`.** The full-gate runs are **Task 1 and Task 8** — the before and after captures — and both are heavy by the transitive-shape rule. (Stated by name as well as number: the base capture and the no-movement re-capture. An earlier draft said "Tasks 1 and 7" and the renumbering left it pointing at the scoped workflow test, which would have run the changed-tree mutation measurement outside the semaphore.)
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

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:28` why=`MutantOutcome is declared {siteId, verdict} at the line named here, so runSurface has nowhere to record a child and the exit code is consumed inline at :165 and discarded. Step 1 authors the AC-4 assertions against a SURVIVOR on a surface with more than two deciding suites. Step 2 observes them red as VALUE assertions - the shipped outcome exposes no children field, so the observed suite array is undefined against a populated expectation. Step 3 adds ChildRecord and threads it through runSuite, runAllSuites and runSurface; Step 4 re-runs the SAME command green` ac=AC-4 -->

Discharges **AC-4**. Adds `ChildRecord` and `MutantOutcome.children` (spec §5.1): every child actually run, in execution order, rather than a `decidedBy` summary — the deciding child is derivable as the last one and the reverse is not true.

Runs against a surface with MORE THAN TWO deciding suites (the registry's largest declares ten, `tests/mutation/source/registry.ts:232`).

**AC-5 is deliberately NOT in this task's red.** The shipped `runAllSuites` already short-circuits (`tests/mutation/source/runner.ts:134`), so a spawn-count assertion is green before any implementation lands and cannot be a red. It moves to Task 2b.

## Task 2b: the short-circuit is pinned against a mutant, because it already holds

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:134` why=`the loop at the line named here ALREADY returns on the first non-zero code, so AC-5's spawn-count assertion is true of the shipped source and cannot red by being authored. A non-regression pin whose red cannot be observed is exactly the shape this contract rejects, so its red is authored against a NAMED MUTANT IN the production surface: Step 2 deletes the early return at the line named here, so the loop runs every declared suite, and the spy then records invocations for suites after the deciding one - a VALUE assertion failing on the observed invocation list. Step 3 restores the shipped early return and Step 4 re-runs the same command green. This is the same technique the premiseScan plan used for its over-narrowing pin` ac=AC-5 -->

Discharges **AC-5**, whose assertions — both the suite-1 kill and the later-suite kill — are the spec's row and are not restated here.

The pin matters because Task 2 makes children observable: without the short-circuit, children are recorded AFTER the deciding event, which falsifies "the deciding child is the last one" that spec §5.1 relies on and can attach a later timeout to a mutant whose verdict was already settled.

## Task 3: the timeout arm becomes reachable, and durations are real

<!-- task: red=`npx vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:110` why=`runSuite hardcodes timeoutMs to MUTANT_TIMEOUT_MS at the line named here, so a ceiling passed by a caller is IGNORED. Step 1 authors the AC-1, AC-2, AC-3 and AC-15 assertions in full as the spec states them. Step 2 observes the discriminating one red on a NUMBER: a deliberately hanging fixture run with a 2000ms ceiling injected records a durationMs of roughly 180000 against a 10000 bound, because the hardcoded ceiling ignores the injected value. The timeout KIND is deliberately not the discriminator - a hanging child reports kind timeout under both the shipped and the repaired code - but the kind, the null exitCode and the at-or-above-ceiling bound are all still ASSERTED, because AC-1 requires the whole tuple and a correctly timed but wrongly spelled record must fail. Step 3 adds the optional ceiling parameter defaulting to MUTANT_TIMEOUT_MS so every existing call site is unchanged by construction; Step 4 re-runs the same command green` ac=AC-1,AC-2,AC-3,AC-15 -->

Discharges **AC-1**, **AC-2**, **AC-3** and **AC-15**, whose assertions are the spec's rows and are not restated here.

**What is task-specific:** the red rests on `durationMs`, not on `kind`, because a hanging child reports `kind: "timeout"` under both the shipped and the repaired code and only the duration can discriminate. The full evidence tuples of AC-1 and AC-2 are still asserted — the discriminating assertion and the required assertion set are different things, and this task ships both.

**AC-3 is the no-blast-radius guarantee** and is asserted rather than assumed.

## Task 4: the gate reports a timeout kill, on a run that stays green

<!-- task: red=`npx vitest run tests/mutation/source/gate.test.ts` red-state=authored red-target=`tests/mutation/source/gate.ts:34` why=`GateResult is declared {passed, failures, score} at the line named here, with no channel for a non-failing observation. Step 1 authors the AC-6 assertions in full as the spec states them, over a run carrying THREE timed-out mutants among others. Step 2 observes them red as VALUE assertions: the shipped GateResult exposes no notices, so the derived triple set is empty against a three-element expectation. Step 3 adds GateNotice with structured fields and populates it; Step 4 re-runs the same command green` ac=AC-6 -->

Discharges **AC-6**, whose assertions — including the notice cardinality, the field-by-field equality, and BOTH unchanged halves, `passed` and `score` — are the spec's row and are not restated here.

**What is task-specific:** three timed-out mutants rather than one, because a single-timeout fixture is satisfied by an implementation emitting at most one notice globally; and the unchanged halves are asserted AFFIRMATIVELY rather than by equality against a peer run, because equality holds when a pre-existing failure makes both runs `false`.

## Task 4b: the console channel emits a timeout notice

<!-- task: red=`npx vitest run tests/mutation/source/gate.test.ts` red-state=authored red-target=`tests/mutation/source/surfaceCases.ts:28` why=`surfaceCases runs a surface at the line named here and prints nothing on a passing run, which is the condition probe 1 measured - a passing gate output is the empty string. Spec section 5.2 declares TWO emission channels and Task 4 proves only the structured field, so without this task an implementation that never writes to the console satisfies every other test while contradicting the spec. Step 1 authors assertions that the captured console output identifies the emission as a TIMEOUT and carries that mutant's site, suite and duration - not merely that some site id appears, which logging every mutant would satisfy - on a PASSING run and again on a FAILING one, since section 5.2 requires both. Step 2 observes them red: nothing is written, so the captured output is empty against a populated expectation. Step 3 emits notices at module scope after the run; Step 4 re-runs the same command green` ac=AC-6 -->

The console half of spec §5.2's two channels, emitted at module scope so notices appear whether the gate passed or failed.

**What is task-specific:** the assertion identifies the notice as a TIMEOUT and checks its fields. "The output contains the site id" is satisfied by logging every mutant, and "on a passing run" alone is satisfied by an implementation that logs only when the gate passes — §5.2 requires both directions.

## Task 5: the durable per-run sink

<!-- task: red=`npx vitest run tests/mutation/source/records.test.ts` red-state=authored red-target=`tests/mutation/source/surfaceCases.ts:28` why=`surfaceCases runs a surface at the line named here and writes no artifact anywhere, so a passing leg leaves nothing behind - the blind spot spec section 1.0 measures. Step 1 authors the AC-12, AC-13, AC-14, AC-16 and AC-17 assertions in full as the spec states them, including AC-14's unchanged-score half and AC-17's requirement that the retention cap be EXCEEDED and the oldest records observed removed. Step 2 observes them red - no record file exists, so each case reports an absent artifact against a populated expectation. Step 3 adds the records module and calls it from surfaceCases; Step 4 re-runs the same command green` ac=AC-12,AC-13,AC-14,AC-16,AC-17,AC-18 -->

Discharges **AC-12**, **AC-13**, **AC-14**, **AC-16**, **AC-17** and **AC-18**, whose assertions are the spec's rows and are not restated here. AC-18 pins the sink's ADDRESSING and ISOLATION — the filename carrying both surface id and run discriminator, and `MUTATION_RECORD_DIR` redirecting the set — which the other record ACs leave free and which a determinism run sharing a directory with a gate run would otherwise corrupt.

**What is task-specific:** **AC-16 is the row that decides this task** — run a surface, run it AGAIN, assert both records persist. **AC-17 also fails on a latest-only overwriter**, since a surviving immediately-previous run is impossible when each write destroys its predecessor; an earlier draft called AC-16 "the only one that can fail on overwrite", which contradicts the normative AC-17 row. The accurate statement is that AC-11 to AC-14 are each satisfied by an overwriting file and AC-16/AC-17 are not. That is exactly the sequence `BACKLOG.md:108` instructs an operator to perform before acting on a stale-row report, so **the AC executes the documented operator procedure**, which is what closes the tool-versus-document loop. Every other record AC is satisfied by a file that has just overwritten its predecessor.

## Task 6: the determinism harness core

<!-- task: red=`npx vitest run tests/mutation/source/determinism.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:141` why=`runSurface at the line named here runs every generated mutant exactly once and offers no per-site repetition, which is why a new module is required rather than a caller. Step 1 authors the suite AND a declared STUB module whose core returns an empty result set and refuses nothing - the stub is written in this step so the import resolves and the red is a VALUE assertion rather than a module-resolution failure - covering the AC-8 and AC-9 assertions in full as the spec states them, on BOTH a surface with more than two deciding suites AND the single-suite psqlStartupScan site the spec names, and including a case that induces the zero-completed-runs condition after validation passes and asserts the abort rather than an empty distribution. Step 2 observes them red against the stub: zero results against N, absent distributions, and no refusals where exit code 2 is expected. Step 3 implements the core; Step 4 re-runs the same command green` ac=AC-8,AC-9 -->

Discharges **AC-8** and **AC-9**, whose assertions — the full invalid-input complement, the exit code, the per-suite records, the distributions, and the PROVENANCE requirement that the before/after stamps be derived from the run's actual inputs and DIFFER when a stamped input changes — are the spec's rows and are not restated here.

**What is task-specific:** the stub is authored in step 1 so the red is a value assertion rather than a resolution failure; both a >2-suite surface AND the single-suite site are exercised, because either alone leaves a shape untested; and the zero-completed-runs abort is INDUCED by a case rather than asserted in prose, since a stub that returns nothing fails the positive case without ever reaching the abort path.

**AC-9 means the assertions decide IN-PROCESS.** A CLI-shaped surface would score as if untested — the runner overlays modules in memory and a spawned `tsx` child reads from disk.

## Task 6b: the adapter carries what the core produced

<!-- task: red=`npx vitest run tests/mutation/source/determinism.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:141` why=`Task 6 proves the CORE only, so a correct core behind a lossy adapter satisfies it, and the shipped harness has no operator-facing path at all because runSurface at the line named here takes a whole surface. Step 1 authors the assertions AND extends the Task 6 stub with a declared STUB adapter that prints nothing - written in this step so the red is a VALUE assertion on captured output rather than the missing-surface shape Task 6 already repaired. The assertions render a FIXED result object through the adapter and compare the captured stdout against THAT SAME object, field by field. They deliberately do NOT invoke the core a second time and compare two executions: durationMs is nondeterministic on this harness - the arc's own probe record measures a mutant maximum moving from 19.8s to 39.1s on byte-identical inputs - so a field-equality assertion across two runs is flaky by construction and would be asserting the negation of this arc's own finding. They further assert an invalid runs value exits 2 through the adapter. WIRING is proved separately from RENDERING: a spy stands in for the core, returns a known result, and the assertions require BOTH that the executable entry actually CALLED it with the operator's arguments AND that the captured stdout renders that returned result - because a correct renderer and validator in front of an entry that never invokes the core, or that prints fabricated output, satisfies a rendering-only proof while the operator-facing command reports nothing the core produced. Step 2 observes them red against the stub adapter: captured stdout is empty against a populated expectation. Step 3 implements the adapter and the package script; Step 4 re-runs the same command green` ac=AC-8 -->

The CLI adapter and its `package.json` script.

**What is task-specific:** the adapter renders a FIXED result object and is compared against THAT object, field by field — not against a second invocation of the core. Two executions with identical arguments are NOT field-equal here, because `durationMs` is exactly the quantity this arc measured swinging 19.8 s to 39.1 s on byte-identical inputs; an assertion demanding equality across runs would be flaky by construction and would contradict the arc's own result. Comparing a rendering against its source object keeps the lossiness check (children, distributions, stamps) without importing the nondeterminism. **Rendering fidelity and WIRING are proved separately**: a spy standing in for the core proves the executable entry actually invokes it with the operator's arguments, because a correct renderer in front of an entry that never calls the core — or that prints fabricated output — passes every rendering-only assertion while `pnpm mutation:determinism` reports nothing the core produced. And the adapter is STUBBED in step 1 for the same reason the core was: an absence-based red is the shape Task 6 already repaired.

## Task 7: the workflow uploads what the leg produced

<!-- task: red=`npx vitest run tests/mutation/source/records.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:170` why=`the source-shards job uploads only elapsed.txt at the line named here, so a records directory written into that workspace dies with it and the CI half of the record does not survive - rebuilding the blind spot spec section 1.0 measures. Step 1 authors a VALUE assertion that PARSES the workflow and asserts the records upload step is a step OF THE source-shards JOB by resolved job name, with if always, with the path the spec's sink contract names, and with an artifact name carrying the matrix shard so the four workspaces cannot collide on one constant. Step 2 observes it red: the source-shards job step list contains no records upload, so the resolved step is undefined against a populated expectation. Step 3 adds the step; Step 4 re-runs the same command green` ac=AC-11 -->

Discharges **AC-11**'s workflow half; Task 5 discharges the record-exists half, so neither task depends on the other's later work to go green.

**What is task-specific:** the parser resolves the JOB rather than searching the file — the same step under `source-gates` would satisfy a file-scoped check while all four shard workspaces are still discarded — and it pins the uploaded PATH and a shard-scoped artifact NAME, because a step uploading the wrong file, or four matrix jobs colliding on one constant name, otherwise passes.

<!-- tasks: end -->

## Task 8: no enrolled surface moved (measurement, no red)

Re-capture the Task 1 comparison set on the CHANGED tree and assert the `siteId -> verdict` projections are EQUAL. `runner.ts` is shared by EVERY enrolled surface, so `spawnBounded`'s blob being unchanged proves nothing about any of the others.

**No red, and deliberately so.** This is the same measurement as Task 1 taken on the other side of the change; an authored red here would be pre-satisfied by Task 2 (a `siteId -> verdict` projection ignores `children` and is green the moment the field exists) and has no implementation that could legitimately turn it green. It is a GATE on the diff, not a TDD cycle.

**Two limits stated rather than papered over.** Every enrolled surface OUTSIDE the named comparison set is covered by ARGUMENT — the change is in a shared path exercised identically by all of them — not by measurement. And a base-vs-base disagreement in Task 1 voids AC-10 rather than being averaged in.

Discharges **AC-10**.

## Task 9: ledger closeout

ONE commit, BEFORE whole-diff review (invariant 12 as ruled): file any peer rows, archive `BL-MUTATION-SCORE-NONDETERMINISM` with the arc's findings recorded on it — including the measured **0 of 93** timeout count (**AC-7**) and the five measurements that declined to support the duration hypothesis — and remove the in-progress marker. Then re-verify set arithmetic: union of `BL-`/`DEF-` ids exact, `comm -12` archived-versus-open empty, in-progress marker count zero.

## 12. Close-out

- Whole-diff cross-model review to APPROVE after the ledger commit.
- Real CI green, read sha-keyed with `(.check_runs|length) == .total_count` asserted.
- `impeccable-gate: N/A — no UI surface`.
- Round-economy filing if any stage reaches four counted rounds. **The spec stage reached five** (11, 9, 7, 4, 1), so the arc's round-corpus filing at `docs/review-rounds/fix/mutation-score-nondeterminism/c80f844278bd.md` is owed a `## spec — 5 rounds` heading with `**Examined:**` and at least one of `**Mechanizable:** / **Judgment:** / **Infra:**`.
