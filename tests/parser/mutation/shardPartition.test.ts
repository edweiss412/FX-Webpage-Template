// tests/parser/mutation/shardPartition.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { SHARD_COUNT, lptAssign, shardOfSiteId, pairKey } from "./shardPartition";
import type { ShardAssignment } from "./shardPartition";

const W = (pairs: [string, number][]) => pairs.map(([key, w]) => ({ key, w }));

describe("lptAssign (deterministic LPT over pair weights)", () => {
  it("(a) determinism — identical input (incl. weight ties) → identical assignment, twice", () => {
    const weights = W([
      ["b:x", 10],
      ["a:x", 10],
      ["c:x", 7],
      ["d:x", 7],
      ["e:x", 1],
      ["f:x", 1],
    ]);
    const r1 = lptAssign(weights, 3);
    const r2 = lptAssign(weights, 3);
    expect([...r1.entries()].sort()).toEqual([...r2.entries()].sort());
    // tie-break is key-ascending: "a:x" (10) is placed before "b:x" (10) → lower shard index
    expect(r1.get("a:x")).toBe(0);
    expect(r1.get("b:x")).toBe(1);
  });
  it("(b) totality — every key assigned exactly once into [0, shardCount)", () => {
    const weights = W([
      ["a:1", 5],
      ["b:2", 3],
      ["c:3", 8],
      ["d:4", 2],
      ["e:5", 1],
    ]);
    const r = lptAssign(weights, 2);
    expect(r.size).toBe(weights.length);
    for (const [, s] of r) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2);
    }
  });
  it("(c) balance — heavy-tailed weights stay near-even (max/mean under a generous bound)", () => {
    // heavy tail like the real corpus: one dominant pair + many small ones
    const weights = W([
      ["big:x", 100],
      ...Array.from(
        { length: 40 },
        (_, i): [string, number] => [`p${String(i).padStart(2, "0")}:x`, 5 + (i % 7)],
      ),
    ]);
    const r = lptAssign(weights, 4);
    const loads = new Array<number>(4).fill(0);
    for (const { key, w } of weights) loads[r.get(key)!] += w;
    const mean = loads.reduce((a, b) => a + b, 0) / 4;
    expect(Math.max(...loads) / mean).toBeLessThan(4 / 3); // LPT's classical guarantee shape
  });
});

describe("shardOfSiteId (op resolved by longest prefix; assignment lookup)", () => {
  const A: ShardAssignment = new Map([
    [pairKey("blank-row:inject", "east-coast"), 3],
    [pairKey("blank-row", "east-coast"), 5], // hypothetical shorter sibling — longest prefix must win
    [pairKey("ref-sub", "2025-03-dci-rpas-central"), 1],
  ]);
  it("(d) two-colon operators resolve by longest prefix", () => {
    expect(shardOfSiteId("blank-row:inject:east-coast:B1:L2:Xgap0", A)).toBe(3);
    expect(shardOfSiteId("ref-sub:2025-03-dci-rpas-central:B4:L153:X0", A)).toBe(1);
  });
  it("(d) malformed siteId throws (no operator prefix)", () => {
    expect(() => shardOfSiteId("not-an-operator:slug:B1:L1:X0", A)).toThrow(/no operator/i);
  });
  it("(d) pair absent from the assignment throws (fail-loud, findingFor posture)", () => {
    expect(() => shardOfSiteId("ref-sub:unknown-slug:B1:L1:X0", A)).toThrow(/assignment/i);
  });
});

describe("SHARD_COUNT", () => {
  it("is 8 (spec §3.1)", () => {
    expect(SHARD_COUNT).toBe(8);
  });
});

describe("(e) shard-file integrity — exactly SHARD_COUNT files, each bound to its own index", () => {
  const dir = join(process.cwd(), "tests", "parser");
  const shardFiles = readdirSync(dir)
    .filter((f) => /^mutationHarness\.shard\d+\.test\.ts$/.test(f))
    .sort();
  it(`exactly ${SHARD_COUNT} shard files exist with indices 0..${SHARD_COUNT - 1}`, () => {
    expect(shardFiles).toEqual(
      Array.from({ length: SHARD_COUNT }, (_, i) => `mutationHarness.shard${i}.test.ts`),
    );
  });
  it("each file calls runShard(<its own index>) exactly once (anti-copy-paste-drift)", () => {
    for (const f of shardFiles) {
      const idx = Number(/shard(\d+)/.exec(f)![1]);
      const src = readFileSync(join(dir, f), "utf8");
      const calls = [...src.matchAll(/runShard\((\d+)\)/g)];
      expect(calls.length, `${f} must call runShard exactly once`).toBe(1);
      expect(Number(calls[0]![1]), `${f} must run ITS OWN shard`).toBe(idx);
    }
  });
  it("the retired monolith is gone", () => {
    expect(readdirSync(dir)).not.toContain("mutationHarness.test.ts");
  });
});
