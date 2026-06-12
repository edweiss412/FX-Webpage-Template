import { describe, it, expect } from "vitest";
import { NAV, type NavEntry } from "@/app/help/_nav";

describe("app/help/_nav.ts shape", () => {
  it("NAV is a non-empty array", () => {
    expect(Array.isArray(NAV)).toBe(true);
    expect(NAV.length).toBeGreaterThan(0);
  });

  it("every entry has slug, title, and group", () => {
    for (const entry of NAV) {
      expect(typeof entry.slug).toBe("string");
      expect(typeof entry.title).toBe("string");
      expect(["get-started", "admin-surface", "reference"]).toContain(entry.group);
    }
  });

  it("includes all 14 v1 pages by slug", () => {
    const slugs = NAV.map((e: NavEntry) => e.slug).sort();
    expect(slugs).toEqual(
      [
        "/help",
        "/help/admin/dashboard",
        "/help/admin/onboarding-wizard",
        "/help/admin/parse-warnings",
        "/help/admin/per-show-panel",
        "/help/admin/preview-as-crew",
        "/help/admin/review-queues",
        "/help/admin/settings",
        "/help/admin/sharing-links",
        "/help/daily-rhythm",
        "/help/errors",
        "/help/getting-started",
        "/help/tour",
        "/help/whats-different",
      ].sort(),
    );
  });
});
