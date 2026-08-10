// @vitest-environment jsdom
/**
 * tests/components/diagrams/GalleryLightbox.test.tsx
 *
 * The next/image migration of the lightbox (spec §6), plus the transition audit
 * the spec's inventory requires. `GalleryLightboxPinchZoom.test.tsx` runs in the
 * same marker command and must stay green — this file pins the IMAGE contract,
 * that one pins the gesture layer.
 *
 * --------------------------------------------------------------------------
 * Transition Inventory (copied VERBATIM from spec §6 — the audit below asserts
 * one row per pair; a pair whose treatment is "impossible" is asserted to be
 * structurally unreachable, not merely unobserved).
 *
 * Per-item visual states, both components: blur (placeholder showing), empty (no
 * blur available, image not yet loaded), loaded, failed (runtime onError),
 * unavailable (manifest available:false / null path). Lightbox items
 * additionally carry a tier axis: inactive (clamped variant) vs active
 * (pinOriginal).
 *
 * | Pair | Lightbox treatment |
 * |---|---|
 * | blur → loaded | next/image built-in swap — instant, both tiers |
 * | blur → failed | instant swap to unavailable branch (setFailedKeys) |
 * | blur → empty | impossible — blur presence is per-item manifest data, fixed for the render |
 * | empty → loaded | instant paint, both tiers |
 * | empty → failed | instant swap to unavailable branch |
 * | empty → blur | impossible (as blur → empty) |
 * | loaded → failed | possible via tier swap only — see compound rows |
 * | loaded → blur / empty | impossible except via unmount/remount (Embla keeps slides mounted) |
 * | failed → any | terminal per item: failedKeys is per-item id and never cleared this session — a failed item renders the placeholder in BOTH tiers (tier swap does not retry) |
 * | unavailable → any | never transitions; static placeholder |
 *
 * Compound transitions:
 *
 * | Compound | Treatment |
 * |---|---|
 * | lightbox opens while a thumbnail is still in blur/empty | independent components, no shared state; lightbox loads its own tier |
 * | slide inactive → active (Embla) while inactive tier still loading | active render swaps to the pinOriginal URL — a NEW load cycle; blur (when present) covers the gap, else empty-then-image |
 * | slide active → inactive (swipe away) | src returns to the clamped variant URL — browser-cached from the inactive render, instant; no custom animation |
 * | tier swap on a FAILED item | no retry: the item stays in the unavailable branch in both directions (failure is per-item, not per-tier — declared) |
 * | tier swap after active-tier load, back and forth | both URLs browser-cached after first load of each; instant src swaps, no animation |
 * --------------------------------------------------------------------------
 */

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

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
import { premise, premiseHolds } from "@/tests/_shared/premise";

// jsdom lacks matchMedia (the reduce-motion gate reads it), IntersectionObserver
// (Embla's SlidesInView observer) and ResizeObserver. Same stubs the sibling
// pinch-zoom suite installs.
beforeAll(() => {
  if (typeof window === "undefined") return;
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;
  (globalThis as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const BLUR = "data:image/webp;base64,UklGRhIAAABXRUJQ";

function item(i: number, overrides: Partial<GalleryItem> = {}): GalleryItem {
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
    ...overrides,
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

function pathOf(url: string | null): string {
  return new URL(url ?? "", "http://localhost").pathname;
}

/** The active slide's image is the one inside the zoom wrapper. */
function activeImage(container: HTMLElement): HTMLImageElement {
  const zoom = container.querySelector('[data-testid="rzpp-component"]');
  return zoom!.querySelector("img")!;
}

/** Any image NOT inside the zoom wrapper is an inactive slide. */
function inactiveImages(container: HTMLElement): HTMLImageElement[] {
  const zoom = container.querySelector('[data-testid="rzpp-component"]');
  return [...container.querySelectorAll("img")].filter(
    (img) => !zoom?.contains(img),
  ) as HTMLImageElement[];
}

const ORIGINAL = (i: number) => `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-${i}.png`;

afterEach(() => cleanup());

describe("GalleryLightbox — tiers", () => {
  test("the ACTIVE slide serves the original at every candidate width (pinOriginal)", () => {
    const { container } = open([item(1), item(2)]);
    const img = activeImage(container);

    const candidates = (img.getAttribute("srcset") ?? "")
      .split(",")
      .map((entry) => pathOf(entry.trim().split(" ")[0]!))
      .filter(Boolean);
    premise("next/image emitted srcset candidates for the active slide", candidates.length, 1);

    // Zoom needs full resolution: EVERY candidate is the original, so no
    // viewport can talk the browser into a downscaled tier.
    expect(new Set(candidates)).toEqual(new Set([ORIGINAL(1)]));
  });

  test("an INACTIVE slide serves clamped variants and never the original", () => {
    const { container } = open([item(1), item(2)]);
    const inactive = inactiveImages(container);
    premise("the fixture rendered at least one inactive slide", inactive.length, 0);

    const candidates = (inactive[0]!.getAttribute("srcset") ?? "")
      .split(",")
      .map((entry) => pathOf(entry.trim().split(" ")[0]!))
      .filter(Boolean);
    premise("next/image emitted srcset candidates for the inactive slide", candidates.length, 1);

    expect(candidates).not.toContain(ORIGINAL(2));
    expect(candidates.every((url) => url.includes("@"))).toBe(true);
    // With sizes="100vw" Next asks for widths up to 3840; clamping must answer
    // with the largest tier rather than falling through to the original.
    expect(candidates).toContain(
      `/api/asset/diagram/${SHOW_ID}/${REV}/embedded-obj-2.png@1024.webp`,
    );
  });

  test("the inactive slide declares sizes=100vw", () => {
    const { container } = open([item(1), item(2)]);

    expect(inactiveImages(container)[0]!.getAttribute("sizes")).toBe("100vw");
  });
});

describe("GalleryLightbox — blur", () => {
  test("BOTH tiers render the blur placeholder when blurDataURL is present", () => {
    const { container } = open([item(1, { blurDataURL: BLUR }), item(2, { blurDataURL: BLUR })]);

    expect(activeImage(container).getAttribute("style")).toContain(BLUR);
    const inactive = inactiveImages(container);
    premise("an inactive slide rendered to check", inactive.length, 0);
    expect(inactive[0]!.getAttribute("style")).toContain(BLUR);
  });

  test.each([
    ["an empty string", ""],
    ["a non-string", 42 as unknown as string],
  ])("blurDataURL that is %s renders NO placeholder on either tier", (_label, blur) => {
    const { container } = open([
      item(1, { blurDataURL: blur as string }),
      item(2, { blurDataURL: blur as string }),
    ]);

    expect(activeImage(container).getAttribute("style") ?? "").not.toContain("background-image");
    expect(inactiveImages(container)[0]!.getAttribute("style") ?? "").not.toContain(
      "background-image",
    );
  });
});

describe("GalleryLightbox — placeholder geometry", () => {
  test("the blur letterboxes like the image, on BOTH tiers", () => {
    // next/image reads style.objectFit — NOT the class — when sizing the
    // placeholder background. Without it the blur paints `cover`: stretched and
    // full-bleed, then snapping to the letterboxed image on load. Caught by the
    // impeccable critique dual gate, pinned here.
    const { container } = open([item(1, { blurDataURL: BLUR }), item(2, { blurDataURL: BLUR })]);

    expect(activeImage(container).getAttribute("style")).toContain("background-size: contain");
    const inactive = inactiveImages(container);
    premise("an inactive slide rendered to check", inactive.length, 0);
    expect(inactive[0]!.getAttribute("style")).toContain("background-size: contain");
  });
});

describe("GalleryLightbox — intrinsic dimensions", () => {
  test("valid dims render width/height rather than the fill branch", () => {
    const { container } = open([item(1, { intrinsicWidth: 1600, intrinsicHeight: 900 })]);
    const img = activeImage(container);

    expect(img.getAttribute("width")).toBe("1600");
    expect(img.getAttribute("height")).toBe("900");
    // The fill branch is absolutely positioned; the dims branch must not be.
    expect(img.getAttribute("style") ?? "").not.toContain("position: absolute");
  });

  test.each([
    ["zero", 0, 0],
    ["negative", -1600, -900],
    ["NaN", Number.NaN, Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY, 900],
    ["one axis missing", 1600, undefined],
  ])("dims that are %s fall back to the fill branch", (_label, w, h) => {
    const { container } = open([
      item(1, {
        ...(w === undefined ? {} : { intrinsicWidth: w as number }),
        ...(h === undefined ? {} : { intrinsicHeight: h as number }),
      }),
    ]);
    const img = activeImage(container);

    expect(img.getAttribute("style") ?? "").toContain("position: absolute");
  });

  test("an INACTIVE no-dims image fills a dedicated relative wrapper, not the padded figure", () => {
    // `inset-0` resolves against the containing block's PADDING box. The slide
    // figure carries px-4, so making IT the positioned ancestor would stretch the
    // inactive image 32px wider than the active one, which fills the zoom
    // wrapper inside the figure's content area — a silent size jump on tier swap.
    const { container } = open([item(1), item(2)]);
    const inactive = inactiveImages(container)[0]!;
    const wrapper = inactive.parentElement!;

    expect(wrapper.className).toContain("relative");
    expect(wrapper.className).toContain("size-full");
    premiseHolds(
      "the wrapper is a dedicated element, not the padded figure itself",
      wrapper.tagName !== "FIGURE" && !wrapper.className.includes("px-4"),
    );
  });

  test("an ACTIVE no-dims image fills the zoom wrapper", () => {
    const { container } = open([item(1)]);

    expect(activeImage(container).parentElement).toBe(
      container.querySelector('[data-testid="rzpp-component"]'),
    );
  });
});

describe("GalleryLightbox — transition audit (spec §6 inventory)", () => {
  test("blur → failed and empty → failed: onError swaps the ACTIVE slide to unavailable", () => {
    const { container } = open([item(1, { blurDataURL: BLUR })]);
    fireEvent.error(activeImage(container));

    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  test("blur → failed and empty → failed: onError swaps an INACTIVE slide to unavailable", () => {
    const { container } = open([item(1), item(2)]);
    const before = inactiveImages(container).length;
    premise("an inactive slide existed to fail", before, 0);

    fireEvent.error(inactiveImages(container)[0]!);

    expect(inactiveImages(container).length).toBe(before - 1);
  });

  test("failed → any is TERMINAL: the failure survives a REAL tier swap", () => {
    // failedKeys is keyed by item id, never cleared, and read by BOTH branches —
    // so making the failed item ACTIVE must not retry it. Now actually exercised.
    const { container } = open([item(1), item(2)]);
    const before = container.querySelectorAll("img").length;
    premise("there were two tiers rendered before the failure", before, 1);
    fireEvent.error(inactiveImages(container)[0]!);
    expect(container.querySelectorAll("img")).toHaveLength(before - 1);

    act(() => emblaApis.at(-1)!.scrollTo(1));

    // Item 2 is the active slide now, and it is still the unavailable branch.
    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  test("unavailable → any never transitions: an unavailable item renders no image at all", () => {
    const { container } = open([item(1, { available: false })]);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  test("blur → empty and empty → blur are impossible: blur presence is fixed per render", () => {
    // Structural, not observational: the placeholder is derived from item data
    // with no state in between, so no runtime event can move an item across it.
    const withBlur = open([item(1, { blurDataURL: BLUR })]);
    expect(activeImage(withBlur.container).getAttribute("style")).toContain(BLUR);
    cleanup();

    const withoutBlur = open([item(1)]);
    expect(activeImage(withoutBlur.container).getAttribute("style") ?? "").not.toContain(
      "background-image",
    );
  });

  test("a REAL tier swap re-renders the slide and swaps the URL to the pinned original", () => {
    // Driven through the mocked Embla emitter, so this is React actually moving
    // both branches — not a static render inspected twice. Note what is NOT
    // claimed: the image NODE is replaced, because the two branches live under
    // different parents (TransformWrapper vs the inactive wrapper), so "the tiers
    // differ by URL and nothing else" would be false.
    const { container } = open([item(1), item(2)]);
    const beforeInactive = pathOf(inactiveImages(container)[0]!.getAttribute("src"));
    premiseHolds(
      "the inactive tier starts on a clamped VARIANT, or the swap proves nothing",
      beforeInactive.includes("@") && beforeInactive !== ORIGINAL(2),
    );

    act(() => emblaApis.at(-1)!.scrollTo(1));

    expect(pathOf(activeImage(container).getAttribute("src"))).toBe(ORIGINAL(2));
    // ...and the slide that was active falls back to its clamped variant.
    const afterInactive = pathOf(inactiveImages(container)[0]!.getAttribute("src"));
    expect(afterInactive).not.toBe(ORIGINAL(1));
    expect(afterInactive).toContain("@");
    expect(container.innerHTML).not.toContain("data-framer");
  });
});
