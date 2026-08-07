/**
 * The one place the "this viewer must not see dates" rule is spelled.
 *
 * WHY A NAMED PREDICATE FOR A ONE-LINE COMPARISON. `dateRestriction.kind ===
 * "unknown_asterisk"` was written out at six sites before this module existed,
 * and BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES is a seventh site where somebody
 * simply did not write it — the Tonight card leaked a hotel check-in date, which
 * is the travel-in date, to a viewer whose whole point is that their days are
 * unconfirmed. A literal repeated at seven sites is not a single source; it is
 * seven independent chances to forget one, and forgetting is silent.
 *
 * WHAT IT MEANS, so a later reader does not have to reconstruct it from the
 * enum. `unknown_asterisk` is the parsed `***` marker: the sheet says this crew
 * member is on SOME subset of days and does not say which.
 *
 * WHERE IT IS APPLIED — an exact list, because the obvious summary is FALSE.
 * An earlier version of this comment said "every date-bearing surface therefore
 * shows nothing", and cross-model review disproved it by rendering the page:
 *   - agenda days (`lib/crew/agendaDisplay.ts`) — gated
 *   - key-times strip (`lib/crew/resolveKeyTimes.ts`) — gated
 *   - schedule day derivation (`components/crew/sections/ScheduleSection.tsx`) — gated
 *   - the Today Tonight card's check-in/check-out rows — gated
 *   - TravelSection's ground-transport leg dates — gated (arc A)
 *   - TravelSection's hotel check-in/check-out rows — gated (arc A)
 *   - TravelSection's personal flight block — gated (arc A): the structured date,
 *     its `dateRaw` fallback arm, the Today/Next chip, the upcoming-row highlight
 *     (the same claim rendered as styling), and raw-fallback rows, which are
 *     WITHHELD ENTIRELY because `seg.raw` cannot be split into date and non-date
 *     parts. Every visibility derivation downstream (leg retention, hotels
 *     presence, `showFlight`, the section empty state) consumes the
 *     POST-suppression sets, so a suppressed viewer never gets a blank row, an
 *     empty card, or section chrome wrapping nothing.
 *
 * This list is the inventory of record: a NEW date-rendering surface adds itself
 * here (review-time discipline, not a guard).
 *
 * NOT GATED, deliberately:
 *   - The crew roster's partial-attendance label, which prints a PEER's
 *     attendance. Owner ruling 2026-08-06 (arc A spec §1.1 item 1, Option A):
 *     exact days stay visible to every viewer because crew coordination wins
 *     over the peer's day privacy. Not an oversight and not a leak — the marker's
 *     semantics are "which days YOU work is unconfirmed", and a peer's days are
 *     not the viewer's schedule. Re-open trigger: the owner revisits the call.
 *   - TravelSection's sheet-authored free text — `transportNotes`, `hotelAddress`,
 *     and the hotel `stayRows` values. These are prose fields, not date fields; a
 *     date an author types into one is editorial content the operator chose to
 *     write, not the system asserting the viewer's schedule. Arc A §4 limit 8.
 *     Re-open trigger: a real leak report through one of these fields.
 *
 * The SHOW's own date is deliberately not on that list. `unknown_asterisk` means
 * "which days you work is unconfirmed", not "the show's dates are secret" — the
 * header date is on the link the viewer arrived through, so suppressing it would
 * remove necessary context and protect nothing. The question is dates that imply
 * the VIEWER's schedule, which is narrower than "any rendered date". Raised and
 * refuted in cross-model R4; recorded on the backlog entry so it stays settled.
 *
 * A predicate is not a policy. This function answers "does this viewer's
 * restriction mean dates must be withheld"; whether a given surface ASKS is a
 * property of that surface, and the list above is the only honest way to say
 * which ones currently do.
 *
 * NOT THE SAME AS "restricted". An `explicit` viewer has CONFIRMED days, so
 * there is nothing to protect and every date surface renders normally, filtered
 * to their days. A gate written as "any restriction" would hide dates from the
 * people who need them most, which is why the predicate names the ONE kind
 * rather than negating `none`.
 */
import type { DateRestriction } from "@/lib/parser/types";

export function suppressesDates(restriction: DateRestriction): boolean {
  return restriction.kind === "unknown_asterisk";
}
