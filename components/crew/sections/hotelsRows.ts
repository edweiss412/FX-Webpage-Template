/**
 * components/crew/sections/hotelsRows.ts — the Hotels section's row derivation
 * (crew page redesign PR B Task 9; spec §6.2 `hotels` row, line 307).
 *
 * `HotelsSection` renders from `hotelsPanel` and the crew search builder
 * (lib/search/sections/hotels.ts) indexes from it, so the page and the index
 * cannot disagree about which lines exist, in what order, or under which id
 * (spec §2.4, INV-1). Each card is the shared hotel card
 * (components/show-panels/HotelCardBody.tsx) with the crew props, and its lines
 * are read from the card's own `hotelCardLines`, so a line the card does not
 * render has no entry.
 *
 * No `"use client"`: the builder runs on the server.
 */
import {
  hotelCardLines,
  type HotelCardBodyProps,
  type HotelCardBodyTargets,
  type StayEndText,
} from "@/components/show-panels/HotelCardBody";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { entryId } from "@/lib/search/entryId";
import { normalize } from "@/lib/search/normalize";
import type { SearchCopy, SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type Seen = Map<string, number>;
type Reservation = ShowForViewer["hotelReservations"][number];

/** The hotels card's `data-card-id` (its search region and its source link, `CARD_REGION_MAP`). */
export const HOTELS_CARD_ID = "travel-hotels";

const tokens = (s: string) =>
  normalize(s)
    .map((t) => t.text)
    .join(" ");

/**
 * One search entry for one rendered line of the Hotels card, or null when the
 * line's value is blank. A label that equals its group is stored as null (spec
 * §3) and kept as context.
 */
function searchLine(
  group: string,
  label: string | null,
  value: string,
  context: readonly (string | null | undefined)[],
  seen: Seen,
  copy: SearchCopy | null = null,
): SearchEntry | null {
  if (value.trim().length === 0) return null;
  const ctx = context.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  let lab = label !== null && label.trim().length > 0 ? label : null;
  if (lab !== null && tokens(lab) === tokens(group)) {
    ctx.unshift(lab);
    lab = null;
  }
  return {
    id: entryId("hotels", HOTELS_CARD_ID, group, lab, value, seen),
    section: "hotels",
    group,
    label: lab,
    value,
    context: ctx,
    copy,
  };
}

/** The crew's card props, all but the per-card identity and targets. */
type CrewCardOptions = Pick<
  HotelCardBodyProps,
  "showConfirmation" | "showNotes" | "showGuests" | "hideDates" | "sentinels" | "placeholders"
>;

function crewCardOptions(hideDates: boolean): CrewCardOptions {
  return {
    showConfirmation: true,
    showNotes: true,
    showGuests: false,
    hideDates,
    sentinels: "hide",
    placeholders: false,
  };
}

/**
 * Whether the crew card for this reservation renders any line. A reservation
 * that renders none (a dates-only stay under date suppression, or an empty row)
 * gets no card: an empty bordered card inside the titled "Hotels" card is
 * section chrome wrapping nothing.
 */
function rendersAnything(res: Reservation, options: CrewCardOptions): boolean {
  const l = hotelCardLines(res, options);
  return (
    l.name !== null ||
    l.address !== null ||
    l.checkIn !== null ||
    l.checkOut !== null ||
    l.confirmation !== null ||
    l.notes !== null
  );
}

/** A stay end's line: its label, then the text the card writes for it. */
function stayEndLine(
  label: string,
  end: StayEndText | null,
  name: string | null,
  group: string,
  seen: Seen,
): SearchEntry | null {
  if (end === null || end.kind === "missing") return null;
  if (end.kind === "raw") return searchLine(group, label, end.text, [name], seen);
  // The card spaces its parts apart under targets: "Check in 10 Apr Friday".
  return searchLine(group, label, `${end.day} ${end.month}`, [end.weekday, name], seen);
}

export type HotelsPanel = {
  /** One shared hotel card per reservation that renders a line, sorted by `ordinal`. */
  cards: { key: string; body: HotelCardBodyProps }[];
  /** Every card's lines, in render order. */
  lines: SearchEntry[];
};

/**
 * The Hotels panel: the crew props for each reservation's shared hotel card
 * (confirmation and notes shown, no guest chips, no stay dates under date
 * suppression, sentinels hidden, no placeholders), sorted ascending by
 * `ordinal`, with a search target per line.
 */
export function hotelsPanel(
  reservations: ShowForViewer["hotelReservations"],
  hideDates: boolean,
): HotelsPanel {
  const options = crewCardOptions(hideDates);
  const group = showSection("hotels").label;
  const seen: Seen = new Map();
  const lines: SearchEntry[] = [];
  const kept = [...reservations]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((res) => rendersAnything(res, options));
  const cards = kept.map((res, idx) => {
    const l = hotelCardLines(res, options);
    const targets: HotelCardBodyTargets = {};
    const add = (slot: keyof HotelCardBodyTargets, entry: SearchEntry | null) => {
      if (entry === null) return;
      targets[slot] = entry.id;
      lines.push(entry);
    };
    if (l.name !== null) add("name", searchLine(group, null, l.name, [], seen));
    if (l.address !== null) add("address", searchLine(group, null, l.address, [l.name], seen));
    add("checkIn", stayEndLine("Check in", l.checkIn, l.name, group, seen));
    add("checkOut", stayEndLine("Check out", l.checkOut, l.name, group, seen));
    if (l.confirmation !== null)
      add(
        "confirmation",
        searchLine(group, "Confirmation", l.confirmation, [l.name], seen, {
          kind: "hotelConfirmation",
          text: l.confirmation.trim(),
        }),
      );
    if (l.notes !== null) add("notes", searchLine(group, "Notes", l.notes, [l.name], seen));
    const key = `${res.ordinal}-${idx}`;
    return {
      key,
      body: {
        // Gated before the body sees it (spec §6.1, "already gated by the caller"):
        // under date suppression no stay date is in the props at all, and the guest
        // list the crew card does not show is not handed over.
        hotel: hideDates
          ? { ...res, check_in: null, check_out: null, names: [] }
          : { ...res, names: [] },
        nameId: `crew-hotel-${idx}-name`,
        guestsLabelId: `crew-hotel-${idx}-guests`,
        // No border of its own, however many stays: inside the panel card a
        // bordered card per stay nested three boxes deep and narrowed a 320 phone.
        // The section draws a hairline between stays instead (PR B invariant-8
        // gate, row 14; the crew's Travel card on main did the same).
        flat: true,
        ...options,
        testIdPrefix: "crew-panel",
        targets,
      },
    };
  });
  return { cards, lines };
}

/**
 * Did date suppression empty the Hotels section, or was there nothing to show?
 * Keyed on whether a DATE existed to withhold, through the sentinel predicate:
 * a literal `TBD` check-in is not a date, and telling a crew member their
 * dates are hidden when none existed is the same falsehood as telling them
 * nothing is booked when it is.
 */
export function hotelDatesWithheld(
  reservations: ShowForViewer["hotelReservations"],
  hideDates: boolean,
): boolean {
  return (
    hideDates &&
    reservations.some(
      (res) =>
        !shouldHideGenericOptional(res.check_in) || !shouldHideGenericOptional(res.check_out),
    )
  );
}
