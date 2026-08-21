# Probe record — mutation outcome attribution (2026-08-21)

Companion to `docs/superpowers/specs/ci/2026-08-21-mutation-outcome-attribution-design.md`.
Row: `BL-MUTATION-SCORE-NONDETERMINISM` (`BACKLOG.md:53`).

Every probe declared its negative branch in writing BEFORE it ran. Pre-registrations are reproduced
verbatim below, ahead of each result, so no reading can have been fitted to an outcome.

## The instrument

Probes 1-4 ran through an ATTRIBUTING mirror of the shipped per-mutant loop: identical control flow to
`runSuite`/`runAllSuites`/`runSurface` (`tests/mutation/source/runner.ts:87-181`), with a record added
and **no verdict mapping changed**.

**The scripts are COMMITTED, not summarised**, in `docs/superpowers/specs/ci/probes/2026-08-21-attribution-scripts/`:
`instrument.ts` (the mirror plus its drift control), `p1-e2e.ts`, `p1-timeout-attribution.ts`,
`p2-distribution.ts`, `p2b-mutant-tail.ts`, `p3-single-leg.ts` and `p4-annotations.py`. `p4` derives its
own run population through `gh run list` rather than reading an untracked temp file, so the selected
runs are part of the committed evidence. An earlier draft of this record
claimed regeneration while reproducing only one function and shipping none of the enumeration,
iteration, stamping, aggregation, control or history-extraction code — a false claim of the exact kind
this arc exists to make impossible, and it is fixed by making the claim TRUE rather than by weakening
it. They typecheck under the repo's strict `tsc` (`pnpm typecheck`, clean) and so are subject to the
probe mini-review the spec-self-review rules require.

**Two regeneration gaps found in round 4 and closed, because "committed" is not the same as
"runnable".** `p1-e2e.ts` needed four synthetic fixture files that were not in the tree; it now WRITES
them itself at run time and removes them in a `finally`, with `tests/_probe_nondet/` git-ignored so an
interrupted run cannot leak scratch into a commit. And `p4-annotations.py` derived its population from
"the latest 60 workflow runs", which drifts under ordinary CI activity; it now carries the **19 pinned
run ids** the published counts were computed over, with `--refresh` as the opt-in live path. A probe
whose population moves under you cannot support a fixed number.

The mirror's core, inline for readers:

```ts
// mirrors runner.ts:87-115, plus the record
export function runSuiteRecorded(root, target, mutantFile, suite, id, sink) {
  const env = { ...process.env, MUTATION_ROOT: root, MUTATION_TARGET: target,
                MUTATION_MUTANT: mutantFile, MUTATION_SUITE: suite };
  const t0 = Date.now();
  const { outcome } = spawnBounded(["pnpm", "exec", "vitest", "run", "--config",
                        "tests/mutation/source/mutantOverlay.config.ts"],
                      { cwd: root, env, timeoutMs: MUTANT_TIMEOUT_MS });
  const durationMs = Date.now() - t0;
  if (outcome.kind === "timeout") { sink.push({ siteId: id, suite, kind: "timeout", code: null, durationMs });
                                    return MUTANT_TIMEOUT_EXIT; }
  if (outcome.kind === "exit")    { sink.push({ siteId: id, suite, kind: "exit", code: outcome.code, durationMs });
                                    return outcome.code; }
  sink.push({ siteId: id, suite, kind: "infra", code: null, durationMs });
  throw new Error(`infra fault for ${id} [${suite}]`);
}
```

Because it is a SECOND DEFINITION of the shipped loop, it carries a drift control: `selfCheck`
(`instrument.ts`) runs the shipped `runSurface` and the mirror over the same real surface and compares
survivor SETS and killed counts. Probe 3 reports that control green (`spawnBounded`, 12/12, survivors `[]`); a disagreement
aborts the probe rather than reporting numbers. §5.4 of the design productizes this as the shipped
determinism harness.

**Commands.** Each probe ran as `pnpm heavy pnpm exec tsx <script>` from the worktree root, which takes
one slot of the machine-wide two-slot semaphore. `pnpm heavy` is required for these by the AGENTS.md
transitive-shape rule: each spawns real vitest children serially.

| probe | command |
| --- | --- |
| 1 | `pnpm heavy pnpm exec tsx p1-e2e.ts` (end-to-end: ad-hoc surfaces over a synthetic hanging module, producing the `RunResult`/`GateResult` transcript below). `p1-timeout-attribution.ts` is the SEPARATE, cheaper arm that composes `spawnBounded`/`classify`/`evaluateGate` directly. An earlier draft committed only the second while the transcript came from the first. |
| 2a | `pnpm heavy pnpm exec tsx p2-distribution.ts` (one unmutated child per surface x suite) |
| 2b | `PROBE_SURFACE=ledgerGit pnpm heavy pnpm exec tsx p2b-mutant-tail.ts` |
| 3 | `PROBE_N=6 pnpm heavy pnpm exec tsx p3-single-leg.ts` |
| 4 | `python3 p4-annotations.py` (reads `gh api` — no semaphore slot, spawns no children) |

Derived figures were produced by the command printed beside them in the section that reports them.

**Standing method notes.**
- All runs are on one developer machine, under `pnpm heavy` (the machine-wide two-slot semaphore).
- Score inputs are stamped by blob hash inside the measuring invocation, before AND after.
- **Baseline provenance, stated rather than assumed.** The harness reads the surface from the FILESYSTEM
  (`readFileSync`, mirroring `runner.ts:143`) while the pair stamp reads GIT (`git rev-parse HEAD:<path>`).
  Those are two different sources, so the stamp alone cannot see a dirty working tree — a modified
  working copy would be measured while the stamp reported the committed blob. Closed by an explicit
  three-way equality on every measured input, working tree vs `HEAD` vs `origin/main`:

  | input | working tree | `HEAD` | `origin/main` |
  | --- | --- | --- | --- |
  | `scripts/lib/ledger-git.ts` | `5e4119f5f1` | `5e4119f5f1` | `5e4119f5f1` |
  | `tests/scripts/ledgerClaimsCheck.test.ts` | `ce5457b41a` | `ce5457b41a` | `ce5457b41a` |
  | `tests/scripts/ledgerGitSpawnSeam.test.ts` | `4784247462` | `4784247462` | `4784247462` |
  | `tests/cross-cutting/psqlStartupFiles/scan.ts` | `a1f9db0c3c` | `a1f9db0c3c` | `a1f9db0c3c` |
  | `tests/cross-cutting/psqlStartupFileSuppression.test.ts` | `cb45f9ea03` | `cb45f9ea03` | `cb45f9ea03` |
  | `tests/mutation/source/registry.ts` | `266c7b223c` | `266c7b223c` | `266c7b223c` |
  | `tests/mutation/source/operators.ts` | `165bf99d49` | `165bf99d49` | `165bf99d49` |

  All three agree for all seven, so every measurement here is against SHIPPED bytes. The mutant itself
  is served from a temp file through the overlay and the tracked source is never written, so no probe
  could have compared a prototype against itself — but that is verified above rather than argued from
  construction.
- Every figure is derived by the command printed beside it. No figure is read from a source comment
  or from memory — §2.0 of the design records the two stale numbers that rule caught.

---

## Probe 1 — is a timeout distinguishable from an assertion kill, end to end?

### Pre-registration (written before the run)

> **Question.** Following a real wall-clock timeout from `runner.ts:112` through `runSurface`,
> `evaluateGate` and the printed test output: what does an OPERATOR observe, and does it differ from
> what the same surface shows when the same mutant is killed by an assertion?
>
> **Method.** An ad-hoc `GuardSurface` over a synthetic module whose `statement-removal` mutant deletes
> a loop's advance statement, producing a SYNCHRONOUS non-terminating child. Synchronous matters:
> vitest's own `testTimeout` (30_000 ms, `vitest.projects.ts:179`) is a timer, and a blocked worker
> thread cannot service it, so the 180_000 ms `spawnBounded` ceiling is what actually stops the child.
> `MUTANT_TIMEOUT_MS` is NOT edited — `spawnBounded` is an enrolled surface (`registry.ts:2663`) and
> editing it would retire its score. The timeout is forced from the CHILD side.
>
> **PREDICTED.** Both arms yield an identical `RunResult` shape, an identical `GateResult`, and
> identical printed output — no field, count, warning or annotation anywhere distinguishes a
> 180-second hang from a fast assertion failure.
>
> **NEGATIVE BRANCH, declared in advance.** (1) Any observable difference between the two arms — then a
> timeout is already distinguishable and probe 1 yields no shippable defect. (2) A timeout that does
> NOT reach `KILLED` end to end — then the static reading of `runner.ts:112` is wrong and every claim
> built on it is void. (3) The hang being caught by vitest's own `testTimeout` rather than the spawn
> ceiling — then the probe measured a different mechanism than it names.
>
> **What this probe does NOT establish either way.** Nothing about the flake's cause.

### Load-bearing comparison

Two mutants of the SAME source, SAME suite, in ONE run — varying exactly one thing: which statement
was removed. (A second surface was also run as corroboration; that comparison varies two things and is
NOT load-bearing.)

### Result

```
=== ARM hangSource: 2 statement-removal site(s) ===
    statement-removal:5:5:steps = steps + 1;>(removed)
    statement-removal:6:5:i = i - 1;>(removed)
--- RunResult (everything runSurface reports) ---
{ "surfaceId": "probe-hangSource", "mutantCount": 2, "noOps": [], "baselineGreen": true,
  "killed": 2, "survivors": [],
  "outcomes": [ { "siteId": "statement-removal:5:5:steps = steps + 1;>(removed)", "verdict": "KILLED" },
                { "siteId": "statement-removal:6:5:i = i - 1;>(removed)",         "verdict": "KILLED" } ] }
--- GateResult (everything the gate reports) ---
passed=true score=1.0000 failures=[]
--- what surfaceCases.ts would PRINT for "passes every gate condition" ---
""
--- elapsed (NOT recorded anywhere by the harness) ---
181.6s across 2 mutant(s) + 1 baseline; ceiling is 180s per suite-child

=== ARM assertSource: 1 statement-removal site(s) ===
--- GateResult --- passed=true score=1.0000 failures=[]
--- what surfaceCases.ts would PRINT --- ""
--- elapsed --- 2.2s across 1 mutant(s) + 1 baseline

================ PRE-REGISTERED READING ================
overlay live (mutants were actually served): true — killed=2 survivors=0
spawn ceiling actually reached (elapsed > 180000ms): true
control arm elapsed: 2.2s — same operator, no hang
every outcome in the hang arm reads KILLED, indistinguishably: true
fields available to attribute an outcome: siteId, verdict
```

### Reading

All three negative branches FALSIFIED. No distinguishing field exists; the timeout DID reach `KILLED`
rather than throwing; and the 181.6 s total confirms the 180 s spawn ceiling bound the child, not
vitest's 30 s `testTimeout` — a timer cannot fire on a thread a synchronous loop has blocked.

**A separate positive control**, run through the shipped `spawnBounded` with a 250 ms ceiling against
`sleep 30`, confirmed a real `ETIMEDOUT` outcome (`outcome.kind=timeout after 253ms`) and that an
ordinary failing child yields `{"kind":"exit","code":1}` — so the two arms were genuinely produced,
not assumed.

---

## Probe 2a — healthy per-child wall clock, whole enrolled population

### Pre-registration (written before the run)

> **Question.** How close does a HEALTHY child get to the 180 s ceiling, across the whole enrolled
> population rather than a sample?
>
> **Method.** One unmutated child per (surface, suite), every enrolled surface. Full population at one
> child each, instead of a sample at one child per mutant.
>
> **PREDICTED.** If the timeout mechanism is live, at least some surfaces sit close enough to the
> ceiling that an ordinary slowdown could cross it.
>
> **NEGATIVE BRANCH.** Every surface sits far below the ceiling. Then the timeout mechanism requires a
> large multiple rather than a small one, and the question becomes how large — reported as a
> DISTRIBUTION with its tail named, never as a mean or a single margin.
>
> **THE LIMIT, DECLARED IN ADVANCE.** A baseline child is a HEALTHY child. This is a LOWER BOUND on
> healthy duration and NOT a distance to the ceiling; a mutant that makes a suite spin rather than hang
> is exactly the case the hypothesis is about, and no baseline measurement can see it. The figure will
> be reported with that limit attached wherever it appears, and probe 2b measures mutant children
> directly for that reason.
>
> **What it does NOT establish.** Anything about which surfaces actually flip.

### Result

One unmutated child per (surface, suite). **n = 81 children over all 40 surfaces**, every baseline
green, zero children at or past the ceiling.

```
================ DISTRIBUTION (n=81 children over 40 surfaces) ================
min    1.1s   median 1.1s   p90 3.1s   max 24.4s  (ledgerGit)
ceiling 180.0s — margin at the max: 7.4x
children at or past the ceiling: 0
non-green baselines (would score every mutant KILLED): []
```

Per-surface headroom, worst first — only four of forty below 15x:

| surface | worst baseline child | headroom |
| --- | --- | --- |
| `ledgerGit` | 24.4 s | 7.4x |
| `ledgerClaimsCore` | 22.8 s | 7.9x |
| `premiseScan` | 17.3 s | 10.4x |
| `psqlStartupScan` | 15.3 s | 11.8x |
| `declaredLimitPins` | 6.2 s | 29.0x |
| `rowScanOpener` | 4.6 s | 39.1x |
| `fieldNearMiss` | 4.6 s | 39.1x |
| `interactionTimingScan` | 3.6 s | 50.0x |

The remaining 32 surfaces run 58x to 164x.

**Governing limit, carried beside the number everywhere it appears.** These are BASELINE children. A
baseline child is a HEALTHY child, so this is a LOWER BOUND on healthy duration and NOT a distance to
the ceiling. A mutant that makes a suite spin rather than hang is exactly the case the timeout
hypothesis is about, and no baseline measurement can see it.

**Instrument defect found and corrected during analysis.** The first per-surface aggregation keyed on
awk field `$4`, which is the SUITE path; the surface id is `$3`. The headroom values were correct and
every label was wrong. Re-derived against `$3`.

---

## Probe 2b — per-mutant children on the worst-placed surface

`ledgerGit` (7.4x), every mutant, five-input pair stamp inside the invocation.

**Scope decision.** The full tail-4 sweep costs ~238 min worst case on a two-slot semaphore with four
arcs live, and was DECLINED; `ledgerGit` alone carries the argument as the worst-placed surface.

**Reading stated before the number landed:** a per-mutant maximum far from 180 s weakens the timeout
mechanism ON THIS SURFACE and bounds no other — a different surface's mutation-induced slowdown is not
bounded by `ledgerGit`'s ratio. The other 36 sitting at 29.0x-163.6x against 7.4x supports a
PLAUSIBILITY argument, not a measurement; the three tail peers at 7.9x-11.8x (1.1x-1.6x more room) are
the ones a further per-mutant run would have to cover. A mutant child approaching the ceiling makes the
mechanism live and §5.5's decision urgent.

### First run — CONTAMINATED, preserved as a record and NOT a current claim

Its `max`, `median` and headroom are computed over mutant AND baseline children together, so the
`7.1x` below is RETIRED. It is kept verbatim rather than edited because it is the evidence for what the
defect looked like, and because the survivor set it reports is what the filtered re-run reproduced.

```
STAMP AFTER identical: true

=== ledgerGit: 99 mutants, 118 children, 31.6 min ===
killed=93 survivors=6
child duration (s): min 1.1  median 18.7  max 25.3
ceiling 180s — headroom at the measured MUTANT max: 7.1x
TIMEOUTS AMONG THESE KILLS: 0 of 93
slowest 10 children (s): 22.3, 22.8, 22.8, 22.8, 22.8, 22.9, 23.3, 23.3, 23.8, 25.3
survivors: ["logical-connector:66:12:||>&&","logical-connector:142:18:||>&&","logical-connector:232:32:||>&&",
            "integer-literal:259:17:1>2","statement-removal:320:11:continue;>(removed)","logical-connector:365:14:||>&&"]
```

### Filtered re-measurement (the reported result)

```
partition: 116 mutant children, 2 baseline children (baseline durations: 1.1, 18.3s)

=== ledgerGit: 99 mutants, 118 children, 29.0 min ===
killed=93 survivors=6
child duration (s): min 0.6  median 17.8  max 39.1
ceiling 180s — headroom at the measured MUTANT max: 4.6x
TIMEOUTS AMONG THESE KILLS: 0 of 93
slowest 10 children (s): 19.3, 19.3, 19.3, 19.4, 19.8, 19.8, 19.8, 20.8, 38.0, 39.1
STAMP AFTER identical: true
```

**Reading — and the retracted claim was wrong in DIRECTION, not merely unsupported.** Zero of 93 kills
are timeouts. The worst MUTANT child is **39.1 s**, against a worst BASELINE child of **18.3 s**: a
ratio of **2.14x**, where the contaminated run had suggested 1.04x. **Mutant children ARE materially
slower than baseline on this surface**, so the baseline-is-a-lower-bound limit is real and understates
the tail by roughly a factor of two here.

Headroom at the mutant maximum is **4.6x, not the 7.1x previously reported** — less room than this
record earlier claimed. The tail is also not smooth: two children at 38.0 and 39.1 s stand clear of the
next-slowest 20.8 s by ~1.8x, which any mean or median would have hidden.

**Duration is itself unstable run to run.** Same surface, byte-identical inputs: an all-children maximum
of 25.3 s in the first run, a mutant maximum of 39.1 s in this one. Consistent with probe 3's 1.4x
intra-run spread.

**What the earlier run still establishes**, since both are recorded: the survivor set is IDENTICAL
across the two runs (same six sites), so the verdict result reproduced exactly even while the duration
distribution moved.

**How the earlier figures were wrong.** `runSurfaceRecorded` pushes the BASELINE children into the same
records array the distribution is computed over (`instrument.ts`), and the first version of this probe
did not filter them — found by round-3 review. The script now filters on `siteId`, reports both
populations, and ABORTS if the mutant population is empty. The re-measurement above is the reported
result; the contaminated figures (25.3 s max, 1.04x ratio, 7.1x headroom) are RETIRED and are not
quoted anywhere as current. Per the
pre-stated reading this weakens the timeout mechanism ON THIS SURFACE. It bounds no other: the other
39 remain baseline-bounded, and the larger headroom elsewhere is a plausibility argument, not a
measurement.

### A FIFTH observation of the `ledgerGit` anomaly, on byte-identical declared inputs

The survivor set reconciles EXACTLY with the surface's 6 ledger rows — **zero unaccepted survivors,
zero stale rows**. In particular `logical-connector:259:20:&&>||` — the exact site that was an
UNACCEPTED SURVIVOR on PR #856's `source-shards (0)` leg — still exists in the generated set (99
mutants, confirmed) and was **KILLED** here.

Input identity verified across every sha the ledger row names:

| sha | `scripts/lib/ledger-git.ts` | `ledgerClaimsCheck.test.ts` | `ledgerGitSpawnSeam.test.ts` |
| --- | --- | --- | --- |
| `03953337388b` (main nightly, GREEN) | `5e4119f5f1` | `ce5457b41a` | `4784247462` |
| `adafcd8ad` (arc-shell, RED) | `5e4119f5f1` | `ce5457b41a` | `4784247462` |
| `0f98a31c5` (arc-shell, GREEN) | `5e4119f5f1` | `ce5457b41a` | `4784247462` |
| this run's HEAD (KILLED, green) | `5e4119f5f1` | `ce5457b41a` | `4784247462` |

All four identical, and they match this run's before/after stamp. So the tally for that site on
byte-identical declared inputs is now **3 killed, 1 survived**.

**What this is and is not.** It is one more observation of INSTABILITY, which is what the row already
documents. **A verdict that moves back is not evidence for a mechanism** — an unstable verdict moves in
both directions by construction, so agreeing with the majority is what instability looks like, not a
diagnosis. No ledger row is added or removed on the strength of it.

**What it does bear on:** the timeout mechanism produced ZERO timeouts on the very surface, the very
site and the very bytes where the anomaly was observed. That is directly on point and it is the
strongest single datum against timeouts explaining the `ledgerGit` flip. It is not conclusive — CI is a
different and slower environment, and history cannot be re-run.

---

## Probe 3 — the intra-leg branch

### Pre-registration (written before the run)

> **Subject.** `psqlStartupScan`, site `relational-boundary:3578:35:<><=`. Verified at HEAD: source
> blob `a1f9db0c`, deciding suite blob `cb45f9ea` — byte-identical to the blobs the ledger row records
> for all four prior observations, so this run is over the RIGHT POPULATION.
>
> **The one variable.** Run index, and nothing else.
>
> **PREDICTED, per hypothesis H-runner.** The N exit codes are NOT all equal.
>
> **NEGATIVE BRANCH.** All N identical. Then an intra-leg mechanism did not reproduce, WEIGHTING the
> remaining space toward machine, environment or across-leg state. It does NOT resurrect co-tenancy,
> which is RULED OUT. It does NOT make the anomaly unreal. Ruling out a location is not an explanation,
> and I will say so. (This pre-registration said "localized OUTSIDE a single leg". Six trials do not
> support that strength; the rate bound they DO support is computed in the Reading below, and the
> stronger wording is not claimed. The pre-registration is preserved as written rather than edited.)
>
> **Secondary reading, declared now so it cannot be fitted later.** If any run approaches the ceiling,
> the timeout mechanism gains direct support at this site; if every run sits far below it, the
> mechanism is WEAKENED FOR THIS SITE specifically and that is not a general refutation.

### Result

```
STAMP BEFORE: scan.ts=a1f9db0c suite=cb45f9ea
SELF-CHECK spawnBounded: shipped killed=12/12 survivors=[]
SELF-CHECK spawnBounded: probe   killed=12/12 survivors=[]
SELF-CHECK spawnBounded: AGREE=true

CONTROL B: target site resolves in the generated set: true (74 mutants generated)
  site: relational-boundary:3578:35:<><=  ->  "<" becomes "<="
CONTROL C: unmutated baseline exit=0 (15.2s) — green required: true

=== 6 repetitions of relational-boundary:3578:35:<><=, one process, serial ===
  run 1/6: kind=exit exit=0 verdict=SURVIVED 14.8s
  run 2/6: kind=exit exit=0 verdict=SURVIVED 15.8s
  run 3/6: kind=exit exit=0 verdict=SURVIVED 15.7s
  run 4/6: kind=exit exit=0 verdict=SURVIVED 20.8s
  run 5/6: kind=exit exit=0 verdict=SURVIVED 17.8s
  run 6/6: kind=exit exit=0 verdict=SURVIVED 17.8s
STAMP AFTER: scan.ts=a1f9db0c suite=cb45f9ea
STAMP pair identical (no input moved during the run): true

distinct verdicts: 1 -> SURVIVED
outcome kinds observed: exit
max duration 20.8s against the 180.0s ceiling
timeouts among these runs: 0
```

### Reading

**An intra-leg mechanism did NOT REPRODUCE — stated at the strength six trials carry.** Formally: an intra-leg mechanism did NOT reproduce, stated at the strength six trials carry. If such a mechanism flipped the verdict with per-run probability `p`, six identical runs occur with probability `p^6 + (1-p)^6`. That expression is SYMMETRIC about `p = 0.5` and falls below 0.05 only on the interval **`0.4019 < p < 0.5981`** — so the honest statement is bounded on BOTH sides, and the meaningful regime is `p <= 0.5` (a mechanism flipping more than half the time would be trivially visible). Six trials therefore exclude only a mechanism flipping at roughly **40% per run or more**; at `p = 0.1`, six identical runs happen **53%** of the time. No control here establishes sensitivity to an intermittent flip, and none is claimed.

**Arithmetic correction, recorded rather than quietly fixed.** An earlier draft gave the bound as
`p > 0.393`, solving `(1-p)^6 = 0.05` and dropping the `p^6` term; at `p = 0.393` the correct value is
`0.0537`, above the threshold. The refuting figure was printed in this probe's own output table and
mis-read.

**And it is not fixable with more trials.** Under a CORRELATED intra-leg mechanism, additional runs in
the SAME process carry no further information — six or six hundred identical results are equally likely
under perfect correlation. **Probe 3 cannot exclude a correlated intra-leg mechanism at ANY sample
size.** Separating correlated from independent behaviour requires varying the process boundary and the
ordering across trials, not repeating within one. So the branch stays OPEN, with the structural reason
it is hard to close now stated — which is an argument FOR the attribution deliverable, since a record
of which evidence produced each verdict is what a future occurrence can be diagnosed from whether or
not any probe isolates the mechanism.

What it supports is a WEIGHTING, not an elimination: the remaining space leans toward between-leg
differences — environment, machine, concurrency across legs, ordering wider than one process — which
is where both original observations sit (local vs CI; nightly vs PR).

Three controls carried it. The second is the one an earlier session could not satisfy: its local
`enumerateSites` reproduced none of the runner's site IDs, so neither of its instruments could
adjudicate what a site even is. This probe uses the shipped generator through the registry row, so the
site id resolves in the runner's own set.

**Two further facts.** 6/6 SURVIVED takes the restored ledger row to **9 of 10 observations** saying
the site survives, settling the single-report removal with evidence rather than judgement. And
per-child wall clock varied **1.4x** with nothing varying at all.

---

## Probe 4 — the advance prediction

### Pre-registration (written before any history was read)

> **The prediction.** If per-child duration drives verdict flakiness, then `ledgerClaimsCore` (7.9x)
> and `premiseScan` (10.4x) should ALSO show unexplained verdict movement. Neither has ever been a
> suspect.
>
> **Branch A — either shows movement.** Sample goes 2 to 3 with an advance prediction behind it.
> **Branch B — both clean.** Evidence AGAINST duration as the driver.
>
> **THE ASYMMETRY, DECLARED BEFORE LOOKING.** These two were never suspects, so nobody was watching
> them. A verdict that moved and was never recorded is indistinguishable, in this corpus, from a
> verdict that never moved. Branch A is STRONG; branch B is WEAK, and I will report it as "no recorded
> movement" and never as "no movement".

### The instrument failed before the world did

The first sweep reported "no source-mutation annotations" for ALL 19 failing runs — **including
`32375262145`, which `BACKLOG.md:53` documents as annotating `ledgerGit`.** Two stacked defects:
`sed` could not match the multibyte em-dash in `source-mutation gate — <id>`, and the loop wrapped its
parse in `try/except: sys.exit(0)`, so a failed read and a genuine zero rendered identically — a
fail-open written into the instrument auditing fail-opens.

Caught only because the ledger row names a run whose annotation content is known. The rebuilt sweep
ABORTS unless that control yields `ledgerGit`:

```
POSITIVE CONTROL 32375262145 -> ['destructiveFileAnalysis', 'ledgerGit', 'rowScanOpener', 'shardBudget']
control OK — the extractor sees annotations it is known to have.
```

### Result — 19 failing `mutation-harness` runs, 2026-08-18 to 2026-08-21

| surface | appearances |
| --- | --- |
| `shardBudget` | 17 |
| `destructiveFileAnalysis` | 17 |
| `rowScanOpener` | 15 |
| `sendAuthScan` | 1 |
| `ledgerGit` | 1 |
| `ledgerClaimsCore` | **0** |
| `premiseScan` | **0** |

### Reading

**Branch B — the prediction did not confirm.** And it is WEAKER than the pre-registration guessed:
`psqlStartupScan`, the surface with the cleanest reproduction and three documented flips, also appears
**zero** times across these 19 runs, because its flips occurred in local gate runs rather than CI legs.
**A channel that cannot see the best-documented case in the corpus cannot certify absence for two
others.** An annotation fires only when a surface FAILS THE GATE, so sub-threshold verdict movement is
invisible to it entirely.

Net: the duration correlate gains no support and takes a weak counter-indication. It remains n = 2,
suggestive, not confirmatory.

**One clean discriminator, and it SHARPENS the hypothesis rather than denting it.** The three
standing-red surfaces are FAST — `rowScanOpener` 39.1x, `destructiveFileAnalysis` and `shardBudget`
163.6x. So duration does NOT track failure in general. The live claim is narrower and better:
**duration tracks verdict INSTABILITY, not failure.** That version survives a datum which would have
killed the looser one, and it predicts the two populations look DIFFERENT rather than predicting that
everything correlates. The n = 2 caveat stays welded to it.

**The finding this probe actually produced is not about duration at all.** The historical record of
verdict movement in this repo is CI-ONLY and FAILURE-ONLY, and nobody knew that until it was measured.
That is the justification for the arc and the binding constraint on its design: a record emitted only
on gate failure would rebuild the blind spot exactly. See design §1.0 and §5.2.

**And the way the instrument defect was caught generalises.** `BACKLOG.md:53` names a specific run and
says what it annotated, which is the only reason a positive control existed. **A concrete instance id
in a ledger row is a test fixture for every future instrument** — a reason to keep naming them.

---

## What is closed, what is open

| branch | state | by |
| --- | --- | --- |
| co-tenancy / LPT re-pack | RULED OUT | pre-registered experiment, `BACKLOG.md:53` |
| intra-leg (ordering, env, concurrency inside one process) | **OPEN.** Not reproduced in 6 serial trials; excludes only a high INDEPENDENT flip rate (~40%/run or more), and excludes a CORRELATED mechanism at no sample size at all | probe 3 |
| duration drives flakiness | UNSUPPORTED, weak counter-indication | probes 2a, 2b, 4 |
| between-leg (machine, environment, across-leg ordering) | OPEN — the remaining space | — |

**The anomaly stands, unexplained.** Ruling out candidates is not an explanation, and the deliverable
is attribution (`design §3`), which ships regardless.
