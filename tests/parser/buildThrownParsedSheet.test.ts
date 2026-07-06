import { describe, expect, it } from "vitest";
import { buildThrownParsedSheet } from "@/lib/parser";

describe("buildThrownParsedSheet", () => {
  it("returns a minimal ParsedSheet carrying a single PARSE_THREW hardError", () => {
    const sheet = buildThrownParsedSheet("boom");
    // The PARSE_THREW code is what routes the thrown parse to hard_fail (Task 2); if this
    // shape drifts, a caught throw would stop hard-failing and could auto-apply an empty sheet.
    expect(sheet.hardErrors).toEqual([{ code: "PARSE_THREW", message: "boom" }]);
    expect(sheet.show.template_version).toBe("v4");
    expect(sheet.crewMembers).toEqual([]);
    expect(sheet.rooms).toEqual([]);
    expect(sheet.show.title).toBe("");
  });
});
