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
  raw: string;            // post-clean surviving display text (after stripAgendaUrls) — the fallback render, identical to today's card for this leg
  structured: boolean;    // true iff an M/D date token was found and fields extracted
  date: string | null;    // ISO yyyy-mm-dd (M/D inferred against showYear) | null
  flightNo: string | null;// TRAVEL carrier code+number, e.g. "AA3002" (null for TECH-shaped legs)
  airline: string | null; // TECH carrier name, e.g. "UNITED" / "JET BLUE" (null for TRAVEL-shaped legs)
  origin: string | null;  // e.g. "LGA" / "EWR"
  dest: string | null;    // e.g. "ORD" / "FLL"
  depTime: string | null; // e.g. "7:23am" / "11:29am"
  arrTime: string | null; // e.g. "9:15am" / "2:34pm"
  conf: string | null;    // per-segment TRAILING confirmation (TECH, e.g. "HQQ79F"); null when conf is itinerary-level (TRAVEL)
};
// confirmation = itinerary-level LEADING confirmation (TRAVEL, e.g. "GEUZAB"); null for TECH (whose conf is per-segment).
export type FlightItinerary = { confirmation: string | null; segments: FlightSegment[] };

export function parseFlightItinerary(flightInfo: string | null, showYear: number): FlightItinerary;
export function pickUpcomingIndex(segments: FlightSegment[], todayIso: string): number | null;
```

### 3.1 `parseFlightItinerary`

**Input contract.** The helper consumes the **normalized** `flight_info` string as it reaches `viewerFlightInfo`, *not* the raw sheet cell. The TRAVEL parser's `normalizeTravelCell` (`travelFlights.ts:19-32`) already splits legs at `M/D` date tokens and joins them with `" | "`, so the real RPAS string is `GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am` (the raw fixture cell at `2026-03-rpas:659` shows the *pre*-normalized form without the pipe). **The helper does not depend on the pipe being present** — it re-detects legs at `M/D` date tokens (step 4), exactly as the parser does, so it is correct for piped TRAVEL data, the no-pipe raw form, and any future variant.

1. **Guard:** `flightInfo` null/empty/whitespace → `{ confirmation: null, segments: [] }`.
2. **Pre-clean per part** exactly as the current card does, so display behavior is preserved: split on `/\s*\|\s*|\n/`, `stripAgendaUrls` each part (`lib/visibility/agendaUrls.ts:35`), drop parts that are empty or `shouldHideGenericOptional` (`lib/visibility/emptyState.ts:75`) — `TBD`/`N/A`/`TBA`/`""` removed. The **pipe-part boundary is retained** (an unstructured TECH `"arrival | departure"` must stay two display rows, never merge).
3. **Segment detection within each surviving part** (by `M/D` date token `/^\d{1,2}\/\d{1,2}$/`):
   - A part with **0 date tokens** → exactly **one** `structured: false` segment whose `raw` = the cleaned part (covers TECH raw + garbage; preserves today's per-pipe-part rows).
   - A part with **≥1 date tokens** → **one structured segment per date token**: each segment spans `[date_i, date_{i+1})`. (For real piped data each part has exactly one date → one segment; this rule only matters for an un-normalized multi-date part.)
4. **Per-structured-segment field extraction.** Each segment is one of two real layouts (verified against fixtures): **TRAVEL** `[conf] M/D FLIGHT# ORIG - DEST DEP - ARR` (route AFTER the date) and **TECH** `ROUTE AIRLINE M/D - DEP - ARR CONF` (route BEFORE the date). Extract by token type, **scanning all tokens** (do NOT stop at the first `-` for both route and times — each pattern finds its own dash):
   - **Common (both formats):**
     - `date` = the `M/D` token → ISO against `showYear` (§3.2).
     - `origin` / `dest` = the route, accepted in EITHER encoding: a single token `/^[A-Z]{3}-[A-Z]{3}$/i` (TECH `EWR-FLL`) **or** an ordered pair of `/^[A-Z]{3}$/i` tokens separated by a `-` token (TRAVEL `LGA - ORD`). First occurrence wins; else null/null.
     - `depTime` / `arrTime` = the first ordered pair of time tokens (`/^\d{1,2}:\d{2}\s*(am|pm)$/i`) separated by a `-` token, else null/null.
   - **Format detection by route-vs-date position** (let `di` = date index, `ri` = route start index; if no route, treat as TRAVEL-shaped):
     - **TECH-shaped (`ri < di`, route before date):**
       - `airline` = the tokens strictly between the route and the date, space-joined (e.g. `UNITED`, `JET BLUE`), else null. `flightNo` = null.
       - `conf` (per-segment) = the **last** token of the segment **after** the arrival time, if it matches `/^[A-Z0-9]{4,}$/i` and is not itself a time/route/date, else null (e.g. `HQQ79F`, `OSUULZ`).
     - **TRAVEL-shaped (`ri > di` or no route):**
       - `flightNo` = the token **immediately after the date** if it matches `/^[A-Z]{1,3}\d{1,4}[A-Z]?$/i` (airline+number; airport codes have no digit so never match), else null. `airline` = null.
       - `conf` (per-segment) = null (TRAVEL conf is itinerary-level, step 5).
   - Every field independent + best-effort: a missing field is null and never blocks the others. A structured segment with some null fields still renders with the present fields.
5. **Itinerary-level confirmation (TRAVEL only):** the whitespace tokens **before the very first date token of the whole itinerary** that are NOT part of a route (i.e. the first part is TRAVEL-shaped — route after date) → `confirmation` (space-joined, e.g. `GEUZAB`). If the first segment is TECH-shaped (route before date) or the itinerary starts at a date / has no date, `confirmation = null` (TECH confs live per-segment in `conf`).
6. Returns the itinerary; **source order preserved** (sorting is a render concern, §4).

### 3.2 Date inference

`showYear` is derived by the **caller** from `data.show.dates` — the 4-digit year of the first available ISO date (`travelIn ?? showDays[0] ?? travelOut`, each `yyyy-mm-dd`). If none is present, the caller falls back to the year of the **show-timezone today** (`todayIsoInShowTimezone(data.show, today)`.slice(0,4)), NOT server-local `new Date().getFullYear()` — so a Dec/Jan server-vs-show-timezone boundary can't shift inferred flight dates.

`parseFlightItinerary` maps a valid `M/D` token → `${showYear}-${MM}-${DD}` (zero-padded). **Range validation:** the month must be `1–12` and the day `1–31`; an out-of-range token (e.g. `13/40`) yields `date: null` while the segment stays `structured: true` and the raw `M/D` token is shown (§5). No calendar-aware day-per-month or leap check in v1 (a shaped-but-impossible date is rare operator error; null + raw fallback is safe). No cross-year rollover handling in v1 (a Dec leg on a Jan show uses the show year — acceptable, documented limitation).

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
- **Primary line:** the **carrier** (`flightNo` for TRAVEL, e.g. `AA3002`; `airline` for TECH, e.g. `UNITED` — whichever is non-null) · route `origin → dest` (with a `→` glyph), `tabular-nums`. If both carrier fields are null, render just the route; if route is null, just the carrier.
- **Meta line:** `depTime – arrTime` (en dash), `tabular-nums`.
- **Confirmation:** the itinerary-level `confirmation` (TRAVEL) shown **once** as a card-footer chip; a per-segment `conf` (TECH) shown **inline on its segment row** (the `conf` slot). When every TECH segment shares the same `conf`, it may be collapsed to one footer chip (render nicety, not required).
- **Unstructured segment (`structured: false`):** renders its `raw` string exactly as today (plain `tabular-nums` line) — zero regression for garbage/no-date legs.
- **Emphasized segment:** a small **"Today"/"Next" chip** + accent left-border / surface tint.

### 5.1 Guard conditions (every input state)
- `viewerFlightInfo` null/empty → no card (unchanged).
- All legs sentinel/empty/URL-only → no card (unchanged, `showFlight === false`).
- Mixed structured + unstructured legs → structured render the structured ones, raw-render the rest, in one card.
- `structured: true` but every field null except date → renders just the date row (no crash, no empty primary).
- **Out-of-range date token** (e.g. `13/40`) → `date: null`, segment stays `structured: true`, the raw `M/D` token renders as the date label; the segment is never picked as next/today (null date), never produces an impossible ISO.
- `showYear` underivable → caller passes the **show-timezone today's** year (§3.2); dates still infer (possibly the wrong year for a cross-year itinerary) but never null-crash; emphasis still computes.
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

- **Helper unit tests** (`tests/crew/flightDisplay.test.ts`, new). Inputs are the **normalized (piped) `flight_info`** strings the parser actually produces (derive them by running the real fixture cell through `normalizeTravelCell`, or assert the exact piped literal), not the raw pre-normalized fixture cell:
  - **TRAVEL format** — RPAS normalized string (`GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am`): 2 structured segments with exact `date`/`flightNo` (`AA3002`,`AA2723`)/`origin`/`dest`/`depTime`/`arrTime`; `airline === null`, segment `conf === null`; itinerary `confirmation === "GEUZAB"`. FinTech string (no conf) → `confirmation === null`. **Values derived from the fixture string.**
  - **TECH format** — real East Coast leg (`EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ`): 2 structured segments with `origin/dest` from the `XXX-XXX` token (`EWR`/`FLL`, `FLL`/`EWR`), `airline` (`UNITED`, `JET BLUE`), `flightNo === null`, per-segment `conf` (`HQQ79F`,`OSUULZ`); itinerary `confirmation === null`. Carl Fenton same-conf-both-legs case → both segments `conf === "CGTTLO"`.
  - **Format detection** — a segment with route BEFORE the date is TECH-classified (airline + trailing conf); route AFTER the date is TRAVEL-classified (flightNo + leading itinerary conf). Assert the classifier picks the right branch for each fixture.
  - **No-pipe robustness:** the same RPAS leg content with the pipe removed (one run-on part, two `M/D` dates) → still 2 structured segments (date-token detection doesn't depend on the pipe — Finding 1).
  - Guards: null/empty/whitespace → empty; sentinel-only → empty (parts dropped); a no-date part → `structured: false`, `raw` preserved; missing carrier/airports/times → that field null, others intact; out-of-range date `13/40` → `date: null` + `structured: true`.
  - `pickUpcomingIndex`: today match, next-upcoming, all-past → null, null-date skipped.
  - **Negative-regression:** mutate the date regex / conf extraction and confirm the corresponding assertion goes RED (helper isn't tautological).
- **Render tests** (`tests/components/crew/sections/TravelSection.flight.test.tsx`, **update** — the existing tests use TECH-format strings that now render *structured* (no longer raw `travel-flight-leg` spans), so their assertions are rewritten to the new structured rows):
  - TRAVEL + TECH structured card each render date/carrier/route/times as distinct elements (assert against the parsed data source per anti-tautology, not just text scan).
  - Emphasis chip on the correct segment for a given `today`; "Today" vs "Next" label.
  - A genuinely-unstructured leg (no date) → raw fallback line preserved.
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
