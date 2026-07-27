// @vitest-environment jsdom
/**
 * Class-string tripwire for the sm+ inline header fork (spec 2026-07-26 §4.5).
 * Geometry lives in the real-browser suites; this fails FAST on a class typo.
 * jsdom computes no layout, so nothing here asserts visibility or size.
 * Mount pattern from tests/components/admin/wizard/sectionCountBoundary.test.tsx:33-48
 * (chrome in context; BreakdownSection routes through ModalSectionChrome).
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  BreakdownSection,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";

function renderChrome(overrides: Partial<Step3SectionChrome>) {
  const chrome: Step3SectionChrome = {
    Icon: (() => null) as never,
    label: "Rooms & scope",
    flagged: false,
    dfid: "drive-x",
    sectionId: "rooms",
    ...overrides,
  };
  return render(
    <Step3SectionChromeContext.Provider value={chrome}>
      <BreakdownSection testId="chrome-classes" label="Rooms & scope" count={4}>
        <div />
      </BreakdownSection>
    </Step3SectionChromeContext.Provider>,
  );
}

describe("ModalSectionChrome sm+ classes", () => {
  test("outer carries the sm row classes; line1 flattens; glyph orders last", () => {
    const { container } = renderChrome({ flagged: true });
    const icon = container.querySelector('span[aria-hidden="true"]');
    const line1 = icon?.parentElement ?? null;
    const outer = line1?.parentElement ?? null;
    expect(outer?.className).toMatch(/sm:min-h-tap-min/);
    expect(outer?.className).toMatch(/sm:flex-row/);
    expect(outer?.className).toMatch(/sm:items-center/);
    expect(outer?.className).toMatch(/sm:gap-2\.5/);
    expect(line1?.className).toMatch(/sm:contents/);
    const link = container.querySelector("a[href]");
    expect(link?.className).toMatch(/sm:order-1/);
    expect(link?.className).toMatch(/sm:ml-0\.5/);
    const pillWrapper = container.querySelector('[class*="rounded-pill"]')?.parentElement;
    expect(pillWrapper?.className).toMatch(/sm:contents/);
  });

  test("linkless branch: slot compensation is narrow-only", () => {
    const { container } = renderChrome({ dfid: "" });
    const heading = container.querySelector("h3");
    const group = heading?.parentElement ?? null;
    expect(group?.className).toMatch(/pr-header-link-slot/);
    expect(group?.className).toMatch(/sm:pr-0/);
    expect(group?.className).toMatch(/sm:justify-start/);
    expect(container.querySelector("a[href]")).toBeNull();
  });

  test("judgment pill wrapper also flattens", () => {
    const { container } = renderChrome({ judgment: true });
    const pillWrapper = container.querySelector('[class*="rounded-pill"]')?.parentElement;
    expect(pillWrapper?.className).toMatch(/sm:contents/);
  });
});
