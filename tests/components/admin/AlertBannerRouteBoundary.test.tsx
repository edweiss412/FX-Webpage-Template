// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AlertBannerRouteBoundary } from "@/components/admin/AlertBannerRouteBoundary";

// vi.mock is HOISTED above imports, so its factory must not close over plain
// module-scope `let`s (they read as undefined at hoist time). Use vi.hoisted
// for the mutable nav state — the repo pattern, cf.
// tests/components/admin/nav/transitionAudit.test.ts.
const navState = vi.hoisted(() => ({ pathname: "/admin", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.search),
}));

afterEach(cleanup);

function keyOf(el: HTMLElement): string | null {
  // The boundary renders a single keyed wrapper around children; we assert the
  // computed key via a data attribute it mirrors for testability.
  return el.querySelector("[data-banner-route-key]")?.getAttribute("data-banner-route-key") ?? null;
}

describe("AlertBannerRouteBoundary", () => {
  test("composes pathname, search and alertId into the remount key", () => {
    navState.pathname = "/admin";
    navState.search = "bucket=archived";
    const { container } = render(
      <AlertBannerRouteBoundary alertId="alert-1">
        <span>child</span>
      </AlertBannerRouteBoundary>,
    );
    expect(keyOf(container)).toBe("/admin?bucket=archived:alert-1");
  });

  test("renders children verbatim", () => {
    navState.pathname = "/admin";
    navState.search = "";
    const { getByText } = render(
      <AlertBannerRouteBoundary alertId="a">
        <span>hello-banner</span>
      </AlertBannerRouteBoundary>,
    );
    expect(getByText("hello-banner")).toBeTruthy();
  });
});
