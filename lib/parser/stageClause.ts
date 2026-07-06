/**
 * Token-level stage-restriction grammar (spec §3.2).
 *
 * Replaces the three hardcoded stage-restriction phrasings in `personalization.ts`
 * with ONE order-independent grammar shared by both consumers (`extractStageRestriction`
 * and `extractRoleFlags`). Recognizes any subset/reordering of the 5 stages
 * (Load In / Set / Show / Strike / Load Out) as an explicit restriction, signals a
 * malformed clause (a real stage mixed with an unreadable token) as
 * `UNKNOWN_STAGE_RESTRICTION`, and leaves a zero-stage clause to the role path.
 *
 * Constants are single-sourced: `FULL_STAGE_ONLY_PATTERN` and `ROLE_NORMALIZATIONS`
 * are imported from `personalization.ts` (used ONLY inside the function body so the
 * circular import — personalization imports `parseStageClause` — never touches an
 * uninitialized binding at module-eval time).
 */

import type { WorkPhase } from "./types";
import { FULL_STAGE_ONLY_PATTERN, ROLE_NORMALIZATIONS } from "./personalization";

/** The 5 recognized stage tokens (NEW: Show added — already a valid WorkPhase). */
const STAGE_RESTRICTION_VOCAB = ["LOAD IN", "SET", "SHOW", "STRIKE", "LOAD OUT"] as const;
const STAGE_RESTRICTION_CANONICAL: Record<string, WorkPhase> = {
  "LOAD IN": "Load In",
  SET: "Set",
  SHOW: "Show",
  STRIKE: "Strike",
  "LOAD OUT": "Load Out",
};

/**
 * STRICT ONLY marker (generalized grammar): valid ONLY as bare `ONLY` or `ONLY***`
 * (exactly three stars). A trailing 1–2 stars (`ONLY*` / `ONLY**`) or 4+ (`ONLY****`)
 * is NOT a valid marker — the negative lookahead `(?!\s*\*)` rejects any ONLY-token
 * followed by a non-triple star run. Mirrors the live `STAGE_TRAILING_MARKER_RE`
 * (`personalization.ts:183-187`). The full-4 lenient-star carve-out (step 2) is the
 * ONLY exception and is checked FIRST.
 */
const STRICT_ONLY_MARKER_RE = /\bONLY\b(?:\s*\*{3})?(?!\s*\*)/i;

export type StageClause = {
  /** Recognized stage tokens in appearance order, deduped. Empty if none recognized. */
  stages: WorkPhase[];
  /** The role cell with the leading stage clause + ONLY marker removed, for role-flag tokenizing. */
  cleaned: string;
  /** True IFF the body has a valid ONLY marker AND ≥1 recognized STAGE token AND ≥1 UNKNOWN token. */
  unrecognizedRestriction: boolean;
  /**
   * True whenever a trailing `ONLY` / `ONLY***` marker (or the full-4 `ONLY*{0,3}`)
   * was consumed as a STAGE clause (explicit OR malformed OR full-4) — the signal that
   * suppresses the pre-existing crew triple-asterisk `UNKNOWN_DAY_RESTRICTION` guard
   * (spec §9). A pure role clause (zero stages) leaves this FALSE even when it carries
   * an ONLY marker, so a bare `***` still routes through the existing day-restriction path.
   */
  consumedOnlyClause: boolean;
};

/** True iff `upper` (trimmed, uppercased) is exactly a recognized stage token. */
function stageOf(upper: string): WorkPhase | null {
  return (STAGE_RESTRICTION_VOCAB as readonly string[]).includes(upper)
    ? STAGE_RESTRICTION_CANONICAL[upper]!
    : null;
}

/**
 * Parse the role cell's leading stage clause (spec §3.2 steps 1-4).
 */
export function parseStageClause(roleCell: string): StageClause {
  // 1. Strip an optional leading dash + whitespace (preserved in `cleaned` reconstruction).
  const leadingDash = /^\s*-\s*/.exec(roleCell)?.[0] ?? "";

  // 2. Full-4-list lenient-star carve-out FIRST (backward-compat, R17 f1). The VERBATIM
  //    live `FULL_STAGE_ONLY_PATTERN` (UNANCHORED, `ONLY\*{0,3}`) accepts ANY trailing
  //    star count. `cleaned` PRESERVES the ENTIRE prefix + tail (excise only the span).
  const full4 = FULL_STAGE_ONLY_PATTERN.exec(roleCell);
  if (full4) {
    const prefix = roleCell.slice(0, full4.index);
    const tail = roleCell.slice(full4.index + full4[0].length);
    return {
      stages: ["Load In", "Set", "Strike", "Load Out"],
      cleaned: prefix + tail,
      unrecognizedRestriction: false,
      consumedOnlyClause: true,
    };
  }

  // 3. Otherwise, find the STRICT ONLY marker. If none (ABSENT, incl. `ONLY*`/`ONLY**`) →
  //    not a consumed clause; `cleaned` is roleCell UNCHANGED (fail-safe to the role path).
  const marker = STRICT_ONLY_MARKER_RE.exec(roleCell);
  if (!marker) {
    return {
      stages: [],
      cleaned: roleCell,
      unrecognizedRestriction: false,
      consumedOnlyClause: false,
    };
  }

  // 4. ONLY present (non-full-4). body = between the leading dash and the ONLY marker;
  //    tail = text after the marker.
  const body = roleCell.slice(leadingDash.length, marker.index);
  const tail = roleCell.slice(marker.index + marker[0].length);

  // Token classification (per-TOKEN, NOT per-`/`-segment — R25 f1). Split on `/` AND `-`;
  // multi-word roles (`SHOW CALLER`, `CAM OP`, …) contain a SPACE but no `/`/`-`, so they
  // survive the split intact and match `ROLE_NORMALIZATIONS` directly — `SHOW` can never
  // decompose out of `SHOW CALLER` (R1 f1). STAGE is checked before ROLE.
  const stages: WorkPhase[] = [];
  const nonStageTokens: string[] = []; // ROLE + UNKNOWN, in appearance order
  let hasUnknown = false;

  for (const raw of body.split(/[/\-]/)) {
    const tokenText = raw.trim();
    if (!tokenText) continue;
    const upper = tokenText.toUpperCase();
    const stage = stageOf(upper);
    if (stage) {
      if (!stages.includes(stage)) stages.push(stage);
      continue;
    }
    // Not a stage → ROLE or UNKNOWN. Both are preserved in `cleaned` and routed back to
    // `extractRoleFlags` (recognized roles flag; unknowns emit UNKNOWN_ROLE_TOKEN; typo
    // roles autocorrect). Only STAGE tokens are excised.
    nonStageTokens.push(tokenText);
    if (!ROLE_NORMALIZATIONS[upper]) hasUnknown = true;
  }

  // No-stage (ROLE clause): zero STAGE tokens → not a restriction; `cleaned` unchanged.
  if (stages.length === 0) {
    return {
      stages: [],
      cleaned: roleCell,
      unrecognizedRestriction: false,
      consumedOnlyClause: false,
    };
  }

  // Explicit (≥1 STAGE, 0 UNKNOWN) OR Malformed (≥1 STAGE, ≥1 UNKNOWN). Both preserve the
  // non-stage tokens (roles for explicit; roles + unknown/typo for malformed) + the tail.
  const core = nonStageTokens.join(" / ");
  return {
    stages: hasUnknown ? [] : stages,
    cleaned: core + tail,
    unrecognizedRestriction: hasUnknown,
    consumedOnlyClause: true,
  };
}
