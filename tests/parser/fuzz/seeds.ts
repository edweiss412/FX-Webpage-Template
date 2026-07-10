// tests/parser/fuzz/seeds.ts
// Single source of every fuzz run number (spec §5). PR runs are deterministic
// (fixed seed) — a regression net, not exploration. Deep runs (nightly) explore
// with a random seed unless FUZZ_SEED pins an exact replay.
export const PR_SEED = 20260709;
export const PR_NUM_RUNS = 100;
export const DEEP_NUM_RUNS = 5000;

// MODULE-LEVEL SINGLETON: the random deep seed is drawn ONCE per process, so
// every fuzz test file (robustness + plantAndFind, separate vitest imports of
// this module in the SAME serial-project process) shares one replay coordinate.
// If vitest ever isolates the files into separate processes, each logs its own
// FUZZ-CONFIG line — still replayable, one line per file.
const RESOLVED: { seed: number; numRuns: number; deep: boolean } = (() => {
  const deep = process.env.FUZZ_DEEP === "1";
  const seed = process.env.FUZZ_SEED
    ? Number.parseInt(process.env.FUZZ_SEED, 10)
    : deep
      ? // Date.now is fine here: deep runs WANT a fresh seed; drawn once,
        // printed via FUZZ-CONFIG, replayed via FUZZ_SEED.
        Date.now() % 2 ** 31
      : PR_SEED;
  const numRuns = process.env.FUZZ_NUM_RUNS
    ? Number.parseInt(process.env.FUZZ_NUM_RUNS, 10)
    : deep
      ? DEEP_NUM_RUNS
      : PR_NUM_RUNS;
  return { seed, numRuns, deep };
})();

export function fuzzRunConfig(): { seed: number; numRuns: number; deep: boolean } {
  return RESOLVED;
}
