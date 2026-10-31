"use client";
/**
 * components/crew/CrewDayRow.tsx: the crew home's day row (crew page redesign
 * spec §4.2, §7, §8 item 1, §9.1, §9.4).
 *
 * A row of the days this viewer may see, above the pass, atop the Today block
 * in both modes. It writes the page's day selection (`daySelection.tsx`):
 *   - `live` presses today's button when today is in the set, and the "Now"
 *     button (first in the row, rendered only when today is not in the set)
 *     otherwise;
 *   - tapping another day selects `day(iso)`; tapping today's button or "Now"
 *     returns to `live`.
 *
 * Its props are built on the server (`buildDayRowProps`, lib/crew/passModel.ts)
 * and carry the day set and its labels only. Which day is today comes from the
 * shared crew clock (`useCrewClock`) in the show's timezone, so at midnight the
 * pressed Today button moves, and "Now" comes or goes, with no remount and no
 * animation (spec §7: "Now" present or absent is instant).
 *
 * Layout counts buttons, not days: up to 4 (days plus "Now") sit in an
 * equal-width grid, 5 or more scroll horizontally with snapping, and on mount
 * the pressed day, or in `live` with no pressed day the next day still ahead, is
 * scrolled into view; after the show none is, and the row stays at its start,
 * where the pressed "Now" sits. Every button is at least 44px tall and 64px wide.
 *
 * The pressed state changes background and text colour over `--duration-fast`
 * (the `duration-fast` utility chains to the token, which reduced motion sets to
 * 0ms, app/globals.css).
 */
import { useEffect, useRef, useState } from "react";

import { useDaySelection } from "@/components/crew/daySelection";
import { useCrewClock } from "@/components/crew/useCrewClock";
import type { DayRowDay, DayRowProps } from "@/lib/crew/passModel";
import { formatIsoForTimezone } from "@/lib/time/rightNow";
import { cn } from "@/lib/ui/cn";

/** Up to this many buttons share one equal-width grid; more scroll (spec §4.2). */
const GRID_MAX_BUTTONS = 4;

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const NOW_NAME = "Now, your live status";

/**
 * The first day after today, or null when none is (the show is over). There is
 * no fallback to the last day: centring a past day scrolled the pressed "Now",
 * which sits first, off the row (critique F5). With no target the row stays at
 * its start, where "Now" is.
 */
function nearestUpcoming(days: readonly DayRowDay[], todayIso: string): string | null {
  return days.find((d) => d.iso > todayIso)?.iso ?? null;
}

export function CrewDayRow({ timezone, days }: DayRowProps) {
  const now = useCrewClock();
  const todayIso = formatIsoForTimezone(now, timezone);
  const { selection, selectDay, selectLive } = useDaySelection();

  const todayInSet = days.some((d) => d.iso === todayIso);
  // `day(today)` is `live`: today's button plays the live role (spec §4.2). A
  // selection made yesterday becomes today's at midnight; it reads as live here
  // at once and the effect below settles the store to match.
  const live = selection.kind === "live" || selection.iso === todayIso;
  const pressedIso = live ? (todayInSet ? todayIso : null) : selection.iso;
  useEffect(() => {
    if (selection.kind === "day" && selection.iso === todayIso) selectLive();
  }, [selection, todayIso, selectLive]);

  const count = days.length + (todayInSet ? 0 : 1);
  const scroll = count > GRID_MAX_BUTTONS;

  // On mount only (spec §4.2): bring the pressed day, or the nearest upcoming
  // one, into view. Later changes (a tap, midnight) never move the row. Only the
  // row scrolls, centring the target: `scrollIntoView` would also scroll the
  // page, undoing a wide deep link's scroll or moving a page the sheet locked.
  const rowRef = useRef<HTMLDivElement>(null);
  const [mountTarget] = useState(() =>
    scroll ? (pressedIso ?? nearestUpcoming(days, todayIso)) : null,
  );
  useEffect(() => {
    const row = rowRef.current;
    const target = mountTarget === null ? null : row?.querySelector(`[data-day="${mountTarget}"]`);
    if (!row || !target) return;
    const rowBox = row.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    row.scrollLeft += box.left + box.width / 2 - (rowBox.left + rowBox.width / 2);
  }, [mountTarget]);

  const buttonClass = (pressed: boolean) =>
    cn(
      "flex min-h-tap-min min-w-16 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 text-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
      scroll ? "shrink-0 snap-start self-stretch" : "h-full",
      pressed
        ? "border-text bg-text text-bg"
        : "border-text-faint bg-surface text-text hover:border-text-subtle",
    );
  const caption = (pressed: boolean) =>
    cn("transition-colors duration-fast", pressed ? null : "text-text-subtle");

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Show days"
      data-testid="crew-day-row"
      data-layout={scroll ? "scroll" : "grid"}
      className={
        scroll
          ? // The padding keeps focus rings inside the scroller, which clips them.
            "-m-1 flex snap-x snap-mandatory scroll-px-1 items-stretch gap-2 overflow-x-auto p-1"
          : cn("grid items-stretch gap-2", GRID_COLS[count])
      }
    >
      {todayInSet ? null : (
        <button
          type="button"
          data-testid="crew-day-now"
          aria-pressed={live}
          aria-label={NOW_NAME}
          onClick={selectLive}
          className={buttonClass(live)}
        >
          <span className="text-lg/tight font-bold">Now</span>
        </button>
      )}
      {days.map((day) => {
        const isToday = day.iso === todayIso;
        const pressed = day.iso === pressedIso;
        return (
          <button
            key={day.iso}
            type="button"
            data-testid="crew-day-button"
            data-day={day.iso}
            aria-pressed={pressed}
            // Spec §9.4's name, with "Today" leading on today's button so the
            // name carries the word the button shows (WCAG 2.5.3).
            aria-label={isToday ? `Today, ${day.name}` : day.name}
            onClick={() => (isToday ? selectLive() : selectDay(day.iso))}
            className={buttonClass(pressed)}
          >
            <span
              data-part="weekday"
              className={cn("text-xs font-semibold uppercase tracking-eyebrow", caption(pressed))}
            >
              {isToday ? "Today" : day.weekday}
            </span>
            <span data-part="day" className="text-lg/tight font-bold tabular-nums">
              {day.day}
            </span>
            <span data-part="label" className={cn("text-xs/tight", caption(pressed))}>
              {day.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
