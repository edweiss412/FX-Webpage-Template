/**
 * lib/crew/stageSchedule.ts — fold a crew member's `stage_restriction` into an
 * effective viewer-facing `date_restriction` so a stage-restricted crew (e.g.
 * "- Load In / Set / Strike / Load Out ONLY***") sees only the days on which they
 * work a phase they're assigned to. Applied once at the getShowForViewer
 * projection chokepoint; all downstream `dateRestriction` consumers narrow with
 * no edit. See docs/superpowers/specs/schedule/2026-07-03-stage-filtered-schedule.md.
 */
import type { DateRestriction, StageRestriction, ShowRow, WorkPhase } from "@/lib/parser/types";
import { aggregateDays, type SchedulePhase } from "@/lib/crew/agendaDisplay";

// Each aggregate-day phase tag maps to the WorkPhases that day represents. Unioned
// with the show's per-date schedule_phases so a compound Show+Strike day (the last
// show day, per deriveSchedulePhases) is correctly "worked" by a Strike crew, and
// the travel-in day (which has no schedule_phases entry) is bound to the front-end.
const PHASE_TAG_WORKPHASES: Record<SchedulePhase, WorkPhase[]> = {
  "Travel In": ["Load In", "Set"],
  Set: ["Set", "Load In"],
  Show: ["Show"],
  "Travel Out": ["Load Out"],
};

/** True iff the crew works at least one phase occurring on this aggregate day. */
export function stageWorksDay(
  aggregateDay: { date: string; phase: SchedulePhase },
  schedulePhases: Record<string, WorkPhase[]>,
  stageRestriction: StageRestriction,
): boolean {
  if (stageRestriction.kind === "none") return true;
  const phases = new Set<WorkPhase>([
    ...(schedulePhases[aggregateDay.date] ?? []),
    ...PHASE_TAG_WORKPHASES[aggregateDay.phase],
  ]);
  const stages = new Set<WorkPhase>(stageRestriction.stages);
  for (const p of phases) if (stages.has(p)) return true;
  return false;
}

/**
 * Fold a stage restriction into an effective viewer-facing date restriction.
 * Returns the input `dateRestriction` unchanged when there is no stage
 * restriction (the dominant path). When a stage restriction IS present it is the
 * authoritative signal: worked days are computed from the show's aggregate days,
 * overriding a stored `none` (post-parser-fix) OR a legacy stored
 * `unknown_asterisk` (rows the current parser persisted before the guard shipped)
 * — so the fix lands without a DB backfill or forced resync.
 */
export function effectiveViewerDateRestriction(
  dates: ShowRow["dates"],
  schedulePhases: Record<string, WorkPhase[]>,
  dateRestriction: DateRestriction,
  stageRestriction: StageRestriction,
): DateRestriction {
  if (stageRestriction.kind === "none") return dateRestriction;

  const workedDays = aggregateDays(dates)
    .filter((d) => stageWorksDay(d, schedulePhases, stageRestriction))
    .map((d) => d.date);

  if (dateRestriction.kind === "explicit") {
    // Rare defensive combo (parsed dates AND a stage restriction): intersect.
    const worked = new Set(workedDays);
    return { kind: "explicit", days: dateRestriction.days.filter((d) => worked.has(d)) };
  }
  // kind "none" (new parser) OR "unknown_asterisk" (legacy row) → stage is authoritative.
  return { kind: "explicit", days: workedDays };
}
