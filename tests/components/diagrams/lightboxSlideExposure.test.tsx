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
 * WHERE IT ANNOUNCES, and why not a new region. The dialog already has a polite
 * region for zoom (`lightbox-zoom-live-region`), and audit P1-B deliberately
 * REMOVED `aria-live` from the page indicator because two competing polite
 * regions interleave on a chevron-while-zoomed transition. That ruling stands
 * and this change respects its mechanism: the slide sentence goes into the
 * SAME region, through the same 150ms debounce, as ONE message. Nothing here
 * restores aria-live to the page indicator.
 *
 * The compound case is the one that would have broken it. Navigation resets
 * scale to 1, so a chevron press while zoomed would otherwise emit the slide
 * sentence and then have "Zoomed out" clobber it 150ms later. The reset is
 * navigation-driven rather than a user de-zoom, so it announces the slide and
 * stays silent about the zoom — one announcement per gesture-end, which is what
 * the shape brief §6 asked for in the first place.
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

  test("a slide change is not silent", () => {
    vi.useFakeTimers();
    try {
      const { container } = open([item(0), item(1), item(2)]);
      const region = () =>
        container.querySelector('[data-testid="lightbox-zoom-live-region"]')!.textContent ?? "";
      act(() => {
        vi.advanceTimersByTime(200);
      });
      // Mount is deliberately silent: nothing has changed yet, and a sentence
      // here would announce the dialog's own arrival twice.
      expect(region()).toBe("");
      // Two acts, deliberately: React flushes effects at the END of an act, so
      // advancing the clock inside the same one fires the timer before the
      // effect that schedules it has run, and the region reads empty for a
      // reason that has nothing to do with the code under test.
      act(() => {
        emblaApis[emblaApis.length - 1]!.scrollTo(1);
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(region()).toContain("2 of 3");
      // ONE region, ONE sentence: audit P1-B's objection was to competing
      // polite regions, and a slide change must not also emit a zoom line.
      expect(region()).not.toContain("Zoomed");
    } finally {
      vi.useRealTimers();
    }
  });
});
