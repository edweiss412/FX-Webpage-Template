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

type DatesShape = {
  set?: unknown;
  travelIn?: unknown;
  showDays?: unknown;
  travelOut?: unknown;
};

function asDates(dates: unknown): DatesShape | null {
  if (typeof dates !== "object" || dates === null || Array.isArray(dates)) return null;
  return dates as DatesShape;
}

function resolveDisplayDate(dates: unknown): string | null {
  const obj = asDates(dates);
  if (!obj) return null;
  if (typeof obj.set === "string" && obj.set.length > 0) return obj.set;
  if (typeof obj.travelIn === "string" && obj.travelIn.length > 0) return obj.travelIn;
  if (Array.isArray(obj.showDays)) {
    const first = obj.showDays.find((d): d is string => typeof d === "string" && d.length > 0);
    if (first) return first;
  }
  return null;
}

/**
 * R1 F1 (codex finding): a show is past ONLY when EVERY known date is
 * strictly before today. Per shape brief §5.1: "all shows ended
 * (`dates.set < today` AND no upcoming show-day)". We extend the brief's
 * test to cover travelOut as well — a wrap-up day after the last show
 * day still means the crew is on-site.
 *
 * Rule: a show is ENDED when set, travelIn, every showDays entry, AND
 * travelOut are ALL strictly < todayIso. If ANY known date is >= today,
 * the show is still active and goes to upcoming/featured. Missing dates
 * are treated as "no signal" — they don't keep an otherwise-past show
 * alive, but they don't end an otherwise-active show either.
 *
 * This separates STATUS classification from the DISPLAY-DATE used to
 * sort + render the chip. resolveDisplayDate stays the brief's
 * `set ?? travelIn ?? showDays[0]` chain.
 */
function isShowEnded(dates: unknown, todayIso: string): boolean {
  const obj = asDates(dates);
  if (!obj) return false;
  const candidates: string[] = [];
  if (typeof obj.set === "string" && obj.set.length > 0) candidates.push(obj.set);
  if (typeof obj.travelIn === "string" && obj.travelIn.length > 0) candidates.push(obj.travelIn);
  if (typeof obj.travelOut === "string" && obj.travelOut.length > 0) candidates.push(obj.travelOut);
  if (Array.isArray(obj.showDays)) {
    for (const d of obj.showDays) {
      if (typeof d === "string" && d.length > 0) candidates.push(d);
    }
  }
  if (candidates.length === 0) return false;
  // Ended iff every candidate is strictly before today.
  return candidates.every((iso) => iso < todayIso);
}

export function partitionMeShows(
  shows: readonly CrewShowSummary[],
  now: Date,
): PartitionedMeShows {
  const todayIso = now.toISOString().slice(0, 10);

  type Indexed = { show: CrewShowSummary; iso: string; ended: boolean };
  const dated: Indexed[] = shows
    .map((s) => {
      const iso = resolveDisplayDate(s.dates);
      if (!iso) return null;
      return { show: s, iso, ended: isShowEnded(s.dates, todayIso) };
    })
    .filter((x): x is Indexed => x !== null);

  if (dated.length === 0) {
    return { featured: null, upcoming: [], past: [] };
  }

  // Active = NOT ended (covers both purely-future shows AND
  // active-multi-day shows whose set day was yesterday but show days
  // include today). Sort ascending by display date so the soonest
  // active show is featured first.
  const active = dated.filter((d) => !d.ended).sort((a, b) => a.iso.localeCompare(b.iso));
  const ended = dated.filter((d) => d.ended).sort((a, b) => b.iso.localeCompare(a.iso));

  if (active.length > 0) {
    const featured = active[0]!.show;
    const upcoming = active.slice(1).map((d) => d.show);
    const past = ended.map((d) => d.show);
    return { featured, upcoming, past };
  }

  // All-ended: featured = most recent past (ended[0]); past list excludes it.
  const featured = ended[0]!.show;
  const past = ended.slice(1).map((d) => d.show);
  return { featured, upcoming: [], past };
}
