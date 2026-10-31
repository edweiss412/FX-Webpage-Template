"use client";
/**
 * components/crew/CrewPass.tsx: the pass, the dark card under the day row on
 * the crew home (crew page redesign spec §4.3, §7, §8 item 2, §9).
 *
 * It replaces `RightNowHero` and keeps its machinery: `selectRightNowState` on
 * the shared crew clock (`useCrewClock`), the `lastGood` morph into the degraded
 * zone and the 66-pair transition table (`transitionTreatment`), and the
 * reduced-motion read on mount. What changed is the body and its input:
 *
 *   - `live` re-skins every live state into the pass layout (eyebrow row,
 *     status line, big time, progress, perforation, fact grid); a day state
 *     reads today's `PassDay`, any other state its existing lead and detail;
 *   - `day(iso)`, selected in the day row (`useDaySelection`), shows that day's
 *     static facts: no countdown and no live dot;
 *   - the props are the server's (`buildPassProps`, lib/crew/passModel.ts), never
 *     a `RightNowContext`. A viewer whose dates are suppressed, or a show whose
 *     dates are incomplete, arrives as `mode: "degraded"` with the state kind
 *     alone, so this component renders it without a clock and holds no date.
 *
 * Swapping bodies (a day to another day, live to a day and back) crossfades
 * over `--duration-normal`, and a live-state swap takes the table's treatment:
 * the bodies are stacked in one grid cell so the outgoing and incoming bodies
 * overlap mid-fade and the card keeps its height (never below the
 * `--spacing-right-now-min-h` floor). Under reduced motion the presence key
 * holds still: one body, its content swapped in one commit.
 *
 * Dark in both themes (spec R7): the card carries `data-theme="dark"`, which
 * re-scopes the theme tokens for its subtree (app/globals.css, the nested dark
 * scope rule). The perforation's notches are the page's own background, read
 * outside that scope into `--pass-notch`.
 *
 * data-testid contract:
 *   crew-pass              the card (data-selection, data-degraded, data-stale,
 *                          data-prefers-reduced-motion; aria-label "Your day, <date>")
 *   crew-pass-state        hidden marker: data-state (the live state),
 *                          data-rendered-state (after the lastGood morph), data-treatment
 *   crew-pass-body         one per mounted body (data-body is its key; data-exiting
 *                          while a crossfade fades it out)
 *   crew-pass-eyebrow-row, crew-pass-eyebrow, crew-pass-eyebrow-right, crew-pass-live-dot
 *   crew-pass-status       the countdown or "Show started at" line
 *   crew-pass-lead, crew-pass-detail   the non-day states' copy
 *   crew-pass-big-time     data-label "Show" or "Load in"
 *   crew-pass-strike       the last show day's strike, at the big time's edge
 *   crew-pass-progress     one [data-segment] per show day
 *   crew-pass-perforation, crew-pass-facts ([data-fact] cells)
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, type Variants } from "framer-motion";

import { useDaySelection } from "@/components/crew/daySelection";
import { useCrewClock } from "@/components/crew/useCrewClock";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import {
  PASS_REGION_ID,
  passStatusLine,
  spokenDate,
  type PassDay,
  type PassFact,
  type PassFactId,
  type PassProps,
  type PassTime,
} from "@/lib/crew/passModel";
import { clientLog } from "@/lib/observe/clientLog";
import {
  daysBetween,
  formatIsoForTimezone,
  selectRightNowState,
  type RightNowState,
} from "@/lib/time/rightNow";
import { transitionTreatment, type TransitionTreatment } from "@/lib/time/rightNowTransitions";
import { cn } from "@/lib/ui/cn";

/** One body of the pass, resolved from a live state or a selected day. */
type PassBody = {
  /** Eyebrow left: the day label, or the live state's eyebrow. */
  eyebrow: string;
  /** The live dot: live states that are "now". */
  live: boolean;
  /** The status line (live, show day, inside the countdown window). */
  status: string | null;
  /** The non-day states' headline and secondary line. */
  lead: string | null;
  detail: ReactNode;
  bigTime: PassTime | null;
  strike: PassTime | null;
  progress: { n: number; total: number } | null;
  facts: PassFact[];
  /** The date the region label names ("Your day, Sun Jun 14"), or null for none. */
  date: string | null;
  /** Intrinsic stale flag (the `dateless` body). */
  isStale: boolean;
};

const EMPTY: Omit<PassBody, "eyebrow" | "live" | "lead" | "date"> = {
  status: null,
  detail: null,
  bigTime: null,
  strike: null,
  progress: null,
  facts: [],
  isStale: false,
};

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

function DateText({ iso }: { iso: string }) {
  return <time dateTime={iso}>{spokenDate(iso)}</time>;
}

/** A selected or live day's static facts: label, anchor times, progress, grid. */
function dayBody(day: PassDay, live: boolean, status: string | null): PassBody {
  return {
    eyebrow: day.label,
    live,
    status,
    lead: null,
    detail: null,
    bigTime: day.bigTime,
    strike: day.strike,
    progress: day.progress,
    facts: day.facts,
    date: day.iso,
    isStale: false,
  };
}

/**
 * The degraded zone of the transition machine: where `lastGood` may hold the
 * previous body (carried from `RightNowHero`, spec §4.3).
 */
function isDegradedState(kind: RightNowState["kind"]): boolean {
  return kind === "unknown" || kind === "dateless";
}

/** The visual degraded set: eyebrow and lead only, the stale tint (spec §4.3). */
function isPassDegraded(kind: RightNowState["kind"]): boolean {
  return kind === "unknown" || kind === "dateless" || kind === "viewer_unconfirmed";
}

/** The live body for `state`. Pure: `now` and the props in, the body out. */
function liveBody(state: RightNowState, props: PassProps, now: Date): PassBody {
  const todayIso = props.mode === "dated" ? formatIsoForTimezone(now, props.timezone) : null;
  const today =
    props.mode === "dated" ? (props.days.find((d) => d.iso === todayIso) ?? null) : null;
  const dayState = (fallback: string): PassBody =>
    today === null
      ? { ...EMPTY, eyebrow: "Today", live: true, lead: fallback, date: todayIso }
      : dayBody(
          today,
          true,
          props.mode === "dated" ? passStatusLine(today, now, props.timezone) : null,
        );

  switch (state.kind) {
    case "show_day_n":
      return dayState(`Show day ${state.n} of ${state.total}`);
    case "travel_in_day":
      return dayState("Travel in");
    case "set_day":
      return dayState("Load in");
    case "travel_out_day":
      return dayState("Travel out");
    case "pre_travel":
      return {
        ...EMPTY,
        eyebrow: "Up next",
        live: false,
        lead: `${formatDaysAway(state.daysAway).replace(/^./, (c) => c.toUpperCase())} until travel in`,
        detail: (
          <>
            Travel in: <DateText iso={state.travelIn} />.
          </>
        ),
        date: todayIso,
      };
    case "viewer_off_day":
      return {
        ...EMPTY,
        eyebrow: "Today",
        live: true,
        lead: "Not scheduled today.",
        detail: (
          <>
            Your next day: <DateText iso={state.nextAssignedDay} />.
          </>
        ),
        date: todayIso,
      };
    case "viewer_off_day_pre":
      return {
        ...EMPTY,
        eyebrow: "Up next",
        live: false,
        lead: "Not scheduled yet",
        detail: (
          <>
            Your first day: <DateText iso={state.firstAssignedDay} /> (
            {formatDaysAway(state.daysAway)}).
          </>
        ),
        date: todayIso,
      };
    case "viewer_after_last_day":
      return {
        ...EMPTY,
        eyebrow: "Wrapped for you",
        live: false,
        lead: "Your days are done.",
        detail: (
          <>
            Show wraps <DateText iso={state.travelOut} />.
          </>
        ),
        date: todayIso,
      };
    case "post_show":
      return {
        ...EMPTY,
        eyebrow: "Show complete",
        live: false,
        lead: "That's a wrap",
        detail:
          todayIso === null
            ? null
            : `Wrapped ${formatDaysAgo(daysBetween(state.wrappedAt, todayIso))}.`,
        date: todayIso,
      };
    case "viewer_unconfirmed":
      return {
        ...EMPTY,
        eyebrow: "Heads up",
        live: false,
        lead: "Your days aren't confirmed yet.",
        detail: "Check back after Doug finalizes the schedule.",
        date: null,
      };
    case "unknown":
      return {
        ...EMPTY,
        eyebrow: "Show details",
        live: false,
        lead: "Dates aren't finalized.",
        detail: props.showTitle,
        date: null,
      };
    case "dateless":
      return {
        ...EMPTY,
        eyebrow: "Show details",
        live: false,
        lead: "Show details unavailable",
        detail: "Check the sheet's DATES block.",
        date: null,
        isStale: true,
      };
  }
}

/** The crossfade, `--duration-normal` on `--ease-out-quart` (spec §7). */
const CROSSFADE_SECONDS = 0.22;
const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

/** `custom` is whether this swap fades; an instant swap removes the old body at once. */
const BODY_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  shown: (fade: boolean) => ({
    opacity: 1,
    transition: { duration: fade ? CROSSFADE_SECONDS : 0, ease: EASE_OUT_QUART },
  }),
  gone: (fade: boolean) => ({
    opacity: 0,
    transition: { duration: fade ? CROSSFADE_SECONDS : 0, ease: EASE_OUT_QUART },
  }),
};

const BODY_CELL = "col-start-1 row-start-1 flex min-w-0 flex-col";

/** A body inside the presence: marks itself while it fades out. */
function PresentBody({
  bodyKey,
  fade,
  children,
}: {
  bodyKey: string;
  fade: boolean;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      data-testid="crew-pass-body"
      data-body={bodyKey}
      data-exiting={present ? undefined : ""}
      aria-hidden={present ? undefined : true}
      custom={fade}
      variants={BODY_VARIANTS}
      initial={fade ? "hidden" : false}
      animate="shown"
      exit="gone"
      className={BODY_CELL}
    >
      {children}
    </motion.div>
  );
}

/**
 * The fact cells whose value is a time. A time is never cut (a cut "12:0…" reads
 * as noon or midnight), so these wrap in full; every other value clamps at two
 * lines, its full text one tap away in its section (spec §4.3, amended
 * 2026-10-30).
 */
const TIME_FACTS: ReadonlySet<PassFactId> = new Set<PassFactId>(["strike", "loadIn"]);

function TimeBlock({
  time,
  testId,
  align,
  size,
}: {
  time: PassTime;
  testId: string;
  align: "start" | "end";
  size: "big" | "edge";
}) {
  return (
    <div
      data-testid={testId}
      data-label={time.label}
      className={cn(
        "flex min-w-0 flex-col",
        align === "end" ? "ml-auto items-end text-right" : null,
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
        {time.label}
      </span>
      {/* Never truncated: the time is free text from the sheet, so its length is
          not bounded. The big time steps down a size with the pass's own width,
          so a typical "4/21 @ 7:30 AM" fits on one line from the 288px pass of a
          320px window up; anything longer wraps, balanced, rather than lose its
          meridiem. */}
      <span
        className={cn(
          "mt-1 max-w-full font-bold tabular-nums text-balance wrap-break-word text-text-strong",
          size === "big" ? "text-2xl @xs/pass:text-3xl @sm/pass:text-4xl" : "text-lg",
        )}
      >
        {time.time}
      </span>
    </div>
  );
}

function BodyView({ body, eyebrowRight }: { body: PassBody; eyebrowRight: string | null }) {
  const hasTimes = body.bigTime !== null || body.strike !== null;
  return (
    <>
      <div className="flex flex-1 flex-col p-5">
        {/* The role side wraps under the day label when the two do not fit one
            line, and then clamps at three: the role renders as the sheet writes
            it (spec §9.2), and on a real roster that is a long string whose
            trailing position code is the part that matters. The seed's longest,
            "- Load In / Set / Strike / Load Out - LEAD / V1", takes three lines
            in the 288px pass of a 320px window. */}
        <div
          data-testid="crew-pass-eyebrow-row"
          className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"
        >
          {/* The dot is never colour alone: a screen reader hears "Live" before
              the day label (DESIGN.md §1.1, the status-live row). Out of flow,
              so the row's layout and the eyebrow's own text are unchanged. */}
          {body.live ? (
            <span data-testid="crew-pass-live-label" className="sr-only">
              Live
            </span>
          ) : null}
          <p
            data-testid="crew-pass-eyebrow"
            className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-eyebrow-strong text-text-subtle"
          >
            {body.live ? (
              <span
                data-testid="crew-pass-live-dot"
                aria-hidden="true"
                className="inline-block size-1.5 rounded-pill bg-accent"
              />
            ) : null}
            {body.eyebrow}
          </p>
          {eyebrowRight ? (
            <p
              data-testid="crew-pass-eyebrow-right"
              className="line-clamp-3 min-w-0 text-balance wrap-break-word text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
            >
              {eyebrowRight}
            </p>
          ) : null}
        </div>

        {body.status ? (
          <p
            data-testid="crew-pass-status"
            className="mt-3 text-sm font-semibold tabular-nums text-accent-on-bg"
          >
            {body.status}
          </p>
        ) : null}

        {body.lead ? (
          <p
            data-testid="crew-pass-lead"
            className="mt-3 text-2xl font-bold leading-tight tracking-tight text-text-strong sm:text-3xl"
          >
            {body.lead}
          </p>
        ) : null}
        {body.detail ? (
          <p data-testid="crew-pass-detail" className="mt-2 text-base text-text-subtle">
            {body.detail}
          </p>
        ) : null}

        {hasTimes ? (
          // Strike drops under the big time when the two do not fit one line.
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            {body.bigTime ? (
              <TimeBlock time={body.bigTime} testId="crew-pass-big-time" align="start" size="big" />
            ) : (
              <span />
            )}
            {body.strike ? (
              <TimeBlock time={body.strike} testId="crew-pass-strike" align="end" size="edge" />
            ) : null}
          </div>
        ) : null}

        {body.progress ? (
          <div
            data-testid="crew-pass-progress"
            role="img"
            aria-label={`Show day ${body.progress.n} of ${body.progress.total}`}
            className="mt-4 flex items-stretch gap-1.5"
          >
            {Array.from({ length: body.progress.total }).map((_, i) => {
              const active = i < body.progress!.n;
              return (
                <span
                  key={i}
                  data-segment={i}
                  data-segment-active={active ? "true" : "false"}
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 flex-1 rounded-pill",
                    // Load-bearing graphical indicator (role="img" show-day progress):
                    // the vibrant accent fill, with the accent-edge stroke as the
                    // 3:1 WCAG 1.4.11 boundary (DESIGN.md §1.2; ACCENT-PASS-1).
                    // An inactive segment carries a 1px text-faint border, the
                    // 3:1 outline token, so the total count survives both a low
                    // fill contrast and forced colors, where a fill flattens to
                    // Canvas (audit P3-1; tests/styles/crewPassContrast.test.ts).
                    active
                      ? "border border-accent-edge bg-accent"
                      : "border border-text-faint bg-border-strong",
                  )}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {body.facts.length > 0 ? (
        <>
          {/* The perforation: a dashed rule between two notches cut to the page's
              own background, the boarding-pass stub's edge. Decorative. */}
          <div data-testid="crew-pass-perforation" aria-hidden="true" className="relative">
            <span className="absolute -top-2.5 -left-2.5 size-5 rounded-pill bg-(--pass-notch)" />
            <div className="mx-5 border-t border-dashed border-border-strong" />
            <span className="absolute -top-2.5 -right-2.5 size-5 rounded-pill bg-(--pass-notch)" />
          </div>
          {/* Two columns until the pass is wide enough for three readable cells
              (`@lg/pass`, the pass's own width, never the viewport: the pass is
              a phone-width card in the wide layout's half column too). Labels
              and times wrap in full; other values clamp at two lines. */}
          <dl
            data-testid="crew-pass-facts"
            className="grid grid-cols-2 gap-x-3 gap-y-4 px-5 pt-4 pb-5 @lg/pass:grid-cols-3"
          >
            {body.facts.map((fact) => (
              <div key={fact.id} data-fact={fact.id} className="min-w-0">
                <dt className="wrap-break-word text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                  {fact.label}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 wrap-break-word text-sm font-semibold text-text-strong",
                    TIME_FACTS.has(fact.id)
                      ? "text-balance tabular-nums"
                      : "line-clamp-2 whitespace-pre-line",
                  )}
                >
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </>
  );
}

export function CrewPass(props: PassProps) {
  // The shared crew clock (components/crew/useCrewClock.ts): the same `now` the
  // day row and the run card read, seeded with the server's request time so the
  // server render and hydration agree.
  const now = useCrewClock();
  // framer's own hook misses the INITIAL matchMedia value; the shared hook reads
  // it on mount. `null` (SSR and the first client render) animates at full
  // duration, for first-paint consistency (carried from `RightNowHero`).
  const prefersReducedMotion = usePrefersReducedMotion();
  const { selection } = useDaySelection();

  // Degraded props carry the state the server computed with the real dates; it
  // does not depend on the clock, so no clock is read for it.
  const state: RightNowState =
    props.mode === "degraded"
      ? { kind: props.state }
      : selectRightNowState(now, props.dates, props.dateRestriction, {
          timezone: props.timezone,
        });
  const body = liveBody(state, props, now);

  // ── lastGood / morph-to-last-good tracker (carried from RightNowHero) ──
  const [tracked, setTracked] = useState<{
    prevKind: RightNowState["kind"];
    currentKind: RightNowState["kind"];
    lastGoodState: RightNowState;
    lastGoodBody: PassBody;
  }>(() => ({
    prevKind: state.kind,
    currentKind: state.kind,
    lastGoodState: state,
    lastGoodBody: body,
  }));

  if (state.kind !== tracked.currentKind) {
    // Read the matrix BEFORE the setState so the still-stale tracker tells us
    // whether this transition is morph-to-last-good entering the degraded zone
    // (hold the prior payload until recovery).
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
  const liveResolved = showLastGood ? effectiveLastGoodBody : body;
  const isStale = showLastGood || body.isStale;

  // Diagnostic for a matrix-violating transition (admin-only, never visible).
  useEffect(() => {
    if (rawTreatment === "unreachable") {
      clientLog(
        "error",
        "client.crew",
        `CrewPass §8.2 unreachable transition fired: ${effectivePrev} → ${effectiveCurrent}. ` +
          `This violates lib/time/rightNowTransitions.ts assumptions; please open a bug.`,
      );
    }
  }, [rawTreatment, effectivePrev, effectiveCurrent]);

  // ── The selected day (spec §4.3 `day(iso)`). `day(today)` is `live`: the day
  // row settles the store to that in an effect, and the pass reads it so at once.
  const todayIso = props.mode === "dated" ? formatIsoForTimezone(now, props.timezone) : null;
  const selectedDay =
    props.mode === "dated" && selection.kind === "day" && selection.iso !== todayIso
      ? (props.days.find((d) => d.iso === selection.iso) ?? null)
      : null;
  const shown = selectedDay === null ? liveResolved : dayBody(selectedDay, false, null);
  const bodyKey = selectedDay === null ? `live:${renderState.kind}` : `day:${selectedDay.iso}`;

  // Whether the swap INTO the current body fades: a change of selection always
  // does; a live-state swap does when the table says crossfade.
  const [arrival, setArrival] = useState({ key: bodyKey, fade: false });
  let fade = arrival.fade;
  if (bodyKey !== arrival.key) {
    const liveSwap = arrival.key.startsWith("live:") && bodyKey.startsWith("live:");
    fade = liveSwap ? treatment === "crossfade-body" : true;
    setArrival({ key: bodyKey, fade });
  }

  const reduced = prefersReducedMotion === true;
  const swapFades = reduced ? false : fade;

  // The stale tint covers the degraded set, an active lastGood morph and the
  // intrinsic dateless body; the content drops to eyebrow and lead only for the
  // degraded set itself (a morph keeps the last good body whole, under the tint).
  const degraded = isPassDegraded(renderState.kind) || isStale;
  const eyebrowAndLeadOnly = selectedDay === null && isPassDegraded(renderState.kind);
  const view = (
    <BodyView
      body={
        eyebrowAndLeadOnly
          ? { ...shown, status: null, bigTime: null, strike: null, progress: null, facts: [] }
          : shown
      }
      eyebrowRight={props.eyebrowRight}
    />
  );

  return (
    // The notch colour is the page's own background, resolved here, outside the
    // dark scope the card opens below.
    // The card's edge is the page's own `--color-border-strong`, also resolved
    // here, outside the dark scope: this wrapper draws no border, it only holds
    // the colour, and the card inherits it (`border-inherit`). On a dark page
    // the pass then carries an edge a step above every tile's border, so it stays
    // the focal card (critique F6); on a light page it is a light hairline beside
    // the dark card.
    <div
      className="w-full border-border-strong"
      style={{ "--pass-notch": "var(--color-bg)" } as CSSProperties}
    >
      <section
        // The region the day row's buttons name in `aria-controls`.
        id={PASS_REGION_ID}
        data-testid="crew-pass"
        data-theme="dark"
        // A live-clock summary of lines the page shows elsewhere: outside search
        // coverage (crew show search spec §2.5).
        data-search-skip=""
        data-selection={selectedDay === null ? "live" : `day:${selectedDay.iso}`}
        data-degraded={degraded ? "true" : "false"}
        data-stale={isStale ? "true" : "false"}
        data-prefers-reduced-motion={
          prefersReducedMotion === true
            ? "true"
            : prefersReducedMotion === false
              ? "false"
              : "unknown"
        }
        aria-label={shown.date === null ? "Your day" : `Your day, ${spokenDate(shown.date)}`}
        className={cn(
          // One grid cell: a crossfade stacks the outgoing and incoming bodies in
          // it, so the card is the taller of the two and never collapses mid-fade.
          // `@container/pass`: the big time's size and the fact grid's columns
          // read the pass's own width.
          "@container/pass grid w-full overflow-hidden rounded-md border border-inherit text-text shadow-tile",
          "min-h-right-now-min-h",
          degraded ? "bg-stale-tint" : "bg-surface-raised",
        )}
      >
        <span
          data-testid="crew-pass-state"
          data-state={state.kind}
          data-rendered-state={renderState.kind}
          data-treatment={treatment}
          hidden
          aria-hidden="true"
        />
        {/* Not mode="wait": a crossfade overlaps the outgoing and incoming bodies
            (spec §7). Under reduced motion the presence key holds still, so a swap
            replaces the one body's content in place, in one commit; the tree is the
            same shape either way (no SSR-to-client remount, M12.11). */}
        <AnimatePresence initial={false} custom={swapFades}>
          <PresentBody key={reduced ? "pass" : bodyKey} bodyKey={bodyKey} fade={swapFades}>
            {view}
          </PresentBody>
        </AnimatePresence>
      </section>
    </div>
  );
}
