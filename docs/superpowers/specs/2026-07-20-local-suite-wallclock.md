# Local test-suite wall-clock reduction (test:fast, threads pool, pretest cache)

**Date:** 2026-07-20 (R2 revision — rounds 1-2 findings incorporated)
**Status:** Spec (autonomous /ship-feature run; user review gates waived).
**Relationship to the CI speedup program:** independent sibling of `docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md`. Program Phases 2 (serial-set audit) and 3 (DB-test parallelization) are in flight elsewhere and OUT of scope here. This spec targets the **local** `pnpm test` wall clock with three levers that do not move any test file between projects and do not touch serial-project isolation.

## 1. Goal

Cut local full-suite wall clock without dropping coverage, via three levers. **Measured outcome (§3.0): ~17s off a ~490s suite (3.5%), from levers A and C; lever B was measured, rejected, and reverted (§4.2).** The serial project is ~420s of that wall and is untouched here by design (P2/P3 territory, in flight elsewhere) — that finding is the headline, not a shortfall.


- **Lever A — `test:fast`:** overlap the parallel and serial vitest projects as two concurrent processes locally.
- **Lever B — parallel-project `pool: "threads"`: REJECTED and reverted in-PR** per the §4.2 decision procedure. Nil local effect (57.1s vs 57.9s) AND no CI improvement (max leg 253s vs main 246-269s). Recorded as a dead lever so it is not re-proposed.
- **Lever C — pretest codegen cache:** skip the four `pre*`-hook generator scripts when their inputs are unchanged (1.65s → 0.23s per `pnpm test`/`pnpm lint`/`pnpm typecheck`/`pnpm build` invocation, §3.0).

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Full autonomous ship authorized (spec+plan user gates waived) | user, in-session 2026-07-20, /ship-feature + explicit "Yes, full autonomous" |
| P2 (serial-set audit) and P3 (DB parallelization) are OUT of scope; serial-project per-file overhead is untouched here | dispatch brief; CI program spec §2 |
| `isolate: false` on the parallel project is a DEAD lever — measured NOT green (mass cross-file state leakage: dozens of component-test failures via shared mock/DOM globals, e.g. `Step3Review.test.tsx` 31/61 failed, `StagedReviewCard.test.tsx` 6/30 failed). Do not re-propose | spike run 2026-07-20, this spec §3.2 |
| `pool: "threads"` is a **DEAD lever** — the conditional gate ran and it FAILED both arms: nil quiet-box effect (57.1s vs 57.9s) and no CI gain (PR max leg 253s vs main 246/269/250s). Reverted in-PR; do not re-propose without new measurements | this spec §4.2, decided 2026-07-20 on PR #508 run 29727575689 |
| `test:fast` is **opt-in** and coverage-identical to `pnpm test`; it does NOT replace the `test` script and does NOT set `VITEST_EXCLUDE_ENV_BOUND` | this spec §4.1 |
| Cross-project shared-file conflicts are handled by exactly two mechanisms: the `_temp-` prefix contract for the fixture corpus (§4.1.2) and the `TEST_FAST_DEFERRED` epilogue set for generated-file assertions (§4.1.3). R1+R2 fs-write class-sweep of `tests/` found no third always-on surface; the env-gated `build-artifact-gate` writer is handled by the runner's `RUN_BUILD_ARTIFACT_GATE_TEST=1` refusal (§4.1 item 5) | R1/R2 reviews + sweep, this spec §2 |
| Quiet-box verification ran at implementation time and its numbers (§3.0) are AUTHORITATIVE over every spike-era figure in §3.1. Contended numbers are never a keep/drop basis | this spec §3.0 |
| Individual `gen:*` package scripts and the x-audits workflow's direct `pnpm gen:*` calls are unchanged; only the four `pre*` hooks route through the cache wrapper | this spec §4.3 |
| Vitest major upgrade, sharding changes, weight-model changes: out of scope | dispatch brief |
| Codex CLI was hard-wedged for R1 (`models_cache` TTL schema error, 6 no-output attempts across 2 guarded dispatches); per AGENTS.md no_verdict ladder, R1 ran as an independent fresh-eyes agent review (findings below) with real CI as backstop. Retry Codex each subsequent round | this run, 2026-07-20 |

## 2. Current state (all citations verified 2026-07-20 against origin/main @ 7497ad26e)

- Two-project vitest partition: serial (`fileParallelism: false`, `vitest.config.ts:71-83`) then parallel (`vitest.config.ts:89-91`), run in **separate sequential phases** (`vitest.projects.ts:12-16`). Parallel set = 21 include globs verified DB-free (`vitest.projects.ts:50-72`).
- Neither project sets `pool`; vitest 4.1.5 defaults to the `forks` pool.
- Sequential phasing currently protects exactly **two** always-on cross-project shared-file surfaces (R1+R2 class-sweep: every fs write call in `tests/` was enumerated; all others are hermetic `tmpdir()`/`mkdtemp` writes, or gated OFF by default — `tests/admin/build-artifact-gate.test.ts` writes `.next*` dirs and, via its `pnpm build` spawn, `devPanelPresent.ts`, but only under `RUN_BUILD_ARTIFACT_GATE_TEST=1`; `tests/fixtures/diagrams/buildEmbeddedSampleXlsx.ts` writes only when run as an argv-invoked script, never at test time):
<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
  1. **Fixture corpus:** `tests/help/fixture-range-parser.test.ts:26-28` (parallel) reads `readdirSync(fixtures/shows/raw)` filtered only by `.endsWith(".md")`, while `tests/sync/dev-routing.test.ts` (serial) writes and later removes **three** synthetic fixtures there: `_temp-mi1-no-version.md` (line 81), `_temp-version-ambiguous.md` (line 298), `_temp-flip-test.md` (line 354, rewritten during the flip test). Each would fail the reader's parse loop if listed.
  2. **Generated dev-panel flag:** `tests/admin/withAdminDevFlagDevPanelPresent.test.ts:6-16` (serial) rewrites `lib/admin/__generated__/devPanelPresent.ts` to `true` mid-test (restoring the committed `false` in `afterEach` at lines 14-17), while `tests/components/admin/settings/DevToolsRow.absent.test.tsx:17-25` (parallel) real-imports it and asserts `DEV_PANEL_PRESENT === false`. R2 sweep: this is the only parallel-set file that real-imports the constant (`DevToolsRow.test.tsx` mocks it; `tests/app/admin/` settings tests reach it only transitively and assert nothing about its value).
- The four `pre*` hooks (`package.json:28-32` — `pretypecheck`, `prelint`, `pretest`, `prebuild`) each chain the same four generators. Measured on this box: `gen:admin-tables` 3.1s, `gen:watermark-symbols` 1.8s, `gen:email-boundaries` 2.2s, `gen:traceability` 1.6s; whole `pnpm pretest` **15.0s** under contention, **1.65s** on a quiet box (§3.0 supersedes; the per-generator splits above are contended too).
- Generator inputs (verified read-surface; none of the four reads `process.env`):
  - `generate-admin-tables.ts`: spec (`SPEC_PATH`, line 3) → `lib/audit/admin-tables.generated.ts` (line 4).
  - `extract-watermark-symbols.ts`: spec (line 4) → `lib/audit/watermark-symbols.generated.ts` (line 5).
  - `extract-email-boundaries.ts`: spec (line 4) + plan `11-cross-cutting.md` (line 5) → `lib/audit/email-boundaries.generated.ts` (line 6).
  - `generate-traceability.ts`: spec (line 7) + plan-dir corpus `^\d{2}-.+\.md$` via `readPlanCorpus` (lines 173-180) + `x-audits.yml` (line 9) + import of `./extract-watermark-symbols` (line 5) → `docs/superpowers/plans/coverage.md` (line 10).
- All generator outputs are committed and regeneration is deterministic (fresh worktree stayed `git status`-clean after a full `pnpm pretest`).
- CI: `unit-suite.yml:80` runs `pnpm exec vitest run --shard=i/8` (no pretest hook — relies on committed artifacts); `x-audits.yml` calls `pnpm gen:*` scripts directly (15 call sites: lines 34, 40, 46, 52, 84, 87, 118, 121, 152, 180, 183, 214, 217, 222, 258). So lever C's wrapper executes on NO CI path; lever B executes on every unit-suite leg.
- No existing test or meta-test pins the `pre*` hook strings, the parallel project's pool, or `cacheDir` (grepped `tests/cross-cutting` for `pool`, `fileParallelism`, `pretest`: only `vitest-projects-partition.test.ts` pins `fileParallelism`, which this spec does not change).

## 3. Measurements

### 3.0 QUIET-BOX RESULTS (authoritative; supersede the contended §3.1-3.4 spike numbers)

Measured 2026-07-20 02:39-03:05 CDT with zero sibling vitest processes (load 4.6-7.4), after implementation:

| Measurement | Result |
| --- | --- |
| `pnpm test` (baseline, threads pool) | **491.1s** - 1446 files, 15285 tests, 0 failures |
| `pnpm test` with `--pool=forks` | **483.5s** - same totals |
| `pnpm test:fast` (overlap + epilogue) | **474.9s** - 935 + 510 + 1 files = 1446; 9572 + 5711 + 2 = 15285 (exact coverage identity) |
| parallel project alone, forks | **57.9s** |
| parallel project alone, threads | **57.1s** |
| four-generator chain (old `pre*` hooks) | **1.65s** |
| `pretest-gen` wrapper, cold | **1.77s** |
| `pretest-gen` wrapper, warm | **0.23s** |

**Honest conclusions, replacing the spike-era claims:**

1. **Lever A saves ~16s (3%)** of a ~490s suite, not the parallel phase's full wall. The parallel phase overlaps the serial one, but the extra CPU load slows the serial phase by roughly what the overlap saves. Coverage identity is exact.
2. **Lever B (threads) is a NO-OP on a quiet box** (57.1s vs 57.9s, ~1%). The spike's "2.3x" (174.4s forks vs 74.2s threads) was measured at load 25-37 and reflects only that forks starves harder under contention. It is therefore a **conditional lever** (§4.2), kept only if real CI leg timings improve - CI's 2-core runners are the contended regime where the effect appeared.
3. **Lever C saves ~1.4s per hooked invocation** (1.65s -> 0.23s warm), not the spike's 15.0s (also contention-inflated). Still worthwhile: it fires on every `pnpm test`/`lint`/`typecheck`/`build`.
4. **The serial project is the entire local long pole** (~420s of the ~490s). No lever in this spec touches it; that is precisely P2/P3 territory (out of scope, in flight elsewhere). Anyone reading this spec expecting a large local speedup should read that as the finding, not a shortfall.

### 3.1 Spike-era numbers (CONTENDED; retained for the record only)

The measurements below ran while two sibling autonomous worktree runs saturated the box (load 25-37). They are NOT a basis for any keep/drop decision; §3.0 supersedes them.

- Parallel project, forks: 174.4s wall; 4 files flaked with timeout-shaped failures (different files per run - starvation).
- Parallel project, `--pool=threads --no-isolate`: 28.1s but NOT green - mass cross-file state leakage (`Step3Review.test.tsx` 31/61 failed, `StagedReviewCard.test.tsx` 6/30, `BlockedRowResolver.test.tsx` 8/24, jsdom "Not implemented: navigation" bleed). **Dead lever** (§1.1) - this conclusion stands independent of load.
- Parallel project, `--pool=threads`: 74.2s, 511/511 files green.
- `pnpm pretest` (old chain): 15.0s.
- Serial project: not measured under contention (shares the local Supabase DB with sibling runs).

**Contention is symmetric across pools.** During implementation, a full parallel run under threads at load 38-53 failed 7-12 tests; a control run under **forks at the same load failed 9 with identical shapes** (5s timeouts, duplicate-DOM `Found multiple elements`, double-counted spies). Both pools flake the same way on a saturated box; neither flakes on a quiet one (§3.0: 0 failures).

## 4. Design

<!-- spec-lint: ignore — future file created by this feature -->
### 4.1 Lever A — `scripts/test-fast.mjs` + `test:fast` script

`"test:fast": "pnpm pretest && node scripts/test-fast.mjs"` (explicit `pnpm pretest` chain — pnpm's automatic hook would be `pretest:fast`, which deliberately does not exist; one wrapper, one hook surface).

The runner:

1. Spawns `pnpm exec vitest run --project serial` with stdio inherited (the long pole streams live). Env: unchanged.
<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
2. Concurrently spawns `pnpm exec vitest run --project parallel` with `VITEST_TEST_FAST=1` (see §4.1.3) and output captured: teed incrementally to `node_modules/.cache/fxav-test-fast/parallel.log` (crash-safe) AND buffered in memory. The moment the parallel child exits non-zero, one stderr line announces it (`[test:fast] parallel project FAILED — full output after serial phase`); the full buffer prints (clearly delimited) after the serial stream ends.
3. **Epilogue:** after both phases, runs `pnpm exec vitest run --project parallel <TEST_FAST_DEFERRED files>` WITHOUT `VITEST_TEST_FAST` (§4.1.3) — seconds of extra wall, restores full coverage.
4. Exits non-zero if ANY of the three children exits non-zero (serial's code wins when several fail; else parallel's; else epilogue's). Forwards SIGINT/SIGTERM to live children.
5. **Refuses `RUN_BUILD_ARTIFACT_GATE_TEST=1`** (exits with an error naming `pnpm test` as the supported path): that gate's `pnpm build` spawn rewrites `devPanelPresent.ts` mid-run (§2), which the overlap cannot tolerate. Fail-loud beats a silent env unset.
6. Coverage identity with `pnpm test`: env-bound files (`ENV_BOUND_EXCLUDES`, `vitest.projects.ts:34-38`) stay in the serial phase; the mutation project stays absent; every parallel file runs in the overlap phase or the epilogue. Only phase timing changes.

Worker arithmetic: serial project runs one file at a time (`fileParallelism: false`), so overlap adds ~1 busy worker on top of the parallel project's pool — no meaningful oversubscription.

#### 4.1.2 Fixture-corpus contract (`_temp-` prefix)

<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
New shared constant `tests/helpers/corpusTemp.ts` exporting `CORPUS_TEMP_PREFIX = "_temp-"` (the `tests/helpers/` non-test-helper convention already exists — `buildXlsx.ts`, `dataGapsFixture.ts`).

- Reader: `fixture-range-parser.test.ts` filter gains `&& !file.startsWith(CORPUS_TEMP_PREFIX)` (the `pdfOnlyDir` listing at line 50 targets a different directory and is untouched).
- Writer: `dev-routing.test.ts` builds all three synthetic names from `CORPUS_TEMP_PREFIX` and gains a comment pinning the contract.
- Meta-test (§5): source-scans `dev-routing.test.ts` for every corpus write site (`writeFile(join(FIXTURE_DIR, …))`), asserts each filename argument resolves to a `_temp-`-prefixed name, asserts the count of write sites matches the scan (a fourth, unprefixed write fails), and asserts the reader source contains the prefix filter. Not tautological: reader filter and writer names are asserted against the shared constant, not against each other's source.

This kills the corpus race for ANY concurrent-run context (not just `test:fast`), so the reader needs no deferral.

#### 4.1.3 `TEST_FAST_DEFERRED` epilogue set (generated-file assertions)

`vitest.projects.ts` exports `TEST_FAST_DEFERRED = ["tests/components/admin/settings/DevToolsRow.absent.test.tsx"]` — **repo-relative paths, not globs** (a relative path is itself a valid vitest exclude pattern, doubles as the epilogue CLI file filter, and lets the meta-test `existsSync` it directly) — parallel-set files that assert on-disk state a serial test mutates mid-run (§2 surface 2: `devPanelPresent.ts`). When `VITEST_TEST_FAST=1`, the parallel project's `exclude` gains these globs (same env-gated project-exclude mechanism as `VITEST_EXCLUDE_ENV_BOUND`, `vitest.config.ts:16-22` comment — CLI `--exclude` is NOT used; vitest ignores it when a project defines `exclude`). The runner's epilogue executes them after the serial phase ends, when the file is guaranteed restored (`afterEach` at `withAdminDevFlagDevPanelPresent.test.ts:14-17`).

<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
Also gated on `VITEST_TEST_FAST=1`: root `cacheDir` switches to `node_modules/.vite-testfast` so the two concurrent vitest processes never share a Vite cache/deps-optimizer directory (the serial child and the epilogue keep the default).

### 4.2 Lever B — parallel project `pool: "threads"` (RUN, REJECTED, REVERTED)

The predeclared keep/drop procedure ran to completion; both arms failed, so the one-line change was reverted inside this PR and the parallel project keeps vitest's default `forks` pool.

| Arm | Threshold | Measured | Outcome |
| --- | --- | --- | --- |
| Quiet-box local | any material gain | 57.1s threads vs 57.9s forks (~1%) | FAIL |
| Real CI max leg | ≥15s improvement, 8/8 green | 253s (PR #508 run 29727575689, 8/8 green) vs main 246s / 269s / 250s | FAIL |

The spike's "2.3× under load 25-37" was a contention artifact: forks starves harder than threads on a saturated box, but a 2-core CI runner did not reproduce the effect. `isolate: false` remains separately dead (cross-file mock/DOM leakage). Both are now documented in `vitest.config.ts` so the next reader does not re-derive them.

**Value delivered by running this lever anyway:** the measurement itself, plus the config comment that stops the next person from re-proposing it.

### 4.3 Lever C — `scripts/pretest-gen.mjs` cache wrapper

The four `pre*` hooks become `"node scripts/pretest-gen.mjs"`. The wrapper holds a **manifest**: per generator, the exact input list from §2 (spec/plan/workflow paths + the generator source + its transitive local-import closure) plus the output path. Per target:

<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
- Compute sha256 over (sorted input contents + output content). Compare to the stamp at `node_modules/.cache/fxav-pretest-gen/stamps.json`.
- Match → skip. Mismatch/missing → run that generator via `pnpm exec tsx scripts/<gen>.ts`, then re-hash and write the stamp.
- Output content is part of the hash, so a hand-edited or clobbered generated file always triggers regeneration.
- `PRETEST_GEN_FORCE=1` bypasses all stamps. Stamp dir is inside `node_modules` (never committed, worktree-local).
- `gen:traceability`'s plan-dir corpus input is enumerated at hash time with the same `^\d{2}-.+\.md$` filter as `readPlanCorpus` (`generate-traceability.ts:176`), so adding/removing a plan file invalidates.
- Failure of any generator = non-zero exit, no stamp written (next run retries). Behavior on miss is identical to today's chain, minus the three extra pnpm spawns.

**Staleness guard (structural, ships in the same PR):** a meta-test that, per generator, (a) walks the **transitive** local-import closure (`./`/`../` specifiers, recursively) and asserts every reached source file is in that generator's manifest inputs; (b) guards **reads, not data** (R4 refinement — the plan-time sweep showed `extract-email-boundaries.ts` carries ~24 path-shaped literals that are canonicalization DATA, never read; an all-literals arm would demand a churny allowlist): every `readFileSync`/`readdirSync`/`existsSync`/`createReadStream` call argument in a reached source must be (i) an inline repo-path literal covered by the manifest, (ii) an UPPER_SNAKE const resolved in-file to a covered literal, or (iii) an entry in an explicit per-file `COMPUTED_READS` pin in the meta-test (today: `generate-traceability.ts`'s `specPath`/`workflowPath` params — call sites pass `SPEC_PATH`/`WORKFLOW_PATH` — and `readPlanCorpus`'s `join(dir, entry)`, covered by the `inputDirs` row); any read call matching none of these fails. The walker in (a) follows static `import`/`export … from` AND literal dynamic `import("./…")` specifiers (JSON imports included), fails on any non-literal specifier, and fails on any `@/`-alias import in a generator (forces the manifest question before an alias hop hides an input); (c) asserts none of the reached sources reads `process.env` (currently true — a future env-sensitive generator must extend the manifest schema first). A new input added any of these ways without a manifest row fails CI.

## 5. Meta-test inventory (created by this feature)

<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
1. `tests/cross-cutting/pretest-gen-manifest.test.ts` — staleness guard of §4.3; also pins that all four `pre*` hooks in `package.json` invoke the wrapper (a hook can't silently revert to the uncached chain, and a fifth generator can't ride a hook without a manifest row).
<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
2. `tests/cross-cutting/corpus-temp-prefix.test.ts` — §4.1.2 contract (write-site scan + reader-filter pin against the shared constant).
<!-- spec-lint: ignore — future/transient file created or produced by this feature -->
3. `tests/cross-cutting/test-fast-deferred.test.ts` — every `TEST_FAST_DEFERRED` entry exists on disk AND is matched by `PARALLEL_TEST_GLOBS` (a moved/renamed deferred file fails instead of silently vanishing from the epilogue), and the runner script references `TEST_FAST_DEFERRED` (epilogue can't be dropped silently). **Discovery arm (fails-closed on future importers):** scans every parallel-set test file for the string `__generated__/devPanelPresent`; any file containing it must either `vi.mock` that specifier or be listed in `TEST_FAST_DEFERRED`. Boundary: transitive (non-import-literal) readers are out of scan reach — acceptable because they cannot assert the constant's value without importing it.
4. Existing `vitest-projects-partition.test.ts` is untouched — the partition itself does not change. (The new `.mjs` scripts are pinned by #1 and #3, not by `package-scripts-target-existing-files.test.ts`, which only checks explicit `*.test.ts` targets in vitest scripts.)

None of the other candidate registries (Supabase call-boundary, sentinel-hiding, admin-alert catalog, advisory-lock topology, no-inline-email) applies: no Supabase client call, no UI copy, no alert code, no `pg_advisory*`, no email handling in the diff.

## 6. Acceptance criteria

- AC-1: `pnpm test:fast` exits 0 on a quiet box with the same file/test counts as `pnpm test` (overlap + epilogue sum), and exits non-zero if any child fails (verified with a deliberately broken test in each project during TDD).
- AC-2: parallel project green under `pool: "threads"` locally AND on the PR's real unit-suite CI run (all 8 legs).
- AC-3: second consecutive `pnpm pretest` completes in <2s (warm stamps) with byte-identical outputs; editing the master spec (or any manifest input) triggers regeneration of exactly the affected targets.
- AC-4: quiet-box measurement recorded in the PR body: `pnpm test` before vs `pnpm test:fast` after, plus warm-pretest timing (contention-free replacement for §3's caveated numbers).
- AC-5: meta-tests of §5 pass, with fail-by-default demonstrated in TDD (manifest row removed → #1 fails; `_temp-` filter removed → #2 fails; deferred entry renamed → #3 fails).

## 7. Out of scope

Serial-project isolation/pool changes, test-file moves between projects (P2), DB-test parallelization (P3), mutation-project pool, vitest upgrade, CI workflow edits (`unit-suite.yml` untouched), replacing `pnpm test`.
