// @vitest-environment jsdom
/**
 * T1 — non-finite section counts must render no chip, on BOTH render paths.
 *
 * `count` reaches these components from parsed sheet data, and `number | null`
 * does not exclude `NaN`, `Infinity`, or `-Infinity`. Before this task both paths
 * rendered them: the modal path because `shouldShowSectionCount`
 * (components/admin/wizard/step3ReviewSections.tsx) tested only `null`, membership
 * and the flagged-zero carve-out, and the legacy no-chrome path because it gated on
 * nothing but `count !== null`.
 *
 * Both paths are asserted by RENDERED OUTPUT, not by calling the predicate — a
 * helper-only assertion passes even if a caller bypasses or misuses it, which is
 * exactly how `(NaN)` could stay visible while the test was green. A supplemental
 * direct predicate test rides along at the end.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BreakdownSection,
  Step3SectionChromeContext,
  hasRenderableCount,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";

const NON_FINITE: ReadonlyArray<readonly [string, number]> = [
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
];

/** Modal path: chrome present, so `ModalSectionChrome` owns the count chip. */
function renderModalPath(count: number) {
  const chrome: Step3SectionChrome = {
    Icon: (() => null) as never,
    label: "Rooms",
    flagged: false,
    dfid: "drive-abc",
    sectionId: "rooms",
  };
  return render(
    <Step3SectionChromeContext.Provider value={chrome}>
      <BreakdownSection testId="count-boundary-modal" label="Rooms" count={count}>
        <div data-testid="boundary-child">Section body</div>
      </BreakdownSection>
    </Step3SectionChromeContext.Provider>,
  );
}

/** Legacy path: no chrome in context, so `BreakdownSection` renders its own head. */
function renderLegacyPath(count: number) {
  return render(
    <BreakdownSection testId="count-boundary-legacy" label="Rooms" count={count}>
      <div data-testid="boundary-child">Section body</div>
    </BreakdownSection>,
  );
}

/**
 * What must survive the count being unrenderable: the section itself. Suppressing
 * the chip is the contract; suppressing the SECTION would also satisfy an
 * absence-only assertion, which is why this runs before every one of them.
 */
function expectSectionStillRendered(container: HTMLElement, path: "modal" | "legacy") {
  const heading = container.querySelector("h3, h4");
  expect(heading, `${path}: the section heading still renders`).not.toBeNull();
  expect(
    (heading?.textContent ?? "").trim().length,
    `${path}: the heading carries its label`,
  ).toBeGreaterThan(0);
  expect(
    container.querySelector('[data-testid="boundary-child"]'),
    `${path}: the section body still renders`,
  ).not.toBeNull();
}

describe("non-finite section counts render no chip", () => {
  for (const [name, value] of NON_FINITE) {
    it(`rejects ${name} (modal path)`, () => {
      const { container } = renderModalPath(value);
      // POSITIVE ANCHOR FIRST. Review round 1: absence-only assertions pass just as
      // well when the whole section returns null — an implementation that bailed out
      // on a non-finite count would delete the heading and the body and satisfy every
      // `not.toContain` below. The heading and the child must still be there.
      expectSectionStillRendered(container, "modal");
      // The chip is the only place a bare "(…)" is emitted in this subtree.
      expect(container.textContent ?? "").not.toContain(String(value));
      expect(container.textContent ?? "").not.toMatch(/\(\s*(NaN|-?Infinity)\s*\)/);
    });

    it(`rejects ${name} (legacy path)`, () => {
      const { container } = renderLegacyPath(value);
      expectSectionStillRendered(container, "legacy");
      expect(container.textContent ?? "").not.toContain(String(value));
      expect(container.textContent ?? "").not.toMatch(/\(\s*(NaN|-?Infinity)\s*\)/);
    });
  }

  it("still renders a finite count on both paths (guards against over-suppression)", () => {
    const modal = renderModalPath(4);
    expect(modal.container.textContent ?? "").toContain("(4)");
    modal.unmount();
    const legacy = renderLegacyPath(4);
    expect(legacy.container.textContent ?? "").toContain("(4)");
  });

  it("hasRenderableCount rejects null and every non-finite value, accepts finite", () => {
    expect(hasRenderableCount(null)).toBe(false);
    for (const [, value] of NON_FINITE) expect(hasRenderableCount(value)).toBe(false);
    expect(hasRenderableCount(0)).toBe(true);
    expect(hasRenderableCount(4)).toBe(true);
  });
});
