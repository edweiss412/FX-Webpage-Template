import {
  keyTimeEntries,
  scheduleAgendaRows,
  scheduleDayRows,
  scheduleVisibleDays,
  SCHEDULE_CALL_TIMES_REGION,
  SCHEDULE_CALL_TIMES_TITLE,
} from "@/components/crew/sections/scheduleRows";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

/**
 * Schedule search entries (spec §4), in render order: the agenda area, the day
 * cards with their run of show, the Crew Schedule key times. Mirrors
 * `ScheduleSection` through the same rows module (components/crew/sections/scheduleRows.ts).
 *
 * - An `unknown_asterisk` viewer sees only the unconfirmed message: no entries.
 * - The agenda is outside every error boundary in the section, so a fault there
 *   throws here too, as it does in the render.
 * - The day cards and the key-times card share one `WrappedSection`: a fault in
 *   their derivation renders the fallback, so this builder contributes no entry
 *   for either and keeps the agenda's.
 */
export function buildScheduleEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
  // Outside every boundary in the section, as there: a malformed projection throws.
  const { dateRestriction, isAdmin, stageRestriction } = resolveViewerContext(viewer, data);
  if (suppressesDates(dateRestriction)) return [];

  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin,
  });
  const anchors = resolveKeyTimes(
    data.show,
    data.rooms,
    data.runOfShow,
    dateRestriction,
    stageRestriction,
  );

  const agenda = scheduleAgendaRows(data.show.agenda_links).entries;

  let days: SearchEntry[] = [];
  try {
    const visibleDays = scheduleVisibleDays(data, dateRestriction);
    const todayIso = todayIsoInShowTimezone(data.show, today);
    days = [
      ...scheduleDayRows({ data, visibleDays, todayIso, transportVisible }).entries,
      ...keyTimeEntries("schedule", SCHEDULE_CALL_TIMES_REGION, SCHEDULE_CALL_TIMES_TITLE, anchors)
        .entries,
    ];
  } catch {
    // The section renders this block's TileErrorFallback, which holds no line.
    days = [];
  }
  return [...agenda, ...days];
}
