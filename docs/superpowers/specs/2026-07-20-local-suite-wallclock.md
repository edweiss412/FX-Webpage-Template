# Local test-suite wall-clock reduction (test:fast, threads pool, pretest cache)

**Date:** 2026-07-20 (R1 revision — review round 1 findings incorporated)
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
| Cross-project shared-file conflicts are handled by exactly two mechanisms: the `_temp-` prefix contract for the fixture corpus (§4.1.2) and the `TEST_FAST_DEFERRED` epilogue set for generated-file assertions (§4.1.3). R1 fs-write class-sweep of `tests/` found no third surface (§2) | R1 review + sweep, this spec §2 |
| Local serial-project baseline timing was NOT measured at spec time (two sibling autonomous runs were saturating the box, load avg 25–37, and share the local Supabase DB); a quiet-box verification run is an implementation-task gate, not a spec input | this spec §3.3 |
| Individual `gen:*` package scripts and the x-audits workflow's direct `pnpm gen:*` calls are unchanged; only the four `pre*` hooks route through the cache wrapper | this spec §4.3 |
| Vitest major upgrade, sharding changes, weight-model changes: out of scope | dispatch brief |
| Codex CLI was hard-wedged for R1 (`models_cache` TTL schema error, 6 no-output attempts across 2 guarded dispatches); per AGENTS.md no_verdict ladder, R1 ran as an independent fresh-eyes agent review (findings below) with real CI as backstop. Retry Codex each subsequent round | this run, 2026-07-20 |

## 2. Current state (all citations verified 2026-07-20 against origin/main @ 7497ad26e)

- Two-project vitest partition: serial (`fileParallelism: false`, `vitest.config.ts:71-83`) then parallel (`vitest.config.ts:89-91`), run in **separate sequential phases** (`vitest.projects.ts:12-16`). Parallel set = 21 include globs verified DB-free (`vitest.projects.ts:50-72`).
- Neither project sets `pool`; vitest 4.1.5 defaults to the `forks` pool.
- Sequential phasing currently protects exactly **two** cross-project shared-file surfaces (R1 class-sweep: every fs write call in `tests/` was enumerated; all others are hermetic `tmpdir()`/`mkdtemp` writes):
  1. **Fixture corpus:** `tests/help/fixture-range-parser.test.ts:26-28` (parallel) reads `readdirSync(fixtures/shows/raw)` filtered only by `.endsWith(".md")`, while `tests/sync/dev-routing.test.ts` (serial) writes and later removes **three** synthetic fixtures there: `_temp-mi1-no-version.md` (line 81), `_temp-version-ambiguous.md` (line 298), `_temp-flip-test.md` (line 354, rewritten during the flip test). Each would fail the reader's parse loop if listed.
  2. **Generated dev-panel flag:** `tests/admin/withAdminDevFlagDevPanelPresent.test.ts:6-16` (serial) rewrites `lib/admin/__generated__/devPanelPresent.ts` to `true` mid-test (restoring the committed `false` in `afterEach`), while `tests/components/admin/settings/DevToolsRow.absent.test.tsx:17-25` (parallel) real-imports it and asserts `DEV_PANEL_PRESENT === false`.
- The four `pre*` hooks (`package.json:27-31` — `pretypecheck`, `prelint`, `pretest`, `prebuild`) each chain the same four generators. Measured on this box: `gen:admin-tables` 3.1s, `gen:watermark-symbols` 1.8s, `gen:email-boundaries` 2.2s, `gen:traceability` 1.6s; whole `pnpm pretest` **15.0s** (pnpm per-script overhead included).
- Generator inputs (verified read-surface; none of the four reads `process.env`):
  - `generate-admin-tables.ts`: spec (`SPEC_PATH`, line 3) → `lib/audit/admin-tables.generated.ts` (line 4).
  - `extract-watermark-symbols.ts`: spec (line 4) → `lib/audit/watermark-symbols.generated.ts` (line 5).
  - `extract-email-boundaries.ts`: spec (line 4) + plan `11-cross-cutting.md` (line 5) → `lib/audit/email-boundaries.generated.ts` (line 6).
  - `generate-traceability.ts`: spec (line 7) + plan-dir corpus `^\d{2}-.+\.md$` via `readPlanCorpus` (lines 173-180) + `x-audits.yml` (line 9) + import of `./extract-watermark-symbols` (line 5) → `docs/superpowers/plans/coverage.md` (line 10).
- All generator outputs are committed and regeneration is deterministic (fresh worktree stayed `git status`-clean after a full `pnpm pretest`).
- CI: `unit-suite.yml:80` runs `pnpm exec vitest run --shard=i/8` (no pretest hook — relies on committed artifacts); `x-audits.yml` calls `pnpm gen:*` scripts directly (call sites at lines 34, 40, 46, 52, 84, 87, 118, 121, 152, 180). So lever C's wrapper executes on NO CI path; lever B executes on every unit-suite leg.
- No existing test or meta-test pins the `pre*` hook strings, the parallel project's pool, or `cacheDir` (grepped `tests/cross-cutting` for `pool`, `fileParallelism`, `pretest`: only `vitest-projects-partition.test.ts` pins `fileParallelism`, which this spec does not change).

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

15.0s per hooked invocation (§2). Warm-cache acceptance bound: <2s (expected ~0.3–0.5s; the bound is generous for slow disks — same value as AC-3).

## 4. Design

### 4.1 Lever A — `scripts/test-fast.mjs` + `test:fast` script

`"test:fast": "pnpm pretest && node scripts/test-fast.mjs"` (explicit `pnpm pretest` chain — pnpm's automatic hook would be `pretest:fast`, which deliberately does not exist; one wrapper, one hook surface).

The runner:

1. Spawns `pnpm exec vitest run --project serial` with stdio inherited (the long pole streams live). Env: unchanged.
2. Concurrently spawns `pnpm exec vitest run --project parallel` with `VITEST_TEST_FAST=1` (see §4.1.3) and output captured: teed incrementally to `node_modules/.cache/fxav-test-fast/parallel.log` (crash-safe) AND buffered in memory. The moment the parallel child exits non-zero, one stderr line announces it (`[test:fast] parallel project FAILED — full output after serial phase`); the full buffer prints (clearly delimited) after the serial stream ends.
3. **Epilogue:** after both phases, runs `pnpm exec vitest run --project parallel <TEST_FAST_DEFERRED files>` WITHOUT `VITEST_TEST_FAST` (§4.1.3) — seconds of extra wall, restores full coverage.
4. Exits non-zero if ANY of the three children exits non-zero (serial's code wins when several fail; else parallel's; else epilogue's). Forwards SIGINT/SIGTERM to live children.
5. Coverage identity with `pnpm test`: env-bound files (`ENV_BOUND_EXCLUDES`, `vitest.projects.ts:34-38`) stay in the serial phase; the mutation project stays absent; every parallel file runs in the overlap phase or the epilogue. Only phase timing changes.

Worker arithmetic: serial project runs one file at a time (`fileParallelism: false`), so overlap adds ~1 busy worker on top of the parallel project's pool — no meaningful oversubscription.

#### 4.1.2 Fixture-corpus contract (`_temp-` prefix)

New shared constant `tests/helpers/corpusTemp.ts` exporting `CORPUS_TEMP_PREFIX = "_temp-"` (the `tests/helpers/` non-test-helper convention already exists — `buildXlsx.ts`, `dataGapsFixture.ts`).

- Reader: `fixture-range-parser.test.ts` filter gains `&& !file.startsWith(CORPUS_TEMP_PREFIX)` (the `pdfOnlyDir` listing at line 50 targets a different directory and is untouched).
- Writer: `dev-routing.test.ts` builds all three synthetic names from `CORPUS_TEMP_PREFIX` and gains a comment pinning the contract.
- Meta-test (§5): source-scans `dev-routing.test.ts` for every corpus write site (`writeFile(join(FIXTURE_DIR, …))`), asserts each filename argument resolves to a `_temp-`-prefixed name, asserts the count of write sites matches the scan (a fourth, unprefixed write fails), and asserts the reader source contains the prefix filter. Not tautological: reader filter and writer names are asserted against the shared constant, not against each other's source.

This kills the corpus race for ANY concurrent-run context (not just `test:fast`), so the reader needs no deferral.

#### 4.1.3 `TEST_FAST_DEFERRED` epilogue set (generated-file assertions)

`vitest.projects.ts` exports `TEST_FAST_DEFERRED = ["**/tests/components/admin/settings/DevToolsRow.absent.test.tsx"]` — parallel-set files that assert on-disk state a serial test mutates mid-run (§2 surface 2: `devPanelPresent.ts`). When `VITEST_TEST_FAST=1`, the parallel project's `exclude` gains these globs (same env-gated project-exclude mechanism as `VITEST_EXCLUDE_ENV_BOUND`, `vitest.config.ts:16-22` comment — CLI `--exclude` is NOT used; vitest ignores it when a project defines `exclude`). The runner's epilogue executes them after the serial phase ends, when the file is guaranteed restored (`afterEach` at `withAdminDevFlagDevPanelPresent.test.ts:15-18`).

Also gated on `VITEST_TEST_FAST=1`: root `cacheDir` switches to `node_modules/.vite-testfast` so the two concurrent vitest processes never share a Vite cache/deps-optimizer directory (the serial child and the epilogue keep the default).

### 4.2 Lever B — parallel project `pool: "threads"`

Add `pool: "threads"` to the parallel project block (`vitest.config.ts:89-91`), with a comment citing the measured 2.3× and the dead `isolate:false` spike. Unconditional: local runs, `test:fast`, and every CI unit-suite leg pick it up. Serial and mutation projects keep the forks default (mutation is nightly-only and corpus-scale; not measured here — out of scope).

**P2 rebase flag:** the in-flight Phase 2 serial-set audit edits project membership in `vitest.config.ts`/`vitest.projects.ts`. This lever is a one-line project-config addition and must be re-run against P2's final membership when P2 lands (whichever merges second rebases).

Risk note: any parallel-set test relying on process-level isolation (native module state, `process.chdir`, signal handlers) would break under threads. R1 sweep: no `process.chdir`/`process.on`/native-addon hits in the parallel dirs; two full green runs (511 files); real CI green on the PR is the final gate.

### 4.3 Lever C — `scripts/pretest-gen.mjs` cache wrapper

The four `pre*` hooks become `"node scripts/pretest-gen.mjs"`. The wrapper holds a **manifest**: per generator, the exact input list from §2 (spec/plan/workflow paths + the generator source + its transitive local-import closure) plus the output path. Per target:

- Compute sha256 over (sorted input contents + output content). Compare to the stamp at `node_modules/.cache/fxav-pretest-gen/stamps.json`.
- Match → skip. Mismatch/missing → run that generator via `pnpm exec tsx scripts/<gen>.ts`, then re-hash and write the stamp.
- Output content is part of the hash, so a hand-edited or clobbered generated file always triggers regeneration.
- `PRETEST_GEN_FORCE=1` bypasses all stamps. Stamp dir is inside `node_modules` (never committed, worktree-local).
- `gen:traceability`'s plan-dir corpus input is enumerated at hash time with the same `^\d{2}-.+\.md$` filter as `readPlanCorpus` (`generate-traceability.ts:176`), so adding/removing a plan file invalidates.
- Failure of any generator = non-zero exit, no stamp written (next run retries). Behavior on miss is identical to today's chain, minus the three extra pnpm spawns.

**Staleness guard (structural, ships in the same PR):** a meta-test that, per generator, (a) walks the **transitive** local-import closure (`./`/`../` specifiers, recursively) and asserts every reached source file is in that generator's manifest inputs; (b) scans every reached source for **all** repo-path-shaped string literals (regex `^(docs|lib|supabase|scripts|app|components|tests|\.github)/`), regardless of the constant name or inline position, and asserts each literal (or, for a directory passed to `readdirSync`, the directory) appears in the manifest inputs or outputs; (c) asserts none of the reached sources reads `process.env` (currently true — a future env-sensitive generator must extend the manifest schema first). A new input added any of these ways without a manifest row fails CI.

## 5. Meta-test inventory (created by this feature)

1. `tests/cross-cutting/pretest-gen-manifest.test.ts` — staleness guard of §4.3; also pins that all four `pre*` hooks in `package.json` invoke the wrapper (a hook can't silently revert to the uncached chain, and a fifth generator can't ride a hook without a manifest row).
2. `tests/cross-cutting/corpus-temp-prefix.test.ts` — §4.1.2 contract (write-site scan + reader-filter pin against the shared constant).
3. `tests/cross-cutting/test-fast-deferred.test.ts` — every `TEST_FAST_DEFERRED` entry exists on disk AND is matched by `PARALLEL_TEST_GLOBS` (a moved/renamed deferred file fails instead of silently vanishing from the epilogue), and the runner script references `TEST_FAST_DEFERRED` (epilogue can't be dropped silently).
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
