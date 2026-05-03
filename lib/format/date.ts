/**
 * lib/format/date.ts — shared ISO-date formatter (M4 catch-up review,
 * Minor 4).
 *
 * Three tiles had near-duplicate inline copies of this:
 *   - LodgingTile.tsx (formatShortDate, "Mon D")
 *   - ScheduleTile.tsx (formatDayLabel, "Wkd, Mon D")
 *   - TransportTile.tsx (formatDate, "Wkd, Mon D")
 *
 * Two output shapes (`short`, `weekday-short`), one helper. The risk
 * of three independent copies was day-boundary off-by-one drift —
 * dropping `timeZone: 'UTC'` from any one copy would render "Apr 18"
 * for "2026-04-19" in US-Pacific runtime. One source of truth eliminates
 * that class of regression.
 *
 * Defensive on bad input: `Number.isNaN(d.getTime())` short-circuit
 * returns the input verbatim. Empty string → empty string.
 *
 * Server-safe pure function.
 */

export type DateFormatMode = "short" | "weekday-short";

export function formatIsoDate(iso: string, mode: DateFormatMode): string {
  if (iso === "") return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  if (mode === "short") {
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  }
  // mode === 'weekday-short'
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
