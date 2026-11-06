/**
 * The Today block as the crew home renders it (crew page redesign plan Tasks 10
 * and 11): the run-of-show card, built by the shell's own builder
 * (`buildRunCardProps`, lib/crew/runOfShowCard.ts), then the home body
 * (`HomeSection`: quick facts, show notes).
 *
 * The run-of-show lines live on the card, so a suite asserting what the Today
 * section shows (the INV-1 parity suite, the viewer matrix, the leak suite)
 * renders both, the way `CrewSections` mounts them. The card reads
 * the shared crew clock to find today, so the caller pins `Date` to the case's
 * `today` first (`pinCrewClock`), the instant the shell's `nowDate()` returned,
 * and restores real timers after (`vi.useRealTimers()`).
 */
import type { ComponentProps, JSX } from "react";
import { vi } from "vitest";

import { CrewRunOfShowCard } from "@/components/crew/CrewRunOfShowCard";
import { HomeSection } from "@/components/crew/sections/HomeSection";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { buildRunCardProps } from "@/lib/crew/runOfShowCard";

/** The home body's props, plus the report context the shell hands the run card. */
type TodayProps = ComponentProps<typeof HomeSection> & { cardReport?: CardReportContext | null };

/** Fix `Date` (and so the crew clock) at `today`. */
export function pinCrewClock(today: Date): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(today);
}

/** The run-of-show card (when the shell would build one) followed by the home body. */
export function TodayBlock({
  cardReport = DEFAULT_CARD_REPORT,
  ...props
}: TodayProps): JSX.Element {
  const runCard = props.data.show?.dates
    ? buildRunCardProps({
        data: props.data,
        viewer: props.viewer,
        today: props.today,
        showId: props.showId,
        cardReport,
      })
    : null;
  return (
    <>
      {runCard ? <CrewRunOfShowCard {...runCard} /> : null}
      <HomeSection {...props} />
    </>
  );
}
