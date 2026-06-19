/**
 * components/right-now/buildRightNowContext.ts — pure helper that
 * shapes the `ShowForViewer` projection into the prop the
 * RightNowCard client island consumes (M4 Task 4.11).
 *
 * Lives in a separate file so the page (a Server Component) can call
 * it without importing the `'use client'` boundary in
 * `./RightNowCard.tsx`. Next.js treats every export from a
 * `'use client'` file as a client export — including pure helpers —
 * so a server caller would otherwise hit "Attempted to call X from
 * the server but X is on the client."
 *
 * Server-safe (pure function; no environment reads, no side effects,
 * no React imports).
 */
import type { DateRestriction, HotelReservationRow, ShowRow } from "@/lib/parser/types";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { resolveKeyTimes, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";

/**
 * Everything the card needs to render any of the 12 §8.2 states.
 * Bundled into one object so the page hands the card a single prop.
 */
export type RightNowContext = {
  /** ShowRow.dates — the state-machine input. */
  dates: ShowRow["dates"];
  /** Viewer's crew_members.date_restriction. */
  dateRestriction: DateRestriction;
  /** Page heading echoed for `unknown` whose body is intentionally terse. */
  showTitle: string;
  /**
   * First hotel reservation visible to viewer (already filtered by
   * getShowForViewer when viewer is crew/admin_preview). Used by
   * pre_travel / travel_in_day / travel_out_day. Null when no hotel.
   */
  hotelName: string | null;
  hotelCheckInTime: string | null;
  hotelCheckOutTime: string | null;
  /** Used by set_day "Load-in: <time> at <venue>". */
  venueName: string | null;
  loadInTime: string | null;
  /** Used by show_day_n "Call: <time> · <room>". */
  callTime: string | null;
  roomName: string | null;
  /** Used on the last show day per §8.2. */
  strikeTime: string | null;
  /** IANA tz; defaults to America/New_York. */
  timezone: string;
};

/**
 * Build a RightNowContext from the page's projection. Pure helper.
 *
 *   - hotelReservations is already filtered by viewer.name in
 *     getShowForViewer for crew/admin_preview viewers (admin sees all).
 *   - Time anchors (Set/Show/Strike) are rooms-sourced via the shared
 *     `resolveKeyTimes` resolver (§4.4). The legacy
 *     event_details.{call_time,load_in_time,strike_time,first_show_room}
 *     reads are DROPPED ENTIRELY (always empty for real shows, §7.1) —
 *     this is a removal, not a fallback.
 *   - venue.timezone is read defensively (current ShowRow.venue type
 *     does not declare it; the projection passes the venue object
 *     through verbatim, so a future M-task that populates
 *     venue.timezone lights up automatically).
 */
export function buildRightNowContext(opts: {
  show: Pick<ShowRow, "dates" | "title" | "venue" | "event_details">;
  dateRestriction: DateRestriction;
  hotelReservations: HotelReservationRow[];
  rooms: ProjectedRoomRow[] | null; // NEW — replaces the dropped `contacts` param
}): RightNowContext {
  const { show, dateRestriction, hotelReservations, rooms } = opts;
  const firstHotel = hotelReservations[0] ?? null;

  // Time anchors are rooms-sourced via the shared resolver (§4.4). The old
  // event_details.{call_time,load_in_time,strike_time,first_show_room} reads
  // are DROPPED ENTIRELY (always empty for real shows, §7.1) — not a fallback.
  const anchors = resolveKeyTimes(show, rooms);
  const loadInTime = anchors.set ?? null; // Set anchor (dates.loadIn ?? GS set_time)
  const callTime = anchors.show ?? null; // Show anchor
  const strikeTime = anchors.strike ?? null; // Strike anchor
  const roomName = null; // first_show_room dropped (§7.1); no Phase-1 source

  // Shared show-tz resolver (lib/time/showTimezone.ts) — the same helper crew
  // pack-list and the admin dashboard live compute use, so "today" is derived
  // in one notion of the show timezone everywhere (spec §3.1(a)).
  const timezone = resolveShowTimezone(show.venue);

  return {
    dates: show.dates,
    dateRestriction,
    showTitle: show.title,
    hotelName: firstHotel?.hotel_name ?? null,
    hotelCheckInTime: firstHotel?.check_in ?? null,
    hotelCheckOutTime: firstHotel?.check_out ?? null,
    venueName: show.venue?.name ?? null,
    loadInTime,
    callTime,
    roomName,
    strikeTime,
    timezone,
  };
}
