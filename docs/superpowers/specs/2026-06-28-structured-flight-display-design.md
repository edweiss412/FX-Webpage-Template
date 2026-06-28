# Structured flight display — design spec

**Status:** design (autonomous-ship approved 2026-06-28)
**Owner goal:** Turn the crew "Your flight" card from raw run-on leg strings into **structured, scannable flight segments** (date · flight # · route · times · confirmation), with **render-time smart behavior** (highlight the next/today flight, sort by date).

## 1. Scope

**In scope**
- A pure, unit-tested helper that derives structured flight segments from the existing `flight_info` string.
- A reworked "Your flight" card rendering each segment as distinct fields.
- Render-time next/today emphasis + date sort.

**Out of scope (explicit — do not relitigate)**
- **No DB change / no migration / no new column.** Structure is *derived per render* from the existing `crew_members.flight_info` string (`lib/parser/types.ts:85`). The shipped TRAVEL-tab parser (`lib/parser/blocks/travelFlights.ts`, PR #47) and TECH-block parser (`lib/parser/blocks/crew.ts:224`) are **unchanged**.
- **No passenger manifest / multi-crew-per-flight.** Real sheets only ever have one flyer per show; grouping is speculative. `flight_info` stays one itinerary per viewer.
- **No booking-status.** The sibling `FLIGHT BOOKED` / `OK to BOOK?` columns remain unparsed.
- **No `getShowForViewer` / projection change.** `TravelSection` already receives everything needed (`today` prop, `data.show`, `data.viewerFlightInfo`).

## 2. Data the helper consumes

`flight_info` reaches the component as `data.viewerFlightInfo: string | null` (`lib/data/getShowForViewer.ts:224,304-305,732`). Both flight sources write the **same `" | "`-delimited** shape, but with different per-leg internal structure:

- **TRAVEL-tab** (`travelFlights.ts:31`, normalized): a leading confirmation code, then legs — e.g.
  `GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am`
  (fixture `2026-03-rpas-central-four-seasons.md:659`). FinTech variant has **no conf** (`5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 ...`, `2026-05-fintech-forum-cto-summit.md:719`).
- **TECH-block** (`crew.ts:224-225`): `"<arrival raw> | <departure raw>"` — raw cell text, **less structured**.

The helper must parse the TRAVEL shape into fields **and** degrade gracefully on any part it can't structure (TECH raw, garbage, sentinels) — never throw, never drop a leg.

## 3. The helper — `lib/crew/flightDisplay.ts` (new, pure)

Mirrors the existing `lib/crew/agendaDisplay.ts` presentation-derivation pattern.

```ts
export type FlightSegment = {
  raw: string;            // the original part text (verbatim) — the fallback render
  structured: boolean;    // true iff a leading M/D date token was found and fields extracted
  date: string | null;    // ISO yyyy-mm-dd (M/D inferred against showYear) | null
  flightNo: string | null;// e.g. "AA3002"
  origin: string | null;  // e.g. "LGA"
  dest: string | null;    // e.g. "ORD"
  depTime: string | null; // e.g. "7:23am"
  arrTime: string | null; // e.g. "9:15am"
};
export type FlightItinerary = { confirmation: string | null; segments: FlightSegment[] };

export function parseFlightItinerary(flightInfo: string | null, showYear: number): FlightItinerary;
export function pickUpcomingIndex(segments: FlightSegment[], todayIso: string): number | null;
```

### 3.1 `parseFlightItinerary`

1. **Guard:** `flightInfo` null/empty/whitespace → `{ confirmation: null, segments: [] }`.
2. **Pre-clean each part** exactly as the current card does, so behavior is preserved: split on `/\s*\|\s*|\n/`, `stripAgendaUrls` each part (`lib/visibility/agendaUrls.ts:35`), drop parts that are empty or `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:75`) — i.e. `TBD`/`N/A`/`TBA`/`""` legs are removed. (This preserves the shipped sentinel/URL handling; the structuring is layered on top of the *surviving* parts.)
3. **Confirmation extraction (once):** in the **first surviving part only**, tokens (whitespace-split) before the first `M/D` date token (`/^\d{1,2}\/\d{1,2}$/`) are the confirmation code (joined with a space). `confirmation = null` if the first token is already a date or no date token exists. Confirmation is **itinerary-level**, shown once — never per-segment.
4. **Per-part field extraction.** For each surviving part, locate the first `M/D` date token:
   - **No date token →** `structured: false`, all fields null, `raw` = the part. (Covers TECH raw + garbage.)
   - **Date token found →** `structured: true`. From the date token onward (after conf removal in part 0):
     - `date` = the M/D token, inferred to ISO against `showYear` (see §3.2).
     - `flightNo` = first subsequent token matching `/^[A-Z]{1,3}\d{1,4}[A-Z]?$/i` (airline + number), else null.
     - `origin` / `dest` = the first pair of 3-letter codes (`/^[A-Z]{3}$/i`) surrounding a `-` token, else null/null.
     - `depTime` / `arrTime` = the first pair of time tokens (`/^\d{1,2}:\d{2}\s*(am|pm)$/i`, tolerant of an attached am/pm) surrounding a `-` token, else null/null.
   - Every field is extracted **independently and best-effort** — a missing field is null and never blocks the others. A `structured: true` part with some null fields still renders structured (with the present fields).
5. Returns the itinerary. **Order preserved** from the source (sorting is a render concern, §4).

### 3.2 Date inference

`showYear` is derived by the **caller** from `data.show.dates` — the year of the first available ISO date (`travelIn ?? showDays[0] ?? travelOut`); if none, the caller passes the current year. `parseFlightItinerary` maps `M/D` → `${showYear}-${MM}-${DD}` (zero-padded). No cross-year rollover handling in v1 (a Dec leg on a Jan show uses the show year — acceptable, documented limitation).

### 3.3 `pickUpcomingIndex(segments, todayIso)`

Returns the index of the single segment to emphasize, or null:
- The first segment whose `date === todayIso` ("today"), else
- the first segment (in source order) whose `date >= todayIso` ("next upcoming"), else
- `null` (all dates past, or no dated segments).

Uses `compareIso` (`lib/time/isoDate.ts:7`; ISO dates also sort lexically). Segments with `date: null` are never picked.

## 4. Smart behavior (component-side, render-time)

`TravelSection` (`components/crew/sections/TravelSection.tsx`) receives `today: Date` (`_CrewShell.tsx:294`). Compute `todayIso = todayIsoInShowTimezone(data.show, today)` (`lib/visibility/packList.ts:102`).

- **Parse:** `const { confirmation, segments } = parseFlightItinerary(data.viewerFlightInfo, showYear)`.
- **Sort:** render segments **sorted by `date` ascending, stable, `null` dates last** (real data is already chronological, so this is a no-op there; it just makes out-of-order input read correctly). Sorting happens on a copy; `pickUpcomingIndex` runs on the **sorted** array so the emphasized index matches the rendered order.
- **Emphasis:** `pickUpcomingIndex(sorted, todayIso)` → the emphasized segment gets a **"Today"/"Next" chip + accent border**; "Today" label when `date === todayIso`, else "Next".

## 5. Render — reworked "Your flight" card

Replaces the current plain-`<span>`-per-leg block (`TravelSection.tsx:490-505`). Card visibility is **unchanged**: shown iff ≥1 surviving leg; `TBD`/`N/A`/empty still omit the whole card (`showFlight` gate preserved — it now keys off `segments.length > 0`).

Each segment renders as a row (reusing the `TravelRow` `mode="flight"` shape — `label`/`primary`/`meta`/`conf` slots already exist, `TravelSection.tsx:79-93`), OR a purpose-built structured row, carrying:
- **Date** (eyebrow/label) — friendly form derived from the ISO (e.g. `Mar 22`); falls back to the raw `M/D` if `date` is null.
- **Primary line:** `flightNo` · route `origin → dest` (with a `→` glyph), `tabular-nums`.
- **Meta line:** `depTime – arrTime` (en dash), `tabular-nums`.
- **Confirmation:** shown **once** for the itinerary (e.g. a footer chip on the card), not per segment.
- **Unstructured segment (`structured: false`):** renders its `raw` string exactly as today (plain `tabular-nums` line) — zero regression for TECH/garbage legs.
- **Emphasized segment:** a small **"Today"/"Next" chip** + accent left-border / surface tint.

### 5.1 Guard conditions (every input state)
- `viewerFlightInfo` null/empty → no card (unchanged).
- All legs sentinel/empty/URL-only → no card (unchanged, `showFlight === false`).
- Mixed structured + unstructured legs → structured render the structured ones, raw-render the rest, in one card.
- `structured: true` but every field null except date → renders just the date row (no crash, no empty primary).
- `showYear` underivable → caller passes current year; dates still infer (possibly wrong year) but never null-crash; emphasis still computes.
- No segment `>= todayIso` → no emphasis chip (all-past itinerary renders plainly).

### 5.1.1 Cap / list length
The segment list is unbounded in principle but small in practice (typical 2–4 legs; round-trip = 2). **No truncation/cap** — every surviving segment renders, in a content-height vertical list. If an itinerary ever had many legs the card simply grows; that is acceptable (mirrors the current per-leg list).

### 5.1.2 Transition inventory
The card is a **static, per-request server render** — there are **no mode toggles, no client state, and no animations**. The emphasis chip and accent are static styling applied at render time. Therefore **no transition inventory is required** (no N×(N-1)/2 state-pair table, no `AnimatePresence`/ternary-exit audit) — there are no interactive visual-state transitions in this card.

### 5.2 Dimensional invariants
The flight rows live in the existing `data-testid="travel-flight"` flex column inside the "Your flight" `SectionCard`. No fixed-height parent is introduced; rows are content-height. The icon square keeps the established `size-8.5` / `[&_svg]:size-4.25` (`TravelSection.tsx:101-107`). Per **Tailwind-v4 no-default-`items-stretch`**, any new flex row that must align children states its alignment explicitly. (A real-browser layout assertion is only required if a fixed-dimension parent is introduced; this card is content-height, so a jsdom render test on field presence + a Playwright check on the chip/route glyph suffice.)

## 6. Error handling
The helper is **total** (never throws): every branch returns a `FlightSegment` (structured or raw-fallback). No new `flight_info` parse warnings are emitted — `flight_info` was already validated/warned at sheet-parse time (the three `TRAVEL_FLIGHT_*` codes, `catalog.ts:2894-2931`); display derivation is non-failing by construction.

## 7. Testing

- **Helper unit tests** (`tests/crew/flightDisplay.test.ts`, new):
  - RPAS fixture string (with conf `GEUZAB`, 2 legs) → 2 structured segments with exact `date`/`flightNo`/`origin`/`dest`/`depTime`/`arrTime`; `confirmation === "GEUZAB"`. **Values derived from the fixture string**, not hardcoded magic.
  - FinTech fixture string (no conf) → `confirmation === null`, 2 structured segments.
  - TECH-shaped raw part → `structured: false`, `raw` preserved.
  - Guards: null/empty/whitespace → empty; sentinel-only → empty (parts dropped); missing flightNo/airports/times → that field null, others intact; no-date part → unstructured.
  - `pickUpcomingIndex`: today match, next-upcoming, all-past → null, null-date skipped.
  - **Negative-regression:** mutate the date regex / conf extraction and confirm the corresponding assertion goes RED (helper isn't tautological).
- **Render tests** (`tests/components/crew/sections/TravelSection.flight.test.tsx`, extend):
  - Structured card renders date/flightNo/route/times distinct elements (assert against the parsed data source per anti-tautology, not just text scan).
  - Emphasis chip on the correct segment for a given `today`; "Today" vs "Next" label.
  - Unstructured leg → raw fallback line.
  - Empty/sentinel → card omitted (regression of the shipped behavior).
- **Existing flight tests stay green** (`tests/parser/travelFlights.test.ts`, `tests/data/getShowForViewerFlight.test.ts`) — the parser + projection are untouched.

## 7.1 Meta-test inventory
This milestone **creates no new structural meta-test and extends none**. Rationale: it adds no Supabase call boundary, no DB write, no admin-alert catalog row, no advisory-lock surface, and no inline email normalization. The sentinel-hiding contract (`tests/components/tiles/_metaSentinelHidingContract.test.ts`) does **not** enumerate the flight card today and stays unaffected — the flight legs continue to route through `shouldHideGenericOptional` in the unchanged pre-clean step (§3.1 step 2), so the existing sentinel behavior is preserved, not relocated. Declared explicitly per the writing-plans meta-test-inventory rule.

## 8. UI quality gate
This is a UI surface (`components/crew/sections/TravelSection.tsx`) → **invariant 8**: `/impeccable critique` + `/impeccable audit` on the diff, HIGH/CRITICAL fixed or `DEFERRED.md`'d, before milestone close. Impeccable v3 (not `frontend-design`) per the routing rule.

## 9. Existing-code citations (verified live)
- `flight_info: string | null` — `lib/parser/types.ts:85`.
- `viewerFlightInfo` projection — `lib/data/getShowForViewer.ts:224,304-305,732` (own-row, not `namesRefer`; presentation-lean, not a security boundary).
- Current flight render (plain spans) — `components/crew/sections/TravelSection.tsx:490-505`; pre-clean (`split`/`stripAgendaUrls`/`shouldHideGenericOptional`) at `:264-268`.
- `TravelRow` flight mode + slots — `TravelSection.tsx:79-93,101-107`.
- `today` prop into `TravelSection` — `app/show/[slug]/[shareToken]/_CrewShell.tsx:294`.
- `todayIsoInShowTimezone(show, today)` — `lib/visibility/packList.ts:102`.
- `stripAgendaUrls` — `lib/visibility/agendaUrls.ts:35`; `shouldHideGenericOptional` — `lib/visibility/emptyState.ts:75`.
- TRAVEL normalized format — `travelFlights.ts:19-32`; TECH format — `crew.ts:224-225`.
- Fixture strings — `2026-03-rpas-central-four-seasons.md:659`, `2026-05-fintech-forum-cto-summit.md:719`.

## 10. Watchpoints (pre-load the reviewer)
- **Derived-not-persisted is intentional** (owner-approved Approach A): no DB column, no parser change. The flat string round-trips fine; structuring is a presentation concern.
- **`structured: false` raw fallback is a feature, not a gap** — TECH-format and any unparseable leg must render exactly as today (no regression).
- **No new warnings** — display derivation is total; flight parse-warnings already exist at sheet-parse time.
- **Sorting is render-only + stable** — never reorders the underlying `flight_info`; a no-op on already-chronological real data.
