// @vitest-environment jsdom
/**
 * The LIGHTBOX's 30-second check-in, and its half of the deciding races.
 *
 * The harness below (the zoom mock, the CONTROLLED Embla, the item factory) is
 * copied from lightboxSlideExposure.test.tsx rather than shared. Duplication is
 * the house pattern for these suites and the reason is in that file: the real
 * Embla only emits `select` after layout, which jsdom never provides, so a
 * controlled emitter is the only way a swipe test asserts against a slide that
 * actually changed.
 *
 * WHAT IS DIFFERENT FROM THE GALLERY, and it is not symmetry for its own sake:
 *   - the overlay is gated on `isRetrying && isActive`, so an inactive slide
 *     never RENDERS a check-in. It can ENTER one and then be swiped away, which
 *     the spec's first draft denied and review refuted.
 *   - the announcement is ACTIVE-SLIDE ONLY. Embla keeps every slide mounted, so
 *     an inactive slide speaking would announce a diagram the user has not
 *     swiped to, which is the same reason the shipped failure announcements are
 *     active-only.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { premiseHolds } from "@/tests/_shared/premise";

// The zoom library is mocked to plain boxes: this file is about which element
// renders with which URL, not about gestures.
vi.mock("react-zoom-pan-pinch", async () => {
  const React = await import("react");
  return {
    TransformWrapper: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", { "data-testid": "rzpp-wrapper" }, children),
    TransformComponent: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", { "data-testid": "rzpp-component" }, children),
    useTransformEffect: () => {},
    useControls: () => ({
      resetTransform: () => {},
      centerView: () => {},
      setTransform: () => {},
      zoomIn: () => {},
      zoomOut: () => {},
    }),
  };
});

// A CONTROLLED Embla: the real library only emits `select` after layout, which
// jsdom never provides — so a swap test written against it silently asserts
// against a slide that never changed (round-2 review finding). This mock exposes
// the emitter, so the swap below is React actually re-rendering both branches.
vi.mock("embla-carousel-react", async () => {
  const React = await import("react");
  // Named as a hook so the rules-of-hooks lint can see it is one.
  function useEmblaCarouselMock() {
    const listeners = React.useRef(new Map<string, Set<() => void>>());
    const selected = React.useRef(0);
    const api = React.useMemo(
      () => ({
        selectedScrollSnap: () => selected.current,
        scrollTo: (index: number) => {
          selected.current = index;
          for (const cb of listeners.current.get("select") ?? []) cb();
        },
        scrollNext: () => api.scrollTo(selected.current + 1),
        scrollPrev: () => api.scrollTo(Math.max(0, selected.current - 1)),
        canScrollNext: () => true,
        canScrollPrev: () => selected.current > 0,
        on: (event: string, cb: () => void) => {
          const set = listeners.current.get(event) ?? new Set<() => void>();
          set.add(cb);
          listeners.current.set(event, set);
          return api;
        },
        off: (event: string, cb: () => void) => {
          listeners.current.get(event)?.delete(cb);
          return api;
        },
        reInit: () => {},
        rootNode: () => document.createElement("div"),
        internalEngine: () => ({}),
      }),
      [],
    );
    emblaApis.push(api);
    return [() => {}, api] as const;
  }
  return { default: useEmblaCarouselMock };
});

/** Every Embla instance this file mounts, newest last. */
const emblaApis: Array<{ scrollTo: (index: number) => void }> = [];

import { GalleryLightbox, RETRY_CHECK_IN_MS } from "@/components/diagrams/GalleryLightbox";
import type { GalleryItem } from "@/components/diagrams/Gallery";

const SHOW_ID = "show-1";
const REV = "rev-1";

function item(i: number): GalleryItem {
  const key = `embedded-obj-${i}.png`;
  return {
    id: `embedded:obj-${i}`,
    key,
    alt: `Diagram ${i}`,
    available: true,
    variants: [
      { width: 256, key: `${key}@256.webp` },
      { width: 512, key: `${key}@512.webp` },
      { width: 1024, key: `${key}@1024.webp` },
    ],
  };
}

function open(items: GalleryItem[], onAnnounce?: (m: string) => void, startIndex = 0) {
  // `exactOptionalPropertyTypes` is on, so passing `onAnnounce={undefined}` is a
  // type error rather than an omission: spread the prop only when there is one.
  return render(
    <GalleryLightbox
      showId={SHOW_ID}
      snapshotRevisionId={REV}
      items={items}
      startIndex={startIndex}
      onClose={() => {}}
      {...(onAnnounce ? { onAnnounce } : {})}
    />,
  );
}

const overlay = (c: HTMLElement) => c.querySelector('[data-testid="lightbox-retrying"]');
const failedControl = (c: HTMLElement) => c.querySelector('[data-testid="lightbox-retry"]');
const activeImage = (c: HTMLElement): HTMLImageElement | null => {
  const fig = [...c.querySelectorAll("figure")].find(
    (f) => f.getAttribute("aria-hidden") !== "true",
  );
  return (fig?.querySelector("img") as HTMLImageElement | null) ?? null;
};

function failActive(c: HTMLElement): void {
  const img = activeImage(c);
  premiseHolds("the active slide renders an image, so there is an onError to fire", img !== null);
  act(() => {
    fireEvent.error(img as HTMLImageElement);
  });
}

function tapRetry(c: HTMLElement): void {
  const btn = failedControl(c);
  premiseHolds("the failed slide offers a retry control to tap", btn !== null);
  act(() => {
    fireEvent.click(btn as Element);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  cleanup();
  emblaApis.length = 0;
});

/** Check-in callbacks captured at schedule time, newest last. */
let pendingCheckIns: Array<() => void> = [];

/**
 * Install a `setTimeout` spy that captures the check-in callbacks.
 *
 * ORDER MATTERS: `useFakeTimers` installs its own `setTimeout`, so the delegate
 * is captured AFTER it. Delegating to the REAL one schedules on a clock
 * `advanceTimersByTime` cannot reach, and every capture comes back empty.
 */
function captureCheckIns(): void {
  vi.useFakeTimers();
  pendingCheckIns = [];
  const fake = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: (...a: unknown[]) => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    if (ms === RETRY_CHECK_IN_MS) pendingCheckIns.push(() => fn());
    return (fake as unknown as (...a: unknown[]) => unknown)(
      fn,
      ms,
      ...rest,
    ) as unknown as ReturnType<typeof globalThis.setTimeout>;
  }) as unknown as typeof globalThis.setTimeout);
}

/**
 * Fire EVERY captured callback. Not just the newest: React mounts effects more
 * than once, so several are captured and only some are bound to the instance
 * currently rendering. Firing one closed over a discarded instance updates
 * nothing whatever the mechanism does, which is measured — the gallery's races
 * file passed with its guard DELETED until this was fixed there.
 */
function fireCapturedCheckIns(): void {
  premiseHolds("a check-in callback was captured", pendingCheckIns.length > 0);
  act(() => {
    for (const fire of pendingCheckIns) fire();
  });
}

describe("the lightbox check-in", () => {
  test("at the deadline the SAME overlay changes copy and un-inerts, keeping aria-busy", () => {
    vi.useFakeTimers();
    const { container } = open([item(1), item(2)]);
    failActive(container);
    tapRetry(container);

    const before = overlay(container);
    premiseHolds("the active slide is in flight", before !== null);
    expect(before?.getAttribute("aria-disabled")).toBe("true");
    expect(before?.textContent).toContain("Retrying");

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });

    const after = overlay(container);
    expect(after, "the check-in renders in the SAME element").toBe(before);
    expect(after?.textContent).toContain("Still loading");
    expect(
      after?.getAttribute("aria-busy"),
      "aria-busy stays true: the request is still in flight",
    ).toBe("true");
    expect(
      after?.hasAttribute("aria-disabled"),
      "aria-disabled is gone, because the control now does something",
    ).toBe(false);
  });

  test("the active slide announces once; an inactive slide never renders a check-in", () => {
    vi.useFakeTimers();
    const said: string[] = [];
    const { container } = open([item(1), item(2)], (m) => said.push(m));
    failActive(container);
    tapRetry(container);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    expect(said.filter((m) => m.includes("still loading"))).toHaveLength(1);

    // Swipe away. Embla keeps the slide mounted, so this is the case where a
    // naive implementation leaves a check-in rendered on a slide nobody is
    // looking at, or speaks for it.
    premiseHolds("the controlled Embla is available to swipe", emblaApis.length > 0);
    act(() => {
      emblaApis[emblaApis.length - 1]?.scrollTo(1);
    });
    expect(overlay(container), "no check-in overlay renders once the slide is inactive").toBeNull();
    expect(
      said.filter((m) => m.includes("still loading")),
      "and nothing further is announced for it",
    ).toHaveLength(1);
  });

  test("the check-in after Restart announces AGAIN on the active slide", () => {
    vi.useFakeTimers();
    const said: string[] = [];
    const { container } = open([item(1), item(2)], (m) => said.push(m));
    failActive(container);
    tapRetry(container);
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    const spoken = () => said.filter((m) => m.includes("still loading")).length;
    premiseHolds("the first check-in announced", spoken() === 1);

    const control = overlay(container);
    premiseHolds("the check-in is on screen, so Restart is reachable", control !== null);
    act(() => {
      fireEvent.click(control as HTMLElement);
    });
    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });

    // The gallery's twin, and the same defect: the id never leaves the phase map
    // across Restart, so an announced-set keyed on presence kept it marked and
    // the replacement's own window ended in a silent check-in.
    expect(overlay(container)?.textContent, "the second window really did check in").toContain(
      "Still loading",
    );
    expect(spoken(), "and it was announced, exactly once more").toBe(2);
  });

  test("a callback firing after the slide resolved writes nothing", async () => {
    captureCheckIns();
    const { container } = open([item(1), item(2)]);
    failActive(container);
    tapRetry(container);
    premiseHolds("a check-in callback was scheduled", pendingCheckIns.length > 0);

    // Resolve the retry, then fire the pending callback. Advancing the clock
    // instead proves nothing: the reconciler clears the timer on the removal, so
    // the callback never runs and the case passes against an unconditional
    // writer, which is exactly the mechanism it exists to catch.
    const img = activeImage(container);
    premiseHolds("the in-flight slide has an image to load", img !== null);
    await act(async () => {
      fireEvent.load(img as HTMLImageElement);
      await Promise.resolve();
    });
    fireCapturedCheckIns();

    expect(overlay(container), "a resolved slide shows no check-in").toBeNull();
  });

  test("a callback firing after the slide failed again writes nothing", () => {
    captureCheckIns();
    const { container } = open([item(1), item(2)]);
    failActive(container);
    tapRetry(container);
    premiseHolds("a check-in callback was scheduled", pendingCheckIns.length > 0);

    failActive(container); // the retry itself fails: pending -> failed
    fireCapturedCheckIns();

    expect(overlay(container), "a failed slide shows no check-in").toBeNull();
    expect(failedControl(container), "it shows its retry control instead").not.toBeNull();
  });

  test("Restart remounts the image and gives the replacement its own window", () => {
    captureCheckIns();
    const { container } = open([item(1), item(2)]);
    failActive(container);
    tapRetry(container);
    const duringPending = activeImage(container);
    premiseHolds("the in-flight slide renders an image to identify", duringPending !== null);

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS);
    });
    // AC-5: the CHECK-IN must not remount. AC-8: RESTART must. Opposite on
    // purpose, so a repair satisfying one by breaking the other fails here.
    expect(activeImage(container), "the check-in keeps the same node").toBe(duringPending);

    const control = overlay(container);
    premiseHolds("the check-in offers a control to press", control !== null);
    act(() => {
      fireEvent.click(control as Element);
    });

    const afterRestart = activeImage(container);
    expect(afterRestart, "Restart mounts an image again").not.toBeNull();
    expect(
      afterRestart,
      "and it is a DIFFERENT node, which is where the fresh request comes from",
    ).not.toBe(duringPending);
    expect(overlay(container)?.textContent, "the phase reverted to pending").toContain("Retrying");

    act(() => {
      vi.advanceTimersByTime(RETRY_CHECK_IN_MS - 1);
    });
    expect(
      overlay(container)?.textContent?.includes("Still loading"),
      "the replacement waits a FULL window, not the remainder of the old one",
    ).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(overlay(container)?.textContent).toContain("Still loading");
  });

  test("the swipe-away abandons the retry, so swiping back offers the control again", () => {
    vi.useFakeTimers();
    const { container } = open([item(1), item(2)]);
    failActive(container);
    tapRetry(container);
    premiseHolds("the slide is in flight before the swipe", overlay(container) !== null);

    act(() => {
      emblaApis[emblaApis.length - 1]?.scrollTo(1);
    });
    act(() => {
      emblaApis[emblaApis.length - 1]?.scrollTo(0);
    });

    // The Embla handler hands the id back to `failedKeys`, so the honest state
    // on return is the failed slide with its retry control, never a resurrected
    // check-in for a request nobody is waiting on.
    expect(overlay(container), "no phantom in-flight overlay on return").toBeNull();
    expect(failedControl(container), "the failure is restored with its control").not.toBeNull();
  });
});
