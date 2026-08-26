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
 * THIS IS A PER-ARC PROOF AND IT RETIRES AT MERGE. It compares against
 * `merge-base origin/main HEAD`, which is a property of an UNMERGED branch: once this
 * merges, that merge base becomes the new main commit and the committed baseSha no
 * longer matches. Shipping it permanently would also be wrong in kind, not just in
 * bookkeeping -- it would assert a claim about one arc's diff on every future commit.
 * The expected additions are DERIVED from the diff rather than hardcoded, which removes
 * the registry freeze while the branch lives; the file and its fixture are DELETED in
 * the PR's final commit, alongside the in-progress ledger marker, and the closeout
 * records the sha and CI run where the proof actually held.
 *
 * A STALE snapshot cannot silently weaken this. It would be missing whatever main has
 * enrolled since, so the additions check below stops equalling this branch's own ids
 * and fails loudly, naming them. That is why nothing here shells out to git, and why it
 * works on a shallow CI checkout.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";
import { GUARD_SURFACES } from "./source/registry";

/**
 * The ids THIS BRANCH adds, DERIVED from the diff rather than written down.
 *
 * A hardcoded pair turned a one-arc proof into a permanent registry freeze: it allowed
 * exactly those two additions forever and rejected every later enrolment, including
 * legitimate ones arriving from main. Deriving it means the guard states the property
 * AC-7 actually names -- no PRE-EXISTING surface moved -- on whatever branch it runs,
 * instead of pinning one arc's answer.
 *
 * Read from the merge-base diff of the registry alone, so a surface enrolled by ANOTHER
 * branch and absorbed here is correctly not attributed to this one.
 */
function addedByThisBranch(base: string): string[] {
  const diff = execFileSync(
    "git",
    ["diff", `${base}...HEAD`, "--", "tests/mutation/source/registry.ts"],
    { encoding: "utf8" },
  );
  return [...diff.matchAll(/^\+\s+id: "([^"]+)",$/gm)].map((m) => m[1] as string).sort();
}

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
  it("records the merge base it was taken from, and is not stale", () => {
    // `baseSha` was parsed and never asserted, so any one-line mutation of it survived
    // -- and the committed fixture had in fact drifted a merge behind the declared
    // base. Shape first: a value that is not a sha is a corrupted fixture, whatever
    // else is true.
    expect(snapshot.baseSha).toMatch(/^[0-9a-f]{40}$/);

    // Then the claim itself. FAILS rather than skips when git cannot answer, matching
    // the convention the ledger-mass oracle already sets in unit-suite.yml: a check
    // that quietly stands down on a shallow checkout is a check that stops existing in
    // CI, which is the only place it matters.
    const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], {
      encoding: "utf8",
    }).trim();
    expect(
      snapshot.baseSha,
      "regenerate with scripts/snapshot-preexisting-surfaces.ts after every absorb",
    ).toBe(base);
  });

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
    const addedIds = addedByThisBranch(snapshot.baseSha);
    // TWO-SIDED, because a subset walk passes when a surface is DELETED: every
    // snapshot row would still be checked, and the deletion would simply not be
    // looked for. Comparing the id SETS is what catches removal, renaming, and an
    // unreviewed third enrolment arriving from anywhere.
    const liveIds = new Set(GUARD_SURFACES.map((s) => s.id));
    const baseIds = new Set(snapshot.rows.map((r) => r.id));
    const added = [...liveIds].filter((id) => !baseIds.has(id)).sort();
    const removed = [...baseIds].filter((id) => !liveIds.has(id)).sort();
    expect(removed, "a surface the merge base declared is no longer enrolled").toEqual([]);
    expect(added, "an enrolment this branch does not own, or a stale snapshot").toEqual(addedIds);
  });
});
