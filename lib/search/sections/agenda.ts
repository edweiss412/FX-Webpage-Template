import { hasAgendaFile } from "@/components/crew/agendaScheduleRows";
import { agendaPanel } from "@/components/crew/sections/agendaRows";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Agenda search entries (spec §4), in render order: each "View agenda" button's
 * document label, then each structured block's caption, days and sessions.
 * Mirrors `AgendaSection` through the same rows module
 * (components/crew/sections/agendaRows.ts). The agenda's lines were Schedule's
 * until the crew page redesign PR B, Task 10, moved the agenda to its own section.
 *
 * - A viewer whose dates are suppressed is not entitled to the section: no entries.
 * - With no agenda link carrying a file the section shows only its empty state.
 * - The whole section is one `WrappedSection`: a fault in its derivation renders
 *   the fallback, so this builder contributes no entry.
 */
export function buildAgendaEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  // Outside the boundary, as in the section: a malformed projection throws.
  const { dateRestriction } = resolveViewerContext(viewer, data);
  if (suppressesDates(dateRestriction)) return [];
  if (!hasAgendaFile(data.show.agenda_links)) return [];
  try {
    return agendaPanel(data, dateRestriction).entries;
  } catch {
    // The section renders its TileErrorFallback, which holds no line.
    return [];
  }
}
