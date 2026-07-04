// @vitest-environment jsdom
//
// developer-tier Task 15 (spec §6 row 8) — the telemetry "Telemetry" nav
// item is developer-only. AdminNav takes a `viewerIsDeveloper` flag and filters
// any `developerOnly` NavItem out of BOTH the desktop inline nav and the mobile
// bottom tab bar when the viewer is not a developer. Non-developerOnly items
// (Dashboard, Settings) are unaffected either way.
//
// Concrete failure mode pinned: a normal admin seeing (and being able to click)
// the developer-only Telemetry/telemetry destination — the visibility half
// of the developer-tier gate. jsdom render, both flag values.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AdminNav } from "@/components/admin/nav/AdminNav";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const fetchSpy = vi.fn();

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const okAlerts = { kind: "ok", count: 0 } as const;

describe("AdminNav — developer-only nav items (Task 15)", () => {
  it("viewerIsDeveloper={false} → Telemetry (telemetry) is absent from desktop AND mobile", () => {
    render(<AdminNav email="doug@example.com" alertCount={okAlerts} viewerIsDeveloper={false} />);

    const topbar = within(screen.getByTestId("admin-nav-topbar"));
    expect(topbar.queryByRole("link", { name: /Telemetry/i })).toBeNull();
    // Mobile bottom tab bar: never renders the telemetry tab (it is
    // desktopOnly), and certainly not for a non-developer.
    expect(screen.queryByTestId("admin-bottom-tab-telemetry")).toBeNull();

    // Non-developerOnly destinations are unaffected.
    expect(topbar.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
    expect(topbar.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });

  it("viewerIsDeveloper={true} → Telemetry appears in the desktop nav (still desktopOnly on mobile)", () => {
    render(<AdminNav email="doug@example.com" alertCount={okAlerts} viewerIsDeveloper={true} />);

    const topbar = within(screen.getByTestId("admin-nav-topbar"));
    expect(topbar.getByRole("link", { name: /Telemetry/i })).toBeInTheDocument();
    // desktopOnly still holds: Telemetry is not added to the mobile tab bar.
    expect(screen.queryByTestId("admin-bottom-tab-telemetry")).toBeNull();

    // Non-developerOnly destinations remain.
    expect(topbar.getByRole("link", { name: /Dashboard/i })).toBeInTheDocument();
    expect(topbar.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });

  it("default (viewerIsDeveloper omitted) → Telemetry hidden (safe default)", () => {
    render(<AdminNav email="doug@example.com" alertCount={okAlerts} />);
    const topbar = within(screen.getByTestId("admin-nav-topbar"));
    expect(topbar.queryByRole("link", { name: /Telemetry/i })).toBeNull();
  });
});
