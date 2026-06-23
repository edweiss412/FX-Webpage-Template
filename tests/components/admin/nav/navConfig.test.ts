import { describe, it, expect } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";

it("launch destinations: dashboard + attention + unpublished + settings", () => {
  expect(NAV.map((n) => n.id)).toEqual(["dashboard", "attention", "unpublished", "settings"]);
  expect(NAV.length).toBe(4);
});

it("attention item is mobileOnly with href /admin/needs-attention", () => {
  const attention = NAV.find((n) => n.id === "attention");
  expect(attention).toBeDefined();
  expect(attention?.mobileOnly).toBe(true);
  expect(attention?.href).toBe("/admin/needs-attention");
});

it("unpublished item is a desktop destination with href /admin/unpublished (Task E1)", () => {
  const unpublished = NAV.find((n) => n.id === "unpublished");
  expect(unpublished).toBeDefined();
  expect(unpublished?.mobileOnly).toBeUndefined();
  expect(unpublished?.href).toBe("/admin/unpublished");
});

it("dashboard + unpublished + settings are NOT mobileOnly (desktop destinations)", () => {
  expect(NAV.find((n) => n.id === "dashboard")?.mobileOnly).toBeUndefined();
  expect(NAV.find((n) => n.id === "unpublished")?.mobileOnly).toBeUndefined();
  expect(NAV.find((n) => n.id === "settings")?.mobileOnly).toBeUndefined();
});

describe("active-state matrix: exactly one active id per path", () => {
  const matrix: Array<
    [path: string, activeId: "dashboard" | "attention" | "unpublished" | "settings"]
  > = [
    ["/admin", "dashboard"],
    ["/admin/needs-attention", "attention"],
    ["/admin/needs-attention/x", "attention"],
    ["/admin/unpublished", "unpublished"],
    ["/admin/unpublished/x", "unpublished"],
    ["/admin/settings", "settings"],
    ["/admin/settings/admins", "settings"],
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

  it("unpublished is active ONLY on /admin/unpublished*; dashboard NOT active there (Task E1)", () => {
    expect(isNavItemActive("unpublished", "/admin/unpublished")).toBe(true);
    expect(isNavItemActive("unpublished", "/admin/unpublished/x")).toBe(true);
    expect(isNavItemActive("dashboard", "/admin/unpublished")).toBe(false);
    expect(isNavItemActive("dashboard", "/admin/unpublished/x")).toBe(false);
    expect(isNavItemActive("unpublished", "/admin")).toBe(false);
    expect(isNavItemActive("unpublished", "/admin/show/abc")).toBe(false);
    expect(isNavItemActive("unpublished", "/admin/settings")).toBe(false);
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
  expect(shouldRenderOverflow(NAV.length)).toBe(false);
  expect(shouldRenderOverflow(5)).toBe(false);
  expect(shouldRenderOverflow(6)).toBe(true);
});
