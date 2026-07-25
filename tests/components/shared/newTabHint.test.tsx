// @vitest-environment jsdom
/**
 * tests/components/shared/newTabHint.test.tsx
 *
 * Unit coverage for the NewTabHint primitive (spec §7). Two things matter and
 * nothing else does: the copy string is EXACT (the structural guard's census and
 * every anchored accessible-name assertion depend on it), and the span is
 * visually hidden rather than removed from the accessibility tree.
 */
import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NewTabHint } from "@/components/shared/NewTabHint";

describe("NewTabHint", () => {
  it("renders exactly the canonical copy string", () => {
    const { container } = render(<NewTabHint />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    // Exact, not substring: a stray space or different casing would silently
    // break the copy census and every anchored name assertion.
    expect(span!.textContent).toBe("(opens in a new tab)");
  });

  it("is visually hidden but still in the accessibility tree", () => {
    const { container } = render(<NewTabHint />);
    const span = container.querySelector("span")!;
    // sr-only is clip-based, so the text contributes to the accessible name.
    expect(span.className).toBe("sr-only");
    // The two ways it would STOP contributing, both explicitly rejected.
    expect(span.getAttribute("aria-hidden")).toBeNull();
    expect(span.hasAttribute("hidden")).toBe(false);
  });

  it("contributes its text to an anchor's accessible name, after a sibling space", () => {
    // The §3.1 contract, exercised end to end: a real sibling space keeps the
    // boundary, so the name is "Open in Sheet (opens in a new tab)" and not
    // "Open in Sheet(opens in a new tab)".
    const { container } = render(
      <a href="https://example.test" target="_blank" rel="noopener noreferrer">
        Open in Sheet <NewTabHint />
      </a>,
    );
    // Container-scoped: RTL's bound queries search document.body, and renders
    // accumulate across cases in this file.
    expect(container.querySelector("a")!).toHaveAccessibleName(
      "Open in Sheet (opens in a new tab)",
    );
  });

  it("loses the separator when the space is written inside the span (regression pin)", () => {
    // Pins WHY the primitive must not carry its own leading space. If a future
    // edit moves the space inside, this test documents the failure mode that
    // would otherwise reach production silently.
    const { container } = render(
      <a href="https://example.test" target="_blank" rel="noopener noreferrer">
        Open in Sheet<span className="sr-only"> (opens in a new tab)</span>
      </a>,
    );
    expect(container.querySelector("a")!).toHaveAccessibleName("Open in Sheet(opens in a new tab)");
  });
});
