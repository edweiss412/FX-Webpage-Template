# DEF-FLIGHT-1: TRAVEL-tab flight parser

**Status:** spec (owner-review WAIVED — Codex adversarial review is the gate).
**Branch:** `feat/travel-tab-flight` (worktree `/Users/ericweiss/FX-Webpage-Template-travel-flight`) off merged main `0bc5f59d`.
**Follows:** the merged Phase-3 per-crew flight info (PR #46) — the `DEF-FLIGHT-1` entry in `docs/superpowers/plans/2026-06-19-crew-flight-info/DEFERRED.md`.

## Goal

Parse each crew member's flight itinerary from the **TRAVEL tab's "FLIGHT DETAILS" table** into the existing `crew_members.flight_info` string, joined-by-name to the roster — so the **RPAS Central + both FinTech Forum** crew flights (one each, currently unparsed) surface on the already-shipped Travel "Your flight" card. This ~doubles real flight coverage (East Coast's 3 TECH-path crew → +3 TRAVEL-tab crew).

## Scope — PARSER-ONLY

A new parser block + its wiring + one §12.4 warning code. **NO** exporter, sync, migration, projection, or UI change. The chain downstream of the parser already exists and carries `flight_info` end to end:

- The TRAVEL tab is **already in the exporter markdown** (`lib/drive/exportSheetToMarkdown.ts:194` iterates every workbook tab, skipping only `OLD`) — verified present in the committed fixtures (`fixtures/shows/exporter-xlsx/rpas.md:264-268`, `fintech.md:300-302`).
- `crew_members.flight_info` is already a column, **written by the sync** from `ParseResult.crewMembers`, **projected** as `viewerFlightInfo` (`lib/data/getShowForViewer.ts`), and **rendered** by the N-leg Travel card (`components/crew/sections/TravelSection.tsx`, splits on `" | "`, `flightLegs.map`).
- `parseSheet` simply **never reads** the TRAVEL tab today (no `parseTravel*`; the `TRAVEL` matches are date aliases + the agenda `DAY_TYPE` banner).

So the only gap is a parser block that reads the TRAVEL FLIGHT DETAILS table and enriches the roster rows' `flight_info`. Files: **create** `lib/parser/blocks/travelFlights.ts`; **modify** `lib/parser/index.ts` (one call) + the §12.4 catalog (one warning code).

## Grounding (live-gsheets-MCP audit + exporter-fixture analysis, 2026-06-19)

The flattened cell the parser actually consumes (verified bytes, `rpas.md:268` / `fintech.md:302`):

```
RPAS  John Carleo:  GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am 3/26 AA2723 ORD - LGA 7:23am - 10:30am
FTECH John Carleo:  5/2 AA1080 LGA - ORD 12:00pm - 1:00pm 5/7 AA3237 ORD - LGA 10:02am - 1:17pm
```

**Why one flattened line (load-bearing):** the exporter's `escapeCell`→`normalizeNewlines`→`shouldPreserveNewlines` (`exportSheetToMarkdown.ts:40-51`) returns **false** for any cell with `lines.length >= 3` (`:45`), so a FLIGHT DETAILS cell (conf + 2 legs × 4 lines + blank ≈ 10 lines) takes the `:33-37` branch: `split("\n").map(stripEdgeWhitespace).filter(len>0).join(" ")`. The inter-leg blank line is **filtered out** — there is **no** `&#10;`, no `\n`, no double-space (confirmed: `rpas.md:268` has 0 `&#10;` entities; the sibling 2-line hotel cell `:48` has 2). **The only surviving leg boundary is the date token.** (Contrast: the gsheets-MCP read of the *raw* sheet shows `\n\n`-delimited legs — that is NOT what the parser sees; the parser consumes the exporter output.)

### The TRAVEL FLIGHT DETAILS table format

| Dimension | RPAS | FinTech (both copies) | Rule |
|---|---|---|---|
| Tab name | `TRAVEL` | `TRAVEL` | stable |
| NAME column | A (header `NAME`) | A (header `NAME`) | **bind by header label, col A** |
| FLIGHT DETAILS column | I | H | **VARIES — bind by header label `FLIGHT DETAILS`, never a fixed index** |
| Header row (in the markdown table) | the row with col-A `NAME` + a `FLIGHT DETAILS` cell to the right | same | locate by scanning, not a fixed row |
| Legend/template row | absent | present (blank NAME, cell = `CODE … DATE FLIGHT # XXX - XXX TIME …`) | exclude (blank NAME primary; placeholder tokens secondary) |
| Leading conf code | present (`GEUZAB`) | absent | **OPTIONAL** — detect by "first token is NOT date-shaped" |
| Leg count observed | 2 (round-trip) | 2 | open-ended; N-leg render handles 1..N |
| Year in cell | no | no | never present — store raw `M/D` (no inference) |
| Non-flyer sentinel | `DRIVING`/`Local` in NOTES | `LOCAL` in the FLIGHT DETAILS cell (user copy) or NOTES (Doug) | case-insensitive; check the cell |

The FLIGHT DETAILS column header appears **twice** in the exporter (merged source cell expanded across 2 columns) — binding by the *first* `FLIGHT DETAILS` header is sufficient (both hold identical text). Only **RPAS + FinTech** have this table among the 7 exporter fixtures; **East Coast uses the TECH path** (0 FLIGHT DETAILS) — so no show has both (no precedence collision in practice; the precedence rule below is defensive).

## §1 — `parseTravelFlights(markdown, crewMembers, agg)`

**Signature + wiring.** New `lib/parser/blocks/travelFlights.ts`:

```ts
export function parseTravelFlights(
  markdown: string,
  crewMembers: CrewMemberRow[],
  agg: ParseAggregator,
): void
```

Called in `parseSheet` (`lib/parser/index.ts`) **immediately after** `const crewMembers = parseCrew(markdown, version, agg);` (`:369`) and before `parseTransportation` (`:372`). It **enriches the existing roster rows in place** — the precedent is `parseTransportation(markdown, version, crewMembers, agg)` (`:372`), which already takes `crewMembers`. It is **version-independent** (the TRAVEL tab has no v2/v4 dialect; it is located by header, so it takes no `version` arg). Warnings are emitted via `agg.warnings.push({ … })` (the established mechanism, `index.ts:368`/`:379`).

**Algorithm:**

1. **Locate the table.** Split the markdown into pipe-table rows. Find the **header row**: a row whose first cell (trimmed, upper-cased) is `NAME` and which contains a cell equal to `FLIGHT DETAILS` somewhere to its right. Record the 0-based column index of `NAME` (the first cell) and of the first `FLIGHT DETAILS` cell. If no such header row exists → **return** (no TRAVEL flight table; the common case for the 5 non-TRAVEL shows). Use the same `cleanRows`/markdown-escape-strip boundary the agenda parser uses (`lib/parser/blocks/agenda.ts`) so escaped `\|`/`\#` don't corrupt cell splitting.
2. **Crew window.** Iterate data rows after the header. **Stop** at the first row whose NAME cell is blank (the legend/template row, or end of the contiguous crew block) — OR at a row that does not start with `|` (table ended). A row with a non-blank NAME is a candidate flyer.
3. **Per candidate row:** read `nameRaw = cells[nameIdx]`, `flightRaw = cells[flightIdx] ?? ""` (tolerate a row shorter than `flightIdx` — trailing-empty trim → treat missing as empty).
   - **Exclude non-flyers:** if `flightRaw` is blank, OR `isNonFlyerSentinel(flightRaw)` (case-insensitive exact match against `{"DRIVING","LOCAL","N/A","TBD","TBA"}` after trim), OR `looksLikeLegendCell(flightRaw)` (contains a placeholder token `XXX - XXX` / `FLIGHT #` / bare `CODE`/`DATE`/`TIME` skeleton — secondary guard) → skip (emit no flight, no warning; a non-flyer is normal).
   - Otherwise **normalize** `flightRaw` → `flightInfo` (§2).
4. **Join-by-name + enrich.** `normalizeName(s) = s.trim().toLowerCase().replace(/\s+/g, " ")`. Find the crew row(s) in `crewMembers` whose `normalizeName(name)` equals `normalizeName(nameRaw)`.
   - **Exactly one match** AND that row's `flight_info` is currently `null` (TECH-path precedence — never overwrite an already-parsed flight) → set `row.flight_info = flightInfo`.
   - **Exactly one match** but `flight_info` already non-null → skip (precedence; no warning — a defensive case that does not occur in practice).
   - **Zero matches OR more than one match** → emit `{ code: "TRAVEL_FLIGHT_NAME_UNMATCHED", ... }` (§3) and do NOT mutate any row (never mis-assign a flight to the wrong/ambiguous crew member).

**Name-bleed guard (HIGH-risk preempt):** the TRAVEL NAME column is col A and the role lives in col B (`- Load In / … - V1`) — `nameRaw` is the NAME cell only, so the role suffix does not bleed into the join key. The test plan pins this with the real fixtures (the join must succeed against the roster name `John Carleo`, not `John Carleo - …`).

## §2 — Normalization (cell → `flight_info`)

The flattened cell is space-tokenized. The leg boundary is each **date token** matching `^\d{1,2}\/\d{1,2}$`. Split the token stream at every date token:

- The tokens **before the first** date token = the **optional conf prefix** (e.g. `GEUZAB`; empty for FinTech). Detect the conf purely by position (before the first date), NOT "first line/token = conf".
- Each `[date_i, date_{i+1})` token-run = one **leg**, re-joined with single spaces (e.g. `3/22 AA3002 LGA - ORD 7:23am - 9:15am`).
- `flight_info = (conf ? conf + " " : "") + legs.join(" | ")`.

Worked examples (the test fixtures):

```
GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am 3/26 AA2723 ORD - LGA 7:23am - 10:30am
  → "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am"

5/2 AA1080 LGA - ORD 12:00pm - 1:00pm 5/7 AA3237 ORD - LGA 10:02am - 1:17pm
  → "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm"
```

The render (`TravelSection.tsx`) splits on `" | "` and maps each leg to a line — so a round-trip → 2 lines (conf on the first), a one-way (single date) → 1 line (no `" | "`), a multi-segment (N dates) → N lines. **No card rework.** The `" | "` separator never collides with the in-leg `" - "` (route/times) — they are distinct substrings.

**Guard: a cell with NO date token** (e.g. a free-text note that survived the sentinel filter) → `legs` is empty → `flight_info` would be just the raw text with no `" | "`. To avoid storing junk: if **no** date token is found, treat the cell as a non-flyer (skip, no flight) — a real itinerary always has ≥1 date. This also covers a stray sentinel the exact-match filter missed.

## §3 — §12.4 warning code (the 3-lockstep)

One new code: **`TRAVEL_FLIGHT_NAME_UNMATCHED`** — a **quiet parser warning** (best-effort, like the `AGENDA_*` codes), `crewFacing: null`, emitted when a TRAVEL flyer's name has zero or >1 roster matches (a flight that exists but couldn't be attached). It is NOT a loud `admin_alert`; it flows to `shows_internal.parse_warnings` + `sync_log` + `/admin/dev` like the other parser warnings.

The §12.4 catalog requires the **three lockstep updates in one commit** (the M12.1 / Phase-2 lesson): (a) the master-spec §12.4 prose row in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, (b) regen `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, (c) the matching `lib/messages/catalog.ts` `MESSAGE_CATALOG` row (`crewFacing: null`). The `x1-catalog-parity` + `codes.test.ts` orphan gate enforce all three. Copy fields: `dougFacing` ≈ "A crew member's flight on the TRAVEL tab couldn't be matched to a roster name — check the spelling matches.", `helpfulContext` naming the show + the unmatched name.

## Guard conditions (every input state)

| Input | Behavior |
|---|---|
| No TRAVEL FLIGHT DETAILS table in the markdown (5 of 7 shows) | `parseTravelFlights` returns; no change; no warning |
| Flyer row, conf present (RPAS) | `flight_info = "GEUZAB … | …"` on the matched row |
| Flyer row, conf absent (FinTech) | `flight_info = "… | …"` (no conf prefix) |
| One-way (single date token) | `flight_info` = one leg, no `" | "` |
| Multi-segment (≥3 date tokens) | N legs joined by `" | "` (render shows N lines) |
| Blank FLIGHT DETAILS cell / row shorter than the bound col | non-flyer; skip |
| Sentinel cell (`DRIVING`/`LOCAL`/`Local`/`N/A`, any case) | non-flyer; skip |
| Legend/template row (blank NAME, or `XXX - XXX`/`CODE` skeleton) | excluded; skip |
| Cell with no date token (junk/free-text) | non-flyer; skip |
| Name matches exactly one roster crew member, `flight_info` null | enrich that row |
| Name matches one row but `flight_info` already set (TECH path) | skip (TECH precedence; no warning) |
| Name matches zero or >1 roster crew members | `TRAVEL_FLIGHT_NAME_UNMATCHED` warning; no mutation |

## Meta-test inventory (mandatory declaration)

- **`tests/cross-cutting/codes.test.ts` (orphan-codes / `x1-catalog-parity`) — EXTENDED.** The new `code: "TRAVEL_FLIGHT_NAME_UNMATCHED"` literal in `travelFlights.ts` is a producer the orphan gate scans; it MUST appear in §12.4 + the catalog (the §3 3-lockstep). This is the gate that fails if the code is added without the catalog rows.
- **Parser fixture-backed test (NEW): `tests/parser/travelFlights.test.ts`** — `parseSheet(rpas.md)`/`parseSheet(fintech.md)` → the John Carleo row gets the normalized `flight_info`; the join, exclusions, precedence, and the unmatched-name warning are pinned (the parser equivalent of the Phase-3 `crewFlightFixture` guard).
- **`postgrest-dml-lockdown` / advisory-lock topology — N/A** (no DB/table/RPC/lock surface; parser-only).
- **`_metaSentinelHidingContract` — N/A** (no UI surface; the card already ships).

## Test plan (the concrete failure each catches)

1. **`parseSheet(fixtures/shows/exporter-xlsx/rpas.md)`** → the crew row named `John Carleo` has `flight_info === "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am"`; all OTHER crew rows keep `flight_info` null. **Derive the expected legs by splitting the fixture cell at its date tokens** (anti-tautology — do not hardcode independently of the source). Catches: the table not located, wrong column bound, conf mishandled, leg boundary wrong.
2. **`parseSheet(fintech.md)`** → `John Carleo` gets `"5/2 … | 5/7 …"` (no conf prefix). Catches: the conf-optional path; the col-H-vs-col-I header binding.
3. **Synthetic legend row** (blank NAME + `CODE`/`XXX - XXX` cell) → produces no flight + no warning. Catches: legend leakage.
4. **Synthetic sentinel** (`LOCAL` / `DRIVING`, mixed case) in the FLIGHT DETAILS cell → non-flyer, no flight, no warning. Catches: sentinel case/location.
5. **Synthetic unmatched name** (a TRAVEL flyer `Jane Doe` not on the roster) → exactly one `TRAVEL_FLIGHT_NAME_UNMATCHED` warning; no crew row mutated. **Synthetic ambiguous name** (two roster `John Carleo` rows) → warning, no mutation. Catches: silent-drop / mis-assignment.
6. **Precedence:** a row whose `flight_info` is pre-set (simulating the TECH path) is NOT overwritten by a TRAVEL match. Catches: clobbering the authoritative TECH flight.
7. **`code: "TRAVEL_FLIGHT_NAME_UNMATCHED"`** is present in §12.4 + `catalog.ts` (the orphan gate passes). Catches: the missing 3-lockstep.

## Existing-code citations (verified 2026-06-19 against the worktree)

- Orchestration: `lib/parser/index.ts:316` `parseSheet`; `:369` `const crewMembers = parseCrew(markdown, version, agg)`; `:372` `parseTransportation(markdown, version, crewMembers, agg)` (the consume-crewMembers precedent); `:368`/`:379` `agg.warnings.push(...)`.
- Types: `lib/parser/types.ts:71` `flight_info: string | null` (on `CrewMemberRow`); `:1` `ParseWarning`; `:330` `ParsedSheet` (`crewMembers`/`warnings`).
- Aggregator: `lib/parser/warnings.ts:15` `ParseAggregator` (`.warnings`); `newAggregator` `:20`.
- Exporter flattening: `lib/drive/exportSheetToMarkdown.ts:40-51` `shouldPreserveNewlines` (`:45` `lines.length >= 3 → false`); `:33-37` the flatten branch; `:194` the all-tabs export loop.
- Fixtures (the parser's input): `fixtures/shows/exporter-xlsx/rpas.md:264` (header) `:268` (John Carleo); `fintech.md:300`/`:302`.
- The TECH-path flight (precedence sibling): `lib/parser/blocks/crew.ts:181-193` (`flightRaw = [arrivalRaw, departureRaw].filter(Boolean).join(" | ")`).
- §12.4 lockstep gate: `tests/cross-cutting/codes.test.ts` orphan-codes; `lib/messages/catalog.ts`; `lib/messages/__generated__/spec-codes.ts` (`pnpm gen:spec-codes`).

## Out of scope + deferrals

- **No exporter/sync/migration/projection/UI change** (all exist and carry `flight_info`).
- **No year-inference** — `flight_info` stores raw `M/D` like the TECH path; the render shows it as-is. (The raw-string approach sidesteps the year-rollover risk the format-audit flagged.)
- **No structured leg parsing** (route/airline/time fields) — the `" | "`-joined raw legs match the existing render; `BL-FLIGHT-LEG-ORIENTATION` (filed) covers structured display.
- **Multi-stay / >2-leg** is handled uniformly (split on every date) — no cap.
- **Fuzzy name matching** (nicknames, `Last, First`, middle initials) is OUT — only exact normalized (trim/casefold/collapse-ws) match; a mismatch surfaces via `TRAVEL_FLIGHT_NAME_UNMATCHED` rather than a guess. If real name-format drift appears, a follow-up can add a normalization rule.
