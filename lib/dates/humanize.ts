/**
 * lib/dates/humanize.ts — pure, deterministic ISO-date → human-label helpers
 * for the onboarding Step-3 date summary (plan Task 3).
 *
 * PURE by contract: every function parses the ISO `YYYY-MM-DD` STRING directly
 * (split on "-"). It NEVER constructs `new Date(...)` or calls `Date.now()` —
 * `new Date('2026-10-07')` is parsed as UTC midnight and then rendered in the
 * host timezone, which silently shifts the day backwards for negative offsets
 * (the "Oct 7 becomes Oct 6 in California" class of bug). Parsing the string
 * fields directly is timezone-invariant and unit-testable with fixed inputs.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Ymd = { year: number; month: number; day: number };

/** Parse a strict `YYYY-MM-DD` string into numeric parts, or null if malformed. */
function parseYmd(iso: string | null | undefined): Ymd | null {
  if (typeof iso !== "string") return null;
  const match = ISO_DATE_RE.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

/** "2026-10-07" → "Oct 7". Returns null for null/empty/malformed input. */
export function humanizeDate(iso: string | null | undefined): string | null {
  const ymd = parseYmd(iso);
  if (!ymd) return null;
  return `${MONTHS[ymd.month - 1]} ${ymd.day}`;
}

/**
 * Collapse a list of ISO show-days into one human label:
 *   - same month/year span → "Oct 8–10" (tight en dash)
 *   - cross-month span      → "Oct 30 – Nov 2" (spaced en dash)
 *   - single day            → "Oct 7"
 *   - empty / all-malformed  → null
 *
 * Uses the first and last VALID entries (the parser emits showDays in order);
 * malformed entries are skipped rather than poisoning the whole range.
 */
export function humanizeDayRange(
  isos: Array<string | null | undefined> | null | undefined,
): string | null {
  if (!Array.isArray(isos)) return null;
  const valid = isos.map(parseYmd).filter((v): v is Ymd => v !== null);
  if (valid.length === 0) return null;

  const first = valid[0]!;
  const last = valid[valid.length - 1]!;

  // Single distinct day (length 1, or first === last).
  if (first.year === last.year && first.month === last.month && first.day === last.day) {
    return `${MONTHS[first.month - 1]} ${first.day}`;
  }

  // Same month + year → share the month name once with a tight en dash.
  if (first.year === last.year && first.month === last.month) {
    return `${MONTHS[first.month - 1]} ${first.day}–${last.day}`;
  }

  // Cross-month (or cross-year) → full label on each side, spaced en dash.
  return `${MONTHS[first.month - 1]} ${first.day} – ${MONTHS[last.month - 1]} ${last.day}`;
}

/**
 * List ISO show-days as a compact label, repeating the month only when it
 * changes: "Oct 7 & 9", "Oct 7, 9 & 11", "Oct 30 & Nov 2", "Oct 7". Malformed
 * entries are skipped; empty / all-malformed / non-array → null. (Distinct from
 * humanizeDayRange, which collapses to a first–last contiguous range.)
 */
export function humanizeDayList(
  isos: Array<string | null | undefined> | null | undefined,
): string | null {
  if (!Array.isArray(isos)) return null;
  const valid = isos.map(parseYmd).filter((v): v is Ymd => v !== null);
  if (valid.length === 0) return null;
  const parts: string[] = [];
  let prevMonth: number | null = null;
  for (const ymd of valid) {
    parts.push(ymd.month === prevMonth ? `${ymd.day}` : `${MONTHS[ymd.month - 1]} ${ymd.day}`);
    prevMonth = ymd.month;
  }
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}
