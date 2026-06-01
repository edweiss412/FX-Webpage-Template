import { describe, expect, it } from "vitest";
import { getRequiredDougFacing } from "@/lib/messages/lookup";

describe("getRequiredDougFacing", () => {
  it("returns the non-null Doug copy as a string", () => {
    expect(getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED")).toMatch(/check for alerts/i);
  });

  it("throws for a code whose dougFacing is null (programmer error)", () => {
    // ADMIN_SESSION_LOOKUP_FAILED has dougFacing: null (catalog.ts:1301)
    expect(() => getRequiredDougFacing("ADMIN_SESSION_LOOKUP_FAILED")).toThrow();
  });
});
