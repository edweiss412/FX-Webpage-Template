// @vitest-environment jsdom
/**
 * tests/components/admin/useFitWithinClip.test.tsx
 *
 * The shared clip-fit hook extracted from ReSyncButton
 * (spec 2026-08-01-admin-popover-overlay-cluster §4.1/§4.2).
 *
 * The harness deliberately uses TWO distinct ancestor nodes — an OUTER clipping
 * div and an INNER positioned div that stands in for `offsetParent`. Collapsing
 * them would make case (d) tautological: the hook already observes the clip
 * ancestor, so a single node would "prove" the offsetParent extension without
 * the extension existing.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useFitWithinClip } from "@/components/admin/useFitWithinClip";
import { computeFittedMaxHeight } from "@/lib/layout/fitWithinClip";

/** Declared CSS cap on the fitted element (a real `max-h-96` is 384px). */
const DECLARED_CAP = 384;
const FITTED_TOP = 230;
const CLIP_BOTTOM = 560;
/** Second geometry, used by every re-measure case. */
const CLIP_BOTTOM_AFTER = 460;

type Geometry = { fittedTop: number; clipBottom: number };
let geometry: Geometry;

type FrameCb = (t: number) => void;
/**
 * Frames are held, never auto-run: the coalescing cases have to observe the
 * gap between "N events fired" and "one frame ran", which an auto-flushing
 * stub would close before the assertion could see it.
 */
let frames: Map<number, FrameCb>;
let nextFrameId: number;
let cancelledFrames: number[];

function flushFrames(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(0);
}

/**
 * One `apply()` run calls `getBoundingClientRect` on the fitted node exactly
 * once, so counting those calls counts APPLIES — the quantity under test.
 * Counting style writes instead would undercount: a re-measure that lands on
 * the same number still costs the forced reflow this test exists to bound.
 */
let applyCount: number;

/**
 * Both stubs resolve from the element's own data attributes on EVERY call, so
 * they are live from the first effect (the hook measures during the initial
 * render — anything installed after `render()` returns is already too late) and
 * a test can move the layout mid-run and provoke a genuine re-measure.
 */
function rectFor(el: Element): DOMRect {
  const id = (el as HTMLElement).dataset?.["testid"];
  const box =
    id === "outer"
      ? { top: 0, bottom: geometry.clipBottom }
      : id === "inner"
        ? { top: 100, bottom: geometry.clipBottom }
        : id === "fitted"
          ? { top: geometry.fittedTop, bottom: geometry.fittedTop + 100 }
          : { top: 0, bottom: 0 };
  return {
    left: 0,
    right: 300,
    width: 300,
    top: box.top,
    bottom: box.bottom,
    height: box.bottom - box.top,
    x: 0,
    y: box.top,
    toJSON: () => "",
  } as DOMRect;
}

function Harness({ reapplyKey, clips = true }: { reapplyKey?: unknown; clips?: boolean }) {
  const fitRef = useFitWithinClip(reapplyKey);
  return (
    <div data-testid="outer" data-clips={clips ? "true" : undefined}>
      <div data-testid="inner">
        <div data-testid="fitted" ref={fitRef} />
      </div>
    </div>
  );
}

function mount(opts: { clips?: boolean; reapplyKey?: unknown } = {}) {
  const { clips = true, reapplyKey } = opts;
  const view = render(<Harness reapplyKey={reapplyKey} clips={clips} />);
  return {
    view,
    outer: screen.getByTestId("outer"),
    inner: screen.getByTestId("inner"),
    fitted: screen.getByTestId("fitted"),
  };
}

/** Expected value derived from the mocked rects, never hardcoded. */
function expectedPx(g: Geometry = geometry): string {
  return `${computeFittedMaxHeight({
    elementTop: g.fittedTop,
    clipBottom: g.clipBottom,
    cap: DECLARED_CAP,
  })}px`;
}

/**
 * `new Event("transitionend", {propertyName})` silently drops the field — the
 * Event constructor ignores members outside EventInit — so a test written that
 * way would assert against `undefined` and pass no matter what the listener
 * filters on. The property is defined explicitly.
 */
function transitionEnd(propertyName: string, bubbles = false): Event {
  const ev = new Event("transitionend", { bubbles });
  Object.defineProperty(ev, "propertyName", { value: propertyName });
  return ev;
}

/** Installs the offsetParent stub for the cases that need a positioned parent. */
function withOffsetParent<T>(fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    get() {
      return (this as HTMLElement).parentElement;
    },
    configurable: true,
  });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetParent");
  }
}

beforeEach(() => {
  geometry = { fittedTop: FITTED_TOP, clipBottom: CLIP_BOTTOM };
  frames = new Map();
  nextFrameId = 1;
  cancelledFrames = [];
  applyCount = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCb): number => {
    const id = nextFrameId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    cancelledFrames.push(id);
    frames.delete(id);
  });
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const data = (el as HTMLElement).dataset;
    const clips = data?.["clips"] === "true";
    return {
      overflowX: clips ? "clip" : "visible",
      overflowY: clips ? "clip" : "visible",
      maxHeight: data?.["testid"] === "fitted" ? `${DECLARED_CAP}px` : "none",
    } as unknown as CSSStyleDeclaration;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if ((this as HTMLElement).dataset?.["testid"] === "fitted") applyCount += 1;
    return rectFor(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useFitWithinClip", () => {
  test("(a) writes the fitted max-height derived from the clip ancestor", () => {
    const { fitted } = mount();
    expect(fitted.style.maxHeight).toBe(expectedPx());
    // Sanity: the cap is NOT what was written — the clip is what binds here.
    expect(fitted.style.maxHeight).not.toBe(`${DECLARED_CAP}px`);
  });

  test("(b) no clipping ancestor → no write at all", () => {
    const { fitted } = mount({ clips: false });
    expect(fitted.style.maxHeight).toBe("");
  });

  test("(c) reapplyKey flip re-measures against the NEW rects", () => {
    const { view, fitted } = mount({ reapplyKey: "closed" });
    expect(fitted.style.maxHeight).toBe(expectedPx());

    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    view.rerender(<Harness reapplyKey="entered" clips />);

    expect(fitted.style.maxHeight).toBe(expectedPx());
    expect(fitted.style.maxHeight).not.toBe(expectedPx({ ...geometry, clipBottom: CLIP_BOTTOM }));
  });

  test("(d) the positioned offsetParent is observed, not only the clip ancestor", () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(target: Element) {
          observed.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );

    const { outer, inner } = withOffsetParent(() => mount());

    expect(observed, "clip ancestor must still be observed").toContain(outer);
    // The extension: without it only the outer clip node is observed, and a
    // structural change inside the positioned parent never re-measures.
    expect(observed, "offsetParent must be observed too").toContain(inner);
  });

  test("(e) transitionend on the offsetParent re-measures", () => {
    const { inner, fitted } = withOffsetParent(() => mount());
    expect(fitted.style.maxHeight).toBe(expectedPx());

    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    fireEvent(inner, transitionEnd("transform"));
    flushFrames();

    expect(fitted.style.maxHeight).toBe(expectedPx());
  });

  test("(e2) a DESCENDANT's transitionend does NOT re-measure", () => {
    const { inner, fitted } = withOffsetParent(() => mount());
    const before = fitted.style.maxHeight;

    // transitionend BUBBLES. The offsetParent here is the menu panel, whose
    // descendants include ~20 rows each carrying `transition-colors`, so an
    // unscoped listener re-measures — forcing a synchronous reflow — on every
    // hover fade. The signal this hook wants is the POSITIONED ANCESTOR's own
    // transition settling, not any descendant's.
    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    const child = document.createElement("div");
    inner.appendChild(child);
    fireEvent(child, transitionEnd("transform", true));
    flushFrames();

    expect(fitted.style.maxHeight, "a descendant transition forced a re-measure").toBe(before);

    // ...and the offsetParent's OWN transitionend still does re-measure.
    fireEvent(inner, transitionEnd("transform"));
    flushFrames();
    expect(fitted.style.maxHeight).toBe(expectedPx());
  });

  test("(f) no ResizeObserver: measures once and still re-applies on window resize", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    expect(typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver).not.toBe("function");

    // Must not throw during render of the very overlay it is sizing.
    const { fitted } = mount();
    expect(fitted.style.maxHeight).toBe(expectedPx());

    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    fireEvent(window, new Event("resize"));
    flushFrames();

    expect(fitted.style.maxHeight).toBe(expectedPx());
  });

  test("(g) a burst of window resizes coalesces to ONE apply per frame", () => {
    const { fitted } = mount();
    // Mount costs TWO applies today: the layout effect runs, then the ref
    // callback's `attachCount` bump re-runs it. Known debt, tracked as
    // BL-FITWITHINCLIP-DOUBLE-MOUNT-MEASURE — pinned here so a change to the
    // mount path is visible rather than silently absorbed into the delta below.
    const afterMount = applyCount;
    expect(afterMount, "mount measure count changed").toBe(2);

    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    for (let i = 0; i < 12; i += 1) fireEvent(window, new Event("resize"));

    // The whole point: a resize BURST buys exactly one frame, not one reflow
    // per event. Uncoalesced, this reads 12.
    expect(applyCount - afterMount, "resize events ran apply() synchronously").toBe(0);
    expect(frames.size, "a burst must schedule exactly one frame").toBe(1);

    flushFrames();
    expect(applyCount - afterMount, "the frame must apply exactly once").toBe(1);
    expect(fitted.style.maxHeight).toBe(expectedPx());
  });

  test("(g2) the MOUNT path stays synchronous — no frame needed for the first cap", () => {
    const { fitted } = mount();

    // Deferring the mount measure to a frame reintroduces the bug the hook
    // exists to prevent: one painted frame with the overlay uncapped.
    expect(fitted.style.maxHeight, "first cap was deferred to a frame").toBe(expectedPx());
    expect(frames.size, "mount must not schedule a frame").toBe(0);
  });

  test("(g3) unmount cancels a pending frame instead of applying to a dead node", () => {
    const { view } = mount();
    fireEvent(window, new Event("resize"));
    expect(frames.size).toBe(1);

    view.unmount();

    expect(cancelledFrames, "the pending frame outlived the component").toHaveLength(1);
    expect(frames.size).toBe(0);
  });

  test("(g4) a non-transform transitionend does not re-measure", () => {
    const { inner, fitted } = withOffsetParent(() => mount());
    const before = applyCount;

    // The panel animates `transition-[opacity,transform]`, so every entrance
    // fires TWO transitionend events on the same node. Only the last one to
    // settle carries final geometry; applying on both doubles the reflow.
    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    fireEvent(inner, transitionEnd("opacity"));
    flushFrames();

    expect(applyCount - before, "an opacity transition forced a re-measure").toBe(0);
    expect(fitted.style.maxHeight).toBe(expectedPx({ ...geometry, clipBottom: CLIP_BOTTOM }));

    fireEvent(inner, transitionEnd("transform"));
    flushFrames();
    expect(fitted.style.maxHeight).toBe(expectedPx());
  });
});
