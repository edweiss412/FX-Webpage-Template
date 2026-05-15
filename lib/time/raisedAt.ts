/**
 * lib/time/raisedAt.ts — relative-time suffix for the AlertBanner
 * raised_at row (M9 C4 / M5-D3) per shape brief
 * 2026-05-14-alert-banner.md §5.2 + §8 content table.
 *
 * Returns the relative chunk only — the caller composes
 * "Raised " + suffix so the eyebrow and aria-label stay consistent.
 *
 * Buckets:
 *   <60s     → "just now"
 *   1-59 min → "<N> minute(s) ago"
 *   1-23 hr  → "<N> hour(s) ago"
 *   1-7 day  → "<N> day(s) ago"
 *   >7 day   → "on <Mon D>" (e.g., "on Apr 14")
 *
 * Future timestamps clamp to "just now" (defensive against clock skew
 * between the server that wrote the row and the renderer's wall clock).
 *
 * Pure: no Date.now(); caller passes `now` for deterministic SSR
 * output and tests.
 */
const MONTH_ABBR = [
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
];

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

export function raisedAtSuffix(iso: string, now: Date): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "just now";
  const deltaSec = Math.floor((now.getTime() - ms) / 1000);
  if (deltaSec < 60) return "just now";
  // C4 R2 fix: gate the relative bucket on raw deltaSec (not floored
  // days). Brief §8 defines >7 days → "on <Mon D>". An alert 7 days
  // + 1 second old must already render the absolute form. The
  // previous `days <= 7` predicate kept "7 days ago" for almost a
  // full extra day because Math.floor stripped the overflow seconds.
  if (deltaSec > SEVEN_DAYS_SEC) {
    const d = new Date(ms);
    return `on ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  const minutes = Math.floor(deltaSec / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
