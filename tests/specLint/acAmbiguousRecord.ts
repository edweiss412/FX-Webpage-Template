/**
 * The committed record of AMBIGUOUS declaring lines (AC-10, spec §7 limit 7).
 *
 * A line carrying more than one distinct id is declined in both directions,
 * because the recognizer cannot tell this plan's sibling criterion
 * (`- AC-10 … + AC-10b …`) from a cross-reference to another document's
 * (`- AC-6 … ; AC-11.11 carries r12`), and three review rounds each found a new
 * lexical class trying. Declining on a COUNT of ids is structural rather than
 * lexical, so it has no next grammar corner.
 *
 * "Recorded by name" was a promise with nothing behind it until this file
 * existed: a generated snapshot regenerates, and a line added after it would
 * have been declined in silence, which is the consequence bound's one forbidden
 * outcome. `acAmbiguousCorpus.test.ts` asserts the LIVE set equals this record
 * exactly, so a new multi-id declaring line reds until someone looks at it, and
 * the declining is loud by construction rather than by intention.
 */
export interface AmbiguousRow {
  plan: string;
  /** 1-based. */
  line: number;
  /** the distinct ids on that line, in document order. */
  ids: string[];
}

export const AC_AMBIGUOUS_RECORD: AmbiguousRow[] = [
  {
    plan: "docs/superpowers/plans/2026-08-03-pre-review-gate-arms.md",
    line: 238,
    ids: ["AC-1", "AC-20", "AC-21"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-03-pre-review-gate-arms.md",
    line: 240,
    ids: ["AC-3", "AC-19"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-09-help-report-surface.md",
    line: 61,
    ids: ["AC-6", "AC-11.11"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-09-watch-promotion-activation-race-fix.md",
    line: 32,
    ids: ["AC-7", "AC-6.18"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md",
    line: 39,
    ids: ["AC-2", "AC-2b"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md",
    line: 91,
    ids: ["AC-2", "AC-10b"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-15-sync-log-emit-guard/plan.md",
    line: 57,
    ids: ["AC-6", "AC-1", "AC-2", "AC-3"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-15-theme-persistence-note/plan.md",
    line: 53,
    ids: ["AC-10", "AC-10b"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-19-premisescan-nested-hook-sibling-leak.md",
    line: 21,
    ids: ["AC-3", "AC-12b"],
  },
  { plan: "docs/superpowers/plans/2026-08-21-app-e2e-batch2.md", line: 29, ids: ["AC-4", "AC-3"] },
  {
    plan: "docs/superpowers/plans/2026-08-25-drift-residue/plan.md",
    line: 54,
    ids: ["AC-1.4", "AC-1.2"],
  },
  {
    plan: "docs/superpowers/plans/2026-08-27-mi11-removal-fallback-live-row.md",
    line: 27,
    ids: ["AC-7", "AC-8"],
  },
  {
    plan: "docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md",
    line: 84,
    ids: ["AC-1", "AC-1b", "AC-1c"],
  },
  {
    plan: "docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md",
    line: 93,
    ids: ["AC-6", "AC-4"],
  },
];
