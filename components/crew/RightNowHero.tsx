/**
 * components/crew/RightNowHero.tsx — crew-redesign §4.3 / §4.16.
 *
 * `RightNowHero` IS `RightNowCard` re-skinned into the mock's five-slot hero
 * (§4.16): eyebrow (+ live-dot when "now"), lead, detail, progress (segments),
 * stats (≤3 key-values, one accented). It consumes the SAME `selectRightNowState`
 * machine and a `RightNowContext` and carries `RightNowCard`'s clock +
 * state-derivation + `lastGood`/`morph-to-last-good` + `transitionTreatment` +
 * `prefersReducedMotion` machinery VERBATIM (`RightNowCard.tsx:355-664`). Only
 * the body slotting changes — the state machine is NOT re-implemented (§4.16).
 *
 * Props: `{ context }` ONLY. No `state`, no `initialNow`, no server seed. The
 * hero owns the live `new Date()` clock (the `RightNowCard` pattern); it does
 * NOT call `nowDate()` (server-only). Screenshot determinism comes from the
 * capture harness freezing the browser clock (§4.11), exactly as `RightNowCard`
 * requires today.
 *
 * §4.3 12-state map drives the eyebrow / lead / progress / stats per state.
 * §4.8 two-level stat omission: each stat with a null/empty/non-finite value is
 * hidden individually; if ALL stats are hidden the strip is omitted entirely.
 *
 * Degraded states (`dateless`/`unknown`/`viewer_unconfirmed`) carry the stale
 * tint (`data-degraded="true"`) and render eyebrow + lead only — NO stats, NO
 * progress, no fallback copy replacing omitted stats (§4.16).
 *
 * data-testid / hook contract:
 *   • right-now-hero      — outer wrapper (also carries data-degraded,
 *                           data-prefers-reduced-motion).
 *   • right-now-state     — hidden marker (data-state / data-rendered-state /
 *                           data-treatment), mirroring RightNowCard.
 *   • right-now-eyebrow   — eyebrow slot (live-dot is a child when "now").
 *   • right-now-body      — keyed AnimatePresence child (lead + detail).
 *   • right-now-lead      — lead slot.
 *   • right-now-detail    — detail slot (absent when the state has no detail).
 *   • right-now-progress  — progress slot; N `[data-segment]` children.
 *   • right-now-stats     — stats strip; omitted entirely when empty.
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import {
  daysBetween,
  formatIsoForTimezone,
  selectRightNowState,
  type RightNowState,
} from "@/lib/time/rightNow";
import { transitionTreatment, type TransitionTreatment } from "@/lib/time/rightNowTransitions";
import { todayShowAnchors } from "@/lib/crew/agendaDisplay";
import { formatIsoDate } from "@/lib/format/date";
import type { RightNowContext } from "@/components/right-now/buildRightNowContext";

/**
 * Format a relative-time phrase (no em dashes per DESIGN.md §9). Mirrors
 * RightNowCard's helpers so the lead/detail copy stays byte-identical where
 * the §4.3 map reuses the existing phrasing.
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

/** One stat key-value. `accent` marks the single accented stat (§4.3). */
type HeroStat = { label: string; value: string | number; accent?: boolean };

/** The five §4.16 hero slots, resolved per state. */
type HeroBody = {
  /** Eyebrow text (§4.3 column 1). */
  eyebrow: string;
  /** Whether the live-dot renders (eyebrow "+dot" rows — the "Today"/now states). */
  live: boolean;
  /** Lead phrase (§4.3 column 2). */
  lead: string;
  /** Optional secondary line. */
  detail: ReactNode;
  /** Progress segment count (show_day_n only); null = no progress slot. */
  progressTotal: number | null;
  /** Active (1-based) progress segment, when progressTotal is set. */
  progressActive: number | null;
  /** Stats before the §4.8 omission filter. */
  stats: ReadonlyArray<HeroStat>;
  /** Intrinsic stale flag (the `dateless` body). */
  isStale: boolean;
};

/**
 * The §8.2 "degraded zone" — kinds where the date-data fallback path is active
 * (carried verbatim from RightNowCard). Used for the directional `lastGood`
 * refinement: render lastGood ONLY while still inside the degraded zone.
 */
function isDegradedState(kind: RightNowState["kind"]): boolean {
  return kind === "unknown" || kind === "dateless";
}

/**
 * §4.3 degraded set for the VISUAL stale-tint hook + stats suppression. Wider
 * than `isDegradedState`: `viewer_unconfirmed` is a degraded-tint state in the
 * §4.3 map (eyebrow + lead only, no stats) even though the §8.2 transition
 * machine does not treat it as a `morph-to-last-good` endpoint.
 */
function isHeroDegraded(kind: RightNowState["kind"]): boolean {
  return kind === "unknown" || kind === "dateless" || kind === "viewer_unconfirmed";
}

/** Coerce a candidate stat value to a renderable stat or null (§4.8 level-one). */
function statOrNull(
  label: string,
  value: string | number | null,
  accent?: boolean,
): HeroStat | null {
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
  } else if (value.trim().length === 0) {
    return null;
  }
  return accent ? { label, value, accent: true } : { label, value };
}

/**
 * Map a resolved RightNowState + context to the five hero slots per §4.3.
 * Pure. Stats are returned UN-filtered here; the §4.8 omission filter runs in
 * the component so the empty-list-collapses-strip rule stays a single place.
 */
function renderHeroBody(state: RightNowState, ctx: RightNowContext, now: Date): HeroBody {
  const base = {
    progressTotal: null as number | null,
    progressActive: null as number | null,
    stats: [] as ReadonlyArray<HeroStat>,
    isStale: false,
  };
  switch (state.kind) {
    case "show_day_n": {
      // Select the call-time from the per-day Show anchors by the CLIENT-computed
      // show-tz `todayIso` (mirrors :215) so a 60s-tick / visibilitychange
      // re-derive picks the new day after a show-tz midnight rollover (no stale
      // freeze). Uses the shared §5.4 `todayShowAnchors` filter.
      //
      // "Omit rather than cross-label" (cross-task composition contract): when
      // per-day anchors EXIST but none match today (the date-safe resolver
      // intentionally omitted today's anchor — e.g. a contentful-unparsed Day 2
      // whose room show_time date doesn't match Day 2), the Show stat is OMITTED
      // (null → statOrNull hides it). It must NOT fall back to `ctx.callTime`,
      // which is the FIRST/Day-1 anchor and would mislabel Day 1's time as
      // today's. The `ctx.callTime` fallback applies ONLY in the legacy
      // single-anchor case where there are NO per-day anchors at all
      // (`ctx.showAnchors.length === 0`).
      const todayIso = formatIsoForTimezone(now, ctx.timezone);
      const showTime =
        todayShowAnchors(ctx.showAnchors, todayIso)[0]?.time ??
        (ctx.showAnchors.length === 0 ? ctx.callTime : null);
      const stats = [
        statOrNull("Show", showTime, true),
        state.isLast ? statOrNull("Strike", ctx.strikeTime) : null,
      ].filter((s): s is HeroStat => s !== null);
      return {
        ...base,
        eyebrow: "Today",
        live: true,
        lead: `Today: Show day ${state.n} of ${state.total}`,
        detail: null,
        progressTotal: state.total,
        progressActive: state.n,
        stats,
      };
    }
    case "travel_in_day": {
      const stats = [
        statOrNull("Hotel", ctx.hotelName),
        statOrNull("Check in", ctx.hotelCheckInTime),
        statOrNull("Check out", ctx.hotelCheckOutTime),
      ].filter((s): s is HeroStat => s !== null);
      return {
        ...base,
        eyebrow: "Today",
        live: true,
        lead: "Today: Travel in",
        detail: null,
        stats,
      };
    }
    case "set_day": {
      const stats = [statOrNull("Set", ctx.loadInTime, true)].filter(
        (s): s is HeroStat => s !== null,
      );
      return {
        ...base,
        eyebrow: "Today",
        live: true,
        lead: "Today: Set / load-in",
        detail: null,
        stats,
      };
    }
    case "travel_out_day": {
      const stats = [
        statOrNull("Hotel", ctx.hotelName),
        statOrNull("Check in", ctx.hotelCheckInTime),
        statOrNull("Check out", ctx.hotelCheckOutTime),
      ].filter((s): s is HeroStat => s !== null);
      return {
        ...base,
        eyebrow: "Today",
        live: true,
        lead: "Travel out today",
        detail: null,
        stats,
      };
    }
    case "pre_travel": {
      const stats = [
        statOrNull("Days away", state.daysAway, true),
        statOrNull("Travel in", formatIsoDate(state.travelIn, "weekday-short")),
      ].filter((s): s is HeroStat => s !== null);
      return {
        ...base,
        eyebrow: "Up next",
        live: false,
        lead: `${formatDaysAway(state.daysAway).replace(/^./, (c) => c.toUpperCase())} until travel in`,
        detail: null,
        stats,
      };
    }
    case "viewer_off_day": {
      const todayIso = formatIsoForTimezone(now, ctx.timezone);
      const daysAway = daysBetween(todayIso, state.nextAssignedDay);
      return {
        ...base,
        eyebrow: "Today",
        live: true,
        lead: "Not scheduled today",
        detail: (
          <>
            Your next assigned day:{" "}
            <time dateTime={state.nextAssignedDay}>
              {formatIsoDate(state.nextAssignedDay, "weekday-short")}
            </time>{" "}
            ({formatDaysAway(daysAway)}).
          </>
        ),
      };
    }
    case "viewer_off_day_pre":
      return {
        ...base,
        eyebrow: "Up next",
        live: false,
        lead: "Not scheduled yet",
        detail: (
          <>
            Your first day:{" "}
            <time dateTime={state.firstAssignedDay}>
              {formatIsoDate(state.firstAssignedDay, "weekday-short")}
            </time>{" "}
            ({formatDaysAway(state.daysAway)}).
          </>
        ),
      };
    case "viewer_after_last_day":
      return {
        ...base,
        eyebrow: "Wrapped for you",
        live: false,
        lead: "Your days are done",
        detail: (
          <>
            Show wraps{" "}
            <time dateTime={state.travelOut}>
              {formatIsoDate(state.travelOut, "weekday-short")}
            </time>
            .
          </>
        ),
      };
    case "post_show": {
      const todayIso = formatIsoForTimezone(now, ctx.timezone);
      const daysAgo = daysBetween(state.wrappedAt, todayIso);
      return {
        ...base,
        eyebrow: "Show complete",
        live: false,
        lead: "That's a wrap",
        detail: `Wrapped ${formatDaysAgo(daysAgo)}.`,
      };
    }
    case "viewer_unconfirmed":
      return {
        ...base,
        eyebrow: "Heads up",
        live: false,
        lead: "Your days aren't confirmed yet",
        detail: "Check back after Doug finalizes the schedule.",
      };
    case "unknown":
      return {
        ...base,
        eyebrow: "Show details",
        live: false,
        lead: "Dates aren't finalized",
        detail: ctx.showTitle,
      };
    case "dateless":
      return {
        ...base,
        eyebrow: "Show details",
        live: false,
        lead: "Show details unavailable",
        detail: "Check the sheet's DATES block.",
        isStale: true,
      };
  }
}

type RightNowHeroProps = {
  context: RightNowContext;
};

/**
 * Hero. Time-aware via a 60-second tick that re-derives the state from a fresh
 * `new Date()` (day-rollover becomes automatic). Render-time `new Date()` is
 * captured in `useState` initial so the very first paint already has a real
 * value (no SSR flash to a stub state). Carried verbatim from RightNowCard.
 */
export function RightNowHero({ context }: RightNowHeroProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  // §4.3 prefers-reduced-motion: framer-motion does NOT consume the CSS
  // `--duration-*` custom properties, and framer's own `useReducedMotion()`
  // misses the INITIAL matchMedia value. The shared matchMedia-on-mount hook
  // resolves the real preference; `null` (SSR + first client render) is
  // treated as "unknown — animate at full duration" for first-paint
  // consistency. (Verbatim from RightNowCard; M12.11 trap.)
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // 60-second tick keeps the hero "live"; cleared on unmount. Visibility
    // bump recovers from background-tab setInterval throttling.
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const onVisibility = () => {
      if (!document.hidden) setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const state = selectRightNowState(now, context.dates, context.dateRestriction, {
    timezone: context.timezone,
  });
  const body = renderHeroBody(state, context, now);

  // ── lastGood / morph-to-last-good tracker (verbatim from RightNowCard) ──
  const [tracked, setTracked] = useState<{
    prevKind: RightNowState["kind"];
    currentKind: RightNowState["kind"];
    lastGoodState: RightNowState;
    lastGoodBody: HeroBody;
  }>(() => ({
    prevKind: state.kind,
    currentKind: state.kind,
    lastGoodState: state,
    lastGoodBody: body,
  }));

  if (state.kind !== tracked.currentKind) {
    // Read the matrix BEFORE the setState so the still-stale tracker tells us
    // whether the upcoming transition is morph-to-last-good entering the
    // degraded zone (hold the prior payload until recovery).
    const willBeStale =
      transitionTreatment(tracked.currentKind, state.kind) === "morph-to-last-good" &&
      isDegradedState(state.kind);
    setTracked({
      prevKind: tracked.currentKind,
      currentKind: state.kind,
      lastGoodState: willBeStale ? tracked.lastGoodState : state,
      lastGoodBody: willBeStale ? tracked.lastGoodBody : body,
    });
  }

  const effectivePrev = state.kind !== tracked.currentKind ? tracked.currentKind : tracked.prevKind;
  const effectiveCurrent = state.kind;
  const kindEnteringStaleZone =
    state.kind !== tracked.currentKind &&
    transitionTreatment(tracked.currentKind, state.kind) === "morph-to-last-good" &&
    isDegradedState(state.kind);
  const effectiveLastGoodState =
    state.kind !== tracked.currentKind && !kindEnteringStaleZone ? state : tracked.lastGoodState;
  const effectiveLastGoodBody =
    state.kind !== tracked.currentKind && !kindEnteringStaleZone ? body : tracked.lastGoodBody;

  const rawTreatment: TransitionTreatment | null = transitionTreatment(
    effectivePrev,
    effectiveCurrent,
  );
  const treatment: TransitionTreatment =
    rawTreatment === null ? "instant" : rawTreatment === "unreachable" ? "instant" : rawTreatment;

  const showLastGood = treatment === "morph-to-last-good" && isDegradedState(state.kind);
  const renderState = showLastGood ? effectiveLastGoodState : state;
  const renderBodyResolved = showLastGood ? effectiveLastGoodBody : body;
  const isStale = showLastGood || body.isStale;

  // Diagnostic side-effect for matrix-violating transitions (admin-only;
  // never user-visible). Verbatim from RightNowCard.
  useEffect(() => {
    if (rawTreatment === "unreachable") {
      console.error(
        `[RightNowHero] §8.2 unreachable transition fired: ${effectivePrev} → ${effectiveCurrent}. ` +
          `This violates lib/time/rightNowTransitions.ts assumptions; please open a bug.`,
      );
    }
  }, [rawTreatment, effectivePrev, effectiveCurrent]);

  // §4.3 visual degraded hook: stale tint + stats suppression for the wider
  // hero-degraded set (includes viewer_unconfirmed), OR an active stale morph,
  // OR the intrinsic dateless body.
  const degraded = isHeroDegraded(renderState.kind) || isStale;
  const surfaceClass = degraded ? "bg-stale-tint" : "bg-surface";

  // §4.8 two-level stat omission. Per-stat values are pre-filtered in
  // renderHeroBody (statOrNull); here the degraded-set suppresses all stats and
  // the empty-list rule collapses the strip.
  const stats = isHeroDegraded(renderState.kind) ? [] : renderBodyResolved.stats;
  const showStats = stats.length > 0;

  const showProgress =
    !isHeroDegraded(renderState.kind) &&
    renderBodyResolved.progressTotal !== null &&
    renderBodyResolved.progressTotal > 0;

  const motionProps =
    treatment === "crossfade-body"
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: {
            duration: prefersReducedMotion === true ? 0 : 0.22,
            ease: [0.25, 1, 0.5, 1] as [number, number, number, number],
          },
        }
      : {
          // morph-to-last-good + instant: no body crossfade. The motion.div
          // still mounts so AnimatePresence keys stay stable (no DOM thrash).
          initial: false as const,
          animate: { opacity: 1 },
          exit: { opacity: 1 },
          transition: { duration: 0 },
        };

  return (
    <section
      data-testid="right-now-hero"
      data-degraded={degraded ? "true" : "false"}
      data-stale={isStale ? "true" : "false"}
      data-prefers-reduced-motion={
        prefersReducedMotion === true
          ? "true"
          : prefersReducedMotion === false
            ? "false"
            : "unknown"
      }
      aria-label="Right now"
      className={[
        "w-full rounded-md border border-border p-6",
        "shadow-tile",
        // Holds card height fixed during the §4.3 crossfade (§4.16 invariant:
        // 176px constant through a state crossfade).
        "min-h-(--spacing-right-now-min-h)",
        "flex flex-col",
        surfaceClass,
      ].join(" ")}
    >
      {/* Eyebrow — live-dot renders only for "now" states (§4.3 "+dot"). The
          dot is the single accent surface (DESIGN.md §1, orange ≤10%). */}
      <p
        data-testid="right-now-eyebrow"
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-eyebrow-strong text-accent-on-bg"
      >
        {renderBodyResolved.live ? (
          <span
            data-testid="right-now-live-dot"
            aria-hidden="true"
            className="inline-block size-1.5 rounded-pill bg-accent"
          />
        ) : null}
        {renderBodyResolved.eyebrow}
      </p>
      <span
        data-testid="right-now-state"
        data-state={state.kind}
        data-rendered-state={renderState.kind}
        data-treatment={treatment}
        hidden
        aria-hidden="true"
      />

      {/* §4.3 body crossfade. AnimatePresence mode="wait" initial={false}
          (verbatim from RightNowCard); keyed by renderState.kind so the body
          rebuilds on swap (NOT state.kind — during morph-to-last-good,
          renderState.kind === lastGoodKind so the body does not unmount on the
          kind flip). The container min-h holds height through the crossfade. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={renderState.kind} data-testid="right-now-body" {...motionProps}>
          <h2
            data-testid="right-now-lead"
            className="mt-3 text-2xl font-bold leading-tight tracking-tight text-text-strong sm:text-3xl tabular-nums"
          >
            {renderBodyResolved.lead}
          </h2>

          {renderBodyResolved.detail ? (
            <p
              data-testid="right-now-detail"
              className="mt-2 text-base text-text-subtle tabular-nums"
            >
              {renderBodyResolved.detail}
            </p>
          ) : null}

          {/* Progress segments — show_day_n only. N segments from `total`;
              the first `progressActive` segments carry the accent. */}
          {showProgress ? (
            <div
              data-testid="right-now-progress"
              role="img"
              aria-label={`Show day ${renderBodyResolved.progressActive} of ${renderBodyResolved.progressTotal}`}
              className="mt-4 flex items-stretch gap-1.5"
            >
              {Array.from({ length: renderBodyResolved.progressTotal as number }).map((_, i) => {
                const active =
                  renderBodyResolved.progressActive !== null &&
                  i < renderBodyResolved.progressActive;
                return (
                  <span
                    key={i}
                    data-segment={i}
                    data-segment-active={active ? "true" : "false"}
                    aria-hidden="true"
                    className={[
                      "h-1.5 flex-1 rounded-pill",
                      active ? "bg-accent" : "bg-border",
                    ].join(" ")}
                  />
                );
              })}
            </div>
          ) : null}

          {/* §4.16 stats slot — ≤3 key-values, one accented. Omitted entirely
              when empty (§4.8 level-two). */}
          {showStats ? (
            <dl data-testid="right-now-stats" className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {stats.slice(0, 3).map((stat) => (
                <div
                  key={stat.label}
                  data-stat={stat.label}
                  data-stat-accent={stat.accent ? "true" : "false"}
                  className="flex flex-col"
                >
                  <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                    {stat.label}
                  </dt>
                  <dd
                    className={[
                      "text-sm font-semibold tabular-nums",
                      stat.accent ? "text-accent-on-bg" : "text-text-strong",
                    ].join(" ")}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
