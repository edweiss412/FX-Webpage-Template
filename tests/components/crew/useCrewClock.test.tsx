// @vitest-environment jsdom
/**
 * useCrewClock: one clock for every crew-home component.
 *
 * Spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §4.2 to
 * §4.4: the day row, the pass and the run card's "Next" marker read the same
 * `now`. Plan docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md,
 * Task 8. Per-component clocks drift apart on a remount, so these cases mount
 * subscribers at different times and count the timers and listeners actually
 * registered, rather than trusting that a hook "is shared".
 *
 * Failure modes, one per case: a per-instance clock (two subscribers mounted
 * apart disagree after a tick); a remount starting a second interval; a store
 * that leaks its interval or listener after the last subscriber leaves; a
 * visibility bump that refreshes one subscriber but not another; a server
 * render that serves a reading cached by an earlier render; and `RightNowHero`
 * keeping its own private interval beside the shared one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

import {
  CREW_CLOCK_TICK_MS,
  CrewClockProvider,
  useCrewClock,
} from "@/components/crew/useCrewClock";
import { RightNowHero } from "@/components/crew/RightNowHero";
import type { RightNowContext } from "@/components/right-now/buildRightNowContext";

const START = new Date("2026-11-03T12:00:30Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Every interval the page registers at the clock's cadence. */
function clockIntervals(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter((call: unknown[]) => call[1] === CREW_CLOCK_TICK_MS).length;
}

describe("useCrewClock: one shared crew clock", () => {
  it("crew clock: two subscribers mounted a minute apart read the same now after a tick", () => {
    const dayRow = renderHook(() => useCrewClock());
    act(() => {
      vi.advanceTimersByTime(CREW_CLOCK_TICK_MS);
    });
    // PREMISE: the clock really moved, so agreement below is not two stale reads.
    expect(dayRow.result.current.getTime()).toBe(START.getTime() + CREW_CLOCK_TICK_MS);
    const pass = renderHook(() => useCrewClock());
    act(() => {
      vi.advanceTimersByTime(CREW_CLOCK_TICK_MS);
    });
    expect(dayRow.result.current.getTime()).toBe(START.getTime() + 2 * CREW_CLOCK_TICK_MS);
    expect(pass.result.current.getTime()).toBe(dayRow.result.current.getTime());
  });

  it("crew clock: unmounting and remounting a subscriber leaves exactly one interval", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const anchor = renderHook(() => useCrewClock());
    const remounting = renderHook(() => useCrewClock());
    remounting.unmount();
    renderHook(() => useCrewClock());
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    anchor.unmount();
  });

  it("crew clock: the interval and the visibility listener detach when the last subscriber leaves", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const a = renderHook(() => useCrewClock());
    const b = renderHook(() => useCrewClock());
    expect(addListener.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(1);
    a.unmount();
    // One subscriber is still mounted: nothing detaches yet.
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    b.unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const added = addListener.mock.calls.find(([type]) => type === "visibilitychange")?.[1];
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", added);
  });

  it("crew clock: a visibility refresh moves every subscriber to the same fresh now", () => {
    const a = renderHook(() => useCrewClock());
    const b = renderHook(() => useCrewClock());
    const later = START.getTime() + 5 * 60_000;
    vi.setSystemTime(new Date(later));
    // A hidden tab does not refresh: it is the return to visible that does.
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(a.result.current.getTime()).toBe(START.getTime());
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(a.result.current.getTime()).toBe(later);
    expect(b.result.current.getTime()).toBe(later);
  });

  it("crew clock: a remount after every subscriber left reads a fresh now, not the last cached one", () => {
    const first = renderHook(() => useCrewClock());
    first.unmount();
    const later = START.getTime() + 90 * 60_000;
    vi.setSystemTime(new Date(later));
    const second = renderHook(() => useCrewClock());
    expect(second.result.current.getTime()).toBe(later);
  });

  it("crew clock: the server never serves a cached reading", () => {
    function Stamp() {
      return <span>{useCrewClock().toISOString()}</span>;
    }
    // A client subscriber caches a reading in the module.
    const client = renderHook(() => useCrewClock());
    const later = new Date(START.getTime() + 45 * 60_000);
    vi.setSystemTime(later);
    let html: string;
    vi.stubGlobal("window", undefined);
    try {
      html = renderToString(<Stamp />);
    } finally {
      vi.unstubAllGlobals();
    }
    // PREMISE: the client subscriber still holds the earlier, cached reading.
    expect(client.result.current.getTime()).toBe(START.getTime());
    expect(html).toContain(later.toISOString());
  });

  it("crew clock: RightNowHero reads the shared clock, so the hero and a day row register one interval", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const context: RightNowContext = {
      dates: {
        travelIn: "2026-11-02",
        set: null,
        showDays: ["2026-11-03", "2026-11-04"],
        travelOut: "2026-11-05",
      },
      dateRestriction: { kind: "none" },
      showTitle: "Test Show",
      hotelName: null,
      hotelCheckInTime: null,
      hotelCheckOutTime: null,
      venueName: null,
      loadInTime: null,
      callTime: null,
      roomName: null,
      strikeTime: null,
      showAnchors: [],
      timezone: "America/New_York",
    };
    const hero = render(<RightNowHero context={context} />);
    // PREMISE: the hero mounted and runs its live machinery.
    expect(hero.container.querySelector('[data-testid="right-now-hero"]')).not.toBeNull();
    const dayRow = renderHook(() => useCrewClock());
    expect(clockIntervals(setIntervalSpy)).toBe(1);
    // And they agree on `now` after the shared tick.
    act(() => {
      vi.advanceTimersByTime(CREW_CLOCK_TICK_MS);
    });
    expect(dayRow.result.current.getTime()).toBe(START.getTime() + CREW_CLOCK_TICK_MS);
  });
});

/** Server-render `tree` as a request would: no `window`, so nothing is cached client-side. */
function serverHtml(tree: ReactElement): string {
  vi.stubGlobal("window", undefined);
  try {
    return renderToString(tree);
  } finally {
    vi.unstubAllGlobals();
  }
}

/**
 * Hydrate `html` with `tree`, collecting every recoverable error React reports
 * (a hydration mismatch is one) and every console error.
 */
async function hydrate(html: string, tree: ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const recoverable = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  let root: Root | null = null;
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
  });
  return {
    container,
    recoverable,
    consoleError,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}

function Stamp() {
  return <span data-testid="stamp">{useCrewClock().toISOString()}</span>;
}

const hydrationErrors = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.filter(([error]) => /hydrat/i.test(String((error as Error)?.message ?? error)));

describe("useCrewClock: the server's request time seeds hydration", () => {
  it("crew clock: the server render and the hydrating client render agree when the request time is not the client's now", async () => {
    // The request-scoped server time (nowDate(), possibly frozen) and the
    // server's own wall clock, both away from the client's clock.
    const requestTime = Date.UTC(2026, 10, 3, 9, 15, 0);
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 3, 3, 0, 0)));
    const html = serverHtml(
      <CrewClockProvider initialNow={requestTime}>
        <Stamp />
      </CrewClockProvider>,
    );
    expect(html).toContain(new Date(requestTime).toISOString());
    vi.setSystemTime(START);
    // PREMISE: the client's clock really differs from the seed.
    expect(Date.now()).not.toBe(requestTime);
    const hydrated = await hydrate(
      html,
      <CrewClockProvider initialNow={requestTime}>
        <Stamp />
      </CrewClockProvider>,
    );
    expect(hydrated.recoverable).not.toHaveBeenCalled();
    expect(hydrated.consoleError).not.toHaveBeenCalled();
    // Mounted: the clock has moved to the live client time.
    expect(hydrated.container.textContent).toBe(START.toISOString());
    hydrated.unmount();
  });

  it("crew clock: POSITIVE CONTROL, a client seeded with another time than the server's reports a hydration mismatch", async () => {
    const requestTime = Date.UTC(2026, 10, 3, 9, 15, 0);
    const html = serverHtml(
      <CrewClockProvider initialNow={requestTime}>
        <Stamp />
      </CrewClockProvider>,
    );
    const hydrated = await hydrate(
      html,
      <CrewClockProvider initialNow={requestTime + 60 * 60_000}>
        <Stamp />
      </CrewClockProvider>,
    );
    expect(hydrationErrors(hydrated.recoverable).length).toBeGreaterThan(0);
    hydrated.unmount();
  });

  it("crew clock: RightNowHero renders the seeded time on the server and hydrates without a mismatch", async () => {
    const context: RightNowContext = {
      dates: {
        travelIn: "2026-11-02",
        set: null,
        showDays: ["2026-11-03", "2026-11-04"],
        travelOut: "2026-11-05",
      },
      dateRestriction: { kind: "none" },
      showTitle: "Test Show",
      hotelName: null,
      hotelCheckInTime: null,
      hotelCheckOutTime: null,
      venueName: null,
      loadInTime: null,
      callTime: null,
      roomName: null,
      strikeTime: null,
      showAnchors: [],
      timezone: "America/New_York",
    };
    // The request falls on show day 1; the server's wall clock and the client's
    // clock both sit after the show, where the hero reads a different state.
    const requestTime = Date.UTC(2026, 10, 3, 17, 0, 0);
    const after = new Date(Date.UTC(2026, 10, 8, 17, 0, 0));
    vi.setSystemTime(after);
    const tree = (
      <CrewClockProvider initialNow={requestTime}>
        <RightNowHero context={context} />
      </CrewClockProvider>
    );
    const html = serverHtml(tree);
    expect(html).toContain('data-state="show_day_n"');
    const hydrated = await hydrate(html, tree);
    expect(hydrationErrors(hydrated.recoverable)).toEqual([]);
    // Mounted: the hero follows the live clock.
    expect(
      hydrated.container
        .querySelector('[data-testid="right-now-state"]')
        ?.getAttribute("data-state"),
    ).toBe("post_show");
    hydrated.unmount();
  });
});
