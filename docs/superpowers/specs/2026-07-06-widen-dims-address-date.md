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
- Free-scan consumers that must stay conservative: `extractAllDates` (dates.ts:165), `inferShowYear` (`_helpers.ts:123-128`), `scheduleBookends.ts:39`. All other date reads are cell-scoped (dates.ts:156/163/208/213/215/220/234/244; hotels.ts:459/462/466/473/816/825/834; scheduleTimes.ts:130; transport.ts:313/681/685; agenda.ts:118/132/253).
- **Hotel check-in/out CAPTURE regexes** (`hotels.ts:635-636`) are slash-only pre-filters that gate what reaches `normalizeDate` on the hotel path — see the OUT-OF-SCOPE note below; they are deliberately NOT widened.

### Widened grammar (accept, in addition to today)
`normalizeDate` gains three additional shapes, all routed through the SAME calendar-validity round-trip and returning the same ISO output:
1. **ISO** `YYYY-MM-DD` (4-digit year 2000–2099; e.g. `2026-07-04`).
2. **Long-form month name**: `Month D, YYYY` and `D Month YYYY`, full or 3-letter month (`January`|`Jan`…`December`|`Dec`, case-insensitive; e.g. `June 24, 2026`, `24 Jun 2026`). Optional trailing comma before year.
3. **Dash slash-equivalent (CELL-ONLY)**: `M-D-YYYY` with a **4-digit** year (e.g. `6-24-2026`). NOT added to the free-scan alternation.

Free-scan (`extractAllDates`) alternation gains ONLY the ISO and long-form patterns — both are self-delimiting and cannot match a phone number, score, or range. The dash form is admitted only when `normalizeDate` is called on a known cell.

**`inferShowYear` (`_helpers.ts:123-128`) must widen too (Codex spec R3 finding 2) — as a STRICT SLASH-FIRST FALLBACK (Codex spec R7 finding 2).** It back-fills yearless hotel/transport dates by scanning for "the first `M/D/YY(YY)` date anywhere in the sheet" (`.exec` → first positional match at `:124`). A sheet whose dates are ALL ISO or long-form (no slash date) would otherwise infer NO show year, breaking yearless date back-fill. Widen it **without changing the slash path**: run the existing slash regex FIRST and return its year if it matches; ONLY when the slash scan returns null (no slash date anywhere) fall back to scanning for the first ISO (`YYYY-MM-DD`) or long-form (`Month D, YYYY` / `D Month YYYY`) date and extract its 4-digit year. This is NOT a single combined alternation — a combined alternation would take the earliest-in-document hit across all formats, so on a MIXED sheet (both a slash date and an ISO/long-form date) an ISO date appearing *before* the first slash date would change the inferred year (regression). Slash-first fallback preserves today's inferred year byte-for-byte on every sheet that has any slash date, and only extends behavior to ISO/long-form-ONLY sheets. Same conservative, self-delimiting ISO/long-form patterns as the `extractAllDates` widening (no bare dash in the free scan). `scheduleBookends.ts:39` is a banner regex unaffected by these formats (out of scope, unchanged).

**Hotel inline check-in/out capture is OUT OF SCOPE — retained slash-only (Codex spec R7 finding 1).** `buildInlineHotel` captures check-in/out via slash-only pre-filters (`hotels.ts:635-636` `/check\s+in[:\s]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i`) that feed `resolveDate` (`:812`) → `normalizeDate` (`:816/:825`), with year-rollover (`:832-835`) and yearless back-fill logic that are STRUCTURALLY coupled to the slash `M/D` shape (back-fill appends `/${year}`; the `checkOutHadYear` rollover test at `:832` is a slash literal). Widening `normalizeDate` does NOT reach this path because the capture regex pre-filters to slashes before `normalizeDate` is ever called. These extractors STAY slash-only: widening them is a larger, riskier change to the year-backfill/rollover machinery, there is no corpus evidence of ISO/long-form check-in dates in the sheets, and leaving them is fully behavior-preserving (an ISO check-in date is unrecognized today and remains so — no inconsistency, the widening simply does not extend here). This is a documented residual, not a defect.

### STAYS REJECTED (dates)
- `M/D` / `M-D` with **no year** → `null` (unchanged).
- `M-D-YY` (2-digit-year dash) and long-form with 2-digit year → `null` (ambiguous; only 4-digit dash/ISO admitted).
- Bare dash `M-D-YYYY` in FREE-SCAN text → not matched (ranges/scores like `12-0`, `7-4` never become dates).
- European `D/M/YYYY` where D>12 → still interpreted as `M/D` then rejected by calendar-validity (unchanged; ambiguous-locale reinterpretation is OUT OF SCOPE).
- Calendar-invalid (`2026-02-30`, `Feb 30 2026`) → `null` (round-trip guard applies to all shapes).
- Times (`10:30`), years alone (`2026`), `Q3 2026` → not dates.
- Hotel inline check-in/out dates in ISO/long-form/dash (`Check In: 2026-07-04`) → NOT captured (the `:635-636` capture stays slash-only; documented residual, not a regression — unrecognized today, unrecognized after).
- On a MIXED sheet (slash + ISO/long dates), `inferShowYear` still returns the year of the FIRST SLASH date (slash-first fallback) — an earlier-in-document ISO/long date does NOT override it.

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
- Ordinary-noun "suffixes" `Bay|Gate|Green|Common|Landing|Crossing|Grove|Alley|Bend` → NOT added to the split vocabulary (would false-split place/brand names like `5 Bay Club`, `10 Green Suites`). A Canadian address whose street type is one of these has no recognized suffix, so `splitHotelNameAddress` leaves it whole — the SAME safe glued-name behavior as a suffixless US address (the postal-tail branch is discriminator/exporter-only and does NOT split; see invariant 2).
- Confirmation numbers → never a postal/ZIP tail follows, so never false-split (unchanged invariant preserved).
- UK full postcodes beyond the `A1A 1A1` Canadian shape (e.g. `SW1A 1AA`) → OUT OF SCOPE (documented; no corpus evidence).

---

## Sub-feature C — Dims (audit #11)

### Current behavior (cited)
The dims token (feet-mark `'` then literal `x`, case-insensitive) appears at **SEVEN sites** in `rooms.ts` that MUST widen together (Codex spec R4 finding — a class-sweep `grep -nE "\d.*'.*x|x.*\d.*'" lib/parser/blocks/rooms.ts` proves these are the COMPLETE set: no versioned-parser mirror (`lib/parser/versions/` does not exist) and no other file under `lib/parser/` carries a dims-token regex). They fall into three shape-classes:

**Class A — anchored `^`-START (classify the whole cell/line):**
- `roomHeaderNameShape` (`rooms.ts:129`, guard at `:134` `/^\d+\s*'\s*x/i`) — REJECTS a dims-leading string from being a room NAME.
- `headerDayMarker` (`rooms.ts:155`, per-line test at `:167` `/^\d+\s*'?\s*x\s*\d/i`) — requires every non-empty line AFTER the DAY-range anchor to be a dims-only line (part of the multi-line room-header SHAPE predicate `isRoomHeaderShape`, :173). Already digit-UNGATED and feet-mark-optional (admits `60 x 45`, `5 x 8`).

**Class B — unanchored START (locate/attest a dims token anywhere in the string):**
- GS-room evidence gate (`findGsBlockVenueHeader`, `rooms.ts:875` `/\d+\s*'\s*x/i`) — a dims token is STRONG evidence a col-duplicated cell is a real room-header (vs a trimmed metadata label).
- BO-venue evidence gate (`findBoBlockVenueHeaders`, `rooms.ts:934` `/\d+\s*'\s*x/i`) — the same evidence test for BREAKOUT venue headers.
- `splitRoomHeader` `dimStart` (`rooms.ts:1486`): `/(?:\b(?:TOTAL|APPROXIMATELY)\s*:?\s*|\bA\/B\s*:\s*)?\d+\s*'\s*x/i` — EXTRACTS the dims START index (slice at :1490/:1500). Callers: :748/953/964/1136/1183/1243/1400.

**Class C — FULL 2-or-3-operand capture (extract the dims value):**
- DAY-header dims extract (`rooms.ts:1214` `/(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/`) — pulls dims riding a DAY-range breakout header line into `room.dimensions`.
- `harvestSameNameHeaderDims` (`rooms.ts:1261`, regex at `:1270` `/(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/`) — the FALLBACK harvest of a full dims token from a same-named non-first header line. **:1214 and :1270 are a matched pair** — both extract dims for the SAME breakout room (:1214 tries the DAY header first, :1270 is the same-name fallback at :1225); widening one without the other lets a `50′×45′` dims token be captured via the fallback but dropped when it rides the DAY header directly (Codex R4).

**Post-extraction cleanup** (`splitRoomHeader` dangling-`x` strip, `rooms.ts:1497` `.replace(/\s*x\s*$/i, "")`, audit idx22): currently strips only ASCII `x`. It MUST be widened to `.replace(/\s*[x×]\s*$/i, "")` so a dangling unicode `×` (now accepted as a separator) is also stripped, else a `75′ × 37′ ×` cell leaks a trailing `×` to the crew card.

### Widened grammar (accept, in addition to today)
Replace the fixed `\d+\s*'\s*x` core with shared, exported FRAGMENTS (`DIMS_SEP`, `DIMS_OPERAND_UNIT`, `DIMS_OPERAND_BARE`, and the two composed matchers `DIMS_START` / `DIMS_FULL` — see companion-surface invariant 1 for exact definitions) that each site composes into the shape IT needs (anchored `^`-START for Class A, unanchored START for Class B, full 2-or-3-operand capture for Class C; `DIMS_SEP` also drives the dangling-separator cleanup). **One documented exception:** `headerDayMarker:167` keeps its digit-UNGATED bare form (see invariant 1) so its existing `60 x 45` / `5 x 8` acceptance is preserved — it only gains the `×` / `′` / `ft` symbol-and-unit variants. The accepted forms:
- **Unit** (optional, on the operand): `'` (ASCII prime) | `′` (U+2032) | `ft`/`FT` (word-boundaried).
- **Separator**: `x` | `X` | `×` (U+00D7).
- **Bare-number gate (the false-positive control):** a fully unit-less token is admitted ONLY with **both operands 2–3 digits (10–999)** and bounded so it cannot glue to adjacent alphanumerics (`Box40x2`, `Room4x4`, `120x80B`, `SKU 40x20A` do NOT match). The exact boundary mechanism is matcher-specific (`\b`-delimited for `DIMS_START`, `(?!\d)`-per-operand + a whole-token trailing alnum-guard for `DIMS_FULL` — see invariant 1 for why `\b` alone is wrong for the full capture). Real room dimensions are always ≥ 10 ft, so `50 x 40` / `120x80` are admitted while single-digit `5 x 8` (index-card / count / odds / `3x4` grid) is NOT, and a ≥4-digit operand (a year, a SKU) is NOT. A **unit-bearing** token (`50' x`, `50′×`, `50ft x`) needs no digit-count gate — the unit disambiguates, so `8' x 10'` (small unit-bearing dims) still parses.

Effective accepted set (examples): `50' x 40'`, `50'x40'`, `50′×45′`, `50ft x 40ft`, `50 FT X 40'`, `50 x 40`, `120x80`, `8' x 10'`, `APPROXIMATELY 60' x 45'`, `TOTAL 120 x 80`. All SEVEN sites compose the SAME exported fragments (`DIMS_START` for Class A/B, `DIMS_FULL` for Class C, both built from `DIMS_OPERAND_UNIT` / `DIMS_OPERAND_BARE` / `DIMS_SEP`) so they cannot drift; the dangling-separator cleanup (`rooms.ts:1497`) is widened to `DIMS_SEP` (`[x×]`) in the same change.

### STAYS REJECTED (dims)
- Fully bare single-digit `5 x 8`, `3x4` (an operand < 2 digits, no unit) → NOT dims (ambiguous with counts/odds/cards). Unit-bearing `8' x 10'` IS accepted (unit disambiguates).
- Fully bare with a ≥4-digit operand `2026 x 40`, `1200x50` (no unit) → NOT dims via the bare gate (a year / SKU); a genuine >999 ft dimension would need a unit (`1200' x 50'`), which the unit branch accepts.
- Bare `NxN` glued to adjacent alphanumerics (`Box40x2`, `Room4x4`, `120x80B`, `SKU 40x20A`) → NOT matched: left-glue is denied by the leading `\b`; right-glue (a trailing letter/digit on the last operand) is denied by the whole-token trailing `(?![0-9A-Za-z])` guard (Codex spec R5→R6).
- Bare chain with a ≥4-digit operand (`50 x 1200`, `1200x50`, `50 x 40 x 1200`) → the over-length operand fails `\d{2,3}(?!\d)`, so the token is rejected outright (2-operand case) or truncated to the valid leading pair with the bad tail dropped (3-operand case) — never captured as a partial `120`.
- A separator with a missing operand (`50' x`, trailing) → the widened dangling-separator cleanup (`[x×]`) strips it (unchanged behavior, extended to `×`).
- `x`/`×` glued inside a word with no leading number (`Box`, `Matrix`) → the `\d+` before the separator + operand-after requirement prevents a match.
- Non-`x` separators (`50 by 40`, `50*40`) → OUT OF SCOPE (documented; no corpus evidence).

---

## Files touched (all in worktree)
- `lib/parser/blocks/_helpers.ts` — `normalizeDate` widened (ISO + long-form + cell dash); `inferShowYear` widened as a STRICT slash-first fallback (existing slash scan unchanged; ISO/long-form scanned ONLY when no slash date exists — never a combined alternation).
- `lib/parser/blocks/dates.ts` — `extractAllDates` free-scan alternation gains ISO + long-form.
- `lib/parser/blocks/hotels.ts` — `STREET_ADDRESS_RE` suffix vocab; `STREET_ADDRESS_ZIP_RE` Canadian tail.
- `lib/drive/exportSheetToMarkdown.ts` — `shouldPreserveNewlines:80` Canadian postal tail (lockstep with hotels.ts).
- `lib/parser/blocks/rooms.ts` — shared dims-token FRAGMENTS + composed `DIMS_START` / `DIMS_FULL` matchers (a small exported module or top-of-file constants). Applied to all SEVEN sites: Class A anchored-START (`roomHeaderNameShape:134`; `headerDayMarker:167` via its documented digit-ungated superset), Class B unanchored-START (GS evidence `:875`, BO evidence `:934`, `dimStart:1486`), Class C full-capture (DAY-header extract `:1214`, `harvestSameNameHeaderDims:1270`); dangling-separator cleanup `:1497` widened to `DIMS_SEP` (`[x×]`).

## Companion-surface invariants (must stay in lockstep — enumerate in plan)
1. **Dims token single-source via shared FRAGMENTS (Codex spec R2 finding 3, R3 finding 1, R4 finding — SEVEN sites, three shape-classes):** the sites have DIFFERENT shapes by necessity — Class A/B need a partial START matcher (locate/attest where dims begin), Class C needs a FULL capture (the whole 2-or-3-operand token). They CANNOT share one whole-token regex; instead they compose exported sub-fragments (regex-source strings, shared from one module so every site imports the same literal — no re-inlined `'\s*x`):
   - `DIMS_SEP` = `[x×]` (the separator; ASCII `x`/`X` via the `i` flag, plus U+00D7 `×`).
   - `DIMS_OPERAND_UNIT` = `\d+\s*(?:['′]|ft\b)` — a **unit-bearing** operand; unit is REQUIRED, so digit count is UNGATED (an explicit unit disambiguates: `8' x 10'`, `2026' x 40'` are real dims).
   - `DIMS_OPERAND_BARE` = `\d{2,3}(?!\d)` — a **unit-less** operand, gated to 2–3 digits with a negative-lookahead forbidding a 4th digit, so `2026`/`1200` cannot be truncated to a bare `120`/`202`, and `5 x 8` (single digit) is not admitted. **It carries NO trailing `\b`** — see the DIMS_FULL note below for why `\b` is the WRONG boundary here.
   Two composed matchers built from those fragments:
   - `DIMS_START` (partial — "a dims token begins here") = `(?:\d+\s*(?:['′]|ft\b)\s*[x×]|\b\d{2,3}\s*[x×]\s*\d{2,3}\b)`. The **unit-bearing** branch needs only operand-unit + separator (the unit disambiguates, matching today's `\d+'\s*x` "one operand + `x`" behavior). The **fully-bare** branch requires the WHOLE `\b NN x NN \b` token (both 2–3-digit operands, word-boundaried) — so a lone `50 x` (in "50 x 4 rows"), `50 xylophones`, or `2026 x 40` never triggers a bare START. (`DIMS_START`'s bare `\b` boundaries are correct here because its first bare operand is *immediately* followed by the mandatory separator — a 4-digit prefix can never satisfy `\d{2,3}\s*[x×]` — and its second/last bare operand is followed by end-or-non-word where `\b` holds.)
   - `DIMS_OPERAND` (either kind) = `(?:\d+\s*(?:['′]|ft\b)|\d{2,3}(?!\d))`. The unit alt self-terminates on `'`/`′`/`ft\b`; the bare alt uses `(?!\d)`, NOT a trailing `\b` (**Codex spec R5 → R6 correction**: a trailing `\b` is WRONG for a bare operand that is followed by the separator, because the ASCII separator `x`/`X` is itself a word-character — `\b\d{2,3}\b[x×]` can never match the no-space form `120x80`, since there is no word boundary between `0` and `x`. `(?!\d)` forbids a 4th digit without demanding a boundary the separator can't provide.)
   - `DIMS_FULL` (2-or-3-operand capture) = `(\bDIMS_OPERAND\s*[x×]\s*DIMS_OPERAND(?:\s*[x×]\s*DIMS_OPERAND)?)(?![0-9A-Za-z])`, i.e. `(\b(?:\d+\s*(?:['′]|ft\b)|\d{2,3}(?!\d))\s*[x×]\s*(?:\d+\s*(?:['′]|ft\b)|\d{2,3}(?!\d))(?:\s*[x×]\s*(?:\d+\s*(?:['′]|ft\b)|\d{2,3}(?!\d)))?)(?![0-9A-Za-z])`. Three guards work together: the **leading `\b`** gates the first operand's left edge (rejects left-glue `Box40x2`); the **per-operand `(?!\d)`** forbids ≥4-digit bare operands (`2026 x 40` fails — the first bare operand `\d{2,3}(?!\d)` cannot match `2026`; `50 x 1200` fails — the 2nd operand cannot be `1200`); the **trailing `(?![0-9A-Za-z])` on the whole token** rejects a letter/digit glued to the last operand (`120x80B`→no match, `SKU 40x20A`→no match) while still admitting the no-space `120x80` and unit forms `50′×45′`/`2026' x 40'`. A 3-operand chain whose 3rd operand is over-length (`50 x 40 x 1200`) captures the valid leading pair `50 x 40` and drops the bad tail (the optional 3rd group simply fails to match). All accept/reject cases in the STAYS-REJECTED list below are machine-verified against these exact patterns.

   Per-site composition (all SEVEN):
   - **Class A** — `roomHeaderNameShape:134` = `^\s*` + `DIMS_START`. **`headerDayMarker:167` is the documented exception:** it keeps `/^\s*\d+\s*(?:['′]|ft\b)?\s*[x×]\s*\d/i` — digit-UNGATED, unit-OPTIONAL, one required 2nd-operand digit — a pure superset of today's `/^\d+\s*'?\s*x\s*\d/i` (adds `×`/`′`/`ft` only). It does NOT use the bare gate because it is already structurally gated (a whole line, AFTER a DAY-range anchor, that must be dims-only), and gating it to `\d{2,3}` would REGRESS its current `5 x 8` acceptance. No year-false-positive risk: a standalone `2026 x 40` line after a DAY anchor is implausible, and even then it only affects whether a multi-line cell is *classified* a room header — a benign, pre-existing-shape decision, not a dims value.
   - **Class B** — GS evidence `:875`, BO evidence `:934`, and `dimStart:1486` all use unanchored `DIMS_START` (`:1486` keeps its `(?:TOTAL|APPROXIMATELY|A/B:)` prefix ahead of it).
   - **Class C** — DAY-header extract `:1214` and `harvestSameNameHeaderDims:1270` both use `DIMS_FULL` (identical — they are the matched extraction pair).
   - Cleanup `:1497` uses `DIMS_SEP`.

   A test asserts (a) all seven sites reference the shared fragments/matchers (no re-inlined `'\s*x` literal survives except the deliberately-inlined `167` superset, which the test pins as an explicit allow-listed exception with the exact expected pattern); (b) the dangling-separator cleanup uses `DIMS_SEP`; (c) bare `2026 x 40` does NOT parse as dims at any Class A-reject / B-extract / C-capture site while `2026' x 40'` DOES; (d) `50′×45′` is recognized identically across a Class A reject, a Class C DAY-header extract (`:1214`), and the `:1270` fallback (proving the `:1214`/`:1270` pair moves together). Widening a fragment updates every site at once without opening the 4-digit-bare hole.
2. **Address postal shape parity:** the Canadian-postal tail accepted by `hotels.ts STREET_ADDRESS_ZIP_RE` (discriminator) and by `exportSheetToMarkdown.ts:80` (exporter flatten) are the SAME shape. NOTE the SPLIT (`splitHotelNameAddress`) is suffix-only and is NOT changed by the postal-tail (hotels.ts:266 comment: ZIP branch is "NOT used to SPLIT") — postal-tail widening affects only the Hotel-Stays discriminator and the exporter. A test asserts a Canadian 2-line hotel cell is **FLATTENED** by the exporter (`shouldPreserveNewlines` returns `false`, so name+address land on ONE line) AND that `looksLikeStreetStart` recognizes the Canadian street start — proving the two postal regexes agree. (A Canadian address that ALSO carries a recognized street suffix additionally splits via `STREET_ADDRESS_RE`; a suffixless one stays glued — SAFE, same as suffixless US.)

## Testing (TDD per task; derive expectations from inputs, never hardcode)
- **Dates:** table-drive `normalizeDate` over the new accepted shapes (each → its ISO) + the STAYS-REJECTED list (each → `null`); a free-scan test proving `extractAllDates` picks up ISO + long-form but does NOT turn `12-0` / `7-4` / `10:30` into dates; an `inferShowYear` test proving (a) a sheet with ONLY ISO (or ONLY long-form) dates still infers the correct show year (regression for yearless hotel/transport back-fill), AND (b) **the slash-first mixed-sheet preservation case** — a sheet containing an ISO/long-form date positioned BEFORE the first slash date still returns the year of the SLASH date (proving the widening did not regress the mixed-sheet path via a combined alternation). Calendar-validity applies to every new shape (`2026-02-30`→null, `Feb 30 2026`→null).
- **Address:** `splitHotelNameAddress` splits on the new distinctive suffixes (Crescent/Commons/…, name/address split correct); a Canadian address with NO recognized suffix stays whole (SAFE, unchanged); `looksLikeStreetStart` recognizes a Canadian postal start; the STAYS-REJECTED cases (numeric brand, PO box, dropped ordinary nouns) still return whole; the exporter parity test (invariant 2 — Canadian cell FLATTENED).
- **Dims:** `splitRoomHeader` + `roomHeaderNameShape` + `headerDayMarker` + `harvestSameNameHeaderDims` over each new unit/symbol variant (`50′×45′`, `50ft x 40ft`, `8' x 10'`) AND the bare-`50 x 40`/`120x80` (admit) vs bare-`5 x 8`/`2026 x 40`/`Box40x2`/`120x80B`/`SKU 40x20A`/`50 x 1200` (reject) gate; a `headerDayMarker` regression proving its existing `5 x 8` / `60 x 45` day-marker lines still admit AND a new `60′ × 45′` day-marker line now admits; the matched-pair test proving a `50′×45′` dims token riding a DAY header (`:1214`) and via the same-name fallback (`:1270`) both populate `room.dimensions`; a dangling `75′ × 37′ ×` → trailing `×` stripped; the shared-fragments/seven-site invariant test (invariant 1, incl. the `167` allow-listed exception).
- **Dims canonical case table (machine-verified against the exact `DIMS_START` / `DIMS_FULL` patterns in invariant 1; the plan's invariant-1 test encodes these verbatim — do NOT hand-edit expectations):**
  - `DIMS_FULL` ADMIT (→ captured value): `50' x 40'`, `50'x40'`, `50′×45′`, `50ft x 40ft`, `50 FT X 40'`, `50 x 40`, `120x80`, `8' x 10'`, `APPROXIMATELY 60' x 45'`→`60' x 45'`, `TOTAL 120 x 80`→`120 x 80`, `2026' x 40'`, `50' x 40' x 30'`.
  - `DIMS_FULL` REJECT (→ no match): `5 x 8`, `3x4`, `2026 x 40`, `1200x50`, `Box40x2`, `Room4x4`, `120x80B`, `SKU 40x20A`, `50 x 1200`, `Box`, `Matrix`, `50' x`. Partial-capture-then-drop: `50 x 40 x 1200`→`50 x 40`.
  - `DIMS_START` REJECT: same bare-invalid set (`5 x 8`, `2026 x 40`, `1200x50`, `Box40x2`, `120x80B`, `SKU 40x20A`, `50 x 1200`); ADMIT `50' x 40'`, `50 x 40`, `120x80`, `2026' x 40'` (unit branch), and the dangling `50' x` (evidence-only; cleanup strips the trailing separator downstream).
  - `headerDayMarker:167` per-line ADMIT: `60 x 45`, `5 x 8`, `60′ × 45′`, `50ft x 40`; REJECT non-dims lines `NOTES`, `DAY 1`.
- **Behavior preservation:** the full existing parser suite + `exporterFixtures.test.ts` stay green with NO fixture edits and no snapshot regen.

## Meta-test inventory
- CREATES: none new is strictly required, but ships two small structural pins (companion-surface invariants 1 & 2 above) as focused tests.
- EXTENDS: `tests/parser/blocks/_helpers.test.ts`, `dates.test.ts`, `rooms.test.ts` / `roomsHeaderHardening.test.ts`, `hotels.test.ts`, `tests/parser/exporterFixtures.test.ts`.
- Advisory-lock topology: N/A (pure parser/exporter, no `pg_advisory*`, no DB writes).

## Out of scope (declared, to preempt reviewer relitigation)
- Venue address widening (venue.ts is label-based; nothing to widen).
- **Hotel inline check-in/out capture (`hotels.ts:635-636`) stays slash-only** — its year-backfill/rollover machinery is structurally slash-coupled; widening it is a larger, riskier change with no corpus evidence (Codex spec R7 finding 1). Behavior-preserving: an ISO/long check-in date is unrecognized today and remains so.
- European day-first date reinterpretation; 2-digit-year dash/long-form; UK postcodes; `50 by 40` / `*` dim separators; bare single-digit dims. Each is an ambiguous or evidence-free form deliberately left rejected.
