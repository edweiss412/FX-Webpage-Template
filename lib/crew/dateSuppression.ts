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
 * member is on SOME subset of days and does not say which. Every date-bearing
 * surface therefore shows nothing rather than guessing — the agenda renders no
 * days (`lib/crew/agendaDisplay.ts`), the key-times strip resolves to `{}`
 * (`lib/crew/resolveKeyTimes.ts`), the schedule skips day derivation entirely
 * (`components/crew/sections/ScheduleSection.tsx`), and now the Tonight card
 * drops its check-in/check-out rows.
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
