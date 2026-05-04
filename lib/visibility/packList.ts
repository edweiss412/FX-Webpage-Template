/**
 * lib/visibility/packList.ts — canonical PackListTile visibility predicate
 * (M4 Task 4.9, plan lines 412-471, spec §8.1, §6.10, AC-4.7..4.12).
 *
 * Single source of truth for whether the pack-list tile is visible to the
 * viewer ON A GIVEN DAY. Combines:
 *
 *   1. Today's work-phase set, derived from
 *      `ShowRow.schedule_phases[isoDate]` for the show's venue timezone
 *      (NO re-derivation from `show.dates + show.schedule` — verbatim plan
 *      correction #2).
 *   2. PACK_LIST_VISIBLE_PHASES = { Set, Strike, Load Out } per spec §8.1.
 *      `Load In` is INTENTIONALLY EXCLUDED (verbatim plan correction #3).
 *      `Show` is also excluded — the tile disappears on show days because
 *      crew aren't packing during the live event.
 *   3. The viewer's `stage_restriction` (§6.6 discriminated union):
 *      - `{ kind: 'none' }`         → no per-viewer filter
 *      - `{ kind: 'explicit', stages }` → today's phases must intersect the
 *        listed stages AND the global pack-list set.
 *
 * Timezone derivation: the predicate uses built-in `Intl.DateTimeFormat`
 * with `en-CA` locale (which formats as ISO `YYYY-MM-DD`) under the
 * resolved venue timezone. No third-party library (date-fns-tz, Luxon)
 * is added. `venue.timezone` is read defensively — the current
 * `ShowRow.venue` type does not declare a `timezone` field
 * (lib/parser/types.ts:85-91), but the projection passes the venue object
 * through verbatim, so a future M-task that populates `venue.timezone`
 * lights up automatically. Until then, the default is `'America/New_York'`
 * (FXAV's domestic-US event domain — every fixture in
 * fixtures/shows/raw/* is a US-East / US-Central event).
 *
 * Origin-of-trust contract (mirrors lib/visibility/scopeTiles.ts):
 *
 *   - `show.schedule_phases` is freshly read from the DB by
 *     `getShowForViewer` on every page render, never carried in a cookie
 *     or query param.
 *   - `restriction` is the viewer's `crew_members.stage_restriction`
 *     freshly loaded from the same row that supplies `role_flags`.
 *   - `today: Date` is supplied by the page handler (Server Component
 *     reads `new Date()` at render time). Pure-function shape lets the
 *     vitest unit tests exercise every branch deterministically and lets
 *     Playwright control "today" via a fixed-Date page.addInitScript if
 *     a future spec needs to.
 *
 * Server-safe (pure function; no environment reads, no side effects).
 */
import type { ShowRow, StageRestriction, WorkPhase } from "@/lib/parser/types";

/**
 * Pack-list visibility set per spec §8.1 — the tile renders only on days
 * whose phases include AT LEAST ONE of these. `Load In` and `Show` are
 * intentionally excluded (verbatim plan correction #3).
 */
export const PACK_LIST_VISIBLE_PHASES: ReadonlySet<WorkPhase> = new Set<WorkPhase>([
  "Set",
  "Strike",
  "Load Out",
]);

/** Default timezone for shows whose venue carries no timezone field. */
const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Type widening so we can read a future `venue.timezone` field without
 * fighting the (current) ShowRow.venue type. The projection passes the
 * venue object through verbatim, so any future field lights up here.
 */
type VenueWithTimezone = NonNullable<ShowRow["venue"]> & {
  timezone?: string | null;
};

/** Resolve the show's effective timezone. */
function resolveTimezone(show: Pick<ShowRow, "venue">): string {
  const venue = show.venue as VenueWithTimezone | null;
  const tz = venue?.timezone;
  if (typeof tz === "string" && tz.length > 0) return tz;
  return DEFAULT_TIMEZONE;
}

/**
 * Format a Date as ISO `YYYY-MM-DD` in the given IANA timezone using
 * `Intl.DateTimeFormat` with `en-CA` locale (which natively formats as
 * `YYYY-MM-DD`). Pure stdlib; no third-party dep.
 */
function formatIsoInTimeZone(date: Date, timeZone: string): string {
  // en-CA reliably emits `YYYY-MM-DD` across every modern engine
  // (Chromium, WebKit, Firefox, Node). 2-digit month/day are explicit
  // for defense in depth against locale subtleties.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Today's work-phase set for the given show, derived from
 * `ShowRow.schedule_phases` for the venue-timezone-aware ISO date of
 * `today`. Returns `[]` when the show has no entry for today.
 */
export function todayWorkPhases(
  show: Pick<ShowRow, "schedule_phases" | "venue">,
  today: Date,
): WorkPhase[] {
  const tz = resolveTimezone(show);
  const isoDate = formatIsoInTimeZone(today, tz);
  return show.schedule_phases?.[isoDate] ?? [];
}

/**
 * Today's ISO `YYYY-MM-DD` date string in the show's venue timezone.
 * Wrapper around `formatIsoInTimeZone` + `resolveTimezone` so callers
 * outside this module (ScheduleTile primary-variant today-highlight,
 * Task 4.13.distill Finding 2) can derive the same boundary without
 * re-importing the timezone-resolution discipline.
 *
 * Pure function; same arguments → same result. The tile reads `new
 * Date()` at the page handler and threads it through.
 */
export function todayIsoInShowTimezone(
  show: Pick<ShowRow, "venue">,
  today: Date,
): string {
  const tz = resolveTimezone(show);
  return formatIsoInTimeZone(today, tz);
}

/**
 * Pack-list visibility per spec §8.1, AC-4.8 / AC-4.10.
 *
 *   visible iff (
 *     today's phases overlap PACK_LIST_VISIBLE_PHASES
 *   ) AND (
 *     restriction.kind === 'none' OR
 *     today's phases overlap restriction.stages
 *   )
 *
 * The two conjuncts are evaluated separately because the global gate
 * (Load In / Show always hidden) takes precedence over the per-viewer
 * restriction — even a viewer restricted to ['Show'] does NOT see the
 * tile on a Show day, because the global gate excludes Show.
 */
export function isPackListVisibleToday(opts: {
  show: Pick<ShowRow, "schedule_phases" | "venue">;
  restriction: StageRestriction;
  today: Date;
}): boolean {
  const { show, restriction, today } = opts;
  const phases = todayWorkPhases(show, today);

  // Global gate — at least one of today's phases must be in the
  // pack-list visible set. Otherwise the tile is hidden regardless of
  // the per-viewer restriction.
  if (!phases.some((p) => PACK_LIST_VISIBLE_PHASES.has(p))) return false;

  // Per-viewer gate.
  if (restriction.kind === "none") return true;

  // explicit — today's phases must overlap the listed stages.
  return phases.some((p) => restriction.stages.includes(p));
}
