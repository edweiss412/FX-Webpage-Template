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
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";

import { StrictMode, useEffect, useState } from "react";

import { useFitWithinClip } from "@/components/admin/useFitWithinClip";
import { premiseHolds } from "../../_shared/premise";
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
    // ONE attach is ONE measure. The ref callback owns the wiring and returns
    // its teardown, so nothing re-runs the measure behind it. Pinned here so a
    // regression to two is visible rather than silently absorbed into the
    // coalescing delta below.
    const afterMount = applyCount;
    expect(afterMount, "mount measure count changed").toBe(1);

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

  test("(g5) warns ONCE when the floor overrides the room and the overlay overhangs", () => {
    const warn = vi.spyOn(console, "debug").mockImplementation(() => {});
    // Anchor past the clip edge: the floor wins, so the overlay is written
    // taller than the room it has and overhangs. Silent before this warning.
    geometry = { fittedTop: 700, clipBottom: CLIP_BOTTOM };

    const { fitted } = mount();
    expect(fitted.style.maxHeight).toBe(expectedPx());
    expect(warn, "the overhang stayed silent").toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/overhang|clip/i);

    // Re-measures must not re-warn: apply() runs on every resize, and a warning
    // per frame during a drag would bury the one that mattered.
    for (let i = 0; i < 5; i += 1) fireEvent(window, new Event("resize"));
    flushFrames();
    expect(warn, "warned again on re-measure").toHaveBeenCalledTimes(1);
  });

  test("(g6) does NOT warn when the overlay genuinely fits", () => {
    const warn = vi.spyOn(console, "debug").mockImplementation(() => {});
    mount();
    fireEvent(window, new Event("resize"));
    flushFrames();
    expect(warn).not.toHaveBeenCalled();
  });

  test("(h) one attach walks the ancestor chain exactly once", () => {
    // Counts `getComputedStyle` on ANCESTORS only; the fitted node's own
    // declared-cap read is excluded, so the number is the walk and nothing else.
    const seen: string[] = [];
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const data = (el as HTMLElement).dataset;
      const id = data?.["testid"] ?? "";
      if (id !== "fitted") seen.push(id);
      const clips = data?.["clips"] === "true";
      return {
        overflowX: clips ? "clip" : "visible",
        overflowY: clips ? "clip" : "visible",
        maxHeight: id === "fitted" ? `${DECLARED_CAP}px` : "none",
      } as unknown as CSSStyleDeclaration;
    });

    const { fitted } = mount();

    // DERIVED from the rendered fixture, never typed: walk the real ancestor
    // chain the way the hook does, up to and INCLUDING the first non-visible
    // overflow, and take that as the expectation. A hardcoded ["inner","outer"]
    // would drift silently the moment the fixture's nesting changed.
    const expected: string[] = [];
    for (let el = fitted.parentElement; el !== null; el = el.parentElement) {
      const id = el.dataset["testid"];
      if (id === undefined) break;
      expected.push(id);
      if (el.dataset["clips"] === "true") break;
    }

    // PREMISE (this case's own inputs): the chain must be at least two deep and
    // must actually clip, or one walk and two walks are the same number and the
    // assertion below cannot discriminate.
    premiseHolds(
      `the fixture walks ${expected.length} ancestors and clips at the last of them`,
      expected.length >= 2 && fitted.closest('[data-clips="true"]') !== null,
    );
    expect(seen, "one attach must walk the ancestor chain once").toEqual(expected);
  });

  test("(h2) the ref callback with a null node: no measure, no throw", () => {
    // Unreachable under React 19 cleanup refs — React calls the returned
    // teardown instead of re-invoking with null — but `RefCallback` admits it,
    // and returning `undefined` there is what React expects.
    //
    // `renderHook` hands back the callback directly. Two earlier drafts were
    // worse: the first read a property the harness never sets, so the call was
    // a no-op and the case asserted nothing; the second captured into an outer
    // variable during render, which `react-hooks/globals` rejects as a render
    // side effect, and rightly.
    const { result } = renderHook(() => useFitWithinClip("k"));
    const before = applyCount;

    // PREMISE (own inputs): a callback must actually have been returned, or
    // every assertion below is about nothing.
    premiseHolds("the hook returned a ref callback", typeof result.current === "function");

    expect(() => result.current(null)).not.toThrow();
    expect(applyCount - before, "a null node must not measure").toBe(0);
  });

  test("(h3) after unmount, a resize does not measure a detached node", () => {
    const { view } = mount();
    const afterMount = applyCount;
    view.unmount();
    fireEvent(window, new Event("resize"));
    flushFrames();
    // Red under M13 (the whole teardown removed): the listener would still be
    // attached and `nodeRef` would still point at the detached node, so this
    // resize would measure. M3 alone (dropping only `nodeRef.current = null`)
    // does NOT reach here — the listener is gone either way.
    expect(applyCount - afterMount, "a resize after unmount measured a dead node").toBe(0);
  });

  test("(h12) the ResizeObserver callback re-measures against the new geometry", () => {
    const observed: Element[] = [];
    const constructed: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          constructed.push(cb);
        }
        observe(target: Element) {
          observed.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );

    const { outer, inner, fitted } = withOffsetParent(() => mount());
    expect(fitted.style.maxHeight).toBe(expectedPx());

    // PREMISE (this case's own inputs): the hook must have handed the
    // constructor a callback AND observed both ancestors. The COUNT is not
    // asserted — it differs by tree, and a `=== 1` premise would abort before
    // the assertion on the very tree this case exists to pin.
    premiseHolds(
      "the hook constructed an observer and observed both ancestors",
      constructed.length >= 1 && observed.includes(outer) && observed.includes(inner),
    );
    // The LAST is the live one: a torn-down earlier instance must not be fired.
    const fire = constructed[constructed.length - 1];
    if (fire === undefined) throw new Error("unreachable: premise asserted length >= 1");

    for (const target of [outer, inner]) {
      geometry = { ...geometry, clipBottom: geometry.clipBottom - 40 };
      fire([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      flushFrames();
      expect(
        fitted.style.maxHeight,
        `a resize reported for ${String(target.getAttribute("data-testid"))} did not re-measure`,
      ).toBe(expectedPx());
    }
  });

  test("(h21) N to D: an observer exists with nothing clipping, and teardown disconnects it", () => {
    // Four rounds of the inventory claimed state N holds no observer. It does:
    // with no clip to watch, the POSITIONED ancestor is watched regardless.
    const observedPer: string[][] = [];
    let disconnected = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private mine: string[] = [];
        constructor(_cb: ResizeObserverCallback) {
          observedPer.push(this.mine);
        }
        observe(t: Element) {
          this.mine.push((t as HTMLElement).dataset["testid"] ?? "?");
        }
        unobserve() {}
        disconnect() {
          disconnected += 1;
        }
      },
    );

    const { view } = withOffsetParent(() => mount({ clips: false }));

    // PREMISE (own inputs): nothing may be clipping, or this is the F case.
    premiseHolds(
      "the fixture does not clip",
      screen.getByTestId("outer").dataset["clips"] === undefined,
    );
    expect(observedPer, "one observer is constructed even with no clip").toHaveLength(1);
    expect(
      observedPer[0],
      "the positioned ancestor is observed; there is no clip to observe",
    ).toEqual(["inner"]);

    view.unmount();
    expect(disconnected, "the teardown must disconnect the unclipped observer").toBe(1);
  });

  test("(h9) a re-render that changes nothing costs nothing", () => {
    const { view } = mount({ reapplyKey: "k" });
    const after = applyCount;
    for (let i = 0; i < 3; i += 1) view.rerender(<Harness reapplyKey="k" clips />);
    // The ONLY case that can see an identity-churning ref callback: every other
    // assertion in this suite is about a single attach.
    expect(applyCount - after, "an unchanged re-render measured").toBe(0);
  });

  test("(h18) the hook is called and its ref is never attached", () => {
    // PublishedToggle's DEFAULT `card` variant: the hook runs for rules-of-hooks
    // reasons and the returned callback is never used.
    function NeverAttached({ n }: { n: number }) {
      useFitWithinClip(n);
      return <div data-testid="outer" data-clips="true" />;
    }
    const view = render(<NeverAttached n={1} />);
    const after = applyCount;
    view.rerender(<NeverAttached n={2} />);
    view.rerender(<NeverAttached n={3} />);
    expect(applyCount - after, "a hook whose ref never attaches must not measure").toBe(0);
  });

  test("(h19) N to F: a SIGNAL writes a cap where none existed", () => {
    // Neither F<->N edge is reachable by a re-render. With a stable ref and an
    // unchanged reapplyKey a re-render does nothing at all, even when the DOM's
    // clip status changed in that same commit — so this case is driven by a
    // signal, and asserts that negative FIRST.
    const { view, fitted } = mount({ clips: false, reapplyKey: "k" });
    expect(fitted.style.maxHeight, "nothing clips, so nothing is capped").toBe("");

    view.rerender(<Harness reapplyKey="k" clips />);
    expect(
      fitted.style.maxHeight,
      "a stable-ref re-render must not re-measure, even as the clip status changes",
    ).toBe("");

    fireEvent(window, new Event("resize"));
    flushFrames();
    // Derived from the fixture geometry via the real arithmetic, never typed.
    expect(fitted.style.maxHeight, "the signal must WRITE a cap where none existed").toBe(
      expectedPx(),
    );
  });

  test("(h20) F to N: a SIGNAL removes the stale cap", () => {
    const { view, fitted } = mount({ clips: true, reapplyKey: "k" });
    // PREMISE (own inputs): a cap must exist first, or its removal is vacuous.
    premiseHolds("a fitted cap exists before the transition", fitted.style.maxHeight !== "");
    const capped = fitted.style.maxHeight;

    view.rerender(<Harness reapplyKey="k" clips={false} />);
    expect(fitted.style.maxHeight, "a stable-ref re-render must not re-measure").toBe(capped);

    fireEvent(window, new Event("resize"));
    flushFrames();
    expect(fitted.style.maxHeight, "the signal must REMOVE the stale cap").toBe("");
  });

  test("(h15) the ReSyncButton lifecycle: one render, one apply, one walk per appearance", () => {
    // No reapplyKey; the node sits behind a flag on the SAME owner. Spec §0.1's
    // first row. Counts RENDERS as well as applies, because the render halving
    // is this arc's actual win — the counter fired setAttachCount on every
    // attach AND detach, each a state update re-rendering the owner subtree.
    const renderLog: number[] = [];
    const seen: string[] = [];
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const data = (el as HTMLElement).dataset;
      const id = data?.["testid"] ?? "";
      if (id !== "fitted") seen.push(id);
      const clips = data?.["clips"] === "true";
      return {
        overflowX: clips ? "clip" : "visible",
        overflowY: clips ? "clip" : "visible",
        maxHeight: id === "fitted" ? `${DECLARED_CAP}px` : "none",
      } as unknown as CSSStyleDeclaration;
    });
    function Resync({ show }: { show: boolean }) {
      renderLog.push(1);
      const fit = useFitWithinClip();
      return (
        <div data-testid="outer" data-clips="true">
          <div data-testid="inner">{show ? <div data-testid="fitted" ref={fit} /> : null}</div>
        </div>
      );
    }
    const view = render(<Resync show={false} />);
    const base = { r: renderLog.length, a: applyCount, w: seen.length };

    view.rerender(<Resync show />);

    expect(renderLog.length - base.r, "one owner render per appearance").toBe(1);
    expect(applyCount - base.a, "one apply per appearance").toBe(1);
    expect(seen.length - base.w, "one ancestor walk per appearance").toBe(2);
  });

  test("(h16) the PublishedToggle lifecycle: the key IS the mounting condition, both directions", () => {
    // One boolean gates both the reapplyKey and the node, so the first error is
    // a key change AND an attach in one commit (one attach, NO detach — nothing
    // was attached), and the close is a key change AND a detach.
    const renderLog: number[] = [];
    function Toggle({ err }: { err: boolean }) {
      renderLog.push(1);
      const fit = useFitWithinClip(err);
      return (
        <div data-testid="outer" data-clips="true">
          <div data-testid="inner">{err ? <div data-testid="fitted" ref={fit} /> : null}</div>
        </div>
      );
    }
    const view = render(<Toggle err={false} />);
    let base = { r: renderLog.length, a: applyCount };

    view.rerender(<Toggle err />);
    expect(renderLog.length - base.r, "first error: one owner render").toBe(1);
    expect(applyCount - base.a, "first error: one apply, not a detach-then-attach").toBe(1);

    base = { r: renderLog.length, a: applyCount };
    view.rerender(<Toggle err={false} />);
    expect(renderLog.length - base.r, "close: one owner render").toBe(1);
    expect(applyCount - base.a, "close: teardown only, no measure").toBe(0);
  });

  test("(h17) the AttentionMenuPanel lifecycle: node present at ITS first render, then the entrance flip", () => {
    // The panel mounts only while open and renders the node unconditionally, so
    // from the hook's owner the node is present at first render — the shape two
    // drafts of the spec dismissed as used by no route. `entered` then flips
    // from a mount-scoped rAF, which re-attaches. Both snapshots are asserted
    // separately: a single cumulative number is unsatisfiable without
    // suppressing that re-attach, and the re-attach is load-bearing (the
    // scale-95 entrance distorts the measured rect).
    const renderLog: number[] = [];
    function Panel() {
      renderLog.push(1);
      const [entered, setEntered] = useState(false);
      const fit = useFitWithinClip(entered);
      useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
      }, []);
      return (
        <div data-testid="outer" data-clips="true">
          <div data-testid="inner">
            <div data-testid="fitted" ref={fit} />
          </div>
        </div>
      );
    }
    function Host({ open }: { open: boolean }) {
      return open ? <Panel /> : <div data-testid="outer" data-clips="true" />;
    }

    const view = render(<Host open={false} />);
    const base = { r: renderLog.length, a: applyCount };

    view.rerender(<Host open />);
    expect(renderLog.length - base.r, "attach: one owner render").toBe(1);
    expect(applyCount - base.a, "attach: one apply").toBe(1);

    act(() => {
      flushFrames();
    });
    expect(renderLog.length - base.r, "settled: two owner renders").toBe(2);
    expect(applyCount - base.a, "settled: two applies, the entrance re-attach included").toBe(2);
  });

  test("(h13) Strict Mode replays the cleanup-returning ref, and the counts are pinned AS they are", () => {
    // React 19 replays a callback ref that returns a cleanup. This is
    // DEVELOPMENT-only — the symbols are absent from the production react-dom
    // bundle — so no admin pays it. Pinned at what it actually is rather than
    // wished down: the ReSyncButton shape's dev apply count goes 1 -> 2, which
    // is the arc's one regression, and its render count still halves 4 -> 2.
    const renderLog: number[] = [];
    function Resync({ show }: { show: boolean }) {
      renderLog.push(1);
      const fit = useFitWithinClip();
      return (
        <div data-testid="outer" data-clips="true">
          <div data-testid="inner">{show ? <div data-testid="fitted" ref={fit} /> : null}</div>
        </div>
      );
    }
    const view = render(
      <StrictMode>
        <Resync show={false} />
      </StrictMode>,
    );
    const base = { r: renderLog.length, a: applyCount };

    view.rerender(
      <StrictMode>
        <Resync show />
      </StrictMode>,
    );

    expect(renderLog.length - base.r, "Strict Mode: two owner renders per appearance").toBe(2);
    expect(
      applyCount - base.a,
      "Strict Mode: the replay costs a second apply, and that is EXPECTED",
    ).toBe(2);
  });

  test("(h22) D to N: a re-attach onto a chain that stopped clipping", () => {
    const observedPer: string[][] = [];
    let disconnected = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private mine: string[] = [];
        constructor(_cb: ResizeObserverCallback) {
          observedPer.push(this.mine);
        }
        observe(t: Element) {
          this.mine.push((t as HTMLElement).dataset["testid"] ?? "?");
        }
        unobserve() {}
        disconnect() {
          disconnected += 1;
        }
      },
    );

    const { view, fitted } = withOffsetParent(() => mount({ clips: true, reapplyKey: 1 }));
    // PREMISE (own inputs): a cap must exist first, or "removed" is vacuous.
    premiseHolds("a fitted cap exists before the re-attach", fitted.style.maxHeight !== "");

    withOffsetParent(() => view.rerender(<Harness reapplyKey={2} clips={false} />));

    expect(observedPer.length, "the re-attach builds a FRESH observer").toBe(2);
    expect(
      observedPer[1],
      "nothing clips now, so only the positioned ancestor is observed",
    ).toEqual(["inner"]);
    expect(disconnected, "the previous observer is disconnected").toBeGreaterThanOrEqual(1);
    expect(fitted.style.maxHeight, "the stale cap must be removed").toBe("");
  });

  test("(h8) a reapplyKey change costs one apply and one walk", () => {
    const seen: string[] = [];
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const data = (el as HTMLElement).dataset;
      const id = data?.["testid"] ?? "";
      if (id !== "fitted") seen.push(id);
      const clips = data?.["clips"] === "true";
      return {
        overflowX: clips ? "clip" : "visible",
        overflowY: clips ? "clip" : "visible",
        maxHeight: id === "fitted" ? `${DECLARED_CAP}px` : "none",
      } as unknown as CSSStyleDeclaration;
    });
    const { view } = mount({ clips: true, reapplyKey: "closed" });
    const base = { a: applyCount, w: seen.length };

    view.rerender(<Harness reapplyKey="entered" clips />);

    expect(applyCount - base.a, "a key change costs exactly one apply").toBe(1);
    expect(seen.length - base.w, "a key change costs exactly one ancestor walk").toBe(2);
  });

  test("(h14) the live conditional-host shape: ONE owner render per appearance", () => {
    // The arc's headline in its minimal form. The counter took two.
    const renderLog: number[] = [];
    function Owner({ show }: { show: boolean }) {
      renderLog.push(1);
      const fit = useFitWithinClip("k");
      return (
        <div data-testid="outer" data-clips="true">
          <div data-testid="inner">{show ? <div data-testid="fitted" ref={fit} /> : null}</div>
        </div>
      );
    }
    const view = render(<Owner show={false} />);
    const base = { r: renderLog.length, a: applyCount };
    view.rerender(<Owner show />);
    expect(renderLog.length - base.r, "one owner render per appearance").toBe(1);
    expect(applyCount - base.a, "one apply per appearance").toBe(1);
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

/**
 * Site-transition pins (scroll-clamp spec §5.4). Regression pins for the
 * withNaturalSize migration: green on the pre-migration tree by design; their
 * red condition is a defective migration (mutants A/B in the plan).
 */
describe("useFitWithinClip — cap-application transition pins (scroll-clamp spec §5.4)", () => {
  test("family A: fitted→unclipped removes the stale fit instead of retaining it", () => {
    const { fitted, view } = mount({ clips: true, reapplyKey: 1 });
    expect(fitted.style.maxHeight).toBe(expectedPx());
    // PREMISE (own inputs): a fit was actually written, or removal is vacuous.
    premiseHolds("a fitted cap exists before the transition", fitted.style.maxHeight !== "");
    view.rerender(<Harness reapplyKey={2} clips={false} />);
    expect(
      fitted.style.maxHeight,
      "no clipping ancestor: the stale fit must be gone, not retained",
    ).toBe("");
  });

  test("family B: clipped→clipped expansion relaxes the cap from the DECLARED cap, not the stale fit", () => {
    // Style-sensitive computed style: the stock beforeEach mock always returns
    // the declared cap, which would hide a skipped natural-measure. Reading the
    // element's own inline value first makes the stale fit OBSERVABLE, which is
    // exactly what the live getComputedStyle does.
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const inline = (el as HTMLElement).style.maxHeight;
      const declared =
        (el as HTMLElement).dataset?.["testid"] === "fitted" ? `${DECLARED_CAP}px` : "none";
      return {
        overflowX: (el as HTMLElement).dataset?.["clips"] === "true" ? "clip" : "visible",
        overflowY: (el as HTMLElement).dataset?.["clips"] === "true" ? "clip" : "visible",
        maxHeight: inline !== "" ? inline : declared,
      } as unknown as CSSStyleDeclaration;
    });
    const { fitted, view } = mount({ clips: true, reapplyKey: 1 });
    const staleFit = parseFloat(fitted.style.maxHeight);
    // PREMISE (own inputs): the first fit must be TIGHTER than the declared
    // cap, or a stale re-read is indistinguishable from a natural one.
    premiseHolds("the first fit is tighter than the declared cap", staleFit < DECLARED_CAP);
    geometry = { fittedTop: FITTED_TOP, clipBottom: 700 };
    // PREMISE: after growth the room exceeds the declared cap, so the correct
    // answer is the declared cap and the stale answer stays at the old fit.
    premiseHolds(
      "grown room exceeds the declared cap",
      700 - FITTED_TOP > DECLARED_CAP && staleFit < DECLARED_CAP,
    );
    view.rerender(<Harness reapplyKey={2} clips />);
    expect(
      fitted.style.maxHeight,
      "the re-fit must derive from the DECLARED cap (natural measure), not the stale inline fit",
    ).toBe(expectedPx({ fittedTop: FITTED_TOP, clipBottom: 700 }));
  });
});
