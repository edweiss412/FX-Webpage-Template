import { describe, it, expect } from "vitest";
import { SOURCE_LINK_ALLOWLIST, REGION_ANCHOR_SPEC, REGION_IDS } from "@/lib/sheet-links/buildSheetDeepLink";

describe("§8.1↔§9 consistency", () => {
  it("every tab in every region spec is in the allowlist", () => {
    for (const id of REGION_IDS) for (const tab of REGION_ANCHOR_SPEC[id].tabs) {
      expect(SOURCE_LINK_ALLOWLIST as readonly string[]).toContain(tab);
    }
  });
  it("master-library tabs are NOT in the allowlist", () => {
    for (const t of ["CLIENT","VENUE","TECH","ROLE","VEHICLE","CLIENTUNIQUE","CONTACTUNIQUE","FORM"]) {
      expect(SOURCE_LINK_ALLOWLIST as readonly string[]).not.toContain(t);
    }
  });
  it("covers all 11 canonical regions and alias targets resolve", () => {
    expect(REGION_IDS.length).toBe(11);
    for (const id of REGION_IDS) { const s = REGION_ANCHOR_SPEC[id]; if (s.strategy === "alias-of") expect(REGION_IDS).toContain(s.region); }
  });
});
