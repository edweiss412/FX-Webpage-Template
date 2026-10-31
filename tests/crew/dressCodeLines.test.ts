import { describe, expect, it } from "vitest";
import { dressCodeLineForPhase, parseDressCodeLines } from "@/lib/crew/dressCodeLines";

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

// UI-gate re-run, critique N1: the pass and the quick-fact tile show the attire
// for the day's phase. Conservative: exactly one line must name the phase, or
// the caller shows the whole value.
describe("dressCodeLineForPhase", () => {
  const [SET_STRIKE, SHOW] = parseDressCodeLines(CANONICAL)!;

  it("picks the Show line for a show day and the Set/Strike line for a load-in day", () => {
    expect(dressCodeLineForPhase(CANONICAL, "show")).toEqual(SHOW);
    expect(dressCodeLineForPhase(CANONICAL, "set_strike")).toEqual(SET_STRIKE);
  });

  it("a line naming two phases is each phase's when no other line names it", () => {
    expect(dressCodeLineForPhase("Set/Show: Blacks\nStrike: Jeans", "show")).toEqual({
      phase: "Set/Show",
      attire: "Blacks",
    });
  });

  it.each([
    ["Set", "Set: Blacks\nShow: Tux", "Set"],
    ["Strike", "Strike: Blacks\nShow: Tux", "Strike"],
    ["Load In/Out", "Load In/Out: Blacks\nShow: Tux", "Load In/Out"],
    ["Set up", "Set Up: Blacks\nShow: Tux", "Set Up"],
    ["Load-in", "Load-in: Blacks\nShow: Tux", "Load-in"],
    ["lower case", "set/strike: Blacks\nshow: Tux", "set/strike"],
  ])("a %s line is the load-in day's", (_name, value, phase) => {
    expect(dressCodeLineForPhase(value, "set_strike")?.phase).toBe(phase);
  });

  // Every case below must fall back to the whole value (null), never pick a
  // line that may not be the day's.
  it.each([
    ["a plain value", "Show blacks", "show"],
    ["an unparseable value", "All black. Note: no logos\nShow: Tux", "show"],
    ["no line for the phase", "Rehearsal: Blacks\nShow: Tux", "set_strike"],
    ["no line for the phase (show)", "Set/Strike: Blacks\nRehearsal: Tux", "show"],
    ["two lines for the phase", "Show: Tux\nShow: Black tie", "show"],
    ["a numbered show day only", "Set/Strike: Blacks\nShow Day 2: Tux", "show"],
    ["two lines naming the load-in phase", "Set/Show: Blacks\nStrike: Jeans", "set_strike"],
  ] as const)("returns null for %s", (_name, value, phase) => {
    expect(dressCodeLineForPhase(value, phase)).toBeNull();
  });
});
