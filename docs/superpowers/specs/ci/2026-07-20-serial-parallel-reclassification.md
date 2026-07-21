# CI unit-suite serial→parallel reclassification

**Goal:** Move the 533 measured-DB-free files out of the boot-heavy serial vitest
project into the boot-free parallel project, rebalance the CI shard topology to
match the new work distribution, and confirm a real CI wall-clock improvement —
merging only if CI actually improves.

**Owner/mode:** Autonomous ship (user-approved 2026-07-20). No UI touched, so the
impeccable dual-gate does not apply. Cross-model (Codex) review gates the spec,
the plan, and the whole diff.

## 1.1 Resolved scope — do not relitigate

- **The 533-file movable set is a committed ALLOWLIST, and that is the primary
  safety mechanism.** It began as the DB-touch instrumentation spike output
  (`spike/db-touch-instrumentation`, findings at
  `docs/superpowers/specs/ci/2026-07-20-db-touch-instrumentation-spike.md`) — a
  runtime socket probe + static subprocess-DB scan, verified by a clean-DB
  `pnpm test` (0 DB-corruption failures vs the naive set's ~20). The spike's
  runtime probe under-counted 19 files that connect to a local DB via a lazy
  postgres.js pool whose async connect the per-file attribution raced (Codex spec
  R1); those 19 were removed by a static DB-binding sweep (driver import, a
  `*DATABASE_URL` env read, or a `*.db.test.ts`/`*real-db*` filename), taking the
  set from 552 to **533**. Because the set is a closed allowlist, a **newly
  added** file defaults to serial — nothing joins the parallel project without an
  explicit measured addition. An **already-allowlisted file that is later edited
  to add DB access stays parallel** (Codex spec R2b-1): that edit-drift window is
  bounded, not eliminated, by two layers — the static-guard meta-test (§3.2, a
  CI-time tripwire; best-effort, since a source scan cannot see an imported
  helper that connects, a dynamically-built command, or a novel access path) and
  the nightly-enforced re-measurement (§3.4, the authoritative catch — a scheduled
  job that re-runs the instrumented suite and fails on any classification diff,
  capping the drift window at one day). The committed list `tests/probes/db-free-movable.txt` is
  the record; do not re-derive membership.
- **Partition model is an explicit committed FILE LIST, not whole-dir globs.**
  Deliberate: a file-list makes a newly-added test default to SERIAL (safe) until
  it is explicitly measured and added, extending the existing "new dirs default
  to serial" principle (`vitest.projects.ts` header). Whole-clean-dir globs were
  rejected because a new file dropped into a "clean" dir would auto-join the
  parallel project unverified — the exact drift that caused the two-file
  corruption #517 fixed.
- **One file is held serial despite being DB-free:** `tests/cross-cutting/no-global-cursor.test.ts`
  (criterion 3 — CPU-bound, starves under `fileParallelism`; the suite's heaviest
  file). It is NOT in the movable list. This mirrors the pre-existing
  `MEASURED_MOVABLE_BUT_HELD_SERIAL` handling.
- **The five DB-free criteria are settled** (spike findings §"criteria, now five"):
  not vacuous, not degraded, not starving, does-not-write-when-DB-present
  (runtime probe), does-not-reach-DB-via-subprocess (static scan). No new
  criterion is in scope.
- **CI-wall improvement is UNPROVEN until measured on real runners.** Local
  movability ≠ CI wall gain (the program has rejected six levers on exactly this
  gap). The merge gate is numeric and defined in §4: merge requires the candidate
  wall to beat baseline by a margin that clears measurement noise; equality or
  regression is a blocker, not a shipped churn.

## 2. Current state (live-code citations)

- Serial project: `vitest.config.ts:95` — `name: "serial"`, `include: BASE_INCLUDE`,
  `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...movableList,
  ...envBoundExcludes, ...nightlyExcludes]`, `fileParallelism: false` (line 108).
  (The `movableList` entry, `vitest.config.ts:44`, is the spike verification
  lever, repurposed below.)
- Parallel project: `vitest.config.ts:114` — `name: "parallel"`,
  `include: [...PARALLEL_TEST_GLOBS, ...movableList]` (line 115),
  `fileParallelism: true` (line 128).
- Partition source of truth: `vitest.projects.ts` — `PARALLEL_TEST_GLOBS` (17
  directory globs), `BASE_INCLUDE`, `ENV_BOUND_EXCLUDES` (3 files),
  `MUTATION_TEST_GLOBS`.
- Partition meta-test: `tests/cross-cutting/vitest-projects-partition.test.ts` —
  pins that every non-nightly test file lands in exactly one default project.
- CI topology: `.github/workflows/unit-suite.yml` — `unit-suite-db` (8 shards,
  boots Supabase via `scripts/ci/supabase-local-bootstrap.sh`, runs
  `--project=serial --shard=i/8`, lines 93-123); `unit-suite-nodb` (3 shards,
  boots nothing, runs `--project=parallel --shard=i/3`, lines 125-145);
  `unit-suite` rollup requires both matrix results `success` (`if: always()`).
- The `unit-suite-nodb` job is a SECONDARY guard for criterion 4: it runs the
  entire parallel project on a runner with no Supabase and no psql, so an
  in-process DB touch that throws an unhandled error fails the job. It is NOT
  sufficient on its own (Codex spec R2): a file can catch the connection failure,
  set a `dbUp=false` flag, and `skipIf` its DB assertions — going green while its
  DB coverage silently vanishes (exactly the 19 files removed in §1.1). The
  PRIMARY criterion-4/5 guard is the static DB-binding meta-test in §3.2, which
  runs in every CI leg without a DB and deterministically rejects the class.

## 3. Design

### 3.1 Partition mechanism

Replace the spike's ad-hoc `VITEST_MOVABLE_LIST` env lever with a committed
default: `vitest.projects.ts` reads `tests/probes/db-free-movable.txt` at config
load and exports `DB_FREE_MOVABLE` (a `readonly string[]` of 533 repo-relative
paths). `vitest.config.ts` adds `DB_FREE_MOVABLE` to the parallel project's
`include` and to the serial project's `exclude` (replacing the env-gated
`movableList`). No env var required; the move is the committed default.

### 3.2 Meta-test redesign

`tests/cross-cutting/vitest-projects-partition.test.ts` gains a describe block
`db-free-movable list is well-formed and safe`:

1. **Every listed file exists** and matches `BASE_INCLUDE` (a real test file).
2. **No listed file is in a `PARALLEL_TEST_GLOBS` directory** — it must be a
   currently-serial file (else the move is a no-op or a double-include).
3. **No duplicates**, list is sorted (stable diffs).
4. **Disjoint from the DB-touching record** — none of the 533 appears in the
   committed `tests/probes/db-touching-serial.txt` (the 186 must-stay-serial
   files, the negative record).
5. **The held starver is NOT in the list.**
6. **Disjoint from `ENV_BOUND_EXCLUDES`** (Codex spec R5) — an env-bound file
   excluded from serial must not survive in parallel via the movable list.
7. **Complete-partition invariant preserved:** every non-nightly test file still
   lands in exactly one default project (the existing assertion, now accounting
   for the file list).

A new static-guard meta-test under `tests/cross-cutting/` (created in the plan,
named `db-free-movable-static-guard`) — the PRIMARY criterion-4/5 guard. It is a
pure source scan with NO DB dependency, and it stays in the SERIAL project
(`tests/cross-cutting/` is not a parallel glob), so it runs in the `unit-suite-db`
legs — which gate every PR (Codex spec R3-3; the earlier "runs in every leg / the
no-DB leg" claim was wrong — it does not need to, it only needs to run in CI,
which the always-present serial legs guarantee). For every file in
`db-free-movable.txt`, assert it does NOT match any DB-binding signal:

- imports the `postgres` driver — both `from "postgres"` AND
  `require("postgres")` (Codex spec R2b-2) — the class that under-counted in the
  runtime probe (§1.1, Codex spec R1);
- reads ANY DB URL env — `process.env.<NAME>` where `<NAME>` matches
  `/[A-Z0-9_]*DATABASE_URL/` (not just `TEST_`/`LOCAL_TEST_`; Codex spec R2b-2, so
  the CI guard is exactly as wide as the §3.4 regeneration sweep);
- constructs a client (`postgres(` call) or references a local pg URL literal
  (loopback host with a Postgres/PostgREST port — 5432, 54321, or 54322);
- imports `child_process` (with OR without the `node:` prefix — Codex spec R4)
  AND references a DB token (`psql`, `databaseUrl`, `postgres://`,
  `_validation-cleanup-helpers`, `supabase db`);
- has a `*.db.test.ts` or `*real-db*` filename.

The guard signal set MUST be identical to the §3.4 regeneration sweep — a single
shared constant (`DB_BINDING_SIGNALS`) consumed by both, so the CI tripwire can
never be narrower than the sweep that built the list.

This deterministically rejects the DB-binding class at CI time (in the serial
legs) — closing the class that the `unit-suite-nodb` job cannot (a caught/skipped
DB access stays green there). **Acknowledged residual (Codex spec R4):** a file that
reaches a DB purely through a dynamically-assembled command, or a bespoke helper
that shells out with no DB token in either file, evades a source scan. Two
backstops bound that residual: (a) the allowlist is closed — such a file only
runs in parallel if a human explicitly added it after a measured probe run; and
(b) the periodic re-measurement (§3.4) re-runs the full instrumented suite and
diffs the classification, catching any drift the static scan missed.

### 3.3 CI topology rebalance

Moving 533 files shifts work from the 8 boot-heavy db legs to the 3 boot-free
nodb legs:

- Serial project: ~772 → ~220 files. 8 Supabase-booting shards for 220 files is
  over-sharded (each still pays ~70 s boot). **Reduce db shards.**
- Parallel project: ~691 → ~1243 files. 3 shards → ~414/shard risks starving a
  2-core runner (the spike saw timeouts at that concurrency). **Increase nodb
  shards.**

Target total legs ≤ 8 (runner-admission ceiling — the program's core finding:
past ~8 concurrent legs, admission staggers and wall regresses). Candidate:
**db 3 shards + nodb 5 shards = 8 legs.** Exact split is chosen by measurement,
not assertion (§4). The `unit-suite` rollup and the topology meta-test
(`tests/cross-cutting/unit-suite-shard-topology.test.ts`) are updated to the
chosen counts.

### 3.4 Re-measurement / regeneration (enforced cadence — Codex spec R3-2)

The committed lists are regenerated by `pnpm ci:regen-db-free`, which re-runs the
DB-touch probe (`DB_TOUCH_PROBE=1 pnpm test` on a fresh DB) then applies
`scripts/movable-serial.mjs` + the shared `DB_BINDING_SIGNALS` sweep. It is the
documented authority for any change to the two lists (mirrors
`pnpm gen:schema-manifest`).

Edit-drift is temporally bounded by an **enforced nightly job**, not left to
"whenever someone regenerates": a new workflow `db-free-drift.yml` (owner: CI,
schedule `cron: '0 7 * * *'`) boots a fresh DB, runs `pnpm ci:regen-db-free
--check`, and **fails if the freshly-measured lists differ from the committed
ones** (a moved file that gained DB access, or a serial file that became movable).
A failing nightly is the trigger to re-run the generator and commit the diff.
This caps the drift window at one day and gives it an owner and an enforcement
point, rather than relying on a source scan alone.

## 4. Verification (hard CI-wall gate)

1. Local: full `pnpm test` on a fresh DB with the committed move — must match the
   clean baseline (1 known flake: `email-canonicalization`), 0 DB corruption.
2. Local: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and the two
   affected meta-tests green.
3. **Real CI baseline (Codex spec R3 + R2b-3 — deterministic, commit-pinned):**
   - **Fork-point SHA** = `git merge-base origin/main HEAD`, recorded explicitly.
   - **Wall** of a run = `max(completedAt) − min(startedAt)` across both matrix
     jobs (also record start stagger).
   - **`mean2(x)`** = the arithmetic mean of exactly **2** run walls (Codex spec
     R3-4 — "mean", not a lower/upper-median convention).
   - **`baseline`** = `mean2` of two `unit-suite` runs executed against the exact
     fork-point SHA (via `workflow_dispatch` with `ref` = the SHA, or an immutable
     tag pinned to it — never a moving `main`). Record both run IDs and the SHA.
   - **`candidate`** = `mean2` of two `unit-suite` runs on this PR's head.
4. **Gate (Codex spec R3-1/R3-5 — strict, absolute, noise-clearing):** merge
   **iff** `candidate ≤ baseline − 30s`. The 30 s absolute margin is chosen to
   exceed the observed run-to-run stagger noise (~15–25 s on a ~245 s wall) — a
   relative 5 % (~12 s) does NOT clear it, so the absolute margin governs. Any
   `candidate > baseline − 30s` — a sub-margin gain, no change, or a regression —
   is a **blocker**: do not merge. If the first shard split fails the gate, try
   exactly one alternative split within the 8-leg ceiling; if it also fails, STOP,
   report both measurements, and do not merge the churn.

## 11. Numeric authority

- Movable files: **533** (`tests/probes/db-free-movable.txt`, line count).
- Must-stay-serial (DB-touching): **186** (`tests/probes/db-touching-serial.txt`);
  = the 167 probe-detected + 19 static-DB-binding removals (Codex spec R1).
- Held serial (criterion 3): **1** (`no-global-cursor.test.ts`).
- DB-free criteria: **5**.
- Current CI legs: **11** (8 db + 3 nodb). Target: **≤ 8** (admission ceiling).
- Candidate rebalance: **3 db + 5 nodb**, finalized by §4 measurement.
- Merge gate: `candidate ≤ baseline − 30s` (`mean2` walls; 30 s clears ~15–25 s noise).
