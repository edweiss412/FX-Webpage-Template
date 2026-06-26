/**
 * Class C — derive BLOCK_DISAPPEARED parse-warnings from MI-7 items
 * (parse-data-quality-warnings §5.3, VB10).
 *
 * Block disappearance is ALREADY detected by MI-7 (the section-shrinkage guard,
 * lib/parser/invariants.ts:243-315), which fires for every stateful block going
 * prior>0 → next 0 and already writes a `section_shrunk` Changes-feed row via
 * writeAutoApplyChanges. The ONE gap MI-7 leaves is the persistent per-show
 * Data-Quality panel (reads shows_internal.parse_warnings) — MI-7 produces a
 * triggered-item + feed row but NO parse_warning.
 *
 * This pure helper closes that gap WITHOUT a parallel comparator: it maps each
 * MI-7 item with new_count === 0 to a single BLOCK_DISAPPEARED ParseWarning, so
 * the disappearance also reaches the parse-warning-based surfaces. There is
 * exactly one feed row (MI-7 section_shrunk) and one parse-warning (panel) per
 * disappearance — no double-log.
 *
 * Suppression (R8/R9): a recurring edit that keeps a section header but clears
 * its rows yields a parser SECTION_HEADER_NO_FIELDS warning AND an MI-7 item for
 * the same block. To avoid two signals for one event, this helper skips emitting
 * BLOCK_DISAPPEARED for any block already represented by a SECTION_HEADER_NO_FIELDS
 * warning in `existingWarnings`. The parser emits that warning's blockRef.kind as
 * "hotels" (hotels.ts:69) while MI-7 uses section "hotel_reservations" — the only
 * divergence among MI-7-covered blocks — so a canonical map normalizes the parser
 * kind before comparing.
 */

import { BLOCK_DISAPPEARED } from "@/lib/parser/warnings";
import type { ParseWarning, TriggeredReviewItem } from "@/lib/parser/types";

/** MI-7 section codes — the stateful blocks MI-7 tracks. */
type Mi7Section = "hotel_reservations" | "rooms" | "contacts" | "transportation";

/** Human label for the BLOCK_DISAPPEARED message, keyed by MI-7 section. */
const SECTION_LABEL: Record<Mi7Section, string> = {
  hotel_reservations: "hotel",
  rooms: "rooms",
  contacts: "contacts",
  transportation: "transportation",
};

/**
 * Normalize a parser-emitted SECTION_HEADER_NO_FIELDS blockRef.kind to the MI-7
 * `section` vocabulary. Among MI-7-covered blocks the ONLY divergence is
 * hotels (parser) ↔ hotel_reservations (MI-7); rooms/contacts/transportation
 * match directly.
 */
function normalizeToMi7Section(parserKind: string): string {
  return parserKind === "hotels" ? "hotel_reservations" : parserKind;
}

/**
 * Map MI-7 items with new_count === 0 to BLOCK_DISAPPEARED parse-warnings,
 * suppressing any block already carrying a SECTION_HEADER_NO_FIELDS warning.
 *
 * @param triggeredItems MI-7 (and other) items from runInvariants
 * @param existingWarnings the parse warnings already on parseResult.warnings
 */
export function blockDisappearanceWarnings(
  triggeredItems: readonly TriggeredReviewItem[],
  existingWarnings: readonly ParseWarning[],
): ParseWarning[] {
  const suppressedSections = new Set<string>();
  for (const w of existingWarnings) {
    if (w.code === "SECTION_HEADER_NO_FIELDS" && w.blockRef?.kind) {
      suppressedSections.add(normalizeToMi7Section(w.blockRef.kind));
    }
  }

  const out: ParseWarning[] = [];
  for (const item of triggeredItems) {
    if (item.invariant !== "MI-7") continue;
    if (item.new_count !== 0) continue;
    if (suppressedSections.has(item.section)) continue;

    const label = SECTION_LABEL[item.section];
    const priorCount = item.prior_count;
    const entryWord = priorCount === 1 ? "entry" : "entries";
    out.push({
      severity: "warn",
      code: BLOCK_DISAPPEARED,
      message: `The ${label} section was present last time but is now empty — ${priorCount} ${entryWord} dropped.`,
      blockRef: { kind: item.section },
    });
  }
  return out;
}
