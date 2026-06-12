// M12.2 Phase A Task 2 — shared show-span predicates (spec §3.1(b)).
//
// `hasFullShowDates` is the SAME completeness gate the crew right-now path
// uses (rightNow.ts delegates to it): travelIn AND travelOut AND non-empty
// showDays. Empty showDays with travel bounds present is broken-sheet data
// that crew renders as `unknown` — never a confident/live state — so a span-
// only admin check would badge it "Live" and break parity. Taking the full
// `dates` object (not loose bounds) means a caller cannot forget the guard.
//
// Both helpers are NULL-SAFE: shows.dates is nullable, and the admin
// dashboard reads many rows, so null/non-object dates return false as the
// FIRST branch — never dereference dates.travelIn on a null row.
import type { ShowRow } from "@/lib/parser/types";
import { compareIso } from "@/lib/time/isoDate";

export function hasFullShowDates(dates: ShowRow["dates"] | null | undefined): boolean {
  if (!dates || typeof dates !== "object") return false;
  return (
    Boolean(dates.travelIn) &&
    Boolean(dates.travelOut) &&
    Array.isArray(dates.showDays) &&
    dates.showDays.length > 0 &&
    // Inverted span (travelOut < travelIn) is broken-sheet data the §8.2
    // ladder cannot reason about — degrade to unknown, never plausible-
    // wrong pre_travel/post_show copy. ISO string compare via compareIso.
    compareIso(dates.travelOut as string, dates.travelIn as string) >= 0
  );
}

export function isShowLiveOnDate(
  dates: ShowRow["dates"] | null | undefined,
  todayIso: string,
): boolean {
  if (!hasFullShowDates(dates)) return false;
  const d = dates as ShowRow["dates"];
  return (
    compareIso(todayIso, d.travelIn as string) >= 0 &&
    compareIso(todayIso, d.travelOut as string) <= 0
  );
}
