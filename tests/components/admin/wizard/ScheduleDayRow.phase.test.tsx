// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleDayRow } from "@/components/admin/wizard/step3ReviewSections";
import type { SchedulePhase } from "@/lib/crew/agendaDisplay";

afterEach(cleanup);

// ScheduleDayRow returns an <li>; wrap in <ul> to keep DOM nesting valid.
const renderRow = (props: { iso: string; phase?: SchedulePhase | null }) =>
  render(
    <ul>
      <ScheduleDayRow dfid="d" entries={[]} {...props} />
    </ul>,
  );

describe("wizard ScheduleDayRow phase label", () => {
  test("renders the phase label with a per-date testid when `phase` is set", () => {
    const { container } = renderRow({ iso: "2025-10-18", phase: "Travel In" });
    expect(
      container.querySelector('[data-testid="wizard-step3-card-d-sched-phase-2025-10-18"]')
        ?.textContent,
    ).toBe("Travel In");
  });

  test("no `phase` prop → no phase label node", () => {
    const { container } = renderRow({ iso: "2025-10-30" });
    expect(
      container.querySelector('[data-testid^="wizard-step3-card-d-sched-phase-"]'),
    ).toBeNull();
  });
});
