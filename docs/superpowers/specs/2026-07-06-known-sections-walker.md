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
  - **Single-cell metadata fields** — `ops.ts` `COI`/`PROPOSAL`/`PO`/`INVOICE`/`INVOICE NOTES` extract one scalar from a 2-cell row; they are never followed by a ≥2-field-header-word band, so the scan never sees them. Declared instead in an exported `METADATA_FIELD_TOKENS` const (introspectable, but explicitly NOT required in the registry — the walker asserts these are DISJOINT from `SECTION_HEADER_TOKENS`, catching a mis-categorization).
  - **Block terminators** — `crew.ts` `TERMINATING_LABELS`, `venue.ts` `VENUE_BLOCK_TERMINATORS`, `transport.ts` lowercase terminators (`hotel stays`/`coi`/…): tokens a parser stops AT, not opens on. Already exported as named sets; the walker does NOT require these ⊆ registry (a terminator naming another section's opener is coincidental).
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
| `contacts.ts` | `IN HOUSE AV`, `VENUE/HOTEL/HOTAL CONTACT INFO/INFORMATION/DETAIL(S)`, `ONSITE AV CONTACT` | 3 whole-cell regexes (`contacts.ts:31,34,40`) | export canonical tokens; build regexes from them. Adds the contact-info + onsite tokens to the registry. |
| `client.ts` | `CLIENT` | `label==="CLIENT"` (`client.ts:93,276`) | export `["CLIENT"]`; check ∈ const |
| `dress.ts` | `DRESS` | `normalizeHeader(...)==="DRESS"` (`dress.ts:24`) | export `["DRESS"]`; check ∈ const |
| `rooms.ts` | `GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL ROOM`, `LUNCH ROOM`, `LUNCH SESSION`, `GS DETAILS`, `DETAILS` | prefix regexes + `SECTION_EXACT_TOKENS`/`SECTION_PREFIX_FAMILIES` (`rooms.ts:81,621,639,657,445`) | export `SECTION_HEADER_TOKENS` = the prefix families; prefix regexes built from them. rooms already imports the registry — keep. |
| `gear.ts` | `GENERAL SESSION`, `BREAKOUT`, `LUNCH`, `ADDITIONAL ROOM` (room classification, not a NEW section) | prefix regexes (`gear.ts:89`) | gear classifies rooms it does not OPEN a distinct section → declare in `NO_SECTION_OPENER` allowlist (reason: reuses room families already owned by `rooms.ts`) |
| `index.ts` (agenda) | `AGENDA`, `AGENDA LINK` | regex (`index.ts:339`) | export tokens from the agenda module; build regex from them |
| `ops.ts` | — (metadata only) | 5 single-cell regexes | export `METADATA_FIELD_TOKENS` (COI/PROPOSAL/PO/INVOICE/INVOICE NOTES); NO `SECTION_HEADER_TOKENS`; allowlisted with reason |
| `agenda.ts`, `agendaWarnings.ts`, `travelFlights.ts`, `travelFlightWarnings.ts`, `scheduleBookends.ts`, `scheduleTimes.ts`, `dates.ts`(times), `_helpers.ts` | — | no section-opener col0 detection | `NO_SECTION_OPENER` allowlist, each with a one-line reason |

## 5. Registry additions (net-new to `KNOWN_SECTION_HEADERS`)

To make "union of `SECTION_HEADER_TOKENS` ⊆ registry" hold, ADD these currently-recognized-but-unregistered section-opener tokens (all exact-match, all already parsed today — registering them only prevents a future false-positive, never masks a drop because they are exact, not prefix):

- `DRIVER` (transport v1 header, `transport.ts:446`)
- `DETAILS/ROOM DIAGRAM`, `GS DETAILS (FOR BOTH)` (event variants, `event.ts:40`)
- `VENUE CONTACT INFO`, `VENUE CONTACT INFORMATION`, `VENUE CONTACT DETAIL`, `VENUE CONTACT DETAILS`, `HOTEL CONTACT INFO`, `HOTEL CONTACT INFORMATION`, `HOTEL CONTACT DETAIL`, `HOTEL CONTACT DETAILS`, `HOTAL CONTACT INFO`, `HOTAL CONTACT INFORMATION`, `HOTAL CONTACT DETAIL`, `HOTAL CONTACT DETAILS`, `ONSITE AV CONTACT` (contacts, `contacts.ts:31,40`)

**Guard against masking (spec §R1 precedent in knownSections.ts):** none of the additions is added to `PREFIX_SECTION_FAMILIES`; all match EXACT-only, so a dropped section sharing a prefix ("DRIVER SERVICES | NAME | PHONE") is still flagged.

## 6. The walker meta-test (`tests/parser/_metaKnownSectionsWalker.test.ts`)

New structural meta-test (companion to the existing hand-maintained pin, which is RETAINED as a redundant deletion-guard):

1. **Filesystem walk.** `fs.readdirSync("lib/parser/blocks")` (+ the agenda export from `index`/`agenda.ts`), filter `*.ts`, exclude `*.test.ts`. For each file:
   - dynamically `import()` it; if it exports `SECTION_HEADER_TOKENS`, collect the tokens; else assert the filename is in the `NO_SECTION_OPENER` allowlist (declared in the test with a per-file reason string). A file in NEITHER → **fail** ("new block parser must export SECTION_HEADER_TOKENS or be allowlisted with a reason").
2. **Subset assertion.** Every collected token, after `normalizeHeader`, is in `KNOWN_SECTION_HEADERS` (via `isKnownSectionHeader` exact/family match). A token not registered → fail, naming the file + token.
3. **Disjointness.** For any file exporting BOTH `SECTION_HEADER_TOKENS` and `METADATA_FIELD_TOKENS`, assert they are disjoint (a token cannot be both a section opener and a scalar metadata field).
4. **Proof test.** A synthetic module object `{ SECTION_HEADER_TOKENS: ["ZZZ_UNREGISTERED"] }` run through the same subset check FAILS — proving the walker actually catches an unregistered token (not vacuously green).
5. **No-orphan (optional, non-blocking):** warn (do not fail) if a `KNOWN_SECTION_HEADERS` entry is claimed by no parser const AND no `PREFIX_SECTION_FAMILIES`/sub-label consumer — surfaces dead registry entries without brittleness.

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

- Every block parser doing section-opener detection exports `SECTION_HEADER_TOKENS`; its matcher is derived from that const.
- `ops.ts` exports `METADATA_FIELD_TOKENS` (no section tokens); disjointness holds.
- Files with no section-opener detection are in `NO_SECTION_OPENER` with a per-file reason.
- Walker meta-test: filesystem walk, subset assertion, disjointness, proof case — all pass; proof case proves non-vacuity.
- Registry additions (§5) present; none added to `PREFIX_SECTION_FAMILIES`.
- Corpus replay + full parser suite green with NO snapshot regeneration (byte-identical output).
- Full suite has no NEW failures vs merge-base (pre-existing env-only DB/live failures excepted).
