import { todayRows } from "@/components/crew/sections/todayRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Today search entries (spec §2.5, §4), in render order, through the same rows
 * module `TodaySection` renders from (components/crew/sections/todayRows.ts):
 * every card except `RightNowHero` (skipped), Mode A's bare key-times strip in
 * region `none`, each note's full text. Repeats of other sections' lines stay
 * here and are removed at result time (§5.5).
 *
 * Today's whole body is one `WrappedSection`: a fault in its derivation
 * renders the fallback, so this builder contributes no entry at all.
 */
export function buildTodayEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
  // Outside the section's boundary, as there: a malformed projection throws.
  const ctx = resolveViewerContext(viewer, data);
  try {
    return todayRows(data, ctx, today).entries;
  } catch {
    // The section renders its TileErrorFallback, which holds no line.
    return [];
  }
}
