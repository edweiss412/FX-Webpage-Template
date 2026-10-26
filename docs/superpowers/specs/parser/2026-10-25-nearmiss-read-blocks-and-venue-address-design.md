# Near-miss cards only where a parser reads, and a missing-venue-address notice — design

**Status:** Draft
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

All three rows sit in the GEAR tab's rental-quote header: the "bill to" block above the gear table (`Client:`, `Contact:`, `Address:`, `Phone:`, `Cell Phone:`, `Fax:`, `E-mail:`, `ALT. E-mail:`, `Event Name:`, with `Date:` / `Event Date(s):` / `Venue:` / `Room(s):` / `Time(s):` on the right). No block parser reads it. The address is Institutional Investor's head office on every corpus instance, the phone is a desk line, and the email is sometimes a different person from the INFO contact.

Following the cards makes the show worse. Renaming `Address:` makes the client's New York office the venue address of a Chicago show. Renaming `Phone:` and `E-mail:` clears the cards and writes nothing, because the v4 client parser reads only `Contact Cell` / `Contact Office` / `Contact Email`. On the older consultants layout the same renames overwrite the real client contact. §2 has the measurements.

Meanwhile the gap that does reach crew gets no signal: INFO's `VENUE ADDRESS` is blank, so the crew page shows Kimpton Gray with an empty Address row (`components/crew/sections/VenueSection.tsx`, the `"Address"` entry built from `streetFromAddress(venue.address, venueCity)`).

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

## 5. Part 2: the missing-venue-address notice (normative)

One new warn-severity, non-blocking `ParseWarning` code, `VENUE_ADDRESS_MISSING`. It reads the PARSED show after `parseVenue` has run, never the raw rows. The property it reports is "the crew page will show this venue with no street address", and that is a property of the output. Keying it on input row shapes would re-open the label-spelling and template-version questions part 1 exists to close: the address label is `VENUE ADDRESS` on v2 and v4 sheets and `Hotel Address` on the v1 East Coast sheet (`lib/parser/aliases.ts`, the `"venue.address"` entry).

### 5.1 Condition

Emitted at most once per show, when the parsed `show.venue.name` is non-empty after trimming AND `show.venue.address` is empty after trimming. `ShowRow.venue.address` is a `string` (`lib/parser/types.ts`, `ShowRow`), set to `""` when no address row carries a value (`lib/parser/blocks/venue.ts`, `const venueAddress = address ?? ""`). A show with no venue name emits nothing.

### 5.2 What the notice never does

- It never writes to the parsed show. The payload with and without the notice is byte-identical.
- It never suggests a value, and never reads the GEAR quote header (§1.1 item 4).
- It never blocks publishing. Severity is warn.
</content>
</invoke>
