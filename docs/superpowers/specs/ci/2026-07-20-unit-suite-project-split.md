# unit-suite project split — DB legs boot Supabase, no-DB legs do not

**Date:** 2026-07-20
**Status:** IMPLEMENTED on `perf/ci-project-split`.
**Predecessors:** #504 (8-leg matrix), #507 (12 dirs serial→parallel), #510 (closed, no gain), #512 (partition proof), #513 (stale runner-spec correction), #514 (Namespace runners, closed on measurement).

## 1. The lever

Per-leg fixed overhead is ~100s, of which ~71s is the Supabase bootstrap. Every one of the 8 legs paid it — including for the parallel project, whose files were verified to touch no database. The suite was sharded by FILE across one job, so every leg carried a mix of both projects and therefore needed a database.

Splitting by PROJECT lets the DB-free half skip the boot entirely.

### 1.1 Resolved scope — do not relitigate

| Decision | Rationale |
| --- | --- |
| Split by project, not more file shards | A plain 8→12 file-shard bump models to ~205s; the project split reaches ~188s AND removes the boot from a third of the legs |
| 8 DB + 3 no-DB legs | Set by RUNNER CONCURRENCY, not by the arithmetic — see §2.1. The timing floor (~100s overhead + ~30s startup + the unsplittable 54s `no-global-cursor.test.ts`) is not the binding constraint; leg-start queueing is |
| Two files MOVED, not exception-listed | Serial excludes each parallel dir glob wholesale, so a per-file parallel exclusion strands the file in NO project |
| No separate drift-gate workflow | `unit-suite-nodb` already runs the whole parallel project with no database on every PR. It IS the standing gate |
| Total legs stay near 8 | 16 legs was tried and REGRESSED the wall clock (§2.1). The pre-PR observation of 24 concurrent jobs at 11s max delay did NOT predict the ceiling at 16 unit-suite legs alongside x-audits' ~18 |

## 2. Measurements (CI probe run 29758568301, one runner per project, whole project, unsharded)

| Metric | Value |
| --- | --- |
| serial project total | **690s** |
| parallel project total | **294s** |
| sum | 984s |
| previous 8 mixed legs, vitest step | 8 × ~158s = **1,264s** |
| implied per-leg startup/transform | ~280s total, ~35s per leg |
| previous max leg | 245–259s |
| heaviest single serial file | 54s (`no-global-cursor.test.ts`) |

The ~280s gap is the cost of every leg re-importing and re-transforming the graph. It is the reason leg counts saturate: each added leg divides the test work but re-pays that fixed slice.

Superseded model: a back-fit projection put serial at ~900s and parallel at ~366s — both 25–30% high. The measurement is what this design uses.

## 2.1 The binding constraint is runner concurrency — and the win is small

Four topologies were measured on PR #517, all against a like-for-like PR baseline (run 29754822376). A push-to-main baseline would flatter the result: PRs fire x-audits' ~18 jobs alongside, and that neighbour load is part of what sets the ceiling.

| Config | Start stagger | Max leg | **Workflow wall** |
| --- | --- | --- | --- |
| 8 mixed (baseline, run 29754822376) | 3s | 253s | **262s** |
| 12+4 (run 29760670825) | **171s** | 182s | **342s** — REGRESSED |
| 8+3 (run 29761339451) | 43s | 195s | **246s** — best |
| 6+2 (run 29761927532) | 15s | 246s | **256s** |

12+4 hit its per-leg target exactly — 182s against 258s, the full predicted win — and still lost, because 16 legs could not all start at once. The last began after the entire baseline run would have finished. Shrinking to 6+2 removed the stagger and handed the per-leg gain straight back.

**8+3 is the measured optimum, and it is worth ~16s — about 6% — not the ~27% the arithmetic projected.** Two costs scale against added legs and cancel most of the benefit: the ~35s of per-leg startup and transform work identified in §2, and runner-acquisition queueing.

### Why this still ships

Not for the 16s. The `unit-suite-nodb` job runs the whole parallel project with no database on every PR, which is what catches a DB-touching file drifting into a parallel directory — the bug in §4, which was live in `main` and had been for weeks. The perf change is what makes that gate free rather than an extra job.

**The generalizable lesson:** per-leg wall clock and workflow wall clock are different objectives that move in opposite directions past some leg count. Every projection in §2 optimizes the first; only a measured run reveals the second. The pre-flight concurrency check (24 concurrent jobs at 11s max delay) did not extrapolate to 16 unit-suite legs beside the same neighbours — a projection failure of exactly the kind this project has now made four times.

## 3. Topology

```
unit-suite-db    8 legs  boots Supabase  vitest run --project=serial   --shard=i/8
unit-suite-nodb  3 legs  boots NOTHING   vitest run --project=parallel --shard=i/3
unit-suite        aggregator, needs BOTH, asserts BOTH rollups == success
```

Measured at 8+3: max leg 195s against a 253s baseline; workflow wall 246s against 262s.

**Coverage** is guaranteed by two composing invariants, not by inspection. The claim is "every file runs exactly once, EXCEPT the three env-bound files, which run zero times here and are gated by x-audits instead" — both jobs set `VITEST_EXCLUDE_ENV_BOUND=1`, and that exclusion is applied only to the serial project. A meta-test pins that all three env-bound files stay in serial dirs, since an env-bound file added to a parallel dir would NOT be excluded and would run in the no-DB leg, in the very environment it was excluded for needing.

The two invariants:

1. `vitest-projects-partition.test.ts` — every non-nightly test file lands in exactly ONE default project.
2. `unit-suite-shard-topology.test.ts` — each job runs exactly one project, and each job's `--shard` denominator equals its own matrix length.

Together: every file runs exactly once. Verified empirically as well — the four parallel shards partition 691 files as 169+171+173+178.

## 4. The DB-free claim, and how it had rotted

The parallel project's contract is that its files touch no database. That was verified once, per DIRECTORY, on 2026-06-23. Membership is by directory glob, so every file added to those directories afterwards inherited the claim with nothing re-verifying it.

The probe ran all 693 parallel-project files against a runner with no Supabase and no psql installed. Exactly two failed, both `connect ECONNREFUSED 127.0.0.1:54322`:

- `tests/admin/extractAgenda.test.ts` — added 2026-06-29, six days after the split, into the then-parallel `tests/app/admin/` directory
- `tests/admin/layoutIdentityFault.test.tsx` — predates the split; the `tests/app/admin/` dir audit missed it

(Both are cited at their post-move locations; each lived under `tests/app/admin/` when the probe caught it.)

Because the probe covered every file rather than a sample, that is a census **of files that fail loudly without a database**. Both moved to `tests/admin/` (a serial directory).

### 4.1 What "DB-free" does and does not mean (adversarial review, finding 2)

The probe establishes that no parallel-project file *fails* without PostgreSQL. That is weaker than "touches no database," and the gap is worth naming because it is not closable by re-running the probe:

- a test that catches or swallows a connection error and passes anyway
- a setup hook that returns early when the DB is unreachable
- an availability-dependent skip, or an assertion that goes vacuous
- a conditional DB path that this runner environment never activates

Any of those turns green while exercising a FALLBACK path rather than the DB-backed behavior it was written to check. The no-DB job repeats the same observation every PR, so it inherits the same blind spot.

Two things bound the risk. The original partition (2026-06-23) was verified by a stricter protocol — every Supabase endpoint pointed at a CLOSED PORT, which surfaces swallowed-error paths that a merely-absent database does not. And the parallel project's files were selected as DB-free by construction, not discovered to be.

What is genuinely new is that the claim is now re-checked continuously instead of once. It is a regression detector, not a proof. A file that silently degrades to a fallback path remains invisible to it — `BL-CI-PARALLEL-DB-FALLBACK-AUDIT` tracks re-running the closed-port protocol across the whole parallel project to close that residue.

**This was a correctness bug independent of CI timing.** Under `fileParallelism: true` those two raced each other against one shared database — the exact hazard the serial project exists to prevent. They passed only because nothing had yet interleaved them badly.

**The drift cannot silently recur.** `unit-suite-nodb` runs the whole parallel project with no database on every PR, so the next such file goes red on arrival rather than waiting for a reader to notice.

## 5. Risks accepted

- **16 concurrent legs, up from 8.** Measured headroom says fine; if queueing appears, drop to 10+3 (~199s) — a one-line matrix change plus the meta-test constants.
- **The no-DB job is only as good as the partition.** If someone adds a DB-touching file to a parallel dir, `unit-suite-nodb` fails and blocks merge. That is the intended behavior, but it will read as an unrelated failure until the message is understood; the topology test's assertion text names the cause.
