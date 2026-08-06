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
 *   - the Today Tonight card's check-in/check-out rows — gated (this change)
 *
 * NOT GATED, and each is a real date reaching a viewer whose days are
 * unconfirmed: TravelSection's ground-transport leg dates, its hotel
 * check-in/check-out rows, and the personal flight line; plus the crew roster's
 * partial-attendance label, which prints a PEER's explicit days. Filed with the
 * rendering probe as `BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK`. They predate this
 * predicate and sit outside the ratified scope of the Today change (spec §1.1),
 * so they are documented rather than silently implied to be handled.
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
