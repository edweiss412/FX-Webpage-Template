import { describe, expect, test } from "vitest";
import { computeIdentityLinkRenames } from "@/lib/sync/identityLinkRenames";
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
