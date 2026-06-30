import { describe, expect, test } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";

describe("navConfig with Activity (desktopOnly)", () => {
  test("observability is present, desktopOnly, not mobileOnly", () => {
    const obs = NAV.find((n) => n.id === "observability");
    expect(obs).toBeTruthy();
    expect(obs!.href).toBe("/admin/observability");
    expect((obs as { desktopOnly?: true }).desktopOnly).toBe(true);
    expect((obs as { mobileOnly?: true }).mobileOnly).toBeUndefined();
  });
  test("mobile-visible items (non-desktopOnly) stay <= OVERFLOW_THRESHOLD so no overflow More", () => {
    const mobile = NAV.filter((n) => !(n as { desktopOnly?: true }).desktopOnly);
    expect(shouldRenderOverflow(mobile.length)).toBe(false);
  });
  test("isNavItemActive: observability owns /admin/observability; dashboard no longer matches it", () => {
    expect(isNavItemActive("observability", "/admin/observability")).toBe(true);
    expect(isNavItemActive("dashboard", "/admin/observability")).toBe(false);
  });
});
