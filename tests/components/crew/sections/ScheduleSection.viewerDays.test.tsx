// @vitest-environment jsdom
/**
 * T2's seam test: the viewer's day set is derived ONCE above the agenda area and threaded to
 * each agenda block PER LINK.
 *
 * Why per-link is asserted rather than assumed: one PDF can parse while another cannot, so a
 * single shared result would fold the second link's viewer row — the outcome spec §1.1 calls
 * the worst this feature can produce. The neighbouring `agendaSessionsForToday` takes the whole
 * link array and aggregates, which is the shape an implementer would naturally copy and which
 * would reintroduce exactly that bug.
 *
 * The assertions read `AgendaScheduleBlock`'s props through a module mock, because T2 owns only
 * the seam — what the component DOES with `viewerDays` is T3's, and asserting rendered output
 * here would couple this test to markup that does not exist yet.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

import type { ViewerAgendaDays } from "@/lib/crew/agendaViewerDays";

const received: Array<{ label: string | null; viewerDays: ViewerAgendaDays | undefined }> = [];

vi.mock("@/components/crew/AgendaScheduleBlock", () => ({
  AgendaScheduleBlock: (props: { label?: string | null; viewerDays?: ViewerAgendaDays }) => {
    received.push({ label: props.label ?? null, viewerDays: props.viewerDays });
    return null;
  },
}));

const { ScheduleSection } = await import("@/components/crew/sections/ScheduleSection");
const { makeShowForViewer } = await import("@/tests/fixtures/showForViewer");
const { ledgerProp } = await import("./_ledgerProp");

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
/** Travel-in plus two show days, so a restriction can legitimately include a travel date. */
const DATES = {
  travelIn: "2026-05-13",
  set: null,
  showDays: ["2026-05-14", "2026-05-15"],
  travelOut: null,
};

/** Two links: A's labels parse to real dates, B's are positional and cannot. */
const EXTRACTION_A = {
  // `confidence` must narrow to the literal union, not widen to `string`.
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 2,
  days: [
    {
      dayLabel: "Thursday, May 14, 2026",
      date: null,
      sessions: [{ time: "9:00am", title: "S", room: null, tracks: [], drift: null }],
    },
    {
      dayLabel: "Friday, May 15, 2026",
      date: null,
      sessions: [{ time: "9:00am", title: "S", room: null, tracks: [], drift: null }],
    },
  ],
};
const EXTRACTION_B = {
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 2,
  days: [
    {
      dayLabel: "Day 1",
      date: null,
      sessions: [{ time: "9:00am", title: "S", room: null, tracks: [], drift: null }],
    },
    {
      dayLabel: "Day 2",
      date: null,
      sessions: [{ time: "9:00am", title: "S", room: null, tracks: [], drift: null }],
    },
  ],
};

/** The restriction lives on the crew_members ROW, not on the viewer handle. */
function renderWith(
  dateRestriction: { kind: "explicit"; days: string[] } | { kind: "none" },
  /** Overrides link A's extraction, for cases that need a row outside the show's own dates. */
  extractionA: typeof EXTRACTION_A = EXTRACTION_A,
) {
  received.length = 0;
  const show = makeShowForViewer({
    // `dates` and `agenda_links` live under `show`; only crewMembers is top-level.
    show: {
      dates: DATES,
      agenda_links: [
        { fileId: "file-a", label: "RFI", extracted: extractionA },
        { fileId: "file-b", label: "PCF", extracted: EXTRACTION_B },
      ],
    },
    crewMembers: [
      {
        id: "c0",
        name: "Member 0",
        email: null,
        phone: null,
        role: "",
        roleFlags: [],
        dateRestriction,
        stageRestriction: { kind: "none" as const },
      },
    ],
  });
  render(
    <ScheduleSection
      {...ledgerProp()}
      data={show}
      showId={SHOW_ID}
      today={TODAY}
      viewer={{ kind: "crew", crewMemberId: "c0" }}
    />,
  );
}

describe("ScheduleSection threads viewerDays per agenda link", () => {
  beforeEach(() => {
    received.length = 0;
  });

  test("each link gets its OWN result, not a shared one", () => {
    renderWith({ kind: "explicit", days: ["2026-05-14", "2026-05-15"] });
    expect(received.length, "both agenda links must render a block").toBe(2);

    // Keyed by render ORDER, not by label: the component passes labels through
    // `agendaDisplayLabel`, so matching on the raw fixture string is brittle.
    const [a, b] = received.map((r) => r.viewerDays);

    // A's labels parse, so its rows are identifiable.
    expect(a).toEqual({ kind: "subset", rows: new Set([0, 1]) });
    // B's do not, so B fails open INDEPENDENTLY. Catches one shared result: a single derivation
    // would hand B either A's subset (folding B's viewer rows) or force A to fail open too.
    expect(b).toEqual({ kind: "all" });
  });

  test("an unrestricted viewer gets `all`, without the matcher narrowing anything", () => {
    renderWith({ kind: "none" });
    expect(received.length).toBe(2);
    for (const r of received) {
      // Every day is theirs, so nothing distinguishes and nothing folds (THE MARKER RULE).
      expect(r.viewerDays).toEqual({ kind: "all" });
    }
  });

  test("a TRAVEL date the viewer is assigned reaches the matcher", () => {
    // Review R11 (MEDIUM): the fixture declared a travel-in date and no assertion ever proved it
    // survives into `viewerDates`. That matters because the ratified rule is that travel days
    // ARE the viewer's -- `visibleShowDays` returns show days only, so a seam that fed its
    // output to the matcher would silently drop an assigned travel day, and every existing
    // assertion here used show dates only and would have stayed green.
    renderWith({ kind: "explicit", days: ["2026-05-13", "2026-05-14"] }); // travel-in + show day
    const [a] = received.map((r) => r.viewerDays);
    // EXTRACTION_A's labels are May 14 and May 15. Only May 14 is assigned here, and the travel
    // day has no agenda row -- so completeness must see the travel date in R and fail open
    // rather than folding a day it could not place.
    expect(a, "the travel date is in R, so an unplaceable assigned day fails open").toEqual({
      kind: "all",
    });
  });

  test("the matcher gets RAW restriction days, not the intersected set", () => {
    // The distinguishing input, and it took a mutation to find it: the disagreement guard only
    // fires for a date that is in the RAW restriction, PRESENT in the extraction, and absent
    // from the show's aggregate. A first draft used an off-aggregate date with no matching
    // agenda row, so `restriction \\ viewerDates` never met a parsed label and passing
    // `viewerDates` for both arguments stayed green.
    const withJune = {
      ...EXTRACTION_A,
      days: [
        ...EXTRACTION_A.days,
        {
          dayLabel: "Thursday, June 25, 2026",
          date: null,
          sessions: [{ time: "9:00am", title: "S", room: null, tracks: [], drift: null }],
        },
      ],
    };
    renderWith({ kind: "explicit", days: ["2026-05-14", "2026-06-25"] }, withJune);
    // June 25 IS in the extraction and IS assigned, but the show's dates do not contain it --
    // partial knowledge, so the whole link fails open rather than folding the June 25 row.
    expect(received.map((r) => r.viewerDays)[0]).toEqual({ kind: "all" });
  });

  test("an off-aggregate restriction date with NO agenda row still folds", () => {
    // The disagreement guard needs `restriction \\ viewerDates` -- the days the viewer is
    // assigned that the show's own dates do NOT contain. Passing `viewerDates` for both
    // arguments makes that difference empty and the guard dead. Review R11 (MEDIUM) noted no
    // case distinguished them: every fixture restriction sat inside the aggregate.
    renderWith({ kind: "explicit", days: ["2026-05-14", "2026-06-25"] }); // June 25 is off-aggregate
    const [a] = received.map((r) => r.viewerDays);
    // May 14 is placeable and June 25 is not in the show's dates at all, so this is the
    // "restriction date in NEITHER the aggregate nor the extraction" case: it still folds.
    expect(a).toEqual({ kind: "subset", rows: new Set([0]) });
  });

  test("every block receives the prop — none is left undefined", () => {
    renderWith({ kind: "explicit", days: ["2026-05-14"] });
    for (const r of received) {
      // Catches threading only the first link, which a `.map` written against index 0 would do.
      expect(r.viewerDays, `${r.label} must receive viewerDays`).toBeDefined();
    }
  });
});
