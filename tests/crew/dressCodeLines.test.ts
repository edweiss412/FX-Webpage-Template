import { describe, expect, it } from "vitest";
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";

// The DRESS block's canonical shape (fixtures/shows/_schema-diff.md "Dress code" row):
// one `Phase: attire` line per phase, joined with "\n" by lib/parser/blocks/dress.ts.
const CANONICAL =
  "Set/Strike: Black Pants, Black Polo Shirt, Black Footwear\n" +
  "Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear";

describe("parseDressCodeLines", () => {
  it("splits the canonical two-phase block into phase/attire pairs", () => {
    expect(parseDressCodeLines(CANONICAL)).toEqual([
      { phase: "Set/Strike", attire: "Black Pants, Black Polo Shirt, Black Footwear" },
      { phase: "Show", attire: "Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear" },
    ]);
  });

  it("trims padding and skips blank lines between phases", () => {
    expect(parseDressCodeLines("  Set/Strike:   Blacks  \n\n   Show: Tux ")).toEqual([
      { phase: "Set/Strike", attire: "Blacks" },
      { phase: "Show", attire: "Tux" },
    ]);
  });

  // Every case below must fall back to plain text (null), never to a wrong split.
  it.each([
    ["free text", "Business casual"],
    ["a single labeled line", "Show: Black tie"],
    ["a single line whose instruction carries a colon", "Business casual: no jeans"],
    ["sentence punctuation before the colon", "All black. Note: no logos\nShow: Tux"],
    ["mixed labeled and unlabeled lines", "Show: Black Pants\nNo jeans please"],
    ["a time colon before the label colon", "Show 7:00 PM: Black tie"],
    ["a URL", "See https://example.com/dress"],
    ["no space after the colon", "Show:Black tie"],
    ["a label with no attire", "Show:"],
    ["a label longer than a phase name", "Please make sure every crew member wears: Blacks"],
    ["an empty value", ""],
    ["a whitespace-only value", "  \n  "],
  ])("returns null for %s", (_name, value) => {
    expect(parseDressCodeLines(value)).toBeNull();
  });
});
