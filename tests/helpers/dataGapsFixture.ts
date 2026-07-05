import { GAP_CLASSES, type DataGapsSummary, type GapCode } from "@/lib/parser/dataGaps";

/**
 * Build a full-shape `DataGapsSummary` fixture from partial per-class counts.
 * Every `GAP_CLASSES` key is present (missing → 0), so fixtures stay valid as the
 * gap set grows. `total` defaults to the sum of the overrides but can be forced
 * (e.g. to simulate an old point-in-time snapshot whose total ≠ sum).
 */
export function mkDataGaps(
  overrides: Partial<Record<GapCode, number>>,
  totalOverride?: number,
): DataGapsSummary {
  const classes = Object.fromEntries(
    GAP_CLASSES.map((g) => [g.code, overrides[g.code] ?? 0]),
  ) as Record<GapCode, number>;
  const sum = Object.values(classes).reduce((a, b) => a + b, 0);
  return { total: totalOverride ?? sum, classes };
}
