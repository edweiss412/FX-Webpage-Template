// tests/mutation/guardSurfaces.gates.test.ts
// Corpus-wide checks over the WHOLE registry, which therefore cannot live in any
// shard (wall-clock spec §3.3). Generation only, except the one child spawned by
// the timeout premise at the bottom.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INERT_TARGET, childRun } from "./source/childRun";
import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";
import { GUARD_SURFACES } from "./source/registry";
import { SOURCE_SHARD_COUNT, surfacesForShard } from "./source/shardPartition";

const root = process.cwd();

describe("guard-surface registry — ledger-kind expectations", () => {
  it("declares expected ledger-kind counts for every enrolled surface", () => {
    // Corpus-wide by construction: it compares against the WHOLE registry, so
    // duplicating it into a shard would fail in every shard (each sees a subset).
    expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(
      GUARD_SURFACES.map((s) => s.id).sort(),
    );
  });
});

describe("shard partition over the live registry", () => {
  const slices = Array.from({ length: SOURCE_SHARD_COUNT }, (_, i) => surfacesForShard(i));

  it("(a) the union of every shard slice is exactly the registry", () => {
    expect(
      slices
        .flat()
        .map((s) => s.id)
        .sort(),
    ).toEqual(GUARD_SURFACES.map((s) => s.id).sort());
  });

  it("(b) no surface appears in two slices", () => {
    const ids = slices.flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("(c) the per-surface case count is 7, which §2.2's enrolment arithmetic depends on", () => {
    // Derived from the source, not asserted as a literal against itself: §2.2
    // reads enrolment off a run's test count as (tests - 2) / 7, and that
    // arithmetic silently misreports the moment a case is added or removed.
    const src = readFileSync(join(root, "tests/mutation/source/surfaceCases.ts"), "utf8");
    expect(src.match(/^\s*it\(/gm) ?? []).toHaveLength(7);
  });
});

/**
 * The per-mutant config's timeout is actually in force (guard-premise Task 3).
 *
 * Corpus-wide, not per-surface, so it lives here rather than in a shard, and it
 * must not be dropped: without it a mutant that merely runs long is classified
 * KILLED through tests/mutation/source/runner.ts:223-227, silently inflating the
 * score. tests/mutation/_metaOverlayConfigParity.test.ts compares configured
 * VALUES and cannot prove one takes effect.
 */
describe("the per-mutant config's timeout is in force", () => {
  it("runs a fixture that outlives vitest's 5000ms default", () => {
    expect(childRun(root, "tests/mutation/source/fixtures/slowTest.fixture.ts", INERT_TARGET)).toBe(
      0,
    );
    // Same reason, and doubly so: the fixture deliberately sleeps past 5s, so
    // the child cannot finish inside a budget meant for in-process work.
  }, 300_000);
});
