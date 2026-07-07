# Spec: Known-section-header source walker (BL-KNOWN-SECTIONS-WALKER)

**Date:** 2026-07-06
**Type:** Parser refactor + structural meta-test (defense-in-depth)
**Origin:** audit rec-6 item (c); `BACKLOG.md` BL-KNOWN-SECTIONS-WALKER (audit line 72).

## 1. Problem

`lib/parser/knownSections.ts` holds `KNOWN_SECTION_HEADERS` — the registry the class-B unknown-section scan (`lib/parser/index.ts:686-704`) consults so a **parsed** section header is not false-flagged `UNKNOWN_SECTION_HEADER`. The scan fires only when col0 is an all-caps token NOT in the registry (and not a sub-label) AND ≥2 field-header-word columns follow (`index.ts:698-700`).

The companion `tests/parser/_metaKnownSectionsRegistry.test.ts` is a HAND-MAINTAINED pin: it asserts a hardcoded `REQUIRED_HEADERS` list ⊆ `KNOWN_SECTION_HEADERS`. It does NOT read the block parsers, so a **new block parser whose section-opener header is registered in NEITHER list passes CI green**, and its own rows would false-positive `UNKNOWN_SECTION_HEADER`. The block parsers each recognize their section opener via heterogeneous private literals/regexes with **no shared introspectable constant** (survey below), so there is no way to walk them today.

## 2. Goal

Route every block parser's **section-opener** recognition through a per-parser **exported, introspectable token constant**, derive each parser's matcher from that constant (behavior-preserving), then add a **source-walker meta-test** that:

1. enumerates every `lib/parser/blocks/*.ts` file (filesystem walk — a NEW file fails-by-default);
2. for each, imports its exported `SECTION_HEADER_TOKENS` (or confirms membership in an explicit, justified `NO_SECTION_OPENER` allowlist);
3. asserts the **union** of all parsers' `SECTION_HEADER_TOKENS` is a subset of `KNOWN_SECTION_HEADERS` (every parser-recognized section opener is registered);
4. asserts a proof case: a token present in a parser const but absent from the registry FAILS.

This closes the drift class structurally: adding a block parser forces either an exported `SECTION_HEADER_TOKENS` (whose tokens must be registered) or an explicit allowlist entry with rationale — the walker fails otherwise.

## 3. Definitions

- **Section opener** = a col0 token on which a parser OPENS a multi-row section block (a record table or a keyed block that the unknown-section scan could see). This is the ONLY category the registry governs.
- **NOT a section opener** (out of registry, out of `SECTION_HEADER_TOKENS`):
  - **Single-cell / scalar-value labels** — a label whose parser reads only the SINGLE adjacent value cell (`cells[1]`) as a scalar, scanning all rows, and never opens a multi-row block:
    - `ops.ts` `COI`/`PROPOSAL`/`PO`/`INVOICE`/`INVOICE NOTES` (2-cell scalar rows). Declared in an exported `METADATA_FIELD_TOKENS` const (introspectable, explicitly NOT required in the registry — the walker asserts DISJOINTness from `SECTION_HEADER_TOKENS`).
    - `contacts.ts` `IN HOUSE AV`, `VENUE/HOTEL/HOTAL CONTACT INFO/INFORMATION/DETAIL(S)`, `ONSITE AV CONTACT` — **R1 finding 1:** `contacts.ts:88-136` row-scans and treats `cells[1]` as a scalar contact value (gated by `hasContactSignal`); it does NOT open a section. Therefore these are NOT section openers and MUST NOT be added to `KNOWN_SECTION_HEADERS`: registering e.g. `VENUE CONTACT INFO` exact would MASK a genuinely-dropped section of that exact name whose row DID carry a ≥2-field-header-word band (`| VENUE CONTACT INFO | Contact Name | Phone # | Email Address |` — the shape pinned by `tests/parser/unknownSection.test.ts`). `contacts.ts` is therefore in the `NO_SECTION_OPENER` allowlist (reason: scalar contact-label detection, `cells[1]`-only). NOTE: `IN HOUSE AV` is ALREADY in `KNOWN_SECTION_HEADERS` (grandfathered, harmless, exact-match) and is LEFT AS-IS; it is simply not a walker-covered section opener.
  - **Block terminators** — `crew.ts` `TERMINATING_LABELS`, `venue.ts` `VENUE_BLOCK_TERMINATORS`, `transport.ts` lowercase terminators (`hotel stays`/`coi`/…): tokens a parser stops AT, not opens on. The walker does NOT require these ⊆ registry.
  - **Room-name exclusion / classification prefixes** — `rooms.ts` local `SECTION_PREFIX_FAMILIES` (`ADDITIONAL`, `LUNCH`, `DETAILS`, …, `rooms.ts:70-76`) are BROAD prefixes used to REJECT compound room names / route to dedicated paths — **R1 finding 3:** they are NOT the same as the registry's narrow prefix families (`ADDITIONAL ROOM`, `LUNCH ROOM`, `LUNCH SESSION`, `knownSections.ts:79-86`). rooms' EXPORTED `SECTION_HEADER_TOKENS` is the narrow registry-aligned room-banner families ONLY (§4); the broad internal exclusion prefixes stay PRIVATE and are neither exported nor registered.
  - **Title/sentinel tokens** — `index.ts` `NO_HEADER`, `CLIENT`-prefix title exclusion: not sections.
  - **Column sub-labels / grid headers** — governed by `KNOWN_SUB_LABELS`, unchanged.

## 4. Current detection survey (verified — see §11 citations)

Per-parser section-opener detection, current mechanism → target:

| Parser | Section-opener token(s) | Current matcher | Target |
|---|---|---|---|
| `crew.ts` | `CREW`, `TECH` | anchored regex `/^\|\s*CREW\s*\|/m`, `/^\|\s*TECH\s*\|/m` (`crew.ts:29-30`) | export `SECTION_HEADER_TOKENS=["CREW","TECH"]`; build the two regexes from the tokens via a shared `col0HeaderRe(token)` helper |
| `hotels.ts` | `HOTEL`, `HOTEL RESERVATION(S)`, `HOTEL STAY(S)` | literal-eq + `/^HOTEL\s+RESERVATIONS?$/`, `/^HOTEL\s+STAYS?$/` (`hotels.ts:67-68`) | export tokens (normalized, singular+plural both listed); matchers compare `normalizeHeader(col0)` ∈ token set / retain regex with a co-located test asserting regex⇔tokens |
| `transport.ts` | `TRANSPORTATION`, `DRIVER` | multi-column regexes (`transport.ts:172,336,446`) | export `SECTION_HEADER_TOKENS=["TRANSPORTATION","DRIVER"]`; the multi-column shape stays as an ADDITIONAL gate; col0 token identity derives from the const. Adds `DRIVER` to the registry. |
| `event.ts` | `EVENT DETAILS`, `DETAILS`, `DETAILS/ROOM DIAGRAM`, `GS DETAILS`, `GS DETAILS (FOR BOTH)` | `EVENT_DETAILS_HEADER_RE` (`event.ts:40`) | export the 5 canonical tokens; build the alternation regex from them. Adds the two variant tokens to the registry. |
| `dates.ts` | `DATES` | `.toUpperCase()==="DATES"` (`dates.ts:84`) | export `["DATES"]`; literal check compares to the const |
| `venue.ts` | `VENUE` (+ `VENUES` registry alias) | `col0Upper==="VENUE"` (`venue.ts:168`) | export `["VENUE","VENUES"]`; check ∈ const |
| `contacts.ts` | (scalar contact labels — NOT section openers, R1 finding 1) | 3 whole-cell regexes (`contacts.ts:31,34,40`) scanning `cells[1]` scalar | `NO_SECTION_OPENER` allowlist (reason: scalar contact-label detection, not a multi-row section opener). NO registry additions. |
| `client.ts` | `CLIENT` | `label==="CLIENT"` (`client.ts:93,276`) | export `["CLIENT"]`; check ∈ const |
| `dress.ts` | `DRESS` | `normalizeHeader(...)==="DRESS"` (`dress.ts:24`) | export `["DRESS"]`; check ∈ const |
| `rooms.ts` | `GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL ROOM`, `LUNCH ROOM`, `LUNCH SESSION` (narrow registry-aligned room banners ONLY — R1 finding 3) | prefix regexes + `SECTION_EXACT_TOKENS`/`SECTION_PREFIX_FAMILIES` (`rooms.ts:81,621,639,657,445`) | export `SECTION_HEADER_TOKENS` = the narrow families that are ALREADY in `PREFIX_SECTION_FAMILIES`; the broad internal exclusion prefixes (`ADDITIONAL`/`LUNCH`/`DETAILS`, `rooms.ts:70-76`) stay PRIVATE, unexported. rooms already imports the registry — keep. Novel room-name admission is shape-based (`isRoomHeader`), orthogonal to the fixed banner tokens the walker governs. |
| `gear.ts` | `GENERAL SESSION`, `BREAKOUT`, `LUNCH`, `ADDITIONAL ROOM` (room classification, not a NEW section) | prefix regexes (`gear.ts:89`) | gear classifies rooms it does not OPEN a distinct section → declare in `NO_SECTION_OPENER` allowlist (reason: reuses room families already owned by `rooms.ts`) |
| `index.ts` (agenda) | `AGENDA`, `AGENDA LINK` | regex (`index.ts:339`) | export tokens from the agenda module; build regex from them |
| `ops.ts` | — (metadata only) | 5 single-cell regexes | export `METADATA_FIELD_TOKENS` (COI/PROPOSAL/PO/INVOICE/INVOICE NOTES); NO `SECTION_HEADER_TOKENS`; allowlisted with reason |
| `agenda.ts`, `agendaWarnings.ts`, `travelFlights.ts`, `travelFlightWarnings.ts`, `scheduleBookends.ts`, `scheduleTimes.ts`, `dates.ts`(times), `_helpers.ts` | — | no section-opener col0 detection | `NO_SECTION_OPENER` allowlist, each with a one-line reason |

## 5. Registry additions (net-new to `KNOWN_SECTION_HEADERS`)

To make "union of `SECTION_HEADER_TOKENS` ⊆ registry" hold, ADD these currently-recognized-but-unregistered section-opener tokens. Each is a token on which its parser OPENS a multi-row block (a genuine section opener, so registering reflects reality and prevents a future false-positive). All are exact-match (NOT added to `PREFIX_SECTION_FAMILIES`):

- `DRIVER` (transport v1 record-table header, `transport.ts:446`) — transport opens its passenger/driver record table here.
- `DETAILS/ROOM DIAGRAM`, `GS DETAILS (FOR BOTH)` (event-details block variants, `event.ts:40`) — event opens the event-details block on these.

**Contacts labels are NOT added (R1 finding 1)** — they are scalar `cells[1]` reads, not section openers; registering them would mask a same-named dropped section. See §3.

**Guard against masking (R1 [medium] precedent in `knownSections.ts:68-76`):** none of the additions is a `PREFIX_SECTION_FAMILIES` member; all match EXACT-only, and each names a token its parser genuinely parses as a section opener (so it is not a "dropped" section). A dropped section sharing a prefix (`DRIVER SERVICES | NAME | PHONE`) is still flagged. During self-review, confirm no corpus fixture contains a row whose col0 exactly equals one of these additions but is NOT the parsed section (would indicate a masking risk).

## 6. The walker meta-test (`tests/parser/_metaKnownSectionsWalker.test.ts`)

New structural meta-test (companion to the existing hand-maintained pin, which is RETAINED as a redundant deletion-guard):

1. **Filesystem walk.** `fs.readdirSync("lib/parser/blocks")` (+ the agenda module), filter `*.ts`, exclude `*.test.ts`. For each file:
   - dynamically `import()` it; if it exports `SECTION_HEADER_TOKENS`, collect the tokens; else assert the filename is in the `NO_SECTION_OPENER` allowlist (declared in the test with a per-file reason string). A file in NEITHER → **fail** ("new block parser must export SECTION_HEADER_TOKENS or be allowlisted with a reason").
2. **Non-empty for non-allowlisted (R1 finding 2a).** A file NOT in the allowlist that exports `SECTION_HEADER_TOKENS` MUST export a NON-EMPTY array. An empty `SECTION_HEADER_TOKENS = []` on a non-allowlisted file → **fail** (prevents a new parser from vacuously satisfying the subset check with zero tokens).
3. **Subset assertion (EXACT membership — R2 finding 1).** Every collected token, after `normalizeHeader`, is an EXACT member of `KNOWN_SECTION_HEADERS` (`KNOWN_SECTION_HEADERS.has(normalizeHeader(token))`), NOT via `isKnownSectionHeader` (which prefix-matches room families and would let a bogus `GENERAL SESSION CATERING` pass). Room families are exported as their canonical BASE tokens (`GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL ROOM`, `LUNCH ROOM`, `LUNCH SESSION`), each of which IS an exact member of the registry. A token failing exact membership → fail, naming the file + token.
4. **Raw-header-regex source guard (R1 finding 2b — closes the "private inline matcher" hole).** The refactor makes ALL col0 section-opener regexes flow through a single shared helper (§7, e.g. `col0HeaderRe(token)` / `col0HeaderAltRe(tokens)` in `knownSections.ts` or a new `lib/parser/blocks/_sectionHeaderRe.ts`). The walker reads each block-parser file's SOURCE TEXT and **fails if it finds a raw pipe-anchored col0-header regex literal** matching the shape `/\^\\\|\s*\\s\*[A-Z][A-Z\\s/&]*\.\.\./` (i.e. `/^\|\s*UPPERCASE...\s*\|/`-style literals) that is NOT a call to the shared helper. A small, explicitly-reasoned `RAW_HEADER_REGEX_ALLOWLIST` covers any residual legitimate case (e.g. a multi-column transport regex whose col0 token is still derived from the const but whose full-row shape is inline) — each entry names file + reason. A NEW parser that hand-writes `/^\|\s*CATERING\s*\|/` without going through the helper → **fail**. (This is a defense heuristic scoped to the specific pipe-anchored col0-header shape; ops' whole-cell `/^\s*COI\s*$/i` metadata regexes do NOT match this shape and are unaffected.)
5. **Uppercase-equality-literal source guard (R2 finding 2 — closes the string-equality mechanism).** The current parsers also match headers via string equality against an uppercase literal (`client.ts:93` `label === "CLIENT"`, `venue.ts:168` `col0Upper === "VENUE"`, `dates.ts:84` `.toUpperCase() === "DATES"`, `dress.ts:24` `normalizeHeader(...) !== "DRESS"`, `hotels.ts:67` `c === "HOTEL"`). The refactor replaces each section-opener equality literal with a reference to the file's exported const (e.g. compare against `SECTION_HEADER_TOKENS`). The walker then scans each block-parser file's SOURCE TEXT for residual `(===|!==)\s*["'][A-Z][A-Z /&]{2,}["']` comparisons and **fails** unless each matched uppercase literal is ACCOUNTED FOR — i.e. a member of that file's exported `SECTION_HEADER_TOKENS` ∪ `METADATA_FIELD_TOKENS`, OR of `KNOWN_SUB_LABELS` (e.g. `dates.ts` `TRAVEL`/`SET` day-type labels), OR of a named terminator set, OR of an explicit reasoned `EQUALITY_LITERAL_ALLOWLIST` (sentinels like `NO_HEADER`). A NEW parser hand-writing `label === "CATERING"` without registering CATERING → **fail**.
6. **Bounded residual (declared limitation).** The two source guards (4: pipe-anchored col0 header regex; 5: uppercase-string equality) cover BOTH matcher mechanisms every current block parser uses for section-opener detection. A future parser that matched a section header via an EXOTIC mechanism (`.startsWith`, a computed/non-literal token, a lowercase or non-`[A-Z /&]` literal) could still evade the source guards. This is a DECLARED, bounded residual — accepted because (a) it cannot silently drift a simple new header (the common case), (b) the exact-subset + non-empty + filesystem-walk gates still force any file to be annotated or allowlisted, and (c) a broader "parse arbitrary matcher logic" guard is the drift-prone heuristic BL-KNOWN-SECTIONS-WALKER explicitly warns against. The walker's header comment states this residual so a reviewer is pre-loaded.
7. **Disjointness.** For any file exporting BOTH `SECTION_HEADER_TOKENS` and `METADATA_FIELD_TOKENS`, assert they are disjoint (a token cannot be both a section opener and a scalar metadata field).
8. **Proof test (4-part non-vacuity).** (a) a synthetic `{ SECTION_HEADER_TOKENS: ["ZZZ_UNREGISTERED"] }` fails the exact-subset check; (b) a synthetic non-allowlisted file with `SECTION_HEADER_TOKENS: []` fails the non-empty check; (c) a synthetic source string with a raw `/^\|\s*CATERING\s*\|/` literal fails the raw-header-regex guard; (d) a synthetic source string with `label === "CATERING"` (CATERING unaccounted) fails the equality-literal guard. Each proves its gate is non-vacuous.
9. **No-orphan (optional, non-blocking):** warn (do not fail) if a `KNOWN_SECTION_HEADERS` entry is claimed by no parser const AND no `PREFIX_SECTION_FAMILIES`/sub-label/grandfathered consumer — surfaces dead registry entries without brittleness.

## 7. Behavior preservation (the hard requirement)

This is a REFACTOR: parser OUTPUT must not change. Enforced by:

- **Corpus byte-identity.** The golden-file replay `tests/parser/exporterFixtures.test.ts` (15 fixtures) and every parser unit test MUST stay green with NO snapshot regeneration. Any diff in parsed output is a refactor bug, not an accepted change.
- **Matcher-derivation equivalence.** Where a regex is rebuilt from tokens, a co-located unit test asserts the rebuilt regex matches EXACTLY the same set of header strings as the original (enumerate the accepted + a rejected near-miss).
- **normalizeHeader consistency.** All token comparisons use the existing `normalizeHeader` (upper, single-spaced, trimmed) so casing/spacing behavior is unchanged.

## 8. Guard conditions

- **Empty/whitespace col0:** matchers already guard (`if (!col0)` in the scan); token-derived matchers preserve the same guard.
- **A parser recognizing zero section openers** (agenda helpers, ops): allowlisted, not required to export tokens.
- **A regex that matched a SUPERSET of its declared tokens** (bug): the equivalence unit test (§7) fails, forcing the const to capture the true accepted set.
- **A new file added to `lib/parser/blocks/`:** walker fails until it exports tokens or is allowlisted — the core anti-drift guarantee.

## 9. Scope

- **In scope:** exported token consts in each block parser doing section-opener detection; derive matchers from them (behavior-preserving); registry additions (§5); new walker meta-test; retain the existing hand-maintained pin.
- **Out of scope:** changing WHICH rows parse into which section (no behavior change); the multi-column shape gates (transport/rooms field-block) stay as additional gates; `KNOWN_SUB_LABELS`/`countFieldHeaderWords` tuning; widening `classifyVersion` (rec-1); fuzzing (rec-5).

## 10. Meta-test inventory

CREATES `tests/parser/_metaKnownSectionsWalker.test.ts` (filesystem-walked, fail-by-default for new parsers). EXTENDS nothing. RETAINS `_metaKnownSectionsRegistry.test.ts` as a redundant deletion guard. (Declared per writing-plans additions.)

## 11. Advisory-lock topology

N/A — pure parser + test; no `pg_advisory*`, no DB, no lock.

## 12. Acceptance criteria

- Every block parser doing section-opener detection exports `SECTION_HEADER_TOKENS`; its matcher is derived from that const via the shared header-regex helper.
- `ops.ts` exports `METADATA_FIELD_TOKENS` (no section tokens); disjointness holds.
- `contacts.ts` is allowlisted as scalar contact-label detection (NOT a section opener); no contacts tokens added to the registry.
- `rooms.ts` exports ONLY the narrow registry-aligned room-banner families; broad internal exclusion prefixes stay private.
- Files with no section-opener detection are in `NO_SECTION_OPENER` with a per-file reason.
- Walker meta-test: filesystem walk, non-empty-for-non-allowlisted, EXACT subset assertion (`.has(normalizeHeader)`, not prefix), raw-header-regex source guard, uppercase-equality-literal source guard, disjointness, and a 4-part proof case — all pass; the proof case proves each gate non-vacuous. The declared bounded residual (exotic matcher mechanisms) is documented in the walker header.
- Registry additions (§5: `DRIVER`, `DETAILS/ROOM DIAGRAM`, `GS DETAILS (FOR BOTH)`) present; none added to `PREFIX_SECTION_FAMILIES`.
- Corpus replay + full parser suite green with NO snapshot regeneration (byte-identical output).
- Full suite has no NEW failures vs merge-base (pre-existing env-only DB/live failures excepted).
