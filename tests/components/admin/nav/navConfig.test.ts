import { it, expect } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";
it("two launch destinations: dashboard + settings", () => {
  expect(NAV.map((n) => n.id)).toEqual(["dashboard", "settings"]);
});
it("show-detail route keeps Dashboard active", () => {
  expect(isNavItemActive("dashboard", "/admin/show/rpas-central-2026")).toBe(true);
  expect(isNavItemActive("settings", "/admin/show/rpas-central-2026")).toBe(false);
});
it("settings + nested settings routes activate Settings", () => {
  expect(isNavItemActive("settings", "/admin/settings")).toBe(true);
  expect(isNavItemActive("settings", "/admin/settings/admins")).toBe(true);
  expect(isNavItemActive("dashboard", "/admin")).toBe(true);
});
it("overflow 'More' tab hidden at ≤5 destinations, shown only at >5", () => {
  expect(shouldRenderOverflow(2)).toBe(false);
  expect(shouldRenderOverflow(5)).toBe(false);
  expect(shouldRenderOverflow(6)).toBe(true);
});
