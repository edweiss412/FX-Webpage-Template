// tests/admin/telemetryFilterHref.test.ts
import { describe, expect, it } from "vitest";
import { BASE, buildFilterHref } from "@/lib/admin/telemetryFilterHref";

describe("buildFilterHref", () => {
  it("adds a key", () => {
    expect(buildFilterHref(new URLSearchParams(""), { source: "cron.x" })).toBe(
      `${BASE}?source=cron.x`,
    );
  });

  it("removes a key when the patch value is null or empty", () => {
    const cur = new URLSearchParams("source=cron.x&code=Y");
    expect(buildFilterHref(cur, { source: null })).toBe(`${BASE}?code=Y`);
    expect(buildFilterHref(cur, { source: "" })).toBe(`${BASE}?code=Y`);
  });

  it("always drops the cursor pair (returns to page 1)", () => {
    const cur = new URLSearchParams("cursorAt=2020&cursorId=abc&code=Y");
    expect(buildFilterHref(cur, {})).toBe(`${BASE}?code=Y`);
  });

  it("returns bare BASE when nothing remains", () => {
    expect(buildFilterHref(new URLSearchParams("source=x"), { source: null })).toBe(BASE);
  });
});
