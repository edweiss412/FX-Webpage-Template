/**
 * components/crew/sections/agendaRows.ts — the Agenda section's derivation,
 * shared by `AgendaSection` and the Agenda search builder
 * (lib/search/sections/agenda.ts), so the page and the search index describe the
 * same lines in the same order (spec §2.4, INV-1). Moved out of the Schedule
 * section's rows with the agenda itself (crew page redesign PR B, Task 10).
 *
 * One region, `none`: the Agenda panel card carries no card id (the agenda has
 * no sheet source link). Every line's group is the card's title, the registry
 * label, so a line and the heading that names it can never differ.
 *
 * A non-client module: the builder runs on the server and imports from here.
 */
import {
  agendaSessionLine,
  agendaTrackLine,
  structuredAgenda,
  type AgendaBlockSearch,
} from "@/components/crew/agendaScheduleRows";
import { addEntry, entrySink, scheduleVisibleDays } from "@/components/crew/sections/scheduleRows";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
import { driftNote } from "@/lib/agenda/agendaPaint";
import { visibleAgendaDaysForViewer, type ViewerAgendaDays } from "@/lib/crew/agendaViewerDays";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { DateRestriction } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";

/** The Agenda card's title, the group of every agenda line (region `none`). */
export const AGENDA_GROUP = showSection("agenda").label;

type AgendaLinkRow = ShowForViewer["show"]["agenda_links"][number];

/** One structured block as the section calls the shared `AgendaScheduleBlock`. */
export type AgendaPanelBlock = {
  /** The link's Drive file id: the block's key. */
  key: string;
  /** Raw `agenda_links[i].extracted`; the block narrows it at its own render boundary. */
  extraction: unknown;
  /** The per-document caption, shown only when there is more than one agenda PDF. */
  label: string | null;
  search: AgendaBlockSearch;
  /** Which of this extraction's days are the viewer's own (spec §2 of the fold design). */
  viewerDays: ViewerAgendaDays;
};

export type AgendaPanel = {
  /** Search target ids of the "View agenda" buttons, keyed by file id. */
  embedTargets: Record<string, string>;
  /** Aligned with `agenda_links`; null where a link renders no block. */
  blocks: (AgendaPanelBlock | null)[];
  entries: SearchEntry[];
};

/**
 * Everything the Agenda section renders, with its search entries: one "View
 * agenda" button per link with a Drive file id, whose document label is a line,
 * then per link with an extraction its structured block (document caption, each
 * day, each session with its tracks and drift note).
 *
 * The viewer's own days are derived once and handed to each block PER LINK (one
 * PDF can parse while another cannot, so no result is shared). A fault deriving
 * them (`getShowForViewer` casts `dates.showDays` rather than validating it)
 * fails the agenda OPEN: every day expands, nothing folds; the Schedule section,
 * which reads the same days, records the fault itself.
 *
 * The caller withholds the section from a viewer whose dates are suppressed.
 */
export function agendaPanel(data: ShowForViewer, dateRestriction: DateRestriction): AgendaPanel {
  const agendaLinks: readonly AgendaLinkRow[] = data.show.agenda_links;
  const sink = entrySink("agenda", "none");

  const embedTargets: Record<string, string> = {};
  for (const link of agendaLinks) {
    if (!link.fileId) continue;
    const badge = link.label ? agendaDisplayLabel(link.label) : null;
    const id = badge !== null ? addEntry(sink, { group: AGENDA_GROUP, value: badge }) : undefined;
    if (id !== undefined) embedTargets[link.fileId] = id;
  }

  let viewerDates: string[] = [];
  try {
    viewerDates = scheduleVisibleDays(data, dateRestriction).map((d) => d.date);
  } catch {
    viewerDates = [];
  }
  /** Raw restriction days; `restriction \ viewerDates` is the disagreement guard's input. */
  const restrictionDays = dateRestriction.kind === "explicit" ? dateRestriction.days : [];

  // Show a per-document label on the structured blocks only when there's more
  // than one agenda PDF (so two "View agenda" buttons + two schedules are
  // distinguishable — impeccable MEDIUM). A single agenda needs no badge.
  const agendaPdfCount = agendaLinks.filter((link) => Boolean(link.fileId)).length;
  const blocks = agendaLinks.map((link): AgendaPanelBlock | null => {
    if (!link.fileId || !link.extracted) return null;
    const label = agendaPdfCount > 1 ? agendaDisplayLabel(link.label) : null;
    const viewerDays: ViewerAgendaDays =
      dateRestriction.kind === "explicit"
        ? visibleAgendaDaysForViewer(link.extracted, viewerDates, restrictionDays)
        : { kind: "all" };
    const base = { key: link.fileId, extraction: link.extracted, label, viewerDays };
    const parsed = structuredAgenda(link.extracted);
    if (parsed === null) return { ...base, search: { days: [] } };
    const docLabel = label ? addEntry(sink, { group: AGENDA_GROUP, value: label }) : undefined;
    const days = parsed.days.map((day) => {
      const summary = addEntry(sink, {
        group: AGENDA_GROUP,
        value: day.dayLabel,
        context: [day.date],
      });
      const sessions = day.sessions.map((session) => {
        const line = agendaSessionLine(session);
        return addEntry(sink, {
          group: AGENDA_GROUP,
          label: line !== "" ? session.time : null,
          value: line !== "" ? line : session.time,
          context: [
            day.dayLabel,
            session.drift !== null ? driftNote(session.drift) : null,
            ...session.tracks.map(agendaTrackLine),
          ],
        });
      });
      return { ...(summary !== undefined ? { summary } : {}), sessions };
    });
    return { ...base, search: { ...(docLabel !== undefined ? { docLabel } : {}), days } };
  });
  return { embedTargets, blocks, entries: sink.entries };
}
