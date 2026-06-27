// @vitest-environment jsdom
/**
 * tests/components/agendaScheduleBlock.test.tsx (Task 14).
 *
 * AgendaScheduleBlock renders the confidence-gated structured schedule for a
 * single agenda link's `extracted` jsonb. It consumes ONLY the output of
 * `normalizeAgendaExtraction` (never the raw jsonb), so:
 *   - confidence:'high' (non-empty days) → per-day sessions (time · title · room),
 *     breakout tracks indented, a drift indicator only where drift != null.
 *   - confidence:'low' / malformed / empty days → renders nothing (embed-only).
 *
 * Anti-tautology: expected counts are DERIVED from the fixture (never hardcoded),
 * and session-text assertions are scoped to the `agenda-schedule` subtree (the
 * block is self-contained — no sibling controls render the same labels).
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";

// Data source for the assertions (NOT the rendered DOM): expected values are
// read from THIS object, and counts are derived from its dimensions.
const HIGH = {
  confidence: "high" as const,
  corrections: 1,
  extractorVersion: 1,
  days: [
    {
      dayLabel: "Tuesday",
      date: "2026-05-14",
      sessions: [
        {
          time: "9:00 AM – 9:40 AM",
          title: "Welcome and Introductory Remarks",
          room: "Mabel 1",
          tracks: [],
          drift: null,
        },
        {
          time: "12:25 PM – 1:00 PM",
          title: "Lunch",
          room: null,
          tracks: [],
          drift: "start→12:25 PM (source: 12:25 AM)",
        },
        {
          time: "2:00 PM – 3:00 PM",
          title: "Breakout Sessions",
          room: null,
          tracks: [
            { label: "Breakout I", title: "Adapting to Unpredictability", room: "Room A" },
            { label: "Breakout II", title: "Building Resilience", room: "Room B" },
          ],
          drift: null,
        },
      ],
    },
    {
      dayLabel: "Wednesday",
      date: "2026-05-15",
      sessions: [
        {
          time: "9:00 AM – 10:00 AM",
          title: "Keynote",
          room: "Mabel 2",
          tracks: [],
          drift: null,
        },
      ],
    },
  ],
};

const ALL_SESSIONS = HIGH.days.flatMap((d) => d.sessions);
const EXPECTED_SESSION_COUNT = ALL_SESSIONS.length; // derived: 4
const EXPECTED_DRIFT_COUNT = ALL_SESSIONS.filter((s) => s.drift !== null).length; // derived: 1
const DRIFT_SESSION = ALL_SESSIONS.find((s) => s.drift !== null)!;
const TRACKED_SESSION = ALL_SESSIONS.find((s) => s.tracks.length > 0)!;

afterEach(() => cleanup());

describe("AgendaScheduleBlock", () => {
  test("high confidence → one row per session, derived from the fixture", () => {
    const { container } = render(<AgendaScheduleBlock extraction={HIGH} />);
    const schedule = container.querySelector('[data-testid="agenda-schedule"]');
    expect(schedule).not.toBeNull();
    expect(schedule!.querySelectorAll('[data-testid="agenda-session"]').length).toBe(
      EXPECTED_SESSION_COUNT,
    );
  });

  test("each session surfaces its time, title, and room (from the data source)", () => {
    const { container } = render(<AgendaScheduleBlock extraction={HIGH} />);
    const schedule = container.querySelector('[data-testid="agenda-schedule"]')!;
    const text = schedule.textContent ?? "";
    for (const s of ALL_SESSIONS) {
      expect(text).toContain(s.time);
      if (s.title) expect(text).toContain(s.title);
      if (s.room) expect(text).toContain(s.room);
    }
  });

  test("drift indicator renders ONLY on sessions with drift != null, carrying the original value", () => {
    const { container } = render(<AgendaScheduleBlock extraction={HIGH} />);
    const schedule = container.querySelector('[data-testid="agenda-schedule"]')!;
    const driftEls = schedule.querySelectorAll('[data-testid="agenda-drift"]');
    expect(driftEls.length).toBe(EXPECTED_DRIFT_COUNT);
    // The original (pre-correction) value is shown as VISIBLE text — NOT a
    // hover-only `title=` (impeccable HIGH: hover is dead on the 390px touch
    // device + unreachable by keyboard/SR). Derived from DRIFT_SESSION.drift.
    const originalValue = DRIFT_SESSION.drift!.match(/source:\s*([^)]+)\)/)![1]!.trim();
    expect(driftEls[0]!.textContent).toContain(originalValue);
    expect(driftEls[0]!.textContent).toContain("12:25 AM");
    expect(driftEls[0]!.getAttribute("title")).toBeNull();
  });

  test("breakout tracks render indented, one element per track (derived count)", () => {
    const { container } = render(<AgendaScheduleBlock extraction={HIGH} />);
    const schedule = container.querySelector('[data-testid="agenda-schedule"]')!;
    const tracks = schedule.querySelectorAll('[data-testid="agenda-track"]');
    expect(tracks.length).toBe(TRACKED_SESSION.tracks.length);
    for (const t of TRACKED_SESSION.tracks) {
      expect(schedule.textContent).toContain(t.label);
      if (t.title) expect(schedule.textContent).toContain(t.title);
    }
  });

  test("a title-less session still renders its time (no title line, no crash)", () => {
    const oneNoTitle = {
      confidence: "high" as const,
      corrections: 0,
      extractorVersion: 1,
      days: [
        {
          dayLabel: "Day",
          date: null,
          sessions: [{ time: "8:00 AM", title: null, room: "Hall", tracks: [], drift: null }],
        },
      ],
    };
    const { container } = render(<AgendaScheduleBlock extraction={oneNoTitle} />);
    const schedule = container.querySelector('[data-testid="agenda-schedule"]')!;
    expect(schedule.querySelectorAll('[data-testid="agenda-session"]').length).toBe(1);
    expect(schedule.textContent).toContain("8:00 AM");
    expect(schedule.textContent).toContain("Hall");
  });

  test("low confidence → renders nothing (embed-only)", () => {
    const { container } = render(
      <AgendaScheduleBlock
        extraction={{ confidence: "low", corrections: 0, extractorVersion: 1, days: [] }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("malformed jsonb → renders nothing", () => {
    expect(render(<AgendaScheduleBlock extraction={{}} />).container.firstChild).toBeNull();
    expect(render(<AgendaScheduleBlock extraction={null} />).container.firstChild).toBeNull();
    expect(
      render(<AgendaScheduleBlock extraction={{ confidence: "high", days: "x" }} />).container
        .firstChild,
    ).toBeNull();
  });
});
