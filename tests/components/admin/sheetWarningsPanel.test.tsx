// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { sheetWarningsPanelCount } from "@/lib/admin/sheetWarningsCount";

describe("sheetWarningsPanelCount (spec §2.3)", () => {
  it("sums visible info rows and active here-cards; ignored and elsewhere excluded by construction", () => {
    expect(sheetWarningsPanelCount({ visibleInfoRows: 2, activeHere: 3 })).toBe(5);
    expect(sheetWarningsPanelCount({ visibleInfoRows: 0, activeHere: 0 })).toBe(0);
  });
});
