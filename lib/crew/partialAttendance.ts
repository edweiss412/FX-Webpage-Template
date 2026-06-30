import type { DateRestriction } from "@/lib/parser/types";
import { humanizeDayList } from "@/lib/dates/humanize";

/**
 * Chip label for a crew member's partial-attendance restriction, or null when
 * there's nothing to show. One source of truth for the crew roster
 * (humanize=true — ISO days → "Oct 7 & 9 only") and the Step-3 review modal
 * (humanize=false — raw "M/D" tokens shown as-parsed → "10/7, 10/9 only").
 * (BL-CREW-PARTIAL-ATTENDANCE-CHIP)
 */
export function partialAttendanceLabel(
  restriction: DateRestriction | null | undefined,
  opts: { humanize: boolean },
): string | null {
  if (!restriction || restriction.kind === "none") return null;
  if (restriction.kind === "unknown_asterisk") return "Partial (dates TBD)";
  const days = (restriction.days ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
  if (days.length === 0) return null;
  const list = opts.humanize ? humanizeDayList(days) : days.join(", ");
  return list ? `${list} only` : null;
}
