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

import { DEMOTE_CHIP_VISIBLE_MS, GalleryLightbox } from "@/components/diagrams/GalleryLightbox";
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

/**
 * Renders the lightbox and CAPTURES its outbound announcements.
 *
 * `spoken` is the only end of the failure channel this suite can observe. The
 * rendered `lightbox-announce-log` region is fed by the `announceEntries` prop
 * (GalleryLightbox.tsx:588-592), which the Gallery owns and this helper does
 * not pass — so that region is structurally EMPTY here no matter what happens,
 * and any assertion scoped to it passes for the wrong reason. The lightbox's
 * half of the contract is the outbound `onAnnounce` call; `gallery.failedItem.
 * test.tsx` asserts the rendered end.
 */
function open(items: GalleryItem[], startIndex = 0) {
  const spoken: string[] = [];
  const view = render(
    <GalleryLightbox
      showId={SHOW_ID}
      snapshotRevisionId={REV}
      items={items}
      startIndex={startIndex}
      onClose={() => {}}
      onAnnounce={(message) => spoken.push(message)}
    />,
  );
  return { ...view, spoken };
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
  premise(
    "the mocked library had a live transform subscriber to publish to",
    lib.listeners.length,
    0,
  );
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
      container
        .querySelector('[data-testid="diagrams-lightbox"]')!
        .contains(document.activeElement),
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

describe("GalleryLightbox — a failed ORIGINAL demotes instead of destroying the view", () => {
  // The zoom gate creates a failure mode that did not exist before it: the
  // original is now fetched BECAUSE the user pinched, so on venue wifi their own
  // gesture can turn a painted, readable 1024px view into "Image unavailable".
  // Impeccable critique P0 (2026-08-11). The repair is the project's preferred
  // shape for this class: demote conservatively and surface a signal, never
  // silently discard working output.
  test("a zoom-triggered original failure keeps the image and falls back to the clamped tier", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    emitScale(2.4);
    premiseHolds(
      "the gesture pinned the original, so the failure under test is the zoom-triggered one",
      activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    act(() => {
      fireEvent.error(activeImage(container));
    });

    // Still an image, NOT the unavailable placeholder.
    expect(container.querySelector('[data-testid="rzpp-component"]')).not.toBeNull();
    expect(activeLoaderUrls(container)).toEqual(new Set([topTierUrlOf(fixture)]));
  });

  test("the demote is announced through the dialog channel, in plain language", () => {
    // The channel's STATE lives in the Gallery (it must stay appendable while
    // this dialog is mid-exit), so the lightbox's half of the contract is the
    // outbound call. `gallery.failedItem.test.tsx` asserts the rendered end.
    const spoken: string[] = [];
    const fixture = item(1);
    const { container } = render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[fixture, item(2)]}
        startIndex={0}
        onClose={() => {}}
        onAnnounce={(message) => spoken.push(message)}
      />,
    );
    premiseHolds("nothing is announced before the failure", spoken.length === 0);
    emitScale(2.4);

    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(spoken).toEqual([
      `${fixture.alt}: full detail could not be loaded. Showing a less detailed view.`,
    ]);
    // No error code, no jargon (project invariant 5).
    expect(spoken[0]).not.toMatch(/[0-9]{3}|error|failed to fetch/i);
  });

  test("a demoted slide is NEVER re-pinned, however much the user keeps zooming", () => {
    // Without this the demote is a fetch loop: the library keeps publishing a
    // scale above the commitment bound, intent re-fires, the original 404s
    // again, and the slide flickers for as long as the gesture lasts.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    emitScale(2.4);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    premiseHolds(
      "the slide really demoted before the re-zoom under test",
      !activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    emitScale(3.2);
    emitScale(3.9);

    expect(activeLoaderUrls(container)).toEqual(new Set([topTierUrlOf(fixture)]));
  });

  test("a slide that never painted demotes too — the clamped tier is a different object", () => {
    // The condition is the requested TIER, not a painted bitmap. A user who
    // pinches the instant the lightbox opens has nothing on screen yet, and
    // retrying at a tier two orders of magnitude smaller beats a placeholder.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    emitScale(2.4);

    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(container.querySelector('[data-testid="rzpp-component"]')).not.toBeNull();
    expect(activeLoaderUrls(container)).toEqual(new Set([topTierUrlOf(fixture)]));
  });

  test.each([
    ["an empty ladder", [] as GalleryItem["variants"]],
    ["a wholly malformed ladder", [{ width: -1, key: "" }] as GalleryItem["variants"]],
  ])("%s CANNOT demote — there is no lower tier to fall back to", (_label, variants) => {
    // `wantsOriginal` says the user asked for the original; it does NOT say a
    // clamped tier exists to retreat to. For an originals-only entry — old
    // manifests, GIFs, generation failures, a ladder whose every row the §4
    // guards reject — both loader states resolve to the SAME url, so demoting
    // would announce a fallback that cannot happen and then leave the broken
    // image on screen instead of the unavailable placeholder.
    const fixture = item(1, { variants });
    const { container, spoken } = open([fixture, item(2)]);
    premiseHolds(
      "both states resolve to the original, which is what makes the demote a no-op here",
      activeLoaderUrls(container).size === 1 &&
        activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    emitScale(2.4);
    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(container.textContent).toContain("Image unavailable");
    // WHICH announcement fires is the point. The placeholder speaks — silence
    // would strand a screen-reader user watching a slide that simply stopped —
    // but it must speak the FAILURE, not the demote: there was no fallback, so
    // promising "a less detailed view" would describe something not on screen.
    // Asserted on the outbound channel, the only end that can speak here (see
    // `open`); the earlier form scanned the always-empty rendered region and so
    // could not tell these two messages apart, or notice either.
    expect(spoken).toEqual([`${fixture.alt} could not be loaded.`]);
    expect(spoken[0]).not.toContain("less detailed view");
  });

  test("a ladder whose only row IS the original cannot demote either", () => {
    // A valid-looking row can still name the ORIGINAL key. It passes every §4
    // guard, so a predicate that only asks "are there usable rows?" says yes —
    // while both loader states resolve to the same URL and there is nothing to
    // fall back to. The question is whether a LOWER tier exists, which cannot be
    // answered without the original key.
    const fixture = item(1, { variants: [{ width: 256, key: "embedded-obj-1.png" }] });
    const { container, spoken } = open([fixture, item(2)]);
    premiseHolds(
      "the row is well-formed enough to survive the loader's own guards",
      fixture.variants.length === 1 && fixture.variants[0]!.key === fixture.key,
    );
    premiseHolds(
      "both states resolve to the original, which is what makes the demote a no-op here",
      activeLoaderUrls(container).size === 1 &&
        activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    emitScale(2.4);
    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(container.textContent).toContain("Image unavailable");
    // Same discrimination as the ladder cases above: it speaks the FAILURE, and
    // must not promise a fallback that this ladder cannot supply.
    expect(spoken).toEqual([`${fixture.alt} could not be loaded.`]);
    expect(spoken[0]).not.toContain("less detailed view");
  });

  test("a MIXED ladder — one real variant, one row naming the original — still gates and still demotes", () => {
    // The dangerous shape sits between the two rows above: a ladder that is
    // neither originals-only nor wholly distinct. `hasVariantTier` used to ask
    // whether SOME row differed from the original, which this satisfies, while
    // clamping still SELECTED the 1024 row — the original — for every candidate
    // width at or above 512. The unzoomed slide therefore fetched the original
    // the gate exists to withhold, and a failure demoted, announced, and then
    // resolved straight back to the same broken URL.
    const key = "embedded-obj-1.png";
    const fixture = item(1, {
      variants: [
        { width: 256, key: `${key}@256.webp` },
        { width: 1024, key },
      ],
    });
    const { container, spoken } = open([fixture, item(2)]);
    premiseHolds(
      "the fixture is genuinely mixed: one row names the original, one does not",
      fixture.variants.some((v) => v.key === fixture.key) &&
        fixture.variants.some((v) => v.key !== fixture.key),
    );

    // The gate: no candidate the unzoomed slide offers is the original.
    expect(activeLoaderUrls(container)).toEqual(new Set([assetUrl(`${key}@256.webp`)]));
    expect(activeLoaderUrls(container).has(originalUrlOf(fixture))).toBe(false);

    // The demote: it retreats to a URL that is genuinely different from the one
    // that just failed, so the announcement describes something that happened.
    emitScale(2.4);
    expect(activeLoaderUrls(container)).toEqual(new Set([originalUrlOf(fixture)]));
    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(container.querySelector('[data-testid="rzpp-component"]')).not.toBeNull();
    expect(activeLoaderUrls(container)).toEqual(new Set([assetUrl(`${key}@256.webp`)]));
    expect(container.textContent).not.toContain("Image unavailable");
    expect(spoken).toEqual([
      `${fixture.alt}: full detail could not be loaded. Showing a less detailed view.`,
    ]);
  });

  test("a SECOND failure after the demote does reach the placeholder", () => {
    // One fallback, not an endless one: once the clamped tier has failed too,
    // there is nothing left to serve and the placeholder is the honest answer.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    emitScale(2.4);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    premiseHolds(
      "the slide survived the first failure, or the second one proves nothing",
      container.querySelector('[data-testid="rzpp-component"]') !== null,
    );

    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(container.textContent).toContain("Image unavailable");
  });

  test("a failure with NO zoom intent still falls back to the placeholder even after painting", () => {
    // Demotion is specific to the tier the gesture asked for. A clamped-tier
    // failure has no lower tier to fall back to.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    act(() => {
      fireEvent.load(activeImage(container));
    });

    act(() => {
      fireEvent.error(activeImage(container));
    });

    expect(container.querySelector('[data-testid="rzpp-component"]')).toBeNull();
    expect(container.textContent).toContain("Image unavailable");
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

/**
 * The sighted half of the demote signal (spec crew/2026-08-15-diagram-demote-notice-design
 * §2.1-§2.3; AC-1, AC-2, AC-3, AC-4, AC-6).
 *
 * The demote already announces through the dialog's `role="log"` channel. These
 * cases pin the other channel: a transient chip on the affected slide, so a
 * sighted crew member who pinched a stage plot and got a soft image is told why
 * — and told once, in lockstep with the announcement.
 *
 * The lifetime numbers here are SPEC LITERALS, not reads of the implementation:
 * advancing by the exported constant would only prove the timer uses its own
 * value. The constant is asserted to equal 6000 separately, so the constant,
 * the DESIGN.md §5.5 row and this file cannot drift apart quietly.
 */
describe("GalleryLightbox — the demote's sighted chip", () => {
  const CHIP = '[data-testid="lightbox-demote-chip"]';
  const COPY = "Full detail unavailable";

  /** Drive the :503 demote scenario and hand back the container. */
  function demote(fixtureCount = 2): { container: HTMLElement; fixture: GalleryItem } {
    const fixture = item(1);
    const items = [fixture, ...Array.from({ length: fixtureCount - 1 }, (_, n) => item(n + 2))];
    const { container } = open(items);
    emitScale(2.4);
    premiseHolds(
      "the gesture pinned the original, so the failure under test is the zoom-triggered one",
      activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );
    act(() => {
      fireEvent.error(activeImage(container));
    });
    return { container, fixture };
  }

  test("renders the chip on the affected slide, in lockstep with the announcement (AC-1)", () => {
    const fixture = item(1);
    const spoken: string[] = [];
    const { container } = render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[fixture, item(2)]}
        startIndex={0}
        onClose={() => {}}
        onAnnounce={(message) => spoken.push(message)}
      />,
    );
    emitScale(2.4);
    premiseHolds("no chip before the failure", container.querySelector(CHIP) === null);

    act(() => {
      fireEvent.error(activeImage(container));
    });

    const chip = container.querySelector(CHIP);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe(COPY);
    expect(chip!.getAttribute("aria-hidden")).toBe("true");
    expect(chip!.className).toContain("pointer-events-none");
    // CONTAINMENT: the chip belongs to the affected slide's figure, not to the
    // viewport container — anchoring at the viewport would pin it in place while
    // the slide it describes swipes away underneath it.
    const figure = chip!.closest("figure");
    expect(figure).not.toBeNull();
    expect(figure!.contains(activeImage(container))).toBe(true);
    // ONE event, two channels: the announcement is unchanged by the chip.
    expect(spoken).toEqual([
      `${fixture.alt}: full detail could not be loaded. Showing a less detailed view.`,
    ]);
  });

  test("clears itself after the ratified lifetime, and not before (AC-2)", () => {
    vi.useFakeTimers();
    try {
      const { container } = demote();
      expect(container.querySelector(CHIP)).not.toBeNull();

      // 5999 and 1 are spec §2.1 literals. A test that advanced by the exported
      // constant would agree with any value the implementation happened to use.
      act(() => {
        vi.advanceTimersByTime(5999);
      });
      expect(container.querySelector(CHIP), "still visible at 5999ms").not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(container.querySelector(CHIP), "gone at 6000ms").toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("the exported constant is the ratified value (AC-2, drift guard)", () => {
    expect(DEMOTE_CHIP_VISIBLE_MS).toBe(6000);
  });

  test("cancels its timer on unmount, leaving no pending work (AC-2)", () => {
    vi.useFakeTimers();
    try {
      // The baseline is taken AFTER the mount, not before: the lightbox schedules
      // timers of its own (the de-zoom settle, Embla), and a whole-count oracle
      // would measure those instead of the chip's.
      const fixture = item(1);
      const { container } = open([fixture, item(2)]);
      emitScale(2.4);
      const mounted = vi.getTimerCount();
      act(() => {
        fireEvent.error(activeImage(container));
      });
      premiseHolds("the chip scheduled its own timer", vi.getTimerCount() === mounted + 1);
      expect(container.querySelector(CHIP)).not.toBeNull();

      const withChip = vi.getTimerCount();
      cleanup();

      // WHAT THIS CAN AND CANNOT SETTLE. It pins that unmounting releases at
      // least what the chip added — a real regression if a future change parks
      // the chip's timer somewhere teardown does not reach. It does NOT prove
      // the unmount-cleanup effect is what releases it: probed by deleting that
      // effect, and this case stays green, because the teardown path drops the
      // pending timer here regardless. The effect stays as a defensive backstop
      // and the surviving mutant is recorded as an accepted gap in the unit's
      // closeout rather than papered over with an oracle that cannot see it.
      // The clears that DO discriminate are the close path and both
      // second-failure branches, each killed by its own mutation probe.
      expect(vi.getTimerCount(), "unmount released the chip's own timer").toBeLessThanOrEqual(
        withChip - 1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("no chip without a demote: a healthy original, and a fresh clamped-tier failure (AC-3)", () => {
    const healthy = open([item(1), item(2)]);
    emitScale(2.4);
    act(() => {
      fireEvent.load(activeImage(healthy.container));
    });
    expect(healthy.container.querySelector(CHIP)).toBeNull();
    cleanup();

    // The placeholder path, which is NOT a demote: no zoom intent, so there is
    // no lower tier to fall back to and nothing to explain.
    const placeholder = open([item(1), item(2)]);
    act(() => {
      fireEvent.load(activeImage(placeholder.container));
    });
    act(() => {
      fireEvent.error(activeImage(placeholder.container));
    });
    premiseHolds(
      "the slide really reached the placeholder",
      placeholder.container.textContent?.includes("Image unavailable") === true,
    );
    expect(placeholder.container.querySelector(CHIP)).toBeNull();
  });

  test("stays out of the accessibility tree and leaves the focus order alone (AC-4)", () => {
    const { container } = demote();
    const chip = container.querySelector(CHIP)!;
    expect(chip.getAttribute("aria-hidden")).toBe("true");
    // Not focusable: no tabindex, not a button, and pointer-transparent.
    expect(chip.getAttribute("tabindex")).toBeNull();
    expect(chip.tagName).not.toBe("BUTTON");
    expect(chip.querySelector("button, a, input, [tabindex]")).toBeNull();
    // The dialog's own tab order is untouched — the same focusables, in order.
    const focusables = [...container.querySelectorAll<HTMLElement>("button, [href], [tabindex]")];
    expect(focusables.some((el) => chip.contains(el))).toBe(false);
  });

  test("a second demote replaces the chip and RESTARTS the window (AC-2, last-wins)", () => {
    vi.useFakeTimers();
    try {
      const first = item(1);
      const second = item(2);
      const { container } = open([first, second]);
      emitScale(2.4);
      act(() => {
        fireEvent.error(activeImage(container));
      });
      premiseHolds("the first demote showed a chip", container.querySelector(CHIP) !== null);

      // Halfway through the first chip's window, demote the OTHER slide.
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      act(() => emblaApis.at(-1)!.scrollTo(1));
      emitScale(2.4);
      act(() => {
        fireEvent.error(activeImage(container));
      });

      // Exactly one chip, on the slide that just failed.
      const chips = container.querySelectorAll(CHIP);
      expect(chips.length).toBe(1);
      expect(chips[0]!.closest("figure")!.contains(activeImage(container))).toBe(true);

      // The window RESTARTED: a timer left running from the first demote would
      // have expired 2999ms into this advance.
      act(() => {
        vi.advanceTimersByTime(5999);
      });
      expect(
        container.querySelector(CHIP),
        "second chip still inside its own window",
      ).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(container.querySelector(CHIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("clears when the demoted slide's clamped tier ALSO fails (AC-2b, clear 4)", () => {
    vi.useFakeTimers();
    try {
      const fixture = item(1);
      const { container } = open([fixture, item(2)]);
      emitScale(2.4);
      const mounted = vi.getTimerCount();
      act(() => {
        fireEvent.error(activeImage(container));
      });
      premiseHolds("the demote showed a chip", container.querySelector(CHIP) !== null);
      premiseHolds("the chip scheduled its own timer", vi.getTimerCount() === mounted + 1);

      act(() => {
        fireEvent.error(activeImage(container));
      });

      // "Full detail unavailable" floating over "Image unavailable" is a
      // contradiction: the chip's premise died with the clamped tier.
      premiseHolds(
        "the second failure really reached the placeholder",
        container.textContent?.includes("Image unavailable") === true,
      );
      expect(container.querySelector(CHIP)).toBeNull();
      expect(
        vi.getTimerCount(),
        "the chip timer was cancelled, not left running",
      ).toBeLessThanOrEqual(mounted);
    } finally {
      vi.useRealTimers();
    }
  });

  test("clears when the demoted slide's clamped tier fails while it is INACTIVE", () => {
    // The second route into clear-4, and the one the active-branch handler cannot
    // see: Embla keeps every slide mounted, so a demoted slide swiped away can
    // still have its clamped request fail on the inactive branch. The render
    // hides the chip behind `failedKeys` either way — what this pins is that the
    // STATE and its timer go too, so swiping back does not put a chip over the
    // "Image unavailable" placeholder for the rest of the window.
    vi.useFakeTimers();
    try {
      const fixture = item(1);
      const { container } = open([fixture, item(2)]);
      emitScale(2.4);
      const mounted = vi.getTimerCount();
      act(() => {
        fireEvent.error(activeImage(container));
      });
      premiseHolds("the demote showed a chip", container.querySelector(CHIP) !== null);
      premiseHolds("the chip scheduled its own timer", vi.getTimerCount() === mounted + 1);

      act(() => emblaApis.at(-1)!.scrollTo(1));
      const inactive = container.querySelectorAll("figure")[0]!.querySelector("img");
      premiseHolds("the demoted slide rendered an inactive image that can fail", inactive !== null);
      act(() => {
        fireEvent.error(inactive!);
      });

      act(() => emblaApis.at(-1)!.scrollTo(0));
      premiseHolds(
        "the slide really reached the placeholder",
        container.textContent?.includes("Image unavailable") === true,
      );
      expect(container.querySelector(CHIP)).toBeNull();
      expect(
        vi.getTimerCount(),
        "the chip timer was cancelled, not left running",
      ).toBeLessThanOrEqual(mounted);
    } finally {
      vi.useRealTimers();
    }
  });

  test("survives a swipe away and back with its REMAINING lifetime (compound)", () => {
    vi.useFakeTimers();
    try {
      const { container } = demote();
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => emblaApis.at(-1)!.scrollTo(1));
      act(() => emblaApis.at(-1)!.scrollTo(0));

      expect(container.querySelector(CHIP), "the chip travelled with its slide").not.toBeNull();
      // The remainder, not a fresh window: a timer restarted by the swipe would
      // still be showing at 2999ms past this point.
      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(container.querySelector(CHIP)).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(container.querySelector(CHIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("coexists with the Reset chip in a disjoint slot (compound)", () => {
    const { container } = demote();
    // The demote leaves the gesture and the scale alone, so Reset stays mounted.
    const reset = container.querySelector('[data-testid="lightbox-reset-chip"]');
    const chip = container.querySelector(CHIP);
    expect(reset, "the zoom that triggered the demote keeps Reset mounted").not.toBeNull();
    expect(chip).not.toBeNull();
    // Disjoint slots: Reset owns top-2, the notice owns bottom-2.
    expect(reset!.closest("div")!.className).toContain("top-2");
    expect(chip!.className).toContain("bottom-2");
  });

  test("animates through duration TOKENS only, never literal milliseconds (AC-6)", () => {
    const { container } = demote();
    const cls = container.querySelector(CHIP)!.className;
    // The full mechanism, not just the flavour: a duration utility with nothing
    // transitioning animates nothing.
    expect(cls).toContain("transition-opacity");
    expect(cls).toMatch(/\bduration-(fast|normal|slow)\b/);
    expect(cls).not.toMatch(/\d+ms/);
  });
});
