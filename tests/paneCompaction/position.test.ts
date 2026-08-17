import { describe, expect, it } from "vitest";

import {
  RECENT_COMMIT_WINDOW_MS,
  newestVerdictRow,
  positionFor,
} from "@/scripts/lib/pane-compaction-core";
import { premise, premiseHolds } from "@/tests/_shared/premise";

/**
 * Task 4 — the position gradient (spec §4.4), eight ordered rows, first match wins.
 *
 * Predicates are NOT mutually exclusive and the spec withdraws that claim; what
 * is asserted is TOTALITY (every pane selects a row) and DETERMINISM (ordering
 * decides which). Round 2 of the spec review showed ordinary states matching
 * several rows, so exclusivity was never true.
 */

const NOW = 1_700_000_000_000;
const recent = NOW - 60_000; // inside the 15-minute window
const old = NOW - 60 * 60_000; // an hour ago

const base = {
  now: NOW,
  clean: true,
  lastCommitAt: old,
  pr: null as null | { open: boolean; allGreen: boolean; anyFailed: boolean; anyPending: boolean },
  corpus: [] as Array<{ status: string; verdict: string | null; endedAt: string | null }>,
};

describe("position rows, in order", () => {
  it("row 1 — CI green with the PR unmerged is a hard WAIT", () => {
    const p = positionFor({
      ...base,
      pr: { open: true, allGreen: true, anyFailed: false, anyPending: false },
    });
    expect(p.row).toBe(1);
    expect(p.cost).toBe("HardWait");
  });

  it("row 2 — a PR with a failing check is High", () => {
    const p = positionFor({
      ...base,
      pr: { open: true, allGreen: false, anyFailed: true, anyPending: false },
    });
    expect(p.row).toBe(2);
    expect(p.cost).toBe("High");
  });

  it("row 3 — a dirty tree is High", () => {
    expect(positionFor({ ...base, clean: false }).row).toBe(3);
  });

  it("row 4 — a non-APPROVE verdict with no commit since is triage pending, High", () => {
    const p = positionFor({
      ...base,
      lastCommitAt: NOW - 120 * 60_000,
      corpus: [
        {
          status: "verdict",
          verdict: "BLOCKING",
          endedAt: new Date(NOW - 60 * 60_000).toISOString(),
        },
      ],
    });
    expect(p.row).toBe(4);
    expect(p.cost).toBe("High");
  });

  it("row 5 — a pending check is Low", () => {
    const p = positionFor({
      ...base,
      pr: { open: true, allGreen: false, anyFailed: false, anyPending: true },
    });
    expect(p.row).toBe(5);
  });

  it("row 6 — a recorded APPROVE is Low", () => {
    const p = positionFor({
      ...base,
      corpus: [
        {
          status: "verdict",
          verdict: "APPROVE",
          endedAt: new Date(NOW - 60 * 60_000).toISOString(),
        },
      ],
    });
    expect(p.row).toBe(6);
  });

  it("row 7 — a clean tree with a recent commit is the cheapest position", () => {
    const p = positionFor({ ...base, lastCommitAt: recent });
    expect(p.row).toBe(7);
    expect(p.cost).toBe("Lowest");
  });

  it("row 8 — the fallback catches what no predicate claims", () => {
    // A clean, old worktree with no PR and no corpus. Spec round 2 found this
    // matching NO row; the fallback is the totality guarantee.
    const p = positionFor(base);
    expect(p.row).toBe(8);
    expect(p.cost).toBe("Low");
  });
});

describe("totality and the window", () => {
  it("every generated state selects exactly one row", () => {
    const states = [true, false].flatMap((clean) =>
      [
        null,
        { open: true, allGreen: true, anyFailed: false, anyPending: false },
        { open: true, allGreen: false, anyFailed: true, anyPending: false },
        { open: true, allGreen: false, anyFailed: false, anyPending: true },
      ].flatMap((pr) =>
        [recent, old].map((lastCommitAt) => ({ ...base, clean, pr, lastCommitAt })),
      ),
    );
    premise("the generated space is more than a single state", states.length, 1);
    const rows = new Set<number>();
    for (const s of states) {
      const p = positionFor(s);
      expect(p.row, JSON.stringify(s)).toBeGreaterThanOrEqual(1);
      expect(p.row).toBeLessThanOrEqual(8);
      rows.add(p.row);
    }
    premiseHolds("the space reaches more than one row, so totality is not trivial", rows.size > 1);
  });

  it("RECENT_COMMIT_WINDOW is 15 minutes, and both sides of it are asserted", () => {
    expect(RECENT_COMMIT_WINDOW_MS).toBe(15 * 60_000);
    const justInside = positionFor({ ...base, lastCommitAt: NOW - RECENT_COMMIT_WINDOW_MS + 1 });
    const justOutside = positionFor({ ...base, lastCommitAt: NOW - RECENT_COMMIT_WINDOW_MS - 1 });
    expect(justInside.row).toBe(7);
    expect(justOutside.row).toBe(8);
  });
});

describe("newest corpus row", () => {
  // The regression the live corpus supplies: a committed no_verdict row that
  // carries a perfectly valid endedAt. Filtering on "has a parsable timestamp"
  // instead of on status lets it supersede the real verdict, which flips row 4
  // (triage pending, High) to row 6 (verdict recorded, Low) and promotes the
  // pane toward COMPACT.
  const rows = [
    { status: "verdict", verdict: "BLOCKING", endedAt: "2026-08-16T16:28:07.562Z" },
    { status: "no_verdict", verdict: null, endedAt: "2026-08-16T17:00:00.000Z" },
  ];

  it("ignores a no_verdict row even when its endedAt is newer and valid", () => {
    premiseHolds("the no_verdict row really is newer", rows[1]!.endedAt! > rows[0]!.endedAt!);
    const newest = newestVerdictRow(rows);
    expect(newest?.verdict).toBe("BLOCKING");
  });

  it("excludes a verdict row whose endedAt does not parse, rather than sorting it arbitrarily", () => {
    const newest = newestVerdictRow([
      { status: "verdict", verdict: "APPROVE", endedAt: "not-a-date" },
      { status: "verdict", verdict: "BLOCKING", endedAt: "2026-08-16T16:28:07.562Z" },
    ]);
    expect(newest?.verdict).toBe("BLOCKING");
  });

  it("returns null for an absent corpus, which is normal and not a fault", () => {
    expect(newestVerdictRow([])).toBeNull();
  });
});
