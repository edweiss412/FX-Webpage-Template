/**
 * components/right-now/RightNowCard.tsx — the per-show hero card (M4
 * Task 4.11; spec §8.2; AC-4.3; PRODUCT.md "Aesthetic Direction").
 *
 * The hero element of the crew page. PRODUCT.md calls out the Right
 * Now card as the place where "expressive moments" live — every other
 * tile in M4 is restrained, but THIS card carries the FXAV orange
 * accent ON the active/live indicator, the tabular-figured "today"
 * line, and (in M4 Task 4.12) the crossfade body transitions.
 *
 * Why a client island?
 *
 *   `selectRightNowState(today, dates, viewerDateRestriction)` is
 *   pure (lib/time/rightNow.ts), but the card needs `today` to be
 *   live — so the body re-derives on every minute tick (day-rollover
 *   becomes automatic without a full page reload) AND so Playwright
 *   can pin `Date.now()` via `page.addInitScript` at test time. The
 *   server-rendered shell carries the page's data; the island carries
 *   the time-aware body.
 *
 *   Every OTHER tile stays a Server Component; this is the only
 *   `'use client'` boundary in M4.
 *
 * Animations: NONE in Task 4.11. Task 4.12 lands `framer-motion`
 * `AnimatePresence` + the 66-pair compound-transition matrix per
 * spec §8.2's "Compound transitions" table. This task ships the
 * static rendering.
 *
 * data-testid contract (e2e-stable):
 *   • right-now-card    — outer card wrapper (preserved from Task 4.2
 *                         placeholder; layout-dimensions task in 4.13
 *                         pins the card width here).
 *   • right-now-state   — current state.kind via `data-state="<kind>"`,
 *                         lets tests assert state without parsing copy.
 *   • right-now-lead    — primary-line element (e.g., "Today: Show
 *                         day 1 of 3"). The §8.2 spec right column
 *                         calls this the "lead phrase."
 *   • right-now-detail  — secondary-line element (e.g., "Hotel: …",
 *                         "Call: …"). May be absent when the §8.2
 *                         row has no body line beyond the lead.
 */
"use client";

import { useEffect, useState } from "react";
import {
  selectRightNowState,
  type RightNowState,
} from "@/lib/time/rightNow";
import { formatIsoDate } from "@/lib/format/date";
import type { RightNowContext } from "@/components/right-now/buildRightNowContext";

// Re-export for ergonomic imports (`import { ... } from
// '@/components/right-now/RightNowCard'`). The helper itself lives in
// a non-client file so Server Components can call it without dragging
// in the `'use client'` boundary.
export type { RightNowContext } from "@/components/right-now/buildRightNowContext";

/**
 * Format a relative-time phrase (e.g., "in 4 days", "3 days ago",
 * "tomorrow"). Tabular-friendly numbers; no em dashes per DESIGN.md
 * §9. Conservative — only the granularities the §8.2 body copy needs.
 */
function formatDaysAway(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

function formatDaysAgo(daysAgo: number): string {
  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";
  return `${daysAgo} days ago`;
}

/** Whole-day delta b - a (positive when b is later). */
function daysBetween(aIso: string, bIso: string): number {
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

/** Format the show's wall-clock day in the configured timezone. */
function isoToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type StateBody = {
  lead: string;
  detail: string | null;
  isStale: boolean;
};

/**
 * Render the §8.2 body text for the resolved state. Pure mapping from
 * RightNowState + context to display strings — keeps the JSX simple.
 */
function renderBody(
  state: RightNowState,
  ctx: RightNowContext,
  now: Date,
): StateBody {
  switch (state.kind) {
    case "viewer_unconfirmed":
      return {
        lead: "Your assigned days aren't confirmed yet",
        detail: "Check back after Doug finalizes the schedule.",
        isStale: false,
      };
    case "viewer_after_last_day":
      return {
        lead: "Your assignment is complete",
        detail: `Show wraps ${formatIsoDate(state.travelOut, "weekday-short")}.`,
        isStale: false,
      };
    case "viewer_off_day": {
      const todayIso = isoToday(now, ctx.timezone);
      const daysAway = daysBetween(todayIso, state.nextAssignedDay);
      return {
        lead: "Not scheduled today",
        detail: `Your next assigned day: ${formatIsoDate(state.nextAssignedDay, "weekday-short")} (${formatDaysAway(daysAway)}).`,
        isStale: false,
      };
    }
    case "viewer_off_day_pre":
      return {
        lead: `${formatDaysAway(state.daysAway).replace(/^./, (c) => c.toUpperCase())}`,
        detail: `Your first day: ${formatIsoDate(state.firstAssignedDay, "weekday-short")}.`,
        isStale: false,
      };
    case "pre_travel":
      return {
        lead: `${formatDaysAway(state.daysAway).replace(/^./, (c) => c.toUpperCase())} until travel in`,
        detail: ctx.hotelName ? `Hotel: ${ctx.hotelName}` : null,
      isStale: false,
    };
    case "travel_in_day":
      return {
        lead: "Today: Travel in",
        detail: ctx.hotelName
          ? ctx.hotelCheckInTime
            ? `Hotel check-in: ${ctx.hotelName}, ${ctx.hotelCheckInTime}`
            : `Hotel check-in: ${ctx.hotelName}`
          : null,
        isStale: false,
      };
    case "set_day":
      return {
        lead: "Today: Set day",
        detail: ctx.venueName
          ? ctx.loadInTime
            ? `Load-in: ${ctx.loadInTime} at ${ctx.venueName}`
            : `Load-in at ${ctx.venueName}`
          : ctx.loadInTime
            ? `Load-in: ${ctx.loadInTime}`
            : null,
        isStale: false,
      };
    case "show_day_n": {
      const lead = `Today: Show day ${state.n} of ${state.total}`;
      const callPart = ctx.callTime
        ? ctx.roomName
          ? `Call: ${ctx.callTime} (${ctx.roomName})`
          : `Call: ${ctx.callTime}`
        : null;
      const strikePart =
        state.isLast && ctx.strikeTime ? `Strike: ${ctx.strikeTime}` : null;
      const detail =
        callPart && strikePart
          ? `${callPart}. ${strikePart}.`
          : callPart ?? strikePart ?? null;
      return { lead, detail, isStale: false };
    }
    case "travel_out_day":
      return {
        lead: "Today: Travel out",
        detail: ctx.hotelName
          ? ctx.hotelCheckOutTime
            ? `Hotel check-out: ${ctx.hotelName}, ${ctx.hotelCheckOutTime}`
            : `Hotel check-out: ${ctx.hotelName}`
          : null,
        isStale: false,
      };
    case "post_show": {
      const todayIso = isoToday(now, ctx.timezone);
      const daysAgo = daysBetween(state.wrappedAt, todayIso);
      return {
        lead: `Wrapped ${formatDaysAgo(daysAgo)}`,
        detail: null,
        isStale: false,
      };
    }
    case "unknown": {
      const ti = ctx.dates.travelIn
        ? formatIsoDate(ctx.dates.travelIn, "weekday-short")
        : "—";
      const to = ctx.dates.travelOut
        ? formatIsoDate(ctx.dates.travelOut, "weekday-short")
        : "—";
      return {
        lead: ctx.showTitle,
        detail: `Show details: ${ti} to ${to}`,
        isStale: false,
      };
    }
    case "dateless":
      return {
        lead: "Show details unavailable",
        detail: "Check the sheet's DATES block.",
        isStale: true,
      };
  }
}

type RightNowCardProps = {
  context: RightNowContext;
};

/**
 * Hero card. Time-aware via a 60-second tick that re-derives the
 * state from a fresh `new Date()` (day-rollover becomes automatic).
 * Render-time `Date.now()` is captured in `useState` initial so the
 * very first paint already has a real value (no SSR flash to a stub
 * state).
 */
export function RightNowCard({ context }: RightNowCardProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    // 60-second tick. Keeps the card "live" without spamming React.
    // Day-rollover crossfade is Task 4.12's job; here we just re-
    // derive state on tick so the body stays current. interval is
    // cleared on unmount.
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const state = selectRightNowState(now, context.dates, context.dateRestriction, {
    timezone: context.timezone,
  });
  const body = renderBody(state, context, now);

  // Stale-tint applies only to the `dateless` state per §8.2 last
  // row. Default surface for every other state. Defense-in-depth: we
  // read body.isStale rather than match state.kind here so a future
  // §8.2 row that adopts the stale tint (e.g., a sync-error variant
  // in M6) flips by setting isStale, not by re-grepping a kind list.
  const surfaceClass = body.isStale ? "bg-stale-tint" : "bg-surface";

  return (
    <section
      data-testid="right-now-card"
      aria-label="Right now"
      className={[
        "rounded-md border border-border p-6",
        "shadow-(--shadow-tile)",
        surfaceClass,
      ].join(" ")}
    >
      {/* Eyebrow — FXAV orange dot + "RIGHT NOW" lockup. The single
          accent surface in the card per DESIGN.md §1 (orange ≤10% of
          viewport). The dot uses bg-accent (full orange) at 6px; the
          uppercase label uses text-accent-on-bg for AA body contrast
          on light bg. */}
      <p
        data-testid="right-now-state"
        data-state={state.kind}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-on-bg"
      >
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-pill bg-accent"
        />
        Right now
      </p>

      {/* Lead phrase — the §8.2 right-column primary line. text-3xl
          per DESIGN.md §2.2 ("--text-3xl: The Right Now card primary
          line"). Tabular figures are inherited at the smallest
          semantic boundary on numbers below; the lead string itself
          uses default proportional metrics for letter shapes but
          tabular for any embedded numerals via tabular-nums on
          numeric spans where applicable. */}
      <h2
        data-testid="right-now-lead"
        className="mt-3 text-2xl font-bold leading-tight tracking-tight text-text-strong sm:text-3xl tabular-nums"
      >
        {body.lead}
      </h2>

      {body.detail ? (
        <p
          data-testid="right-now-detail"
          className="mt-2 text-base text-text-subtle tabular-nums"
        >
          {body.detail}
        </p>
      ) : null}
    </section>
  );
}
