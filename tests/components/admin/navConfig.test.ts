import { describe, expect, test } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";

describe("navConfig with Telemetry (desktopOnly)", () => {
  test("telemetry is present, desktopOnly, not mobileOnly", () => {
    const obs = NAV.find((n) => n.id === "telemetry");
    expect(obs).toBeTruthy();
    expect(obs!.href).toBe("/admin/dev/telemetry");
    expect((obs as { desktopOnly?: true }).desktopOnly).toBe(true);
    expect((obs as { mobileOnly?: true }).mobileOnly).toBeUndefined();
  });
  test("mobile-visible items (non-desktopOnly) stay <= OVERFLOW_THRESHOLD so no overflow More", () => {
    const mobile = NAV.filter((n) => !(n as { desktopOnly?: true }).desktopOnly);
    expect(shouldRenderOverflow(mobile.length)).toBe(false);
  });
  test("isNavItemActive: telemetry owns /admin/dev/telemetry; dashboard no longer matches it", () => {
    expect(isNavItemActive("telemetry", "/admin/dev/telemetry")).toBe(true);
    expect(isNavItemActive("dashboard", "/admin/dev/telemetry")).toBe(false);
  });
});
