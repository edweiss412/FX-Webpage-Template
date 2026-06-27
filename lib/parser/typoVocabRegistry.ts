export type VocabEntry = {
  id: string;
  klass: "fuzzable" | "excluded";
  members: readonly string[];
  minLen?: number;
};

/**
 * Central registry of closed vocabs for typo-tolerance. `fuzzable` entries name the
 * PR-A surfaces that get a gated fuzzy pass; `excluded` entries name the cross-vocab /
 * do-not-fuzz sets the collision meta-test (tests/parser/typoVocabCollision.test.ts)
 * guards against. Single source of truth for the meta-test + the gate's exclusion sets.
 * See spec §3 of docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md.
 */
export const TYPO_VOCABS: readonly VocabEntry[] = [
  { id: "multiWordRole", klass: "fuzzable", members: ["CONTENT CREATION", "SHOW CALLER", "GREEN ROOM", "CAM OP"] },
  { id: "crewColumn", klass: "fuzzable", members: ["NAME", "ROLE", "PHONE", "EMAIL"] },
  // NOTE: the passenger column ({PASSENGERS}) is DEFERRED from PR-A — its only caller
  // parseV4Transport (transport.ts:143) has no `agg`/anchor in scope, so the warn emission
  // is awkward; it moves to a P1-followup. Not registered here (nothing wires it yet).
  { id: "longSectionHeader", klass: "fuzzable", members: ["TRANSPORTATION", "EVENT DETAILS", "GS DETAILS"] },
  // excluded / do-not-fuzz neighborhoods (spec §8) the meta-test guards against:
  { id: "shortRoleCodes", klass: "excluded", members: ["A1", "A2", "V1", "L1", "GS", "BO", "PTZ", "LED", "GAV", "LEAD"] },
  { id: "knownSubLabels", klass: "excluded", members: ["DATE", "DAY", "ROOM"] },
  { id: "sentinels", klass: "excluded", members: ["TBD", "TBA", "N/A"] },
];
