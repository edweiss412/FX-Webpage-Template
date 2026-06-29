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
