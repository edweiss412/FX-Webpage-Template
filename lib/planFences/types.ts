/**
 * lib/planFences/types.ts — the plan-fence gate's vocabulary.
 *
 * Spec: docs/superpowers/specs/2026-08-06-arc-b-review-infra.md §2.1.
 */

/**
 * The CLOSED operator set (spec §1.1 item 2). A sixth shape is a registry change
 * carrying its own before/after corpus numbers — never an ad-hoc addition, and
 * never a finding on a diff that merely wishes the gate were wider.
 */
export const RULE_NAMES = [
  "UNIMPORTED_IDENTIFIER",
  "DUPLICATE_IMPORT",
  "MANGLED_TEMPLATE",
  "UNCHECKED_INDEX",
  "FENCE_EM_DASH",
] as const;

export type RuleName = (typeof RULE_NAMES)[number];

export function isRuleName(s: string): s is RuleName {
  return (RULE_NAMES as readonly string[]).includes(s);
}

/**
 * One finding, carrying the FOUR-FIELD identity the baseline matches on
 * (spec §2.1 R1 F1 + R2 F4). `instance` is the rule's per-instance identity
 * token — defined for every rule, because a baseline keyed on
 * `{path, line, rule}` alone cannot tell a second distinct violation in an
 * already-baselined fence from the one that was frozen.
 */
export type Finding = {
  path: string;
  /** 1-based line of the fence OPENER the finding belongs to. */
  fenceLine: number;
  rule: RuleName;
  instance: string;
  /** Occurrences of this exact identity within this fence. */
  count: number;
  /** Set when a rule-scoped waiver suppressed it; such findings are REPORTED. */
  waivedReason?: string;
};

export type WaiverErrorCode = "UNKNOWN_RULE" | "MISSING_REASON" | "SUPPRESSED_NOTHING";

export type WaiverError = {
  path: string;
  line: number;
  code: WaiverErrorCode;
  message: string;
};

/**
 * A fence the extractor could not place (an opener with no closer). REPORTED,
 * never silently skipped — limit 3b: a conservative demotion that is visible is
 * a documented limit; one that is invisible is a hole.
 */
export type UnplacedFence = { path: string; line: number; reason: string };

export type PlanFenceReport = {
  path: string;
  /** Non-waived findings. These are what the gate fails on. */
  findings: Finding[];
  /** Waived findings, kept so a waiver is a visible count and never a silent absence. */
  waived: Finding[];
  waiverErrors: WaiverError[];
  unplaced: UnplacedFence[];
  /** Every placed fence, of any info string. */
  fences: number;
  /** Fences passing the eligibility predicate (i.e. treated as code). */
  eligibleFences: number;
  /** Eligible fences carrying exactly one backticked source-path token above them. */
  attributedFences: number;
};
