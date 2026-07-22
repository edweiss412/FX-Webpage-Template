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
  it("the 'N clearing' pill carries an aria-label/title, visible text stays terse", () => {
    // Two non-actionable attention items → clearingCount === 2 (live − actionable).
    renderPublishedModal([], {
      attentionItems: [clearingAlertItem("c1"), clearingAlertItem("c2")],
    });
    const pill = screen.getByTestId("published-show-review-alert-pill");
    expect(pill).toHaveTextContent("2 clearing");
    expect(pill).toHaveAttribute("aria-label", "2 clearing on their own, no action needed");
    expect(pill).toHaveAttribute("title", "2 clearing on their own, no action needed");
  });
});
