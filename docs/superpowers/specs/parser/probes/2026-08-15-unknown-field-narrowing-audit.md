# UNKNOWN_FIELD narrowing audit — "venue block only" proposal

Probe: `.claude/tmp/unknown-field-narrowing-probe.ts` (`pnpm exec tsx --tsconfig tsconfig.json .claude/tmp/unknown-field-narrowing-probe.ts`).
Raw output: `.claude/tmp/probe-output.txt`, structured dump: `.claude/tmp/unknown-field-narrowing-audit.json`.

**"Venue block" definition used** (per task): the pipe-block (`md.split(/\n\s*\n/)`) that
contains the row where `inVenueFieldScope` first flips true — i.e. the physical block holding
the FIRST recognized `venue.name`/`venue.address`/`venue.loading_dock`/... field. Located with a
faithful shadow-copy of `parseVenue`'s scope-open branches (`lib/parser/blocks/venue.ts`
101-260ish), run over `parseTableRows(rawFixtureMd)` for coordinate-consistency with the
attribution step. Manually eyeballed for all 6 non-zero fixtures (block text dumped below) —
every one is exactly the clean 2/3-column `VENUE NAME` / `VENUE ADDRESS` / `LOADING DOCK` block,
confirming the shadow logic locates the right block.

**Attribution method**: exactly the doc's greedy method — flat row list =
`blocks.flatMap(parseTableRows)` (verified `== parseTableRows(wholeMd)` on all 17 fixtures, same
check the source doc made); each `UNKNOWN_FIELD` warning matched in emission order to the next
eligible row (col-0 non-empty, not `VENUE`, `canonOf` null) whose col-0 trim equals the warning's
key, cursor advanced monotonically.

## VERIFY

- Grand total across corpus: **394** (matches expected).
- Per-fixture totals match raw `parseSheet(...).warnings` counts exactly (see table).
- 0 unmatched emissions (every warning found its row).
- `blocks.flatMap(parseTableRows)` == `parseTableRows(md)` on all 17 fixtures.

## Per-fixture table

| fixture | total | kept | dropped | venue block index |
|---|---:|---:|---:|---:|
| xlsx/consultants.md | 0 | 0 | 0 | 2 |
| xlsx/east-coast.md | 4 | 0 | 4 | 2 |
| xlsx/fintech.md | 0 | 0 | 0 | 2 |
| xlsx/fixed-income.md | 0 | 0 | 0 | 2 |
| xlsx/redefining-fi.md | 0 | 0 | 0 | 2 |
| xlsx/ria.md | 0 | 0 | 0 | 2 |
| xlsx/rpas.md | 0 | 0 | 0 | 2 |
| raw/2024-05-east-coast-family-office.md | 4 | 0 | 4 | 1 |
| raw/2025-03-dci-rpas-central.md | 118 | 0 | 118 | 15 |
| raw/2025-04-asset-mgmt-cfo-coo.md | 42 | 0 | 42 | 14 |
| raw/2025-05-redefining-fixed-income-private-credit.md | 0 | 0 | 0 | 11 |
| raw/2025-06-ria-investment-forum.md | 107 | 0 | 107 | 4 |
| raw/2025-10-consultants-roundtable.md | 119 | 0 | 119 | 10 |
| raw/2025-10-fixed-income-trading-summit.md | 0 | 0 | 0 | 3 |
| raw/2026-03-rpas-central-four-seasons.md | 0 | 0 | 0 | 4 |
| raw/2026-04-asset-mgmt-cfo-coo-waldorf.md | 0 | 0 | 0 | 1 |
| raw/2026-05-fintech-forum-cto-summit.md | 0 | 0 | 0 | 4 |
| **TOTAL** | **394** | **0** | **394** | |

**Every fixture's venue block is the clean `VENUE NAME`/`VENUE ADDRESS`/`LOADING DOCK` table.**
Zero of the 394 emissions land there — every emission's physical row lives in a *different*
block that merely fell inside the still-open scope window (before the next
`VENUE_BLOCK_TERMINATORS` hit). Narrowing to "venue block only" keeps **0** and drops **all
394**.

## Dropped keys grouped by physical block (block = block's opening col-0 text)

| block label | dropped count | distinct keys | nature |
|---|---:|---:|---|
| Timestamp | 114 | 33 | Google-Forms intake echo (Your Name, Email Address, Program Start Date/Time, Technician Hotel Check In Date, ...) |
| NAME | 68 | 68 | crew roster name+phone rows (Adam Sisco / 619-990-9307, etc.) |
| DCI | 67 | 33 | run-of-show/agenda table, time-of-day col-0 (8:00 AM, 9:30 AM, ...) |
| Item | 31 | 31 | gear pull-sheet item names (DIGITAL AUDIO CONSOLE- QU32 CONSOLE, ...) |
| VENUES | 26 | 26 | master venue REFERENCE table (venue name → address, many past shows) |
| NO_HEADER | 19 | 2 | xlsx-export artifact: literal placeholder text `NO_HEADER`, and pull-sheet quantity column `1` misread as col-0 |
| DLP DATA PROJECTOR | 14 | 4 | gear pull-sheet items (LAPTOP COMPUTER, WIRELESS REMOTE/GREEN LASER POINTER, PROJECTION SCREEN, DLP DATA PROJECTOR) |
| ROLE | 11 | 10 | crew role/instruction freeform notes ("- Load In / Set / Strike / Load Out - LEAD") |
| DETAILS | 8 | 4 | Stage, Truss Podium, Live Streaming, Storage — event-details-shaped rows |
| START | 8 | 7 | agenda START/END time table |
| WIRELESS LAVALIER MICROPHONE | 8 | 6 | gear pull-sheet items (CABLING, AUDIO MIXER - QU16, ...) |
| Client:/Contact: | 8 | 8 | colon-suffixed client-contact block (Address:, Phone:, Cell Phone:, Fax:, E-mail:, ALT. E-mail:, Event Name:) |
| 3/23/25 | 6 | 3 | travel/arrival schedule table (NAME/ARRIVAL header, Sunday, date) |
| ADDITIONAL ROOM&#10;Dimensions&#10;Floor | 2 | 2 | rooms reference-table header (HTML-encoded newlines) + "Other" |
| TRAVEL DAY | 2 | 2 | travel-day schedule marker + date |
| GS Setup | 1 | 1 | "GS Other" catchall row inside a General-Session gear/setup block |
| \#REF\!/NAME | 1 | 1 | broken spreadsheet `#REF!` error artifact |
| **TOTAL** | **394** | **241 distinct keys** | |

(Examples verbatim — 2-3 per group — in `.claude/tmp/probe-output.txt`, "dropped keys" section.)

## Kept keys

**None.** `keptByKey` is empty across all 17 fixtures — the venue block itself never contains an
unrecognized-label row in this corpus.

## Judgment per dropped group

- **Timestamp** (114): junk relative to venue — a Google-Forms intake questionnaire echoed
  verbatim into the sheet. Not typos of any venue.ts alias (`VENUE NAME`/`VENUE ADDRESS`/
  `LOADING DOCK`/`GOOGLE LINK`/`VENUE NOTES`); field names are alien to the whole alias table
  (Program Agenda, Logistics Director Name(s), etc.).
- **NAME** (68): junk — crew names+phone numbers, a crew-roster block. Not field labels at all
  (values, not labels).
- **DCI** (67): junk — agenda/run-of-show times, not field labels.
- **Item** / **DLP DATA PROJECTOR** / **WIRELESS LAVALIER MICROPHONE** (31+14+8=53): junk —
  gear pull-sheet item names, structurally a parts list not label:value rows.
- **VENUES** (26): junk relative to the CURRENT show's venue, but structurally venue-shaped — a
  bulk reference table of many past venues (name→address). Not a typo of a field name; it's a
  different table SHAPE (row = one venue's identity, not a field label).
- **NO_HEADER** (19): junk — xlsx-export placeholder text and a misread quantity column, not
  real field labels.
- **ROLE** (11): junk — freeform crew scheduling instructions used as row labels.
- **START** / **3/23/25** / **TRAVEL DAY** (8+6+2=16): junk — agenda/travel date-table scaffolding.
- **\#REF\!/NAME** (1): junk — spreadsheet corruption artifact.
- **GS Setup / "GS Other"** (1): weak — sits in a rooms-adjacent block (`GS Setup` is itself a
  real `rooms.setup` alias per `lib/parser/aliases.ts`), but "GS Other" itself isn't in any
  alias table; a generic catchall, not a typo of a specific field.
- **ADDITIONAL ROOM\nDimensions\nFloor** (2): **plausible near-miss, not a spelling typo** — this
  is almost verbatim the `rooms.additional` section-opener text (`SECTION_HEADER_TOKENS`
  includes `"ADDITIONAL ROOM"` in `lib/parser/blocks/rooms.ts:108`), just with literal
  `&#10;` HTML-entity newlines embedded in col-0 that the header matcher doesn't decode/match.
  Looks like a genuine section header the parser fails to recognize due to encoding, not an
  operator mistake.
- **Client:/Contact: block** (8, ALL 8 distinct): **the strongest "real field, wrong shape"
  candidates.** `Phone:`, `E-mail:`, `Cell Phone:`, `Address:` are colon-suffixed near-duplicates
  of `client.contact_phone` ("Client Phone"), `client.contact_email`/`contact_email_main`
  ("Client Email"/"Contact Email"), `client.contact_cell` ("Contact Cell") in
  `lib/parser/aliases.ts:41-45` — same concept, different punctuation/casing the alias table
  doesn't cover. `Client:/Contact:` itself pairs with `client.name`/`client.contact`.
- **DETAILS block — "Stage" / "Storage"** (2 each): **plausible typos of real event fields.**
  `Stage` → value `8' x 24' x 2'` (a dimension) is functionally identical to
  `event.stage_size` ("Stage Size", `lib/parser/aliases.ts:113`) — missing only the word "Size".
  `Storage` → value "Back of house near kitchen area" matches `event.equipment_storage`
  ("Equipment Storage", `aliases.ts:120`) — missing only the word "Equipment". `Truss Podium`
  and `Live Streaming` are adjacent concepts (`event.podium_type`, nothing for streaming) but not
  clean textual near-misses.

## Bottom line

- **394 of 394 (100%) would be DROPPED; 0 kept.** Every fixture's actual venue block (VENUE
  NAME/ADDRESS/LOADING DOCK) has zero unknown-field rows in this corpus — all noise comes from
  *other* physical blocks caught inside the still-open scope window.
- Of the 394 dropped, the overwhelming majority (~370+) are unambiguous junk relative to venue:
  crew rosters, gear pull-sheets, agenda/time tables, a Google-Forms echo, spreadsheet corruption.
- **~10-18 dropped emissions look like genuine typos/near-misses a person should have caught**:
  the 8-row `Client:/Contact:` colon-suffixed block (Phone:/E-mail:/Cell Phone:/Address:, near
  `client.*` aliases), `Stage`/`Storage` in the `DETAILS` block (near `event.stage_size`/
  `event.equipment_storage`), and the 2-row `ADDITIONAL ROOM` rooms-header with encoded
  newlines. None of these are venue-field typos specifically — they're typos/near-misses of
  OTHER blocks' known fields, which the venue-only sweep would silence entirely (it's block-
  scoped to venue, not label-scoped to "any known field anywhere").
