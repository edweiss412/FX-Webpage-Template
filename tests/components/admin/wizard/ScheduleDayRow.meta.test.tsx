// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ScheduleDay } from "@/lib/parser/types";

afterEach(cleanup);

const day = (extra: Partial<ScheduleDay>): ScheduleDay => ({
  entries: [],
  showStart: null,
  showEnd: null,
  window: null,
  ...extra,
});
// Query the meta line by its testid + read textContent (repo convention — no jest-dom).
const metaText = (c: HTMLElement): string | null =>
  c.querySelector('[data-testid="wizard-step3-card-d-sched-meta"]')?.textContent ?? null;

describe("wizard ScheduleDayRow fragment-day meta (#307)", () => {
  test("showStart-only day → start meta", () => {
    const { container } = render(
      <ScheduleBreakdown dfid="d" ros={{ "2025-05-13": day({ showStart: "8:00 AM" }) }} />,
    );
    expect(metaText(container)).toBe("8:00 AM");
  });
  test("window day → range meta", () => {
    const { container } = render(
      <ScheduleBreakdown
        dfid="d"
        ros={{ "2025-06-25": day({ window: { start: "7:30 AM", end: "5:50 PM" } }) }}
      />,
    );
    expect(metaText(container)).toBe("7:30 AM–5:50 PM");
  });
  test("end-only day → 'Ends' meta", () => {
    const { container } = render(
      <ScheduleBreakdown dfid="d" ros={{ "2025-05-14": day({ showEnd: "6:00 PM" }) }} />,
    );
    expect(metaText(container)).toBe("Ends 6:00 PM");
  });
  test("titled day → entries, no meta line", () => {
    const { container } = render(
      <ScheduleBreakdown dfid="d" ros={{ "2025-05-14": day({ entries: [{ start: "8am", title: "Reg" }] }) }} />,
    );
    expect(container.textContent).toContain("Reg");
    expect(metaText(container)).toBeNull();
  });
});
