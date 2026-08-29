// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/attentionMenu.test.tsx
 *
 * AttentionMenu dropdown (published-show-alerts spec §5.2): actionable rows in
 * given order, tone dots, footer clearing count, close-then-navigate ordering,
 * capture-phase Escape that never reaches the modal shell's bubble listener,
 * click-outside close, listener teardown when closed.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripCommentsForFile } from "../../../_shared/stripComments";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createRef } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { autoResolveNote } from "@/lib/adminAlerts/audience";

function mk(over: Partial<AttentionItem>): AttentionItem {
  return {
    id: "alert:a1",
    kind: "alert",
    tone: "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
    menuTitle: "Role flags changed",
    menuSubtitle: "Crew · John Redcorn",
    // Attention split: kind:"alert" items carry a real payload (the needs-look
    // group reads alert.code/action; the old partial fixture crashed it).
    alert: {
      alertId: "a1",
      code: "ROLE_FLAGS_NOTICE",
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-21T09:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
    ...over,
  } as AttentionItem;
}

const HOLD = mk({
  id: "hold:h1",
  kind: "hold",
  tone: "critical",
  sectionId: "changes",
  menuTitle: "Priya Shah's row changed while a rename was pending.",
  menuSubtitle: "Pick what happens in Changes",
});
const ALERT = mk({});
const CLEARING = mk({ id: "alert:c1", actionable: false, menuTitle: "Sheet unavailable" });

function renderMenu(over: Partial<Parameters<typeof AttentionMenu>[0]> = {}) {
  const pillRef = createRef<HTMLButtonElement>();
  const pill = document.createElement("button");
  document.body.appendChild(pill);
  (pillRef as { current: HTMLButtonElement | null }).current = pill;
  const props = {
    items: [HOLD, ALERT, CLEARING],
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    pillRef,
    ...over,
  };
  const utils = render(<AttentionMenu {...props} />);
  return { ...utils, props, pill };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("AttentionMenu", () => {
  test("renders EVERY needs-you row, in order, with titles + second lines", () => {
    renderMenu();
    const rows = screen.getAllByTestId(/^attention-menu-row-/);
    // attention-index §2.1: one merged group, so the clearing item is a row
    // here too — it is no longer a separate read-only shape.
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "attention-menu-row-hold:h1",
      "attention-menu-row-alert:a1",
      "attention-menu-row-alert:c1",
    ]);
    expect(rows[0]!.textContent).toContain("Priya Shah's row changed");
    expect(rows[0]!.textContent).toContain("Pick what happens in Changes");
    expect(screen.getByText("Sheet unavailable")).toBeInTheDocument();
  });

  test("tone dot classes + sr-only tier text (WCAG 1.4.1 second channel)", () => {
    renderMenu();
    const hold = screen.getByTestId("attention-menu-row-hold:h1");
    const alert = screen.getByTestId("attention-menu-row-alert:a1");
    expect(hold.querySelector(".bg-status-degraded")).toBeTruthy();
    expect(alert.querySelector(".bg-status-review")).toBeTruthy();
    expect(hold.querySelector(".sr-only")).toBeTruthy();
  });

  test("row click → onClose BEFORE onNavigate(item)", () => {
    const calls: string[] = [];
    const { props } = renderMenu({
      onClose: vi.fn(() => calls.push("close")),
      onNavigate: vi.fn(() => calls.push("navigate")),
    });
    fireEvent.click(screen.getByTestId("attention-menu-row-alert:a1"));
    expect(calls).toEqual(["close", "navigate"]);
    expect(props.onNavigate).toHaveBeenCalledWith(ALERT);
  });

  test("clearing item without clearingKind renders as a needs-you row (fail-visible); footer copy retired", () => {
    // SUPERSEDED AGAIN (attention-index §2.1/§2.2): the needs-a-look group is
    // merged into "Needs you" and its read-only row shape retired, so a clearing
    // item with NO clearingKind is now a pressable row — still never silently
    // dark, which is the property this test guards.
    renderMenu();
    expect(screen.getByTestId("attention-menu-row-alert:c1")).toBeInTheDocument();
    expect(screen.queryByText(/more clearing on their own/)).toBeNull();
    cleanup();
    // Explicit self_heal items render enumerated monitoring rows: title + note.
    const alertPayload = (ALERT as Extract<AttentionItem, { kind: "alert" }>).alert;
    const selfHealItem = mk({
      id: "alert:s1",
      actionable: false,
      clearingKind: "self_heal",
      menuTitle: "Syncing has stalled",
      alert: { ...alertPayload, alertId: "s1", code: "SYNC_STALLED" },
    });
    renderMenu({ items: [HOLD, ALERT, selfHealItem] });
    const row = screen.getByTestId("attention-monitoring-row-alert:s1");
    expect(within(row).getByText(selfHealItem.menuTitle)).toBeInTheDocument();
    expect(within(row).getByText(autoResolveNote("SYNC_STALLED"))).toBeInTheDocument();
    expect(screen.queryByText(/clearing on their own, no action needed/)).toBeNull();
    // the self-heal item is the ONLY monitoring row, and it is NOT also a
    // needs-you row (attention-index §2.1 counts a mistagged item once)
    expect(screen.queryByTestId("attention-menu-row-alert:s1")).toBeNull();
  });

  test("Escape: closes, focuses pill, and a document BUBBLE listener never fires (capture + stopPropagation)", () => {
    const bubbleSpy = vi.fn();
    document.addEventListener("keydown", bubbleSpy);
    const { props, pill } = renderMenu();
    const focusSpy = vi.spyOn(pill, "focus");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalled();
    expect(bubbleSpy).not.toHaveBeenCalled();
    document.removeEventListener("keydown", bubbleSpy);
  });

  test("click outside → onClose; click inside → stays open", () => {
    const { props } = renderMenu();
    fireEvent.pointerDown(screen.getByTestId("attention-menu-row-alert:a1"));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("open:false renders nothing and no listeners remain", () => {
    const { container, props } = renderMenu({ open: false });
    expect(container.innerHTML).toBe("");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("the panel uses the canonical popover shadow token, not a raw Tailwind shadow", () => {
    renderMenu();
    const panel = screen.getByTestId("published-show-review-attention-menu");
    // `shadow-lg` is a fixed rgba with no dark-mode runtime, so the panel kept a
    // light-theme shadow in dark. `--shadow-popover` carries both runtimes
    // (app/globals.css) and is the canonical utility for popover surfaces.
    expect(panel.className).toContain("shadow-popover");
    expect(panel.className).not.toContain("shadow-lg");
  });

  test("motion classes: origin-top-right + duration-fast ease-out-quart + motion-reduce off", () => {
    renderMenu();
    const panel = screen.getByTestId("published-show-review-attention-menu");
    expect(panel.className).toContain("origin-top-right");
    expect(panel.className).toContain("duration-fast");
    expect(panel.className).toContain("ease-out-quart");
    expect(panel.className).toContain("motion-reduce:transition-none");
  });
});

/**
 * Clip-fit + scrollable-region contract
 * (spec 2026-08-01-admin-popover-overlay-cluster §4.2, §8, §11).
 *
 * The role sits on the SCROLLER, not on the panel: the panel already carries a
 * group role naming the leading section ("Needs you" / "Monitoring"), and it is
 * the scroller that owns the scroll range a keyboard user must be able to reach.
 */
describe("AttentionMenu clip fit (§4.2)", () => {
  const CAP_PX = 384; // the scroller's declared `max-h-96`
  const CLIP_BOTTOM = 560;
  const SCROLLER_TOP = 230;

  let geometry: { scrollerTop: number; clipBottom: number };
  /** ResizeObserver callbacks captured so a test can fire one deliberately. */
  let observerCallbacks: ResizeObserverCallback[];
  let observedTargets: Element[];
  /** Frames held rather than run: the hook coalesces event-driven applies. */
  let pendingFrames: FrameRequestCallback[];

  function installLayoutStubs() {
    geometry = { scrollerTop: SCROLLER_TOP, clipBottom: CLIP_BOTTOM };
    observerCallbacks = [];
    observedTargets = [];
    pendingFrames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      pendingFrames.push(cb);
      return pendingFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (): void => {
      pendingFrames = [];
    });

    // The clip ancestor is a real DOM node OUTSIDE the rendered menu, so the
    // hook's upward walk has somewhere distinct to land.
    const clip = document.createElement("div");
    clip.setAttribute("data-clip-ancestor", "");
    document.body.appendChild(clip);

    // Delegates to the REAL declaration and overrides only the two properties
    // this contract is about: Testing Library computes accessible roles through
    // getComputedStyle too, and a plain object literal loses getPropertyValue.
    const realComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el: Element, pseudo?: string | null) => {
        const real = realComputedStyle(el, pseudo ?? undefined);
        const isClip = el.hasAttribute?.("data-clip-ancestor") ?? false;
        const isScroller = (el as HTMLElement).className?.includes?.("overflow-y-auto") ?? false;
        return new Proxy(real, {
          get(target, key) {
            if (key === "overflowX" || key === "overflowY") return isClip ? "clip" : "visible";
            if (key === "maxHeight" && isScroller) return `${CAP_PX}px`;
            const value = Reflect.get(target, key) as unknown;
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const isClip = this.hasAttribute?.("data-clip-ancestor");
      const top = isClip ? 0 : geometry.scrollerTop;
      const bottom = isClip ? geometry.clipBottom : geometry.scrollerTop + 100;
      return {
        left: 0,
        right: 300,
        width: 300,
        top,
        bottom,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => "",
      } as DOMRect;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          observerCallbacks.push(cb);
        }
        observe(target: Element) {
          observedTargets.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    return clip;
  }

  /** Renders the menu INSIDE the clip ancestor so the hook walk lands on it. */
  function renderMenuInto(
    clip: HTMLElement,
    over: Partial<Parameters<typeof AttentionMenu>[0]> = {},
  ) {
    const pillRef = createRef<HTMLButtonElement>();
    const pill = document.createElement("button");
    document.body.appendChild(pill);
    (pillRef as { current: HTMLButtonElement | null }).current = pill;
    const props = {
      items: [HOLD, ALERT, CLEARING],
      open: true,
      onClose: vi.fn(),
      onNavigate: vi.fn(),
      pillRef,
      ...over,
    };
    return { ...render(<AttentionMenu {...props} />, { container: clip }), props };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("the scroller is an accessible, tabbable scrollable region", () => {
    renderMenu();
    const scroller = screen.getByRole("group", { name: "Attention items" });
    expect(scroller.tabIndex).toBe(0);
    expect(scroller.className).toContain("max-h-96");
    expect(scroller.className).toContain("overflow-y-auto");
    // The panel keeps its own group role — this is a SECOND, nested region.
    expect(scroller).not.toBe(screen.getByTestId("published-show-review-attention-menu"));
  });

  // REWRITTEN 2026-08-28 (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW). This used to
  // assert an inline `max-height` on the SCROLLER, written there by
  // useFitWithinClip. The fitted cap now lands on the PANEL — it has to, because
  // a cap on a non-scrolling parent whose scrolling child can paint through it is
  // no cap at all — and it reaches the scroller through flexbox instead.
  //
  // What jsdom can prove is the STATIC half of that chain: the classes that make
  // the cap reach the child. The MEASURED half — that the child actually shrinks
  // and never paints past the panel — needs real layout and lives in
  // popover-clip-fit.spec.ts, which asserts childSum against panel.clientHeight
  // and scroller.bottom against panel.bottom. jsdom computes no layout and would
  // pass on every failure mode there.
  test("the cap reaches the scroller by flex, not by an inline cap written on it", () => {
    const clip = installLayoutStubs();
    renderMenuInto(clip);
    const scroller = screen.getByRole("group", { name: "Attention items" });
    const panel = screen.getByTestId("published-show-review-attention-menu");
    // The panel is the capped, clipping flex column.
    expect(panel.className).toContain("flex");
    expect(panel.className).toContain("flex-col");
    expect(panel.className).toContain("overflow-hidden");
    // `min-h-0` is the load-bearing one: without it a flex item's default
    // `min-height: auto` refuses to shrink below its content and the panel's cap
    // silently does nothing.
    expect(scroller.className).toContain("min-h-0");
    expect(scroller.className).toContain("flex-1");
    // The DECLARED cap stays; the fitted cap composes with it.
    expect(scroller.className).toContain("max-h-96");
    // And the cap is no longer written onto the scroller itself.
    expect(scroller.style.maxHeight).toBe("");
  });

  test("the component declares no VIEWPORT-derived width (AC-7)", () => {
    // The defect this arc closes was `w-[min(400px,calc(100vw-32px))]`: a width
    // measured against the viewport while the panel was anchored inside a clip
    // inset from it. Asserted on the SOURCE because no guard scans CSS — the
    // placement registry reads JS layout-viewport reads only, which is exactly
    // how a `100vw` in a Tailwind class survived it.
    // COMMENTS ARE STRIPPED FIRST. The component's own docblock explains what
    // was removed and names `w-[min(400px,calc(100vw-32px))]` to do it, so a raw
    // scan matches the explanation of the fix and reports the fix as the defect.
    // That is the same comment-as-code confusion this arc's spec review caught in
    // the class sweep; the stripper is the derived answer to it.
    const rel = "components/admin/showpage/AttentionMenu.tsx";
    const src = stripCommentsForFile(readFileSync(join(process.cwd(), rel), "utf8"), rel);
    for (const unit of ["100vw", "100dvw", "100svw"]) {
      expect(src, `${unit} is a viewport-derived width`).not.toContain(unit);
    }
  });

  // REWRITTEN with its sibling above. The claim it made — that the observer path
  // re-applies the fit independent of entrance progress — was read off an inline
  // `max-height` on the scroller, which no longer exists. jsdom reports every rect
  // as zero, so the placement core correctly refuses to place and writes no
  // geometry at all; asserting numbers here would assert the stub, not the code.
  //
  // What survives in jsdom is that the re-place path is WIRED: a ResizeObserver
  // is constructed and its callback registered. That the observer actually
  // re-places on a structural flip is proven where it can be — the O2 -> O1
  // frame-hold compound in popover-clip-fit.spec.ts, against real layout.
  test("a ResizeObserver is wired so the placement re-runs on ancestor resize", () => {
    const clip = installLayoutStubs();
    renderMenuInto(clip);
    expect(
      observerCallbacks.length,
      "no ResizeObserver was constructed, so nothing re-places on resize",
    ).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------------
  // Regression coverage for the four re-place repairs
  // (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW, whole-diff review round 1). Each
  // was a behavioural fix shipped without a test; these pin the mechanism rather
  // than the geometry, which is what jsdom can actually decide.
  // ------------------------------------------------------------------------

  // The ANCHOR-observation repair is asserted in a REAL BROWSER, not here.
  // jsdom never implements `offsetParent` — it returns null unconditionally — so
  // the placement anchor does not exist in this environment and a unit assertion
  // on it can only pass vacuously or fail on its own premise. It failed on its
  // premise when first written, which is the premise doing its job. THERE IS NO
  // BROWSER CASE EITHER, and that is probed rather than pending: the stimulus
  // tried (changing the attention load) does not move the wrapper's RIGHT edge,
  // the only edge `align: "right"` reads, because the wrapper is right-pinned in
  // the modal header. The subscription ships DEFENSIVE. popover-clip-fit.spec.ts
  // documents the absence where the case would sit. An earlier draft of this
  // comment claimed the browser case exists, which it never did.
  test("the panel is observed, and a host-less mount observes nothing spurious", () => {
    const clip = installLayoutStubs();
    renderMenuInto(clip);
    const panel = screen.getByTestId("published-show-review-attention-menu");
    expect(observedTargets).toContain(panel);
    // This harness mounts with NO `PopoverHostContext` provider, so there is no
    // host to observe and bounds degenerate to the viewport — the documented
    // no-provider path. The assertion is therefore that the set is exactly the
    // panel: no null, no duplicate, and nothing observed speculatively. An
    // earlier draft asserted more than one target and failed here, which was the
    // assertion being wrong about the fixture rather than the code being wrong.
    expect(observedTargets).toEqual([panel]);
  });

  test("visualViewport scroll and resize are subscribed, and torn down BY IDENTITY", () => {
    const added = new Map<string, EventListener>();
    const removed = new Map<string, EventListener>();
    const vv = {
      addEventListener: (t: string, fn: EventListener) => added.set(t, fn),
      removeEventListener: (t: string, fn: EventListener) => removed.set(t, fn),
    };
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    const clip = installLayoutStubs();
    const { unmount } = renderMenuInto(clip);
    // Pinch-zoom and the mobile keyboard move the VISUAL viewport without firing
    // a window resize. Doug is on a phone; every other consumer subscribes to both.
    expect([...added.keys()].sort()).toEqual(["resize", "scroll"]);
    unmount();
    // IDENTITY, not just the event name. An earlier draft recorded names only,
    // which a no-op handler or a teardown passing a DIFFERENT callback would both
    // have satisfied — leaking a listener per mount while the test stayed green.
    expect(removed.get("scroll")).toBe(added.get("scroll"));
    expect(removed.get("resize")).toBe(added.get("resize"));
  });

  test("a scroll from INSIDE the panel does not schedule a re-place", () => {
    const clip = installLayoutStubs();
    renderMenuInto(clip);
    const scroller = screen.getByRole("group", { name: "Attention items" });
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    const frames: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
    try {
      // A capture-phase window scroll listener also hears the panel's own
      // scroller, and every measurement can emit a scroll event from it (clearing
      // the cap reflows the child). Unfiltered, the pair feeds itself a re-measure
      // per frame while the operator is scrolling the list.
      // NON-bubbling, which is how the platform actually dispatches element
      // scroll. An earlier draft used `bubbles: true`, and that masked the whole
      // mechanism: a bubbling event reaches a listener whether or not it is
      // registered in the CAPTURE phase, so dropping `capture` from the
      // production listener would have kept this test green while outside
      // scrolling silently stopped scheduling placement.
      scroller.dispatchEvent(new Event("scroll"));
      const afterSelf = frames.length;
      expect(afterSelf, "a self-originated scroll must not schedule a re-place").toBe(0);

      // PREMISE: the listener is live at all. Without this the case passes on a
      // component that subscribed to nothing.
      outside.dispatchEvent(new Event("scroll"));
      expect(
        frames.length,
        "premise: an OUTSIDE scroll must still schedule, or the filter proves nothing",
      ).toBeGreaterThan(afterSelf);
    } finally {
      raf.mockRestore();
      outside.remove();
    }
  });

  test("transition audit: entrance classes on the panel, instant unmount on close", () => {
    const { rerender, props } = renderMenu();
    const panel = screen.getByTestId("published-show-review-attention-menu");
    expect(panel.className).toContain("transition-[opacity,transform]");
    expect(panel.className).toMatch(/scale-(?:95|100)/);
    expect(panel.className).toMatch(/opacity-(?:0|100)/);

    rerender(<AttentionMenu {...props} open={false} />);
    // Instant unmount — no exit animation, so the node is simply gone.
    expect(screen.queryByTestId("published-show-review-attention-menu")).toBeNull();
  });
});

/**
 * Focus-leave light dismiss (spec §3.4).
 *
 * Inside-set for this surface: the panel's own descendants, and the pill.
 * Anything else taking focus dismisses. The point is keyboard parity with
 * click-outside: a Tab out of the menu should not leave a floating panel behind
 * two overlays deep.
 */
describe("AttentionMenu focus-leave dismiss (§3.4)", () => {
  function outsideTarget() {
    const el = document.createElement("button");
    el.setAttribute("data-testid", "outside-focus-target");
    document.body.appendChild(el);
    return el;
  }

  test("focusin outside the menu and the pill closes it", () => {
    const { props } = renderMenu();
    const outside = outsideTarget();
    fireEvent.focusIn(outside);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("focusin on a panel descendant does NOT close it", () => {
    const { props } = renderMenu();
    fireEvent.focusIn(screen.getByTestId("attention-menu-row-alert:a1"));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("focusin on the pill does NOT close it", () => {
    const { props, pill } = renderMenu();
    fireEvent.focusIn(pill);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("window blur alone does NOT close it (ratified §3.4/§10 exception)", () => {
    const { props } = renderMenu();
    // Switching apps or focusing the URL bar must not dismiss: there is no
    // subsequent in-document focusin, so nothing inside the page took over.
    fireEvent.blur(window);
    fireEvent.focusOut(screen.getByTestId("attention-menu-row-alert:a1"), {
      relatedTarget: null,
    });
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
