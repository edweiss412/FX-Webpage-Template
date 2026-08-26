// @vitest-environment jsdom
/**
 * ThemeToggle — the persist-failure note is GONE, and stays gone.
 *
 * Product ruling 2026-08-26 (recorded in spec 2026-08-15-theme-persistence-note
 * §2.2, "Amendment, 2026-08-26"): saving a theme choice is a convenience, not a
 * failure mode that needs acknowledging. A device that cannot persist the
 * choice still gets the theme it asked for, for the visit, and is told nothing.
 *
 * So this file inverted. It used to pin the note's shape (AC-1/2/4/5/10a); it
 * now pins its ABSENCE, which is a harder thing to test honestly: `queryBy...`
 * returning null is also what a component that failed to render returns. Every
 * case below therefore carries a PREMISE that only a working toggle satisfies —
 * the applied theme actually flips on the click — so "nothing rendered" can
 * never be mistaken for "the note is gone".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

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

function toggle(): HTMLElement {
  return screen.getByTestId("theme-toggle");
}

/** The applied theme, which is the only thing the control still promises. */
function appliedTheme(): string | undefined {
  return document.documentElement.dataset.theme;
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

describe("ThemeToggle renders no persist-failure note", () => {
  it("says nothing when the write is blocked, and still applies the theme", () => {
    blockWrites();
    render(createElement(ThemeToggle));

    fireEvent.click(toggle());

    // PREMISE: the click did real work through the throwing write. Without
    // this, every absence assertion below would also pass on a dead render.
    expect(appliedTheme()).toBe("dark");

    expect(screen.queryByTestId("theme-persist-note")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("mounts no live region at all, before or after a blocked write", () => {
    blockWrites();
    const { container } = render(createElement(ThemeToggle));

    // The old shape kept an always-mounted empty `role="status"` so that a
    // later message would announce. There is no later message now, so the
    // region itself is the thing that must not exist — an empty one left
    // behind is dead a11y surface, not a harmless leftover.
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();

    fireEvent.click(toggle());

    expect(appliedTheme()).toBe("dark");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("renders no visible copy of any wording on a blocked write", () => {
    blockWrites();
    const { container } = render(createElement(ThemeToggle));

    fireEvent.click(toggle());
    expect(appliedTheme()).toBe("dark");

    // Deliberately NOT a match against the deleted string: a reworded note
    // would slip past that, and the point of the ruling is that there is no
    // note of any wording. The control's only content is an aria-hidden icon,
    // so any rendered text at all is a regression.
    expect(container.textContent).toBe("");
  });

  it("still flips the theme on a device where the write succeeds", () => {
    allowWrites();
    render(createElement(ThemeToggle));

    fireEvent.click(toggle());
    expect(appliedTheme()).toBe("dark");

    fireEvent.click(toggle());
    expect(appliedTheme()).toBe("light");

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("returns the button as its root, with no anchoring wrapper left behind", () => {
    blockWrites();
    const { container } = render(createElement(ThemeToggle));

    // The `relative inline-flex` span existed ONLY to anchor the absolute
    // bubble (spec §2.2). With the bubble gone it anchors nothing, and a
    // pass-through wrapper is the kind of dead structure that later reads as
    // load-bearing. The button is the component.
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(toggle());
    expect(toggle().tagName).toBe("BUTTON");
  });
});
