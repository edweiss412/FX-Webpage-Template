// tests/mutation/_metaShardRangeTracked.test.ts
// The tracked shard-file range follows SOURCE_SHARD_COUNT, instead of being a
// literal that silently contradicts it (spec
// docs/superpowers/specs/ci/2026-08-26-mutation-shard-budget-fit.md, AC-7).
//
// WHY THIS EXISTS. The root .gitignore carries a scratch rule whose index range
// starts one past the real shard count, so a scoped-run throwaway can never be
// committed. Nothing related that range to the constant. Raising the constant
// therefore put every NEW shard file inside the ignored range: `git add` skips
// them without a word, every local run stays green because the files are on
// disk, and a fresh checkout is missing them. The .gitignore comment records
// that exact failure happening once already, four required checks red on a
// fresh checkout while every local run looked normal.
//
// WHY IT LIVES IN ITS OWN FILE rather than beside the other shard pins in
// _metaSourceShardIntegrity. This asks git, and _metaSpawnDisposition walks
// tests/mutation/ for child-process calls. That file already produces one hit,
// a RegExp.prototype.exec, and already carries a file-level row declaring the
// whole file `member: false` with a pinned count and digest. File rows match
// EVERY hit in their file, so a real spawn added there would either be covered
// by a blanket "not a spawn" claim or force that row to `member: true`, which
// reclassifies the regex as a spawn and leaves the ceiling accounting short.
// A separate file takes one row that makes one claim about one file.
//
// THREE FAIL-OPENS THIS GUARD DOES NOT HAVE, each found by review of the spec
// or the plan, and each the reason for one detail below that otherwise reads
// like a style choice:
//
//   1. `--no-index`. Without it git SUPPRESSES its answer for a TRACKED path,
//      so the below-count half would report "not ignored" for shard0..N-1
//      whatever the rules say: a guard that cannot fail for exactly the files
//      it protects.
//   2. No `-v`. Verbose exits 0 whenever it has a rule to REPORT, and a
//      negating `!` rule is a rule, so a path un-ignored by a later line comes
//      back exit 0 while not being ignored at all.
//   3. A scratch repository. `git check-ignore` also reads `core.excludesFile`
//      and `.git/info/exclude`, neither of which is committed, so a
//      contributor's local exclusion could satisfy the above-count half while
//      the committed rule was absent or wrong. That is the same local-green,
//      fresh-checkout-red discrepancy this guard exists to prevent. So the
//      question is asked in a fresh repo seeded with the committed file only.
//
// ONE spawn, deliberately: `check-ignore` accepts every path at once and prints
// only the ignored ones, so a single call yields the whole ignored SET. That is
// a stronger assertion than a per-path exit code, and it keeps this file at one
// spawn hit against one accepted ceiling.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";
import { SOURCE_SHARD_COUNT } from "./source/shardPartition";

const ROOT = join(__dirname, "..", "..");
const shardPath = (i: number) => `tests/mutation/guardSurfaces.shard${String(i)}.test.ts`;

/**
 * The ignored subset of `paths`, according to the COMMITTED ignore rules alone.
 *
 * Asks git rather than parsing: the question is what git DOES, and a parser
 * re-implementing its glob semantics is a second implementation that can
 * disagree with the first. Exit 1 means "none of them", which is an ordinary
 * answer here and not a failure; any other non-zero status is a fault and is
 * rethrown rather than read as an empty set.
 */
function ignoredUnderCommittedRules(paths: readonly string[]): Set<string> {
  const scratch = mkdtempSync(join(tmpdir(), "shard-range-"));
  try {
    execFileSync("git", ["init", "-q", "."], { cwd: scratch, timeout: 10_000 });
    writeFileSync(join(scratch, ".gitignore"), readFileSync(join(ROOT, ".gitignore"), "utf8"));
    let out: string;
    try {
      out = execFileSync(
        "git",
        ["-c", "core.excludesFile=/dev/null", "check-ignore", "--no-index", ...paths],
        { cwd: scratch, timeout: 10_000, encoding: "utf8" },
      );
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      if (err.status !== 1) throw e;
      out = err.stdout ?? "";
    }
    return new Set(out.split("\n").filter(Boolean));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe("the tracked shard-file range follows SOURCE_SHARD_COUNT", () => {
  it("ignores the first index at or above the count, and none below it", () => {
    const below = Array.from({ length: SOURCE_SHARD_COUNT }, (_, i) => shardPath(i));
    const firstScratch = shardPath(SOURCE_SHARD_COUNT);

    // Must-be-PRESENT premise, upstream of both halves. A count of 0 would make
    // `below` empty and the first half vacuously true, and an absent-only
    // control agrees with total failure.
    premiseHolds("there is at least one tracked shard index to check", below.length > 0);

    const ignored = ignoredUnderCommittedRules([...below, firstScratch]);

    // BOTH halves are load-bearing. The first alone passes against rules that
    // ignore nothing, which would let a scoped-run scratch file reach a commit
    // -- the failure the scratch rule was written for.
    expect(
      [...ignored].filter((p) => below.includes(p)).sort(),
      "committed rules ignore a shard file the harness actually runs; `git add` would skip it " +
        "silently and a fresh checkout would be missing it",
    ).toEqual([]);
    expect(
      ignored.has(firstScratch),
      `committed rules do not ignore ${firstScratch}; the scoped-run scratch convention is open`,
    ).toBe(true);
  });
});
