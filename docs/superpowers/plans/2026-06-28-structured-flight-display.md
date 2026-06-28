# Structured Flight Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the crew "Your flight" card from raw run-on leg strings into structured, scannable flight segments (date · carrier · route · times · confirmation), with render-time next/today emphasis and date sort, fully classifying **both** real flight formats (TRAVEL-tab and East Coast TECH-block).

**Architecture:** A new **pure, derived** helper `lib/crew/flightDisplay.ts` parses the existing `crew_members.flight_info` string (reaching the component as `data.viewerFlightInfo`) into `FlightSegment[]`, detecting the per-leg format by route-vs-date position. `components/crew/sections/TravelSection.tsx` renders the structured segments. **No DB / migration / parser / projection change** — structure is derived per render. Spec: `docs/superpowers/specs/2026-06-28-structured-flight-display-design.md` (Codex 4R APPROVE).

**Tech Stack:** TypeScript, React (server component), vitest + @testing-library/react (jsdom).

## Global Constraints

- **TDD per task.** Failing test → minimal impl → passing test → commit. (Invariant 1.)
- **Commit per task**, conventional-commits `<type>(crew-page): <summary>`. (Invariant 6.)
- **No DB / migration / parser / projection change.** `lib/parser/blocks/travelFlights.ts`, `crew.ts`, `lib/data/getShowForViewer.ts` are **untouched**.
- **Helper is total** — never throws; every part yields a `FlightSegment` (structured or raw-fallback). No new warnings.
- **`flight_info` is always `" | "`-leg-delimited** → `1 cleaned part = 1 segment` (carries all the leg's tokens). The pre-clean split is `/\s*\|\s*|\n/` — pipe **or** newline — exactly mirroring the shipped card's pre-clean (`TravelSection.tsx:265`, where the `\n` arm is a documented harmless forward-compat allowance; real `flight_info` contains no `\n`, so in practice it is pipe-only).
- **Format detection by route-vs-date position:** route token *before* the date ⇒ TECH (airline name + trailing per-segment `conf`); route *after* the date (or no route) ⇒ TRAVEL (flightNo + leading itinerary `confirmation`).
- **UI surface** (`components/crew/sections/TravelSection.tsx`) → **invariant 8** impeccable `critique`+`audit` dual-gate before close.
- **Meta-test inventory:** creates/extends **none**; the flight legs keep routing through `shouldHideGenericOptional` (pre-clean), so the sentinel-hiding contract is preserved, not relocated (spec §7.1).

---

## File Structure

- `lib/crew/flightDisplay.ts` — **Create.** Pure helper: types + `parseFlightItinerary` + `sortSegmentsByDate` + `pickUpcomingIndex` + `formatFlightDate`. Mirrors the `lib/crew/agendaDisplay.ts` presentation-derivation pattern.
- `tests/crew/flightDisplay.test.ts` — **Create.** Unit tests: both formats, guards, mutation proof.
- `components/crew/sections/TravelSection.tsx` — **Modify** (~line 264 pre-clean + ~line 480-505 "Your flight" card). Parse → sort → emphasize → render structured segments.
- `tests/components/crew/sections/TravelSection.flight.test.tsx` — **Modify.** Existing TECH-format tests now render structured (rewrite assertions); add TRAVEL + emphasis + raw-fallback + empty-omit cases.

---

### Task 1: Pure flight-display helper (`lib/crew/flightDisplay.ts`)

**Files:**
- Create: `lib/crew/flightDisplay.ts`
- Test: `tests/crew/flightDisplay.test.ts`

**Interfaces:**
- Produces:
  - `type FlightSegment = { raw: string; structured: boolean; date: string|null; dateRaw: string|null; flightNo: string|null; airline: string|null; origin: string|null; dest: string|null; depTime: string|null; arrTime: string|null; conf: string|null }` — `dateRaw` is the original `M/D` token (fulfils spec §5's "raw M/D fallback" when ISO inference fails); all other fields per spec §3.
  - `type FlightItinerary = { confirmation: string|null; segments: FlightSegment[] }`
  - `parseFlightItinerary(flightInfo: string|null, showYear: number): FlightItinerary`
  - `sortSegmentsByDate(segments: FlightSegment[]): FlightSegment[]` — stable, ascending by `date`, `null` dates last.
  - `pickUpcomingIndex(segments: FlightSegment[], todayIso: string): number|null`
  - `formatFlightDate(iso: string): string` — `"2026-03-22"` → `"Mar 22"` (pure string parse, no `Date`/timezone).

- [ ] **Step 1: Write the failing tests (both formats + guards)**

Create `tests/crew/flightDisplay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseFlightItinerary,
  sortSegmentsByDate,
  pickUpcomingIndex,
  formatFlightDate,
} from "@/lib/crew/flightDisplay";

const RPAS = "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
const FINTECH = "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm";
const TECH = "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
const TECH_SAMECONF = "JFK-FLL JETBLUE 5/13 - 11:15am - 2:18pm CGTTLO | FLL-JFK JETBLUE 5/15 - 8:59pm - 11:55pm CGTTLO";

describe("parseFlightItinerary — TRAVEL format", () => {
  it("RPAS: leading conf + per-leg flightNo/route/times; airline & per-seg conf null", () => {
    const { confirmation, segments } = parseFlightItinerary(RPAS, 2026);
    expect(confirmation).toBe("GEUZAB");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      structured: true, date: "2026-03-22", flightNo: "AA3002",
      origin: "LGA", dest: "ORD", depTime: "7:23am", arrTime: "9:15am",
      airline: null, conf: null,
    });
    expect(segments[1]).toMatchObject({ date: "2026-03-26", flightNo: "AA2723", origin: "ORD", dest: "LGA" });
  });
  it("FinTech: no leading conf → confirmation null", () => {
    const { confirmation, segments } = parseFlightItinerary(FINTECH, 2026);
    expect(confirmation).toBeNull();
    expect(segments[0]).toMatchObject({ flightNo: "AA1080", depTime: "12:00pm", arrTime: "1:00pm" });
  });
});

describe("parseFlightItinerary — TECH format", () => {
  it("East Coast: route-before-date → airline + trailing per-seg conf; flightNo & itinerary conf null", () => {
    const { confirmation, segments } = parseFlightItinerary(TECH, 2024);
    expect(confirmation).toBeNull();
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      structured: true, date: "2024-05-13", origin: "EWR", dest: "FLL",
      airline: "UNITED", depTime: "11:29am", arrTime: "2:34pm", conf: "HQQ79F", flightNo: null,
    });
    expect(segments[1]).toMatchObject({ origin: "FLL", dest: "EWR", airline: "JET BLUE", conf: "OSUULZ" });
  });
  it("same conf both legs is carried per-segment", () => {
    const { segments } = parseFlightItinerary(TECH_SAMECONF, 2024);
    expect(segments[0]!.conf).toBe("CGTTLO");
    expect(segments[1]!.conf).toBe("CGTTLO");
    expect(segments[0]!.airline).toBe("JETBLUE");
  });
});

describe("parseFlightItinerary — guards", () => {
  it("null/empty/whitespace → empty", () => {
    for (const v of [null, "", "   "]) expect(parseFlightItinerary(v, 2026)).toEqual({ confirmation: null, segments: [] });
  });
  it("sentinel-only legs dropped", () => {
    expect(parseFlightItinerary("TBD | N/A", 2026).segments).toHaveLength(0);
  });
  it("no-date part → structured:false, raw preserved", () => {
    const { segments } = parseFlightItinerary("UNKNOWN FLIGHT INFO NO DATE", 2026);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ structured: false, raw: "UNKNOWN FLIGHT INFO NO DATE", date: null });
  });
  it("out-of-range date 13/40 → date null, structured true, dateRaw kept", () => {
    const { segments } = parseFlightItinerary("13/40 AA1 LGA - ORD 7:00am - 8:00am", 2026);
    expect(segments[0]).toMatchObject({ structured: true, date: null, dateRaw: "13/40" });
  });
  it("missing carrier/airports/times → those fields null, date intact", () => {
    const { segments } = parseFlightItinerary("3/22 LGA - ORD", 2026);
    expect(segments[0]).toMatchObject({ date: "2026-03-22", origin: "LGA", dest: "ORD", flightNo: null, depTime: null });
  });
});

describe("sort + pick + format", () => {
  it("sortSegmentsByDate ascending, nulls last, stable", () => {
    const segs = parseFlightItinerary("3/26 AA2 LGA - ORD 7:00am - 8:00am | 3/22 AA1 ORD - LGA 7:00am - 8:00am", 2026).segments;
    const sorted = sortSegmentsByDate(segs);
    expect(sorted.map((s) => s.date)).toEqual(["2026-03-22", "2026-03-26"]);
  });
  it("pickUpcomingIndex: today match wins", () => {
    const segs = parseFlightItinerary(RPAS, 2026).segments;
    expect(pickUpcomingIndex(segs, "2026-03-26")).toBe(1);
  });
  it("pickUpcomingIndex: next upcoming when no exact today", () => {
    const segs = parseFlightItinerary(RPAS, 2026).segments;
    expect(pickUpcomingIndex(segs, "2026-03-24")).toBe(1);
  });
  it("pickUpcomingIndex: all past → null", () => {
    const segs = parseFlightItinerary(RPAS, 2026).segments;
    expect(pickUpcomingIndex(segs, "2026-04-01")).toBeNull();
  });
  it("formatFlightDate", () => {
    expect(formatFlightDate("2026-03-22")).toBe("Mar 22");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/crew/flightDisplay.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crew/flightDisplay'`.

- [ ] **Step 3: Implement the helper**

Create `lib/crew/flightDisplay.ts`:

```ts
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { compareIso } from "@/lib/time/isoDate";

export type FlightSegment = {
  raw: string;
  structured: boolean;
  date: string | null;
  dateRaw: string | null;
  flightNo: string | null;
  airline: string | null;
  origin: string | null;
  dest: string | null;
  depTime: string | null;
  arrTime: string | null;
  conf: string | null;
};
export type FlightItinerary = { confirmation: string | null; segments: FlightSegment[] };

const DATE_RE = /^(\d{1,2})\/(\d{1,2})$/;
const TIME_RE = /^\d{1,2}:\d{2}\s*(am|pm)$/i;
const AIRPORT_RE = /^[A-Z]{3}$/i;
const ROUTE_TOKEN_RE = /^([A-Z]{3})-([A-Z]{3})$/i; // EWR-FLL
const FLIGHTNO_RE = /^[A-Z]{1,3}\d{1,4}[A-Z]?$/i; // AA3002
const CONF_RE = /^[A-Z0-9]{4,}$/i; // HQQ79F, GEUZAB
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toIso(mdToken: string, showYear: number): string | null {
  const m = mdToken.match(DATE_RE);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${showYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatFlightDate(iso: string): string {
  const [, mm, dd] = iso.split("-");
  const mi = Number(mm) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${Number(dd)}` : iso;
}

type SegFields = Omit<FlightSegment, "raw" | "structured">;

function parsePart(tokens: string[], showYear: number): { fields: SegFields; hasDate: boolean; techShaped: boolean; dateIdx: number } {
  const empty: SegFields = { date: null, dateRaw: null, flightNo: null, airline: null, origin: null, dest: null, depTime: null, arrTime: null, conf: null };
  const dateIdx = tokens.findIndex((t) => DATE_RE.test(t));
  if (dateIdx === -1) return { fields: empty, hasDate: false, techShaped: false, dateIdx: -1 };

  const dateRaw = tokens[dateIdx]!;
  const date = toIso(dateRaw, showYear);

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
    if (lastTimeIdx !== -1 && tokens.length - 1 > lastTimeIdx && CONF_RE.test(last) && !TIME_RE.test(last)) {
      conf = last.toUpperCase();
    }
  } else {
    const after = tokens[dateIdx + 1];
    if (after && FLIGHTNO_RE.test(after)) flightNo = after.toUpperCase();
  }

  return { fields: { date, dateRaw, flightNo, airline, origin, dest, depTime, arrTime, conf }, hasDate: true, techShaped, dateIdx };
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

  parts.forEach((part, idx) => {
    const tokens = part.split(/\s+/);
    const { fields, hasDate, techShaped, dateIdx } = parsePart(tokens, showYear);
    if (!hasDate) {
      segments.push({ raw: part, structured: false, date: null, dateRaw: null, flightNo: null, airline: null, origin: null, dest: null, depTime: null, arrTime: null, conf: null });
      return;
    }
    // Itinerary-level confirmation: leading tokens before the date in the FIRST part,
    // ONLY when that part is TRAVEL-shaped (route after date) — TECH leading tokens are route+airline.
    if (idx === 0 && !techShaped && dateIdx > 0) {
      const lead = tokens.slice(0, dateIdx).join(" ").trim();
      confirmation = lead.length > 0 ? lead : null;
    }
    segments.push({ raw: part, structured: true, ...fields });
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
```

- [ ] **Step 4: Run to verify all pass**

Run: `pnpm vitest run tests/crew/flightDisplay.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Negative-regression proof**

Back up (`cp lib/crew/flightDisplay.ts /tmp/fd.bak`), then mutate the format-detection (`const techShaped = routeStart !== -1 && routeStart < dateIdx;` → `... > dateIdx;`) and re-run:

Run: `pnpm vitest run tests/crew/flightDisplay.test.ts -t "TECH format"`
Expected: **FAIL** — TECH legs misclassify (airline/conf lost), proving the route-vs-date detection is load-bearing. Then mutate the date range guard (`month > 12` → `month > 99`) and run the `13/40` test → it should FAIL (impossible ISO emitted). Restore (`cp /tmp/fd.bak lib/crew/flightDisplay.ts && rm /tmp/fd.bak`), re-run full file → PASS. (Grep-confirm each mutation applied before trusting the RED.)

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add lib/crew/flightDisplay.ts tests/crew/flightDisplay.test.ts
git commit -m "feat(crew-page): pure flight-display helper (both-format classification)"
```

---

### Task 2: Rework the "Your flight" card (`TravelSection.tsx`)

**Files:**
- Modify: `components/crew/sections/TravelSection.tsx`
- Test: `tests/components/crew/sections/TravelSection.flight.test.tsx`

**Interfaces:**
- Consumes: Task 1's helper; `data.viewerFlightInfo`, `data.show.dates`, the `today: Date` prop, `todayIsoInShowTimezone` (`lib/visibility/packList.ts:102`).
- Produces: structured flight rows under `data-testid="travel-flight"` with per-segment `data-testid="travel-flight-seg"`; emphasis chip `data-testid="flight-next-chip"`.

- [ ] **Step 1: Write/expand the failing render tests**

Replace the existing TECH-string assertions and add cases in `tests/components/crew/sections/TravelSection.flight.test.tsx` (keep the `renderTravel`/`baseData` harness; `TODAY = new Date("2024-05-13T12:00:00Z")`):

```ts
it("TECH leg renders EVERY structured field: date label, route EWR→FLL, airline, times, conf", () => {
  const flight = "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
  // baseData's show must yield showYear 2024 to match TODAY; override its dates.
  const { getByTestId } = renderTravel(
    baseData({ viewerFlightInfo: flight, show: { dates: { travelIn: "2024-05-13" } } as never }),
  );
  const segs = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-seg");
  expect(segs).toHaveLength(2);
  // Literal visible-field assertions derived from the fixture (catches omitted JSX, Findings 1+2):
  expect(segs[0]).toHaveTextContent("May 13"); // formatFlightDate("2024-05-13")
  expect(segs[0]).toHaveTextContent("EWR → FLL"); // route glyph
  expect(segs[0]).toHaveTextContent("UNITED");
  expect(segs[0]).toHaveTextContent("11:29am");
  expect(segs[0]).toHaveTextContent("2:34pm");
  expect(segs[0]).toHaveTextContent("HQQ79F");
  expect(segs[1]).toHaveTextContent("JET BLUE");
});

it("TRAVEL leg renders EVERY structured field: date label, flightNo, route, times; conf once", () => {
  const flight = "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
  const { getByTestId, getAllByText } = renderTravel(
    baseData({ viewerFlightInfo: flight, show: { dates: { travelIn: "2026-03-22" } } as never }),
  );
  const seg0 = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-seg")[0]!;
  expect(seg0).toHaveTextContent("Mar 22"); // formatFlightDate("2026-03-22")
  expect(seg0).toHaveTextContent("AA3002");
  expect(seg0).toHaveTextContent("LGA → ORD");
  expect(seg0).toHaveTextContent("7:23am");
  expect(seg0).toHaveTextContent("9:15am");
  expect(getAllByText(/GEUZAB/).length).toBe(1); // itinerary confirmation shown once
});
```

(Note: the `"EWR → ORD".replace(...)` above is just to avoid a literal-arrow lint quirk in this doc; in the test write `expect(segs[0]).toHaveTextContent("EWR → FLL");` directly.)

it("emphasizes the today/next segment", () => {
  // TODAY = 2024-05-13 → first TECH leg is 'today'
  const flight = "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
  const { getByTestId } = renderTravel(baseData({ viewerFlightInfo: flight }));
  expect(getByTestId("flight-next-chip")).toHaveTextContent(/Today/i);
});

it("a no-date leg falls back to a raw line", () => {
  const { getByTestId } = renderTravel(baseData({ viewerFlightInfo: "UNKNOWN FLIGHT INFO NO DATE" }));
  expect(getByTestId("travel-flight")).toHaveTextContent("UNKNOWN FLIGHT INFO NO DATE");
});

it("empty/sentinel → card omitted", () => {
  const { queryByTestId } = renderTravel(baseData({ viewerFlightInfo: "TBD" }));
  expect(queryByTestId("travel-flight")).toBeNull();
});
```

Add `import { parseFlightItinerary } from "@/lib/crew/flightDisplay";` to the test. Remove the two old TECH-as-raw-`travel-flight-leg` tests (lines ~25-50) — those legs now render structured.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/crew/sections/TravelSection.flight.test.tsx`
Expected: FAIL — `travel-flight-seg` / `flight-next-chip` not found (card not yet reworked).

- [ ] **Step 3: Rework the card**

In `components/crew/sections/TravelSection.tsx`, inside the render callback (where `data`, `today` are in scope), replace the `flightLegs` derivation (~line 264) and the "Your flight" card body (~line 480-505):

```tsx
// derive structured segments (pure; no DB/projection change)
const showYear = Number(
  (data.show.dates.travelIn ?? data.show.dates.showDays[0] ?? data.show.dates.travelOut ?? "")
    .slice(0, 4),
) || Number(todayIsoInShowTimezone(data.show, today).slice(0, 4));
const itinerary = parseFlightItinerary(data.viewerFlightInfo, showYear);
const flightSegments = sortSegmentsByDate(itinerary.segments);
const showFlight = flightSegments.length > 0;
const todayIso = todayIsoInShowTimezone(data.show, today);
const nextIdx = pickUpcomingIndex(flightSegments, todayIso);
```

(`allHidden` keeps keying off `showFlight`.) The "Your flight" `SectionCard` body becomes a map over `flightSegments`, each a `data-testid="travel-flight-seg"` row:

```tsx
<div data-testid="travel-flight" className="flex flex-col gap-2">
  {flightSegments.map((seg, i) => (
    <div
      key={i}
      data-testid="travel-flight-seg"
      className={
        i === nextIdx
          ? "rounded-[10px] border-l-2 border-accent bg-surface-sunken/40 px-3 py-2"
          : "px-3 py-2"
      }
    >
      {seg.structured ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase leading-none tracking-eyebrow text-text-faint">
            {seg.date ? formatFlightDate(seg.date) : (seg.dateRaw ?? "")}
            {i === nextIdx ? (
              <span data-testid="flight-next-chip" className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                {seg.date === todayIso ? "Today" : "Next"}
              </span>
            ) : null}
          </p>
          <p className="text-sm/relaxed text-text tabular-nums">
            {(seg.flightNo ?? seg.airline) ? `${seg.flightNo ?? seg.airline} · ` : ""}
            {seg.origin && seg.dest ? `${seg.origin} → ${seg.dest}` : (seg.origin ?? seg.dest ?? "")}
          </p>
          {seg.depTime && seg.arrTime ? (
            <p className="text-sm/relaxed text-text-subtle tabular-nums">{seg.depTime} – {seg.arrTime}</p>
          ) : null}
          {seg.conf ? <p className="text-xs text-text-faint tabular-nums">Conf {seg.conf}</p> : null}
        </div>
      ) : (
        <span data-testid="travel-flight-leg" className="text-sm/relaxed text-text tabular-nums">{seg.raw}</span>
      )}
    </div>
  ))}
  {itinerary.confirmation ? (
    <p className="text-xs text-text-faint tabular-nums">Confirmation {itinerary.confirmation}</p>
  ) : null}
</div>
```

Add to the imports at the top of `TravelSection.tsx`:
```tsx
import { parseFlightItinerary, sortSegmentsByDate, pickUpcomingIndex, formatFlightDate } from "@/lib/crew/flightDisplay";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
```
(If `todayIsoInShowTimezone` is already imported, don't duplicate.) Remove the now-dead `flightLegs`/`stripAgendaUrls` per-leg block if it's no longer referenced elsewhere (the helper now owns `stripAgendaUrls`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/components/crew/sections/TravelSection.flight.test.tsx`
Expected: PASS (all flight-card cases).

- [ ] **Step 5: Full crew + typecheck regression**

Run: `pnpm vitest run tests/components/crew/ tests/crew/ && pnpm tsc --noEmit`
Expected: PASS (no other crew test regressed; the card visibility gate is preserved).

- [ ] **Step 6: Commit**

```bash
git add components/crew/sections/TravelSection.tsx tests/components/crew/sections/TravelSection.flight.test.tsx
git commit -m "feat(crew-page): structured flight card — fields, next/today emphasis, both formats"
```

---

### Task 3: Self-review
- [ ] Spec coverage: every §3 helper behavior + §5 render element has a test. No DB/parser/projection edit (`git diff --stat origin/main...HEAD` touches only `lib/crew/flightDisplay.ts`, `TravelSection.tsx`, the two test files, the spec, this plan).
- [ ] Grep `git diff` for accidental `getShowForViewer`/`travelFlights`/migration changes → none.
- [ ] Run `pnpm vitest run tests/crew/ tests/components/crew/` + `pnpm tsc --noEmit` green.
- [ ] Confirm card-omit behavior unchanged (empty/sentinel → no card).

### Task 4: Impeccable UI dual-gate (invariant 8)
- [ ] Run `/impeccable critique` and `/impeccable audit` on the `TravelSection.tsx` diff with the v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight). External attestation (fresh subagent), not self-attested.
- [ ] Fix HIGH/CRITICAL findings, or defer each via a `DEFERRED.md` entry. Record findings + dispositions.

### Task 5: Adversarial review (cross-model) + execution handoff
- [ ] Codex `adversarial-review` on the whole diff (REVIEWER ONLY; distinct marker; `< /dev/null`; background) → APPROVE. Preempt: derived/no-DB Approach A; both-format classification by route-vs-date position; `structured:false` raw fallback only for no-date legs; conf model (itinerary `confirmation` TRAVEL vs per-segment `conf` TECH); no new warnings; UI through impeccable.
- [ ] Push, real CI green, `gh pr merge --merge`, ff local `main` (verify `rev-list --left-right --count main...origin/main` == `0 0`), clean worktree, update memory.

---

## Self-Review (plan author)

**Spec coverage:** §3 helper (parse/sort/pick/format, both formats, guards) = Task 1; §4 smart behavior + §5 render = Task 2; §7 tests across both; §7.1 meta-test "none" honored; §8 impeccable = Task 4. ✅

**Placeholder scan:** No TBD/TODO; full helper code + full render JSX shown. ✅

**Type consistency:** `FlightSegment`/`FlightItinerary` + `parseFlightItinerary`/`sortSegmentsByDate`/`pickUpcomingIndex`/`formatFlightDate` defined in Task 1, consumed verbatim in Task 2. `dateRaw` added (fulfils spec §5 raw-M/D fallback). ✅

**Anti-tautology / failure modes:** Task 1 Step 5 mutates format-detection (TECH misclassify → RED) and date-range (impossible ISO → RED). Render tests assert against the parsed data source, not literals. Each test's failure mode: format misclassification (TECH airline/conf lost), invalid-date ISO emission, card-visibility regression, emphasis on the wrong segment, raw-fallback loss. ✅
