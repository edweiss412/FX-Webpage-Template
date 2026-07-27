# Inline later-group own-hotel detection (2026-07-27)

**Status:** Draft → self-review → Codex adversarial review (autonomous ship pipeline).
**Closes:** `BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL` (BACKLOG.md).
**Extends:** `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md` (amends its §3.1 row 7) and `docs/superpowers/specs/parser/2026-07-07-ambiguity-warnings-v1-design.md` (two new ambiguity codes).

---

## 1. Why

`buildInlineReservations` (`lib/parser/blocks/hotels.ts:717`) splits a multi-`Check In` inline cell into per-group reservations, then assigns group 0's `baseName` to every row (`lib/parser/blocks/hotels.ts:766-769`). A later group that carries its OWN hotel is silently clobbered. Probe-verified on branch base `233742abd` (2026-07-27):

```
| Hotel Stays | Hyatt Regency 100 Main St John Smith - 1001 Check In: 3/1 Check Out: 3/2 Marriott Downtown 200 Oak Ave Jane Doe - 1002 Check In: 3/3 Check Out: 3/4 |

row 0: hotel "Hyatt Regency 100"  names ["Main St John Smith"]  3/1–3/2
row 1: hotel "Hyatt Regency 100"  names ["Oak Ave Jane Doe"]    3/3–3/4
```

`Marriott Downtown 200 Oak Ave` vanishes; Jane's crew page shows the wrong hotel with no operator signal beyond the cell-level `HOTEL_GUEST_SPLIT_AMBIGUOUS` on reservation 0. The backlog disposition (ratified 2026-07-26) requires the fix signal to come from the raw FRAGMENT (`splitInlineReservationGroups` output, `lib/parser/blocks/hotels.ts:863`) BEFORE parsed output exists — three output-derived carve-outs were each probe-refuted (parent spec §3.1 row 7 rationale, `lib/parser/blocks/hotels.ts:756-767` comment block).

This spec ships a three-tier fragment-level detector, per the design approved in conversation on 2026-07-27 (option "auto-correct and raise a flag"):

- **Tier 1 (address-anchored auto-correct):** the fragment's pre-guest prefix contains a street-address-shaped phrase → the group is parsed standalone and keeps its own hotel; new warning `HOTEL_INLINE_GROUP_OWN_HOTEL` fires so the operator confirms.
- **Tier 2 (suspicion, inherit):** hotel-like evidence too weak to act on → inheritance unchanged; new warning `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` fires, and its copy states the fix lives in the sheet and what edit makes the parser read it as intended.
- **Tier 3 (silence):** divider + guest only (the `consultants` shape) → inheritance unchanged, no warning. Corpus card counts do not move.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
| - | -------- | ------------ |
| S1 | The detector reads the RAW fragment only — never parser output. The three refuted output-derived carve-outs (group-index guard, leading-divider run, residual-word check) stay refuted; this detector is the fragment-level mechanism the backlog row reserved for a new spec round. | BACKLOG.md `BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL` fix note; `lib/parser/blocks/hotels.ts:756-767` |
| S2 | Both new codes ship WITHOUT a `resolution` payload. Absence discriminates non-recoverable warnings (`lib/parser/types.ts:86-95`); no `UseRawControl` surface, no `types.ts` change, no UI diff. Rationale: use-raw semantics cannot express "revert to the inherited hotel" — the inherited name is not present in the fragment, and a fragment-built replacement would write booking details into crew-readable `hotel_name`, the ratified corruption class (parent spec §6, whole-diff R6 finding 1). In-app name/address correction remains available where coherent via the EXISTING `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`, which a tier-1 row can now fire (§5). This refines the conversation-approved wording "code A resolvable in-app"; the user's binding requirement — copy must say when the fix is outside the app and what edit fixes it — is carried by C-copy rows in §7. |
| S3 | Parent spec §3.1 row 7 is AMENDED, not violated: an INHERITED later group still never emits `HOTEL_GUEST_SPLIT_AMBIGUOUS`; a tier-1 KEPT group is standalone-parsed, its raw fragment genuinely contains its parsed text, and its exit IS evaluated like group 0's. The R3-finding-2 incoherence (parsed payload describing text absent from the fragment) is impossible by construction for kept groups. | Parent spec §3.1 rows 7–8; this spec §5 |
| S4 | Tier-2's word-count arm (threshold **4** base words, §3 D5) is a calibrated warn-only heuristic. False negatives (1-word hotel + 2-word guest) are accepted; false positives cost one spot-check card. It is NOT a parse input — no parsed value depends on it. | This document, §3 |
| S5 | Group-0 extraction quality is out of scope, unchanged from parent spec §11. Row 0 of the motivating cell still mis-parses (`"Hyatt Regency 100"` / `["Main St John Smith"]`); fixing that is a separate feature. | Parent spec §11 |
| S6 | `sheets → app` fix guidance in copy names TWO sheet edits: one booking per Hotel Stays row (complete fix), or street address directly after the hotel name in the same cell (upgrades tier 2 to tier 1). Copy states what to CHECK and what to DO, never how the algorithm decided (parent spec §7.0 copy discipline). | User requirement, 2026-07-27 conversation; parent spec §7.0 |
| S7 | Inheritance for groups AFTER a tier-1 group is **nearest-preceding kept hotel**, not unconditional group 0, and every row inheriting from a tier-1 hotel fires `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` (the compounded judgment is surfaced). Cells with no tier-1 group behave byte-identically to today. | This document, §4 |

---

## 2. Current behavior (probe transcript, 2026-07-27, base `233742abd`)

All probes ran `parseHotels` over a `| Hotel Stays | <cell> |` row (v1 path → `parseHotelStaysRow` `lib/parser/blocks/hotels.ts:697` → `buildInlineReservations`).

| # | Cell (abbreviated) | Today's rows | Note |
| - | ------------------ | ------------ | ---- |
| B1 | Hyatt…John - 1001…Out: 3/2 **Marriott Downtown 200 Oak Ave** Jane Doe - 1002…Out: 3/4 | both rows `"Hyatt Regency 100"`; row 1 names `["Oak Ave Jane Doe"]` | the backlog clobber |
| B2 | segment 2 of B1 fed alone | `"Marriott Downtown"` / addr `"200 Oak Ave Jane Doe"` / names `["Oak Ave Jane Doe"]` | naive keep-standalone leaks the guest name into crew-readable `hotel_address` — why tier 1 re-slices (§3 D6) |
| B3 | rest of B1's segment 2 after the address (`Jane Doe - 1002 Check In: 3/3 Check Out: 3/4`) fed alone | names `["Jane Doe"]`, dates 3/3–3/4 | the rest-build gives clean guests + dates; hotel garbage is overwritten by D6 |
| B4 | two-guest rest (`Doug Larson—2035940 Adam Larson—2035939 Check In…`) | names `["Doug Larson","Adam Larson"]` | multi-guest rest works |
| B5 | consultants shape, 2 groups shared hotel | row 1 names `["Eric Weiss"]`, inherited hotel | tier 3 must keep this silent |
| B6 | B1 variant with `Hotel 71 Chicago, IL 60601` as the later hotel | reaches inheritance, 2 rows, clobbered | ZIP-arm tier-1 case; numeric brand must survive UNSPLIT (§3 D6) |
| B7 | B1 variant with no conf# on the later guest (`… 200 Oak Ave Jane Doe Check In…`) | whole cell falls back to ONE reservation, dates nulled | the all-names guard (`lib/parser/blocks/hotels.ts:735`) fires BEFORE inheritance; the detector never runs on this shape |
| B8 | B1 variant with `---` divider before the later hotel | reaches inheritance, clobbered | leading-divider strip (D2) must precede prefix computation |

Regex ground truth (padded reads, `" " + prefix`):

| Prefix | `STREET_ADDRESS_RE` (`lib/parser/blocks/hotelConfTokens.ts:14`) | `STREET_ADDRESS_ZIP_RE` (`lib/parser/blocks/hotelConfTokens.ts:20`) |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `Marriott Downtown 200 Oak Ave Jane Doe` | match `" 200 Oak Ave"`, end 30 | no |
| `Eric Weiss` | no | no |
| `Marriott Downtown Jane Doe` | no | no |
| `200 Oak Ave Jane Doe` | match at index 0 (padded), end 12 | no |
| `Hotel 71 Chicago, IL 60601 Jane Doe` | no | match `" 71 Chicago, IL 60601"`, end 27 |

---

## 3. The detector (normative)

A pure function over one raw segment, run per later group inside `buildInlineReservations`. It never runs on group 0, never on single-group cells (`checkInCount < 2`, `lib/parser/blocks/hotels.ts:718`), and never on the discarded-fallback path (`lib/parser/blocks/hotels.ts:735-753` returns before it).

**D1 — normalize.** `s` = the segment with `&#10;`/`\r` replaced by spaces, whitespace collapsed, trimmed — the same normalization `buildInlineHotel` applies (`lib/parser/blocks/hotels.ts:896`).

**D2 — divider strip.** `s2` = `s` with any leading run of whitespace and dash characters removed (`/^[\s\-–—]+/`). Later groups in the shared-hotel shape begin with a divider; a hotel name never does.

**D3 — prefix.** Scan `s2` for the first **non-street confirmation delimiter**: `[-–—]{1,3}\s*#?\s*(\d{4,})\b` where `looksLikeStreetStart(" " + s2.slice(numStart))` is false — the same discriminator the no-Check-In branch uses (`lib/parser/blocks/hotels.ts:953-957`). Also locate the first `/check\s+in/i` match. `prefixEnd` = the smallest of: the delimiter's match start, the Check In match start, `s2.length`. `prefix` = `s2.slice(0, prefixEnd)`, trimmed. The delimiter's preceding guest NAME is inside `prefix` — the address anchor is what separates it from hotel text (D4); without an anchor no split of `prefix` is attempted (S1: that boundary is exactly the fact nothing evidences).

**D4 — address anchor.** Evaluate BOTH regexes against `" " + prefix` (position-0 normalization, parent spec §3.1 "P3 position-0"). If either matches, take the match with the smaller index (tie: the longer match — load-bearing: on `200 Oak Ave Chicago, IL 60601 …` both match at index 0 and only the ZIP match spans the comma-less city tail; probe-verified 2026-07-27); `addressEnd` = match index + match length − 1 (unpadding the 1-char pad), an index into `s2`. Both regexes are non-global singletons consumed read-only; the detector never adds flags to them (parent spec R4-finding-5 discipline: never mutate the shared regex).

**D4b — address tail extension (Codex R1 finding 1).** `STREET_ADDRESS_RE` consumes only through the street suffix, so `addressEnd` alone would cut `200 Oak Ave, Chicago, IL 60601` at `Ave` and the discarded tail would silently truncate the persisted address — user-visible data loss. After D4, extend `addressEnd` by repeatedly consuming, anchored at the current end, whichever of these matches first (loop until neither does):

1. Unit tail: `/^\s*,?\s*(?:Suite|Ste\.?|Unit|Apt\.?|Rm|Room|Fl|Floor)\s*#?\s*[\w-]+/iu` — unit markers are unambiguous; no guest name starts `Suite 400`.
2. City/state/postal tail, COMMA-LED and POSTAL-ANCHORED: `/^\s*,\s*(?:[\p{L}][\p{L} .'-]*?,\s*)?[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u` — the mandatory `<ST> <ZIP-or-postal>` anchor (mirroring `STREET_ADDRESS_ZIP_RE`'s tail, `lib/parser/blocks/hotelConfTokens.ts:20`) is what stops it from ever eating a guest name after a stray comma.
3. Comma-LESS city/state/postal tail (Codex R2 finding 1): `/^\s+(?:[\p{L}][\p{L}.'-]*\s+){0,3}[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u` — up to 3 comma-free city words then the same mandatory postal anchor. Covers `… Ave Chicago IL 60601` and Canadian `… Ave Toronto ON M5V 2T6`, which neither `STREET_ADDRESS_ZIP_RE` nor arm 2 can span (both require a comma). The word cap mirrors `STREET_ADDRESS_RE`'s bounded interior; a longer run is left for the residual-tail guard below.

Probe-verified (2026-07-27, all through the real `splitHotelNameAddress`): `… 200 Oak Ave, Chicago, IL 60601 Jane Doe` → hotelText spans the full address, split `{Marriott Downtown, 200 Oak Ave, Chicago, IL 60601}`; `… 200 Oak Ave Chicago IL 60601 Jane Doe` and `… 200 Oak Ave Toronto ON M5V 2T6 Jane Doe` extend via arm 3; `… 200 Oak Ave Suite 400 Jane Doe` and `… Suite 400, Chicago, IL 60601 Jane Doe` extend correctly; `… 200 Oak Ave, IL 60601 Jane Doe` (no city) extends via arm 2's optional-city alternative.

**Accepted arm-3 judgment (probe-verified):** on the contrived shape `… 200 Oak Ave John Smith IL 60601 Jane Doe - 1002 …` the postal anchor claims `John Smith` as city words, so the persisted address becomes `200 Oak Ave John Smith IL 60601`. A guest name sandwiched between a street and its postal tail is not a shape any fixture or probe has produced; the row still carries `HOTEL_INLINE_GROUP_OWN_HOTEL`, so the operator is pointed at exactly this text. Accepted, not a defect: the alternative (no arm 3) silently truncates EVERY comma-less postal address, which is the R2 HIGH.

**D5 — tier decision.**

| Tier | Condition | Action |
| ---- | --------- | ------ |
| 1 | D4 matched AND the residual-tail guard passes AND the D6 rebuild succeeds | keep own hotel (D6); stash `HOTEL_INLINE_GROUP_OWN_HOTEL` |
| 2 | (D4 matched but the residual-tail guard or D6 aborted) OR (D4 did not match AND `baseWords(prefix) >= 4`) | inherit as today; stash `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` |
| 3 | otherwise | inherit as today, no stash |

`baseWords` = whitespace word count minus a trailing single-letter initial — the same rule as `lib/parser/blocks/hotels.ts:945-948`; the detector reuses that logic (extracted or duplicated verbatim, plan's choice). Threshold **4** = shortest hotel (1 word) + typical guest (2 words) + margin; 3-word prefixes are silent because 3-word guest names (`Mary Ann Smith`) are common (S4).

**Residual-tail guard (Codex R1 finding 1; widened R2).** After D4b, examine `remainder = prefix.slice(addressEnd)`. Downgrade to tier 2 when EITHER: (a) `remainder` begins, after optional whitespace, with a comma — e.g. `200 Oak Ave, Chicago Jane Doe`, a ZIP-less city tail no arm may consume; or (b) `remainder` still contains postal evidence `/\b[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u` — an unconsumed postal tail (e.g. a >3-word comma-less city run that arm 3's cap refused). Keeping tier 1 in either case would persist a truncated address. Probe-verified: `… Ave, Chicago Jane Doe` downgrades via (a); `… Ave One Two Three Four IL 60601 Jane Doe` downgrades via (b), address never truncated.

**D6 — tier-1 rebuild.** `hotelText` = `s2.slice(0, addressEnd)`, trimmed (`addressEnd` is the D4b-extended end). `rest` = `s2.slice(addressEnd)`, trimmed. `rebuild` = `buildInlineHotel(rest, ordinal, contextYear)` — the existing machinery extracts guests and dates from the hotel-free remainder (probe B3/B4). The rebuild **succeeds** iff `rebuild.row.names.length > 0` AND `splitHotelNameAddress(hotelText).name` is non-null (`lib/parser/blocks/hotels.ts:368`). On success the group's row becomes `rebuild.row` with `hotel_name = hotelText` and `hotel_address = null`; the EXISTING per-row `stripHotelNameConf` pass (`lib/parser/blocks/hotels.ts:831`) then conf-strips and splits `hotelText` into name/address exactly as it does for every other row, and its address-ambiguity stash is KEPT for this row (first-stash-wins, per-row sink — `lib/parser/blocks/hotels.ts:845` pattern). On failure, tier 2.

Consequences, all probe-derived:

- B1 row 1 becomes `hotel "Marriott Downtown"`, `addr "200 Oak Ave"`, `names ["Jane Doe"]`, dates 3/3–3/4 (split of `"Marriott Downtown 200 Oak Ave"` is suffix-anchored, `lib/parser/blocks/hotels.ts:368` + probe row 1 of the regex table).
- B6's later group keeps `hotel_name "Hotel 71 Chicago, IL 60601"`, `hotel_address null` — `splitHotelNameAddress` stays suffix-only (parent spec R1), the ZIP arm only BOUNDS hotel text vs guest text, it never splits name from address. The numeric-brand corruption class is untouched.
- The guest-name-in-address leak of B2 is impossible: `hotelText` ends at the address match end, so guest words never enter the split input.

**D7 — verdict and stashes for kept rows.** A tier-1 row's `judgedGuestBoundary` is `rebuild.judgedGuestBoundary`, and it participates in guest-warning emission exactly as group 0 does (the `verdicts` map at `lib/parser/blocks/hotels.ts:766` becomes `i === 0 ? builds[0].judgedGuestBoundary : kept[i]?.judgedGuestBoundary ?? false` in shape). Its `rawCells[i]` entry stays the FULL segment `s` — the sheet-visible fragment, which contains every byte the kept parse read (S3 coherence). Inherited rows (tiers 2/3) keep today's behavior: verdict `false`, address stashes dropped (`lib/parser/blocks/hotels.ts:780-786`).

---

**Guard conditions.**

| Input state | Behavior |
| ----------- | -------- |
| Segment empty (or whitespace/dashes only) after D2 | `prefix` is empty; D4 cannot match; `baseWords("") = 0` → tier 3, byte parity with today |
| `contextYear` null | unchanged — dates flow through the existing `buildInlineHotel` date machinery, which already handles it |
| Group 0's `baseName` null | unchanged — the detector never reads `baseName`; tiers 2/3 inherit whatever today's loop assigns (null included), and tier 1 does not inherit |
| `splitHotelNameAddress(hotelText).name` null (all-address prefix) | tier 2 (D6 success guard) |
| `rebuild.row.names` empty | tier 2 (D6 success guard) |
| Segment with a delimiter but no Check In/Check Out (tail segment) | detector runs identically; the rebuild's dates are whatever `buildInlineHotel` reads from the rest (possibly null) — no special case |

## 4. Inheritance after a tier-1 group (normative)

`baseName` remains group 0's sanitized hotel (`lib/parser/blocks/hotels.ts:768`). Rows are processed in order; a tier-2/3 row inherits from the NEAREST PRECEDING row that carries its own hotel — group 0, or the closest earlier tier-1 group (S7). Every row whose inherited source is a tier-1 group ALSO stashes `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` (even when tier 3 would otherwise stay silent): whether that guest belongs to the detected hotel or the first hotel is exactly the judgment the operator must check.

A cell with no tier-1 group reproduces today's rows byte-for-byte, warnings aside.

Worked example (probe cell B1 + a third bare-guest group `Bob Roe - 1003 Check In: 3/5 Check Out: 3/6`):

| Row | Hotel | Names | Warnings stashed |
| --- | ----- | ----- | ---------------- |
| 0 | `Hyatt Regency 100` (unchanged mis-parse, S5) | `["Main St John Smith"]` | `HOTEL_GUEST_SPLIT_AMBIGUOUS` (today's) |
| 1 | `Marriott Downtown` / `200 Oak Ave` | `["Jane Doe"]` | `HOTEL_INLINE_GROUP_OWN_HOTEL` + `HOTEL_GUEST_SPLIT_AMBIGUOUS` (D7; the rebuild's Pattern-1 exit judges the boundary) |
| 2 | `Marriott Downtown` / `200 Oak Ave` (nearest preceding) | `["Bob Roe"]` | `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` |

---

## 5. Amendment to parent spec §3.1 row 7

Row 7 of `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md:96` splits:

| Row | Case | Emits `HOTEL_GUEST_SPLIT_AMBIGUOUS`? |
| --- | ---- | ------------------------------------ |
| 7a | later group, INHERITED hotel (tiers 2/3) | **no** — unchanged; no boundary judged |
| 7b | later group, tier-1 KEPT (this spec) | per its rebuild's exit, exactly like group 0 |

The parent file gains a one-line pointer under row 7 (`Amended by docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md §5: a tier-1 kept later group is standalone-parsed and its exit IS evaluated; inherited later groups remain never-emit.`) in the same commit that changes the behavior. The code comment block at `lib/parser/blocks/hotels.ts:756-767` (which cites the backlog row as open) is rewritten to describe the shipped detector and cite this spec.

`consultants` (`fixtures/shows/exporter-xlsx/consultants.md:51`) is tier 3 — prefix `Eric Weiss`, no address, 2 base words — so parent spec §9.2's load-bearing "2 reservations, exactly 1 card" assertion is unchanged, and the corpus totals (9 guest cards, 0 address cards) do not move (§9 below).

---

## 6. New codes and plumbing

### 6.1 Codes

| Code | Fires | Severity | `resolution` |
| ---- | ----- | -------- | ------------ |
| `HOTEL_INLINE_GROUP_OWN_HOTEL` | tier-1 kept row, once per row | `warn` | **absent** (S2) |
| `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` | tier-2 row, or any row inheriting from a tier-1 group (§4), once per row | `warn` | **absent** (S2) |

Both join `AMBIGUITY_CODES` (`lib/parser/ambiguityCodes.ts:19-25`) — each reports a judgment call made while still producing a value. Neither joins `USE_RAW_CODES` (`lib/sync/useRawOverlay.ts:24`) nor `IN_SCOPE` (`components/admin/UseRawControl.tsx:55`); with `resolution` absent they are non-recoverable by the documented discriminator (`lib/parser/types.ts:86-95`). No file under `app/` or `components/` changes.

### 6.2 Stash → emit plumbing

`HotelAmbiguity` (`lib/parser/blocks/hotels.ts:109`) gains two members:

```ts
| { kind: "own-hotel"; rawCell: string }
| { kind: "hotel-suspected"; rawCell: string }
```

`toPending` (`lib/parser/blocks/hotels.ts:793`) appends them from the detector outcome; `commitHotels` maps each to a new emitter in `lib/parser/warnings.ts` (siblings of `emitHotelGuestSplitAmbiguity`, `lib/parser/warnings.ts:212`). Envelope, both codes: `severity: "warn"`, `blockRef: { kind: "hotels", index, field: "name", name: <resolved hotel_name when non-null, else key omitted — exactOptionalPropertyTypes> }`, `rawSnippet: <the row's segment>`, `message` per §7, no `resolution`, no `roleToken`. `blockRef.index` is the final-array index (parent spec §5.3 contract). Per-row stash order: guest ambiguity first, then own-hotel/suspected, then address — pinned by test.

`TRANSFORM_SITES` (`lib/parser/blocks/hotels.ts:1182`) gains two `{ site, code }` rows (`"inline later-group own-hotel detector"` × both codes); the walker's required-code list for `hotels.ts` (`tests/parser/_metaTransformSitesWalker.test.ts:42-49` region) gains both codes. The BACKLOG row is deleted in the same commit; the walker's `deferred:` cross-check does not apply (these are `code:` rows, not exempts) but the backlog-graduation guard does.

### 6.3 Registration fan-out (per code × surface; every cell an action or N/A)

| # | Surface | Action |
| - | ------- | ------ |
| a | master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2905` region) | 2 new rows (three-lockstep rule: a+b+c in ONE commit) |
| b | `lib/messages/__generated__/spec-codes.ts` | `pnpm gen:spec-codes`; never hand-edit |
| c | `lib/messages/catalog.ts` | 2 new entries mirroring the 9-key sibling (`lib/messages/catalog.ts:1382-1395`) |
| d | master spec longExplanation block (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3199` region) | 2 new lines |
| e | `lib/parser/ambiguityCodes.ts:19` | add both, comment cites this spec |
| f | `tests/parser/ambiguityCodes.test.ts:17` | extend sorted list |
| g | `lib/parser/dataGaps.ts` `GAP_CLASSES` (sibling rows `lib/parser/dataGaps.ts:74-79`) | 2 new rows, labels C-OWN-9 / C-SUS-9 (§7) |
| h | `tests/messages/warningCardCopyRegistry.ts:16` code list + `tests/messages/warningCardCopyRegistry.ts:66` triggerContext map | 2 rows each |
| i | `app/help/errors/_families.ts` `HOTEL` prefix family | verify coverage; extend comment only (no `app/` behavior change — comment edit is exempt from the UI gate per invariant-8's surface definition of behavioral UI files; if reviewers disagree, run the gate) |
| j | `lib/parser/warnings.ts` | 2 new emitters + exported code constants (siblings `lib/parser/warnings.ts:211`, `lib/parser/warnings.ts:360`) |
| k | `lib/parser/blocks/hotels.ts:1182` `TRANSFORM_SITES` | 2 rows (§6.2) |
| l | `tests/parser/_metaTransformSitesWalker.test.ts:42-49` | required list += 2 |
| m | the repo-root backlog ledger | delete the closed `BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL` entry (lines 1000-1004 at branch base) |
| n | `tests/parser/dataGaps.test.ts:45` + test name + `tests/parser/dataGaps.test.ts:75` enumeration | `DATA_GAP_CODES.size` 34 → **36**; add both codes |
| o | `tests/parser/dataGapsClassCompleteness.test.ts:205`, `tests/parser/dataGapsClassCompleteness.test.ts:209`, doc comment `tests/parser/dataGapsClassCompleteness.test.ts:36`, `tests/parser/dataGapsClassCompleteness.test.ts:68`, test name `tests/parser/dataGapsClassCompleteness.test.ts:204` | 34 → **36**; `ALL_PERSISTED_WARNING_CODES.size` 54 → **56** |
| p | `lib/messages/__generated__/internal-code-enums.ts` | `pnpm gen:internal-code-enums` (NOT gen:spec-codes; parent spec row dd) |
| q | `tests/messages/_metaWarningCardCopy.test.ts`, `_metaCatalogCopyHygiene`, `_metaErrorCatalogDocs`, `_metaPopoverContextCoverage` | fail-by-default walkers; satisfied by rows c/h copy |
| r | `lib/admin/step3Buckets.ts:129` `FIELD_LABELS` | **N/A** — both codes use `field: "name"`, whose label already exists |
| s | `lib/sync/useRawOverlay.ts`, `components/admin/UseRawControl.tsx`, `lib/parser/types.ts` | **N/A — deliberately untouched** (S2) |
| t | `tests/messages/warningCardCopyRegistry.ts:124` `EXPECTED_CORPUS_WARN_CODES` | **N/A** — neither code fires on either fixture family (§9) |
| u | parent spec §3.1 row 7 | one-line amendment pointer (§5) |

---

## 7. Normative copy (byte-for-byte; straight apostrophes; no em-dashes)

Copy discipline (parent spec §7.0): each string states what the operator should CHECK and what sheet edit FIXES it; no string asserts how the algorithm decided. Every row is asserted verbatim against a string literal in tests (§8.4).

| # | Surface | Exact text |
| - | ------- | ---------- |
| C-OWN-1 | `ParseWarning.message` | `Hotel line "<raw, collapsed>" lists more than one hotel, so this reservation was given its own hotel rather than the line's first hotel; double-check its hotel, guests, and dates. To skip the guesswork, give each hotel booking its own row in the sheet.` |
| C-OWN-2 | catalog `title` | `A hotel line may book more than one hotel` |
| C-OWN-3 | catalog `dougFacing` | `A hotel line in _<sheet-name>_ seems to book more than one hotel; check each reservation's hotel against your sheet. Giving each booking its own row keeps them from running together.` |
| C-OWN-4 | catalog `triggerContext` | `Appears when one hotel line seems to book more than one hotel.` |
| C-OWN-5 | catalog `helpfulContext` | `One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of sharing the line's first one. Check this reservation's hotel name, address, guests, and dates against your sheet. To avoid this warning, give each hotel booking its own row in the sheet.` |
| C-OWN-6 | master-spec + catalog `longExplanation` | `One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of sharing the line's first one. Spot-check this reservation's hotel name, address, guests, and dates. This cannot be fixed in the app: if the hotel is wrong, edit the sheet so each hotel booking has its own row, and the next sync will pick it up.` |
| C-OWN-7 | catalog `crewFacing` | `null` |
| C-OWN-8 | catalog `followUp` | `Doug → spot-check hotel reservations` |
| C-OWN-9 | `GAP_CLASSES` label | `a hotel line may book more than one hotel` |
| C-OWN-10 | catalog `helpHref` | `/help/errors#HOTEL_INLINE_GROUP_OWN_HOTEL` |
| C-SUS-1 | `ParseWarning.message` | `Hotel line "<raw, collapsed>" may name another hotel for this reservation that we could not read, so it may show the wrong hotel; double-check it. To fix it, edit the sheet so each hotel booking has its own row, or put the hotel's street address right after its name.` |
| C-SUS-2 | catalog `title` | `A reservation may show the wrong hotel` |
| C-SUS-3 | catalog `dougFacing` | `A hotel line in _<sheet-name>_ may book a hotel we could not read, so a reservation may show the wrong hotel; check it against your sheet. Giving each booking its own row fixes this.` |
| C-SUS-4 | catalog `triggerContext` | `Appears when part of a hotel line may name a hotel we could not read.` |
| C-SUS-5 | catalog `helpfulContext` | `Part of a hotel line may name a hotel we could not read, so this reservation may show the wrong hotel. Check it against your sheet. This cannot be fixed in the app: edit the sheet so each hotel booking has its own row, or put the hotel's street address right after its name, and the next sync will pick it up.` |
| C-SUS-6 | master-spec + catalog `longExplanation` | `Part of a hotel line may name a hotel we could not read, so this reservation may be showing the wrong hotel. Spot-check it against your sheet. This cannot be fixed in the app: edit the sheet so each hotel booking has its own row, or put the hotel's street address right after its name, and the next sync will pick it up.` |
| C-SUS-7 | catalog `crewFacing` | `null` |
| C-SUS-8 | catalog `followUp` | `Doug → fix the sheet: one hotel booking per row` |
| C-SUS-9 | `GAP_CLASSES` label | `a reservation may show the wrong hotel` |
| C-SUS-10 | catalog `helpHref` | `/help/errors#HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` |

The user's requirement (2026-07-27) that non-app-resolvable warnings say so and name the fixing edit is carried by C-OWN-6, C-SUS-1, C-SUS-5, C-SUS-6.

---

## 8. Test plan (TDD per task)

### 8.1 Behavior

| Test | Input | Asserts |
| ---- | ----- | ------- |
| Backlog clobber fixed | probe B1 cell | row 1 `hotel_name === "Marriott Downtown"`, `hotel_address === "200 Oak Ave"`, `names` deep-equals `["Jane Doe"]`, `check_in 2026-03-03`, `check_out 2026-03-04`. Expected values derive from the cell literal, not copied from parser output |
| Row 0 untouched | probe B1 cell | row 0 deep-equals its pre-change parse (captured as a literal from the §2 probe): the detector must not perturb group 0 (S5) |
| Full envelope, code OWN | probe B1 cell | exactly one `HOTEL_INLINE_GROUP_OWN_HOTEL`: `severity "warn"`, `blockRef {kind:"hotels", index:1, field:"name", name:"Marriott Downtown"}`, `rawSnippet` === segment 2 exactly, `resolution` key ABSENT, `message` === C-OWN-1 with the collapsed raw substituted |
| 7b guest warning on kept row | probe B1 cell | `HOTEL_GUEST_SPLIT_AMBIGUOUS` count === 2, indices {0, 1} (row 7b: the rebuild's Pattern-1 exit judged Jane's boundary) |
| Tier 2, word arm | B1 variant, later hotel `Marriott Downtown` (no address) | row 1 hotel INHERITED (byte-equal to today's `"Hyatt Regency 100"`), one `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` at index 1, envelope + C-SUS-1 message, `resolution` absent |
| Tier 2, abort arm | later segment `200 Oak Ave Jane Doe - 1002 Check In: 3/3 Check Out: 3/4` | D4 matches at position 0, `splitHotelNameAddress("200 Oak Ave").name` is null → tier 2, NOT tier 1: inherited hotel + SUSPECTED code. Kills an implementation that skips the D6 success guard |
| Address tail, comma city+state+ZIP | B1 variant, later hotel `Marriott Downtown 200 Oak Ave, Chicago, IL 60601` | tier 1; `hotel_address === "200 Oak Ave, Chicago, IL 60601"` — the FULL tail persists (kills the R1 truncation: a suffix-end implementation persists `"200 Oak Ave"`) |
| Address tail, comma-less city (comma before state) | B1 variant, later hotel `Marriott Downtown 200 Oak Ave Chicago, IL 60601` | tier 1 via the longer-match tie-break (D4); full address persists. Kills an implementation whose tie-break prefers the suffix match |
| Address tail, fully comma-less US (R2) | B1 variant, later hotel `Marriott Downtown 200 Oak Ave Chicago IL 60601` | tier 1 via arm 3; `hotel_address === "200 Oak Ave Chicago IL 60601"` — kills the R2 truncation (suffix-only and comma-led arms both miss it) |
| Address tail, fully comma-less Canadian (R2) | B1 variant, later hotel `Marriott Downtown 200 Oak Ave Toronto ON M5V 2T6` | tier 1 via arm 3's postal alternation; full address persists |
| Unconsumed postal evidence downgrades (R2) | B1 variant, later hotel `Marriott Downtown 200 Oak Ave One Two Three Four IL 60601` | tier 2 via residual-tail guard (b): arm 3's 3-word cap refuses the run, evidence regex sees `IL 60601`, inherited hotel + SUSPECTED code, NO truncated address persisted |
| Unit tail | B1 variant, later hotel `Marriott Downtown 200 Oak Ave Suite 400` | tier 1; `hotel_address === "200 Oak Ave Suite 400"` |
| ZIP-less city tail downgrades | B1 variant, later segment `Marriott Downtown 200 Oak Ave, Chicago Jane Doe - 1002 Check In: 3/3 Check Out: 3/4` | tier 2 (residual-tail guard): inherited hotel, `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED`, and NO truncated `"200 Oak Ave"` address anywhere on the row |
| Tier 3 silence | probe B5 consultants shape | ZERO new-code warnings; guest-card count unchanged at 1; rows byte-equal to today's |
| ZIP arm, numeric brand unsplit | probe B6 cell | row 1 `hotel_name === "Hotel 71 Chicago, IL 60601"`, `hotel_address === null`, names `["Jane Doe"]`, OWN code fires. Kills an implementation that uses the ZIP match to SPLIT name/address (parent R1) |
| Divider strip | probe B8 cell | tier 1 fires despite the `---` run before `Marriott` |
| Nearest-preceding inheritance | §4 worked example (3 groups) | row 2 hotel `"Marriott Downtown"` / `"200 Oak Ave"`, names `["Bob Roe"]`; warnings: OWN@1, SUSPECTED@2, and NO suspected on row 0 |
| No tier-1 group → byte parity | probe B5 cell AND a 2-group no-address cell below the word threshold | rows deep-equal today's output captured as literals; only warning deltas allowed are NONE |
| Position-0 address in group 0 | cell whose FIRST group starts with an address | detector does not run on group 0; today's behavior byte-preserved |
| Single-group cell | any `checkInCount < 2` cell | detector unreachable; byte parity |
| Fallback path | probe B7 cell | still ONE reservation with nulled dates, no new codes (detector runs only after the all-names guard) |
| Stash order | a tier-1 row that also carries guest + address stashes (`Hyatt … Check Out: 3/2 Marriott Downtown 200 Oak Ave Extra Rd Jane Doe - 1002 Check In: 3/3 Check Out: 3/4`-class input; exact input chosen at plan time by probe) | per-row emit order: guest, own-hotel, address |
| Emission order vs cardinality | > `MAX_HOTELS` (4, `lib/parser/blocks/hotels.ts:55`) inline groups with a tier-1 in a surviving slot | all surviving-row ambiguities before `HOTEL_CARDINALITY_EXCEEDED`; truncated rows emit nothing (parent R4) |

### 8.2 Anti-tautology notes

Every expected value above is a string/array literal in the test derived from the input cell, never read back from the parser. The byte-parity tests capture today's output as literals in the test file (with a comment citing the §2 probe), so a behavior drift in ANY tier fails loudly. The tier-2 abort test and the tier-3 test are the discriminating pair: an implementation that fires tier 1 whenever D4 matches passes every other test and fails the abort test; one that warns on every later group passes the abort test and fails consultants.

### 8.3 Structural / meta

- `TRANSFORM_SITES` walker: both codes required for `hotels.ts` (fan-out l).
- Count gates: fan-out n/o (34→36, 54→56, names and comments).
- `AMBIGUITY_CODES` sorted-list test (fan-out f).
- Copy walkers ride along (fan-out q).
- Corpus goldens: both fixture families re-asserted — **zero** instances of either new code; guest cards stay 9; consultants stays exactly 1 (parent spec §9 tables unchanged).

### 8.4 Copy oracles

Each §7 row asserted byte-for-byte against a string literal in the test (never imported from the catalog — parent spec §8.5 rule). Message rows (C-OWN-1, C-SUS-1) asserted on emitted warnings with the substituted raw; catalog rows asserted on `MESSAGE_CATALOG` entries; GAP labels on `GAP_CLASSES`.

### 8.5 Gates

`pnpm test` (full), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:lint`. Real CI green is a separate close-out gate.

---

## 9. Corpus expectations

Both fixture families re-probed at plan time before implementation. Expected: **no fixture cell reaches tier 1 or tier 2** — the only multi-group corpus cell is `consultants` (parent spec §9.2), whose later group is tier 3 (§5). Therefore: guest cards 9, address cards 0, new-code cards **0**, exactly as the parent spec's §9 tables pin. If the plan-time re-probe contradicts this, the spec is wrong and comes back for amendment before any task runs (numeric single-source: §10).

---

## 10. Numeric single-source

- New codes = **2**; new emitters = **2**; new `HotelAmbiguity` kinds = **2**; new `TRANSFORM_SITES` rows = **2**
- Tiers = **3**; tier-2 word threshold = **4** base words
- `DATA_GAP_CODES` 34 → **36**; `ALL_PERSISTED_WARNING_CODES` 54 → **56**
- Normative copy strings = **20** (§7, 10 per code)
- Fan-out surfaces = **21** rows (§6.3 a–u; 3 are explicit N/A)
- Corpus deltas = **0** (§9)
- Files under `app/`+`components/` changed = **0** (S2; fan-out i is comment-only)
- `resolution` payloads added = **0**; `types.ts` changes = **0**

## 11. Out of scope

- Group-0 inline extraction quality (S5; parent spec §11).
- Any use-raw / `UseRawControl` surface for the new codes (S2).
- The no-conf later-group shape that falls back pre-detection (probe B7) — unreachable by design; its cells keep today's single-reservation fallback.
- Hotels listed AFTER their guests within a segment (`Jane Doe - 1002 Marriott 200 Oak Ave …`): prefix ends at the delimiter, no anchor precedes it; tier 3 by construction. Accepted miss; the sheet-edit guidance in C-SUS copy is the remedy channel.
- Sequential-inheritance semantics for cells with NO tier-1 group (unchanged group-0 inheritance).

## 12. Dimensional Invariants

**None.** No UI file changes (S2; §10 "files under `app/`+`components/` changed = 0"). No fixed-dimension parent is added and no existing one gains a flex/grid child.

## 13. Transition Inventory

**No new states, no new edges.** The feature adds two informational warning codes rendered by the existing card machinery; no component gains a visual state.
