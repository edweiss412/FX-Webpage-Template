// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §3, as amended
// 2026-08-29 by bl-orch ruling: the rendered coordinate is a PASTE-ABLE reference, so it
// carries A1-notation quoting when the tab name needs it and stays bare when it does not.
//
// The defect this closes (impeccable audit P2): `PULL SHEET!A1` is what the unquoted form
// renders, and it does not resolve in the Sheets name box -- which defeats the whole point
// of the line, whose label tells the operator to type it there.
import { describe, expect, it } from "vitest";

import { sheetCellReference } from "@/lib/sheet-links/sheetCellReference";

describe("sheetCellReference (spec §3, bl-orch amendment 2026-08-29)", () => {
  it("leaves an ordinary tab bare: every tab the corpus anchors is one word", () => {
    // The five tabs fintech.xlsx anchors, plus the two the other corpus workbooks use.
    for (const tab of ["VENUE", "CLIENT", "TECH", "VEHICLE", "ROLE", "AGENDA", "INFO"]) {
      expect(sheetCellReference(tab, "A1")).toBe(`${tab}!A1`);
    }
  });

  it("quotes a tab whose name carries a space", () => {
    // `PULL SHEET` is in SOURCE_LINK_ALLOWLIST, so this is reachable, not hypothetical.
    expect(sheetCellReference("PULL SHEET", "B7")).toBe("'PULL SHEET'!B7");
    expect(sheetCellReference("OLD PULL SHEET", "C3")).toBe("'OLD PULL SHEET'!C3");
  });

  it("doubles an internal apostrophe inside the quotes, which is A1 notation's escape", () => {
    expect(sheetCellReference("Doug's Tab", "A1")).toBe("'Doug''s Tab'!A1");
    // No space, but the apostrophe alone still forces the quoted form.
    expect(sheetCellReference("Doug's", "A1")).toBe("'Doug''s'!A1");
  });

  it("quotes anything outside the bare alphabet, including a leading digit", () => {
    for (const [tab, expected] of [
      ["2026 Show", "'2026 Show'!A1"],
      ["2026", "'2026'!A1"],
      ["TECH-2", "'TECH-2'!A1"],
      ["TECH.2", "'TECH.2'!A1"],
      ["TÉCH", "'TÉCH'!A1"],
    ] as const) {
      expect(sheetCellReference(tab, "A1"), tab).toBe(expected);
    }
  });

  it("keeps an underscore bare: it is in the bare alphabet and needs no quotes", () => {
    expect(sheetCellReference("PULL_SHEET", "A1")).toBe("PULL_SHEET!A1");
    expect(sheetCellReference("_DRAFT", "A1")).toBe("_DRAFT!A1");
  });

  it("passes the a1 through untouched: the caller has already validated it", () => {
    expect(sheetCellReference("VENUE", "AB123")).toBe("VENUE!AB123");
  });
});
