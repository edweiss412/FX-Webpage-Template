/**
 * Pure personalization-signal helpers for the crew block parser.
 *
 * These are separated from blocks/crew.ts so personalization logic is
 * independently testable without the full CREW block machinery.
 *
 * Canonical RoleFlag vocabulary is derived from the v4 role-master at:
 *   fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743
 */

import type { DateRestriction, StageRestriction, RoleFlag, ParseWarning } from "./types";
import { closedVocabMatch } from "@/lib/parser/fuzzyMatch";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { parseStageClause } from "@/lib/parser/stageClause";
import { ROLE_NORMALIZATIONS, MULTI_WORD_TOKENS, canonicalRoleToken } from "./roleVocabulary";

// Real single-word role codes (A1/V1/LEAD/…) — excluded from the multi-word fuzz so a
// short code is never over-corrected into a phrase (spec §8 do-not-fuzz).
const SHORT_ROLE_CODES: readonly string[] = Object.keys(ROLE_NORMALIZATIONS).filter(
  (k) => !k.includes(" "),
);

// ── Stage restriction patterns ────────────────────────────────────────────────
const FULL_STAGE_PATTERN = /Load\s+In\s*\/\s*Set\s*\/\s*Strike\s*\/\s*Load\s+Out/i;
export const FULL_STAGE_ONLY_PATTERN =
  /Load\s+In\s*\/\s*Set\s*\/\s*Strike\s*\/\s*Load\s+Out\s+ONLY\*{0,3}/i;

// ── Day restriction patterns ──────────────────────────────────────────────────
const PAREN_ONLY_PATTERN = /\(([^)]*\bONLY\b[^)]*)\)/i;
const DATE_TOKEN_PATTERN = /\d{1,2}\/\d{1,2}/g;
// Bare ONLY at end of role cell (no parens): "3/24 & 3/26 ONLY"
const BARE_DATES_ONLY_PATTERN =
  /(\d{1,2}\/\d{1,2}(?:\s*(?:[&,]|and)\s*\d{1,2}\/\d{1,2})*)\s+ONLY\b/i;
const TRIPLE_ASTERISK = /\*{3}/;

// ── extractDayRestriction ─────────────────────────────────────────────────────

export type DayRestrictionResult = {
  restriction: DateRestriction;
  cleanedNameCell: string;
  cleanedRoleCell: string;
  warnings: ParseWarning[];
};

/**
 * Scan both name cell and role cell for day-restriction markers.
 *
 * Marker forms verified against corpus:
 *  1. Paren+ONLY in name cell: "Calvin Saller (6/24 and 6/26 ONLY)"
 *  2. Paren+ONLY in role cell: "\- Load In ... (4/7 & 4/9 ONLY)"
 *  3. Bare ONLY in role cell (no parens): "... 3/24 & 3/26 ONLY"
 *  4. Triple-asterisk (date unknown) — handled by hasTripleAsterisk + caller
 *
 * If parens appear in BOTH cells, prefer role-cell and emit
 * DAY_RESTRICTION_DOUBLE_LOCATION info warning (not seen in corpus; defensive).
 */
export function extractDayRestriction(params: {
  nameCell: string;
  roleCell: string;
}): DayRestrictionResult {
  const { nameCell, roleCell } = params;
  const warnings: ParseWarning[] = [];

  const nameParenMatch = PAREN_ONLY_PATTERN.exec(nameCell);
  const roleParenMatch = PAREN_ONLY_PATTERN.exec(roleCell);

  let cleanedNameCell = nameCell;
  let cleanedRoleCell = roleCell;

  if (nameParenMatch && roleParenMatch) {
    warnings.push({
      severity: "info",
      code: "DAY_RESTRICTION_DOUBLE_LOCATION",
      message:
        "Day restriction paren+ONLY found in both name and role cells; preferring role cell.",
      rawSnippet: `name: ${nameCell} | role: ${roleCell}`,
    });
    const days = extractDateTokens(roleParenMatch[1] ?? "");
    cleanedRoleCell = roleCell.replace(PAREN_ONLY_PATTERN, "").trim();
    return { restriction: { kind: "explicit", days }, cleanedNameCell, cleanedRoleCell, warnings };
  }

  if (nameParenMatch) {
    const days = extractDateTokens(nameParenMatch[1] ?? "");
    cleanedNameCell = nameCell.replace(PAREN_ONLY_PATTERN, "").trim();
    return { restriction: { kind: "explicit", days }, cleanedNameCell, cleanedRoleCell, warnings };
  }

  if (roleParenMatch) {
    const days = extractDateTokens(roleParenMatch[1] ?? "");
    cleanedRoleCell = roleCell.replace(PAREN_ONLY_PATTERN, "").trim();
    return { restriction: { kind: "explicit", days }, cleanedNameCell, cleanedRoleCell, warnings };
  }

  // Bare ONLY in role cell (no parens): "... 3/24 & 3/26 ONLY"
  const bareRoleMatch = BARE_DATES_ONLY_PATTERN.exec(roleCell);
  if (bareRoleMatch) {
    const days = extractDateTokens(bareRoleMatch[1] ?? "");
    if (days.length > 0) {
      cleanedRoleCell = roleCell.replace(BARE_DATES_ONLY_PATTERN, "").trim();
      return {
        restriction: { kind: "explicit", days },
        cleanedNameCell,
        cleanedRoleCell,
        warnings,
      };
    }
  }

  return { restriction: { kind: "none" }, cleanedNameCell, cleanedRoleCell, warnings };
}

function extractDateTokens(text: string): string[] {
  const matches = text.match(DATE_TOKEN_PATTERN);
  return matches ?? [];
}

// ── extractStageRestriction ───────────────────────────────────────────────────

/**
 * Extract stage restriction from the role cell, delegating to the token-level
 * `parseStageClause` grammar (spec §3). Recognizes ANY subset/reordering of the 5
 * stages as an explicit restriction; a malformed clause (≥1 stage + ≥1 unreadable
 * token) yields `{kind:"none"}` + a single `UNKNOWN_STAGE_RESTRICTION` warning (the
 * fail-open whole-show choice — never partial-narrow, since an unknown token adjacent
 * to a stage may itself be a mis-typed STAGE). A zero-stage clause is a role clause and
 * emits no stage warning.
 *
 * `consumedOnlyClause` is `true` iff a VALID (bare `ONLY` / `ONLY***` / full-4 lenient)
 * STAGE clause was consumed (explicit OR malformed) — it suppresses the crew.ts
 * triple-asterisk `UNKNOWN_DAY_RESTRICTION` double-warn (spec §9).
 */
export function extractStageRestriction(roleCell: string): {
  restriction: StageRestriction;
  warnings: ParseWarning[];
  consumedOnlyClause: boolean;
} {
  const clause = parseStageClause(roleCell);
  if (clause.stages.length > 0) {
    return {
      restriction: { kind: "explicit", stages: clause.stages },
      warnings: [],
      consumedOnlyClause: true,
    };
  }
  if (clause.unrecognizedRestriction) {
    return {
      restriction: { kind: "none" },
      warnings: [
        {
          severity: "warn",
          code: "UNKNOWN_STAGE_RESTRICTION",
          message: `Role cell has a work-phase restriction we couldn't read: '${roleCell}'`,
          rawSnippet: roleCell,
        },
      ],
      consumedOnlyClause: true,
    };
  }
  return {
    restriction: { kind: "none" },
    warnings: [],
    consumedOnlyClause: clause.consumedOnlyClause,
  };
}

// ── normalizeStageWords (typo-tolerant stage-word correction) ──────────────────

/** Post-tokenization canonical stage tokens (uppercase). */
const STAGE_VOCAB = ["LOAD IN", "SET", "STRIKE", "LOAD OUT"] as const;
/** Canonical display casing for the rewrite (regexes downstream are /i, so case
 *  is cosmetic, but we keep the corpus casing). */
const STAGE_CANONICAL: Record<string, string> = {
  "LOAD IN": "Load In",
  SET: "Set",
  STRIKE: "Strike",
  "LOAD OUT": "Load Out",
};
/** Trailing restriction marker peeled from a segment's comparison token: a
 *  `ONLY` (optionally `ONLY***`) or a bare `***` (exactly three). Deliberately
 *  NOT 1–2 stars — `***`-count tolerance is deferred; `ONLY*`/`ONLY**` are left
 *  unpeeled (fall through to existing behavior). */
const STAGE_TRAILING_MARKER_RE = /(\s*\bONLY\b(?:\s*\*{3})?\s*|\s*\*{3}\s*)$/i;

export type StageWordCorrection = { detected: string; corrected: string };
export type StageNormalization = { corrected: string; corrections: StageWordCorrection[] };

/**
 * Auto-correct misspelled stage words in a cleaned role cell, confidence-gated.
 * Returns the corrected cell + the list of corrections. Gate: ≥ 2 stage-ish
 * tokens (exact OR Damerau ≤ 1) AND ≥ 1 exact stage anchor. A recognized role
 * (ROLE_NORMALIZATIONS) is classified as a role first and never rewritten. Only
 * near-miss segments are rewritten; exact-stage and non-stage segments (incl.
 * hyphenated text) and the peeled ONLY/*** marker are preserved verbatim.
 */
export function normalizeStageWords(roleCell: string): StageNormalization {
  // Split keeping separators (odd indices) so the rebuild is faithful.
  const parts = roleCell.split(/([/\-])/);
  let exactCount = 0;
  let stageIshCount = 0;
  // candidate[i] holds the canonical UPPER vocab member for a part to rewrite.
  const candidate: (string | null)[] = new Array(parts.length).fill(null);

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue; // separator
    const raw = parts[i] ?? "";
    const marker = raw.match(STAGE_TRAILING_MARKER_RE)?.[0] ?? "";
    const head = marker ? raw.slice(0, raw.length - marker.length) : raw;
    const cmp = head.trim().toUpperCase();
    if (!cmp) continue;
    if (ROLE_NORMALIZATIONS[cmp]) continue; // role-exclusion: never a stage word
    if ((STAGE_VOCAB as readonly string[]).includes(cmp)) {
      exactCount += 1;
      stageIshCount += 1;
      continue;
    }
    const match = closedVocabMatch(cmp, STAGE_VOCAB, 1);
    if (match && !match.exact) {
      stageIshCount += 1;
      candidate[i] = match.match;
    }
  }

  // Confidence gate.
  if (!(stageIshCount >= 2 && exactCount >= 1)) {
    return { corrected: roleCell, corrections: [] };
  }

  const corrections: StageWordCorrection[] = [];
  const rebuilt = parts.map((raw, i) => {
    const cand = candidate[i];
    if (!cand) return raw;
    const marker = raw.match(STAGE_TRAILING_MARKER_RE)?.[0] ?? "";
    const head = marker ? raw.slice(0, raw.length - marker.length) : raw;
    const detected = head.trim();
    const corrected = STAGE_CANONICAL[cand] ?? cand;
    corrections.push({ detected, corrected });
    // Replace the trimmed head core, preserving head's surrounding whitespace + the marker.
    return head.replace(detected, corrected) + marker;
  });

  return { corrected: rebuilt.join(""), corrections };
}

// ── extractRoleFlags ──────────────────────────────────────────────────────────

export type RoleFlagResult = {
  flags: RoleFlag[];
  unknownTokens: string[];
  warnings: ParseWarning[];
};

/**
 * Extract canonical role flags from the cleaned role cell text.
 *
 * Algorithm:
 *  1. Strip the stage-restriction prefix (the full stage list + separator).
 *  2. Strip leading/trailing dashes and whitespace.
 *  3. Match multi-word tokens first, then split remainder by "/" and "-".
 *  4. Normalize each token to canonical RoleFlag.
 *  5. Unknown tokens → UNKNOWN_ROLE_TOKEN warning, dropped from result.
 */
export function extractRoleFlags(roleCell: string): RoleFlagResult {
  const warnings: ParseWarning[] = [];
  const hasOnlyMarker = /\bONLY\b/i.test(roleCell);
  const flags: RoleFlag[] = [];
  const unknownTokens: string[] = [];
  const pushFlag = (flag: RoleFlag) => {
    if (!flags.includes(flag)) flags.push(flag);
  };

  // A consumed with-ONLY stage clause is removed via the shared grammar: `cleaned` is
  // roleCell UNCHANGED unless a with-ONLY clause was consumed (explicit → ROLE tokens +
  // tail; malformed → ROLE + UNKNOWN tokens + tail; No-stage → unchanged). This replaces
  // the three hardcoded with-ONLY strip-patterns (FULL_STAGE_ONLY / LOAD_IN_SET_ONLY /
  // LOAD_OUT_STRIKE_ONLY). The descriptive full-stage-list (NO ONLY) prefix strip is
  // RETAINED below — it is not one of the three de-duplicated restriction patterns.
  let remainder = parseStageClause(roleCell).cleaned;

  // Strip descriptive full stage list prefix (no-ONLY "works all phases" case).
  if (FULL_STAGE_PATTERN.test(remainder)) {
    remainder = remainder.replace(
      /^\s*-?\s*Load\s+In\s*\/\s*Set\s*\/\s*Strike\s*\/\s*Load\s+Out\s*(ONLY\*{0,3})?\s*(-{1,2}\s*)?/i,
      "",
    );
    // If nothing remained after the stage list (e.g. "ONLY***" or bare "ONLY"), clear it.
    remainder = remainder.replace(/^\s*ONLY\*{0,3}\s*$/i, "").trim();
  }

  // Strip triple asterisks
  remainder = remainder.replace(TRIPLE_ASTERISK, "").trim();

  // Strip leading/trailing dashes and whitespace
  remainder = remainder.replace(/^[\s\-]+|[\s\-]+$/g, "").trim();

  if (!remainder) {
    if (hasOnlyMarker) pushFlag("ONLY");
    return { flags, unknownTokens, warnings };
  }

  // Match multi-word tokens before splitting
  let working = remainder;
  const extractedMultiWord: RoleFlag[] = [];
  for (const mwt of MULTI_WORD_TOKENS) {
    const mwtRegex = new RegExp(`\\b${mwt.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (mwtRegex.test(working)) {
      const flag = ROLE_NORMALIZATIONS[mwt];
      if (flag) extractedMultiWord.push(flag);
      working = working.replace(mwtRegex, "").trim();
    }
  }

  // Tokenize by "/" and "-"
  const rawTokens = working
    .split(/[/\-]/)
    .map((t) => canonicalRoleToken(t))
    .filter((t) => t.length > 0);

  for (const tok of rawTokens) {
    if (!tok) continue;
    // ONLY is a recognized restriction marker. It is added once below from
    // hasOnlyMarker so it is not duplicated when tokenized directly.
    if (tok === "ONLY") continue;
    const canonical = ROLE_NORMALIZATIONS[tok];
    if (canonical) {
      pushFlag(canonical);
    } else {
      // Conservative multi-word fuzzy correction: only fuzz a token that ALREADY
      // contains a space (a multi-word phrase typo like 'CONTENT CRETION'); a
      // space-deletion typo ('CAMOP') is NOT corrected — never over-corrects a short
      // single-word code into a phrase. Exclude the real short role codes.
      const fix = tok.includes(" ")
        ? gatedVocabCorrect(tok, MULTI_WORD_TOKENS, { exclude: SHORT_ROLE_CODES })
        : null;
      const fixedFlag = fix?.corrected ? ROLE_NORMALIZATIONS[fix.match] : undefined;
      if (fix?.corrected && fixedFlag) {
        pushFlag(fixedFlag);
        warnings.push({
          severity: "warn",
          code: "ROLE_TOKEN_AUTOCORRECTED",
          message: `Read likely-misspelled role '${tok}' as '${fix.match}' in role cell: '${roleCell}'`,
          rawSnippet: roleCell,
          // subject is null here (extractRoleFlags is pure, no crew name in scope);
          // stamped with displayName at crew.ts (spec §3.2 site 2).
          autocorrect: { subject: null, corrections: [{ detected: tok, corrected: fix.match }] },
        });
      } else {
        unknownTokens.push(tok);
        warnings.push({
          severity: "warn",
          code: "UNKNOWN_ROLE_TOKEN",
          message: `Unknown role token: '${tok}' in role cell: '${roleCell}'`,
          rawSnippet: roleCell,
          roleToken: tok,
        });
      }
    }
  }

  for (const mwFlag of extractedMultiWord) {
    pushFlag(mwFlag);
  }

  if (hasOnlyMarker) {
    pushFlag("ONLY");
  }

  return { flags, unknownTokens, warnings };
}

// ── hasTripleAsterisk ────────────────────────────────────────────────────────

/** Returns true if the role cell contains *** */
export function hasTripleAsterisk(roleCell: string): boolean {
  return TRIPLE_ASTERISK.test(roleCell);
}
