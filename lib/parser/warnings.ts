/**
 * ParseAggregator — collects warnings and raw_unrecognized entries during parsing.
 *
 * Passed by reference through each block parser so all soft signals accumulate
 * in a single shared object. The orchestrator (Task 1.11) merges these into
 * ParsedSheet.warnings / ParsedSheet.raw_unrecognized after all block parsers run.
 *
 * Pattern: functional (plain object), not a class — per Task 1.10 scope decision.
 */

import type { ParseWarning } from "./types";

export type RawUnrecognized = { block: string; key: string; value: string };

export type ParseAggregator = {
  warnings: ParseWarning[];
  rawUnrecognized: RawUnrecognized[];
};

export function newAggregator(): ParseAggregator {
  return { warnings: [], rawUnrecognized: [] };
}

/**
 * D1 — fail-loud "recognized section header but parsed zero fields" code. A bare
 * string (no §12.4 catalog code): parser warnings render from `.message`, never
 * through lib/messages/lookup.ts, so this literal lives only at the emit sites.
 */
export const SECTION_HEADER_NO_FIELDS = "SECTION_HEADER_NO_FIELDS";

/**
 * Emit a `severity:"warn"` warning when a block parser recognized a section
 * header but extracted no fields (a silent section-drop). `severity:"warn"` is
 * mandatory — `warningSummary()` filters to "warn" for the operator-facing
 * StagedReviewCard, so an "info" emit would never surface. No-ops when `agg` is
 * undefined (the aggregator is optional in block-parser signatures).
 */
export function emitEmptySection(agg: ParseAggregator | undefined, section: string): void {
  if (!agg) return;
  agg.warnings.push({
    severity: "warn",
    code: SECTION_HEADER_NO_FIELDS,
    message: `Recognized "${section}" section header but parsed zero fields — section dropped.`,
    blockRef: { kind: section },
  });
}
