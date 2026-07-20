# CI unit-suite serial→parallel reclassification

**Goal:** Move the 552 measured-DB-free files out of the boot-heavy serial vitest
project into the boot-free parallel project, rebalance the CI shard topology to
match the new work distribution, and confirm a real CI wall-clock improvement —
merging only if CI actually improves.

**Owner/mode:** Autonomous ship (user-approved 2026-07-20). No UI touched, so the
impeccable dual-gate does not apply. Cross-model (Codex) review gates the spec,
the plan, and the whole diff.

## 1.1 Resolved scope — do not relitigate

- **The 552-file movable set is authoritative and empirically verified.** It is
  the output of the DB-touch instrumentation spike (`spike/db-touch-instrumentation`,
  findings at `docs/superpowers/specs/ci/2026-07-20-db-touch-instrumentation-spike.md`),
  which composed a runtime socket probe with a static subprocess-DB scan. The set
  was verified by a clean-DB controlled `pnpm test`: **0 DB-corruption failures**
  vs the naive set's ~20. Do not re-derive "is this file DB-free" from first
  principles; the committed list `tests/probes/db-free-movable.txt` is the record.
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
  gap). A real-CI measurement is a hard gate: if the rebalanced topology does not
  improve the wall vs the pre-change baseline, the reclassification is NOT
  merged. A regression is a blocker, not a shipped churn.

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
- The `unit-suite-nodb` job is the standing CI guard for criterion 4: it runs the
  entire parallel project on a runner with no Supabase and no psql, so an
  in-process DB touch by a moved file fails immediately.

## 3. Design

### 3.1 Partition mechanism

Replace the spike's ad-hoc `VITEST_MOVABLE_LIST` env lever with a committed
default: `vitest.projects.ts` reads `tests/probes/db-free-movable.txt` at config
load and exports `DB_FREE_MOVABLE` (a `readonly string[]` of 552 repo-relative
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
4. **Disjoint from the DB-touching record** — none of the 552 appears in the
   committed `tests/probes/db-touching-serial.txt` (the 167 must-stay-serial
   files, committed as the negative record).
5. **The held starver is NOT in the list.**
6. **Complete-partition invariant preserved:** every non-nightly test file still
   lands in exactly one default project (the existing assertion, now accounting
   for the file list).

A new subprocess-guard meta-test under `tests/cross-cutting/` (created in the
plan, criterion 5 CI guard): for every file in `db-free-movable.txt`, assert it
does NOT both
import `node:child_process` AND reference a DB token (`psql`, `databaseUrl`, a
`postgres://` URL, `_validation-cleanup-helpers`, `supabase db`). This catches a
future edit that adds subprocess DB access to a moved file — the class the
`unit-suite-nodb` job cannot catch (a child psql with no DB just errors).

### 3.3 CI topology rebalance

Moving 552 files shifts work from the 8 boot-heavy db legs to the 3 boot-free
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

## 4. Verification (hard CI-wall gate)

1. Local: full `pnpm test` on a fresh DB with the committed move — must match the
   clean baseline (1 known flake: `email-canonicalization`), 0 DB corruption.
2. Local: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and the two
   affected meta-tests green.
3. **Real CI:** push and read `unit-suite` wall clock (`max(completedAt) −
   min(startedAt)` across both matrix jobs) and start stagger, against a
   like-for-like PR baseline run. Report both numbers.
4. **Gate:** merge only if the rebalanced wall clock is **≤ the baseline** (a
   material improvement is the goal; a regression is a blocker per §1.1). If the
   first shard split regresses, try one alternative within the 8-leg ceiling; if
   neither improves, STOP, report the measurement, and do not merge the churn.

## 11. Numeric authority

- Movable files: **552** (`tests/probes/db-free-movable.txt`, line count).
- Must-stay-serial (DB-touching): **167** (`tests/probes/db-touching-serial.txt`).
- Held serial (criterion 3): **1** (`no-global-cursor.test.ts`).
- DB-free criteria: **5**.
- Current CI legs: **11** (8 db + 3 nodb). Target: **≤ 8** (admission ceiling).
- Candidate rebalance: **3 db + 5 nodb**, finalized by §4 measurement.
