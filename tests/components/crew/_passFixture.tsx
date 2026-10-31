/**
 * Shared fixture for the crew pass suites (crew page redesign spec §4.3; plan
 * docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md, Task 9).
 *
 * One show, built through `makeShowForViewer` and handed to the real pass
 * builder (`buildPassProps`, Task 3), so every case renders the props the shell
 * would hand the client and reads its expectations back from those props or from
 * the fixture constants below, never from a literal the component also holds.
 *
 * The show: travel in, a separate load-in day, two show days with their own show
 * starts, travel out. The GS room carries the Set and Strike anchors, the viewer
 * is an A1 and the roster's first LEAD is someone else, one hotel covers every
 * night, and the show has a dress code: every fact-grid candidate can resolve.
 */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";

import { CrewDayRow } from "@/components/crew/CrewDayRow";
import { DaySelectionProvider } from "@/components/crew/daySelection";
import { buildDayRowProps, buildPassProps, type PassProps } from "@/lib/crew/passModel";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { DateRestriction, RoleFlag, ShowRow } from "@/lib/parser/types";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

export const DATES: ShowRow["dates"] = {
  travelIn: "2026-04-20",
  set: "2026-04-21",
  showDays: ["2026-04-22", "2026-04-23"],
  travelOut: "2026-04-24",
};

/** Per-day show starts, as the sheet writes them (normalized on render: "7:30 AM"). */
export const SHOW_START: Record<string, string> = {
  "2026-04-22": "7:30am",
  "2026-04-23": "8:15am",
};

export const ROOM = "Grand Ballroom";
export const SET_TIME = "8:00 AM";
export const STRIKE_TIME = "11:00 PM";
export const DRESS = "All black";
export const HOTEL = "Grand Hyatt";
export const VIEWER_ID = "c1";
export const VIEWER_ROLE = "A1";
export const LEAD_ID = "c2";
export const LEAD_NAME = "Dana Ortiz";
export const SHOW_TITLE = "Spring Gala";

export const adminViewer: Viewer = { kind: "admin" };
export const crewViewer: Viewer = { kind: "crew", crewMemberId: VIEWER_ID };

export function showData(
  opts: {
    dates?: ShowRow["dates"];
    restriction?: DateRestriction;
    role?: string;
    /** Drop every fact-grid source (room, lead, hotel, dress code, the room's anchors). */
    bare?: boolean;
  } = {},
): ShowForViewer {
  const dates = opts.dates ?? DATES;
  const base = makeShowForViewer({
    show: {
      title: SHOW_TITLE,
      dates,
      event_details: opts.bare ? {} : { dress_code: DRESS },
    },
    rooms: opts.bare
      ? []
      : [
          {
            id: "room-gs",
            kind: "gs",
            name: ROOM,
            set_time: SET_TIME,
            strike_time: STRIKE_TIME,
          },
        ],
  });
  const viewerRow = {
    ...base.crewMembers[0]!,
    id: VIEWER_ID,
    name: "Sam Rivera",
    role: opts.role ?? VIEWER_ROLE,
    roleFlags: [] as RoleFlag[],
    dateRestriction: opts.restriction ?? { kind: "none" as const },
  };
  const leadRow = {
    ...base.crewMembers[0]!,
    id: LEAD_ID,
    name: LEAD_NAME,
    role: "V1",
    roleFlags: ["LEAD"] as RoleFlag[],
    dateRestriction: { kind: "none" as const },
  };
  return {
    ...base,
    crewMembers: opts.bare ? [viewerRow] : [viewerRow, leadRow],
    hotelReservations: opts.bare
      ? []
      : [
          {
            ordinal: 1,
            hotel_name: HOTEL,
            hotel_address: "1 Hotel Rd",
            check_in: dates.travelIn ?? "",
            check_out: dates.travelOut ?? "",
            names: ["Sam Rivera"],
            confirmation_no: "CONF-9",
            notes: null,
          },
        ],
    runOfShow: Object.fromEntries(
      (dates.showDays ?? []).map((iso) => [
        iso,
        { entries: [], showStart: SHOW_START[iso] ?? null, showEnd: null, window: null },
      ]),
    ),
  } satisfies ShowForViewer;
}

/** The props the shell builds for this viewer, through the Task 3 builder. */
export function passPropsFor(
  data: ShowForViewer,
  viewer: Viewer = crewViewer,
  today: Date = new Date(),
): PassProps {
  return buildPassProps({ data, viewer, today });
}

/** The UTC instant at which `timeZone`'s wall clock reads `hh:mm` on `iso`. */
export function at(iso: string, time: string, timeZone = "America/New_York"): Date {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
    h,
    m,
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wall));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asWall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return new Date(wall - (asWall - wall));
}

/** "Sun Jun 14": the date as the day row's accessible names spell it (spec §9.1, §9.4). */
export function spoken(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  return `${part({ weekday: "short" })} ${part({ month: "short" })} ${part({ day: "numeric" })}`;
}

/** Render the day row and the pass under one selection, as the home does. */
export function renderHome(data: ShowForViewer, viewer: Viewer, pass: ReactNode) {
  const dayRow = buildDayRowProps(data.show, resolveViewerContext(viewer, data).dateRestriction);
  return render(
    <DaySelectionProvider days={dayRow?.days.map((d) => d.iso) ?? []}>
      {dayRow ? <CrewDayRow {...dayRow} /> : null}
      {pass}
    </DaySelectionProvider>,
  );
}

/** A matchMedia stub: the wide breakpoint as given, reduced motion as given. */
export function matchMediaStub(opts: { wide?: boolean; reducedMotion?: boolean } = {}) {
  return (query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? Boolean(opts.reducedMotion)
      : query.includes("min-width: 1024px")
        ? Boolean(opts.wide)
        : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
