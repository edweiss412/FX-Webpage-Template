// @vitest-environment jsdom
/**
 * tests/components/Bootstrap.test.tsx (M9 C3 / M5-D2)
 *
 * Pins the Bootstrap shell's UI state machine per shape brief
 * 2026-05-14-auth-flow-polish.md §5.2:
 *
 *   connecting        → "Connecting" + sequenced dots
 *   still_working     → triggered at 6s elapsed in connecting; renders
 *                       "Still working… / This is taking longer than usual."
 *                       + dots + Retry button
 *   error             → renders generic error copy
 *   no_fragment       → renders wayfinding copy
 *
 * Critical contracts:
 *   - 6s timeout fires the still_working transition WITHOUT aborting the
 *     in-flight bootstrap fetch (it's a presentation flip, not an abort).
 *     If the original fetch resolves before Retry is clicked, the page
 *     unmounts via router.replace.
 *   - Retry button resets state to connecting + re-runs bootstrapMint +
 *     fetch /api/auth/redeem-link from the top.
 *   - Sequenced dots render in BOTH connecting AND still_working states
 *     (the dots are the loading affordance — they continue across the flip).
 *   - prefers-reduced-motion: covered by CSS keyframe `media (prefers-reduced-
 *     motion: reduce)` in globals.css; the test asserts the dot DOM is
 *     present (the actual CSS-driven animation is verified by manual review
 *     since jsdom doesn't compute media queries).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// next/navigation mock — capture router.replace calls. The router must be
// a stable object reference across renders, otherwise runBootstrap's
// useCallback identity changes every render and the useEffect re-fires,
// which clears the still_working timer mid-flight.
const navMock = vi.hoisted(() => {
  const replaceMock = vi.fn();
  return { replaceMock, routerMock: { replace: replaceMock } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => navMock.routerMock,
}));

// bootstrapMint mock — controllable resolution. Hoisted so vi.mock
// factories see the same instance the test body asserts against.
const actionsMock = vi.hoisted(() => ({ bootstrapMintMock: vi.fn() }));
const bootstrapMintMock = actionsMock.bootstrapMintMock;
vi.mock("@/app/show/[slug]/p/actions", () => ({
  bootstrapMint: (...args: unknown[]) => actionsMock.bootstrapMintMock(...args),
}));

import { Bootstrap } from "@/app/show/[slug]/p/Bootstrap";

const SHOW_ID = "018f2f4c-0000-4000-9000-000000000001";
const SLUG = "test-slug";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Set a fragment so connecting state engages (no_fragment branch is exit).
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      hash: "#t=fake-jwt-token",
      pathname: `/show/${SLUG}/p`,
      search: "",
    },
    writable: true,
  });
  // history.replaceState noop.
  window.history.replaceState = vi.fn();
  // Default: bootstrapMint returns a never-resolving promise so we control
  // the 6s timeout flip without the fetch racing it.
  bootstrapMintMock.mockReturnValue(new Promise<never>(() => {}));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Bootstrap connecting state", () => {
  test("renders 'Connecting' + sequenced-dots affordance on initial mount", async () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // The connecting copy is present immediately (initial state).
    expect(screen.getByTestId("bootstrap-connecting")).toBeTruthy();
    // The sequenced-dots affordance is present from the same initial mount.
    // The dots are CSS-animated; we just verify the DOM is rendered.
    const dots = screen.getByTestId("bootstrap-dots");
    expect(dots).toBeTruthy();
    // Three dots inside the wrapper (one per pulse-stagger position).
    expect(dots.querySelectorAll("[data-testid='bootstrap-dot']").length).toBe(3);
  });
});

describe("Bootstrap still_working transition (6s timeout)", () => {
  test("at 5.99s: still in connecting state", () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    act(() => {
      vi.advanceTimersByTime(5_990);
    });
    expect(screen.queryByTestId("bootstrap-connecting")).toBeTruthy();
    expect(screen.queryByTestId("bootstrap-still-working")).toBeNull();
  });

  test("at 6.0s: transitions to still_working state with Retry button", () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.queryByTestId("bootstrap-connecting")).toBeNull();
    expect(screen.getByTestId("bootstrap-still-working")).toBeTruthy();
    expect(screen.getByTestId("bootstrap-still-working")).toHaveProperty(
      "textContent",
      expect.stringContaining("Still working"),
    );
    expect(screen.getByTestId("bootstrap-retry")).toBeTruthy();
    expect(screen.getByTestId("bootstrap-retry").textContent).toBe("Retry");
    // Dots continue in still_working state per brief §5.2.
    expect(screen.getByTestId("bootstrap-dots")).toBeTruthy();
  });
});

describe("Bootstrap Retry button", () => {
  test("clicking Retry resets to connecting + re-runs bootstrapMint", async () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // Wait for initial bootstrapMint call (1).
    expect(bootstrapMintMock).toHaveBeenCalledTimes(1);
    // Trigger still_working.
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByTestId("bootstrap-retry")).toBeTruthy();
    // Click Retry.
    act(() => {
      fireEvent.click(screen.getByTestId("bootstrap-retry"));
    });
    // After click: state reset to connecting; bootstrapMint called again.
    expect(screen.queryByTestId("bootstrap-still-working")).toBeNull();
    expect(screen.getByTestId("bootstrap-connecting")).toBeTruthy();
    expect(bootstrapMintMock).toHaveBeenCalledTimes(2);
  });
});

describe("Bootstrap no_fragment branch", () => {
  test("renders no-fragment copy when location.hash is empty", () => {
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        hash: "",
        pathname: `/show/${SLUG}/p`,
        search: "",
      },
      writable: true,
    });
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // The no_fragment branch fires synchronously inside the IIFE (no
    // bootstrapMint call). After the microtask flushes the no_fragment
    // copy is present.
    return Promise.resolve().then(() => {
      expect(screen.queryByTestId("bootstrap-connecting")).toBeNull();
      expect(screen.getByTestId("bootstrap-no-fragment")).toBeTruthy();
    });
  });
});
