# CI serial→parallel reclassification — arc retrospective (SHELVED)

**Status:** SHELVED 2026-07-20 (user decision). Correctness verified; performance
lever did not clear the merge bar. This document is the durable record so the arc
is not re-attempted from scratch.

**Artifacts (pushed, unmerged, kept for reference):**

- Branch `spike/db-touch-instrumentation` — the DB-touch measurement tooling.
- Branch `perf/ci-reclassify-db-free-serial` — the full reclassification + guards
  + topology change. PR **#528** (closed, not merged).
- Instrumentation spike findings: on those branches at
  `docs/superpowers/specs/ci/2026-07-20-db-touch-instrumentation-spike.md`.
- Reclassification spec + plan (APPROVED via 5 spec / 2 plan Codex rounds): on the
  `perf/` branch under `docs/superpowers/{specs,plans}/ci/2026-07-20-serial-parallel-reclassification*`.

---

## What we set out to do

The CI unit-suite program (9.1 → ~4.1 min across #504–#517) had one remaining
lever: ~72% of the boot-heavy `serial` vitest project was measured to not require
a database. Moving those files into the boot-free `parallel` project — and
rebalancing the shard topology to match — was the hypothesised next win.

The blocker to attempting it (from the prior spike) was that "passes without a
database" is not sufficient evidence a file is safe to parallelize. This arc built
the instrumentation to turn that inference into a measurement, then acted on it.

## What we built (works, verified)

1. **DB-touch probe** (`tests/probes/`): a socket-level hook
   (`net.Socket.prototype.connect`) that records every TCP connect per test file —
   one hook catches both in-process DB paths (postgres.js + the Supabase HTTP
   client). Proven inert (observe-only) and validated against #517 ground truth.

2. **The load-bearing finding:** no single runtime hook is sufficient. The socket
   probe is blind to a **child** `psql` process, and 40 `tests/db/*` files reach
   Postgres that way. Worse, a destructured `import { execFileSync }` binds before
   any probe can patch the module (`NAMED_IMPORT_TOUCHES: []`), so subprocess DB
   access needs a **static** scan. The classifier therefore composes a runtime
   socket probe (authoritative for in-process access) with a static
   `DB_BINDING_SIGNALS` scan (authoritative for the subprocess class). The
   original "just instrument postgres.js" idea would have missed both the Supabase
   HTTP client and all 40 subprocess files.

3. **The committed classification + guards** (on the `perf/` branch): an allowlist
   file, a static DB-binding meta-test as the primary criterion-4/5 CI guard, a
   nightly drift job, and a regeneration script. These are sound — see below.

## Why it was shelved

Two independent reasons, both surfaced by **real CI** (not local):

### 1. Concurrency flakiness (criterion 3, at CI scale)

Moving ~527 files into the parallel project raises per-shard concurrency.
Timing-sensitive **moved** files that ran fine serially — e.g.
`tests/admin/_metaInfraContract.test.ts`, heavy async mock work — **starve past
the 5 s test timeout** under the higher parallel load. Candidate CI run 1 passed;
candidate run 2, on identical code, failed on exactly this. A **required** merge
gate cannot flake, and this class is **load-dependent — not fully enumerable
ahead of time**. Holding each flaky file serial as CI surfaces it is whack-a-mole.

The spike flagged criterion 3 (starvation) and we held two files serial
(`no-global-cursor`, `auth-chain-audit`), but the full set of concurrency-fragile
files only appears under CI's 4-core + high-concurrency conditions, one at a time.

### 2. Wall-clock win unproven / marginal

Per the program's core lesson (local movability ≠ CI wall gain), the merge gate
was numeric: candidate ≤ baseline − 30 s. The real-CI samples were
contention-noisy and put the candidate roughly **17 s** under baseline — **below
the 30 s gate**. Clean sequential re-measurement would cost several more CI runs
and, on the available data, likely lands short of the threshold anyway.

This is the **seventh** lever this program has rejected on the same pattern: looks
fine locally, does not cleanly pan out on real CI (see the six in
`project_ci_speedup_program_2026_07`).

## What the CI legs proved (the correctness win is real)

The `unit-suite-nodb` legs — which run the parallel project with **no database** —
did exactly their job and caught two real classification bugs before merge:

- `tests/scripts/validation-report-fixtures.test.ts` reaches psql through an
  **imported helper** (`runPsql` / `_validation-cleanup-helpers`), not a direct
  `child_process` import, so the static matcher's subprocess signal missed it
  (the acknowledged transitive gap). Fixed with a narrow `db-helper-call` signal
  (a `runPsql(` **call** or import of the psql-shelling helper — NOT a mere DB-lib
  import, which mocked unit tests legitimately do).
- `tests/cross-cutting/auth-chain-audit.test.ts` is a concurrency starver (timed
  out both locally and in the no-DB leg). Held serial.

So the DB-free classification method and the guard are sound; the *move* is what
did not pay off.

## What is reusable if this is ever revived

- The **DB-touch probe + static `DB_BINDING_SIGNALS` matcher** are the genuine
  reusable asset — the measurement tool a future attempt would run first.
- The **five (really six) criteria** for "safe to parallelize" are the durable
  lesson: not vacuous, not degraded, not starving-under-concurrency, does-not-
  write-when-DB-present, does-not-reach-DB-via-subprocess, **and** does-not-
  timeout-under-CI-parallel-load (the criterion this arc added — the one that
  shelved it).

## Revival criteria (do not re-attempt without these)

Filed as `BL-CI-RECLASSIFY-PARALLEL-STABILITY` in `BACKLOG.md`. A future attempt
must, BEFORE proposing a move:

1. Solve criterion-3 at CI scale structurally — e.g. cap the parallel project's
   per-leg worker concurrency (`poolOptions.maxWorkers`) or raise the parallel
   `testTimeout`, then prove stability across **≥5 consecutive** green CI runs, not
   one. Flakiness in a required gate is disqualifying.
2. Demonstrate a **clean ≥30 s** wall win with sequential, non-contending
   measurements (one run at a time; the program's "measure workflow wall, not max
   leg" and "contended box invalidates perf numbers" rules apply to CI runs too).
3. Only then is the move worth the churn. Absent both, the correctness tooling can
   stand alone (e.g. as a nightly DB-drift audit) without the serial→parallel move.
