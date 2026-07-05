// parse-data-quality-warnings badge (spec §3) — a compact warning glyph next to a
// show's title on the admin watched-folder rows, shown iff the show has ≥1
// data-quality gap. Shared by ShowsTable (active) + ArchivedShowRow (archived).
// Pure presentational (no hooks/state) → safe in a client island OR an RSC.
// PLAIN-LANGUAGE accessible name only — never the raw §12.4 code (invariant 5).
import { TriangleAlert } from "lucide-react";
import { formatDataGapBreakdown, type DataGapsSummary } from "@/lib/parser/dataGaps";

export function DataQualityBadge({
  slug,
  dataGaps,
}: {
  slug: string;
  dataGaps: DataGapsSummary | undefined;
}) {
  if (!dataGaps || dataGaps.total === 0) return null; // instant, no animation (§4.2)
  // Bounded accessible name — `total` is the true count; the breakdown caps at 4
  // classes + "+N more" so the aria-label/title never grow unbounded across 22 classes.
  const breakdown = formatDataGapBreakdown(dataGaps);
  const label = `${dataGaps.total} data ${dataGaps.total === 1 ? "gap" : "gaps"}: ${breakdown}`;
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
