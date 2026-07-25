// @vitest-environment jsdom
/**
 * tests/components/admin/hoverHelpVisualViewport.test.tsx
 *
 * The jsdom PLACEMENT layer (Task 3). Listener behavior is Task 4. These pins cannot
 * live anywhere else: the real-engine suite is Chromium-only so it can never
 * exercise the WebKit exclusion, and the property suite is pure so it never
 * sees a listener at all.
 *
 * Rect stubbing follows tests/components/admin/hoverHelpLifecycle.test.tsx:157.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { GAP, VIEWPORT_INSET } from "@/lib/popover/position";

type FrameCb = (t: number) => void;
let frames: Map<number, FrameCb>;
let nextId: number;

/** Real EventTarget so add/dispatch/remove are genuine, not spies over nothing. */
class VisualViewportStub extends EventTarget {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  constructor(width: number, height: number, offsetLeft: number, offsetTop: number) {
    super();
    this.width = width;
    this.height = height;
    this.offsetLeft = offsetLeft;
    this.offsetTop = offsetTop;
  }
}

const LAYOUT_W = 1000;
const LAYOUT_H = 800;
// Smaller than AND offset from the layout viewport, so a layout-viewport
// implementation and a visual-viewport one cannot produce the same answer.
const VV = { width: 300, height: 250, offsetLeft: 400, offsetTop: 200 } as const;
// Anchor inside the slice, so the visible-slice bounds are the ones in play.
const TRIGGER = { left: 450, top: 300, width: 20, height: 20 } as const;
const BODY_NATURAL = { left: 0, top: 0, width: 288, height: 90 } as const;

const stubRect = (el: Element, r: { left: number; top: number; width: number; height: number }) =>
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...r,
      right: r.left + r.width,
      bottom: r.top + r.height,
      x: r.left,
      y: r.top,
      toJSON: () => "",
    }),
  });

const define = (obj: object, prop: string, value: unknown) =>
  Object.defineProperty(obj, prop, { configurable: true, value });

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCb): number => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => void frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  define(window, "innerWidth", LAYOUT_W);
  define(window, "innerHeight", LAYOUT_H);
  define(window, "scrollX", 0);
  define(window, "scrollY", 0);
  // Default: NOT WebKit.
  vi.stubGlobal("CSS", { supports: () => false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(): HTMLElement {
  render(
    <HoverHelp label="Help: zoom" testId="vv">
      <p>body</p>
    </HoverHelp>,
  );
  const trigger = screen.getByTestId("vv-trigger");
  stubRect(trigger, TRIGGER);
  stubRect(document.body, { left: 0, top: 0, width: LAYOUT_W, height: LAYOUT_H });
  stubRect(screen.getByTestId("vv-body"), BODY_NATURAL);
  return trigger;
}

const runFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(0);
};

describe("T-C1: bounds come from the visible slice", () => {
  test("the popover is clamped into the slice, not the layout viewport", () => {
    vi.stubGlobal(
      "visualViewport",
      new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop),
    );
    const trigger = mount();
    fireEvent.click(trigger);

    const body = screen.getByTestId("vv-body");
    const boundsLeft = VV.offsetLeft + VIEWPORT_INSET;
    const boundsRight = VV.offsetLeft + VV.width - VIEWPORT_INSET;
    const width = Math.min(BODY_NATURAL.width, boundsRight - boundsLeft);
    const expectedLeft = Math.min(Math.max(TRIGGER.left, boundsLeft), boundsRight - width);

    expect(body.style.left).toBe(`${expectedLeft}px`);
    expect(body.style.top).toBe(`${TRIGGER.top + TRIGGER.height + GAP}px`);
    // The layout-viewport answer would have been the trigger's own left edge.
    expect(body.style.left).not.toBe(`${TRIGGER.left}px`);
  });
});


describe("T-C4: no visualViewport at all", () => {
  test("still opens and positions against the layout viewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    const trigger = mount();
    expect(() => fireEvent.click(trigger)).not.toThrow();
    const body = screen.getByTestId("vv-body");
    expect(body.style.left).toBe(`${TRIGGER.left}px`);
    expect(body.style.top).toBe(`${TRIGGER.top + TRIGGER.height + GAP}px`);
  });
});



describe("T-C6: an anchor outside the visible slice is placed, never hidden", () => {
  test("layout-viewport answer, popover visible, open state preserved", () => {
    // AC-6's component-level companion. The pure property suite protects the
    // HELPER; it cannot see a consumer-local mutation that hides an
    // outside-slice trigger after receiving a valid legacy fallback, and the
    // e2e fixtures keep their anchors on-screen by construction.
    vi.stubGlobal(
      "visualViewport",
      new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop),
    );
    render(
      <HoverHelp label="Help: off-slice" testId="off">
        <p>body</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("off-trigger");
    // Outside the slice at (400,200)-(700,450), and with room BELOW it in the
    // layout viewport - at top:700 the core correctly flips the popover above,
    // which would make a side-assuming assertion wrong rather than the code.
    const OUT = { left: 40, top: 40, width: 20, height: 20 };
    stubRect(trigger, OUT);
    stubRect(document.body, { left: 0, top: 0, width: LAYOUT_W, height: LAYOUT_H });
    const body = screen.getByTestId("off-body");
    stubRect(body, BODY_NATURAL);
    fireEvent.click(trigger);

    expect(body.dataset["popoverHidden"]).toBeUndefined();
    expect(body.style.visibility).not.toBe("hidden");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Placed against the LAYOUT viewport: directly under its own anchor.
    expect(body.style.left).toBe(`${OUT.left}px`);
    expect(body.dataset["popoverSide"]).toBe("bottom");
    expect(body.style.top).toBe(`${OUT.top + OUT.height + GAP}px`);
  });
});
