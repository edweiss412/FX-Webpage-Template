// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/pillLeadingMarkDistinct.test.tsx
 *
 * Impeccable critique P0 (2026-08-30), raised against Decision 7.
 *
 * Counts-only copy removed the NOUN from the phone pill, and the noun was the
 * only thing distinguishing an issues pill from a sheet-warnings pill: the
 * leading dot was solid whenever the pill was not monitoring-only, and the
 * warnings segment carries no glyph of its own. So "3 issues" and "3 sheet
 * warnings" both rendered as a solid dot and a 3. Spec §2.2 lists those as
 * DISTINCT states, and DESIGN.md §1 forbids a state signal riding on hue alone.
 *
 * WHY THIS IS A JSDOM TEST AND NOT AN E2E ONE. A warnings-LED pill (no
 * actionable items, at least one sheet warning) is not reachable in any e2e
 * harness: `_pillFocusLiveEntry`'s `__setItems` feeds only the actionable and
 * self-healing counts, and the layout spec's `crewwarnings` page renders alerts
 * AND warnings together. A first attempt at this test drove
 * `__setItems(0, 3, 0)` and compared the result against `__setItems(3, 0, 0)`;
 * both rendered "3 issues", so it was measuring ONE state twice and its own
 * premise passed for the wrong reason. Props reach the state that the harness
 * cannot, so the test lives here, and the premise below is what makes the
 * difference checkable rather than assumed.
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
  actionableAlertItem,
  installModalDomStubs,
  renderPublishedModal,
} from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const leadingMark = () => {
  const pill = screen.getByTestId("published-show-review-alert-pill");
  const dot = pill.querySelector<HTMLElement>('span[aria-hidden="true"]');
  expect(dot, "the pill renders a leading mark").not.toBeNull();
  return { className: dot!.className, pill };
};

describe("attention pill — the leading mark distinguishes issues from sheet warnings (critique P0)", () => {
  it("an issues-led pill and a warnings-led pill do not render the same mark", () => {
    renderPublishedModal([], { attentionItems: [actionableAlertItem("a1")] });
    const issuesLed = leadingMark();
    const issuesHasWarningsSegment = !!issuesLed.pill.querySelector(
      '[data-testid="attention-pill-warnings-segment"]',
    );
    cleanup();

    renderPublishedModal([{ block: "Rooms", key: "Unknown Field", value: "x" }], {
      attentionItems: [],
    });
    const warningsLed = leadingMark();
    const warningsHasWarningsSegment = !!warningsLed.pill.querySelector(
      '[data-testid="attention-pill-warnings-segment"]',
    );

    // PREMISE, and the whole reason the earlier e2e attempt was worthless: the
    // two renders must genuinely BE the two states. Built as a positive pair
    // rather than one negative check, so a fixture that silently produced the
    // same state twice fails here instead of satisfying the assertion below.
    expect(
      { issues: issuesHasWarningsSegment, warnings: warningsHasWarningsSegment },
      "PREMISE: one render is issues-led (no warnings segment) and the other is warnings-led (warnings segment present)",
    ).toEqual({ issues: false, warnings: true });

    expect(
      warningsLed.className,
      `both states paint the same leading mark ("${issuesLed.className}"), so below sm they are one indistinguishable pill`,
    ).not.toBe(issuesLed.className);
  });

  it("the issues-led mark stays the solid review dot, so this did not fix one state by breaking the other", () => {
    renderPublishedModal([], { attentionItems: [actionableAlertItem("a1")] });
    expect(leadingMark().className).toContain("bg-status-review");
  });
});
