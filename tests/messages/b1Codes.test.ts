import { describe, expect, it } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { getDougFacing } from "@/lib/messages/lookup";

describe("B1 catalog codes", () => {
  it("ADMIN_ALERT_COUNT_FAILED is cataloged + Doug-facing", () => {
    expect(MESSAGE_CATALOG.ADMIN_ALERT_COUNT_FAILED).toBeDefined();
    expect(getDougFacing("ADMIN_ALERT_COUNT_FAILED")).toMatch(/check for alerts/i);
  });

  it("SYNC_STATUS_UNKNOWN is cataloged + Doug-facing", () => {
    expect(MESSAGE_CATALOG.SYNC_STATUS_UNKNOWN).toBeDefined();
    expect(getDougFacing("SYNC_STATUS_UNKNOWN")).toMatch(/isn't recognized|not recognized/i);
  });

  it("ADMIN_DRIVE_HEALTH_UNAVAILABLE is cataloged + Doug-facing", () => {
    expect(MESSAGE_CATALOG.ADMIN_DRIVE_HEALTH_UNAVAILABLE).toBeDefined();
    expect(getDougFacing("ADMIN_DRIVE_HEALTH_UNAVAILABLE")).toMatch(/read sync status/i);
  });

  it("ADMIN_EMAIL_WRITE_FAILED is cataloged + Doug-facing", () => {
    expect(MESSAGE_CATALOG.ADMIN_EMAIL_WRITE_FAILED).toBeDefined();
    expect(getDougFacing("ADMIN_EMAIL_WRITE_FAILED")).toMatch(/update administrators/i);
  });

  it("ADMIN_ROUTE_LOAD_FAILED is cataloged + Doug-facing", () => {
    expect(MESSAGE_CATALOG.ADMIN_ROUTE_LOAD_FAILED).toBeDefined();
    expect(getDougFacing("ADMIN_ROUTE_LOAD_FAILED")).toMatch(/admin page couldn't load/i);
  });
});
