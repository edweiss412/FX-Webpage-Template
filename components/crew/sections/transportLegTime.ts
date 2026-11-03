/**
 * components/crew/sections/transportLegTime.ts — the crew's route-leg options
 * for the shared transport body: the "leaves" time line and the leg rule the
 * Transport section, its search lines and the "All sections" ride count share.
 *
 * JSX-free and free of any markup import (PR B invariant-8 gate, row 9): the
 * peek (lib/crew/sectionPeek.ts) reads these and is reachable from the crew
 * page's client bundle. transportRows.ts re-exports both.
 *
 * Pure and server-safe.
 */
import type { LegTimeLine, TransportLegOptions } from "@/components/show-panels/transportLegs";
import { normalizeMeridiem } from "@/lib/crew/normalizeMeridiem";
import { formatIsoDate } from "@/lib/format/date";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a `YYYY-MM-DD` value that names a real calendar day. */
function isCalendarDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/**
 * A leg's time line on the crew page (spec line 419, §9.2, as amended by the
 * PR B invariant-8 gate): "leaves", then its short date and its time as the
 * sheet wrote it (`normalizeMeridiem`), "leaves Wed Mar 18, 2:00 PM", the date
 * and time in a `<time dateTime>`. The weekday alone repeated across a route
 * longer than a week ("leaves Wed" for Mar 18 and Mar 25). The body hands no
 * date under `hideDates`, so the date is withheld then, "leaves 2:00 PM"; a
 * date that is not a calendar day keeps today's weekday spelling, which echoes
 * it as written; a leg with neither writes nothing.
 */
export function crewLegTime(date: string | null, time: string | null): LegTimeLine {
  const at = time !== null ? normalizeMeridiem(time) : "";
  if (date !== null && isCalendarDate(date)) {
    const day = `${formatIsoDate(date, "weekday")} ${formatIsoDate(date, "short")}`;
    return { lead: "leaves ", text: at !== "" ? `${day}, ${at}` : day, dateTime: date };
  }
  const day = date !== null ? formatIsoDate(date, "weekday") : "";
  const when = day !== "" && at !== "" ? `${day} ${at}` : day || at;
  return when !== "" ? `leaves ${when}` : "";
}

/** The crew's leg options: the ride count in the "All sections" peek reads them too. */
export function crewTransportLegOptions(hideDates: boolean): TransportLegOptions {
  return { hideDates, legTime: crewLegTime, sentinels: "hide", stagelessLegs: "keep" };
}
