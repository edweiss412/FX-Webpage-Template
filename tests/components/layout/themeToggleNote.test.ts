// @vitest-environment jsdom
/**
 * ThemeToggle — persist-failure note (theme-persistence-note Task N2, spec
 * §2.2; AC-1 / AC-2 / AC-4 / AC-5 / AC-10a).
 *
 * The note is an ANCHORED BUBBLE, not in-flow text: the standalone toggle has
 * three consumers, two of which are width-engineered rows (the admin nav's
 * 320px action cluster and the help header), and none of them can absorb a
 * growing sibling. The class-contract cases below are the unit-level half of
 * that; the real-browser half is tests/e2e/theme-persistence-note.spec.ts.
 *
 * AC-4 is the ReSyncButton trap pinned as a test: a `role="status"` node that
 * is INSERTED at failure time announces nothing, so the container is queried
 * BEFORE the failing click and must already be there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { THEME_PERSIST_FAILED_NOTE } from "@/components/layout/useAppliedTheme";

function blockWrites(): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
}

function allowWrites(): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    /* a working device */
  });
}

function installMatchMedia(): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

/** The always-mounted status region — queried by role, never by the note text. */
function statusRegion(): HTMLElement {
  return screen.getByRole("status");
}

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  installMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle persist-failure note", () => {
  it("mounts the status container empty, BEFORE any failure (AC-4)", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    // Present pre-click. An inserted live region announces nothing.
    expect(statusRegion()).toBeTruthy();
    expect(statusRegion().textContent).toBe("");
  });

  it("renders the shared copy const when the write is blocked (AC-1, AC-5)", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(statusRegion().textContent).toBe(THEME_PERSIST_FAILED_NOTE);
    // The absorb is intact: the theme still applied in-tab.
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps the note through a second blocked write (AC-1 repeated failure)", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(statusRegion().textContent).toBe(THEME_PERSIST_FAILED_NOTE);
    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(statusRegion().textContent).toBe(THEME_PERSIST_FAILED_NOTE);
  });

  it("empties then re-fills across fail, recover, fail (the announceable transition)", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(statusRegion().textContent).toBe(THEME_PERSIST_FAILED_NOTE);

    allowWrites();
    fireEvent.click(screen.getByTestId("theme-toggle"));
    // Emptied, not unmounted — the region has to survive to announce again.
    expect(statusRegion().textContent).toBe("");

    blockWrites();
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(statusRegion().textContent).toBe(THEME_PERSIST_FAILED_NOTE);
  });

  it("stays silent on a working device (AC-2)", () => {
    allowWrites();
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByTestId("theme-toggle"));
    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(statusRegion().textContent).toBe("");
  });

  it("carries plain-language copy with no technical vocabulary (AC-5)", () => {
    expect(THEME_PERSIST_FAILED_NOTE).not.toContain("—");
    for (const banned of ["localStorage", "browser storage", "cookies"]) {
      expect(THEME_PERSIST_FAILED_NOTE.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    // Straight apostrophe, matching every shipped catalog contraction.
    expect(THEME_PERSIST_FAILED_NOTE).not.toContain("’");
  });

  it("anchors the note out of flow and keeps the wrapper the button's box (AC-10a)", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    const region = statusRegion();
    expect(region.className).toContain("absolute");

    const wrapper = region.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("relative");
    expect(wrapper?.className).toContain("inline-flex");
    // The button is the wrapper's only in-flow child.
    expect(wrapper?.contains(screen.getByTestId("theme-toggle"))).toBe(true);
  });

  it("paints nothing while empty — chrome lives on the inner span (AC-10a)", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    // Empty: positioning only. Any border/background/padding here would paint a
    // box on every page that renders the toggle, failure or not.
    const emptyClasses = statusRegion().className;
    for (const chrome of ["border", "bg-", "shadow", "px-", "py-"]) {
      expect(emptyClasses).not.toContain(chrome);
    }

    fireEvent.click(screen.getByTestId("theme-toggle"));

    const inner = statusRegion().firstElementChild;
    expect(inner).not.toBeNull();
    expect(inner?.className).toContain("border");
    expect(inner?.className).toContain("bg-surface-raised");
    expect(inner?.className).toContain("text-xs/relaxed");
    expect(inner?.className).toContain("text-text-subtle");
  });
});
