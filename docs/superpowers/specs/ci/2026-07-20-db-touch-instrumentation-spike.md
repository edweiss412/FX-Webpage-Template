# DB-touch instrumentation spike — findings

**Status:** SPIKE COMPLETE. Positive result. Reclassification is viable but is a
separate project (not shipped here).

**Branch:** `spike/db-touch-instrumentation` (not for merge as-is).

## Question

The 2026-07-20 reclassification spike established that ~72% of the serial vitest
project does not *require* a database, but moving those files into the concurrent
(no-DB) project broke the local suite: some files do not require a DB yet still
*write* to one when present, and that criterion is invisible to a pass/fail run.
The recommended next step was to *instrument* "does this file touch the DB" so it
becomes a measurement, not an inference. This spike did that.

## What was built

A per-test-file DB-touch probe, gated behind `DB_TOUCH_PROBE=1` (off by default,
the normal suite pays nothing):

- `tests/probes/dbTouchProbe.ts` — wraps `net.Socket.prototype.connect`. One hook
  catches both in-process DB paths: postgres.js (direct Postgres) and the Supabase
  JS client (PostgREST over HTTP). Prototype-method interception, so it survives
  any import style. Proven inert (5 behavior tests) and validated against #517
  ground truth: `extractAgenda.test.ts` reports `db:2` on 54322.
- `tests/probes/subprocessDbProbe.ts` — wraps `child_process` spawn/exec and
  records a touch when argv looks like a DB command (`psql`, `supabase db`, a
  DB URL/port).
- `tests/probes/dbTouchReport.ts` + `tests/setup.ts` hook — emits one JSONL row
  per test file, **including files that opened zero sockets** (the rows the
  measurement is after).
- `scripts/analyze-db-touch.mjs` — joins probe rows against vitest's JSON results,
  with a validity gate that REFUSES to classify a run whose log shows the local
  stack was unreachable (a mid-run Docker death silently ruined the first run).
- `scripts/movable-serial.mjs` — computes the movable set.

## The load-bearing finding: no purely-runtime hook is sufficient

The socket probe is blind to a DB connection opened by a **child process**. This
is not a corner case: **40 of the repo's `tests/db/*` files reach Postgres via
`execFileSync("psql", [url])`**. The socket probe filed every one as DB-free.

The subprocess probe closes part of the gap, but a **destructured
`import { execFileSync }` binds the reference before any probe can patch the
module property** — proven empirically (`NAMED_IMPORT_TOUCHES: []` under vitest's
SSR transform). All 40 repo files use that form, so runtime interception of the
subprocess class is import-style-dependent and cannot be relied on.

The dependable classifier therefore **composes two mechanisms**:

1. **Runtime socket probe** — authoritative for in-process DB access
   (postgres.js, Supabase HTTP client). Precise; catches lazy/conditional
   connects a static scan would miss.
2. **Static `child_process` + DB-token scan** — authoritative for the subprocess
   class the runtime cannot see.

A file is movable only if BOTH agree it is DB-free.

> The original single-lever idea ("instrument postgres.js") would have missed the
> in-process Supabase HTTP client *and* all 40 subprocess-psql files. It was
> insufficient by two independent gaps.

## Measured result (clean-DB controlled protocol)

Baseline (fresh DB, no reclassification): **1 failed / 1452 passed** — the one
failure is `email-canonicalization.test.ts`, a known CPU-bound/env-bound file,
flaky under full-suite load and already excluded on CI.

| Classifier | Movable | Result vs baseline |
|---|---|---|
| Naive "passes with closed port" | 556 | ~20 **DB-corruption** failures |
| Socket probe only | 591 | DB-corruption cluster present (validation-finalize-all-atomic, onboarding-db, `tests/db/*`) |
| **Composed socket + static subprocess** | **553** (552 after holding the known CPU-starver) | **0 DB corruption** |

The composed run's 5 failures were all non-corruption: 3 files timed out at 5s
under the concurrency load of 552 files on a contended box (all 3 pass in
isolation — criterion 3, starvation, the same class as `no-global-cursor` /
`email-canonicalization`), 1 was the partition meta-test correctly detecting the
move, 1 was a known parser-ordering flake. No `ECONNREFUSED`, no `tests/db/*`
failure, no onboarding-DB failure.

## The criteria, now five

A serial file is safe to move to the concurrent no-DB project only if it:

1. is **not vacuous** (executes >0 tests without a DB);
2. is **not silently degraded** (same passing-assertion count with/without DB);
3. **does not starve** under `fileParallelism` (CPU-bound heavies);
4. **does not write** to a DB when one is present — *now measured* by the socket
   probe (run with the DB up, opened no socket); and
5. **does not reach a DB via a subprocess** — caught only by the static scan,
   because a destructured `import { execFileSync }` evades runtime interception.

## Recommendation

Instrumentation has de-risked the reclassification: **~552 serial files are
provably movable with zero shared-DB corruption** (~72% of the serial project).
Claiming that CI wall-clock is a **separate project**, because:

- the partition is directory-based by design; 552 individual files across
  mostly-DB dirs (`tests/db`, `tests/sync`, `tests/onboarding`) forces a
  file-granular partition, which fights the current clean-directory meta-test and
  needs a partition/meta-test redesign;
- criterion-3 files need the existing `MEASURED_MOVABLE_BUT_HELD_SERIAL` handling
  plus a large enough parallel shard count that the concurrency does not starve
  the runner;
- the payoff must be confirmed on **real CI wall clock**, not local (local
  wall ≠ CI wall — the program's core lesson).

The probe infra in this branch is the reusable measurement tool that project
would run first.
