# Mutation outcome attribution — one verdict name, two events — design

**Row:** `BL-MUTATION-SCORE-NONDETERMINISM` (`BACKLOG.md:53`).
**Branch:** `fix/mutation-score-nondeterminism`.
**Status:** spec.

---

## 1. Problem

`KILLED` names two different events.

- An assertion in a deciding suite rejected the mutant.
- A child process hit the 180-second wall-clock ceiling and was killed.

Both reach the same word by the same line. `runSuite` returns `MUTANT_TIMEOUT_EXIT` (124) for a timed-out child (`tests/mutation/source/runner.ts:112`, constant at `tests/mutation/source/runner.ts:51`); `classify` maps every non-zero exit to `KILLED` (`tests/mutation/source/oracle.ts:12`); `runSurface` consumes that number inline at `tests/mutation/source/runner.ts:165` and stores nothing but the verdict, because `MutantOutcome` is `{ siteId, verdict }` (`tests/mutation/source/runner.ts:28`).

That the two events share a verdict is deliberate and defensible — `runner.ts:44-49` argues it, and Stryker and PIT both count a timeout as detected. **This spec does not contest the verdict.** It contests that the two events share a verdict *and leave no trace of which one happened*, so no reader of the output, the gate, the ledger or a CI annotation can tell them apart.

This is the shape a name collision takes at the verdict layer: one name resolving to two functions, where a claim recorded against the name certifies whichever one the reader assumes.

**The consequence, stated at the size it actually is.** Every `0 unaccepted survivors` claim in this repo is a claim about the deciding suites' power. A timeout is not evidence about the suites — it is evidence about wall clock. Where the two are spelled identically, a score cannot be audited against the question it is quoted for. This is a FIDELITY defect and it stands on its own, whether or not a timeout ever explains an observed verdict flip (§2).

### 1.0 The historical record of verdict movement is CI-only and failure-only — measured

The record this repo keeps of its own verdict movement cannot see most of it, and nobody knew that until it was measured (§2.5).

`psqlStartupScan` is the surface with the CLEANEST reproduction in the corpus — three documented flips against byte-identical inputs. It appears **zero times** across 19 failing `mutation-harness` runs spanning 2026-08-18 to 2026-08-21. Two independent reasons, both structural:

1. **Those flips happened in LOCAL gate runs**, which emit no annotations at all.
2. **An annotation fires only when a surface FAILS THE GATE**, so any verdict movement that does not cross a gate condition is invisible even in CI.

**A channel that cannot see the best-documented case cannot certify absence for two others.** That sentence is the justification for this whole arc: attribution is not a refinement of an adequate record, it is a record where one does not currently exist for the phenomenon in question.

**It is also a design constraint, and the sharpest one here.** A record emitted only when the gate fails would inherit exactly this defect and the next flip would be as unattributable as the last. §5.2 therefore emits on SUCCESS as well as failure, and in LOCAL runs as well as CI. A record that fires only on failure cannot measure instability.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Co-tenancy is RULED OUT as the mechanism.** An LPT re-pack changing a surface's neighbours does not move its verdict. Tested at ~30x the perturbation the original observation carried, zero flips across 38 pre-existing surfaces, with `ledgerGit` itself changing shards and staying green. | `BACKLOG.md:53` ("Co-tenancy is RULED OUT as the mechanism, by a pre-registered experiment"), run `32391432379` |
| **The verdict mapping is UNCHANGED by this spec.** A timeout still scores `KILLED`. Reclassifying it would move every enrolled surface's score while four arcs are mid-measurement against those numbers; that is an orchestrator decision, not an in-branch one. §5.5 files it with its blast radius. | This spec §4, §5.5 |
| **An infra fault is already NOT folded into `KILLED`.** A child that produced no exit status throws `MutantRunInfraError` (`tests/mutation/source/runner.ts:114`, class at `tests/mutation/source/runner.ts:65`) and is fatal to the run. That is correct and is not a gap. | `tests/mutation/source/runner.ts:53-79` |
| **`childRun` mapping a timeout to an infra error is CORRECT and is not an inconsistency.** `tests/mutation/source/childRun.ts:44-46` deliberately differs from `runSuite`: there a timeout is the mutant's own doing, here it is an authoring or infrastructure defect. One mechanism, two caller-owned interpretations, documented at `childRun.ts:25-28`. | `tests/mutation/source/childRun.ts:25-28` |
| **`BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` and `BL-MUTATION-HARNESS-MAIN-RED` are filed peers, not this arc's work.** The first is the `budget` job; the second is main's standing coverage failure set (`shardBudget`, `destructiveFileAnalysis`, `rowScanOpener`). Neither is repaired here. | `BL-MUTATION-HARNESS-MAIN-RED` at `BACKLOG.md:1190`, `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` at `BACKLOG.md:1266` — named per line rather than positionally, because the bare pair read in prose order and was reversed |
| **The intra-leg branch was PROBED and did not reproduce**, at a stated rate bound — six runs in one process varying only run index, no flip. Not "closed": six trials bound a high-rate mechanism, not a low-rate one, and §2.4 states the arithmetic. | This spec §2.4 |
| **`spawnBounded.ts` is deliberately NOT touched.** It is enrolled (`tests/mutation/source/registry.ts:2663`) at `scoreFloor: 1` with a measured 12/12, so editing it would retire that score for no gain. Every change here lands in unenrolled modules. | §5.6 |

### 1.2 Convergence bound — what closes this design

**Consequence bound.** Every mutant outcome is attributable to the evidence that produced it — a **NONZERO CHILD EXIT**, a **TIMEOUT**, or an **INFRA FAULT** — and none of the three is silently spelled as another. An outcome the harness cannot attribute is REPORTED, never scored.

**The first category is deliberately NOT "an assertion kill", and the narrowing is a contract change worth stating.** Child stdio is discarded by design (`tests/mutation/source/spawnBounded.ts:139`, rationale at `tests/mutation/source/spawnBounded.ts:128-138`), and a compile or collection failure is a real nonzero exit that the harness legitimately counts as detection (`tests/mutation/source/oracle.ts:4-8`, `tests/mutation/source/runner.ts:57-60`). So a `kind: "exit"` record certifies THAT the child exited nonzero and cannot certify WHY. Earlier drafts of this bound said "an assertion kill"; that claimed a discrimination the design does not deliver, which is the false-certification direction the bound itself forbids. Separating an assertion rejection from a compile failure would require capturing child output — out of scope here, and filed as a documented limit (§6) rather than silently implied. The forbidden directions are false CERTIFICATION and wrong ATTRIBUTION; a conservative over-report (a notice for an outcome that turns out benign) is a documented limit, not a defect.

**PROBE DOMAIN:** the 40 surfaces enrolled in `tests/mutation/source/registry.ts` (derived: `GUARD_SURFACES.length` = 40, not a recalled 38); the documented flaky observations in `BACKLOG.md:53`; and the per-child duration distributions measured in §2.

**Threat fence.** Ordinary variability of the harness under real load, local and CI. Adversarial process manipulation — a deliberately wedged child, a tampered clock, a hostile reaper — is out of scope and files to documented limits, not to a finding.

**On enrolment as a criterion.** The subject of this arc is the scorer. A mutation score is therefore a WEAKER convergence criterion here than usual, and saying so is more honest than enrolling symbolically: a score computed by the machinery under audit cannot certify that machinery. §8 states what is and is not enrolled.

---

## 2. The measurements

### 2.0 Methodology — every figure is derived by a command, never recalled

Two numbers handed to this arc as current facts were stale, and both were caught only by deriving them:

| figure | as stated | as derived | command |
| --- | --- | --- | --- |
| per-mutant child duration | ~0.75 s (`tests/mutation/source/runner.ts:21`) | 14.8-20.8 s on `psqlStartupScan` | §2.4 |
| enrolled surfaces | 38 | **40** | `GUARD_SURFACES.length` |

The first sized the timeout hypothesis at 240x and would have retired a live lead as implausible; the second is the population every probe here ranges over.

**A third stale-input defect was in this arc's OWN instrument, and it is evidence for the deliverable rather than an embarrassment.** The probe-4 sweep reported a clean zero for all 19 runs, including one documented to annotate `ledgerGit`. Two stacked causes: `sed` could not match the multibyte em-dash in `source-mutation gate — <id>`, and the loop wrapped its parse in `try/except: sys.exit(0)`, so a failed read and a genuine zero rendered identically. **A fail-open, written into the instrument auditing fail-opens** — which is direct evidence that this class is easy to write, and therefore an argument for recording evidence rather than trusting a verdict.

**Two more instances in this arc's own paperwork, recorded because they are the same class.** A peer
citation pair (`BACKLOG.md:1190` and `BACKLOG.md:1266`) was written REVERSED, in a spec whose every other citation
had been verified — verification that is thorough but not exhaustive fails exactly where attention
lapsed, which is an argument for DERIVING citation checks rather than performing them. And a rate bound
was computed from the wrong equation and not reconciled against a table printed directly beside it
(§2.4). Both were found by review, not by the author.

**Why the repairs here are by CLASS rather than by instance, with the number that settles it.** Review
round 1 named FOUR sites carrying an over-strong inference; sweeping the CLAIMS rather than the cited
sections found **NINE**. A review's finding list is a SAMPLE of a class, not the class — so a repair
that stops at the cited instances leaves the majority standing.

**How it was caught is worth one sentence of its own, because it generalises.** `BACKLOG.md:53` NAMES A SPECIFIC RUN (`32375262145`) and says what that run annotated. That concrete instance id became a mandatory positive control: the rebuilt sweep aborts unless the control run yields `ledgerGit`. **A concrete instance id in a ledger row is a test fixture for every future instrument** — a reason to keep naming them. **A number that entered the argument from a comment or from memory rather than from a command is precisely the class of input that makes a result unreproducible from its declared inputs** — which is this arc's own subject, arriving in its own paperwork. Every figure below names the command that produced it.

Four probes. Each declared its negative branch in writing BEFORE it ran, each carries its positive controls, and each states what it does NOT establish. Pre-registrations are reproduced in the probe record (§2.5).

**Which comparisons are load-bearing.** Named per probe below. A comparison that varies two things cannot carry a null, so where one exists it is labelled as corroboration and nothing more.

### 2.1 Probe 1 — a timeout is indistinguishable from an assertion kill, end to end

**Method.** An ad-hoc surface over a synthetic module whose `statement-removal` mutant deletes a loop's advance statement, producing a SYNCHRONOUS non-terminating child. The timeout was forced from the CHILD side; `MUTANT_TIMEOUT_MS` was not edited, so `spawnBounded`'s enrolled score is untouched.

**Load-bearing comparison.** Two mutants of the SAME source, SAME suite, in ONE run — varying exactly one thing, which statement was removed. One hit the ceiling; one failed an assertion.

**Result.**

| | hang mutant | assertion mutant |
| --- | --- | --- |
| wall clock | ~180 s (run total 181.6 s) | ~1 s (run total 2.2 s) |
| `MutantOutcome` | `{siteId, verdict: "KILLED"}` | `{siteId, verdict: "KILLED"}` |
| `GateResult` | `passed=true score=1.0000 failures=[]` | `passed=true score=1.0000 failures=[]` |
| printed by `surfaceCases.ts` | `""` | `""` |

Fields available to attribute an outcome: `siteId`, `verdict`. That is the entire record.

**Every pre-registered negative branch was falsified.** No distinguishing field exists; the timeout DID reach `KILLED` rather than throwing; and the hang was bound by the 180 s spawn ceiling rather than by vitest's own 30 s `testTimeout` (`vitest.projects.ts:179`) — a timer cannot fire on a thread a synchronous loop has blocked, which the 181.6 s total confirms against a ~30 s alternative.

**What this does NOT establish.** Nothing about the cause of any observed verdict flip. §2.2-§2.4 speak to that; this is a fidelity defect on its own terms.

### 2.2 Probe 2a — healthy per-child wall clock across the whole enrolled population

One unmutated child per (surface, suite): **n = 81 children over all 40 surfaces**, every baseline green.

Median 1.1 s, p90 3.1 s, max 24.4 s. Zero children at or past the ceiling.

**Per-surface headroom against 180 s — a distribution, not a max.** Only four of forty surfaces sit below 15x:

| surface | worst baseline child | headroom |
| --- | --- | --- |
| `ledgerGit` | 24.4 s | 7.4x |
| `ledgerClaimsCore` | 22.8 s | 7.9x |
| `premiseScan` | 17.3 s | 10.4x |
| `psqlStartupScan` | 15.3 s | 11.8x |

The remaining 36 range from 29x to 164x.

**The correlate the brief asked for, and it is POSITIVE.** The two surfaces with documented flaky observations — `ledgerGit` and `psqlStartupScan` — rank **#1 and #4 of 40** by worst baseline child duration, both inside that four-surface tail. Under an assumption of independence, both landing in the top 4 of 40 is roughly 0.8%.

**Why this is not post-hoc, and exactly how far that goes — both halves.** The flaky labels PREDATE the measurement: `ledgerGit` and `psqlStartupScan` are named as the flaky surfaces in `BACKLOG.md:53` before any duration here was measured, so the top-4-of-40 landing is a check against a population labelled in advance rather than a pattern fitted afterwards. **Equally: it was NOT formally pre-registered as a prediction.** The arithmetic is 6/780 ≈ 0.8% for both of two pre-labelled surfaces landing in the top 4 of 40 under independence. So it is SUGGESTIVE and NOT CONFIRMATORY, and n = 2 is the honest ceiling on what it can carry.

**Stated against it:** the two slowest surfaces share a deciding suite (`tests/scripts/ledgerClaimsCheck.test.ts`), flakiness is observed rather than sampled, and this is a correlation between flakiness and child duration — not a mechanism, and not evidence that any flip WAS a timeout. §2.5 tested it with a genuine advance prediction and the prediction did not confirm.

**The limit that governs this number (load-bearing, and stated beside the figure everywhere it appears).** These are BASELINE children. A baseline child is a HEALTHY child, so this is a LOWER BOUND on healthy duration and NOT a distance to the ceiling. A mutant that makes a suite spin rather than hang is precisely the case the timeout hypothesis is about, and no baseline measurement can see it. §2.3 measures mutant children directly for exactly this reason.

### 2.3 Probe 2b — per-mutant children on the worst-placed surface

`ledgerGit`, the 7.4x surface, measured per mutant with a five-input pair stamp emitted inside the measuring invocation.

**Result: 99 mutants, 118 children, 31.6 min. ZERO timeouts among 93 kills.** Child duration min 1.1 s, median 18.7 s, **max 25.3 s** — headroom at the measured MUTANT maximum **7.1x**. Stamp pair identical before and after.

**A claim withdrawn here, and the reason is this arc's own subject.** An earlier draft reported the worst MUTANT child as 25.3 s and derived a 1.04x mutant-versus-baseline ratio from it. Round-3 review established that the probe mixed the run's BASELINE children into the same distribution, so neither figure was supported — the maximum may have been a baseline child. **Both are withdrawn.** What survives is conservative and unaffected: zero timeouts, and no child of any kind exceeding 25.3 s, which bounds the mutant maximum from above and leaves the 7.1x headroom valid. Whether mutant children are materially slower than baseline is therefore OPEN on this surface pending a filtered re-measurement, and §6 limit 2 governs unchanged.

**Scope, and the decline stated as a decision rather than left as a gap.** The full tail-4 per-mutant sweep (`ledgerGit`, `ledgerClaimsCore`, `premiseScan`, `psqlStartupScan`) costs ~238 minutes worst case — computed as sites x suites x measured baseline — on a two-slot machine-wide semaphore with four other arcs live. It was DECLINED. `ledgerGit` alone carries the argument because it is the worst-placed surface in the population; the other three have more room, not less.

**The reading is stated here, before the number lands.** A per-mutant maximum far from 180 s weakens the timeout mechanism ON THIS SURFACE. **It does not bound any other surface**, and the spec does not claim it does: a different surface's mutation-induced slowdown is not bounded by `ledgerGit`'s mutant/baseline ratio, so for the other 39 the baseline figure remains a lower bound (§6 limit 2) and nothing here supersedes it. What the other surfaces' larger headroom supports is a PLAUSIBILITY argument — 36 of them sit at 29.0x-163.6x against `ledgerGit`'s 7.4x, so a timeout there requires a proportionally larger anomaly — and a plausibility argument is not a measurement. The three remaining tail peers (`ledgerClaimsCore` 7.9x, `premiseScan` 10.4x, `psqlStartupScan` 11.8x) sit within 1.1x-1.6x of `ledgerGit` and are the ones a further per-mutant run would have to cover.

**A corrected figure, flagged so a reviewer who recomputes does not think they found something.** An earlier draft wrote "every other surface has 4x to 22x more headroom". Measured, three surfaces have only 1.07x-1.59x more. Caught by this spec's own numeric sweep before the first review dispatch and corrected in both artifacts. If instead some mutant child approaches the ceiling, the mechanism is live and §5.5's decision becomes urgent rather than dormant.

### 2.4 Probe 3 — the intra-leg branch, PROBED AND NOT REPRODUCED

**Method.** The one known-flaky site — `relational-boundary:3578:35:<><=` on `psqlStartupScan`, `depth < 32` becoming `depth <= 32` at `tests/cross-cutting/psqlStartupFiles/scan.ts:3578` — run six times inside a SINGLE process, serial, varying exactly one thing: run index.

**Population verified before interpretation.** Source blob `a1f9db0c`, deciding suite blob `cb45f9ea` — byte-identical to the blobs `BACKLOG.md:53` records for all four prior observations. Stamp pair identical before and after.

**Three positive controls, all green.**
1. The instrument's verdicts agree with the SHIPPED `runSurface` on a real surface (`spawnBounded`, 12/12, survivors `[]`) — so a reimplementation that agrees by luck is excluded.
2. The target site RESOLVES in the runner's OWN generated set (74 mutants). This is the control an earlier session could not satisfy: its local `enumerateSites` reproduced none of the runner's site IDs, so neither of its instruments could adjudicate what a site even is.
3. The unmutated baseline is green at 15.2 s.

**Result: 6/6 SURVIVED.** Zero flips, zero timeouts, durations 14.8 / 15.7 / 15.8 / 17.8 / 17.8 / 20.8 s against a 180 s ceiling.

**Reading, as pre-registered — and stated at the strength six trials actually carry.** Six identical outcomes are not proof of absence: an intra-leg mechanism did NOT reproduce, stated at the strength six trials carry. If such a mechanism flipped the verdict with per-run probability `p`, six identical runs occur with probability `p^6 + (1-p)^6`. That expression is SYMMETRIC about `p = 0.5` and falls below 0.05 only on the interval **`0.4019 < p < 0.5981`** — so the honest statement is bounded on BOTH sides, and the meaningful regime is `p <= 0.5` (a mechanism flipping more than half the time would be trivially visible). Six trials therefore exclude only a mechanism flipping at roughly **40% per run or more**; at `p = 0.1`, six identical runs happen **53%** of the time. No control here establishes sensitivity to an intermittent flip, and none is claimed.

**The exclusion assumes INDEPENDENT trials, and this probe cannot establish that.** `p^6 + (1-p)^6` is the probability of six identical outcomes only for independent, identically distributed runs. Probe 3's six runs are SERIAL, IN ONE PROCESS — precisely where persistent environment, module cache, ordering or machine load can correlate outcomes. A mechanism with a 50% marginal rate but perfectly correlated within a process produces six identical results with probability 1, not 0.03. **So the rate exclusion is conditional on an assumption the probe design is weakest at supporting, and correlated within-process state is exactly what an intra-leg mechanism would BE.** The honest reading is therefore weaker than the arithmetic suggests: six serial runs did not reproduce the flip, and no rate is excluded without assuming independence that this design cannot demonstrate. A probe that could would vary process boundary and ordering across trials — named here as the next instrument rather than claimed as done.

**An arithmetic correction, recorded rather than quietly fixed.** An earlier draft of this section gave the bound as `p > 0.393`, derived by solving `(1-p)^6 = 0.05` and DROPPING the `p^6` term. At `p = 0.393` the correct value is `0.0537`, which is above 0.05, so the claim was false. The refuting number was printed by this arc's own probe output and was mis-read. Rule 74 says derive every reported number in the command that reports it; this figure was derived from the wrong equation and then not reconciled against the table beside it.

What that supports: the remaining space is weighted toward BETWEEN-leg differences — environment, machine, concurrency across legs, or ordering wider than one process — which is where both original observations sit (local versus CI; nightly versus PR). It is a narrowing of the search, not the elimination of a branch.

**It does not resurrect co-tenancy** (§1.1) and it is not an explanation. Ruling out a location is not a mechanism.

**Two further facts it produced.**
- 6/6 SURVIVED takes the restored ledger row to **9 of 10 observations saying that site survives**, settling the earlier single-report removal with evidence rather than judgement.
- Per-child wall clock varied **1.4x** (14.8 s to 20.8 s) with nothing varying at all. Against a 7.4x worst-surface headroom computed from a lower bound, that spread is the reason §2.2's margin is reported as a distribution rather than as reassurance.

**A premise correction this probe forced.** `tests/mutation/source/runner.ts:21` documents ~0.75 s per child. Measured on `psqlStartupScan`: 14.8-20.8 s. The comment is provenance from when one small surface was enrolled, not current data. The correction cuts both ways and that is why it matters: at 0.75 s the timeout hypothesis needs a 240x outlier and reads implausible enough to drop; at the measured figure it needs roughly 9x. **A stale premise does not only overclaim — it can retire a live lead.** Every figure in this spec is derived by a command, never read from a comment.

### 2.5 Probe 4 — the advance prediction, and an instrument that failed first

**The prediction.** If per-child duration drives flakiness, the #2 and #3 surfaces by headroom — `ledgerClaimsCore` (7.9x) and `premiseScan` (10.4x) — should ALSO show unexplained verdict movement. Neither has ever been a suspect. This is a genuine advance prediction: it was written down, with both branches and their asymmetry, before any history was read.

**The instrument failed before the world did, and it is the more useful half.** The first sweep reported "no source-mutation annotations" for ALL 19 failing runs — including run `32375262145`, which `BACKLOG.md:53` documents as annotating `ledgerGit`. Two defects stacked: `sed` could not match the multibyte em-dash in the annotation title `source-mutation gate — <id>`, and the loop wrapped its parse in `try/except: sys.exit(0)`, so a failing read and a genuine zero rendered identically. **A fail-open, written into the instrument auditing fail-opens.** It was caught only because the ledger row names a run whose annotation content is known, which is what made a positive control available at all. The rebuilt sweep ABORTS unless that control run yields `ledgerGit`.

**Result, over 19 failing `mutation-harness` runs, 2026-08-18 to 2026-08-21:**

| surface | appearances |
| --- | --- |
| `shardBudget` | 17 |
| `destructiveFileAnalysis` | 17 |
| `rowScanOpener` | 15 |
| `sendAuthScan` | 1 |
| `ledgerGit` | 1 |
| `ledgerClaimsCore` | **0** |
| `premiseScan` | **0** |

The first three are exactly `BL-MUTATION-HARNESS-MAIN-RED`'s filed standing set; `sendAuthScan`'s single appearance is the run that enrolled it.

**The prediction did NOT confirm** — branch B, which the pre-registration had already declared to be the weak branch.

**And it is weaker than the pre-registration guessed, which is the finding.** `psqlStartupScan` — the surface with the CLEANEST reproduction, three documented flips — also appears **zero** times across these 19 runs, because its flips occurred in local gate runs rather than CI legs. **A channel that cannot see the best-documented case in the corpus cannot certify absence for two others.** An annotation also fires only when a surface FAILS THE GATE, so any verdict movement that does not cross a gate condition is invisible to it entirely. Reported as "no recorded gate-failing movement", never as "no movement".

**Net.** The duration correlate gains no support and takes a weak counter-indication. It remains n = 2, suggestive, not confirmatory.

**One clean discriminator it did produce, and it SHARPENS the hypothesis rather than denting it.** The three standing-red surfaces are FAST: `rowScanOpener` 39.1x headroom, `destructiveFileAnalysis` and `shardBudget` 163.6x. So duration does NOT track failure in general. The live claim is narrower and better: **duration tracks verdict INSTABILITY, not failure.** That version survives a datum which would have killed the looser one, and it predicts the two populations look DIFFERENT rather than predicting that everything correlates — consistent failure is duration-independent, as a genuine coverage failure should be.

The n = 2 caveat stays welded to it: suggestive, not confirmatory.

### 2.6 Probe record

Full pre-registrations, commands, raw outputs and controls (including probe 4's instrument defect and its positive control): `docs/superpowers/specs/ci/probes/2026-08-21-mutation-outcome-attribution.md`.

---

## 3. What is filed, and what is not

- **(a) EXPLANATION — NOT ACHIEVED.** No mechanism is named. Co-tenancy is excluded by a pre-registered experiment; an intra-leg mechanism did not reproduce in six trials, which bounds only a high-rate one (§2.4); the anomaly stands, unexplained. **Neither is stated as a closed branch** — see §2.4 for what six trials can and cannot exclude.
- **(b) ATTRIBUTION — the deliverable.** The next occurrence is self-diagnosing rather than mysterious: the per-mutant record carries the evidence that decided its verdict, and a determinism harness exists that can be pointed at any site.

(b) ships regardless of (a). That is what makes this closable.

---

## 4. Approaches considered

| Approach | Verdict |
| --- | --- |
| **Reclassify a timeout as its own verdict** (not `KILLED`). | REJECTED here. It moves every enrolled surface's score, invalidating four arcs' in-flight measurements. Filed with its blast radius in §5.5 as an orchestrator decision. |
| **Fail the gate on any timeout.** | REJECTED as the default. It changes pass/fail on live surfaces, which is a verdict change in the only sense an operator cares about. Pre-staged as a conditional arm in §5.5 once the population count is known. |
| **Record the evidence; report it without failing anything.** | CHOSEN. Purely additive: no verdict moves, no score moves, no surface reds. |
| **Summarize the deciding event only** (a `decidedBy` field). | REJECTED. A summary is a second definition that can drift from the children it summarizes. §5.1 records every child and derives the summary. |

---

## 5. Design

### 5.1 The outcome record carries its evidence

`MutantOutcome` (`tests/mutation/source/runner.ts:28`) gains a `children` field: one record per suite-child actually executed, in execution order.

```ts
export type ChildRecord = {
  suite: string;
  kind: "exit" | "timeout";
  exitCode: number | null;   // null iff kind === "timeout"
  durationMs: number;
};

export type MutantOutcome = {
  siteId: string;
  verdict: Verdict;
  children: readonly ChildRecord[];
};
```

Kinds are named for what was OBSERVED, never for what it was interpreted to mean: `exit` and `timeout` mirror `SpawnOutcome` (`tests/mutation/source/spawnBounded.ts:82-90`). An `infra` outcome does not appear because it throws (`runner.ts:114`) and is fatal to the run.

**Why every child and not the deciding one.** `runAllSuites` short-circuits on the first non-zero (`runner.ts:136`), so the deciding child is derivable — it is the last one — while the reverse is not true. Recording all of them also makes a SURVIVOR attributable (every suite returned 0, and here is how long each took), which a `decidedBy` field cannot express at all.

**The verdict mapping is byte-for-byte unchanged.** `classify` is not touched; `MUTANT_TIMEOUT_EXIT` still flows from `runner.ts:112`.

### 5.2 The gate reports — on success, and locally

`evaluateGate` (`tests/mutation/source/gate.ts:36`) gains a `notices` array alongside `failures`. `passed` is computed from `failures` alone and its definition does not change.

```ts
export type GateNotice = {
  kind: "timeout-kill";
  site: string;
  suite: string;
  durationMs: number;
  detail: string; // human-readable rendering; the FIELDS above are what proofs compare
};
export type GateResult = { passed: boolean; failures: GateFailure[]; notices: GateNotice[]; score: Score };
```

One notice per mutant whose deciding child timed out, naming the site, the suite and the duration.

**Two emission channels, and the second is the load-bearing one.**

1. **Console**, from `surfaceCases.ts` at module scope after the run (`tests/mutation/source/surfaceCases.ts:28`), so notices appear in the leg's output whether the gate passed or failed. A passing gate otherwise prints nothing at all, which is the condition probe 1 measured.
2. **A durable per-surface run record**, written unconditionally — on success as well as failure, in LOCAL runs as well as CI — carrying every mutant's `siteId`, `verdict` and `children`. Console output in a passing CI leg is discarded with the log; the record is what makes the NEXT flip attributable after the fact.

**The sink is specified, not implied.** A record with no durable destination is the diagnosed blind spot wearing a new name, so the destination is part of this design rather than an implementation detail:

| property | value |
| --- | --- |
| path | directory `.mutation-records/` at the repo root, created on demand; one file per surface, named for the surface id with a `.json` suffix |
| override | `MUTATION_RECORD_DIR`, so a determinism run can direct records elsewhere without colliding with a gate run |
| naming / collision | one file per surface id. A surface runs at most once per leg, so within a run there is no collision; a re-run OVERWRITES, because the record describes the latest run of that surface and a monotonically growing directory in CI has no reader |
| retention (local) | until deleted; the directory is git-ignored, so it never enters a commit (`.gitignore` is in the touched set, §5.6) |
| retention (CI) | uploaded by the `source-shards` job with `actions/upload-artifact@v4`, `if: always()`, name `mutation-records-source-shards-${{ matrix.shard }}` — mirroring the `elapsed.txt` upload already at `.github/workflows/mutation-harness.yml:170`. `if: always()` is load-bearing: an upload conditioned on success would reproduce the failure-only defect, and one conditioned on failure would reproduce it inverted |
| absent directory | created; a write failure is reported on stderr and does NOT fail the gate — the record is additive and must not become a new way for a green surface to red |

Without the upload the file dies with the CI workspace, which is why `.github/workflows/mutation-harness.yml` is in the touched set (§5.6) and why AC-11 asserts the workflow step exists rather than only that the file was written.

**WHEN a record is written and WHETHER it survives are two independent requirements, and satisfying
one is silent about the other.** The first draft of this section specified the emit condition correctly
— on success, in local runs — and said nothing about persistence, so the record would have been written
faithfully into a CI workspace that is then discarded. Review round 1 caught it. Both halves are stated
here because getting one right gives no evidence at all about the other.

**This is not a nicety, it is the §1.0 defect not being rebuilt.** The existing record of verdict movement is CI-only and failure-only, which is precisely why the best-documented instance of the phenomenon is invisible to it. A new record inheriting either property would be no better than what it replaces. Emission is therefore unconditional on the verdict, unconditional on the gate outcome, and unconditional on the environment.

### 5.3 `runSuite` accepts an injectable ceiling

`runSuite` hardcodes `timeoutMs: MUTANT_TIMEOUT_MS` (`tests/mutation/source/runner.ts:110`), so the timeout path cannot be exercised by any test without a real 180-second hang. It gains an optional ceiling parameter defaulting to `MUTANT_TIMEOUT_MS`; every existing call site is unchanged by construction.

This is what makes §7's timeout-path acceptance criteria executable in seconds rather than minutes, and it is why probe 1 had to reach past `runSuite` to `spawnBounded` to force its arm.

### 5.4 The determinism harness

`pnpm mutation:determinism --surface <id> --site <siteId> --runs <n>` — probe 3, productized and pointable at any site.

Reports, per run, the SAME per-child record shape §5.1 defines — one entry per suite actually run, each carrying suite, kind, exit code and duration — then the verdict distribution, the kind distribution, and the input pair stamp taken before and after. **Singular per-run fields are deliberately NOT the shape here:** §5.1 rejects a summary that cannot express a multi-suite outcome, and several enrolled surfaces (`ledgerGit`, `premiseScan`, `ledgerClaimsCore`) declare two deciding suites. A harness reporting one kind and one code per run would discard earlier children exactly as the shipped record does today. AC-8 therefore exercises a surface with MORE THAN TWO deciding suites — not merely "multi-suite", since two-suite proofs are satisfied by an implementation capped at two children — as well as the single-suite `psqlStartupScan` site. Authored as an IMPORTABLE MODULE with a referring Vitest suite, never a terminal CLI script, so the runner can overlay it and so its assertions decide in-process.

**Guard conditions — an ACCEPT-SET with the complement default-denied.**

`--runs` is ACCEPTED only if it parses as an integer with value >= 1. Everything else is refused, which
is a closed statement rather than a list of known-bad forms: missing, empty string, non-numeric, `NaN`,
`Infinity`/`-Infinity`, fractional (`2.5`), zero, negative, and anything else the complement contains.
The accept-set is the specification; enumerating rejects would be a denylist, and a denylist accepts
whatever it did not model.

| input | behaviour |
| --- | --- |
| `--runs` outside the accept-set | refuse by name, exit 2, emit NO distribution |
| unknown `--surface` | refuse naming the surface, exit 2 |
| `--site` resolving in no generated set | refuse naming the site, exit 2 — and say which of surface/site failed, never a bare "not found" |
| baseline red | refuse, exit 2 — against a red baseline every mutant scores `KILLED` |
| all valid, zero runs completed | ABORT rather than print a distribution over an empty population |

Every refusal exits non-zero and emits NO distribution, so a swept-and-clean run can never read as a
run that never started. **The last row is the abort-when-vacuous rule:** a positive control proves the
instrument CAN fire, an abort proves it REFUSES TO REPORT when it cannot, and the abort is a
precondition of every run rather than a step that can drift away.

### 5.5 The one decision this spec does NOT take

Whether a timeout should stop counting as a kill.

**Blast radius, stated so the decision can be made rather than deferred vaguely.** Reclassifying would change the denominator or the verdict on any surface where a timeout occurs today. Whether that set is empty is a measured question, not an argued one — §2.3 measures it for the worst-placed surface and §7 AC-7 records the number.

- **If today's timeout count across the population is zero:** the fail-closed arm (a gate condition that reds on a timeout-scored kill) is dormant on arrival and costs nothing, and shipping it prevents the silent case permanently.
- **If it is non-zero:** the repo has been scoring timeouts as earned kills, every `equivalent` and `accepted-gap` row adjudicated on "this mutant is killed" was decided against a verdict that cannot tell the two apart, and re-scoring is a batch-wide event.

Both branches are pre-staged so the ruling costs one turn. The ruling belongs to `bl-orch`; this arc does not take it in-branch.

### 5.6 What is touched

`runner.ts`, `gate.ts`, `surfaceCases.ts` — none enrolled in the mutation registry, so **no enrolled surface's score is retired by this arc**. Plus `.github/workflows/mutation-harness.yml` (the records upload, without which the CI half of the record does not survive its workspace), `.gitignore` (the records directory), the NEW determinism module and its referring Vitest suite (§5.4), the record-writing module and its suite (§5.2), and the repo-root `package.json` scripts block — `pnpm mutation:determinism` does not exist today (the nearest entry is `mutation:guards`), so the script entry is part of this change rather than assumed. `spawnBounded.ts` is deliberately untouched (`registry.ts:2663`, `scoreFloor: 1`, measured 12/12). `oracle.ts` and `ledger.ts` are untouched: the verdict and the score are not this spec's subject.

---

## 6. Documented limits

1. **The record does not explain the flake.** It makes the next occurrence self-diagnosing. Anyone reading a future timeout notice as a cause is reading more than the record says.
2. **§2.2's headroom is computed from BASELINE children** — a lower bound on healthy duration, never a distance to the ceiling. §2.3 measures mutant children for one surface only; the other 39 remain baseline-bounded.
3. **All measurements are from one developer machine.** CI is a different and slower environment, and both original observations straddle exactly that boundary. A margin measured here is not a margin there.
4. **A timeout still scores `KILLED`** (§5.5). Until that is ruled on, the notice is the only signal, and a notice can be ignored.
5. **The correlation in §2.2 rests on n = 2 known-flaky surfaces**, and flakiness is observed rather than sampled, so the population of flaky surfaces may be larger than the two documented.
6. **`durationMs` is wall clock**, so it includes time the child spent queued behind machine load. It answers "how long did this take" and not "how much work was done".
7. **A `kind: "exit"` record cannot say WHY the child exited nonzero.** Child stdio is discarded (`tests/mutation/source/spawnBounded.ts:139`), so an assertion rejection, a compile failure and a collection failure are one category. Separating them needs captured output and is out of scope; §1.2's consequence bound is worded to certify only what the record delivers.
8. **Probe 3's rate exclusion assumes INDEPENDENT trials**, which six serial runs in one process cannot establish — and correlated within-process state is exactly what an intra-leg mechanism would be (§2.4).
7. **The 1.4x run-to-run spread measured in §2.4 is from six runs on one site.** It establishes that per-child duration is not stable; it does not characterize the distribution's tail.

---

## 7. Acceptance criteria

Every row names the executable step that proves it and the channel the proof arrives on. A green suite is not proof for any row here unless the row says so.

| id | criterion | proved by | the weaker implementation it kills |
| --- | --- | --- | --- |
| AC-1 | A timed-out child records `kind: "timeout"`, `exitCode: null`, `durationMs` >= the injected ceiling. | Injected small ceiling (§5.3) against a hanging fixture; assert the record BY EQUALITY. | One that records a timeout as an ordinary non-zero exit. |
| AC-2 | An assertion-killed child records `kind: "exit"` with the child's real non-zero code. | TWO fixtures exiting with DIFFERENT non-zero codes; assert each record carries its own code. A single fixture admits an implementation hard-coding that one value. | One hard-coding `kind` from the verdict, and one hard-coding the single exit code the lone fixture happened to produce. |
| AC-3 | The verdict for AC-1 and AC-2 is still `KILLED`. | Both cases assert `verdict === "KILLED"`. | Any change that reclassifies a timeout — the no-blast-radius guarantee, asserted rather than assumed. |
| AC-4 | For a SURVIVOR: `children[].suite` equals `suitePaths` in execution order element by element, AND every child is `kind: "exit"` with `exitCode: 0`. | A surface with MORE THAN TWO deciding suites — the registry's largest declares ten (`tests/mutation/source/registry.ts:232-253`) — plus a two-suite surface. Every named multi-suite proof in an earlier draft used two suites, which a harness or runner capped at two children satisfies. Surviving mutant; assert the suite array by deep equality against the registry row's `suitePaths`, and assert the kind/code of EVERY child. Suite identity alone is not enough — AC-1/2 cover killed children, so without this a survivor's children could be recorded as timeouts or arbitrary exits and no row would notice. | One hard-coding or reversing suite names; one reporting a correct COUNT of wrong suites; and one recording survivor children with fabricated kinds or non-zero codes. |
| AC-5 | A killed mutant on a multi-suite surface does not SPAWN the later suites. | Spy the spawn seam and assert it was invoked exactly once with suite 1. Asserting `children.length === 1` is NOT sufficient — an implementation that runs both suites and discards suite 2's record satisfies it while destroying the short-circuit at `tests/mutation/source/runner.ts:134`. | The run-both-and-discard implementation, which the count-only assertion admits. |
| AC-6 | Exactly ONE `timeout-kill` notice per timed-out mutant — for THREE timed-out mutants in one run, three notices — each carrying its own mutant's site, suite and duration as STRUCTURED FIELDS; `passed` and `score` unchanged. | A run with THREE timed-out mutants among others; assert the notice count is 3 and that the set of `(site, suite, durationMs)` triples equals the set derived from those mutants' records. A single-timeout fixture is NOT sufficient: it is satisfied by an implementation emitting at most one notice globally. `GateNotice` therefore carries `site`, `suite` and `durationMs` as fields rather than only an opaque `detail` string, because a proof comparing fields requires fields to exist. | One emitting at most one notice per run; one emitting duplicates; one carrying invented or transposed details; and one formatting everything into `detail` so no field comparison is possible. |
| AC-7 | The count of timeout-scored kills on the measured surface is recorded in the probe record, and the ledger row is UPDATED to carry it. | Measured: **0 of 93 kills on `ledgerGit`** (§2.3). The probe record carries it today; adding it to `BACKLOG.md:53` is an obligation this arc's closeout discharges, not a fact the spec may assert in advance. | A closeout that reports the number only in the spec, leaving the row that recruits the next reader unchanged. |
| AC-8 | The determinism harness reports a distribution for a named site, carries one record per deciding suite, and REFUSES rather than reporting an empty or misleading one. | Run against the §2.4 site (single-suite) AND against a site on a surface with more than two deciding suites, asserting one record per suite in order; then against every invalid `--runs` form — missing, empty, non-numeric, `NaN`, `Infinity`, fractional, zero, negative — plus an unknown surface, an unresolvable site, and a red baseline. Each exits 2, names which input failed, and emits NO distribution. | One that coerces `NaN` or a fraction into a loop bound and prints a confident distribution over zero or truncated runs. |
| AC-9 | The harness's assertions decide IN-PROCESS. | Its suite imports the module directly; no assertion's verdict is carried by a spawned child's exit code. | A CLI-shaped surface whose branches the runner cannot overlay, scoring as if untested. |
| AC-10 | No enrolled surface's verdict or score moves — and the criterion is stated at the strength the proof reaches, not universally. | `runner.ts` is shared by all 40 surfaces, so `spawnBounded`'s blob being unchanged proves nothing about the other 39. The proof is a BEFORE/AFTER comparison of the full outcome set (`siteId` to `verdict`) over a NAMED set: `spawnBounded` (single-suite, 12 mutants), `ledgerGit` and `premiseScan` (multi-suite, 2 suites each), and `psqlStartupScan` (single-suite, heaviest). **Two limits stated rather than papered over:** the remaining 36 surfaces are covered by ARGUMENT (the change is in a shared code path exercised identically by all of them), not by measurement; and this spec's own premise is that byte-identical inputs can produce different outcomes, so a single before/after pair is weak evidence against itself. The comparison is therefore run TWICE on the base commit first, and a base-vs-base disagreement voids the AC rather than being averaged in. | A runner edit preserving `spawnBounded`'s verdicts while perturbing a multi-suite surface's short-circuit or ordering — and, for the second limit, a flake mistaken for a regression or vice versa. |
| AC-11 | The durable record exists after a PASSING run in a CI environment, AND the `source-shards` JOB uploads it. | Passing run with CI env set; assert the file exists and holds one entry per mutant. Then parse `.github/workflows/mutation-harness.yml` and assert the records `upload-artifact` step is a step OF THE `source-shards` JOB with `if: always()` — not merely present somewhere in the file. The surfaces run in the `source-shards` matrix, so a correct step under `source-gates` uploads nothing and all four shard workspaces are still discarded. | One writing to a path nothing uploads; and one uploading from the wrong job, which a file-scoped existence check cannot distinguish from a correct one. |
| AC-12 | The record is written for all four cells of {passing, failing} x {CI, local}. | Four cases, one per cell, each asserting the file exists with the expected entry count. | `passed && !CI` — which satisfies a passing-local case and a passing-case-with-CI-unset while omitting passing CI runs entirely. This is the matrix, not two points on it. |
| AC-15 | An ordinary (non-timeout) child's `durationMs` is MEASURED, not fabricated. | A fixture whose suite sleeps a known interval; assert its recorded `durationMs` is at least that interval and below a generous ceiling. AC-1 bounds only the timeout case and AC-13 compares a serialized value against the same in-memory value that produced it, so an implementation writing `durationMs: 0` for every ordinary exit satisfies all of them — while corrupting every determinism distribution built on the field. | The `durationMs: 0` implementation, and any constant-duration implementation. |
| AC-14 | A record-write failure emits on stderr and does NOT fail the gate. | Inject a sink failure (unwritable directory) on an otherwise passing surface; assert the gate still passes, the score is unchanged, AND a diagnostic reached stderr. Both halves are required: a silent swallow rebuilds the blind spot, an uncaught exception changes pass/fail. | The silent swallow, and the uncaught filesystem exception — the two implementations AC-11 to AC-13 both admit today. |
| AC-13 | A record round-trips with values DERIVED from the run that produced it. | Write, re-read, assert each `children` entry equals the in-memory outcome it came from. Asserting only that some `kind`/`exitCode`/`durationMs` survive serialization proves that WRONG values serialize faithfully. | One that serializes a placeholder or a default-filled record with the right shape and the wrong contents. |

**How this table was derived.** Round-1 review found five ACs that a strictly weaker implementation satisfied. Rather than patch the five, every row was re-derived with its killing implementation named in the fourth column — the class, not the instances. A row whose fourth column is empty is an unfinished row.

## 8. Mutation enrolment — stated, not enrolled symbolically

The determinism harness's core is authored as an importable module with a referring suite from the start, so it CAN be enrolled and the enrolment question is a judgement rather than a restructuring.

**It is not enrolled by this arc, and the reason is the arc's own subject.** A mutation score is computed by the machinery under audit; enrolling the audit's own instrument in the scorer it is auditing makes the criterion circular. Saying so is more useful than a symbolic row. Per the round-economy contract the review briefs state the convergence criterion in the terms §1.2 sets — consequence bound, probe domain, threat fence — and explicitly note that the usual score-plus-empty-survivor-set criterion is weaker here and why.

`spawnBounded` stays enrolled and untouched; its 12/12 is not retired and is not re-derived, because no input to it moves (§5.6).

---

## 9. Peers and class-sweep disposition

The class is "an outcome whose evidence is discarded before anything can read it". Swept across the harness:

| site | disposition |
| --- | --- |
| `runSuite` timeout arm (`runner.ts:112`) | REPAIRED here — the instance the row was filed on. |
| `runAllSuites` short-circuit (`runner.ts:136`) | REPAIRED here — the deciding suite's identity was discarded with the code; `children` records it. |
| `runSurface` outcome construction (`runner.ts:165`) | REPAIRED here. |
| `MutantRunInfraError` (`runner.ts:114`) | NO REPAIR NEEDED — already throws with signal and code; the evidence is in the message and the run is fatal. |
| `childRun` timeout arm (`childRun.ts:44`) | NO REPAIR NEEDED — already distinguishes a timeout from an exit and throws. Ratified at `childRun.ts:25-28`; not an inconsistency (§1.1). |
| `spawnBounded` stdio discard (`spawnBounded.ts:139`) | DEFERRED, exception (c) — restoring child output is a redesign of an enrolled surface this arc does not otherwise touch, and the discard is load-bearing against a 1 MB `maxBuffer` cliff documented at `spawnBounded.ts:128-138`. Filed as a peer row rather than repaired here. |

---

## 10. Out of scope

- Repairing `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH` or `BL-MUTATION-HARNESS-MAIN-RED` (§1.1).
- Re-testing co-tenancy (§1.1).
- Changing the verdict mapping (§5.5).
- Explaining the flake. The arc ships (b) and says plainly that (a) is not achieved (§3).
