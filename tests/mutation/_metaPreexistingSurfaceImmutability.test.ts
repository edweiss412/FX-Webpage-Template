/**
 * AC-7: nothing verdict-deciding moved on a surface enrolled before this diff.
 *
 * The score run is NOT this proof. It establishes floors and empty
 * unaccepted-survivor sets, and says nothing about whether an existing surface's
 * operators, suite paths, accepted ledger, source path, control anchor or score floor
 * changed. Worse, a LOWERED floor makes the score run GREENER, so the only evidence
 * the plan originally offered would have concealed the violation it was meant to catch.
 *
 * The baseline is generated FROM THE MERGE BASE by
 * scripts/snapshot-preexisting-surfaces.ts, never from HEAD: a snapshot of the working
 * tree records whatever this diff already did and then asserts the diff against itself.
 *
 * A STALE snapshot cannot silently weaken this. It would be missing whatever main has
 * enrolled since, so the additions check below stops equalling this branch's own ids
 * and fails loudly, naming them. That is why nothing here shells out to git, and why it
 * works on a shallow CI checkout.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";
import { GUARD_SURFACES } from "./source/registry";

/** The ids this BRANCH enrols. Anything else appearing is a change nobody reviewed. */
const ENROLLED_BY_THIS_DIFF = ["mutationWeightRecords", "mutationWeightWeights"] as const;

type Row = {
  id: string;
  sourcePath: string;
  suitePaths: string[];
  operators: string[];
  scoreFloor: number;
  control: { from: string; to: string };
  accepted: { siteId: string; kind: string }[];
};

const snapshot = JSON.parse(
  readFileSync("tests/mutation/fixtures/preexisting-surfaces.json", "utf8"),
) as { baseSha: string; rows: Row[] };

/** The same projection the generator takes, so the two sides are comparable. */
const project = (s: (typeof GUARD_SURFACES)[number]): Row => ({
  id: s.id,
  sourcePath: s.sourcePath,
  suitePaths: [...s.suitePaths].sort(),
  operators: [...s.operators].sort(),
  scoreFloor: s.scoreFloor,
  control: s.control,
  accepted: [...s.accepted]
    .map((a) => ({ siteId: a.siteId, kind: a.kind }))
    .sort((x, y) => x.siteId.localeCompare(y.siteId)),
});

describe("pre-existing surfaces are unmoved by this diff (AC-7)", () => {
  it("has a baseline to compare against", () => {
    // Unconditional and outside any `.each`: an `.each` over an empty array registers
    // no case, so a premise inside its callback is unreachable in exactly the
    // degenerate state it exists to catch.
    premise("surfaces captured at the merge base", snapshot.rows.length, 0);
  });

  it("changes no verdict-deciding field of any surface the merge base declared", () => {
    const live = new Map(GUARD_SURFACES.map((s) => [s.id, project(s)]));
    for (const row of snapshot.rows) {
      const now = live.get(row.id);
      expect(now, `${row.id} was enrolled at the merge base and is gone`).toBeDefined();
      // Whole-row equality rather than field-by-field: a per-field list is a list of
      // the fields someone remembered, and the next field added to GuardSurface would
      // be unguarded by construction.
      expect(now, `${row.id} moved`).toEqual(row);
    }
  });

  it("adds exactly the surfaces this branch enrols, and nothing else", () => {
    // TWO-SIDED, because a subset walk passes when a surface is DELETED: every
    // snapshot row would still be checked, and the deletion would simply not be
    // looked for. Comparing the id SETS is what catches removal, renaming, and an
    // unreviewed third enrolment arriving from anywhere.
    const liveIds = new Set(GUARD_SURFACES.map((s) => s.id));
    const baseIds = new Set(snapshot.rows.map((r) => r.id));
    const added = [...liveIds].filter((id) => !baseIds.has(id)).sort();
    const removed = [...baseIds].filter((id) => !liveIds.has(id)).sort();
    expect(removed, "a surface the merge base declared is no longer enrolled").toEqual([]);
    expect(added, "an enrolment this branch does not own, or a stale snapshot").toEqual(
      [...ENROLLED_BY_THIS_DIFF].sort(),
    );
  });
});
