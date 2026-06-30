// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";
import { ShowDayTimelineList } from "@/components/crew/primitives/ShowDayTimelineList";
import type { TimelineItem } from "@/lib/crew/showDayTimeline";
import type { AgendaEntry } from "@/lib/parser/types";
import type { AgendaSession } from "@/lib/agenda/types";

const ISO = "2026-05-04";
const crewItem = (
  start: string,
  title: string,
  kind?: AgendaEntry["kind"],
  minutes: number | null = 0,
): TimelineItem => ({
  source: "crew",
  entry: { start, title, ...(kind ? { kind } : {}) },
  minutes,
});
const agItem = (
  time: string,
  title: string | null,
  minutes: number,
  room: string | null = null,
): TimelineItem => ({
  source: "agenda",
  session: { time, title, room, tracks: [], drift: null } as AgendaSession,
  minutes,
});
const scope = (c: HTMLElement) =>
  within(c.querySelector(`[data-testid="show-day-timeline-${ISO}"]`) as HTMLElement);

describe("ShowDayTimelineList", () => {
  test("crew rows render as agenda-entry; agenda rows as timeline-agenda-session with full time + room, no tracks", () => {
    const { container } = render(
      <ShowDayTimelineList
        isoDate={ISO}
        items={[
          crewItem("8:00 AM", "LoadIn", undefined, 480),
          agItem("9:00 AM – 9:40 AM", "Keynote", 540, "Main Stage"),
        ]}
      />,
    );
    const q = scope(container);
    expect(q.getAllByTestId("agenda-entry")).toHaveLength(1);
    const sessions = q.getAllByTestId("timeline-agenda-session");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.textContent).toContain("9:00 AM – 9:40 AM"); // full range, not just start
    expect(sessions[0]!.textContent).toContain("Keynote");
    expect(sessions[0]!.textContent).toContain("Main Stage");
  });
  test("null-title agenda → time-only row (no crash)", () => {
    const { container } = render(
      <ShowDayTimelineList isoDate={ISO} items={[agItem("9:00 AM", null, 540)]} />,
    );
    expect(scope(container).getByTestId("timeline-agenda-session").textContent).toContain(
      "9:00 AM",
    );
  });
  test("D7 — tracks and drift are NEVER rendered (non-tautological: the session HAS tracks + drift)", () => {
    // agItem hardcodes tracks:[]/drift:null, which can't catch a tracks-rendering impl.
    // Construct a session that DOES carry tracks + drift, then assert none of it appears.
    const item: TimelineItem = {
      source: "agenda",
      minutes: 540,
      session: {
        time: "9:00 AM",
        title: "Keynote",
        room: "Main Stage",
        tracks: [{ label: "Track A", title: "SECRET_TRACK_TITLE", room: "SECRET_TRACK_ROOM" }],
        drift: "SECRET_DRIFT",
      },
    };
    const { container } = render(<ShowDayTimelineList isoDate={ISO} items={[item]} />);
    const row = scope(container).getByTestId("timeline-agenda-session");
    expect(row.textContent).toContain("Keynote"); // title IS rendered
    expect(row.textContent).not.toContain("SECRET_TRACK_TITLE"); // tracks are NOT (D7)
    expect(row.textContent).not.toContain("SECRET_TRACK_ROOM");
    expect(row.textContent).not.toContain("SECRET_DRIFT"); // drift is NOT (D7)
  });
  test("cap: synthetic-exempt + chronological — early agenda survives, 20 non-synthetic + overflow, strike exempt + last", () => {
    // ShowDayTimelineList does NOT re-sort — pass items ALREADY in ascending-minute order
    // (as buildShowDayTimeline would). The agenda sits EARLY (minute 481) so it lands inside
    // the first RUN_OF_SHOW_DISPLAY_CAP(20) non-synthetic rows and survives; the strike (1380)
    // is synthetic → exempt → renders last in chronological position.
    const items: TimelineItem[] = [
      crewItem("8:00 AM", "c0", undefined, 480),
      agItem("8:01 AM", "Keynote", 481), // early agenda → within the first 20 non-synthetic
      ...Array.from({ length: 21 }, (_, i) => crewItem("8:00 AM", `c${i + 1}`, undefined, 482 + i)), // 482..502
      crewItem("11:00 PM", "Strike", "strike", 1380),
    ];
    // Non-synthetic = 1 + 1 + 21 = 23; cap keeps first 20 (c0, agenda, c1..c18); drops c19,c20,c21 = 3.
    const { container } = render(<ShowDayTimelineList isoDate={ISO} items={items} />);
    const q = scope(container);
    const agendaShown = q.queryAllByTestId("timeline-agenda-session"); // queryAll → [] not throw
    expect(agendaShown).toHaveLength(1); // the early agenda survived the cap
    const crewNonSynthShown = q
      .getAllByTestId("agenda-entry")
      .filter((e) => e.getAttribute("data-entry-kind") == null).length;
    expect(crewNonSynthShown + agendaShown.length).toBe(20); // total non-synthetic shown = cap
    expect(q.getByTestId("timeline-agenda-overflow").textContent).toContain("3"); // 23 − 20 dropped
    // Strike present AND last (chronological position, NOT partitioned to a group).
    const rows = q.getAllByTestId(/agenda-entry|timeline-agenda-session/);
    expect(rows[rows.length - 1]!.getAttribute("data-entry-kind")).toBe("strike");
  });
  test("cap: synthetic strike at the EARLIEST time renders FIRST (chronological, not appended)", () => {
    const items = [
      crewItem("6:00 AM", "Strike", "strike", 360),
      agItem("9:00 AM", "Keynote", 540),
      crewItem("10:00 AM", "Wrap", undefined, 600),
    ];
    const { container } = render(<ShowDayTimelineList isoDate={ISO} items={items} />);
    const rows = scope(container).getAllByTestId(/agenda-entry|timeline-agenda-session/);
    expect(rows[0]!.getAttribute("data-entry-kind")).toBe("strike");
  });
});
