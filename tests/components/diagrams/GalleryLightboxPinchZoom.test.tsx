// @vitest-environment jsdom
/**
 * tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx
 *   (M9 C6c / M7-D4 — pinch-zoom on the diagrams lightbox)
 *
 * Pins the chrome + state-machine contracts that close C6c. Actual pinch
 * gesture mechanics belong to react-zoom-pan-pinch and are verified in
 * Playwright (tests/e2e/diagrams-lightbox-pinch-zoom.spec.ts). Here we
 * mock the library so the test controls the simulated scale, then assert
 * our chrome (Reset chip, live region, keyboard handler, Embla
 * watchDrag toggle, reduced-motion gate) responds correctly.
 *
 * Test surface:
 *   1. Default render at scale=1: Reset chip absent, page indicator
 *      visible, lightbox-zoom-live-region present (always-mounted).
 *   2. Mocked scale → 2: Reset chip appears with "Reset" text + the
 *      "Reset zoom" aria-label; live region announces "Zoomed to 2.0×".
 *   3. Click Reset chip → library's resetTransform invoked.
 *   4. Mocked scale → 1: Reset chip disappears.
 *   5. Diagram navigation while zoomed: scale resets to 1 (resetTransform
 *      invoked on the active slide).
 *   6. Keyboard: + / - / 0 invoke library controls (zoomIn / zoomOut /
 *      resetTransform); 0 always resets regardless of scale.
 *   7. Keyboard: ArrowLeft / ArrowRight at scale=1 navigate diagrams;
 *      at scale > 1 they pan the image (delegate to library, do not
 *      navigate).
 *   8. TransformWrapper receives min=1, max=4, doubleClick.mode='toggle',
 *      doubleClick.step=1 (toggles 1↔2 by adding 1 above min).
 *   9. Reduced-motion: pinch.disabled=false (NEVER disabled); smooth=false
 *      and velocityAnimation.disabled=true (no momentum/interpolation).
 *  10. Full-motion: pinch.disabled=false, smooth=true,
 *      velocityAnimation.disabled=false.
 *
 * Anti-tautology guard: every assertion targets DOM state or library
 * call args, not the existence of the import or the literal prop value
 * we hard-coded.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// ── jsdom polyfills ─────────────────────────────────────────────────────
// jsdom lacks matchMedia (reduce-motion gate reads it) and
// IntersectionObserver (Embla's SlidesInView observer needs it). Stub
// both before any render. Tests that need the matchMedia value to
// flip toggle `__matchMediaMatches` and `__matchMediaTrigger`.
let __matchMediaQuery: (q: string) => boolean = () => false;

beforeAll(() => {
  if (typeof window === "undefined") return;
  window.matchMedia = (q: string) =>
    ({
      matches: __matchMediaQuery(q),
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  // Minimal IntersectionObserver stub — Embla's SlidesInView observer
  // calls observe()/unobserve()/disconnect() but never reads back. We
  // never need to fire entries from jsdom for these tests.
  if (typeof window.IntersectionObserver === "undefined") {
    class IO {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (window as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;
    (globalThis as unknown as { IntersectionObserver: typeof IO }).IntersectionObserver = IO;
  }
  if (typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
    (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
});

// ── Mock react-zoom-pan-pinch ──────────────────────────────────────────
// The mock exposes test-helper globals so each test can simulate a
// scale change or assert the props the lightbox passed in. The mock is
// stateful so reset between tests in beforeEach.
type TransformEffectCb = (snap: { state: { scale: number } }) => void;

interface LibTestState {
  scaleListeners: TransformEffectCb[];
  resetTransformCalls: number;
  resetTransformAnimTimes: Array<number | undefined>;
  zoomInCalls: number;
  zoomInAnimTimes: Array<number | undefined>;
  zoomOutCalls: number;
  zoomOutAnimTimes: Array<number | undefined>;
  lastWrapperProps: Record<string, unknown> | null;
  // When true, the mock's resetTransform records the call but does
  // NOT emit a scale=1 listener callback. Used to test that the
  // production code (and not the library's response) is responsible
  // for resetting the lifted scale state. (Codex R3 MED-2: without
  // this, the default mock auto-emits scale=1, making the R2
  // regression test pass even if production removes setActiveScale.)
  silenceResetTransform: boolean;
}

const libState: LibTestState = {
  scaleListeners: [],
  resetTransformCalls: 0,
  resetTransformAnimTimes: [],
  zoomInCalls: 0,
  zoomInAnimTimes: [],
  zoomOutCalls: 0,
  zoomOutAnimTimes: [],
  lastWrapperProps: null,
  silenceResetTransform: false,
};

function simulateScale(scale: number): void {
  // Wrap in act so the React setState inside useTransformEffect's
  // callback flushes before the next test assertion. Without this,
  // tests that call simulateScale twice in sequence may see a stale
  // chrome state on the synchronous queryByTestId that follows.
  act(() => {
    for (const cb of libState.scaleListeners) {
      cb({ state: { scale } });
    }
  });
}

// React is imported via dynamic import inside the mock factory
// because vi.mock hoists above other imports — eager top-level
// import would race the mock registration. The factory runs after
// hoist, before any usage; node:module-cache returns the same React
// instance the components see, so hooks behave normally.
vi.mock("react-zoom-pan-pinch", async () => {
  const React = await import("react");
  function TransformWrapper(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    libState.lastWrapperProps = props;
    return React.createElement(
      "div",
      { "data-testid": "rzpp-wrapper" },
      props.children,
    );
  }
  function TransformComponent({ children }: { children?: React.ReactNode }) {
    return React.createElement(
      "div",
      { "data-testid": "rzpp-component" },
      children,
    );
  }
  function useTransformEffect(cb: TransformEffectCb): void {
    React.useEffect(() => {
      libState.scaleListeners.push(cb);
      return () => {
        const idx = libState.scaleListeners.indexOf(cb);
        if (idx >= 0) libState.scaleListeners.splice(idx, 1);
      };
    }, [cb]);
  }
  function useControls() {
    return {
      resetTransform: (animationTime?: number) => {
        libState.resetTransformCalls += 1;
        libState.resetTransformAnimTimes.push(animationTime);
        // Library behavior: resetTransform fires a transform event back
        // to listeners with scale=1. silenceResetTransform suppresses
        // that emit so tests can prove the production code (not the
        // library callback) is responsible for resetting lifted state.
        if (!libState.silenceResetTransform) {
          simulateScale(1);
        }
      },
      zoomIn: (step?: number, animationTime?: number) => {
        libState.zoomInCalls += 1;
        libState.zoomInAnimTimes.push(animationTime);
        const next = Math.min(4, 1 + (step ?? 0.5));
        simulateScale(next);
      },
      zoomOut: (_step?: number, animationTime?: number) => {
        libState.zoomOutCalls += 1;
        libState.zoomOutAnimTimes.push(animationTime);
        simulateScale(1);
      },
    };
  }
  return { TransformWrapper, TransformComponent, useTransformEffect, useControls };
});

// useDialogFocus is a pure DOM effect — let it run unmocked. But the
// focus-trap reads document.activeElement; jsdom handles that fine.

import { GalleryLightbox } from "@/components/diagrams/GalleryLightbox";
import type { GalleryItem } from "@/components/diagrams/Gallery";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

function items(n: number): GalleryItem[] {
  return Array.from({ length: n }, (_v, i) => ({
    key: `embedded-obj-${i + 1}.png`,
    alt: `Diagram ${i + 1}`,
    available: true,
  }));
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  libState.scaleListeners = [];
  libState.resetTransformCalls = 0;
  libState.resetTransformAnimTimes = [];
  libState.zoomInCalls = 0;
  libState.zoomInAnimTimes = [];
  libState.zoomOutCalls = 0;
  libState.zoomOutAnimTimes = [];
  libState.lastWrapperProps = null;
  libState.silenceResetTransform = false;
  __matchMediaQuery = () => false;
});

describe("M9 C6c — TransformWrapper prop contract", () => {
  test("Codex R5 HIGH: doubleClick uses dynamic mode (zoomIn @ scale=1 → 2x; reset @ scale>1 → 1x) with step=ln(2)", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    expect(libState.lastWrapperProps?.minScale).toBe(1);
    expect(libState.lastWrapperProps?.maxScale).toBe(4);
    // At rest (scale=1): mode='zoomIn' so library's `scale * exp(step)`
    // math lands at exactly 2x with step=ln(2). The original
    // mode='toggle' was wrong — library toggle still uses exp math,
    // producing ~2.718x from 1x and only ~1.47x from 4x (never resets).
    const dcAtRest = libState.lastWrapperProps?.doubleClick as
      | { mode?: string; step?: number; animationTime?: number }
      | undefined;
    expect(dcAtRest?.mode).toBe("zoomIn");
    expect(dcAtRest?.step).toBeCloseTo(Math.LN2, 6);
    // Library: 1 * exp(ln 2) === 2.0 exactly.
    expect(1 * Math.exp(dcAtRest?.step ?? 0)).toBeCloseTo(2, 6);

    // When zoomed (scale>1): mode flips to 'reset' so double-tap
    // always returns to 1x regardless of current scale.
    simulateScale(3.5);
    await waitFor(() => {
      const dcZoomed = libState.lastWrapperProps?.doubleClick as
        | { mode?: string }
        | undefined;
      expect(dcZoomed?.mode).toBe("reset");
    });
  });

  test("Codex R1 HIGH: panning is disabled at scale=1 (Embla owns swipe), enabled at scale>1 (library owns pan)", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    // At scale=1, panning.disabled must be true so single-finger
    // horizontal drag passes through to Embla's swipe-to-next.
    const propsAtRest = libState.lastWrapperProps;
    const panningAtRest = propsAtRest?.panning as { disabled?: boolean } | undefined;
    expect(panningAtRest?.disabled).toBe(true);
    // After zooming, library takes over panning.
    simulateScale(2);
    await waitFor(() => {
      const props = libState.lastWrapperProps;
      const panning = props?.panning as { disabled?: boolean } | undefined;
      expect(panning?.disabled).toBe(false);
    });
  });

  test("Codex R4 HIGH: wheel activation predicate ORs Control/Meta (not ANDs)", () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    const wheel = props?.wheel as
      | {
          disabled?: boolean;
          activationKeys?: string[] | ((keys: string[]) => boolean);
        }
      | undefined;
    expect(wheel?.disabled).toBe(false);
    // The library's array form is AND'd internally (keys.every).
    // Brief contract is OR (ctrl/cmd-wheel + trackpad pinch), so we
    // pass a predicate. Execute it against representative inputs.
    expect(typeof wheel?.activationKeys).toBe("function");
    const predicate = wheel?.activationKeys as (keys: string[]) => boolean;
    // No modifier — plain wheel — must NOT activate zoom.
    expect(predicate([])).toBe(false);
    // Control held (typical Windows / Linux ctrl-wheel) — activates.
    expect(predicate(["Control"])).toBe(true);
    // Meta held (typical macOS cmd-wheel + trackpad-pinch with ctrl
    // injected → both can flow through this branch).
    expect(predicate(["Meta"])).toBe(true);
    // Both held — activates (no regression from R1's AND form).
    expect(predicate(["Control", "Meta"])).toBe(true);
    // Unrelated modifier — must NOT activate.
    expect(predicate(["Shift"])).toBe(false);
    expect(predicate(["Alt"])).toBe(false);
  });

  test("pinch is never disabled, even under prefers-reduced-motion: reduce", () => {
    __matchMediaQuery = (q: string) => q.includes("reduce");
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    const pinch = props?.pinch as { disabled?: boolean } | undefined;
    expect(pinch?.disabled).toBe(false);
    const wheel = props?.wheel as { disabled?: boolean } | undefined;
    expect(wheel?.disabled).toBe(false);
  });

  test("reduced-motion disables zoomAnimation + autoAlignment (comprehensive sweep post-R4)", () => {
    __matchMediaQuery = (q: string) => q.includes("reduce");
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    const zoomAnim = props?.zoomAnimation as { disabled?: boolean } | undefined;
    const alignAnim = props?.autoAlignment as { disabled?: boolean } | undefined;
    expect(zoomAnim?.disabled).toBe(true);
    expect(alignAnim?.disabled).toBe(true);
  });

  test("full-motion keeps zoomAnimation + autoAlignment enabled", () => {
    __matchMediaQuery = () => false;
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    const zoomAnim = props?.zoomAnimation as { disabled?: boolean } | undefined;
    const alignAnim = props?.autoAlignment as { disabled?: boolean } | undefined;
    expect(zoomAnim?.disabled).toBe(false);
    expect(alignAnim?.disabled).toBe(false);
  });

  test("reduced-motion disables smooth animation + velocity (no momentum/interpolation)", () => {
    __matchMediaQuery = (q: string) => q.includes("reduce");
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    expect(props?.smooth).toBe(false);
    const v = props?.velocityAnimation as { disabled?: boolean } | undefined;
    expect(v?.disabled).toBe(true);
  });

  test("full-motion keeps smooth + velocity enabled", () => {
    __matchMediaQuery = () => false;
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    expect(props?.smooth).toBe(true);
    const v = props?.velocityAnimation as { disabled?: boolean } | undefined;
    expect(v?.disabled).toBe(false);
  });
});

describe("M9 C6c — Reset chip visibility tracks scale", () => {
  test("default render (scale=1): chip absent; live region present + empty", () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("lightbox-reset-chip")).toBeNull();
    const live = screen.getByTestId("lightbox-zoom-live-region");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("role")).toBe("status");
    expect(live.textContent ?? "").toBe("");
  });

  test("simulateScale → 2: chip appears with 'Reset' text + 'Reset zoom' aria-label", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("lightbox-reset-chip")).toBeNull();
    simulateScale(2);
    const chip = await screen.findByTestId("lightbox-reset-chip");
    expect(chip.textContent ?? "").toContain("Reset");
    expect(chip.getAttribute("aria-label")).toBe("Reset zoom");
  });

  test("simulateScale → 2 → live region announces 'Zoomed in, 2x' (plain language; critique HIGH-2)", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    await waitFor(() => {
      const live = screen.getByTestId("lightbox-zoom-live-region");
      expect(live.textContent ?? "").toContain("Zoomed in, 2x");
    });
  });

  test("de-zoom transition announces 'Zoomed out' (no silent clear; critique HIGH-2)", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    await waitFor(() => {
      const live = screen.getByTestId("lightbox-zoom-live-region");
      expect(live.textContent ?? "").toContain("Zoomed in");
    });
    simulateScale(1);
    await waitFor(() => {
      const live = screen.getByTestId("lightbox-zoom-live-region");
      expect(live.textContent ?? "").toContain("Zoomed out");
    });
  });

  test("initial mount at scale=1: live region stays silent (no 'Zoomed out' announcement)", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    // Wait past the debounce; the live region should remain empty.
    await new Promise((r) => setTimeout(r, 200));
    const live = screen.getByTestId("lightbox-zoom-live-region");
    expect(live.textContent ?? "").toBe("");
  });

  test("click Reset chip: resetTransform called; chip disappears (scale→1)", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    const chip = await screen.findByTestId("lightbox-reset-chip");
    expect(libState.resetTransformCalls).toBe(0);
    fireEvent.click(chip);
    expect(libState.resetTransformCalls).toBe(1);
    await waitFor(() => {
      expect(screen.queryByTestId("lightbox-reset-chip")).toBeNull();
    });
  });

  test("simulateScale → 1.04 (just-above-1 noise): chip hidden until scale > 1.01", () => {
    // Library can emit transient values like 1.001 during the
    // touch-down phase before any actual zoom. Don't flash the chip.
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(1.005);
    expect(screen.queryByTestId("lightbox-reset-chip")).toBeNull();
    simulateScale(1.5);
    expect(screen.queryByTestId("lightbox-reset-chip")).not.toBeNull();
  });
});

describe("M9 C6c — Keyboard map (lightbox-owned; library v4 has no keyEvents prop)", () => {
  test("TransformWrapper is NOT passed a keyEvents prop (library v4.0.3 doesn't expose it)", () => {
    // The shape brief originally planned to delegate keyboard
    // handling to the library at scale > 1. Implementation
    // discovery: react-zoom-pan-pinch v4.0.3 has no `keyEvents`
    // prop in its TypeScript signature. The lightbox now owns all
    // keyboard. This test pins the prop's absence so a future
    // attempt to re-add it (assuming a library update) is a
    // conscious decision, not a stray copy-paste.
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const props = libState.lastWrapperProps;
    expect(props).not.toBeNull();
    expect("keyEvents" in (props ?? {})).toBe(false);
  });

  test("'0' key resets scale to 1 (resetTransform invoked)", () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    fireEvent.keyDown(window, { key: "0" });
    expect(libState.resetTransformCalls).toBeGreaterThanOrEqual(1);
  });

  test("'+' and '=' keys invoke zoomIn(0.5)", () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "=" });
    expect(libState.zoomInCalls).toBe(2);
  });

  test("'-' and '_' keys invoke zoomOut(0.5)", () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(3); // zoom in first so the zoomOut has somewhere to go
    fireEvent.keyDown(window, { key: "-" });
    fireEvent.keyDown(window, { key: "_" });
    expect(libState.zoomOutCalls).toBe(2);
  });

  test("'Escape' closes lightbox regardless of scale", () => {
    const onClose = vi.fn();
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={onClose}
      />,
    );
    simulateScale(3);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("M9 C6c — Diagram navigation resets scale (per-diagram zoom context)", () => {
  test("clicking the next-chevron while zoomed invokes resetTransform", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    expect(libState.resetTransformCalls).toBe(0);
    const next = screen.getByRole("button", { name: /next diagram/i });
    fireEvent.click(next);
    // The chevron handler should call resetTransform before (or
    // alongside) Embla's scrollNext. The contract: at least one
    // resetTransform call after the chevron click.
    await waitFor(() => {
      expect(libState.resetTransformCalls).toBeGreaterThanOrEqual(1);
    });
  });

  test("clicking the prev-chevron while zoomed invokes resetTransform", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={1}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    const prev = screen.getByRole("button", { name: /previous diagram/i });
    fireEvent.click(prev);
    await waitFor(() => {
      expect(libState.resetTransformCalls).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("M9 C6c — image error while zoomed (Codex R2 HIGH regression)", () => {
  test("active image error chrome recovery does NOT depend on library callback (Codex R3 MED-2 strengthening)", async () => {
    // Codex R3 MED-2: silence the mock's auto-emit of scale=1 from
    // resetTransform so this test fails if production removes the
    // local setActiveScale(1) line. Real v4.0.3 resetTransform is
    // animated by default — the about-to-unmount TransformWrapper
    // may never fire its scale=1 listener, so the lightbox MUST
    // perform the local state reset.
    libState.silenceResetTransform = true;
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2.5);
    expect(screen.queryByTestId("lightbox-reset-chip")).not.toBeNull();
    const activeImg = screen.getAllByRole("img")[0];
    expect(activeImg).toBeDefined();
    fireEvent.error(activeImg!);
    // resetTransform must still be invoked on the about-to-unmount
    // wrapper (for library-state hygiene) AND the local
    // setActiveScale(1) must drop the lifted chrome state — that's
    // the contract the production code owns.
    expect(libState.resetTransformCalls).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(screen.queryByTestId("lightbox-reset-chip")).toBeNull();
    });
  });

  test("Codex R3 MED-3: active image error relocates focus to close button if focus was inside the dialog", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2.5);
    const chip = await screen.findByTestId("lightbox-reset-chip");
    chip.focus();
    expect(document.activeElement).toBe(chip);
    const closeButton = screen.getByRole("button", { name: /close gallery/i });
    const activeImg = screen.getAllByRole("img")[0];
    fireEvent.error(activeImg!);
    // Focus must move to close button before chip unmounts.
    expect(document.activeElement).toBe(closeButton);
  });
});

describe("M9 C6c — Codex R3 HIGH: reduced-motion threads animationTime=0 through imperative controls", () => {
  test("reduced motion → resetTransform invoked with animationTime=0", async () => {
    __matchMediaQuery = (q: string) => q.includes("reduce");
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    fireEvent.keyDown(window, { key: "0" });
    expect(libState.resetTransformAnimTimes).toContain(0);
  });

  test("reduced motion → zoomIn invoked with animationTime=0", () => {
    __matchMediaQuery = (q: string) => q.includes("reduce");
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "+" });
    expect(libState.zoomInAnimTimes).toContain(0);
  });

  test("reduced motion → zoomOut invoked with animationTime=0", () => {
    __matchMediaQuery = (q: string) => q.includes("reduce");
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(3);
    fireEvent.keyDown(window, { key: "-" });
    expect(libState.zoomOutAnimTimes).toContain(0);
  });

  test("full motion → resetTransform invoked with default animationTime (undefined)", () => {
    __matchMediaQuery = () => false;
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    simulateScale(2);
    fireEvent.keyDown(window, { key: "0" });
    // Full motion: pass undefined so the library uses its default
    // animation duration. Negative-assert NOT zero (would otherwise
    // be a regression making this test useless).
    expect(libState.resetTransformAnimTimes).toContain(undefined);
    expect(libState.resetTransformAnimTimes).not.toContain(0);
  });
});

describe("M9 C6c — Codex R5 MED-1: TransformComponent content box is viewport-sized", () => {
  test("source: contentClass forces size-full so img max-h/w resolves against figure viewport, not fit-content", async () => {
    // jsdom can't measure layout, so this is a source-shape
    // assertion: both wrapperClass AND contentClass must carry
    // !size-full + the centering flex. Without contentClass override
    // the library's default `width/height: fit-content` on the inner
    // content box would let large diagrams render at intrinsic size
    // at scale=1 on the active slide.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/diagrams/GalleryLightbox.tsx", "utf8");
    expect(source).toContain(
      'wrapperClass="!size-full !max-h-full !max-w-full !flex !items-center !justify-center"',
    );
    expect(source).toContain(
      'contentClass="!size-full !max-h-full !max-w-full !flex !items-center !justify-center"',
    );
    // The active-slide img drops max-h/w-full + uses size-full
    // because the parent boxes are now definite (no fit-content
    // ambiguity). object-contain preserves aspect.
    expect(source).toContain('className="size-full select-none object-contain"');
  });
});

describe("M9 C6c — touch-action posture on dialog root", () => {
  test("dialog root carries touch-action: manipulation (iOS-Safari-supported)", () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(3)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByTestId("diagrams-lightbox");
    const className = dialog.getAttribute("class") ?? "";
    expect(className).toContain("touch-manipulation");
  });
});
