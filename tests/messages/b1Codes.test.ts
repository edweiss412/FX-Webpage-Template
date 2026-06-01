import { describe, expect, it } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { getDougFacing } from "@/lib/messages/lookup";

describe("B1 catalog codes", () => {
  it("ADMIN_ALERT_COUNT_FAILED is cataloged + Doug-facing", () => {
    expect(MESSAGE_CATALOG.ADMIN_ALERT_COUNT_FAILED).toBeDefined();
    expect(getDougFacing("ADMIN_ALERT_COUNT_FAILED")).toMatch(/check for alerts/i);
  });
});
