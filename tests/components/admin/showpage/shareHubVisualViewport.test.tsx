// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/shareHubVisualViewport.test.tsx
 *
 * ShareHub is a FULL consumer of the placement policy, not a satellite of
 * HoverHelp's coverage (spec R10, §5 T-S*). Round-1 F6 found it missed entirely;
 * round-4 F2 found its zero-dimension recovery unproven while HoverHelp's was
 * proven. Both are pinned here.
 *
 * The Chromium e2e fixtures render HoverHelp, so a ShareHub-only regression
 * would survive every other layer.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const rotateMock = vi.hoisted(() => vi.fn());
const epochMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: rotateMock }));
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: epochMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ShareHub } from "@/components/admin/showpage/ShareHub";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { PopoverHostContext } from "@/components/admin/HoverHelp";

const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const SLUG = "aurora-fall-tour";
const TOKEN = "b".repeat(64);
const CREW = [{ id: "c1111111-1111-4111-8111-111111111111", name: "Alice", role: "A1" }];

type FrameCb = (t: number) => void;
let frames: Map<number, FrameCb>;
let nextId: number;
let cancelled: number[];

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
const VV = { width: 300, height: 250, offsetLeft: 400, offsetTop: 200 } as const;
const TRIGGER = { left: 450, top: 300, width: 24, height: 24 } as const;

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
  cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCb): number => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    cancelled.push(id);
    frames.delete(id);
  });
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
  vi.stubGlobal("CSS", { supports: () => false });
  rotateMock.mockReset();
  epochMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openHub(): HTMLElement {
  render(
    <ShareTokenProvider key={SHOW_ID} initialToken={TOKEN} initialEpoch={1}>
      <ShareHub
        slug={SLUG}
        showId={SHOW_ID}
        published
        archived={false}
        finalizeOwned={false}
        crewEmails={["alice@example.com"]}
        showTitle="Aurora Fall Tour"
        pickerCrew={CREW}
        archiveAction={async () => ({ ok: true }) as const}
        unarchiveAction={async () => {}}
      />
    </ShareTokenProvider>,
  );
  const kebab = screen.getByTestId("share-hub-kebab");
  stubRect(kebab.parentElement ?? kebab, TRIGGER);
  stubRect(kebab, TRIGGER);
  stubRect(document.body, { left: 0, top: 0, width: LAYOUT_W, height: LAYOUT_H });
  fireEvent.click(kebab);
  const pop = screen.getByTestId("share-hub-popover");
  stubRect(pop, { left: 0, top: 0, width: 308, height: 120 });
  return kebab;
}

describe("T-S2/T-S3: ShareHub subscribes to the visual viewport and then stops", () => {
  test("scroll schedules a frame while open", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    vi.stubGlobal("visualViewport", vv);
    openHub();
    frames.clear();
    vv.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBeGreaterThan(0);
  });

  test("resize schedules a frame while open", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    vi.stubGlobal("visualViewport", vv);
    openHub();
    frames.clear();
    vv.dispatchEvent(new Event("resize"));
    expect(frames.size).toBeGreaterThan(0);
  });

  test("after close, BOTH events on the ORIGINAL object are inert", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    vi.stubGlobal("visualViewport", vv);
    const kebab = openHub();
    fireEvent.click(kebab); // toggle closed
    frames.clear();
    vv.dispatchEvent(new Event("scroll"));
    vv.dispatchEvent(new Event("resize"));
    expect(frames.size).toBe(0);
  });
});

describe("T-S8: the coalescer THROTTLES, it does not debounce", () => {
  test("a burst of visualViewport events keeps ONE pending frame and cancels none", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    vi.stubGlobal("visualViewport", vv);
    openHub();
    frames.clear();
    cancelled = [];

    // A real pan fires ~80 of these (spec §3.1), faster than a frame boundary.
    for (let i = 0; i < 20; i++) vv.dispatchEvent(new Event("scroll"));

    // Debounce signature: 19 cancellations and a frame that keeps sliding, so
    // the panel does not move until the gesture STOPS. Throttle signature: the
    // first event's frame survives and runs on the next tick.
    expect(cancelled, "coalescer cancelled a pending frame mid-burst (debounce)").toEqual([]);
    expect(frames.size, "burst must collapse to exactly one pending frame").toBe(1);
  });
});

describe("T-S5: WebKit is excluded for ShareHub too", () => {
  test("no visualViewport listener is attached", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    const addSpy = vi.spyOn(vv, "addEventListener");
    vi.stubGlobal("visualViewport", vv);
    vi.stubGlobal("CSS", { supports: (p: string) => p === "-webkit-backdrop-filter" });

    openHub();
    // The class swept across BOTH consumers, not patched on one (round-2 F1).
    expect(addSpy).not.toHaveBeenCalled();

    frames.clear();
    vv.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(0);
  });
});

describe("T-S7: ShareHub's own zero-dimension recovery", () => {
  test("degenerate at open still subscribes, so a later resize restores tracking", () => {
    const vv = new VisualViewportStub(0, 0, 0, 0);
    vi.stubGlobal("visualViewport", vv);
    openHub();

    // Round-4 F2: proving this for HoverHelp alone left the hole open here,
    // because every Chromium e2e fixture renders HoverHelp.
    vv.width = VV.width;
    vv.height = VV.height;
    vv.offsetLeft = VV.offsetLeft;
    vv.offsetTop = VV.offsetTop;
    frames.clear();
    vv.dispatchEvent(new Event("resize"));
    expect(frames.size).toBeGreaterThan(0);
  });
});

describe("T-S6: zoom never newly enters ShareHub's hidden branch", () => {
  test("an anchor outside the visible slice keeps the panel open and visible", () => {
    // The panel's hidden branch was written for transient degenerate rects and
    // neither closes nor restores focus (spec R11/R4). place.ts guarantees zoom
    // cannot newly reach it; this is that guarantee at the component layer.
    const vv = new VisualViewportStub(120, 100, 10, 10);
    vi.stubGlobal("visualViewport", vv);
    const kebab = openHub();
    stubRect(kebab, { left: 900, top: 700, width: 24, height: 24 });
    frames.clear();
    vv.dispatchEvent(new Event("scroll"));
    const pending = [...frames.values()];
    frames.clear();
    for (const cb of pending) cb(0);

    const pop = screen.getByTestId("share-hub-popover");
    expect(pop.style.visibility).not.toBe("hidden");
    expect(kebab.getAttribute("aria-expanded")).toBe("true");
  });
});

/**
 * T-S1 / T-S4 — SUCCESSFUL placement, body host and panel host.
 *
 * The whole-diff review found these missing: every other ShareHub case here
 * asserts scheduling, the WebKit exclusion, or the hidden->legacy fallback, so a
 * ShareHub-only regression in visual bounds, host intersection, or the
 * host-offset conversion could survive. The Chromium e2e fixtures render
 * HoverHelp, not ShareHub, so they cannot cover it either.
 *
 * `openHub()` stubs rects only after the click, so the FIRST placement pass
 * bails at ShareHub.tsx:262 (zero-area trigger). These cases therefore drive a
 * second pass through the component's own visualViewport listener and run the
 * frame, which is also closer to what a real zoom does.
 */
function replace(vv: VisualViewportStub): void {
  frames.clear();
  vv.dispatchEvent(new Event("scroll"));
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(0);
}

describe("T-S1: ShareHub places inside the visible slice (body host)", () => {
  test("exact coordinates, derived from the slice and the align='right' anchor", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    vi.stubGlobal("visualViewport", vv);
    openHub();
    replace(vv);

    const pop = screen.getByTestId("share-hub-popover");
    const boundsLeft = VV.offsetLeft + 8; // VIEWPORT_INSET
    const boundsRight = VV.offsetLeft + VV.width - 8;
    const width = Math.min(308, boundsRight - boundsLeft);
    // ShareHub anchors align="right": x = trigger.right - width, then clamped.
    const expectedLeft = Math.min(
      Math.max(TRIGGER.left + TRIGGER.width - width, boundsLeft),
      boundsRight - width,
    );
    expect(pop.style.left).toBe(`${expectedLeft}px`);
    // The layout-viewport answer would NOT be clamped to the slice.
    expect(pop.style.left).not.toBe(`${TRIGGER.left + TRIGGER.width - 308}px`);
    expect(pop.style.visibility).not.toBe("hidden");
  });
});

describe("T-S4: ShareHub panel host, non-zero border and scroll", () => {
  test("host-relative conversion subtracts the host rect, clientLeft/Top, and adds scroll", () => {
    const vv = new VisualViewportStub(VV.width, VV.height, VV.offsetLeft, VV.offsetTop);
    vi.stubGlobal("visualViewport", vv);

    const panel = document.createElement("div");
    document.body.appendChild(panel);
    const HOST = { left: 120, top: 90, width: 700, height: 600 };
    stubRect(panel, HOST);
    Object.defineProperty(panel, "clientLeft", { configurable: true, value: 3 });
    Object.defineProperty(panel, "clientTop", { configurable: true, value: 5 });
    Object.defineProperty(panel, "scrollLeft", { configurable: true, value: 17 });
    Object.defineProperty(panel, "scrollTop", { configurable: true, value: 23 });

    render(
      <ShareTokenProvider key={SHOW_ID} initialToken={TOKEN} initialEpoch={1}>
        <PopoverHostContext.Provider value={{ current: panel }}>
          <ShareHub
            slug={SLUG}
            showId={SHOW_ID}
            published
            archived={false}
            finalizeOwned={false}
            crewEmails={["alice@example.com"]}
            showTitle="Aurora Fall Tour"
            pickerCrew={CREW}
            archiveAction={async () => ({ ok: true }) as const}
            unarchiveAction={async () => {}}
          />
        </PopoverHostContext.Provider>
      </ShareTokenProvider>,
    );
    const kebab = screen.getByTestId("share-hub-kebab");
    // ShareHub anchors on its CONTAINER (containerRef), not the button, so the
    // container's rect is the one placement reads; a zero-area container makes
    // applyPlacement bail at ShareHub.tsx:262 and write no coordinates at all.
    stubRect(kebab.parentElement ?? kebab, TRIGGER);
    stubRect(kebab, TRIGGER);
    stubRect(document.body, { left: 0, top: 0, width: LAYOUT_W, height: LAYOUT_H });
    fireEvent.click(kebab);
    stubRect(screen.getByTestId("share-hub-popover"), { left: 0, top: 0, width: 308, height: 120 });
    replace(vv);

    const pop = screen.getByTestId("share-hub-popover");
    // Bounds are host INTERSECT slice, inset — the tighter of the two.
    const boundsLeft = Math.max(HOST.left, VV.offsetLeft) + 8;
    const boundsRight = Math.min(HOST.left + HOST.width, VV.offsetLeft + VV.width) - 8;
    const width = Math.min(308, boundsRight - boundsLeft);
    const viewportX = Math.min(
      Math.max(TRIGGER.left + TRIGGER.width - width, boundsLeft),
      boundsRight - width,
    );
    // Host-relative: viewport point minus host rect and border, plus host scroll.
    const expectedLeft = viewportX - HOST.left - 3 + 17;
    expect(pop.style.left).toBe(`${expectedLeft}px`);
    expect(pop.style.visibility).not.toBe("hidden");
  });
});
