// @vitest-environment jsdom
/**
 * tests/components/diagrams/galleryLightbox.zoomGate.test.tsx
 *
 * The zoom-gated original (spec 2026-08-10-diagram-viewing-polish §4.1, AC-1 +
 * AC-2). The lightbox opens the active slide on the CLAMPED variant tier and
 * only pins the original once the user has shown zoom INTENT.
 *
 * This suite amends the private-image-pipeline contract that pinned the
 * original unconditionally (`docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:140`);
 * the amendment is ratified in the spec above and back-referenced there.
 *
 * --------------------------------------------------------------------------
 * Transition Inventory rows covered here (spec §"Transition Inventory",
 * verbatim treatments):
 *
 * | pair | treatment |
 * |---|---|
 * | active slide, `wantsOriginal` false → true | instant loader swap; current bitmap keeps painting until the original loads, then browser-native swap (the silent sharpen). No authored animation. |
 * | sharpening in flight → slide becomes inactive (Embla) | inactive slide renders the clamped tier as today; the original fetch may complete unobserved (browser cache-less discard). Instant, no animation. |
 * | inactive slide with `wantsOriginal=true` → active again | renders with `pinOriginal` immediately, no new gesture required (session persistence, R6 F2). Instant. |
 * | sharpening in flight → lightbox closes | unmount; no cleanup beyond existing teardown (`GalleryLightbox.tsx:153` region already guards torn-down wrappers). |
 *
 * Compound: zoom gesture mid-sharpen (scale changing while src swaps) — the
 * transform layer owns the gesture and is src-agnostic; no special handling.
 * --------------------------------------------------------------------------
 *
 * Anti-tautology posture:
 *   - Every URL oracle reads the LOADER'S OUTPUT (the `src`/`srcset` the custom
 *     loader produced), never a container attribute that renders both tiers.
 *   - Every expected tier URL is DERIVED from the fixture's own variant ladder;
 *     no tier filename is hardcoded in an assertion.
 *   - The library mock subscribes its transform listener ONCE PER MOUNT (empty
 *     dep array) rather than re-subscribing every render. A production design
 *     that depended on a fresh closure to know WHICH slide zoomed would fail
 *     here, which is the point.
 *   - Intent is driven through the production wiring for each path class (the
 *     component's own keyboard handler, its own `doubleClick` configuration,
 *     the library callbacks it registered), not by poking state directly.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * The mocked react-zoom-pan-pinch surface. `emit` is the library publishing a
 * scale snapshot to every live `useTransformEffect` subscriber — the single
 * channel every real zoom path (pinch, wheel, keyboard, double-tap) travels
 * through, which is exactly why the spec derives intent from it.
 */
const lib = vi.hoisted(() => {
  const listeners: Array<(snap: { state: { scale: number } }) => void> = [];
  return {
    listeners,
    wrapperProps: null as Record<string, unknown> | null,
    emit(scale: number) {
      for (const cb of [...listeners]) cb({ state: { scale } });
    },
    reset() {
      listeners.length = 0;
      lib.wrapperProps = null;
    },
  };
});

vi.mock("react-zoom-pan-pinch", async () => {
  const React = await import("react");
  return {
    TransformWrapper: (props: Record<string, unknown>) => {
      lib.wrapperProps = props;
      return React.createElement(
        "div",
        { "data-testid": "rzpp-wrapper" },
        props.children as ReactNode,
      );
    },
    TransformComponent: ({ children }: { children?: ReactNode }) =>
      React.createElement(
        "div",
        {
          "data-testid": "rzpp-component",
          // The library owns double-tap zoom internally: it reads the
          // `doubleClick` config the lightbox passed and publishes the
          // resulting scale. Modelling that here means the double-tap case
          // exercises the component's OWN mode/step configuration — a
          // mis-configured `mode: "reset"` would land on 1 and fail.
          onDoubleClick: () => {
            const dc = (lib.wrapperProps?.doubleClick ?? {}) as {
              mode?: string;
              step?: number;
            };
            if (dc.mode === "reset") {
              lib.emit(1);
              return;
            }
            const step = typeof dc.step === "number" ? dc.step : 0;
            // v4.0.3: exponential when smooth, additive when not.
            const smooth = lib.wrapperProps?.smooth !== false;
            lib.emit(smooth ? Math.exp(step) : 1 + step);
          },
        },
        children,
      ),
    // Mount-only subscription: the adversarial case for stale closures.
    useTransformEffect: (cb: (snap: { state: { scale: number } }) => void) => {
      React.useEffect(() => {
        lib.listeners.push(cb);
        return () => {
          const i = lib.listeners.indexOf(cb);
          if (i >= 0) lib.listeners.splice(i, 1);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
    useControls: () =>
      React.useMemo(
        () => ({
          // The real controls publish the resulting scale through the same
          // transform-effect channel, so the keyboard path reaches intent the
          // way it does in the browser.
          resetTransform: () => lib.emit(1),
          centerView: (scale: number) => lib.emit(scale),
          setTransform: () => {},
          zoomIn: () => {},
          zoomOut: () => {},
        }),
        [],
      ),
  };
});

/** Every Embla instance this file mounts, newest last. */
const emblaApis: Array<{ scrollTo: (index: number) => void }> = [];

// A CONTROLLED Embla (same shape as the sibling tier suite): the real library
// only emits `select` after layout, which jsdom never provides.
vi.mock("embla-carousel-react", async () => {
  const React = await import("react");
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

import { GalleryLightbox } from "@/components/diagrams/GalleryLightbox";
import type { GalleryItem } from "@/components/diagrams/Gallery";
import { premise, premiseHolds } from "@/tests/_shared/premise";

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

function assetUrl(key: string): string {
  return `/api/asset/diagram/${SHOW_ID}/${REV}/${key}`;
}

/** The ORIGINAL URL for a fixture entry — derived from the entry, not typed out. */
function originalUrlOf(it: GalleryItem): string {
  return assetUrl(it.key);
}

/**
 * The clamped tier the loader must choose for this entry: the LARGEST rung of
 * the fixture's own ladder (the lightbox declares `sizes="100vw"`, so Next's
 * candidate widths run past the top rung and clamping answers with it).
 */
function topTierUrlOf(it: GalleryItem): string {
  const ladder = [...it.variants].sort((a, b) => a.width - b.width);
  return assetUrl(ladder[ladder.length - 1]!.key);
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

/** The active slide's image — the one the zoom wrapper owns. */
function activeImage(container: HTMLElement): HTMLImageElement {
  const zoom = container.querySelector('[data-testid="rzpp-component"]');
  premiseHolds("the active slide rendered its zoom wrapper", zoom !== null);
  return zoom!.querySelector("img")!;
}

/**
 * Every URL the loader produced for the active slide: the `src` plus each
 * `srcset` candidate. Asserting the SET closes the hole where `src` clamps but
 * a candidate still offers the original (or vice versa).
 */
function activeLoaderUrls(container: HTMLElement): Set<string> {
  const img = activeImage(container);
  const urls = new Set<string>();
  const src = img.getAttribute("src");
  if (src) urls.add(pathOf(src));
  for (const entry of (img.getAttribute("srcset") ?? "").split(",")) {
    const first = entry.trim().split(" ")[0];
    if (first) urls.add(pathOf(first));
  }
  return urls;
}

/** Images outside the zoom wrapper are inactive slides. */
function inactiveImages(container: HTMLElement): HTMLImageElement[] {
  const zoom = container.querySelector('[data-testid="rzpp-component"]');
  return [...container.querySelectorAll("img")].filter(
    (img) => !zoom?.contains(img),
  ) as HTMLImageElement[];
}

/** The library publishing a scale snapshot, wrapped so React commits it. */
function emitScale(scale: number): void {
  premise("the mocked library had a live transform subscriber to publish to", lib.listeners.length, 0);
  act(() => lib.emit(scale));
}

/** The library's post-gesture callback, as the component registered it. */
function fireWrapperCallback(name: "onPinchStop" | "onWheelStop", scale: number): void {
  const cb = lib.wrapperProps?.[name] as ((ref: { state: { scale: number } }) => void) | undefined;
  premiseHolds(`the lightbox registered ${name} on the zoom wrapper`, typeof cb === "function");
  act(() => cb!({ state: { scale } }));
}

beforeEach(() => {
  lib.reset();
  emblaApis.length = 0;
});

afterEach(() => cleanup());

describe("GalleryLightbox — zoom-gated original (AC-1)", () => {
  test("the active slide opens on the CLAMPED tier, never the original", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);

    const urls = activeLoaderUrls(container);
    premise("the loader produced at least one URL for the active slide", urls.size, 0);
    premiseHolds(
      "the fixture ladder's top tier is distinguishable from the original",
      topTierUrlOf(fixture) !== originalUrlOf(fixture),
    );

    expect(urls.has(originalUrlOf(fixture))).toBe(false);
    expect(urls).toEqual(new Set([topTierUrlOf(fixture)]));
  });

  test("committed pinch flips the slide to the original", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    premiseHolds(
      "the slide is on the clamped tier before the gesture",
      !activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    emitScale(2.4);
    fireWrapperCallback("onPinchStop", 2.4);

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
  });

  test("Ctrl/Meta-wheel (and trackpad pinch) flips the slide to the original", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    premiseHolds(
      "the slide is on the clamped tier before the gesture",
      !activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    emitScale(1.6);
    fireWrapperCallback("onWheelStop", 1.6);

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
  });

  test("the keyboard zoom-in key flips the slide to the original", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    premiseHolds(
      "the lightbox's own keyboard gate is satisfied (focus is inside the dialog)",
      container.querySelector('[data-testid="diagrams-lightbox"]')!.contains(document.activeElement),
    );
    premiseHolds(
      "the slide is on the clamped tier before the keystroke",
      !activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    // The production keyboard handler computes the target and drives the
    // library's controls; the mocked controls publish the scale back.
    act(() => {
      fireEvent.keyDown(window, { key: "+" });
    });

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
  });

  test("double-tap flips the slide to the original", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    premiseHolds(
      "the slide is on the clamped tier before the double-tap",
      !activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    act(() => {
      fireEvent.doubleClick(container.querySelector('[data-testid="rzpp-component"]')!);
    });

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
  });

  test("pointer-down noise below the commitment bound does NOT flip the slide", () => {
    // The library emits transient snapshots (1.001) during pointer-down before
    // any zoom has started. Gating on `> 0` scale change instead of the
    // documented 1.01 commitment bound would ship the original on a tap.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);

    emitScale(1.001);

    expect(activeLoaderUrls(container).has(originalUrlOf(fixture))).toBe(false);
    expect(activeLoaderUrls(container)).toEqual(new Set([topTierUrlOf(fixture)]));
  });

  test("de-zooming back to 1x does NOT re-downgrade the slide", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);

    emitScale(2.4);
    premiseHolds(
      "the gesture reached the original before the de-zoom under test",
      activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );
    emitScale(1);

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
  });
});

describe("GalleryLightbox — per-slide isolation and session persistence (AC-1)", () => {
  test("zooming slide A leaves slide B clamped, and returning to A pins WITHOUT a new gesture", () => {
    const a = item(1);
    const b = item(2);
    const { container } = open([a, b]);

    emitScale(2.4);
    premiseHolds(
      "slide A reached the original, or the isolation claim is vacuous",
      activeLoaderUrls(container).has(originalUrlOf(a)),
    );

    // → B. A global boolean (or a shared `pinOriginal`) fails here.
    act(() => emblaApis.at(-1)!.scrollTo(1));
    expect(activeLoaderUrls(container).has(originalUrlOf(b))).toBe(false);
    expect(activeLoaderUrls(container)).toEqual(new Set([topTierUrlOf(b)]));
    // A is inactive now: the inventory's "sharpening in flight → inactive" row
    // says it renders the clamped tier like any other inactive slide.
    const inactive = inactiveImages(container);
    premise("A rendered as an inactive slide to check", inactive.length, 0);
    expect(pathOf(inactive[0]!.getAttribute("src"))).not.toBe(originalUrlOf(a));

    // → back to A. No new emit, no keystroke, no gesture: a boolean that resets
    // on Embla selection fails this half.
    const listenersBefore = lib.listeners.length;
    act(() => emblaApis.at(-1)!.scrollTo(0));
    premiseHolds(
      "no scale was published during the navigation back to A",
      lib.listeners.length === listenersBefore,
    );

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(a)]));
  });

  test("the returning slide's zoom-intent survives even though its controller REMOUNTED", () => {
    // Slide A's ZoomController unmounts when A goes inactive and a fresh one
    // mounts on return. State parked in the controller (or in a ref the
    // controller owns) would be lost; the map lives in the lightbox.
    const a = item(1);
    const { container } = open([a, item(2)]);

    emitScale(2.4);
    const subscribersWhileZoomed = lib.listeners.length;
    premise("slide A's controller was subscribed while zoomed", subscribersWhileZoomed, 0);

    act(() => emblaApis.at(-1)!.scrollTo(1));
    act(() => emblaApis.at(-1)!.scrollTo(0));

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(a)]));
  });
});

describe("GalleryLightbox — variant-less entries are untouched (AC-2)", () => {
  test.each([
    ["an empty ladder", [] as GalleryItem["variants"]],
    ["a wholly malformed ladder", [{ width: -1, key: "" }] as GalleryItem["variants"]],
  ])("%s produces the SAME URLs before and after zoom intent", (_label, variants) => {
    const fixture = item(1, { variants });
    const { container } = open([fixture, item(2)]);

    const before = activeLoaderUrls(container);
    premise("the loader produced a URL for the variant-less entry", before.size, 0);
    premiseHolds(
      "a variant-less entry can only resolve to the original",
      before.size === 1 && before.has(originalUrlOf(fixture)),
    );

    emitScale(2.4);

    expect(activeLoaderUrls(container)).toEqual(before);
  });
});

describe("GalleryLightbox — transition inventory rows", () => {
  test("false → true is an INSTANT loader swap with no authored animation", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);

    emitScale(2.4);

    // No framer-motion machinery is introduced around the tier swap: the
    // browser's own bitmap-until-loaded behavior IS the transition.
    expect(activeImage(container).getAttribute("class") ?? "").not.toContain("transition");
    expect(activeImage(container).parentElement).toBe(
      container.querySelector('[data-testid="rzpp-component"]'),
    );
    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
  });

  test("sharpening in flight → lightbox closes: unmount runs clean", () => {
    const fixture = item(1);
    const view = open([fixture, item(2)]);

    emitScale(2.4);
    premiseHolds(
      "the slide was mid-sharpen (pinned to the original) at teardown",
      activeLoaderUrls(view.container).has(originalUrlOf(fixture)),
    );

    expect(() => view.unmount()).not.toThrow();
    expect(lib.listeners).toHaveLength(0);
  });

  test("a zoom gesture continuing THROUGH the src swap is not interrupted", () => {
    // Compound row: the transform layer is src-agnostic. Scale keeps climbing
    // after the swap and the slide stays pinned — no reset, no re-clamp.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);

    emitScale(1.4);
    premiseHolds(
      "the swap happened mid-gesture, or the compound is not exercised",
      activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );
    emitScale(2.2);
    emitScale(3.6);

    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
    expect(container.querySelector('[data-testid="lightbox-reset-chip"]')).not.toBeNull();
  });
});
