// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/clearingPillLabel.test.tsx
 * (unread-callout-dedup spec §3, Fix C — accessible clearing pill)
 *
 * The header "N clearing" pill must carry an aria-label/title spelling out what
 * "clearing" means, while its visible text stays terse. Drives the REAL
 * `PublishedReviewModal` in its clearing state.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  clearingAlertItem,
  installModalDomStubs,
  renderPublishedModal,
} from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PublishedReviewModal - clearing pill accessible label (section 3 Fix C)", () => {
  it("the 'N clearing' pill carries a fuller meaning in an inline sr-only tail; visible text stays terse", () => {
    // Two non-actionable attention items → clearingCount === 2 (live − actionable).
    renderPublishedModal([], {
      attentionItems: [clearingAlertItem("c1"), clearingAlertItem("c2")],
    });
    const pill = screen.getByTestId("published-show-review-alert-pill");

    // The pill is a STATUS text node, not a named widget — a screen reader reads
    // its text content in document order, so an sr-only tail is announced inline
    // right after the visible count. We assert that DOM mechanism directly (NOT
    // toHaveAccessibleName, which for a generic <span> would conflate this with
    // the `title` tooltip and pass tautologically).
    const srOnly = pill.querySelector<HTMLElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    // sr-only = present in the a11y tree but visually hidden (jsdom loads no CSS,
    // so assert the class contract that the design system's `.sr-only` enforces).
    expect(srOnly!.className).toContain("sr-only");
    expect(srOnly!.textContent).toBe("on their own, no action needed");

    // What the SR reads (full text, in order) vs what a sighted user sees (terse).
    expect(pill.textContent).toBe("2 clearing on their own, no action needed");
    const srText = srOnly!.textContent ?? "";
    const visible = (pill.textContent ?? "")
      .slice(0, (pill.textContent ?? "").length - srText.length)
      .trim();
    expect(visible).toBe("2 clearing");

    // No aria-label (ignored on a generic role — the whole point of the sr-only
    // approach); title mirrors the phrasing as a desktop hover affordance.
    expect(pill.getAttribute("aria-label")).toBeNull();
    expect(pill).toHaveAttribute("title", "2 clearing on their own, no action needed");
  });
});
