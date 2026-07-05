import { describe, it, expect } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";

it("launch destinations: dashboard + attention + settings + telemetry", () => {
  expect(NAV.map((n) => n.id)).toEqual(["dashboard", "attention", "settings", "telemetry"]);
  expect(NAV.length).toBe(4);
});

it("telemetry (Telemetry) is a desktopOnly destination with href /admin/dev/telemetry", () => {
  const obs = NAV.find((n) => n.id === "telemetry");
  expect(obs).toBeDefined();
  expect(obs?.desktopOnly).toBe(true);
  expect(obs?.mobileOnly).toBeUndefined();
  expect(obs?.href).toBe("/admin/dev/telemetry");
});

it("ignored-sheets is NOT a nav destination (moved to a dashboard disclosure)", () => {
  expect(NAV.some((n) => (n.id as string) === "ignored-sheets")).toBe(false);
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

it("dashboard + settings are NOT mobileOnly (desktop destinations)", () => {
  expect(NAV.find((n) => n.id === "dashboard")?.mobileOnly).toBeUndefined();
  expect(NAV.find((n) => n.id === "settings")?.mobileOnly).toBeUndefined();
});

describe("active-state matrix: exactly one active id per path", () => {
  const matrix: Array<
    [path: string, activeId: "dashboard" | "attention" | "settings" | "telemetry"]
  > = [
    ["/admin", "dashboard"],
    ["/admin/needs-attention", "attention"],
    ["/admin/needs-attention/x", "attention"],
    // The former ignored-sheets route was removed (folded into a dashboard
    // disclosure). /admin/ignored-sheets now 307-redirects to /admin via
    // next.config redirects() (pinned by tests/config/rootRedirect.test.ts); if
    // any stray sub-path still resolves, isNavItemActive classifies it as
    // Dashboard (it is not settings/attention/telemetry).
    ["/admin/ignored-sheets", "dashboard"],
    ["/admin/ignored-sheets/x", "dashboard"],
    ["/admin/settings", "settings"],
    ["/admin/settings/admins", "settings"],
    ["/admin/dev/telemetry", "telemetry"],
    ["/admin/dev/telemetry/x", "telemetry"],
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
  // The mobile bottom bar shows only non-desktopOnly items (Telemetry is desktopOnly),
  // so the mobile-visible count is 3 (Dashboard / Attention / Settings)
  // → no overflow "More" tab.
  const mobileCount = NAV.filter((n) => !n.desktopOnly).length;
  expect(mobileCount).toBe(3);
  expect(shouldRenderOverflow(mobileCount)).toBe(false);
  expect(shouldRenderOverflow(5)).toBe(false);
  expect(shouldRenderOverflow(6)).toBe(true);
});
