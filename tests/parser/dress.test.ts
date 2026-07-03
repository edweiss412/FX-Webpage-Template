import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDress, mergeDressCode } from "@/lib/parser/blocks/dress";
import { parseSheet } from "@/lib/parser/index";

// Exact exporter shape from fixtures/shows/exporter-xlsx/consultants.md:31-34 —
// header row, a markdown SEPARATOR row, a continuation row, then a blank line.
const DRESS_BLOCK = [
  "| DRESS | Set/Strike: Black Pants, Black Polo Shirt, Black Footwear |",
  "| :---: | :---: |",
  "|  | Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear |",
  "",
  "| DOCUMENT FOLDER LINK | DOCUMENT FOLDER LINK |",
].join("\n");

describe("parseDress", () => {
  it("captures both labeled lines, skipping the separator row", () => {
    expect(parseDress(DRESS_BLOCK)).toBe(
      "Set/Strike: Black Pants, Black Polo Shirt, Black Footwear\n" +
        "Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear",
    );
  });

  it("returns null when there is no DRESS block", () => {
    expect(parseDress("| VENUE | Four Seasons |\n| DATES | |")).toBeNull();
  });

  it("stops at the next real labeled row", () => {
    const md = "| DRESS | Black Tie |\n| DETAILS | DETAILS |\n| LED | NO LED WALL |";
    expect(parseDress(md)).toBe("Black Tie");
  });

  // Negative-regression: if an impl treats the separator as a terminator it loses Show.
  it("does NOT stop at the separator (regression guard)", () => {
    expect(parseDress(DRESS_BLOCK)).toContain("Show:");
  });

  // audit idx42 (#191): dress was the lone free-text value parser that stored via clean()
  // only, skipping the decodeEntities step every other event_details writer applies at the
  // value-storage boundary (presence, _helpers.ts). The exporter emits `&#10;`/`&#9;` for
  // in-cell whitespace (pervasive across SET/parking/room-name cells), and React renders a
  // JSX text node verbatim — so a raw entity reaches the crew dress card literally.
  describe("HTML-entity decode at the value-storage boundary (audit idx42)", () => {
    it("decodes an in-cell &#10; (exporter LF) to a space in a single-row DRESS cell", () => {
      expect(parseDress("| DRESS | Business Casual&#10;No Denim |")).toBe(
        "Business Casual No Denim",
      );
    });

    it("decodes &#9; (exporter tab) as well", () => {
      expect(parseDress("| DRESS | Black Tie&#9;(no exceptions) |")).toBe(
        "Black Tie (no exceptions)",
      );
    });

    it("decodes entities in a continuation-row value while preserving genuine multi-row structure", () => {
      const md = [
        "| DRESS | Set: Black&#10;Polo |",
        "| :---: | :---: |",
        "|  | Show: Black&#10;Button Down |",
      ].join("\n");
      expect(parseDress(md)).toBe("Set: Black Polo\nShow: Black Button Down");
    });
  });
});

describe("mergeDressCode (sentinel-aware precedence)", () => {
  it("a real block wins over absent", () => {
    const ed: Record<string, string> = {};
    mergeDressCode(ed, "Black Tie");
    expect(ed.dress_code).toBe("Black Tie");
  });
  it("a sentinel block does NOT clobber an existing real value", () => {
    const ed: Record<string, string> = { dress_code: "Black Tie" };
    mergeDressCode(ed, "N/A");
    expect(ed.dress_code).toBe("Black Tie");
  });
  it("a real block replaces an existing sentinel", () => {
    const ed: Record<string, string> = { dress_code: "N/A" };
    mergeDressCode(ed, "Black Tie");
    expect(ed.dress_code).toBe("Black Tie");
  });
  it("null block is a no-op", () => {
    const ed: Record<string, string> = { dress_code: "Black Tie" };
    mergeDressCode(ed, null);
    expect(ed.dress_code).toBe("Black Tie");
  });
});

describe("dress capture — real exporter fixture", () => {
  it("populates event_details.dress_code with both lines on consultants", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    const dc = parseSheet(md).show.event_details.dress_code ?? "";
    expect(dc).toContain("Set/Strike:");
    expect(dc).toContain("Show:");
  });

  it("sentinel DRESS does not clobber a real DETAILS dress value (mixed source)", () => {
    const md = [
      "| AII Test | AII Test | AII Test |",
      "| DRESS | N/A |",
      "| :---: | :---: |",
      "",
      "| DETAILS | DETAILS |",
      "| Dress Code | Black Tie |",
    ].join("\n");
    expect(parseSheet(md).show.event_details.dress_code).toBe("Black Tie");
  });
});
