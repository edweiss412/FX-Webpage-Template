# Local test-suite wall-clock reduction (test:fast, threads pool, pretest cache)

**Date:** 2026-07-20
**Status:** Spec (autonomous /ship-feature run; user review gates waived).
**Relationship to the CI speedup program:** independent sibling of `docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md`. Program Phases 2 (serial-set audit) and 3 (DB-test parallelization) are in flight elsewhere and OUT of scope here. This spec targets the **local** `pnpm test` wall clock with three levers that do not move any test file between projects and do not touch serial-project isolation.

## 1. Goal

Cut local full-suite wall clock without dropping coverage, via:

- **Lever A — `test:fast`:** overlap the parallel and serial vitest projects as two concurrent processes locally.
- **Lever B — parallel-project `pool: "threads"`:** measured 2.3× on the parallel project phase, isolation intact.
- **Lever C — pretest codegen cache:** skip the four `pre*`-hook generator scripts when their inputs are unchanged (~15s per `pnpm test`/`pnpm lint`/`pnpm typecheck`/`pnpm build` invocation).

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Full autonomous ship authorized (spec+plan user gates waived) | user, in-session 2026-07-20, /ship-feature + explicit "Yes, full autonomous" |
| P2 (serial-set audit) and P3 (DB parallelization) are OUT of scope; serial-project per-file overhead is untouched here | dispatch brief; CI program spec §2 |
| `isolate: false` on the parallel project is a DEAD lever — measured NOT green (mass cross-file state leakage: dozens of component-test failures via shared mock/DOM globals, e.g. `Step3Review.test.tsx` 31/61 failed, `StagedReviewCard.test.tsx` 6/30 failed). Do not re-propose | spike run 2026-07-20, this spec §3.2 |
| `pool: "threads"` lands **unconditionally** on the parallel project (not env-gated local-only); CI unit-suite legs also pick it up and the PR's real CI green is the verification | this spec §4.2 |
| `test:fast` is **opt-in** and coverage-identical to `pnpm test`; it does NOT replace the `test` script and does NOT set `VITEST_EXCLUDE_ENV_BOUND` | this spec §4.1 |
| The fixture-corpus race fix is a `_temp-` prefix filter in the reader, not an orchestration-level exclusion of the reader file | this spec §4.1.2 |
| Local serial-project baseline timing was NOT measured at spec time (two sibling autonomous runs were saturating the box, load avg 25–37, and share the local Supabase DB); a quiet-box verification run is an implementation-task gate, not a spec input | this spec §3.3 |
| Individual `gen:*` package scripts and the x-audits workflow's direct `pnpm gen:*` calls are unchanged; only the four `pre*` hooks route through the cache wrapper | this spec §4.3 |
| Vitest major upgrade, sharding changes, weight-model changes: out of scope | dispatch brief |

## 2. Current state (all citations verified 2026-07-20 against origin/main @ 7497ad26e)

- Two-project vitest partition: serial (`fileParallelism: false`, `vitest.config.ts:71-83`) then parallel (`vitest.config.ts:89-91`), run in **separate sequential phases** (`vitest.projects.ts:12-16`). Parallel set = ~21 dir globs verified DB-free (`vitest.projects.ts:50-72`).
- Neither project sets `pool`; vitest 4.1.5 defaults to the `forks` pool.
- Sequential phasing is what protects the one cross-project fixture-corpus hazard: `tests/help/fixture-range-parser.test.ts:26-28` (parallel) reads `readdirSync(fixtures/shows/raw)` filtered only by `.endsWith(".md")`, while `tests/sync/dev-routing.test.ts:81-95` (serial) writes and later removes `fixtures/shows/raw/_temp-mi1-no-version.md`, a synthetic no-version fixture that would fail the reader's parse loop if listed. Writer/reader inventory swept: this is the only corpus writer under `tests/` and the only parallel-set corpus reader.
- The four `pre*` hooks (`package.json:27-31` — `pretypecheck`, `prelint`, `pretest`, `prebuild`) each chain the same four generators. Measured on this box: `gen:admin-tables` 3.1s, `gen:watermark-symbols` 1.8s, `gen:email-boundaries` 2.2s, `gen:traceability` 1.6s; whole `pnpm pretest` **15.0s** (pnpm per-script overhead included).
- Generator inputs (verified read-surface):
  - `generate-admin-tables.ts`: spec (`SPEC_PATH`, line 3) → `lib/audit/admin-tables.generated.ts` (line 4).
  - `extract-watermark-symbols.ts`: spec (line 4) → `lib/audit/watermark-symbols.generated.ts` (line 5).
  - `extract-email-boundaries.ts`: spec (line 4) + plan `11-cross-cutting.md` (line 5) → `lib/audit/email-boundaries.generated.ts` (line 6).
  - `generate-traceability.ts`: spec (line 7) + plan-dir corpus `^\d{2}-.+\.md$` via `readPlanCorpus` (lines 173-180) + `x-audits.yml` (line 9) + import of `./extract-watermark-symbols` (line 5) → `docs/superpowers/plans/coverage.md` (line 10).
- All generator outputs are committed and regeneration is deterministic (fresh worktree stayed `git status`-clean after a full `pnpm pretest`).
- CI: `unit-suite.yml:80` runs `pnpm exec vitest run --shard=i/8` (no pretest hook — relies on committed artifacts); `x-audits.yml:34-121` calls `pnpm gen:*` scripts directly. So lever C's wrapper executes on NO CI path; lever B executes on every unit-suite leg.

## 3. Measurements (2026-07-20, arm64 macOS dev box)

**Contention caveat:** two sibling autonomous worktree runs were executing vitest throughout (load avg 25–37). Absolute numbers are inflated; the A/B comparisons ran under the same contention, so the ratios are the signal. Quiet-box re-measurement is an acceptance task (§6).

### 3.1 Parallel project, forks baseline

`pnpm exec vitest run --project parallel`: **174.4s** wall (Duration line: transform 108s, setup 33s, import 630s, tests 463s, environment 621s summed across workers). 4 test files flaked with timeout-shaped failures under contention (different files on re-run — starvation, not code).

### 3.2 Parallel project, threads pool

- `--pool=threads --no-isolate`: 28.1s wall but **NOT green** — mass failures from cross-file state leakage (shared mock/DOM globals). Examples: `tests/components/admin/wizard/Step3Review.test.tsx` 31/61 failed, `tests/components/StagedReviewCard.test.tsx` 6/30, `tests/components/admin/BlockedRowResolver.test.tsx` 8/24, plus "Not implemented: navigation" jsdom bleed. **Dead lever** (§1.1).
- `--pool=threads` (isolation intact): **74.2s** wall, then a confirmation run **511/511 files, 5702/5702 tests green**. 2.3× vs the forks baseline under identical contention, and none of the forks baseline's starvation flakes.

### 3.3 Serial project

Not measured locally (sibling runs share the local Supabase DB; a concurrent serial run would race `dev_truncate_all` and pollute both sessions). CI reference: serial 821 files, 217–290s wall per 1/3-leg (program spec §3). Local serial wall is safely ≥ the parallel wall, so lever A hides the entire parallel phase.

### 3.4 Pretest

15.0s per hooked invocation (§2). Warm-cache target: <0.5s.

## 4. Design

### 4.1 Lever A — `scripts/test-fast.mjs` + `test:fast` script

`"test:fast": "pnpm pretest && node scripts/test-fast.mjs"` (explicit `pnpm pretest` chain — pnpm's automatic hook would be `pretest:fast`, which deliberately does not exist; one wrapper, one hook surface).

The runner:

1. Spawns `pnpm exec vitest run --project serial` with stdio inherited (the long pole streams live).
2. Concurrently spawns `pnpm exec vitest run --project parallel` with output buffered; prints the buffer (clearly delimited) after the serial stream ends.
3. Exits non-zero if EITHER child exits non-zero; exit code preserved (serial's code wins if both fail). Forwards SIGINT/SIGTERM to both children.
4. Sets no env vars: env-bound files (`ENV_BOUND_EXCLUDES`, `vitest.projects.ts:34-38`) stay included exactly as in `pnpm test`; mutation project stays absent (same discovery rules). Coverage is byte-identical to `pnpm test` — only phase overlap changes.

Worker arithmetic: serial project runs one file at a time (`fileParallelism: false`), so overlap adds ~1 busy worker on top of the parallel project's pool — no meaningful oversubscription.

#### 4.1.2 Corpus-race fix (precondition for overlap)

`tests/help/fixture-range-parser.test.ts` filter gains `&& !file.startsWith("_temp-")` (both `readdirSync` sites if both list the raw corpus; the `pdfOnlyDir` listing at line 50 is a different directory and untouched unless it lists `fixtures/shows/raw`). `tests/sync/dev-routing.test.ts` gains a comment pinning the `_temp-` prefix as the contract that keeps synthetic fixtures invisible to corpus readers. A small meta-test pins the contract from both sides (reader filters `_temp-`, writer's temp name starts with `_temp-`), so neither side can drift silently (§5).

### 4.2 Lever B — parallel project `pool: "threads"`

Add `pool: "threads"` to the parallel project block (`vitest.config.ts:89-91`), with a comment citing the measured 2.3× and the dead `isolate:false` spike. Unconditional: local runs, `test:fast`, and every CI unit-suite leg pick it up. Serial and mutation projects keep the forks default (mutation is nightly-only and corpus-scale; not measured here — out of scope).

**P2 rebase flag:** the in-flight Phase 2 serial-set audit edits project membership in `vitest.config.ts`/`vitest.projects.ts`. This lever is a one-line project-config addition and must be re-run against P2's final membership when P2 lands (whichever merges second rebases; the meta-test in §5 keeps the pin visible).

Risk note: any parallel-set test relying on process-level isolation (native module state, `process.chdir`, signal handlers) would break under threads. Two full green runs (511 files) found none; real CI green on the PR is the second gate.

### 4.3 Lever C — `scripts/pretest-gen.mjs` cache wrapper

The four `pre*` hooks become `"node scripts/pretest-gen.mjs"`. The wrapper holds a **manifest**: per generator, the exact input list from §2 (spec/plan/workflow paths + the generator source + its local imports) plus the output path. Per target:

- Compute sha256 over (sorted input contents + output content). Compare to the stamp at `node_modules/.cache/fxav-pretest-gen/stamps.json`.
- Match → skip. Mismatch/missing → run that generator via `pnpm exec tsx scripts/<gen>.ts`, then re-hash and write the stamp.
- Output content is part of the hash, so a hand-edited or clobbered generated file always triggers regeneration.
- `PRETEST_GEN_FORCE=1` bypasses all stamps. Stamp dir is inside `node_modules` (never committed, worktree-local).
- `gen:traceability`'s plan-dir corpus input is enumerated at hash time with the same `^\d{2}-.+\.md$` filter as `readPlanCorpus` (`generate-traceability.ts:176`), so adding/removing a plan file invalidates.
- Failure of any generator = non-zero exit, no stamp written (next run retries). Behavior on miss is identical to today's chain, minus the three extra pnpm spawns.

**Staleness guard (structural, ships in the same PR):** a meta-test walks each generator source for its path constants (`SPEC_PATH`/`PLAN_PATH`/`WORKFLOW_PATH` string literals and relative `./` imports) and asserts every one appears in the wrapper's manifest input list for that generator. A new input added to a generator without a manifest row fails CI.

## 5. Meta-test inventory (created by this feature)

1. `tests/cross-cutting/pretest-gen-manifest.test.ts` — staleness guard of §4.3; also pins that all four `pre*` hooks in `package.json` invoke the wrapper (so a hook can't silently revert to the uncached chain, and a fifth generator can't be added to a hook without a manifest row).
2. `tests/cross-cutting/corpus-temp-prefix.test.ts` — §4.1.2 contract: reader source contains the `_temp-` filter; writer's `TEMP_FIXTURE_NAME` starts with `_temp-`.
3. Existing `tests/cross-cutting/package-scripts-target-existing-files.test.ts` covers the new scripts automatically (no explicit test paths inside them). Existing `vitest-projects-partition.test.ts` is untouched — the partition itself does not change.

None of the other candidate registries (Supabase call-boundary, sentinel-hiding, admin-alert catalog, advisory-lock topology, no-inline-email) applies: no Supabase client call, no UI copy, no alert code, no `pg_advisory*`, no email handling in the diff.

## 6. Acceptance criteria

- AC-1: `pnpm test:fast` exits 0 on a quiet box with the same file/test counts as `pnpm test` (both projects), and exits non-zero if either project fails (verified with a deliberately broken test in each project during TDD).
- AC-2: parallel project green under `pool: "threads"` locally AND on the PR's real unit-suite CI run (all 8 legs).
- AC-3: second consecutive `pnpm pretest` completes in <2s (warm stamps) with byte-identical outputs; editing the master spec (or any manifest input) triggers regeneration of exactly the affected targets.
- AC-4: quiet-box measurement recorded in the PR body: `pnpm test` before vs `pnpm test:fast` after, plus warm-pretest timing (contention-free replacement for §3's caveated numbers).
- AC-5: meta-tests of §5 pass and fail-by-default checks demonstrated in TDD (manifest row removed → test fails; `_temp-` filter removed → test fails).

## 7. Out of scope

Serial-project isolation/pool changes, test-file moves between projects (P2), DB-test parallelization (P3), mutation-project pool, vitest upgrade, CI workflow edits (`unit-suite.yml` untouched), replacing `pnpm test`.
