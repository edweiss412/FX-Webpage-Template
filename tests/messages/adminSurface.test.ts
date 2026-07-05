import { describe, expect, test } from "vitest";
import {
  INBOX_ROUTED_CODES,
  BANNER_EXCLUDED_CODES,
  isInboxRouted,
} from "@/lib/messages/adminSurface";

describe("adminSurface", () => {
  test("INBOX_ROUTED_CODES is exactly the three per-show sync-problem codes", () => {
    expect([...INBOX_ROUTED_CODES].sort()).toEqual([
      "PARSE_ERROR_LAST_GOOD",
      "RESYNC_SHRINK_HELD",
      "SHEET_UNAVAILABLE",
    ]);
  });

  test("isInboxRouted narrows correctly", () => {
    expect(isInboxRouted("SHEET_UNAVAILABLE")).toBe(true);
    expect(isInboxRouted("PARSE_ERROR_LAST_GOOD")).toBe(true);
    expect(isInboxRouted("DRIVE_FETCH_FAILED")).toBe(false);
    expect(isInboxRouted("SYNC_STALLED")).toBe(false);
  });

  test("BANNER_EXCLUDED_CODES is the de-duped union of info-severity + inbox-routed", () => {
    for (const c of INBOX_ROUTED_CODES) expect(BANNER_EXCLUDED_CODES).toContain(c);
    // ROLE_FLAGS_NOTICE is the canonical info-severity code in the catalog.
    expect(BANNER_EXCLUDED_CODES).toContain("ROLE_FLAGS_NOTICE");
    expect(new Set(BANNER_EXCLUDED_CODES).size).toBe(BANNER_EXCLUDED_CODES.length);
  });
});
