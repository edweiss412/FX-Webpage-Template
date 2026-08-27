// @vitest-environment jsdom
/**
 * admin-dashboard-row-actions Task 2 — the anchored-portal primitive.
 *
 * Spec §3.1 positioning/collision contract: ShowsTable's rows wrapper carries
 * `overflow-hidden`, so an absolutely-positioned in-row panel is CLIPPED on the
 * bottom/edge rows — the concrete defect this primitive exists to remove. The
 * panel therefore portals to document.body, anchors to its trigger in DOCUMENT
 * coordinates, flips to the opposite side when the preferred side lacks room,
 * and leaves no orphaned node when its owner unmounts (§3.5 compound row).
 *
 * Close-on-window-scroll is deliberately NOT here — it is Task 7's production
 * defect, red-first against the real wired dashboard in Playwright.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import { renderToString } from "react-dom/server";
import { AnchoredPortal } from "@/components/admin/AnchoredPortal";
import { GAP } from "@/lib/popover/position";
import { premise, premiseHolds } from "../../../_shared/premise";

// ── rect stubbing ───────────────────────────────────────────────────────────
// jsdom computes no layout: every getBoundingClientRect is a zero rect. The
// placement core treats a zero-area body as unmeasurable, so any test asserting
// a COMPUTED position must supply real rects. Keyed by selector, installed on
// the prototype, restored in afterEach.
type StubRect = { left: number; top: number; width: number; height: number };
const stubbed = new Map<string, StubRect>();
const originalRect = Element.prototype.getBoundingClientRect;

function asDomRect(r: StubRect): DOMRect {
  return {
    x: r.left,
    y: r.top,
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.left + r.width,
    bottom: r.top + r.height,
    toJSON: () => ({}),
  } as DOMRect;
}

// ── frame control ───────────────────────────────────────────────────────────
// The primitive re-places through the shared leading-edge throttle
// (lib/popover/rafCoalescer.ts). A synchronous rAF stub would wedge that
// throttle's `frame` bookkeeping (the id is assigned AFTER a sync callback
// clears it), so frames are queued and flushed explicitly instead.
let frames: FrameRequestCallback[] = [];
const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;
const flushFrames = () => {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(0);
};

beforeEach(() => {
  stubbed.clear();
  frames = [];
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    for (const [selector, r] of stubbed) {
      if (this.matches(selector)) return asDomRect(r);
    }
    return originalRect.call(this);
  };
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
});

afterEach(() => {
  cleanup();
  Element.prototype.getBoundingClientRect = originalRect;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancelRaf;
  Object.defineProperty(window, "scrollX", { value: 0, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

const setScroll = (x: number, y: number) => {
  Object.defineProperty(window, "scrollX", { value: x, configurable: true });
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
};

function Harness(props: { open: boolean; preferredSide?: "top" | "bottom" }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    // The clipping ancestor is the point: ShowsTable's rows wrapper is
    // `overflow-hidden` (components/admin/ShowsTable.tsx rows wrapper).
    <div data-testid="clipping-host" className="overflow-hidden">
      <button ref={anchorRef} data-testid="anchor" type="button">
        Actions
      </button>
      <AnchoredPortal
        open={props.open}
        anchorRef={anchorRef}
        testId="portal-panel"
        align="left"
        {...(props.preferredSide ? { preferredSide: props.preferredSide } : {})}
      >
        <div data-testid="panel-content">content</div>
      </AnchoredPortal>
    </div>
  );
}

const panelNode = () => document.body.querySelector<HTMLElement>('[data-testid="portal-panel"]');

describe("AnchoredPortal — mount + anchor semantics", () => {
  test("renders nothing at all while closed", () => {
    render(<Harness open={false} />);
    expect(panelNode()).toBeNull();
    expect(document.body.querySelector('[data-testid="panel-content"]')).toBeNull();
  });

  test("open: the panel mounts to document.body, OUTSIDE the clipping ancestor", () => {
    const { getByTestId } = render(<Harness open />);
    const host = getByTestId("clipping-host");
    // PREMISE (this case's own inputs): the escape only means something if the
    // host actually clips — an unclipped host makes any DOM position pass.
    premiseHolds(
      "the harness host declares overflow-hidden (the clip this portal escapes)",
      host.className.split(/\s+/).includes("overflow-hidden"),
    );
    const panel = panelNode();
    expect(panel).not.toBeNull();
    // An in-flow render would leave the panel inside the clipping subtree.
    expect(host.contains(panel)).toBe(false);
    expect(panel!.parentElement).toBe(document.body);
    // The children render inside the portaled panel, not somewhere else.
    expect(panel!.querySelector('[data-testid="panel-content"]')).not.toBeNull();
  });

  test("server render emits no panel (the portal never touches document on the server)", () => {
    const html = renderToString(<Harness open />);
    premiseHolds(
      "the server render produced the anchor (so the tree DID render)",
      {
        hit: html.includes('data-testid="anchor"'),
      }.hit,
    );
    expect(html).not.toContain('data-testid="portal-panel"');
    expect(html).not.toContain('data-testid="panel-content"');
  });

  test("anchors below the trigger in DOCUMENT coordinates (page scroll included)", () => {
    const anchor: StubRect = { left: 120, top: 200, width: 44, height: 44 };
    const panelSize: StubRect = { left: 0, top: 0, width: 200, height: 100 };
    stubbed.set('[data-testid="anchor"]', anchor);
    stubbed.set('[data-testid="portal-panel"]', panelSize);
    const scrollX = 37;
    const scrollY = 300;
    setScroll(scrollX, scrollY);
    // PREMISE: the preferred side must actually FIT, or this case is silently
    // testing the flip path instead of the anchor path.
    const spaceBelow = window.innerHeight - (anchor.top + anchor.height) - GAP;
    premise("the panel fits below the trigger in this fixture", spaceBelow, panelSize.height);
    // PREMISE: a zero page scroll cannot distinguish viewport from document
    // coordinates — the exact bug this assertion exists to catch.
    premise("the fixture scrolls the page", scrollY, 0);

    render(<Harness open />);
    const panel = panelNode()!;
    expect(panel.dataset["portalSide"]).toBe("bottom");
    // Expected values derive from the fixture + the shared GAP constant.
    expect(panel.style.left).toBe(`${anchor.left + scrollX}px`);
    expect(panel.style.top).toBe(`${anchor.top + anchor.height + GAP + scrollY}px`);
  });

  test("flips to the top side when the trigger sits low in the viewport", () => {
    const panelHeight = 300;
    const anchor: StubRect = {
      left: 40,
      top: window.innerHeight - 60,
      width: 44,
      height: 44,
    };
    stubbed.set('[data-testid="anchor"]', anchor);
    stubbed.set('[data-testid="portal-panel"]', {
      left: 0,
      top: 0,
      width: 200,
      height: panelHeight,
    });
    // PREMISE: the fixture must CROSS the flip boundary — below must not fit
    // and above must — or "bottom" would be the correct answer and the
    // assertion would prove nothing about flipping.
    const spaceBelow = window.innerHeight - (anchor.top + anchor.height) - GAP;
    const spaceAbove = anchor.top - GAP;
    premiseHolds("the panel does NOT fit below the trigger", spaceBelow < panelHeight);
    premise("the panel DOES fit above the trigger", spaceAbove, panelHeight);

    render(<Harness open />);
    const panel = panelNode()!;
    expect(panel.dataset["portalSide"]).toBe("top");
    // Placed above: trigger.top - GAP - height (document coords, scroll 0).
    expect(panel.style.top).toBe(`${anchor.top - GAP - panelHeight}px`);
  });

  test("re-places when the viewport resizes and the trigger has moved", () => {
    const before: StubRect = { left: 120, top: 200, width: 44, height: 44 };
    const after: StubRect = { left: 260, top: 340, width: 44, height: 44 };
    stubbed.set('[data-testid="anchor"]', before);
    stubbed.set('[data-testid="portal-panel"]', { left: 0, top: 0, width: 200, height: 100 });
    render(<Harness open />);
    const panel = panelNode()!;
    const placedFirst = panel.style.left;
    // PREMISE: the two anchor positions must DIFFER, or "it re-placed" and "it
    // never moved" are the same observation.
    premiseHolds("the fixture moves the anchor between measurements", before.left !== after.left);
    expect(placedFirst).toBe(`${before.left}px`);

    stubbed.set('[data-testid="anchor"]', after);
    act(() => {
      window.dispatchEvent(new Event("resize"));
      flushFrames();
    });
    expect(panel.style.left).toBe(`${after.left}px`);
    expect(panel.style.top).toBe(`${after.top + after.height + GAP}px`);
  });
});

describe("AnchoredPortal — teardown (spec §3.5 compound: row unmounts while open)", () => {
  test("unmounting the owner leaves NO orphaned node in document.body", () => {
    const { unmount } = render(<Harness open />);
    premiseHolds("the panel was mounted before unmount", panelNode() !== null);
    unmount();
    expect(panelNode()).toBeNull();
    expect(document.body.querySelector('[data-testid="panel-content"]')).toBeNull();
  });

  test("closing removes the panel from the document (not merely hides it)", () => {
    const { rerender } = render(<Harness open />);
    premiseHolds("the panel was mounted while open", panelNode() !== null);
    rerender(<Harness open={false} />);
    expect(panelNode()).toBeNull();
  });

  test("after unmount, a resize does not re-place a dead panel (listeners released)", () => {
    stubbed.set('[data-testid="anchor"]', { left: 120, top: 200, width: 44, height: 44 });
    stubbed.set('[data-testid="portal-panel"]', { left: 0, top: 0, width: 200, height: 100 });
    const { unmount } = render(<Harness open />);
    premiseHolds("the panel was mounted before unmount", panelNode() !== null);
    unmount();
    // A leaked listener would throw or resurrect a node; neither may happen.
    act(() => {
      window.dispatchEvent(new Event("resize"));
      flushFrames();
    });
    expect(panelNode()).toBeNull();
  });
});

// ── whole-diff review R4 F1 ─────────────────────────────────────────────────
// The subscriptions cover scroll, resize and SIZE changes. None covers a
// POSITION-ONLY move, and ResizeObserver explicitly does not — it reports size.
// A background `router.refresh()` that reorders rows moves the anchor without
// changing any dimension, and a body-child portal holding absolute coordinates
// then visually belongs to a DIFFERENT row.
describe("AnchoredPortal — a position-only move re-places the panel", () => {
  test("re-renders re-measure, so an anchor that moved without resizing is followed", () => {
    const before: StubRect = { left: 120, top: 200, width: 44, height: 44 };
    const after: StubRect = { left: 120, top: 900, width: 44, height: 44 };
    stubbed.set('[data-testid="anchor"]', before);
    stubbed.set('[data-testid="portal-panel"]', { left: 0, top: 0, width: 200, height: 100 });
    const { rerender } = render(<Harness open />);
    const panel = panelNode()!;
    expect(panel.style.top).toBe(`${before.top + before.height + GAP}px`);

    // PREMISE (own inputs): the anchor must MOVE while keeping its size, or
    // this proves nothing the ResizeObserver would not already have caught.
    premiseHolds("the anchor moves", before.top !== after.top);
    premiseHolds(
      "…without changing size, which is what ResizeObserver watches",
      before.width === after.width && before.height === after.height,
    );

    // A re-render with no scroll, no resize and no size change — the shape a
    // reordering refresh takes.
    stubbed.set('[data-testid="anchor"]', after);
    rerender(<Harness open />);
    expect(panel.style.top).toBe(`${after.top + after.height + GAP}px`);
  });
});

/**
 * Site-transition pins (scroll-clamp spec §5.4).
 * Family B: placement must derive from the NATURAL size — a migration that
 * measures while a stale inline cap is applied computes a wrong cap/position.
 * Family C: the §4.5 self-origin filter — the panel's own scroll events must
 * not schedule a re-place (they are the fuel of the R5 perpetual-measure loop).
 */
describe("AnchoredPortal — natural-size measurement + self-origin filter (scroll-clamp spec §5.4)", () => {
  test("family B: after a position-only move grows the room, the cap derives from the NATURAL height", () => {
    const NATURAL_H = 900;
    // Style-sensitive panel rect: capped height while an inline cap is applied,
    // natural height when cleared — what a real layout reports, and the
    // difference a capped measurement cannot see.
    const prev = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this.matches('[data-testid="portal-panel"]')) {
        const cap = parseFloat((this as HTMLElement).style.maxHeight);
        const h = Number.isFinite(cap) ? Math.min(NATURAL_H, cap) : NATURAL_H;
        return asDomRect({ left: 0, top: 0, width: 200, height: h });
      }
      for (const [selector, r] of stubbed) {
        if (this.matches(selector)) return asDomRect(r);
      }
      return prev.call(this);
    };
    try {
      const mid: StubRect = { left: 100, top: 400, width: 24, height: 24 };
      const top: StubRect = { left: 100, top: 8, width: 24, height: 24 };
      stubbed.set('[data-testid="anchor"]', mid);
      const { rerender } = render(<Harness open />);
      const panel = panelNode()!;
      const cappedBefore = parseFloat(panel.style.maxHeight);
      // PREMISE (own inputs): the first placement must cap the panel, and the
      // natural height must exceed the post-move room, or the assertion below
      // cannot distinguish a natural measurement from a stale one.
      premiseHolds("first placement caps the panel", Number.isFinite(cappedBefore));
      premise("natural height exceeds the viewport", NATURAL_H, window.innerHeight);
      // Position-only move: the anchor jumps to the top; room below grows far
      // beyond the stale cap but stays below the natural height.
      premiseHolds(
        "post-move room exceeds the stale cap",
        window.innerHeight - (top.top + top.height) > cappedBefore,
      );
      stubbed.set('[data-testid="anchor"]', top);
      rerender(<Harness open />);
      const cappedAfter = parseFloat(panel.style.maxHeight);
      expect(
        Number.isFinite(cappedAfter),
        "a natural measurement still needs a cap here (natural 900 > any room); " +
          "a STALE measurement fits under the grown room and drops the cap entirely",
      ).toBe(true);
      expect(
        cappedAfter,
        "the re-applied cap derives from the grown room (natural measure), not the stale cap",
      ).toBeGreaterThan(cappedBefore);
    } finally {
      Element.prototype.getBoundingClientRect = prev;
    }
  });

  test("family C: panel-origin scroll never schedules; ancestor scroll re-places; document scroll dismisses", () => {
    stubbed.set('[data-testid="anchor"]', { left: 100, top: 200, width: 24, height: 24 });
    stubbed.set('[data-testid="portal-panel"]', { left: 0, top: 0, width: 200, height: 100 });
    const onDismiss = vi.fn();
    function FilterHarness() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <div data-testid="scroll-host">
          <button ref={anchorRef} data-testid="anchor" type="button">
            Actions
          </button>
          <AnchoredPortal
            open
            anchorRef={anchorRef}
            testId="portal-panel"
            align="left"
            onDismiss={onDismiss}
          >
            <div>content</div>
          </AnchoredPortal>
        </div>
      );
    }
    render(<FilterHarness />);
    const panel = panelNode()!;
    frames = [];
    // Panel-origin: MUST NOT schedule a re-place (spec §4.5) — this is the
    // event the scroll-restore emits on every measurement of a scrolled panel.
    panel.dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(frames.length, "panel-origin scroll is ignored (self-origin filter)").toBe(0);
    // Ancestor-origin: still re-places.
    document
      .querySelector('[data-testid="scroll-host"]')!
      .dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(frames.length, "ancestor scroll still schedules a re-place").toBeGreaterThan(0);
    // Document-origin: still dismisses, and does not schedule.
    frames = [];
    document.dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(onDismiss, "document scroll still dismisses").toHaveBeenCalledTimes(1);
    expect(frames.length, "a dismissal schedules nothing").toBe(0);
  });
});

/**
 * INV-3 / AC-1 (BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN).
 *
 * The count is of measures REACT COMMITS DRIVE. jsdom's `ResizeObserver` is a
 * no-op stub (`tests/setup.ts:70-81`), so observer-delivery measures do not
 * appear here — which is exactly what makes the commit-driven count observable
 * in isolation, and exactly why it is not a browser total (spec §1).
 */
describe("AnchoredPortal — the converged measure count on an open transition", () => {
  test("one closed → open transition runs measureAndApply exactly twice", () => {
    const anchor: StubRect = { left: 1100, top: 200, width: 44, height: 44 };
    stubbed.set('[data-testid="anchor"]', anchor);
    stubbed.set('[data-testid="portal-panel"]', { left: 0, top: 0, width: 260, height: 300 });

    let reads = 0;
    const prev = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this.matches('[data-testid="anchor"]')) reads += 1;
      return prev.call(this) as DOMRect;
    };
    try {
      const { rerender } = render(<Harness open={false} />);

      // PREMISE (own inputs): the CLOSED render must measure nothing, or the
      // count below is not the cost of a transition.
      premiseHolds("the closed render measures nothing", reads === 0);

      reads = 0;
      rerender(<Harness open />);
      const openReads = reads;

      // PREMISE (own inputs), sampled HERE and not later: the open transition
      // itself must have placed the panel, or a count of 2 could be two runs
      // that both read the anchor and bailed.
      //
      // Ordering is load-bearing. An earlier version checked this AFTER the
      // resize below, which a pair of bailing open-time calls followed by one
      // successful resize measure satisfies — it proved eventual placement
      // rather than placement by either counted measure.
      const panel = panelNode()!;
      const placedTop = `${anchor.top + anchor.height + GAP}px`;
      premiseHolds("the open transition itself placed the panel", panel.style.top === placedTop);

      // PREMISE (own inputs): one measure must be one anchor read, or the
      // counted unit is ambiguous and this case would red on a refactor that
      // changes nothing observable. Established by driving exactly ONE measure:
      // a single window resize schedules through
      // `createRafCoalescer(measureAndApply)`, a leading-edge throttle that runs
      // it once per flushed frame. Catches a second rect read added inside
      // `measureAndApply`, which would silently double every count made here.
      reads = 0;
      window.dispatchEvent(new Event("resize"));
      flushFrames();
      premiseHolds("one measure is one anchor read", reads === 1);

      expect(openReads).toBe(2);
    } finally {
      Element.prototype.getBoundingClientRect = prev;
    }
  });
});
