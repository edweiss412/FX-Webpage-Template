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
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const data = (el as HTMLElement).dataset;
    const clips = data?.["clips"] === "true";
    return {
      overflowX: clips ? "clip" : "visible",
      overflowY: clips ? "clip" : "visible",
      maxHeight: data?.["testid"] === "fitted" ? `${DECLARED_CAP}px` : "none",
    } as unknown as CSSStyleDeclaration;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
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
    fireEvent(inner, new Event("transitionend"));

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

    expect(fitted.style.maxHeight).toBe(expectedPx());
  });
});
