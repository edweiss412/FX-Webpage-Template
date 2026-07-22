// Fix-hint totality + content guards (spec 2026-07-21-attention-needs-attention-split §5, §11.10).
import { describe, expect, it } from "vitest";
import { NEEDS_LOOK_HINTS } from "@/lib/admin/needsLookHints";
import { NEEDS_LOOK_CODE_LIST } from "@/lib/adminAlerts/audience";

describe("needs-look fix hints", () => {
  it("every needs-look code maps to a non-empty trimmed hint (typed-total record)", () => {
    for (const code of NEEDS_LOOK_CODE_LIST) {
      const hint = NEEDS_LOOK_HINTS[code]; // typed NeedsLookCode index, no cast
      expect(hint.trim().length, `${code} blank hint`).toBeGreaterThan(0);
    }
  });

  it("ASSET_RECOVERY_BYTES_EXCEEDED hint states the literal limits", () => {
    const h = NEEDS_LOOK_HINTS.ASSET_RECOVERY_BYTES_EXCEEDED;
    for (const lit of ["60", "50MB", "3GB"]) expect(h).toContain(lit);
  });

  it("no em-dash in any hint (project copy rule)", () => {
    for (const hint of Object.values(NEEDS_LOOK_HINTS)) {
      expect(hint).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("no extra keys beyond the needs-look list", () => {
    expect(Object.keys(NEEDS_LOOK_HINTS).sort()).toEqual([...NEEDS_LOOK_CODE_LIST].sort());
  });
});
