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
import { StrictMode as ReactStrictMode } from "react";
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
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
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
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    act(() => {
      vi.advanceTimersByTime(5_990);
    });
    expect(screen.queryByTestId("bootstrap-connecting")).toBeTruthy();
    expect(screen.queryByTestId("bootstrap-still-working")).toBeNull();
  });

  test("at 6.0s: transitions to still_working state with Retry button", () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
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
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
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
  test("renders no-fragment copy + 'Go to my shows' fallback link", () => {
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
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    return Promise.resolve().then(() => {
      expect(screen.queryByTestId("bootstrap-connecting")).toBeNull();
      expect(screen.getByTestId("bootstrap-no-fragment")).toBeTruthy();
      // M9 C3 / M5-D5: self-serve fallback link.
      const fallback = screen.getByTestId("bootstrap-no-fragment-fallback") as HTMLAnchorElement;
      expect(fallback.textContent).toBe("Go to my shows");
      expect(fallback.getAttribute("href")).toBe("/me");
    });
  });
});

describe("Bootstrap R4: StrictMode dev double-invoke leaves single live attempt", () => {
  test("under StrictMode, bootstrapMint fires exactly once after the first cleanup probe", () => {
    // React 18+ StrictMode runs effects as setup → cleanup → setup with
    // refs preserved. R4 (codex finding): pre-fix the first cleanup
    // aborted the only in-flight attempt, then the second setup hit
    // didRunRef and returned early — leaving the shell stuck with no
    // live fetch. Fix: defer initial start to setTimeout(0) so the
    // first probe cleanup cancels the queued task before it sets
    // didRunRef; the second setup queues a fresh task that actually
    // runs.
    //
    // Under StrictMode in jsdom, render fires the same effect twice
    // synchronously. We advance fake timers past 0 to flush the
    // setTimeout(0) macrotask. Assert bootstrapMint was called
    // exactly once (NOT zero — the StrictMode-stuck pre-fix bug —
    // and NOT twice — the unguarded double-invoke regression).
    render(
      <ReactStrictMode>
        <Bootstrap showId={SHOW_ID} slug={SLUG} />
      </ReactStrictMode>,
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bootstrapMintMock).toHaveBeenCalledTimes(1);
  });
});

describe("Bootstrap R12 F2: Retry disabled while user-initiated retry is pending", () => {
  test("clicking Retry disables the button until the retry attempt resolves", () => {
    // First attempt mint never resolves so we can flip to still_working;
    // user clicks Retry → second attempt mint also never resolves; the
    // button stays disabled. Advance another 6s → still_working flips
    // again (R3 contract: prior + retry race; retry is still pending);
    // button MUST stay disabled.
    bootstrapMintMock
      .mockImplementationOnce(() => new Promise<never>(() => {}))
      .mockImplementationOnce(() => new Promise<never>(() => {}));

    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    const retryBtn = screen.getByTestId("bootstrap-retry") as HTMLButtonElement;
    expect(retryBtn.disabled).toBe(false);

    act(() => {
      fireEvent.click(retryBtn);
    });
    // Click resets state to connecting (button unmounts). Advance
    // past the next 6s window so still_working re-flips. The retry
    // mint is STILL pending — when the button re-mounts it MUST be
    // disabled. Pre-fix the user could spam retries here.
    expect(screen.queryByTestId("bootstrap-retry")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    const retryBtnAfter6s = screen.getByTestId("bootstrap-retry") as HTMLButtonElement;
    expect(retryBtnAfter6s.disabled).toBe(true);
    expect(retryBtnAfter6s.getAttribute("aria-busy")).toBe("true");
  });
});

describe("Bootstrap R3: prior attempt success still navigates after Retry", () => {
  test("attempt 1 in fetch → Retry starts attempt 2 → attempt 1 resolves OK → router.replace fires", async () => {
    // R3 (codex finding): brief §11 anti-goal "no timeout-as-abort" —
    // Retry races the original attempt, doesn't kill it. If the
    // ORIGINAL attempt resolves successfully after Retry has launched
    // attempt 2, it must still navigate (router.replace).
    //
    // We simulate this by:
    //   1. attempt 1 mint resolves immediately (so the IIFE proceeds to
    //      the redeem-link fetch).
    //   2. attempt 2 mint is a never-resolving promise.
    //   3. Mock global fetch so attempt 1's fetch is held until we
    //      explicitly resolve it; attempt 2's fetch never resolves.
    //   4. Trigger the 6s flip → click Retry → resolve attempt 1's
    //      fetch with 200 → assert router.replace is called.
    // R7 (codex finding): the mock MUST honor init.signal — otherwise
    // an abort-on-retry regression would still appear to pass (the
    // manually-resolved 200 fires regardless of abort state). Wire
    // the AbortSignal so attempt 1 rejects with AbortError if its
    // controller is aborted; this turns the would-be regression into
    // a visible test failure.
    let resolveAttempt1Fetch: (res: Response) => void = () => {};
    const signalCapture: { current: AbortSignal | null } = { current: null };
    const fetchMock = vi.fn().mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const sig = init?.signal ?? null;
          signalCapture.current = sig;
          if (sig) {
            sig.addEventListener("abort", () => {
              // DOMException's `name` is a getter; constructor's
              // second arg sets it. The object literal { name: ... }
              // would crash with "only a getter" — pass directly.
              reject(new DOMException("aborted", "AbortError"));
            });
          }
          resolveAttempt1Fetch = resolve;
        }),
    );
    fetchMock.mockImplementationOnce(() => new Promise<never>(() => {}));
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof global.fetch;

    bootstrapMintMock
      .mockImplementationOnce(async () => ({ nonce: "nonce-attempt-1" }))
      .mockImplementationOnce(() => new Promise<never>(() => {}));

    try {
      render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
      // Flush attempt 1's bootstrapMint resolution → fetch starts.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(bootstrapMintMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 6s flip → Retry visible.
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.getByTestId("bootstrap-retry")).toBeTruthy();

      // Click Retry → attempt 2 starts. Attempt 1's fetch is STILL in
      // flight (R3 fix: prior attempts not aborted).
      act(() => {
        fireEvent.click(screen.getByTestId("bootstrap-retry"));
      });
      expect(bootstrapMintMock).toHaveBeenCalledTimes(2);
      // R7 (codex finding): explicit assert that attempt 1's
      // AbortController was NOT aborted by Retry. If a future change
      // re-introduces controller.abort() on Retry, this fails directly
      // (not just via the implicit "no router.replace" assertion).
      expect(signalCapture.current?.aborted).toBe(false);

      // NOW resolve attempt 1's fetch with 200 — simulates the slow-
      // network case where the original redemption succeeds after
      // Retry has launched a fresh attempt. Attempt 1 MUST still
      // navigate via router.replace.
      const okResponse = new Response(null, { status: 200 });
      await act(async () => {
        resolveAttempt1Fetch(okResponse);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(navMock.replaceMock).toHaveBeenCalledTimes(1);
      expect(navMock.replaceMock).toHaveBeenCalledWith(`/show/${SLUG}`);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("Bootstrap retry race guard (R1 F2)", () => {
  test("stale attempt's late failure does NOT overwrite a fresher attempt's connecting state", async () => {
    // Plan: attempt 1 starts with a deferred-rejection mint. Trigger
    // 6s flip so Retry button is visible. Click Retry → attempt 2 starts
    // with its own never-resolving mint. NOW reject attempt 1's mint
    // (simulating the server-action returning AFTER the user retried).
    // Without the attempt-id guard, attempt 1's catch arm would call
    // setUi({kind:'error'}) over attempt 2's connecting state.
    let rejectAttempt1: (e: unknown) => void = () => {};
    bootstrapMintMock
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectAttempt1 = reject;
          }),
      )
      .mockImplementationOnce(() => new Promise<never>(() => {})); // attempt 2 never resolves

    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bootstrapMintMock).toHaveBeenCalledTimes(1);

    // 6s flip → Retry visible
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByTestId("bootstrap-retry")).toBeTruthy();

    // Click Retry → attempt 2 launches.
    act(() => {
      fireEvent.click(screen.getByTestId("bootstrap-retry"));
    });
    expect(bootstrapMintMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("bootstrap-connecting")).toBeTruthy();

    // NOW reject attempt 1 — simulates the late-arriving stale failure.
    await act(async () => {
      rejectAttempt1(new Error("attempt 1 stale failure"));
      // Allow the rejection to propagate through the async chain.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Attempt 2 is still connecting; the late rejection MUST NOT have
    // flipped to error.
    expect(screen.queryByTestId("bootstrap-error")).toBeNull();
    expect(screen.getByTestId("bootstrap-connecting")).toBeTruthy();
  });

  test("rapid double-click on Retry within 500ms only fires bootstrapMint once", () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bootstrapMintMock).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    // Two clicks back-to-back. The 500ms debounce ref blocks the second.
    act(() => {
      fireEvent.click(screen.getByTestId("bootstrap-retry"));
      fireEvent.click(screen.getByTestId("bootstrap-retry"));
    });
    // Initial mount = 1, single retry = 1. Total = 2. Without debounce
    // the second click would also call bootstrapMint (= 3 total).
    expect(bootstrapMintMock).toHaveBeenCalledTimes(2);
  });
});

describe("Bootstrap M5-D5 fallback links", () => {
  test("still_working state renders 'Sign in with Google instead' fallback link", () => {
    render(<Bootstrap showId={SHOW_ID} slug={SLUG} />);
    // R4: bootstrap start is deferred via setTimeout(0) to survive
    // StrictMode dev double-invoke. Flush the macrotask so the first
    // attempt actually fires before the test asserts on it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    const fallback = screen.getByTestId("bootstrap-still-working-fallback") as HTMLAnchorElement;
    expect(fallback.textContent).toBe("Sign in with Google instead");
    // Per brief §5.2: "Link to /auth/sign-in?next=/show/${slug} so
    // successful Google sign-in lands the crew member on the show they
    // were trying to reach."
    expect(fallback.getAttribute("href")).toBe(
      `/auth/sign-in?next=${encodeURIComponent(`/show/${SLUG}`)}`,
    );
  });
});
