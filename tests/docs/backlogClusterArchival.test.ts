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

/**
 * Entry headings for `id`, at ANY accepted depth.
 *
 * Was `### ${id}` only. Both ledgers carry entries at `##` and `###` — the
 * archive's top level is `##` — so a depth-pinned match silently counted zero
 * for a correctly-archived entry and read as "not archived". Found when
 * BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY graduated (2026-08-04).
 *
 * Anchored to a line start and followed by a boundary, so a short id cannot
 * match inside a longer one that merely starts with it.
 */
function occurrences(haystack: string, id: string): number {
  const re = new RegExp(`^#{2,3} ${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9-])`, "gm");
  return (haystack.match(re) ?? []).length;
}

describe("backlog corpus after the DB-lockdown cluster", () => {
  test.each(["BL-ADMIN-POSTGREST-DML-LOCKDOWN", "BL-RLS-COVERAGE-CROSSCUTTING"])(
    "%s is archived and no longer open",
    (id) => {
      expect(occurrences(ARCHIVE, id), `${id} must be in BACKLOG-archive.md`).toBeGreaterThan(0);
      expect(occurrences(BACKLOG, id), `${id} must no longer be in BACKLOG.md`).toBe(0);
    },
  );

  test("BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY is now CLOSED — the follow-up shipped", () => {
    // Inverted 2026-08-04. This pinned the entry as OPEN because it was the
    // db-lockdown cluster's declared follow-up, and an entry archived while its
    // work was still owed is the defect it guarded. That work has now shipped
    // (`docs/x5-decided-by-boundary`): the boundary is registered in both parity
    // sources and both write paths are proven policed by mutant. The assertion
    // is inverted rather than deleted, so the row cannot quietly reappear in the
    // open queue as if the follow-up were still outstanding.
    expect(occurrences(ARCHIVE, "BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY")).toBe(1);
    expect(occurrences(BACKLOG, "BL-X5-ROLE-TOKEN-DECIDED-BY-BOUNDARY")).toBe(0);
  });

  test("BL-X5-INTROSPECTION-GAP appears exactly once across both files", () => {
    expect(occurrences(BACKLOG, "BL-X5-INTROSPECTION-GAP") + occurrences(ARCHIVE, "BL-X5-INTROSPECTION-GAP")).toBe(1);
  });
});
