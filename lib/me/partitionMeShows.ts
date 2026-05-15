/**
 * lib/me/partitionMeShows.ts — pure partition for the /me page (M9 C3 / M5-D1)
 * per shape brief 2026-05-14-auth-flow-polish.md §5.1.
 *
 * Reduces a flat `CrewShowSummary[]` into three buckets the page renders as
 * NEXT UP (featured), UPCOMING (list), and PAST (collapsed disclosure).
 *
 * Display-date resolution mirrors the existing pickShowDate logic in
 * `app/me/page.tsx` (and `components/layout/Header.tsx`'s pickHeaderDate
 * fallback chain): `dates.set ?? dates.travelIn ?? dates.showDays[0]`.
 *
 * Rules:
 *   - "Featured" = earliest future show (display date >= today).
 *     If no future show exists, featured = most recent past show.
 *     If no shows at all (or no shows with display dates), featured = null.
 *   - "Upcoming" = all future shows EXCLUDING the featured, sorted ascending.
 *   - "Past" = all past shows EXCLUDING the featured (when featured is past),
 *     sorted descending.
 *   - Shows whose display date can't be resolved (null/empty dates) are
 *     dropped from all buckets — we can't sort them.
 *
 * Pure: no I/O, no Date.now(). Caller passes `now` so the partition is
 * deterministic across server/client boundaries and across timezones (the
 * page resolves `now` once at render time).
 */
import type { CrewShowSummary } from "@/lib/data/listShowsForCrew";

export type PartitionedMeShows = {
  /** The single emphasized show (next up, or most-recent past if no future). */
  featured: CrewShowSummary | null;
  /** Future shows after the featured one, ascending by display date. */
  upcoming: CrewShowSummary[];
  /** Past shows excluding featured, descending by display date. */
  past: CrewShowSummary[];
};

function resolveDisplayDate(dates: unknown): string | null {
  if (typeof dates !== "object" || dates === null || Array.isArray(dates)) return null;
  const obj = dates as { set?: unknown; travelIn?: unknown; showDays?: unknown };
  if (typeof obj.set === "string" && obj.set.length > 0) return obj.set;
  if (typeof obj.travelIn === "string" && obj.travelIn.length > 0) return obj.travelIn;
  if (Array.isArray(obj.showDays)) {
    const first = obj.showDays.find((d): d is string => typeof d === "string" && d.length > 0);
    if (first) return first;
  }
  return null;
}

export function partitionMeShows(
  shows: readonly CrewShowSummary[],
  now: Date,
): PartitionedMeShows {
  const todayIso = now.toISOString().slice(0, 10);

  type Indexed = { show: CrewShowSummary; iso: string };
  const dated: Indexed[] = shows
    .map((s) => {
      const iso = resolveDisplayDate(s.dates);
      return iso ? { show: s, iso } : null;
    })
    .filter((x): x is Indexed => x !== null);

  if (dated.length === 0) {
    return { featured: null, upcoming: [], past: [] };
  }

  const future = dated.filter((d) => d.iso >= todayIso).sort((a, b) => a.iso.localeCompare(b.iso));
  const pastAll = dated.filter((d) => d.iso < todayIso).sort((a, b) => b.iso.localeCompare(a.iso));

  if (future.length > 0) {
    const featured = future[0]!.show;
    const upcoming = future.slice(1).map((d) => d.show);
    const past = pastAll.map((d) => d.show);
    return { featured, upcoming, past };
  }

  // All-past: featured = most recent past (pastAll[0]); past list excludes it.
  const featured = pastAll[0]!.show;
  const past = pastAll.slice(1).map((d) => d.show);
  return { featured, upcoming: [], past };
}
