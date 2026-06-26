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
// fixtures/shows/raw corpus (tests/parser readers + the tests/sync/dev-routing
// writer). vitest runs the two projects in SEPARATE sequential phases, so the
// parallel project never overlaps the serial one — a fixture-corpus reader in
// the parallel set (tests/help/fixture-range-parser) never races the serial
// writer. New directories default to SERIAL (safe): add to this list ONLY after
// verifying the dir is DB-free. The vitest-projects-partition meta-test pins the
// invariant that every test file lands in exactly one project.

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
export const ENV_BOUND_EXCLUDES = [
  "**/tests/admin/test-auth-gate.test.ts",
  "**/tests/cross-cutting/pg-cron-coverage.test.ts",
  "**/tests/cross-cutting/email-canonicalization.test.ts",
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
  "tests/sample.test.ts",
];
