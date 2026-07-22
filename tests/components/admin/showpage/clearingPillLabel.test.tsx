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
  it("the 'N clearing' pill has a full accessible name via an sr-only tail; visible text stays terse; title mirrors it", () => {
    // Two non-actionable attention items → clearingCount === 2 (live − actionable).
    renderPublishedModal([], {
      attentionItems: [clearingAlertItem("c1"), clearingAlertItem("c2")],
    });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    // Accessible NAME (computed from text content incl. the sr-only tail), NOT a
    // mere attribute — a bare <span> has the generic role and would ignore
    // aria-label, so we prove the real accessible name the AT will announce.
    expect(pill).toHaveAccessibleName("2 clearing on their own, no action needed");
    // The fuller phrasing lives ONLY in the sr-only tail (hidden from sighted
    // users); the visible portion stays the terse "2 clearing".
    const srOnly = pill.querySelector(".sr-only");
    expect(srOnly?.textContent).toBe("on their own, no action needed");
    expect(pill.textContent?.replace(srOnly?.textContent ?? "", "").trim()).toBe("2 clearing");
    // No aria-label (would be ignored on the generic role); title mirrors the name.
    expect(pill.getAttribute("aria-label")).toBeNull();
    expect(pill).toHaveAttribute("title", "2 clearing on their own, no action needed");
  });
});
