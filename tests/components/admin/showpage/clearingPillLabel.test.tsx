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

describe("PublishedReviewModal - monitoring pill accessible label (Fix C mechanism, monitoring-badge-expand copy)", () => {
  // SUPERSEDED COPY (attention split 2026-07-21 §3.2; monitoring-badge-expand
  // 2026-07-22 §3.1): the monitoring-only state is now a QUIET INTERACTIVE
  // button. Fix C's sr-only tail mechanism carries forward onto the button —
  // the text content (chevron is aria-hidden) IS the accessible name.
  it("the 'N monitoring' quiet BUTTON carries the sr-only tail as its accessible name; visible text stays terse", () => {
    // Two genuinely self-healing items → monitoring-only, quiet interactive.
    const FIXTURES = [selfHealAlertItem("c1"), selfHealAlertItem("c2")];
    renderPublishedModal([], { attentionItems: FIXTURES });
    const pill = screen.getByTestId("published-show-review-alert-pill");

    // Interactive: a BUTTON (matrix §11.5 pins the same) — the accName pin
    // below would bind vacuously to a span otherwise.
    expect(pill.tagName).toBe("BUTTON");

    const srOnly = pill.querySelector<HTMLElement>(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.className).toContain("sr-only");
    expect(srOnly!.textContent).toBe("clearing on their own, no action needed");

    // What the SR reads (full text, in order) vs what a sighted user sees (terse).
    expect(pill.textContent).toBe(
      `${FIXTURES.length} monitoring clearing on their own, no action needed`,
    );
    const srText = srOnly!.textContent ?? "";
    const visible = (pill.textContent ?? "")
      .slice(0, (pill.textContent ?? "").length - srText.length)
      .trim();
    expect(visible).toBe(`${FIXTURES.length} monitoring`);

    // Exact accessible name (spec §5 item 2): accName comes from text content;
    // the aria-hidden chevron contributes nothing.
    expect(pill).toHaveAccessibleName(
      `${FIXTURES.length} monitoring clearing on their own, no action needed`,
    );
    expect(pill.getAttribute("aria-label")).toBeNull();
    expect(pill).toHaveAttribute(
      "title",
      `${FIXTURES.length} monitoring, clearing on their own, no action needed`,
    );
  });
});
