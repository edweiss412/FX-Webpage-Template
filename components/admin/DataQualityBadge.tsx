// parse-data-quality-warnings badge (spec §3) — a compact warning glyph next to a
// show's title on the admin watched-folder rows, shown iff the show has ≥1
// data-quality gap. Shared by ShowsTable (active) + ArchivedShowRow (archived).
// Pure presentational (no hooks/state) → safe in a client island OR an RSC.
// PLAIN-LANGUAGE accessible name only — never the raw §12.4 code (invariant 5).
import { TriangleAlert, Users } from "lucide-react";
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
  // Finite-positive predicates drive BOTH the render gate and each chip. Hardened
  // vs the old strict `=== 0` gate: a NaN / ±Infinity / negative total (all `!== 0`)
  // would otherwise slip past and render an empty-aria-label badge with no chip.
  const hasRoster = Number.isFinite(rosterTotal) && rosterTotal > 0;
  const hasGap = Number.isFinite(gapTotal) && gapTotal > 0;
  if (!hasGap && !hasRoster) return null; // instant, no animation (§4.2)
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
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-status-warn-text"
    >
      {/* Roster chip THEN gap chip (§6.5 order). Glyphs aria-hidden; visible counts
          are subsumed by the outer role="img" name. Distinct glyph + count per
          signal — distinction by shape+count, never hue (DESIGN §1 color-blind floor). */}
      {hasRoster ? (
        <span
          data-testid="dq-chip-roster"
          aria-hidden="true"
          className="inline-flex items-center gap-0.5 leading-none"
        >
          <Users className="size-3.5" />
          <span className="text-xs font-medium tabular-nums leading-none">{rosterTotal}</span>
        </span>
      ) : null}
      {hasGap ? (
        <span
          data-testid="dq-chip-gap"
          aria-hidden="true"
          className="inline-flex items-center gap-0.5 leading-none"
        >
          <TriangleAlert className="size-3.5" />
          <span className="text-xs font-medium tabular-nums leading-none">{gapTotal}</span>
        </span>
      ) : null}
    </span>
  );
}
