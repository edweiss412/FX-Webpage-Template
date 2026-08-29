// @vitest-environment jsdom
/**
 * tests/components/diagrams/gallery.failedItem.test.tsx
 *
 * Runtime thumbnail failure: focus relocation and announcements (spec
 * 2026-08-10-diagram-viewing-polish §4.2, AC-3).
 *
 * Today a failure swaps the cell's `<button>` for a non-interactive `<div>`;
 * focus, if held, falls to `<body>`, and nothing announces. This suite pins the
 * repair.
 *
 * --------------------------------------------------------------------------
 * Transition Inventory rows covered here (spec §"Transition Inventory",
 * verbatim treatments):
 *
 * | pair | treatment |
 * |---|---|
 * | thumbnail available → failed (had focus) | instant swap + focus relocation + one announcement. No animation (matches existing instant swap). |
 * | thumbnail available → failed (no focus) | instant swap + announcement only. |
 * | thumbnail fails WHILE the lightbox is open | announcement to the lightbox-local region; if the failed thumbnail is the current restore target, `restoreTargetRef` is re-set (closure rule). Instant, no animation. |
 * | thumbnail fails DURING the 220 ms exit window | announcement buffered and flushed to the gallery region on `onExitComplete`; restore-target closure applies via the ref bridge. Instant. |
 *
 * Compound: multiple failures while one announcement is in flight — `role="log"`
 * appends; ratified shape for recurring text.
 * --------------------------------------------------------------------------
 *
 * WHY AnimatePresence IS MOCKED. The exit window is the whole point of two of
 * these rows, and it is a 220 ms interval a real timer would make a race. The
 * mock retains the exiting element in place and exposes an explicit flush, which
 * also reproduces the property the spec's R5 F4 probe measured on the installed
 * Framer Motion 12.38.0: the retained child keeps its OLD props, so a parent
 * state update never reaches it. Each exit-window case asserts that premise
 * before measuring.
 *
 * Anti-tautology posture: every announcement oracle is before/after on the SAME
 * region NODE (a conditionally-mounted or pre-populated region fails the before
 * half), and every focus oracle names the node focus must land on — never merely
 * "not body", which a relocation to the wrong element would satisfy.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";

/** The mocked AnimatePresence's controls, shared with the tests. */
const presence = vi.hoisted(() => ({
  /** Completes the exit: unmounts the retained child and fires onExitComplete. */
  flush: null as null | (() => void),
  /** True while a removed child is still mounted (the 220 ms window). */
  exiting: false,
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MOTION_ONLY = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "variants",
    "layout",
    "layoutId",
    "whileHover",
    "whileTap",
    "whileFocus",
    "whileDrag",
    "drag",
    "onAnimationComplete",
  ]);
  const strip = (props: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_ONLY.has(key)));

  // CACHED per tag. A proxy that built a fresh forwardRef on every access would
  // hand React a new component TYPE on every render, remounting the whole dialog
  // subtree each time — which silently destroys the same-node announcement
  // oracles this file is built on. Real framer-motion caches; so does this.
  const motionCache = new Map<string, unknown>();
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const hit = motionCache.get(tag);
        if (hit) return hit;
        const component = React.forwardRef<unknown, Record<string, unknown>>((props, ref) =>
          React.createElement(tag, { ...strip(props), ref }),
        );
        component.displayName = `motion.${tag}`;
        motionCache.set(tag, component);
        return component;
      },
    },
  );

  function AnimatePresence({
    children,
    onExitComplete,
  }: {
    children?: ReactNode;
    onExitComplete?: () => void;
  }) {
    const lastRef = React.useRef<ReactNode>(null);
    const goneRef = React.useRef(false);
    const [, force] = React.useReducer((n: number) => n + 1, 0);
    const present = children !== null && children !== undefined && children !== false;

    // Decided DURING RENDER, not in an effect. Retaining via effect-driven state
    // leaves one commit where the child is absent, so it unmounts and remounts —
    // a NEW node with FRESH props, which is the opposite of the behavior being
    // modelled and quietly invalidates every same-node oracle downstream.
    if (present) {
      lastRef.current = children;
      goneRef.current = false;
    }

    React.useEffect(() => {
      presence.exiting = !present && !goneRef.current && lastRef.current !== null;
      presence.flush = () => {
        goneRef.current = true;
        lastRef.current = null;
        presence.exiting = false;
        force();
        onExitComplete?.();
      };
    });

    // The RETAINED ELEMENT, rendered in the same position: React keeps the child
    // instance mounted with the props it had when it was removed, which is the
    // prop freeze the spec's probe measured.
    if (present) return children;
    return goneRef.current ? null : lastRef.current;
  }

  return { motion, AnimatePresence };
});

/** The mocked zoom library's scale channel, so a lightbox demote is drivable. */
const zoom = vi.hoisted(() => {
  const listeners: Array<(snap: { state: { scale: number } }) => void> = [];
  return {
    listeners,
    emit(scale: number) {
      for (const cb of [...listeners]) cb({ state: { scale } });
    },
  };
});

// The zoom library is mocked to plain boxes: this file is about focus and
// announcements, not gestures. The one thing it must model is the scale channel,
// because zoom intent is what turns a lightbox image error into a DEMOTE.
vi.mock("react-zoom-pan-pinch", async () => {
  const React = await import("react");
  return {
    TransformWrapper: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", { "data-testid": "rzpp-wrapper" }, children),
    TransformComponent: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", { "data-testid": "rzpp-component" }, children),
    useTransformEffect: (cb: (snap: { state: { scale: number } }) => void) => {
      React.useEffect(() => {
        zoom.listeners.push(cb);
        return () => {
          const i = zoom.listeners.indexOf(cb);
          if (i >= 0) zoom.listeners.splice(i, 1);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
    // The controls PUBLISH through the same scale channel, as the real library
    // does — otherwise a keyboard de-zoom leaves the lifted scale untouched and
    // the chip never unmounts, so the case under test never happens.
    useControls: () => ({
      resetTransform: () => zoom.emit(1),
      centerView: (scale: number) => zoom.emit(scale),
      setTransform: () => {},
      zoomIn: () => {},
      zoomOut: () => {},
    }),
  };
});

/** Every Embla instance this file mounts, newest last — so a SWIPE is drivable. */
const emblaApis: Array<{ scrollTo: (index: number) => void }> = [];

vi.mock("embla-carousel-react", async () => {
  const React = await import("react");
  // `startIndex` is HONOURED. A mock that always starts at 0 desynchronises from
  // the component's own `activeIndex` state, and every bound-related assertion
  // then measures the mock's drift rather than the component.
  function useEmblaCarouselMock(options?: { startIndex?: number }) {
    const listeners = React.useRef(new Map<string, Set<() => void>>());
    const selected = React.useRef(options?.startIndex ?? 0);
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

import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const GALLERY_LOG = "gallery-announce-log";
const LIGHTBOX_LOG = "lightbox-announce-log";

function item(i: number, overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: `embedded:obj-${i}`,
    key: `embedded-obj-${i}.png`,
    alt: `Plot ${i}`,
    available: true,
    variants: [],
    ...overrides,
  };
}

function open(items: GalleryItem[]) {
  return render(<Gallery showId={SHOW_ID} snapshotRevisionId={REV} items={items} />);
}

/** The thumbnail button for a 0-based visible slot. */
function thumbButton(slot: number): HTMLButtonElement {
  return within(screen.getByTestId(`diagram-slot-${slot}`)).getByRole(
    "button",
  ) as HTMLButtonElement;
}

/** The thumbnail image for a 0-based visible slot. */
function thumbImage(slot: number): HTMLImageElement {
  return within(screen.getByTestId(`diagram-slot-${slot}`)).getByRole("img") as HTMLImageElement;
}

/** Announced entries of a region, by its keyed children — never its text blob. */
function entriesOf(region: HTMLElement): string[] {
  return [...region.querySelectorAll("[data-announce-id]")].map((n) => n.textContent ?? "");
}

/** Fail the thumbnail in `slot`, driving the component's own onError handler. */
function failThumb(slot: number): void {
  act(() => {
    fireEvent.error(thumbImage(slot));
  });
}

beforeEach(() => {
  presence.flush = null;
  presence.exiting = false;
  zoom.listeners.length = 0;
  emblaApis.length = 0;
});

afterEach(() => cleanup());

describe("Gallery — the announce regions exist before anything is announced", () => {
  test("the gallery region is mounted, EMPTY, and labelled", () => {
    // Branch-stable and pre-mounted: a region created by the first announcement
    // is a new node, and a new node's addition is not an addition WITHIN a live
    // log — assistive technology may never speak it.
    open([item(1), item(2)]);
    const region = screen.getByTestId(GALLERY_LOG);

    expect(region.getAttribute("role")).toBe("log");
    expect(region.getAttribute("aria-label")).toBe("Diagram updates");
    expect(entriesOf(region)).toEqual([]);
  });

  test("the lightbox region is mounted INSIDE the dialog, empty, and separately labelled", () => {
    // Two regions because the dialog is `aria-modal="true"`: content outside it
    // is excluded from the accessibility tree, so the gallery's own region
    // cannot speak while the lightbox is open.
    open([item(1), item(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });

    const dialog = screen.getByTestId("diagrams-lightbox");
    const region = screen.getByTestId(LIGHTBOX_LOG);
    premiseHolds(
      "the lightbox region is a descendant of the modal dialog",
      dialog.contains(region),
    );

    expect(region.getAttribute("role")).toBe("log");
    expect(region.getAttribute("aria-label")).toBe("Diagram viewer updates");
    expect(entriesOf(region)).toEqual([]);
  });
});

describe("Gallery — browse-state failures announce on the gallery channel (AC-3)", () => {
  test("one failure appends exactly one entry to the SAME region node", () => {
    open([item(1), item(2)]);
    const region = screen.getByTestId(GALLERY_LOG);
    premiseHolds(
      "the region starts empty, or the append proves nothing",
      entriesOf(region).length === 0,
    );

    failThumb(0);

    expect(screen.getByTestId(GALLERY_LOG)).toBe(region); // same node, not re-created
    expect(entriesOf(region)).toEqual(["Plot 1 could not be loaded."]);
    expect(screen.queryByTestId(LIGHTBOX_LOG)).toBeNull();
  });

  test("an entry with no alt is named by its 1-based visible position", () => {
    open([item(1, { alt: "" }), item(2, { alt: "" })]);

    failThumb(1);

    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual(["Diagram 2 could not be loaded."]);
  });

  test("two failures append two entries — identical text is legitimate here", () => {
    open([item(1, { alt: "Stage plot" }), item(2, { alt: "Stage plot" })]);

    failThumb(0);
    failThumb(1);

    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual([
      "Stage plot could not be loaded.",
      "Stage plot could not be loaded.",
    ]);
  });

  test("a repeat onError for an already-failed item announces nothing further", () => {
    open([item(1), item(2)]);
    failThumb(0);
    const after = entriesOf(screen.getByTestId(GALLERY_LOG));
    premise("the first failure announced", after.length, 0);

    // The cell is a non-interactive div now; the only way back in is a stale
    // handler, which the guard below covers. Failing its NEIGHBOUR must not
    // re-announce the first.
    failThumb(1);

    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual([
      "Plot 1 could not be loaded.",
      "Plot 2 could not be loaded.",
    ]);
  });

  test("STALE onError: a handler firing after its item stopped rendering announces NOTHING", () => {
    // 13 items → 12 visible. Expand, capture the 13th slot's image, collapse so
    // the node is detached, then fire its handler. A guard keyed only on
    // `failedKeys` would still announce.
    const many = Array.from({ length: 13 }, (_v, i) => item(i + 1));
    open(many);
    const region = screen.getByTestId(GALLERY_LOG);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show all 13 diagrams/i }));
    });
    // Slot 12 exists only while expanded — collapsing detaches it.
    const staleImage = thumbImage(12);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));
    });
    premiseHolds(
      "the captured node really left the document, or the guard is not exercised",
      !staleImage.isConnected,
    );

    act(() => {
      fireEvent.error(staleImage);
    });

    expect(entriesOf(region)).toEqual([]);
  });
});

describe("Gallery — focus relocation on failure (AC-3)", () => {
  // ── §7.1's focus-destination table, rewritten by Task 4 ──────────────────
  //
  // Every case below used to assert a SIBLING as the destination, because a
  // failed cell had nothing focusable of its own. It does now, and under the
  // ratified §3.1 it has one for EVERY entry -- `variants: []` is an
  // originals-only item, which is offered the retry at full size rather than
  // withheld from. So the destination is the cell's own control, and relocating
  // away from it would move a user off the one element that can fix the problem
  // they were just told about.
  //
  // These are kept and inverted rather than deleted: the diff between the old
  // expectation and the new one is what the row actually changed.
  test("a focused failing thumbnail keeps focus ON ITS OWN retry control", () => {
    open([item(1), item(2), item(3)]);
    const sibling = thumbButton(1);
    act(() => thumbButton(0).focus());
    premiseHolds(
      "the failing thumbnail holds focus before the failure",
      document.activeElement === thumbButton(0),
    );

    failThumb(0);

    const control = screen.getByTestId("diagram-retry-0");
    expect(document.activeElement, "focus lands on the cell's own next step").toBe(control);
    // Named explicitly: the OLD destination must no longer win. Asserting only
    // "focus is on the control" would also pass if the control happened to be
    // the sibling under some future restructure.
    expect(document.activeElement, "and not on the sibling it used to jump to").not.toBe(sibling);
  });

  test("it does NOT jump backwards to a previous thumbnail either", () => {
    open([item(1), item(2), item(3, { available: false })]);
    const previous = thumbButton(0);
    act(() => thumbButton(1).focus());

    failThumb(1);

    expect(document.activeElement).toBe(screen.getByTestId("diagram-retry-1"));
    expect(document.activeElement).not.toBe(previous);
  });

  test("the show-more control is not the destination when the cell has its own", () => {
    // 13 entries, exactly one available: the toggle used to be the only control
    // left. The failed cell now has one, so the toggle is no longer reached.
    const items = [
      item(1),
      ...Array.from({ length: 12 }, (_v, i) => item(i + 2, { available: false })),
    ];
    open(items);
    const toggle = screen.getByRole("button", { name: /show all 13 diagrams/i });
    act(() => thumbButton(0).focus());

    failThumb(0);

    expect(document.activeElement).toBe(screen.getByTestId("diagram-retry-0"));
    expect(document.activeElement).not.toBe(toggle);
  });

  test("the single-item gallery keeps focus in the cell, not on the list", () => {
    // This case used to assert the gallery LIST as a last resort, reached when a
    // lone failing item left nothing focusable. That premise is now unreachable
    // by construction -- a runtime-failed cell always has a control -- so the
    // case is rewritten as the positive claim rather than deleted, which is what
    // makes the unreachability visible instead of silent.
    open([item(1)]);
    const list = screen.getByRole("list", { name: /diagrams gallery thumbnails/i });
    act(() => thumbButton(0).focus());

    failThumb(0);

    expect(document.activeElement).toBe(screen.getByTestId("diagram-retry-0"));
    expect(document.activeElement, "the list fallback is no longer reachable").not.toBe(list);
  });

  test("focus NEVER lands on body in any relocation configuration", () => {
    // The one assertion that is about the failure mode rather than the target.
    open([item(1), item(2)]);
    act(() => thumbButton(0).focus());

    failThumb(0);

    expect(document.activeElement).not.toBe(document.body);
  });

  test("SAME-TICK: focus never relocates onto a sibling that is failing too", () => {
    // `isConnected` reports current attachment, not pending removal. Two images
    // erroring in one tick (one dropped request per tile on venue wifi) would
    // otherwise send focus to a button that unmounts a moment later — landing on
    // `<body>` inside a gallery full of working thumbnails.
    open([item(1), item(2), item(3)]);
    const survivor = thumbButton(2);
    act(() => thumbButton(0).focus());

    const first = thumbImage(0);
    const second = thumbImage(1);
    act(() => {
      // Raw dispatch, not fireEvent: fireEvent wraps each call in its own act,
      // which commits between them and defeats the batching under test.
      first.dispatchEvent(new Event("error"));
      second.dispatchEvent(new Event("error"));
    });
    premiseHolds(
      "both thumbnails really failed, or this is a single-failure case in disguise",
      screen.getByTestId("diagram-slot-0").hasAttribute("data-unavailable") &&
        screen.getByTestId("diagram-slot-1").hasAttribute("data-unavailable"),
    );

    // Task 4 removes the hazard rather than dodging it. The old destination was a
    // SIBLING, so a sibling failing in the same tick could be handed focus and
    // then unmount -- hence `isConnected` checks and same-tick batching concerns.
    // The destination is now the failing cell's OWN control, which by
    // construction exists precisely because that cell failed. Two tiles failing
    // together cannot produce a stale target at all.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement, "the focused cell's own control").toBe(
      screen.getByTestId("diagram-retry-0"),
    );
    expect(document.activeElement, "never a sibling, failing or surviving").not.toBe(survivor);
  });

  test("a failure of a thumbnail that did NOT hold focus relocates nothing", () => {
    open([item(1), item(2), item(3)]);
    const held = thumbButton(2);
    act(() => held.focus());

    failThumb(0);

    expect(document.activeElement).toBe(held);
  });
});

describe("Gallery — the last-resort focus target is a real destination", () => {
  test("the list keeps LIST SEMANTICS despite the reset that strips them", () => {
    // Tailwind's preflight sets `list-style: none`, and Safari/VoiceOver drop
    // list semantics from a `<ul>` styled that way — so a container that focus
    // is deliberately relocated to would be announced as a generic group,
    // without the item count that makes it a useful place to land.
    open([item(1)]);
    const list = screen.getByRole("list", { name: /diagrams gallery thumbnails/i });

    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe("Diagrams gallery thumbnails");
  });

  test("the list shows a focus indicator when focus is relocated to it", () => {
    // `focus:outline-none` with no replacement is a silent relocation: a sighted
    // keyboard user's focus moves and nothing on screen says where. `:focus`,
    // not `:focus-visible` — this element is ONLY ever focused programmatically.
    open([item(1)]);
    const list = screen.getByRole("list", { name: /diagrams gallery thumbnails/i });

    expect(list.className).toContain("focus:ring-2");
    expect(list.className).toContain("focus:ring-focus-ring");
  });
});

describe("Gallery — no failure is announced into a channel nobody can hear", () => {
  test("REOPENING: the dialog region is MOUNTED EMPTY, then mutated — not born full", () => {
    // `role="log"` presents ADDITIONS WITHIN a live region. A region node that
    // is inserted already containing its message is not an addition within
    // anything, so assistive technology may never speak it — the rule
    // DESIGN.md:479 states and the whole reason these regions are branch-stable.
    // The re-open path is where it is easy to break: the dialog mounts and the
    // buffer flushes in one click handler, so a flush done there renders the
    // region with its child already in place. Asserting the final DOM cannot see
    // that; only the mutation sequence can.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the exit window is open", presence.exiting);
    failThumb(1);
    premiseHolds(
      "the message really is buffered, or the mutation sequence proves nothing",
      entriesOf(screen.getByTestId(GALLERY_LOG)).length === 0 &&
        screen.queryAllByTestId(LIGHTBOX_LOG).every((r) => entriesOf(r).length === 0),
    );

    const regionBefore = screen.getByTestId(LIGHTBOX_LOG);
    /** Region nodes and entry nodes added during the re-open, in commit order. */
    const arrivals: Array<{ kind: "region" | "entry"; intoLiveRegion: boolean }> = [];
    const record = (records: MutationRecord[]): void => {
      for (const mutation of records) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.dataset.testid === LIGHTBOX_LOG) {
            arrivals.push({ kind: "region", intoLiveRegion: false });
          } else if (node.hasAttribute("data-announce-id")) {
            arrivals.push({ kind: "entry", intoLiveRegion: mutation.target === regionBefore });
          }
        }
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(document.body, { childList: true, subtree: true });

    act(() => {
      fireEvent.click(thumbButton(2));
    });
    // Drained SYNCHRONOUSLY: the observer callback is a microtask, so a test
    // that only waits for `act` to return sees an empty log and would pass
    // whatever the DOM did.
    record(observer.takeRecords());
    observer.disconnect();
    premise("the re-open produced observable DOM mutations at all", arrivals.length, 0);

    // A flush inside the click handler renders the region WITH its child, so the
    // entry's arrival is not a mutation of anything an AT was already watching.
    expect(arrivals.map((a) => a.kind)).toEqual(["entry"]);
    expect(
      arrivals[0]!.intoLiveRegion,
      "the entry must be appended to the region node that was already live",
    ).toBe(true);
    expect(screen.getByTestId(LIGHTBOX_LOG)).toBe(regionBefore);
  });

  test("REOPENING inside the exit window does not strand the buffered message", () => {
    // `onExitComplete` never fires when a re-entry cancels the exit, so a buffer
    // flushed only from there is lost for the rest of the session — and AC-3
    // says EVERY failure announces.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the exit window is open", presence.exiting);

    failThumb(1); // buffered

    // Re-open before the exit completes: the dialog is live again.
    act(() => {
      fireEvent.click(thumbButton(2));
    });

    const lightboxRegion = screen.getByTestId(LIGHTBOX_LOG);
    expect(entriesOf(lightboxRegion)).toEqual(["Plot 2 could not be loaded."]);
    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual([]);
  });

  test("a failure racing the dialog's channel publication is buffered, not dropped", () => {
    // The lightbox publishes its `announce` from an effect. A message routed to
    // the open state before that effect has run would hit a null ref and vanish;
    // it belongs in the buffer instead, which the publication then drains.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const lightboxRegion = screen.getByTestId(LIGHTBOX_LOG);
    premiseHolds(
      "the dialog channel is live for this control case",
      entriesOf(lightboxRegion).length === 0,
    );

    failThumb(1);

    expect(entriesOf(lightboxRegion)).toEqual(["Plot 2 could not be loaded."]);
  });
});

describe("Gallery — failures while the lightbox is OPEN route to its own channel", () => {
  function openLightboxFrom(slot: number) {
    act(() => {
      fireEvent.click(thumbButton(slot));
    });
    return screen.getByTestId("diagrams-lightbox");
  }

  test("the lightbox region gains the entry and the gallery region stays untouched", () => {
    open([item(1), item(2), item(3)]);
    openLightboxFrom(0);
    const galleryRegion = screen.getByTestId(GALLERY_LOG);
    const lightboxRegion = screen.getByTestId(LIGHTBOX_LOG);
    premiseHolds(
      "both regions start empty",
      entriesOf(galleryRegion).length === 0 && entriesOf(lightboxRegion).length === 0,
    );

    failThumb(1);

    expect(screen.getByTestId(LIGHTBOX_LOG)).toBe(lightboxRegion);
    expect(entriesOf(lightboxRegion)).toEqual(["Plot 2 could not be loaded."]);
    expect(entriesOf(galleryRegion)).toEqual([]);
  });

  test("DETACHED TRIGGER: the thumbnail that opened the lightbox fails, and close still lands focus", () => {
    // `useDialogFocus` restores to the saved trigger. Once that button is gone
    // the restore is a no-op and focus falls to <body> — probed on the live tree
    // as {"savedConnected":false,"activeTag":"BODY"}.
    open([item(1), item(2), item(3)]);
    act(() => thumbButton(0).focus());
    openLightboxFrom(0);

    const sibling = thumbButton(1);
    failThumb(0); // the trigger itself

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    act(() => presence.flush?.());

    // Task 4 moved the destination: the trigger hands its restore duty to its
    // OWN control, not to a sibling. The `not.toBe(body)` claim is unchanged and
    // is the one that matters -- it is about the failure mode rather than the
    // target -- but the target is now the cell the user was actually looking at.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByTestId("diagram-retry-0"));
    expect(document.activeElement).not.toBe(sibling);
  });

  test("§7.1: a thumbnail failing BEHIND an open dialog never pulls focus out of it", () => {
    // The guard this pins is one line -- the retarget is skipped while
    // `lightboxOpenRef` is true -- and nothing else in the suite covers it. A
    // mutation removing it survived every other case, which is how the gap was
    // found rather than reasoned about.
    //
    // The hazard is specific: the dialog is `aria-modal`, so focus leaving it
    // strands a keyboard user outside a modal that is still on screen and still
    // trapping. That is strictly worse than the dead-end this arc repairs.
    open([item(1), item(2), item(3)]);
    act(() => thumbButton(0).focus());
    openLightboxFrom(0);

    const inDialog = document.activeElement;
    premiseHolds(
      "focus is inside the dialog before the background failure, or there is nothing to steal",
      inDialog !== null && inDialog !== document.body,
    );

    // A DIFFERENT tile fails while the dialog owns focus.
    failThumb(1);

    expect(
      document.activeElement,
      "focus stays where the modal put it; the background cell does not grab it",
    ).toBe(inDialog);
  });

  test("AC-15: `successorTo` is GONE from the source, not merely unused", () => {
    // A behavioural test cannot make this claim. Every case above would pass
    // just as well with the helper reintroduced and left uncalled, and a
    // sibling-relocation helper sitting in the file is an invitation to wire it
    // back up the next time someone reads the focus code. The claim is about the
    // source, so the oracle reads the source.
    const src = readFileSync(join(process.cwd(), "components/diagrams/Gallery.tsx"), "utf8");
    // Premise: the file was actually read and is the one under test. Without it
    // an empty string would satisfy the absence assertion below.
    premiseHolds("the component source was read", src.includes("export function Gallery"));
    expect(src, "the sibling-relocation helper is deleted, not orphaned").not.toContain(
      "successorTo",
    );
  });

  test("SUCCESSION is moot: the target is A's OWN control, so B failing cannot detach it", () => {
    // This case used to chase a chain -- A fails, retarget B, B fails, retarget
    // C -- because every destination was a sibling that could itself vanish. The
    // closure rule existed to survive that.
    //
    // Task 4 removes the chain rather than lengthening it. The destination is
    // the failed cell's own control, which no sibling's failure can detach, so
    // the property to assert is that B failing changes nothing. Kept as a case
    // because that INVARIANCE is the improvement, and a deleted test would say
    // nothing about it.
    open([item(1), item(2), item(3)]);
    act(() => thumbButton(0).focus());
    openLightboxFrom(0);

    const c = thumbButton(2);
    failThumb(0); // A, the trigger
    failThumb(1); // B, an unrelated sibling

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    act(() => presence.flush?.());

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement, "A's own control, untouched by B's failure").toBe(
      screen.getByTestId("diagram-retry-0"),
    );
    expect(document.activeElement, "the chain's old endpoint is not involved").not.toBe(c);
  });
});

describe("Gallery — each lightbox session starts with a clean dialog channel", () => {
  test("a failure from a PREVIOUS session is not replayed into the next dialog", () => {
    // The dialog channel's state lives in the Gallery so it survives the dialog.
    // Unpruned, re-opening mounts a region pre-loaded with the whole session's
    // history — dead text between the header and the image for a screen-reader
    // user reading top-down, and a replay for any AT that reads an inserted
    // live region (announceLog.tsx documents exactly this for the admin channel).
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    failThumb(1);
    premiseHolds(
      "the first session really announced, or the replay claim is vacuous",
      entriesOf(screen.getByTestId(LIGHTBOX_LOG)).length === 1,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    act(() => presence.flush?.());
    act(() => {
      fireEvent.click(thumbButton(2));
    });

    expect(entriesOf(screen.getByTestId(LIGHTBOX_LOG))).toEqual([]);
  });
});

describe("Gallery — the dialog's own failure reaches the dialog's own region", () => {
  test("a demoted original is spoken in the region rendered INSIDE the dialog", () => {
    // The end-to-end of the split channel: the lightbox generates this message,
    // the Gallery owns the channel state, and the region lives in the dialog. A
    // missing `onAnnounce` prop is invisible to either half on its own.
    // A LADDER, unlike every other fixture in this file: the demote only exists
    // when there is a clamped tier to retreat to, so an originals-only entry
    // would take the destroy path and this case would silently test that instead.
    const ladder = [
      { width: 256, key: "embedded-obj-1.png@256.webp" },
      { width: 1024, key: "embedded-obj-1.png@1024.webp" },
    ];
    open([item(1, { variants: ladder }), item(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const region = screen.getByTestId(LIGHTBOX_LOG);
    premiseHolds(
      "the region is inside the dialog and empty",
      dialog.contains(region) && entriesOf(region).length === 0,
    );

    // Zoom intent, then the original fails: the demote path.
    act(() => zoom.emit(2.4));
    const activeImage = dialog
      .querySelector('[data-testid="rzpp-component"]')!
      .querySelector("img")!;
    premiseHolds(
      "the active slide is still an image (not the placeholder)",
      activeImage.isConnected,
    );
    act(() => {
      fireEvent.error(activeImage);
    });

    expect(entriesOf(region)).toEqual([
      "Plot 1: full detail could not be loaded. Showing a less detailed view.",
    ]);
    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual([]);
  });
});

describe("Gallery — the lightbox announces the failure that DESTROYS, not only the one that degrades", () => {
  test("an active slide that goes unavailable is announced by name", () => {
    // The demote (degrade) spoke and the destroy did not, which is exactly
    // backwards: a screen-reader user heard about the recoverable case and got
    // silence plus a focus jump to "Close gallery" for the unrecoverable one.
    open([item(1), item(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const region = screen.getByTestId(LIGHTBOX_LOG);
    const activeImage = dialog
      .querySelector('[data-testid="rzpp-component"]')!
      .querySelector("img")!;
    premiseHolds(
      "no zoom intent, so this failure destroys rather than demotes",
      entriesOf(region).length === 0,
    );

    act(() => {
      fireEvent.error(activeImage);
    });

    premiseHolds(
      "the slide really was destroyed, or this is the demote case in disguise",
      dialog.textContent!.includes("Image unavailable"),
    );
    expect(entriesOf(screen.getByTestId(LIGHTBOX_LOG))).toEqual(["Plot 1 could not be loaded."]);
  });

  test("an INACTIVE slide going unavailable stays SILENT — the user is not looking at it", () => {
    // Embla keeps every slide mounted, so a lightbox with 12 diagrams would
    // otherwise narrate failures of images the user has not swiped to. The
    // gallery already announces when the corresponding THUMBNAIL fails, which is
    // the moment that concerns a browsing user.
    open([item(1), item(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const zoom = dialog.querySelector('[data-testid="rzpp-component"]')!;
    const inactive = [...dialog.querySelectorAll("img")].find((img) => !zoom.contains(img))!;
    premiseHolds("an inactive slide rendered to fail", inactive !== undefined);

    act(() => {
      fireEvent.error(inactive);
    });

    expect(entriesOf(screen.getByTestId(LIGHTBOX_LOG))).toEqual([]);
  });
});

describe("Gallery — a lightbox failure inside the exit window is not lost", () => {
  test("it buffers and is delivered, exactly like a thumbnail failure", () => {
    // `onAnnounce` is a PROP, and AnimatePresence freezes the exiting child's
    // props — so a router that reads `lightboxIndex` from its render closure is
    // stale-true inside the window and appends to a frozen region that never
    // renders, which `resetDialogChannel` then wipes. Probed on the installed
    // Framer Motion: the message simply disappears.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const activeImage = dialog
      .querySelector('[data-testid="rzpp-component"]')!
      .querySelector("img")!;

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the exit window is open", presence.exiting);
    premiseHolds("the slide is still mounted and can still fail", activeImage.isConnected);

    act(() => {
      fireEvent.error(activeImage);
    });
    expect(entriesOf(screen.getByTestId(GALLERY_LOG)), "buffered, not spoken yet").toEqual([]);

    act(() => presence.flush?.());

    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual(["Plot 1 could not be loaded."]);
  });
});

describe("Gallery — de-zooming by keyboard never strands focus on the Reset chip", () => {
  test("pressing 0 while the chip holds focus lands focus on Close, inside the dialog", () => {
    // The chip is Tab-reachable and unmounts the moment scale returns to 1. Its
    // own onClick relocates first — proof the hazard was known — but `0`, `-`
    // and a pinch-out all unmount it with focus still on it, dropping focus to
    // `<body>`: outside the `aria-modal` dialog, where the non-Escape keymap
    // gate stops responding and the Tab trap never fires again.
    open([item(1), item(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    act(() => zoom.emit(2.5));
    const chip = screen.getByTestId("lightbox-reset-chip");
    act(() => chip.focus());
    premiseHolds(
      "the chip exists and holds focus before the de-zoom",
      document.activeElement === chip,
    );

    act(() => {
      fireEvent.keyDown(window, { key: "0" });
    });

    premiseHolds(
      "the de-zoom really unmounted the chip, or the case is not exercised",
      screen.queryByTestId("lightbox-reset-chip") === null,
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close gallery/i }));
  });

  test("de-zooming while focus is elsewhere in the dialog does not steal it", () => {
    open([item(1), item(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    act(() => zoom.emit(2.5));
    const next = screen.getByRole("button", { name: /next diagram/i });
    act(() => next.focus());

    act(() => {
      fireEvent.keyDown(window, { key: "0" });
    });

    expect(document.activeElement).toBe(next);
  });
});

describe("Gallery — navigating to a bound never drops focus out of the dialog", () => {
  test("activating a chevron that is about to be DISABLED hands focus to its opposite", () => {
    // A disabled button is blurred by the browser, and focus lands on `<body>` —
    // outside the `aria-modal` dialog. Everything keyed off "focus is inside the
    // dialog" then dead-ends: the non-Escape keymap stops responding and the Tab
    // trap (a listener on the dialog node) never sees another keydown, so Tab
    // walks out of the modal entirely.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(1));
    });
    const previous = screen.getByRole("button", { name: /previous diagram/i });
    const next = screen.getByRole("button", { name: /next diagram/i });
    act(() => previous.focus());
    premiseHolds(
      "the chevron under test is enabled and focused before activation",
      document.activeElement === previous,
    );

    act(() => {
      fireEvent.click(previous);
    });

    premiseHolds(
      "the activation really did disable that chevron, or the case is not exercised",
      (screen.getByRole("button", { name: /previous diagram/i }) as HTMLButtonElement).disabled,
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(next);
    expect(screen.getByTestId("diagrams-lightbox").contains(document.activeElement)).toBe(true);
  });

  test("a SWIPE to a bound hands focus across too — not just a chevron click", () => {
    // The handoff must live where the bound is REACHED, not in the two chevron
    // handlers: Embla's own `select` fires for a touch swipe as well, and a
    // swipe from the penultimate slide to the last one disables Next under the
    // user's focus with no click anywhere in the story.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(1));
    });
    const next = screen.getByRole("button", { name: /next diagram/i });
    const previous = screen.getByRole("button", { name: /previous diagram/i });
    act(() => next.focus());
    premise("the lightbox mounted an Embla instance to drive", emblaApis.length, 0);

    act(() => emblaApis.at(-1)!.scrollTo(2));

    premiseHolds(
      "the swipe really disabled the focused chevron, or the case is not exercised",
      (screen.getByRole("button", { name: /next diagram/i }) as HTMLButtonElement).disabled,
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(previous);
  });

  test("a swipe to a bound leaves focus alone when it is elsewhere in the dialog", () => {
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(1));
    });
    const close = screen.getByRole("button", { name: /close gallery/i });
    act(() => close.focus());

    act(() => emblaApis.at(-1)!.scrollTo(2));

    expect(document.activeElement).toBe(close);
  });

  test("a chevron that stays enabled keeps focus where the user put it", () => {
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(2));
    });
    const previous = screen.getByRole("button", { name: /previous diagram/i });
    act(() => previous.focus());

    act(() => {
      fireEvent.click(previous);
    });

    premiseHolds(
      "the chevron is still enabled after this move, or the control case is wrong",
      !(screen.getByRole("button", { name: /previous diagram/i }) as HTMLButtonElement).disabled,
    );
    expect(document.activeElement).toBe(previous);
  });
});

describe("Gallery — failures during the 220 ms exit window (three-phase oracle)", () => {
  test("buffered while exiting, flushed to the GALLERY channel on onExitComplete", () => {
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const galleryRegion = screen.getByTestId(GALLERY_LOG);
    const lightboxRegion = screen.getByTestId(LIGHTBOX_LOG);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds(
      "the dialog is still mounted (the exit window is real in this environment)",
      presence.exiting && screen.queryByTestId("diagrams-lightbox") !== null,
    );

    failThumb(1);

    // PHASE 2 — mid-exit. A premature append to the accessibility-excluded outer
    // log would satisfy a final-state-only check while never being announced.
    expect(entriesOf(galleryRegion)).toEqual([]);
    expect(entriesOf(lightboxRegion)).toEqual([]);

    // PHASE 3 — the dialog is gone, the outer region is announceable again.
    act(() => presence.flush?.());

    expect(entriesOf(screen.getByTestId(GALLERY_LOG))).toEqual(["Plot 2 could not be loaded."]);
  });

  test("the retained dialog really is frozen — its channel cannot be appended to", () => {
    // The premise behind the buffer. If a parent update DID reach the retained
    // child, routing to the lightbox channel during exit would work and the
    // buffer would be unnecessary complexity.
    open([item(1), item(2), item(3)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const lightboxRegion = screen.getByTestId(LIGHTBOX_LOG);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the retained region is still in the document", lightboxRegion.isConnected);

    failThumb(1);

    expect(entriesOf(lightboxRegion)).toEqual([]);
  });

  test("the TRIGGER failing mid-exit still lands focus on its successor, never body", () => {
    open([item(1), item(2), item(3)]);
    act(() => thumbButton(0).focus());
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the exit window is open", presence.exiting);

    const sibling = thumbButton(1);
    failThumb(0); // the saved trigger, during the freeze

    act(() => presence.flush?.());

    // Same retarget as the non-exiting case, and the mid-exit timing is what
    // makes it worth a separate case: the restore duty is handed over while the
    // dialog's props are frozen, so the hand-off cannot depend on anything the
    // dialog does during the exit window.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByTestId("diagram-retry-0"));
    expect(document.activeElement).not.toBe(sibling);
  });
});

/**
 * The demote chip's SESSION lifecycle (spec crew/2026-08-15-diagram-demote-notice-design
 * §2.1 clear 3; AC-2b).
 *
 * These cases live here rather than in the zoomGate suite because the zoomGate
 * harness mounts the lightbox directly with a no-op `onClose`: it can never
 * exercise a real close, the retained instance a canceled exit produces, or the
 * `openNonce` the parent increments on re-open. Those are the mechanisms under
 * test, so the real parent drives them.
 */
describe("Gallery — the demote chip never survives a dialog session", () => {
  const CHIP = '[data-testid="lightbox-demote-chip"]';

  /**
   * A fixture WITH a variant ladder. The demote branch needs somewhere to retreat
   * to (`hasVariantTier`), and this file's default fixture ships `variants: []` —
   * an originals-only entry, which by design goes straight to the placeholder.
   */
  function ladderItem(i: number): GalleryItem {
    const key = `embedded-obj-${i}.png`;
    return {
      ...item(i),
      variants: [
        { width: 256, key: `${key}@256.webp` },
        { width: 512, key: `${key}@512.webp` },
        { width: 1024, key: `${key}@1024.webp` },
      ],
    };
  }

  /** Open the lightbox on slide 0 and demote it through the real zoom path. */
  function openAndDemote(): HTMLImageElement {
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const activeImage = dialog
      .querySelector('[data-testid="rzpp-component"]')!
      .querySelector("img")!;
    act(() => zoom.emit(2.5));
    act(() => {
      fireEvent.error(activeImage);
    });
    premiseHolds("the demote produced a chip", document.querySelector(CHIP) !== null);
    return activeImage;
  }

  for (const [label, close] of [
    [
      "the Close button",
      () => fireEvent.click(screen.getByRole("button", { name: /close gallery/i })),
    ],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    [
      "a backdrop click",
      () => {
        const dialog = screen.getByTestId("diagrams-lightbox");
        fireEvent.click(dialog);
      },
    ],
  ] as const) {
    test(`${label} clears the chip, and a re-open inside the exit window finds none`, () => {
      open([ladderItem(1), ladderItem(2)]);
      openAndDemote();

      act(() => {
        close();
      });
      premiseHolds("the exit window is open, so this is the retained instance", presence.exiting);

      // ASSERTED MID-EXIT, before any re-open. After a re-open the session stamp
      // hides a stale notice on its own, so a post-re-open assertion alone would
      // pass with `clearDemoteNotice()` deleted from the close path — and the
      // user would watch the chip ride the dialog out.
      expect(
        document.querySelector(CHIP),
        "the close cleared the chip on the retained instance",
      ).toBeNull();

      // Re-open INSIDE the window: the exit is canceled and the same instance is
      // retained, which is exactly where a chip cleared only on unmount survives.
      act(() => {
        fireEvent.click(thumbButton(0));
      });

      expect(document.querySelector(CHIP), "no chip carried into the new session").toBeNull();
    });
  }

  test("a demote DURING the exit window cannot repopulate the chip on re-open", () => {
    // NOT `openAndDemote()`: that helper already fails the original, so a second
    // error on the same slide is the CLAMPED tier failing and lands in the
    // placeholder branch — the demote branch and its gate would never run, and
    // deleting the gate would leave this case green. The slide here reaches the
    // exit window UNDEMOTED with zoom intent pinned, so the error below is a
    // genuine first failure of the original.
    open([ladderItem(1), ladderItem(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const activeImage = dialog
      .querySelector('[data-testid="rzpp-component"]')!
      .querySelector("img")!;
    act(() => zoom.emit(2.5));
    premiseHolds(
      "nothing has failed yet, so there is no chip",
      document.querySelector(CHIP) === null,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the exit window is open", presence.exiting);
    premiseHolds("the retained slide can still fail", activeImage.isConnected);

    act(() => {
      fireEvent.error(activeImage);
    });

    // THE GATE'S OWN OBSERVABLE, asserted before any re-open: the retained
    // instance is still rendering at the nonce this notice would carry, so
    // without the gate a chip paints HERE, over a dialog the user is watching
    // disappear. (After a re-open the stamp check would hide it anyway, which is
    // why asserting only the post-re-open state cannot tell the two apart.)
    expect(
      document.querySelector(CHIP),
      "no chip paints on the retained instance mid-exit",
    ).toBeNull();

    act(() => {
      fireEvent.click(thumbButton(0));
    });

    expect(document.querySelector(CHIP), "an exit-window demote must not repopulate").toBeNull();
  });

  test("a failure that lands AFTER the re-entry commit still gets its chip", () => {
    // The positive half of the gate. A DOM error event dispatched after the
    // re-entry render must find the session already advanced — with the shipped
    // shape that means the notice it writes carries the LIVE nonce and renders.
    // An implementation that cleared a closing flag in an effect would still be
    // suppressing at this instant, which is what this case exists to reject.
    open([ladderItem(1), ladderItem(2)]);
    act(() => {
      fireEvent.click(thumbButton(0));
    });
    const dialog = screen.getByTestId("diagrams-lightbox");
    const activeImage = dialog
      .querySelector('[data-testid="rzpp-component"]')!
      .querySelector("img")!;
    act(() => zoom.emit(2.5));

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /close gallery/i }));
    });
    premiseHolds("the exit window is open", presence.exiting);
    act(() => {
      // `flushSync` is the point: it COMMITS the re-entry render without
      // flushing passive effects, which is the exact window R4 F1 describes.
      // Firing the error in a plain act() either commits nothing yet (measured:
      // the exit is still in progress) or flushes effects first, and neither
      // ordering can tell a render-time mechanism from an effect-timed one.
      flushSync(() => {
        fireEvent.click(thumbButton(0));
      });
      premiseHolds("the re-entry render committed", !presence.exiting);
      fireEvent.error(activeImage);
    });

    premiseHolds("the re-entry canceled the exit", !presence.exiting);
    expect(
      document.querySelector(CHIP),
      "a live-session demote gets its sighted signal",
    ).not.toBeNull();
  });
});
