import { describe, expect, test } from "vitest";
import {
  computeIdentityLinkRenames,
  computeStagedIdentityLinkRenames,
} from "@/lib/sync/identityLinkRenames";
import type { TriggeredReviewItem } from "@/lib/parser/types";

// Spec §3.3 (2026-07-10-crew-rename-shrink-gate): MI-12 always links; MI-13/14 only when the
// version-bound accept fell through; orphans and everything else never link.

const mi12: TriggeredReviewItem = {
  id: "1",
  invariant: "MI-12",
  removed_name: "Jon",
  added_name: "John",
  email: "j@x.example",
};
const mi13: TriggeredReviewItem = {
  id: "2",
  invariant: "MI-13",
  removed_name: "Sam A",
  added_name: "Sam B",
};
const mi14: TriggeredReviewItem = {
  id: "3",
  invariant: "MI-14",
  removed_name: "Pat A",
  added_name: "Pat B",
};
const orphan: TriggeredReviewItem = {
  id: "4",
  invariant: "MI-13-orphan-remove",
  removed_name: "Gone",
};
const mi6: TriggeredReviewItem = { id: "5", invariant: "MI-6" };

describe("computeIdentityLinkRenames", () => {
  test("MI-12 always links; MI-13/14 only when accepted; orphans and others never", () => {
    expect(computeIdentityLinkRenames([mi12, mi13, mi14, orphan, mi6], false)).toEqual([
      { removedName: "Jon", addedName: "John" },
    ]);
    expect(computeIdentityLinkRenames([mi12, mi13, mi14, orphan, mi6], true)).toEqual([
      { removedName: "Jon", addedName: "John" },
      { removedName: "Sam A", addedName: "Sam B" },
      { removedName: "Pat A", addedName: "Pat B" },
    ]);
  });

  test("empty items → empty either way", () => {
    expect(computeIdentityLinkRenames([], true)).toEqual([]);
    expect(computeIdentityLinkRenames([], false)).toEqual([]);
  });
});

describe("computeStagedIdentityLinkRenames", () => {
  test("rename-resolved MI-12/13/14 link; independent and apply never link", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [mi12, mi13, mi14, orphan, mi6],
        [
          { item_id: "1", action: "rename" },
          { item_id: "2", action: "independent" },
          { item_id: "3", action: "rename" },
          { item_id: "4", action: "apply" },
          { item_id: "5", action: "apply" },
        ],
      ),
    ).toEqual([
      { removedName: "Jon", addedName: "John" },
      { removedName: "Pat A", addedName: "Pat B" },
    ]);
  });

  test("all three pair invariants link on rename choices, MI-13 included", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [mi12, mi13, mi14],
        [
          { item_id: "1", action: "rename" },
          { item_id: "2", action: "rename" },
          { item_id: "3", action: "rename" },
        ],
      ),
    ).toEqual([
      { removedName: "Jon", addedName: "John" },
      { removedName: "Sam A", addedName: "Sam B" },
      { removedName: "Pat A", addedName: "Pat B" },
    ]);
  });

  test("MI-11 items never link regardless of action", () => {
    const mi11: TriggeredReviewItem = {
      id: "6",
      invariant: "MI-11",
      crew_name: "Held",
      prior_email: "a@x.example",
      new_email: "b@x.example",
    };
    expect(
      computeStagedIdentityLinkRenames([mi11], [{ item_id: "6", action: "rename" }]),
    ).toEqual([]);
    expect(computeStagedIdentityLinkRenames([mi11], [{ item_id: "6", action: "apply" }])).toEqual(
      [],
    );
  });

  test("independent-only resolution links nothing", () => {
    expect(
      computeStagedIdentityLinkRenames(
        [mi13, mi14],
        [
          { item_id: "2", action: "independent" },
          { item_id: "3", action: "independent" },
        ],
      ),
    ).toEqual([]);
  });

  test("non-pair invariants never link: all orphan arms, all asset invariants, MI-6 (defensive belt)", () => {
    const nonPairs: TriggeredReviewItem[] = [
      orphan, // MI-13-orphan-remove (existing fixture)
      { id: "7", invariant: "MI-14-orphan-remove", removed_name: "Gone2" },
      { id: "8", invariant: "MI-13-orphan-add", added_name: "New1" },
      { id: "9", invariant: "MI-14-orphan-add", added_name: "New2" },
      { id: "10", invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE", spreadsheet_id: "s1" },
      { id: "11", invariant: "DIAGRAMS_EMBEDDED_NONE_FOUND", spreadsheet_id: "s1" },
      { id: "12", invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING", drift_count: 1 },
      { id: "13", invariant: "REEL_DRIFT_PENDING", reel_drive_file_id: "r1" },
      mi6,
    ];
    // "rename" is not a valid action for any of these (validation would refuse it); the helper
    // must not link even if handed one; belt for both action shapes.
    for (const action of ["rename", "apply"] as const) {
      expect(
        computeStagedIdentityLinkRenames(
          nonPairs,
          nonPairs.map((item) => ({ item_id: item.id, action })),
        ),
      ).toEqual([]);
    }
  });

  test("consume-once: two pair-items sharing one item_id with a single rename choice link exactly one pair", () => {
    const dupA: TriggeredReviewItem = {
      id: "2",
      invariant: "MI-13",
      removed_name: "Dup A",
      added_name: "Dup A2",
    };
    const dupB: TriggeredReviewItem = {
      id: "2",
      invariant: "MI-14",
      removed_name: "Dup B",
      added_name: "Dup B2",
    };
    expect(
      computeStagedIdentityLinkRenames([dupA, dupB], [{ item_id: "2", action: "rename" }]),
    ).toEqual([{ removedName: "Dup A", addedName: "Dup A2" }]);
  });

  test("missing choice for a pair item links nothing; empty inputs are empty", () => {
    expect(computeStagedIdentityLinkRenames([mi12], [])).toEqual([]);
    expect(computeStagedIdentityLinkRenames([], [])).toEqual([]);
  });
});
