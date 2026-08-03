// Plan Task 7. Pins the post-cluster backlog corpus.
//
// Task 7 edits tracked files and commits, so invariant 1 binds and it needs a
// real red step — Tasks 6 and 8 are exempt only because they commit nothing.
//
// The exactly-once arm is load-bearing, not decorative: BL-X5-INTROSPECTION-GAP
// was ALREADY archived before this cluster started (its residual naming-aperture
// gap is what Task 5 closed, not the entry itself). A literal "move the three
// cluster entries" instruction would have duplicated it.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const BACKLOG = readFileSync("BACKLOG.md", "utf8");
const ARCHIVE = readFileSync("BACKLOG-archive.md", "utf8");

function occurrences(haystack: string, id: string): number {
  return haystack.split(`### ${id}`).length - 1;
}

describe("backlog corpus after the DB-lockdown cluster", () => {
  test.each(["BL-ADMIN-POSTGREST-DML-LOCKDOWN", "BL-RLS-COVERAGE-CROSSCUTTING"])(
    "%s is archived and no longer open",
    (id) => {
      expect(occurrences(ARCHIVE, id), `${id} must be in BACKLOG-archive.md`).toBeGreaterThan(0);
      expect(occurrences(BACKLOG, id), `${id} must no longer be in BACKLOG.md`).toBe(0);
    },
  );

  test("BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY stays open — it is this cluster's follow-up", () => {
    expect(occurrences(BACKLOG, "BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY")).toBe(1);
    expect(occurrences(ARCHIVE, "BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY")).toBe(0);
  });

  test("BL-X5-INTROSPECTION-GAP appears exactly once across both files", () => {
    expect(occurrences(BACKLOG, "BL-X5-INTROSPECTION-GAP") + occurrences(ARCHIVE, "BL-X5-INTROSPECTION-GAP")).toBe(1);
  });
});
