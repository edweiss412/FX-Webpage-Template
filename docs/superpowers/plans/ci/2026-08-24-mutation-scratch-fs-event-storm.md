# Mutation scratch filesystem-event storm — implementation plan

**Spec:** `docs/superpowers/specs/ci/2026-08-24-mutation-scratch-fs-event-storm-design.md`
**Row:** `BL-MUTATION-SCRATCH-FS-EVENT-STORM` · **Branch:** `fix/mutation-scratch-fs-event-storm`

impeccable-gate: N/A — no UI surface

## 1. Scope, derived rather than enumerated

A file is in scope if it **creates scratch roots** and is named in some enrolled surface's `suitePaths` — so a mutant loop re-runs it.

**"Creates roots" and NOT "registers no removal", and the difference is load-bearing.** An earlier draft defined the subject set by the absence of cleanup, which is the one predicate Task 1 falsifies for every member: the set would empty out as the repair landed, the guard would pass over nothing, and the same command could not go green for the reason it went red. Creating roots stays true after the repair — the six still create them, they simply no longer leak them — so the subject set is fixed and only the assertion flips.

Run at plan time over `git ls-files tests/`: 108 files create scratch directories, **62 register no `rmSync` anywhere** (117 call sites). Six of those are named by an enrolled surface:

| roots per suite-set run | suite set | surfaces |
| ---: | --- | --- |
| 150 | `tests/log/mutationSurface/enumerate.test.ts`, `tests/log/mutationSurface/totality.test.ts` | mutationSurfaceEnumerate, mutationSurfaceTotality |
| 46 | `tests/styles/interactiveScanCore.test.ts` (+2 in set) | interactiveScanCore |
| 30 | `tests/ci/_metaModalWaitHelper.test.ts`, `tests/ci/_metaModalWaitCandidateV2.test.ts` | modal-wait-helper-scan, modal-wait-disposition |
| 4 | `tests/styles/_metaControlOutlineFill.test.ts` | controlOutlineScan |

**IMPLEMENTATION FOUND EIGHT, not six, and the two extra are the behavioral guard's clearest vindication.** `tests/cross-cutting/psqlStartupFileSuppression.test.ts` and `tests/docs/interactionTimingScan.test.ts` clean up correctly on a passing run and leak specific roots when a case FAILS, because the root is created BEFORE the `try` whose `finally` removes it — a text scan sees an `rmSync` in those files and stops looking. They were invisible to the plan-time census, which was textual, and were found the moment the failure arm ran. Repaired in-branch: "same defect, different file" is never a reason to defer, and the marginal cost of two more was minutes.

**All eight get cleanup, and cleanup is the whole repair here.** Root reuse — which would apply only to the two suites that import `interactiveScanCore`, worth 50 of the 230 roots created per run — is split out to `BL-MUTATION-SCANNER-CACHE-INVALIDATION` by orchestrator ruling. The other four build throwaway repository roots whose paths are SEMANTIC (a per-case e2e spec path under `tests/e2e/`, module locations, `use server` files) and are part of what those suites assert, so they were never reuse candidates anyway. Cleanup covers all six and stops the leak entirely; what it does not do is reduce the number of roots CREATED, which is the successor row's job.

Roots per SUITE-SET RUN is the only unit stated, here and in the spec. No per-pass product, percentage or rate appears in this plan: spec §1.3 records why (`runSuiteRecorded` returns on the first nonzero suite, `tests/mutation/source/runner.ts:221`, so a multi-suite surface does not run every suite for every mutant, and `bail: 1` truncates inside a suite as well). Three spec rounds returned an arithmetic finding against such a product and a fourth returned another; the plan does not reopen that axis.

**Peers, filed not fixed:** the other 56 files (106 call sites) create roots without removing them but are named by no enrolled surface, so no mutant loop multiplies them. Largest is `tests/reviewRounds/report.test.ts` at 34 call sites. Disposition reason **(c)** — the repair spans enough sites to blow the review scope, and a guard over the whole test tree is a new surface needing its own enrolment and convergence criterion. Explicitly NOT "same defect, different file", which the disposition rule says is never sufficient alone; the boundary is amplification by a mutant loop.

## 2. Meta-test inventory (mandatory declaration)

- **CREATES** the cleanup guard, a new file under `tests/mutation/` (path in the fence below; it is not cited inline because a citation to an absent path is a hard lint failure).

  ```
  tests/mutation/_metaScratchRootCleanup.test.ts   (new)
  ```

  **Two arms, because one cannot do both jobs.** The BEHAVIORAL arm runs each subject suite-set in a child with an isolated `TMPDIR` and asserts three things, not one: the child **exited 0** (so a collection failure or a missing import cannot pass as cleanliness), the child **created at least one root** (the subject's defining capability, asserted rather than assumed), and **every path it created is gone afterward**.

  Asserting the property directly is what makes this total: a "does the file contain `rmSync`" check is satisfied by an `rmSync` for something else, and any text recognizer over test source ratchets one spelling per round. Cost is measured — the four sets run in 1.9 + 1.7 + 3.0 + 1.7 = 8.3 s.

**The mechanism was prototyped rather than described, and the spike killed two designs before the plan could commit to them.** (a) Watching the isolated `TMPDIR` on a `setInterval` while the child runs reports zero every time — `spawnSync` blocks the event loop, so the sampler never fires. Creation is instead counted by the same `mkdtempSync` preload the committed probe uses. (b) "The directory is empty afterward" is the wrong assertion: a child that could not even COLLECT still left one entry, because vitest creates its own temp. The guard therefore records the exact paths created and asserts each no longer exists, which is immune to that baseline noise.

Measured on the current (unrepaired) tree, with a negative control:

```
controlOutline     exit=0 created= 4 residue= 5
modalWait          exit=0 created=30 residue=31
CONTROL(nocollect) exit=1 created= 0 residue= 1   <- rejected by BOTH assertions
```

Residue exceeds `created` by exactly the one vitest entry in each case, which is what (b) is about. The control is what makes the other two rows evidence: without it, "residue is 0" could be reported by a child that never ran — total over "removes what it makes", with nothing for a recognizer to widen. The MEMBERSHIP arm is a cheap static check that every enrolled deciding-suite file calling `mkdtempSync` appears in the behavioral arm's subject list. That second arm IS a text scan, deliberately, and its claim is only "this file is enrolled in the behavioral check" — a far weaker claim than "this file cleans up correctly", which is the claim a text scan cannot carry. Its failure is loud and its repair is one line, so a newly-enrolled scratch-creating surface cannot go silently uncovered.

  **AC-5 fails a REPAIRED suite, in a case that has already created a root.** The behavioral arm only ever runs suites that pass, so cleanup registered per-case-on-success would satisfy it while still leaking on failure. Two earlier drafts of this arm were wrong in different ways and both are recorded, because the second was introduced by the repair to the first:

- A purpose-built fixture suite proves nothing about the six: they deliberately share no cleanup helper, so a fixture that cleans up correctly says only that the fixture does.
- Injecting a failure ANYWHERE in a subject suite is not enough either. If the failing case created no root, the successful cases clean up after themselves, the run has nothing to leak, and the arm passes while a failing root-creating case would still leak. The failure must land in a case that has ALREADY created a recorded root.

The arm therefore runs each subject suite-set with a failure injected into a root-creating case, and asserts three things: the child exited NON-ZERO (so the injection actually took), at least one root was recorded before it died, and **every recorded path is gone** — the same oracle the success arm uses, for the reason the prototype established. An earlier draft said "the isolated `TMPDIR` is empty", which contradicts this plan's own measurement: vitest leaves one entry of its own, so that assertion stays red after correct cleanup and Task 1 could never green.
- **EXTENDS** `tests/scripts/withHeavySlot.test.ts` — admission cases AC-2, AC-2b, AC-2c, AC-2d, AC-2e.
- **EXTENDS** `tests/docs/agentsHeavyPhaseRule.test.ts` and its pin `tests/docs/fixtures/agents-heavy-phase-rule.md` — a COMPANION SURFACE, not an optional extra. That guard asserts `checkHeavyPhaseRule(LIVE)` returns `[]` (`tests/docs/agentsHeavyPhaseRule.test.ts:787`), comparing AGENTS.md's heavy-phase rule against a pinned copy at CONTENT level. Task 2 edits that rule to name `pnpm heavy:mutation`, so the pin moves in the SAME commit or the guard reds on a change that is otherwise correct. Task 2's own `red=` cannot see this — `withHeavySlot.test.ts` can go green while the repository guard is red — which is why it is declared here rather than discovered in CI.
- No cache-case extension: `AC-1c` and its behavioral cases retired with the deferred tier, and `tests/styles/interactiveScanCore.test.ts` is edited by Task 1 for cleanup only.
- No other registry applies: no Supabase call boundary, no admin mutation surface, no advisory lock, no `admin_alerts` catalog, no tile rendering.

## 3. Mutation-family closure

**No enrolled SOURCE is edited by this plan**, so no mutation-family closure set applies and no score is owed. `interactiveScanCore` is enrolled (`tests/mutation/source/registry.ts:2237`, 272 mutants) and this plan touches only its deciding SUITE, for cleanup. Consequently the round-1 diff brief carries no `GUARD SURFACE:` line and no `OPERATORS:` tail, and this arc requests no mutation slot. AC-1's before/after verdict equality is what stands in for a score here, and it is the stronger claim for this change: it asserts the edits moved nothing, rather than that the suite would notice if they had.

`scripts/with-heavy-slot.py` is Python and the registry cannot express it. Its guarantees ride on executable cases in `tests/scripts/withHeavySlot.test.ts` — the same disposition the heavy-orphan arc took, not a symbolic enrolment.

**Shard numbers are re-derived from the merged tree at every score launch** (fleet rule, 2026-08-24): the partition weighs mutant counts, so any enrolled source changing anywhere reshuffles all four shards, and a stale shard number banks a green that measured nothing.

## 4. RED shapes

**TWO tasks carry a `red=`; Task 3 deliberately does not** (see its heading for why). Both are `red-state=authored`: neither asserts the current tree already fails, so neither is run at plan time. Task 1's is collection-shaped — the guard file does not exist yet — and is declared so. Task 2 adds cases to an existing suite whose failure comes from a named production defect verified present on the live tree.

Each `red-target=` was verified by READING the cited line and matching it to the symbol its `why=` names, not by confirming it resolves. That caught one drift while drafting: `scripts/with-heavy-slot.py:683` is a comment, and the acquisition the `why=` describes is at `scripts/with-heavy-slot.py:707`.

## 4.1 Acceptance criteria, restated so this plan's `ac=` ids resolve

Full statements live in spec §8; these are the plan-side references.

- **AC-1** — verdict neutrality across all EIGHT surfaces whose deciding suites this plan edits, compared as sets. (AC-1b and AC-1c retired with the deferred tier.)
- **AC-2** — two direct class acquirers serialize; an ordinary acquirer still proceeds while a slot is free.
- **AC-2b** — a nested mutation invocation exits non-zero with the outermost-wrap message.
- **AC-2c** — the round-2 deadlock cycle terminates for every participant.
- **AC-2d** — the production entry point `pnpm heavy:mutation` actually takes the class.
- **AC-2e** — an unknown class value exits 2 naming the accepted set.
- **AC-3** — total simultaneous heavy phases never exceeds the configured slot count.
- **AC-4** — after a repaired suite runs, its temp-root family count is unchanged.
- **AC-5** — a deliberately failing case still removes its root.
- **AC-6** — RETIRED with the deferred tier: cleanup does not reduce roots created and strictly increases calls. Residue is the quantity that moves, and AC-4 asserts it at zero.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the cleanup guard, and the six repairs that green it

<!-- task: red=`pnpm vitest run tests/mutation/_metaScratchRootCleanup.test.ts` red-state=authored red-target=`tests/styles/interactiveScanCore.test.ts:41` why=`the suite creates a scratch root at :41 and the file registers no removal anywhere, so the guard this task writes finds the roots it recorded still present after the run and fails; the guard file does not exist yet, so the command is collection-shaped until it is written` ac=AC-4,AC-5 -->

**RED must say:** the in-scope suite-sets leave the roots they created still present. **GREEN:** the same command, after the six files are repaired.

The oracle is *recorded paths still exist*, never *the isolated `TMPDIR` is empty* — vitest leaves one entry of its own, so the empty form stays red after correct cleanup and this command could never green. Three separate statements of the RED carried that rejected form after the arm itself was fixed; sweeping the document for every occurrence, rather than repairing the one a finding named, is what that cost.

Guard and repair are ONE task because invariant 1 is failing test, then minimal implementation, then passing test. Splitting them would give the second task a `red=` whose failing case it did not author and which, at plan time, exits non-zero only because a file is missing — a collection-shaped red masquerading as a behavioral one.

The guard's subject set is derived from `GUARD_SURFACES[].suitePaths` intersected with a filesystem walk, never a literal list. It states its premise executably with `premiseHolds` from `tests/_shared/premise.ts`: the walk found a non-empty in-scope set. Without that premise an empty walk passes vacuously, which is exactly the degenerate case the guard exists for, and the premise executes unconditionally relative to what it guards — never inside a `.each` callback whose case count can be zero.

Repair, per file: module-level `const roots: string[] = []`, push on create, `afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))`. Add `rmSync` to each file's existing `node:fs` import — none of the six imports it today. Cleanup in `afterAll` rather than per-case so a failing case still removes its root; a cleanup that runs only on success leaks exactly when a suite is being debugged, which is when it runs most.

Deliberately NOT a shared helper module: six local three-line additions beat an abstraction nothing yet demands. Revisit only if the guard needs one canonical creator to recognize, and then because the guard requires it.

## Task 2 — the single-slot admission class

<!-- task: red=`pnpm vitest run tests/scripts/withHeavySlot.test.ts` red-state=authored red-target=`scripts/with-heavy-slot.py:707` why=`main() acquires exactly one slot here and parses no --class flag anywhere, so two concurrent mutation invocations both proceed and the new cases fail` ac=AC-2,AC-2b,AC-2c,AC-2d,AC-2e -->

**RED must say:** two concurrent mutation invocations both proceed.

`acquire_class_lock(slot_dir, cls, poll_ms, jitter_pct, cadence)` — a poll loop taking a non-blocking `flock` on `class-<cls>.lock` in the SAME slot directory, with the existing jitter and warn cadence, acquired BEFORE `acquire_loop`. `os.set_inheritable(class_fd, True)` alongside the slot fd before `execvp`; the fd surviving exec IS the mechanism, and PEP 446 makes fds non-inheritable by default. The class file is ignored by slot enumeration (`SLOT_NAME = ^slot-(\d+)$`, `scripts/with-heavy-slot.py:47`) the way `recreate.lock` already is.

**A nested mutation run REFUSES rather than waits**, and this shape is two review rounds' work rather than a first guess. Round 1 found that `FX_HEAVY_SLOT_HELD` proves an ordinary SLOT is held and says nothing about the class. Round 2 found that the obvious repair — a class marker the nested run may acquire — DEADLOCKS: at one slot, ordinary A holds the slot, mutation B holds the class and waits for the slot, and A's nested mutation work inherits A's slot and waits for B's class. So when `--class` is requested and a valid slot marker is inherited, the wrapper exits non-zero naming the outermost-wrap rule. Nothing waits while holding; and with no class marker to inherit there is no PID-reuse ABA either, which is how round 2's second finding dissolved rather than needing a repair.

**The production entry point is part of this task, not a follow-up.** `pnpm heavy --class mutation` cannot work: the `heavy` script already ends in its own separator, so `split_argv` (`scripts/with-heavy-slot.py:60`) takes `--class` as `command[0]` and swallows it. The class gets its own script with the flag ahead of the separator:

```
"heavy:mutation": "tsx scripts/heavy-reap.ts --kill --quiet; python3 scripts/with-heavy-slot.py --class mutation --"
```

`AGENTS.md` is in the touch set for the same reason: its heavy-phase section tells operators to run `pnpm heavy pnpm mutation:guards`, and a class nobody invokes bounds nothing. It is updated to name `pnpm heavy:mutation` for `mutation:guards`, `mutation:browser` and any `--project mutation` run. **`tests/docs/fixtures/agents-heavy-phase-rule.md` moves in the same commit** — see §2; the heavy-phase rule is content-pinned, and this task's own `red=` is blind to that guard.

Cases, and each names what it catches that the others do not:

- **AC-2** two direct class acquirers serialize; an ordinary acquirer still proceeds while a slot is free.
- **AC-2b** a nested invocation under an inherited slot marker exits non-zero with the message. It asserts the EXIT and the message, not that the process waits — round 2's finding was that "waits" is satisfied by a deadlock.
- **AC-2c** the round-2 cycle constructed at `FX_HEAVY_SLOTS=1`; all three participants must reach a terminal state within a bounded time. Regression case for the repair review rejected.
- **AC-2d** drives `pnpm heavy:mutation` end to end, **at `FX_HEAVY_SLOTS=2` with an overlap-capable fixture**. The slot count is the discriminator: at one slot two invocations serialize whether or not the flag arrives, so the case would pass on the exact broken script it exists to catch. With two slots free, they overlap unless the class is actually taken. Every other case exercises the wrapper's Python path and passes whether or not the shipped script delivers the flag.
- **AC-2e** an unknown class value exits 2 naming the accepted set. An implementation accepting both `mutation` and `mutaton` under separate locks satisfies every other case while two runs proceed.
- **AC-3** at `FX_HEAVY_SLOTS=2`, one class holder plus two ordinary acquirers: at most two run at once. Under the rejected second-directory design that count is three, so the case discriminates the designs rather than exercising the shipped one.

The suite already has the template: `runWrapped(env, argv, wrapperArgs)` (`tests/scripts/withHeavySlot.test.ts:104`) takes wrapper flags unchanged, `tests/scripts/withHeavySlot.test.ts:220` is the premise-carrying mutual-exclusion case with a fixture that can OBSERVE overlap, and every case points `FX_HEAVY_SLOT_DIR` at a per-case tmpdir (`tests/scripts/withHeavySlot.test.ts:10`) so none touches the real `/tmp/fx-heavy-slots`.

<!-- tasks: end -->

## Task 3 — verdict neutrality, and the churn re-measure (verification, deliberately outside the task region)

**No `red=` marker, and that is the point.** This task runs measurements and records their comparison; it writes no production code, so there is no command that is red before it and green after it. Giving it a marker would mean inventing a red it cannot observe — the defect the red-contract rules exist to catch. The region closes above; a heading outside a declared region is unchecked by design (multi-region, `docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md`).


Compare **mutant sets and per-mutant verdicts as SETS**, never counts — an equal total with two verdicts swapped must fail — across **all eight** surfaces whose deciding suites Task 1 edits: `controlOutlineScan`, `interactiveScanCore`, `modal-wait-helper-scan`, `modal-wait-disposition`, `mutationSurfaceEnumerate`, `mutationSurfaceTotality`, `psqlStartupScan`, `interactionTimingScan`. The last two joined when implementation found their failure-path leaks; an acceptance gate that still named six could pass without ever checking them.

**`interactiveScanCore` is IN the comparison, and that is the rescope paying off.** While the cache change was in this plan it had to be excluded, because editing its source changes its mutant set and a before/after equality is not expressible. With that work split out, no enrolled SOURCE is edited by this plan at all: every surface keeps its mutant set, and a plain equality covers all six. AC-1b and AC-1c retired with the tier they served — there is no on/off layout switch to prove and no changed predicate to score.

**No `GUARD SURFACE` score arm is owed on the round-1 diff brief**, and this arc requests no mutation slot, for the same reason.

**Measured cost, so this is scheduled rather than guessed.** One cold run of `interactiveScanCore`'s three deciding suites is 1.7 s and `controlOutlineScan`'s is 1.1 s. Upper bounds before `bail: 1` truncates: the `interactiveScanCore` re-score is about 8 min, a `controlOutlineScan` arm about 2 min, and the five compared surfaces plus the re-score land near an hour of wall clock.

Then re-run the cost probe on the four in-scope SUITE-SETS and record before and after, both from the same probe on the same idle checkout (AC-6). **The probe is a committed script, not a scratchpad artifact**, so AC-6 has a runnable command:

```
node scripts/probes/scratch-fs-cost.mjs tests/styles/_metaControlOutlineFill.test.ts
```

It emits JSON with `roots`, `fsops` and `secs`. Verified at plan time to reproduce §1's figures for that set exactly: `roots: 4, fsops: 18`.

**AC-6 is RETIRED with the deferred tier, and the reason is arithmetic rather than tidying.** It required each suite-set to report fewer roots AND fewer filesystem-mutating calls. Cleanup does neither: the suites create exactly as many roots as before, and adding `rmSync` strictly INCREASES the call count the probe measures. The quantity this plan actually moves is RESIDUE — roots still present when the run ends — and that is what AC-4 asserts, per suite-set, at zero. Keeping AC-6 would have been a gate that cannot pass on a change that is nonetheless correct, which is plan review round 2's finding 1 generalised to every set once reuse left the plan.

The probe is still run and its before/after recorded, as evidence rather than as a gate: the expected shape is roots unchanged, calls slightly up by the cleanup, residue at zero.

Run ONE score at a time, wrapped, never concurrent with another arc's score run, coordinated through bl-orch, with the shard number re-derived from the merged tree at launch. This arc is fixing the storm and must not become it.



## 5. Pre-dispatch obligations

- Every `red=` is `sh -nc` parse-checked (both pass). No `red-state=live` marker exists, so nothing is run at plan time to prove a pre-existing failure; §4 states why each red is `authored`.
- The new guard file needs no config change, verified against `vitest.projects.ts` rather than inferred from a console banner: the `mutation` project's file list names only `tests/mutation/guardSurfaces.shard*.test.ts` (`vitest.projects.ts:90`), `tests/mutation/guardSurfaces.gates.test.ts` (`vitest.projects.ts:91`) and `tests/mutation/browser/browserSurfaces.gate.test.ts` (`vitest.projects.ts:95`), so any other file under `tests/mutation/` lands in the default unit project and runs on every `pnpm test`.
- Every embedded snippet typechecked against the strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
