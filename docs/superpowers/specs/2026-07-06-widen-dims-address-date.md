# Widen dims / address / date parser format tolerance (audit rec-6d)

**Status:** design → spec
**Scope:** three independent, additive, behavior-preserving widenings of parser input-format tolerance. Pure parser + exporter-heuristic change. NO UI, NO DB, NO schema, no new §12.4 codes.
**Source:** `docs/audits/edge-case-preparedness-audit-2026-07-04.md` rec-6d ("widen dims/address/date formats opportunistically"), findings #8 / #9 / #11.

## Guiding principle

Each widening is **additive and gated**: every input the parser accepts today it still accepts identically (behavior-preserving, pinned by the existing suites with NO fixture edits), and each looser matcher is bounded so it cannot swallow non-date / non-address / non-dims text. Every sub-feature ships an explicit **STAYS REJECTED** list. "Opportunistically" is read conservatively — unambiguous forms are admitted; genuinely ambiguous forms are documented as rejected residual, not force-fit.

---

## Sub-feature A — Dates (audit #8)

### Current behavior (cited)
- `normalizeDate(raw)` (`lib/parser/blocks/_helpers.ts:86`) accepts ONLY `M/D/YY` or `M/D/YYYY` (optional leading day-of-week), via `^(\d{1,2})\/(\d{1,2})\/(\d{2,4})`; 2-digit year pinned to `2000+YY`; calendar-validity enforced via `new Date` round-trip; returns ISO `YYYY-MM-DD` or `null`.
- `extractAllDates(text)` (`lib/parser/blocks/dates.ts:313`, called at `:165`) **free-scans** text with a slash-only regex (day-of-week prefix optional) → routes each hit through `normalizeDate`.
- Free-scan consumers that must stay conservative: `extractAllDates` (dates.ts:165), `inferShowYear` (`_helpers.ts:126`), `scheduleBookends.ts:39`. All other date reads are cell-scoped (dates.ts:156/163/208/213/215/220/234/244; hotels.ts:459/462/466/473/816/825/834; scheduleTimes.ts:130; transport.ts:313/681/685; agenda.ts:118/132/253).

### Widened grammar (accept, in addition to today)
`normalizeDate` gains three additional shapes, all routed through the SAME calendar-validity round-trip and returning the same ISO output:
1. **ISO** `YYYY-MM-DD` (4-digit year 2000–2099; e.g. `2026-07-04`).
2. **Long-form month name**: `Month D, YYYY` and `D Month YYYY`, full or 3-letter month (`January`|`Jan`…`December`|`Dec`, case-insensitive; e.g. `June 24, 2026`, `24 Jun 2026`). Optional trailing comma before year.
3. **Dash slash-equivalent (CELL-ONLY)**: `M-D-YYYY` with a **4-digit** year (e.g. `6-24-2026`). NOT added to the free-scan alternation.

Free-scan (`extractAllDates`) alternation gains ONLY the ISO and long-form patterns — both are self-delimiting and cannot match a phone number, score, or range. The dash form is admitted only when `normalizeDate` is called on a known cell.

### STAYS REJECTED (dates)
- `M/D` / `M-D` with **no year** → `null` (unchanged).
- `M-D-YY` (2-digit-year dash) and long-form with 2-digit year → `null` (ambiguous; only 4-digit dash/ISO admitted).
- Bare dash `M-D-YYYY` in FREE-SCAN text → not matched (ranges/scores like `12-0`, `7-4` never become dates).
- European `D/M/YYYY` where D>12 → still interpreted as `M/D` then rejected by calendar-validity (unchanged; ambiguous-locale reinterpretation is OUT OF SCOPE).
- Calendar-invalid (`2026-02-30`, `Feb 30 2026`) → `null` (round-trip guard applies to all shapes).
- Times (`10:30`), years alone (`2026`), `Q3 2026` → not dates.

---

## Sub-feature B — Address (audit #9)

### Current behavior (cited)
- `STREET_ADDRESS_RE` (`lib/parser/blocks/hotels.ts:258`): `<1–5 digit number> [dir] <0–4 name words|ordinal> <closed US street-suffix vocab>`. Suffix set: St/Street/Ave/Avenue/Av/Blvd/Boulevard/Dr/Drive/Rd/Road/Pl/Place/Ln/Lane/Way/Ct/Court/Pkwy/Parkway/Sq/Square/Ter/Terrace/Cir/Circle/Hwy/Highway/Pike/Row/Walk/Trl/Trail/Loop/Path/Plaza.
- `STREET_ADDRESS_ZIP_RE` (`hotels.ts:264`): suffixless street recognized via US ZIP tail `, <ST> <5-digit ZIP>(-4)?`.
- Consumers: `looksLikeStreetStart` (hotels.ts:273/275, Hotel-Stays discriminator), `splitHotelNameAddress` (hotels.ts:295, the SPLIT — suffix-only, ZIP branch is discriminator-only).
- `venue.ts` has NO regex address logic — address is a resolved label (`resolveAlias("venue.address")`, venue.ts:181/194/221/266); combined "VENUE NAME/VENUE ADDRESS" split on `/`. **Venue address is therefore OUT OF SCOPE** (nothing to widen).
- **Exporter coupling (companion surface):** `shouldPreserveNewlines` (`lib/drive/exportSheetToMarkdown.ts:59`) returns `true` → PRESERVE newline as `&#10;`; returns `false` → FLATTEN to a single space-joined line (`normalizeNewlines`, exportSheetToMarkdown.ts:52-56). It owns a SEPARATE inline address copy at `:80`: `if (lines[1] && /^[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}/.test(lines[1])) return false;` — a 2-line cell whose 2nd line looks like `City, ST 12345` is recognized as an address and **FLATTENED** (`return false`), so the downstream `splitHotelNameAddress` sees the name+address on ONE line. This regex is decoupled from hotels.ts and must be widened in lockstep for the same postal shapes, else a Canadian hotel's 2-line address cell would MISS this branch, fall through to the `lines.length >= 3` / default-preserve rules, keep its `&#10;`, and the splitter would not see a flat address.

### Widened grammar (accept, in addition to today)
1. **Extend the street-suffix vocabulary** in `STREET_ADDRESS_RE` with **distinctive** Canadian / broader street-type suffixes only — additive to the closed set, and deliberately EXCLUDING common single-nouns that double as ordinary name words: `Crescent|Cres|Commons|Close|Mews|Quay|Wharf|Gardens|Gdns|Esplanade|Promenade|Concourse`. (Codex spec R1 finding 2 — `Bay|Gate|Green|Common|Landing|Crossing|Grove|Alley|Bend` are DROPPED: each is a frequent hotel-name / place-name word and would false-split `<number> <word> Bay/Gate/…`. They join the STAYS-REJECTED list.)
2. **Canadian postal tail** in BOTH `STREET_ADDRESS_ZIP_RE` (hotels.ts:264) AND the exporter copy (exportSheetToMarkdown.ts:80): accept `, <PROV> <A1A 1A1>` where the postal code is `[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d` in addition to the US `<ST> <5-digit ZIP>`. Province is the same 2-letter uppercase token slot. Both regexes accept the SAME postal shape (companion-surface invariant 2).

### STAYS REJECTED (address)
- Alphanumeric house numbers (`123A Main St`), PO boxes → still left glued (SAFE failure — stays whole as hotel_name; unchanged).
- A number followed by a word with NO suffix and NO postal tail → not split (unchanged; a numeric-branded name like `Hotel 71` never mis-splits).
- Ordinary-noun "suffixes" `Bay|Gate|Green|Common|Landing|Crossing|Grove|Alley|Bend` → NOT added (would false-split place/brand names like `5 Bay Club`, `10 Green Suites`); a Canadian address using one of these as a real street type is accepted only via the postal-tail branch (invariant 2), not the suffix branch.
- Confirmation numbers → never a postal/ZIP tail follows, so never false-split (unchanged invariant preserved).
- UK full postcodes beyond the `A1A 1A1` Canadian shape (e.g. `SW1A 1AA`) → OUT OF SCOPE (documented; no corpus evidence).

---

## Sub-feature C — Dims (audit #11)

### Current behavior (cited)
The dims token `\d+\s*'\s*x` (feet-mark `'` then literal `x`, case-insensitive) appears at THREE sites that MUST widen together (Codex spec R1 finding 3 — verified names/lines):
- `roomHeaderNameShape` (`rooms.ts:129`, guard at `:134` `/^\d+\s*'\s*x/i`) — REJECTS a dims-leading string from being a room NAME.
- `splitRoomHeader` `dimStart` (`rooms.ts:1486`): `/(?:\b(?:TOTAL|APPROXIMATELY)\s*:?\s*|\bA\/B\s*:\s*)?\d+\s*'\s*x/i` — EXTRACTS the dims START index (slice at :1490/:1498). Callers: :748/953/964/1136/1183/1243/1400.
- `harvestSameNameHeaderDims` (`rooms.ts:1261`, regex at `:1270` `/(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/`) — EXTRACTS a FULL `N' x N'(x N')` dims token from a non-first header line, requiring `'` on every operand. Its widening must accept the same unit/symbol set AND keep capturing the full 2-or-3-operand token.
- **Post-extraction cleanup** (`splitRoomHeader` dangling-`x` strip, `rooms.ts:1497` `.replace(/\s*x\s*$/i, "")`, audit idx22): currently strips only ASCII `x`. It MUST be widened to `.replace(/\s*[x×]\s*$/i, "")` so a dangling unicode `×` (now accepted as a separator) is also stripped, else a `75′ × 37′ ×` cell leaks a trailing `×` to the crew card.

### Widened grammar (accept, in addition to today)
Replace the fixed `\d+\s*'\s*x` core with a shared dims-token pattern accepting:
- **Unit** (optional, on the operand): `'` (ASCII prime) | `′` (U+2032) | `ft`/`FT` (word-boundaried).
- **Separator**: `x` | `X` | `×` (U+00D7).
- **Bare-number gate (the false-positive control):** a fully unit-less token is admitted ONLY as `\b\d{2,3}\s*[x×]\s*\d{2,3}\b` — **both operands 2–3 digits (10–999)**, each on a word boundary so it cannot glue to adjacent alphanumerics (`Box40x2`, a product SKU, or `Room4x4` do NOT match). Real room dimensions are always ≥ 10 ft, so `50 x 40` / `120x80` are admitted while single-digit `5 x 8` (index-card / count / odds / `3x4` grid) is NOT, and a ≥4-digit operand (a year, a SKU) is NOT. A **unit-bearing** token (`50' x`, `50′×`, `50ft x`) needs no digit-count gate — the unit disambiguates, so `8' x 10'` (small unit-bearing dims) still parses.

Effective accepted set (examples): `50' x 40'`, `50'x40'`, `50′×45′`, `50ft x 40ft`, `50 FT X 40'`, `50 x 40`, `120x80`, `8' x 10'`, `APPROXIMATELY 60' x 45'`, `TOTAL 120 x 80`. All three sites (`roomHeaderNameShape`, `dimStart`, `harvestSameNameHeaderDims`) derive from ONE exported pattern/constant so they cannot drift; the dangling-separator cleanup (`rooms.ts:1497`) is widened to `[x×]` in the same change.

### STAYS REJECTED (dims)
- Fully bare single-digit `5 x 8`, `3x4` (an operand < 2 digits, no unit) → NOT dims (ambiguous with counts/odds/cards). Unit-bearing `8' x 10'` IS accepted (unit disambiguates).
- Fully bare with a ≥4-digit operand `2026 x 40`, `1200x50` (no unit) → NOT dims via the bare gate (a year / SKU); a genuine >999 ft dimension would need a unit (`1200' x 50'`), which the unit branch accepts.
- Bare `NxN` glued to adjacent alphanumerics (`Box40x2`, `Room4x4`, a SKU) → NOT matched (`\b`…`\b` word-boundary requirement).
- A separator with a missing operand (`50' x`, trailing) → the widened dangling-separator cleanup (`[x×]`) strips it (unchanged behavior, extended to `×`).
- `x`/`×` glued inside a word with no leading number (`Box`, `Matrix`) → the `\d+` before the separator + operand-after requirement prevents a match.
- Non-`x` separators (`50 by 40`, `50*40`) → OUT OF SCOPE (documented; no corpus evidence).

---

## Files touched (all in worktree)
- `lib/parser/blocks/_helpers.ts` — `normalizeDate` widened (ISO + long-form + cell dash).
- `lib/parser/blocks/dates.ts` — `extractAllDates` free-scan alternation gains ISO + long-form.
- `lib/parser/blocks/hotels.ts` — `STREET_ADDRESS_RE` suffix vocab; `STREET_ADDRESS_ZIP_RE` Canadian tail.
- `lib/drive/exportSheetToMarkdown.ts` — `shouldPreserveNewlines:80` Canadian postal tail (lockstep with hotels.ts).
- `lib/parser/blocks/rooms.ts` — one shared dims-token constant; `roomHeaderNameShape` + `dimStart` + `harvestSameNameHeaderDims` derive from it.

## Companion-surface invariants (must stay in lockstep — enumerate in plan)
1. **Dims token single-source:** `roomHeaderNameShape`, `splitRoomHeader dimStart`, and `harvestSameNameHeaderDims` all consume ONE exported dims-token pattern. A test asserts the three sites reference the shared constant (no re-inlined literal).
2. **Address postal shape parity:** the Canadian-postal tail accepted by `hotels.ts STREET_ADDRESS_ZIP_RE` and by `exportSheetToMarkdown.ts:80` are the SAME shape. A test asserts a Canadian 2-line hotel cell is (a) newline-preserved by the exporter AND (b) split by `splitHotelNameAddress` — proving the two regexes agree.

## Testing (TDD per task; derive expectations from inputs, never hardcode)
- **Dates:** table-drive `normalizeDate` over the new accepted shapes (each → its ISO) + the STAYS-REJECTED list (each → `null`); a free-scan test proving `extractAllDates` picks up ISO + long-form but does NOT turn `12-0` / `7-4` / `10:30` into dates. Calendar-validity applies to every new shape (`2026-02-30`→null, `Feb 30 2026`→null).
- **Address:** `splitHotelNameAddress` over new suffixes (Crescent/Commons/…) and a Canadian postal address (name/address split correct); the STAYS-REJECTED cases (numeric brand, PO box, no-suffix-no-postal) still return whole; the exporter parity test (invariant 2).
- **Dims:** `splitRoomHeader` + `roomHeaderNameShape` + `harvestSameNameHeaderDims` over each new unit/symbol variant AND the bare-`50 x 40` (admit) vs bare-`5 x 8` (reject) gate; the single-source invariant test (invariant 1).
- **Behavior preservation:** the full existing parser suite + `exporterFixtures.test.ts` stay green with NO fixture edits and no snapshot regen.

## Meta-test inventory
- CREATES: none new is strictly required, but ships two small structural pins (companion-surface invariants 1 & 2 above) as focused tests.
- EXTENDS: `tests/parser/blocks/_helpers.test.ts`, `dates.test.ts`, `rooms.test.ts` / `roomsHeaderHardening.test.ts`, `hotels.test.ts`, `tests/parser/exporterFixtures.test.ts`.
- Advisory-lock topology: N/A (pure parser/exporter, no `pg_advisory*`, no DB writes).

## Out of scope (declared, to preempt reviewer relitigation)
- Venue address widening (venue.ts is label-based; nothing to widen).
- European day-first date reinterpretation; 2-digit-year dash/long-form; UK postcodes; `50 by 40` / `*` dim separators; bare single-digit dims. Each is an ambiguous or evidence-free form deliberately left rejected.
