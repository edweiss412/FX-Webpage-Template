// parse-data-quality-warnings badge (spec §3) — a compact warning glyph next to a
// show's title on the admin watched-folder rows, shown iff the show has ≥1
// data-quality gap. Shared by ShowsTable (active) + ArchivedShowRow (archived).
// Pure presentational (no hooks/state) → safe in a client island OR an RSC.
// PLAIN-LANGUAGE accessible name only — never the raw §12.4 code (invariant 5).
import { TriangleAlert } from "lucide-react";
import { formatDataGapBreakdown, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { RosterShiftSummary } from "@/lib/admin/showDisplay";

export function DataQualityBadge({
  slug,
  dataGaps,
  rosterShift,
}: {
  slug: string;
  dataGaps: DataGapsSummary | undefined;
  // Flow-4 4.3 (spec §6.4/§6.5) — OPTIONAL published-only roster-shift input.
  // undefined / total 0 ⇒ no roster contribution. `| undefined` (not bare `?:`)
  // so `row.rosterShift` passes under exactOptionalPropertyTypes.
  rosterShift?: RosterShiftSummary | undefined;
}) {
  const rosterTotal = rosterShift?.total ?? 0;
  const gapTotal = dataGaps?.total ?? 0;
  if (gapTotal === 0 && rosterTotal === 0) return null; // instant, no animation (§4.2)
  // Bounded accessible name — the gap `total` is the true count; the breakdown
  // caps at 4 classes + "+N more". The roster segment lists at most three counts
  // (added/removed/renamed, zero-count segments omitted) so both parts stay
  // bounded across the full class set (§6.5).
  const rosterLabel =
    rosterShift && rosterTotal > 0
      ? "Roster changed since last review: " +
        [
          [rosterShift.added, "added"],
          [rosterShift.removed, "removed"],
          [rosterShift.renamed, "renamed"],
        ]
          .filter(([n]) => (n as number) > 0)
          .map(([n, word]) => `${n} ${word}`)
          .join(", ")
      : "";
  const gapLabel =
    gapTotal > 0
      ? `${dataGaps!.total} data ${dataGaps!.total === 1 ? "gap" : "gaps"}: ${formatDataGapBreakdown(dataGaps!)}`
      : "";
  // §6.5 concatenation: roster segment THEN gap breakdown, joined by ". ".
  const label = [rosterLabel, gapLabel].filter(Boolean).join(". ");
  return (
    <span
      data-testid={`shows-data-quality-${slug}`}
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center text-status-warn-text"
    >
      <TriangleAlert aria-hidden="true" className="size-3.5" />
    </span>
  );
}
