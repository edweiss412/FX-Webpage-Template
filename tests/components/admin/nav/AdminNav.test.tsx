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

  it("desktop top bar: Dashboard + Unpublished + Settings links, NO needs-attention link (mobileOnly, spec D-2)", () => {
    render(<AdminNav email="d@e.com" alertCount={okAlerts} />);
    const topbar = within(screen.getByTestId("admin-nav-topbar"));
    expect(topbar.getByRole("link", { name: /Dashboard/ })).toBeInTheDocument();
    expect(topbar.getByRole("link", { name: /Unpublished/ })).toBeInTheDocument();
    expect(topbar.getByRole("link", { name: /Settings/ })).toBeInTheDocument();
    expect(topbar.queryByRole("link", { name: /Needs attention/i })).toBeNull();
    // The three desktop inline nav links: dashboard, unpublished, settings (the
    // brand link also points at /admin, so count text-bearing nav links instead
    // of raw hrefs). Needs-attention is mobileOnly and absent here.
    const navLinks = topbar
      .getAllByRole("link")
      .filter((l) => /Dashboard|Unpublished|Settings|Needs attention/i.test(l.textContent ?? ""));
    expect(navLinks).toHaveLength(3);
  });

  it("bottom tab bar: four tabs with attention BETWEEN dashboard and unpublished, settings last", () => {
    render(<AdminNav email="d@e.com" alertCount={okAlerts} />);
    const tabbar = screen.getByTestId("admin-bottom-tabs");
    expect(tabbar).toHaveTextContent("Home");
    expect(tabbar).toHaveTextContent("Attention");
    expect(tabbar).toHaveTextContent("Held");
    expect(tabbar).toHaveTextContent("Settings");
    const dashboard = within(tabbar).getByTestId("admin-bottom-tab-dashboard");
    const attention = within(tabbar).getByTestId("admin-bottom-tab-attention");
    const unpublished = within(tabbar).getByTestId("admin-bottom-tab-unpublished");
    const settings = within(tabbar).getByTestId("admin-bottom-tab-settings");
    expect(attention).toHaveAttribute("href", "/admin/needs-attention");
    expect(unpublished).toHaveAttribute("href", "/admin/unpublished");
    // Document order: dashboard < attention < unpublished < settings.
    expect(
      dashboard.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      attention.compareDocumentPosition(unpublished) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      unpublished.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
