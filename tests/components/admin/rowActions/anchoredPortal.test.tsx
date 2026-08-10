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
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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
