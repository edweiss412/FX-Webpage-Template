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
  selfHealAlertItem,
  installModalDomStubs,
  renderPublishedModal,
} from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PublishedReviewModal - monitoring pill accessible label (Fix C mechanism, attention split copy)", () => {
  // SUPERSEDED COPY (attention split 2026-07-21 §3.2): the old single "N clearing"
  // state split into "to review" (interactive) and "monitoring" (non-interactive).
  // This test carries Fix C's sr-only mechanism forward onto the monitoring-only
  // state — the direct heir of the old clearing pill.
  it("the 'N monitoring' pill carries a fuller meaning in an inline sr-only tail; visible text stays terse", () => {
    // Two genuinely self-healing items → monitoring-only, non-interactive.
    renderPublishedModal([], {
      attentionItems: [selfHealAlertItem("c1"), selfHealAlertItem("c2")],
    });
    const pill = screen.getByTestId("published-show-review-alert-pill");

    // The pill is a STATUS text node, not a named widget — a screen reader reads
    // its text content in document order, so an sr-only tail is announced inline
    // right after the visible count. We assert that DOM mechanism directly (NOT
    // toHaveAccessibleName, which for a generic <span> would conflate this with
    // the `title` tooltip and pass tautologically).
    const srOnly = pill.querySelector<HTMLElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.className).toContain("sr-only");
    expect(srOnly!.textContent).toBe("clearing on their own, no action needed");

    // What the SR reads (full text, in order) vs what a sighted user sees (terse).
    expect(pill.textContent).toBe("2 monitoring clearing on their own, no action needed");
    const srText = srOnly!.textContent ?? "";
    const visible = (pill.textContent ?? "")
      .slice(0, (pill.textContent ?? "").length - srText.length)
      .trim();
    expect(visible).toBe("2 monitoring");

    // Non-interactive: a span, not a button (matrix §11.5 pins the same).
    expect(pill.tagName).not.toBe("BUTTON");
    // No aria-label (ignored on a generic role); title mirrors the phrasing.
    expect(pill.getAttribute("aria-label")).toBeNull();
    expect(pill).toHaveAttribute("title", "2 monitoring, clearing on their own, no action needed");
  });
});
