// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleDayRow } from "@/components/admin/wizard/step3ReviewSections";

afterEach(cleanup);

// ScheduleDayRow returns an <li>; wrap in <ul> to keep DOM nesting valid.
const renderRow = (props: { iso: string; label?: string | null }) =>
  render(
    <ul>
      <ScheduleDayRow dfid="d" entries={[]} {...props} />
    </ul>,
  );

describe("wizard ScheduleDayRow phase/label", () => {
  test("renders the display label with a per-date testid when `label` is set", () => {
    const { container } = renderRow({ iso: "2025-10-18", label: "Travel In" });
    expect(
      container.querySelector('[data-testid="wizard-step3-card-d-sched-phase-2025-10-18"]')
        ?.textContent,
    ).toBe("Travel In");
  });

  test("no `label` prop → no phase label node", () => {
    const { container } = renderRow({ iso: "2025-10-30" });
    expect(container.querySelector('[data-testid^="wizard-step3-card-d-sched-phase-"]')).toBeNull();
  });

  test("the label is APPENDED inline to the date line ('Oct 18 — Travel In'), not a separate uppercase eyebrow", () => {
    const { container } = renderRow({ iso: "2025-10-18", label: "Travel In" });
    const phase = container.querySelector(
      '[data-testid="wizard-step3-card-d-sched-phase-2025-10-18"]',
    ) as HTMLElement;
    // Same line: the enclosing date <span> holds the humanized date AND the label.
    const dateLine = phase.parentElement as HTMLElement;
    expect(dateLine.tagName.toLowerCase()).toBe("span");
    expect(dateLine.textContent).toContain("Oct 18"); // humanizeDate("2025-10-18")
    expect(dateLine.textContent).toContain("Travel In");
    expect(dateLine.textContent).toContain("—"); // em-dash separator between them
    // No longer the uppercase eyebrow treatment.
    expect(phase.className).not.toContain("uppercase");
  });
});
