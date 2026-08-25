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

**The six split by CAUSE, and only two are the cache's.** Just `tests/styles/interactiveScanCore.test.ts` and `tests/styles/_metaControlOutlineFill.test.ts` import `interactiveScanCore`; the other four build throwaway repository roots whose paths are SEMANTIC — a per-case e2e spec path under `tests/e2e/`, module locations, `use server` files — and are part of what those suites assert. They create a root per case because each case needs its own file layout, not because a cache forces it. Tier 3's reuse conversion therefore applies to the two cache-bound suites ONLY; forcing the other four onto one path would change their inputs. All six still get cleanup in Task 1, and since those four carry 180 of the 230 roots per run, cleanup is where most of the leak is fixed.

Roots per SUITE-SET RUN is the only unit stated, here and in the spec. No per-pass product, percentage or rate appears in this plan: spec §1.3 records why (`runSuiteRecorded` returns on the first nonzero suite, `tests/mutation/source/runner.ts:221`, so a multi-suite surface does not run every suite for every mutant, and `bail: 1` truncates inside a suite as well). Three spec rounds returned an arithmetic finding against such a product and a fourth returned another; the plan does not reopen that axis.

**Peers, filed not fixed:** the other 56 files (106 call sites) create roots without removing them but are named by no enrolled surface, so no mutant loop multiplies them. Largest is `tests/reviewRounds/report.test.ts` at 34 call sites. Disposition reason **(c)** — the repair spans enough sites to blow the review scope, and a guard over the whole test tree is a new surface needing its own enrolment and convergence criterion. Explicitly NOT "same defect, different file", which the disposition rule says is never sufficient alone; the boundary is amplification by a mutant loop.

## 2. Meta-test inventory (mandatory declaration)

- **CREATES** the cleanup guard, a new file under `tests/mutation/` (path in the fence below; it is not cited inline because a citation to an absent path is a hard lint failure).

  ```
  tests/mutation/_metaScratchRootCleanup.test.ts   (new)
  ```

  **Two arms, because one cannot do both jobs.** The BEHAVIORAL arm runs each subject suite-set in a child with an isolated `TMPDIR` and asserts three things, not one: the child **exited 0** (so a collection failure or a missing import cannot pass as cleanliness), the child **created at least one root** (the subject's defining capability, asserted rather than assumed), and **every path it created is gone afterward**.

**The mechanism was prototyped rather than described, and the spike killed two designs before the plan could commit to them.** (a) Watching the isolated `TMPDIR` on a `setInterval` while the child runs reports zero every time — `spawnSync` blocks the event loop, so the sampler never fires. Creation is instead counted by the same `mkdtempSync` preload the committed probe uses. (b) "The directory is empty afterward" is the wrong assertion: a child that could not even COLLECT still left one entry, because vitest creates its own temp. The guard therefore records the exact paths created and asserts each no longer exists, which is immune to that baseline noise.

Measured on the current (unrepaired) tree, with a negative control:

```
controlOutline     exit=0 created= 4 residue= 5
modalWait          exit=0 created=30 residue=31
CONTROL(nocollect) exit=1 created= 0 residue= 1   <- rejected by BOTH assertions
```

Residue exceeds `created` by exactly the one vitest entry in each case, which is what (b) is about. The control is what makes the other two rows evidence: without it, "residue is 0" could be reported by a child that never ran — total over "removes what it makes", with nothing for a recognizer to widen. The MEMBERSHIP arm is a cheap static check that every enrolled deciding-suite file calling `mkdtempSync` appears in the behavioral arm's subject list. That second arm IS a text scan, deliberately, and its claim is only "this file is enrolled in the behavioral check" — a far weaker claim than "this file cleans up correctly", which is the claim a text scan cannot carry. Its failure is loud and its repair is one line, so a newly-enrolled scratch-creating surface cannot go silently uncovered.

  **AC-5 fails a REPAIRED suite, not a stand-in.** The behavioral arm only ever runs suites that pass, so cleanup registered per-case-on-success would satisfy it while still leaking on failure. An earlier draft used a purpose-built fixture suite for this, and that is insufficient: the six repairs deliberately share no helper, so a fixture cleaning up correctly says nothing about whether any of the six does. The arm instead runs **each subject suite-set with a forced failure injected into it** — an env var the guard sets, which the repaired suites' own `afterAll` must survive — and asserts the isolated `TMPDIR` is empty for every one of them. Per-suite, because the property is per-suite; a shared oracle is exactly what the no-shared-helper decision gives up. **Behavioral, not a text pattern:** it runs each in-scope suite-set in a child with an isolated `TMPDIR` and asserts that directory is empty afterward. A "does the file contain `rmSync`" check is satisfied by an `rmSync` for something else, and any text recognizer over test source ratchets one spelling per round; asserting the property directly is total over it and has nothing to widen. Cost is measured: the four sets run in 1.9 + 1.7 + 3.0 + 1.7 = 8.3 s.
- **EXTENDS** `tests/scripts/withHeavySlot.test.ts` — admission cases AC-2, AC-2b, AC-2c, AC-2d, AC-2e.
- **EXTENDS** `tests/styles/interactiveScanCore.test.ts` — the four cache cases of AC-1c.
- No other registry applies: no Supabase call boundary, no admin mutation surface, no advisory lock, no `admin_alerts` catalog, no tile rendering.

## 3. Mutation-family closure

`interactiveScanCore` is ENROLLED (`tests/mutation/source/registry.ts:2237`, 272 mutants); Task 3 edits it and Task 4 scores it. The closure set is that surface's declared operator list (`...OPERATOR_NAMES`), and the diff round's criterion is its score plus an empty unaccepted-survivor set stated with the operator set it ranges over. A reviewer-proposed NEW family is admissible only with a live escaping mutant against the shipped guard.

**The score is explicitly NOT sufficient for this change, and AC-1c says so.** Operators mutate code that EXISTS; a predicate reading `birthtimeMs` where `mtimeMs` was meant is unreachable by any declared operator because the code never distinguished those constructs. That gap is closed by behavioral cases, not by widening the registry under review pressure.

`scripts/with-heavy-slot.py` is Python and the registry cannot express it. Its guarantees ride on executable cases in `tests/scripts/withHeavySlot.test.ts` — the same disposition the heavy-orphan arc took, not a symbolic enrolment.

**Shard numbers are re-derived from the merged tree at every score launch** (fleet rule, 2026-08-24): the partition weighs mutant counts, so any enrolled source changing anywhere reshuffles all four shards, and a stale shard number banks a green that measured nothing.

## 4. RED shapes

**THREE tasks carry a `red=`; Task 4 deliberately does not** (see its heading for why). All three are `red-state=authored`: none asserts the current tree already fails, so none is run at plan time. Task 1's is collection-shaped — the guard file does not exist yet — and is the only one declared so. Tasks 2 and 3 add cases to existing suites whose failure comes from a named production defect verified present on the live tree.

Each `red-target=` was verified by READING the cited line and matching it to the symbol its `why=` names, not by confirming it resolves. That caught one drift while drafting: `scripts/with-heavy-slot.py:683` is a comment, and the acquisition the `why=` describes is at `scripts/with-heavy-slot.py:707`.

## 4.1 Acceptance criteria, restated so this plan's `ac=` ids resolve

Full statements live in spec §8; these are the plan-side references.

- **AC-1** — verdict neutrality across the five surfaces whose deciding suites change but whose source does not, compared as sets.
- **AC-1b** — the ON arm proves it ENTERED the invalidation branch, not merely that root counts differ.
- **AC-1c** — the changed enrolled source is re-scored AND covered by the four behavioral cache cases.
- **AC-2** — two direct class acquirers serialize; an ordinary acquirer still proceeds while a slot is free.
- **AC-2b** — a nested mutation invocation exits non-zero with the outermost-wrap message.
- **AC-2c** — the round-2 deadlock cycle terminates for every participant.
- **AC-2d** — the production entry point `pnpm heavy:mutation` actually takes the class.
- **AC-2e** — an unknown class value exits 2 naming the accepted set.
- **AC-3** — total simultaneous heavy phases never exceeds the configured slot count.
- **AC-4** — after a repaired suite runs, its temp-root family count is unchanged.
- **AC-5** — a deliberately failing case still removes its root.
- **AC-6** — the P2 probe reports fewer roots and fewer calls per suite-set run than §1 records.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the cleanup guard, and the six repairs that green it

<!-- task: red=`pnpm vitest run tests/mutation/_metaScratchRootCleanup.test.ts` red-state=authored red-target=`tests/styles/interactiveScanCore.test.ts:41` why=`the suite creates a scratch root at :41 and the file registers no removal anywhere, so the guard this task writes finds a non-empty isolated TMPDIR after the run and fails; the guard file does not exist yet, so the command is collection-shaped until it is written` ac=AC-4,AC-5 -->

**RED must say:** the in-scope suite-sets leave a non-empty TMPDIR behind. **GREEN:** the same command, after the six files are repaired.

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

`AGENTS.md` is in the touch set for the same reason: its heavy-phase section tells operators to run `pnpm heavy pnpm mutation:guards`, and a class nobody invokes bounds nothing. It is updated to name `pnpm heavy:mutation` for `mutation:guards`, `mutation:browser` and any `--project mutation` run.

Cases, and each names what it catches that the others do not:

- **AC-2** two direct class acquirers serialize; an ordinary acquirer still proceeds while a slot is free.
- **AC-2b** a nested invocation under an inherited slot marker exits non-zero with the message. It asserts the EXIT and the message, not that the process waits — round 2's finding was that "waits" is satisfied by a deadlock.
- **AC-2c** the round-2 cycle constructed at `FX_HEAVY_SLOTS=1`; all three participants must reach a terminal state within a bounded time. Regression case for the repair review rejected.
- **AC-2d** drives `pnpm heavy:mutation` end to end, **at `FX_HEAVY_SLOTS=2` with an overlap-capable fixture**. The slot count is the discriminator: at one slot two invocations serialize whether or not the flag arrives, so the case would pass on the exact broken script it exists to catch. With two slots free, they overlap unless the class is actually taken. Every other case exercises the wrapper's Python path and passes whether or not the shipped script delivers the flag.
- **AC-2e** an unknown class value exits 2 naming the accepted set. An implementation accepting both `mutation` and `mutaton` under separate locks satisfies every other case while two runs proceed.
- **AC-3** at `FX_HEAVY_SLOTS=2`, one class holder plus two ordinary acquirers: at most two run at once. Under the rejected second-directory design that count is three, so the case discriminates the designs rather than exercising the shipped one.

The suite already has the template: `runWrapped(env, argv, wrapperArgs)` (`tests/scripts/withHeavySlot.test.ts:104`) takes wrapper flags unchanged, `tests/scripts/withHeavySlot.test.ts:220` is the premise-carrying mutual-exclusion case with a fixture that can OBSERVE overlap, and every case points `FX_HEAVY_SLOT_DIR` at a per-case tmpdir (`tests/scripts/withHeavySlot.test.ts:10`) so none touches the real `/tmp/fx-heavy-slots`.

## Task 3 — make `sourceCache` invalidatable, and actually reuse the roots

<!-- task: red=`pnpm vitest run tests/styles/interactiveScanCore.test.ts` red-state=authored red-target=`tests/styles/interactiveScanCore.ts:479` why=`the cache is keyed on the absolute path alone and has no invalidation path, so a second fixture written to one reused path is answered from the first parse and the new case reads back the wrong classes` ac=AC-1b,AC-1c -->

**RED must say:** two fixtures written to the SAME path in one root return the first fixture's classes.

Key on `(path, mtimeMs, size)`. **Probed at plan time rather than left open:** 2,000 tight rewrites alternating two SAME-LENGTH contents produced zero collisions, and consecutive writes differ by about 0.034 ms (200 pairs, zero zero-deltas), so APFS mtime resolution separates back-to-back writes. The probe carries its own control — the predicate compared against a stat and itself, which must and does report a collision — because a negative from a predicate that can never fire is not evidence. The key depends on a filesystem property, so the guard ASSERTS it: `premiseHolds("consecutive writes receive distinct mtimeMs", delta !== 0)`. A coarse-granularity filesystem fails the premise loudly instead of the cache silently serving a stale parse. Content hashing is the named fallback, declined because it is O(file size) across every file of an `app/` and `components/` walk to buy nothing this measurement does not.

**Five cases, and each names the wrong implementation it alone rejects.** `parse` and `sourceCache` are module-private and `scanInteractiveElements` builds fresh result objects, so output equality cannot tell a cache hit from an unconditional reparse. The suite therefore needs an observable: a **parse counter** incremented where `ts.createSourceFile` is actually called, exported for the test. Without it case 2 has no oracle and an implementation that always reparses passes it.

1. **rewritten in place is re-parsed** — rejects a cache with no invalidation at all.
2. **untouched is served from cache** — asserted on the PARSE COUNTER, which must not increase. Output equality proves nothing here.
3. **SIZE changes, mtime forced equal, is re-parsed** — rejects a key that ignores size.
4. **rewritten to the SAME LENGTH, IN PLACE, with a changed mtime, is re-parsed, and the case asserts `birthtimeMs` is UNCHANGED across the rewrite** — rejects `(path, birthtimeMs, size)`. The birthtime assertion is what makes the case discriminate: a delete-and-recreate fixture changes birthtime too, so without it the wrong implementation passes. Rewrite in place; do not unlink.
5. **two DIFFERENT paths whose `(mtimeMs, size)` are identical do not share a parse** — rejects an implementation keyed on metadata alone with the path dropped, which passes all four single-path cases above and then serves one file's `SourceFile` for another, producing a wrong scan and a wrong verdict.

Cases 4 and 5 exist because cases 1 to 3 admit two distinct wrong implementations that a reviewer, not a mutation operator, has to find: the registry's operators mutate code that exists, and neither `birthtimeMs` nor a dropped path component is a construct this code ever distinguished.

**Invalidation alone buys nothing, so this task also converts the TWO cache-bound suites — `tests/styles/interactiveScanCore.test.ts` and `tests/styles/_metaControlOutlineFill.test.ts` — to reuse one root, rewriting the SAME path per case.** The other four in-scope suites are NOT converted: they build throwaway repository roots whose paths are semantic (a per-case e2e spec path under `tests/e2e/`, module locations, `use server` files) and are part of what they assert, so forcing them onto one path would change the input under test rather than the layout. They are fixed by Task 1's cleanup, which is where 180 of the 230 roots per run actually are. A distinct filename per case would also reuse one root and is the WRONG conversion: every parse would be a cold miss, the invalidation branch would never execute, and the cache work would be dead code no criterion could catch. That was round 2's third finding.

The six are edited twice across this plan, here and in Task 1, and that is deliberate. Task 1 must be able to ship ALONE: it is the cheapest tier, it addresses the accumulation limb no other tier touches, and if this task stalls on review the leak is still fixed. Collapsing them would make the largest, safest win wait on the only verdict-risky change in the plan.

<!-- tasks: end -->

## Task 4 — verdict neutrality, and the churn re-measure (verification, deliberately outside the task region)

**No `red=` marker, and that is the point.** This task runs measurements and records their comparison; it writes no production code, so there is no command that is red before it and green after it. Giving it a marker would mean inventing a red it cannot observe — the defect the red-contract rules exist to catch. The region closes above; a heading outside a declared region is unchecked by design (multi-region, `docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md`). AC-1b's counter assertion ships in Task 3, with the suite it belongs to.


Compare **mutant sets and per-mutant verdicts as SETS**, never counts — an equal total with two verdicts swapped must fail — across the **five surfaces whose deciding suites Task 3 converts but whose SOURCE it does not touch**: `controlOutlineScan`, `modal-wait-helper-scan`, `modal-wait-disposition`, `mutationSurfaceEnumerate`, `mutationSurfaceTotality`. `interactiveScanCore` is EXCLUDED: Task 3 edits its source, so its mutant set necessarily differs and a before/after equality is not expressible for it.

**The ON arm must ENTER the invalidation branch (AC-1b)**, asserted as an executable premise via a counter incremented where the cache is consulted and found stale. The OFF arm asserts only its documented root count; it uses distinct paths by construction and can never enter that branch, so requiring it to would be unsatisfiable.

**`interactiveScanCore` gets a re-score PLUS the Task 3 behavioral cases (AC-1c)**, reported with its unaccepted-survivor set and `OPERATORS:` tail — which is also the `GUARD SURFACE:` arm the round-1 diff brief owes.

**Measured cost, so this is scheduled rather than guessed.** One cold run of `interactiveScanCore`'s three deciding suites is 1.7 s and `controlOutlineScan`'s is 1.1 s. Upper bounds before `bail: 1` truncates: the `interactiveScanCore` re-score is about 8 min, a `controlOutlineScan` arm about 2 min, and the five compared surfaces plus the re-score land near an hour of wall clock.

Then re-run the cost probe on the four in-scope SUITE-SETS and record before and after, both from the same probe on the same idle checkout (AC-6). **The probe is a committed script, not a scratchpad artifact**, so AC-6 has a runnable command:

```
node scripts/probes/scratch-fs-cost.mjs tests/styles/_metaControlOutlineFill.test.ts
```

It emits JSON with `roots`, `fsops` and `secs`. Verified at plan time to reproduce §1's figures for that set exactly: `roots: 4, fsops: 18`.

**AC-6 covers the reuse limb that no `red=` observes.** Task 3's red watches `interactiveScanCore.test.ts` alone, so a conversion omitted in `_metaControlOutlineFill.test.ts` would not turn it red; the probe's roots-per-run figure for that set is what catches it, which is why AC-6 names each set separately rather than reporting a sum.

Run ONE score at a time, wrapped, never concurrent with another arc's score run, coordinated through bl-orch, with the shard number re-derived from the merged tree at launch. This arc is fixing the storm and must not become it.



## 5. Pre-dispatch obligations

- Every `red=` is `sh -nc` parse-checked (all THREE pass). No `red-state=live` marker exists, so nothing is run at plan time to prove a pre-existing failure; §4 states why each red is `authored`.
- The new guard file needs no config change, verified against `vitest.projects.ts` rather than inferred from a console banner: the `mutation` project's file list names only `tests/mutation/guardSurfaces.shard*.test.ts` (`vitest.projects.ts:90`), `tests/mutation/guardSurfaces.gates.test.ts` (`vitest.projects.ts:91`) and `tests/mutation/browser/browserSurfaces.gate.test.ts` (`vitest.projects.ts:95`), so any other file under `tests/mutation/` lands in the default unit project and runs on every `pnpm test`.
- Every embedded snippet typechecked against the strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
