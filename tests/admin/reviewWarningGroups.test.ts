/**
 * tests/admin/reviewWarningGroups.test.ts
 *
 * The section callout used to print one row per notice, so three UNKNOWN_FIELD
 * rows in Contacts read "Row we couldn't match" three times with three identical
 * links. These cases pin the two helpers that collapse them: the grouping (same
 * title, same scope, one row) and the count-aware title (plural copy from the
 * catalog, a generic counted form otherwise, the singular title untouched).
 */
import { describe, expect, test } from "vitest";
import {
  groupWarningsByTitle,
  reviewWarningGroupTitle,
  reviewWarningTitle,
} from "@/lib/admin/reviewWarningTitle";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { premiseHolds } from "@/tests/_shared/premise";
import type { ParseWarning } from "@/lib/parser/types";

const w = (code: string, message = "", kind = "contacts"): ParseWarning => ({
  severity: "warn",
  code,
  message,
  blockRef: { kind },
});

const catalogRows = Object.values(MESSAGE_CATALOG) as ReadonlyArray<{
  code: string;
  title: string | null;
  titlePlural?: string | null;
}>;

describe("reviewWarningGroupTitle", () => {
  test("a single notice reads exactly as the singular title", () => {
    const unknown = w("UNKNOWN_FIELD");
    expect(reviewWarningGroupTitle(unknown, 1)).toBe(reviewWarningTitle(unknown));
    expect(reviewWarningGroupTitle(unknown, 1)).toBe("Row we couldn't match");
  });

  test("a cataloged plural names the count in the code's own words", () => {
    expect(reviewWarningGroupTitle(w("UNKNOWN_FIELD"), 3)).toBe("3 rows we couldn't match");
    expect(reviewWarningGroupTitle(w("UNKNOWN_FIELD"), 2)).toBe("2 rows we couldn't match");
  });

  test("a code with no plural copy falls back to a counted form around its title", () => {
    // A message that is neither code-shaped nor contains the code becomes the title.
    const plain = w("SOME_UNCATALOGED_CODE", "Odd cell in the crew table");
    premiseHolds(
      "the fixture code has no catalog row",
      !(plain.code in (MESSAGE_CATALOG as Record<string, unknown>)),
    );
    expect(reviewWarningGroupTitle(plain, 4)).toBe("4 notices: Odd cell in the crew table");

    const noPlural = catalogRows.find(
      (row) => row.title !== null && (row.titlePlural ?? null) === null,
    );
    premiseHolds("some titled catalog row carries no plural", noPlural !== undefined);
    expect(reviewWarningGroupTitle(w(noPlural!.code), 2)).toBe(`2 notices: ${noPlural!.title}`);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2.5])(
    "a count of %s is not a group and keeps the singular title",
    (count) => {
      expect(reviewWarningGroupTitle(w("UNKNOWN_FIELD"), count)).toBe("Row we couldn't match");
    },
  );
});

describe("catalog titlePlural copy", () => {
  const plurals = catalogRows.filter((row) => (row.titlePlural ?? null) !== null);

  test("premise: at least the UNKNOWN_FIELD plural exists", () => {
    premiseHolds(
      "UNKNOWN_FIELD carries a plural",
      plurals.some((row) => row.code === "UNKNOWN_FIELD"),
    );
  });

  test("every plural carries exactly one {count} and sits on a titled row", () => {
    for (const row of plurals) {
      const matches = row.titlePlural!.match(/\{count\}/g) ?? [];
      expect(matches, `${row.code}.titlePlural`).toHaveLength(1);
      expect(row.title, `${row.code} has a plural but no singular title`).not.toBeNull();
    }
  });

  test("every plural, rendered, differs from its singular title", () => {
    for (const row of plurals) {
      expect(reviewWarningGroupTitle(w(row.code), 2), row.code).not.toBe(row.title);
      expect(reviewWarningGroupTitle(w(row.code), 2), row.code).toContain("2");
    }
  });
});

describe("groupWarningsByTitle", () => {
  test("same title in one scope collapses to one group, members in input order", () => {
    const entries = [0, 1, 2].map((index) => ({ warning: w("UNKNOWN_FIELD"), index }));
    const groups = groupWarningsByTitle(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(groups[0]!.title).toBe("3 rows we couldn't match");
  });

  test("different titles stay separate, ordered by first appearance", () => {
    const entries = [
      { warning: w("UNKNOWN_FIELD"), index: 4 },
      { warning: w("UNKNOWN_ROLE_TOKEN"), index: 7 },
      { warning: w("UNKNOWN_FIELD"), index: 9 },
    ];
    const groups = groupWarningsByTitle(entries);
    expect(groups.map((g) => g.members.map((e) => e.index))).toEqual([[4, 9], [7]]);
    expect(groups[1]!.title).toBe(reviewWarningTitle(entries[1]!.warning));
  });

  test("two codes that share a title group together: the row text is what repeats", () => {
    const a = w("CODE_A", "Odd cell in the crew table");
    const b = w("CODE_B", "Odd cell in the crew table");
    premiseHolds(
      "both fixtures resolve to one title",
      reviewWarningTitle(a) === reviewWarningTitle(b),
    );
    const groups = groupWarningsByTitle([
      { warning: a, index: 0 },
      { warning: b, index: 1 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe("2 notices: Odd cell in the crew table");
  });

  test("an empty list yields no groups", () => {
    expect(groupWarningsByTitle([])).toEqual([]);
  });
});
