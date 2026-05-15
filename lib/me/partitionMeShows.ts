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

/**
 * R2 F1 (codex finding): the chip label uses a STATUS-AWARE anchor date,
 * not the display date. For an active multi-day show (set=yesterday,
 * showDays=[today,…]), display date stays yesterday → would render
 * "Ended"; the chip anchor is today's first show day → renders "Today".
 * For an ended show, the anchor is the most recent known date.
 */
export type PartitionedMeShow = {
  show: CrewShowSummary;
  /** ISO YYYY-MM-DD used by the chip-tone helper for relative-day labelling. */
  chipAnchor: string;
};

export type PartitionedMeShows = {
  /** The single emphasized show (next up, or most-recent past if no future). */
  featured: PartitionedMeShow | null;
  /** Future shows after the featured one, ascending by display date. */
  upcoming: PartitionedMeShow[];
  /** Past shows excluding featured, descending by display date. */
  past: PartitionedMeShow[];
  /**
   * R11 (codex finding): assigned shows whose `dates` blob carries no
   * sortable date (null, empty showDays, malformed JSON). Pre-R11 these
   * silently disappeared; the brief is silent on this state but the
   * old card-grid layout rendered them. Surface them in their own
   * "Date pending" section so the user retains the link to the show
   * even when Doug hasn't filled in the dates yet.
   */
  undated: CrewShowSummary[];
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
function knownDates(dates: unknown): string[] {
  const obj = asDates(dates);
  if (!obj) return [];
  const out: string[] = [];
  if (typeof obj.set === "string" && obj.set.length > 0) out.push(obj.set);
  if (typeof obj.travelIn === "string" && obj.travelIn.length > 0) out.push(obj.travelIn);
  if (typeof obj.travelOut === "string" && obj.travelOut.length > 0) out.push(obj.travelOut);
  if (Array.isArray(obj.showDays)) {
    for (const d of obj.showDays) {
      if (typeof d === "string" && d.length > 0) out.push(d);
    }
  }
  return out;
}

function isShowEnded(dates: unknown, todayIso: string): boolean {
  const candidates = knownDates(dates);
  if (candidates.length === 0) return false;
  // Ended iff every candidate is strictly before today.
  return candidates.every((iso) => iso < todayIso);
}

/**
 * R2 F1: the chip-anchor for relative-day labelling. For active shows,
 * pick the EARLIEST known date >= today (so an active multi-day show
 * with set=yesterday + showDays=[today] anchors on today, not yesterday).
 * For ended shows, pick the MOST RECENT known date (the natural "Ended
 * N days ago" anchor). Falls back to displayDate when no future date
 * exists in an unended show (defensive — shouldn't happen given
 * isShowEnded's contract).
 */
function chipAnchorIso(dates: unknown, displayDate: string, todayIso: string, ended: boolean): string {
  const candidates = knownDates(dates);
  if (candidates.length === 0) return displayDate;
  if (ended) {
    // Most recent (largest) past date.
    return candidates.reduce((max, iso) => (iso > max ? iso : max), candidates[0]!);
  }
  // Active: earliest date that is >= today; fall back to displayDate.
  const future = candidates.filter((iso) => iso >= todayIso);
  if (future.length === 0) return displayDate;
  return future.reduce((min, iso) => (iso < min ? iso : min), future[0]!);
}

export function partitionMeShows(
  shows: readonly CrewShowSummary[],
  now: Date,
): PartitionedMeShows {
  const todayIso = now.toISOString().slice(0, 10);

  type Indexed = { show: CrewShowSummary; iso: string; ended: boolean; chipAnchor: string };
  const dated: Indexed[] = [];
  // R11 (codex finding): undated shows are not lost — preserve them
  // in their own bucket so the page renders them with a link + no
  // chip in a "Date pending" section.
  const undated: CrewShowSummary[] = [];
  for (const s of shows) {
    const iso = resolveDisplayDate(s.dates);
    if (!iso) {
      undated.push(s);
      continue;
    }
    const ended = isShowEnded(s.dates, todayIso);
    const chipAnchor = chipAnchorIso(s.dates, iso, todayIso, ended);
    dated.push({ show: s, iso, ended, chipAnchor });
  }

  if (dated.length === 0) {
    // No dated shows; surface undated as a degenerate featured + the
    // rest in the undated bucket. If undated is also empty (no shows
    // at all), featured remains null.
    if (undated.length === 0) {
      return { featured: null, upcoming: [], past: [], undated: [] };
    }
    // R11: even with no dated shows, the user still has assigned
    // shows; render them via the undated bucket. featured stays null
    // because we have no chip-meaningful date to anchor a Next-up
    // card on. The page renders the undated section directly.
    return { featured: null, upcoming: [], past: [], undated };
  }

  // Active = NOT ended (covers both purely-future shows AND
  // active-multi-day shows whose set day was yesterday but show days
  // include today). Sort key per shape brief §5.1 "Most soonest" rule:
  // earliest display date (set ?? travelIn ?? showDays[0]) >= today.
  // For active multi-day shows whose display date is already PAST
  // (set=yesterday but showDays still active), fall back to chipAnchor
  // so they slot into the ordering by their actual remaining work
  // window. R2 R5 F2 (codex finding): the chip-anchor fix from R2 must
  // drive chip COPY, not silently replace the section ordering key for
  // ordinary future shows whose display date is the contract.
  const sortKeyFor = (d: Indexed): string => {
    return d.iso >= todayIso ? d.iso : d.chipAnchor;
  };
  const active = dated.filter((d) => !d.ended).sort((a, b) => sortKeyFor(a).localeCompare(sortKeyFor(b)));
  // R6 (codex finding): sort ended shows by chipAnchor (the actual end
  // date — most recent of set/travelIn/travelOut/showDays) descending,
  // not by display date. A multi-day show that started earlier but
  // ended later (e.g., set=Apr 1 + travelOut=Apr 30) was incorrectly
  // ranked behind a shorter show with later set (e.g., set=Apr 15 +
  // travelOut=Apr 16). Display date / id tie-break keeps the order
  // stable across runs.
  const ended = dated.filter((d) => d.ended).sort((a, b) => {
    const cmp = b.chipAnchor.localeCompare(a.chipAnchor);
    if (cmp !== 0) return cmp;
    const isoCmp = b.iso.localeCompare(a.iso);
    if (isoCmp !== 0) return isoCmp;
    return a.show.id.localeCompare(b.show.id);
  });

  const project = (d: Indexed): PartitionedMeShow => ({ show: d.show, chipAnchor: d.chipAnchor });

  if (active.length > 0) {
    return {
      featured: project(active[0]!),
      upcoming: active.slice(1).map(project),
      past: ended.map(project),
      undated,
    };
  }

  // All-ended: featured = most recent past (ended[0]); past list excludes it.
  return {
    featured: project(ended[0]!),
    upcoming: [],
    past: ended.slice(1).map(project),
    undated,
  };
}
