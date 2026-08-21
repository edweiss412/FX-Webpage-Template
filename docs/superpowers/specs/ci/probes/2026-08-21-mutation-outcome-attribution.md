# Probe record — mutation outcome attribution (2026-08-21)

Companion to `docs/superpowers/specs/ci/2026-08-21-mutation-outcome-attribution-design.md`.
Row: `BL-MUTATION-SCORE-NONDETERMINISM` (`BACKLOG.md:53`).

Every probe declared its negative branch in writing BEFORE it ran. Pre-registrations are reproduced
verbatim below, ahead of each result, so no reading can have been fitted to an outcome.

**Standing method notes.**
- All runs are on one developer machine, under `pnpm heavy` (the machine-wide two-slot semaphore).
- Score inputs are stamped by blob hash inside the measuring invocation, before AND after.
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

**Reading stated before the number landed:** a per-mutant maximum far from 180 s does not merely
weaken the timeout mechanism, it comes close to closing it for the whole population, since every other
surface has 4x to 22x more room again. A mutant child approaching the ceiling makes the mechanism live
and §5.5's decision urgent.

RESULT: see `p2b` section appended below.

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
> **NEGATIVE BRANCH.** All N identical. Then the mechanism is localized OUTSIDE a single leg — machine,
> environment, or across-leg state. It does NOT resurrect co-tenancy, which is RULED OUT. It does NOT
> make the anomaly unreal. Ruling out a location is not an explanation, and I will say so.
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

**The intra-leg branch is CLOSED** — a result, not an absence. Whatever moves this verdict differs
BETWEEN legs: environment, machine, concurrency across legs, or ordering wider than one process. Both
original observations straddle exactly that axis (local vs CI; nightly vs PR).

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
| intra-leg (ordering, env, concurrency inside one process) | CLOSED | probe 3 |
| duration drives flakiness | UNSUPPORTED, weak counter-indication | probes 2a, 2b, 4 |
| between-leg (machine, environment, across-leg ordering) | OPEN — the remaining space | — |

**The anomaly stands, unexplained.** Ruling out candidates is not an explanation, and the deliverable
is attribution (`design §3`), which ships regardless.
