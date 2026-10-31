/**
 * components/crew/sections/travelRows.ts — the Travel section's row derivations.
 *
 * `TravelSection` renders from these and the crew search builder
 * (lib/search/sections/travel.ts) indexes from them, so the page and the index
 * cannot disagree about which lines exist, in what order, or under which id
 * (spec §2.4, INV-1). Each line the section renders carries its `SearchEntry`
 * here; the component puts that entry's `id` on the line's element as
 * `data-search-target`.
 *
 * The three card derivations are separate exports on purpose: the parity
 * suite's error-guard case makes one of them throw for both callers, which only
 * works across a module boundary.
 *
 * Every generic-optional read routes through `shouldHideGenericOptional`
 * (lib/visibility/emptyState.ts), as it did inline in the component. No
 * `"use client"`: the builder runs on the server.
 */
import type { KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import {
  formatFlightDate,
  parseFlightItinerary,
  pickUpcomingIndex,
  sortSegmentsByDate,
  type FlightSegment,
} from "@/lib/crew/flightDisplay";
import { visibleTransportLegs } from "@/lib/crew/transportLegs";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { formatIsoDate } from "@/lib/format/date";
import type { TransportationRow } from "@/lib/parser/types";
import { entryId } from "@/lib/search/entryId";
import { normalize } from "@/lib/search/normalize";
import type { SearchCopy, SearchEntry } from "@/lib/search/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";

type Seen = Map<string, number>;

const tokens = (s: string) =>
  normalize(s)
    .map((t) => t.text)
    .join(" ");

/**
 * One search entry for one rendered line of a Travel card, or null when the
 * line's value is blank (the page renders no target for it). A label that
 * equals its group is stored as null (spec §3) and kept as context, so the
 * rendered label text is still carried by the entry (INV-1 clause 3).
 */
function searchLine(
  region: string,
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
    id: entryId("travel", region, group, lab, value, seen),
    section: "travel",
    group,
    label: lab,
    value,
    context: ctx,
    copy,
  };
}

/**
 * A confirmation code as the clipboard should receive it. The kind names whose
 * confirmation it is, so the search UI never reads that from the entry id.
 */
const confirmationCopy = (
  kind: "hotelConfirmation" | "flightConfirmation",
  code: string,
): SearchCopy => ({
  kind,
  text: code.trim(),
});

// ── Your flight ──────────────────────────────────────────────────────────────

/**
 * The flight card's structured-vs-raw decision, extracted so the card and the
 * date-suppression filter below read it from ONE place. Two copies of this
 * predicate would drift, and the drift is silent: the filter would withhold a
 * row the card would have rendered structurally (content lost) or keep one the
 * card renders raw (a date leaked through the fallback).
 */
export function flightRowFields(
  seg: FlightSegment,
  hideDates: boolean,
): {
  carrier: string | null;
  route: string;
  conf: string | null;
  showStructured: boolean;
} {
  // `flightNo`, `airline` and `conf` are the parser's UNVALIDATED REMAINDER: it
  // claims the date, route and times, then assigns whatever tokens are left to
  // these. So an ordinary duplicated-date authoring mistake ("5/13 MAY13 LGA -
  // ORD", or a leading ISO date) puts a date in them, and it renders outside
  // `dateLabel` where none of the date gates can see it.
  //
  // The rule under suppression is CLOSED, not a recognizer: render only the
  // fields whose SHAPE cannot express a date — the route (airport codes, three
  // letters each side of a separator) and the times (`h:mm am/pm`) — and
  // withhold the remainder. Recognizing dates inside the remainder instead would
  // mean enumerating spellings, which does not terminate and gets a wider
  // target every round. `flightNo` is in the withheld set precisely because its
  // own shape (`^[A-Z]{1,3}\d{1,4}[A-Z]?$`) ACCEPTS "MAY13".
  //
  // The cost is the carrier name and confirmation code, for suppressed viewers
  // only; route and times are what a crew member reads off a phone anyway.
  const carrier = hideDates ? null : (seg.flightNo ?? seg.airline);
  const route =
    seg.origin && seg.dest ? `${seg.origin} → ${seg.dest}` : (seg.origin ?? seg.dest ?? "");
  const conf = hideDates ? null : seg.conf;
  const hasContent = Boolean(carrier || route || seg.depTime || seg.arrTime);
  return { carrier, route, conf, showStructured: seg.structured && hasContent };
}

export type FlightSegmentRow = {
  seg: FlightSegment;
  /** Structured fields, or the raw-line fallback (`seg.raw`). */
  structured: boolean;
  carrier: string | null;
  route: string;
  conf: string | null;
  /** The eyebrow date: formatted ISO, else the raw M/D token, else "" (and always "" under suppression). */
  dateLabel: string;
  /** The emphasis chip on the next (or today's) flight; null on every other row. */
  chip: "Today" | "Next" | null;
  /** "dep – arr", only when both times are known. */
  times: string | null;
  /** The segment's line: the eyebrow, carrier and route, and times; or the raw line. */
  line: SearchEntry | null;
  /** The per-segment "Conf" line. */
  confLine: SearchEntry | null;
};

export type FlightCard = {
  /** Every parsed segment, date-sorted, BEFORE the suppression filter. */
  sortedSegments: FlightSegment[];
  /** The rows the card renders, in render order. Empty means no card. */
  rows: FlightSegmentRow[];
  /** The itinerary-level confirmation the card renders (withheld under suppression). */
  confirmation: string | null;
  confirmationLine: SearchEntry | null;
};

const FLIGHT = { region: "travel-flight", group: "Your flight" } as const;

/**
 * Derive the structured segments from the viewer's flight_info string (pure; no
 * DB/projection change). `parseFlightItinerary` owns the strip/sentinel
 * pre-clean, then classifies each leg (TRAVEL vs TECH) into fields. showYear:
 * from the show's dates, else the show-tz year.
 */
export function flightCard(data: ShowForViewer, today: Date, hideDates: boolean): FlightCard {
  const flightTodayIso = todayIsoInShowTimezone(data.show, today);
  const showYear =
    Number(
      (
        data.show.dates.travelIn ??
        data.show.dates.showDays[0] ??
        data.show.dates.travelOut ??
        ""
      ).slice(0, 4),
    ) || Number(flightTodayIso.slice(0, 4));
  const flightItinerary = parseFlightItinerary(data.viewerFlightInfo, showYear);
  const sortedSegments = sortSegmentsByDate(flightItinerary.segments);
  // LEAK SITE 3 (the row-set half). A raw-fallback row prints `seg.raw`
  // verbatim — the designated render of the viewer's OWN itinerary line,
  // date included by construction, and unparseable mixed text that cannot
  // be split into date and non-date parts. Withholding the whole row is
  // the conservative arm; the content cost is recorded as a documented
  // limit. The filter runs BEFORE `showFlight`, so an all-raw itinerary
  // produces exactly the no-flight-data render rather than a stranded
  // empty "Your flight" card that would also suppress the empty state.
  const flightSegments = hideDates
    ? sortedSegments.filter((seg) => flightRowFields(seg, hideDates).showStructured)
    : sortedSegments;
  // "Which flight is next" is the same viewer-schedule claim as the date,
  // rendered as a chip AND as row styling; both hang off this index.
  const flightNextIdx = hideDates ? null : pickUpcomingIndex(flightSegments, flightTodayIso);

  const seen: Seen = new Map();
  const line = (label: string | null, value: string, context: (string | null)[] = []) =>
    searchLine(FLIGHT.region, FLIGHT.group, label, value, context, seen);

  const rows = flightSegments.map((seg, i): FlightSegmentRow => {
    const { carrier, route, conf, showStructured } = flightRowFields(seg, hideDates);
    const chip = i === flightNextIdx ? (seg.date === flightTodayIso ? "Today" : "Next") : null;
    // LEAK SITE 3 (the label half). BOTH arms are suppressed: `dateRaw`
    // is the raw M/D token and leaks identically to the formatted ISO.
    const dateLabel = hideDates ? "" : seg.date ? formatFlightDate(seg.date) : (seg.dateRaw ?? "");
    const times = seg.depTime && seg.arrTime ? `${seg.depTime} – ${seg.arrTime}` : null;
    if (!showStructured) {
      return {
        seg,
        structured: false,
        carrier,
        route,
        conf,
        dateLabel,
        chip,
        times,
        line: line(null, seg.raw),
        confLine: null,
      };
    }
    // The line's value is its most specific text: carrier and route, else the
    // times, else the bare date. Whatever it is not stays as label or context.
    const carrierRoute = [carrier, route].filter(Boolean).join(" · ");
    const value = carrierRoute || times || dateLabel;
    const segLine =
      value === dateLabel
        ? line(null, value, [chip])
        : line(dateLabel || null, value, [value === times ? null : times, chip]);
    return {
      seg,
      structured: true,
      carrier,
      route,
      conf,
      dateLabel,
      chip,
      times,
      line: segLine,
      confLine: conf
        ? searchLine(
            FLIGHT.region,
            FLIGHT.group,
            "Conf",
            conf,
            [],
            seen,
            confirmationCopy("flightConfirmation", conf),
          )
        : null,
    };
  });

  // The itinerary-level confirmation is the same unvalidated remainder as the
  // per-segment one: leading tokens before the first date. Withheld under
  // suppression for the same reason.
  const confirmation =
    !hideDates && flightItinerary.confirmation ? flightItinerary.confirmation : null;
  return {
    sortedSegments,
    rows,
    confirmation,
    confirmationLine:
      confirmation !== null
        ? searchLine(
            FLIGHT.region,
            FLIGHT.group,
            "Confirmation",
            confirmation,
            [],
            seen,
            confirmationCopy("flightConfirmation", confirmation),
          )
        : null,
  };
}

// ── Getting there ────────────────────────────────────────────────────────────

/** A ground leg's meta line: the time (when the date is the primary) and who rides. */
export type LegMeta = { time: string | null; names: string[] };

export type GroundRow = {
  key: string;
  /** The eyebrow; "" when a leg's stage was promoted to the primary line. */
  label: string;
  /** The strong primary line's text. Null only for a leg whose content is its names. */
  primary: string | null;
  /** A leg whose primary is its date renders it in a `<time dateTime>`. */
  primaryDate: string | null;
  line: SearchEntry | null;
} & (
  | { kind: "contact"; meta: string | null }
  | { kind: "vehicle"; meta: string | null; conf: string | null }
  | { kind: "leg"; legMeta: LegMeta | null }
);

export type GettingThere = {
  rows: GroundRow[];
  notes: string | null;
  notesLine: SearchEntry | null;
  /** Any row or the notes line renders, so the card renders. */
  visible: boolean;
};

const GROUND = { region: "travel-getting-there", group: "Getting there" } as const;

/** The leg meta line exactly as its text nodes read: "7:00 AM · With Pat, Sam". */
function legMetaText(meta: LegMeta | null): string | null {
  if (meta === null) return null;
  const names = meta.names.length > 0 ? `With ${meta.names.join(", ")}` : null;
  return [meta.time, names].filter(Boolean).join(" · ") || null;
}

/**
 * The "Getting there" rows (mock `.travelrow`). `transportation` is the row the
 * viewer may see: the caller passes null when `transportTileVisible` says the
 * block is hidden, so no driver / vehicle / plate / parking PII is derived.
 */
export function gettingThereRows(
  transportation: TransportationRow | null,
  hideDates: boolean,
): GettingThere {
  // Generic-optional reads route through the central predicate so sentinels
  // ('TBD' / 'N/A' / 'TBA' / '') reflow out — and so a sentinel driver_phone
  // never renders as a dead `tel:TBD` control.
  const driverName =
    transportation && !shouldHideGenericOptional(transportation.driver_name)
      ? transportation.driver_name
      : null;
  const driverPhone =
    transportation && !shouldHideGenericOptional(transportation.driver_phone)
      ? transportation.driver_phone
      : null;
  const driverEmail =
    transportation && !shouldHideGenericOptional(transportation.driver_email)
      ? transportation.driver_email
      : null;
  const loadoutName =
    transportation && !shouldHideGenericOptional(transportation.loadout_name)
      ? transportation.loadout_name
      : null;
  const loadoutPhone =
    transportation && !shouldHideGenericOptional(transportation.loadout_phone)
      ? transportation.loadout_phone
      : null;
  const loadoutEmail =
    transportation && !shouldHideGenericOptional(transportation.loadout_email)
      ? transportation.loadout_email
      : null;
  const vehicle =
    transportation && !shouldHideGenericOptional(transportation.vehicle)
      ? transportation.vehicle
      : null;
  const licensePlate =
    transportation && !shouldHideGenericOptional(transportation.license_plate)
      ? transportation.license_plate
      : null;
  const color =
    transportation && !shouldHideGenericOptional(transportation.color)
      ? transportation.color
      : null;
  const parking =
    transportation && !shouldHideGenericOptional(transportation.parking)
      ? transportation.parking
      : null;
  const transportNotes =
    transportation && !shouldHideGenericOptional(transportation.notes)
      ? transportation.notes
      : null;

  // Per-leg sentinel hiding and the empty-leg drop live in
  // `visibleTransportLegs`, shared with the "All sections" Travel peek, so the
  // section, the peek's ride count and the search index read one leg list.
  const legs = visibleTransportLegs(transportation ? transportation.schedule : [], hideDates);

  const seen: Seen = new Map();
  // A travelrow is one line: its eyebrow is the label, its first non-empty
  // line (primary, else meta, else conf) the value, the rest context.
  const rowLine = (label: string, lines: (string | null)[]) => {
    const present = lines.filter((l): l is string => l !== null && l.trim().length > 0);
    const [value = "", ...rest] = present;
    return searchLine(GROUND.region, GROUND.group, label || null, value, rest, seen);
  };

  // Driver + vehicle each collapse to ONE travelrow: the strongest field is
  // the primary, the remainder fall to meta/conf. Each value is already
  // sentinel-hidden at the read site above, so a row only appears when at
  // least one of its fields survived. The `primary ?? meta ?? conf` cascade
  // guarantees no surviving field is dropped when its preferred anchor
  // (driver_name / vehicle) is itself a sentinel/null.
  const rows: GroundRow[] = [];
  // Driver row: name is the primary; phone + email fall to meta. When the
  // name is a sentinel/null, the first surviving contact field is promoted
  // to primary so nothing is silently dropped. Load-out secondary
  // transporter: same promote-first-survivor cascade.
  for (const [key, label, fields] of [
    ["driver", "Driver", [driverName, driverPhone, driverEmail]],
    ["loadout", "Load out", [loadoutName, loadoutPhone, loadoutEmail]],
  ] as const) {
    const present = fields.filter(Boolean) as string[];
    const primary = present[0] ?? null;
    if (primary === null) continue;
    const meta = present.length > 1 ? present.slice(1).join(" · ") : null;
    rows.push({
      kind: "contact",
      key,
      label,
      primary,
      primaryDate: null,
      meta,
      line: rowLine(label, [primary, meta]),
    });
  }

  // Vehicle row: vehicle is the primary; license plate + color fall to meta;
  // parking is the conf line. Same promote-first-survivor cascade.
  const vehicleFields = [vehicle, licensePlate, color, parking].filter(Boolean) as string[];
  const vehiclePrimary = vehicleFields[0] ?? null;
  if (vehiclePrimary !== null) {
    const vehicleMetaLines = vehicleFields.slice(1, -1);
    const meta = vehicleMetaLines.length > 0 ? vehicleMetaLines.join(" · ") : null;
    const conf =
      vehicleFields.length > 1 ? (vehicleFields[vehicleFields.length - 1] ?? null) : null;
    rows.push({
      kind: "vehicle",
      key: "vehicle",
      label: "Vehicle",
      primary: vehiclePrimary,
      primaryDate: null,
      meta,
      conf,
      line: rowLine("Vehicle", [vehiclePrimary, meta, conf]),
    });
  }

  legs.forEach((leg, idx) => {
    // Each sub-field is already sentinel-hidden at the read site
    // above, so a non-null `date` / `time` / `stage` is real
    // content. The date is the primary line; when a leg has no
    // date, the time (else the stage) is promoted so the row is
    // never blank — and the promoted field is then not repeated
    // in the meta line. A leg with no stage label drops the
    // eyebrow (empty `label` → TravelRow renders a blank eyebrow,
    // acceptable per its presentational contract).
    const dateIsPrimary = leg.date !== null;
    const timeIsPrimary = !dateIsPrimary && leg.time !== null;
    // When neither date nor time survives, the stage becomes the
    // primary; in that case it must NOT also be the eyebrow.
    const stageIsPrimary = !dateIsPrimary && !timeIsPrimary && leg.stage !== null;
    const label = stageIsPrimary ? "" : (leg.stage ?? "");
    const showTimeInMeta = dateIsPrimary && leg.time !== null;
    const hasNames = leg.assignedNames.length > 0;
    const legMeta: LegMeta | null =
      showTimeInMeta || hasNames
        ? { time: showTimeInMeta ? leg.time : null, names: hasNames ? leg.assignedNames : [] }
        : null;
    const primary = dateIsPrimary
      ? formatIsoDate(leg.date!, "weekday-short")
      : (leg.time ?? leg.stage);
    rows.push({
      kind: "leg",
      key: `${leg.stage ?? "no-stage"}-${leg.date ?? "no-date"}-${idx}`,
      label,
      primary,
      primaryDate: dateIsPrimary ? leg.date : null,
      legMeta,
      line: rowLine(label, [primary, legMetaText(legMeta)]),
    });
  });

  return {
    rows,
    notes: transportNotes,
    notesLine:
      transportNotes !== null
        ? searchLine(GROUND.region, GROUND.group, null, transportNotes, [], seen)
        : null,
    visible: rows.length > 0 || transportNotes !== null,
  };
}

// ── Hotels ───────────────────────────────────────────────────────────────────

/**
 * Does this reservation render ANYTHING once its check-in/check-out rows are
 * withheld? Mirrors the hotel block's own read sites (name / address /
 * confirmation / notes). Used only under date suppression: a reservation whose
 * sole rendered content was its dates would otherwise leave an empty bordered
 * block inside a titled "Hotels" card — section chrome wrapping nothing.
 */
export function reservationHasNonDateContent(
  res: ShowForViewer["hotelReservations"][number],
): boolean {
  return Boolean(
    res.hotel_name ||
    !shouldHideGenericOptional(res.hotel_address) ||
    !shouldHideGenericOptional(res.confirmation_no) ||
    !shouldHideGenericOptional(res.notes),
  );
}

export type HotelDate = { iso: string; text: string; line: SearchEntry | null };

export type HotelBlock = {
  ordinal: number;
  /** Rendered when truthy: the name has NO sentinel guard here (Today's Tonight card has one). */
  name: string | null;
  nameLine: SearchEntry | null;
  address: string | null;
  addressLine: SearchEntry | null;
  /** Null when withheld (date suppression) or absent. */
  checkIn: HotelDate | null;
  checkOut: HotelDate | null;
  /** Confirmation and notes, each carrying its search target. */
  stayRows: KeyValueRow[];
  stayLines: SearchEntry[];
};

const HOTELS = { region: "travel-hotels", group: "Hotels" } as const;

/** Every reservation the Hotels card renders, sorted ascending by `ordinal`, in render order. */
export function hotelBlocks(
  reservations: ShowForViewer["hotelReservations"],
  hideDates: boolean,
): HotelBlock[] {
  const seen: Seen = new Map();
  const line = (
    label: string | null,
    value: string,
    context: (string | null)[],
    copy?: SearchCopy,
  ) => searchLine(HOTELS.region, HOTELS.group, label, value, context, seen, copy ?? null);

  // LEAK SITE 2 (the filter half). Under suppression the check-in/out <dl>
  // does not mount, so a dates-only reservation would render an empty
  // block; it is dropped here and `hasHotels` re-derives from what is
  // actually visible.
  return [...reservations]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((res) => !hideDates || reservationHasNonDateContent(res))
    .map((res): HotelBlock => {
      const name = res.hotel_name ? res.hotel_name : null;
      const hotelAddress = !shouldHideGenericOptional(res.hotel_address) ? res.hotel_address : null;
      const confirmation = !shouldHideGenericOptional(res.confirmation_no)
        ? res.confirmation_no
        : null;
      const resNotes = !shouldHideGenericOptional(res.notes) ? res.notes : null;

      const nameLine = name !== null ? line(null, name, []) : null;
      const addressLine = hotelAddress !== null ? line(null, hotelAddress, [name]) : null;
      // LEAK SITE 2 (the render half). Under suppression neither date mounts.
      const date = (label: string, iso: string | null): HotelDate | null => {
        if (hideDates || iso === null) return null;
        const text = formatIsoDate(iso, "short");
        return { iso, text, line: line(label, text, [name]) };
      };
      const checkIn = date("Check in", res.check_in);
      const checkOut = date("Check out", res.check_out);

      const stayRows: KeyValueRow[] = [];
      const stayLines: SearchEntry[] = [];
      const stay = (row: KeyValueRow, entry: SearchEntry | null) => {
        stayRows.push(entry !== null ? { ...row, searchTarget: entry.id } : row);
        if (entry !== null) stayLines.push(entry);
      };
      if (confirmation)
        stay(
          { k: "Confirmation", v: confirmation, code: true },
          line(
            "Confirmation",
            confirmation,
            [name],
            confirmationCopy("hotelConfirmation", confirmation),
          ),
        );
      if (resNotes) stay({ k: "Notes", v: resNotes }, line("Notes", resNotes, [name]));

      return {
        ordinal: res.ordinal,
        name,
        nameLine,
        address: hotelAddress,
        addressLine,
        checkIn,
        checkOut,
        stayRows,
        stayLines,
      };
    });
}
