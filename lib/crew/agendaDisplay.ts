/**
 * lib/crew/agendaDisplay.ts — shared run-of-show display predicates + day
 * aggregation, extracted verbatim from ScheduleSection.tsx so the crew Today
 * surface (Task 9) and the Schedule surface (Task 3) key off the SAME
 * "is this entry displayable" trust boundary and the SAME day aggregate.
 *
 * This is the single source of truth for "is this entry renderable" and for
 * "what are the show days" — duplicating either predicate would let the
 * Today/Schedule privacy contracts drift apart.
 */
import type { AgendaEntry, DateRestriction, ShowAnchor, ShowRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

/** §4.3 / D-6 display cap: render at most this many entries per day. */
export const RUN_OF_SHOW_DISPLAY_CAP = 20;
/** §4.3 / D-6: title display-truncation threshold (chars). */
export const TITLE_TRUNCATE_AT = 80;

/**
 * Resolve an optional agenda field for display: URL-strip it, then hide it if
 * the residue is a generic sentinel ('' / TBD / N/A / TBA). Returns null when
 * the field should not render (the entry still renders iff its title is real,
 * which the parser/decoder already guarantee).
 */
export function resolveOptionalField(value: string | undefined): string | null {
  if (value == null) return null;
  const stripped = stripAgendaUrls(value);
  if (shouldHideGenericOptional(stripped)) return null;
  return stripped;
}

/**
 * The parser/decoder prove the title REAL on the RAW value — but a raw title can
 * be a URL (non-empty, non-sentinel → it passes both gates), and stripAgendaUrls
 * reduces a URL-only title to "". So RE-validate the title AFTER stripping: an
 * entry whose stripped title is empty-or-sentinel is NOT displayable (it would
 * otherwise render a blank agenda-entry row). This is the single source of truth
 * for "is this entry renderable" — both the per-day mode gate and RunOfShowList
 * filter through it, so the mode/container key off the DISPLAYABLE count, not the
 * raw stored count.
 */
export function isDisplayableEntry(entry: AgendaEntry): boolean {
  return !shouldHideGenericOptional(stripAgendaUrls(entry.title));
}

/** The entries of a day that actually render (stripped-title-real), sheet order. */
export function displayableEntries(entries: AgendaEntry[] | undefined): AgendaEntry[] {
  return (entries ?? []).filter(isDisplayableEntry);
}

export type SchedulePhase = "Travel In" | "Set" | "Show" | "Travel Out";

export type AggregateDay = {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Phase tag — what's happening on this day. */
  phase: SchedulePhase;
};

/**
 * Aggregate ShowRow.dates into a chronological list of (date, phase) rows,
 * deduped by date (first phase in the workflow wins), sorted ASC by ISO date.
 * Ported verbatim from ScheduleTile.tsx:93-107.
 */
export function aggregateDays(dates: ShowRow["dates"]): AggregateDay[] {
  const seen = new Map<string, SchedulePhase>();
  const push = (date: string | null, phase: SchedulePhase): void => {
    if (!date) return;
    if (!seen.has(date)) seen.set(date, phase);
  };
  push(dates.travelIn, "Travel In");
  push(dates.set, "Set");
  for (const d of dates.showDays ?? []) push(d, "Show");
  push(dates.travelOut, "Travel Out");
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, phase]) => ({ date, phase }));
}

/**
 * §contract: visibleShowDays = show.dates.showDays ∩ DateRestriction.
 * explicit → listed days (filtered through showDays, so order = showDays ASC,
 * never restriction order); none → all showDays; unknown_asterisk → [].
 * SINGLE SOURCE — ScheduleSection's day-list intersection AND resolveKeyTimes'
 * per-day Show iteration both route here (agendaDisplay-single-source guard).
 */
export function visibleShowDays(
  dates: Pick<ShowRow["dates"], "showDays">,
  dateRestriction: DateRestriction,
): string[] {
  const showDays = dates.showDays ?? [];
  if (dateRestriction.kind === "unknown_asterisk") return [];
  if (dateRestriction.kind === "explicit") {
    const allowed = new Set(dateRestriction.days);
    return showDays.filter((d) => allowed.has(d));
  }
  return [...showDays]; // none
}

/** §5.3 bare-window DayCard meta: '7:30am–5:50pm'. Sentinel-guarded both ends → null. */
export function formatScheduleWindow(window: { start: string; end: string } | null): string | null {
  if (window == null) return null;
  if (resolveOptionalField(window.start) == null) return null;
  if (resolveOptionalField(window.end) == null) return null;
  return `${window.start}–${window.end}`;
}

/** §5.4 Today filter: only the Show anchor(s) whose date === today's ISO. */
export function todayShowAnchors(anchors: ShowAnchor[], todayIso: string): ShowAnchor[] {
  return anchors.filter((a) => a.date === todayIso);
}
