import {
  keyTimeEntries,
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
 * Schedule search entries (spec §4), in render order: the day cards with their
 * run of show, the Crew Schedule key times. Mirrors `ScheduleSection` through the
 * same rows module (components/crew/sections/scheduleRows.ts). The agenda's lines
 * are the Agenda section's (lib/search/sections/agenda.ts) since it moved there
 * (crew page redesign PR B, Task 10).
 *
 * - An `unknown_asterisk` viewer sees only the unconfirmed message: no entries.
 * - The day cards and the key-times card share one `WrappedSection`: a fault in
 *   their derivation renders the fallback, so this builder contributes no entry.
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

  try {
    const visibleDays = scheduleVisibleDays(data, dateRestriction);
    const todayIso = todayIsoInShowTimezone(data.show, today);
    return [
      ...scheduleDayRows({ data, visibleDays, todayIso, transportVisible }).entries,
      ...keyTimeEntries("schedule", SCHEDULE_CALL_TIMES_REGION, SCHEDULE_CALL_TIMES_TITLE, anchors)
        .entries,
    ];
  } catch {
    // The section renders this block's TileErrorFallback, which holds no line.
    return [];
  }
}
