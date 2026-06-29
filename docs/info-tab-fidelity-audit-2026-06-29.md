# INFO-tab data-fidelity audit — Consultants Roundtable

**Date:** 2026-06-29
**Show:** AII/III - Consultants Roundtable 2025
**Source sheet:** `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4` (tabs: INFO, GEAR, AGENDA, DIAGRAMS, FORM, LIST, CONTACTS, DROP DOWN)
**Surfaces audited:** parser (`lib/parser/**`) → Step-3 review "More" modal (`components/admin/wizard/Step3SheetCard.tsx`) → published crew page (`app/show/[slug]/[shareToken]`, `components/crew/sections/**`)
**Method:** the live INFO tab + GEAR tab were read via the gsheets service account, distilled into a 66-field catalog, then three parallel agents mapped each field across the three surfaces. A synthesis pass joined the maps; every "missing/dropped" claim was then adversarially re-verified by **running the real parser** on `fixtures/shows/exporter-xlsx/consultants.md` and grepping the live render components. Findings below carry verified `file:line` evidence.

> **Data classes used below**
> - **DROPPED-BY-PARSER** — the value never enters the system. Worst class; fix is in the parser.
> - **PARSED-NOT-RENDERED** — the parser captures it, but no surface displays it. Fix is render-only.
> - **REVIEW-ONLY GAP** — reaches the published crew page but not the operator's pre-publish review modal.
> - **FIDELITY BUG** — value present but mangled, duplicated, or misattributed.
> - **BY-DESIGN** — intentional omission/filtering (privacy, personalization). Not a defect.

---

## Findings (prioritized)

### 🔴 H1 — Dress code is dropped by the parser (DROPPED-BY-PARSER) → `BL-PARSER-DRESS-DROP`

The INFO `DRESS` block (`Set/Strike: Black Pants, Black Polo…` / `Show: Black Pants, Black Long Sleeve…`) is never captured. `parseEventDetails` slices markdown starting at the `DETAILS` header (`lib/parser/blocks/event.ts:135`); the DRESS block sits **before** that header, so the `dress`/`attire`→`dress_code` aliases (`event.ts:97-100`) never fire. `crew.ts:34` uses `"DRESS"` only as a *terminator*, never a capture. No `parseDress` exists anywhere. Verified by running the parser: `parseEventDetails(...).dress_code === undefined` on both fixture families. Consumer `TodaySection.tsx:297-299,467` therefore renders the dress card as `null`. **Systemic** — DRESS-before-DETAILS is the standard exporter template, so this affects every show.

### 🔴 H2 — Room gear-merge mismatch duplicates the lunch room + emits phantom cards (FIDELITY BUG) → `BL-ROOM-GEAR-MERGE-DEDUP`

`mergeGearIntoRooms` (`lib/parser/index.ts:355`) matches a GEAR room to an INFO room only when **both** `kind` *and* a normalized name token are equal. For the lunch room: INFO = `breakout` / `"BALLROOM C"`; GEAR = `additional` / `"GRAND BALLROOM C"` (the token normalizer at `index.ts:328-336` strips `LUNCH SESSION` but not `GRAND`). Double miss → the room becomes **two cards** (set/show/strike times on one, A/V gear on the other). Plus `parseAdditionalRoomFields` (`rooms.ts:152-169`) emits a generic empty **"Additional rooms"** card, and GEAR's **"FOYER"** is appended unmatched. Verified by running `parseSheet()` → exactly 9 rooms, matching the screenshot. No dedup pass exists; both the review modal (`Step3SheetCard.tsx:327-368`) and crew `GearSection.tsx:155-158` render the array verbatim.

### 🔴 H3 — Technical DETAILS block is mostly invisible (PARSED-NOT-RENDERED) → `BL-EVENT-DETAILS-UNRENDERED`

The parser captures all 19 `DETAILS` keys (`event.ts` CANONICAL_KEY_MAP + `aliases.ts:122-131`), but **14 reach no surface**. The crew page reads only 5 keys — `dress_code` (broken, see H1), `internet`, `power` (`VenueSection.tsx:132-135`), `keynote_requirements`, `opening_reel` (`GearSection.tsx:185,191`). The review modal renders only 2 — `keynote_requirements` + `opening_reel` (`Step3SheetCard.tsx:380-385`). Never rendered anywhere: **Stage Size (8'×24'×2'), GS Podium Type, Polling, LED, Backdrop/Scenic, Equipment Storage, Test Pattern, Fonts** (+ sentinel-valued Virtual Speaker/Audience, Record, Staff Office, Notes, Floor Plan, Room Diagram). No component iterates the `event_details` map.

### 🟠 M1 — Per-room setup / dimensions / floor / per-room times not delivered (mixed) → `BL-ROOM-DETAIL-UNRENDERED`

`room.setup` ("Chevron theater for 60", "Boardroom for 12"), `room.floor`, and per-room set/show/strike times are captured by the parser (`rooms.ts:167,376-378,623-625…`) but read by **zero** components; per-room times collapse only into the show-wide `KeyTimesStrip` (`resolveKeyTimes.ts:110-124`). **GS dimensions** (82'×63'×14') are a genuine parse drop — they live in a standalone row matching no room header, so `room.dimensions` is null. Review modal renders name+kind+gear only (`ROOM_SCOPE_FIELDS`, `Step3SheetCard.tsx:87-93`).

### 🟠 M2 — Step-3 review modal is blind at the publish gate (REVIEW-ONLY GAP) → `BL-REVIEW-MODAL-COMPLETENESS`

The modal body is exactly 6 BreakdownSections + Agenda + Warnings (`Step3SheetCard.tsx:1431-1472`). A whole-file grep returns zero references to transport / loadingDock / client_contact / contacts / coi / proposal / po / dress / hotelContact. So the operator cannot pre-publish-verify: **transportation (T1-T7), loading dock (V3), COI/Proposal/PO# (O1-O3), client contact (C2-C4), in-house AV (O5), hotel contact (O4), 17/19 event-details, crew phone, venue address, hotel address** — all of which DO render on the published crew page.

### 🟠 M3 — Show title is mangled (FIDELITY BUG) → `BL-TITLE-EVENT-NAME-PREFERENCE`

`extractTitleFromMarkdown` priority #1 (`lib/parser/index.ts:121-133`) returns the first `"Event Name:"` cell — the GEAR/intake value `"AII/III - CONSULTANTS ROUNDTABLE"` (uppercased, `2025` dropped) — before the line-1 banner `"AII/III - Consultants Roundtable 2025"` (priority #6). Mangled title renders on the crew header (`Header.tsx:83,98`) and the review-modal source-sheet link (`Step3SheetCard.tsx:10`).

### 🟡 M4/L1 — Partial-attendance qualifier invisible to teammates (PARSED-NOT-RENDERED) → `BL-CREW-PARTIAL-ATTENDANCE-CHIP`

`(10/7 ONLY)` / `(10/7 and 10/9 ONLY)` are correctly stripped from the name into `date_restriction` (`personalization.ts:118-126`, `crew.ts:292,344`) and drive the viewer's *own* schedule (`ScheduleSection.tsx:182-186`, `TodaySection.tsx:196-233`). But no roster surface renders a badge — `CrewSection.tsx:175-183` (crew) and `CrewBreakdown` (`Step3SheetCard.tsx:194-199`) show name+role only. No teammate can see who is partial-attendance.

---

## By-design / not defects (verified)

- **Hotel confirmation numbers (H2)** are deliberately nulled by the parser for the inline hotel format (`hotels.ts:435`); `TravelSection.tsx:419-425` only renders the row when truthy. Intentional privacy.
- **Hotel contact (O4)** "Jenae Denne" *does* reach crew — mapped to a `kind="venue"` ContactRow (`contacts.ts:31,91-92`) and shown under "Key contacts" labeled **Venue** (venue == the hotel). Only a label nuance.
- **Personalization** — crew see only their own hotel/transport/budget. Intentional (`personalization.ts`, viewer name-match).

---

## Field-by-field table (66 fields)

`parsed` / `review` / `crew` = yes | partial | no.

| ID | Field | parsed | review | crew | Verdict |
|----|-------|--------|--------|------|---------|
| TITLE | Show title | partial | yes | yes | M3 — mangled (uppercased, year dropped) |
| C1 | Client name | yes | yes | yes | OK |
| C2 | Client contact name | yes | no | no | parsed; review-omission (M2) |
| C3 | Client phone | yes | no | no | parsed; review-omission (M2) |
| C4 | Client email | yes | no | no | parsed; review-omission (M2) |
| V1 | Venue name | yes | yes | yes | OK |
| V2 | Venue address | yes | no | yes | review-only gap (M2) |
| V3 | Loading dock | yes | no | yes | review-only gap (M2) |
| D1 | Travel/Set + LOAD IN/SETUP | yes | yes | yes | OK |
| D2 | Show Day 1 run-of-show | yes | yes | yes | OK |
| D3 | Show Day 2 run-of-show | yes | yes | yes | OK |
| D4 | Travel-out day | yes | yes | yes | OK |
| CR1-CR4 | Doug/John/Alex/Eric + role | yes | yes | yes | OK |
| CR5 | Calvin Saller / BO | yes | yes | yes | OK (name+role; qualifier → CR-QUAL) |
| CR6 | Kari Rose / BO | yes | yes | yes | OK (name+role; qualifier → CR-QUAL) |
| CR-QUAL | Partial-attendance qualifiers | partial | no | no | M4 — relocated to date_restriction, no teammate-visible badge |
| CR-PHONE | Crew phone numbers | yes | no | yes | review-only gap (M2) |
| DR1 | Set/Strike dress | **no** | no | no | **H1 — DROPPED-BY-PARSER** |
| DR2 | Show dress | **no** | no | no | **H1 — DROPPED-BY-PARSER** |
| LK1 | Document folder link | no | no | no | N/A — source empty this sheet |
| AG1 | Agenda PDF link | yes | yes | yes | OK |
| T1-T7 | Transportation (driver/vehicle/parking/pickups) | yes | no | yes | review-only gap (M2) |
| H1 | Hotel name+address | yes | partial | yes | review shows name only (M2) |
| H2 | Per-crew confirmation numbers | no | no | no | by-design (privacy null) |
| H3 | Check in/out | yes | yes | yes | OK |
| O1 | COI status | yes | no | yes | review-only gap (M2) |
| O2 | Proposal | yes | no | yes | review-only gap (M2) |
| O3 | PO# | yes | no | yes | review-only gap (M2) |
| O4 | Hotel Contact Info | yes | no | yes | reaches crew as "Venue" contact (by-design label nuance) |
| O5 | In-House AV | yes | no | yes | review-only gap (M2) |
| DT1 | Floor Plan (LINK) | yes | no | no | PARSED-NOT-RENDERED (low) |
| DT2 | Room Diagram (LINK) | yes | no | no | PARSED-NOT-RENDERED (low) |
| DT3 | LED | yes | no | no | **H3** |
| DT4 | Backdrop/Scenic | yes | no | no | **H3** |
| DT5 | Stage Size 8'×24'×2' | yes | no | no | **H3** (show-critical) |
| DT6 | Opening Reel | yes | yes | yes | OK |
| DT7 | Keynote Requirements | yes | yes | yes | OK |
| DT8 | Virtual Speaker (N/A) | yes | no | no | sentinel, low |
| DT9 | Virtual Audience (N/A) | yes | no | no | sentinel, low |
| DT10 | GS Podium Type | yes | no | no | **H3** |
| DT11 | Record (N/A) | yes | no | no | sentinel, low |
| DT12 | Polling (YES) | yes | no | no | **H3** |
| DT13 | Internet/Wifi+passcode | yes | no | yes | review-only gap (M2) |
| DT14 | Power (100-amp 3 phase) | yes | no | yes | review-only gap (M2) |
| DT15 | Equipment Storage | yes | no | no | **H3** |
| DT16 | Staff Office Room (TBD) | yes | no | no | sentinel, low |
| DT17 | Test Pattern | yes | no | no | **H3** |
| DT18 | Fonts | yes | no | no | **H3** |
| DT19 | Notes (N/A) | yes | no | no | sentinel, low |
| R-GS | General Session / Grand Ballroom A/B | yes | yes | partial | M1 — dims null, floor/setup unrendered, times aggregate-only |
| R-BO1..4 | Breakouts (Delaware/Lasalle/Walton/State B) | yes | yes | partial | M1 — name+gear only; setup/floor/times unrendered |
| R-LUNCH | Lunch Room / Ballroom C | partial | yes | partial | **H2 — duplicated**; setup/dims/times unrendered |
| R-SUBFIELDS | Per-room dims/floor/setup/times | partial | no | partial | M1 (dims = parse drop; rest = render gap) |
| R-GEAR | Per-room A/V/L/Scenic gear | partial | yes | yes | OK except H2 merge miss → phantom rooms |

---

## Recommended sequencing

1. **Parser-only cluster** (non-UI, TDD, low risk): H1 dress drop, H2 room dedup, M3 title preference, M1 GS-dimension parse. Cleanest wins.
2. **Render surfaces** (Opus + impeccable v3): H3 tech-specs card, M1 per-room detail, M4 partial-attendance chip.
3. **Review-modal completeness** (M2): operator-only sections so the publish gate sees everything the crew page shows.

Tracked as `BL-PARSER-DRESS-DROP`, `BL-ROOM-GEAR-MERGE-DEDUP`, `BL-EVENT-DETAILS-UNRENDERED`, `BL-ROOM-DETAIL-UNRENDERED`, `BL-REVIEW-MODAL-COMPLETENESS`, `BL-TITLE-EVENT-NAME-PREFERENCE`, `BL-CREW-PARTIAL-ATTENDANCE-CHIP` in `BACKLOG.md`.
