// tests/lib/admin/warningReadingDisplay.test.ts
//
// warning-card-fixes spec §5.6 and §7.3: the caps, the name and preview formats, the
// "shows a reading" rule and the judgment-call test, each pinned at its boundaries. Each cap
// is pinned ONCE to its spec value; every boundary expectation is a literal derived from the
// fixture, never from the helper under test, so a drifted constant or an off-by-one cut fails
// instead of moving the boundary with it.
import { describe, it, expect } from "vitest";
import {
  CASE_PREVIEW_CHARS,
  CASE_PREVIEWS_CAP,
  HOTEL_RESERVATION_JUDGMENT_CODES,
  SHEET_SAYS_CAP,
  USE_RAW_CODES,
  WE_READ_NAMES_CAP,
  casePreviewsText,
  isJudgmentCall,
  readingShown,
  sheetSaysText,
  weReadGuestsText,
} from "@/lib/admin/warningReadingDisplay";
import { AMBIGUITY_CODES } from "@/lib/parser/ambiguityCodes";
import type { ParseWarning } from "@/lib/parser/types";
import { premiseHolds } from "@/tests/_shared/premise";

describe("sheetSaysText (B-SHEET)", () => {
  it("nothing to show gives null", () => {
    expect(sheetSaysText(undefined)).toBeNull();
    expect(sheetSaysText(42)).toBeNull();
    expect(sheetSaysText("   ")).toBeNull();
  });

  it("collapses whitespace", () => {
    expect(sheetSaysText(" a \n  b ")).toBe("a b");
  });

  it("cuts after SHEET_SAYS_CAP characters", () => {
    expect(SHEET_SAYS_CAP).toBe(160);
    expect(sheetSaysText("x".repeat(159))).toBe("x".repeat(159));
    expect(sheetSaysText("x".repeat(160))).toBe("x".repeat(160));
    // The dropped `y` is what catches an off-by-one cut.
    expect(sheetSaysText("x".repeat(160) + "y")).toBe("x".repeat(160) + "…");
  });
});

describe("weReadGuestsText (B-NAMES)", () => {
  it("anything but the hotels shape gives null", () => {
    expect(weReadGuestsText(null)).toBeNull();
    expect(weReadGuestsText("Eric")).toBeNull();
    expect(weReadGuestsText({ kind: "rooms", names: [] })).toBeNull();
    expect(weReadGuestsText({ kind: "hotels" })).toBeNull();
    expect(weReadGuestsText({ kind: "hotels", names: "Eric" })).toBeNull();
  });

  it("no names, or only blanks, reads no guests", () => {
    expect(weReadGuestsText({ kind: "hotels", names: [] })).toBe("no guests");
    expect(weReadGuestsText({ kind: "hotels", names: ["  ", ""] })).toBe("no guests");
  });

  it("drops non-strings and trims", () => {
    expect(weReadGuestsText({ kind: "hotels", names: [1, " Eric "] })).toBe("1 guest: Eric");
  });

  it("lists up to WE_READ_NAMES_CAP names, then counts the rest", () => {
    expect(WE_READ_NAMES_CAP).toBe(6);
    expect(weReadGuestsText({ kind: "hotels", names: ["A", "B", "C", "D", "E"] })).toBe(
      "5 guests: A, B, C, D, E",
    );
    expect(weReadGuestsText({ kind: "hotels", names: ["A", "B", "C", "D", "E", "F"] })).toBe(
      "6 guests: A, B, C, D, E, F",
    );
    expect(weReadGuestsText({ kind: "hotels", names: ["A", "B", "C", "D", "E", "F", "G"] })).toBe(
      "7 guests: A, B, C, D, E, F, and 1 more",
    );
  });
});

describe("casePreviewsText (B-CASES, B-CHARS)", () => {
  it("no previews gives null", () => {
    expect(casePreviewsText(undefined)).toBeNull();
    expect(casePreviewsText("AUDIO 1")).toBeNull();
    expect(casePreviewsText([])).toBeNull();
  });

  it("shows up to CASE_PREVIEWS_CAP previews, then counts the rest", () => {
    expect(CASE_PREVIEWS_CAP).toBe(3);
    expect(casePreviewsText(["A", "B"])).toBe("‘A’, ‘B’");
    expect(casePreviewsText(["A", "B", "C"])).toBe("‘A’, ‘B’, ‘C’");
    // The four-preview row fails a `> CAP + 1` remainder test.
    expect(casePreviewsText(["A", "B", "C", "D"])).toBe("‘A’, ‘B’, ‘C’ and 1 more");
    expect(casePreviewsText(["A", "B", "C", "D", "E"])).toBe("‘A’, ‘B’, ‘C’ and 2 more");
  });

  it("a blank preview reads (no header text), and the count stays the case count", () => {
    expect(casePreviewsText(["A", "", "C"])).toBe("‘A’, ‘(no header text)’, ‘C’");
    expect(casePreviewsText(["A", 7, "C", "D"])).toBe("‘A’, ‘(no header text)’, ‘C’ and 1 more");
  });

  it("cuts one preview after CASE_PREVIEW_CHARS characters", () => {
    expect(CASE_PREVIEW_CHARS).toBe(40);
    expect(casePreviewsText(["a".repeat(39)])).toBe("‘" + "a".repeat(39) + "’");
    expect(casePreviewsText(["a".repeat(40)])).toBe("‘" + "a".repeat(40) + "’");
    expect(casePreviewsText(["a".repeat(40) + "b"])).toBe("‘" + "a".repeat(40) + "…’");
  });
});

describe("readingShown", () => {
  const warn = (
    code: string,
    extra: Partial<Pick<ParseWarning, "resolution" | "rawSnippet">> = {},
  ): ParseWarning => ({ severity: "warn", code, message: "m", ...extra });
  const RESOLVABLE = {
    resolvable: true,
    parsed: { kind: "rooms", name: "A", dimensions: null, floor: null },
    replacement: { kind: "rooms", name: "A B", dimensions: null, floor: null },
  } as unknown as NonNullable<ParseWarning["resolution"]>;

  it("every use-raw code with a resolvable reading shows it", () => {
    premiseHolds("USE_RAW_CODES has its four codes", USE_RAW_CODES.size === 4);
    for (const code of USE_RAW_CODES) {
      expect(readingShown(warn(code, { resolution: RESOLVABLE })), code).toBe(true);
    }
  });

  it("a use-raw code with no reading to offer shows none", () => {
    expect(
      readingShown(
        warn("ROOM_HEADER_SPLIT_AMBIGUOUS", {
          resolution: { resolvable: false, reason: "empty-raw" },
        }),
      ),
    ).toBe(false);
    // Legacy: persisted before `resolution` existed.
    expect(readingShown(warn("ROOM_HEADER_SPLIT_AMBIGUOUS"))).toBe(false);
  });

  it("the inline guest split shows a reading when the raw cell has text", () => {
    const inline = { resolvable: false, reason: "raw-not-guest-scoped" } as const;
    expect(
      readingShown(
        warn("HOTEL_GUEST_SPLIT_AMBIGUOUS", { resolution: inline, rawSnippet: "Hyatt Eric" }),
      ),
    ).toBe(true);
    expect(
      readingShown(warn("HOTEL_GUEST_SPLIT_AMBIGUOUS", { resolution: inline, rawSnippet: "  " })),
    ).toBe(false);
  });

  it("a judgment code outside the use-raw set shows no reading", () => {
    expect(readingShown(warn("CREW_COLUMN_POSITIONAL_FALLBACK", { rawSnippet: "x" }))).toBe(false);
  });
});

describe("isJudgmentCall", () => {
  it("is a warn-severity ambiguity code", () => {
    expect(isJudgmentCall({ severity: "warn", code: "CREW_COLUMN_POSITIONAL_FALLBACK" })).toBe(
      true,
    );
    expect(isJudgmentCall({ severity: "warn", code: "UNKNOWN_FIELD" })).toBe(false);
    expect(isJudgmentCall({ severity: "info", code: "CREW_COLUMN_POSITIONAL_FALLBACK" })).toBe(
      false,
    );
  });
});

describe("the code sets", () => {
  it("both sets are judgment codes, and the hotel set has its four", () => {
    // Review R1 D2 sweep: size plus membership accepted a same-size substitution, so
    // both sets are pinned by name (spec §5.1 / C4 hotel codes; §5.6 the four radio
    // codes, formerly UseRawControl's IN_SCOPE).
    expect([...HOTEL_RESERVATION_JUDGMENT_CODES].sort()).toEqual([
      "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
      "HOTEL_INLINE_GROUP_OWN_HOTEL",
    ]);
    expect([...USE_RAW_CODES].sort()).toEqual([
      "DATE_ORDER_SUGGESTS_DMY",
      "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
      "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      "ROOM_HEADER_SPLIT_AMBIGUOUS",
    ]);
    for (const code of HOTEL_RESERVATION_JUDGMENT_CODES) {
      expect(AMBIGUITY_CODES.has(code), code).toBe(true);
    }
    for (const code of USE_RAW_CODES) {
      expect(AMBIGUITY_CODES.has(code), code).toBe(true);
    }
  });
});
