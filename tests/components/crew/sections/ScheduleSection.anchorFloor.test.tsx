// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const D1 = "2026-05-14";
const D2 = "2026-05-15";
const DATES = { travelIn: null, set: null, showDays: [D1, D2], travelOut: null };
const VIEWER = { kind: "admin" } as const;

function renderRos(
  runOfShow: Record<string, AgendaEntry[]> | null,
  extra?: Partial<Parameters<typeof makeShowForViewer>[0]>,
) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow, ...extra })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

describe("Schedule anchor floor + CONFIRMED-ONLY (test 6 — UI half)", () => {
  test("6a — runOfShow=null → the Phase-1 floor with ZERO Phase-2 agenda markup injected (non-tautological: enumerated absence, not a self-compare)", () => {
    const c = renderRos(null);
    // The Phase-1 floor is intact: both day cards + the key-times strip column.
    expect(c.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
    expect(c.querySelector('[data-schedule-column="times"]')).not.toBeNull();
    // NON-tautological anchor-floor pin: assert ABSENCE of EVERY Phase-2 agenda
    // element/affordance for the no-agenda day, so a Phase-2 impl that injects ANY
    // null-state agenda wrapper / row / stub / <details> / placeholder FAILS here
    // (the prior self-compare only proved deterministic rendering, not that Phase 2
    // added nothing to the null path).
    for (const sel of [
      '[data-testid^="run-of-show-"]', // the per-day container (run-of-show-<iso>)
      '[data-testid="agenda-entry"]', // entry rows
      '[data-testid="agenda-overflow-stub"]', // +N more stub
      '[data-testid="agenda-title-truncated"]', // <details> truncation
      "[data-agenda-field]", // any agenda field span (time/room/av)
    ]) {
      expect(
        c.querySelectorAll(sel).length,
        `no Phase-2 agenda markup on the null path: ${sel}`,
      ).toBe(0);
    }
    // No agenda-specific empty/placeholder copy injected on the null path.
    expect(c.textContent ?? "").not.toMatch(/run[- ]?of[- ]?show/i);
    expect(c.textContent ?? "").not.toMatch(/agenda/i);
  });

  test("6a-cross-check — the null-path day subtree contains ONLY the Phase-1 DayCard (no extra child element)", () => {
    // Stronger than a self-compare: scope to ONE day wrapper and assert its ONLY
    // element child is the DayCard — Phase 2 appends the run-of-show list as a
    // SIBLING after <DayCard> (Task 2 placement), so on the null path the wrapper
    // must have exactly one element child and it must be the DayCard, not an
    // injected agenda node. Cross-checks 6a's absence enumeration against the
    // wrapper's actual child shape (asserted against the DOM structure, not a
    // self-rendered baseline).
    const c = renderRos(null);
    const wrapper = c.querySelector(`[data-day="${D1}"]`)!;
    expect(wrapper).not.toBeNull();
    // Exactly one element child (the DayCard); no appended agenda sibling.
    expect(wrapper.children.length).toBe(1);
    // That single child is NOT any agenda node (defensive — agenda testids live on
    // the appended sibling that must be absent here).
    expect(wrapper.children[0]!.matches('[data-testid^="run-of-show-"]')).toBe(false);
  });

  test("6a' — runOfShow={} (empty object) → treated as no-agenda (all anchor-only)", () => {
    const c = renderRos({});
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
  });

  test("6c — a non-confirmed shape projects as absent/[] for a day → that day is anchor-only, NEVER prior entries", () => {
    // D1 confirmed (entries), D2 non-confirmed (absent from runOfShow OR []).
    const cAbsent = renderRos({ [D1]: [{ start: "9:00", title: "Real Session" }] });
    expect(cAbsent.querySelector(`[data-testid="run-of-show-${D1}"]`)).not.toBeNull();
    expect(cAbsent.querySelector(`[data-testid="run-of-show-${D2}"]`)).toBeNull();
    // []-valued day guards the same way (UI keys off ?.length > 0).
    const cEmpty = renderRos({ [D1]: [{ start: "9:00", title: "Real Session" }], [D2]: [] });
    expect(cEmpty.querySelector(`[data-testid="run-of-show-${D2}"]`)).toBeNull();
    // No stale text from D2 anywhere.
    expect(cEmpty.textContent).not.toContain("run-of-show-2026-05-15");
  });

  test("6b — a run_of_show fetch fault (tileErrors['run_of_show']) does NOT remove the anchor floor", () => {
    // The Schedule section renders its day cards + times strip regardless of a
    // run_of_show tileError (that error surfaces in the CrewShell projection
    // alert — Phase-1 §4.13 — not by blanking Schedule). runOfShow falls to null.
    const c = renderRos(null, { tileErrors: { run_of_show: "boom" } as Record<string, string> });
    expect(c.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
    expect(c.querySelector('[data-schedule-column="times"]')).not.toBeNull();
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
    // No raw infra text in the crew DOM.
    expect(c.textContent).not.toContain("boom");
  });
});
