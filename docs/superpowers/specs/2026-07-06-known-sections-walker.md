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
| `index.ts` (agenda) | `AGENDA`, `AGENDA LINK` | private regex at `index.ts:339` | **R3 finding 1:** the real matcher is in `index.ts`, not `blocks/agenda.ts`. Export `SECTION_HEADER_TOKENS=["AGENDA","AGENDA LINK"]` from a module the walker imports (a new `lib/parser/blocks/agendaLink.ts` OR an export on `index.ts`), BUILD the `index.ts:339` regex from that const, and INCLUDE `lib/parser/index.ts` in the walker's scanned-file set (§6). Exporting tokens from a different module while leaving `index.ts:339` a private raw regex must NOT pass. |
| `ops.ts` | — (metadata only) | 5 single-cell regexes | export `METADATA_FIELD_TOKENS` (COI/PROPOSAL/PO/INVOICE/INVOICE NOTES); NO `SECTION_HEADER_TOKENS`; allowlisted with reason |
| `agenda.ts`, `agendaWarnings.ts`, `travelFlights.ts`, `travelFlightWarnings.ts`, `scheduleBookends.ts`, `scheduleTimes.ts`, `dates.ts`(times), `_helpers.ts` | — | no section-opener col0 detection | `NO_SECTION_OPENER` allowlist, each with a one-line reason |

## 5. Registry additions (net-new to `KNOWN_SECTION_HEADERS`)

To make "union of `SECTION_HEADER_TOKENS` ⊆ registry" hold, ADD these currently-recognized-but-unregistered section-opener tokens. Each is a token on which its parser OPENS a multi-row block (a genuine section opener, so registering reflects reality and prevents a future false-positive). All are exact-match (NOT added to `PREFIX_SECTION_FAMILIES`):

- `DRIVER` (transport v1 record-table header, `transport.ts:446`) — transport opens its passenger/driver record table here.
- `DETAILS/ROOM DIAGRAM`, `GS DETAILS (FOR BOTH)` (event-details block variants, `event.ts:40`) — event opens the event-details block on these.

**Contacts labels are NOT added (R1 finding 1)** — they are scalar `cells[1]` reads, not section openers; registering them would mask a same-named dropped section. See §3.

**Guard against masking (R1 [medium] precedent in `knownSections.ts:68-76`):** none of the additions is a `PREFIX_SECTION_FAMILIES` member; all match EXACT-only, and each names a token its parser genuinely parses as a section opener (so it is not a "dropped" section). A dropped section sharing a prefix (`DRIVER SERVICES | NAME | PHONE`) is still flagged. During self-review, confirm no corpus fixture contains a row whose col0 exactly equals one of these additions but is NOT the parsed section (would indicate a masking risk).

## 6. The walker meta-test (`tests/parser/_metaKnownSectionsWalker.test.ts`)

New structural meta-test (companion to the existing hand-maintained pin, which is RETAINED as a redundant deletion-guard).

**Guarantee model (R4 — same-vector structural reframe).** Three rounds of review kept finding matcher mechanisms a source-text guard missed (RHS-only equality, reversed equality, the agenda leading-`\s*`/alternation regex, rooms' `/^GENERAL SESSION\b/.test(col0)` non-pipe prefix regexes). Chasing every regex/equality SHAPE is the drift-prone heuristic BL-KNOWN-SECTIONS-WALKER warns against and cannot be proven complete. So the guarantee is split:

- **PRIMARY guarantee (complete, structural, not shape-dependent):** the *annotation contract* — (step 1) every scanned file exports `SECTION_HEADER_TOKENS` or is allowlisted (fail-by-default filesystem walk); (step 2) non-empty for non-allowlisted; (step 3) EXACT subset ⊆ registry; **(step 4) IMPORT-LINK: every file that exports `SECTION_HEADER_TOKENS` MUST import the single shared matcher factory (§7) and MUST NOT be shown to construct a section-opener matcher any other way** — combined with **corpus byte-identity** (§7), this means the exported tokens ARE the tokens actually matched, by construction. This trio+byte-identity is the real closure of the drift class and is NOT shape-dependent.
- **BACKSTOP (defense-in-depth, explicitly NOT a completeness proof):** the source-text guards (steps 5-6) that flag the raw-matcher SHAPES present in the codebase today, so an accidental hand-rolled matcher is caught early even before byte-identity would.

0. **Scanned-file set.** All of `lib/parser/blocks/*.ts` (filesystem-walked, excluding `*.test.ts`) PLUS `lib/parser/index.ts` (R3 finding 1 — it owns the agenda matcher). Token-collection (step 1), the import-link check (step 4), and BOTH source guards (steps 5-6) run over this full set.
1. **Filesystem walk.** For each file in the scanned-file set:
   - dynamically `import()` it; if it exports `SECTION_HEADER_TOKENS`, collect the tokens; else assert the filename is in the `NO_SECTION_OPENER` allowlist (declared in the test with a per-file reason string). A file in NEITHER → **fail** ("new block parser must export SECTION_HEADER_TOKENS or be allowlisted with a reason").
2. **Non-empty for non-allowlisted (R1 finding 2a).** A file NOT in the allowlist that exports `SECTION_HEADER_TOKENS` MUST export a NON-EMPTY array. An empty `SECTION_HEADER_TOKENS = []` on a non-allowlisted file → **fail** (prevents a new parser from vacuously satisfying the subset check with zero tokens).
3. **Subset assertion (EXACT membership — R2 finding 1).** Every collected token, after `normalizeHeader`, is an EXACT member of `KNOWN_SECTION_HEADERS` (`KNOWN_SECTION_HEADERS.has(normalizeHeader(token))`), NOT via `isKnownSectionHeader` (which prefix-matches room families and would let a bogus `GENERAL SESSION CATERING` pass). Room families are exported as their canonical BASE tokens (`GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL ROOM`, `LUNCH ROOM`, `LUNCH SESSION`), each of which IS an exact member of the registry. A token failing exact membership → fail, naming the file + token.
4. **IMPORT-LINK (PRIMARY — the structural closure).** The refactor centralizes ALL section-opener matcher construction in ONE shared factory module (§7, `lib/parser/blocks/_sectionHeaderMatch.ts`, exporting `buildCol0HeaderRe(tokens)`, `buildCol0HeaderAltRe(tokens)`, `matchesSectionHeader(col0, tokens)`). The walker asserts: every file that exports a NON-EMPTY `SECTION_HEADER_TOKENS` **imports** `_sectionHeaderMatch` (static `import` check on the source). A file that exports tokens but does NOT import the factory → **fail** ("a section-opener parser must build its matcher from the shared factory, not privately"). Combined with corpus byte-identity (§7), this makes "the exported tokens are the tokens actually matched" true by construction, independent of any regex/equality SHAPE — this is the complete, shape-independent closure the source guards below only backstop.
5. **Raw-header-regex source guard (BACKSTOP).** The walker reads each scanned file's SOURCE TEXT (blocks/*.ts + index.ts) and **fails if it finds a raw col0-header regex literal** NOT produced by the shared factory, covering the shapes present today: (i) pipe-anchored `/^\s*\|\s*[A-Z][A-Z \s/&]*.../` INCLUDING an optional leading `\s*` and an alternation group (the agenda shape `/^\s*\|\s*(AGENDA LINK[^|]*?|AGENDA)\s*\|/i`, `index.ts:339`); (ii) non-pipe col0-tested prefix regexes of the shape `/^[A-Z][A-Z \s/&]*.../.test(<col0-like ident>)` (the rooms shape `/^GENERAL SESSION\b/.test(col0)`, `rooms.ts:621/639/657`). A small explicitly-reasoned `RAW_HEADER_REGEX_ALLOWLIST` (file + reason) covers residual legitimate inline cases (e.g. a multi-column transport regex whose col0 token is still derived from the const). A NEW parser hand-writing `/^\|\s*CATERING\s*\|/` or `/^CATERING\b/.test(col0)` → **fail**. (ops' whole-cell `/^\s*COI\s*$/i` metadata regexes are single-token whole-cell, not col0-header-prefix shaped, and are unaffected.)
6. **Uppercase-equality-literal source guard (BACKSTOP).** The walker scans each scanned file's SOURCE TEXT for uppercase-literal equality comparisons in BOTH operand orders — `(===|!==)\s*["'][A-Z][A-Z /&]{2,}["']` AND `["'][A-Z][A-Z /&]{2,}["']\s*(===|!==)` (R3 finding 2 — `"CATERING" === label` must not evade); an AST binary-expression walk over `==`/`===`/`!=`/`!==` nodes with an uppercase string-literal operand is an acceptable equivalent — and **fails** unless each matched uppercase literal is ACCOUNTED FOR: a member of that file's exported `SECTION_HEADER_TOKENS` ∪ `METADATA_FIELD_TOKENS`, OR `KNOWN_SUB_LABELS` (e.g. `dates.ts` `TRAVEL`/`SET`), OR a named terminator set, OR an explicit reasoned `EQUALITY_LITERAL_ALLOWLIST` (sentinels like `NO_HEADER`). A NEW parser hand-writing `label === "CATERING"` (either order) without accounting → **fail**.
7. **Bounded residual (honestly declared).** The source guards (5-6) are a BACKSTOP, not a completeness proof: they flag the three raw-matcher shapes present in the codebase today (pipe/leading-ws/alternation regex; non-pipe `col0.test` prefix regex; uppercase equality both orders). A future parser matching via a genuinely exotic mechanism (`.startsWith`, `.includes`, a computed/non-literal token, a non-`[A-Z /&]` literal) could evade the source guards — BUT it CANNOT evade the PRIMARY guarantee (steps 1-4 + byte-identity): it would either fail the filesystem-walk/allowlist gate, or, if it exports tokens, fail the import-link gate unless it builds its matcher from the shared factory (in which case its matched tokens ARE the exported, registry-checked tokens). The residual is therefore limited to a parser that exports tokens, imports the factory, AND ALSO privately matches an additional unregistered header — a contrived case caught by corpus byte-identity if it changes any fixture. The walker's header comment states this residual so a reviewer is pre-loaded.
8. **Disjointness.** For any file exporting BOTH `SECTION_HEADER_TOKENS` and `METADATA_FIELD_TOKENS`, assert they are disjoint (a token cannot be both a section opener and a scalar metadata field).
9. **Proof test (6-part non-vacuity).** (a) synthetic `{ SECTION_HEADER_TOKENS: ["ZZZ_UNREGISTERED"] }` fails the exact-subset check; (b) a non-allowlisted file with `SECTION_HEADER_TOKENS: []` fails the non-empty check; (c) a source string exporting tokens but NOT importing `_sectionHeaderMatch` fails the import-link check; (d) a raw `/^\|\s*CATERING\s*\|/` literal AND a `/^CATERING\b/.test(col0)` literal both fail the raw-header-regex guard; (e) `label === "CATERING"` fails the equality guard; (f) the REVERSED `"CATERING" === label` also fails the equality guard. Each proves its gate is non-vacuous.
10. **No-orphan (optional, non-blocking):** warn (do not fail) if a `KNOWN_SECTION_HEADERS` entry is claimed by no parser const AND no `PREFIX_SECTION_FAMILIES`/sub-label/grandfathered consumer — surfaces dead registry entries without brittleness.

## 7. Behavior preservation (the hard requirement)

This is a REFACTOR: parser OUTPUT must not change. Enforced by:

- **Single shared matcher factory.** `lib/parser/blocks/_sectionHeaderMatch.ts` is the SOLE constructor of section-opener matchers: `buildCol0HeaderRe(tokens)` (pipe-anchored, optional leading `\s*`), `buildCol0HeaderAltRe(tokens)` (alternation, for agenda/event multi-variant), `matchesSectionHeader(col0, tokens)` (equality/normalized). Every parser's section-opener matcher is produced by these, from its exported `SECTION_HEADER_TOKENS`. This is what the import-link check (§6.4) pins.
- **Corpus byte-identity.** The golden-file replay `tests/parser/exporterFixtures.test.ts` (15 fixtures) and every parser unit test MUST stay green with NO snapshot regeneration. Any diff in parsed output is a refactor bug, not an accepted change. This is the ultimate behavior-preservation AND anti-drift proof: if a factory-built matcher does not reproduce a parser's original accepted set, a fixture changes and the suite fails.
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

- Every block parser doing section-opener detection exports `SECTION_HEADER_TOKENS` and builds its matcher via the shared `_sectionHeaderMatch` factory (the sole matcher constructor); the walker's import-link check pins this.
- `ops.ts` exports `METADATA_FIELD_TOKENS` (no section tokens); disjointness holds.
- `contacts.ts` is allowlisted as scalar contact-label detection (NOT a section opener); no contacts tokens added to the registry.
- `rooms.ts` exports ONLY the narrow registry-aligned room-banner families; broad internal exclusion prefixes stay private.
- Files with no section-opener detection are in `NO_SECTION_OPENER` with a per-file reason.
- Walker meta-test scans `lib/parser/blocks/*.ts` PLUS `lib/parser/index.ts` (agenda matcher); PRIMARY gates = filesystem walk (fail-by-default), non-empty-for-non-allowlisted, EXACT subset (`.has(normalizeHeader)`, not prefix), and the IMPORT-LINK check (token-exporting file must import the `_sectionHeaderMatch` factory); BACKSTOP source guards = raw-header-regex (pipe/leading-ws/alternation + non-pipe `col0.test` prefix) and uppercase-equality-literal (both operand orders); plus disjointness and a 6-part non-vacuity proof — all pass. The honestly-declared bounded residual is documented in the walker header.
- The `index.ts:339` agenda regex is built from an exported `SECTION_HEADER_TOKENS` const, not a private raw literal.
- Registry additions (§5: `DRIVER`, `DETAILS/ROOM DIAGRAM`, `GS DETAILS (FOR BOTH)`) present; none added to `PREFIX_SECTION_FAMILIES`.
- Corpus replay + full parser suite green with NO snapshot regeneration (byte-identical output).
- Full suite has no NEW failures vs merge-base (pre-existing env-only DB/live failures excepted).
