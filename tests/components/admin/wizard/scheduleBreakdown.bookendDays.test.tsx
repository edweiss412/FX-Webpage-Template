// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import type { ScheduleDay, ShowRow } from "@/lib/parser/types";

afterEach(cleanup);

const day = (extra: Partial<ScheduleDay> = {}): ScheduleDay => ({
  entries: [],
  showStart: null,
  showEnd: null,
  window: null,
  ...extra,
});
const dates = (o: Partial<ShowRow["dates"]> = {}): ShowRow["dates"] => ({
  travelIn: null,
  set: null,
  showDays: [],
  travelOut: null,
  ...o,
});
const phaseOf = (c: HTMLElement, iso: string): string | null =>
  c.querySelector(`[data-testid="wizard-step3-card-d-sched-phase-${iso}"]`)?.textContent ?? null;

describe("wizard ScheduleBreakdown — all schedule days (bug #316 item 1)", () => {
  const fx = dates({
    travelIn: "2025-10-18",
    set: "2025-10-19",
    showDays: ["2025-10-20", "2025-10-21"],
    travelOut: "2025-10-22",
  });

  test("travel-in day surfaces with its phase label even with no ros entry", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    expect(phaseOf(container, fx.travelIn as string)).toBe("Travel In");
  });

  test("travel-out day surfaces with its phase label", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    expect(phaseOf(container, fx.travelOut as string)).toBe("Travel Out");
  });

  test("every aggregate day's phase label matches aggregateDays(dates) (bound per date)", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    for (const d of aggregateDays(fx)) {
      expect(phaseOf(container, d.date)).toBe(d.phase); // expected DERIVED from the data source
    }
  });

  test("regression: an off-schedule ros-only day is preserved (union, not aggregate-only)", () => {
    // 2025-10-30 is NOT in the aggregate domain — a parser off-schedule strike.
    const ros = {
      "2025-10-30": day({
        entries: [{ start: "5:00 PM", title: "Strike — GS", kind: "strike" as const }],
      }),
    };
    const { container } = render(<ScheduleBreakdown dfid="d" ros={ros} dates={fx} />);
    expect(container.textContent).toContain("Strike — GS");
    expect(phaseOf(container, "2025-10-30")).toBeNull(); // ros-only → no phase
  });

  test("empty dates + empty ros → 'No run-of-show parsed.'", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={dates()} />);
    expect(container.textContent).toContain("No run-of-show parsed.");
  });

  test("BreakdownSection count reflects merged day count (scoped to the count element)", () => {
    const ros = {
      "2025-10-30": day({
        entries: [{ start: "5:00 PM", title: "X", kind: "strike" as const }],
      }),
    };
    const { getByTestId } = render(<ScheduleBreakdown dfid="d" ros={ros} dates={fx} />);
    const el = getByTestId("wizard-step3-card-d-breakdown-schedule");
    // Derive the merged count from the fixture; assert against the section header's
    // count node ("(N)" in the <h4> eyebrow) — NOT a bare getByText that matches a time.
    const merged = new Set([...aggregateDays(fx).map((d) => d.date), "2025-10-30"]).size;
    expect(el.querySelector("h4")?.textContent).toContain(`(${merged})`);
  });

  test("cap-exempt: travelOut survives when > SCHEDULE_DAYS_CAP non-synthetic days precede it", () => {
    // 15 sequential show days (Oct 01..15) push travelOut past the 14-day cap.
    const many = Array.from({ length: 15 }, (_, i) => `2025-10-${String(i + 1).padStart(2, "0")}`);
    const capFx = dates({ set: "2025-09-30", showDays: many, travelOut: "2025-10-31" });
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={capFx} />);
    // travelOut (non-Show aggregate bookend) is cap-exempt → its phase label renders.
    expect(phaseOf(container, "2025-10-31")).toBe("Travel Out");
    // Merged sorted: set(idx0) + Oct01..Oct15(idx1..15) + travelOut(idx16). With CAP=14,
    // idx0..13 render (set + Oct01..Oct13); Oct14/Oct15 (Show, non-exempt) are DROPPED;
    // travelOut is exempt. Prove a SPECIFIC over-cap Show day is absent while an in-cap
    // Show day is present — not just that a note exists.
    expect(phaseOf(container, "2025-10-15")).toBeNull(); // over-cap Show day dropped
    expect(phaseOf(container, "2025-10-01")).toBe("Show"); // in-cap Show day present
    expect(container.textContent).toMatch(/2 more days/); // exactly the 2 dropped Show days
  });

  test("cap-exempt: a SYNTHETIC ros day beyond the cap still renders (existing exemption preserved)", () => {
    // 15 show days + one off-schedule strike that sorts LAST (idx ≥ CAP). A regression
    // that dropped isSyntheticDay while adding the bookend exemption would fail this.
    const many = Array.from({ length: 15 }, (_, i) => `2025-10-${String(i + 1).padStart(2, "0")}`);
    const capFx = dates({ showDays: many });
    const ros = {
      "2025-12-31": day({
        entries: [{ start: "5:00 PM", title: "Strike — GS", kind: "strike" as const }],
      }),
    };
    const { container } = render(<ScheduleBreakdown dfid="d" ros={ros} dates={capFx} />);
    expect(container.textContent).toContain("Strike — GS");
  });
});
