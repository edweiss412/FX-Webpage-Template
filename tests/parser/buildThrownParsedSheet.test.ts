import { describe, expect, it } from "vitest";
import { buildThrownParsedSheet } from "@/lib/parser";

describe("buildThrownParsedSheet", () => {
  it("returns a minimal ParsedSheet carrying the MI-1 hardError code", () => {
    const sheet = buildThrownParsedSheet("boom");
    // Reuses the cataloged MI-1 code so no new §12.4 producer is introduced; the real error text
    // is preserved on the hardError message. The MI-1 code routes to hard_fail via the existing
    // invariants gate (proven end-to-end through the real runPhase1 in the first-seen sync test at
    // tests/sync/parseSheetCallSiteGuard.test.ts). If this shape drifts, a caught throw would stop
    // hard-failing and could auto-apply an empty sheet.
    expect(sheet.hardErrors).toEqual([{ code: "MI-1_VERSION_DETECTION_FAILED", message: "boom" }]);
    expect(sheet.show.template_version).toBe("v4");
    expect(sheet.crewMembers).toEqual([]);
    expect(sheet.rooms).toEqual([]);
    expect(sheet.show.title).toBe("");
  });
});
