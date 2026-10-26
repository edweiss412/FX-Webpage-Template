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

/**
 * Split an ISO date (YYYY-MM-DD) into the two parts of the Schedule
 * date badge: `dow` (uppercased weekday-short, e.g. "FRI") stacked over
 * `dnum` (numeric day, e.g. "12"). UTC-pinned for the same day-boundary
 * reason as `formatIsoDate` — single-sourcing the TZ handling here keeps
 * DayCard from re-deriving it inline.
 *
 * Defensive: empty string → both parts empty; an unparseable ISO yields
 * an empty `dow` and echoes the raw input as `dnum` (never a "NaN" leak).
 */
export function dayBadgeParts(iso: string): { dow: string; dnum: string } {
  if (iso === "") return { dow: "", dnum: "" };
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { dow: "", dnum: iso };
  return {
    dow: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }).toUpperCase(),
    dnum: d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" }),
  };
}

export type DateStubParts =
  | { kind: "date"; day: string; month: string; weekday: string }
  | { kind: "raw"; text: string };

/**
 * Split an ISO date (YYYY-MM-DD) into the parts of the hotel card's date
 * stub: `day` ("22") set large, `month` ("Mar") beside it, and `weekday`
 * ("Sunday") underneath. UTC-pinned for the same day-boundary reason as
 * `formatIsoDate`.
 *
 * Defensive: a value that is not a date (a sheet sentinel like "TBD", or an
 * empty string) comes back as `kind: "raw"` holding the input verbatim, so
 * the caller echoes it as-parsed instead of leaking "NaN".
 */
export function dateStubParts(iso: string): DateStubParts {
  if (iso === "") return { kind: "raw", text: "" };
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { kind: "raw", text: iso };
  return {
    kind: "date",
    day: d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" }),
    month: d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }),
    weekday: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" }),
  };
}
