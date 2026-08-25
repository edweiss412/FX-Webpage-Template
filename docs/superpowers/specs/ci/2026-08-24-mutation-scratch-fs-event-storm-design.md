# Mutation scratch filesystem-event storm — design

**Row:** `BL-MUTATION-SCRATCH-FS-EVENT-STORM` (BACKLOG.md) · **Branch:** `fix/mutation-scratch-fs-event-storm` · **Facing:** process

**PROBE DOMAIN:** the harness's scratch and cache code paths (`tests/mutation/source/**`, `tests/styles/interactiveScanCore.ts`, the scratch-creating deciding suites enumerated in §1.4) plus the incident's measured record and this machine's live TMPDIR. A probe drawn from outside that set, or more than one ordinary edit away from an input in it, files to §7 documented limits rather than to a review round.

**THREAT FENCE:** capacity and cost. This design defends against ordinary harness growth on a developer machine and on CI — more surfaces, more mutants, more cases. It does NOT defend against an adversary who deliberately exhausts inodes or races the semaphore; that files to §7. Nothing here changes a single mutation verdict, and §1.2 states how that is proven rather than asserted.

---

## 1. Problem

### 1.1 The measured incident

On 2026-08-24 between roughly 13:30 and 17:00 CDT, two concurrent mutation-score runs drove `fseventsd` to 7 GB RSS and 85% CPU, swap to 22 GB, and load-average to 492 on 12 cores. The fleet lost about three hours of wall clock across nine arcs; one three-hour single-path score run was lost outright. Recovery required killing every session and a `sudo kill` of `fseventsd`. The near-identical 2026-08-10 incident (12 `vm-compressor-space-shortage` JetsamEvents, hard reset) is the same class with the memory face forward, and it is what the heavy-phase semaphore was built for.

`fseventsd` journals every event on the Data volume, offers no per-path exclusion, and does not return the memory it grows into. It is the amplifier on everything below.

### 1.2 What the harness actually does, and the one number that is not what it looks like

The runner creates ONE scratch root per surface (`tests/mutation/source/runner.ts:229`, removed in a `finally` at `tests/mutation/source/runner.ts:269`) and one per control run (`tests/mutation/source/runner.ts:284`, removed at `tests/mutation/source/runner.ts:300`). That is modest and is not the problem.

The multiplication is elsewhere: the harness runs the surface's whole deciding suite as a fresh child process once per mutant. The scoring spawn is `tests/mutation/source/runner.ts:166` (`spawnBounded` inside `runSuiteRecorded`); `tests/mutation/source/childRun.ts:30` is a DIFFERENT path used by the premise and meta fixtures and is not the scorer. Every root that suite creates for its own fixtures is therefore re-created once per mutant.

**A correction the filed row needs, stated here because it changes the target.** Root reuse is a saving WITHIN one suite run, not across mutants. Separate mutants are separate processes and never shared a root, so a suite creating N roots per run drops to one — about 4x on `controlOutlineScan` and about 32x on the case `67471884a` excluded, not the ~250x a per-mutant reading suggests. The row's original "~250x" was a per-mutant reading and is wrong; BACKLOG.md carries the correction as of `710230abd`.

### 1.3 Probes run for this spec

Every claim below is a command that was run, not an inference. Probe scripts live in the scratchpad and are not committed; the commands are stated so any reader can re-run them.

**P1 — mutant census (static, no suite runs).** Importing `GUARD_SURFACES` and `generateMutants` and summing: **4,362 mutants across 42 enrolled surfaces**, re-derived after merging `origin/main` at `bcd3d088e` (it read 4,360 at `8bf870991`; `modal-wait-disposition` gained two). The census is a command, not a transcribed figure, so it is re-run rather than carried forward.

**P2 — filesystem cost per deciding-suite run, measured.** A `--require` preload wrapping `mkdtempSync`, `mkdirSync`, `writeFileSync`, `appendFileSync`, `rmSync`, `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync`, `cpSync` and `symlinkSync`, appending at CALL TIME through a raw fd. Three probe defects were found and fixed before its output was trusted:

- An exit-handler version lost every vitest WORKER's counts, because a killed worker never runs an exit handler. It reported 3 where the call-time version reports 1,151.
- A naive logger recursed: `appendFileSync` calls `writeFileSync` internally, so patching both made the logger call itself. Self-test showed 60,776 spurious `writeFileSync` calls for three real ones. A reentrancy guard fixes it.
- The unit was wrong. An earlier draft counted STATIC `mkdtempSync` call sites; a site executes once per test that reaches it. Measured against static counts the error runs to 23x (`interactiveScanCore`'s suites: 2 sites, 46 actual roots per run).

**What is measured, and deliberately nothing more:** roots created and filesystem-mutating calls per ONE run of each suite-set, on an otherwise idle checkout.

| roots/run | fsops/run | suite set | surfaces it decides |
| ---: | ---: | --- | --- |
| 150 | 468 | `tests/log/mutationSurface/enumerate.test.ts`, `tests/log/mutationSurface/totality.test.ts` | mutationSurfaceEnumerate, mutationSurfaceTotality |
| 46 | 274 | `tests/styles/interactiveScanCore.test.ts` (+2 in set) | interactiveScanCore |
| 30 | 136 | `tests/ci/_metaModalWaitHelper.test.ts`, `tests/ci/_metaModalWaitCandidateV2.test.ts` | modal-wait-helper-scan, modal-wait-disposition |
| 4 | 18 | `tests/styles/_metaControlOutlineFill.test.ts` | controlOutlineScan |

**Per-pass totals, concentration percentages and fleet-wide extrapolations are deliberately ABSENT, and three review rounds are the reason.** Multiplying a suite-set's cost by mutant count is wrong: `runSuiteRecorded` returns on the first suite whose code is nonzero (`tests/mutation/source/runner.ts:221`), so a multi-suite surface does NOT run every suite for every mutant, and `bail: 1` cuts a killed mutant short inside a suite as well. A correct per-pass figure would have to model both, and it would be an estimate of a quantity this design does not need: the repair is justified by the per-run numbers above and verified by AC-6's before/after on the same probe. Rounds 1, 2 and 3 each returned an arithmetic finding against a per-pass extrapolation; deleting the extrapolation closes that axis rather than re-deriving it a fourth time.

`premiseScan` is worth one line as the model rather than as a statistic: it is by far the heaviest churn source measured (1,896 fsops per run) and creates ONE root, which it removes. Churn and leak are different problems with different fixes, and its shape is what §3.1 and §3.3 ask the six to adopt.

**P3 — Tailwind is not the cache (a negative result, and it matters).** `__unstable__loadDesignSystem` re-reads the same absolute path fresh: writing a `@theme` token, loading, then REMOVING the token and loading the same path again returns `[null]` for the candidate. The CSS side is exonerated.

The first version of P3 was invalid and is recorded rather than discarded: it varied the token's VALUE, and Tailwind emits `var(--token)`, so the output could not express the change. It reported "identical" and would have read as proof of caching. A probe whose fixture cannot vary the field under test reports no difference and looks like evidence.

**P4 — the cache, located and convicted.** `tests/styles/interactiveScanCore.ts:479` declares a module-level `Map<string, ts.SourceFile>` keyed by absolute path, read at `tests/styles/interactiveScanCore.ts:482`, written at `tests/styles/interactiveScanCore.ts:492`. A repository-wide grep returns exactly those three references, so **no invalidation path exists** — that is a derived cover, not an enumeration I might have cut short. Probed both directions in one process:

- One reused root, two different fixtures written to the same path: the second scan returns the FIRST fixture's classes.
- Two separate roots: both scans return their own classes correctly.

The second half is the negative control. Without it the first half cannot distinguish "the cache is stale" from "the probe cannot see anything".

### 1.4 The second limb: the leak, which the incident never named

The incident was read as transient churn during runs. It is also permanent accumulation, and that limb is larger.

**Scope is DERIVED rather than sampled:** a file is in scope if it creates a scratch root, registers no removal, and is named in some enrolled surface's `suitePaths` — so the mutant loop multiplies its leak. Re-running the derivation is how a reader checks it, and a newly-enrolled surface joins automatically instead of being silently exempt.

Over `git ls-files tests/`: **108 files create scratch directories, 62 register no `rmSync` anywhere** (117 call sites). Six of those 62 are named by an enrolled surface, so a mutant loop re-runs them:

| roots created per suite-set run | suite set | surfaces |
| ---: | --- | --- |
| 150 | `tests/log/mutationSurface/enumerate.test.ts`, `tests/log/mutationSurface/totality.test.ts` | mutationSurfaceEnumerate, mutationSurfaceTotality |
| 46 | `tests/styles/interactiveScanCore.test.ts` (+2 in set) | interactiveScanCore |
| 30 | `tests/ci/_metaModalWaitHelper.test.ts`, `tests/ci/_metaModalWaitCandidateV2.test.ts` | modal-wait-helper-scan, modal-wait-disposition |
| 4 | `tests/styles/_metaControlOutlineFill.test.ts` | controlOutlineScan |

Every one of those roots persists, because none of the six files removes what it makes. That is the whole finding; no multiplication is needed to act on it.

**Implementation found two more, and the way it found them is the argument for a behavioral guard.** `tests/cross-cutting/psqlStartupFileSuppression.test.ts` and `tests/docs/interactionTimingScan.test.ts` clean up correctly on a passing run and leak specific roots when a case FAILS, because each root is created BEFORE the `try` whose `finally` removes it. A textual census sees an `rmSync` in those files and passes them; only running a suite with a failure injected after a root exists reveals the gap. Both are repaired here — eight files, not the six this section derived.

`tests/mutation/source/premiseScan.test.ts` is the counterexample and the model: one root for the whole file (`tests/mutation/source/premiseScan.test.ts:23`), removed in `afterAll` (`tests/mutation/source/premiseScan.test.ts:24`), rewriting one path per case rather than adding a directory.

The remaining **56 files (106 call sites)** create roots without removing them but are named by no enrolled surface, so no mutant loop multiplies them. They are filed as peers in §9.

**The accumulated population.** Measured at 17:33 CDT on 2026-08-24 by `find "$TMPDIR" -maxdepth 1 -type d -name '*-*' | wc -l`, this machine held **781,949 leaked directories in one flat TMPDIR**: 408,864 `mutation-surface-`, 249,666 `scan-fixture-`, 30,000 `modal-wait-guard-`, 10,137 `modal-wait-product-`, and 83,282 across smaller families. The four largest families are produced by exactly the six files above. An approved one-time purge **removed 780,888** of them, by its own recorded result (`total=781949 removed=780888 skipped_young=1055 skipped_gone=2 failed=4`). A separate before/after census read 781,981 then 32,238, and the difference between those two censuses is NOT the number removed: roughly 31,000 directories were created by other activity during the purge's 42-minute window, so the census delta is a net population change. An earlier draft quoted that delta (749,743) as the amount removed; the two answer different questions and only the purge's own counter answers the first.

**A production-RATE claim was attempted here and is RETRACTED, which is worth recording rather than quietly deleting.** An earlier draft read the purge's residue as an ordinary-load leak rate of about 12 directories per second. Review round 3 refuted it from the residue's own mtimes: of ~31,400 directories created during the purge window, ~30,989 were `mutation-surface-*` and all of them landed inside a single 15-minute span — roughly 207 repetitions of a 150-root suite-set, which is a score-like run, not background activity. The premise "with no score run in progress" was asserted and never verified, and on a shared machine running eight arcs it was not mine to assert. **No rate is claimed.** The accumulated total above is a direct observation and stands; the rate was an inference and does not.

Sampled, the directories are **mostly empty** — so the cost is inodes, directory entries and `fseventsd` journal volume, not disk space. Enumeration is the visible symptom: the same `find` took **76.0 s** before the purge and **0.6 s** after, a 127x difference, and the shell-glob form did not finish inside a 180 s timeout beforehand. Every `mkdtempSync` pays that directory's size, because creating a uniquely-named entry in a 780k-entry directory is not free.

This explains what the transient reading does not: why the box degraded progressively across days rather than only while runs were live.

---

## 1.1 Resolved scope — do not relitigate

- **`fseventsd` cannot be excluded per-directory.** No such mechanism exists on macOS. `/tmp` placement dodges Spotlight but not `fseventsd`; a RAM disk moves the I/O but the daemon still processes the events. Ratified in the filed row (BACKLOG.md, `BL-MUTATION-SCRATCH-FS-EVENT-STORM`, "Non-repairs, fenced").
- **The reduction figure is per-suite-run, not per-mutant.** Settled in §1.2 with the reason. Do not re-derive the ~250x.
- **Tailwind is not the cache.** Settled by P3 with a stated negative control. Do not re-open the CSS side.
- **Re-including the thirty-two-form case is NOT this arc's scope.** Making `sourceCache` invalidatable is the mechanism that would let `67471884a`'s excluded case return and recover the kills that surface's score currently under-counts. That re-inclusion belongs to the `docs/control-outline-forward-guard` arc as its own work, against its own documented limit. This design names it as a re-file trigger in §7 and does nothing more with it.
- **A second slot directory is the wrong shape for the interim tier**, for the reason in §4.2. Do not propose `FX_HEAVY_SLOT_DIR` as the class mechanism.
- **Capacity changes go through `--recreate` only** (`AGENTS.md` heavy-phase section). Nothing here edits the slot `config` by hand.

## 1.2 Convergence bound — what closes this design

Two closed criteria, both machine-settled, neither a matter of opinion.

1. **Verdict neutrality, across every surface this change can reach.** For all SIX surfaces whose deciding suites this design edits, the same mutant set produces the same per-mutant verdicts before and after, compared as SETS (§8 AC-1). No enrolled SOURCE is edited once tier 3 is deferred, so every surface keeps its mutant set and the comparison is a plain equality rather than the three-part argument an earlier draft needed.
2. **Admission, with no state in which anything waits forever.** The class admits exactly one score run at a time; total heavy concurrency never exceeds the ordinary slot count; a nested mutation run REFUSES with a non-zero exit rather than queueing. "The second acquirer waits" is deliberately NOT the criterion — round 2 demonstrated a deadlock that satisfies it — so AC-2c constructs that cycle and requires every participant to reach a terminal state.

Every input is handled correctly or signaled, never silently wrong. A conservative outcome plus a surfaced warning — a run that waits longer than expected, a cleanup that finds nothing to remove — is a DOCUMENTED LIMIT under §7, not a finding.

---

## 2. Goal and non-goals

**Goals.** Stop the accumulation. Bound the concurrent churn. Reduce the per-run churn at the four suite-sets §1.3 measures. Change no verdict.

**Non-goals.** Rewriting the mutation harness. Re-enrolling or de-enrolling any surface. Changing `registry.ts` (deliberate — see §6). Re-including the thirty-two-form case. Making the deciding suites faster in general.

---

## 3. Design — two tiers ship here, a third is filed

Ordered by cost-to-benefit, not by the order the row happened to state them.

### 3.1 Tier 1 — cleanup (largest win, cheapest, independent of everything else)

Every scratch-creating suite gets a matching removal. The shape is `premiseScan.test.ts`'s: create in module scope or a helper, remove in `afterAll`, and let per-case uniqueness come from the filename.

Two properties make this the first tier. It addresses the accumulation limb, which neither other tier touches at all. And it needs no cache work, so it does not wait on the seam.

Cleanup must be in a `finally` or `afterAll` so a failing case still removes its root — a cleanup that only runs on success leaks exactly when a suite is being debugged, which is when it runs most often.

### 3.2 Tier 2 — single-slot admission class for mutation runs

At most one mutation-score run generates churn at a time. Ordinary suites keep the 2-slot class. Design in §4.2, because the obvious implementation is wrong in a way that is worth stating at length.

### 3.3 Tier 3 — cache invalidation and root reuse — DEFERRED to a successor row, not shipped here

Making `sourceCache` invalidatable and reusing roots under it is **out of scope for this design**, filed as its own row (§9). Four measurements put it there, and two are decisive alone:

- **It retires an ASSERTED contract.** `tests/styles/interactiveScanCore.test.ts:444` — `it("parses each file ONCE per process, by path")` — asserts the stale read on purpose, and its comment calls the freeze "a real contract" because the scan runs three times over ~350 files. Changing that is a design decision, not a task rider, and it deserves its own spec.
- **Its case matrix ratchets.** Plan review round 1 took it from four cases to five; round 2 then named four MORE wrong implementations the five still admit (`Math.trunc(mtimeMs)`, a one-sided mtime compare, a one-sided size compare, and `basename` plus metadata aliasing common corpus filenames). One new family per round with no decay is the shape the round-economy rules answer by narrowing or killing, never by growing the matrix.
- **The return is small.** Only two of the six in-scope suites import the scanner, so reuse converts 50 of the 230 roots created per run. Tier 1 fixes the whole leak without it.
- **It is the only verdict-risky tier.** Removing it means this design edits no enrolled SOURCE at all, so no re-score, no `GUARD SURFACE` score arm, and no mutation-slot request.

What ships here is tiers 1 and 2, which together stop the accumulation and bound the concurrency.

---

## 4. Mechanism

### 4.1 Cache invalidation

Preferred: key on `(path, mtimeMs, size)`. A fixture rewritten within the same millisecond with the same length would collide, which is reachable in a tight test loop, so the fallback is a content hash. The decision belongs to the plan with a probe behind it, not to this document by assertion.

`scanInteractiveElements(rootDir)` is the only entry point (`tests/styles/interactiveScanCore.ts:884`), and `parse(file)` at `tests/styles/interactiveScanCore.ts:481` is the only reader. The blast radius is one module.

### 4.2 The admission class, and the trap in the obvious version

`scripts/with-heavy-slot.py` takes one of N flock'd slot files and then `execvp`s into the command, so the wrapper process BECOMES the command and the lock rides through `exec` on an inheritable fd. A crash at any signal releases the slot with no cleanup code.

**The obvious implementation is wrong.** Pointing a mutation run at a second slot directory via `FX_HEAVY_SLOT_DIR` gives it a mutation slot but NOT an ordinary one. Two directories are two independent semaphores, so a mutation run plus two ordinary suites is THREE concurrent heavy phases — more load than today, from a change whose whole purpose is less. `AGENTS.md` already forbids setting that variable in a production session, and this is the reason.

**The shape that works.** A mutation run takes an ADDITIONAL exclusive lock alongside its ordinary slot, both fds inheritable through `exec`, both released at process death by the same mechanism. Total concurrency stays at the ordinary slot count; mutation exclusivity is the extra lock.

**Lock ordering is load-bearing.** The class lock is acquired FIRST, then the ordinary slot. The reverse deadlocks: run A holds a slot and waits for the class while run B holds the class and waits for a slot. Class-first gives a global order, and ordinary runs never want the class lock, so no cycle exists.

**Reentrancy, and two rounds of getting it wrong.** `FX_HEAVY_SLOT_HELD` names one slot as `path:pid`, validated three ways before it is trusted (`scripts/with-heavy-slot.py:381`). Nested invocations pass through under the outermost holder (`scripts/with-heavy-slot.py:683`).

Round 1 found that the marker proves an ORDINARY SLOT is held and says nothing about the class, so a mutation run nested under an ordinary holder inherited a claim nobody made. Round 2 found that the repair — give the class its own marker and let a nested run acquire the class — **deadlocks**, and the cycle is worth stating because it is the reason for the shape below. At one configured slot: ordinary run A holds the slot; mutation run B holds the class and waits for the slot; A spawns nested mutation work, which inherits A's slot and waits for B's class; A cannot release the slot until its child returns, B cannot release the class until it gets the slot. Closed cycle. Class-first ordering is exactly what the inherited slot violates.

**So a nested mutation run REFUSES rather than waits.** When `--class` is requested and a valid slot marker is inherited, the wrapper exits non-zero with a message naming the outermost-wrap rule, instead of queueing behind a lock it can never win. This cannot deadlock (nothing waits while holding), cannot exceed the ceiling (nothing runs unadmitted), and cannot be silent (the operator is told). It is the narrowing repair the round-economy rules prescribe: decline the case that cannot be served safely and surface it, rather than widening the mechanism until it can.

The refusal is correct on the merits too — a mutation score nested inside another heavy phase violates the outermost-wrap rule that `AGENTS.md` already states, so the case being refused is a misuse rather than a workflow.

**No class marker is inherited, which closes the PID-reuse hole with it.** Round 2's second finding was that a class marker validated by "recorded pid is alive AND the file is locked" is an ABA: a descendant can outlive its ancestor, the pid be reused by a NEW mutation holder, and the stale marker then match live metadata, a live pid and a held lock — admitting a second mutation run. Since a nested invocation now refuses instead of consulting a class marker, there is no class marker to spoof. The slot marker keeps its existing validation, unchanged and already shipped.

**Precedent for a non-slot file in the slot directory.** `recreate.lock` already lives there (`scripts/with-heavy-slot.py:434`), and slot enumeration filters on `^slot-(\d+)$` (`scripts/with-heavy-slot.py:47`), so a class lock file is ignored by the recreate path without changing it.

### 4.3 Guard conditions

| input | behavior |
| --- | --- |
| class lock file absent | created on first use, same as a slot file (`O_CREAT`) |
| holder killed by any signal, `SIGKILL` included | kernel releases both fds at process death; no cleanup code |
| `FX_HEAVY_DISABLE` set | `execvp` immediately, no slot and no class lock — unchanged |
| nested mutation run under an inherited slot marker | REFUSES: non-zero exit naming the outermost-wrap rule (§4.2). It does not pass through and does not queue |
| stale `FX_HEAVY_SLOT_HELD` from a dead ancestor | already detected and cleared (`scripts/with-heavy-slot.py:414`); class lock follows the same path |
| cleanup runs on an already-removed root | `rmSync(..., { force: true })` is a no-op |
| cleanup runs while a case failed | `finally` / `afterAll` still executes |
| a suite creates zero roots | cleanup is a no-op; no suite is required to create one |

---

## 5. Interfaces

**`pnpm heavy --class mutation -- <cmd>` does NOT work, and the reason is why this section names a second script instead.** The `heavy` script already ends in its own separator (the repository-root `package.json`, `heavy` entry — cited by name because a root-level filename is an ambiguous citation), so the flag arrives as `-- --class mutation -- <cmd>`; `split_argv` (`scripts/with-heavy-slot.py:60`) splits on the FIRST bare `--`, leaving the wrapper with no flags and `--class` as `command[0]`. The flag would be silently swallowed into the command line.

So the class is reached by its own script, with the flag ahead of the separator:

```
"heavy:mutation": "tsx scripts/heavy-reap.ts --kill --quiet; python3 scripts/with-heavy-slot.py --class mutation --"
```

`pnpm heavy` is untouched and keeps today's behavior exactly.

**A class nobody invokes is not a bound, so `AGENTS.md` is part of this change.** Its heavy-phase section currently tells operators to run mutation work as `pnpm heavy pnpm mutation:guards`, and a compliant operator following it would never request the class. That section is updated to name `pnpm heavy:mutation` for `mutation:guards`, `mutation:browser` and any `--project mutation` run, and `AGENTS.md` is therefore in the declared touch set — an omission round 3 caught.

**Unknown class values are rejected, not created.** `--class` accepts a closed set (`mutation` today); anything else exits 2 naming the accepted values. Without that, a typo mints its own independent lock and reports success while bounding nothing — the failure mode being fixed, wearing a different name.

No TypeScript interface changes outside `interactiveScanCore.ts`, whose cache is module-private today and stays so unless the explicit-invalidate option is chosen, in which case exactly one function is exported.

---

## 6. Seam with #877 and #879

The kickoff brief assumed this work collides with `tests/mutation/source/**`, which both unmerged branches carry edits to. Diffed against `origin/main` at `8bf870991`, that assumption does not hold for the files this design touches:

- `origin/docs/control-outline-forward-guard` (#877) changes `tests/mutation/source/{registry,mutantOverlay.config,expectedLedgerKinds}.ts`, two fixtures, `tests/mutation/_meta{OverlayConfigParity,PremiseContract}.test.ts`, plus the residue scanner and its meta-suite. Those last two are introduced BY that branch and do not exist on main, which is why they are named here rather than cited by path.
- `origin/fix/yaml-run-scalar-quoting-decode` (#879) changes `tests/mutation/source/registry.ts`.
- This design touches `tests/styles/interactiveScanCore.ts`, the six leaking suites in §1.4, `scripts/with-heavy-slot.py` and `package.json`.

The intersection is empty. The only shared file either branch would contend for is `registry.ts`, and nothing here needs it: no surface is enrolled or de-enrolled and no registry row changes. With tier 3 deferred this is now a statement about scores as well as enrolment — **no enrolled SOURCE is edited at all**, so no re-score is owed, the `GUARD SURFACE` score arm does not apply to the round-1 diff brief, and this arc requests no mutation slot. Implementation was opened early by the orchestrator on this evidence.

---

## 7. Documented limits

- **`fseventsd` remains unbounded.** Every tier reduces the events offered to it; none caps what it does with them. A sufficiently large run still grows it. Re-file trigger: a swap or load incident recurring with all three tiers shipped.
- **The class bounds mutation runs against each other, not against everything.** One mutation run plus one ordinary full suite is still two heavy phases, which is the intended capacity.
- **`(path, mtimeMs, size)` keying can collide** on a same-millisecond, same-length rewrite. Behavior is a stale parse — the exact defect being fixed — so the plan probes it and falls back to a content hash if reachable. Stated here so the choice is not silently made in code.
- **Cleanup does not reclaim the existing 781,949 directories.** Removing them is an operator action, not a code change, and is out of scope. Re-file trigger: if a one-shot reclaim script is wanted, it is its own row.
- **A crashed parent can over-admit, and the class inherits that exactly as the slot does.** Node-spawned children do not inherit the slot fd, so killing a top-level runner releases its slot while a heavy child keeps running. This is PRE-EXISTING and already named by the semaphore's own design as early release / over-admission (`docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md:242`), with an executable case pinning it (`tests/scripts/withHeavySlot.test.ts:315`). The class lock has the same fd lifetime, so a crashed mutation runner can leave a mutant child churning while a new class holder is admitted. **Deliberately not repaired here:** fixing it means changing the semaphore's fd-inheritance semantics for every caller, which is a redesign of a surface this arc does not otherwise touch (disposition reason (c)), and the existing behavior is the documented contract rather than a defect this design introduces. AC-3 measures admission, not post-crash residue, and says so. Re-file trigger: a measured incident where an orphaned mutant child, not a live run, drove the churn — which the reaper (`pnpm heavy:reap`) already exists to bound.

- **§1.3's per-run measurements are a snapshot** at `bcd3d088e`. A new scratch-heavy surface changes what the worst sets are, and nothing in this design notices. The derived in-scope rule (§1.4) picks up a newly-enrolled surface automatically, but the MEASUREMENTS are not re-taken by anything; AC-6 re-runs the probe only on the four sets named. Re-file trigger: a surface enrolled after this merges whose suite-set creates roots at the scale of the four.
- **Re-including the thirty-two-form case is not measured here.** Tier 3 is the mechanism that would permit it; whether it then fits the shard budget is the ctloutline arc's measurement. Re-file trigger: tier 3 merges.

---

## 8. Acceptance criteria

- **AC-1 (verdict neutrality, the closed criterion).** Tier 1 edits the deciding suites of six enrolled surfaces, so it must move no verdict. For **all six** — `controlOutlineScan`, `interactiveScanCore`, `modal-wait-helper-scan`, `modal-wait-disposition`, `mutationSurfaceEnumerate`, `mutationSurfaceTotality` — the pre-change and post-change runs produce the identical mutant set and identical per-mutant verdicts, compared as SETS so an equal total with two verdicts swapped fails.

  With tier 3 deferred, `interactiveScanCore` REJOINS this comparison: no enrolled SOURCE is edited, so every surface keeps its mutant set and a plain before/after equality is expressible for all six. The earlier AC-1b (prove the two arms differ) and AC-1c (re-score the changed source, plus behavioral cache cases) are **retired with tier 3** — there is no on/off layout switch to prove and no changed predicate to score. They move to the successor row in §9 as design inputs.

  Cheap by construction: cleanup runs in `afterAll`, after every assertion, so the mechanism cannot reach a verdict except by leaving the filesystem different, which is the thing being fixed.

- **AC-2 (admission).** With the class lock held, a second `--class mutation` acquirer waits and does not proceed; an ordinary `pnpm heavy` acquirer still proceeds while a slot is free. Asserted against the wrapper's own code path.

- **AC-2b (nested class REFUSAL, not waiting).** A `--class mutation` invocation nested under an inherited slot marker exits non-zero naming the outermost-wrap rule. The case asserts the non-zero exit and the message, NOT merely that the process does not proceed — round 2's finding was that "the nested process waits" is satisfied by a deadlock, so waiting is the wrong thing to assert.

- **AC-2c (no deadlock under the round-2 cycle).** The exact reported cycle is constructed at `FX_HEAVY_SLOTS=1`: an ordinary holder, a mutation acquirer waiting for the slot, and nested mutation work under the ordinary holder. All three must reach a terminal state within a bounded time. This is the regression case for the repair that round 2 rejected.

- **AC-2d (the PRODUCTION entry point, not just the wrapper).** AC-2, AC-2b and AC-2c exercise the wrapper's own Python path, which passes whether or not the shipped script actually delivers the flag. AC-2d therefore drives the operator command `pnpm heavy:mutation` end to end and asserts the class was taken: two concurrent `pnpm heavy:mutation` invocations serialize. This is the criterion that fails if the package script omits `--class`, misorders it relative to the separator, or regresses to a form `split_argv` swallows — the exact defect round 3 found in the first draft's `pnpm heavy --class mutation`, which no wrapper-level case could have caught.

- **AC-2e (unknown class values are rejected).** An implementation that accepts `mutation` correctly AND accepts `mutaton` under its own independent lock satisfies every other criterion here, while one run under each spelling proceeds concurrently and exceeds the ceiling. AC-2e passes an unknown value and asserts exit 2 naming the accepted set. A closed set that nothing tests is a comment.

- **AC-3 (concurrency ceiling unchanged).** Total simultaneous heavy phases never exceeds the configured slot count with the class in use. Run at `FX_HEAVY_SLOTS=2` with one class holder and two ordinary acquirers: at most two run at once. Under the rejected second-directory design that count is three, so the case discriminates the designs rather than merely exercising the shipped one.

- **AC-4 (cleanup completeness).** After running each repaired suite, the count of its temp-root family in TMPDIR is unchanged from before the run. Measured by family prefix, before and after, in the same command.

- **AC-5 (cleanup survives failure).** A deliberately failing case in a repaired suite still removes its root.

- **AC-6 — RETIRED with the deferred tier.** It required each suite-set to report fewer roots AND fewer filesystem-mutating calls. Cleanup does neither: the same roots are created, and adding `rmSync` strictly INCREASES the measured call count. The quantity this design moves is RESIDUE, which AC-4 asserts at zero per suite-set. A gate that cannot pass on a correct change is worse than no gate; the probe is still run and its before/after recorded as evidence, with the expected shape being roots unchanged, calls slightly up, residue zero.

AC-1 is the criterion the design closes on. AC-2 through AC-6 are the supporting guarantees.

---

## 9. Peers filed rather than fixed

Per the class-sweep disposition rule, every peer this design does not repair names which exception applies.

- **The 56 non-amplified files (106 call sites) that also never clean up.** Reason (c): the repair spans enough sites to blow this arc's review scope, and a guard over the whole test tree is a new surface needing its own enrolment and convergence criterion. Explicitly NOT filed under "same defect, different file", which the disposition rule says is never sufficient on its own — the boundary is that these leak linearly with ordinary runs while the in-scope six are multiplied by a mutant loop. Filed with the §1.4 census as its incident evidence.
- **Cache invalidation and root reuse (`BL-MUTATION-SCANNER-CACHE-INVALIDATION`).** Reason (c): it is a redesign of a surface this arc does not otherwise touch. Filed with everything the successor needs as inputs rather than as a bare pointer — the asserted contract it must retire (`tests/styles/interactiveScanCore.test.ts:444`), the probe that pre-refutes that contract's performance rationale (statting all 254 corpus `.tsx` files three times costs about 1 ms, so an mtime check is not what the cache is protecting against), the four wrong implementations plan review round 2 showed a five-case matrix still admits, and the two suites that would actually convert.

- **Re-including the thirty-two-form case.** Reason (b): fenced by §1.1 as the ctloutline arc's ratified scope. **Its trigger chain now runs through the row above** — that case was excluded because roots could not be shared, so it waits on cache invalidation shipping, not on this design.
- **Reclaiming the existing 781,949 directories.** Reason (a): whether to reclaim automatically, and where, is an operator decision this PR cannot settle.

The six leaking suites in §1.4 are all repaired in-branch. "Same defect, different file" is never a sufficient reason to defer, and they are the default case the rule covers.

---

## 10. Out of scope

Harness redesign; surface enrolment changes; suite performance work unrelated to scratch roots; CI runner sizing; anything in `registry.ts`.
