// @vitest-environment jsdom
// M12.11 — PageTransition (route-change animation) + Skeleton/LoadingShell.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";

// usePathname drives the motion key; stub it.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

// PageTransition reads prefers-reduced-motion via window.matchMedia directly
// (NOT framer's useReducedMotion, which misses the initial value). jsdom has no
// matchMedia, so install a controllable mock.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PageTransition", () => {
  it("wraps children in the transition container when motion is allowed", () => {
    mockMatchMedia(false);
    render(
      <PageTransition>
        <p data-testid="child">content</p>
      </PageTransition>,
    );
    const wrapper = screen.getByTestId("page-transition");
    expect(wrapper).toContainElement(screen.getByTestId("child"));
    expect(wrapper).toHaveAttribute("data-reduced-motion", "false");
  });

  it("detects reduced motion from matchMedia's INITIAL value on mount (DESIGN §5.3)", () => {
    // Regression for the framer useReducedMotion bug: it returns false until a
    // matchMedia `change` event fires, so a visitor who ALREADY has reduced
    // motion on (no change event) wrongly got animations. Our hook reads
    // matchMedia(...).matches on mount, so the very first settled render
    // reflects the real preference.
    mockMatchMedia(true);
    render(
      <PageTransition>
        <p data-testid="child">content</p>
      </PageTransition>,
    );
    const wrapper = screen.getByTestId("page-transition");
    expect(wrapper).toContainElement(screen.getByTestId("child"));
    expect(wrapper).toHaveAttribute("data-reduced-motion", "true");
  });

  it("the wrapper element is present for BOTH motion preferences (no DOM-shape divergence → no hydration remount)", () => {
    mockMatchMedia(false);
    const { unmount } = render(
      <PageTransition>
        <span>a</span>
      </PageTransition>,
    );
    expect(screen.getByTestId("page-transition")).toBeInTheDocument();
    unmount();
    mockMatchMedia(true);
    render(
      <PageTransition>
        <span>a</span>
      </PageTransition>,
    );
    // structurally identical: the wrapper is rendered in BOTH cases (the
    // reduced-motion path never returns a bare fragment).
    expect(screen.getByTestId("page-transition")).toBeInTheDocument();
  });
});

describe("Skeleton / LoadingShell", () => {
  it("Skeleton is decorative (aria-hidden) and disables its pulse under reduced motion", () => {
    render(<Skeleton className="h-7 w-40" />);
    const el = document.querySelector("[aria-hidden='true']");
    expect(el).toBeTruthy();
    // the pulse is gated so reduced-motion users get a static plate
    expect(el?.className).toContain("motion-reduce:animate-none");
    expect(el?.className).toContain("animate-pulse");
  });

  it("LoadingShell announces the loading state once via role=status (sr-only), wrapping the skeleton", () => {
    render(
      <LoadingShell label="Loading your dashboard…" testId="dash-loading">
        <Skeleton className="h-20" />
      </LoadingShell>,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading your dashboard…");
    expect(status.className).toContain("sr-only");
    expect(screen.getByTestId("dash-loading")).toContainElement(status);
  });
});
