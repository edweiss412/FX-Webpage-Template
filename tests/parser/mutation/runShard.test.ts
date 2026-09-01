// tests/parser/mutation/runShard.test.ts
// Fast merge-gating unit test for the shard slice runner via dependency injection
// (two tiny in-memory fixtures + an explicit assignment) — the corpus-scale path
// runs nightly in the shard files. Concrete failure modes caught: slice filter
// processing another shard's pair (foreign siteIds carry the other fixture's
// slug), collector silently writing nothing (the failure that would let a future
// regen "shrink" the ledger to zero), and a missing DONE line (would make
// "no output from shard i" ambiguous on a hung run).
import { describe, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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

  // beside the positive control at :65 ("collector env writes alarms-shard<i>.json").
  //
  // TWO negative states, not one. The workflow expression
  // `${{ github.event.inputs.collect_alarms == 'true' && 'alarms' || '' }}` yields the
  // EMPTY STRING on a schedule, where today the key is ABSENT. "Inert" is a claim
  // about both, and a `collectDir !== undefined` refactor passes the first while
  // silently writing an alarms file into the repo root on every scheduled run under
  // the second.

  it("writes nothing when the collector env is unset, on a slice that DOES collect when asked", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-unset-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", undefined);
    await runShard(0, OPTS);
    expect(readdirSync(scratch)).toEqual([]);
    // NON-VACUITY, in the same case rather than borrowed from another: the identical
    // slice, with the variable set, writes the file. Without this half, "nothing was
    // written" is equally true of a slice the collector could never have reached, and an
    // alarm-count premise would not fix that -- a slice with zero alarms still writes.
    const positive = mkdtempSync(join(tmpdir(), "mut-collect-pos-"));
    try {
      vi.stubEnv("COLLECT_MUTATION_ALARMS", positive);
      await runShard(0, OPTS);
      expect(readdirSync(positive)).toEqual(["alarms-shard0.json"]);
    } finally {
      rmSync(positive, { recursive: true, force: true });
    }
  });

  it("writes nothing when the collector env is present but EMPTY, which is what a schedule produces", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-empty-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", "");
    await runShard(0, OPTS);
    expect(readdirSync(scratch)).toEqual([]);
    // The empty string must not be read as "here", either: nothing lands in the cwd.
    expect(existsSync("alarms-shard0.json")).toBe(false);
  });

  // F3 (plan review r2): the PROVENANCE fields need a producer-side proof. A consumer
  // test built from constructed JSON cannot show that runShard writes the shard it was
  // CALLED with, or the real GITHUB_RUN_ID -- an implementation stamping one constant
  // passes every such test and then lets mixed-run files satisfy the tool's run check.
  // So extend the existing positive collector case rather than adding a sibling to it.

  it("stamps the shard it was CALLED with, not a constant", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-stamp-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    vi.stubEnv("GITHUB_RUN_ID", "run-abc");
    await runShard(0, OPTS);
    await runShard(1, OPTS);
    const s0 = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const s1 = JSON.parse(readFileSync(join(scratch, "alarms-shard1.json"), "utf8")) as Record<
      string,
      unknown
    >;
    // TWO indices, because one index cannot distinguish "the argument" from "the constant 0".
    expect([s0.shard, s1.shard]).toEqual([0, 1]);
    expect([s0.runId, s1.runId]).toEqual(["run-abc", "run-abc"]);
  });

  // CATCHES: `process.env.X ?? "local"`, which treats a PRESENT BUT EMPTY env var as a
  // real value -- an empty string is not nullish. The collector would then stamp
  // `runId: ""` on a runner where GITHUB_RUN_ID exists and is blank, and an empty
  // identity is indistinguishable from every other empty identity, so a stale file
  // would pass the re-bless tool's provenance check.
  it("uses the sentinel when GITHUB_RUN_ID is present but EMPTY, not just when absent", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-blank-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    vi.stubEnv("GITHUB_RUN_ID", "");
    await runShard(0, OPTS);
    const s0 = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(s0.runId).toBe("local");
  });

  it("falls back to a local sentinel when GITHUB_RUN_ID is absent", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-local-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    vi.stubEnv("GITHUB_RUN_ID", undefined);
    await runShard(0, OPTS);
    const s0 = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(s0.runId).toBe("local");
  });

  // CATCHES a failure that would be invisible from the refusing side: the re-bless tool
  // refuses a file with no usable `headSha`, so a collector that stamped nothing would
  // make EVERY re-bless refuse and read as a broken tool rather than a missing stamp.
  // Asserted against this checkout's real HEAD rather than "some string", because a
  // stamp of the wrong commit refuses just as hard as no stamp at all.
  it("stamps the commit the alarms describe, off Actions, from the working tree", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-head-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    vi.stubEnv("GITHUB_SHA", undefined);
    await runShard(0, OPTS);
    const s0 = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(s0.headSha).toBe(
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    );
  });

  // CATCHES: the working-tree fallback winning over the value Actions supplies. On a
  // runner both are present and they are NOT the same commit for a pull_request event,
  // so preferring the wrong one binds the alarms to a tree nobody collected.
  it("prefers GITHUB_SHA to the working tree when Actions supplies it", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-ghsha-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    vi.stubEnv("GITHUB_SHA", "0123456789abcdef0123456789abcdef01234567");
    await runShard(0, OPTS);
    const s0 = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(s0.headSha).toBe("0123456789abcdef0123456789abcdef01234567");
  });
});
