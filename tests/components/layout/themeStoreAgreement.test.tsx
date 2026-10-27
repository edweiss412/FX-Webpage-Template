// @vitest-environment jsdom
/**
 * useAppliedTheme — every mounted control reads ONE theme value.
 *
 * Crew page redesign spec (docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md
 * §4.1): the header theme switch becomes visible for every crew-page viewer, so
 * an identified viewer has two mounted controls, the header switch and the
 * avatar menu checkbox. Each used to keep its own React state, so flipping one
 * left the other showing the old value, and the next flip from the stale one
 * computed the wrong "next" theme. These cases mount two independent roots (two
 * controls in different subtrees, as the header and the menu are) and assert
 * they agree after every input that can change the theme: either control, the
 * OS following path, and another tab's write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  THEME_STORAGE_KEY,
  useAppliedTheme,
  type AppliedTheme,
} from "@/components/layout/useAppliedTheme";

/** A controllable `matchMedia`; jsdom ships none. Exposes its live listener count. */
function installMatchMedia(matches: boolean): {
  emit: (next: boolean) => void;
  listenerCount: () => number;
} {
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
    listenerCount: () => listeners.size,
  };
}

function themeOf(current: AppliedTheme): string {
  return current.mounted ? current.theme : "unmounted";
}

/** Two controls in separate roots, the way the header and the avatar menu are. */
function mountTwoControls() {
  const header = renderHook(() => useAppliedTheme());
  const menu = renderHook(() => useAppliedTheme());
  return { header, menu };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("useAppliedTheme shares one value across mounted controls", () => {
  it("keeps both controls in agreement when either one sets the theme", () => {
    installMatchMedia(false);
    const { header, menu } = mountTwoControls();
    // PREMISE: both start mounted on the applied light theme, so a flip is a
    // real transition for each.
    expect(themeOf(header.result.current)).toBe("light");
    expect(themeOf(menu.result.current)).toBe("light");

    act(() => {
      header.result.current.setTheme("dark");
    });
    expect(themeOf(header.result.current)).toBe("dark");
    expect(themeOf(menu.result.current)).toBe("dark");

    act(() => {
      menu.result.current.setTheme("light");
    });
    expect(themeOf(header.result.current)).toBe("light");
    expect(themeOf(menu.result.current)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies another tab's stored choice to the page and to both controls", () => {
    installMatchMedia(false);
    const { header, menu } = mountTwoControls();

    act(() => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }),
      );
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(themeOf(header.result.current)).toBe("dark");
    expect(themeOf(menu.result.current)).toBe("dark");
  });

  it("ignores a storage event for any other key", () => {
    installMatchMedia(false);
    const { header, menu } = mountTwoControls();

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "dark" }));
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeOf(header.result.current)).toBe("light");
    expect(themeOf(menu.result.current)).toBe("light");
  });

  it("follows the OS in both controls while no choice is stored", () => {
    const media = installMatchMedia(false);
    const { header, menu } = mountTwoControls();

    act(() => {
      media.emit(true);
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(themeOf(header.result.current)).toBe("dark");
    expect(themeOf(menu.result.current)).toBe("dark");
  });

  it("does not follow the OS once a choice is stored", () => {
    const media = installMatchMedia(false);
    const { header, menu } = mountTwoControls();

    act(() => {
      header.result.current.setTheme("light");
    });
    // PREMISE: the write landed, so the stored-choice guard is what is tested.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    act(() => {
      media.emit(true);
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeOf(header.result.current)).toBe("light");
    expect(themeOf(menu.result.current)).toBe("light");
  });

  it("detaches the OS listener once no control is mounted", () => {
    const media = installMatchMedia(false);
    const { header, menu } = mountTwoControls();
    // PREMISE: a listener is attached while controls are mounted.
    expect(media.listenerCount()).toBeGreaterThan(0);

    header.unmount();
    menu.unmount();

    expect(media.listenerCount()).toBe(0);
  });
});

describe("useAppliedTheme server and hydration markup", () => {
  function Probe(): ReactElement {
    const applied = useAppliedTheme();
    return createElement("span", { "data-probe": themeOf(applied) });
  }

  it("renders the unmounted placeholder on the server whatever the page theme", () => {
    installMatchMedia(true);
    document.documentElement.dataset.theme = "dark";

    expect(renderToString(createElement(Probe))).toContain('data-probe="unmounted"');
  });

  it("hydrates the server markup without a mismatch, then reads the applied theme", () => {
    installMatchMedia(false);
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Probe));
    document.body.appendChild(container);
    // The no-FOUC script stamped dark before hydration.
    document.documentElement.dataset.theme = "dark";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | null = null;
    act(() => {
      root = hydrateRoot(container, createElement(Probe));
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector("[data-probe]")?.getAttribute("data-probe")).toBe("dark");

    act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
