/**
 * components/crew/sections/transportRows.ts — the Transport section's row
 * derivations (crew page redesign PR B Task 9; spec §6.2 `transport` row).
 *
 * `TransportSection` renders from these and the crew search builder
 * (lib/search/sections/transport.ts) indexes from them, so the page and the
 * index cannot disagree about which lines exist, in what order, or under which
 * id (spec §2.4, INV-1). Two blocks:
 *
 *   - Your flight (`flightCard`), the crew-only card on top (spec line 318),
 *     moved here from the retired Travel section's rows module unchanged.
 *   - The shared transport body's crew props (`transportPanel`,
 *     components/show-panels/TransportBody.tsx): the digits-only call link,
 *     contacts linked, sentinels hidden, each leg's time line "leaves <date>,
 *     <time>" (spec line 419, as amended), the date withheld under date suppression, legs
 *     without a stage kept as the crew page kept them, and a search target per
 *     cell, leg and the notes, each read from the body's own field derivation.
 *
 * The derivations are separate exports on purpose: the parity suite's
 * error-guard case makes one of them throw for both callers, which only works
 * across a module boundary. No `"use client"`: the builder runs on the server.
 */
import { crewMailtoHref, crewTelHref } from "@/components/crew/sections/crewRows";
import { crewTransportLegOptions } from "@/components/crew/sections/transportLegTime";
import type {
  TransportBodyProps,
  TransportBodyTargets,
} from "@/components/show-panels/TransportBody";
import {
  transportBodyFields,
  transportRidersText,
  transportRouteLegs,
  type TransportContact,
} from "@/components/show-panels/transportLegs";
import {
  flightRowFields,
  formatFlightDate,
  parseFlightItinerary,
  pickUpcomingIndex,
  sortSegmentsByDate,
  visibleFlightSegments,
  type FlightSegment,
} from "@/lib/crew/flightDisplay";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { TransportationRow } from "@/lib/parser/types";
import { entryId } from "@/lib/search/entryId";
import { normalize } from "@/lib/search/normalize";
import type { SearchCopy, SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";

type Seen = Map<string, number>;

const tokens = (s: string) =>
  normalize(s)
    .map((t) => t.text)
    .join(" ");

/**
 * One search entry for one rendered line of a Transport card, or null when the
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
    id: entryId("transport", region, group, lab, value, seen),
    section: "transport",
    group,
    label: lab,
    value,
    context: ctx,
    copy,
  };
}

/** A flight confirmation code as the clipboard should receive it. */
const confirmationCopy = (code: string): SearchCopy => ({
  kind: "flightConfirmation",
  text: code.trim(),
});

// ── Your flight ──────────────────────────────────────────────────────────────

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
  // LEAK SITE 3 (the row-set half), `visibleFlightSegments`. The filter runs
  // BEFORE `showFlight`, so an all-raw itinerary produces exactly the
  // no-flight-data render rather than a stranded empty "Your flight" card that
  // would also suppress the empty state; the section's membership reads the
  // same filter (`viewerFlightShown`).
  const flightSegments = visibleFlightSegments(sortedSegments, hideDates);
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
        ? searchLine(FLIGHT.region, FLIGHT.group, "Conf", conf, [], seen, confirmationCopy(conf))
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
            confirmationCopy(confirmation),
          )
        : null,
  };
}

// ── Transport ────────────────────────────────────────────────────────────────

/** The transport card's `data-card-id` (its search region and its source link, `CARD_REGION_MAP`). */
export const TRANSPORT_CARD_ID = "travel-getting-there";

// The crew's leg options live in transportLegTime.ts, JSX-free, because the
// client-reachable peek reads them (PR B invariant-8 gate, row 9).
export { crewLegTime, crewTransportLegOptions } from "@/components/crew/sections/transportLegTime";

export type TransportPanel = {
  /** The shared transport body's crew props. */
  body: TransportBodyProps;
  /** The body's lines, in render order: the cells, the legs, the notes. */
  lines: SearchEntry[];
};

/**
 * The shared transport body's crew props and its search lines. `transportation`
 * is the row the viewer may see: the caller passes it only when
 * `transportTileVisible` admits the viewer, so no driver, vehicle, plate or
 * parking value reaches anyone else (phase 1 watchpoint 14).
 */
export function transportPanel(
  transportation: TransportationRow,
  hideDates: boolean,
): TransportPanel {
  const options = crewTransportLegOptions(hideDates);
  // The body's own field derivation: each value is already sentinel-filtered there
  // (TransportBody's `shown`, through shouldHideGenericOptional).
  const { driver, loadout, vehicle, parking, notes } = transportBodyFields(
    transportation,
    options.sentinels,
  );
  const legs = transportRouteLegs(transportation, options);
  const group = showSection("transport").label;
  const seen: Seen = new Map();
  const lines: SearchEntry[] = [];
  /** A cell or leg is one line: its first present piece the value, the rest context. */
  const line = (label: string | null, pieces: readonly (string | null)[]): string | undefined => {
    const present = pieces.filter((p): p is string => p !== null && p.trim().length > 0);
    const [value = "", ...rest] = present;
    const entry =
      value === "" && label !== null
        ? searchLine(TRANSPORT_CARD_ID, group, null, label, [], seen)
        : searchLine(TRANSPORT_CARD_ID, group, label, value, rest, seen);
    if (entry === null) return undefined;
    lines.push(entry);
    return entry.id;
  };
  const contact = (label: string, c: TransportContact | null) =>
    c === null ? undefined : line(label, [c.name, c.phone, c.email]);

  const targets: TransportBodyTargets = {
    driver: contact("Driver", driver),
    loadout: contact("Load out", loadout),
    vehicle: vehicle === null ? undefined : line("Vehicle", [vehicle.vehicle, ...vehicle.subs]),
    parking: parking === null ? undefined : line("Parking", [parking]),
    // A leg's stage is its label when anything else renders, else its value. The
    // riders read as the body writes them, "With" and the names.
    legs: legs.map((leg) => line(leg.stage, [leg.when, transportRidersText(leg.names, "with")])),
    notes: notes === null ? undefined : line(null, [notes]),
  };
  return {
    body: {
      // Gated before the body sees it (spec §6.1): under date suppression no leg
      // date is in the props at all; the body's `hideDates` withholds them too.
      transport: hideDates
        ? {
            ...transportation,
            schedule: transportation.schedule.map((leg) => ({ ...leg, date: null })),
          }
        : transportation,
      telHref: crewTelHref,
      mailtoHref: crewMailtoHref,
      linkifyContacts: true,
      ...options,
      // The crew's presentation (PR B invariant-8 gate rows 1, 2, 3, 16): the
      // section container's threshold, a vertical route below it, neutral dots
      // with border connectors, and "With" before the riders.
      layout: "container",
      routeMarkers: "neutral",
      riders: "with",
      targets,
    },
    lines,
  };
}
