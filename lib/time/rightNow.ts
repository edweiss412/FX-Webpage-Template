/**
 * lib/time/rightNow.ts — pure state-machine selector that powers the
 * Right Now card (M4 Task 4.11; spec §8.2; AC-4.3).
 *
 * `selectRightNowState(today, dates, viewerDateRestriction, options?)`
 * returns one of twelve discriminated-union states per the spec §8.2
 * precedence table. The function is INTENTIONALLY pure:
 *
 *   - No `Date.now()`, no `new Date()`. `today` is a parameter so vitest
 *     can drive every branch deterministically and Playwright can pin
 *     wall-clock time via `page.addInitScript` on the client island.
 *   - No I/O, no environment reads, no logging.
 *
 * Timezone discipline (mirrors `lib/visibility/packList.ts`):
 *
 *   - `today` is converted to a `YYYY-MM-DD` ISO key in the show's IANA
 *     timezone via `Intl.DateTimeFormat('en-CA', ...)`. The default
 *     timezone is `'America/New_York'` (FXAV's domestic-US event
 *     domain — every fixture in fixtures/shows/raw/* is a US-East /
 *     US-Central event). Caller may override via
 *     `options.timezone` once `ShowRow.venue.timezone` lights up.
 *   - All `dates.*` strings are already plain ISO `YYYY-MM-DD`; the ISO
 *     comparison is therefore a string compare on TZ-aware keys, not a
 *     `Date < Date` compare. This avoids the "3am UTC vs local
 *     midnight" bug class.
 *
 * State precedence — the if/else ladder follows the spec table top-to-
 * bottom, with the documented short-circuit:
 *
 *   1. `dateless` / `unknown`      — date-data fallbacks (spec line 2414
 *      "override everything else"). Evaluated FIRST.
 *   2. `viewer_unconfirmed`        — replaces every show-wide state.
 *   3. `viewer_after_last_day`     — BEFORE `viewer_off_day` (the
 *      explicit regression rule per §8.2 row 2).
 *   4. `viewer_off_day`
 *   5. `viewer_off_day_pre`
 *   6. `pre_travel`
 *   7. `travel_in_day`
 *   8. `set_day`
 *   9. `show_day_n`
 *  10. `travel_out_day`
 *  11. `post_show`
 *
 * Each branch is commented with its spec table row.
 *
 * Server-safe (pure function; no environment reads, no side effects).
 */
import type { DateRestriction, ShowRow } from "@/lib/parser/types";

/**
 * Discriminated union of the twelve §8.2 states. Per-state payloads
 * carry only what the renderer needs to produce the body copy listed
 * in the spec table — nothing more, nothing less.
 */
export type RightNowState =
  | { kind: "viewer_unconfirmed" }
  | { kind: "viewer_after_last_day"; travelOut: string }
  | { kind: "viewer_off_day"; nextAssignedDay: string }
  /**
   * `daysAway` is **always >= 1** here. Today equals the first assigned
   * day produces a show-wide state (or `viewer_off_day` when explicit
   * days exclude today); today after the first assigned day cannot
   * reach this branch. The construction site asserts this invariant
   * defensively so a future refactor can't silently produce
   * `formatDaysAway(0)` ("today") as the lead phrase.
   */
  | { kind: "viewer_off_day_pre"; firstAssignedDay: string; daysAway: number }
  | { kind: "pre_travel"; travelIn: string; daysAway: number }
  | { kind: "travel_in_day" }
  | { kind: "set_day" }
  | { kind: "show_day_n"; n: number; total: number; isLast: boolean }
  | { kind: "travel_out_day" }
  | { kind: "post_show"; wrappedAt: string }
  | { kind: "unknown" }
  | { kind: "dateless" };

/** Default timezone — FXAV's domestic-US event domain. */
const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Module-scope cache of `Intl.DateTimeFormat` instances keyed by IANA
 * timezone. `Intl.DateTimeFormat` instantiation is non-trivial and the
 * Right Now card re-derives state on a 60-second tick (and on every
 * render), so reusing the formatter per-tz pays off quickly. Mirrors
 * the standard memoization pattern recommended by the ECMA-402 spec.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Format a Date as ISO `YYYY-MM-DD` in the given IANA timezone. `en-CA`
 * locale natively emits `YYYY-MM-DD`; explicit 2-digit month/day for
 * defense in depth across engines. Mirrors PackList's helper exactly,
 * but reuses a cached `Intl.DateTimeFormat` per timezone (the formatter
 * cache lives at module scope above).
 *
 * Exported so the Right Now card client island can reuse the same
 * cached formatter — see `components/right-now/RightNowCard.tsx`.
 */
export function formatIsoForTimezone(date: Date, timeZone: string): string {
  return getFormatter(timeZone).format(date);
}

/** Compare two ISO `YYYY-MM-DD` strings as days. -1 / 0 / 1. */
function compareIso(a: string, b: string): number {
  // Lexical compare on YYYY-MM-DD is equivalent to chronological compare.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Whole-day delta b - a (positive when b is later). Exported so the
 * Right Now card client island can reuse the same implementation
 * instead of duplicating it.
 */
export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.UTC(
    Number(aIso.slice(0, 4)),
    Number(aIso.slice(5, 7)) - 1,
    Number(aIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(bIso.slice(0, 4)),
    Number(bIso.slice(5, 7)) - 1,
    Number(bIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Whether at least one of the show's dates is parseable. The spec's
 * `dateless` is "no parseable show date at all"; `unknown` is "one or
 * more not parseable but at least one is."
 */
function countParseableDates(dates: ShowRow["dates"]): number {
  let count = 0;
  if (dates.travelIn) count += 1;
  if (dates.set) count += 1;
  for (const d of dates.showDays ?? []) {
    if (d) count += 1;
  }
  if (dates.travelOut) count += 1;
  return count;
}

/**
 * Whether every named date needed by the §8.2 state ladder is present.
 *
 * Codex round-22 MEDIUM: pre-fix this returned true when only
 * travelIn + travelOut were non-null, ignoring whether showDays
 * parsed. A sheet where show-day cells failed to parse but travel
 * dates did would still resolve confident states like
 * `pre_travel`/`travel_in_day`/`post_show`, masking the broken
 * sheet data. Per spec §8.2 line 2414 (`unknown` and `dateless`
 * are date-data fallbacks that override everything else), an
 * empty showDays array means the §8.2 state machine cannot
 * answer "is today a show day?" — and the user-visible failure
 * is rendering authoritative copy on top of incomplete data.
 *
 * `set` remains optional: some shows legitimately have load-in
 * and show on the same day with no separate set day. But every
 * show has at least one show day by definition; an empty
 * showDays is broken-sheet data, not a valid state.
 */
function hasFullDates(dates: ShowRow["dates"]): dates is {
  travelIn: string;
  set: string | null;
  showDays: string[];
  travelOut: string;
} {
  return (
    Boolean(dates.travelIn) &&
    Boolean(dates.travelOut) &&
    Array.isArray(dates.showDays) &&
    dates.showDays.length > 0
  );
}

/**
 * The state-machine selector. Pure: no `Date.now()`, no I/O.
 *
 *   today                  — wall-clock instant supplied by caller.
 *                            Converted to a `YYYY-MM-DD` key in the show
 *                            timezone before any comparison.
 *   dates                  — ShowRow.dates.
 *   viewerDateRestriction  — crew_members.date_restriction.
 *   options.timezone       — IANA tz name; defaults to America/New_York.
 */
export function selectRightNowState(
  today: Date,
  dates: ShowRow["dates"],
  viewerDateRestriction: DateRestriction,
  options?: { timezone?: string },
): RightNowState {
  const tz = options?.timezone && options.timezone.length > 0 ? options.timezone : DEFAULT_TIMEZONE;
  const todayIso = formatIsoForTimezone(today, tz);

  // ── §8.2 rows 11-12: date-data fallbacks override everything else ──
  // Spec line 2414: "`unknown` and `dateless` are date-data fallbacks
  // that override everything else." Evaluated FIRST so a sheet-broken
  // show never renders viewer_unconfirmed against missing dates.
  const parseable = countParseableDates(dates);
  if (parseable === 0) {
    return { kind: "dateless" };
  }
  if (!hasFullDates(dates)) {
    // At least one parsed but not all of {travelIn, travelOut} present.
    return { kind: "unknown" };
  }

  // From here, both travelIn AND travelOut are non-null strings. The
  // narrowing on hasFullDates above would normally suffice, but we
  // alias once for clarity through the rest of the ladder.
  const travelIn = dates.travelIn as string;
  const travelOut = dates.travelOut as string;
  const setDay = dates.set ?? null;
  const showDays = dates.showDays ?? [];

  // ── §8.2 row 1: viewer_unconfirmed (replaces every show-wide state) ──
  if (viewerDateRestriction.kind === "unknown_asterisk") {
    return { kind: "viewer_unconfirmed" };
  }

  // Pre-compute viewer-specific aggregates used by rows 2-4.
  const viewerDays = viewerDateRestriction.kind === "explicit" ? viewerDateRestriction.days : null;
  const viewerLastDay =
    viewerDays && viewerDays.length > 0 ? [...viewerDays].sort()[viewerDays.length - 1]! : null;
  const viewerFirstDay = viewerDays && viewerDays.length > 0 ? [...viewerDays].sort()[0]! : null;
  const todayInViewerDays = viewerDays !== null && viewerDays.includes(todayIso);

  // ── §8.2 row 2: viewer_after_last_day (BEFORE viewer_off_day) ──
  // Explicit days, today > max(viewer.days). Catches the "next assigned
  // day points at nothing" regression. Evaluated against viewerLastDay
  // alone — show span is irrelevant here per the spec wording.
  if (
    viewerDateRestriction.kind === "explicit" &&
    viewerLastDay !== null &&
    compareIso(todayIso, viewerLastDay) > 0
  ) {
    return { kind: "viewer_after_last_day", travelOut };
  }

  // ── §8.2 row 3: viewer_off_day ──
  // Explicit days, today NOT in days, today < max(days), today within
  // span [travelIn, travelOut]. nextAssignedDay = first viewer day >
  // today.
  if (
    viewerDateRestriction.kind === "explicit" &&
    viewerDays !== null &&
    !todayInViewerDays &&
    viewerLastDay !== null &&
    compareIso(todayIso, viewerLastDay) < 0 &&
    compareIso(todayIso, travelIn) >= 0 &&
    compareIso(todayIso, travelOut) <= 0
  ) {
    const sorted = [...viewerDays].sort();
    const next = sorted.find((d) => compareIso(d, todayIso) > 0);
    if (next) {
      return { kind: "viewer_off_day", nextAssignedDay: next };
    }
    // Fall through if for some reason no future day exists — shouldn't
    // happen given the viewer_after_last_day gate above, but defense in
    // depth.
  }

  // ── §8.2 row 4: viewer_off_day_pre ──
  // Explicit days, today BEFORE viewer's first assigned day AND today <
  // travelIn.
  if (
    viewerDateRestriction.kind === "explicit" &&
    viewerFirstDay !== null &&
    compareIso(todayIso, viewerFirstDay) < 0 &&
    compareIso(todayIso, travelIn) < 0
  ) {
    const daysAway = daysBetween(todayIso, viewerFirstDay);
    // Defense in depth: the `compareIso(todayIso, viewerFirstDay) < 0`
    // gate above guarantees daysAway >= 1, but assert so a future
    // refactor can't silently emit `daysAway: 0` (which would render
    // "Today" as the lead — wrong copy for an off-day pre state).
    if (daysAway < 1) {
      throw new Error(`viewer_off_day_pre invariant: daysAway must be >= 1 (got ${daysAway})`);
    }
    return {
      kind: "viewer_off_day_pre",
      firstAssignedDay: viewerFirstDay,
      daysAway,
    };
  }

  // The "viewer is unrestricted OR today is in viewer.days" gate that
  // every show-wide state below shares. The spec wording also notes
  // pre_travel explicitly admits "today is before viewer's first
  // assigned day" — but since the viewer_off_day_pre branch already
  // catches that case (and is more specific), reaching pre_travel here
  // implies the viewer is unrestricted OR the viewer has explicit days
  // that include today.
  const viewerAllowsShowState = viewerDateRestriction.kind === "none" || todayInViewerDays;

  // ── §8.2 row 5: pre_travel ──
  // The spec table reads "today < travelIn − 1 day", but the
  // immediately-preceding day (travelIn-1) carries the same intent
  // ("In 1 day · Travel in <weekday>") AND there is no row in §8.2
  // dedicated to T-1 — leaving it uncovered would produce an
  // `unknown`-fallback hole between pre_travel and travel_in_day.
  // We interpret the spec wording as inclusive at T-1 (daysAway >= 1)
  // so today=May31 / travelIn=Jun1 renders pre_travel{daysAway:1}.
  if (viewerAllowsShowState && daysBetween(todayIso, travelIn) >= 1) {
    return {
      kind: "pre_travel",
      travelIn,
      daysAway: daysBetween(todayIso, travelIn),
    };
  }

  // ── §8.2 row 6: travel_in_day ──
  if (viewerAllowsShowState && compareIso(todayIso, travelIn) === 0) {
    return { kind: "travel_in_day" };
  }

  // ── §8.2 row 7: set_day ──
  if (viewerAllowsShowState && setDay !== null && compareIso(todayIso, setDay) === 0) {
    return { kind: "set_day" };
  }

  // ── §8.2 row 8: show_day_n (parameterized) ──
  if (viewerAllowsShowState && showDays.length > 0) {
    const idx = showDays.findIndex((d) => compareIso(d, todayIso) === 0);
    if (idx >= 0) {
      return {
        kind: "show_day_n",
        n: idx + 1,
        total: showDays.length,
        isLast: idx === showDays.length - 1,
      };
    }
  }

  // ── §8.2 row 9: travel_out_day ──
  if (viewerAllowsShowState && compareIso(todayIso, travelOut) === 0) {
    return { kind: "travel_out_day" };
  }

  // ── §8.2 row 10: post_show ──
  // today > travelOut OR today > viewer's last assigned day. The
  // viewer-last-day branch is already covered by row 2
  // (viewer_after_last_day) above, so reaching here with an explicit
  // restriction implies today > travelOut as well.
  if (compareIso(todayIso, travelOut) > 0) {
    return { kind: "post_show", wrappedAt: travelOut };
  }

  // Catch-all — any combination not matched above (e.g., today inside
  // the show span on a day that isn't travelIn / set / a showDay /
  // travelOut, OR a restricted viewer whose today doesn't match any
  // gate above) renders as `unknown` so the card never goes blank.
  // Practically this is rare — schedule_phases plus the spec table
  // covers every common case — but the spec mandates non-empty card
  // content for any parseable date set.
  return { kind: "unknown" };
}
