import { describe, expect, test } from "vitest";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";

describe("bellExcludedCodes (spec §6.3)", () => {
  test("non-developer excludes HEALTH_CODES ∪ INBOX_ROUTED_CODES, de-duped", () => {
    const got = bellExcludedCodes(false);
    expect(new Set(got)).toEqual(new Set([...HEALTH_CODES, ...INBOX_ROUTED_CODES]));
    expect(got.length).toBe(new Set(got).size);
  });
  test("developer excludes exactly INBOX_ROUTED_CODES (health included; inbox never)", () => {
    const got = bellExcludedCodes(true);
    expect(new Set(got)).toEqual(new Set(INBOX_ROUTED_CODES));
    for (const code of INBOX_ROUTED_CODES) expect(got).toContain(code);
  });
  test("neither set is empty (catalog sanity — a refactor emptying these silently un-scopes the bell)", () => {
    expect(HEALTH_CODES.length).toBeGreaterThan(0);
    expect(INBOX_ROUTED_CODES.length).toBeGreaterThan(0);
  });
});

describe("BELL_LIMITS (spec §3.4 — must equal the SQL CHECK ranges)", () => {
  test("bounds", () => {
    expect(BELL_LIMITS.historyDays).toEqual({ min: 1, max: 365, default: 30 });
    expect(BELL_LIMITS.feedCap).toEqual({ min: 10, max: 200, default: 50 });
  });
});
