/**
 * §04 SHOW DAY TIME column tokenizer — permissive clock-boundary parser.
 *
 * Reads the 5th column (TIME/AGENDA) from SHOW DAY rows in the DATES block and
 * extracts per-day schedule anchors: showStart, bare window, and titled entries.
 *
 * PERMISSIVE form (this module): no-colon bare-hour (`4pm`), semicolon-typo
 * separator (`5;30pm`), AM/PM casing variants — all accepted. Deliberately
 * distinct from the SET-row colon-required extractClockTimes (dates.ts).
 */

import type { AgendaEntry, ParseWarning, RunOfShow, ScheduleDay, ShowRow } from "../types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { scheduleTimeUnparsed } from "./agendaWarnings";
import { parseTableRows, clean, normalizeDate } from "./_helpers";

// ── Clock tokenizer ────────────────────────────────────────────────────────────

// SHOW-DAY-ONLY permissive clock: colon OR semicolon-typo separator OR bare hour.
// Requires either minutes OR an AM/PM suffix (or both) — bare integers not clocks.
const CLOCK_RE = /\b(\d{1,2})(?:[:;](\d{2}))?\s*([AaPp][Mm])?\b/g;

// Terminal-event words: entries with these titles do NOT promote showStart.
// Excludes clos* intentionally (per spec).
const TERMINAL_RE =
  /\b(conclude|concludes|concluded|ends?|ended|adjourn|wrap|dismiss|load\s*out|strike|depart)\b/i;

// Placeholder sentinels: presence of these in the lead prefix means
// the first clock is NOT a leading start (e.g. "GS: ... - 6:00 PM").
const PLACEHOLDER_RE = /(\.\.\.|\bTBD\b|\bTBA\b|\bN\/A\b)/i;

type Tok = { raw: string; start: number; end: number; norm: string };

/**
 * Normalize a clock match to display form.
 * Preserves spacing between the numeric portion and the AM/PM suffix exactly
 * as it appeared in the source (so "8:00 AM" stays "8:00 AM", not "8:00AM"),
 * but uppercases the AM/PM suffix and strips the leading zero from the hour.
 */
function normClock(
  h: string,
  m: string | undefined,
  ap: string | undefined,
  rawMatch: string,
): string {
  const mm = m ? `:${m}` : "";
  const numericPart = `${parseInt(h, 10)}${mm}`;
  if (!ap) return numericPart;
  // Preserve the whitespace that appeared between digits and AM/PM in the source.
  const spaceMatch = rawMatch.match(/\d([ \t]*)([AaPp][Mm])$/);
  const spacer = spaceMatch ? spaceMatch[1] : "";
  return `${numericPart}${spacer}${ap.toUpperCase()}`;
}

function tokenize(cell: string): Tok[] {
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  CLOCK_RE.lastIndex = 0;
  while ((m = CLOCK_RE.exec(cell)) !== null) {
    // bare integer with neither minutes nor am/pm = not a clock
    if (!m[2] && !m[3]) continue;
    toks.push({
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
      norm: normClock(m[1]!, m[2], m[3], m[0]),
    });
  }
  return toks;
}

/** Extract the text between two positions, stripping a leading separator. */
function titleAfter(cell: string, from: number, to: number): string {
  return cell
    .slice(from, to)
    .replace(/^\s*[-–:]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── DATES block row reader ─────────────────────────────────────────────────────

/**
 * Walk the DATES block and return [{iso, raw}] for every SHOW DAY row,
 * using the same normalization parseDates uses for showDays.
 */
function readShowDayTimeCells(markdown: string): Array<{ iso: string; raw: string }> {
  const rows = parseTableRows(markdown);
  let inDatesBlock = false;
  const result: Array<{ iso: string; raw: string }> = [];

  for (const row of rows) {
    if (!inDatesBlock) {
      if (clean(row[0] ?? "").toUpperCase() === "DATES") {
        inDatesBlock = true;
      }
      continue;
    }

    // First cell non-empty and not "DATES" = left the block
    const firstCell = clean(row[0] ?? "");
    if (firstCell && firstCell.toUpperCase() !== "DATES") break;

    if (row.length < 5) continue;

    const label = clean(row[1] ?? "");
    if (!/^SHOW\s+DAY\b/i.test(label)) continue;

    const rawDate = clean(row[3] ?? "");
    const iso = rawDate ? normalizeDate(rawDate) : null;
    if (!iso) continue;

    const timeCell = clean(row[4] ?? "");
    result.push({ iso, raw: timeCell });
  }

  return result;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function parseScheduleTimes(
  markdown: string,
  dates: ShowRow["dates"],
): { scheduleDays: RunOfShow; warnings: ParseWarning[] } {
  const scheduleDays: RunOfShow = {};
  const warnings: ParseWarning[] = [];
  const cells = readShowDayTimeCells(markdown);

  cells.forEach(({ iso, raw }, index) => {
    const cell = raw.replace(/\s+/g, " ").trim();
    if (!cell) return; // empty → nothing

    const toks = tokenize(cell);

    if (toks.length === 0) {
      // Contentful but zero clocks. Bare sentinel → silent; else warn.
      if (!shouldHideGenericOptional(cell)) {
        warnings.push(scheduleTimeUnparsed(index, iso));
      }
      return;
    }

    // ── Window detection: exactly 2 tokens, title-less, separated by " - " only ──
    if (toks.length === 2) {
      const between = cell.slice(toks[0]!.end, toks[1]!.start);
      const tail = cell.slice(toks[1]!.end);
      const leadText = cell.slice(0, toks[0]!.start).trim();
      if (/^\s*[-–]\s*$/.test(between) && tail.trim() === "" && leadText === "") {
        scheduleDays[iso] = {
          entries: [],
          showStart: null,
          window: {
            start: cell.slice(toks[0]!.start, toks[0]!.end).trim(),
            end: cell.slice(toks[1]!.start, toks[1]!.end).trim(),
          },
        };
        return;
      }
    }

    // ── Titled list ────────────────────────────────────────────────────────────
    const entries: AgendaEntry[] = [];
    toks.forEach((t, i) => {
      const next = toks[i + 1]?.start ?? cell.length;
      const title = titleAfter(cell, t.end, next);
      if (title && !shouldHideGenericOptional(title)) {
        entries.push({ start: t.norm, title });
      }
    });

    // showStart = first token IFF it is a LEADING START (only a short label
    // prefix or whitespace before it) AND not preceded by a placeholder AND
    // its title is non-terminal (for single-token case).
    const first = toks[0]!;
    const lead = cell.slice(0, first.start);
    const isLeadingStart = /^(\s*[A-Za-z][\w ]*:\s*)?$/.test(lead) && !PLACEHOLDER_RE.test(lead);
    const firstTitle = titleAfter(cell, first.end, toks[1]?.start ?? cell.length);
    const showStart =
      isLeadingStart && !(toks.length === 1 && TERMINAL_RE.test(firstTitle)) ? first.norm : null;

    const day: ScheduleDay = { entries, showStart, window: null };

    // If nothing usable was extracted (no entries, no showStart, no window),
    // emit a warning and do NOT persist the day.
    if (day.entries.length === 0 && day.showStart === null && day.window === null) {
      warnings.push(scheduleTimeUnparsed(index, iso));
      return;
    }

    scheduleDays[iso] = day;
  });

  return { scheduleDays, warnings };
}
