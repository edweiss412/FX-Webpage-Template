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
 * additionally carry a tier axis: inactive (clamped variant) vs active — and
 * since the zoom gate (spec 2026-08-10-diagram-viewing-polish §4.1) the ACTIVE
 * tier is itself two states: clamped until that slide shows zoom intent, then
 * pinOriginal. This file pins the pre-intent half (every case below opens
 * without a gesture); `galleryLightbox.zoomGate.test.tsx` pins the flip and the
 * per-slide persistence that follows it.
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
 * | slide inactive → active (Embla) while inactive tier still loading | active render swaps to the pinOriginal URL WHEN that slide has zoom intent (§4.1) — a NEW load cycle; blur (when present) covers the gap, else empty-then-image. Without intent the URL is the same clamped tier, so there is no new cycle at all |
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

/**
 * The clamped tier both tiers serve before any zoom intent: the largest rung of
 * `item()`'s ladder (`sizes="100vw"` pushes Next's candidate widths past the top
 * rung, and clamping answers with it rather than falling through to the
 * original). Derived from the fixture so a ladder edit cannot leave a stale
 * literal behind.
 */
const TOP_TIER = (i: number) => {
  const ladder = [...item(i).variants].sort((a, b) => a.width - b.width);
  return `/api/asset/diagram/${SHOW_ID}/${REV}/${ladder[ladder.length - 1]!.key}`;
};

afterEach(() => cleanup());

describe("GalleryLightbox — tiers", () => {
  test("the ACTIVE slide serves clamped variants until zoom intent (spec §4.1)", () => {
    // AMENDED contract: the active slide used to pin the original from the
    // moment the lightbox opened, which spent multi-megabyte bytes on a view
    // most crew never zoom. It now opens on the same clamped tier as an
    // inactive slide; `galleryLightbox.zoomGate.test.tsx` owns the flip.
    const { container } = open([item(1), item(2)]);
    const img = activeImage(container);

    const candidates = (img.getAttribute("srcset") ?? "")
      .split(",")
      .map((entry) => pathOf(entry.trim().split(" ")[0]!))
      .filter(Boolean);
    premise("next/image emitted srcset candidates for the active slide", candidates.length, 1);

    // No viewport can talk the browser into the original before a gesture.
    expect(new Set(candidates)).toEqual(new Set([TOP_TIER(1)]));
    expect(candidates).not.toContain(ORIGINAL(1));
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
  test("valid dims render width/height rather than the fill branch — BOTH tiers", () => {
    // Asserting the active branch alone leaves an inactive implementation that
    // always takes `fill` green, and the inactive branch is the one with the
    // dedicated wrapper, so it is the likelier place to get this wrong.
    const { container } = open([
      item(1, { intrinsicWidth: 1600, intrinsicHeight: 900 }),
      item(2, { intrinsicWidth: 800, intrinsicHeight: 1200 }),
    ]);
    const img = activeImage(container);

    expect(img.getAttribute("width")).toBe("1600");
    expect(img.getAttribute("height")).toBe("900");
    // The fill branch is absolutely positioned; the dims branch must not be.
    expect(img.getAttribute("style") ?? "").not.toContain("position: absolute");

    const inactive = inactiveImages(container);
    premise("an inactive dims-bearing slide rendered to check", inactive.length, 0);
    expect(inactive[0]!.getAttribute("width")).toBe("800");
    expect(inactive[0]!.getAttribute("height")).toBe("1200");
    expect(inactive[0]!.getAttribute("style") ?? "").not.toContain("position: absolute");
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
    // Runtime failure, so the slide offers its next step. Parse-time
    // unavailability still renders the inert placeholder, asserted below.
    expect(screen.getByText(/tap to retry/i)).toBeTruthy();
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

    // Item 2 is the active slide now. Task 5 changed WHAT it shows -- the retry
    // offer rather than the inert placeholder -- but the invariant this case
    // exists for is unchanged and is the important half: becoming active must not
    // AUTOMATICALLY re-request. A failure clears only on a deliberate tap, or a
    // swipe through a broken gallery would refetch every failed tile on venue
    // wifi, which is the opposite of what this arc is for.
    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(screen.getByText(/tap to retry/i), "the offer is present").toBeTruthy();
    expect(
      container.querySelector('[data-testid="lightbox-retrying"]'),
      "and nothing is in flight: no request was issued by the swipe alone",
    ).toBeNull();

    // ...and the REVERSE direction: active-failed back to inactive-failed. The
    // inventory declares failure terminal in BOTH directions, so both are driven.
    act(() => emblaApis.at(-1)!.scrollTo(0));

    // Identify WHICH slide is active, not just the counts: "still on the failed
    // item 2" and "back on item 1 with 2 inactive-failed" both satisfy a
    // one-image / one-placeholder assertion, so counts alone prove nothing here.
    // The URL names the ITEM (obj-1 vs obj-2), so it still discriminates now
    // that the un-zoomed active tier is the clamped one (spec §4.1).
    expect(pathOf(activeImage(container).getAttribute("src"))).toBe(TOP_TIER(1));
    expect(container.querySelectorAll("img")).toHaveLength(before - 1);
    // Item 2 is inactive again and STILL failed — no retry on the way back.
    // Still failed on the way back, and still only an OFFER: no automatic retry.
    expect(screen.getByText(/tap to retry/i)).toBeTruthy();
    expect(inactiveImages(container)).toHaveLength(0);
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

  test("a REAL tier swap re-renders both slides and, un-zoomed, costs no new load", () => {
    // Driven through the mocked Embla emitter, so this is React actually moving
    // both branches — not a static render inspected twice. Note what is NOT
    // claimed: the image NODE is replaced, because the two branches live under
    // different parents (TransformWrapper vs the inactive wrapper), so "the tiers
    // differ by URL and nothing else" would be false.
    //
    // AMENDED (spec §4.1): the swap used to move the newly-active slide onto the
    // pinned original. Without zoom intent both tiers now resolve to the SAME
    // clamped URL, so the property under test is URL CONTINUITY — swiping to a
    // slide whose clamped tier already loaded starts no second fetch. Asserting
    // per-item URLs (not just "contains @") keeps the oracle discriminating:
    // a swap that never moved would leave obj-1 active and fail.
    const { container } = open([item(1), item(2)]);
    const beforeActive = pathOf(activeImage(container).getAttribute("src"));
    const beforeInactive = pathOf(inactiveImages(container)[0]!.getAttribute("src"));
    premiseHolds(
      "both tiers start on a clamped VARIANT, or the swap proves nothing",
      beforeActive === TOP_TIER(1) && beforeInactive === TOP_TIER(2),
    );

    act(() => emblaApis.at(-1)!.scrollTo(1));

    // obj-2 is active now, on the very URL it already served while inactive.
    expect(pathOf(activeImage(container).getAttribute("src"))).toBe(beforeInactive);
    expect(pathOf(activeImage(container).getAttribute("src"))).not.toBe(ORIGINAL(2));
    // ...and the slide that was active keeps ITS clamped URL as it goes inactive.
    expect(pathOf(inactiveImages(container)[0]!.getAttribute("src"))).toBe(beforeActive);

    // BACK AGAIN — the inventory's "back and forth" row. A single navigation
    // would pass on a component whose first selection works and whose later ones
    // do not, which is the whole point of claiming the compound.
    act(() => emblaApis.at(-1)!.scrollTo(0));

    expect(pathOf(activeImage(container).getAttribute("src"))).toBe(TOP_TIER(1));
    expect(pathOf(inactiveImages(container)[0]!.getAttribute("src"))).toBe(TOP_TIER(2));
    expect(container.innerHTML).not.toContain("data-framer");
  });
});
