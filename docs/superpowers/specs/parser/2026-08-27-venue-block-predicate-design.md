# Venue-block predicate: one shared definition, so a typo in the current template stops being silent

**Status:** design, ratified for implementation on `fix/typo-v4-venue-shape`.
**Closes:** `BL-TYPO-NORMALIZED-V4-VENUE-SHAPE` (BACKLOG.md).
**Supersedes:** the §9 documented-limit entry in `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:150`, which filed this row and explicitly said it was "NOT a ratified narrowing, an open filing."
**Decision authority:** Eric, 2026-08-26 05:05, recorded at the bl-orch handoff record of 2026-08-22, line 1127 (untracked, under `FX-worktrees/_briefs/`) — venue gate = option 2, one shared definition.
**Base:** `origin/main` at `44b0d74b1`. Every measurement below was re-run on that head; the commands are in §8.

---

## 1. The defect, stated as one row that changes meaning with its table

The same row, the same parser, differing only in the shape of the table above it:

```
| VENUE      | ADDRESS      | LOADING DOCK |     <- v2 opener
| Hotal Contact Info | Ashley M |                 emits TYPO_NORMALIZED

| VENUE NAME | Four Seasons Hotel Chicago |      <- v4 opener
| Hotal Contact Info | Ashley M |                 emits nothing at all
```

`Hotal Contact Info` is a registered typo alias (`lib/parser/aliases.ts:27`) resolving to `venue.contact_info`. Under the v4 opener it produces no `TYPO_NORMALIZED` (the gate is false), no `FIELD_LABEL_AUTOCORRECTED` (the alias resolves exactly, so the scoped fuzzy path never sees a corrected hit), and no `UNKNOWN_FIELD` (the label resolved, so it is not a near-miss candidate). Nothing is surfaced.

v4 is the current template. The three most recent corpus fixtures (2026-03, 2026-04, 2026-05) carry it and carry no standalone `VENUE` cell at all (§8, probe 3).

The mechanism is one line. `venue.ts:110` gates the emission on `matchesSectionHeader(opener, SECTION_HEADER_TOKENS)`, and `matchesSectionHeader` (`lib/parser/blocks/_sectionHeaderMatch.ts:44-47`) is whole-cell equality after `normalizeHeader`. `"VENUE NAME" !== "VENUE"`. That is the whole of it.

### 1.1 Resolved scope — do not relitigate

Each row is settled, with the ratification that settled it. A reviewer verifies the citation rather than re-deriving the decision.

| resolved | ratified at | note |
| --- | --- | --- |
| Option 2 (one shared definition), not option 1 (a second predicate at the gate only) | Eric, 2026-08-26 05:05, the bl-orch handoff record of 2026-08-22, line 1127 (untracked, under `FX-worktrees/_briefs/`) | arguing for a gate-only second predicate is arguing with the user |
| Predicate A, not B | this spec §2.2, from the measured table | after approval, proposing B is a re-scope, which is bl-orch's call |
| `SECTION_HEADER_TOKENS` stays `["VENUE"]` | this spec §2.1; AC-N3 at `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:90` forbids the payload blast radius | four consumers enumerated in §2.1 |
| `TYPO_NORMALIZED` stays admin-log-only | master spec §12.4 row, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2947` | `dougFacing` null, no `/help/errors` row |
| `TYPO_NORMALIZED` stays not-actionable | `lib/admin/infoCodeActionability.ts:16`, `tests/parser/dataGapsClassCompleteness.test.ts:52` | the copy must not promise an action |
| `TYPO_NORMALIZED` is not cell-anchored | `CELL_ANCHORED_CODES` = `OPERATOR_ACTIONABLE_ANCHORED`, `lib/drive/showDayTimeAnchors.ts:17`, `lib/parser/dataGaps.ts:406-431` | warn-severity codes only; adding an info code is a separate design question |
| Card copy arrives through the `CARD_SURFACED_LOG_ONLY` carve-out | `lib/messages/cardSurfacedLogOnly.ts:9-13`, read by `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts:36-43` | three codes already use it |
| No persisted-value backfill | Eric's condition 2; this spec §3.3 | any proposal goes to bl-orch, not into a task |
| The master spec's `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2771` "omits those keys entirely" sentence is not re-argued | the live carve-out precedent at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3270`, which the extractor accepts | cite the precedent; do not spend a round on the prose |
| The readiness note's "silently drops the deep link" is refuted | this spec §3.1, by resolution probe | the v4 venue table has no anchor today; recorded once |
| The 65-row baseline regen path is an explicit committed JSON with an env-var regen | `tests/parser/fieldNearMissBaseline.test.ts:8-14` | never `toMatchSnapshot()` |
| `TERMINATORS` is not widened | this spec §4.3 | the guarantee it would protect is already held by the collision rule |

### 1.2 Why this is a defect and not a documented limit

The ledger filing bar sends a hypothetical to a limits record when its worst case is conservative behavior plus a surfaced signal. Here there is no surfaced signal, so the screen does not cover it. That reasoning is the row's own and is unchanged; it is restated here because this spec closes the row rather than re-filing it.

### 1.3 Dimensional Invariants

**N/A — no UI surface changes.** No file under `app/` or `components/` is edited (AC-V10), so there is no fixed-dimension parent and no flex or grid child to pin. `components/admin/NoteWarningCard.tsx` is READ in §5 to establish what Doug sees today and is deliberately not touched: the copy reaches it through the catalog. Editing it would make invariant 8's impeccable dual gate mandatory, which is why §5.3's six sites stop at the catalog and its registries.

### 1.4 Transition Inventory

**N/A — no component with multiple visual states is added or modified.** The one state change this arc causes is in rendered TEXT, not in a visual state machine: a note card's title moves from the parser's internal message to the catalog title, and its guidance line moves from absent to present. That is a single before/after pair with no animation surface, asserted at the pure-function layer (`reviewWarningTitle`, `notePopoverParts`) in AC-V8 rather than through a rendered transition.

### 1.5 Other checklist sections, declared N/A rather than omitted

Tier × domain and CHECK/enum migration matrices: N/A — no DDL, no CHECK, no enum. §3.3 concerns the VALUES already written into an existing jsonb column and writes none of them. Flag lifecycle table: N/A — this arc adds no boolean config field or toggle. Cap and truncation behavior: N/A — no unbounded list is rendered or persisted; the one count that could grow, the anchor set a v4 scan produces (§4.3), is bounded in CONSEQUENCE rather than in size by the collision rule.

---

## 2. The decision: one predicate, two callers

`venue.ts:110` (the `TYPO_NORMALIZED` gate) and `fieldNearMiss.ts:217` (the near-miss detector's venue anchor-namespace arm) both answer the question "is this table the venue block?" Today each answers it by calling `matchesSectionHeader` against `VENUE_SECTION_HEADER_TOKENS`, which is the same answer by coincidence of implementation rather than by construction. Option 2 makes it one exported predicate that both call.

### 2.1 What the predicate is NOT

**`SECTION_HEADER_TOKENS` stays `["VENUE"]`.** It is not widened to carry `VENUE NAME`, and this is load-bearing rather than stylistic. That constant feeds four consumers at once:

| consumer | site | what a widened token set would do |
| --- | --- | --- |
| the v2 three-column parse branch | `venue.ts:154` | a v4 `VENUE NAME` row would enter the three-column branch and read its value cell as a field label, breaking AC-N3's byte-identical venue payload |
| the near-miss vocabulary | `fieldNearMiss.ts:109` via `SECTION_HEADER_TOKEN_SETS` | changes the §3.1 insertion-order tie-break, silently rewriting emitted `candidate` values |
| `isKnownSectionHeader` | `fieldNearMiss.ts:190` via the `knownSections` barrel | changes which rows are near-miss candidates |
| the anchor namespace | `fieldNearMiss.ts:217` | the only one this arc wants to move |

Three of the four are collateral. So the shared definition is a NEW predicate whose inputs nothing else reads, and `SECTION_HEADER_TOKENS` is untouched.

### 2.2 Which predicate: A, measured against B

"One shared definition" has two candidate predicates, and the row's own text names both. Measured over the 17-fixture harness corpus (`tests/parser/mutation/fixtures.ts:28-39`) with `scanRowsWithOpener`, `resolveAlias` and `matchesSectionHeader` (§8, probe 1):

| predicate for "this table is the venue block" | tables matched | typo-alias rows inside them | baseline rows whose `block` becomes `venue` |
| --- | --- | --- | --- |
| current: opener is the `VENUE` token | 14 | 0 | 0 |
| **A: `VENUE` token OR opener resolves to `venue.name`** | **21** | **0** | **0** |
| B: `VENUE` token OR opener resolves to any `venue.*` canonical | 33 | 6 | 0 |

**This spec chooses A.**

A is the literal form of the row's option 2 ("so the v4 shape maps to `venue`"). The seven tables it adds are exactly the `VENUE NAME`-opened ones: the 4-row v4 venue table in 2026-03, 2026-04 and 2026-05 (`fixtures/shows/raw/2026-03-rpas-central-four-seasons.md:40-44` is the shape), plus the large venue reference table that also opens on `VENUE NAME` in those three and in 2025-10-fixed-income. None carries a typo alias, so the corpus `TYPO_NORMALIZED` census stays 0 and AC-N8's pin survives as written.

**B is rejected, and the cost is specific rather than aesthetic.** Under B, `Hotal Contact Info` is itself the OPENER of a two-row table in five fixtures (`fixtures/shows/raw/2025-10-consultants-roundtable.md:13-15` is one), and it sits inside a `Hotel Reservations`-opened table in 2025-06. The alias file keys `contact_info`, `in_house_av` and `hotel_reservations` under `venue.*` (`lib/parser/aliases.ts:27-34`). So B moves the corpus census from 0 to 6, contradicts the ratified "0 before, 0 after" at the near-miss spec §2.1 and AC-N8, and pulls the hotel-contact mini-tables into the venue namespace for the anchor scanner. It repairs the row by redefining the venue block to include tables nobody calls the venue block.

A registered typo alias whose label happens to open its own table is the shape B mistakes for a venue block. That is not an edge case in the corpus; it is six rows in six fixtures.

### 2.3 The predicate, normatively

A new exported predicate lives in `lib/parser/blocks/venue.ts` beside the tokens it generalizes:

```
isVenueBlockOpener(opener) :=
  matchesSectionHeader(opener, SECTION_HEADER_TOKENS)        // the v2 standalone VENUE cell
  OR resolveAlias(normalizeHeader(opener)) === "venue.name"  // the v4 VENUE NAME opener
```

**Both arms normalize through `normalizeHeader`, and that is the point rather than a detail.** `matchesSectionHeader` normalizes its input internally (`lib/parser/blocks/_sectionHeaderMatch.ts:45`); a bare `resolveAlias` does not. Without the wrap the two arms disagree about what counts as the same string, which is two definitions wearing one name — the drift this arc exists to remove. The disagreement is not theoretical: a two-word opener admits whitespace variation that a one-word token cannot, and `VENUE  NAME` (double space), `VENUE\tNAME` (tab) and `VENUE\u00a0NAME` (non-breaking space) each fail the unwrapped arm. Each would leave a typo row inside that table silent, which is this arc's own defect class rather than a benign one.

Measured, with a genuinely two-word token (`EVENT DETAILS`) as the arm-1 control, because `VENUE` is one word and cannot exhibit internal-whitespace variation at all (§8, probe 5):

| perturbation of the opener | arm 1 on `EVENT DETAILS` | arm 2 bare | arm 2 wrapped |
| --- | --- | --- | --- |
| identity, lowercased, leading/trailing space | true | true | true |
| double internal space | true | **false** | true |
| tab internal | true | **false** | true |
| non-breaking space internal | true | **false** | true |
| newline entity (`&#10;`) | false | false | false |
| trailing colon | false | false | false |

**Parity is the criterion, not permissiveness.** Wrapping in `decodeEntities` as well would additionally accept the `&#10;` form, but arm 1 REJECTS that form, so it would make arm 2 strictly more permissive than arm 1 and reopen the asymmetry in the other direction. The wrap stops at `normalizeHeader`, where the two arms agree column for column. Corpus cost of the wrap: none — 21 tables before and after, zero disagreements.

Both arms are content-keyed on the opener text, which moves with its rows, so the predicate is swap-invariant by construction — the property AC-N2's 497-swap sweep pins.

`venue.ts:110` and `fieldNearMiss.ts:217` are its only two callers. `fieldNearMiss.ts` imports it directly rather than through `sectionHeaderTokens.ts`; that barrel exports TOKEN SETS whose membership is derived from block parsers' `SECTION_HEADER_TOKENS` and asserted by `tests/parser/fieldNearMiss.test.ts`, and a predicate is not a token set.

---

## 3. What each of the three consumers of `kind` sees after the change

`fieldNearMiss.ts:195-214` names three real consumers of `kind`. Each is stated here with its measured outcome, because "one predicate" changes a routing key and a routing key with three readers is not a refactor.

### 3.1 Anchor resolution

`resolveUnknownFieldCell` joins on the `(kind, normalized label, normalized value)` triple and returns the anchor only on EXACTLY ONE match; zero or two or more yield null (`unknownFieldAnchors.ts:186-197`). That is the never-wrong-cell guarantee.

**Before this arc, a v4 venue table has no anchors of any kind.** Probed by resolution (§8, probe 2): a workbook whose venue table opens on `VENUE NAME` yields **0** anchors total, and `resolveUnknownFieldCell` returns null for a row in it under BOTH `kind: "venue"` and `kind: "venue name"`. The same rows under a `VENUE` opener yield 2 anchors and resolve to `A3`.

**The witness row must be one the parser actually leaves unresolved.** An earlier draft of this spec used `Venu Notes`, which is wrong in a way worth recording so it is not reintroduced: `parseVenue`'s scoped fuzzy path RECOVERS that label, emits `FIELD_LABEL_AUTOCORRECTED`, and consumes the row, so `raw_unrecognized` is empty and no `UNKNOWN_FIELD` exists to anchor. An anchor assertion over it would pass without ever exercising the routing key this arc changes. Probed (§8, probe 6):

```
Venu Notes:   warnings=[FIELD_LABEL_AUTOCORRECTED(kind=venue)]   raw_unrecognized=[]
Diagrams?:    warnings=[UNKNOWN_FIELD(kind="venue name")]        raw_unrecognized=[{block:"venue name",key:"Diagrams?",...}]
```

**`Diagrams?` is the witness this spec uses**, in §4 and AC-V7 alike. It is a real near-miss on the live tree, it is already a calibrated member of the 65-row baseline's residual set, and its `kind` today is literally `"venue name"` — the value predicate A moves to `"venue"`. So the assertion fails for exactly the reason the change exists to fix, which `Venu Notes` could never have shown.

This corrects a claim on the record. The arc-nearmiss readiness note said a `VENUE NAME` block's anchor "degrades to null" and "silently drops the Open in Sheet deep link." There is no link to drop: the v4 shape never had one. Under A with the scanner untouched the outcome is null before and null after. Nothing regresses; something becomes possible. Recorded once here so no later round re-derives it.

**§4 repairs it.** See there.

### 3.2 The swap oracle

`tests/parser/mutation/oracle.ts:61` keys `R:${block}|${key}`. Both arms of the predicate read the opener text, which travels with its rows under a block swap, so the `block` value is swap-invariant. AC-N2's sweep (`tests/parser/mutationHarness.venueSwapSweep.test.ts`, `tests/parser/venueSwapInvariance.test.ts`) must stay green **unchanged** — that is AC-V4 below, an acceptance criterion rather than an assumption.

### 3.3 The persisted `block` column

`raw_unrecognized[].block` and `parse_warnings[].blockRef.kind` are jsonb on `shows_internal` (`supabase/migrations/20260501001000_internal_and_admin.sql:1-6`), written by `lib/sync/applyParseResult.ts:329`.

**No backfill is written, and rows persisted before this change keep whatever `block` they were written with.** This is Eric's condition 2 and is not a task in the plan. It is also expected to be vacuous: a live row's value could only differ if a near-miss row sat inside a v4 venue table, and the corpus has none (§2.2, column 3 = 0 for A). Any proposal to touch persisted values goes to bl-orch before it becomes work.

---

## 4. The anchor scanner learns the v4 opener

Eric put the anchor in scope. §3.1 establishes it is absent rather than broken, so the default is to repair it, and the repair is measured rather than assumed.

### 4.1 The change

`lib/drive/unknownFieldAnchors.ts:41`, the `venue` row of `BLOCKS`:

```
{ kind: "venue", header: /^VENUE$/i }          ->  { kind: "venue", header: /^VENUE(\s+NAME)?$/i }
```

Measured (§8, probe 4 — a throwaway patch, run, and revert on this head), with the real `Diagrams?` near-miss as the witness row: the v4 workbook goes from **0 venue anchors and a null resolution** to **2 venue anchors and `A3`**, and the v2 workbook is **unchanged** at 2 anchors and `A3`.

### 4.2 Why widening this regex does not break the never-wrong-cell guarantee

The scanner's design comment (`unknownFieldAnchors.ts:16-39`) anchors headers EXACT at both ends because a false-early header match starts the scan at the wrong row and could, under a `(kind,label,value)` coincidence, yield a wrong-cell link, while a MISSED header degrades to null, which is safe. Widening a header regex is therefore the direction that needs an argument.

**The scan takes the FIRST row whose first non-blank cell matches, then breaks** (`unknownFieldAnchors.ts:141-149`). So the question is which spelling appears first in a sheet. Measured across every fixture in the corpus (§8, probe 3). Three findings:

- Every fixture carrying a bare `VENUE` has it EARLY. The only fixture carrying both spellings is `2025-10-fixed-income-trading-summit`: bare `VENUE` at row 33, `VENUE NAME` at row 252. The bare form wins the first-match race by 219 rows, so v2 selection is unchanged.
- The three v4 fixtures carry NO bare `VENUE` at all. Their first `VENUE NAME` is the real 4-row venue table (2026-03 row 40, 2026-04 row 75, 2026-05 row 76); the large reference table's `VENUE NAME` is the second occurrence (2026-03 row 238) and is never selected.
- The seven exporter-xlsx transcriptions are all v2 and carry no `VENUE NAME` row at all, so the family that actually produces anchor workbooks in the corpus is untouched.

In a v2 sheet the `VENUE NAME` label sits in column 1 of the header row, so the row's FIRST NON-BLANK cell is `VENUE` — `VENUE NAME` is not a candidate header row there at all, independent of ordering.

### 4.3 Two consequences, stated rather than left for a reviewer

**The v4 header row is consumed as the header, so the `VENUE NAME` row itself gets no anchor.** The scan anchors from `headerRow + 1` (`unknownFieldAnchors.ts:151`). This costs nothing: `VENUE NAME` resolves as an alias, so it is never a near-miss candidate and never needs an anchor. The v2 shape already behaves identically — its venue-name row is also the header row.

**A v4 scan over-includes, because `TERMINATORS` carries `VENUE` and not `VENUE NAME`** (`lib/drive/unknownFieldAnchors.ts:48`). A scan opened on the v4 header runs until the next real terminator, which in 2026-03 is well past the 4-row table. Over-inclusion is the safe direction by that file's own §5.1.1 argument: extra anchors can only produce a two-or-more collision, and a collision resolves to null, never to another row's cell. **`TERMINATORS` is deliberately NOT widened.** Adding `VENUE NAME` to it would fence the v4 scan out of the reference table, but it is a change with v2 blast radius this arc has not bounded, and the guarantee it would protect is already held by the collision rule. The scanner's comment states the over-inclusion.

---

## 5. Operator copy for `TYPO_NORMALIZED`

Eric's condition 3 puts this in scope. Every operator-facing field on the catalog row is null today (`lib/messages/catalog.ts:2037-2047`).

### 5.1 What Doug sees today

`reviewWarningTitle` (`lib/admin/reviewWarningTitle.ts:22-35`) falls through a null catalog `title` to the parser's own `message`, and `venue.ts:117` builds that message as:

```
Typo alias 'Hotal Contact Info' normalized to canonical 'venue.contact_info'
```

It contains no code and is not code-shaped, so the fallback accepts it. The note card (`NoteWarningCard.tsx:61`) therefore shows Doug an internal canonical key, with no guidance line (`helpfulContext` null) and no `?` popover (both popover copy fields null). That string would fail the card-copy banned-vocabulary regex on the word `canonical` if it were catalog copy (`tests/messages/_metaWarningCardCopy.test.ts:42-47`).

### 5.2 The class it stays in

`TYPO_NORMALIZED` stays **admin-log-only and not-actionable**. `dougFacing`, `crewFacing`, `longExplanation` and `helpHref` stay null and no `/help/errors` row appears; the master spec files it admin-log-only at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2947`. `lib/admin/infoCodeActionability.ts:16` keeps `not-actionable` and `tests/parser/dataGapsClassCompleteness.test.ts:52` keeps it in `BENIGN_INFO_CODES`. `lib/sync/phase1.ts:197-206` keeps dropping info codes from the sync summary; that is the sync-log surface, not the card.

The carve-out for an admin-log-only code that nonetheless renders on a card is `CARD_SURFACED_LOG_ONLY` (`lib/messages/cardSurfacedLogOnly.ts:9-13`), which `tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts:36-43` reads to REQUIRE `title` and `helpfulContext`. Three codes use it. This makes four.

**`TYPO_NORMALIZED` is not cell-anchored, and this arc does not change that.** `CELL_ANCHORED_CODES` is `OPERATOR_ACTIONABLE_ANCHORED` (`lib/drive/showDayTimeAnchors.ts:17`, `lib/parser/dataGaps.ts:406-431`), which holds warn-severity codes only, so the note card's "Open in Sheet" link never renders for this code. §4's anchor work is about the `UNKNOWN_FIELD` rows that share the venue namespace, not about this code.

### 5.3 The six sites, and what the copy must say

The worked precedent is `SECTION_HEADER_NO_FIELDS`, verified at each site.

| # | site | change |
| --- | --- | --- |
| 1 | `lib/messages/cardSurfacedLogOnly.ts:9-13` | add `TYPO_NORMALIZED` |
| 2 | `lib/messages/catalog.ts:2037-2047` | `title`, `helpfulContext`, `triggerContext`, modelled on `lib/messages/catalog.ts:2052-2064` |
| 3 | master spec YAML appendix (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3116` block) | a `TYPO_NORMALIZED: "…"` line, modelled on `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3270` |
| 4 | `pnpm gen:spec-codes` | regenerate `lib/messages/__generated__/spec-codes.ts`, SAME commit as 2 and 3 |
| 5 | `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:144` §4.2 table | a new row, byte-compared by `_metaWarningCardCopy.test.ts:88-92` |
| 6 | `tests/messages/warningCardCopyRegistry.ts` | membership `tests/messages/warningCardCopyRegistry.ts:32`, `EXPECTED_TRIGGER_CONTEXT` `tests/messages/warningCardCopyRegistry.ts:98`, `EXPECTED_TITLE_CHANGES` `tests/messages/warningCardCopyRegistry.ts:134`, `EXPECTED_HELPFUL_CONTEXT` `tests/messages/warningCardCopyRegistry.ts:245` |

Sites 2, 3 and 4 land in ONE commit (invariant 5 lockstep; `x1-catalog-parity` at `tests/cross-cutting/codes.test.ts:69-92` compares `helpfulContext`). The §12.4 table row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2947` keeps its "(admin log only …)" Doug cell so the extractor (`scripts/extract-spec-codes.ts:173-180`) keeps `dougFacing` null.

The prose at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2771` says the appendix "omits those keys entirely" for admin-log-only codes. The carve-out precedent at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3270` already contradicts it and the extractor accepts the key. Cite the precedent; do not spend a round on the sentence.

**What the copy has to say.** Doug misspelled a field label, we read it as the one he meant, and there is nothing for him to do. The copy must not promise an action, because `INFO_CODE_ACTIONABILITY` says there is none. Gates: the banned-vocabulary regex (no `canonical`, `parse`/`parser`/`parsed`/`parsing`, `token`, `fallback`, `null`, `payload`, and no em dash, case-insensitive) and the caps — `helpfulContext` ≤ 300 chars, `triggerContext` ≤ 160 chars, `title` non-empty.

Authored copy, which the implementation uses verbatim and the tests derive from the catalog rather than restate:

- **title:** `Misspelled label we recognized`
- **helpfulContext:** `A row's label in your sheet is misspelled, and we recognized which field was meant, so the misspelling itself cost nothing. This is a record for us rather than something to fix; correct the spelling in the sheet whenever it suits you.`
- **triggerContext:** `Appears when a row's label is a known misspelling of a field we recognize.`

**The copy asserts nothing about the crew page, deliberately.** An earlier draft said "the row still shows on the crew page." That is FALSE, and recording why keeps it from being reintroduced: probed across all four registered typo aliases under a v4 venue table, every one produced empty contacts and no event output (§8, probe 8). `venue.contact_info` in particular is a field `parseVenue` never writes — the near-miss spec's §2.1 says so in as many words, which is why a store-gated emission there would have been dead code. The predicate change adds an info warning; it does not publish a row that was not being published. Copy passing the banned-vocabulary regex and the caps is necessary and not sufficient: a sentence can clear every mechanical gate and still tell Doug something untrue, and only a probe against the rendered payload catches that.

---

## 6. Ratified text rewritten in the same commit as the code it describes

Invariant 7. A comment that survives its own repair is the next reviewer's finding. Three texts, one class:

| text | what it currently ratifies | what it becomes |
| --- | --- | --- |
| `lib/parser/blocks/venue.ts:99-109` | the v4 silence, "the ratified outcome" | the shared predicate, both callers named, the v4 shape firing |
| `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:37` (§2.1), `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:49-55` (§2.2), `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:96` (AC-N8) | the venue block as `matchesSectionHeader` against the token set | the venue block as `isVenueBlockOpener`, with this spec cited |
| `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md:150` (§9 limits) | "NOT a ratified narrowing, an open filing" | a closed pointer to this spec and the archived row |

This spec gets a row in `docs/superpowers/specs/parser/README.md`'s index table (`tests/docs/specsReadmeIndexParity.test.ts` walks it from disk).

---

## 7. Acceptance criteria

- **AC-V1 — the current template is no longer silent.** A v4 `VENUE NAME`-opened table holding `| Hotal Contact Info | Ashley M |` emits exactly one `TYPO_NORMALIZED`, `severity: "info"`, `blockRef.kind === "venue"`, `rawSnippet === "Hotal Contact Info"`. Red on `44b0d74b1`. The witness carries `premiseHolds` on the typo alias, in the shape of `fieldNearMissBaseline.test.ts:281-284`.
- **AC-V2 — one predicate, two callers.** `venue.ts` and `fieldNearMiss.ts` both call `isVenueBlockOpener`, and `SECTION_HEADER_TOKENS` is still exactly `["VENUE"]`.
- **AC-V3 — the corpus census is unchanged.** `TYPO_NORMALIZED` over the 17 fixtures is 0 before and 0 after, including under the adjacent-block swap AC-N8 already sweeps.
- **AC-V4 — the swap suites are green UNCHANGED.** `mutationHarness.venueSwapSweep` and `venueSwapInvariance` are not edited.
- **AC-V5 — the 65-row baseline does not move.** Regenerated with `UPDATE_NEAR_MISS_BASELINE=1`, the diff is empty and `EXPECTED_TOTAL` stays 65. A non-empty diff stops the arc and goes to bl-orch with the rows, per Eric's condition 1.
- **AC-V6 — the old-direction pins are RE-DERIVED, not deleted.** Four sites: the 8453-case generator at `venue.test.ts:426-434` switches its derivation to the shared predicate; `warnings.test.ts:168-207`'s comment states what is now true and gains a v4 twin; AC-N8's census block keeps its two v2 cases and gains the v4 direction; `venue.ts:99-109` is rewritten in §6. No expectation is folded to a constant.

  **What the generator can and cannot discriminate, stated rather than overclaimed.** Only ONE of the four registered typo aliases is venue-scoped — `hotal contact info` → `venue.contact_info`; the other three (`diagrams`, `virtaul audience`, `goosneck`) resolve to `details.*` (§8, probe 7). So the generator's `LOADING DOCK` arm carries no typo alias at all, and its silence there holds regardless of the predicate. That arm is a NON-REGRESSION check, not a discriminating one, and this spec does not claim otherwise. **The discriminating silence witness is the existing byte-identical `| HOTEL |` case at `fieldNearMissBaseline.test.ts:294-307`**: same row, same parser, same position, only the opener differs, so its silence can only be the membership gate. AC-V1's v4 witness and that case are the two directions that actually bound the predicate; the generator's value is exhaustiveness over the alias table, not discrimination.
- **AC-V7 — a REAL near-miss in a v4 venue table resolves to its own cell.** The witness row is `Diagrams?`, which the parser genuinely leaves unresolved (§3.1) — never `Venu Notes`, which the fuzzy path consumes. On a `VENUE NAME`-headed workbook, venue anchors go from 0 to 2 and `resolveUnknownFieldCell` goes from null to a cell; the v2 workbook is unchanged. Plus a false-early guard case in the spirit of `tests/drive/unknownFieldAnchors.test.ts:119`. The case asserts the workbook produced a header row before asserting resolution, and asserts through `parseSheet` that the witness row really is an `UNKNOWN_FIELD` — an anchor test over a consumed row is vacuous however it resolves.
- **AC-V8 — Doug reads copy, not an internal key.** `reviewWarningTitle` on a `TYPO_NORMALIZED` warning returns the catalog title rather than the message containing `venue.contact_info`, and `notePopoverParts` returns non-null copy. Expected strings are derived from the catalog, never hardcoded. `CARD_SURFACED_LOG_ONLY` goes from 3 members to 4.
- **AC-V9 — the score holds at the shipping head.** `fieldNearMiss` scored under `pnpm heavy:mutation` with bl-orch's class-lock take, floor 0.95, the two accepted rows re-keyed if lines moved, 0 unaccepted survivors.
- **AC-V10 — no UI surface is touched.** No file under `app/` or `components/` changes. Invariant 8's closeout marker is `N/A`.

---

## 8. The probes, and how to re-run them

Kept under the worktree's untracked `.probe/` (gitignored). Run from the worktree root as `node --import tsx <file>`.

Measured on `44b0d74b1`:

1. **probe 1, `predicate-census`** — the §2.2 table.
   `current: tables=14 typoAliasRowsInside=0 baselineRowsMoved=0`
   `A: tables=21 typoAliasRowsInside=0 baselineRowsMoved=0`
   `B: tables=33 typoAliasRowsInside=6 baselineRowsMoved=0`
2. **probe 2, `anchor-real-witness`** — §3.1 and §4.1, resolution on both shapes, using the REAL near-miss witness `Diagrams?` (probe 6 is why it is not `Venu Notes`).
   Before: `v4 venue anchors 0, resolve null` · `v4 all kinds []` · `v2 venue anchors 2, resolve {"title":"INFO","gid":0,"a1":"A3"}`
3. **probe 3, `anchor-order`** — §4.2, the false-early question. Prints the first bare-`VENUE` row and the first `VENUE NAME` row per fixture. No fixture has `VENUE NAME` preceding `VENUE`.
4. **The §4.1 widening, verified by throwaway patch.** Apply the regex change, run probe 2, revert (`git diff --stat` confirms the revert). Under the widening, with the `Diagrams?` witness: `v4 venue anchors 2, resolve {"title":"INFO","gid":0,"a1":"A3"}` · `v4 all kinds ["venue"]` · `v2 venue anchors 2, resolve {…"a1":"A3"}` — v4 repaired, v2 untouched.
5. **probe 5, `arm-divergence2`** — §2.3's parity table. Compares both arms across eight ordinary-authoring perturbations, using `EVENT DETAILS` as the arm-1 control because `VENUE` is one word and cannot exhibit internal-whitespace variation. Also prints the corpus cost: `A=21 tables, A+decode+normalize=21 tables, disagreements=0`. (Its first version used `VENUE` for the control column and was therefore vacuously true for every internal-whitespace row; the probe itself was a spec input and got its own review, per the probe-mini-review rule.)
6. **probe 6, `finding-repairs`** — §3.1's witness question. `Venu Notes` yields `FIELD_LABEL_AUTOCORRECTED` and `raw_unrecognized=[]`; `Diagrams?` yields `UNKNOWN_FIELD(kind="venue name")` and a real `raw_unrecognized` row.
7. **probe 7, same script** — AC-V6's discrimination question. The four registered typo aliases are `hotal contact info` → `venue.contact_info`, `diagrams` → `details.diagrams`, `virtaul audience` → `details.virtual_audience`, `goosneck` → `details.gooseneck`. One of four is venue-scoped.
8. **probe 8, same script** — §5's copy claim. Every registered typo alias under a v4 venue table yields `contacts=[]` and no event output, which is what refuted the "still shows on the crew page" draft.

The 65-row baseline's kind census, for §3.3's vacuity claim: `timestamp` 30, `client` 24, `client contact` 4, `details` 4, `console` 2, `joann` 1. No block in that set normalizes to a `venue.*` alias, so no row's `kind` or `block` can move under A.

---

## 9. Documented limits

- **A v4 venue scan over-includes rows below the 4-row table** until the next real terminator, because `TERMINATORS` carries `VENUE` and not `VENUE NAME` (§4.3). Bounded by the collision rule: extra anchors can only yield null, never another row's cell. Widening `TERMINATORS` is a separate change with unbounded v2 blast radius and is not taken here.
- **A sheet whose venue reference table precedes its real venue table** would have the reference table selected as the anchor header. No corpus fixture has this ordering (§8, probe 3) and it is one ordinary edit away from none of them. Files here rather than as a finding.
- **An opener carrying a newline entity between its words** (`VENUE&#10;NAME`) is not the venue block. BOTH arms reject it, together, which is the parity §2.3 chose over permissiveness; and the parser surfaces `FIELD_LABEL_AUTOCORRECTED` on such an opener row anyway, so the shape is conservative-plus-surfaced rather than silent. Closing it would mean wrapping arm 2 in `decodeEntities`, which arm 1 does not do — making the arms disagree again in the opposite direction.
- **Adversarial sheet content** constructed to collide a `(kind,label,value)` triple across two tables, or to defeat `normalizeHeader`, is out of scope — the threat model is Doug typing an ordinary misspelling into the current template, and an ordinary contributor editing a block parser or a copy site.
- **Persisted rows written before this change keep their `block` value** (§3.3). No backfill, by Eric's condition 2.

---

## 10. Threat model

The guard this spec ships is a two-arm predicate over sheet table openers, so its fence is stated once and every admissibility question cites it.

**Defended against:** Doug typing a field label with an ordinary misspelling into the current template, and an ordinary contributor editing a block parser, the catalog, or a copy site.

**Out of scope, filing to §9 rather than to a finding:** adversarial sheet content constructed to collide a `(kind,label,value)` triple across two tables, or to defeat `normalizeHeader`.

**Probe domain.** An admissible probe is drawn from, or is one ordinary edit away from, this set: the 17 harness fixtures (`tests/parser/mutation/fixtures.ts:28-39`), the 65-row baseline they produce, the row's own two-row probe document and its v4 twin, workbooks built with `XLSX.utils.aoa_to_sheet` from those same rows, the alias table (`lib/parser/aliases.ts`), the six copy sites named in §5.3, and `BACKLOG.md`.

**Consequence bound.** Every table in the corpus and in the constructed witnesses is classified as the venue block by exactly one predicate that both readers call; a registered typo alias inside such a table emits exactly one `TYPO_NORMALIZED` and one outside it emits none; the corpus census and the 65-row baseline read the numbers §7 states; and a near-miss row in a v4 venue table resolves either to its own cell or to null, never to another cell. A null anchor on a shape the scanner declares out of its header set, stated in the scanner's comment, is a documented limit, not a defect.

The fence in §1.1 is the same boundary named by decision rather than by input; the two are one contract.
