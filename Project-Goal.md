### Goal

I'm a freelance audio engineer (A1) doing mostly corporate events. FXAV is one of my main clinents for corporate AV. Doug Larson uses a sheets doc template for all of the events he PMs. The end goal of this project is a Webapp/webpage that doug can use to upload or connect his completed templated document. The uploaded/connected document is then used to generate interactive webpages for each event, customized for each crew member, links are generated and doug can then send a nice beautifully formatted (and more imporatantly is useful onsite for each crew member) web page (connected to the original sheets document, ideally live updated if possible) to each crew member rather than a dense spreadsheet doc

### Context

The fixture corpus lives in `fixtures/shows/`. It represents Doug Larson's templated event docs across ~14 Institutional Investor shows that I (Eric Weiss) crewed for FXAV. Three subdirectories reflect the three formats Doug delivers in:

- **`raw/`** — 10 Google Sheets pulled via the Drive MCP, saved as markdown tables (the canonical "completed template"). These are the primary schema reference. Date range 2024-05 through 2026-05.
- **`pdf-only/`** — INFO + GEAR PDF exports for one 2025 show where Doug never created a live sheet, only sent PDFs (Sub-Advisory Central 11/3–11/5/25). Note: the GEAR PDF is actually a Chip Mulzoff PROPOSAL form, layout differs from the sheet's GEAR tab. No DIAGRAMS PDF was attached.
- **`email-embedded/`** — Two 2024 shows where Doug's original sheet links 404'd; the show details are reconstructed from the prose Doug embedded directly in the gmail thread body. Same template fields, looser formatting.

**Scope decisions made during corpus assembly:**

- Only Doug-produced shows are included. Chip Mulzoff and Corey Andrews also PM FXAV shows but use freeform prose emails — not the same template, intentionally out of scope.
- Only Institutional Investor client shows. Datacloud (Technoraco), ABS East, Private Credit Connect, Capital Allocators are excluded — different clients, different formats.
- Doug's template evolved meaningfully across years. The 2026 sheets are the canonical "current template"; 2024–2025 sheets show prior versions (fewer fields, different section names, different tab counts). Backwards compatibility is a design goal — the parser must handle the variation.
- Embedded images and linked PDFs/agenda decks are NOT in the fixture corpus. The Drive MCP `read_file_content` returns text only. Diagrams, room layouts, and agenda PDFs live as separate Drive links inside the sheets — production rendering will need a separate ingestion path for those.

**What the template captures (key sections worth modeling early):**

- INFO tab — CLIENT, VENUE, DATES (TRAVEL/SET/SHOW per row), CREW (per-person rows: name, role, phone, email, sometimes day-restricted), DRESS, AGENDA LINK, HOTEL (per-person reservations with check-in/out), TRANSPORTATION (driver, vehicle, parking, pickup/dropoff schedule), COI/Proposal/PO# tracking, Venue Contact, In-House AV contact, EVENT DETAILS (LED, Backdrop, Stage Size, Polling, Power, Storage, etc.), GENERAL SESSION (room, dimensions, setup, set/show/strike times, gear lists), one or more BREAKOUT rooms with the same shape, occasional ADDITIONAL ROOM (e.g., a lunch session sub-event).
- GEAR tab — proposal-style rental list with per-day quantities.
- AGENDA tab — multi-day timeline of session/break/meal blocks with room assignments.
- DIAGRAMS tab — usually placeholder cells + a `LINK` to a Drive folder of room layout images.
- PULL SHEET tab — per-case packing list (only present in some sheets).

**Personalization signals already in the data:**

- CREW rows include role descriptors with day caveats (e.g., "Calvin Saller (5/12 & 5/14 ONLY)") — natural per-user filter key.
- HOTEL rows are per-person with their own confirmation # and check-in/out dates.
- TRANSPORTATION can be per-person flight info with confirmation codes.
- Some fields (PO#, Proposal, COI) are operations-only and should be hidden from non-lead crew pages.

**Re-pulling source data:** Sheet IDs are documented in the schema diff (TBD). To re-fetch any sheet, use the Drive MCP `read_file_content` tool with the file ID. To find new shows, search Gmail for `from:dlarson@fxav.net subject:"Details for"` — Doug's standard email pattern includes a `https://docs.google.com/spreadsheets/d/<id>/edit` link in the body.