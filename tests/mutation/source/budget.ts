/**
 * The per-leg wall-clock budget, in SECONDS.
 *
 * A leaf module with no imports, and that is its whole reason for existing. The
 * constant lived in `shardPartition.ts`, which imports the registry; once the registry
 * needed the same value to bound `millisPerBoot`, importing it back would have closed a
 * cycle, and a cycle over a `const` does not fail loudly — it yields `undefined` at
 * module-init time, so the bound would silently compare against NaN and admit every
 * rate. Extracting it inverts nothing and duplicates nothing.
 *
 * SECONDS, not minutes: an integer-minute record cannot express 60m59s.
 */
export const SHARD_BUDGET_SECONDS = 60 * 60;
