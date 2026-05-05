/**
 * components/right-now/RightNowCard.tsx — the per-show hero card (M4
 * Task 4.11 + 4.12; spec §8.2; AC-4.3; PRODUCT.md "Aesthetic Direction").
 *
 * The hero element of the crew page. PRODUCT.md calls out the Right
 * Now card as the place where "expressive moments" live — every other
 * tile in M4 is restrained, but THIS card carries the FXAV orange
 * accent ON the active/live indicator, the tabular-figured "today"
 * line, and the §8.2 `AnimatePresence` body crossfades.
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
 * §8.2 transition contract (Task 4.12 Batch 2):
 *
 *   The matrix in `lib/time/rightNowTransitions.ts` enumerates 66
 *   pairwise transitions with one of four treatments — `crossfade-body`,
 *   `morph-to-last-good`, `instant`, `unreachable`. We render the
 *   resolved treatment via `transitionTreatment(prev.kind, current.kind)`
 *   and dispatch:
 *
 *     • `crossfade-body`     → `<motion.div key={kind}>` opacity 0→1 in
 *                              an `<AnimatePresence mode="wait">` so the
 *                              outgoing body fully exits before the new
 *                              one enters. 220ms via `--duration-normal`
 *                              with `--ease-out-quart`.
 *     • `morph-to-last-good` → no body swap. The card surface flips to
 *                              `bg-stale-tint`; we keep rendering the
 *                              previous payload (the "last good"). When
 *                              the next tick recovers, the same matrix
 *                              entry plays in reverse — tint comes off,
 *                              body unchanged.
 *     • `instant`            → `initial={false}` so the body swaps with
 *                              no animation. (No matrix entry currently
 *                              uses this; kept for future extensions.)
 *     • `unreachable`        → fail-open to `instant` AND emit a
 *                              `console.error` so the audit suite catches
 *                              regressions. (Per dispatch spec — admin-
 *                              only diagnostic, never user-visible.)
 *
 *   The container carries `min-h-right-now-min-h` so the
 *   crossfade does not jiggle card height between bodies of different
 *   intrinsic heights — the §8.4 "min-height: 96px to prevent sub-card
 *   collapse" invariant generalized to the largest §8.2 body (`unknown`
 *   two-line detail, tuned to 176px on the 390px mobile viewport).
 *
 *   `prefers-reduced-motion` is honored automatically — the
 *   `--duration-*` tokens collapse to 0ms in `app/globals.css` under
 *   `@media (prefers-reduced-motion: reduce)`, so the same JSX renders
 *   instant swaps for users who opt out.
 *
 * data-testid contract (e2e-stable):
 *   • right-now-card    — outer card wrapper.
 *   • right-now-state   — carries the resolved-state attributes:
 *                           - `data-state="<kind>"` is the kind that the
 *                             state machine resolved to from the latest
 *                             clock tick + viewer inputs. This is the
 *                             AUTHORITATIVE state and may be `unknown`
 *                             or `dateless` even when the body shows
 *                             prior-payload copy.
 *                           - `data-rendered-state="<kind>"` is the kind
 *                             whose body is actually painted. Differs
 *                             from `data-state` ONLY during the
 *                             `morph-to-last-good` treatment, where the
 *                             card keeps rendering the last-good payload
 *                             while `state.kind` flips to `unknown` or
 *                             `dateless`. Test code asserting "what is
 *                             the user looking at" should read this
 *                             attribute; test code asserting "what did
 *                             the state machine resolve" should read
 *                             `data-state`.
 *                           - `data-treatment="<treatment>"` carries
 *                             the treatment of the MOST-RECENT kind
 *                             transition (`crossfade-body`,
 *                             `morph-to-last-good`, `instant`). The
 *                             attribute is intentionally STICKY once a
 *                             non-`instant` transition fires — it
 *                             reflects what was used to swap the body,
 *                             not whether an animation is currently in
 *                             flight. Tests asserting "the matrix-
 *                             driven treatment was honored" read this
 *                             attribute; tests asserting "is the card
 *                             currently animating" should observe the
 *                             `motion.div` directly via framer-motion's
 *                             AnimatePresence mount/unmount lifecycle.
 *                             The attribute does NOT reset to `instant`
 *                             after the animation completes — that's a
 *                             deliberate semantics tradeoff to keep the
 *                             e2e contract simple and avoid timer races
 *                             with Playwright's `readCardAttrs` waits.
 *                             Initial-render path before any transition
 *                             still reads `instant` because prev ===
 *                             current at first paint.
 *                           - `data-stale="true|false"` (on the parent
 *                             `right-now-card`) is true while the card
 *                             sits on a `morph-to-last-good` payload OR
 *                             the resolved body's `isStale` is set
 *                             (the `dateless` state).
 *   • right-now-lead    — primary-line element (e.g., "Today: Show
 *                         day 1 of 3"). The §8.2 spec right column
 *                         calls this the "lead phrase."
 *   • right-now-detail  — secondary-line element. May be absent when
 *                         the §8.2 row has no body line beyond the lead.
 *   • right-now-body    — wraps the lead+detail under AnimatePresence;
 *                         keyed by renderState.kind so React rebuilds
 *                         on swap (NOT `state.kind` — during morph-to-
 *                         last-good, renderState.kind === lastGoodKind
 *                         so the body does not unmount on the kind flip
 *                         to `unknown`/`dateless`).
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  daysBetween,
  formatIsoForTimezone,
  selectRightNowState,
  type RightNowState,
} from "@/lib/time/rightNow";
import {
  transitionTreatment,
  type TransitionTreatment,
} from "@/lib/time/rightNowTransitions";
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

type StateBody = {
  lead: string;
  detail: ReactNode;
  isStale: boolean;
};

/**
 * The §8.2 "degraded zone" — kinds where the date-data fallback path
 * is active. The matrix is symmetric per design (lib/time/
 * rightNowTransitions.ts:19-22) so `morph-to-last-good` fires for
 * BOTH degradation (good → unknown/dateless) AND recovery
 * (unknown/dateless → good). The visual treatment ("no body
 * crossfade, surface tint flip") is the same for both directions —
 * but WHAT we render is directional: render lastGood only while we
 * are STILL inside the degraded zone, swap to the recovered state
 * the moment we exit. This predicate names the zone so the consumer
 * can ask the directional question without breaking matrix symmetry.
 */
function isDegradedState(kind: RightNowState["kind"]): boolean {
  return kind === "unknown" || kind === "dateless";
}

/**
 * Render the §8.2 body text for the resolved state. Pure mapping from
 * RightNowState + context to display content — keeps the JSX simple.
 *
 * Date semantics: every ISO date that surfaces in `detail` is wrapped
 * in `<time dateTime={iso}>{formatIsoDate(iso, mode)}</time>` matching
 * the project's ScheduleTile / TransportTile / LodgingTile convention.
 * The `<time>` element gives screen readers and search engines the
 * machine-readable ISO date alongside the human-formatted weekday.
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
        detail: (
          <>
            Show wraps{" "}
            <time dateTime={state.travelOut}>
              {formatIsoDate(state.travelOut, "weekday-short")}
            </time>
            .
          </>
        ),
        isStale: false,
      };
    case "viewer_off_day": {
      const todayIso = formatIsoForTimezone(now, ctx.timezone);
      const daysAway = daysBetween(todayIso, state.nextAssignedDay);
      return {
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
        isStale: false,
      };
    }
    case "viewer_off_day_pre":
      return {
        lead: `${formatDaysAway(state.daysAway).replace(/^./, (c) => c.toUpperCase())}`,
        detail: (
          <>
            Your first day:{" "}
            <time dateTime={state.firstAssignedDay}>
              {formatIsoDate(state.firstAssignedDay, "weekday-short")}
            </time>
            .
          </>
        ),
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
      const todayIso = formatIsoForTimezone(now, ctx.timezone);
      const daysAgo = daysBetween(state.wrappedAt, todayIso);
      return {
        lead: `Wrapped ${formatDaysAgo(daysAgo)}`,
        detail: null,
        isStale: false,
      };
    }
    case "unknown": {
      const travelIn = ctx.dates.travelIn;
      const travelOut = ctx.dates.travelOut;
      return {
        lead: ctx.showTitle,
        detail: (
          <>
            Show details:{" "}
            {travelIn ? (
              <time dateTime={travelIn}>
                {formatIsoDate(travelIn, "weekday-short")}
              </time>
            ) : (
              "—"
            )}{" "}
            to{" "}
            {travelOut ? (
              <time dateTime={travelOut}>
                {formatIsoDate(travelOut, "weekday-short")}
              </time>
            ) : (
              "—"
            )}
          </>
        ),
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
 *
 * Visibility-change recovery: when a tab is backgrounded for a long
 * stretch, browsers throttle `setInterval` (often to 1Hz, sometimes
 * stop entirely). On `visibilitychange` we eagerly bump `now` so a
 * crew member returning to the page sees the correct state without
 * waiting for the next 60-second slice. (Closes Task 4.11 deferred
 * Important 3.)
 */
export function RightNowCard({ context }: RightNowCardProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  // §8.2 prefers-reduced-motion (Codex round-19 MEDIUM): framer-motion
  // does NOT consume the CSS `--duration-*` custom properties — the
  // global media-query override in app/globals.css zeroes those vars
  // for CSS-driven elements only, not for motion-prop transitions on
  // `<motion.div>`. The original code's comment ("framer-motion respects
  // [reduced motion] through useReducedMotion") was aspirational, not
  // implemented. Wire it up: when the user has prefers-reduced-motion,
  // collapse the crossfade duration to 0 so the body swap is instant.
  // Hook returns `null` until hydration completes; treat null as
  // "unknown — animate at full duration" for SSR + first-paint
  // consistency with the existing render contract.
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // 60-second tick. Keeps the card "live" without spamming React.
    // interval is cleared on unmount.
    const tick = setInterval(() => setNow(new Date()), 60_000);
    // Bump on tab focus — browsers throttle setInterval in background
    // tabs, so a long-stale tab might drift hours behind without this.
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
  const body = renderBody(state, context, now);

  // Track the previous resolved state.kind so the §8.2 transition
  // matrix can pick a treatment for the kind change. We use the
  // canonical React "store info from previous renders" pattern:
  // single state holds (prevKind, currentKind, lastGoodState,
  // lastGoodBody, hasMounted). When `state.kind` changes from what we
  // recorded, we set the state DURING render — React documents this
  // as the supported way to derive prev-state without an effect cycle.
  // The setStateDuringRender invocation triggers an immediate re-run
  // of THIS render with the new `tracked` value; React batches this
  // with the parent render so no double commit fires.
  //
  // Why not refs? `useRef` reads inside render violate the
  // "no refs during render" lint rule (React 19's stricter render-
  // purity model). useState is the documented pattern.
  const [tracked, setTracked] = useState<{
    prevKind: RightNowState["kind"];
    currentKind: RightNowState["kind"];
    lastGoodState: RightNowState;
    lastGoodBody: StateBody;
  }>(() => ({
    prevKind: state.kind,
    currentKind: state.kind,
    lastGoodState: state,
    lastGoodBody: body,
  }));

  // The set-state-during-render pattern: when `state.kind` differs
  // from what we've already recorded as `currentKind`, we rotate the
  // tracker. This is the React-blessed way to derive previous-render
  // state without an effect dependency cycle (see React docs:
  // "Storing information from previous renders"). The tracker
  // setState here triggers a synchronous re-run of THIS render with
  // the rotated value, but does NOT cause a separate commit — the
  // immediate value below is what AnimatePresence sees.
  if (state.kind !== tracked.currentKind) {
    // Read the matrix BEFORE the setState so the still-stale tracker
    // tells us whether the upcoming transition is morph-to-last-good
    // (in which case we DO NOT advance lastGood — we want the prior
    // payload to keep rendering until recovery).
    //
    // Directional refinement (Codex round-9 HIGH): only refrain from
    // advancing lastGood when we are ENTERING the degraded zone
    // (state.kind ∈ unknown/dateless). On RECOVERY (degraded → good),
    // the matrix still returns morph-to-last-good (symmetric by
    // design), but the new state IS the recovered good payload — we
    // must advance lastGood so the next render shows the fresh
    // content, not the stale pre-degradation snapshot.
    const willBeStale =
      transitionTreatment(tracked.currentKind, state.kind) ===
        "morph-to-last-good" && isDegradedState(state.kind);
    setTracked({
      prevKind: tracked.currentKind,
      currentKind: state.kind,
      lastGoodState: willBeStale ? tracked.lastGoodState : state,
      lastGoodBody: willBeStale ? tracked.lastGoodBody : body,
    });
  }

  // Effective prev/current after a possible same-render rotation.
  // We compute against the post-rotation pair so the matrix lookup
  // sees the values the next paint will commit.
  //
  // Same directional refinement as the willBeStale block above: when
  // recovering from a degraded kind to a good kind, advance lastGood
  // to the recovered state IN-RENDER so the morph-to-last-good
  // branch below picks the fresh payload (not the pre-degradation
  // snapshot). The kindEnteringStaleZone check matches the
  // willBeStale predicate exactly so the two are guaranteed
  // consistent within this render.
  const effectivePrev =
    state.kind !== tracked.currentKind ? tracked.currentKind : tracked.prevKind;
  const effectiveCurrent = state.kind;
  const kindEnteringStaleZone =
    state.kind !== tracked.currentKind &&
    transitionTreatment(tracked.currentKind, state.kind) ===
      "morph-to-last-good" &&
    isDegradedState(state.kind);
  const effectiveLastGoodState =
    state.kind !== tracked.currentKind && !kindEnteringStaleZone
      ? state
      : tracked.lastGoodState;
  const effectiveLastGoodBody =
    state.kind !== tracked.currentKind && !kindEnteringStaleZone
      ? body
      : tracked.lastGoodBody;

  // Resolve the §8.2 transition treatment for prev → current. On the
  // very first render (or self-transitions) the helper returns null;
  // we treat that as `instant` (no animation) which lines up with the
  // user-visible behavior of "card just paints."
  const rawTreatment: TransitionTreatment | null = transitionTreatment(
    effectivePrev,
    effectiveCurrent,
  );
  // Defensive `unreachable` mapping — fail-open to `instant` so the
  // user still sees a usable card AND emit a diagnostic so the audit
  // suite catches the regression. The diagnostic side-effect happens
  // in an effect (below), NOT during render — render must stay pure.
  const treatment: TransitionTreatment =
    rawTreatment === null
      ? "instant"
      : rawTreatment === "unreachable"
        ? "instant"
        : rawTreatment;

  // morph-to-last-good: keep the previous body on screen, flip surface
  // tint. The post-rotation lastGood values reflect this — when the
  // upcoming transition is stale, we did NOT advance lastGood above,
  // so it still points at the previous render's payload.
  //
  // Directional refinement (Codex round-9 HIGH): the matrix returns
  // morph-to-last-good for BOTH directions of `unknown ↔ good` and
  // `dateless ↔ good`. We only want the "render lastGood + apply
  // stale tint" branch on degradation (current state IS degraded);
  // on recovery (current state is good) we render the recovered
  // state and clear the tint. body.isStale still wins for the
  // intrinsic dateless body so a card sitting at dateless without a
  // recent transition still tints stale.
  const showLastGood =
    treatment === "morph-to-last-good" && isDegradedState(state.kind);
  const renderState = showLastGood ? effectiveLastGoodState : state;
  const renderBodyResolved = showLastGood ? effectiveLastGoodBody : body;
  const isStale = showLastGood || body.isStale;

  // Diagnostic side-effect for matrix-violating transitions. Spec
  // says `unreachable` cells never fire on the natural code path; if
  // one does, the assumption underlying the matrix is broken. Admin-
  // only diagnostic — never surfaced to user-visible UI text.
  useEffect(() => {
    if (rawTreatment === "unreachable") {
      console.error(
        `[RightNowCard] §8.2 unreachable transition fired: ${effectivePrev} → ${effectiveCurrent}. ` +
          `This violates lib/time/rightNowTransitions.ts assumptions; please open a bug.`,
      );
    }
  }, [rawTreatment, effectivePrev, effectiveCurrent]);

  // Surface class — stale tint when the treatment is morph-to-last-good
  // OR when the resolved body's `isStale` flag is set (the `dateless`
  // state has its own intrinsic stale-tint per spec line 2424). Default
  // surface for every other treatment.
  const surfaceClass = isStale ? "bg-stale-tint" : "bg-surface";

  // Per-treatment animation props on the keyed motion.div. Pulled out
  // so the JSX stays readable AND so the audit suite can introspect
  // the effective treatment via `data-treatment`.
  const motionProps =
    treatment === "crossfade-body"
      ? {
          // AnimatePresence has `initial={false}` (parent), which
          // suppresses entry animations on the very first child mount.
          // For subsequent kind changes (where AnimatePresence triggers
          // exit-then-enter on the new key), framer-motion respects the
          // child's per-`motion.div` `initial` prop. Setting opacity 0
          // here means: "every kind change crossfades in from 0."
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: {
            // 220ms (--duration-normal) with --ease-out-quart, OR 0ms
            // when the user opted into prefers-reduced-motion.
            // Codex round-19 MEDIUM: framer-motion does NOT consume
            // the CSS `--duration-*` custom properties — the override
            // in app/globals.css applies to CSS-driven elements only.
            // Gate explicitly via useReducedMotion above so the body
            // swap is instant for motion-sensitive users. `null`
            // (pre-hydration / unknown) keeps the default duration so
            // SSR + first-paint render unchanged.
            duration: prefersReducedMotion === true ? 0 : 0.22,
            ease: [0.25, 1, 0.5, 1] as [number, number, number, number],
          },
        }
      : treatment === "morph-to-last-good"
        ? {
            // No exit/enter animation — the body stays put; the
            // surface tint flip is the only visual change. We still
            // mount a motion.div so AnimatePresence keys are stable
            // across the transition (no DOM thrash).
            initial: false,
            animate: { opacity: 1 },
            exit: { opacity: 1 },
            transition: { duration: 0 },
          }
        : {
            // instant: no animation. initial={false} prevents an
            // entry animation on hydration / unreachable fallback.
            initial: false,
            animate: { opacity: 1 },
            exit: { opacity: 1 },
            transition: { duration: 0 },
          };

  return (
    <section
      data-testid="right-now-card"
      data-stale={isStale ? "true" : "false"}
      data-prefers-reduced-motion={
        // Codex round-19 MEDIUM: expose the resolved hook result on
        // the surface so vitest + Playwright can deterministically
        // assert the wiring. `null` (pre-hydration / unknown) maps
        // to "unknown" so tests can distinguish "user opted in",
        // "user opted out", and "not yet known". Ops can also read
        // this in the browser inspector when triaging motion bugs.
        prefersReducedMotion === true
          ? "true"
          : prefersReducedMotion === false
            ? "false"
            : "unknown"
      }
      aria-label="Right now"
      className={[
        // `w-full` is defense-in-depth: today the section width-fills
        // implicitly because its parent (`app/show/[slug]/page.tsx` main)
        // is a `flex flex-col`, but a future refactor that flips parent
        // flex direction would silently collapse this card to intrinsic
        // width. Stating `w-full` explicitly makes the §8.4 invariant 1
        // contract local to the component.
        "w-full rounded-md border border-border p-6",
        "shadow-tile",
        // Holds card height fixed during the §8.2 crossfade. Sized
        // to the tallest body (`unknown` two-line detail) at the
        // 390px mobile viewport. See app/globals.css token.
        "min-h-right-now-min-h",
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
        data-rendered-state={renderState.kind}
        data-treatment={treatment}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-on-bg"
      >
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-pill bg-accent"
        />
        Right now
      </p>

      {/* §8.2 body crossfade. AnimatePresence with mode="wait" so the
          outgoing body fully exits (opacity → 0) BEFORE the new one
          enters (opacity 0 → 1). Keyed by state.kind so React rebuilds
          on swap; same kind is the same key (no animation triggered).
          The container `min-h-right-now-min-h` above
          preserves card height during the crossfade. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={renderState.kind}
          data-testid="right-now-body"
          {...motionProps}
        >
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
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
