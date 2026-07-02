import { describe, it, expect } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";

it("launch destinations: dashboard + attention + ignored-sheets + settings + observability", () => {
  expect(NAV.map((n) => n.id)).toEqual([
    "dashboard",
    "attention",
    "ignored-sheets",
    "settings",
    "observability",
  ]);
  expect(NAV.length).toBe(5);
});

it("observability (Activity) is a desktopOnly destination with href /admin/observability", () => {
  const obs = NAV.find((n) => n.id === "observability");
  expect(obs).toBeDefined();
  expect(obs?.desktopOnly).toBe(true);
  expect(obs?.mobileOnly).toBeUndefined();
  expect(obs?.href).toBe("/admin/observability");
});

it("ignored-sheets item is a desktop destination with href /admin/ignored-sheets (Task E2)", () => {
  const ignored = NAV.find((n) => n.id === "ignored-sheets");
  expect(ignored).toBeDefined();
  expect(ignored?.mobileOnly).toBeUndefined();
  expect(ignored?.href).toBe("/admin/ignored-sheets");
});

it("attention item is mobileOnly with href /admin/needs-attention", () => {
  const attention = NAV.find((n) => n.id === "attention");
  expect(attention).toBeDefined();
  expect(attention?.mobileOnly).toBe(true);
  expect(attention?.href).toBe("/admin/needs-attention");
});

it("unpublished is NOT a nav destination (Held shows live in the dashboard list)", () => {
  expect(NAV.some((n) => (n.id as string) === "unpublished")).toBe(false);
});

it("dashboard + ignored-sheets + settings are NOT mobileOnly (desktop destinations)", () => {
  expect(NAV.find((n) => n.id === "dashboard")?.mobileOnly).toBeUndefined();
  expect(NAV.find((n) => n.id === "ignored-sheets")?.mobileOnly).toBeUndefined();
  expect(NAV.find((n) => n.id === "settings")?.mobileOnly).toBeUndefined();
});

describe("active-state matrix: exactly one active id per path", () => {
  const matrix: Array<
    [
      path: string,
      activeId: "dashboard" | "attention" | "ignored-sheets" | "settings" | "observability",
    ]
  > = [
    ["/admin", "dashboard"],
    ["/admin/needs-attention", "attention"],
    ["/admin/needs-attention/x", "attention"],
    ["/admin/ignored-sheets", "ignored-sheets"],
    ["/admin/ignored-sheets/x", "ignored-sheets"],
    ["/admin/settings", "settings"],
    ["/admin/settings/admins", "settings"],
    ["/admin/observability", "observability"],
    ["/admin/observability/x", "observability"],
    ["/admin/show/abc", "dashboard"],
  ];

  it.each(matrix)("%s → only %s active", (path, expectedId) => {
    const activeIds = NAV.map((n) => n.id).filter((id) => isNavItemActive(id, path));
    expect(activeIds).toEqual([expectedId]);
  });

  it("attention is active ONLY on needs-attention paths; dashboard NOT active there", () => {
    expect(isNavItemActive("attention", "/admin/needs-attention")).toBe(true);
    expect(isNavItemActive("attention", "/admin/needs-attention/x")).toBe(true);
    expect(isNavItemActive("dashboard", "/admin/needs-attention")).toBe(false);
    expect(isNavItemActive("dashboard", "/admin/needs-attention/x")).toBe(false);
    expect(isNavItemActive("attention", "/admin")).toBe(false);
    expect(isNavItemActive("attention", "/admin/show/abc")).toBe(false);
    expect(isNavItemActive("attention", "/admin/settings")).toBe(false);
  });

  it("a former /admin/unpublished path now activates Dashboard (route removed)", () => {
    // The Unpublished route was removed; Held shows appear in the dashboard's
    // Active-shows list. Any stray /admin/unpublished URL falls to Dashboard.
    expect(isNavItemActive("dashboard", "/admin/unpublished")).toBe(true);
  });
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
  // The mobile bottom bar shows only non-desktopOnly items (Activity is desktopOnly),
  // so the mobile-visible count is 4 (Dashboard / Attention / Ignored / Settings)
  // → no overflow "More" tab.
  const mobileCount = NAV.filter((n) => !n.desktopOnly).length;
  expect(mobileCount).toBe(4);
  expect(shouldRenderOverflow(mobileCount)).toBe(false);
  expect(shouldRenderOverflow(5)).toBe(false);
  expect(shouldRenderOverflow(6)).toBe(true);
});
