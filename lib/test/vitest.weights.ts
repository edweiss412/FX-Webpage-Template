// Single source of truth for the weight-balanced shard sequencer (PR E).
// Keys are repo-relative, forward-slashed. ONLY the heavy serial-DB files
// (≥8s measured) need entries; everything else uses DEFAULT_WEIGHT. A heavy
// file left out gets DEFAULT_WEIGHT and can re-cluster — the balance
// meta-test's no-stale-keys + exact-value + 1.25x-mean guards catch
// committed-weight problems, but a NEW unweighted heavy file is caught only
// by the CI per-leg timing (spec §6).
export const DEFAULT_WEIGHT = 1500; // ms, rough light-file proxy

// Measured 2026-07-20 run 29710814674 (per-file vitest test time), rounded
// to the nearest 1,000ms. Pinned exactly by vitest-shard-balance.test.ts's
// MEASURED_HEAVY — update both together when re-measuring.
export const FILE_WEIGHTS: Record<string, number> = {
  "tests/cross-cutting/no-global-cursor.test.ts": 54000, // measured 2026-07-20 run 29710814674
  "tests/scripts/validation-report-fixtures.test.ts": 40000, // measured 2026-07-20 run 29710814674
  "tests/codexGuard/timeouts.test.ts": 28000, // measured 2026-07-20 run 29710814674
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 23000, // measured 2026-07-20 run 29710814674
  "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 15000, // measured 2026-07-20 run 29710814674
  "tests/scripts/validation-check-seed.test.ts": 15000, // measured 2026-07-20 run 29710814674
  "tests/app/admin/showReviewModalLoader.test.tsx": 11000, // measured 2026-07-20 run 29710814674
  "tests/parser/blocks/event.test.ts": 8000, // measured 2026-07-20 run 29710814674
};
