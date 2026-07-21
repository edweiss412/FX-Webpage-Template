// lib/messages/autocorrectGuidance.ts
//
// Pure composer for the autocorrect warning card's instance line (spec
// 2026-07-21-warning-card-identity-placement §4). Reads the structured
// ParseWarning.autocorrect and returns a PLAIN-TEXT sentence stating the real
// correction and, for the two crew-scoped codes, the crew member's name — or
// null, which tells the caller to fall back to the catalog helpfulContext.
//
// No I/O, no markup markers: the caller renders the result as a plain text node,
// so operator-sheet free text (subject / detected) is never parsed as markup (§4.4).
import { CREW_SCOPED_WARNING_CODES } from "@/lib/parser/autocorrectCodes";

type Autocorrect = {
  subject: string | null;
  corrections: { detected: string; corrected: string }[];
};

// Per-code sentence shape. `phrase` is the joined correction list; `subj` the
// normalized crew name (crew-scoped codes only).
const SENTENCE: Record<string, (phrase: string, subj: string) => string | null> = {
  STAGE_WORD_AUTOCORRECTED: (phrase, subj) => `We read ${phrase} in ${subj}'s role.`,
  ROLE_TOKEN_AUTOCORRECTED: (phrase, subj) => `We read ${phrase} in ${subj}'s cell.`,
  SECTION_HEADER_AUTOCORRECTED: (phrase) => `We read ${phrase}.`,
  COLUMN_HEADER_AUTOCORRECTED: (phrase) =>
    `We read ${phrase}. Fix the header in the sheet if that guess is wrong.`,
  FIELD_LABEL_AUTOCORRECTED: (phrase) =>
    `We read ${phrase}. Fix the label in the sheet if that guess is wrong.`,
};

const normalize = (s: string): string => s.trim().replace(/\s+/g, " ");

/** Join surviving pairs into the correction phrase (§4.2). */
function joinPairs(pairs: { detected: string; corrected: string }[]): string {
  const quoted = pairs.map((p) => `'${p.detected}' as '${p.corrected}'`);
  if (quoted.length === 1) return quoted[0]!;
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  if (quoted.length === 3) return `${quoted[0]}, ${quoted[1]}, and ${quoted[2]}`;
  // Four or more: first three, then "and N more" over SURVIVING pairs.
  const more = quoted.length - 3;
  return `${quoted[0]}, ${quoted[1]}, ${quoted[2]}, and ${more} more`;
}

/**
 * Compose the instance line, or null to fall back to catalog helpfulContext.
 * @param code       the warning code
 * @param autocorrect the structured correction, or undefined on legacy/non-autocorrect warnings
 */
export function autocorrectGuidance(
  code: string,
  autocorrect: Autocorrect | undefined,
): string | null {
  const sentence = SENTENCE[code];
  if (!sentence || !autocorrect) return null;

  // Normalize FIRST, then drop empty and self-equal pairs (order is load-bearing:
  // 'Load  In' vs 'Load In' must normalize-then-compare, else a self-correction leaks).
  const pairs = autocorrect.corrections
    .map((p) => ({ detected: normalize(p.detected), corrected: normalize(p.corrected) }))
    .filter((p) => p.detected.length > 0 && p.corrected.length > 0 && p.detected !== p.corrected);
  if (pairs.length === 0) return null;

  const crewScoped = CREW_SCOPED_WARNING_CODES.has(code);
  const subj = crewScoped ? normalize(autocorrect.subject ?? "") : "";
  if (crewScoped && subj.length === 0) return null; // no name → generic fallback is the honest line

  return sentence(joinPairs(pairs), subj);
}
