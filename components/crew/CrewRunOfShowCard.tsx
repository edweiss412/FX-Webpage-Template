"use client";
/**
 * components/crew/CrewRunOfShowCard.tsx: the run-of-show card under the pass on
 * the crew home (crew page redesign spec §4.4, §6.4, §7, §9.1, §9.2).
 *
 * The selected day's run of show: `live` shows today, found from the shared crew
 * clock (`useCrewClock`) in the show's timezone, and `day(iso)`, chosen in the
 * day row (`useDaySelection`), shows that day. `day(today)` is `live`, as the
 * pass reads it. The rows are the server's (`buildRunCardProps`,
 * lib/crew/runOfShowCard.ts): only the viewer's own days, each already filtered
 * and capped, so this component chooses a day and holds nothing it may not show.
 *
 *   - A day with no rows renders nothing, heading included (spec §4.4 "Empty").
 *   - Rows render through `ShowDayTimelineList` (a day with agenda sessions) or
 *     `RunOfShowList`, as Today's card did, with its card id and header actions.
 *   - "Full schedule" shows at the card's foot when the day had more rows than
 *     the cap; it is a real `?s=schedule` link the section controller
 *     intercepts, so it opens the Schedule sheet in compact and scrolls to
 *     Schedule in wide (spec §5.2, §5.3).
 *   - "Next" (`live` only) marks the first row whose start converts through
 *     `clockToMinutes` to a time at or after now; a row that does not convert
 *     never gets it (documented limit L1).
 *
 * Switching days crossfades the rows over `--duration-normal` (spec §7): the
 * outgoing and incoming bodies share one grid cell, so they overlap mid-fade.
 * Under reduced motion the presence key holds still and the swap is one commit.
 * The card appearing or leaving (a day with or without rows) is instant.
 *
 * Search (crew show search spec §2.3): the server's today carries search target
 * ids, so in `live` its rows are the Today section's `today-run-of-show` lines.
 * Any other day's rows carry none, and their body is a skip subtree.
 *
 * data-testid contract:
 *   today-run-of-show   the card (data-card-id, data-selection "live" | "day:<iso>")
 *   crew-run-body       one per mounted body (data-body is its day; data-exiting
 *                       while a crossfade fades it out)
 *   crew-run-next       the "Next" marker
 */
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, type Variants } from "framer-motion";

import { SectionChipLink } from "@/components/crew/SectionChipLink";
import { useDaySelection } from "@/components/crew/daySelection";
import { CalendarIcon, ClockIcon } from "@/components/crew/icons/sectionIcons";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { ShowDayTimelineList } from "@/components/crew/primitives/ShowDayTimelineList";
import { useCrewClock } from "@/components/crew/useCrewClock";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import { minuteOfDay } from "@/lib/crew/passModel";
import {
  RUN_CARD_ID,
  RUN_CARD_TITLE,
  type RunCardDay,
  type RunCardProps,
} from "@/lib/crew/runOfShowCard";
import { formatIsoForTimezone } from "@/lib/time/rightNow";

/** The crossfade, `--duration-normal` on `--ease-out-quart` (spec §7), as the pass runs it. */
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

/** A body inside the presence: marks itself while it fades out. */
function RunBody({
  bodyKey,
  fade,
  searchable,
  children,
}: {
  bodyKey: string;
  fade: boolean;
  searchable: boolean;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      data-testid="crew-run-body"
      data-body={bodyKey}
      data-exiting={present ? undefined : ""}
      data-search-skip={searchable ? undefined : ""}
      aria-hidden={present ? undefined : true}
      custom={fade}
      variants={BODY_VARIANTS}
      initial={fade ? "hidden" : false}
      animate="shown"
      exit="gone"
      className="col-start-1 row-start-1 min-w-0"
    >
      {children}
    </motion.div>
  );
}

/** The rows of one day, with the "Next" marker at `nextIndex` (-1 for none). */
function DayRows({ day, nextIndex }: { day: RunCardDay; nextIndex: number }) {
  const targets = day.targets ?? undefined;
  const marker = nextIndex >= 0 ? { nextIndex } : {};
  const search = targets !== undefined ? { searchTargets: targets } : {};
  return day.rows.kind === "timeline" ? (
    <ShowDayTimelineList items={day.rows.items} isoDate={day.iso} {...search} {...marker} />
  ) : (
    <RunOfShowList entries={day.rows.entries} isoDate={day.iso} {...search} {...marker} />
  );
}

export function CrewRunOfShowCard({ timezone, days, header }: RunCardProps) {
  // The shared crew clock: the same `now` the day row and the pass read.
  const now = useCrewClock();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { selection } = useDaySelection();

  const todayIso = formatIsoForTimezone(now, timezone);
  const chosen = selection.kind === "day" && selection.iso !== todayIso ? selection.iso : null;
  const live = chosen === null;
  const day = days.find((d) => d.iso === (chosen ?? todayIso)) ?? null;

  // A change of day always fades in; the first body does not.
  const bodyKey = day?.iso ?? "";
  const [arrival, setArrival] = useState({ key: bodyKey, fade: false });
  let fade = arrival.fade;
  if (bodyKey !== arrival.key) {
    fade = true;
    setArrival({ key: bodyKey, fade });
  }
  const reduced = prefersReducedMotion === true;
  const swapFades = reduced ? false : fade;

  if (day === null) return null;

  const nowMinutes = minuteOfDay(now, timezone);
  const nextIndex = live ? day.minutes.findIndex((m) => m !== null && m >= nowMinutes) : -1;

  return (
    <div className="mb-4">
      <div
        data-testid={RUN_CARD_ID}
        data-card-id={RUN_CARD_ID}
        data-selection={live ? "live" : `day:${day.iso}`}
        className="min-w-0"
      >
        <SectionCard
          icon={<ClockIcon />}
          title={RUN_CARD_TITLE}
          action={
            <CardHeaderActions
              cardId={RUN_CARD_ID}
              driveFileId={header.driveFileId}
              anchor={header.anchor}
              showId={header.showId}
              cardReport={header.cardReport}
            />
          }
        >
          {/* One grid cell: a crossfade stacks the outgoing and incoming rows in it. */}
          <div className="grid">
            <AnimatePresence initial={false} custom={swapFades}>
              <RunBody
                key={reduced ? "run" : day.iso}
                bodyKey={day.iso}
                fade={swapFades}
                searchable={day.targets !== null}
              >
                <DayRows day={day} nextIndex={nextIndex} />
              </RunBody>
            </AnimatePresence>
          </div>
          {/* At the foot, after the rows it continues, never in the header: there
              it took the width the title needed, and "Run of show" truncated at
              every width (gate fix X10). A link to another section, not sheet
              data, so outside search. */}
          {day.more ? (
            <div data-search-skip="" className="flex">
              <SectionChipLink section="schedule" icon={<CalendarIcon />}>
                Full schedule
              </SectionChipLink>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
