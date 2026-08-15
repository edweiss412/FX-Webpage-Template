/**
 * Citation-intent classification (spec `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md` §3).
 *
 * The shipped citation pass proves a citation RESOLVES; this module is the
 * advisory half that asks whether it resolves to the RIGHT file. Both tiers it
 * produces are advisory by ratified measurement (spec §1.1 item 1): the
 * strictest content condition still fires on 15 of 135 correct citations of a
 * merged plan, so a hard code would be waived reflexively.
 *
 * Matching discipline (spec §3.2) is ONE implementation, shared by all four
 * consumers — the window test, the enclosing-name test, the whole-file test and
 * the relocation search. Naive substring matching both false-clears wrong
 * citations (`deps` matches anything) and false-fires correct ones
 * (`SyncLogDeps.logSync` appears nowhere as a literal), which is why the
 * discipline is the arm's first acceptance criterion rather than an internal
 * detail.
 *
 * Pure: no `node:` imports (pinned by tests/specLint/_metaPureCore.test.ts).
 */

/** `_` and `$` are identifier characters, so neither side may abut one. */
const BOUNDARY_PRE = "(?<![A-Za-z0-9_$])";
const BOUNDARY_POST = "(?![A-Za-z0-9_$])";

/**
 * Dotted segments shorter than this contribute no pattern. `a.of` must not
 * search for `of`: the short tail of a member expression is ordinary English
 * and matches every file.
 */
const MIN_SEGMENT = 3;

const PROXIMITY_WINDOW = 5;

/**
 * `.` and `$` are legal INSIDE an identifier and are also regex metacharacters.
 * An unescaped `foo.bar` matches `fooXbar` and would classify a wrong citation
 * clean, so escaping is part of the discipline, not hygiene.
 */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The boundary-anchored patterns for one prose identifier: the full id, plus
 * one per dotted segment of length >= MIN_SEGMENT (spec §3.2). Case-sensitive.
 */
export function idPatterns(rawId: string): RegExp[] {
  const patterns: RegExp[] = [new RegExp(`${BOUNDARY_PRE}${escapeRe(rawId)}${BOUNDARY_POST}`)];
  if (rawId.includes(".")) {
    for (const segment of rawId.split(".")) {
      if (segment.length < MIN_SEGMENT) continue;
      patterns.push(new RegExp(`${BOUNDARY_PRE}${escapeRe(segment)}${BOUNDARY_POST}`));
    }
  }
  return patterns;
}

// The three declaration shapes of spec §3.3 step 2, tried in this order per
// line. All are anchored at column 1: an indented declaration is a nested scope,
// and reporting the outer symbol for it is the documented limit (spec §8 item 3)
// rather than a case to widen for.
const TS_DECL =
  /^(?:export )?(?:async )?(?:function|const|let|var|class|interface|type|enum) ([A-Za-z_$][A-Za-z0-9_$]*)/;
const SQL_DECL =
  /^create (?:or replace )?(?:function|table|trigger|index|policy|view) (?:[A-Za-z_][A-Za-z0-9_$]*\.)?([A-Za-z_][A-Za-z0-9_$]*)/i;
const ATX_HEADING = /^#{1,6}\s+(.*)$/;

/**
 * The name of the declaration enclosing `startLine`, or null if no shape
 * matches by line 1. The scan is INCLUSIVE of the start line, because a
 * citation may point at the declaration itself. A SQL name is returned without
 * its schema qualifier.
 */
export function enclosingName(lines: string[], startLine: number): string | null {
  for (let i = Math.min(startLine, lines.length); i >= 1; i--) {
    const line = lines[i - 1] ?? "";
    const ts = TS_DECL.exec(line);
    if (ts) return ts[1]!;
    const sql = SQL_DECL.exec(line);
    if (sql) return sql[1]!;
    const heading = ATX_HEADING.exec(line);
    if (heading) return heading[1]!.trim();
  }
  return null;
}

export type IntentTier = "clean" | "unmatched" | "absent";

export interface IntentResult {
  tier: IntentTier;
  /** Reported in the detail of both advisory tiers (spec §3.5). */
  enclosing: string | null;
}

/**
 * Tier classification, first match wins (spec §3.3):
 *   1. any identifier in the +/-5 window of the cited lines -> clean
 *   2. any identifier equal to the enclosing declaration name -> clean
 *   3. any identifier anywhere in the cited file            -> unmatched
 *   4. otherwise                                            -> absent
 */
export function classifyIntent(
  lines: string[],
  start: number,
  end: number,
  rawIds: string[],
): IntentResult {
  const patterns = rawIds.flatMap(idPatterns);
  const enclosing = enclosingName(lines, start);
  const hit = (text: string): boolean => patterns.some((p) => p.test(text));

  const lo = Math.max(1, start - PROXIMITY_WINDOW);
  const hi = Math.min(lines.length, end + PROXIMITY_WINDOW);
  if (lines.slice(lo - 1, hi).some(hit)) return { tier: "clean", enclosing };
  if (enclosing !== null && hit(enclosing)) return { tier: "clean", enclosing };
  if (lines.some(hit)) return { tier: "unmatched", enclosing };
  return { tier: "absent", enclosing };
}

/**
 * The actionability payload (spec §3.4): which OTHER files this document
 * already cites do contain the identifiers. Peers arrive in doc order and a
 * peer whose read returned null is skipped — omitted from the hints, never a
 * finding of its own.
 */
export function relocationHints(
  rawIds: string[],
  peers: { path: string; lines: string[] | null }[],
  cap: number,
): string[] {
  const patterns = rawIds.flatMap(idPatterns);
  const hints: string[] = [];
  for (const peer of peers) {
    if (hints.length >= cap) break;
    const lines = peer.lines;
    if (lines === null) continue;
    if (lines.some((l) => patterns.some((p) => p.test(l)))) hints.push(peer.path);
  }
  return hints;
}
