# Phase 3 — Sections + Budget + Gear

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Read `00-overview.md` (shared contracts + verified-facts digest) first; Phase 3 **consumes** the primitives, `RightNowHero`, `CrewShell`, `resolveActiveSection`, `selectPrimaryContact`, and `resolveKeyTimes` defined in phases 1–2 — reference them by their contract names, never redefine. This repo uses **Vitest** (`pnpm vitest run <path>`).

**Goal:** Build the seven `components/crew/sections/*Section.tsx` Server Components (`{ data, viewer }`) — Today · Schedule · Venue · Travel · Crew · Gear + conditional Budget — porting the **complete** field set of the 14 tiles they subsume (not a visual subset, wp-19), preserving every visibility gate and the Schedule date-restriction privacy contract, with the Gear scope gate→emphasis flip (D-5).

**Tech Stack:** Next.js RSC, TypeScript strict, Tailwind v4 tokens. Vitest. Each section is `<Name>Section({ data, viewer, today, showId })` — a **SYNCHRONOUS** Server Component (NO `async`/`next/headers` inside). **`showId: string` (R10-HIGH-1):** the separate `showId` prop (`ShowRow` has no `id`), threaded uniformly; **GearSection needs it** for the retained `<OpeningReelVideo showId={showId}>` player; other sections ignore it. Every section test file defines `const SHOW_ID = "show-abc";` and passes `showId={SHOW_ID}` on every render. It reads viewer `roleFlags`/restrictions off `data.crewMembers` (resolved for the viewer). **`today: Date` (R8-HIGH-1):** the raw request-scoped `Date` from `await nowDate()`, computed ONCE by `CrewShell` and passed down (a `Date`, matching `ScheduleTile`'s `today?: Date`, `:81` — NOT an ISO string). Schedule converts it via `todayIsoInShowTimezone(data.show, today)` (`lib/visibility/packList`, `:58`/`:170`) for the today-pin; Gear passes it straight to `isPackListVisibleToday({ show, restriction, today })` (`today: Date`, `packList.ts:122-127`); others ignore it. This keeps the request-scoped clock contract (frozen-clock screenshots, day-boundary correctness, §4.14) WITHOUT making sections async or calling `new Date()`/`nowDate()` inside them. **Every section test file defines `const TODAY = new Date("2026-05-14T15:00:00Z");` at the top and passes `today={TODAY}` on EVERY `render(<*Section ... />)`** (the snippets below already include `today={TODAY}` — `today: Date` is REQUIRED on the contract, so a render omitting it fails tsc; R9-HIGH). The today-pin test (Schedule test 34) and any test that exercises a specific day boundary defines its OWN boundary `Date` instead of `TODAY`; structural/privacy/cap tests use the shared `TODAY` (a show day, inert for them). Tests stay synchronous Testing-Library renders.

---

## GROUND-TRUTH FIELD REFERENCE (verified live, base `a2884c3f` — USE THESE EXACT NAMES; tsc rejects any drift)

> Every snippet below uses these names. When you write the real test, set fixtures with these names and read them with these paths. `ShowForViewer` nests `venue`/`event_details`/`coi_status` under **`show`** — they are NOT top-level.

- **`ShowForViewer`** (`lib/data/getShowForViewer.ts:94-197`) top-level: `show, crewMembers, hotelReservations, rooms, transportation, contacts, pullSheet, diagrams, openingReelHasVideo, lastSyncedAt, lastSyncStatus, tileErrors, financials?, viewerName, viewerVersionToken`.
- **`show.venue`** (`lib/parser/types.ts:87-93`) `{ name: string; address: string; loadingDock?: string|null; googleLink?: string|null; notes?: string|null } | null`. **No `coi_status`, no `timezone`, no `room`/`dock` here.**
- **`show.coi_status`** is a **top-level `ShowRow`** field (read as `data.show.coi_status`) — `ShowStatusTile` takes `Pick<ShowRow,"coi_status"|"venue"|"event_details">`.
- **`show.event_details`**: `Record<string,string>`; known keys: `dress_code` (fallbacks `"dress code"`/`dress`/`attire`, `ShowStatusTile.tsx:69`), `power` (`:95`), `internet` (`:99`), `keynote_requirements` (`:103`), `opening_reel`.
- **`HotelReservationRow`** (`:118-127`): `ordinal: number; hotel_name: string|null; hotel_address: string|null; names: string[]; confirmation_no: string|null; check_in: string|null; check_out: string|null; notes: string|null`.
- **`TransportationRow`** (`:161-171`): `driver_name; driver_phone; driver_email; vehicle; license_plate; color; parking; schedule: TransportScheduleEntry[]; notes` (all `string|null` except `schedule`). **Legs field is `schedule`, NOT `legs`.** `TransportScheduleEntry` (`:155-160`) `{ stage: string; date: string|null; time: string|null; assigned_names: string[] }`.
- **`RoomRow`** (`:130-147`): `kind: "gs"|"breakout"|"additional"; name: string; set_time/show_time/strike_time: string|null; audio/video/lighting/scenic/power/digital_signage/other: string|null; notes: string|null`. **A/V/L are SCALAR STRINGS (free text per room), NOT arrays.** `ProjectedRoomRow = RoomRow & { id: string }`.
- **`ContactRow`** (`:174-180`): `kind: "venue"|"in_house_av"; name: string|null; email: string|null; phone: string|null; notes: string|null`.
- **`crewMembers[]`** (`getShowForViewer.ts:96-119`): `{ id; name; email; phone; role; roleFlags: RoleFlag[]; dateRestriction; stageRestriction }`. `dateRestriction` (`types.ts:10-13`): `{ kind:"explicit"; days: string[] } | { kind:"unknown_asterisk"; days: null } | { kind:"none" }` — the explicit payload is **`days`**.
- **`FinancialsRow`** (`getShowForViewer.ts:67-72`): `po; proposal; invoice; invoice_notes` (all `string|null`). **No `notes` — it is `invoice_notes`.**
- **`pullSheet`** = `PullSheetCase[]`: `{ caseLabel: string; items: { qty: number|null; cat: string|null; subCat: string|null; item: string; rawSnippet?: string }[] }`.
- **`diagrams`** = `PersistedDiagrams | null`: `{ linkedFolder; embeddedImages: { snapshotPath: string|null; ... }[]; linkedFolderItems: { snapshotPath: string|null; ... }[] }`.
- **`show.dates`**: `{ travelIn; set; showDays: string[]; travelOut; loadIn? }`. **`show.agenda_links`**: `{ label; fileId?; url? }[]`.
- **Timezone (RESOLVED):** `resolveShowTimezone(venue: VenueWithTz)` (`lib/time/showTimezone.ts:24`) takes the **venue object** (`VenueWithTz = { timezone?: string|null; [field]: unknown } | null`, index-signature so `data.show.venue` is assignable even though no row populates `timezone` yet → it returns `DEFAULT_SHOW_TIMEZONE = "America/New_York"` today). ScheduleSection does NOT call it directly — it uses `todayIsoInShowTimezone(data.show, today)` (`lib/visibility/packList`, `:58`/`:170` — the exact helper `ScheduleTile` uses), which resolves the tz from `show.venue` internally. Pass `data.show` + the `today: Date` prop; no `venue.timezone` field access.

**Anti-tautology rules (every test below):** (a) assert against the **fixture field**, not the rendered container; (b) when scanning the DOM for a label another block also renders (a contact name in both Today "Need something" and Crew), **clone the tree and remove the sibling block** before scanning; (c) derive every expected count/value from the fixture; (d) each test states its concrete `_Catches:_` failure mode. Use the project's existing `ShowForViewer` fixture builder — grep `tests/` for the canonical one (e.g. `tests/fixtures/` or an inline `makeShowForViewer` helper) and set `show: { venue, event_details, coi_status, dates }` through it; do NOT hand-roll a partial object that bypasses excess-property checks.

---

### Task 0: Create the typed `makeShowForViewer` fixture builder (R5-MEDIUM-3 — it does not exist yet)

**Files:** Create `tests/fixtures/showForViewer.ts`; Test `tests/fixtures/showForViewer.test.ts`.

> Every section test below imports `makeShowForViewer` and the anti-tautology rule forbids hand-rolled partial objects (excess-property drift bypasses tsc). **No such helper exists in the repo** (grep-confirmed) — build it FIRST so the section tests compile against the real `ShowForViewer` type.

- [ ] **Step 1: failing test** — `tests/fixtures/showForViewer.test.ts`: `const d = makeShowForViewer({ show: { venue: { name: "V", address: "A" } }, rooms: [{ id: "r1", kind: "gs", name: "GS" }] });` → `expect(d.show.venue?.name).toBe("V")` (deep-merge into `show`), `expect(d.rooms[0].id).toBe("r1")` (rooms are `ProjectedRoomRow`), `expect(d.tileErrors).toEqual({})` (default), `expect(d.viewerName).toBeDefined()`. The return type is the real `ShowForViewer` (import it) so tsc rejects any override field that isn't on the type.
- [ ] **Step 2: run to fail** — `pnpm vitest run tests/fixtures/showForViewer.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement `makeShowForViewer`** — `export function makeShowForViewer(overrides?: DeepPartial<ShowForViewer>): ShowForViewer`. Start from a COMPLETE valid default (every required field of `ShowForViewer` + a complete default `show: ShowRow` with `venue`, `event_details: {}`, `dates`, `coi_status: null`, `agenda_links: []`, etc., one default `crewMembers[0]` with `dateRestriction: { kind: "none" }`, empty `hotelReservations`/`contacts`/`rooms`, `transportation: null`, `pullSheet: null`, `diagrams: null`, `tileErrors: {}`, `viewerName: "Test Crew"`, `viewerVersionToken: "v1"`). **OMIT `financials` from the default object entirely (R13-MEDIUM-2 — do NOT write `financials: undefined`):** the repo has `exactOptionalPropertyTypes`, and `ShowForViewer.financials?: FinancialsRow` is `FinancialsRow` (optional), NOT `FinancialsRow | undefined` — assigning `undefined` fails `tsc`. A test needing financials passes `{ financials: { po: ..., invoice_notes: ... } }` as an override (the Budget test). **Deep-merge** `overrides` so `{ show: { venue: {...} } }` patches only `show.venue` (recursive merge, or `structuredClone` + per-top-level-key assign with nested merge for `show`). Keep the return typed `ShowForViewer` with **NO `as any`/broad cast** (the typed return is the guarantee). Field names per the GROUND-TRUTH reference — the default `show.venue`/`hotelReservations`/`transportation`/`rooms` (+ the financials override shape) use the EXACT live field names (`hotel_name`, `driver_name`, `set_time`, `invoice_notes`, etc.) so a wrong-name override fails tsc.
- [ ] **Step 4: run to pass.** **Step 5: commit** `test(crew-page): typed makeShowForViewer fixture builder for section tests`.

> All section tasks (1–8) import `{ makeShowForViewer } from "@/tests/fixtures/showForViewer"`. This task is a HARD prerequisite — Tasks 1–8 do not compile without it.

---

### Task 1: TodaySection — hero + key-times + curated cards + 5-source notes

**Files:** Create `components/crew/sections/TodaySection.tsx`; Test `tests/components/crew/sections/TodaySection.test.tsx`.

Ports `RightNowHero` (Phase 2), `KeyTimesStrip`+`resolveKeyTimes` (Phase 1/2), `NotesTile` 5-source aggregation (`NotesTile.tsx:128-171`, order venue→hotel→room→transport→contact, `SOURCE_CAP=8` `:58`, `TRUNCATE_AT=280` `:57`), `selectPrimaryContact` (Phase 2), dress code (`show.event_details.{dress_code,dress,attire}`). Covers §9 tests 2, 11, 25, 30.

- [ ] **Step 1: failing test — fixed curated blocks + hero present (tests 2, 11)**

```tsx
import { render } from "@testing-library/react";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer"; // grep tests/ for the canonical builder; it nests venue/event_details under `show`
test("Today renders hero + key-times + Tonight/Where/Need-something + dress + notes; no deleted selectTodayTiles band", () => {
  const data = makeShowForViewer({
    rooms: [{ id: "r1", kind: "gs", name: "Main", set_time: "11:00 AM", show_time: "1:00 PM", strike_time: "9:00 PM" }],
    hotelReservations: [{ ordinal: 0, hotel_name: "Hyatt", hotel_address: "1 St", check_in: "2026-05-13", check_out: "2026-05-15", names: [], confirmation_no: null, notes: null }],
    contacts: [{ kind: "venue", name: "Sam", phone: "555-111-2222", email: null, notes: null }],
    show: { venue: { name: "Center", address: "5 Ave" }, event_details: { dress_code: "Business casual" } },
  });
  const { container } = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.querySelector('[data-testid="right-now-hero"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="key-times-strip"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-tonight"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-where"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-need-something"]')).toBeTruthy();
  expect(container.textContent).toContain(data.show.event_details.dress_code); // from the fixture value
  expect(container.querySelector('[data-testid="today-band"]')).toBeNull(); // deleted selectTodayTiles band absent
});
// _Catches: a curated block dropped/duplicated; Today retaining the deleted selectTodayTiles band; date-awareness lost (no hero).
```

- [ ] **Step 2: run to fail** — `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx` → FAIL (module missing).

- [ ] **Step 3: failing test — 5-source notes order + transport-gated transport note (test 25)**

```tsx
test("Show notes aggregate all 5 sources in order; transport note gated by transportTileVisible", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "V", address: "A", notes: "VENUE_NOTE" } },
    hotelReservations: [{ ordinal: 0, hotel_name: "H", hotel_address: null, notes: "HOTEL_NOTE", names: [], confirmation_no: null, check_in: null, check_out: null }],
    rooms: [{ id: "r1", kind: "gs", name: "GS", notes: "ROOM_NOTE" }],
    transportation: { driver_name: null, driver_phone: null, driver_email: null, vehicle: null, license_plate: null, color: null, parking: null, schedule: [], notes: "TRANSPORT_NOTE" },
    contacts: [{ kind: "venue", name: "C", notes: "CONTACT_NOTE", phone: "555-0000", email: null }],
  });
  const admin = render(<TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const notes = admin.container.querySelector('[data-testid="today-notes"]')!;
  const order = ["VENUE_NOTE", "HOTEL_NOTE", "ROOM_NOTE", "TRANSPORT_NOTE", "CONTACT_NOTE"].map((s) => notes.textContent!.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order]).toEqual([...order].sort((a, b) => a - b)); // ascending = source order preserved
  const crew = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} today={TODAY} showId={SHOW_ID} />);
  expect(crew.container.querySelector('[data-testid="today-notes"]')!.textContent).not.toContain("TRANSPORT_NOTE");
});
// _Catches: dropping hotel/room/transport/contact notes when the aggregator tile is deleted; transport notes leaking to unassigned crew.
```

- [ ] **Step 4: run to fail.**

- [ ] **Step 5: failing test — client_contact NOT rendered (test 30) + Need-something uses selectPrimaryContact**

```tsx
test("client_contact never appears; Need-something uses the deterministic actionable contacts[] primary", () => {
  const data = makeShowForViewer({
    show: { client_contact: { name: "CLIENT_REP", phone: "555-999-0000", email: "rep@client.com" } },
    contacts: [
      { kind: "venue", name: "Unactionable", phone: null, email: null, notes: null },
      { kind: "in_house_av", name: "AV_LEAD", phone: "555-222-3333", email: null, notes: null },
    ],
  });
  const { container } = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.textContent).not.toContain("CLIENT_REP");
  expect(container.textContent).not.toContain("555-999-0000");
  expect(container.querySelector('[data-testid="today-need-something"]')!.textContent).toContain("AV_LEAD");
});
// _Catches: a new client-PII exposure via Today; a nondeterministic/blank-phone "Need something" card.
```

- [ ] **Step 6: run to fail.**

- [ ] **Step 7: implement `TodaySection`** — resolve the viewer's flags/restriction from `data.crewMembers` (match `id === viewer.crewMemberId`); `buildRightNowContext({ show: data.show, dateRestriction, hotelReservations: data.hotelReservations, rooms: data.rooms })` → `<RightNowHero context={...} data-testid="right-now-hero" />`; `<KeyTimesStrip anchors={resolveKeyTimes(data.show, data.rooms)} />`; Tonight (`SectionCard`, `data.hotelReservations[0].hotel_name` + check_in/out); Where (`SectionCard`, `data.show.venue`); Need-something (`PersonRow` for `selectPrimaryContact(data.contacts)`, omit when null); Dress code (`shouldHideGenericOptional(data.show.event_details.dress_code ?? data.show.event_details.dress ?? data.show.event_details.attire ?? null)`-guarded); Show notes (5-source aggregation, transport note wrapped in `transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })`, `SOURCE_CAP`/`TRUNCATE_AT`). Read `client_contact` nowhere. Add the `data-testid`s the tests assert.

- [ ] **Step 8: run all three to pass.** **Step 9: commit** `feat(crew-page): TodaySection (hero + key-times + curated cards + 5-source notes)`.

---

### Task 2: ScheduleSection — DateRestriction privacy + timezone today-pin

**Files:** Create `components/crew/sections/ScheduleSection.tsx`; Test `tests/components/crew/sections/ScheduleSection.test.tsx`. Covers §9 tests 32, 34. Uses `DayCard` (Phase 2) + `KeyTimesStrip`.

- [ ] **Step 1: failing test — the three DateRestriction branches (test 32, privacy trust boundary)**

**The visible day list is the FULL date domain (R6-HIGH — NOT just `showDays`).** Port `ScheduleTile.aggregateDays` (`ScheduleTile.tsx:93-107`): push `dates.travelIn`→`"Travel In"`, `dates.set`→`"Set"`, each `dates.showDays[]`→`"Show"`, `dates.travelOut`→`"Travel Out"`; dedup by date (first phase wins); sort ASC by ISO. The DateRestriction intersects against this **full aggregate**, not just show days — else travel-in / set / travel-out cards are dropped (a field-port regression) AND the `unknown_asterisk` privacy test would miss a travel/set leak.

```tsx
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
// 5 aggregate days: 2026-05-12 Travel In, -13 Set, -14 Show, -15 Show, -16 Travel Out
const DATES = { travelIn: "2026-05-12", set: "2026-05-13", showDays: ["2026-05-14", "2026-05-15"], travelOut: "2026-05-16" };
const ALL_DATES = [DATES.travelIn, DATES.set, ...DATES.showDays, DATES.travelOut]; // 5 — derive expectations from this, not a literal
const base = makeShowForViewer({ show: { dates: DATES, schedule_phases: {} } });
function withRestriction(r) { return { ...base, crewMembers: [{ ...base.crewMembers[0], id: "c1", dateRestriction: r }] }; }

test("unknown_asterisk → unconfirmed placeholder, ZERO day cards, NO date text for ANY of travelIn/set/showDays/travelOut", () => {
  const { container } = render(<ScheduleSection data={withRestriction({ kind: "unknown_asterisk", days: null })} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.querySelector('[data-testid="schedule-unconfirmed"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(0);
  for (const d of ALL_DATES) expect(container.textContent).not.toContain(d); // NO travel/set/show/travelOut date leaks (full domain, not just show days)
});
test("explicit → intersection against the FULL aggregate; none → all aggregate days", () => {
  // explicit days span a travel day + a show day → both render (proves intersection is over the full domain, not just showDays)
  const explicit = render(<ScheduleSection data={withRestriction({ kind: "explicit", days: [DATES.travelIn, DATES.showDays[0]] })} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(explicit.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
  expect(explicit.container.textContent).toContain(DATES.travelIn); // the Travel In day IS shown when assigned
  const none = render(<ScheduleSection data={withRestriction({ kind: "none" })} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(none.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(ALL_DATES.length); // all 5 aggregate days, NOT just showDays.length (2)
});
// _Catches: narrowing the visible days to showDays only (dropping travel-in/set/travel-out cards — a field-port regression from ScheduleTile); the unknown_asterisk privacy check missing a travel/set date leak; treating unknown_asterisk like none.
```

- [ ] **Step 2: run to fail.**

- [ ] **Step 3: failing test — show-timezone today-pin (test 34)** — with the frozen `X-Screenshot-Frozen-Now` instant near a day boundary + a non-local show timezone, the `[data-testid="schedule-day-today"]` element keys the **show-timezone** ISO date, not the UTC date. (Grep `tests/` for the existing `X-Screenshot-Frozen-Now` test-auth helper; grep `resolveShowTimezone` for the exact field it reads — see the ground-truth reference timezone note — and set that field in the fixture.)

- [ ] **Step 4: run to fail.**

- [ ] **Step 5: implement `ScheduleSection`** — resolve `dateRestriction` from `data.crewMembers`. **Build `allDays` via the ported `aggregateDays(data.show.dates)`** (travelIn→"Travel In", set→"Set", showDays[]→"Show", travelOut→"Travel Out"; dedup first-phase-wins; sort ASC — `ScheduleTile.tsx:93-107`). Then switch: `unknown_asterisk` → render only `<div data-testid="schedule-unconfirmed">` (no `DayCard`s, **no date text at all** — STOP before building any day, matching `ScheduleTile.tsx:113-131`); `explicit` → `DayCard` per `allDays.filter(d => new Set(dateRestriction.days).has(d.date))` (intersection over the **full aggregate**); `none` → all `allDays`. Empty `visibleDays` → `EmptyState` ("Show dates haven't been confirmed yet.", `ScheduleTile.tsx:150-162`). Each `DayCard` gets `phase` from its aggregate entry and `data-testid="schedule-day-<date>"`. **Pin today via the `today: Date` PROP** (R8-HIGH-1 — `CrewShell` passes the raw `await nowDate()` Date; do NOT call `nowDate()` inside the section). Compute `const todayIso = todayIsoInShowTimezone(data.show, today)` (`lib/visibility/packList`, the exact helper `ScheduleTile.tsx:170` uses — it resolves the show timezone from `data.show.venue` internally, currently `America/New_York`); mark the `DayCard` whose `date === todayIso` with `data-testid="schedule-day-today"`. Test 34 (timezone today-pin) passes a `today` `Date` near a day boundary and asserts the pinned `DayCard` is the **show-timezone** ISO date (not the UTC date); the `CrewShell` wiring task (Task 11) proves `today` itself is `await nowDate()` at the shell. Render the Daily-times `<KeyTimesStrip anchors={resolveKeyTimes(data.show, data.rooms)} />` + optional sentinel-guarded Heads-up note. (`ScheduleTile`'s "Show+Strike compound day is PackListTile's domain" note holds — strike is not a separate aggregate day; the Strike *anchor* lives in the KeyTimesStrip.)

- [ ] **Step 6: run to pass.** **Step 7: commit** `feat(crew-page): ScheduleSection (date-restriction privacy + timezone today-pin)`.

---

### Task 3: VenueSection — address/dock/parking(gated)/wifi/COI/power/notes/map/diagrams

**Files:** Create `components/crew/sections/VenueSection.tsx`; Test `tests/components/crew/sections/VenueSection.test.tsx`. Ports `VenueTile` + `DiagramsTile` (embedded-first + `isAllowedDiagramMime`, `DiagramsTile.tsx:68-88`) + `ShowStatusTile` fields (`show.coi_status` / `show.event_details.power` / `.internet` / `show.venue.notes`) + `transportation.parking` behind `transportTileVisible` (§4.13a) + map-link `isParseableUrl` (`VenueTile.tsx:44-52`). Covers §9 tests 24, 33 + the parking half of 17.

- [ ] **Step 1: failing test — ShowStatus field coverage + COI testid (test 24)**

```tsx
test("Venue homes coi_status (data-testid=coi-status), power, internet, venue notes; sentinels hidden", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "Center", address: "5 Ave", loadingDock: "Dock at rear", notes: "Quiet load-in" }, coi_status: "Received", event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" } },
  });
  const { container } = render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.querySelector('[data-testid="coi-status"]')!.textContent).toContain("Received");
  expect(container.textContent).toContain("200A 3-phase");
  expect(container.textContent).toContain("SSID Guest / pw 1234"); // raw internet string (Phase 1)
  expect(container.textContent).toContain("Dock at rear");
  const sentinel = makeShowForViewer({ show: { venue: { name: "C", address: "A" }, coi_status: "TBD" } });
  expect(render(<VenueSection data={sentinel} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />).container.querySelector('[data-testid="coi-status"]')).toBeNull();
});
// _Catches: deleting ShowStatusTile silently dropping COI/power/internet/dock/notes from the crew page (AC-4.1).
```

- [ ] **Step 2: run to fail.**

- [ ] **Step 3: failing test — parking gated + map-link guard (tests 17-parking, 33)**

```tsx
test("parking renders only when transportTileVisible; map link only when isParseableUrl", () => {
  const data = makeShowForViewer({
    show: { venue: { name: "C", address: "A", googleLink: "TBD" } }, // sentinel → no map link
    transportation: { driver_name: null, driver_phone: null, driver_email: null, vehicle: null, license_plate: null, color: null, parking: "Lot B, $20", schedule: [], notes: null },
  });
  const unassigned = render(<VenueSection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} today={TODAY} showId={SHOW_ID} />);
  expect(unassigned.container.textContent).not.toContain("Lot B");           // parking gated out
  expect(unassigned.container.querySelector('a[href^="http"]')).toBeNull();  // sentinel googleLink → no map link
  expect(render(<VenueSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />).container.textContent).toContain("Lot B"); // admin passes the gate
});
// _Catches: parking leaking to unassigned crew (§4.13a); a dead/unsafe map href surviving the port.
```

- [ ] **Step 4: run to fail.**

- [ ] **Step 5: implement `VenueSection`** — `SectionCard`/`KeyValueRows` for address + `show.venue.loadingDock`; parking row wrapped in `transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })` (reads `data.transportation?.parking`); Wi-Fi (raw `data.show.event_details.internet`, sentinel-guarded); COI `<span data-testid="coi-status">` over `data.show.coi_status` (sentinel-guarded); power (`data.show.event_details.power`); notes (`data.show.venue.notes`); map link only when `isParseableUrl(data.show.venue?.googleLink)`; diagrams via the full `DiagramsTile` logic (embedded images first by cumulative ordinal, then linked-folder items, each gated on `snapshotPath !== null && isAllowedDiagramMime`, plus `data.show.agenda_links` PDFs). Section-level `EmptyState` when all blocks hidden.

- [ ] **Step 6: run to pass.** **Step 7: commit** `feat(crew-page): VenueSection (address/dock/parking-gated/wifi/COI/power/notes/map/diagrams)`.

---

### Task 4: TravelSection — gated ground transport (full field set) + hotel (ordinal)

**Files:** Create `components/crew/sections/TravelSection.tsx`; Test `tests/components/crew/sections/TravelSection.test.tsx`. Ports the FULL `TransportationRow` field set behind `transportTileVisible` + `LodgingTile` `ordinal` ordering (`LodgingTile.tsx:59-66`). Covers §9 test 17.

- [ ] **Step 1: failing test — transport gate (Travel) + full field set + hotel ordinal (test 17)**

```tsx
test("unassigned crew see no ground-transport PII; admin sees the full field set; hotels stack by ordinal", () => {
  const data = makeShowForViewer({
    transportation: { driver_name: "Pat", driver_phone: "555-7", driver_email: null, vehicle: "Van", license_plate: "ABC123", color: "Black", parking: "Lot A", schedule: [{ stage: "load-in", date: "2026-05-13", time: "8AM", assigned_names: ["someone"] }], notes: "N" },
    hotelReservations: [
      { ordinal: 1, hotel_name: "Second", hotel_address: null, names: [], confirmation_no: null, check_in: "2026-05-14", check_out: null, notes: null },
      { ordinal: 0, hotel_name: "First", hotel_address: null, names: [], confirmation_no: null, check_in: "2026-05-13", check_out: null, notes: null },
    ],
  });
  const crew = render(<TravelSection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} today={TODAY} showId={SHOW_ID} />);
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"]) expect(crew.container.textContent).not.toContain(pii);
  const admin = render(<TravelSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"]) expect(admin.container.textContent).toContain(pii);
  const html = admin.container.textContent!;
  expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second")); // ordinal 0 before ordinal 1, regardless of array order
});
// _Catches: leaking driver PII/vehicle/plate/parking/assignments to unassigned crew (trust-boundary regression); hotels ordering by array index instead of `ordinal`.
```

- [ ] **Step 2: run to fail.**

- [ ] **Step 3: implement `TravelSection`** — Getting-there block wrapped in `transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })`, rendering the full set when visible (`driver_name`, `driver_phone`, `driver_email`, `vehicle`, `license_plate`, `color`, `parking`, `schedule` legs with `assigned_names`, `notes`), else omitted/empty-stated; hotel block sorts `data.hotelReservations` by `ordinal` (hairline divider on idx>0), shows `hotel_name`/`hotel_address`/`confirmation_no`/`check_in`-`check_out` + `notes`. No flights (`flight_info` not in the projection — render nothing, no false "not added" claim).

- [ ] **Step 4: run to pass.** **Step 5: commit** `feat(crew-page): TravelSection (gated ground transport full field set + hotel ordinal)`.

---

### Task 5: CrewSection — roster + key contacts (caps, two columns ≥720px)

**Files:** Create `components/crew/sections/CrewSection.tsx`; Test `tests/components/crew/sections/CrewSection.test.tsx`. Ports `CrewTile` (`CREW_INLINE_CAP=8`) + `ContactsTile` (`CONTACTS_INLINE_CAP=6`) via `PersonRow`. Covers §9 tests 27 (these two caps), 30 (no client_contact).

- [ ] **Step 1: failing test — cap boundary cap-1/cap/cap+1 (test 27), derived from fixture length**

```tsx
import { CREW_INLINE_CAP } from "@/components/crew/sections/CrewSection"; // re-export the cap for the test
test.each([CREW_INLINE_CAP - 1, CREW_INLINE_CAP, CREW_INLINE_CAP + 1])("roster cap boundary at %i", (n) => {
  const crewMembers = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Member ${i}`, email: null, phone: null, role: "", roleFlags: [], dateRestriction: { kind: "none" }, stageRestriction: { kind: "none" } }));
  const { container } = render(<CrewSection data={makeShowForViewer({ crewMembers })} viewer={{ kind: "crew", crewMemberId: "c0" }} today={TODAY} showId={SHOW_ID} />);
  const shown = container.querySelectorAll('[data-testid="crew-person-row"]').length;
  const stub = container.querySelector('[data-tile-show-more]');
  if (n <= CREW_INLINE_CAP) { expect(shown).toBe(n); expect(stub).toBeNull(); }
  else { expect(shown).toBe(CREW_INLINE_CAP); expect(stub!.textContent).toContain(String(n - CREW_INLINE_CAP)); } // +N more, N = length − cap
});
// _Catches: unbounded mobile roster scroll; lost overflow affordance / wrong count after the tile view is deleted.
```

- [ ] **Step 2: run to fail.**

- [ ] **Step 3: implement `CrewSection`** — two-column layout (`items-stretch` + `h-full` at `≥720px`, single-column stack `<720px`, §4.9 invariant 2): Show crew (`PersonRow` per `crewMembers`, `you` when `id===viewer.crewMemberId`, `lead` from `roleFlags.includes("LEAD")`, cap 8 + `data-tile-show-more` "+N more") | Key contacts (`PersonRow` per `contacts` — **not** `client_contact`, cap 6 + `data-testid="contacts-overflow-stub"`). Re-export `CREW_INLINE_CAP`/`CONTACTS_INLINE_CAP`.

- [ ] **Step 4: run to pass.** **Step 5: commit** `feat(crew-page): CrewSection (roster + key contacts, caps + two columns)`.

---

### Task 6: GearSection — A/V/L emphasis (NOT gate) + pack list (gated) + keynote + opening reel

**Files:** Create `components/crew/sections/GearSection.tsx`; Test `tests/components/crew/sections/GearSection.test.tsx`. The gate→emphasis flip (D-5): `audioScopeVisible`/`videoScopeVisible`/`lightingScopeVisible` become an **emphasis** signal, not a gate — all scope shown to everyone. **`rooms[].audio`/`.video`/`.lighting` are SCALAR free-text strings (one per room) — a "scope card" lists the non-empty per-room values for that discipline; "zero items" = no room has a non-sentinel value for it.** Pack list keeps `isPackListVisibleToday` (`CASE_CAP=12`). Opening reel via `stripOpeningReelText` (`lib/visibility/openingReelText.ts:56`). Covers §9 tests 7, 18, 26, 27 (pack-list cap). **The old `{Audio,Video,Lighting}ScopeTile.tsx` are deleted in Phase 4 — their predicates survive ONLY as the emphasis signal here.**

- [ ] **Step 1: failing test — emphasis is not a gate; empty scope omitted; viewer-discipline first (test 7)**

```tsx
test("all scope shown to everyone; viewer's discipline first + [data-emphasis=you]; empty scope omitted incl viewer's own", () => {
  const data = makeShowForViewer({
    rooms: [{ id: "r1", kind: "gs", name: "GS", audio: "2x SM58", video: "1x PTZ", lighting: null }], // lighting empty (scalar strings)
    crewMembers: [{ id: "c1", name: "A", email: null, phone: null, role: "", roleFlags: ["A1"], dateRestriction: { kind: "none" }, stageRestriction: { kind: "none" } }], // A1 → audio discipline
  });
  const { container } = render(<GearSection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  const cards = [...container.querySelectorAll('[data-testid^="gear-scope-"]')];
  expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(["gear-scope-audio", "gear-scope-video"]); // audio first (viewer's), video next; lighting omitted (empty)
  expect(cards[0].getAttribute("data-emphasis")).toBe("you");
  expect(container.querySelector('[data-testid="gear-scope-lighting"]')).toBeNull(); // empty scope omitted, NOT a gate
});
test("no-flag viewer → default order, no emphasis; all-empty → section EmptyState", () => {
  const noFlag = makeShowForViewer({ rooms: [{ id: "r1", kind: "gs", name: "GS", audio: "mic", video: "cam", lighting: "par" }], crewMembers: [{ id: "c1", name: "A", email: null, phone: null, role: "", roleFlags: [], dateRestriction: { kind: "none" }, stageRestriction: { kind: "none" } }] });
  expect([...render(<GearSection data={noFlag} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />).container.querySelectorAll('[data-testid^="gear-scope-"]')].map((c) => c.getAttribute("data-emphasis"))).toEqual([null, null, null]);
  const empty = makeShowForViewer({ rooms: [], pullSheet: null, openingReelHasVideo: false });
  expect(render(<GearSection data={empty} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />).container.querySelector('[data-testid="section-empty"]')).toBeTruthy();
});
// _Catches: emphasis becoming a gate (audio tech can't see lighting); an empty "Your scope" shell; missing section EmptyState.
```

- [ ] **Step 2: run to fail.**

- [ ] **Step 3: failing test — opening-reel URL strip (test 26) + pack-list gate (test 18)**

```tsx
test("opening-reel cell is text-only (no Drive URL) AND the proxied player uses /api/asset/reel/<showId> (R10-HIGH-1)", () => {
  const data = makeShowForViewer({ show: { event_details: { opening_reel: "YES - https://drive.google.com/file/d/abc/view" } }, openingReelHasVideo: true });
  const { container } = render(<GearSection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  const html = container.innerHTML;
  for (const leak of ["https://", "drive.google.com", "docs.google.com"]) expect(html).not.toContain(leak);
  // the retained OpeningReelVideo player renders <video src="/api/asset/reel/${showId}"> — proves showId is threaded, NOT data.show.id
  expect(container.querySelector(`video[src="/api/asset/reel/${SHOW_ID}"]`)).toBeTruthy();
});
// _Catches: leaking raw Drive URLs off OpeningReelTile; AND dropping/breaking the proxied reel player when OpeningReelTile is deleted (showId not threaded → a user-visible regression: opening-reel videos disappear).
test("pack list omitted when isPackListVisibleToday is false", () => {
  const withheld = makeShowForViewer({ pullSheet: [{ caseLabel: "C1", items: [] }] /* set stage/phase so the gate is false; derive from fixture */ });
  expect(render(<GearSection data={withheld} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />).container.querySelector('[data-testid="gear-pack-list"]')).toBeNull();
});
// _Catches: leaking raw Drive URLs off OpeningReelTile; pull-sheet details leaking on withheld days once the pack list lives in a persistent tab.
```

- [ ] **Step 4: run to fail.**

- [ ] **Step 5: implement `GearSection`** — derive the viewer's scope flags from `data.crewMembers`. Build the three scope cards (audio/video/lighting) by collecting each room's non-sentinel scalar value for that discipline (`shouldHideGenericOptional`-filtered), **omitting a card with zero non-empty values** (incl. the viewer's own); order = viewer's discipline card(s) first (flag order for multiple), else Audio→Video→Lighting; the viewer's card(s) get `data-emphasis="you"` + a "Your scope" eyebrow + accent left-edge (≤10% accent coverage); non-viewer cards neutral. Distinct glyphs (Volume2/Video/Lightbulb). Pack list: render only when `isPackListVisibleToday({ show: data.show, restriction: stageRestriction, today })` — passing the **`today: Date` PROP** straight through (R8-HIGH-1 — `isPackListVisibleToday` wants a `Date`, `packList.ts:122-127`; `CrewShell` passes `await nowDate()`; do NOT call `nowDate()` inside `GearSection`), cap 12 + `data-tile-show-more`. Keynote requirements (`data.show.event_details.keynote_requirements`, sentinel-guarded). Opening reel: `data.openingReelHasVideo && !shouldHideOpeningReel(...)` → text-only via `stripOpeningReelText(data.show.event_details.opening_reel)` + the proxied **`<OpeningReelVideo showId={showId} ... />`** player (kept module — **R10-HIGH-1: it requires `showId` for `/api/asset/reel/${showId}`, so GearSection uses the `showId` prop**, NOT `data.show.id`). All-empty → `<div data-testid="section-empty">EmptyState`.

- [ ] **Step 6: run to pass.** **Step 7: commit** `feat(crew-page): GearSection (A/V/L emphasis + pack list gated + keynote + opening reel URL-strip)`.

---

### Task 7: BudgetSection — lead-gated, single predicate

**Files:** Create `components/crew/sections/BudgetSection.tsx`; Test `tests/components/crew/sections/BudgetSection.test.tsx`. Renders `data.financials` only when `financialsVisible(viewerFlags, isAdmin)`. Same predicate gates the tab + `resolveActiveSection` (Phase 2) + this section. Covers §9 test 8.

- [ ] **Step 1: failing test — single-predicate gate (test 8)**

```tsx
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { resolveActiveSection } from "@/lib/crew/resolveActiveSection";
test("BudgetSection renders financials iff financialsVisible; the SAME predicate drives resolveActiveSection", () => {
  const lead = makeShowForViewer({
    financials: { po: "PO-1", proposal: "P", invoice: "I", invoice_notes: "N" },
    crewMembers: [{ id: "c1", name: "L", email: null, phone: null, role: "", roleFlags: ["LEAD"], dateRestriction: { kind: "none" }, stageRestriction: { kind: "none" } }],
  });
  expect(render(<BudgetSection data={lead} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />).container.textContent).toContain("PO-1");
  expect(resolveActiveSection("budget", { budgetVisible: financialsVisible([], false) })).toBe("today"); // non-lead direct ?s=budget → today
});
// _Catches: lead-only financials leaking to non-leads via direct URL; a dead tab; a divergent gate across the three Budget surfaces.
```

- [ ] **Step 2: run to fail. Step 3: implement `BudgetSection`** — `SectionCard`/`KeyValueRows` over `data.financials` (`po`/`proposal`/`invoice`/`invoice_notes`); the caller renders it only when `financialsVisible` true (the section defensively no-ops when `data.financials` absent). **Step 4: run to pass. Step 5: commit** `feat(crew-page): BudgetSection (lead-gated, single predicate)`.

---

### Task 8: Section-level empty states + sentinel-hiding meta-test coverage

**Files:** Modify each `*Section.tsx` (all-blocks-empty → `EmptyState`); Test `tests/components/crew/sections/sectionEmptyState.test.tsx`; Verify `tests/components/tiles/_metaSentinelHidingContract.test.ts` (extended in Phase 2 to walk `components/crew/`) now covers the section files. Covers §9 test 9.

- [ ] **Step 1: failing test — each section collapses to one EmptyState when all blocks empty (test 9)**

```tsx
test.each([["VenueSection"], ["TravelSection"], ["CrewSection"], ["GearSection"]])("%s shows one EmptyState when all blocks empty/hidden", (name) => {
  const Section = require(`@/components/crew/sections/${name}`)[name];
  const empty = makeShowForViewer({ show: { venue: null }, rooms: [], transportation: null, hotelReservations: [], contacts: [], pullSheet: null, diagrams: null, openingReelHasVideo: false });
  const { container } = render(<Section data={empty} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.querySelectorAll('[data-testid="section-empty"]').length).toBe(1);
});
// _Catches: a blank section with no empty-state, or multiple stray empty stubs.
```

- [ ] **Step 2: run to fail. Step 3: implement** the all-empty → single `EmptyState` guard in each section. **Step 4: run to pass.**

- [ ] **Step 5: verify the sentinel meta-test now covers the new files** — `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts` → PASS (the Phase-2 `listTileFiles()` extension walks every `*Section.tsx`; any section reading a generic-optional field without `shouldHideGenericOptional` fails here). If a section trips it, route that field read through `shouldHideGenericOptional` and re-run.

- [ ] **Step 6: commit** `feat(crew-page): section-level empty states + sentinel-hiding coverage`.

---

### Task 9: Per-block error boundaries — wrap every throwable section block in `WrappedSection` (R11-HIGH-1 — §4.13/wp-13)

**Files:** Create `components/crew/WrappedSection.tsx` (a thin `WrappedTile` alias); Modify each `*Section.tsx` (wrap its throwable blocks); Test `tests/components/crew/wrappedSection.test.tsx`.

> Spec §4.13 (`:252`): **every section block running a data load/transform that can throw is wrapped in `WrappedTile` (or a thin `WrappedSection` alias) with a stable `tileId` (`crew:<section>:<block>`), `showId`, `sheetName`** — preserving render-throw containment, load-throw catch, the `admin_alerts` `TILE_SERVER_RENDER_FAILED` upsert, and the fallback element (identical to today; NO new code — reuses `WrappedTile`/`TileServerFallback`, `components/shared/WrappedTile.tsx:15-41`). **Without this, deleting the old tile shells (Phase 4) loses the per-block containment** — a transform/render throw in a section would crash the section/page or silently lose the admin alert. This task makes the contract live in the sections; Phase-4 Task 8's test 29 then becomes a *regression* check (not the first place the contract appears).

- [ ] **Step 1: failing test** — `tests/components/crew/wrappedSection.test.tsx`: render a section whose block is forced to throw (mock a data helper to throw, OR pass a fixture that makes a block's transform throw) inside `WrappedSection` → assert the `TileServerFallback` admin fallback renders (admin viewer) / omission (crew), the section/page does NOT crash, and `upsertAdminAlert` is called with `code: "TILE_SERVER_RENDER_FAILED"`, `context.tileId` matching `crew:<section>:<block>`, `context.showId` = the `showId` prop, `context.sheet_name` = `data.show.title`. (Mock `upsertAdminAlert`; the wrapping is `WrappedTile`'s existing behavior — the test proves the SECTION blocks are actually wrapped, with the crew-namespaced tileId.) _Failure mode: a section block rendering UNWRAPPED → a throw crashes the whole section/page and loses the `TILE_SERVER_RENDER_FAILED` admin alert once the old tiles are deleted (§4.13 containment regression)._
- [ ] **Step 2: run to fail.**
- [ ] **Step 3: implement** — create `WrappedSection` (a thin wrapper over `WrappedTile` defaulting nothing but giving the crew sections a clear name, OR re-export `WrappedTile`). In EACH section, wrap every block that runs a throwable data load/transform (e.g. Venue diagrams build, Travel transport projection, Gear scope aggregation, Today notes aggregation, Schedule day aggregation) in `<WrappedSection tileId={\`crew:${section}:${block}\`} showId={showId} sheetName={data.show.title}>…</WrappedSection>`. Pure presentational blocks (a static label) need no wrap; only throwable load/transform blocks. Pass `showId` (R10) + `data.show.title` as `sheetName`.
- [ ] **Step 4: run to pass.** **Step 5: `pnpm typecheck`.** **Step 6: commit** `feat(crew-page): per-block WrappedSection error boundaries (crew:<section>:<block>, TILE_SERVER_RENDER_FAILED preserved)`.

---

### Task 10: Active-section `tileErrors` visual fallback (R15-HIGH — §4.13, distinct from the WrappedTile render-throw boundary)

**Files:** Create `components/crew/SectionTileError.tsx` (the shared degraded-block atom); Modify the sections that render `tileErrors`-keyed blocks; Test `tests/components/crew/sectionTileError.test.tsx`.

> Spec §4.13 has THREE error mechanisms — (1) the section-independent **projection alert** (`TILE_PROJECTION_FETCH_FAILED`, Phase 2, admin observability), (2) the per-block **render-throw boundary** (`WrappedSection`→`TILE_SERVER_RENDER_FAILED`, Task 9), and (3) THIS one: the **active-section visual fallback** for a `tileErrors[key]` **fetch** error. When the rendered section's block depends on an errored key AND the block's visibility gate is satisfied → **admin sees an inline degraded block** (human-readable / catalog-derived copy, e.g. "Couldn't load rooms for this show", **never a raw error string** — invariant 5/§4.18), **crew sees omission**, and it emits **NO** alert (the CrewShell render-bound upsert owns alerting — no second `upsertAdminAlert`). My section tasks render blocks directly from `data` without checking `data.tileErrors` — so after Phase 4 deletes `_ShowBody.tsx`, admins can no longer distinguish "no data" (genuine absence → silent omission) from "fetch failed" (degraded block) on the open section. **Per-block visual gates (ported from `_ShowBody`, §4.13):** `hotel`→`isAdmin` (`:189`); `contacts`→ungated (`:224`); `rooms`→any Gear/KeyTimesStrip viewer (scope shown to all, §4.5); `transportation`→`isAdmin || transportTileVisible` (`:309`); `financials`→`financialsVisible` (`:373`). Where the gate is false → silent omission (genuine-absence path), never a degraded block (no widening a visibility boundary, §4.13 "Gated blocks keep their gate even on error").

- [ ] **Step 1: failing test** — `tests/components/crew/sectionTileError.test.tsx`. For each `(key, section, block)` — `rooms`→Today KeyTimesStrip / Gear scope / Schedule daily-times; `hotel`→Today Tonight / Travel hotel; `contacts`→Today Need-something / Crew key-contacts; `transportation`→Travel getting-there / Venue parking; `financials`→Budget — assert: with `data.tileErrors = { <key>: "boom" }` AND the block's gate satisfied → **admin** render shows a `[data-testid="section-tile-error-<key>"]` degraded block whose text is human-readable (NO `"boom"`, no raw error substring, no em-dash), **crew** (gate-satisfied where the gate is viewer-independent, e.g. contacts/rooms) shows omission (no degraded block, no data), and **`upsertAdminAlert` is NOT called** from the section (the CrewShell projection alert is the sole producer — mock it, assert 0 calls from the section render). With the gate NOT satisfied (e.g. `transportation` for unassigned crew) → neither data NOR a degraded block (silent omission — no boundary widening). Error-state (`tileErrors[key]` set) is **distinguishable** from absent-state (`data.<key>` empty, no `tileErrors`) — assert both render differently for admin. _Failure mode: deleting `_ShowBody.tsx`'s per-block fallback so admins can't tell "fetch failed" from "no data" on the open section; a raw error string leaking to the admin UI; a degraded block widening a gate (e.g. showing transportation-failed to unassigned crew); a duplicate `upsertAdminAlert` from the section._
- [ ] **Step 2: run to fail.**
- [ ] **Step 3: implement** — create `SectionTileError({ domain })` rendering the catalog-derived degraded copy (reuse `ErrorExplainer`/`messageFor` admin surface OR a simple human-readable string per domain, no raw code — §4.18). In each section, for every block that reads a `tileErrors`-keyed projection field, branch: `if (data.tileErrors[key] && <block gate>) → isAdmin ? <SectionTileError domain={key} /> : null (omit)`; else render the block normally (or omit if genuinely absent). Use the EXACT per-block gates above. Emit **NO** `upsertAdminAlert` here. (This composes with Task 9's `WrappedSection`: the wrapper catches a render *throw*; this branch handles a *fetch-error* `tileErrors` flag — different failure modes, both preserved.)
- [ ] **Step 4: run to pass.** **Step 5: `pnpm typecheck`.** **Step 6: commit** `feat(crew-page): active-section tileErrors visual fallback (admin degraded / crew omission, no second alert)`.

---

### Task 11: Wire the real sections into `CrewShell`'s dispatcher (R8-HIGH-2 — the route still renders placeholders without this)

**Files:** Modify `app/show/[slug]/[shareToken]/_CrewShell.tsx` (replace the Phase-2 placeholder section with the real dispatch); Test `tests/components/crew/crewShellSections.test.tsx`.

> Phase 2 Task 11 left `CrewShell` rendering a placeholder `<section data-testid="section-${activeSection}">`. The section components (Tasks 1–8) exist + pass in isolation, but **nothing renders them at the route** — `?s=venue` would still show placeholder text. This task wires the dispatcher: it is the integration step that makes the sections user-reachable. **HARD dependency: all of Tasks 1–8 (the seven sections) + Phase-2 Task 11 (`CrewShell`) must be green first.**

- [ ] **Step 1: failing test** — `tests/components/crew/crewShellSections.test.tsx`: render `CrewShell` (async; await it) with a populated fixture for each `rawSection` and assert the **real section's distinctive DOM** (not `data-active-section`, not placeholder text):
  - `rawSection="today"` (and `undefined`) → `[data-testid="right-now-hero"]` + `[data-testid="today-tonight"]` present.
  - `rawSection="venue"` → `[data-testid="coi-status"]` (or the venue address) present; NO hero.
  - `rawSection="schedule"` → a `[data-testid^="schedule-day"]` OR `[data-testid="schedule-unconfirmed"]` present.
  - `rawSection="gear"` → a `[data-testid^="gear-scope-"]` OR `[data-testid="gear-pack-list"]` present.
  - `rawSection="crew"` → `[data-testid="crew-person-row"]` present.
  - `rawSection="travel"` → the hotel/getting-there block present.
  - `rawSection="budget"` for a **LEAD** → financials content; for a **non-LEAD** → the `today` hero (budget gated → `resolveActiveSection`→today, R2-HIGH-1).
  - **`today` derivation (R8-HIGH-1):** mock `nowDate` to a fixed `Date` near a day boundary → assert the rendered ScheduleSection pins the **show-timezone** `schedule-day-today` (the date `todayIsoInShowTimezone(show, <mocked now>)` yields), proving `CrewShell` threads the `await nowDate()` `Date` to the sections (the section unit tests use a literal `today` `Date`; THIS proves the shell supplies it).
  _Failure mode: the route rendering placeholder text for `?s=venue`/`?s=gear`/etc. while section unit tests pass green (a core user-visible failure + spec-coverage gap); the shell not deriving/threading `today` so the today-pin is wrong under frozen-clock screenshots._
- [ ] **Step 2: run to fail.**
- [ ] **Step 3: implement the dispatch in `_CrewShell.tsx`** — after `resolveViewerContext` + `activeSection`/`budgetVisible` resolution (R2-HIGH-1) + the projection-alert upsert: compute `const today = await nowDate()` ONCE (a `Date`; `next/headers`-backed, honors `X-Screenshot-Frozen-Now` — §4.14; the per-section tz conversion happens inside ScheduleSection via `todayIsoInShowTimezone(data.show, today)`). Replace the placeholder with a `renderSection(activeSection)` switch returning the real component, each `({ data, viewer, today, showId })` (R10-HIGH-1 — `showId` is the `CrewShell` prop, threaded uniformly so GearSection can render `<OpeningReelVideo showId={showId}>`): `today`→`TodaySection` (leads with `RightNowHero` inside the section), `schedule`→`ScheduleSection`, `venue`→`VenueSection`, `travel`→`TravelSection`, `crew`→`CrewSection`, `gear`→`GearSection`, `budget`→`BudgetSection` (only reachable when `budgetVisible` — `resolveActiveSection` already guarantees a non-lead never gets `"budget"`). Wrap the rendered section in `<CrewSectionTransition sectionId={activeSection}>{section}</CrewSectionTransition>` (keyed by id, `initial={false}`). Both `today` and `showId` flow to every section uniformly.
- [ ] **Step 4: run to pass.** **Step 5: `pnpm typecheck`.** **Step 6: commit** `feat(crew-page): wire real sections into CrewShell dispatcher (today threaded, budget gated)`.

---

## Phase exit criteria

- [ ] All seven `*Section.tsx` exist; each renders only when its caller selects it (Budget only when `financialsVisible`). Every field read uses the **ground-truth field names** above (tsc clean).
- [ ] §9 tests green: 2, 7, 8, 9, 11, 17, 18, 24, 25, 26, 27, 30, 32, 33, 34.
- [ ] Every field from the 14 tiles has a section home (wp-19 field-coverage audit): ShowStatus → Header(pill, Phase 2)/Venue(`show.coi_status`/`event_details.power`/`.internet`/`venue.notes`)/Today(dress)/Gear(keynote); Notes → Today 5-source; Transport → Travel (full set, gated); Diagrams → Venue (full, incl `agenda_links`); PackList → Gear (full item shape, gated); Lodging → Travel (ordinal); Contacts/Crew → Crew; Opening Reel → Gear (URL-stripped + kept media player).
- [ ] `client_contact` appears in NO crew DOM (test 30).
- [ ] `_metaSentinelHidingContract.test.ts` green for all new `components/crew/sections/*` files.
- [ ] `pnpm typecheck` clean. One commit per task (`feat(crew-page):`/`test(crew-page):`).
