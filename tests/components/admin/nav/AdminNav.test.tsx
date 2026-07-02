// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AdminNav } from "@/components/admin/nav/AdminNav";

// Variable-driven so individual tests can move the pathname (badge hook
// reads it too; it must NOT fetch on initial mount).
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

describe("AdminNav", () => {
  it("renders brand, nav items, NotifBell, ThemeToggle, UserMenu", () => {
    render(<AdminNav email="doug@example.com" alertCount={okAlerts} />);
    expect(screen.getByText("Admin")).toBeInTheDocument(); // brand badge
    expect(screen.getAllByRole("link", { name: /Dashboard/ }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("admin-notif-bell")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("admin-user-avatar")).toBeInTheDocument();
  });

  it("brand link contains the FXAV icon image", () => {
    render(<AdminNav email="doug@example.com" alertCount={okAlerts} />);
    const brand = screen.getByTestId("admin-nav-brand");
    const img = brand.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", expect.stringContaining("fxav-icon"));
  });

  it("desktop top bar: Dashboard + Settings links, NO needs-attention link (mobileOnly, spec D-2), NO Unpublished (route removed)", () => {
    render(<AdminNav email="d@e.com" alertCount={okAlerts} />);
    const topbar = within(screen.getByTestId("admin-nav-topbar"));
    expect(topbar.getByRole("link", { name: /Dashboard/ })).toBeInTheDocument();
    expect(topbar.getByRole("link", { name: /Settings/ })).toBeInTheDocument();
    expect(topbar.queryByRole("link", { name: /Unpublished/ })).toBeNull();
    expect(topbar.queryByRole("link", { name: /Needs attention/i })).toBeNull();
    // The desktop inline nav links counted here: dashboard, settings (the brand
    // link also points at /admin, so count text-bearing nav links instead of raw
    // hrefs). Unpublished was removed; Needs-attention is mobileOnly and absent.
    const navLinks = topbar
      .getAllByRole("link")
      .filter((l) => /Dashboard|Unpublished|Settings|Needs attention/i.test(l.textContent ?? ""));
    expect(navLinks).toHaveLength(2);
  });

  it("bottom tab bar: attention BETWEEN dashboard and settings, NO Held tab (route removed)", () => {
    render(<AdminNav email="d@e.com" alertCount={okAlerts} />);
    const tabbar = screen.getByTestId("admin-bottom-tabs");
    expect(tabbar).toHaveTextContent("Home");
    expect(tabbar).toHaveTextContent("Attention");
    expect(tabbar).toHaveTextContent("Settings");
    expect(tabbar).not.toHaveTextContent("Held");
    expect(within(tabbar).queryByTestId("admin-bottom-tab-unpublished")).toBeNull();
    const dashboard = within(tabbar).getByTestId("admin-bottom-tab-dashboard");
    const attention = within(tabbar).getByTestId("admin-bottom-tab-attention");
    const settings = within(tabbar).getByTestId("admin-bottom-tab-settings");
    expect(attention).toHaveAttribute("href", "/admin/needs-attention");
    // Document order: dashboard < attention < settings.
    expect(
      dashboard.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      attention.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Activity (desktopOnly) is absent from the mobile bottom tabs; no dead 'More' placeholder", () => {
    render(<AdminNav email="a@b.c" alertCount={okAlerts} initialBadgeCount={0} />);
    expect(screen.queryByTestId("admin-bottom-tab-observability")).toBeNull();
    expect(screen.queryByTestId("admin-bottom-tab-more")).toBeNull(); // overflow never triggers (5 mobile tabs)
    expect(screen.getByTestId("admin-bottom-tab-dashboard")).toBeInTheDocument(); // a real mobile tab still renders
  });

  it("infra_error alertCount → degraded bell in the shell", () => {
    render(<AdminNav email="d@e.com" alertCount={{ kind: "infra_error" }} />);
    expect(screen.getByTestId("admin-notif-bell-degraded")).toBeInTheDocument();
  });

  describe("attention badge matrix (spec test 4)", () => {
    it.each<[string, number | null]>([
      ["null", null],
      ["0", 0],
      ["NaN", NaN],
      ["-1", -1],
    ])("initialBadgeCount %s → no badge node", (_label, value) => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={value} />);
      expect(screen.queryByTestId("admin-attention-badge")).toBeNull();
    });

    it("omitted initialBadgeCount (default null) → no badge node", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} />);
      expect(screen.queryByTestId("admin-attention-badge")).toBeNull();
    });

    it("3 → badge '3'", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={3} />);
      expect(screen.getByTestId("admin-attention-badge")).toHaveTextContent(/^3$/);
    });

    it("10 → badge '9+'", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={10} />);
      expect(screen.getByTestId("admin-attention-badge")).toHaveTextContent(/^9\+$/);
    });

    it("attention tab aria-label 'Needs attention, 3 items' when badged", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={3} />);
      expect(screen.getByTestId("admin-bottom-tab-attention")).toHaveAttribute(
        "aria-label",
        "Needs attention, 3 items",
      );
    });

    it("attention tab aria-label 'Needs attention' when unbadged", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={0} />);
      expect(screen.getByTestId("admin-bottom-tab-attention")).toHaveAttribute(
        "aria-label",
        "Needs attention",
      );
    });

    it("badge renders ONLY inside the attention tab, never dashboard/settings", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={4} />);
      const badges = screen.getAllByTestId("admin-attention-badge");
      expect(badges).toHaveLength(1);
      expect(screen.getByTestId("admin-bottom-tab-attention")).toContainElement(badges[0]!);
      expect(
        within(screen.getByTestId("admin-bottom-tab-dashboard")).queryByTestId(
          "admin-attention-badge",
        ),
      ).toBeNull();
      expect(
        within(screen.getByTestId("admin-bottom-tab-settings")).queryByTestId(
          "admin-attention-badge",
        ),
      ).toBeNull();
    });

    it("initial mount never fetches the count route", () => {
      render(<AdminNav email="d@e.com" alertCount={okAlerts} initialBadgeCount={3} />);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
