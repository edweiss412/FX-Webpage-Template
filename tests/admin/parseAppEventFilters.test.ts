import { describe, expect, test } from "vitest";
import { parseAppEventFilters, escapeIlike } from "@/lib/admin/observabilityTypes";

const sp = (o: Record<string, string>) => new URLSearchParams(o);
const UUID = "00000000-0000-0000-0000-000000000001";

describe("parseAppEventFilters", () => {
  test("defaults: empty → sinceHours 24, no other filters", () => {
    const f = parseAppEventFilters(sp({}));
    expect(f.sinceHours).toBe(24);
    expect(f.levels).toBeUndefined();
    expect(f.cursor == null).toBe(true);
  });
  test("since token mapping: 1h/24h/7d/all → 1/24/168/null; junk → 24", () => {
    expect(parseAppEventFilters(sp({ since: "1h" })).sinceHours).toBe(1);
    expect(parseAppEventFilters(sp({ since: "7d" })).sinceHours).toBe(168);
    expect(parseAppEventFilters(sp({ since: "all" })).sinceHours).toBeNull();
    expect(parseAppEventFilters(sp({ since: "bogus" })).sinceHours).toBe(24);
  });
  test("levels: only valid members kept", () => {
    expect(parseAppEventFilters(sp({ level: "warn,bogus,error" })).levels).toEqual(["warn", "error"]);
    expect(parseAppEventFilters(sp({ level: "nope" })).levels).toBeUndefined();
  });
  test("showId/cursor.id must be UUID else dropped", () => {
    expect(parseAppEventFilters(sp({ showId: "not-a-uuid" })).showId).toBeUndefined();
    expect(parseAppEventFilters(sp({ showId: UUID })).showId).toBe(UUID);
  });
  test("string filters capped at 200 chars; whitespace q ignored", () => {
    const long = "x".repeat(201);
    expect(parseAppEventFilters(sp({ source: long })).source).toBeUndefined();
    expect(parseAppEventFilters(sp({ q: "   " })).q).toBeUndefined();
    expect(parseAppEventFilters(sp({ q: "  hello  " })).q).toBe("hello");
  });
  test("source/code/requestId pass through (requestId must survive parse for AC3 correlation)", () => {
    const f = parseAppEventFilters(sp({ source: "cron.sync", code: "CRON_RUN_SUMMARY", requestId: "req-9" }));
    expect(f.source).toBe("cron.sync");
    expect(f.code).toBe("CRON_RUN_SUMMARY");
    expect(f.requestId).toBe("req-9");
  });
  test("cursor accepted only with ISO-shaped occurredAt + UUID id", () => {
    const good = parseAppEventFilters(sp({ cursorAt: "2026-06-29T00:00:00.000Z", cursorId: UUID }));
    expect(good.cursor).toEqual({ occurredAt: "2026-06-29T00:00:00.000Z", id: UUID });
    // accepts PostgREST-style microseconds + +00:00 offset (the DB's own format)
    expect(parseAppEventFilters(sp({ cursorAt: "2026-06-29T00:00:00.123456+00:00", cursorId: UUID })).cursor).toBeTruthy();
    // rejects Date.parse-able-but-not-a-timestamp junk
    for (const bad of ["nope", "2026", "now", "June 29 2026"]) {
      expect(parseAppEventFilters(sp({ cursorAt: bad, cursorId: UUID })).cursor == null).toBe(true);
    }
  });
  test("escapeIlike escapes %, _ and backslash", () => {
    expect(escapeIlike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
