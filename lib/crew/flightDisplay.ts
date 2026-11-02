/**
 * Flight-display derivation (presentation-only, pure).
 *
 * Parses the already-normalized `crew_members.flight_info` string (reaching the
 * crew page as `data.viewerFlightInfo`) into structured `FlightSegment`s for the
 * "Your flight" card. Derived per render — NO DB column, NO parser change.
 *
 * `flight_info` is always `" | "`-leg-delimited (TRAVEL via normalizeTravelCell;
 * TECH via crew.ts arrival/departure join), so `1 cleaned part = 1 segment`. Two
 * real layouts, detected per-segment by route-vs-date position:
 *   - TRAVEL: `[conf] M/D FLIGHT# ORIG - DEST DEP - ARR`  (route AFTER date)
 *   - TECH:   `ROUTE AIRLINE M/D - DEP - ARR CONF`        (route BEFORE date)
 * The helper is TOTAL — it never throws; an unparseable (no-date) part yields a
 * `structured: false` raw-fallback segment.
 */
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { compareIso } from "@/lib/time/isoDate";

export type FlightSegment = {
  raw: string;
  structured: boolean;
  date: string | null; // ISO yyyy-mm-dd
  dateRaw: string | null; // original M/D token (fallback label when ISO inference fails)
  flightNo: string | null; // TRAVEL carrier code+number, e.g. "AA3002"
  airline: string | null; // TECH carrier name, e.g. "UNITED" / "JET BLUE"
  origin: string | null;
  dest: string | null;
  depTime: string | null;
  arrTime: string | null;
  conf: string | null; // per-segment TRAILING conf (TECH); null when conf is itinerary-level (TRAVEL)
};
export type FlightItinerary = { confirmation: string | null; segments: FlightSegment[] };

const DATE_RE = /^(\d{1,2})\/(\d{1,2})$/;
const TIME_RE = /^\d{1,2}:\d{2}\s*(am|pm)$/i;
const AIRPORT_RE = /^[A-Z]{3}$/i;
const ROUTE_TOKEN_RE = /^([A-Z]{3})-([A-Z]{3})$/i; // EWR-FLL
const FLIGHTNO_RE = /^[A-Z]{1,3}\d{1,4}[A-Z]?$/i; // AA3002
const CONF_RE = /^[A-Z0-9]{4,}$/i; // HQQ79F, GEUZAB
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type MonthDay = { month: number; day: number };

function parseMd(mdToken: string): MonthDay | null {
  const m = mdToken.match(DATE_RE);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function isoOf(year: number, md: MonthDay): string {
  return `${year}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`;
}

export function formatFlightDate(iso: string): string {
  const [, mm, dd] = iso.split("-");
  const mi = Number(mm) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${Number(dd)}` : iso;
}

type SegFields = Omit<FlightSegment, "raw" | "structured">;

// parsePart extracts everything EXCEPT the calendar year — `date` stays null here and is
// assigned by parseFlightItinerary, which applies a running year with cross-year rollover.
function parsePart(tokens: string[]): {
  fields: SegFields;
  md: MonthDay | null;
  hasDate: boolean;
  techShaped: boolean;
  dateIdx: number;
} {
  const empty: SegFields = {
    date: null,
    dateRaw: null,
    flightNo: null,
    airline: null,
    origin: null,
    dest: null,
    depTime: null,
    arrTime: null,
    conf: null,
  };
  const dateIdx = tokens.findIndex((t) => DATE_RE.test(t));
  if (dateIdx === -1)
    return { fields: empty, md: null, hasDate: false, techShaped: false, dateIdx: -1 };

  const dateRaw = tokens[dateIdx]!;
  const md = parseMd(dateRaw);

  // route: single XXX-XXX token, else spaced XXX - XXX pair
  let origin: string | null = null;
  let dest: string | null = null;
  let routeStart = -1;
  let routeEnd = -1;
  const singleIdx = tokens.findIndex((t) => ROUTE_TOKEN_RE.test(t));
  if (singleIdx !== -1) {
    const m = tokens[singleIdx]!.match(ROUTE_TOKEN_RE)!;
    origin = m[1]!.toUpperCase();
    dest = m[2]!.toUpperCase();
    routeStart = singleIdx;
    routeEnd = singleIdx;
  } else {
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (AIRPORT_RE.test(tokens[i]!) && tokens[i + 1] === "-" && AIRPORT_RE.test(tokens[i + 2]!)) {
        origin = tokens[i]!.toUpperCase();
        dest = tokens[i + 2]!.toUpperCase();
        routeStart = i;
        routeEnd = i + 2;
        break;
      }
    }
  }

  // times: first TIME - TIME pair
  let depTime: string | null = null;
  let arrTime: string | null = null;
  let lastTimeIdx = -1;
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (TIME_RE.test(tokens[i]!) && tokens[i + 1] === "-" && TIME_RE.test(tokens[i + 2]!)) {
      depTime = tokens[i]!;
      arrTime = tokens[i + 2]!;
      lastTimeIdx = i + 2;
      break;
    }
  }

  let flightNo: string | null = null;
  let airline: string | null = null;
  let conf: string | null = null;
  const techShaped = routeStart !== -1 && routeStart < dateIdx;
  if (techShaped) {
    const between = tokens.slice(routeEnd + 1, dateIdx).filter((t) => t !== "-");
    airline = between.length > 0 ? between.join(" ") : null;
    const last = tokens[tokens.length - 1]!;
    if (
      lastTimeIdx !== -1 &&
      tokens.length - 1 > lastTimeIdx &&
      CONF_RE.test(last) &&
      !TIME_RE.test(last)
    ) {
      conf = last.toUpperCase();
    }
  } else {
    const after = tokens[dateIdx + 1];
    if (after && FLIGHTNO_RE.test(after)) flightNo = after.toUpperCase();
  }

  return {
    fields: { date: null, dateRaw, flightNo, airline, origin, dest, depTime, arrTime, conf },
    md,
    hasDate: true,
    techShaped,
    dateIdx,
  };
}

export function parseFlightItinerary(flightInfo: string | null, showYear: number): FlightItinerary {
  if (!flightInfo || flightInfo.trim().length === 0) return { confirmation: null, segments: [] };
  const parts = flightInfo
    .split(/\s*\|\s*|\n/)
    .map((p) => stripAgendaUrls(p).trim())
    .filter((p) => p.length > 0 && !shouldHideGenericOptional(p));
  if (parts.length === 0) return { confirmation: null, segments: [] };

  const segments: FlightSegment[] = [];
  let confirmation: string | null = null;
  // Running year with cross-year rollover: assume itinerary legs are in chronological
  // source order; when a leg's M/D goes backward vs the previous leg (e.g. 12/30 → 1/2),
  // bump the year so a New-Year-crossing return leg dates + sorts correctly.
  let runningYear = showYear;
  let prevMd: MonthDay | null = null;

  parts.forEach((part, idx) => {
    const tokens = part.split(/\s+/);
    const { fields, md, hasDate, techShaped, dateIdx } = parsePart(tokens);
    if (!hasDate) {
      segments.push({
        raw: part,
        structured: false,
        date: null,
        dateRaw: null,
        flightNo: null,
        airline: null,
        origin: null,
        dest: null,
        depTime: null,
        arrTime: null,
        conf: null,
      });
      return;
    }
    let date: string | null = null;
    if (md) {
      if (
        prevMd &&
        (md.month < prevMd.month || (md.month === prevMd.month && md.day < prevMd.day))
      ) {
        runningYear += 1;
      }
      date = isoOf(runningYear, md);
      prevMd = md;
    }
    // Itinerary-level confirmation: leading tokens before the date in the FIRST part,
    // ONLY when that part is TRAVEL-shaped (route after date) — TECH leading tokens are route+airline.
    if (idx === 0 && !techShaped && dateIdx > 0) {
      const lead = tokens.slice(0, dateIdx).join(" ").trim();
      confirmation = lead.length > 0 ? lead : null;
    }
    segments.push({ raw: part, structured: true, ...fields, date });
  });

  return { confirmation, segments };
}

export function sortSegmentsByDate(segments: FlightSegment[]): FlightSegment[] {
  return segments
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (a.s.date && b.s.date) return compareIso(a.s.date, b.s.date) || a.i - b.i;
      if (a.s.date) return -1; // non-null first
      if (b.s.date) return 1;
      return a.i - b.i; // both null → stable
    })
    .map((x) => x.s);
}

export function pickUpcomingIndex(segments: FlightSegment[], todayIso: string): number | null {
  const today = segments.findIndex((s) => s.date === todayIso);
  if (today !== -1) return today;
  for (let i = 0; i < segments.length; i++) {
    const d = segments[i]!.date;
    if (d && compareIso(d, todayIso) >= 0) return i;
  }
  return null;
}

/**
 * The flight card's structured-vs-raw decision, extracted so the card, the
 * date-suppression filter (`visibleFlightSegments`) and the Transport section's
 * membership (`viewerFlightShown`) read it from ONE place. Moved here from the
 * Travel section's rows module when Travel split into Hotels and Transport
 * (crew page redesign PR B Task 9), so lib/crew/crewSections.ts can read it. Two copies of this
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

/**
 * The segments the "Your flight" card renders, in the order given. LEAK SITE 3
 * (the row-set half): under date suppression a raw-fallback row, which prints
 * `seg.raw` verbatim, date included by construction, is withheld whole; the
 * content cost is a documented limit.
 */
export function visibleFlightSegments(
  segments: readonly FlightSegment[],
  hideDates: boolean,
): FlightSegment[] {
  return hideDates
    ? segments.filter((seg) => flightRowFields(seg, hideDates).showStructured)
    : [...segments];
}

/**
 * Whether the viewer's "Your flight" card renders a row: the Transport section's
 * own-flight membership rule (plan decision 1; spec line 240). Which parts are
 * segments, and which render, does not depend on the year (it only dates a
 * segment), so any year counts them; the card itself dates them with the
 * show's year.
 */
export function viewerFlightShown(flightInfo: string | null, hideDates: boolean): boolean {
  return (
    visibleFlightSegments(parseFlightItinerary(flightInfo, 2000).segments, hideDates).length > 0
  );
}
