// @vitest-environment jsdom
/**
 * useAppliedTheme — persist-failure state (theme-persistence-note Task N1,
 * spec §2.1; AC-1 / AC-3 / AC-9).
 *
 * The hook deliberately ABSORBS a throwing `localStorage.setItem` (the theme
 * still applies in-tab), so nothing today distinguishes "your choice is saved"
 * from "this device will forget it". These cases pin the new `persistFailed`
 * flag AND the absorb it must not break.
 *
 * The AC-9 case is the reason the mount effect becomes a functional update: the
 * standalone toggle documents a reachable pre-mount click window
 * (`components/layout/ThemeToggle.tsx:68`), and a wholesale
 * `setState({ mounted, theme })` in the mount effect would silently clear a
 * flag set inside that window. It renders through `createRoot` + `flushSync`
 * rather than `renderHook` because RTL's render flushes passive effects, which
 * is precisely the window this has to open. `expect(mounted).toBe(false)` right
 * after the render is the PREMISE check: if effects ever start flushing there,
 * the case fails loudly instead of passing vacuously.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAppliedTheme, type AppliedTheme } from "@/components/layout/useAppliedTheme";

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

function blockWrites(): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
}

function allowWrites(): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    /* a working device: the write lands and nothing is reported */
  });
}

/** A controllable `matchMedia` — jsdom ships none, and the OS-change path needs one. */
function installMatchMedia(matches: boolean): { emit: (next: boolean) => void } {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => {
      listeners.delete(fn);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    emit: (next: boolean) => {
      mql.matches = next;
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
    },
  };
}

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  installMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("useAppliedTheme persist failure", () => {
  it("reports a blocked write AND still applies the theme in-tab (AC-1)", () => {
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.persistFailed).toBe(true);
    // The absorb is load-bearing: the guard reports the miss, it does not
    // undo the in-tab apply.
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("clears the flag when a later write succeeds (AC-3)", () => {
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.persistFailed).toBe(true);

    allowWrites();
    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.persistFailed).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps the flag set across repeated blocked writes (AC-1 repeated failure)", () => {
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.persistFailed).toBe(true);
  });

  it("preserves a pre-mount failure through the mount sync (AC-9)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const captured: { current: AppliedTheme | null } = { current: null };

    function Probe(): null {
      captured.current = useAppliedTheme();
      return null;
    }

    const priorActEnv = (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      flushSync(() => {
        root.render(createElement(Probe));
      });

      // PREMISE: the commit landed and the mount effect has NOT run yet. If
      // this ever reports `true`, the pre-effect window this case exists to
      // exercise did not open and the rest proves nothing.
      expect(captured.current?.mounted).toBe(false);

      blockWrites();
      flushSync(() => {
        captured.current?.setTheme("dark");
      });
      expect(captured.current?.persistFailed).toBe(true);
    } finally {
      if (priorActEnv === undefined) {
        delete (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT;
      } else {
        (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = priorActEnv;
      }
    }

    // Flush the mount effect. A wholesale replace here wipes the flag.
    act(() => {});

    expect(captured.current?.mounted).toBe(true);
    expect(captured.current?.persistFailed).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("leaves the flag untouched when the OS theme changes", () => {
    const media = installMatchMedia(false);
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.persistFailed).toBe(true);

    // No stored choice (the write was blocked), so the OS-change listener acts.
    act(() => {
      media.emit(true);
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(result.current.persistFailed).toBe(true);
  });
});
