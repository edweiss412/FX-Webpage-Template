# Near-miss cards only where a parser reads, and a missing-venue-address notice — design

**Status:** Ready for adversarial review
**Date:** 2026-10-25
**Branch:** `fix/near-miss-gear-quote-header` (no ledger row; found live on the FinTech wizard review)
**Predecessors:** `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` (the detector), `docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md` (its first narrowing)
**Evidence base:** `docs/superpowers/specs/parser/probes/2026-10-25-nearmiss-known-header-probe.ts`. Every corpus number in this document is printed by that script.

## 1. Problem

The onboarding review of the live sheet "II - FinTech Forum CTO Summit 2026" (`1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY`) shows three "Row we couldn't match" cards, all under Contacts:

| Sheet row | Value | Card says |
| --- | --- | --- |
| `GEAR!A3` `Address:` | 1270 AVENUE OF THE AMERICAS / NEW YORK, NY 10020 | rename to `VENUE ADDRESS` |
| `GEAR!A6` `Phone:` | 212-224-3878 | rename to `Client Phone` |
| `GEAR!A9` `E-mail:` | ashley.morgan@institutionalinvestor.com | rename to `Client Email` |

All three rows sit in the GEAR tab's rental-quote header: the "bill to" block above the gear table (`Client:`, `Contact:`, `Address:`, `Phone:`, `Cell Phone:`, `Fax:`, `E-mail:`, `ALT. E-mail:`, `Event Name:`, with `Date:` / `Event Date(s):` / `Venue:` / `Room(s):` / `Time(s):` on the right). No section parser reads it; the one value taken out of it is `Event Name:`, which a whole-document title scan reads into the show title (§3.2). The address is Institutional Investor's head office on every corpus instance, the phone is a desk line, and the email is sometimes a different person from the INFO contact.

Following the cards makes the show worse. Renaming `Address:` makes the client's New York office the venue address of a Chicago show. Renaming `Phone:` and `E-mail:` clears the cards and writes nothing, because the v4 client parser reads only `Contact Cell` / `Contact Office` / `Contact Email`. On the older consultants layout the same renames overwrite the real client contact. §2 has the measurements.

Meanwhile the gap that does reach crew gets no signal: INFO's `VENUE ADDRESS` is blank, so the crew page shows Kimpton Gray with no street address: the venue section builds an `"Address"` entry from `streetFromAddress(venue.address, venueCity)` (`components/crew/sections/VenueSection.tsx`), and the key-value list drops a row whose value is empty (`components/crew/primitives/KeyValueRows.tsx`, via `shouldHideGenericOptional` in `lib/visibility/emptyState.ts`).

The 2026-08-28 narrowing ended on "the advice text is correct for the blocks that survive" (its §7). The quote-header blocks survived it, and the advice is not correct there.

## 1.1 Resolved scope — do not relitigate

1. **Quote-header rows get no rename card, ratified.** Eric, 2026-10-25, in the session that found the defect: "fix the near-miss detector here so it stops telling Doug to rename GEAR quote-header rows."
2. **Blank venue address gets a notice, ratified.** Eric, 2026-10-25: "venue address should be in scope."
3. **No client-contact notice, ratified.** Eric, 2026-10-25: "Drop the client-contact notice. Ship the near-miss fix plus the venue-address notice only." The reason: the crew page never renders `client_contact` (`components/crew/sections/CrewSection.tsx` header comment, "NEVER `data.show.client_contact`"; `components/crew/sections/TodaySection.tsx` header comment, "`client_contact` is read NOWHERE"), so a blank client phone or email reaches no crew member. Do not propose it as a finding or an addition.
4. **Quote-header values are never offered as fixes.** Eric, 2026-10-25, on the header's address: "that nyc address is the client address, not really relevant for crew." The notice never suggests a value, and nothing in this arc reads the quote header.
5. **The detector's matching rule is untouched.** Normalization, the fused form, type (a) and type (b) matching, `MIN_LEN`, `DISTINCTIVENESS_MAX`, the guards and the vocabulary tie-break ship byte-identical. This spec adds one candidacy condition on the block and changes nothing about how a row matches once its block is admitted.
6. **The 2026-08-28 arms stay.** The form-dump and inventory-matrix exclusions in `isCandidateHome` (`lib/parser/fieldNearMiss.ts`) ship unchanged. The new condition is an additional requirement, not a replacement.
7. **`UNKNOWN_FIELD` keeps its identity.** Same §12.4 row, same gap class, same anchor routing, same copy. The set of emissions shrinks; nothing about an emission changes.
8. **NARROWING is the required direction for part 1.** Any round that grows the near-miss recognizer instead of shrinking it is out of direction for this arc.
9. **Threat model.** Real sheet shapes as they occur in the corpus and on the live sheets. A block hand-constructed to sit on a boundary files to §7 documented limits, not to a finding.
10. **Consequence bound.** Part 1: every row is either a candidate under the shipped rule or excluded, and a wrong exclusion costs one missing advisory card; it never changes a parsed value. Part 2: the notice reads the parsed show and writes nothing to it; a wrong notice is one extra non-blocking card, and a missing one is today's behavior.
11. **Probe domain.** The fixtures under `fixtures/shows/raw/` and `fixtures/shows/exporter-xlsx/` plus the live-sheet snapshot embedded in the probe. A probe outside that set, or more than one ordinary edit away from an input in it, files to §7.

## 2. Measurement

All numbers here are printed by the evidence-base probe, run 2026-10-25 against the 17 corpus fixtures and the 33-row baseline (`tests/parser/__fixtures__/fieldNearMiss.baseline.json`) as committed on `origin/main` at this branch's merge base. Its controls: the baseline it reads equals the live file row for row, all 17 fixtures are read, two parses of one text agree, renaming a row to its own label is a no-op on all 33, and a planted corrupt-then-repair of INFO's `VENUE ADDRESS` reads back as EFFECTIVE.

### 2.1 What following each card does (TABLE-A)

Every baseline row was renamed in place to its suggested candidate and the sheet re-parsed. Verdicts: EFFECTIVE (the row's value lands in the candidate's own field, and the only other change is the same value leaving the free-form slot it occupied before, such as `event_details.stage`), INERT (the card clears and the payload is unchanged), HARMFUL (the payload changes somewhere other than that, or the value lands in a field where it is wrong). Each row was tested as committed, and, where the raw fixture's INFO cells are filled while the live sheet's are blank, again with those INFO cells blanked to match the live sheet.

The mechanical rule calls three rows EFFECTIVE that are not: `Address:` → `VENUE ADDRESS` in the exporter `Client:` blocks, where INFO's address is blank, so the client's New York office lands in `show.venue.address`. The value reached the candidate's field, and it is the wrong value: the venue of a Chicago show set to a Manhattan office. The probe's domain-adjusted scheme counts a venue field fed from a client block as HARMFUL. As committed, domain-adjusted: **4 EFFECTIVE, 8 HARMFUL, 21 INERT**. The 4 EFFECTIVE rows are `Stage` and `Storage` in the east-coast `DETAILS` block (raw and exporter): renaming `Stage` to `Stage Size` moves `8' x 24' x 2'` from `event_details.stage` to `event_details.stage_size`, and renaming `Storage` to `Equipment Storage` moves `Back of house near kitchen area` from `event_details.storage` to `event_details.equipment_storage`.

On the consultants layout, the HARMFUL renames overwrite the real client contact: the v2 client path scans every row and the last match wins (`lib/parser/blocks/client.ts`, `parseClientV2orV1`), so `Phone:` → `Client Phone` and `E-mail:` → `Client Email` in the quote header replace the INFO contact's phone (`917-414-1935`) and email (`ekaufman@institutionalinvestor.com`) with the quote header's London values (`44 (0)7580 863 591`, `ekaufman@iilondon.com`).

### 2.2 The rule, scored (TABLE-B, TABLE-C)

Under the label-opener arm (§3) the detector's corpus emissions fall from 33 to **5**: the 4 EFFECTIVE `Stage`/`Storage` rows, plus `Diagrams?` in the `JOANN` question checklist, which is INERT and is already a documented limit of the 2026-08-28 narrowing (its §6 item 3). Every HARMFUL row and every other INERT row is withdrawn. TABLE-C attributes every emission to its row with zero unattributed and zero ambiguous matches, and the emission set equals the frozen baseline.

### 2.3 Why not a positive predicate (TABLE-F)

The natural first design is positive: a block is a candidate only if its opener is a section header the parser knows. Three spellings of it were measured, each ANDed with the shipped `isCandidateHome`:

| predicate | blocks admitted (of 481 today) | withdrawn | withdrawn and read field by field |
| --- | --- | --- | --- |
| P1 `isKnownSectionHeader(opener)` | 171 | 310 | 47 |
| P2 opener matches some parser's own section tokens, or `isVenueBlockOpener` | 109 | 372 | 68 |
| P3 P1 or P2 | 178 | 303 | 44 |
| **P4 the label-opener arm (shipped)** | **471** | **10** | **5, all `Event Name:` → `show.title`** |

All four keep the same 4 EFFECTIVE rows. P1 to P3 also withdraw dozens of blocks the parser reads label by label: `GS Setup` / `BO Setup` room blocks, `DETAIL CHECKLIST`, room-header blocks. P1 alone drops the v4 venue opener `VENUE NAME` (`isKnownSectionHeader("VENUE NAME")` is false). Withdrawing candidacy from field lists the parser reads is the one exclusion the 2026-08-28 spec showed this detector must not make (its §3.1, the threshold-3 venue result), and no row-count table can see it, because those blocks host no emission today. The positive form is refuted by measurement and recorded here so it is not re-proposed.

### 2.4 The venue census (TABLE-D, TABLE-E)

On the corpus, 17 of 17 fixtures name a venue and 14 carry its address. `VENUE_ADDRESS_MISSING` would fire on 3: `fixtures/shows/exporter-xlsx/fintech.md` (Kimpton Gray), `fixtures/shows/exporter-xlsx/fixed-income.md` (Park Hyatt Chicago) and `fixtures/shows/exporter-xlsx/rpas.md` (Four Seasons Hotel Chicago). It fires on no `fixtures/shows/raw/` fixture: every raw snapshot carries the address.

On the live sheets (snapshot embedded in the probe as `LIVE_SNAPSHOT_2026_10_25`, 7 sheets read 2026-10-25 through the Sheets API), 7 of 7 name a venue and 4 carry an address. The same three shows fire: FinTech Forum CTO Summit 2026, Fixed Income Trading Summit 2025, Retirement Plan Advisor Institute Central 2026. They are also exactly the three where `Address:` → `VENUE ADDRESS` was HARMFUL (§2.1): the rename card was pointing Doug at the wrong row for the right gap.

## 3. Part 1: the label-opener arm (normative)

### 3.1 Definition

`isCandidateHome` (`lib/parser/fieldNearMiss.ts`) gains a third exclusion arm beside the form-dump and inventory-matrix arms. Every block the existing arms admit and this arm does not fire on stays a candidate home, and the detector's behavior inside it is unchanged.

- **Label opener.** Take the block opener as `scanRowsWithOpener` reports it (`row.opener`), entity-decoded and cleaned the way the detector cleans cells. Split it at the first `/` and keep segment 0, trimmed. The block is NOT a candidate home when that segment ends with a colon.

Implemented as one exported predicate, `isLabelOpener(opener: string): boolean`, called from `isCandidateHome`, so a test can state its premise against it directly, the same reason `isCandidateHome` is exported.

### 3.2 Why this shape

A section parser opens on a section word (`CLIENT`, `VENUE`, `DETAILS`, `TRANSPORTATION`), never on a label waiting for its value. A block whose first cell is `Client:` opens on a label: it is a form header, the rental quote's bill-to block, and no section parser opens on it. `matchesSectionHeader` returns false for `Client:` against every exported section token set (`lib/parser/sectionHeaderTokens.ts`, `SECTION_HEADER_TOKEN_SETS`; probe F.1), because the colon is part of the cell. Its rows are not fields of any section. The one value read out of these blocks anywhere in the corpus is `Event Name:` into `show.title`, by a whole-document scan rather than by a section parser (probe F.5). A rename card there is wrong whichever field it names (§2.1).

Two parts of the definition are load-bearing:

- **Segment 0, split at `/`.** The exporter joins merged cells with `/`. `TRANSPORTATION/Load In:` is the transport section header merged with its first label: segment 0 is `TRANSPORTATION`, a section word, and the block stays a candidate. The parser reads that block field by field (probe F.2), so testing the whole opener for a trailing colon would withdraw a real field list.
- **Ends with, not contains.** Room headers carry colons mid-string (`GENERAL SESSION ... TOTAL: 74' x 31' ...`, `ROOM DIMENSIONS:` followed by a line break and `4100 SQ FT TOTAL`). A "contains a colon" test would withdraw them.

The arm's whole reach on the corpus is probe F.5, printed at authoring time (2026-10-25): it fires on 10 of 514 blocks, every one of them admitted by the 2026-08-28 rule, so all 10 are withdrawn. Their openers are `Client:` (8 blocks, the GEAR quote header on raw and exporter fixtures), `Client:/Contact:` (1, the consultants layout of the same header) and `EVENT NAME:/DATE:/ROOM:/QTY/PULLED/INITAL/CAT/SUB CAT/ITEM/NOTES` (1, a pull-sheet header in `fixtures/shows/exporter-xlsx/ria.md`). Inside them:

- the only row whose value reaches the payload through its label is `Event Name:` → `show.title`, in the 5 raw-fixture quote headers;
- in the 3 exporter fixtures where the quote header and the gear table share one block, emptying the gear date-banner row and the `Item` header row moves `rooms`; those are gear-table rows, not fields, and no near-miss can fire on them;
- no venue, details, transport, crew, hotel or dates block is touched.

## 4. Part 2: the missing-venue-address notice (normative)

One new warn-severity, non-blocking `ParseWarning` code, `VENUE_ADDRESS_MISSING`. It reads the PARSED show after `parseVenue` has run, never the raw rows. The property it reports is "the crew page will show this venue with no street address", and that is a property of the output. Keying it on input row shapes would re-open the label-spelling and template-version questions part 1 exists to close: the address label is `VENUE ADDRESS` on v2 and v4 sheets and `Hotel Address` on the v1 East Coast sheet (`lib/parser/aliases.ts`, the `"venue.address"` entry).

### 4.1 Condition

Emitted at most once per show, when the parsed `show.venue.name` is non-empty after trimming AND `show.venue.address` is empty after trimming. `ShowRow.venue.address` is a `string` (`lib/parser/types.ts`, `ShowRow`), set to `""` when no address row carries a value (`lib/parser/blocks/venue.ts`, `const venueAddress = address ?? ""`). A show with no venue name emits nothing.

### 4.2 What the notice never does

- It never writes to the parsed show. The payload with and without the notice is byte-identical.
- It never suggests a value, and never reads the GEAR quote header (§1.1 item 4).
- It never blocks publishing. Severity is warn.

### 4.3 The warning object

- `severity: "warn"`, `code: "VENUE_ADDRESS_MISSING"` as a string LITERAL in the push (the code extractor reads literals, `lib/parser/warnings.ts` near `emitUnknownField`).
- Emitted through a new exported helper in `lib/parser/warnings.ts`, in the pattern of `ORPHANED_CREW_ROWS` / `emitOrphanedCrewRows`, and called from `parseSheet` (`lib/parser/index.ts`) after `parseVenue` returns.
- `blockRef: { kind: "venue" }`. `kind` is the section-routing key, so the notice lands in the Venue section of the wizard review and of the published review modal (`lib/admin/step3SectionStatus.ts`, `KIND_TO_SECTION`). No `blockRef.field`: the wizard renders `"address"` and `"name"` as hotel and room wording (`lib/admin/step3Buckets.ts`, `FIELD_LABELS`).
- `rawSnippet`: the venue name, verbatim. Ignore keys its fingerprint on code plus normalized `rawSnippet` (`lib/dataQuality/warningFingerprint.ts`), and a blank `rawSnippet` disables Ignore (`lib/dataQuality/ignorableSnippet.ts`). Keying on the venue name means an ignored notice comes back if the show moves to a different venue, which is when Doug would want to see it again. The notice fires only when the trimmed venue name is non-empty (§4.1), so `hasIgnorableSnippet` holds for every emission and the Ignore control always renders. That is what licenses the `controlsNote` naming Ignore (§4.5, §4.6 item 5).
- No `sourceCell`, and the code is NOT added to `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts`): no "Open in Sheet" link this arc (§7 item 5).

### 4.4 Gap class and alert posture

`VENUE_ADDRESS_MISSING` joins `GAP_CLASSES` (`lib/parser/dataGaps.ts`) with label `venue with no address`, `plural: "venues with no address"` (the default bare `s` would print "addresss"; `GAP_CLASSES` documents `plural` for exactly this case) and `gateExempt: true`. Membership is what makes the review show it as needs-a-look and counts it in data-quality summaries. The exemption is load-bearing: without it, the first cron sync after this ships compares each published show's prior warnings (no `VENUE_ADDRESS_MISSING`) against the new ones and raises `RESYNC_QUALITY_REGRESSED` for every published show with a blank address (`lib/sync/runScheduledCronSync.ts`, the applied-epilogue regression check via `isQualityRegression`), an alert caused by the deploy, not by any sheet edit. The two other venue-derived codes are exempt for the same kind of reason (`VENUE_GEOCODE_UNRESOLVED`, `VENUE_TIMEZONE_UNRESOLVED`). The wizard re-scan dirty check does not read `gateExempt` (`lib/onboarding/rescanDecision.ts`), so a staged show re-scanned after the deploy is marked changed when the notice first appears. That is correct for staged review: it is new information to review.

Flag lifecycle for `gateExempt` on this entry: **storage** the `GAP_CLASSES` row; **write path** source code only; **read paths** `isGateExempt` inside `isQualityRegression` and `hasRecoveredToBaseline` (`lib/parser/dataGaps.ts`), `buildRegressionPayload` (`lib/sync/runScheduledCronSync.ts`), and `computeDrift` and `computeNewShowGaps` (`lib/notify/monitorDigest.ts`); **effect** the code is left out of the published-show regression alert, its payload and its auto-resolve baseline, and out of the monitor digest's drift counts and its new-show gap list. It still counts as a needs-a-look gap in the wizard review (`lib/admin/step3Buckets.ts`), the review modal's section warnings, and the data-quality summaries built from `summarizeDataGaps`. Losing the new-show digest line is the accepted cost: the same notice sits on the show's own review, and the two other venue-derived codes already take that trade.

### 4.5 Copy (canonical — implementation copies verbatim)

Written to the warning-card copy contract (`docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.1): the inline line says what is off the crew page and what to change in the sheet; the popover line opens with "Appears when". No banned vocabulary, no em dash, straight apostrophes. The inline and popover copy name no sheet label, because the address label differs by template (§4).

The copy states what the notice knows, which is the parsed output, not a cell's state: "we read a venue name but no address". The notice also fires when an address is present under a label the venue parser does not read (an ordinary relabel of `VENUE ADDRESS` to `Street Address` parses to `address: ""`), so copy saying "the address cell is empty" would tell Doug to fill a cell that is already filled. "Or check its row label" covers that case. The composed inline line (`helpfulContext` plus a space plus `controlsNote`) stays under the 300-character cap the copy meta-test enforces.

| Field | Text |
| --- | --- |
| `title` | Venue with no address |
| `helpfulContext` (inline) | We read a venue name but no address for it, so crew see the venue with no street address. Fill in the venue address in your sheet, or check its row label. |
| `triggerContext` (popover) | Appears when we read a venue name but no venue address. |
| `dougFacing` (§12.4) | "We read _<venue>_ as the venue but found no address for it, so the crew page shows the venue with no street address. Fill in the venue address in the sheet, or check its row label." |
| `crewFacing` | `null` (§12.4 cell `—`). Crew never see this notice. |
| `followUp` | Doug → add the venue address in the sheet (or Ignore) |
| `controlsNote` | Use Report to flag it to us, or Ignore to hide this notice. |
| `longExplanation` | Your sheet names the venue, but we found no address for it: the address cell is empty, or its row has a label we don't read. The crew page shows the venue without a street address until the address is in the venue address row, and it will show the next time this show checks its sheet. |
| `helpHref` | `/help/errors#VENUE_ADDRESS_MISSING` |
| `warningClass` | `"parse_warning"` |

The `VENUE` prefix already maps to a help-page family (`app/help/errors/_families.ts`), so no help-page edit is needed and the `/help/errors` anchor is generated from the catalog row.

### 4.6 Registration, end to end

The template is commit `fde0bad97` (`ROW_CELLS_FUSED`), which touched the same set. Every one lands in the same commit as the catalog row, per the AGENTS.md §12.4 lockstep rule:

1. Master spec §12.4 row in the parser soft-warnings group, plus its `helpfulContext` YAML appendix entry (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`).
2. `pnpm gen:spec-codes` and `pnpm gen:internal-code-enums`, both generated files committed.
3. `lib/messages/catalog.ts` row (§4.5).
4. `lib/parser/dataGaps.ts` `GAP_CLASSES` entry (§4.4), and the count pins that follow from it: `tests/parser/dataGaps.test.ts` and `tests/parser/dataGapsClassCompleteness.test.ts` each move by exactly one.
5. Copy-restore spec §4.2 appended row and §3.1 registry count, plus `tests/messages/warningCardCopyRegistry.ts` (`WARNING_CARD_COPY_CODES`, `EXPECTED_TRIGGER_CONTEXT`, `EXPECTED_LONG_EXPLANATION`, `EXPECTED_CONTROLS_NOTE`, `EXPECTED_HELPFUL_CONTEXT`). The copy meta-test's "only UNKNOWN_FIELD's note names Ignore" case pins the set of codes whose `controlsNote` names Ignore to `["UNKNOWN_FIELD"]`, because Ignore renders only when `rawSnippet` is non-empty. It moves to `["UNKNOWN_FIELD", "VENUE_ADDRESS_MISSING"]` and its title and comment are updated to say both codes always write a non-empty snippet (§4.3), the re-check that case asks for. `EXPECTED_CORPUS_WARN_CODES` does NOT change: it reads `fixtures/shows/raw/`, where the notice fires on no fixture (TABLE-D).
6. `tests/parser/_warningCodeAnchor.ts` `WARNING_CODE_ANCHOR`.
7. `tests/parser/venueSignalParity.test.ts` baseline regenerated (`UPDATE_VENUE_PARITY_BASELINE=1`), reviewed row by row: the only new warning signature is one `VENUE_ADDRESS_MISSING` on each of the three exporter fixtures TABLE-D names; every other change is a part-1 removal.

No migration: no CHECK or enum lists warning codes, and `parse_warnings` is `jsonb` (`supabase/migrations/20260501001000_internal_and_admin.sql`).

## 5. Acceptance criteria

Part 1:

- **AC-1.** A full `parseSheet` of `fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md` and of `fixtures/shows/exporter-xlsx/fintech.md` emits no `UNKNOWN_FIELD` whose key is `Address:`, `Phone:` or `E-mail:`. RED before the change: each emits all three today.
- **AC-2.** The corpus baseline is regenerated deliberately (`UPDATE_NEAR_MISS_BASELINE=1`) and reviewed row by row. The removed set is exactly the baseline rows whose block the label-opener arm excludes (TABLE-C, P4 column), and the surviving set is the rest. `EXPECTED_TOTAL` and the composition partition in `tests/parser/fieldNearMissBaseline.test.ts` move in the same commit, and `BASELINE_NOTE` gains a line naming this spec.
- **AC-3.** No surviving row changes any field of its emission identity (`fixture`, `key`, `block`, `kind`, `candidate`).
- **AC-4.** The label-opener arm is pinned by an EXECUTED suite case that takes a real corpus quote-header block (the FinTech raw fixture's `Client:` block), optionally replaces only its opener cell, and runs the detector over it. Excluded, with no emission: the block as committed (opener `Client:`), and rebuilt with `CLIENT:` and with `Client:/Contact:`. Admitted, with its `Address:` row firing: rebuilt with `CLIENT`, with `TRANSPORTATION/Load In:`, and with a room-header opener carrying `TOTAL:` mid-string. Premises, stated executably (`tests/_shared/premise.ts`) on each case's own inputs: every REBUILT case's scanned opener differs from the source block's scanned opener (the as-committed case makes no such claim), and the `Address:` row matches the vocabulary and clears the guards, so "excluded by the arm" is distinguishable from "never matched". Spellings the scanner normalizes away before the detector sees them (a trailing space, which `scanRowsWithOpener` trims) are not block cases; `isLabelOpener` gets direct unit cases for them instead, alongside each block-case string.
- **AC-5.** The per-block census artifact (`tests/parser/__fixtures__/nearMissBlockCensus.json`) and its generator (`docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-block-census.ts`, which states the rule longhand) are regenerated with the new arm. The census diff is exactly the blocks of probe F.5, and the census test's family premises are re-derived, not retyped. No `venue`, `details` or transport block changes verdict.
- **AC-6.** The 2026-08-28 AC-4 case ("a narrow-minimum block stays a candidate even where the FIRING row is wide", `tests/parser/fieldNearMiss.test.ts`) currently uses the `Client:/Contact:` block as its witness, which this arm excludes. It moves to a witness block the arm admits that still has a narrow minimum and a wide firing row; if no such corpus block exists, the case builds one by widening one row of an admitted block and says so in its premise.
- **AC-7.** The detector stays bound to the predicate: the 2026-08-28 AC-10 case (inject a known near-miss row into every corpus block; the detector emits if and only if `isCandidateHome` admits the block) passes with the new arm, with its expected disagreement count re-derived.
- **AC-8.** `matchVocabulary`, `passesGuards`, `normalizeV3`, `fusedForm` and the consumption draw-down are unchanged (the existing structural pin stays green).
- **AC-9.** The source-mutation surface `fieldNearMiss` (`tests/mutation/source/registry.ts`, scoreFloor 0.95, all operators) scores at or above its floor with an empty unaccepted-survivor set. Its two line-keyed accepted rows are re-keyed if their lines move.

Part 2:

- **AC-10.** On every corpus fixture, `parseSheet` emits exactly one `VENUE_ADDRESS_MISSING` when the parsed `show.venue.name` is non-empty and `show.venue.address` is empty, and none otherwise. The expectation is computed from the parsed show in the test, never typed. Premise: at least one fixture fires (TABLE-D: `fixtures/shows/exporter-xlsx/fintech.md`, `fixed-income.md`, `rpas.md`) and at least one does not.
- **AC-11.** Unit cases on the emission seam: venue name with address `""` fires; address of only whitespace fires; non-empty address does not; empty venue name does not. The fired warning carries `severity: "warn"`, `blockRef.kind === "venue"`, no `blockRef.field`, and `rawSnippet` equal to the venue name, and `hasIgnorableSnippet` (`lib/dataQuality/ignorableSnippet.ts`) is true for it. A relabelled address row (`VENUE ADDRESS` renamed to `Street Address` in a corpus fixture) also fires, which is the case the copy's "or check its row label" exists for.
- **AC-12.** The notice never changes the payload. The emit helper takes the aggregator and the venue name string only, so it holds no reference to `show`. Pinned by a test that, on every firing fixture, the `show` from `parseSheet` deep-equals a `show` parsed from the same text with the helper mocked to a no-op.
- **AC-13.** `isQualityRegression(prior, current)` is false when `current` differs from `prior` only by one `VENUE_ADDRESS_MISSING` (the `gateExempt` contract, §4.4).
- **AC-14.** The registration set of §4.6 is complete: x1 catalog parity (`tests/cross-cutting/codes.test.ts`), the card-copy meta-test (`tests/messages/_metaWarningCardCopy.test.ts`), the gap-class partition (`tests/parser/dataGapsClassCompleteness.test.ts`), the error-catalog docs meta-test, the help-page grouping test and the warning-code anchor test all pass.
- **AC-15.** The notice routes to the Venue section: the section-routing helper (`lib/admin/step3SectionStatus.ts`) maps the warning to `venue`, asserted on the warning object AC-11 produces.

## 6. Testing

- `tests/parser/fieldNearMiss.test.ts` carries AC-4, AC-5, AC-6, AC-7 and AC-8. The cases that assert today's `Client:` / `Client:/Contact:` emissions as true positives are rewritten to assert exclusion, each with the premise that the row would have fired under the 2026-08-28 rule.
- `tests/parser/fieldNearMissBaseline.test.ts` carries AC-1 to AC-3.
- `tests/parser/candidateLabel.test.ts` case "preserves the SPELLING of every candidate the corpus actually produces" derives its spellings from the baseline with a premise of more than five distinct candidates; the regenerated baseline carries three (`Stage Size`, `Equipment Storage`, `DIagrams`). The case's purpose is that no normalization of a reported candidate survives, and the set of spellings the detector CAN report is the vocabulary's stored raw spellings, not today's emissions. It is re-derived from `buildVocabulary()` (`lib/parser/fieldNearMiss.ts`), whose raw spellings include `Client Phone`, `Backdrop / Scenic` and `DIagrams`, keeping its premise and its mixed-case witnesses.
- The guard-suppression cases in `tests/parser/fieldNearMiss.test.ts` that use the consultants `Client:/Contact:` block as a positive control (`fixtureTable(CONSULTANTS_RAW, …)`) move to a control block the arm admits.
- A new parser suite for the venue notice, beside the other suites under the parser tests directory, carries AC-10 to AC-12, and AC-15 at the routing seam.
- AC-13 joins the existing regression-gate suite (`tests/sync/quality-regressed-producer.test.ts` or `tests/parser/dataGaps.test.ts`, whichever already exercises `isQualityRegression` with `gateExempt` codes).
- AC-14 is the existing registry and meta suites, green.
- `tests/parser/venueSignalParity.test.ts` baseline regenerated and reviewed (§4.6 item 7).

Anti-tautology: every exclusion case pairs with a positive control in the same test that must still fire, and every corpus-derived count is read from the probe or computed in the test, never retyped.

## 7. Documented limits

Filed here rather than as ledger rows, per the 2026-08-25 process freeze. Each names the condition that would make it a real finding.

1. **A quote header whose opener carries no colon.** The arm keys on the opener's first segment ending in a colon. A quote header that opened on `CLIENT` or `Client` with no colon would be admitted, and its rows could fire as they do today. The consequence is today's behavior, not a new one. Every corpus and live quote header spells it `Client:`. Re-file trigger: a live sheet that produces a rename card from a quote-header block.
2. **A real field list that opens on a label.** A section whose first cell is a colon-terminated label (say `Venue:` above venue rows) would lose candidacy, so a genuine near-miss inside it would go unreported. No corpus block has that shape (§3.2: the arm's whole reach is the 10 blocks listed there). Re-file trigger: a corpus or live block that opens on a label and is read field by field by a section parser.
3. **Version-blind candidate spelling.** The detector's tie-break reports the first alias spelling in derivation order (`Client Phone`), which the v4 client parser does not read; v4 reads `Contact Cell` / `Contact Email` (`lib/parser/blocks/client.ts`, the `knownClientLabels` set). After part 1 no corpus row reaches this. Re-file trigger: a corpus or live row that fires inside a parser-read block with a candidate its template version does not read.
4. **An address that is present but wrong.** The notice tests blankness only. A venue address copied from the wrong block, or the client's office typed into `VENUE ADDRESS`, does not fire. Re-file trigger: a live sheet with a venue address that geocodes far from the venue name.
5. **No "Open in Sheet" link on the venue notice.** The notice carries no `sourceCell` and is not in `OPERATOR_ACTIONABLE_ANCHORED`, so its card has no cell link and it does not appear on the staged first-seen page, which lists only anchored codes (`app/admin/show/staged/[stagedId]/page.tsx`, `selectActionableForDisplay`). The anchor scanner already emits `VENUE ADDRESS` label anchors, but a v2 continuation row (`|  | VENUE ADDRESS |  |`) has a blank column 0 and resolves only to a tab anchor. Re-file trigger: Doug reports he could not find where to add the address.
6. **A misspelled `Event Name:` inside the quote header gets no card.** The title scan reads `Event Name:` out of the quote header into `show.title` (§3.2). A misspelling there would have been a candidate under the 2026-08-28 rule and is now in a withdrawn block. Re-file trigger: a live sheet whose title is lost to a misspelled `Event Name:` label in the quote header.

## 8. Non-goals

- A client-contact notice (§1.1 item 3).
- Any change to `UNKNOWN_FIELD` copy, its §12.4 row, or its gap class.
- Version-aware candidate spelling (§7 item 3).
- Reading or surfacing anything from the GEAR quote header.
- Grouping repeated warning rows in a review section into one counted row. That is a separate arc, started 2026-10-25 in its own session.
- A positive "a parser opens on this block" predicate. Refuted by measurement (§2.3).

## Dimensional Invariants

None. No component, layout or style is touched. The new notice renders through the existing catalog-driven cards.

## Transition Inventory

None. No component with multiple visual states is touched.
