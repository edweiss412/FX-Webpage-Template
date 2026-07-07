// tests/parser/mutation/runShard.test.ts
// Fast merge-gating unit test for the shard slice runner via dependency injection
// (two tiny in-memory fixtures + an explicit assignment) — the corpus-scale path
// runs nightly in the shard files. Concrete failure modes caught: slice filter
// processing another shard's pair (foreign siteIds carry the other fixture's
// slug), collector silently writing nothing (the failure that would let a future
// regen "shrink" the ledger to zero), and a missing DONE line (would make
// "no output from shard i" ambiguous on a hung run).
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runShard } from "./runShard";
import { pairKey } from "./shardPartition";
import { OPERATOR_NAMES } from "./operators";
import type { FixtureRef } from "./fixtures";

// Two in-memory fixtures via the read override (no disk writes).
const FIX: FixtureRef[] = [
  { slug: "synth-a", family: "raw", path: "/dev/null/synth-a.md" },
  { slug: "synth-b", family: "raw", path: "/dev/null/synth-b.md" },
];
const MD: Record<string, string> = {
  "synth-a": "| CREW | NAME |\n|  | Doug |",
  "synth-b": "| HOTEL | Kimpton |\n|  | 122 W Monroe |",
};
// Assignment: ALL synth-a pairs → shard 0; ALL synth-b pairs → shard 1.
const A = new Map<string, number>(
  OPERATOR_NAMES.flatMap((op): [string, number][] => [
    [pairKey(op, "synth-a"), 0],
    [pairKey(op, "synth-b"), 1],
  ]),
);
const OPTS = { fixtures: FIX, readFixture: (f: FixtureRef) => MD[f.slug]!, assignment: A };

let scratch: string | undefined;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runShard slice filter + progress + collector", () => {
  it("processes ONLY its shard's pairs (every siteId belongs to shard-0 fixtures)", async () => {
    const r = await runShard(0, OPTS);
    expect(r.assignment, "runShard must return the assignment it sliced by").toBe(A);
    expect(r.allSiteIds.length).toBeGreaterThan(0);
    for (const s of r.allSiteIds)
      expect(s, `foreign siteId in shard 0: ${s}`).toContain(":synth-a:");
  });
  it("a different shard sees the OTHER fixture only (disjoint slices)", async () => {
    const r = await runShard(1, OPTS);
    expect(r.allSiteIds.length).toBeGreaterThan(0);
    for (const s of r.allSiteIds) expect(s).toContain(":synth-b:");
  });
  it("emits a DONE progress line even for a small slice", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runShard(0, OPTS);
    const done = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("DONE"));
    expect(done, "DONE line must always be emitted").toMatch(
      /\[mutation shard 0\/8\] DONE \d+ mutants/,
    );
  });
  it("collector env writes alarms-shard<i>.json with the shard's alarms", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    const r = await runShard(0, OPTS);
    const dumped = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as {
      alarms: unknown[];
    };
    expect(dumped.alarms).toEqual(r.alarms);
  });
});
