// @vitest-environment jsdom
/**
 * Which slide is IN the accessibility tree, and whether moving between them is
 * silent.
 *
 * WHY THIS EXISTS. Embla keeps every slide mounted, so before this change all
 * five diagrams in a five-item gallery were exposed at once
 * (`BL-LIGHTBOX-INACTIVE-SLIDES-IN-A11Y-TREE`). A screen-reader user reading the
 * dialog top to bottom met five figures with no indication which one the
 * viewport was showing, the chevrons operated on an index nothing in the tree
 * named, and "diagram 3" meant nothing.
 *
 * TWO HALVES, and the second is why the first is safe. Hiding the inactive
 * slides fixes the reading order and makes the transition SILENT: the content
 * that was there is simply gone and nothing says what replaced it. So the
 * active-slide change announces.
 *
 * WHERE IT ANNOUNCES, ruled by the owner on 2026-08-25: the page indicator, the
 * element that already DISPLAYS the current slide, so the sighted indicator and
 * the announced one cannot disagree.
 *
 * That reverses audit P1-B, which had removed `aria-live` from that element,
 * and both of P1-B's reasons are answered rather than ignored. Its first — the
 * announcement is redundant because a slide change is user-initiated via a
 * labeled chevron — stopped being true in this same commit: with the inactive
 * slides out of the tree, a swipe replaces the only exposed figure and involves
 * no labeled button at all. Its second, that two competing polite regions
 * interleave on a chevron-while-zoomed transition, is a real mechanism and is
 * handled below.
 *
 * The compound case is where that mechanism bites. Navigation resets scale to
 * 1, so a chevron press while zoomed would otherwise have the ZOOM region emit
 * "Zoomed out" alongside the indicator's announcement — two polite regions on
 * one gesture. The reset is navigation-driven rather than a user de-zoom, so
 * the zoom region stays silent and exactly one region speaks per gesture-end.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { premise, premiseHolds } from "@/tests/_shared/premise";

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

import { GalleryLightbox } from "@/components/diagrams/GalleryLightbox";
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

function open(items: GalleryItem[], startIndex = 0) {
  return render(
    <GalleryLightbox
      showId={SHOW_ID}
      snapshotRevisionId={REV}
      items={items}
      startIndex={startIndex}
      onClose={() => {}}
    />,
  );
}

/** The slide figures, in document order. */
function figures(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("figure")] as HTMLElement[];
}
const exposed = (container: HTMLElement) =>
  figures(container).filter((f) => f.getAttribute("aria-hidden") !== "true");

afterEach(() => {
  cleanup();
  emblaApis.length = 0;
});

describe("inactive slides are out of the accessibility tree", () => {
  test("exactly one slide is exposed, and it is the active one", () => {
    const { container } = open([item(0), item(1), item(2)]);
    premise("the fixture rendered every slide", figures(container).length, 2);
    expect(exposed(container)).toHaveLength(1);
    // Identified by CONTENT, not by position: asserting "the first figure" would
    // pass on a build that exposed a fixed slide regardless of the active index.
    expect(exposed(container)[0]!.textContent ?? "").toContain("Diagram 0");
  });

  test("exposure follows the active slide across a swipe", () => {
    const { container } = open([item(0), item(1), item(2)]);
    premiseHolds("the embla mock is wired", emblaApis.length > 0);
    act(() => {
      emblaApis[emblaApis.length - 1]!.scrollTo(2);
    });
    expect(exposed(container)).toHaveLength(1);
    expect(exposed(container)[0]!.textContent ?? "").toContain("Diagram 2");
  });

  test("the current slide is announced from the element that displays it", () => {
    const { container } = open([item(0), item(1), item(2)]);
    const indicator = container.querySelector('[data-testid="lightbox-page-indicator"]')!;
    // Announced BY the visible indicator, not beside it: one element carrying
    // both means the sighted text and the announced text cannot disagree.
    expect(indicator.getAttribute("aria-live")).toBe("polite");
    expect(indicator.getAttribute("aria-atomic")).toBe("true");
    expect(indicator.textContent).toContain("1 of 3");

    act(() => {
      emblaApis[emblaApis.length - 1]!.scrollTo(1);
    });
    expect(indicator.textContent).toContain("2 of 3");
  });

  test("a slide change does not also speak from the zoom region", () => {
    vi.useFakeTimers();
    try {
      const { container } = open([item(0), item(1), item(2)]);
      const zoomRegion = () =>
        container.querySelector('[data-testid="lightbox-zoom-live-region"]')!.textContent ?? "";
      // Two acts, deliberately: React flushes effects at the END of an act, so
      // advancing the clock inside the same one fires the timer before the
      // effect that schedules it has run.
      act(() => {
        emblaApis[emblaApis.length - 1]!.scrollTo(1);
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      // Audit P1-B's live objection: two polite regions on one gesture. The
      // indicator speaks; this one must not, and it must not say "Zoomed out"
      // about a reset the navigation caused.
      expect(zoomRegion()).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
