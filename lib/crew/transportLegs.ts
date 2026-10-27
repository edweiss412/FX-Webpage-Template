/**
 * lib/crew/transportLegs.ts — the ground-transport legs the Travel section shows.
 *
 * One rule for the Travel section's leg list and the "All sections" Travel peek
 * (crew page redesign spec §4.6: a peek reads only what its section renders, through
 * the same gate), so the peek's ride count can never disagree with the list.
 */
import type { TransportScheduleEntry } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type VisibleTransportLeg = {
  stage: string | null;
  date: string | null;
  time: string | null;
  assignedNames: string[];
};

/**
 * Per-leg sentinel hiding: each schedule leg's `stage` / `date` / `time` is a
 * generic-optional free-text field — a sentinel ('TBD' / 'N/A' / 'TBA' / '')
 * reflows out here, never reaching the bold `tprimary` / eyebrow / meta.
 * (`assigned_names` is a string[]; empties are already filtered upstream in the
 * projection.) A leg with NO surviving real field (no stage, no date, no time, no
 * names) is dropped entirely so the list never shows an empty row.
 */
export function visibleTransportLegs(
  schedule: readonly TransportScheduleEntry[],
  hideDates: boolean,
): VisibleTransportLeg[] {
  return schedule.flatMap((leg) => {
    const stage = !shouldHideGenericOptional(leg.stage) ? leg.stage : null;
    // LEAK SITE 1. Withheld before the retention check below, so a leg whose only
    // content WAS its date leaves the list rather than rendering an empty row —
    // and `dateIsPrimary` (which mounts the <time dateTime=…>, itself the leak) is
    // false by construction.
    const date = hideDates || shouldHideGenericOptional(leg.date) ? null : leg.date;
    const time = !shouldHideGenericOptional(leg.time) ? leg.time : null;
    // The projection preserves schedule members unvalidated, so a blank or
    // corrupt assignee can reach here. It renders as an empty "With " label — not
    // visible content, and therefore not something that may keep a date-emptied
    // row alive. Sanitized ONLY under suppression so every other viewer's output
    // stays byte-identical to today's.
    const assignedNames = hideDates
      ? leg.assigned_names.filter((n) => typeof n === "string" && n.trim().length > 0)
      : leg.assigned_names;
    // No surviving real content → omit the whole leg.
    if (stage === null && date === null && time === null && assignedNames.length === 0) {
      return [];
    }
    return [{ stage, date, time, assignedNames }];
  });
}
