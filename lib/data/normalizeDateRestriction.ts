/**
 * lib/data/normalizeDateRestriction.ts — projection-boundary helper
 * (Codex round-23 HIGH closure).
 *
 * Why this exists:
 *
 *   The parser extracts explicit date restrictions as raw `M/D`
 *   tokens — e.g., a "(6/24) ONLY" cell yields
 *   `{ kind: "explicit", days: ["6/24"] }`. The DB stores those
 *   tokens verbatim (date_restriction is jsonb). Downstream
 *   consumers (ScheduleTile.aggregateDays / its `allowed.has(d.date)`
 *   filter, RightNow viewer-aware state machine) compare these
 *   tokens against ISO `YYYY-MM-DD` show dates. Format mismatch =>
 *   restricted crew sees zero matching days => ScheduleTile renders
 *   the required-field placeholder + RightNow can't resolve the
 *   viewer-aware ladder against the right calendar.
 *
 *   Normalize at the projection boundary so every UI consumer sees
 *   ISO dates regardless of what's persisted. The DB / parser
 *   format stays untouched.
 *
 * Algorithm:
 *
 *   - kind 'none' / 'unknown_asterisk': pass through.
 *   - kind 'explicit':
 *     - Already ISO YYYY-MM-DD token: pass through.
 *     - M/D token: expand to ${showYear}-${MM}-${DD} using the show's
 *       calendar year (derived from showDays[0] then travelIn then
 *       travelOut).
 *     - Anything else: drop.
 *
 *   Year disambiguation: most shows are single-year. Cross-year shows
 *   pick the year whose nearest ISO candidate is closest in calendar
 *   days.
 */
import type { DateRestriction, ShowRow } from "@/lib/parser/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const M_D_PATTERN = /^(\d{1,2})\/(\d{1,2})$/;

function resolveShowYear(dates: ShowRow["dates"]): number | null {
  const candidates: Array<string | null | undefined> = [
    dates.showDays?.[0] ?? null,
    dates.travelIn,
    dates.travelOut,
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    if (!ISO_DATE_PATTERN.test(c)) continue;
    const year = Number.parseInt(c.slice(0, 4), 10);
    if (Number.isFinite(year)) return year;
  }
  return null;
}

function pickYearForMonthDay(month: number, day: number, dates: ShowRow["dates"]): number | null {
  const isoCandidates: string[] = [];
  if (typeof dates.travelIn === "string" && ISO_DATE_PATTERN.test(dates.travelIn)) {
    isoCandidates.push(dates.travelIn);
  }
  if (typeof dates.travelOut === "string" && ISO_DATE_PATTERN.test(dates.travelOut)) {
    isoCandidates.push(dates.travelOut);
  }
  for (const d of dates.showDays ?? []) {
    if (typeof d === "string" && ISO_DATE_PATTERN.test(d)) {
      isoCandidates.push(d);
    }
  }
  if (isoCandidates.length === 0) return null;

  const years = Array.from(
    new Set(isoCandidates.map((d) => Number.parseInt(d.slice(0, 4), 10))),
  ).filter((n) => Number.isFinite(n));
  if (years.length === 0) return null;
  if (years.length === 1) return years[0]!;

  // Multi-year span. Prefer exact match.
  const mm = month.toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  for (const y of years) {
    const candidateIso = `${y}-${mm}-${dd}`;
    if (isoCandidates.includes(candidateIso)) return y;
  }
  // No exact match: pick the year whose nearest ISO candidate is
  // closest in calendar days.
  let bestYear: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const y of years) {
    const candidateMs = Date.parse(`${y}-${mm}-${dd}`);
    if (!Number.isFinite(candidateMs)) continue;
    for (const iso of isoCandidates) {
      const isoMs = Date.parse(iso);
      if (!Number.isFinite(isoMs)) continue;
      const diff = Math.abs(candidateMs - isoMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestYear = y;
      }
    }
  }
  return bestYear;
}

export function normalizeDateRestriction(
  restriction: DateRestriction,
  dates: ShowRow["dates"],
): DateRestriction {
  if (restriction.kind !== "explicit") return restriction;

  const fallbackYear = resolveShowYear(dates);
  const normalized: string[] = [];
  for (const token of restriction.days) {
    if (typeof token !== "string") continue;
    if (ISO_DATE_PATTERN.test(token)) {
      normalized.push(token);
      continue;
    }
    const md = M_D_PATTERN.exec(token);
    if (md) {
      const month = Number.parseInt(md[1]!, 10);
      const day = Number.parseInt(md[2]!, 10);
      if (
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
      ) {
        continue;
      }
      const year = pickYearForMonthDay(month, day, dates) ?? fallbackYear;
      if (year === null) continue;
      const mm = month.toString().padStart(2, "0");
      const dd = day.toString().padStart(2, "0");
      normalized.push(`${year}-${mm}-${dd}`);
      continue;
    }
  }
  return { kind: "explicit", days: normalized };
}
