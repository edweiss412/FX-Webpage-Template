// @vitest-environment jsdom
/**
 * useAppliedTheme — a blocked write is absorbed SILENTLY.
 *
 * Product ruling 2026-08-26 (spec 2026-08-15-theme-persistence-note §2.2,
 * "Amendment, 2026-08-26"): persisting the theme choice is a convenience, not a
 * failure mode the user is asked to acknowledge. The hook keeps the absorb it
 * always had and drops the `persistFailed` flag that reported it.
 *
 * Two things are pinned here, and the second is the one that matters over time.
 * The BEHAVIOUR: a throwing `localStorage.setItem` never stops the theme from
 * applying in-tab. The SHAPE: `persistFailed` is absent from the hook's return
 * value, asserted with an `in` check rather than `toBeUndefined()`, because an
 * absent key and a key set to `undefined` are the same to `toBeUndefined()` and
 * only one of them is the removal this file exists to hold.
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

describe("useAppliedTheme absorbs a blocked write silently", () => {
  it("applies the theme in-tab through a throwing write, and reports nothing", () => {
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    // The absorb is the whole feature: the write is lost, the visit is not.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect("persistFailed" in result.current).toBe(false);
  });

  it("exposes no failure flag on a working device either", () => {
    allowWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect("persistFailed" in result.current).toBe(false);
  });

  it("keeps applying the theme across repeated blocked writes", () => {
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      result.current.setTheme("light");
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect("persistFailed" in result.current).toBe(false);
  });

  it("carries a pre-mount blocked write through the mount sync", () => {
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
      // exercise did not open and the rest proves nothing. The window is real:
      // ThemeToggle documents a reachable pre-mount click.
      expect(captured.current?.mounted).toBe(false);

      blockWrites();
      flushSync(() => {
        captured.current?.setTheme("dark");
      });
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      if (priorActEnv === undefined) {
        delete (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT;
      } else {
        (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = priorActEnv;
      }
    }

    // Flush the mount effect. The theme the pre-mount click applied has to
    // survive it — the effect re-reads the DOM, so a wholesale replace is
    // harmless here, but a replace that re-derived from stored state would
    // silently roll the choice back on exactly the device that cannot store.
    act(() => {});

    expect(captured.current?.mounted).toBe(true);
    expect(captured.current?.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(captured.current !== null && "persistFailed" in captured.current).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("lets a later OS change take over, because a blocked write left no stored choice", () => {
    // REWRITTEN 2026-08-26 (diff review r1 finding 1). The previous version
    // applied dark, emitted an OS event that ALSO said dark, and asserted dark.
    // Deleting either production line in the OS-change handler still passed it:
    // the assertion could not tell the listener from a no-op. It was also
    // mis-titled — it claimed the applied theme is "left alone", when the real
    // contract is the opposite. A blocked write stores nothing, so `getItem`
    // returns null, the handler's stored-choice early return does not fire, and
    // the OS genuinely takes over. That is the behaviour worth pinning on the
    // device this whole arc is about.
    //
    // The emitted value now DIFFERS from the applied theme, which is what makes
    // it discriminate, and both observables are asserted: the dataset write and
    // the state update are separate lines and a test that names only one leaves
    // the other free to be deleted.
    const media = installMatchMedia(false);
    blockWrites();
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    // PREMISE: dark is genuinely applied, so the OS event below is a real
    // transition rather than a restatement of the current state.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(result.current.theme).toBe("dark");

    act(() => {
      media.emit(false);
    });

    // Pins the dataset write in the OS-change handler.
    expect(document.documentElement.dataset.theme).toBe("light");
    // Pins the state update beside it. Without this, deleting the setState
    // leaves the control rendering a stale `isDark` while the page is light.
    expect(result.current.theme).toBe("light");
    expect(result.current.mounted && result.current.isDark).toBe(false);

    expect("persistFailed" in result.current).toBe(false);
  });

  it("does NOT follow the OS once a write has actually landed", () => {
    // The other side of the same branch, and the reason the early return
    // exists: a user who successfully picked a theme is not overridden by the
    // OS. Without this case the stored-choice guard could be deleted and only
    // the case above would notice, which would read as the listener being
    // over-eager rather than as a missing guard.
    const media = installMatchMedia(false);
    allowWrites();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => "dark");
    const { result } = renderHook(() => useAppliedTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      media.emit(false);
    });

    // The stored choice wins: the OS saying light does not undo the pick.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(result.current.theme).toBe("dark");
  });
});
