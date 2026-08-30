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
    // Task 5 moved this outcome, and the move is ratified in spec §3.1. A slide
    // that CANNOT demote no longer falls to the inert placeholder: it is offered
    // the retry, at full size, because there is no smaller tier to retreat to and
    // a dead end is the thing this arc removes. The zoom wrapper still unmounts,
    // which is the claim above and is unchanged.
    expect(
      container.textContent,
      "the failed slide offers its next step instead of a dead end",
    ).toContain("Tap to retry");
    expect(
      container.textContent,
      "and the inert parse-time placeholder is NOT what a runtime failure shows",
    ).not.toContain("Image unavailable");
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
    // Task 5 moved this outcome, and the move is ratified in spec §3.1. A slide
    // that CANNOT demote no longer falls to the inert placeholder: it is offered
    // the retry, at full size, because there is no smaller tier to retreat to and
    // a dead end is the thing this arc removes. The zoom wrapper still unmounts,
    // which is the claim above and is unchanged.
    expect(
      container.textContent,
      "the failed slide offers its next step instead of a dead end",
    ).toContain("Tap to retry");
    expect(
      container.textContent,
      "and the inert parse-time placeholder is NOT what a runtime failure shows",
    ).not.toContain("Image unavailable");
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
    // Task 5 moved this outcome, and the move is ratified in spec §3.1. A slide
    // that CANNOT demote no longer falls to the inert placeholder: it is offered
    // the retry, at full size, because there is no smaller tier to retreat to and
    // a dead end is the thing this arc removes. The zoom wrapper still unmounts,
    // which is the claim above and is unchanged.
    expect(
      container.textContent,
      "the failed slide offers its next step instead of a dead end",
    ).toContain("Tap to retry");
    expect(
      container.textContent,
      "and the inert parse-time placeholder is NOT what a runtime failure shows",
    ).not.toContain("Image unavailable");
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
    // Task 5 moved this outcome, and the move is ratified in spec §3.1. A slide
    // that CANNOT demote no longer falls to the inert placeholder: it is offered
    // the retry, at full size, because there is no smaller tier to retreat to and
    // a dead end is the thing this arc removes. The zoom wrapper still unmounts,
    // which is the claim above and is unchanged.
    expect(
      container.textContent,
      "the failed slide offers its next step instead of a dead end",
    ).toContain("Tap to retry");
    expect(
      container.textContent,
      "and the inert parse-time placeholder is NOT what a runtime failure shows",
    ).not.toContain("Image unavailable");
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

  test("the Reset chip does not survive the slide going unavailable", () => {
    // Plan review R5, repaired here. `activeScale` was marked `swept: true` in
    // the per-item registry while this chip's render condition tested only
    // `zoomed`. The sweep cleared the ref; the PREDICATE was never gated. A
    // zoomed slide going unavailable therefore rendered the enabled Reset
    // button with `controlsSlotRef` already null -- a visible control whose
    // action cannot fire, which is the same shape review R3 found on this
    // component and the defect this arc exists to remove.
    //
    // The reviewer's executed probe observed `{available:false, activeScale:2,
    // resetVisible:true}` before cleanup. This case is that probe, made
    // permanent.
    const fixture = item(1);
    const view = open([fixture, item(2)]);
    emitScale(2);

    // PREMISE, not decoration: absence below is only evidence if the chip can
    // be present at all in this harness. Without this the case would pass
    // against a component that never renders the chip.
    premiseHolds(
      "the chip is rendered while zoomed AND available, so its later absence discriminates",
      view.container.querySelector('[data-testid="lightbox-reset-chip"]') !== null,
    );

    view.rerender(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
        startIndex={0}
        onClose={() => {}}
        onAnnounce={() => {}}
      />,
    );

    expect(
      view.container.querySelector('[data-testid="lightbox-reset-chip"]'),
      "an unavailable slide renders no Reset control, because its action cannot fire",
    ).toBeNull();
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
      // Task 5 moved the destination of a non-demotable failure from the inert
      // placeholder to the retry offer (§3.1). The premise still asks the same
      // question -- did this failure land on the NON-demote branch -- but reads
      // the branch that now exists.
      "the slide really reached the non-demote branch",
      placeholder.container.textContent?.includes("Tap to retry") === true,
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
        // §3.1 again: a demoted slide whose clamped tier then fails has nothing
        // left to demote to, so it lands on the retry offer rather than the inert
        // placeholder. The claim under test is unchanged -- the chip clears.
        "the second failure really reached the non-demote branch",
        container.textContent?.includes("Tap to retry") === true,
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
        // Same §3.1 move as above: the non-demote branch is now the retry offer.
        "the slide really reached the non-demote branch",
        container.textContent?.includes("Tap to retry") === true,
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

/**
 * Task 5 — the ACTIVE slide's retry, and the tier it must not request
 * (spec 2026-08-29-diagram-failure-retry; AC-3, AC-4, AC-6, AC-8, AC-9, AC-13, AC-17).
 *
 * The gallery's mechanism does not reach here: Task 2 is gallery-only by design,
 * so every criterion below was unowned for this surface until now.
 *
 * The tier cases are why these live in THIS file. AC-9's claim is about the URL a
 * retry requests after a zoom has already set `wantsOriginal`, and only this
 * harness can drive a real gesture through the component's own wiring and read
 * the loader's output back.
 */
describe("GalleryLightbox — the active slide can be retried (Task 5)", () => {
  function failActive(container: HTMLElement): void {
    const img = activeImage(container);
    act(() => {
      fireEvent.error(img);
    });
  }

  /**
   * A successful load, driven through next/image's OWN path.
   *
   * next/image does not use the img's `onLoad` attribute: it installs a ref
   * handler and routes through `handleLoading`, which calls `img.decode()` and
   * resolves the caller's `onLoad` inside a `.then()`
   * (next/dist/client/image-component.js:30, :51). A synchronous `act()` returns
   * before the component has seen the load, so every assertion about the settled
   * state would read the in-flight state instead.
   */
  async function loadActive(container: HTMLElement): Promise<void> {
    const img = activeImage(container);
    await act(async () => {
      fireEvent.load(img);
      await Promise.resolve();
    });
  }

  function retryControl(container: HTMLElement): HTMLElement {
    const el = container.querySelector('[data-testid="lightbox-retry"]');
    premiseHolds("the active slide offers a retry control", el !== null);
    return el as HTMLElement;
  }

  test("AC-17: a failed active slide offers a retry, with the slide's own copy", () => {
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    failActive(container);

    const control = retryControl(container);
    expect(container.textContent, "the slide is full width, so it says what happened").toContain(
      "Could not be loaded.",
    );
    expect(control.textContent).toContain("Tap to retry");
    expect(control.getAttribute("aria-label")).toBe(
      `${fixture.alt} could not be loaded. Tap to retry.`,
    );
  });

  test("AC-5: `Full size.` appears ONLY for an entry with no smaller tier", () => {
    // The honesty line, and the discriminator is the pair: a laddered entry must
    // NOT carry it, or the assertion would pass on a component that always shows it.
    const laddered = open([item(1), item(2)]);
    failActive(laddered.container);
    // Scoped to the SLIDE, not the button: §5.1 specifies `Full size.` as its own
    // line beside the control, not as part of the action's label.
    premiseHolds(
      "the laddered slide really offered a retry",
      retryControl(laddered.container) !== null,
    );
    expect(
      laddered.container.textContent,
      "a laddered retry fetches the clamped tier, so there is no full-size claim to make",
    ).not.toContain("Full size.");
    cleanup();

    const originalsOnly = open([item(1, { variants: [] }), item(2)]);
    failActive(originalsOnly.container);
    premiseHolds(
      "the originals-only slide really offered a retry",
      retryControl(originalsOnly.container) !== null,
    );
    expect(
      originalsOnly.container.textContent,
      "an originals-only retry IS the whole object, and says so",
    ).toContain("Full size.");
  });

  test("AC-4: the in-flight control is busy and aria-disabled, never natively disabled", () => {
    const { container } = open([item(1), item(2)]);
    failActive(container);
    act(() => {
      fireEvent.click(retryControl(container));
    });

    const busy = container.querySelector('[data-testid="lightbox-retrying"]') as HTMLElement | null;
    premiseHolds("the slide entered the in-flight state", busy !== null);
    expect(busy!.textContent).toContain("Retrying…");
    expect(busy!.getAttribute("aria-busy")).toBe("true");
    expect(busy!.getAttribute("aria-disabled")).toBe("true");
    // A natively disabled control leaves the tab order and drops focus to
    // `<body>` -- OUTSIDE an aria-modal dialog, where the keymap gate stops
    // responding. That is the §7.1 defect, and it is worse inside the dialog.
    expect(busy!.hasAttribute("disabled")).toBe(false);
  });

  test("AC-3: both outcomes are announced by name on the dialog's channel", async () => {
    const fixture = item(1);
    const view = open([fixture, item(2)]);
    failActive(view.container);
    const beforeRetry = view.spoken.length;

    act(() => {
      fireEvent.click(retryControl(view.container));
    });
    await loadActive(view.container);
    expect(view.spoken[view.spoken.length - 1]).toBe(`${fixture.alt} loaded.`);
    const afterSuccess = view.spoken.length;
    expect(afterSuccess, "the success added exactly one message").toBe(beforeRetry + 1);

    failActive(view.container);
    act(() => {
      fireEvent.click(retryControl(view.container));
    });
    act(() => {
      fireEvent.error(activeImage(view.container));
    });
    expect(view.spoken[view.spoken.length - 1]).toBe(`${fixture.alt} still could not be loaded.`);
  });

  test("AC-9: a retry never requests the original, even after a zoom asked for it", () => {
    // The full path the spec names: zoom (so `wantsOriginal` holds the id), the
    // slide fails, then retry. A retry that inherited the zoom's pin would fetch
    // the whole object -- up to 50MB on venue wifi -- for a tap that asked only
    // to see the diagram again.
    // Spec §4.0.2's exact path, and the swipe is load-bearing. Failing while
    // ZOOMED is an original-tier failure with a smaller tier, which correctly
    // DEMOTES and never reaches the retry branch at all (that is AC-8, asserted
    // separately). The hazard §4.0.2 names is subtler: the pin outlives the
    // gesture, so a slide that failed on its CLAMPED tier while inactive comes
    // back active still holding `wantsOriginal`, and a retry there would fetch
    // the whole object for a tap that asked only to see the diagram again.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    emitScale(2);
    premiseHolds(
      "the zoom really pinned the original, or the pin cannot outlive anything",
      activeLoaderUrls(container).has(originalUrlOf(fixture)),
    );

    act(() => emblaApis.at(-1)!.scrollTo(1)); // away: slide 1 renders CLAMPED
    const inactiveImg = [...container.querySelectorAll("img")].find((img) =>
      (img.getAttribute("src") ?? "").includes("embedded-obj-1"),
    );
    premiseHolds("the inactive slide still renders an image to fail", inactiveImg !== undefined);
    act(() => {
      fireEvent.error(inactiveImg as HTMLImageElement);
    });
    act(() => emblaApis.at(-1)!.scrollTo(0)); // back: still holds wantsOriginal

    act(() => {
      fireEvent.click(retryControl(container));
    });

    const urls = activeLoaderUrls(container);
    expect(urls, "the retry asks for the clamped tier").toContain(topTierUrlOf(fixture));
    expect(urls, "and never the original").not.toContain(originalUrlOf(fixture));
  });

  test("AC-13: a re-pinch after a retry can still reach the original", async () => {
    // The half that would silently disappear if entering `retrying` wrote
    // `demotedRef`: the session would refuse to re-pin for the rest of its life
    // and the user could never get full detail back, with nothing saying so.
    // Same §4.0.2 path as AC-9: the retry has to be reached WITHOUT going through
    // the demote branch, or this asserts nothing about `demotedRef`.
    const fixture = item(1);
    const { container } = open([fixture, item(2)]);
    emitScale(2);
    act(() => emblaApis.at(-1)!.scrollTo(1));
    const inactiveImg = [...container.querySelectorAll("img")].find((img) =>
      (img.getAttribute("src") ?? "").includes("embedded-obj-1"),
    );
    premiseHolds("the inactive slide still renders an image to fail", inactiveImg !== undefined);
    act(() => {
      fireEvent.error(inactiveImg as HTMLImageElement);
    });
    act(() => emblaApis.at(-1)!.scrollTo(0));

    act(() => {
      fireEvent.click(retryControl(container));
    });
    await loadActive(container);

    emitScale(2.4);

    expect(
      activeLoaderUrls(container),
      "a fresh gesture still reaches full detail after a retry",
    ).toContain(originalUrlOf(fixture));
  });

  test("AC-8: an original-tier failure with a smaller tier DEMOTES, and offers no retry", () => {
    // The negative. The demote path predates this arc and must not be captured
    // by it: falling back to a cached smaller tier beats a control the user has
    // to tap, when there is something smaller to fall back TO.
    const fixture = item(1);
    const view = open([fixture, item(2)]);
    emitScale(2);
    premiseHolds(
      "the slide is pinned to the original, so its failure is an ORIGINAL-tier failure",
      activeLoaderUrls(view.container).has(originalUrlOf(fixture)),
    );

    failActive(view.container);

    expect(
      view.container.querySelector('[data-testid="lightbox-retry"]'),
      "the demote handled it; no retry control is offered",
    ).toBeNull();
    expect(view.spoken.join(" ")).toContain("less detailed view");
  });
});

/**
 * Task 6 — the leak Task 5 introduced, closed (AC-12, AC-16).
 *
 * Embla renders every slide, so a failed branch shared between the active and
 * inactive ones puts a retry control on each of them. Spec §2 forbids it: an
 * inactive slide's control is invisible, off-screen, and still Tab-reachable
 * inside an `aria-modal` dialog, so a keyboard user tabs into a control for a
 * diagram they cannot see and cannot identify.
 */
describe("GalleryLightbox — only the ACTIVE slide offers a retry (Task 6)", () => {
  test("AC-12: an inactive failed slide renders NO control, and the trap collects none", () => {
    const { container } = open([item(1), item(2)]);

    // Fail slide 2 while it is inactive: Embla has already rendered it.
    const inactive = inactiveImages(container)[0];
    premiseHolds("the inactive slide rendered an image that can fail", inactive !== undefined);
    act(() => {
      fireEvent.error(inactive as HTMLImageElement);
    });

    const figures = [...container.querySelectorAll("figure")];
    const inactiveFigure = figures.find((f) => f.getAttribute("aria-hidden") === "true");
    premiseHolds("an inactive slide is present to inspect", inactiveFigure !== undefined);

    // ABSENCE is the claim, asserted first and on its own terms.
    expect(
      inactiveFigure!.querySelector('[data-testid="lightbox-retry"]'),
      "no retry control on a slide the user cannot see",
    ).toBeNull();

    // The collector is CORROBORATION at the site where the hazard lives, not the
    // claim: a rendered control the collector happened to miss would pass this
    // alone while violating the criterion as written.
    const collected = [
      ...inactiveFigure!.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ];
    expect(collected, "and nothing on it is Tab-reachable inside the dialog").toEqual([]);
  });

  test("AC-12: the ACTIVE slide still offers one, so absence is not vacuous", () => {
    // Without this, the case above passes against a component that renders no
    // control anywhere -- including a Task 5 regression that removed it outright.
    const { container } = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    expect(container.querySelector('[data-testid="lightbox-retry"]')).not.toBeNull();
  });

  test("AC-6: tapping retry keeps focus INSIDE the dialog", () => {
    // Found by the invariant-8 audit, not by me. `focusRetryTargetRef` was
    // written on both transitions and READ BY NOTHING -- a flag that looked like
    // a focus hand-off while doing nothing. The gallery's twin survives its
    // equivalent gap because React reuses the thumbnail's DOM node; here the
    // controls are genuinely different elements, so focus really is lost, and to
    // `<body>` OUTSIDE an aria-modal dialog that is still trapping.
    const { container } = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    const control = container.querySelector('[data-testid="lightbox-retry"]') as HTMLElement;
    premiseHolds("the slide offered a retry to focus", control !== null);
    act(() => control.focus());
    premiseHolds(
      "the control really held focus before the tap",
      document.activeElement === control,
    );

    act(() => {
      fireEvent.click(control);
    });

    const dialog = container.querySelector('[role="dialog"]');
    premiseHolds("the dialog is present to be trapped inside", dialog !== null);
    expect(document.activeElement, "focus never reaches <body>").not.toBe(document.body);
    expect(
      dialog!.contains(document.activeElement),
      "and it stays inside the aria-modal dialog",
    ).toBe(true);
  });

  test("AC-6: a retry that fails again keeps focus inside the dialog too", () => {
    const { container } = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    const control = container.querySelector('[data-testid="lightbox-retry"]') as HTMLElement;
    premiseHolds("the slide offered a retry", control !== null);
    act(() => {
      fireEvent.click(control);
    });
    const overlay = container.querySelector('[data-testid="lightbox-retrying"]') as HTMLElement;
    premiseHolds("the in-flight overlay exists to hold focus", overlay !== null);
    act(() => overlay.focus());

    act(() => {
      fireEvent.error(activeImage(container));
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(document.activeElement, "focus never reaches <body>").not.toBe(document.body);
    expect(dialog!.contains(document.activeElement), "still inside the dialog").toBe(true);
  });

  test("a retry resolving for a SWIPED-AWAY slide does not announce", () => {
    // Found by the invariant-8 audit. `available` includes `isRetrying` without
    // `isActive`, so swiping away leaves the retried image mounted and its
    // handlers live. The outcome then announces by name for a diagram that is no
    // longer on screen, competing with the page-indicator announcement the swipe
    // itself produces. The user hears about something they are not looking at.
    const view = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(view.container));
    });
    const control = view.container.querySelector('[data-testid="lightbox-retry"]') as HTMLElement;
    premiseHolds("the slide offered a retry", control !== null);
    act(() => {
      fireEvent.click(control);
    });

    act(() => emblaApis.at(-1)!.scrollTo(1));
    const spokenBefore = view.spoken.length;

    // REWRITTEN BY R1 FINDING 2, and the rewrite is the point rather than an
    // accommodation. This case used to keep its own premise alive: `available`
    // included `isRetrying` without `isActive`, so the swiped-away image stayed
    // mounted with live handlers and the contract worth testing was "they fire
    // but stay quiet". Review found that leaving the retry in flight was itself
    // the defect -- swiping back resurrected `Retrying…` for a request nobody
    // awaited. Ending the retry on the swipe makes the old scenario unreachable
    // BY CONSTRUCTION, which the premise correctly refused to pretend otherwise
    // about rather than passing vacuously.
    //
    // So the assertion moves up to the stronger guarantee that now ships: there
    // is no abandoned handler to stay quiet, because there is no abandoned
    // retry. The original concern is kept as the second assertion, not dropped.
    const stale = [...view.container.querySelectorAll("img")].find((img) =>
      (img.getAttribute("src") ?? "").includes("embedded-obj-1"),
    );
    expect(
      stale,
      "the swiped-away slide's retry ENDED, so no abandoned image remains to announce",
    ).toBeUndefined();
    expect(view.spoken.length, "and nothing was announced for the off-screen slide").toBe(
      spokenBefore,
    );
  });

  test("AC-16: swiping away mid-retry strands no `Retrying…`, and focus reaches Close", () => {
    const { container } = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    const control = container.querySelector('[data-testid="lightbox-retry"]') as HTMLElement;
    premiseHolds("the active slide offered a retry to start", control !== null);
    act(() => control.focus());
    act(() => {
      fireEvent.click(control);
    });
    premiseHolds(
      "the slide really entered the in-flight state before the swipe",
      container.querySelector('[data-testid="lightbox-retrying"]') !== null,
    );

    act(() => emblaApis.at(-1)!.scrollTo(1));

    const figures = [...container.querySelectorAll("figure")];
    const nowInactive = figures.find((f) => f.getAttribute("aria-hidden") === "true");
    premiseHolds("the retried slide is the inactive one now", nowInactive !== undefined);
    expect(
      nowInactive!.querySelector('[data-testid="lightbox-retrying"]'),
      "no stranded Retrying… on a slide that swiped away",
    ).toBeNull();
    expect(
      document.activeElement,
      "focus never falls out of the dialog when the control it held goes away",
    ).not.toBe(document.body);
  });
});

/**
 * Task 7 — the lightbox's availability sweep (AC-11, AC-14, AC-18).
 *
 * Here rather than in gallery.availabilitySweep.test.tsx because these members
 * are only observable through the zoom harness: the claim is about the URL a
 * returning slide REQUESTS, which needs a real gesture driven through the
 * component's own wiring.
 */
describe("GalleryLightbox — session state does not outlive availability (Task 7)", () => {
  test("AC-18: a zoomed slide that goes unavailable and returns does NOT request the original", () => {
    // The bug plan review R2 surfaced, and it is a real one rather than a docs
    // gap. `wantsOriginal` had no availability clear path, so the returning
    // ACTIVE slide re-requested the whole object immediately -- no gesture, no
    // tap, up to 50MB on venue wifi for a diagram the user never asked to zoom
    // again.
    const fixture = item(1);
    const view = open([fixture, item(2)]);
    emitScale(2);
    premiseHolds(
      "the zoom really pinned the original, or there is no stale pin to carry",
      activeLoaderUrls(view.container).has(originalUrlOf(fixture)),
    );

    view.rerender(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
        startIndex={0}
        onClose={() => {}}
        onAnnounce={() => {}}
      />,
    );
    view.rerender(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[fixture, item(2)]}
        startIndex={0}
        onClose={() => {}}
        onAnnounce={() => {}}
      />,
    );

    // The REQUESTED tier, not merely that something rendered: a slide showing an
    // image is exactly what the bug looked like.
    const urls = activeLoaderUrls(view.container);
    expect(urls, "the returning slide opens on the clamped tier, as a fresh open would").toContain(
      topTierUrlOf(fixture),
    );
    expect(urls, "and the pin from its earlier life is gone").not.toContain(originalUrlOf(fixture));
  });

  test("AC-14: the demote chip never paints over an unavailable slide", () => {
    // Same selector the demote suite uses; that one is scoped to its own block.
    const CHIP = '[data-testid="lightbox-demote-chip"]';
    // Two mechanisms, deliberately: the PREDICATE fixes the frame and the sweep
    // fixes the timer. Without the predicate the chip survives until its timeout
    // expires, sitting over a placeholder for a diagram that is gone.
    const fixture = item(1);
    const view = open([fixture, item(2)]);
    emitScale(2);
    act(() => {
      fireEvent.error(activeImage(view.container));
    });
    premiseHolds(
      "the demote really happened, or there is no chip to be wrong about",
      view.container.querySelector(CHIP) !== null,
    );

    view.rerender(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={[item(1, { available: false }), item(2)]}
        startIndex={0}
        onClose={() => {}}
        onAnnounce={() => {}}
      />,
    );

    expect(
      view.container.querySelector(CHIP),
      "no chip over a slide whose diagram is no longer there",
    ).toBeNull();
  });
});

/**
 * Whole-diff review R1 findings 1-3, all three on the lightbox.
 *
 * The common defect in the arc's own coverage: every existing case observed the
 * state at the moment it changed, and none made the ROUND TRIP. AC-16 checked
 * the immediately-inactive figure and never came back to the slide; the sweep
 * cases checked the unavailable frame and never restored the item. A defect
 * that only shows on return is invisible to a test that never returns.
 */
describe("R1: control removal, abandoned retries, and the sweep's full member set", () => {
  test("finding 1: a SUCCESSFUL lightbox retry keeps focus inside the dialog", async () => {
    const { container } = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    const control = container.querySelector('[data-testid="lightbox-retry"]') as HTMLElement;
    premiseHolds("the slide offered a retry", control !== null);
    act(() => {
      fireEvent.click(control);
    });
    const overlay = container.querySelector('[data-testid="lightbox-retrying"]') as HTMLElement;
    premiseHolds("the in-flight overlay exists to hold focus", overlay !== null);
    act(() => overlay.focus());
    premiseHolds("the overlay really held focus", document.activeElement === overlay);

    await act(async () => {
      fireEvent.load(activeImage(container));
      await Promise.resolve();
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(document.activeElement, "focus never falls to <body>").not.toBe(document.body);
    expect(
      dialog!.contains(document.activeElement),
      "and it stays inside the aria-modal dialog",
    ).toBe(true);
  });

  test("finding 2: swiping away ENDS the retry, so swiping back shows no Retrying", () => {
    const { container } = open([item(1), item(2)]);
    act(() => {
      fireEvent.error(activeImage(container));
    });
    const control = container.querySelector('[data-testid="lightbox-retry"]') as HTMLElement;
    premiseHolds("the slide offered a retry", control !== null);
    act(() => {
      fireEvent.click(control);
    });
    premiseHolds(
      "the retry is genuinely in flight before we leave",
      container.querySelector('[data-testid="lightbox-retrying"]') !== null,
    );

    // Leave the slide, then COME BACK. The return is the half the arc's own
    // AC-16 case never made.
    act(() => emblaApis.at(-1)!.scrollTo(1));
    act(() => emblaApis.at(-1)!.scrollTo(0));

    expect(
      container.querySelector('[data-testid="lightbox-retrying"]'),
      "the abandoned request does not resurrect its in-flight overlay",
    ).toBeNull();
  });
});

/**
 * R1 finding 3: the sweep does not clear every member whose registry row says
 * `swept: true`.
 *
 * The registry justified `activeScale` and `requestedScaleRef` with "the
 * active-slide ERROR path already resets it". True, and beside the point: going
 * UNAVAILABLE is a different path, and it is the one the sweep exists for. The
 * chain runs further -- `controlsSlotRef` is registered `swept: false` on the
 * reasoning that "the chip that would strand is hidden by sweeping activeScale
 * instead", so a false claim about activeScale made a second row's reason false
 * too.
 */
describe("R1 finding 3: the availability sweep clears what its registry rows claim", () => {
  test("a zoomed item that leaves and RETURNS is no longer zoomed", () => {
    const items = [item(1), item(2)];
    const view = open(items);
    emitScale(2);
    premiseHolds(
      "the item is genuinely zoomed before it goes away",
      view.container.querySelector('[data-testid="lightbox-reset-chip"]') !== null,
    );

    const rerenderWith = (next: GalleryItem[]) =>
      view.rerender(
        <GalleryLightbox
          showId={SHOW_ID}
          snapshotRevisionId={REV}
          items={next}
          startIndex={0}
          onClose={() => {}}
          onAnnounce={() => {}}
        />,
      );

    rerenderWith([item(1, { available: false }), item(2)]);
    rerenderWith(items); // ...and back, which is the half nothing tested.

    expect(
      view.container.querySelector('[data-testid="lightbox-reset-chip"]'),
      "the returning item does not carry its previous life's zoom",
    ).toBeNull();
  });
});
