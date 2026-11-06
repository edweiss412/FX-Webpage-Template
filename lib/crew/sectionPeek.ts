/**
 * lib/crew/sectionPeek.ts: the one-line peek under each "All sections" row.
 *
 * A short summary of what a section holds for this viewer (crew page redesign
 * spec §4.6): Venue, the venue name; Crew, "6 people"; Pack list, "14 cases". It
 * reads only what the section itself renders for the viewer, and each gate is
 * the section's own helper called here, never a copy of its rule:
 *
 *   - The pack list through `isPackListVisibleToday` (the section's entitlement).
 *   - Event details' fields through the section's own hide rules
 *     (`crewEventFieldCount`), so the count is the rows it draws.
 *   - Ground-transport legs through `transportTileVisible` (TransportSection),
 *     counted with the Transport body's own leg rule under the crew's options
 *     (`transportRouteLegs`, `crewTransportLegOptions`), so the ride count is
 *     the route the section draws.
 *   - Every date, and the hotel, withheld when `suppressesDates` holds; show
 *     days through `visibleShowDays` (ScheduleSection).
 *   - Billing through `financialsVisible` (BillingSection), and nothing when
 *     its fetch failed, since the section then shows the failure.
 *   - The Agenda's sessions through the structured-agenda gate the shared
 *     block renders by (`structuredAgenda`, AgendaSection), and nothing under
 *     date suppression, where the section is withheld.
 *
 * A peek that resolves to nothing is `null`, never placeholder text (spec §11):
 * every value goes through `shouldHideGenericOptional`. Computed on the server;
 * the result is plain text, so it is safe to hand to a client component.
 *
 * Pure and server-safe.
 */
import { structuredAgenda } from "@/components/crew/agendaScheduleRows";
import { crewContactsShown } from "@/components/crew/sections/crewContacts";
import { crewTransportLegOptions } from "@/components/crew/sections/transportLegTime";
import { transportRouteLegs } from "@/components/show-panels/transportLegs";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import type { CrewSectionId } from "@/lib/crew/crewSections";
import { visibleShowDays } from "@/lib/crew/agendaDisplay";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { crewEventFieldCount } from "@/lib/crew/eventDetailsSpecs";
import { formatIsoDate } from "@/lib/format/date";
import { venueDisplay } from "@/lib/venue/venueLocation";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { isPackListVisibleToday } from "@/lib/visibility/packList";
import { financialsVisible, transportTileVisible } from "@/lib/visibility/scopeTiles";

/**
 * What the peeks read about the viewer: the shell's `resolveViewerContext`
 * fields the gates take, plus the request-scoped clock the sections render with.
 */
export type SectionPeekViewer = Pick<
  ViewerContext,
  "isAdmin" | "viewerFlags" | "dateRestriction" | "stageRestriction"
> & { today: Date };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Trimmed text, or null when empty or a sentinel. */
function present(value: string | null | undefined): string | null {
  if (typeof value !== "string" || shouldHideGenericOptional(value)) return null;
  return value.trim();
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function schedulePeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  if (suppressesDates(viewer.dateRestriction)) return null;
  const dates = data.show.dates;
  if (!dates || !Array.isArray(dates.showDays)) return null;
  const days = [
    ...new Set(
      visibleShowDays(dates, viewer.dateRestriction).filter(
        (d): d is string => typeof d === "string" && ISO_DATE.test(d),
      ),
    ),
  ].sort();
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) return null;
  const count = plural(days.length, "show day", "show days");
  const span =
    days.length === 1
      ? formatIsoDate(first, "short")
      : `${formatIsoDate(first, "short")} to ${formatIsoDate(last, "short")}`;
  return `${count}, ${span}`;
}

/**
 * The Agenda peek: the sessions its structured schedules show, across every
 * agenda PDF with a file, or nothing when it shows none (an embed-only agenda).
 */
function agendaPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  if (suppressesDates(viewer.dateRestriction)) return null;
  const links = Array.isArray(data.show.agenda_links) ? data.show.agenda_links : [];
  let sessions = 0;
  for (const link of links) {
    if (!link.fileId) continue;
    for (const day of structuredAgenda(link.extracted)?.days ?? []) sessions += day.sessions.length;
  }
  return sessions === 0 ? null : plural(sessions, "session", "sessions");
}

function venuePeek(data: ShowForViewer): string | null {
  const venue = data.show.venue;
  if (!venue) return null;
  return present(venueDisplay(venue).name ?? venue.name);
}

/** The Hotels peek: one name, or a count when the viewer has several. Never under date suppression. */
function hotelsPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  if (suppressesDates(viewer.dateRestriction)) return null;
  // A partial projection still renders the page (the shell's guard discipline),
  // so a missing list reads as no hotels rather than throwing.
  const reservations = Array.isArray(data.hotelReservations) ? data.hotelReservations : [];
  const names = [
    ...new Set(
      [...reservations]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((res) => present(res.hotel_name))
        .filter((name): name is string => name !== null),
    ),
  ];
  if (names.length === 0) return null;
  return names.length === 1 ? names[0]! : plural(names.length, "hotel", "hotels");
}

/** The Transport peek: the rides the section's route shows, only when the transport gate holds. */
function transportPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  const transportation = data.transportation;
  const visible = transportTileVisible({
    transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin: viewer.isAdmin,
  });
  if (!visible || transportation === null || !Array.isArray(transportation.schedule)) return null;
  const hideDates = suppressesDates(viewer.dateRestriction);
  const legs = transportRouteLegs(transportation, crewTransportLegOptions(hideDates));
  return legs.length === 0 ? null : plural(legs.length, "ride", "rides");
}

function crewPeek(data: ShowForViewer): string | null {
  const count = Array.isArray(data.crewMembers) ? data.crewMembers.length : 0;
  return count === 0 ? null : plural(count, "person", "people");
}

/**
 * The venue and in-house AV contacts the Contacts section renders a row for,
 * never the client contact: a contact with no name the crew sees and nothing to
 * tap is not listed, so it is not counted (PR B invariant-8 gate, row 13's peer).
 */
function contactsPeek(data: ShowForViewer): string | null {
  const count = Array.isArray(data.contacts) ? crewContactsShown(data.contacts).length : 0;
  return count === 0 ? null : plural(count, "contact", "contacts");
}

function eventPeek(data: ShowForViewer): string | null {
  const count = crewEventFieldCount(data.show.event_details, data.openingReelHasVideo);
  return count === 0 ? null : plural(count, "detail", "details");
}

/** The rooms the section renders: every one, a bare room included (PR C plan decision 6). */
function roomsPeek(data: ShowForViewer): string | null {
  const count = Array.isArray(data.rooms) ? data.rooms.length : 0; // absent on a partial projection
  return count === 0 ? null : plural(count, "room", "rooms");
}

/** The pack list's case count, only on a day its gate shows it to this viewer. */
function packListPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  const cases = data.pullSheet;
  if (!Array.isArray(cases) || cases.length === 0) return null; // absent on a partial projection
  const visible = isPackListVisibleToday({
    show: data.show,
    restriction: viewer.stageRestriction,
    today: viewer.today,
  });
  return visible ? plural(cases.length, "case", "cases") : null;
}

function billingPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  if (!financialsVisible(viewer.viewerFlags, viewer.isAdmin)) return null;
  if (data.tileErrors["financials"]) return null;
  const po = present(data.financials?.po);
  return po === null ? null : `PO ${po}`;
}

/** The peek line for one section, or null when the section has nothing to summarize. */
export function sectionPeek(
  id: CrewSectionId,
  data: ShowForViewer,
  viewer: SectionPeekViewer,
): string | null {
  switch (id) {
    case "schedule":
      return schedulePeek(data, viewer);
    case "agenda":
      return agendaPeek(data, viewer);
    case "venue":
      return venuePeek(data);
    case "event":
      return eventPeek(data);
    case "hotels":
      return hotelsPeek(data, viewer);
    case "transport":
      return transportPeek(data, viewer);
    case "crew":
      return crewPeek(data);
    case "contacts":
      return contactsPeek(data);
    case "rooms":
      return roomsPeek(data);
    case "gear":
      return null;
    case "packlist":
      return packListPeek(data, viewer);
    case "billing":
      return billingPeek(data, viewer);
  }
}
