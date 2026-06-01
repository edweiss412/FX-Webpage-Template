import { describe, it, expect } from "vitest";
import { DEV_PANEL_PRESENT } from "@/lib/admin/__generated__/devPanelPresent";

describe("DEV_PANEL_PRESENT (committed default)", () => {
  it("committed default is false (fail-closed)", () => {
    expect(DEV_PANEL_PRESENT).toBe(false);
  });
});
