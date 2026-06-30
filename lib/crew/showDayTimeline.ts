import type { AgendaSession } from "@/lib/agenda/types";
import type { AgendaEntry } from "@/lib/parser/types";
import { clockToMinutes } from "@/lib/time/clockToMinutes";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

export type TimelineItem =
  | { source: "crew"; entry: AgendaEntry; minutes: number | null }
  | { source: "agenda"; session: AgendaSession; minutes: number | null };

/** stripAgendaUrls already collapses whitespace + trims (agendaUrls.ts:44-45). */
const normTitle = (s: string | null): string => stripAgendaUrls(s ?? "").toLowerCase();

/** Merge crew run-of-show entries (already per-viewer gated) with today's agenda
 *  sessions (already day-matched + placeable) into one chronological, deduped list.
 *  Dedup is crew-wins, exact (minute + normalized title); sort is stable, crew-first on ties;
 *  crew entries with an unparseable start sort last (sheet order preserved). */
export function buildShowDayTimeline(
  crewEntries: AgendaEntry[],
  agendaSessions: AgendaSession[],
): TimelineItem[] {
  const crew: TimelineItem[] = crewEntries.map((entry) => ({
    source: "crew",
    entry,
    minutes: clockToMinutes(entry.start),
  }));
  // Dedup key = minutes + normalized title. JSON.stringify gives a collision-proof,
  // text-safe key (a tuple boundary cannot be forged by a title containing a delimiter).
  const crewKeys = new Set(
    crew
      .filter((c) => c.minutes !== null)
      .map((c) =>
        JSON.stringify([c.minutes, normTitle((c as { entry: AgendaEntry }).entry.title)]),
      ),
  );
  const agenda: TimelineItem[] = [];
  for (const session of agendaSessions) {
    const minutes = clockToMinutes(session.time);
    if (minutes === null) continue; // defensive (caller already filtered)
    if (crewKeys.has(JSON.stringify([minutes, normTitle(session.title)]))) continue; // dedup, crew wins
    agenda.push({ source: "agenda", session, minutes });
  }
  const items = [...crew, ...agenda];
  // Stable sort by minutes asc; nulls last; crew before agenda on ties.
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const am = a.item.minutes;
      const bm = b.item.minutes;
      if (am === null && bm === null) return a.i - b.i;
      if (am === null) return 1;
      if (bm === null) return -1;
      if (am !== bm) return am - bm;
      const srcRank = (s: TimelineItem["source"]) => (s === "crew" ? 0 : 1);
      const sr = srcRank(a.item.source) - srcRank(b.item.source);
      return sr !== 0 ? sr : a.i - b.i;
    })
    .map(({ item }) => item);
}
