import { describe, expect, it } from "vitest";
import { buildThrownParsedSheet } from "@/lib/parser";
import { runInvariants } from "@/lib/parser/invariants";

describe("buildThrownParsedSheet", () => {
  it("returns a minimal ParsedSheet carrying the MI-1 hardError code", () => {
    const sheet = buildThrownParsedSheet("boom");
    // Reuses the cataloged MI-1 code so no new §12.4 producer is introduced; the real error text
    // is preserved on the hardError message. If this shape drifts, a caught throw would stop
    // hard-failing and could auto-apply an empty sheet.
    expect(sheet.hardErrors).toEqual([{ code: "MI-1_VERSION_DETECTION_FAILED", message: "boom" }]);
    expect(sheet.show.template_version).toBe("v4");
    expect(sheet.crewMembers).toEqual([]);
    expect(sheet.rooms).toEqual([]);
    expect(sheet.show.title).toBe("");
  });

  it("hard-fails under runInvariants (both first-seen and existing-show)", () => {
    // Integration: the thrown-sheet's MI-1 hardError routes to hard_fail via the existing MI-1
    // gate — no invariants change needed. Proves the builder composes with runInvariants for both
    // prior=null (first-seen) and a non-null prior (existing show).
    const thrown = buildThrownParsedSheet("Cannot read properties of undefined");
    const firstSeen = runInvariants(null, thrown);
    expect(firstSeen.outcome).toBe("hard_fail");
    if (firstSeen.outcome === "hard_fail") {
      expect(firstSeen.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
    }
    const existing = runInvariants(buildThrownParsedSheet("prior"), thrown);
    expect(existing.outcome).toBe("hard_fail");
  });
});
