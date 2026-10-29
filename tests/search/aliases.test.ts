import { describe, expect, it } from "vitest";
import { SEARCH_ALIAS_GROUPS } from "@/lib/search/aliases";
import { normalize } from "@/lib/search/normalize";

const members = SEARCH_ALIAS_GROUPS.flat();

describe("SEARCH_ALIAS_GROUPS (spec §5.4)", () => {
  it("has groups to check (premise: the walks below are not vacuous)", () => {
    expect(SEARCH_ALIAS_GROUPS.length).toBeGreaterThan(0);
    expect(members).toContain("front of house");
  });

  it("stores every member in normalized form (tokens joined by one space)", () => {
    for (const member of members) {
      expect(
        normalize(member)
          .map((t) => t.text)
          .join(" "),
        member,
      ).toBe(member);
    }
  });

  it("puts each term in exactly one group, so expansion never chains", () => {
    const groupOf = new Map<string, number[]>();
    SEARCH_ALIAS_GROUPS.forEach((group, index) => {
      for (const member of group) groupOf.set(member, [...(groupOf.get(member) ?? []), index]);
    });
    const repeated = [...groupOf].filter(([, indexes]) => indexes.length > 1);
    expect(repeated).toEqual([]);
  });

  it("gives every group at least two members", () => {
    for (const group of SEARCH_ALIAS_GROUPS)
      expect(group.length, group.join(", ")).toBeGreaterThan(1);
  });

  it.each(["wireless", "keynote", "room", "call"])(
    "leaves the ambiguous word %s out of every group",
    (word) => {
      expect(members).not.toContain(word);
    },
  );
});
