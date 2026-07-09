/**
 * step3Buckets — pure, unit-testable derivations for the wizard Step-3 row-level
 * tri-state (clean / judgment / needs-look) and the FIELD_LABELS lookup
 * (spec 2026-07-07-ambiguity-warnings-v1-design §7.2 / §7.3 / §7.3a).
 *
 * Extracted from the components (Step3Review.tsx `rowNeedsLook`, Step3SheetCard.tsx
 * `needsLook`) so Task 9 tests target these functions and the Task 11 chrome wires
 * to them. These add NO rendered output — the third visual state, callout variant,
 * and three-count summary copy are all Task 11.
 *
 * Universe note (§7.1): row-level needs-look/judgment derives ONLY from the
 * GAP_CLASSES-member warnings (summarizeDataGaps semantics — the SAME universe
 * `rowNeedsLook` consumes today), NOT all warn-severity warnings. Section status
 * (step3SectionStatus.ts `sectionStatus`) uses the broader ALL-warn universe, so a
 * row can be judgment at the summary while one of its sections is flagged.
 */
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import {
  GAP_CLASSES,
  summarizeDataGaps,
  stripLegacyUnknownFieldAnchors,
} from "@/lib/parser/dataGaps";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";

/**
 * Minimal structural view of a Step-3 row. The real `Step3Row`
 * (components/admin/wizard/Step3Review.tsx:80) is structurally compatible, so the
 * wizard passes its rows directly while these functions stay dependency-free and
 * unit-testable.
 */
export type Step3RowLike = {
  parseResult?: { show?: unknown; warnings?: unknown } | null;
  lastFinalizeFailureCode?: string | null;
};

// Local, dependency-free `Array.isArray` coercion (mirrors step3ReviewSections
// `arr`) so this lib module never imports a component.
const arr = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

/**
 * The GAP-universe warnings a row contributes to needs-look / judgment: the row's
 * parse warnings with legacy UNKNOWN_FIELD anchors stripped (identical to what
 * `rowNeedsLook` / the card `needsLook` consume today).
 */
function gapWarnings(row: Step3RowLike): ParseWarning[] {
  return stripLegacyUnknownFieldAnchors(
    arr((row.parseResult as ParseResult | null | undefined)?.warnings),
  );
}

/**
 * Preview-presence predicate — identical to Step3Review.tsx `hasReviewablePreview`
 * (:776-779), reproduced here so `rowNeedsLookPure` keeps its first OR branch
 * without a lib→component import. A staged row carries its `ParseResult` (with a
 * `show`); non-staged/corrupt rows do not.
 */
function hasReviewablePreview(row: Step3RowLike): boolean {
  const pr = row.parseResult;
  return pr != null && typeof pr === "object" && !!(pr as ParseResult).show;
}

/**
 * The row's NON-ambiguity gap count: `summarizeDataGaps` over the stripped GAP
 * universe, summed across `GAP_CLASSES` whose code is NOT an ambiguity code. This
 * is the ONLY clause of `rowNeedsLook` partitioned by `isAmbiguityCode` (§7.2).
 */
export function nonAmbiguityGapTotal(row: Step3RowLike): number {
  const s = summarizeDataGaps(gapWarnings(row));
  return GAP_CLASSES.reduce((n, g) => n + (isAmbiguityCode(g.code) ? 0 : s.classes[g.code]), 0);
}

/**
 * Needs-look predicate (§7.2): preserves ALL of today's OR branches — no
 * reviewable preview OR a finalize failure — and replaces the `summarizeDataGaps
 * total > 0` clause with the NON-ambiguity gap total. A missing-preview or
 * finalize-failed row stays needs-look regardless of warning classes.
 */
export function rowNeedsLookPure(row: Step3RowLike): boolean {
  return (
    !hasReviewablePreview(row) ||
    row.lastFinalizeFailureCode != null ||
    nonAmbiguityGapTotal(row) > 0
  );
}

/**
 * Judgment predicate (§7.2): precedence needs-look > judgment > clean. A row is
 * judgment iff it is NOT needs-look AND carries ≥1 warn-severity ambiguity-code
 * warning over the SAME stripped GAP universe (every ambiguity code is a gap class
 * — the `AMBIGUITY_CODES ⊆ GAP_CLASSES` invariant — so `isAmbiguityCode` alone is
 * the §7.2 `isAmbiguityCode && DATA_GAP_CODES.has` predicate).
 */
export function rowIsJudgment(row: Step3RowLike): boolean {
  if (rowNeedsLookPure(row)) return false;
  return gapWarnings(row).some((w) => w.severity === "warn" && isAmbiguityCode(w.code));
}

export type Step3Buckets = {
  clean: number;
  judgment: number;
  needsLook: number;
  showJudgmentBucket: boolean;
};

/**
 * Partition `publishRows` into the three summary buckets (§7.2). Counting unit is
 * the publish-grid rows ONLY — the caller passes `publishRows`, so blocking and
 * set-aside rows never enter these counts. Precedence needs-look > judgment >
 * clean; `clean + judgment + needsLook === publishRows.length`. `showJudgmentBucket`
 * is `judgment > 0` (M=0 ⇒ false ⇒ the existing two-state summary, no empty
 * "0 parsed with judgment" chrome).
 */
export function deriveStep3Buckets(publishRows: readonly Step3RowLike[]): Step3Buckets {
  let needsLook = 0;
  let judgment = 0;
  for (const row of publishRows) {
    if (rowNeedsLookPure(row)) needsLook += 1;
    else if (rowIsJudgment(row)) judgment += 1;
  }
  const clean = publishRows.length - needsLook - judgment;
  return { clean, judgment, needsLook, showJudgmentBucket: judgment > 0 };
}

/**
 * Plain-language labels for a warning's `blockRef.field` (§7.3) — raw internal
 * tokens never leak into UI copy. An empty/unknown/unmapped field falls back to
 * `null` so the caller omits the field phrase entirely.
 */
export const FIELD_LABELS = {
  dims: "dimensions",
  name: "room name",
  guests: "guest list",
  order: "date order",
} as const;

export function fieldLabelFor(field: string | null | undefined): string | null {
  if (!field) return null;
  return (FIELD_LABELS as Record<string, string>)[field] ?? null;
}
