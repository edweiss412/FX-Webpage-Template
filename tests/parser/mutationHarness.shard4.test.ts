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
    const rec = reconcileLedger(R.alarms, slice);
    // Three-way classification so a red nightly is triaged in seconds, not audited (see
    // reconcileLedger docs). REGRESSION — a (siteId,kind) that never survived mutation now does;
    // do NOT re-bless, investigate the parser change that stopped catching these mutants.
    expect(
      rec.newHoles,
      `NEW untested holes — REGRESSION (a parser change stopped catching these mutants):\n${rec.newHoles.join("\n")}`,
    ).toEqual([]);
    // FIXED — a ledgered hole no longer survives. Coverage win: DELETE these rows from knownHoles.ts.
    expect(
      rec.fixedHoles,
      `FIXED holes — coverage improved; remove these rows from the ledger:\n${rec.fixedHoles.join("\n")}`,
    ).toEqual([]);
    // DRIFT — a ledgered hole survives with a CHANGED fingerprint (output shape shifted). Benign IFF
    // the output change was intentional; re-bless by regenerating the ledger (BL-MUTATION-LEDGER-*).
    expect(
      rec.driftedAlarms,
      `DRIFTED fingerprints — benign IF output changed on purpose; regenerate the ledger (BL-MUTATION-LEDGER-*):\n${rec.driftedAlarms.join("\n")}`,
    ).toEqual([]);
    expect(
      rec.driftedStale,
      `DRIFTED ledger rows (stale side) — a known hole's fingerprint moved; regenerate the ledger (BL-MUTATION-LEDGER-*):\n${rec.driftedStale.join("\n")}`,
    ).toEqual([]);
  });
});
