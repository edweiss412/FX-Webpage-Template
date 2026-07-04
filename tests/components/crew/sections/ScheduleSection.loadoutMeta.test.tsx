// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ScheduleDay } from "@/lib/parser/types";

// Regression for audit idx34/#169: a Show-phase fragment day whose ONLY
// run-of-show entry is a load-out that the per-viewer gate drops
// (scheduleEntriesForViewer → transportVisible=false) must STILL surface its
// `showStart` call-time as the DayCard meta. The buggy gate keyed on the RAW
// `sd.entries.length` (== 1, the synthetic load-out) so it neither set the
// showStart meta NOR rendered a RunOfShowList → the call-time silently vanished.
// The fix keys the meta gate on the load-out-filtered `dayEntries` instead.
//
// `transportation` is null in the fixture default, so transportTileVisible
// returns false even for an admin viewer (scopeTiles.ts:183) → the load-out is
// gated out for this render. The call-time is DERIVED from the fixture
// (SHOW_START), never hardcoded at the assertion site.

const TODAY = new Date("2026-06-01T15:00:00Z"); // outside the show days on purpose
const SHOW_ID = "show-loadout-meta";
const D_FRAGMENT = "2026-05-14"; // load-out-only fragment day
const D_REAL = "2026-05-15"; // control: a real displayable entry
const DATES = { travelIn: null, set: null, showDays: [D_FRAGMENT, D_REAL], travelOut: null };
const VIEWER = { kind: "admin" } as const;
const SHOW_START = "8:00 AM";

function renderWith(runOfShow: Record<string, ScheduleDay>) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({
        show: { dates: DATES },
        runOfShow,
        transportation: null, // → transportVisible false → load-out entries gated out
      })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

describe("ScheduleSection — fragment-day Show-time meta gates on load-out-filtered entries (idx34/#169)", () => {
  test("load-out-only fragment day → DayCard shows the showStart call-time meta, no RunOfShowList", () => {
    const c = renderWith({
      [D_FRAGMENT]: {
        // The ONLY entry is a load-out; with transportVisible=false the per-viewer
        // filter drops it → dayEntries is empty → the fragment showStart meta applies.
        entries: [{ start: "7:00 AM", title: "Load Out — venue", kind: "loadout" }],
        showStart: SHOW_START,
        window: null,
      },
    });

    const wrapper = c.querySelector(`[data-day="${D_FRAGMENT}"]`);
    expect(wrapper).not.toBeNull();

    // The Show call-time survives as the DayCard meta (DERIVED from the fixture).
    const metaNode = wrapper!.querySelector('[data-slot="day-card-meta"]');
    expect(metaNode).not.toBeNull();
    expect(metaNode!.textContent).toBe(SHOW_START);

    // …and no run-of-show container opens (the sole entry was gated out).
    expect(wrapper!.querySelector('[data-testid^="run-of-show-"]')).toBeNull();
  });

  test("control — a day with a real displayable entry → meta undefined, RunOfShowList renders", () => {
    const c = renderWith({
      [D_REAL]: {
        entries: [{ start: "9:00 AM", title: "Real Session" }],
        // showStart present but must NOT print: displayable entries drive the list,
        // so the fragment meta branch is not reached.
        showStart: SHOW_START,
        window: null,
      },
    });

    const wrapper = c.querySelector(`[data-day="${D_REAL}"]`);
    expect(wrapper).not.toBeNull();

    // No standalone call-time meta on a titled day…
    expect(wrapper!.querySelector('[data-slot="day-card-meta"]')).toBeNull();
    // …the run-of-show list renders the displayable entry instead.
    expect(wrapper!.querySelector(`[data-testid="run-of-show-${D_REAL}"]`)).not.toBeNull();
  });
});
