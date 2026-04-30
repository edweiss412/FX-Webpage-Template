# Show Doc Schema Diff

Cross-fixture analysis of 13 Doug Larson Institutional Investor show docs (May 2024 → May 2026). The 2026 sheets (`2026-03-rpas-central-four-seasons.md`, `2026-04-asset-mgmt-cfo-coo-waldorf.md`, `2026-05-fintech-forum-cto-summit.md`) are the canonical "current template"; earlier sheets are degraded ancestors. Filenames in this doc are relative to `fixtures/shows/`.

---

## 1. Top-level structure (tabs / blocks)

Doug's sheet has historically been one workbook with multiple named tabs. The corpus exposes them as flat markdown, so "tab" here means a recognizable block.

| Block | Universal? | Notes |
|---|---|---|
| **INFO** (client, dates, crew, venue, transport, hotel, ops, event details, GS, BO, ADD'L) | **Yes** — every fixture | The primary content target. Layout reorders by year (see §2). |
| **AGENDA** (per-day timeline grid) | Yes in all `raw/`; minimal/missing in `email-embedded/` | Empty rows in newer sheets — Doug pre-builds the time grid before content arrives. |
| **GEAR** (per-day rental quantity grid) | Yes in all `raw/` from 2025 onward; absent in `2024-05-east-coast-family-office.md` | Format normalized to a Chip-style PROPOSAL grid by 2026 — see §5. |
| **DIAGRAMS** | Implied by `DIagrams \| LINK` (typo preserved) cell in 2025-10-FITS, 2026-03, 2026-04, 2026-05; not a separate parseable block | Drive folder link only; no inline content. |
| **PULL SHEET** | Only in `2024-05-east-coast-family-office.md` and `2025-05-redefining-fixed-income-private-credit.md` | Per-case packing list, dropped from 2025-06 onward. Replaced by structured GEAR-tab QTY/CAT/SUB CAT/ITEM table starting `2025-06-ria-investment-forum.md` and refined in 2026 sheets. |
| **VENUES master directory** | Present in every 2025+ raw sheet, not in 2024-05 | Master list of all FXAV venues with addresses. 2025-10-FITS, 2026-03/04/05 expand it dramatically (adds City/State/Company/Venue Contact Info/In-House AV/Parking/Power/Equipment Storage/Security/Venue Notes/Catering/Restaurants/Wifi/General Session columns). |
| **CREW master directory** | Present in 2025-03 through 2025-10 raw sheets only | A flat phone-number/email roster (50+ techs). Disappears in 2026 sheets — Doug stopped embedding it. |
| **CLIENT CONTACTS master** | Present in 2025-03 through 2025-10 raw sheets | Six II contacts with phone/email. Disappears in 2026 (replaced by inline MAIN/SECONDARY contact block, see §2). |
| **VEHICLE master list** | 2025-03 through 2025-06; gone after | Sprinter Van 1–4, Schnubby, Pup Trailer, box truck rentals. |
| **ROLE master list** | 2025-03 through 2025-06; gone after | Enumeration of valid CREW.role values (see §2 → CREW). |
| **DETAIL CHECKLIST / INTERNAL** (boolean ops checklists, "Timestamp/Your Name/..." form-source block, "JOANN" ops note) | Present in 2024-05 + every 2025 raw sheet | Operations-side checklists. Hidden from crew; ignore for crew pages. Stripped from 2026 raw sheets (replaced by per-row `TRUE` flag column inside CREW). |
| **GEAR INVENTORY taxonomy** (CAT/TYPE/ITEM rows, AUDIO/BASES/CABLE etc. column header rows) | 2025-04 onward | Master equipment taxonomy used to drive Doug's pull-sheet dropdowns. Not show-specific — ignore. |
| **2024-05 PULL SHEET sub-tabs** ("TOTAL COUNT CORP & INS / SALON 1") | Only `2024-05` | Dropped artifact. |

**Implication:** the parser must accept **either** the 2024–25 layout (separate tabs/blocks for every list) **or** the 2026 layout (compact INFO with most master lists removed, GEAR appended). Detect the version by presence of `Contact Office` row (2026 only) and `MAIN | SECONDARY` HOTEL block (2026 only).

---

## 2. INFO field inventory

Required = present in **every** fixture. Conditional = present only when applicable. Optional = sometimes blank/absent. Cite "→ first/last seen" only when shape changes.

### 2.1 Client

| Field | Required? | Naming variations | Value pattern | Evolution |
|---|---|---|---|---|
| Client name | Required | `CLIENT` (most), `CLIENT  /Institutional Investor` (slash-merged in `2024-05`, `2025-04`) | Always literal `Institutional Investor` | Constant. |
| Client contact (primary) | Required | `Client Contact` (2024-05 → 2025-10), `Contact` row inside 2-col MAIN block (2026) | Free text name | 2026 sheets restructure into a **two-column MAIN/SECONDARY** layout (see `2026-05-fintech-forum-cto-summit.md` rows 3–7 — `Lew Knox` populated as SECONDARY). 2025-10 corpus and earlier are single-contact. |
| Client phone | Optional pre-2026; required 2026 | `Client Phone` → `Contact Cell` in 2026 | Free-form phone | 2026 renames row, allows secondary blank. |
| Client office phone | **2026 only** | `Contact Office` | Always blank in 2026 fixtures observed; field is reserved | Net-new field 2026-03. |
| Client email | Optional pre-2026; required 2026 | `Client Email` → `Contact Email` | Email | Rename in 2026. |
| Client label | Implicit free text | Usually `II`. `2025-10-consultants-roundtable.md` shows `AII/III` and the contact uses `@iilondon.com` (vs. `@institutionalinvestor.com`) — this is a **different contact org/domain** for the same client banner. |

### 2.2 Venue

| Field | Required? | Variations | Value | Evolution |
|---|---|---|---|---|
| `VENUE NAME` | Required | Same | Free text | Constant. |
| `VENUE ADDRESS` | Required | Same | Single-line address (sometimes multi-line w/ `&#10;`) | Constant. |
| `LOADING DOCK` | Required from 2025-03; optional in `2024-05` (free-form note instead) | Same | Address or free text (e.g. `Viramar Street Dock has scissor lift, and it sucks.` in 2024-05) | Constant. |
| `GOOGLE LINK` | **2025-10-FITS onward** | Same | `https://maps.app.goo.gl/...` | New 2025-10. Always present in 2026 sheets. |
| Multi-venue | Conditional | — | One show can split crew across two hotels (`2024-10-legal-forum-chro-dc.md`: Four Seasons DC + Sonder for Eric Weiss) | Hotel-only split, not venue split. See §2.6. |

### 2.3 Dates

| Field | Required? | Variations | Value | Evolution |
|---|---|---|---|---|
| `TRAVEL` (in) | Required | `TRAVEL` (2024-05, 2024-10, 2024-11, 2025-03 → 2025-10), **`TRAVEL IN`** (2025-10-FITS, all 2026) | Date | Renamed 2025-10 onward. |
| `TRAVEL` (out) | Required | `TRAVEL` again (pre-2026), **`TRAVEL OUT`** (2026) | Date; sometimes annotated `*SAME DAY AS STRIKE` (`2024-10`, `2025-06`) | — |
| `SET` | Required | Same | Date + time (`8:00 AM`, `Load In: 7:00 PM Room Access: 8:30 PM` — `2025-05` shows the most freeform) | — |
| `SHOW DAY 1`, `SHOW DAY 2`, sometimes `SHOW DAY 3` | Required | Same | Date + free-form time/agenda blob | 2026 fixtures embed a full **bullet-style hourly agenda** in the TIME / AGENDA cell (`2026-03-rpas-central-four-seasons.md` line 13 has 17 inline timestamps). Pre-2026 shows just `8:00am - 5:00pm`. |
| `DAY` column (Monday/Tuesday/…) | Optional pre-2025; required 2025-onward | Same | Day-of-week | — |

**3 show days observed once** (`2025-05-redefining-fixed-income-private-credit.md`, `2026-05-fintech-forum-cto-summit.md`). 1-show-day not observed; min show days = 2.

### 2.4 Crew

| Field | Required? | Variations | Value | Evolution |
|---|---|---|---|---|
| NAME | Required | Same | Free text. Sometimes carries day-restriction parenthetical: `Calvin Saller (5/12 & 5/14 ONLY)` (`2025-05`), `Calvin Saller (6/24 and 6/26 ONLY)` (`2025-06`), `Calvin Saller (10/7 and 10/9 ONLY)` (`2025-10-consultants-roundtable.md`), `Maria Davila (10/19 ONLY)` and `Rob Frye (10/21 ONLY)` (`2025-10-fixed-income-trading-summit.md`) | Day restriction lives **inside the name cell** historically; in 2026 fixtures the day restriction is **omitted from the name** and instead encoded in the role string with `***` annotation (e.g. `Calvin Saller` + `- Load In / Set / Strike / Load Out ONLY***` in `2026-03`, `2026-04`, `2026-05`). The asterisks have no in-sheet legend. |
| ROLE | Required | Same | Enumerated, prefix `- Load In / Set / Strike / Load Out` then a suffix from {`LEAD`, `LEAD / A1`, `LEAD / V1`, `A1`, `V1`, `BO`, `ONLY`, `CAM OP`} or restricted variants {`Load In / Set ONLY`, `Load Out / Strike ONLY`}. Master list at `2025-06-ria-investment-forum.md` lines 110–121. | Stable. |
| PHONE | Required | Same | E.164-ish or US `xxx-xxx-xxxx` | — |
| EMAIL | Optional through 2025-04; required 2025-06+; required 2026 | Added column from 2025-06 | Email | First appears in `2025-06-ria-investment-forum.md` line 29. |
| TRUE/FALSE flag column | **2026 only** | Unlabeled trailing column | `TRUE` for every active crew row | Appears in `2026-03` (line 35 onward), `2026-04`, `2026-05`. Likely Doug's "details sent" tracker. Hide from crew page. |
| Inline flight info inside crew row | Conditional | Only `2024-10-legal-forum-chro-dc.md` (lines 84–98) has airline / confirmation # / flight numbers nested under each crew name as part of the email-prose reconstruction | Multi-line free text | One-off; later sheets put flight info in the AGENDA grid's `NAME / ARRIVAL / FLIGHT#` columns (which are essentially always blank in the corpus — Doug doesn't fill them). |

**Crew count range:** 2 (`2025-04-asset-mgmt-cfo-coo.md` minus restricted Kari Rose = 2 full-time + 1 part) – 6 (`2025-10-consultants-roundtable.md`). Modal = 3.

### 2.5 Dress

| Field | Required? | Variations | Value |
|---|---|---|---|
| Dress code | Required from 2024-11 onward | `DRESS` row | Two-line literal: `Set/Strike: Black Pants, Black Polo Shirt, Black Footwear` / `Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear` |

Verbatim across all sheets where present. Treat as a constant default; only surface if it differs.

### 2.6 Hotel

| Field | Required? | Variations | Value | Evolution |
|---|---|---|---|---|
| `Hotel Reservations` | Required in pre-2026 (single-cell free text); replaced by structured `HOTEL` block 2026 | 2024-05 / 2025-03/04/05/06: one cell jamming hotel name + names + reservation #s + check-in/out (e.g. `2024-05-east-coast-family-office.md` row 17). 2026: a `HOTEL` block with `RESERVATION #1 / #2 / #3 / #4` columns, each with `Hotel Name / Address`, `Names on Reservation`, `Check In Date`, `Check Out Date` rows. | Structured per-reservation. | 2026-03 has 4 reservations (line 25–32 of `2026-03-rpas-central-four-seasons.md`) including 2 Holiday Inn Express stops for Doug's drive back. |
| Per-person reservation # | Optional | Embedded in free-text cell (pre-2026) or under `Names on Reservation` (2026) | E.g. `Eric Weiss - 2004173` (`2025-04` line 119) or `Douglas Larson - #2069854` (`2026-03` line 22). | — |
| Crew member splits hotels | Conditional | One-off `2024-10-legal-forum-chro-dc.md` (Eric Weiss at Sonder, Jhai/Dean at Four Seasons) — modeled in 2026 by `RESERVATION #2` having a different `Hotel Name / Address` | Different hotel name per reservation | — |
| Hotel for **driver-only** (not crew member) | Conditional | `2024-05` — Driver James Wells gets a Holiday Inn Express paired with the Parking row, separate from crew Hotel Stays | Free-form | — |
| `Hotal Contact Info` (sic) → `Hotel Contact Info` → `Venue Contact Info` (2026) | Required | 2024-05 → 2025-06 spell `Hotal` (typo). 2024-10/11 fixed to `Hotel Contact Info`. 2026 fixtures use `Venue Contact Info` instead (`2026-03` line 74, `2026-04` line 31, `2026-05` line 47). | Free text: name + email + phone | Field renamed in 2026; same role. |
| `In House AV` | Required | Same | Free text: name + email + phone, sometimes 2 contacts | Always present, always Encore (or rare third-party — `2025-10-FITS` references Pinnacle Live for some venues in master list but not for show in question). |
| `Venue Notes` | **2026 only** | Same | Free text | Net-new 2026. Examples: `Needs Center box truss for lights due to chandeliers` (`2026-03` line 76), `NO OUTSIDE FOOD OR DRINKS allowed on property; Elevator cannot be put on independent - make sure to use "door hold" button` (`2026-04` line 33). |

### 2.7 Transportation

| Field | Required? | Variations | Value | Evolution |
|---|---|---|---|---|
| `Driver` | Required | `Driver` (most), `Equipment Transporter` in 2026 (`2026-03` line 52, `2026-04` line 9, `2026-05` line 24 — new label) | Free-text name. `2026-05` adds two drivers: `Load In: Tracy Edwards` + `Load Out: Carlos Pineda` (line 24–26). | 2026 renames; 2026-05 introduces split load-in/load-out drivers. |
| Driver phone | Required from 2025-03 | Same | — | — |
| Driver email | **2026 only** | Same | Email | Net-new. |
| `Vehicle` | Required | Same | Free text. Master list (Sprinter Van 1–4, Schnubby, Pup, Box Truck) confirms enum-like. | — |
| `License Plate` | **2026 only** | Same | E.g. `XNPX89` (`2026-03` line 55) | Net-new. |
| `Color` | **2026 only** | Same | `WHITE`, `BLACK` | Net-new. |
| `Parking` | Required | Same | Free text. Pre-2026: one address. 2026: enumerates 2–3 alternate Chicago lots in one cell (`14 East Cedar / 430 North Rush / 3050 Moe Dr`). | — |
| Date/time grid for transport stages | Required | Pre-2026: `Pick Up Warehouse / Drop Off Venue / Pick Up Venue / Drop Off Warehouse` (4 rows). 2026: expanded to 8 rows: `Rental Pickup / Load at Warehouse / Pick Up Warehouse / Load In at Venue / Pick Up Venue / Drop Off Warehouse / Unload at Warehouse / Rental Return` | Date + time | Doubled in granularity 2026. |

### 2.8 Ops / Admin

| Field | Required? | Variations | Value |
|---|---|---|---|
| `COI` | Required | Same | `SENT` / `IN PROCESS` / blank. 2024-05 said `Sent`. |
| `Proposal` | Required | Same | `SENT` / `IN PROCESS` / blank, sometimes with budget (`Sent - Budget $17,500` in `2024-05` row 20). |
| `PO#` | Required (often blank) | Same | E.g. `PO-IIL006967     17k` (`2025-04` line 123), `PO-IIL007576` (`2026-04` line 27). |
| `Invoice` | **2026 only** | Same | `IN PROCESS` / `SENT` |
| `Invoice Notes` | **2026 only** | Same | Free text |

### 2.9 Event Details

This is the most consistent block across the corpus. The heading is always `DETAILS` (pre-2026) or `EVENT DETAILS` (2026). Fields in row order:

| Field | Required? | Variations | Value | Notes |
|---|---|---|---|---|
| `Floor Plan` / `DIagrams` | Required | Pre-2026: `Floor Plan` + `Room Diagram` as **two rows**. 2026: collapsed to one row called `DIagrams` (sic — capitalization inconsistent: `DIagrams` in `2025-10-FITS` line 60, `2026-03` line 79, `2026-04` line 36, `2026-05` line 52). | `LINK` placeholder text or actual Drive URL | Typo `DIagrams` is preserved across all 2026 fixtures — case-insensitive parser recommended. |
| `LED` | Required | Same | `N/A` / `NO` / Drive folder URL (`drive.google.com/drive/folders/1nmMJfTDBifPG2nVVJUxYxqXmftzPHiFM` — the II LED background logo, recurring across multiple sheets). 2025-10-consultants-roundtable.md actually uses LED (line 256: `LED screen: 8.2' x 14.76'`). | Free text. Treat as enum {N/A, NO, YES + dimensions, link}. |
| `Backdrop / Scenic` | Required | Same | Multi-line equipment list (e.g. `(1) II Blue Logo Spandex (2) Sections Grey Spandex`). |
| `Stage Size` | Required | `Stage` (`2024-05`), `Stage Size` (everywhere else) | E.g. `8' x 24' x 2'`, `7 x 2 meters`, `Standard`, `8'x16'` |
| `Opening Reel` | Required | Same | `YES - LOOP VIDEO`, `YES`, `MAYBE`, `NO`, `N/A`, `TBD`, sometimes a Drive URL. Heavy enum sprawl. |
| `Keynote Requirements` | Required | Same | `NONE`, `N/A`, `TBD`, free text |
| `Truss Podium` | Pre-2025-03 only | `2024-05` only — replaced by `GS Podium Type` from 2024-10 | `YES` |
| `Virtual Speaker` | 2024-10 onward | Same | `YES`, `NO`, `Unknown`, `N/A`, `TBD` | New in 2024-10. |
| `Virtual Audience` | 2024-10 onward | `Virtaul Audience` typo persists in DETAIL CHECKLIST blocks (`2025-04` line 418, `2025-06` line 463) | Same enum as above |
| `GS Podium Type` | 2024-10 onward | Same | `Truss Podium`, `(2) Truss Podiums`, `No Podium` | Replaces 2024-05's `Truss Podium` boolean. |
| `Record` | 2024-10 onward | `Record` mostly; `Recording` in form-data blocks | `YES`, `NO`, `N/A`, `Backup Only`, `Unknown` |
| `Live Streaming` | 2024-05 only | — | `NO` | Dropped. |
| `Polling` | Required | Same | `YES`, `NO`, `TBD`, `Polling` (literal — `2025-11-sub-advisory-central__INFO.md` line 67 is the typo) |
| `Internet` | Required | Same | Free text incl. SSID/PW (e.g. `Hyatt_Meeting / FITS2025`). |
| `Power` | Required | Same | Free text. 2026-04 example: `FXAV to bring DISTRO and 15' CAMLOCK`; 2026-03: `(2) Power Drops from Engineering`. |
| `Storage` / `Equipment Storage` | Required | `Storage` (2024-05), `Equipment Storage` (everywhere else) | Free text |
| `Staff Office Room` | 2024-10 onward | Same | Free text or `NONE` / `TBD` | Net-new 2024-10. |
| `Test Pattern` | Required | Same | `16 x 9 Test Pattern` constant; sometimes with Drive URL `docs.google.com/presentation/d/1E9L-WTFxFHAbpM3aZ9Gn-de4CWOQWJOa` |
| `Fonts` (or `Fonts (II ONLY)` in `2026-05` line 67) | 2024-10 onward | Same | `Aptos Font Folder` constant + Drive URL (recurring `drive.google.com/drive/folders/1pC9Zsh5B7j8Sqypa0tA6VhVih9T4jrau`) |
| `Notes` | One-off (`2025-10-consultants-roundtable.md` line 37) | — | Free text |
| `Digital Signage` | Required | Same | `NONE`, `N/A`, free text, sometimes equipment list. Often appears **inside** the GS room block, not the DETAILS block — see §4. |

### 2.10 Agenda link

Inline cell `AGENDA LINK` referencing a PDF/DOCX filename. Multi-program events split into `AGENDA LINK DCI` + `AGENDA LINK RPAS` (`2025-03-dci-rpas-central.md` lines 239–241) or `AGENDA LINK - RFI` + `AGENDA LINK - PCF` (`2025-05-redefining-fixed-income-private-credit.md` lines 87–89). The 2025-11 PDF-only fixture has a `DOCUMENT FOLDER LINK` row + an `AGENDA LINK` URL.

---

## 3. Cardinality

| Section | Min | Max | Source |
|---|---|---|---|
| **CREW** rows | 2 | 6 | min: `2025-04` (Jeffrey Justice + Eric Weiss + Kari Rose 2-day-only). max: `2025-10-consultants-roundtable.md` (Doug, John, Alex, Eric, Calvin 2-day-only, Kari 1-day-only). |
| **HOTEL** reservations | 1 | 4 | min: most. max: `2026-03-rpas-central-four-seasons.md` (Four Seasons #1 + #2 for crew, plus 2 Holiday Inn Express bookings for Doug's drive). |
| **GS** rooms | 1 | 2 | dual-GS: only `2025-03-dci-rpas-central.md` (DCI in Ballroom A + RPAS in Ballroom C, same airwall-split ballroom — both rooms get full GS treatment). |
| **BREAKOUT** rooms | 0 | 4 | 0: `2024-05`, `2025-04`, `2026-04`. 4: `2025-10-consultants-roundtable.md` (Delaware, LaSalle, Walton, State B). |
| **ADDITIONAL ROOM** sub-events | 0 | 1 | 1: `2024-10-legal-forum-chro-dc.md` (Seasons Restaurant Lunch Session) and `2025-10-consultants-roundtable.md` (`LUNCH ROOM BALLROOM C` — line 56). The empty `ADDITIONAL ROOM / Dimensions / Floor` block in `2025-04` and `2025-03` is a **template placeholder** with all-blank values, not an actual additional room. |
| **CLIENT contacts** (in MAIN/SECONDARY block, 2026) | 1 | 2 | 2: `2026-05-fintech-forum-cto-summit.md` (Ashley Morgan + Lew Knox). |

**Implication:** model CREW, HOTEL, BREAKOUT, ADDITIONAL_ROOM as **lists** (0–N). Model GS as **list of 1–2** (handle dual-GS as a list, not as a sibling pair). Don't fixed-slot anything.

---

## 4. GS / BREAKOUT / ADDITIONAL ROOM block shape

Recurring "room block" pattern (most consistent in 2026 sheets):

| Field | GS req? | BO req? | ADDL req? |
|---|---|---|---|
| Room name + dimensions + floor (jammed in header cell) | Yes | Yes | Yes |
| `Setup` (or `BO Setup`, `GS Setup`) | Yes | Yes | Yes |
| `Set Time` | Yes | Yes | Yes |
| `Show Time` | Yes | Yes | Yes |
| `Strike Time` | Yes | Yes | Yes |
| `LED` | Optional | Optional | Optional |
| `Scenic` | Yes (GS) | Often `N/A` (BO) | Optional |
| `Audio` | Yes | Often `N/A` or `NONE` (BO) | Optional |
| `Video` | Yes | Yes (BO usually has at least screen+projector) | Optional |
| `Lighting` | Yes (GS) | Often `N/A` (BO) | Optional |
| `Power` | Optional | Rare | Rare |
| `Other` | Optional | Optional | Optional |
| `Digital Signage` | Optional | Optional | Optional |

Pre-2026 prefixes: `GS Setup`, `BO Setup`. 2026 sheets drop the prefix and just use `Setup` because the parent header cell already names the room (`GENERAL SESSION GRAND BALLROOM A/B …` then `Setup`/`Set Time`/...).

**Header-cell parsing:** the room header cell jams 2–4 facts separated by `&#10;` (HTML LF) or by simple newlines depending on export, e.g. `GENERAL SESSION GRAND BALLROOM A/B TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14' 8th Floor` (`2026-03` line 97). The parser must split on multi-newline / multi-space and pattern-match the dimension string `\d+'.*x.*x.*\d+'`.

**Special cases:**
- **Dual-GS in one ballroom (airwall split):** `2025-03-dci-rpas-central.md` has two full GS gear blocks (GS DETAILS FOR BOTH at line 295, then a DCI-specific Ballroom A and an RPAS-specific Ballroom C, with a CASE 1/2/3 pack-out gear ladder at line 198). Both events share scenic + power but each gets its own audio + video count.
- **Lunch sub-event with portable PA** (`2024-10-legal-forum-chro-dc.md` lines 208–224): `Seasons Restaurant Lunch Session on Wed, 10/9` with its own `Setup / Set Time / Show Time / Strike Time / Audio / Video / Lighting` rows. This is the only ADDITIONAL ROOM with non-trivial gear in the corpus. Audio for the lunch is a 2nd PA system (`Presonus 16, 2 Gemini Powered Speakers, 1 HH, 1 LAV, 2 Speaker Stands`) — independent kit, not a re-use of GS.
- **Boardroom-style ADDITIONAL ROOM** (`2025-10-consultants-roundtable.md` lines 50–60) — `BO Setup: Boardroom for 12` which in the same sheet is `LUNCH ROOM BALLROOM C` set with Rounds. Two distinct ADD'L sub-events.
- **Empty BREAKOUT 2/3 placeholder rows** in `2025-04-asset-mgmt-cfo-coo.md` (lines 53–93) — three full BREAKOUT blocks rendered with **every value blank**. Doug is using template scaffolding; treat fully-empty BO blocks as "not an actual breakout."
- **Breakout with reset-to-combined annotation** (`2025-05-redefining-fixed-income-private-credit.md` line 55): `*GETS RESET ON 5/13 AFTERWARDS TO COMBINED ROOM` — operational note inside `BO Setup` field.

---

## 5. GEAR tab format

Two distinct flavors observed:

| Flavor | Source | Layout |
|---|---|---|
| **Doug's GEAR tab** (raw sheets) | All 2025 raw sheets + 2026 raw sheets | Mostly blank `NO_HEADER` rows of `1`s, with quasi-structured "STRETCHED SPANDEX SECTIONS W/ PRINTED BRANDING & HARDWARE" line-item rows beneath the AGENDA, alongside a separate `Client / Contact / Address / Date / Event Date(s) / Venue / Room(s) / Time(s) / Event Name` proposal-header block. By 2026-03 these are increasingly polished and Chip-style. The `Item / 21-Mar / 22-Mar / ...` per-day grid is present but data-empty in the raw export. Pre-2025-06 has a separate `PULL SHEET` tab instead. |
| **Chip's GEAR PROPOSAL form** (Chip-authored, only fixture: `2025-11-sub-advisory-central__GEAR.md`) | `pdf-only/` | Same headers (`Client / Contact / Address / Date / Event Date(s) / Venue / Room(s) / Phone / E-mail / Event Name`) but **per-day quantities filled in** (e.g. `(2) GREY SPANDEX SECTIONS \| 2 \| 2`) and structured by section heading: `GENERAL SESSION - SALON ABCD` then line items with day quantities, then `BREAKOUT SESSION 1 - DRAWING ROOM 1` then items, etc. |

Doug's GEAR has been **converging on Chip's format** since 2025-10. By 2026-03 the GEAR block uses identical row labels (`STRETCHED SPANDEX SECTIONS W/ PRINTED BRANDING & HARDWARE`, `DLP DATA PROJECTOR - EIKI`, `WIRELESS LAVALIER MICROPHONE`, etc.). The difference: Doug's exports show the per-day quantity columns mostly empty in the markdown export (formulas not flattened). They are **conceptually the same** — Doug's is the live worksheet, Chip's is the authoritative one-pager.

**Parser stance:** GEAR is operations data. The crew page should show the **GS scenic/audio/video/lighting/other** rows from the room block (§4) and ignore the GEAR tab entirely. If we ever want GEAR for a case-prep view, treat Chip's format as canonical and write a converter for Doug's.

---

## 6. AGENDA tab format

Standard layout in **every** raw sheet 2025-04+ and `2024-05`:

```
| TRAVEL DAY |  |  | SET DAY |  |  | DAY 1 |  |  |  |  |  | DAY 2 |  |  |  |  |  | DAY 3 |  |  |
| 5/2/26     |  |  | 5/3/26  |  |  | 5/4/26|  |  |  |  |  | 5/5/26|  |  |  |  |  | 5/6/26 |  |  |
| Saturday   |  |  | Sunday  |  |  |Monday |  |  |  |  |  |Tuesday|  |  |  |  |  |Wednesday| | |
| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START | FINISH | TRT | TITLE | ROOM | AV | …
```

- Travel/Set days have `NAME / ARRIVAL / FLIGHT#` + `TIME / TITLE / ROOM` per crew member but are essentially always blank — Doug doesn't fill flight info per crew (the data lives elsewhere or in Doug's head).
- Show days have `START / FINISH / TRT (run time) / TITLE / ROOM / AV` — actual content. `TRT` is HH:MM duration.
- 2025-03 dual-GS has **two separate AGENDA blocks** — one labeled `DCI` (line 340) and one `RPAS` (line 357) — with distinct columns. Plus a "merged" view at lines 374-419 with an `EVENT` + `DAY` column for filtering.
- 2026 sheets often have the **time grid pre-built but content-empty** — Doug fills it in closer to show date or pastes from the supplied agenda PDF.

`AV` column values are micro-enums: `4 Goosenecks`, `5 Goosenecks`, `LAV`, `POD`, `Screen & Projector`, `NO AV`, `Combined - lunch`, `PPT - GEMCORP` (sponsor-specific), etc. Free-text but small vocabulary.

---

## 7. Personalization signals

Concrete fields/patterns the per-crew-member view will key off:

1. **Crew name match** → filter HOTEL reservations, AGENDA flight rows, transport-driver assignment, role.
2. **Day-restricted role** → render only those load-in/strike days for that crew member; suppress the others. Examples:
   - Inline parens: `Calvin Saller (5/12 & 5/14 ONLY)` (`2025-05`), `Maria Davila (10/19 ONLY)` (`2025-10-FITS`).
   - 2026 form: `Calvin Saller` + role `Load In / Set / Strike / Load Out ONLY***` — the `***` flags the day-restricted case but **the actual restricted days are missing from the cell** in 2026 fixtures. Parser must fall back to inspecting the role column, the trailing TRUE flag, and likely Doug's email body. **This is a regression** — the 2026 sheets lost the data on which days Calvin works.
3. **Role-based section visibility** — crew with role containing `BO` should see breakout details prominently; `LEAD` crew see ops/admin (PO#, COI, Proposal); `A1` crew see audio gear; `V1` see video. Crew without `LEAD` should not see PO/Invoice rows.
4. **HOTEL.namesOnReservation match** → which hotel + which conf #. Note multi-hotel splits: `2024-10` (Sonder vs Four Seasons), 2026 sheets with separate RESERVATION #1/#2/#3/#4.
5. **TRANSPORTATION.driver match** → that crew member is the driver, surface license plate / color / vehicle. In `2025-03-dci-rpas-central.md` line 221 the driver was James Wells; James doesn't appear in the show CREW — drivers can be non-crew or non-FXAV staff.
6. **Flight info pattern** (`2024-10-legal-forum-chro-dc.md` only) — inline `AIRLINE / #CONFIRMATION / FLIGHT_NUM ORIGIN-DEST DATE TIME` blocks under the crew row. Worth parsing if seen.
7. **Show day vs travel day vs set day** — color/section the agenda differently per day.

**Fields to hide from non-LEAD crew:** `PO#`, `Proposal`, `COI`, `Invoice`, `Invoice Notes`, `INTERNAL` checklist, `DETAIL CHECKLIST`, the `JOANN` ops-question cell, and Pending/expense tables (`2025-03` lines 262–292).

---

## 8. Edge cases & gotchas

1. **Day-restricted crew embedded in name vs. role** — different across years; encoding lost in 2026 (see §7 #2). Parser must check name parens **and** role suffix **and** `***`.
2. **Dual-GS ballroom split** — `2025-03-dci-rpas-central.md` has two parallel programs (DCI + RPAS) running in airwall-split ballrooms with shared crew. Schema must allow >1 GS room.
3. **Secondary client contact** — `2026-05-fintech-forum-cto-summit.md` adds Lew Knox as SECONDARY in the MAIN/SECONDARY two-column header. No other fixture has SECONDARY populated.
4. **Lunch sub-event with portable PA** — `2024-10-legal-forum-chro-dc.md` Seasons Restaurant lunch is a true ADDITIONAL ROOM with its own audio kit. The model needs ADDITIONAL_ROOM list, not just a singleton.
5. **Different client domain/label** — `2025-10-consultants-roundtable.md` uses `AII/III` as event prefix and `ekaufman@iilondon.com` (II London affiliate); other shows use `@institutionalinvestor.com` and just `II`. Don't hard-code domain checks.
6. **Inline flight info in CREW rows** — only `2024-10` (email-reconstruction artifact). The schema should accept either an `flightInfo` field on Crew OR a separate Flight list.
7. **Hotel split across properties for one show** — `2024-10` Four Seasons + Sonder. 2026's `RESERVATION #1 / #2 / #3 / #4` block handles this natively.
8. **Inline Drive links inside cells** — agenda PDFs (`MASTER - March 25 - 11th Annual Redefining Fixed Income Forum Agenda.pdf`), test pattern slide (`docs.google.com/presentation/d/1E9L-WTFxFHAbpM3aZ9Gn-de4CWOQWJOa`), Aptos font folder (`drive.google.com/drive/folders/1pC9Zsh5B7j8Sqypa0tA6VhVih9T4jrau`), II LED logo (`drive.google.com/drive/folders/1nmMJfTDBifPG2nVVJUxYxqXmftzPHiFM`), opening reel loop video (`drive.google.com/file/d/1_XbZncqdT2clfMpZIXeWeb9FL0rx4g4l`). Parser must extract these as link objects, not strip them as plain text.
9. **Notes mixed with data** — preamble strings like `NO OUTSIDE FOOD OR DRINKS allowed on property` (`2026-04` line 33), `Lew likes power dropped at his table` (`2026-05`-style notes in venue-master rows), `Forklift operator required for load in and out due to high dock height` (Newbury Hotel Boston row in venue master). These need `Notes` field or `Venue Notes` field — already exists as of 2026-03.
10. **Empty/placeholder rows in newer sheets** — `2025-04-asset-mgmt-cfo-coo.md` BREAKOUT 1/2/3 are all-blank scaffolds; `2025-04-asset-mgmt-cfo-coo.md` line 95 ADDITIONAL ROOM is a blank scaffold. Parser must treat all-empty room blocks as null, not as actual rooms.
11. **Field typos preserved** — `Hotal Contact Info`, `DIagrams`, `Virtaul Audience` (in checklist), `Goosneck` (some 2026 GEAR rows), `theatre` vs `theater`. Use case-insensitive + fuzzy matching for known canonical names.
12. **Dimension string formats vary** — `41' x 73' x 13'` (W×L×H), `21' x 28'` (W×L only — `2024-11` Drawing Room B), `7 x 2 meters` (`2025-10-consultants-roundtable.md` GS), `Standard` (`2025-10-FITS` GS line 243). Must accept numeric pattern + unit + free text.
13. **`SPREADSHEET FROM LAST YEAR` annotation** — `2025-10-fixed-income-trading-summit.md` line 33 has a literal column header `SPREADSHEET FROM LAST YEAR | SPREADSHEET FROM LAST YEAR`. Doug duplicates prior sheet as starting template; this annotation is leftover scaffolding.
14. **"DETAILS" header is empty placeholder list in many fixtures** — e.g. `2025-04-asset-mgmt-cfo-coo.md` lines 17–36 list the detail field names but with no values; the actual values are populated elsewhere in the sheet (or not at all). The parser should use the populated row as the source of truth, not the labels-only placeholder block.
15. **The `Venue Contact Info`/`In House AV` cells often contain 2 contacts with newlines** — multiple humans in one cell. Parser should split into a contact list.
16. **`Calvin Saller` is a recurring day-restricted half-day load helper** — not a parsing concern but a useful sanity-check entity across `2025-03` (3/24 & 3/26 only), `2025-04` (Kari subbed 4/7 & 4/9), `2025-05`, `2025-06`, `2025-10` (both shows), `2025-11`, `2026-03/04/05`.
17. **Form-data block at end of every sheet** — `Timestamp / Your Name / Email Address / Phone Number / Title of Event / ...` 50-field template (e.g. `2025-04-asset-mgmt-cfo-coo.md` lines 335–385) is **the source data Ashley/Joann/Maria provided to Doug** via a Google Form. In some fixtures (`2025-05`, `2025-10-FITS`, `2025-10-consultants-roundtable.md`) it's filled in; in others (`2026-04`, `2026-05`) it's blank. Treat as ground-truth fallback when the body is empty.

---

## 9. Recommendations for parser design

**Required core schema (every fixture has these):**

- `client.name` (always literal `Institutional Investor`)
- `client.contact.name`, `client.contact.email`
- `client.eventLabel` (e.g. `II`, `AII/III`)
- `venue.name`, `venue.address`, `venue.loadingDock`
- `dates.travelIn`, `dates.set`, `dates.showDays[]`, `dates.travelOut`
- `crew[]` — each `{name, role, phone, email?, dayRestriction?}`
- `gs[]` — list of 1–2 General Session room blocks
- `breakouts[]` — list of 0–4
- `additionalRooms[]` — list of 0–N
- `hotelReservations[]` — list of 1–4, each `{hotel, namesOnReservation[], checkIn, checkOut, confirmationNumbers?}`
- `transportation.driver`, `transportation.vehicle`, `transportation.parking`, `transportation.schedule[]` (4–8 stage rows)
- `eventDetails` — flat key/value map with fields from §2.9

**Modeled as optional / version-gated:**

- `client.contactSecondary` (2026-05 only)
- `client.contact.officePhone` (2026 only)
- `transportation.licensePlate`, `transportation.color`, `transportation.driverEmail` (2026 only)
- `venueNotes` (2026 only)
- `ops.invoice`, `ops.invoiceNotes` (2026 only)
- `agendaLinks[]` (named per program for dual-program shows)

**Modeled as free-text fallback:**

- `eventDetails.power`, `eventDetails.internet`, `eventDetails.keynoteRequirements`, `eventDetails.openingReel` — too much enum sprawl across years to lock down.
- `roomHeaderCell` — keep raw, post-process to extract dimensions/floor.
- Any field whose value is `TBD`, `Unknown`, `MAYBE` — don't normalize, surface verbatim.

**Modeled as list, not slot:**

- `crew[]`, `gs[]`, `breakouts[]`, `additionalRooms[]`, `hotelReservations[]`, `agendaLinks[]`, `clientContacts[]`, `inHouseAV[]`, `venueContacts[]`. Anything that has appeared 2× = list.

**Hide from non-LEAD crew pages:**

- `ops.po`, `ops.proposal`, `ops.coi`, `ops.invoice`, `ops.invoiceNotes`, `internalChecklist`, `detailChecklist`, `pendingExpenses`, `formSourceData`, `crewMasterDirectory`, `clientContactsMaster`, `vehicleMasterList`, `roleMasterList`, `gearInventoryTaxonomy`.

**Schema-vs-notes line:**

- Schema = anything with a field name that appears in ≥3 fixtures or in any 2026 fixture.
- Notes = freeform venue/event commentary; surface as a `Notes` block on the crew page below the structured data, not as labeled fields.

**Versioning strategy:**

Detect template version per sheet, then route:
- **v1 (2024-05):** no GEAR table, has PULL SHEET, `Truss Podium` boolean instead of `GS Podium Type`.
- **v2 (2024-10 → 2025-04):** Email-prose if from `email-embedded/`. `Hotal Contact Info` typo. Single hotel reservation cell. 4-stage transport schedule.
- **v3 (2025-05 → 2025-10):** GEAR INVENTORY taxonomy block introduced. Master directories embedded. `Hotel Contact Info` typo fixed.
- **v4 (2025-10-FITS → 2026-05):** MAIN/SECONDARY contacts block; structured HOTEL block with 4 reservations; `Equipment Transporter` rename; license plate/color; `Venue Notes`; `Invoice`; 8-stage transport schedule; embedded hourly bullet agenda in `TIME / AGENDA` cell; per-crew TRUE flag column; `Calvin Saller (...)` day caveats moved out of name and lost from sheet.

Privilege v4 as the canonical model; v1–v3 are best-effort backward-compat.
