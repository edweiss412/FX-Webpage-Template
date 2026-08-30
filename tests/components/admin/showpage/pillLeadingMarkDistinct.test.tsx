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
  selfHealAlertItem,
} from "./__fixtures__/publishedModalHarness";

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/**
 * The mark reduced to SHAPE, never to its class string.
 *
 * The first version of this helper returned `className` and compared strings,
 * which whole-diff R2 caught: two SOLID marks differing only in a colour class
 * would have compared unequal and passed, which is the exact defect the file
 * exists to prevent. Reduced to two booleans a colour-blind reader can also
 * resolve -- is it filled, is it ringed -- so three states must occupy three
 * distinct (filled, ringed) tuples.
 */
const leadingMark = () => {
  const pill = screen.getByTestId("published-show-review-alert-pill");
  const dot = pill.querySelector<HTMLElement>('span[aria-hidden="true"]');
  expect(dot, "the pill renders a leading mark").not.toBeNull();
  const cls = dot!.className;
  // jsdom applies no stylesheet, so shape is read from the utility classes that
  // determine it. `bg-transparent` is the explicit no-fill token this component
  // uses; a border utility with a width is the ring.
  const filled = !/\bbg-transparent\b/.test(cls) && /\bbg-[a-z-]/.test(cls);
  const ringed = /\bborder-\[[\d.]+px\]/.test(cls) || /\bborder-[a-z]/.test(cls);
  return { filled, ringed, className: cls, pill };
};

describe("attention pill — the leading mark distinguishes all three states (critique P0, R2 P0)", () => {
  it("issues, warnings and monitoring occupy THREE distinct shapes, not three colours", () => {
    renderPublishedModal([], { attentionItems: [actionableAlertItem("a1")] });
    const issues = leadingMark();
    const issuesHasWarnSeg = !!issues.pill.querySelector(
      '[data-testid="attention-pill-warnings-segment"]',
    );
    cleanup();

    renderPublishedModal([{ block: "Rooms", key: "Unknown Field", value: "x" }], {
      attentionItems: [],
    });
    const warnings = leadingMark();
    const warningsHasWarnSeg = !!warnings.pill.querySelector(
      '[data-testid="attention-pill-warnings-segment"]',
    );
    cleanup();

    renderPublishedModal([], {
      attentionItems: [selfHealAlertItem("c1"), selfHealAlertItem("c2")],
    });
    const monitoring = leadingMark();
    const monitoringHasMonSeg = !!monitoring.pill.querySelector(
      '[data-testid="attention-pill-monitoring-segment"]',
    );

    // PREMISE: three genuinely different states, asserted positively. Without
    // this the comparison below is satisfiable by rendering one state 3 times.
    expect(
      {
        issues: { warn: issuesHasWarnSeg },
        warnings: { warn: warningsHasWarnSeg },
        monitoring: { mon: monitoringHasMonSeg },
      },
      "PREMISE: the three renders really are the three states",
    ).toEqual({
      issues: { warn: false },
      warnings: { warn: true },
      monitoring: { mon: true },
    });

    const shape = (m: { filled: boolean; ringed: boolean }) =>
      `${m.filled ? "filled" : "hollow"}/${m.ringed ? "ringed" : "plain"}`;
    const shapes = {
      issues: shape(issues),
      warnings: shape(warnings),
      monitoring: shape(monitoring),
    };
    const distinct = new Set(Object.values(shapes));
    expect(
      distinct.size,
      `the three states must occupy three distinct SHAPES; got ${JSON.stringify(shapes)}. Differing only in colour leaves a colour-blind reader one pill.`,
    ).toBe(3);
  });

  it("the issues-led mark stays the solid review dot, so this did not fix one state by breaking the other", () => {
    renderPublishedModal([], { attentionItems: [actionableAlertItem("a1")] });
    expect(leadingMark().className).toContain("bg-status-review");
  });
});
