// lib/parser/blocks/_sectionHeaderMatch.ts
import { normalizeHeader } from "@/lib/parser/knownSections";

export interface Col0HeaderOpts {
  /** Match case-insensitively (adds the `i` flag). Default false (case-sensitive). */
  caseInsensitive?: boolean;
  /** Allow leading whitespace before the opening pipe. Default false. */
  allowLeadingWs?: boolean;
}

/** Escape regex metacharacters, then treat a literal space as `\s+` so multi-space
 *  headers still match (mirrors the historical `EVENT\s+DETAILS` shapes). */
function tokenToPattern(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
}

function altGroup(tokens: readonly string[]): string {
  // longest-first so a prefix token (`GS DETAILS`) cannot shadow a longer one
  // (`GS DETAILS (FOR BOTH)`) inside the alternation.
  return [...tokens]
    .sort((a, b) => b.length - a.length)
    .map(tokenToPattern)
    .join("|");
}

function flags(opts: Col0HeaderOpts): string {
  return opts.caseInsensitive ? "im" : "m";
}

/** Whole-cell pipe-anchored col0 matcher: `^ [ws] | [ws] TOKEN [ws] |`. */
export function buildCol0HeaderRe(tokens: readonly string[], opts: Col0HeaderOpts = {}): RegExp {
  const lead = opts.allowLeadingWs ? "\\s*" : "";
  return new RegExp(`^${lead}\\|\\s*(?:${altGroup(tokens)})\\s*\\|`, flags(opts));
}

/** Alternation matcher allowing a trailing non-pipe suffix after the token
 *  before the closing pipe (agenda `AGENDA LINK - X`, event `DETAILS/ROOM DIAGRAM`). */
export function buildCol0HeaderAltRe(tokens: readonly string[], opts: Col0HeaderOpts = {}): RegExp {
  const lead = opts.allowLeadingWs ? "\\s*" : "";
  return new RegExp(`^${lead}\\|\\s*(?:${altGroup(tokens)})[^|]*\\|`, flags(opts));
}

/** True iff `normalizeHeader(col0)` equals one of the tokens (each also normalized). */
export function matchesSectionHeader(col0: string, tokens: readonly string[]): boolean {
  const n = normalizeHeader(col0);
  return tokens.some((t) => normalizeHeader(t) === n);
}
