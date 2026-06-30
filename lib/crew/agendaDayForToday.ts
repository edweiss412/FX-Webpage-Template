import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import type { AgendaDay, AgendaExtraction, AgendaSession } from "@/lib/agenda/types";
import { clockToMinutes } from "@/lib/time/clockToMinutes";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Parse a date-bearing dayLabel ("Tuesday, March 2 4 , 202 6") → ISO, else null.
 *  Collapses glyph-split digits FIRST (pdfjs emits "2 4"/"202 6"); validated
 *  against all 6 live agenda PDFs. Month match is EXACT (full or abbr), not prefix. */
export function parseIsoFromDayLabel(dayLabel: string): string | null {
  const collapsed = dayLabel.replace(/(?<=\d)\s+(?=\d)/g, "");
  const m = collapsed.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase().replace(/\.$/, "")];
  if (!month) return null;
  return `${m[3]}-${pad2(month)}-${pad2(Number(m[2]))}`;
}

/** Today's PLACEABLE agenda sessions, aggregated across ALL high-confidence links.
 *  `extracted` is raw JSONB → normalized at the boundary (mirrors AgendaScheduleBlock). */
export function agendaSessionsForToday(
  agendaLinks: { extracted?: unknown }[] | null | undefined,
  showDays: string[],
  todayIso: string,
): AgendaSession[] {
  const out: AgendaSession[] = [];
  for (const link of agendaLinks ?? []) {
    const extN = normalizeAgendaExtraction(link.extracted);
    if (!extN || extN.confidence !== "high" || extN.days.length === 0) continue;
    const ext: AgendaExtraction = extN;
    let matched: AgendaDay | null = null;
    let someDateParsed = false;
    for (const day of ext.days) {
      const iso = parseIsoFromDayLabel(day.dayLabel);
      if (iso) someDateParsed = true;
      if (iso === todayIso && matched === null) matched = day;
    }
    if (
      matched === null &&
      !someDateParsed &&
      showDays.length > 0 &&
      showDays.every((d) => d != null) &&
      ext.days.length === showDays.length
    ) {
      const idx = showDays.indexOf(todayIso);
      if (idx >= 0) matched = ext.days[idx]!;
    }
    if (matched) {
      for (const s of matched.sessions) {
        if (clockToMinutes(s.time) !== null) out.push(s);
      }
    }
  }
  return out;
}
