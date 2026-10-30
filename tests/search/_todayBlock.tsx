/**
 * The Today block as the crew home renders it (crew page redesign plan Task 10):
 * the run-of-show card, built by the shell's own builder
 * (`buildRunCardProps`, lib/crew/runOfShowCard.ts), above the Today body.
 *
 * The run-of-show lines left `TodaySection` for the card, so a suite asserting
 * what the Today section shows (the INV-1 parity suite, the viewer matrix, the
 * leak suite) renders both, the way `CrewSections` mounts them. The card reads
 * the shared crew clock to find today, so the caller pins `Date` to the case's
 * `today` first (`pinCrewClock`), the instant the shell's `nowDate()` returned,
 * and restores real timers after (`vi.useRealTimers()`).
 */
import type { ComponentProps, JSX } from "react";
import { vi } from "vitest";

import { CrewRunOfShowCard } from "@/components/crew/CrewRunOfShowCard";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { DEFAULT_CARD_REPORT } from "@/lib/crew/cardReportContext";
import { buildRunCardProps } from "@/lib/crew/runOfShowCard";

type TodayProps = ComponentProps<typeof TodaySection>;

/** Fix `Date` (and so the crew clock) at `today`. */
export function pinCrewClock(today: Date): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(today);
}

/** The run-of-show card (when the shell would build one) followed by the Today body. */
export function TodayBlock(props: TodayProps): JSX.Element {
  const runCard = props.data.show?.dates
    ? buildRunCardProps({
        data: props.data,
        viewer: props.viewer,
        today: props.today,
        showId: props.showId,
        // TodaySection's own default when the prop is absent.
        cardReport: props.cardReport === undefined ? DEFAULT_CARD_REPORT : props.cardReport,
      })
    : null;
  return (
    <>
      {runCard ? <CrewRunOfShowCard {...runCard} /> : null}
      <TodaySection {...props} />
    </>
  );
}
