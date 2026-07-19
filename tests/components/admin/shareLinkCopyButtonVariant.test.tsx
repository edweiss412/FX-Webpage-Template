// @vitest-environment jsdom
/**
 * tests/components/admin/shareLinkCopyButtonVariant.test.tsx
 * (modal-header-reconciliation §6.4 / §7.1, Task 6)
 *
 * `ShareLinkCopyButton`'s boolean `compact` became insufficient the moment a
 * THIRD style landed: three styles cannot be spelled by two boolean states.
 * This suite pins the replacement — an exhaustive `variant` union — and, more
 * importantly, pins the arm the change is most likely to break by accident.
 *
 * The failure mode this file exists to catch (§F3): the shared DEFAULT (accent)
 * arm gets restyled to produce the neutral outline treatment, silently
 * restyling the share panel that is mounted INSIDE this very modal
 * (ShareLinkBody reaches the button through the Overview `shareSlot`). That
 * regression is invisible to any test that only looks at the new arm — hence
 * T-COPY-ACCENT-UNCHANGED, which is DECLARED NOT RED: it is an invariance guard,
 * green before and after by design. This task's red comes from T-COPY-OUTLINE,
 * whose subject (`variant="outline"`) does not exist pre-change.
 *
 * Anti-tautology: the copied-state assertions drive the REAL click path with a
 * stubbed clipboard and fake timers, so "the label swaps back after the 2s
 * timer" is exercised rather than assumed.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";

const URL_FIXTURE = "https://example.test/show/east-coast-summit/TOKEN123";

const writeText = vi.fn(async () => {});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const button = () => screen.getByTestId("admin-current-share-link-copy-button");

/** Drive the real click path and flush the async clipboard write. */
async function clickCopy() {
  await act(async () => {
    fireEvent.click(button());
  });
}

describe("ShareLinkCopyButton variant='outline' (T-COPY-OUTLINE — modal-header-reconciliation §6.4)", () => {
  it("idle: renders the VISIBLE 'Copy crew link' label plus a copy glyph", () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    expect(button()).toHaveTextContent("Copy crew link");
    expect(button().querySelector("svg")).not.toBeNull();
  });

  // An idle-only assertion is THE failure mode here: announcing success only
  // through the sr-only live region leaves sighted users with no feedback and
  // the button looks inert on click.
  it("copied: the visible label swaps to 'Copied' and the glyph swaps to the check", async () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    const before = button().querySelector("svg")!.innerHTML;
    await clickCopy();
    expect(writeText).toHaveBeenCalledWith(URL_FIXTURE);
    expect(button()).toHaveTextContent("Copied");
    expect(button()).not.toHaveTextContent("Copy crew link");
    expect(button().querySelector("svg")!.innerHTML).not.toBe(before);
  });

  it("copied: reverts to the idle label on the existing 2s timer", async () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    await clickCopy();
    expect(button()).toHaveTextContent("Copied");
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(button()).toHaveTextContent("Copy crew link");
  });

  // §6.4: the VISIBLE text is the accessible name. A leftover aria-label ("Copy
  // URL") would silently override it and contradict what the user reads.
  it("carries NO aria-label — the visible text IS the accessible name", async () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    expect(button().getAttribute("aria-label")).toBeNull();
    expect(screen.getByRole("button", { name: /^Copy crew link$/ })).toBe(button());
    await clickCopy();
    expect(screen.getByRole("button", { name: /^Copied$/ })).toBe(button());
  });

  it("still announces the copied state through the sr-only live region", async () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    const announce = screen.getByTestId("admin-current-share-link-copy-announce");
    expect(announce.textContent).toBe("");
    await clickCopy();
    expect(announce.textContent).toBe("URL copied to clipboard");
  });

  // The button sits at the strip row's `ml-auto` end, so a width change on the
  // label swap would shift its LEFT edge. A reserved min-width prevents it.
  it("reserves a min-width so the label swap cannot shift the button's left edge", () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    expect(button().className).toMatch(/min-w-\[/);
  });

  it("renders the neutral outline recipe — transparent fill, NOT the accent arm", () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="outline" />);
    const cls = button().className;
    expect(cls).toContain("border-border-strong");
    expect(cls).toContain("bg-transparent");
    expect(cls).toContain("min-h-tap-min");
    expect(cls).toContain("focus-visible:ring-focus-ring");
    // The orange budget (§4.2): this arm removes the first of two oranges.
    expect(cls).not.toContain("bg-accent");
  });
});

// DECLARED NOT RED (plan §11 map): an invariance guard on the shared arm (§F3),
// green before AND after. Its value is entirely in the future — it fails the
// day someone "simplifies" the union by restyling the default.
describe("T-COPY-ACCENT-UNCHANGED — the shared default arm is untouched", () => {
  it("variant='accent' keeps the accent fill, the short 'Copy' label and its aria-label", async () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="accent" />);
    expect(button().className).toContain("bg-accent");
    expect(button().className).toContain("text-accent-text");
    expect(button()).toHaveTextContent("Copy");
    expect(button()).not.toHaveTextContent("Copy crew link");
    expect(button().getAttribute("aria-label")).toBe("Copy URL");
    await clickCopy();
    expect(button()).toHaveTextContent("Copied");
    expect(button().getAttribute("aria-label")).toBe("URL copied to clipboard");
  });

  it("omitting variant resolves to the accent arm (the default is still accent)", () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} />);
    expect(button().className).toContain("bg-accent");
  });
});

describe("variant='compact' — today's icon-only arm, unchanged", () => {
  it("renders a glyph and NO visible label, keeping its aria-label", async () => {
    render(<ShareLinkCopyButton url={URL_FIXTURE} variant="compact" />);
    expect(button().querySelector("svg")).not.toBeNull();
    expect(button().textContent).toBe("");
    expect(button().getAttribute("aria-label")).toBe("Copy URL");
    expect(button().className).not.toContain("bg-accent");
    await clickCopy();
    expect(button().getAttribute("aria-label")).toBe("URL copied to clipboard");
  });
});
