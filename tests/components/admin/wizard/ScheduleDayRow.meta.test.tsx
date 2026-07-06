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
  const SHOW_DATES = { travelIn: null, set: null, showDays: ["2025-05-13"], travelOut: null };

  test("showStart-only Show day → 'Show Start' grid entry, no meta", () => {
    const { container } = render(
      <ScheduleBreakdown
        dfid="d"
        ros={{ "2025-05-13": day({ showStart: "8:00 AM" }) }}
        dates={SHOW_DATES}
      />,
    );
    expect(metaText(container)).toBeNull();
    const times = [...container.querySelectorAll('[data-testid="wizard-step3-card-d-sched-time"]')];
    const titles = [...container.querySelectorAll('[data-testid="wizard-step3-card-d-sched-title"]')];
    expect(times.map((n) => n.textContent)).toContain("8:00 AM");
    expect(titles.map((n) => n.textContent)).toContain("Show Start");
  });

  test("Set day with a collision-edge bare showStart → NO 'Show Start' entry (phase gate)", () => {
    // dates.set === the ros date, which is NOT a show day → aggregate phase "Set".
    const { container } = render(
      <ScheduleBreakdown
        dfid="d"
        ros={{ "2025-05-12": day({ showStart: "8:00 AM" }) }}
        dates={{ travelIn: null, set: "2025-05-12", showDays: ["2025-05-13"], travelOut: null }}
      />,
    );
    const titles = [...container.querySelectorAll('[data-testid="wizard-step3-card-d-sched-title"]')];
    expect(titles.map((n) => n.textContent)).not.toContain("Show Start");
    // Non-Show phase keeps the original start meta (byte-identical to pre-change).
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
      <ScheduleBreakdown
        dfid="d"
        ros={{ "2025-05-14": day({ entries: [{ start: "8am", title: "Reg" }] }) }}
      />,
    );
    expect(container.textContent).toContain("Reg");
    expect(metaText(container)).toBeNull();
  });
});
