// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const DATES = { travelIn: null, set: null, showDays: ["2026-05-14", "2026-05-15"], travelOut: null };
const D1 = "2026-05-14";
const D2 = "2026-05-15";
const VIEWER = { kind: "admin" } as const;

// Data source for the assertions — NOT the rendered container (anti-tautology):
// expected entry text is read from THIS array, never from the DOM that renders it.
const D1_ENTRIES: AgendaEntry[] = [
  { start: "7:15 AM", finish: "7:30 AM", trt: "0:15", title: "Family Office Only Breakfast", av: "NONE" },
  { start: "8:15 AM", finish: "8:30 AM", trt: "0:15", title: "Welcome and Introductory Remarks", room: "Mabel 1", av: "POD" },
];

function renderAgenda(runOfShow: Record<string, AgendaEntry[]> | null) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

describe("Schedule enrichment — per-day run-of-show mode (test 5)", () => {
  test("day with entries → run-of-show list; day without → no run-of-show element (anchor-only)", () => {
    const c = renderAgenda({ [D1]: D1_ENTRIES }); // D1 filled, D2 absent
    const d1List = c.querySelector(`[data-testid="run-of-show-${D1}"]`);
    const d2List = c.querySelector(`[data-testid="run-of-show-${D2}"]`);
    expect(d1List, "D1 has entries → run-of-show list present").not.toBeNull();
    expect(d2List, "D2 has no entries → NO run-of-show element").toBeNull();
    // Each entry's title (from the DATA SOURCE) appears inside the D1 list subtree.
    for (const e of D1_ENTRIES) {
      expect(d1List!.textContent).toContain(e.title);
    }
  });

  // Task 2 renders ALL six AgendaEntry fields. Pin the POSITIVE render here (same
  // task as the impl, invariant 1) so "renders 6 fields" is proven in-task, not
  // only by the sentinel-hiding negative cases below. Values read from the DATA
  // SOURCE D1_ENTRIES (anti-tautology), scoped to the D1 list subtree.
  test("a present entry surfaces all six fields: start, finish, trt, title, room, av", () => {
    const c = renderAgenda({ [D1]: D1_ENTRIES });
    const d1List = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    const e = D1_ENTRIES[1]!; // the entry that carries room ("Mabel 1") + av ("POD")
    // Scope to the SECOND entry's row (index 1) — entry 0 carries its own
    // av="NONE" (a real, non-sentinel value that renders), so an unscoped
    // querySelector('[data-agenda-field="av"]') would match entry 0's "NONE"
    // first. The time field is likewise indexed [1].
    const row = d1List.querySelectorAll('[data-testid="agenda-entry"]')[1]! as HTMLElement;
    const time = row.querySelector('[data-agenda-field="time"]')!;
    expect(time.textContent).toContain(e.start); // "8:15 AM"
    expect(time.textContent).toContain(e.finish!); // "8:30 AM"
    expect(time.textContent).toContain(e.trt!); // "0:15"
    expect(row.textContent).toContain(e.title); // "Welcome and Introductory Remarks"
    expect(row.querySelector('[data-agenda-field="room"]')!.textContent).toContain(e.room!); // "Mabel 1"
    expect(row.querySelector('[data-agenda-field="av"]')!.textContent).toContain(e.av!); // "POD"
  });

  test("exactly-one-mode-per-day: clone the D1 day subtree, assert a run-of-show list AND no second mode marker", () => {
    const c = renderAgenda({ [D1]: D1_ENTRIES });
    // The day wrapper for D1 (today) carries data-day=D1.
    const dayWrapper = c.querySelector(`[data-day="${D1}"]`);
    expect(dayWrapper).not.toBeNull();
    const clone = dayWrapper!.cloneNode(true) as HTMLElement;
    // Exactly one per-day run-of-show CONTAINER inside the day. The container
    // testid is `run-of-show-<isoDate>`; entry rows / overflow stub use the
    // `agenda-*` namespace (NOT the `run-of-show-` prefix), so the prefix
    // selector counts ONLY the per-day container — exactly 1 for a correct
    // render, regardless of entry count. (A `^="run-of-show-"` selector would
    // otherwise also match every entry row + the stub and read 3+, going red
    // for the wrong reason.)
    expect(clone.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(1);
    // Belt-and-braces: the exact container testid is present exactly once, and
    // there is no second per-day container of a different ISO date in this day.
    expect(clone.querySelectorAll(`[data-testid="run-of-show-${D1}"]`).length).toBe(1);
    // Both entries render (Task 2 has NO display cap — all displayable entries
    // render; the cap + overflow stub are Task 3).
    expect(clone.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(2);
  });

  // URL-strip is wired into RunOfShowEntry (Task 2) via stripAgendaUrls on the
  // title + resolveOptionalField on room/av. Pinned HERE (same task as the impl,
  // invariant 1) — the cap/truncation tests live in Task 3.
  test("URL-strip: Drive / non-Google schemed / scheme-less-Google links in title/room/av never reach the crew DOM", () => {
    const c = renderAgenda({
      [D1]: [
        {
          start: "9:00",
          title: "Keynote https://drive.google.com/file/d/abc",
          room: "https://zoom.us/j/9",
          av: "drive.google.com/x",
        },
      ],
    });
    // Negative URL assertions on the WHOLE container (strictly stronger — a leak
    // anywhere fails). The positive "title survived" check is SCOPED to the
    // run-of-show list so a sibling rendering "Keynote" can't satisfy it.
    const dom = (c.textContent ?? "").toLowerCase();
    for (const f of ["https://", "http://", "drive.google.com", "docs.google.com"]) {
      expect(dom).not.toContain(f);
    }
    expect(c.querySelector(`[data-testid="run-of-show-${D1}"]`)!.textContent).toContain("Keynote");
  });

  test("runOfShow = null → NO run-of-show element on any day (Phase-1 identical)", () => {
    const c = renderAgenda(null);
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
  });

  test("a title-only entry (no time/room/av) renders the title row, never an empty row", () => {
    const c = renderAgenda({ [D1]: [{ start: "", title: "Closing Remarks" }] });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`);
    expect(list!.textContent).toContain("Closing Remarks");
    // Exactly one entry row.
    expect(list!.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(1);
  });

  // FIX-3 — a URL-only title strips to "" (the parser/decoder proved it real on
  // the RAW value, but stripAgendaUrls reduces it to empty). The entry must be
  // SUPPRESSED (no agenda-entry row), and the per-day mode/container must gate on
  // the DISPLAYABLE count, not the raw stored length.
  test("a URL-only title strips to empty → that entry yields NO agenda-entry row (mixed day shows only the real entry)", () => {
    const c = renderAgenda({
      [D1]: [
        { start: "9:00", title: "https://drive.google.com/file/d/onlyurl" }, // URL-only → suppressed
        { start: "10:00", title: "Real Session" }, // displayable
      ],
    });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    // Exactly one row (the real entry); the URL-only entry is suppressed.
    expect(list.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(1);
    expect(list.textContent).toContain("Real Session");
    // No forbidden URL substring leaked into the crew DOM.
    for (const f of ["https://", "drive.google.com"]) {
      expect((c.textContent ?? "").toLowerCase()).not.toContain(f);
    }
  });

  test("an ALL-URL-only day → NO run-of-show container at all (anchor floor shows)", () => {
    const c = renderAgenda({
      [D1]: [
        { start: "9:00", title: "https://drive.google.com/file/d/a" },
        { start: "10:00", title: "HTTPS://ZOOM.US/J/9" },
      ],
    });
    // Zero displayable entries → no per-day container → Phase-1 anchor fallback.
    expect(c.querySelector(`[data-testid="run-of-show-${D1}"]`)).toBeNull();
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
    // The day card itself still renders (the floor is intact).
    expect(c.querySelector(`[data-day="${D1}"]`)).not.toBeNull();
  });

  // ── Sentinel hiding per optional field (spec test 8a) — the SENTINEL-HIDING
  // BEHAVIOR ships in THIS task (RunOfShowEntry → resolveOptionalField →
  // shouldHideGenericOptional), so its behavioral tests live here (invariant 1:
  // impl + its failing test share a task). The structural _metaSentinelHidingContract
  // walk extension that PINS the routing is the verification-only Task 4.
  test("room='TBD' / av='' are hidden, but the entry still shows (title is real)", () => {
    const c = renderAgenda({ [D1]: [{ start: "9:00", title: "Opening Keynote", room: "TBD", av: "" }] });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    expect(list.textContent).toContain("Opening Keynote");
    expect(list.querySelector('[data-agenda-field="room"]')).toBeNull();
    expect(list.querySelector('[data-agenda-field="av"]')).toBeNull();
    expect(list.textContent).not.toContain("TBD");
  });

  test("finish='N/A' hidden → time shows START only (no en-dash range)", () => {
    const c = renderAgenda({ [D1]: [{ start: "9:00", finish: "N/A", title: "Session" }] });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    expect(list.textContent).toContain("9:00");
    expect(list.textContent).not.toContain("N/A");
    expect(list.textContent).not.toContain("–"); // no range dash when finish is sentinel
  });

  // trt (session duration) — surfaced in the time group as START–FINISH · TRT
  // (R15). Behavior ships in this task; pinned here.
  test("trt='0:15' present → the duration renders in the time group", () => {
    const TRT = "0:15";
    const c = renderAgenda({ [D1]: [{ start: "7:15 AM", finish: "7:30 AM", trt: TRT, title: "Breakfast" }] });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    const time = list.querySelector('[data-agenda-field="time"]')!;
    // Assert against the DATA SOURCE value (anti-tautology), inside the time cell.
    expect(time.textContent).toContain(TRT);
    expect(time.textContent).toContain("7:15 AM");
    expect(time.textContent).toContain("7:30 AM");
    expect(list.textContent).toContain("Breakfast");
  });

  test("trt='TBD' hidden → trt dropped, entry still shows (title real), no orphan middot", () => {
    const c = renderAgenda({ [D1]: [{ start: "9:00", finish: "9:30", trt: "TBD", title: "Session" }] });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    const time = list.querySelector('[data-agenda-field="time"]')!;
    expect(time.textContent).toContain("9:00");
    expect(time.textContent).toContain("9:30");
    expect(time.textContent).not.toContain("TBD");
    expect(time.textContent).not.toContain("·"); // no orphan middot separator when trt is sentinel
    expect(list.textContent).toContain("Session");
  });
});
