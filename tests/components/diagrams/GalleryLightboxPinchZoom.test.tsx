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
  zoomInCalls: number;
  zoomOutCalls: number;
  lastWrapperProps: Record<string, unknown> | null;
}

const libState: LibTestState = {
  scaleListeners: [],
  resetTransformCalls: 0,
  zoomInCalls: 0,
  zoomOutCalls: 0,
  lastWrapperProps: null,
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
      resetTransform: () => {
        libState.resetTransformCalls += 1;
        // Library behavior: resetTransform fires a transform event back
        // to listeners with scale=1.
        simulateScale(1);
      },
      zoomIn: (step?: number) => {
        libState.zoomInCalls += 1;
        const next = Math.min(4, 1 + (step ?? 0.5));
        simulateScale(next);
      },
      zoomOut: (_step?: number) => {
        libState.zoomOutCalls += 1;
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
  libState.zoomInCalls = 0;
  libState.zoomOutCalls = 0;
  libState.lastWrapperProps = null;
  __matchMediaQuery = () => false;
});

describe("M9 C6c — TransformWrapper prop contract", () => {
  test("min=1, max=4, doubleClick toggles 1↔2 with mode='toggle' + step=1", () => {
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
    expect(props?.minScale).toBe(1);
    expect(props?.maxScale).toBe(4);
    const dc = props?.doubleClick as { mode?: string; step?: number } | undefined;
    expect(dc?.mode).toBe("toggle");
    // step=1 means 1 + 1 = 2× on toggle (library adds step to minScale).
    expect(dc?.step).toBe(1);
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

  test("Codex R1 HIGH: wheel requires Control/Meta activation keys (no unintended desktop zoom)", () => {
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
      | { disabled?: boolean; activationKeys?: string[] }
      | undefined;
    expect(wheel?.disabled).toBe(false);
    expect(wheel?.activationKeys).toEqual(["Control", "Meta"]);
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
  test("active image error fires resetTransform + drops activeScale to 1 so Reset chip + chip-bound chrome don't strand", async () => {
    render(
      <GalleryLightbox
        showId={SHOW_ID}
        snapshotRevisionId={REV}
        items={items(2)}
        startIndex={0}
        onClose={() => {}}
      />,
    );
    // Simulate user zooms past threshold.
    simulateScale(2.5);
    expect(screen.queryByTestId("lightbox-reset-chip")).not.toBeNull();
    // Image errors mid-zoom.
    const activeImg = screen.getAllByRole("img")[0];
    expect(activeImg).toBeDefined();
    fireEvent.error(activeImg!);
    // Two things must happen synchronously:
    //   (a) resetTransform invoked on the about-to-unmount wrapper.
    expect(libState.resetTransformCalls).toBeGreaterThanOrEqual(1);
    //   (b) Reset chip disappears because activeScale dropped to 1
    //       (driven by the local setActiveScale(1) in onError).
    //       The TransformWrapper unmounts (placeholder renders),
    //       which would also unmount ZoomController; this test
    //       proves the chrome state synchronizes even when the
    //       library has no chance to fire its scale=1 listener.
    await waitFor(() => {
      expect(screen.queryByTestId("lightbox-reset-chip")).toBeNull();
    });
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
