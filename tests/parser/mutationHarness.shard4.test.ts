// tests/parser/mutationHarness.shard4.test.ts
// One LPT slice of the exhaustive mutation corpus (sharding spec §3.3). Runs ONLY
// in the env-gated `mutation` vitest project (fileParallelism:true) — never in
// serial/parallel. Slice reconciliation vs the ledger slice is exactly the retired
// monolith's bidirectional check restricted to this shard; the partition
// meta-tests + the gates file's corpus checks (f)-(g) prove the union over shards
// equals the full reconciliation (spec AC-3). All 8 shard files are this same
// template with only the SHARD literal (and filename) differing — pinned by the
// shard-file integrity meta-test in tests/parser/mutation/shardPartition.test.ts.
import { describe, it, expect, beforeAll } from "vitest";
import { runShard } from "./mutation/runShard";
import type { ShardResult } from "./mutation/runShard";
import { shardOfSiteId, SHARD_COUNT } from "./mutation/shardPartition";
import { MUTANT_BUDGET } from "./mutation/operators";
import { KNOWN_SILENT_HOLES, reconcileLedger } from "./mutation/knownHoles";

const SHARD = 4;

describe(`mutation harness shard ${SHARD}/${SHARD_COUNT} — ledger slice`, () => {
  let R: ShardResult;
  beforeAll(async () => {
    R = await runShard(4);
  }, 3_600_000);

  it("slice mutant count within budget", () => {
    // corpus-wide >0 floor lives in the gates file (spec §6); a slice may in
    // principle be empty at some future SHARD_COUNT.
    expect(R.allSiteIds.length).toBeGreaterThanOrEqual(0);
    expect(R.allSiteIds.length).toBeLessThanOrEqual(MUTANT_BUDGET);
  });
  it("no emitted mutant is byte-identical to its baseline fixture (plan-R18)", () => {
    expect(R.noOps, `no-op mutants:\n${R.noOps.join("\n")}`).toEqual([]);
  });
  it("siteIds unique within the shard (cross-shard disjointness is by partition)", () => {
    expect(new Set(R.allSiteIds).size).toBe(R.allSiteIds.length);
  });
  it("cosmetic operators are fully invisible", () => {
    expect(R.cosmeticViolations).toEqual([]);
  });
  it("slice alarms == ledger slice, keyed (siteId, kind, fingerprint) — bidirectional", () => {
    // Reuse the exact assignment runShard sliced by (returned on R) — a second
    // computeShardAssignment() here costs ~20 s of generation and timed out
    // vitest's 5 s default testTimeout on the first full run.
    const slice = KNOWN_SILENT_HOLES.filter((h) => shardOfSiteId(h.siteId, R.assignment) === SHARD);
    const { newAlarms, staleRows } = reconcileLedger(R.alarms, slice);
    expect(newAlarms, `NEW/changed alarms not in ledger:\n${newAlarms.join("\n")}`).toEqual([]);
    expect(staleRows, `stale ledger rows (fixed or drifted):\n${staleRows.join("\n")}`).toEqual([]);
  });
});
