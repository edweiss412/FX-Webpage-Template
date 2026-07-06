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
 * True iff a `segment` OUTSIDE the full-4 phrase (its leading PREFIX or trailing TAIL) carries
 * content the full-4 fast-path would silently DROP: a SECOND ONLY marker, a recognized STAGE
 * token, or an UNKNOWN NON-role token. Symmetric for prefix and tail (whole-diff Codex R2/R4/R5)
 * so the unanchored `FULL_STAGE_ONLY_PATTERN` can never narrow the restriction and HIDE work days
 * (spec §9 fail-open):
 *   - a dropped STAGE (`Show / … ONLY`, `… ONLY / Strike`) → skip fast-path → the general grammar
 *     parses ALL present stages explicitly;
 *   - an UNKNOWN token alongside the 4 stages (`Showw / … ONLY` — a garbled `Show`, R5) → skip
 *     fast-path → the general grammar marks it MALFORMED and fails open with UNKNOWN_STAGE_RESTRICTION,
 *     rather than silently assuming a valid 4-stage restriction and hiding the intended 5th stage.
 * A CLEAN role token (`… ONLY - LEAD`, `A1 - … ONLY`) is NOT dropped content — it routes to the
 * role path via `cleaned` — so it does NOT trigger a skip; the per-token test uses the SAME
 * `ROLE_NORMALIZATIONS` standard as the general body classification, keeping the two paths
 * consistent (the general grammar already treats stage+unknown as malformed→fail-open).
 */
function dropsStageContent(segment: string): boolean {
  if (STRICT_ONLY_MARKER_RE.test(segment) || FULL_STAGE_ONLY_PATTERN.test(segment)) return true;
  for (const raw of segment.split(/[/\-]/)) {
    const tt = raw.trim();
    if (!tt) continue;
    const up = tt.toUpperCase();
    if (stageOf(up) || !ROLE_NORMALIZATIONS[up]) return true;
  }
  return false;
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
  if (full4 && !dropsStageContent(roleCell.slice(0, full4.index))) {
    const prefix = roleCell.slice(0, full4.index);
    const tail = roleCell.slice(full4.index + full4[0].length);
    // `FULL_STAGE_ONLY_PATTERN` is `ONLY\*{0,3}`, so `ONLY****` leaves a LEFTOVER star run in the
    // tail. Those stars are marker EMPHASIS, NOT dropped stage content — origin/main keeps the
    // 4-stage restriction for ANY star count (R17 f1 backward-compat). Strip a leading star-run
    // before the tail check so the carve-out does NOT regress to whole-show on `ONLY****` (R3),
    // while a real dropped stage (`… ONLY**** / Show`) still fails open. `cleaned` stays verbatim.
    const malformed = dropsStageContent(tail.replace(/^\s*\*+/, ""));
    return {
      stages: malformed ? [] : ["Load In", "Set", "Strike", "Load Out"],
      cleaned: prefix + tail,
      unrecognizedRestriction: malformed,
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

  // Explicit (≥1 STAGE, 0 UNKNOWN, clean tail) OR Malformed (body UNKNOWN, or the tail carries
  // dropped stage content — a second ONLY / a stage token / an unknown non-role token, R2).
  // Both preserve the non-stage tokens (roles for explicit; roles + unknown/typo for malformed).
  const malformed = hasUnknown || dropsStageContent(tail);
  const core = nonStageTokens.join(" / ");
  return {
    stages: malformed ? [] : stages,
    cleaned: core + tail,
    unrecognizedRestriction: malformed,
    consumedOnlyClause: true,
  };
}
