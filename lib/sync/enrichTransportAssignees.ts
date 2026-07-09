// lib/sync/enrichTransportAssignees.ts
import type { CrewMemberRow, TransportationRow } from "@/lib/parser/types";
import { namesRefer } from "@/lib/data/nameMatch";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState"; // canonicalize-exempt: assignee name, not an email

// Significant tokens (spec §2.3): lowercase, diacritic-fold, drop generational suffixes,
// keep letter tokens of length >= 2. PRIVATE — deliberately NOT exported and NOT added to
// nameMatch.ts, whose `toks` keeps one-letter tokens for initial matching (spec §2.3).
function significantTokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase() // canonicalize-exempt: assignee name normalization, not an email
    .replace(/\b(?:jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 2);
}

type RosterToken = { name: string; sig: string[] };

// True iff member M's WHOLE name appears verbatim (token-for-token, EXACT equality) in C.
// EXACT, not prefix-compat: `covers` must be strictly stricter than `namesRefer`, so same-surname
// near-neighbors ("Annie Lee" vs "Ann Lee") do NOT cover each other (spec §2.2, R5 finding 1).
function covers(cSig: string[], mSig: string[]): boolean {
  return mSig.length > 0 && mSig.every((mt) => cSig.includes(mt));
}

/** Spec §2.2 rules 1-5 for ONE already-split, trimmed candidate. */
function isWarned(candidate: string, roster: RosterToken[]): boolean {
  if (shouldHideGenericOptional(candidate)) return false; // rule 1 — sentinel
  const cSig = significantTokens(candidate);
  if (cSig.length === 0) return false; // rule 2 — no significant tokens (e.g. a lone initial "J")
  // Both warn paths require whole-name coverage: C must contain >=1 roster member's complete name
  // verbatim. External drivers ("ABC Charters", "Smith Charters") cover 0 whole names -> never warn
  // (spec §2.2, R5 finding 2 — the old "shares-a-token near-miss" gate was removed here).
  const coveredCount = roster.filter((m) => covers(cSig, m.sig)).length;
  if (coveredCount >= 2) return true; // rule 3 — unambiguous multi-person fusion (>=2 whole names)
  if (coveredCount === 0) return false; // rule 5 — external / unattributable, no whole name present
  // coveredCount === 1: exactly one member's whole name is present.
  // rule 4 (garbled) — warn iff that member would NOT see the tile (surname shifted by a garble,
  //   e.g. "Doug Larson Loadout"). rule 5 (no warn) — a resolving single identity (middle name
  //   "John Michael Smith", or "Annie Lee" itself). A first-name-only fusion ("Doug John Smith")
  //   covers 0 whole names above and is a DOCUMENTED NON-GOAL (spec §2.2/§6): the hidden member's
  //   surname is absent, so it is indistinguishable from a real name and flagging it reintroduces
  //   the R4b/R5-a partial-overlap false-positive class.
  const resolved = roster.some((m) => namesRefer(m.name, candidate));
  return !resolved;
}

/**
 * Distinct transport-assignee names that reference a crew member who would NOT see their own
 * transport tile (garbled name, or a merged-cell fusion of multiple people). Spec §2.2.
 * Pure; reads names only; never throws. Empty when there is nothing to warn.
 */
export function classifyUnmatchedAssignees(
  transportation: TransportationRow | null,
  crewMembers: CrewMemberRow[],
): string[] {
  if (!transportation) return [];
  if (crewMembers.length === 0) return []; // cannot resolve against an empty roster
  const roster: RosterToken[] = crewMembers.map((c) => ({
    name: c.name,
    sig: significantTokens(c.name),
  }));
  const candidates: string[] = [];
  if (transportation.driver_name) candidates.push(transportation.driver_name);
  for (const leg of transportation.schedule) for (const n of leg.assigned_names) candidates.push(n);
  const warned: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    for (const sub of candidate.split("/")) {
      const name = sub.trim(); // canonicalize-exempt: assignee name whitespace, not an email
      if (name.length === 0) continue;
      if (!isWarned(name, roster)) continue;
      const key = name.toLowerCase(); // canonicalize-exempt: dedup key on assignee name, not an email
      if (seen.has(key)) continue;
      seen.add(key);
      warned.push(name);
    }
  }
  return warned;
}
