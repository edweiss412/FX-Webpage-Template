// tests/parser/fuzz/seeds.test.ts
// seeds.ts resolves its config ONCE at module evaluation (singleton — the
// deep seed must be one replay coordinate per process). Tests therefore set
// process.env BEFORE a fresh dynamic import, via vi.resetModules().
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = ["FUZZ_DEEP", "FUZZ_SEED", "FUZZ_NUM_RUNS"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const load = () => import("./seeds");

describe("fuzzRunConfig", () => {
  it("defaults to the fixed PR seed and PR run count (deterministic PR runs)", async () => {
    const m = await load();
    expect(m.fuzzRunConfig()).toEqual({ seed: m.PR_SEED, numRuns: m.PR_NUM_RUNS, deep: false });
  });
  it("FUZZ_DEEP=1 raises numRuns to DEEP_NUM_RUNS and randomizes the seed", async () => {
    process.env.FUZZ_DEEP = "1";
    const m = await load();
    const a = m.fuzzRunConfig();
    expect(a.deep).toBe(true);
    expect(a.numRuns).toBe(m.DEEP_NUM_RUNS);
    expect(Number.isInteger(a.seed)).toBe(true);
  });
  it("FUZZ_SEED and FUZZ_NUM_RUNS give exact replay", async () => {
    process.env.FUZZ_DEEP = "1";
    process.env.FUZZ_SEED = "424242";
    process.env.FUZZ_NUM_RUNS = "77";
    const m = await load();
    expect(m.fuzzRunConfig()).toEqual({ seed: 424242, numRuns: 77, deep: true });
  });
  it("is a stable singleton within one module instance", async () => {
    process.env.FUZZ_DEEP = "1";
    const m = await load();
    expect(m.fuzzRunConfig().seed).toBe(m.fuzzRunConfig().seed);
  });
});
