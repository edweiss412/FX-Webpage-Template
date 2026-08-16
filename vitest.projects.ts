// Single source of truth for the vitest two-project partition (imported by both
// vitest.config.ts and tests/cross-cutting/vitest-projects-partition.test.ts).
// Kept in its own module so vitest.config.ts has a default export only (avoids
// rollup's MIXED_EXPORTS warning when the config is bundled).
//
// The PARALLEL project: directories whose test files were empirically verified
// to be DB-free and fixture-corpus-safe (each passed with every Supabase/DB
// endpoint pointed at a closed port, run with fileParallelism:true). These run
// concurrently. EVERYTHING ELSE runs in the SERIAL project (fileParallelism:
// false) because it shares mutable global state — the local Supabase DB
// (tests/db, tests/admin, tests/api, tests/sync, tests/onboarding, …) or the
// fixtures/shows/raw corpus WRITER (tests/sync/dev-routing — the corpus
// READERS in tests/parser moved to the parallel project in Phase 2, 2026-07-19;
// phases never overlap, so readers never race the serial writer). vitest runs
// the two projects in SEPARATE sequential phases, so the parallel project
// never overlaps the serial one — a fixture-corpus reader in the parallel set
// (e.g. tests/help/fixture-range-parser, tests/parser) never races the serial
// writer. New directories default to SERIAL (safe): add to this list ONLY after
// verifying the dir is DB-free.
//
// The DB-free claim is now CI-ENFORCED rather than trusted. It began as a
// one-time, per-DIRECTORY audit (2026-06-23), so files added to these dirs
// afterwards inherited it unverified -- two had, and were racing each other
// against one shared DB under fileParallelism:true (CI probe run 29758568301;
// both moved to tests/admin/). The unit-suite-nodb job now runs this ENTIRE
// project on a runner with no Supabase and no psql installed, on every PR, so a
// DB-touching file added to a parallel dir fails immediately instead of drifting
// in silently. Spec: docs/superpowers/specs/ci/2026-07-20-unit-suite-project-split.md
//
// The vitest-projects-partition meta-test pins the
// invariant that every non-nightly test file lands in exactly one default
// project (the nightly mutation-harness files land in none by design).

export const BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"];

// Files the unit-suite CI job must NOT run (each needs an environment the
// local-bootstrap runner can't provide, or starves under full-suite concurrency
// on the 2-core runner). They live in SERIAL dirs and run normally for local
// `pnpm test` and — crucially — for the x-audits jobs that invoke them DIRECTLY
// via `vitest run <file>` (x5 → email-canonicalization). So they must NOT be in
// the always-on project `exclude` (that would make those targeted audits run 0
// tests). Instead the config adds them to the serial project's exclude ONLY when
// `VITEST_EXCLUDE_ENV_BOUND=1` (set by unit-suite.yml). A plain project-level
// exclude is required because vitest IGNORES the CLI `--exclude` flag when a
// project already defines its own `exclude` (the bug that broke the first run of
// this split — the CLI flags silently did nothing and email-canonicalization
// ran + timed out).
// pg-cron-coverage was removed from this list on 2026-07-26: unit-suite-db
// boots a Postgres and applies the pg_cron migrations, so it has a live
// database to introspect. See tests/cross-cutting/pgCronCiVacuity.test.ts for
// the anti-vacuity guards that keep it from passing without asserting.
/**
 * Coverage registry for ENV_BOUND_EXCLUDES (spec 2026-07-26-ci-dark-descoped-
 * closeout §6): every excluded file names the PR-blocking workflow job whose
 * verbatim `pnpm run-excluded <file>` step proves it executes, or carries a
 * dark row that keeps the build RED while naming the backlog entry. Verified
 * structurally by tests/ci/_metaEnvBoundExclusionCoverage.test.ts.
 */
export type EnvBoundCoverageRow =
  | { workflow: string; job: string }
  | { dark: true; backlogRef: string };
export const ENV_BOUND_COVERAGE_REGISTRY: Record<string, EnvBoundCoverageRow> = {
  "tests/cross-cutting/email-canonicalization.test.ts": {
    workflow: ".github/workflows/x-audits.yml",
    job: "x5-email-canonicalization",
  },
};

export const ENV_BOUND_EXCLUDES = [
  // test-auth-gate returned to unit-suite 2026-07-31 (PR-B of the ci-dark
  // descoped close-out): resolution verified under VITEST_EXCLUDE_ENV_BOUND=1
  // and 5x stability-looped before the row came out.
  "**/tests/cross-cutting/email-canonicalization.test.ts",
];

// The mutation harness (8 LPT shard files + 1 gates file, tests/parser/
// mutationHarness.*.test.ts — sharding spec §3.3/§3.4) exhaustively parses ~102k
// mutants — far past any merge-gating leg budget. The files live in NO default
// project: the serial project excludes them UNCONDITIONALLY, and a third
// `mutation` project (fileParallelism:true — the sharding speedup) exists ONLY
// when VITEST_INCLUDE_MUTATION_HARNESS=1 (nightly workflow + local regen runs).
// (User-directed nightly placement 2026-07-06; parent spec §Non-goals + AC-5.)
export const MUTATION_TEST_GLOBS = [
  "tests/parser/mutationHarness.*.test.ts",
  // Source-mutation gate (spec docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md):
  // spawns one vitest child per mutant, so it is nightly + on-demand, never merge-gating.
  "tests/mutation/guardSurfaces.gate.test.ts",
  // Browser-mutant gate (spec docs/superpowers/specs/ci/2026-08-15-mutation-browser-mode.md):
  // spawns a real Playwright child per mutant, ~20-30 min for its first enrolled
  // surface, so it is nightly + on-demand for the same reason and never merge-gating.
  "tests/mutation/browser/browserSurfaces.gate.test.ts",
];
export const NIGHTLY_ONLY_EXCLUDES = [
  "**/tests/parser/mutationHarness.*.test.ts",
  "**/tests/mutation/guardSurfaces.gate.test.ts",
  "**/tests/mutation/browser/browserSurfaces.gate.test.ts",
];

export const PARALLEL_TEST_GLOBS = [
  "tests/components/**/*.test.{ts,tsx}",
  "tests/help/**/*.test.{ts,tsx}",
  "tests/messages/**/*.test.{ts,tsx}",
  "tests/app/**/*.test.{ts,tsx}",
  "tests/crew/**/*.test.{ts,tsx}",
  "tests/visibility/**/*.test.{ts,tsx}",
  "tests/realtime/**/*.test.{ts,tsx}",
  "tests/time/**/*.test.{ts,tsx}",
  "tests/styles/**/*.test.{ts,tsx}",
  "tests/format/**/*.test.{ts,tsx}",
  "tests/staging/**/*.test.{ts,tsx}",
  "tests/sheet-links/**/*.test.{ts,tsx}",
  "tests/lib/**/*.test.{ts,tsx}",
  "tests/email/**/*.test.{ts,tsx}",
  "tests/config/**/*.test.{ts,tsx}",
  "tests/me/**/*.test.{ts,tsx}",
  "tests/migration/**/*.test.{ts,tsx}",
  "tests/validation/**/*.test.{ts,tsx}",
  "tests/adminAlerts/**/*.test.{ts,tsx}",
  "tests/fixtures/**/*.test.{ts,tsx}",
  // Phase 2 (spec 2026-07-19-ci-unit-suite-phase2-serial-audit §2): verified
  // via the same closed-port + fileParallelism protocol on 2026-07-19
  // (178 passed / 2,745 tests green). tests/parser are fixture-corpus READERS —
  // safe in the parallel phase because the corpus WRITER
  // (tests/sync/dev-routing.test.ts) stays serial and the two phases never
  // overlap. The nightly mutationHarness.* files match tests/parser/** but are
  // excluded from BOTH default projects (see vitest.config.ts).
  "tests/parser/**/*.test.{ts,tsx}",
  "tests/drive/**/*.test.{ts,tsx}",
  "tests/cron/**/*.test.{ts,tsx}",
  "tests/dataQuality/**/*.test.{ts,tsx}",
  "tests/appSettings/**/*.test.{ts,tsx}",
  "tests/geocoding/**/*.test.{ts,tsx}",
  "tests/design/**/*.test.{ts,tsx}",
  "tests/dates/**/*.test.{ts,tsx}",
  "tests/showLifecycle/**/*.test.{ts,tsx}",
  "tests/invariants/**/*.test.{ts,tsx}",
  "tests/github/**/*.test.{ts,tsx}",
  "tests/venue/**/*.test.{ts,tsx}",
  "tests/docs/**/*.test.{ts,tsx}",
  "tests/reviewRounds/**/*.test.{ts,tsx}",
  // The source-mutation UNIT tests are pure and fast; the nightly gate file in
  // the same tree is excluded from both default projects by NIGHTLY_ONLY_EXCLUDES.
  "tests/mutation/**/*.test.{ts,tsx}",
  "tests/sample.test.ts",
];

// Parallel-set files that assert ON-DISK state a SERIAL test mutates mid-run
// (today: lib/admin/__generated__/devPanelPresent.ts, rewritten by
// tests/admin/withAdminDevFlagDevPanelPresent.test.ts and asserted `false` by
// DevToolsRow.absent). test:fast excludes these from the overlapped parallel
// phase (VITEST_TEST_FAST=1) and re-runs them in a post-serial epilogue when the
// file is guaranteed restored. Repo-relative PATHS, not globs — triple use:
// vitest exclude pattern, epilogue CLI filter, meta-test existsSync
// (tests/cross-cutting/test-fast-deferred.test.ts pins all of it; spec §4.1.3).
export const TEST_FAST_DEFERRED = ["tests/components/admin/settings/DevToolsRow.absent.test.tsx"];

// --- shared with the mutation harness's per-mutant config -------------------
//
// ONE definition, two readers: vitest.config.ts and
// tests/mutation/source/mutantOverlay.config.ts. They had already drifted, and
// silently: the overlay config declared no alias at all, so all 1461 of this
// repo's 1788 test files that import through `@/` failed assertCleanBaseline on
// UNMUTATED source; and with no testTimeout, vitest's 5_000ms default failed
// any suite holding a slower test. Neither appeared in the harness spec's
// documented-limits table, because its one enrolled surface happened to use
// relative imports and fast tests.
//
// Spec: docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md

/** The `@` alias, given the root it should resolve against. */
export const REPO_ALIAS = (root: string): Record<string, string> => ({ "@": root });

/** Test and hook budget. Pinned against drift by db-test-timeout-floor.test.ts. */
export const TEST_TIMEOUT_MS = 30_000;
