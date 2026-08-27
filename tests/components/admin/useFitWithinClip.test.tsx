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
/**
 * How much roomier the ALIAS fixture's outer node is than its shared one.
 * Non-zero on purpose: with equal bottoms a clip-role move produces the same
 * cap and no aliasing case could tell a re-target from a no-op.
 */
const ALIAS_OUTER_SLACK = 100;

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
 * Flush until no frame remains. A modelled initial observation takes two hops,
 * the delivery frame and then the coalescer's own, so a single `flushFrames()`
 * would count the first and miss the apply it buys.
 */
function flushUntilQuiet(max = 8): void {
  for (let i = 0; i < max && frames.size > 0; i += 1) flushFrames();
}

/**
 * One `apply()` run calls `getBoundingClientRect` on the fitted node exactly
 * once, so counting those calls counts APPLIES — the quantity under test.
 * Counting style writes instead would undercount: a re-measure that lands on
 * the same number still costs the forced reflow this test exists to bound.
 */
let applyCount: number;

/**
 * testids that `rectFor` reports as a 0x0 box. `ResizeObserver` initialises each
 * observation's last-reported size to (0, 0) and broadcasts only targets whose
 * current size DIFFERS, so observing an element that is currently zero-sized
 * fires nothing at all. That is the platform behaviour AC-8's second delta
 * class exists for, and this set is how a case reaches it.
 */
let zeroSized: Set<string>;

/**
 * Every `observe()` the hook issued on a target the stub was ALREADY holding.
 *
 * AC-9's second property, made structural. It was asserted per site through
 * `expectReconciled`, which is a call someone has to remember: whole-diff
 * round 2 found four sites that had not, and a sweep afterwards found four more
 * that still had not. A per-site assertion cannot cover a site that forgot it.
 * The stub records the violation itself and `afterEach` asserts the record is
 * empty, so every case using this stub is covered by construction and a case
 * added later is covered without being told.
 *
 * The per-site calls stay where they are: they assert exactly WHICH targets a
 * reconcile added, which is strictly more than "none was re-observed".
 */
let reobservedTargets: string[];

/**
 * Chain walks, counted exactly and independently of fixture depth: `apply()`
 * always begins its walk at the fitted node's parentElement, so one
 * `getComputedStyle` call on THAT node is one walk however deep the chain runs.
 * A case sets `walkAnchor` to the node it expects walks to start from.
 */
let walkAnchor: Element | null;
let walkCount: number;

/**
 * Both stubs resolve from the element's own data attributes on EVERY call, so
 * they are live from the first effect (the hook measures during the initial
 * render — anything installed after `render()` returns is already too late) and
 * a test can move the layout mid-run and provoke a genuine re-measure.
 */
function rectFor(el: Element): DOMRect {
  const id = (el as HTMLElement).dataset?.["testid"];
  if (id !== undefined && zeroSized.has(id)) {
    return {
      left: 0,
      right: 0,
      width: 0,
      top: 0,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => "",
    } as DOMRect;
  }
  const box =
    id === "outer"
      ? { top: 0, bottom: geometry.clipBottom }
      : id === "other"
        ? { top: 0, bottom: geometry.clipBottom + ALIAS_OUTER_SLACK }
        : id === "shared"
          ? { top: 0, bottom: geometry.clipBottom }
          : id === "mid"
            ? { top: 50, bottom: geometry.clipBottom }
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

/**
 * A `ResizeObserver` stub that models the one part of the platform contract
 * every other stub in this file leaves out: it delivers ONLY to targets it is
 * actually observing.
 *
 * The others accept a callback and let the test fire it at whatever node it
 * names, so a case that resizes an UNOBSERVED ancestor re-measures anyway and
 * any subscription assertion built on it is decorative. `resize()` returns
 * whether the target was live, which is the backlog row's transcript field
 * `deliverable` promoted from a log line to an assertion.
 *
 * The call LOGS are recorded separately from the target set, because a set
 * cannot answer "was an already-held target re-observed" or "in what order did
 * the attach observe" -- and neither question is visible in any apply count,
 * since a redundant `observe()` here delivers nothing at all.
 */
/**
 * AC-9's second property, asserted the only way it is visible: the observe LOG.
 *
 * A reconcile that re-observes an already-held target reaches the right target
 * SET, stays deliverable, and (under a stub that delivers only on demand) costs
 * no apply, so membership, deliverability and apply counts are all blind to it.
 * Whole-diff review round 2 found the addition paths asserting the first three
 * and none of them asserting this, which an implementation that re-observes
 * every desired target whenever the set GROWS would have passed.
 *
 * Used at every reconcile driven through the tracking stub. `(h12)` and `(h33)`
 * install their OWN stubs for their own subjects, so they are outside both this
 * helper and the structural recorder; stated rather than papered over, because
 * whole-diff round 4 caught the claim that it was called at every reconcile
 * full stop.
 */
function expectReconciled(
  state: { observeLog: readonly string[]; unobserveLog: readonly string[] },
  before: { observes: number; unobserves: number },
  expected: { added: readonly string[]; removed: readonly string[] },
): void {
  expect(
    state.observeLog.slice(before.observes),
    `observe log since the reconcile: ${state.observeLog.slice(before.observes).join(",")}`,
  ).toEqual(expected.added);
  // The REMOVAL half, which whole-diff round 4 found unproved for every mixed
  // difference shape: a reconcile that performs its additions and skips its
  // removals whenever both happen satisfies every membership, deliverability
  // and apply assertion in this file while retaining a stale signal source.
  // Both halves in one helper, so a site cannot cover one and forget the other.
  expect(
    state.unobserveLog.slice(before.unobserves),
    `unobserve log since the reconcile: ${state.unobserveLog.slice(before.unobserves).join(",")}`,
  ).toEqual(expected.removed);
}

/** The two log lengths a reconcile is measured against. */
function reconcileMark(state: { observeLog: readonly string[]; unobserveLog: readonly string[] }) {
  return { observes: state.observeLog.length, unobserves: state.unobserveLog.length };
}

function installTargetTrackingObserver({ deliverInitial = false } = {}) {
  const state = {
    targets: new Set<Element>(),
    observeLog: [] as string[],
    boxLog: [] as (string | undefined)[],
    unobserveLog: [] as string[],
    disconnects: 0,
    callbacks: [] as ResizeObserverCallback[],
  };
  const idOf = (el: Element): string => (el as HTMLElement).dataset["testid"] ?? "?";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeObserverCallback) {
        state.callbacks.push(cb);
      }
      observe(t: Element, opts?: ResizeObserverOptions) {
        if (state.targets.has(t)) reobservedTargets.push(idOf(t));
        state.targets.add(t);
        state.observeLog.push(idOf(t));
        // Recorded so a MID-LIFE reconcile can be checked for it. `(h33)` moves
        // `reapplyKey`, which tears down and re-attaches, so every call it sees
        // is an attach call and it cannot speak for the reconcile path at all.
        state.boxLog.push(opts?.box);
        // OFF by default. AC-8's cost rule is ABOUT the initial observation, so
        // its cases cannot run without this; every other case's subject is
        // target membership, and coupling those to delivery behaviour they are
        // not about makes their counts unreadable.
        //
        // Zero-sized targets deliver NOTHING, which is the platform behaviour
        // the 0x0 delta class turns on, and modelling it is the only way a case
        // can tell that class from the sized one.
        if (deliverInitial && t.getBoundingClientRect().height > 0) {
          const cb = state.callbacks[state.callbacks.length - 1];
          if (cb !== undefined) {
            requestAnimationFrame(() => {
              cb([{ target: t } as unknown as ResizeObserverEntry], {} as ResizeObserver);
            });
          }
        }
      }
      unobserve(t: Element) {
        state.targets.delete(t);
        state.unobserveLog.push(idOf(t));
      }
      disconnect() {
        state.targets.clear();
        state.disconnects += 1;
      }
    },
  );
  /** Fires a resize for `target`, or returns false without firing when it is
   *  not observed. The LAST callback is the live one: a torn-down earlier
   *  instance must never be fired. */
  const resize = (target: Element): boolean => {
    if (!state.targets.has(target)) return false;
    const fire = state.callbacks[state.callbacks.length - 1];
    if (fire === undefined) return false;
    fire([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    return true;
  };
  return { state, resize };
}

/**
 * Resolves `offsetParent` to the nearest ancestor carrying `data-positioned`,
 * so a case can MOVE the positioned ancestor, or remove it, without a
 * re-attach. `withOffsetParent` (plain `parentElement`) is left exactly as it
 * is: every existing case keeps its own stub.
 */
function withMarkedOffsetParent<T>(fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    get() {
      return (this as HTMLElement).parentElement?.closest('[data-positioned="true"]') ?? null;
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

/**
 * THREE levels, so the positioned role can move between two nodes NEITHER of
 * which is the clip. On the two-level `Harness` the only other node is `outer`,
 * which is already held for the CLIP role, so moving the positioned role onto
 * it proves nothing: "outer is observed" and its deliverability are both
 * satisfied by the clip subscription (plan review round 1).
 *
 * A separate fixture rather than a level added to `Harness`: under
 * `withOffsetParent` the offsetParent IS `parentElement`, so a third level
 * would silently rewrite (d), (h12), (h21) and (h22).
 */
function ThreeLevelHarness({
  reapplyKey,
  positionedOn = "inner",
}: {
  reapplyKey?: unknown;
  positionedOn?: "inner" | "mid" | "none";
}) {
  const fitRef = useFitWithinClip(reapplyKey);
  return (
    <div data-testid="outer" data-clips="true">
      <div data-testid="mid" data-positioned={positionedOn === "mid" ? "true" : undefined}>
        <div data-testid="inner" data-positioned={positionedOn === "inner" ? "true" : undefined}>
          <div data-testid="fitted" ref={fitRef} />
        </div>
      </div>
    </div>
  );
}

/**
 * ONE element holds BOTH roles. Three nodes, not two: `shared` is the clip
 * ancestor and the positioned one at the same time, and `other` exists so a
 * role can move OFF the shared node without leaving the tree.
 *
 * The default `Harness` cannot express this and must not be made to: it keeps
 * its two ancestors distinct on purpose, and collapsing them is what made case
 * (d) tautological in the first place.
 *
 * `ResizeObserver` stores element TARGETS, not role-scoped subscriptions, so a
 * per-role `unobserve` here removes a target the other role still wants. That
 * is the whole subject of these cases.
 */
function AliasHarness({
  reapplyKey,
  clipOn = "shared",
  positionedOn = "shared",
}: {
  reapplyKey?: unknown;
  clipOn?: "shared" | "other";
  positionedOn?: "shared" | "other";
}) {
  const fitRef = useFitWithinClip(reapplyKey);
  return (
    <div
      data-testid="other"
      data-clips={clipOn === "other" ? "true" : undefined}
      data-positioned={positionedOn === "other" ? "true" : undefined}
    >
      <div
        data-testid="shared"
        data-clips={clipOn === "shared" ? "true" : undefined}
        data-positioned={positionedOn === "shared" ? "true" : undefined}
      >
        <div data-testid="fitted" ref={fitRef} />
      </div>
    </div>
  );
}

/** Its own mount helper: `mount()` calls `getByTestId("inner")`, which this
 *  tree has no node for, so reusing it would throw before the first assertion
 *  and a case that throws in setup pins nothing. */
function mountAlias(props: Parameters<typeof AliasHarness>[0] = {}) {
  const view = render(<AliasHarness {...props} />);
  return {
    view,
    other: screen.getByTestId("other"),
    shared: screen.getByTestId("shared"),
    fitted: screen.getByTestId("fitted"),
  };
}

beforeEach(() => {
  geometry = { fittedTop: FITTED_TOP, clipBottom: CLIP_BOTTOM };
  frames = new Map();
  nextFrameId = 1;
  cancelledFrames = [];
  applyCount = 0;
  zeroSized = new Set();
  reobservedTargets = [];
  walkAnchor = null;
  walkCount = 0;
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
    if (walkAnchor !== null && el === walkAnchor) walkCount += 1;
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
  // ORDER IS LOAD-BEARING: tear down FIRST, assert LAST, on a captured copy.
  //
  // An assertion that throws here skips everything after it, so asserting
  // before `cleanup()` leaves the failing case's DOM mounted and the NEXT case
  // finds two `outer` nodes and dies of `Found multiple elements`. That is not
  // hypothetical: it silently inflated this suite's recorded mutant red lists,
  // because a case listed as reddening a plant had merely inherited the
  // previous case's DOM. Whole-diff round 4 disputed one such row and was right
  // about it for a reason neither of us had yet found.
  const reobserved = [...reobservedTargets];
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // AC-9's second property, over every case that used the tracking stub. A
  // redundant `observe()` reaches the right target set, stays deliverable, and
  // costs no apply under a stub that delivers on demand, so this is the only
  // signal that sees it at all.
  expect(reobserved, "an already-held target was re-observed").toEqual([]);
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
    // NO mutant turns this case red, measured rather than predicted. An earlier
    // version of this comment claimed M13 (the whole teardown removed) reds it.
    // The run says otherwise: M13 reds (g) and (g3) and leaves THIS case
    // passing, because a leaked listener still schedules, `apply()` then returns
    // at the null-node guard, and an applyCount delta never moves. M3 (dropping
    // only `nodeRef.current = null`) does not reach here either. That gap is
    // what (h23) exists to close: it asserts on the SCHEDULER, which is the only
    // place a leaked listener is observable. The authoritative mutant-to-case
    // mapping is plan §5, and diff review round 3 caught this comment
    // contradicting it.
    expect(applyCount - afterMount, "a resize after unmount measured a dead node").toBe(0);
  });

  /*
   * (h23) and (h24) pin LISTENER REMOVAL, which (h3) above cannot see.
   *
   * Diff review round 1 finding 3: (h3) asserts an `applyCount` delta, and a
   * leaked listener does not move that count. The leaked handler still fires,
   * `coalescer.schedule` still books a frame, and `apply()` then returns at its
   * null-node guard because teardown cleared `nodeRef` — so the measure never
   * happens and the count sits still while the listener is attached. The
   * SCHEDULER is the only place the leak is observable, so these assert on
   * `frames` rather than on `applyCount`.
   *
   * Each carries a POSITIVE CONTROL firing the same event while still mounted.
   * Without it both cases would pass if the event scheduled nothing at all,
   * which is the vacuous pass this pair exists to rule out.
   */
  test("(h23) after unmount, a resize schedules NO frame: the window listener is really gone", () => {
    const { view } = mount();

    fireEvent(window, new Event("resize"));
    expect(frames.size, "control: a resize while MOUNTED must schedule a frame").toBe(1);
    flushFrames();

    view.unmount();
    fireEvent(window, new Event("resize"));

    expect(
      frames.size,
      "a resize after unmount scheduled a frame: the window listener leaked",
    ).toBe(0);
  });

  test("(h24) after unmount, transitionend on the former positioned ancestor schedules NO frame", () => {
    // The positioned ROLE never moves in this fixture, so the listener sits on
    // `inner` from the attach and stays there after withOffsetParent restores
    // the descriptor. This case pins teardown for the never-moved case; (h38)
    // pins it for a role that MOVED, which a teardown reading the attach-time
    // node would leak while still passing here.
    const { view, inner } = withOffsetParent(() => mount());

    fireEvent(inner, transitionEnd("transform"));
    expect(frames.size, "control: transitionend while MOUNTED must schedule a frame").toBe(1);
    flushFrames();

    view.unmount();
    fireEvent(inner, transitionEnd("transform"));

    expect(
      frames.size,
      "transitionend after unmount scheduled a frame: the ancestor listener leaked",
    ).toBe(0);
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

  test("(h25) a clip ancestor that STARTS clipping is subscribed by the correcting signal", () => {
    const { state, resize } = installTargetTrackingObserver();
    // No offsetParent stub, matching `(h19)`: unstubbed jsdom leaves the
    // positioned role unresolved, so the target set is exactly the clip role
    // and nothing below can be satisfied by the other slot.
    const { view, outer, fitted } = mount({ clips: false, reapplyKey: "k" });

    // PREMISE (this case's own inputs): nothing may be capped, and the ancestor
    // that WILL clip must not already be a target. Without both, every
    // assertion below is about nothing.
    premiseHolds(
      "nothing clips at attach and `outer` is not observed",
      fitted.style.maxHeight === "" && !state.targets.has(outer),
    );
    const mark = reconcileMark(state);

    view.rerender(<Harness reapplyKey="k" clips />);
    expect(
      fitted.style.maxHeight,
      "a stable-ref re-render must not re-measure, even as the clip status changes",
    ).toBe("");

    // One BRIDGING signal, from a source already observed at attach. `(h19)`
    // stops here; the defect is everything after it.
    fireEvent(window, new Event("resize"));
    flushFrames();
    const afterBridge = fitted.style.maxHeight;
    expect(afterBridge, "the bridging signal must write a cap where none existed").toBe(
      expectedPx(),
    );

    // THE DEFECT. `apply()` re-walks on every signal so the CAP corrects, but
    // the subscription set is resolved once at attach, so the newly clipping
    // ancestor is never observed and stays dark for the overlay's whole life.
    expect(state.targets.has(outer), "the newly clipping ancestor was not subscribed").toBe(true);
    expectReconciled(state, mark, { added: ["outer"], removed: [] });

    geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
    expect(resize(outer), "the new clip ancestor's own resize was not deliverable").toBe(true);
    flushFrames();

    expect(fitted.style.maxHeight).toBe(expectedPx());
    expect(fitted.style.maxHeight, "the geometry move did not take").not.toBe(afterBridge);
  });

  test("(h33) every observe requests the BORDER box", () => {
    const boxes: (string | undefined)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(_cb: ResizeObserverCallback) {}
        observe(_t: Element, opts?: ResizeObserverOptions) {
          boxes.push(opts?.box);
        }
        unobserve() {}
        disconnect() {}
      },
    );

    const { view } = withOffsetParent(() => mount({ clips: true, reapplyKey: "k" }));
    withOffsetParent(() => view.rerender(<Harness reapplyKey="k2" clips />));

    // PREMISE (own inputs): observe must actually have been called, or "every
    // call passes border-box" is vacuously true over an empty list.
    premiseHolds("the hook issued at least one observe", boxes.length > 0);

    // The cap comes from two `getBoundingClientRect()` reads, which are
    // BORDER-box viewport rectangles, while `observe()` defaults to the CONTENT
    // box. Padding toggled on an auto-height ancestor then moves the clip edge
    // with its content box unchanged, and nothing is delivered at all.
    //
    // LIMIT, stated here rather than left for a reader to find: jsdom computes
    // no layout, so this asserts the ARGUMENT, not the delivery it buys. The
    // behavioural cover is the real-browser suite.
    expect(
      boxes.every((b) => b === "border-box"),
      `observe boxes: ${boxes.join(",")}`,
    ).toBe(true);
  });

  test("(h26) the positioned role is re-resolved, between two NON-clip ancestors", () => {
    const { state, resize } = installTargetTrackingObserver();
    // The WHOLE body runs inside the stub: `withMarkedOffsetParent` restores the
    // prototype descriptor in its `finally`, so a re-render or an event fired
    // outside it reads jsdom's real `offsetParent` and the case tests nothing.
    withMarkedOffsetParent(() => {
      const view = render(<ThreeLevelHarness reapplyKey="k" positionedOn="inner" />);
      const outer = screen.getByTestId("outer");
      const mid = screen.getByTestId("mid");
      const inner = screen.getByTestId("inner");

      // PREMISE (this case's own inputs). The middle clause is the one that
      // makes this case discriminating: if `mid` were already a target, every
      // assertion below would be satisfied by the CLIP role and would prove
      // nothing about the positioned one.
      premiseHolds(
        "inner holds the positioned role, mid is not a target, outer is the clip",
        state.targets.has(inner) && !state.targets.has(mid) && state.targets.has(outer),
      );

      const mark = reconcileMark(state);
      view.rerender(<ThreeLevelHarness reapplyKey="k" positionedOn="mid" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      expect(state.targets.has(mid), "the new positioned ancestor is not observed").toBe(true);
      // AC-9's second half on an ADDITION path: `outer` is retained for the
      // clip role and must not be re-observed just because the set grew.
      expectReconciled(state, mark, { added: ["mid"], removed: ["inner"] });
      // AC-10's MID-LIFE half. `(h33)` can only see attach calls, because a
      // `reapplyKey` change tears the ref down and re-attaches it; this is a
      // reconcile on a live attachment, which is the other half of the claim.
      expect(state.boxLog.slice(mark.observes), "a reconcile observed the wrong box").toEqual([
        "border-box",
      ]);
      // The removal half at the target set and at deliverability, not only in
      // the log: a reconcile that adds and skips its removals retains a stale
      // signal source that nothing else in this file would notice.
      expect(state.targets.has(inner), "the former positioned ancestor is still a target").toBe(
        false,
      );
      expect(resize(inner), "a removed target was still deliverable").toBe(false);

      geometry = { ...geometry, clipBottom: CLIP_BOTTOM_AFTER };
      const before = screen.getByTestId("fitted").style.maxHeight;
      expect(resize(mid), "the new positioned ancestor's resize was not deliverable").toBe(true);
      flushFrames();
      const fitted = screen.getByTestId("fitted");
      expect(fitted.style.maxHeight).toBe(expectedPx());
      expect(fitted.style.maxHeight, "the geometry move did not take").not.toBe(before);

      // The listener follows the ROLE, or the identity check rejects the real
      // settle event and accepts nothing.
      fireEvent(mid, transitionEnd("transform"));
      expect(frames.size, "the new positioned ancestor's settle did not schedule").toBe(1);
      flushFrames();
      fireEvent(inner, transitionEnd("transform"));
      expect(frames.size, "the FORMER positioned ancestor still schedules").toBe(0);
    });
  });

  // ---- aliasing: ONE element holding both roles (spec §5.2) ----
  //
  // These five are drawn from the spec's derivation, not from a family count:
  // a per-role reconcile diverges from a set difference whenever a role is
  // touched while another role holds the same element. They assert the two
  // properties directly, so an arrangement the spec's table does not list
  // fails them too.

  test("(h27) (A,A) to (B,A): the clip role leaves an element the positioned role still holds", () => {
    const { state, resize } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const { view, shared, other } = mountAlias({
        reapplyKey: "k",
        clipOn: "shared",
        positionedOn: "shared",
      });

      // PREMISE (own inputs): both roles really are on ONE element and it is
      // the only target. Without the aliasing this is an ordinary re-target and
      // pins nothing a per-role reconcile gets wrong.
      premiseHolds(
        "one element holds both roles and is the sole target",
        state.targets.has(shared) && !state.targets.has(other) && state.targets.size === 1,
      );

      const mark = reconcileMark(state);
      view.rerender(<AliasHarness reapplyKey="k" clipOn="other" positionedOn="shared" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      // A per-role reconcile issues unobserve(shared) for the CLIP role, and
      // `shared` is the element the POSITIONED role still wants.
      expect(state.targets.has(shared), "the shared element was unobserved").toBe(true);
      expect(state.targets.has(other), "the new clip ancestor is not observed").toBe(true);
      // ...and the retained element is not re-observed on the way (AC-9).
      expectReconciled(state, mark, { added: ["other"], removed: [] });

      // ...and still DELIVERING, which is what a target set is for.
      const before = applyCount;
      expect(resize(shared), "the shared element's resize was not deliverable").toBe(true);
      flushFrames();
      expect(applyCount - before, "a deliverable resize did not re-measure").toBe(1);
    });
  });

  test("(h28) (A,A) to (A,B): the positioned role leaves an element the clip role still holds", () => {
    const { state, resize } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const { view, shared, other } = mountAlias({
        reapplyKey: "k",
        clipOn: "shared",
        positionedOn: "shared",
      });
      premiseHolds(
        "one element holds both roles and is the sole target",
        state.targets.has(shared) && !state.targets.has(other) && state.targets.size === 1,
      );

      const mark = reconcileMark(state);
      view.rerender(<AliasHarness reapplyKey="k" clipOn="shared" positionedOn="other" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      expect(state.targets.has(shared), "the shared element was unobserved").toBe(true);
      expect(state.targets.has(other), "the new positioned ancestor is not observed").toBe(true);
      expectReconciled(state, mark, { added: ["other"], removed: [] });
      expect(resize(shared), "the shared element's resize was not deliverable").toBe(true);
    });
  });

  test("(h29) (A,B) to (B,A): the roles swap and the target set does not", () => {
    const { state, resize } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const { view, shared, other } = mountAlias({
        reapplyKey: "k",
        clipOn: "other",
        positionedOn: "shared",
      });
      premiseHolds(
        "the two roles start on DIFFERENT elements, both observed",
        state.targets.has(other) && state.targets.has(shared),
      );
      const mark = reconcileMark(state);

      view.rerender(<AliasHarness reapplyKey="k" clipOn="shared" positionedOn="other" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      // The desired set is unchanged, so the difference is empty. A sequential
      // per-role reconcile ends holding ONE target whichever order it runs in.
      expectReconciled(state, mark, { added: [], removed: [] });
      expect(resize(other), "`other` stopped being deliverable across the swap").toBe(true);
      expect(resize(shared), "`shared` stopped being deliverable across the swap").toBe(true);
    });
  });

  test("(h30) (A,B) to (A,A): the roles collapse, and nothing already held is re-observed", () => {
    const { state, resize } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const { view, shared, other } = mountAlias({
        reapplyKey: "k",
        clipOn: "other",
        positionedOn: "shared",
      });
      premiseHolds(
        "the two roles start on DIFFERENT elements, both observed",
        state.targets.has(other) && state.targets.has(shared),
      );
      const mark = reconcileMark(state);

      // Both roles land on `other`, so `shared` is wanted by neither.
      view.rerender(<AliasHarness reapplyKey="k" clipOn="other" positionedOn="other" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      // The OBSERVE LOG carries this case's whole discriminating power. The
      // defective sequence is unobserve(shared) then observe(other), which
      // leaves the right SET and re-observes a live target: invisible to
      // deliverability, and invisible to any apply count, because a redundant
      // observe delivers nothing in this stub.
      expectReconciled(state, mark, { added: [], removed: ["shared"] });
      expect(resize(other), "the surviving target stopped being deliverable").toBe(true);
      expect(state.targets.has(shared), "an unwanted target survived").toBe(false);
    });
  });

  test("(h31) (A,B) to (B,B): the mirrored collapse, onto the other element", () => {
    const { state, resize } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const { view, shared, other } = mountAlias({
        reapplyKey: "k",
        clipOn: "other",
        positionedOn: "shared",
      });
      premiseHolds(
        "the two roles start on DIFFERENT elements, both observed",
        state.targets.has(other) && state.targets.has(shared),
      );
      const mark = reconcileMark(state);

      view.rerender(<AliasHarness reapplyKey="k" clipOn="shared" positionedOn="shared" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      expectReconciled(state, mark, { added: [], removed: ["other"] });
      expect(resize(shared), "the surviving target stopped being deliverable").toBe(true);
      expect(state.targets.has(other), "an unwanted target survived").toBe(false);
    });
  });

  // ---- the reconcile's own guards (spec AC-2, AC-3, AC-6, AC-7, AC-8, AC-9) ----

  test("(h32) AC-2: a signal that derives the SAME set issues no observer call", () => {
    const { state } = installTargetTrackingObserver();
    withOffsetParent(() => {
      const { outer, inner } = mount({ clips: true });
      premiseHolds(
        "both ancestors are observed at attach",
        state.targets.has(outer) && state.targets.has(inner),
      );
      const mark = reconcileMark(state);

      for (let i = 0; i < 3; i += 1) {
        fireEvent(window, new Event("resize"));
        flushFrames();
      }

      // Not an efficiency assertion. `observe()` delivers an initial
      // observation, so a reconcile that re-observes on every signal feeds its
      // own next signal and never reaches a fixed point (spec §4.3).
      expectReconciled(state, mark, { added: [], removed: [] });
    });
  });

  test("(h33b) AC-3: the attach observes clip then positioned, once each, on both fixtures", () => {
    const clipped = installTargetTrackingObserver();
    withOffsetParent(() => mount({ clips: true }));
    // ORDER, which a target set cannot express: the log can.
    expect(clipped.state.observeLog, "attach order or count changed").toEqual(["outer", "inner"]);
    expect(clipped.state.unobserveLog, "the attach unobserved something").toEqual([]);
    // The LOG alone is satisfied by two observers logging one target each.
    // `(h21)` pins a single observer for the unclipped fixture only.
    expect(clipped.state.callbacks.length, "the attach built more than one observer").toBe(1);
    cleanup();
    vi.unstubAllGlobals();

    const unclipped = installTargetTrackingObserver();
    withOffsetParent(() => mount({ clips: false }));
    // Nothing clips, so there is nothing to observe for the clip role, and
    // (h21) already pins that an observer still exists for the positioned one.
    expect(unclipped.state.observeLog, "the non-clipping attach changed").toEqual(["inner"]);
    expect(unclipped.state.callbacks.length, "the attach built more than one observer").toBe(1);
  });

  test("(h34) AC-6: a clip ancestor that STOPS clipping keeps its target", () => {
    const { state, resize } = installTargetTrackingObserver();
    const { view, outer, fitted } = mount({ clips: true, reapplyKey: "k" });
    premiseHolds(
      "the clip ancestor is observed and a cap exists",
      state.targets.has(outer) && fitted.style.maxHeight !== "",
    );
    const mark = reconcileMark(state);

    view.rerender(<Harness reapplyKey="k" clips={false} />);
    fireEvent(window, new Event("resize"));
    flushFrames();
    expect(fitted.style.maxHeight, "the stale cap survived").toBe("");

    // RETAINED. An observed ancestor is a signal source, and "nothing clips
    // right now" is not "this source is gone": dropping it would mean the same
    // ancestor clipping again delivers nothing at all (spec §4.1).
    expect(state.targets.has(outer), "the retained clip target was dropped").toBe(true);
    // Retaining is a no-op at the observer: the desired set never changed.
    expectReconciled(state, mark, { added: [], removed: [] });

    // ...and the proof that retaining is what matters: clipping again is
    // delivered by that node itself, with no bridging signal.
    view.rerender(<Harness reapplyKey="k" clips />);
    expect(resize(outer), "the re-clipping ancestor was not deliverable").toBe(true);
    flushFrames();
    expect(fitted.style.maxHeight, "the re-clip did not re-cap").toBe(expectedPx());
  });

  test("(h35) AC-6: a positioned ancestor that resolves NULL keeps its target and its listener", () => {
    const { state, resize } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const view = render(<ThreeLevelHarness reapplyKey="k" positionedOn="inner" />);
      const inner = screen.getByTestId("inner");
      premiseHolds("the positioned ancestor is observed at attach", state.targets.has(inner));
      const mark = reconcileMark(state);

      // `offsetParent` reads null for a `display: none` subtree, so this is the
      // hide-then-show path, not an exotic one.
      view.rerender(<ThreeLevelHarness reapplyKey="k" positionedOn="none" />);
      fireEvent(window, new Event("resize"));
      flushFrames();

      expect(state.targets.has(inner), "a null resolution dropped the target").toBe(true);
      expectReconciled(state, mark, { added: [], removed: [] });
      expect(resize(inner), "the retained positioned target was not deliverable").toBe(true);

      // FLUSH FIRST. `resize()` above already scheduled a frame, so asserting
      // `frames.size === 1` after the transitionend would be satisfied by THAT
      // frame whether the retained listener exists or not. Drain to zero, then
      // assert the listener puts one back.
      flushUntilQuiet();
      expect(frames.size, "the queue must be empty before the listener is probed").toBe(0);

      // The listener is retained with the role, so the shown-again overlay's
      // own entrance still re-measures.
      fireEvent(inner, transitionEnd("transform"));
      expect(frames.size, "the retained positioned listener was removed").toBe(1);
    });
  });

  test("(h36) AC-7: with no ResizeObserver the hook reconciles nothing and still re-measures", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    // PREMISE (own inputs): the constructor must really be absent, or this case
    // silently runs in the configuration it is not testing.
    premiseHolds(
      "no ResizeObserver constructor",
      typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== "function",
    );

    const { view, fitted } = mount({ clips: false, reapplyKey: "k" });
    expect(() => {
      view.rerender(<Harness reapplyKey="k" clips />);
      fireEvent(window, new Event("resize"));
      flushFrames();
    }, "a reconcile site threw with no observer").not.toThrow();

    expect(fitted.style.maxHeight, "the window path stopped writing the cap").toBe(expectedPx());
    cleanup();

    // The POSITIONED half of AC-7, which the clip-only fixture above cannot
    // reach: with no observer the reconcile skips the target set whole, but the
    // ROLES must still update, or the transitionend listener stops following
    // and an implementation that returns early would pass the assertions above.
    withMarkedOffsetParent(() => {
      const three = render(<ThreeLevelHarness reapplyKey="k" positionedOn="inner" />);
      const mid = screen.getByTestId("mid");
      const inner = screen.getByTestId("inner");
      premiseHolds(
        "still no ResizeObserver constructor for the positioned half",
        typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== "function",
      );

      three.rerender(<ThreeLevelHarness reapplyKey="k" positionedOn="mid" />);
      fireEvent(window, new Event("resize"));
      flushUntilQuiet();
      expect(frames.size, "the queue must be empty before the listener is probed").toBe(0);

      fireEvent(mid, transitionEnd("transform"));
      expect(frames.size, "the role did not follow with no observer").toBe(1);
      flushUntilQuiet();
      fireEvent(inner, transitionEnd("transform"));
      expect(frames.size, "the FORMER positioned ancestor still schedules").toBe(0);
    });
  });

  test("(h38) teardown removes the listener from the CURRENT role, not the attach-time node", () => {
    const { state } = installTargetTrackingObserver();
    withMarkedOffsetParent(() => {
      const view = render(<ThreeLevelHarness reapplyKey="k" positionedOn="inner" />);
      const mid = screen.getByTestId("mid");
      const mark = reconcileMark(state);

      // Move the role, so the listener is no longer where the attach put it.
      view.rerender(<ThreeLevelHarness reapplyKey="k" positionedOn="mid" />);
      fireEvent(window, new Event("resize"));
      flushUntilQuiet();
      expectReconciled(state, mark, { added: ["mid"], removed: ["inner"] });

      // PREMISE (own inputs): the listener must actually have moved, or this
      // case is (h24) again and says nothing new.
      fireEvent(mid, transitionEnd("transform"));
      premiseHolds("the listener moved to the current role", frames.size === 1);
      flushUntilQuiet();

      view.unmount();

      // A teardown that removes from the attach-time node passes (h24) and
      // leaks THIS listener. Only a teardown reading the current role clears it.
      fireEvent(mid, transitionEnd("transform"));
      expect(frames.size, "the moved listener outlived the component").toBe(0);
    });
  });

  test("(h37) AC-8: the cost of a reconcile is one apply only when it ADDS a target with a box", () => {
    const { state } = installTargetTrackingObserver({ deliverInitial: true });
    withMarkedOffsetParent(() => {
      const { view, other, shared, fitted } = mountAlias({
        reapplyKey: "k",
        clipOn: "other",
        positionedOn: "other",
      });
      walkAnchor = fitted.parentElement;
      premiseHolds(
        "both roles start on ONE element, so the next transition is an ADD",
        state.targets.size === 1 && state.targets.has(other),
      );

      // CLASS 1 — adds a target that has a box.
      const base1 = applyCount;
      const walk1 = walkCount;
      const mark1 = reconcileMark(state);
      view.rerender(<AliasHarness reapplyKey="k" clipOn="other" positionedOn="shared" />);
      fireEvent(window, new Event("resize"));
      flushFrames();
      const afterSignal1 = applyCount;
      const afterWalk1 = walkCount;
      expect(afterSignal1 - base1, "the signal itself must apply exactly once").toBe(1);
      expect(afterWalk1 - walk1, "the signal's own apply must carry exactly one walk").toBe(1);
      flushUntilQuiet();
      expect(applyCount - afterSignal1, "an added sized target must cost one apply").toBe(1);
      // A walk rides every apply, so the deltas match. "Unchanged" would be
      // wrong here and could never go green (plan review round 2).
      expect(walkCount - afterWalk1, "walks did not track applies").toBe(1);
      expect(state.targets.has(shared)).toBe(true);
      // AC-9 on the addition path, where the redundant and the legitimate
      // initial observations would coalesce into the same single extra apply
      // and the count could not tell them apart.
      expectReconciled(state, mark1, { added: ["shared"], removed: [] });

      // CLASS 3 — removes only. Back to both roles on `other`.
      const base3 = applyCount;
      const mark3 = reconcileMark(state);
      view.rerender(<AliasHarness reapplyKey="k" clipOn="other" positionedOn="other" />);
      fireEvent(window, new Event("resize"));
      flushFrames();
      const afterSignal3 = applyCount;
      expect(afterSignal3 - base3, "the signal itself must apply exactly once").toBe(1);
      flushUntilQuiet();
      expect(applyCount - afterSignal3, "a removal-only reconcile cost an apply").toBe(0);
      expectReconciled(state, mark3, { added: [], removed: ["shared"] });

      // CLASS 4 — neither. Same set, twice.
      const afterSignal4Base = applyCount;
      const mark4 = reconcileMark(state);
      fireEvent(window, new Event("resize"));
      flushFrames();
      const afterSignal4 = applyCount;
      flushUntilQuiet();
      expect(applyCount - afterSignal4, "an unchanged reconcile cost an apply").toBe(0);
      expectReconciled(state, mark4, { added: [], removed: [] });
      expect(afterSignal4 - afterSignal4Base, "the signal itself must apply exactly once").toBe(1);

      // CLASS 2 — adds a target that is currently 0x0. Both halves, because the
      // count alone is satisfied by a hook that simply SKIPS observe() for a
      // zero-sized target, which is the opposite of what is wanted and would
      // leave that ancestor permanently dark (plan review round 3).
      zeroSized.add("shared");
      const base2 = applyCount;
      const mark2 = reconcileMark(state);
      view.rerender(<AliasHarness reapplyKey="k" clipOn="other" positionedOn="shared" />);
      fireEvent(window, new Event("resize"));
      flushFrames();
      const afterSignal2 = applyCount;
      flushUntilQuiet();
      expect(applyCount - afterSignal2, "a zero-sized target delivered an observation").toBe(0);
      expect(afterSignal2 - base2, "the signal itself must apply exactly once").toBe(1);
      expectReconciled(state, mark2, { added: ["shared"], removed: [] });
      expect(state.targets.has(shared), "the zero-sized ancestor is not held").toBe(true);
    });
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
