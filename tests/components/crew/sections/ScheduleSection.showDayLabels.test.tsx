// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(cleanup);

// Mirror ScheduleSection.bookends.test.tsx:86 — admin viewer → dateRestriction
// none → every aggregate day is visible.
const adminViewer = { kind: "admin" } as const;

describe("ScheduleSection — Show Day numbering (bug #316 item 2)", () => {
  test("multi show-day schedule numbers the show days chronologically", () => {
    // makeShowForViewer(overrides?: DeepPartial<ShowForViewer>) — dates live at
    // show.dates (fixtures/showForViewer.ts:60-72); arrays are REPLACED, not
    // index-merged (deepMergeObjects, :117-119), so showDays overrides cleanly.
    const data = makeShowForViewer({
      show: {
        dates: {
          travelIn: "2025-10-18",
          set: null,
          showDays: ["2025-10-20", "2025-10-19"], // out of order on purpose
          travelOut: "2025-10-21",
        },
      },
    });
    const { container } = render(
      <ScheduleSection
        data={data}
        viewer={adminViewer}
        today={new Date("2025-10-19T12:00:00Z")}
        showId="s"
      />,
    );
    // Expected labels DERIVED from the data source, not hardcoded.
    const expected = new Map(aggregateDays(data.show.dates).map((d) => [d.date, d.label]));
    // Each visible day-card row renders its label text.
    for (const [iso, label] of expected) {
      const row = container.querySelector(`[data-day="${iso}"]`);
      expect(row?.textContent).toContain(label);
    }
    // Concretely: the two show days read "Show Day 1"/"Show Day 2" in ASC order.
    expect(expected.get("2025-10-19")).toBe("Show Day 1");
    expect(expected.get("2025-10-20")).toBe("Show Day 2");
  });
});
