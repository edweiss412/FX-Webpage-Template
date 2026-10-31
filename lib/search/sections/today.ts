import { todayRows } from "@/components/crew/sections/todayRows";
import { runCardSearchEntries } from "@/lib/crew/runOfShowCard";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Today search entries (spec §2.5, §4), in render order. First the home's
 * run-of-show card on the server's today (lib/crew/runOfShowCard.ts, the module
 * the card's props come from, crew page redesign plan Task 10), then the home
 * body through the same rows module `HomeSection` renders from
 * (components/crew/sections/todayRows.ts): each show note's full text and the
 * Dress code card's lines. The pass is not indexed, and the quick facts sit
 * outside search coverage (each repeats a line its own section renders; plan
 * Task 11). Repeats of other sections' lines stay here and are removed at
 * result time (§5.5).
 *
 * The home body is one `WrappedSection`: a fault in its derivation renders the
 * fallback, so the body contributes no entry at all. The run card is built by
 * the shell, outside that boundary, so its entries stand on their own.
 */
export function buildTodayEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
  // Outside the section's boundary, as there: a malformed projection throws.
  const ctx = resolveViewerContext(viewer, data);
  const runCard = data.show?.dates ? runCardSearchEntries({ data, viewer, today }) : [];
  try {
    return [...runCard, ...todayRows(data, ctx).entries];
  } catch {
    // The section renders its TileErrorFallback, which holds no line.
    return runCard;
  }
}
