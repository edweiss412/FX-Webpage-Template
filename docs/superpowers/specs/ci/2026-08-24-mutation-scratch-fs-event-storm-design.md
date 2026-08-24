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

The multiplication is elsewhere: the harness runs the surface's whole deciding suite as a fresh child process once per mutant (`tests/mutation/source/childRun.ts:30`, `cwd: root`). Every root that suite creates for its own fixtures is therefore re-created once per mutant.

**A correction the filed row needs, stated here because it changes the target.** Root reuse is a saving WITHIN one suite run, not across mutants. Separate mutants are separate processes and never shared a root, so a suite creating N roots per run drops to one — about 4x on `controlOutlineScan` and about 32x on the case `67471884a` excluded, not the ~250x a per-mutant reading suggests. The row's original "~250x" was a per-mutant reading and is wrong; BACKLOG.md carries the correction as of `710230abd`.

### 1.3 Probes run for this spec

Every claim below is a command that was run, not an inference. Probe scripts live in the scratchpad and are not committed; the commands are stated so any reader can re-run them.

**P1 — mutant census (static, no suite runs).** Importing `GUARD_SURFACES` and `generateMutants` and summing: **4,360 mutants across 42 enrolled surfaces** on `origin/main` at `8bf870991`.

**P2 — filesystem-mutating calls per deciding-suite run.** A `--require` preload wrapping `mkdtempSync`, `mkdirSync`, `writeFileSync`, `appendFileSync`, `rmSync`, `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync`, `cpSync` and `symlinkSync`, appending at CALL TIME through a raw fd. Two defects were found and fixed in the probe before its output was trusted, and both are worth recording because either would have produced confident wrong numbers:

- An exit-handler version lost every vitest WORKER's counts, because a killed worker never runs an exit handler. It reported 3 where the call-time version reports 1,151.
- A naive logger recursed: `appendFileSync` calls `writeFileSync` internally, so patching both made the logger call itself. Self-test showed 60,776 spurious `writeFileSync` calls for three real ones. A reentrancy guard fixes it.

Measured (`fsops/run` x mutants = per scored pass):

| surface | fsops/run | mutants | per scored pass |
| --- | ---: | ---: | ---: |
| premiseScan | 1,896 | 193 | 365,928 |
| mutationSurfaceEnumerate | 468 | 249 | 116,532 |
| ledgerGit | 1,151 | 99 | 113,949 |
| interactiveScanCore | 274 | 272 | 74,528 |
| claimSweep | 62 | 106 | 6,572 |
| specLintNumerics | 6 | 520 | 3,120 |
| connectionCensus | 6 | 333 | 1,998 |
| sendAuthScan | 6 | 291 | 1,746 |
| redContract | 6 | 246 | 1,476 |
| destructiveFileAnalysis | 6 | 237 | 1,422 |

Six is the vitest floor, not suite activity. **The top four carry 670,937 of the 687,271 calls measured across these ten, or 97.6%** — that is the prioritization evidence, and it says this is not a uniform tax and a uniform fix would be misdirected. The other 32 surfaces are unmeasured; the claim is scoped to the ten in the table.

**P3 — Tailwind is not the cache (a negative result, and it matters).** `__unstable__loadDesignSystem` re-reads the same absolute path fresh: writing a `@theme` token, loading, then REMOVING the token and loading the same path again returns `[null]` for the candidate. The CSS side is exonerated.

The first version of P3 was invalid and is recorded rather than discarded: it varied the token's VALUE, and Tailwind emits `var(--token)`, so the output could not express the change. It reported "identical" and would have read as proof of caching. A probe whose fixture cannot vary the field under test reports no difference and looks like evidence.

**P4 — the cache, located and convicted.** `tests/styles/interactiveScanCore.ts:479` declares a module-level `Map<string, ts.SourceFile>` keyed by absolute path, read at `tests/styles/interactiveScanCore.ts:482`, written at `tests/styles/interactiveScanCore.ts:492`. A repository-wide grep returns exactly those three references, so **no invalidation path exists** — that is a derived cover, not an enumeration I might have cut short. Probed both directions in one process:

- One reused root, two different fixtures written to the same path: the second scan returns the FIRST fixture's classes.
- Two separate roots: both scans return their own classes correctly.

The second half is the negative control. Without it the first half cannot distinguish "the cache is stale" from "the probe cannot see anything".

### 1.4 The second limb: the leak, which the incident never named

The incident was read as transient churn during runs. It is also permanent accumulation, and that limb is larger.

Four of five sampled scratch-creating suites create a root per case and never remove it:

| producer | `mkdtempSync` | `rmSync` |
| --- | ---: | ---: |
| `tests/log/mutationSurface/enumerate.test.ts` | 3 | **0** |
| `tests/styles/interactiveScanCore.test.ts` | 3 | **0** |
| `tests/ci/_metaModalWaitHelper.test.ts` | 4 | **0** |
| `tests/styles/_metaControlOutlineFill.test.ts` | 2 | **0** |
| `tests/mutation/source/premiseScan.test.ts` | 2 | 2 |

`premiseScan.test.ts` is the counterexample and the model: one root for the whole file (`tests/mutation/source/premiseScan.test.ts:23`), removed in `afterAll` (`tests/mutation/source/premiseScan.test.ts:24`), with per-case uniqueness carried by FILENAME rather than by a new directory. Its high `fsops/run` is `writeFileSync` per case inside one reused root, which is the correct shape already.

Measured at 17:33 CDT on 2026-08-24 by `find "$TMPDIR" -maxdepth 1 -type d -name '*-*' | wc -l`, this machine held **781,949 leaked directories in one flat TMPDIR**: 408,864 `mutation-surface-`, 249,666 `scan-fixture-`, 30,000 `modal-wait-guard-`, 10,137 `modal-wait-product-`, and 83,282 across smaller families. A re-count nineteen minutes later returned 781,981, so the population was still growing while this spec was being written.

Sampled, the directories are **mostly empty** — so the cost is inodes, directory entries and `fseventsd` journal volume, not disk space. That same `find` took **76.0 s**; the shell-glob form (`ls -d "$TMPDIR"/*/`) did not finish inside a 180 s timeout. Every subsequent `mkdtempSync` pays for the directory's size, because creating a uniquely-named entry in a 780k-entry directory is not free.

This explains something the transient reading does not: why the box degraded progressively across days rather than only while runs were live.

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

1. **Verdict neutrality.** On one cheap enrolled surface, the same mutant set produces the same verdicts with root reuse ON and OFF. The comparison is the acceptance, and §8 states it as a command with an expected equality.
2. **Admission.** The mutation class admits exactly one score run at a time, and total heavy concurrency never exceeds the ordinary slot count. Provable by a test that takes the class lock and asserts the second acquirer waits.

Every input is handled correctly or signaled, never silently wrong. A conservative outcome plus a surfaced warning — a run that waits longer than expected, a cleanup that finds nothing to remove — is a DOCUMENTED LIMIT under §7, not a finding.

---

## 2. Goal and non-goals

**Goals.** Stop the accumulation. Bound the concurrent churn. Reduce the per-run churn at the four surfaces that carry it. Change no verdict.

**Non-goals.** Rewriting the mutation harness. Re-enrolling or de-enrolling any surface. Changing `registry.ts` (deliberate — see §6). Re-including the thirty-two-form case. Making the deciding suites faster in general.

---

## 3. Design — three tiers, smallest first

Ordered by cost-to-benefit, not by the order the row happened to state them.

### 3.1 Tier 1 — cleanup (largest win, cheapest, independent of everything else)

Every scratch-creating suite gets a matching removal. The shape is `premiseScan.test.ts`'s: create in module scope or a helper, remove in `afterAll`, and let per-case uniqueness come from the filename.

Two properties make this the first tier. It addresses the accumulation limb, which neither other tier touches at all. And it needs no cache work, so it does not wait on the seam.

Cleanup must be in a `finally` or `afterAll` so a failing case still removes its root — a cleanup that only runs on success leaks exactly when a suite is being debugged, which is when it runs most often.

### 3.2 Tier 2 — single-slot admission class for mutation runs

At most one mutation-score run generates churn at a time. Ordinary suites keep the 2-slot class. Design in §4.2, because the obvious implementation is wrong in a way that is worth stating at length.

### 3.3 Tier 3 — make `sourceCache` invalidatable, then reuse roots

Key the cache on content rather than path alone (content hash or `mtime` + size), or export an explicit invalidation the fixture helpers call between cases. Then a suite creating N roots per run creates one.

Tier 3 is last because it is the only tier that can change a verdict if done wrong, and because its benefit (per-suite-run churn) is smaller than tier 1's (unbounded accumulation).

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

**Reentrancy.** `FX_HEAVY_SLOT_HELD` names one slot as `path:pid` and is validated three ways before it is trusted (`with-heavy-slot.py:380-418`). Nested invocations pass through under the outermost holder, which stays correct: the class lock is held by the same process for the same lifetime, so a nested phase that passes through the slot also passes through the class.

**Precedent for a non-slot file in the slot directory.** `recreate.lock` already lives there (`scripts/with-heavy-slot.py:434`), and slot enumeration filters on `^slot-(\d+)$` (`scripts/with-heavy-slot.py:47`), so a class lock file is ignored by the recreate path without changing it.

### 4.3 Guard conditions

| input | behavior |
| --- | --- |
| class lock file absent | created on first use, same as a slot file (`O_CREAT`) |
| holder killed by any signal, `SIGKILL` included | kernel releases both fds at process death; no cleanup code |
| `FX_HEAVY_DISABLE` set | `execvp` immediately, no slot and no class lock — unchanged |
| nested mutation run under a live holder | passes through; does NOT take a second class lock |
| stale `FX_HEAVY_SLOT_HELD` from a dead ancestor | already detected and cleared (`scripts/with-heavy-slot.py:414`); class lock follows the same path |
| cleanup runs on an already-removed root | `rmSync(..., { force: true })` is a no-op |
| cleanup runs while a case failed | `finally` / `afterAll` still executes |
| a suite creates zero roots | cleanup is a no-op; no suite is required to create one |

---

## 5. Interfaces

`pnpm heavy --class mutation -- <cmd>`, with `--class` absent meaning today's behavior exactly. The flag name and whether an env form is also accepted are the plan's to fix; what this document fixes is that the class is an ADDITIONAL lock and that it is acquired first.

No TypeScript interface changes outside `interactiveScanCore.ts`, whose cache is module-private today and stays so unless the explicit-invalidate option is chosen, in which case exactly one function is exported.

---

## 6. Seam with #877 and #879

The kickoff brief assumed this work collides with `tests/mutation/source/**`, which both unmerged branches carry edits to. Diffed against `origin/main` at `8bf870991`, that assumption does not hold for the files this design touches:

- `origin/docs/control-outline-forward-guard` (#877) changes `tests/mutation/source/{registry,mutantOverlay.config,expectedLedgerKinds}.ts`, two fixtures, `tests/mutation/_meta{OverlayConfigParity,PremiseContract}.test.ts`, plus the residue scanner and its meta-suite. Those last two are introduced BY that branch and do not exist on main, which is why they are named here rather than cited by path.
- `origin/fix/yaml-run-scalar-quoting-decode` (#879) changes `tests/mutation/source/registry.ts`.
- This design touches `tests/styles/interactiveScanCore.ts`, the four leaking suites in §1.4, `scripts/with-heavy-slot.py` and `package.json`.

The intersection is empty. The only shared file either branch would contend for is `registry.ts`, and no tier here needs it — nothing is enrolled, de-enrolled or re-scored. **The orchestrator rules on whether implementation opens early; this section supplies the evidence, not the decision.**

---

## 7. Documented limits

- **`fseventsd` remains unbounded.** Every tier reduces the events offered to it; none caps what it does with them. A sufficiently large run still grows it. Re-file trigger: a swap or load incident recurring with all three tiers shipped.
- **The class bounds mutation runs against each other, not against everything.** One mutation run plus one ordinary full suite is still two heavy phases, which is the intended capacity.
- **`(path, mtimeMs, size)` keying can collide** on a same-millisecond, same-length rewrite. Behavior is a stale parse — the exact defect being fixed — so the plan probes it and falls back to a content hash if reachable. Stated here so the choice is not silently made in code.
- **Cleanup does not reclaim the existing 781,949 directories.** Removing them is an operator action, not a code change, and is out of scope. Re-file trigger: if a one-shot reclaim script is wanted, it is its own row.
- **The four-surface concentration is a snapshot** at `8bf870991`. A new scratch-heavy surface changes it, and nothing here notices. A structural guard requiring cleanup at every `mkdtempSync` site is the mechanizable form; it is filed rather than built (§9).
- **Re-including the thirty-two-form case is not measured here.** Tier 3 is the mechanism that would permit it; whether it then fits the shard budget is the ctloutline arc's measurement. Re-file trigger: tier 3 merges.

---

## 8. Acceptance criteria

- **AC-1 (verdict neutrality, the closed criterion).** On `controlOutlineScan` — 65 mutants, 4 roots per run, about 1.1 s per run, and deliberately NOT `controlOutlineResidue` — a full scored run with root reuse OFF and one with it ON produce the identical mutant set and identical per-mutant verdicts. Compared as sets, not as counts, so a coincidental equal total cannot pass.
- **AC-2 (admission).** With the class lock held, a second `--class mutation` acquirer waits and does not proceed; an ordinary `pnpm heavy` acquirer still proceeds while a slot is free. Asserted against the wrapper's own code path.
- **AC-3 (concurrency ceiling unchanged).** Total simultaneous heavy phases never exceeds the configured slot count with the class in use. This is the assertion that would have failed on the second-directory design in §4.2.
- **AC-4 (cleanup completeness).** After running each repaired suite, the count of its temp-root family in TMPDIR is unchanged from before the run. Measured by family prefix, before and after, in the same command.
- **AC-5 (cleanup survives failure).** A deliberately failing case in a repaired suite still removes its root.
- **AC-6 (churn reduction, measured not assumed).** The P2 probe re-run on a repaired surface reports fewer filesystem-mutating calls per run than the §1.3 table records, with both numbers produced by the same probe.

AC-1 is the criterion the design closes on. AC-2 through AC-6 are the supporting guarantees.

---

## 9. Peers filed rather than fixed

Per the class-sweep disposition rule, every peer this design does not repair names which exception applies.

- **A structural guard requiring cleanup at every `mkdtempSync` site in `tests/`.** Reason (c): it is a new guard surface over the whole test tree, spanning far more sites than this arc's review scope, and it would need its own enrolment and convergence criterion. Filed with the §1.4 census as its incident evidence.
- **Re-including the thirty-two-form case.** Reason (b): fenced by §1.1 as the ctloutline arc's ratified scope.
- **Reclaiming the existing 781,949 directories.** Reason (a): whether to reclaim automatically, and where, is an operator decision this PR cannot settle.

The four leaking suites in §1.4 are all repaired in-branch. "Same defect, different file" is never a sufficient reason to defer, and they are the default case the rule covers.

---

## 10. Out of scope

Harness redesign; surface enrolment changes; suite performance work unrelated to scratch roots; CI runner sizing; anything in `registry.ts`.
