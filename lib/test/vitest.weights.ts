// Single source of truth for the weight-balanced shard sequencer (PR E).
// Keys are repo-relative, forward-slashed. ONLY the heavy serial-DB files
// (>~10s) need entries; everything else uses DEFAULT_WEIGHT. A heavy file left
// out gets DEFAULT_WEIGHT and can re-cluster — the balance meta-test's
// no-stale-keys + 1.25x-mean guards catch committed-weight problems, but a NEW
// unweighted heavy file is caught only by the CI per-leg timing (spec §5).
export const DEFAULT_WEIGHT = 1500; // ms, rough light-file proxy

export const FILE_WEIGHTS: Record<string, number> = {
  "tests/scripts/validation-report-fixtures.test.ts": 76000, // measured
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 41000, // measured
  "tests/cross-cutting/no-global-cursor.test.ts": 30000, // estimated
  "tests/scripts/validation-check-seed.test.ts": 25000, // estimated
};
