/**
 * The `{time}` and `{ago}` strings of the pinned saved-copy bar (spec 4.7.2).
 *
 * Pure and dependency-free: the bar passes the clock in, so these never read
 * `Date.now()`, and Vitest imports the same source.
 *
 * The locale is fixed to `en-US` because the copy is English. Both functions
 * return `null` for a saved value that is missing, empty or not a date, and for
 * a clock reading that is not a usable time; the bar then drops the time and age
 * from its copy rather than showing a made-up one.
 */

const LOCALE = "en-US";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Ages under this read in hours; from here they read in days. */
const HOURS_LIMIT_MS = 48 * HOUR_MS;

/** The saved instant in epoch milliseconds, or null when either input is unusable. */
function readSavedMs(iso: unknown, nowMs: number): number | null {
  if (typeof iso !== "string") return null;
  if (!Number.isFinite(new Date(nowMs).getTime())) return null;
  const savedMs = Date.parse(iso);
  return Number.isNaN(savedMs) ? null : savedMs;
}

function partsOf(formatter: Intl.DateTimeFormat, ms: number): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const { type, value } of formatter.formatToParts(ms)) parts[type] = value;
  return parts;
}

/**
 * `2:14 PM` when the saved instant is on the same calendar day as `nowMs` in
 * `timeZone` (the runtime's zone when omitted), otherwise `Fri Oct 24, 6:02 PM`.
 *
 * Assembled from `formatToParts`, not from `format()`: `en-US` would put a comma
 * after the weekday, and some runtimes put a narrow no-break space before the
 * AM/PM marker.
 */
export function formatSavedTime(iso: string, nowMs: number, timeZone?: string): string | null {
  const savedMs = readSavedMs(iso, nowMs);
  if (savedMs === null) return null;

  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const saved = partsOf(formatter, savedMs);
  const now = partsOf(formatter, nowMs);

  const time = `${saved.hour}:${saved.minute} ${saved.dayPeriod}`;
  const isToday = saved.year === now.year && saved.month === now.month && saved.day === now.day;
  return isToday ? time : `${saved.weekday} ${saved.month} ${saved.day}, ${time}`;
}

/**
 * `just now` under 1 minute and for any future instant, then `N min ago` under
 * 60 minutes, `N hr ago` under 48 hours and `N days ago` after that. Each unit
 * floors.
 */
export function formatAgo(iso: string, nowMs: number): string | null {
  const savedMs = readSavedMs(iso, nowMs);
  if (savedMs === null) return null;

  const elapsedMs = nowMs - savedMs;
  if (elapsedMs < MINUTE_MS) return "just now";
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)} min ago`;
  if (elapsedMs < HOURS_LIMIT_MS) return `${Math.floor(elapsedMs / HOUR_MS)} hr ago`;
  return `${Math.floor(elapsedMs / DAY_MS)} days ago`;
}
