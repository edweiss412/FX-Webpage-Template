/**
 * lib/crew/sectionPeek.ts: the one-line peek under each "All sections" row.
 *
 * A short summary of what a section holds for this viewer (crew page redesign
 * spec §4.6): Venue, the venue name; Crew, "6 people"; Gear, "14 cases". It
 * reads only what the section itself renders for the viewer, and each gate is
 * the section's own helper called here, never a copy of its rule:
 *
 *   - Gear's pack list through `isPackListVisibleToday` (GearSection).
 *   - Ground-transport legs through `transportTileVisible` (TravelSection).
 *   - Every date, and the hotel, withheld when `suppressesDates` holds; show
 *     days through `visibleShowDays` (ScheduleSection).
 *   - Budget through `financialsVisible` (BudgetSection), and nothing when its
 *     fetch failed, since the section then shows the failure.
 *
 * A peek that resolves to nothing is `null`, never placeholder text (spec §11):
 * every value goes through `shouldHideGenericOptional`. Computed on the server;
 * the result is plain text, so it is safe to hand to a client component.
 *
 * Pure and server-safe.
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import type { CrewSectionId } from "@/lib/crew/crewSections";
import { visibleShowDays } from "@/lib/crew/agendaDisplay";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { visibleTransportLegs } from "@/lib/crew/transportLegs";
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

const SEPARATOR = " · ";
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

function venuePeek(data: ShowForViewer): string | null {
  const venue = data.show.venue;
  if (!venue) return null;
  return present(venueDisplay(venue).name ?? venue.name);
}

/** The hotel line: one name, or a count when the viewer has several. Never under date suppression. */
function hotelPart(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
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

/** The ground-transport line: the legs the section shows, only when the transport gate holds. */
function ridesPart(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
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
  const legs = visibleTransportLegs(transportation.schedule, hideDates);
  return legs.length === 0 ? null : plural(legs.length, "ride", "rides");
}

function travelPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  const parts = [hotelPart(data, viewer), ridesPart(data, viewer)].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : parts.join(SEPARATOR);
}

function crewPeek(data: ShowForViewer): string | null {
  const count = Array.isArray(data.crewMembers) ? data.crewMembers.length : 0;
  return count === 0 ? null : plural(count, "person", "people");
}

/** The pack list's case count, only on a day its gate shows it to this viewer. */
function gearPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
  const cases = data.pullSheet;
  if (!Array.isArray(cases) || cases.length === 0) return null; // absent on a partial projection
  const visible = isPackListVisibleToday({
    show: data.show,
    restriction: viewer.stageRestriction,
    today: viewer.today,
  });
  return visible ? plural(cases.length, "case", "cases") : null;
}

function budgetPeek(data: ShowForViewer, viewer: SectionPeekViewer): string | null {
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
    case "venue":
      return venuePeek(data);
    case "travel":
      return travelPeek(data, viewer);
    case "crew":
      return crewPeek(data);
    case "gear":
      return gearPeek(data, viewer);
    case "budget":
      return budgetPeek(data, viewer);
  }
}
