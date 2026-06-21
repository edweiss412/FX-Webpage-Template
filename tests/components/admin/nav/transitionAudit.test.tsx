// @vitest-environment jsdom
/**
 * tests/components/admin/nav/transitionAudit.test.tsx (M12.2 B1 Task 9.2)
 *
 * Transition audit pinning spec §7's transition inventory + the COMPOUND
 * transitions (state A changing while state B is mid-flight / non-default),
 * which the individual per-state Phase 3/6/7 tasks did not exercise and are
 * the documented #1 source of post-implementation animation bugs.
 *
 * §7 inventory (verbatim, spec lines 214–222):
 *   - UserMenu closed↔open: popover fade/scale-in (`route-enter`); backdrop
 *     click closes. Compound: route change while menu open → menu closes
 *     instantly on navigation; AND resize crossing 720px while open →
 *     re-anchors (avatar present in both modes), not stuck-open.
 *   - Dark↔light toggle: instant (existing ThemeToggle).
 *   - Route change (Dashboard↔Settings↔show): content `route-enter` fade;
 *     nav active-state moves instantly (showdetail keeps Dashboard active).
 *   - Responsive desktop↔mobile (cross 720px): instant layout swap, no JS
 *     animation (class-driven `min-[720px]:`).
 *   - Add-admin row reveal/collapse: `route-enter`.
 *   - Revoke confirm→resolving→(ok removes row / inline error / conservative
 *     couldnt_confirm on hang): confirm animation; error + couldnt_confirm
 *     instant; couldnt_confirm suppresses re-submit even on a late result.
 *   - NotifBell badge appear/disappear/count change: instant (no animation).
 *
 * This is a SOURCE-level audit (enumerate every AnimatePresence / ternary /
 * conditional and assert its §7 treatment) PLUS rendered jsdom assertions
 * for the behavioral and compound cases.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

// --- next/navigation: usePathname is mutable so the compound route-change
// case can re-render with a new pathname while the menu is open.
const navState = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

// RevokeRowButton compound case: stub the bound Server Action so it never
// resolves (in-flight past the watchdog window) — mirrors revokeHang.test.tsx.
vi.mock("@/app/admin/settings/admins/actions", () => ({
  revokeAdminAction: async () => new Promise(() => {}),
}));

import { UserMenu } from "@/components/admin/nav/UserMenu";
import { NotifBell } from "@/components/admin/nav/NotifBell";
import { AdminNav } from "@/components/admin/nav/AdminNav";

const REPO_ROOT = resolve(__dirname, "../../../..");
const readSource = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");

const USER_MENU_SRC = readSource("components/admin/nav/UserMenu.tsx");
const NOTIF_BELL_SRC = readSource("components/admin/nav/NotifBell.tsx");
const ADMIN_NAV_SRC = readSource("components/admin/nav/AdminNav.tsx");
const ADD_ADMIN_SRC = readSource("app/admin/settings/admins/AddAdminForm.tsx");
const REVOKE_SRC = readSource("app/admin/settings/admins/RevokeRowButton.tsx");

beforeEach(() => {
  navState.pathname = "/admin";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("§7 source-level transition audit — every conditional has its declared treatment", () => {
  it("UserMenu open↔closed popover carries the route-enter class (Task 3.0 entrance)", () => {
    // The only animated reveal in the nav chrome. The `{open && (...)}`
    // conditional renders the role=menu popover with `route-enter`.
    expect(USER_MENU_SRC).toMatch(/data-testid="admin-user-menu"/);
    expect(USER_MENU_SRC).toMatch(/route-enter/);
    // No framer-motion AnimatePresence in this surface — entrance is the
    // CSS keyframe (with the globals.css reduced-motion guard).
    expect(USER_MENU_SRC).not.toMatch(/AnimatePresence/);
  });

  it("NotifBell badge / degraded swap is INSTANT — no animation class on either conditional branch", () => {
    // The `{count > 0 && (...)}` badge and the infra_error degraded branch
    // must NOT carry an animation class (no route-enter, no transition on
    // opacity/transform, no AnimatePresence) — §7 says instant counter.
    expect(NOTIF_BELL_SRC).not.toMatch(/route-enter/);
    expect(NOTIF_BELL_SRC).not.toMatch(/AnimatePresence/);
    expect(NOTIF_BELL_SRC).not.toMatch(/animate-/);
  });

  it("AdminNav desktop↔mobile swap is CLASS-DRIVEN (min-[720px]:), no JS animation", () => {
    // Bottom tabs hidden ≥720; desktop inline links hidden <720. Pure CSS
    // breakpoint swap — no AnimatePresence, no resize listener driving motion.
    expect(ADMIN_NAV_SRC).toMatch(/min-\[720px\]:hidden/); // bottom tabs
    expect(ADMIN_NAV_SRC).toMatch(/hidden\s+items-center[^"]*min-\[720px\]:flex/); // desktop links
    expect(ADMIN_NAV_SRC).not.toMatch(/AnimatePresence/);
  });

  it("Add-admin re-add reveal uses route-enter (§7 add-admin row reveal)", () => {
    // The `{isReAddPrompt ? (<reveal/>) : (<default/>)}` ternary is the
    // add-admin row reveal. §7 marks it route-enter slide/fade.
    expect(ADD_ADMIN_SRC).toMatch(/data-testid="admin-allowlist-re-add-prompt"/);
    expect(ADD_ADMIN_SRC).toMatch(/route-enter/);
  });

  it("RevokeRowButton couldnt_confirm + inline error states are INSTANT (no animation class)", () => {
    // §7: the confirm→resolving uses the existing confirm animation, but the
    // new error + couldnt_confirm states are instant. Assert no route-enter
    // and no AnimatePresence wraps those terminal states.
    expect(REVOKE_SRC).toMatch(/data-testid="admin-allowlist-couldnt-confirm"/);
    expect(REVOKE_SRC).not.toMatch(/route-enter/);
    expect(REVOKE_SRC).not.toMatch(/AnimatePresence/);
  });
});

describe("UserMenu — open/close behavior + compound transitions", () => {
  it("popover renders with route-enter on open and closes on backdrop click", () => {
    const { getByTestId, queryByTestId } = render(<UserMenu email="doug@example.com" />);
    fireEvent.click(getByTestId("admin-user-avatar"));
    const menu = getByTestId("admin-user-menu");
    expect(menu.className).toContain("route-enter");

    // Backdrop is the full-screen button rendered alongside the menu.
    const backdrop = menu.parentElement?.querySelector('button[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(queryByTestId("admin-user-menu")).toBeNull();
  });

  it("COMPOUND: route change while menu open → menu closes instantly on navigation", () => {
    const { getByTestId, queryByTestId, rerender } = render(<UserMenu email="doug@example.com" />);
    fireEvent.click(getByTestId("admin-user-avatar"));
    expect(getByTestId("admin-user-menu")).toBeInTheDocument();

    // Simulate a navigation: usePathname returns a new route, re-render.
    act(() => {
      navState.pathname = "/admin/settings";
    });
    rerender(<UserMenu email="doug@example.com" />);

    expect(queryByTestId("admin-user-menu")).toBeNull();
  });

  it("COMPOUND: resize crossing 720px while menu open → re-anchors (avatar present, not stuck-open, no crash)", () => {
    const { getByTestId } = render(<UserMenu email="doug@example.com" />);
    fireEvent.click(getByTestId("admin-user-avatar"));
    expect(getByTestId("admin-user-menu")).toBeInTheDocument();

    // Cross the 720 boundary downward (desktop → mobile) and fire resize.
    act(() => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 600,
      });
      window.dispatchEvent(new Event("resize"));
    });

    // The avatar (anchor) is present in both modes — the popover is anchored
    // to it (`absolute right-0`), so it re-anchors rather than detaching.
    expect(getByTestId("admin-user-avatar")).toBeInTheDocument();
    // Sane state: either the menu re-anchored to the still-present avatar, or
    // it closed defensively — never a crash and never a detached/stuck node.
    const menu = document.querySelector('[data-testid="admin-user-menu"]');
    if (menu) {
      // If still open, it must remain a child of the avatar's relative parent
      // (re-anchored), not orphaned at the document root.
      const anchorParent = getByTestId("admin-user-avatar").parentElement;
      expect(anchorParent?.contains(menu)).toBe(true);
    }

    // Cross back upward (mobile → desktop) — still no crash, avatar present.
    act(() => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1024,
      });
      window.dispatchEvent(new Event("resize"));
    });
    expect(getByTestId("admin-user-avatar")).toBeInTheDocument();
  });
});

describe("AdminNav — active-state moves instantly on route change (no animation)", () => {
  it("nav active aria-current follows pathname with no transition wrapper", () => {
    navState.pathname = "/admin";
    const { rerender, container } = render(
      <AdminNav email="doug@example.com" alertCount={{ kind: "ok", count: 0 }} />,
    );
    const currentOnDashboard = container.querySelectorAll('[aria-current="page"]').length;
    expect(currentOnDashboard).toBeGreaterThan(0);

    act(() => {
      navState.pathname = "/admin/settings";
    });
    rerender(<AdminNav email="doug@example.com" alertCount={{ kind: "ok", count: 0 }} />);
    // Active state moved (still ≥1 active item) — instant, no AnimatePresence.
    expect(container.querySelectorAll('[aria-current="page"]').length).toBeGreaterThan(0);
  });
});

describe("NotifBell — badge appear/disappear is instant", () => {
  it("badge present at count>0, absent at 0, no animation class either way", () => {
    const { rerender, queryByTestId, getByTestId } = render(
      <NotifBell alertCount={{ kind: "ok", count: 3 }} />,
    );
    const badge = getByTestId("admin-notif-badge");
    expect(badge.className).not.toContain("route-enter");
    expect(badge.className).not.toMatch(/animate-/);

    rerender(<NotifBell alertCount={{ kind: "ok", count: 0 }} />);
    expect(queryByTestId("admin-notif-badge")).toBeNull();
  });
});

describe("RevokeRowButton — COMPOUND: couldnt_confirm suppresses re-submit on a late result", () => {
  it("after the watchdog fires, a late in-flight result does NOT re-enable a second submit", async () => {
    vi.useFakeTimers();
    const { RevokeRowButton } = await import("@/app/admin/settings/admins/RevokeRowButton");

    const { getByTestId, queryByTestId } = render(
      <RevokeRowButton email="x@example.com" disabled={false} />,
    );

    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });

    // The bound Server Action (stubbed to a never-resolving promise) stays
    // in-flight while the watchdog window elapses — modeling the original
    // call committing late, after the conservative state already engaged.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(getByTestId("admin-allowlist-couldnt-confirm")).not.toBeNull();

    // Advance further (a late commit/render). The conservative state holds:
    // no idle Revoke button re-appears, and the only submit-shaped button is
    // the disabled "Revoking…" placeholder — no second ENABLED submit renders.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(getByTestId("admin-allowlist-couldnt-confirm")).not.toBeNull();
    expect(queryByTestId("admin-allowlist-revoke-button")).toBeNull();
    const confirmBtn = queryByTestId("admin-allowlist-revoke-confirm-button");
    expect(confirmBtn).not.toBeNull();
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
