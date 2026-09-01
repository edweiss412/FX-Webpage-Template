/**
 * Forced-colors census: the disposition of every candidate the two scanner arms
 * report. Spec `docs/superpowers/specs/2026-09-01-forced-colors-pass.md` §4.4,
 * plan `docs/superpowers/plans/2026-09-01-forced-colors-pass.md`.
 *
 * WHY A CENSUS AND NOT A FILTER. Both arms REPORT candidates and neither decides
 * that a candidate is a defect, because CSS alone cannot say when a rule applies
 * and cannot see a glyph. Every reported candidate is therefore either repaired by
 * this pass or carries a row here naming the carrier that survives. Silence is not
 * a disposition.
 *
 * Rows are content-keyed on the subject rather than on a line number, because a
 * line-keyed registry rots under any edit above it — the lesson
 * `tests/styles/controlOutlineScan.ts:99-196` records in a hundred lines of
 * re-keying history.
 */

/** Why a reported Arm 2 rule is not a defect, or how it is repaired. */
export type CarrierDisposition =
  /** The pass repairs it in the forced-colors block. */
  | "repaired"
  /** Deliberately flattened; the spec's Documented Limits names the class. */
  | "deliberate-flatten";

export type CarrierCensusRow = {
  /** The rule's selector or `@keyframes <name>`, exactly as the arm reports it. */
  readonly subject: string;
  readonly disposition: CarrierDisposition;
  /** Names the carrier that survives, or the spec limit that accepts the flatten. */
  readonly reason: string;
};

/**
 * Arm 2's twelve A2a rules and five A2b animations, as reported on the base of
 * this branch. The count is pinned by the suite: a census that silently grows
 * passes a subset assertion, which is why the literal is asserted rather than the
 * membership alone.
 */
export const CARRIER_CENSUS: readonly CarrierCensusRow[] = [
  // ── The three cues, and the gradient. Repaired by the pass. ──
  {
    subject: "@keyframes share-link-flash-ring",
    disposition: "repaired",
    reason: "the cue this pass is named for; its only carrier is a dropped box-shadow (spec §5.1)",
  },
  {
    subject: "@keyframes share-link-flash-bg",
    disposition: "repaired",
    reason: "the background leg of the same cue; both endpoints force to one value (spec §5.1)",
  },
  {
    subject: "@keyframes step3-warning-flash",
    disposition: "repaired",
    reason: "a jump-target highlight whose only carrier is a forced background (spec §5.2)",
  },
  {
    subject: "[data-step3-warning-flash]",
    disposition: "repaired",
    reason:
      "the steady reduced-motion fallback for the same cue. Its carrier is FORCED rather than dropped, which is the case the first Arm 2 criterion could not see (spec §5.2)",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]:indeterminate::-webkit-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]:indeterminate::-webkit-progress-bar',
    disposition: "repaired",
    reason:
      "the indeterminate shimmer, on BOTH the step-2 and finalize bars: the rule is a grouped selector and this pass repairs both (spec §5.5)",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]:indeterminate::-moz-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]:indeterminate::-moz-progress-bar',
    disposition: "repaired",
    reason: "the same shimmer in Gecko, whose rule also sets a transparent background (spec §5.5)",
  },

  // ── The freshness cue. NOT repaired: it already survives. ──
  {
    subject: "@keyframes section-freshness-flash-1",
    disposition: "deliberate-flatten",
    reason:
      "the fade is lost and the signal is not: the gating attribute is present only during a flash, so the forced opaque outline IS the cue (spec §5.3, §8 limit 7)",
  },
  {
    subject: "@keyframes section-freshness-flash-2",
    disposition: "deliberate-flatten",
    reason: "the alternate body of the same cue, kept identical by an existing drift pin",
  },
  {
    subject: "[data-section-freshness-flash]",
    disposition: "deliberate-flatten",
    reason:
      "its reduced-motion arm; under forced colors a reduced-motion user sees the steady outline the normal-mode design withholds, accepted for symmetry since the fade is gone for everyone (spec §8 limit 8)",
  },

  // ── Base reading colour. Flattening these is what forced colors is FOR. ──
  {
    subject: "html",
    disposition: "deliberate-flatten",
    reason: "the page's base colour pair; the user asked for the palette (spec §8 limit 2)",
  },
  {
    subject: ".help-prose > h1",
    disposition: "deliberate-flatten",
    reason: "a reading-hierarchy heading colour, not a state (spec §8 limit 2)",
  },
  {
    subject: ".help-prose > h2",
    disposition: "deliberate-flatten",
    reason: "same",
  },
  {
    subject: ".help-prose > h3",
    disposition: "deliberate-flatten",
    reason: "same",
  },
  {
    subject: '.help-prose > table[data-stack="true"] .th-label',
    disposition: "deliberate-flatten",
    reason: "a stacked-table label colour under 480px; hierarchy, not state (spec §8 limit 2)",
  },

  // ── The progress track's non-indeterminate rules. ──
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]::-webkit-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]::-webkit-progress-bar',
    disposition: "repaired",
    reason: "the determinate track, repaired alongside the fill so the two stay distinguishable",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]::-webkit-progress-value,\nprogress[data-testid="wizard-finalize-progressbar"]::-webkit-progress-value',
    disposition: "repaired",
    reason: "the determinate fill; it is the half AC-5's negative control deletes",
  },
  {
    subject:
      'progress[data-testid="wizard-step2-progressbar"]::-moz-progress-bar,\nprogress[data-testid="wizard-finalize-progressbar"]::-moz-progress-bar',
    disposition: "repaired",
    reason: "the same fill in Gecko, a separate declaration and a separate control",
  },
];
