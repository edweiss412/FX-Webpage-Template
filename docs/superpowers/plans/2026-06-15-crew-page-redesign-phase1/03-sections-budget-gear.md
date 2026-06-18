# Phase 3 — Sections + Budget + Gear

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Read `00-overview.md` (shared contracts + verified-facts digest) first; Phase 3 **consumes** the primitives, `RightNowHero`, `CrewShell`, `resolveActiveSection`, `selectPrimaryContact`, and `resolveKeyTimes` defined in phases 1–2 — reference them by their contract names, never redefine.

**Goal:** Build the seven `components/crew/sections/*Section.tsx` Server Components (`{ data, viewer }`) — Today · Schedule · Venue · Travel · Crew · Gear + conditional Budget — porting the **complete** field set of the 14 tiles they subsume (not a visual subset, wp-19), preserving every visibility gate and the Schedule date-restriction privacy contract, with the Gear scope gate→emphasis flip (D-5).

**Tech Stack:** Next.js RSC, TypeScript strict, Tailwind v4 tokens. Vitest (`pnpm vitest run <path>`). Each section reads viewer `roleFlags`/restrictions off `data.crewMembers` (resolved for the viewer), not a separate prop.

**Anti-tautology rules (apply to every test below):** (a) assert against the **data source** (the fixture field), not the rendered container; (b) when scanning the DOM for a label another block also renders (a contact name in both Today "Need something" and Crew), **clone the tree and remove the sibling block** before scanning; (c) derive every expected count/value from the fixture dimensions; (d) each test states its concrete `_Catches:_` failure mode.

---

### Task 1: TodaySection — hero + key-times + curated cards + 5-source notes

**Files:**
- Create: `components/crew/sections/TodaySection.tsx`
- Test: `tests/components/crew/sections/TodaySection.test.tsx`

Ports: `RightNowHero` (Phase 2), `KeyTimesStrip`+`resolveKeyTimes` (Phase 1/2), `NotesTile` 5-source aggregation (`components/tiles/NotesTile.tsx:128-171`, order venue→hotel→room→transport→contact, `SOURCE_CAP=8` `:58`, `TRUNCATE_AT=280` `:57`), `selectPrimaryContact` (Phase 2), dress code (`event_details.{dress_code,dress,attire}`, `ShowStatusTile.tsx:69`). Covers §9 tests 2, 11, 25, 30.

- [ ] **Step 1: Write the failing test — fixed curated blocks + hero drives date-awareness (test 2, 11)**

```tsx
// tests/components/crew/sections/TodaySection.test.tsx
import { render } from "@testing-library/react";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { showForViewerFixture } from "@/tests/fixtures/showForViewer"; // existing fixture builder; grep tests/ for the canonical one

test("Today renders hero + key-times + Tonight/Where/Need-something + dress + notes, with NO selectTodayTiles band", () => {
  const data = showForViewerFixture({
    rooms: [{ id: "r1", kind: "gs", set_time: "11:00 AM", show_time: "1:00 PM", strike_time: "9:00 PM", name: "Main" }],
    hotelReservations: [{ ordinal: 0, name: "Hyatt", address: "1 St", check_in: "2026-05-13", check_out: "2026-05-15" }],
    venue: { name: "Center", timezone: "America/New_York" },
    contacts: [{ kind: "venue", name: "Sam", phone: "555-111-2222", email: null }],
    show: { event_details: { dress_code: "Business casual" } },
  });
  const { container } = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  // anti-tautology: assert the section renders a hero region + a key-times strip + the curated cards
  expect(container.querySelector('[data-testid="right-now-hero"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="key-times-strip"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-tonight"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-where"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="today-need-something"]')).toBeTruthy();
  // dress code from the fixture value, not hardcoded:
  expect(container.textContent).toContain(data.show.event_details.dress_code);
  // the deleted selectTodayTiles band must NOT be present:
  expect(container.querySelector('[data-testid="today-band"]')).toBeNull();
});
// _Catches: a curated block silently dropped or duplicated; Today accidentally retaining the deleted selectTodayTiles tile-promotion band; date-awareness lost (hero absent).
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx` → FAIL ("Cannot find module .../TodaySection").

- [ ] **Step 3: Write the failing test — 5-source notes aggregation + transport-gated transport note (test 25)**

```tsx
test("Show notes aggregate all 5 sources in order, transport note gated by transportTileVisible", () => {
  const data = showForViewerFixture({
    venue: { name: "V", notes: "VENUE_NOTE" },
    hotelReservations: [{ ordinal: 0, name: "H", notes: "HOTEL_NOTE" }],
    rooms: [{ id: "r1", kind: "gs", name: "GS", notes: "ROOM_NOTE" }],
    transportation: { parking: null, notes: "TRANSPORT_NOTE", legs: [] },
    contacts: [{ kind: "venue", name: "C", notes: "CONTACT_NOTE", phone: "555-0000", email: null }],
  });
  // admin (or assigned) sees transport note:
  const admin = render(<TodaySection data={data} viewer={{ kind: "admin" }} />);
  const notes = admin.container.querySelector('[data-testid="today-notes"]')!;
  const order = ["VENUE_NOTE", "HOTEL_NOTE", "ROOM_NOTE", "TRANSPORT_NOTE", "CONTACT_NOTE"]
    .map((s) => notes.textContent!.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order]).toEqual([...order].sort((a, b) => a - b)); // ascending = source order preserved
  // unassigned crew does NOT see the transport note (transportTileVisible false):
  const crew = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} />);
  expect(crew.container.querySelector('[data-testid="today-notes"]')!.textContent).not.toContain("TRANSPORT_NOTE");
});
// _Catches: dropping hotel/room/transport/contact notes when the NotesTile aggregator is deleted; transport notes leaking to unassigned crew.
```

- [ ] **Step 4: Run to verify it fails** — FAIL.

- [ ] **Step 5: Write the failing test — client_contact NOT rendered (test 30) + Need-something uses selectPrimaryContact**

```tsx
test("client_contact never appears; Need-something uses the deterministic actionable contacts[] primary", () => {
  const data = showForViewerFixture({
    show: { client_contact: { name: "CLIENT_REP", phone: "555-999-0000", email: "rep@client.com" } },
    contacts: [
      { kind: "venue", name: "Unactionable", phone: null, email: null },
      { kind: "in_house_av", name: "AV_LEAD", phone: "555-222-3333", email: null },
    ],
  });
  const { container } = render(<TodaySection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(container.textContent).not.toContain("CLIENT_REP");
  expect(container.textContent).not.toContain("555-999-0000");
  // Need-something picks the actionable AV_LEAD (selectPrimaryContact), not the first (unactionable) entry:
  const need = container.querySelector('[data-testid="today-need-something"]')!;
  expect(need.textContent).toContain("AV_LEAD");
});
// _Catches: a new client-PII exposure via Today; a nondeterministic/blank-phone "Need something" card.
```

- [ ] **Step 6: Run to verify it fails** — FAIL.

- [ ] **Step 7: Implement `TodaySection`** — Server Component that: resolves the viewer's `roleFlags`/`dateRestriction` from `data.crewMembers`; builds `RightNowContext` via the (Phase-1) `buildRightNowContext({ show: data.show, dateRestriction, hotelReservations: data.hotelReservations, rooms: data.rooms })` and renders `<RightNowHero context={...} data-testid="right-now-hero" />`; renders `<KeyTimesStrip anchors={resolveKeyTimes(data.show, data.rooms)} />`; renders Tonight (`SectionCard` with `data.hotelReservations[0]` name + `KeyValueRows`), Where (`SectionCard` with `data.venue`), Need-something (`PersonRow` for `selectPrimaryContact(data.contacts)`, omitted when null), Dress code (`shouldHideGenericOptional`-guarded), and Show notes (the 5-source aggregation with `SOURCE_CAP`/`TRUNCATE_AT`, transport note wrapped in `transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })`). Add the `data-testid`s the tests assert. Read `client_contact` **nowhere**.

- [ ] **Step 8: Run all three tests to pass** — `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx` → PASS.

- [ ] **Step 9: Commit** — `git add components/crew/sections/TodaySection.tsx tests/components/crew/sections/TodaySection.test.tsx && git commit -m "feat(crew-page): TodaySection (hero + key-times + curated cards + 5-source notes)"`

---

### Task 2: ScheduleSection — DateRestriction privacy + timezone today-pin

**Files:**
- Create: `components/crew/sections/ScheduleSection.tsx`
- Test: `tests/components/crew/sections/ScheduleSection.test.tsx`

Ports `ScheduleTile` privacy contract + `todayIsoInShowTimezone`/`resolveShowTimezone(venue.timezone)` (`ScheduleTile.tsx:170`), server `nowDate()` clock. Covers §9 tests 32, 34. Uses `DayCard` (Phase 2) + `KeyTimesStrip`.

- [ ] **Step 1: Write the failing test — the three DateRestriction branches (test 32, the privacy trust boundary)**

```tsx
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { showForViewerFixture } from "@/tests/fixtures/showForViewer";

const base = showForViewerFixture({
  show: { dates: { travelIn: "2026-05-12", set: "2026-05-13", showDays: ["2026-05-14", "2026-05-15"], travelOut: "2026-05-16" }, schedule_phases: {} },
});

test("unknown_asterisk renders the unconfirmed placeholder and ZERO day cards / date text", () => {
  const data = { ...base, crewMembers: [{ id: "c1", dateRestriction: { kind: "unknown_asterisk" }, roleFlags: [] }] };
  const { container } = render(<ScheduleSection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(container.querySelector('[data-testid="schedule-unconfirmed"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(0);
  // no show-day date leaks into the DOM:
  for (const d of base.show.dates.showDays) expect(container.textContent).not.toContain(d);
});

test("explicit renders only the intersection; none renders all", () => {
  const explicit = { ...base, crewMembers: [{ id: "c1", dateRestriction: { kind: "explicit", days: ["2026-05-14"] }, roleFlags: [] }] };
  const e = render(<ScheduleSection data={explicit} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(e.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(1); // only the assigned day
  const none = { ...base, crewMembers: [{ id: "c1", dateRestriction: { kind: "none" }, roleFlags: [] }] };
  const n = render(<ScheduleSection data={none} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(n.container.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(base.show.dates.showDays.length);
});
// _Catches: treating unknown_asterisk like none and leaking the show's dates to unconfirmed crew — a trust-boundary regression from ScheduleTile.
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Write the failing test — show-timezone today-pin (test 34)** — with a frozen `X-Screenshot-Frozen-Now` near a day boundary and a non-local `venue.timezone`, the "today" pin lands on the show-timezone date. (Set the frozen header per the repo's test-auth helper; grep `tests/` for `X-Screenshot-Frozen-Now` usage. Assert the `[data-testid="schedule-day-today"]` element keys the show-timezone ISO date, not the UTC date.)

- [ ] **Step 4: Run to verify it fails** — FAIL.

- [ ] **Step 5: Implement `ScheduleSection`** — resolve `dateRestriction` from `data.crewMembers`; switch: `unknown_asterisk` → render only `<div data-testid="schedule-unconfirmed">` (no day cards, no date text); `explicit` → render `DayCard` only for the intersection of `showDays` ∩ assigned days; `none` → all `showDays`. Pin today via `todayIsoInShowTimezone(nowDate(), resolveShowTimezone(data.venue.timezone))`, mark the matching `DayCard` `data-testid="schedule-day-today"`. Render the Daily-times `<KeyTimesStrip anchors={resolveKeyTimes(data.show, data.rooms)} />` and an optional sentinel-guarded Heads-up note.

- [ ] **Step 6: Run to pass** — PASS.

- [ ] **Step 7: Commit** — `feat(crew-page): ScheduleSection (date-restriction privacy + timezone today-pin)`

---

### Task 3: VenueSection — address/dock/parking(gated)/wifi/COI/power/notes/map/diagrams

**Files:**
- Create: `components/crew/sections/VenueSection.tsx`
- Test: `tests/components/crew/sections/VenueSection.test.tsx`

Ports `VenueTile` + `DiagramsTile` (embedded-first + `isAllowedDiagramMime`, `DiagramsTile.tsx:68-88`) + `ShowStatusTile` fields (coi_status/power/internet/venue-notes) + `transportation.parking` behind `transportTileVisible` (§4.13a, NEW behind the same gate) + map-link `isParseableUrl` (`VenueTile.tsx:44-52`). Covers §9 tests 24, 33, and the parking half of 17.

- [ ] **Step 1: Write the failing test — ShowStatus field coverage + COI testid (test 24)**

```tsx
test("Venue homes coi_status (with data-testid=coi-status), power, internet, venue notes; sentinels hidden", () => {
  const data = showForViewerFixture({
    venue: { name: "Center", address: "5 Ave", coi_status: "Received", notes: "Dock at rear" },
    show: { event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" } },
  });
  const { container } = render(<VenueSection data={data} viewer={{ kind: "admin" }} />);
  expect(container.querySelector('[data-testid="coi-status"]')!.textContent).toContain("Received");
  expect(container.textContent).toContain("200A 3-phase");
  expect(container.textContent).toContain("SSID Guest / pw 1234"); // raw internet string in Phase 1
  expect(container.textContent).toContain("Dock at rear");
  // a sentinel coi_status is hidden:
  const sentinel = showForViewerFixture({ venue: { name: "C", coi_status: "TBD" } });
  const s = render(<VenueSection data={sentinel} viewer={{ kind: "admin" }} />);
  expect(s.container.querySelector('[data-testid="coi-status"]')).toBeNull();
});
// _Catches: deleting ShowStatusTile silently dropping COI/power/internet/notes from the crew page (AC-4.1).
```

- [ ] **Step 2: Run to fail** — FAIL.

- [ ] **Step 3: Write the failing test — parking gated + map-link guard (tests 17-parking, 33)**

```tsx
test("parking renders only when transportTileVisible; map link only when isParseableUrl", () => {
  const data = showForViewerFixture({
    venue: { name: "C", googleLink: "TBD" }, // sentinel → no map link
    transportation: { parking: "Lot B, $20", legs: [] },
  });
  const unassigned = render(<VenueSection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} />);
  expect(unassigned.container.textContent).not.toContain("Lot B"); // parking gated out
  expect(unassigned.container.querySelector('a[href^="http"]')).toBeNull(); // sentinel googleLink → no map link
  const admin = render(<VenueSection data={data} viewer={{ kind: "admin" }} />);
  expect(admin.container.textContent).toContain("Lot B"); // admin passes the gate
});
// _Catches: parking leaking to unassigned crew (§4.13a); a dead/unsafe map href surviving the port.
```

- [ ] **Step 4: Run to fail** — FAIL.

- [ ] **Step 5: Implement `VenueSection`** — `SectionCard`/`KeyValueRows` for address+room, loading dock; parking row wrapped in `transportTileVisible({ transportation: data.transportation, viewerName: data.viewerName, isAdmin })`; Wi-Fi (raw `data.show.event_details.internet`, sentinel-guarded); COI `<span data-testid="coi-status">` (sentinel-guarded); power; notes; map link only when `isParseableUrl(data.venue.googleLink)`; diagrams via the full `DiagramsTile` logic (embedded images first by cumulative ordinal, then linked-folder items, each gated on `snapshotPath !== null && isAllowedDiagramMime`, plus `agenda_links` PDFs). Section-level `EmptyState` when all blocks hidden.

- [ ] **Step 6: Run to pass** — PASS.

- [ ] **Step 7: Commit** — `feat(crew-page): VenueSection (address/dock/parking-gated/wifi/COI/power/notes/map/diagrams)`

---

### Task 4: TravelSection — gated ground transport (full field set) + hotel (ordinal)

**Files:**
- Create: `components/crew/sections/TravelSection.tsx`
- Test: `tests/components/crew/sections/TravelSection.test.tsx`

Ports the FULL `TransportTile` field set behind `transportTileVisible` + `LodgingTile` multi-reservation `ordinal` ordering (`LodgingTile.tsx:59-66`). Covers §9 test 17.

- [ ] **Step 1: Write the failing test — transport gate (Travel) + full field set + hotel ordinal (test 17)**

```tsx
test("unassigned crew see no ground-transport PII; admin sees the full field set; hotels stack by ordinal", () => {
  const data = showForViewerFixture({
    transportation: { driverName: "Pat", driverPhone: "555-7", vehicle: "Van", licensePlate: "ABC123", color: "Black",
      parking: "Lot A", legs: [{ assigned_names: ["someone"], pickup: "8AM" }], notes: "N" },
    hotelReservations: [
      { ordinal: 1, name: "Second", check_in: "2026-05-14" },
      { ordinal: 0, name: "First", check_in: "2026-05-13" },
    ],
  });
  const crew = render(<TravelSection data={data} viewer={{ kind: "crew", crewMemberId: "nobody" }} />);
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"]) expect(crew.container.textContent).not.toContain(pii);
  const admin = render(<TravelSection data={data} viewer={{ kind: "admin" }} />);
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"]) expect(admin.container.textContent).toContain(pii);
  // hotels render First (ordinal 0) before Second (ordinal 1) regardless of array order:
  const html = admin.container.textContent!;
  expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
});
// _Catches: leaking driver PII/vehicle/plate/parking/assignments to unassigned crew (trust-boundary regression); hotels ordering by array index instead of `ordinal`.
```

- [ ] **Step 2: Run to fail** — FAIL.

- [ ] **Step 3: Implement `TravelSection`** — Getting-there block wrapped in `transportTileVisible(...)`, rendering the full `TransportTile` shape (driver name/phone/email, vehicle, plate, color, parking, legs with `assigned_names`, notes) when visible, else omitted/empty-stated; hotel block sorts `data.hotelReservations` by `ordinal` (hairline divider on idx>0), shows name/address/conf#/dates + hotel notes. No flights (`flight_info` not in projection — render nothing, no false "not added" claim).

- [ ] **Step 4: Run to pass** — PASS.

- [ ] **Step 5: Commit** — `feat(crew-page): TravelSection (gated ground transport full field set + hotel ordinal)`

---

### Task 5: CrewSection — roster + key contacts (caps, two columns ≥720px)

**Files:**
- Create: `components/crew/sections/CrewSection.tsx`
- Test: `tests/components/crew/sections/CrewSection.test.tsx`

Ports `CrewTile` (`CREW_INLINE_CAP=8`) + `ContactsTile` (`CONTACTS_INLINE_CAP=6`) via `PersonRow`. Covers §9 tests 27 (these two caps), 30 (no client_contact).

- [ ] **Step 1: Write the failing test — cap boundary cap-1/cap/cap+1 (test 27), derived from fixture length**

```tsx
import { CREW_INLINE_CAP } from "@/components/crew/sections/CrewSection"; // re-export the cap constant for the test
test.each([CREW_INLINE_CAP - 1, CREW_INLINE_CAP, CREW_INLINE_CAP + 1])("roster cap boundary at %i", (n) => {
  const crewMembers = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Member ${i}`, roleFlags: [], dateRestriction: { kind: "none" } }));
  const { container } = render(<CrewSection data={showForViewerFixture({ crewMembers })} viewer={{ kind: "crew", crewMemberId: "c0" }} />);
  const shown = container.querySelectorAll('[data-testid="crew-person-row"]').length;
  const stub = container.querySelector('[data-tile-show-more]');
  if (n <= CREW_INLINE_CAP) { expect(shown).toBe(n); expect(stub).toBeNull(); }
  else { expect(shown).toBe(CREW_INLINE_CAP); expect(stub!.textContent).toContain(String(n - CREW_INLINE_CAP)); } // +N more, N = length − cap
});
// _Catches: unbounded mobile roster scroll; lost overflow affordance / wrong count after the tile view is deleted.
```

- [ ] **Step 2: Run to fail** — FAIL.

- [ ] **Step 3: Implement `CrewSection`** — two-column layout (`items-stretch` + `h-full` at `≥720px`, single-column stack `<720px`, §4.9 invariant 2): Show crew (`PersonRow` per `crewMembers`, `you` flag when `id===viewer.crewMemberId`, `lead` tag from roleFlags, cap 8 + `data-tile-show-more` "+N more") | Key contacts (`PersonRow` per `contacts` venue/in_house_av only — **not** client_contact, cap 6 + `data-testid="contacts-overflow-stub"`). Re-export `CREW_INLINE_CAP`/`CONTACTS_INLINE_CAP`.

- [ ] **Step 4: Run to pass** — PASS.

- [ ] **Step 5: Commit** — `feat(crew-page): CrewSection (roster + key contacts, caps + two columns)`

---

### Task 6: GearSection — A/V/L emphasis (NOT gate) + pack list (gated) + keynote + opening reel

**Files:**
- Create: `components/crew/sections/GearSection.tsx`
- Test: `tests/components/crew/sections/GearSection.test.tsx`

The gate→emphasis flip (D-5): `audioScopeVisible`/`videoScopeVisible`/`lightingScopeVisible` become an **emphasis** signal (sort-first + accent), not a gate — all scope shown to everyone. Pack list keeps `isPackListVisibleToday` gate (`CASE_CAP=12`). Opening reel via `stripOpeningReelText` (`lib/visibility/openingReelText.ts:56`). Covers §9 tests 7, 18, 26, 27 (pack-list cap). **The old `{Audio,Video,Lighting}ScopeTile.tsx` are deleted in Phase 4 — their predicates survive ONLY as the emphasis signal here.**

- [ ] **Step 1: Write the failing test — emphasis is not a gate; empty scope omitted; viewer-discipline first (test 7)**

```tsx
test("all scope shown to everyone; viewer's discipline first + [data-emphasis=you]; empty scope omitted incl viewer's own", () => {
  const data = showForViewerFixture({
    rooms: [{ id: "r1", kind: "gs", name: "GS", audio: ["mic"], video: ["cam"], lighting: [] }], // lighting empty
    crewMembers: [{ id: "c1", roleFlags: ["A1"], dateRestriction: { kind: "none" } }], // A1 → audio discipline
  });
  const { container } = render(<GearSection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  const cards = [...container.querySelectorAll('[data-testid^="gear-scope-"]')];
  // audio + video render (lighting omitted — empty); audio first (viewer's discipline) + carries the emphasis marker:
  expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(["gear-scope-audio", "gear-scope-video"]);
  expect(cards[0].getAttribute("data-emphasis")).toBe("you");
  expect(container.querySelector('[data-testid="gear-scope-lighting"]')).toBeNull(); // empty scope omitted, NOT a gate
});

test("no-flag viewer → default order, no emphasis; all-empty → section EmptyState", () => {
  const noFlag = showForViewerFixture({ rooms: [{ id: "r1", kind: "gs", audio: ["mic"], video: ["cam"], lighting: ["par"] }],
    crewMembers: [{ id: "c1", roleFlags: [], dateRestriction: { kind: "none" } }] });
  const a = render(<GearSection data={noFlag} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect([...a.container.querySelectorAll('[data-testid^="gear-scope-"]')].map((c) => c.getAttribute("data-emphasis"))).toEqual([null, null, null]);
  const empty = showForViewerFixture({ rooms: [], pullSheet: null, openingReelHasVideo: false });
  const b = render(<GearSection data={empty} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(b.container.querySelector('[data-testid="section-empty"]')).toBeTruthy();
});
// _Catches: emphasis becoming a gate (audio tech can't see lighting); an empty "Your scope" shell; missing section EmptyState.
```

- [ ] **Step 2: Run to fail** — FAIL.

- [ ] **Step 3: Write the failing test — opening-reel URL strip (test 26) + pack-list gate (test 18)**

```tsx
test("opening-reel cell is text-only — no Drive URL in the DOM", () => {
  const data = showForViewerFixture({ show: { event_details: { opening_reel: "YES - https://drive.google.com/file/d/abc/view" } }, openingReelHasVideo: true });
  const { container } = render(<GearSection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  const html = container.innerHTML;
  for (const leak of ["https://", "drive.google.com", "docs.google.com"]) expect(html).not.toContain(leak);
});

test("pack list omitted when isPackListVisibleToday is false", () => {
  // fixture stageRestriction not overlapping the day's pack-list phase → omitted (derive from fixture, not hardcoded)
  const withheld = showForViewerFixture({ pullSheet: [{ caseLabel: "C1", items: [] }], /* stage/phase set so the gate is false */ });
  const { container } = render(<GearSection data={withheld} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(container.querySelector('[data-testid="gear-pack-list"]')).toBeNull();
});
// _Catches: leaking raw Drive URLs off OpeningReelTile; pull-sheet details leaking on withheld days once the pack list lives in a persistent tab.
```

- [ ] **Step 4: Run to fail** — FAIL.

- [ ] **Step 5: Implement `GearSection`** — derive the viewer's scope flags from `data.crewMembers`. Build the three scope cards (audio/video/lighting) from `data.rooms` aggregated scope, **omitting any with zero items** (incl. the viewer's own); order = viewer's discipline card(s) first (flag order for multiple), else Audio→Video→Lighting; the viewer's card(s) get `data-emphasis="you"` + a "Your scope" eyebrow + accent left-edge (≤10% accent coverage); non-viewer cards neutral full-content. Keep distinct glyphs (Volume2/Video/Lightbulb). Pack list: render only when `isPackListVisibleToday({ show: data.show, restriction: stageRestriction, today: nowDate-in-tz })`, cap 12 + `data-tile-show-more`. Keynote requirements (`event_details.keynote_requirements`, sentinel-guarded). Opening reel: `openingReelHasVideo && !shouldHideOpeningReel(...)` → text-only status via `stripOpeningReelText(data.show.event_details.opening_reel)` + the proxied `OpeningReelVideo` player (kept module). All-empty → `<div data-testid="section-empty">EmptyState`.

- [ ] **Step 6: Run to pass** — PASS.

- [ ] **Step 7: Commit** — `feat(crew-page): GearSection (A/V/L emphasis + pack list gated + keynote + opening reel URL-strip)`

---

### Task 7: BudgetSection — lead-gated, single predicate

**Files:**
- Create: `components/crew/sections/BudgetSection.tsx`
- Test: `tests/components/crew/sections/BudgetSection.test.tsx`

Renders `data.financials` only when `financialsVisible(viewerFlags, isAdmin)`. The same predicate gates the tab + `resolveActiveSection` (Phase 2) + this section — never a divergent gate. Covers §9 test 8.

- [ ] **Step 1: Write the failing test — single-predicate gate (test 8)**

```tsx
import { financialsVisible } from "@/lib/visibility/scopeTiles";
test("BudgetSection renders financials iff financialsVisible; the SAME predicate drives resolveActiveSection", () => {
  const lead = showForViewerFixture({ financials: { po: "PO-1", proposal: "P", invoice: "I", notes: "N" },
    crewMembers: [{ id: "c1", roleFlags: ["LEAD"], dateRestriction: { kind: "none" } }] });
  const l = render(<BudgetSection data={lead} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(l.container.textContent).toContain("PO-1");
  const nonLead = { ...lead, crewMembers: [{ id: "c1", roleFlags: [], dateRestriction: { kind: "none" } }], financials: undefined };
  // resolveActiveSection (Phase 2) must agree: a non-lead direct ?s=budget falls back to today
  expect(resolveActiveSection("budget", { budgetVisible: financialsVisible([], false) })).toBe("today");
});
// _Catches: lead-only financials leaking to non-leads via direct URL; a dead tab; a divergent gate across the three Budget surfaces.
```

- [ ] **Step 2: Run to fail** — FAIL. **Step 3: Implement `BudgetSection`** — `SectionCard`/`KeyValueRows` over `data.financials` (PO/proposal/invoice/notes), rendered by the caller only when `financialsVisible` true (the section itself can defensively no-op when `data.financials` absent). **Step 4: Run to pass.** **Step 5: Commit** — `feat(crew-page): BudgetSection (lead-gated, single predicate)`

---

### Task 8: Section-level empty states + sentinel-hiding meta-test coverage

**Files:**
- Modify: each `*Section.tsx` (ensure the all-blocks-empty → `EmptyState` path)
- Test: `tests/components/crew/sections/sectionEmptyState.test.tsx`
- Verify: `tests/components/tiles/_metaSentinelHidingContract.test.ts` (already extended in Phase 2 to walk `components/crew/`) now covers the new section files.

Covers §9 test 9.

- [ ] **Step 1: Write the failing test — every section collapses to one EmptyState when all blocks empty (test 9)**

```tsx
test.each([["VenueSection"], ["TravelSection"], ["CrewSection"], ["GearSection"]])("%s shows one EmptyState when all blocks empty/hidden", (name) => {
  const Section = require(`@/components/crew/sections/${name}`)[name];
  const empty = showForViewerFixture({ venue: { name: null }, rooms: [], transportation: null, hotelReservations: [], contacts: [], pullSheet: null, diagrams: null, openingReelHasVideo: false });
  const { container } = render(<Section data={empty} viewer={{ kind: "crew", crewMemberId: "c1" }} />);
  expect(container.querySelectorAll('[data-testid="section-empty"]').length).toBe(1);
});
// _Catches: a blank section with no empty-state, or multiple stray empty stubs.
```

- [ ] **Step 2: Run to fail** — FAIL. **Step 3: Implement** the all-empty → single `EmptyState` guard in each section. **Step 4: Run to pass.**

- [ ] **Step 5: Verify the sentinel meta-test now covers the new files** — `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts` → PASS (the Phase-2 `listTileFiles()` extension to `components/crew/` now walks every `*Section.tsx`; any section reading a generic-optional field without `shouldHideGenericOptional` fails here). If a section trips it, route that field read through `shouldHideGenericOptional` and re-run.

- [ ] **Step 6: Commit** — `feat(crew-page): section-level empty states + sentinel-hiding coverage`

---

## Phase exit criteria

- [ ] All seven `*Section.tsx` exist; each renders only when its caller selects it (Budget only when `financialsVisible`).
- [ ] §9 tests green: 2, 7, 8, 9, 11, 17, 18, 24, 25, 26, 27, 30, 32, 33, 34.
- [ ] Every field from the 14 tiles has a section home (wp-19 field-coverage audit): ShowStatus → Header(pill, Phase 2)/Venue(coi/power/internet/notes)/Today(dress)/Gear(keynote); Notes → Today 5-source; Transport → Travel (full set, gated); Diagrams → Venue (full, incl agenda_links); PackList → Gear (full item shape, gated); Lodging → Travel (ordinal); Contacts/Crew → Crew; Opening Reel → Gear (URL-stripped + kept media player).
- [ ] `client_contact` appears in NO crew DOM (test 30).
- [ ] `_metaSentinelHidingContract.test.ts` green for all new `components/crew/sections/*` files.
- [ ] `pnpm tsc --noEmit` clean.
- [ ] One commit per task (conventional-commits `feat(crew-page):`/`test(crew-page):`).
