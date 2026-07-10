import type { TransportationRow } from "@/lib/parser/types";
import { namesRefer } from "@/lib/data/nameMatch";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState"; // canonicalize-exempt: assignee sentinel, not an email

/** Significant tokens (spec §2.3): lowercase, diacritic-fold, drop generational
 *  suffixes, keep letter tokens of length >= 2. Shared by the 8.4 enrich-warning
 *  path (`enrichTransportAssignees`) and the 8.3b read-time owner resolver — ONE
 *  matcher, so "warned" and "resolved" stay consistent. */
export function significantTokens(s: string): string[] {
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

/** True iff member M's WHOLE name appears verbatim (token-for-token, EXACT equality)
 *  in candidate C. EXACT, not prefix-compat — strictly stricter than `namesRefer`, so
 *  same-surname near-neighbors ("Annie Lee" vs "Ann Lee") do NOT cover each other. */
export function covers(cSig: string[], mSig: string[]): boolean {
  return mSig.length > 0 && mSig.every((mt) => cSig.includes(mt));
}

/** Minimal structural roster shape — reads id + name + sheet_name ONLY. Fed a
 *  SERVER-ONLY roster built inside getShowForViewer (`ownerResolveRoster`) — NOT
 *  `ShowForViewer["crewMembers"]`: `sheet_name` is deliberately KEPT OFF the returned /
 *  client-visible projection (data minimization — exposing every member's pre-override
 *  name to the crew-page payload is a privacy regression). The ids are DB-assigned at
 *  apply, which is why this resolver is read-time-only and never runs in the enrich/parse
 *  pass. `sheet_name` (crew_members.sheet_name) is the PRE-override parsed name, present
 *  only while a name override is active — the name transport rows still key on. Resolving
 *  against BOTH `name` and `sheet_name` is required: a surname-changing override PLUS a
 *  garbled cell defeats both the current-name id path AND the render-time alias fallback. */
type ResolvableCrew = ReadonlyArray<{ id: string; name: string; sheet_name: string | null }>;

/**
 * Read-time resolution of free-text transport assignee names → the set of crew
 * member ids that should see the transport tile. Pure; reads names + ids only;
 * never throws (total over malformed decoded JSONB). Empty when nothing resolves.
 *
 * A candidate name resolves to a crew id when `covers` (whole-name subset — catches
 * the "Doug Larson Loadout" ⊇ "Doug Larson" garble) OR `namesRefer` (nickname / prefix
 * — catches "Bill Werner" ↔ "William Werner" that `covers` misses), matched against
 * EITHER of that member's aliases (current name + pre-override sheet_name). Union,
 * because neither matcher subsumes the other. A candidate that covers ≥2 roster members
 * (a merged multi-person cell) resolves to ALL of them — benign over-match (UX-not-security).
 */
export function resolveTransportOwners(
  transportation: TransportationRow | null,
  crewMembers: ResolvableCrew,
): string[] {
  if (!transportation) return [];
  if (crewMembers.length === 0) return [];
  const roster = crewMembers.map((c) => {
    // [current name, pre-override sheet_name?] — the alias set transport rows may key on.
    const aliases =
      c.sheet_name && c.sheet_name.trim().length > 0 ? [c.name, c.sheet_name] : [c.name];
    return { id: c.id, aliases: aliases.map((a) => ({ name: a, sig: significantTokens(a) })) };
  });
  // Runtime-defensive: driver_name/schedule/assigned_names are STRING-typed but arrive
  // from decoded JSONB and can be corrupt (e.g. `assigned_names: [null]`). This resolver
  // runs inside the page-critical projection, so it MUST be total — a non-string element
  // must not throw and crash the whole crew page. Filter to strings + guard the arrays.
  const candidates: string[] = [];
  if (typeof transportation.driver_name === "string") candidates.push(transportation.driver_name);
  if (Array.isArray(transportation.schedule)) {
    for (const leg of transportation.schedule) {
      if (leg && Array.isArray(leg.assigned_names)) {
        for (const n of leg.assigned_names) if (typeof n === "string") candidates.push(n);
      }
    }
  }
  const owners = new Set<string>();
  for (const candidate of candidates) {
    if (shouldHideGenericOptional(candidate)) continue; // rule 1 — whole-value sentinel ("N/A", "TBD", "-", ...)
    for (const sub of candidate.split("/")) {
      const name = sub.trim(); // canonicalize-exempt: assignee name whitespace, not an email
      if (name.length === 0) continue;
      if (shouldHideGenericOptional(name)) continue; // defensive per-part sentinel
      const cSig = significantTokens(name);
      if (cSig.length === 0) continue; // rule 2 — lone initial would else match namesRefer's initial support
      for (const m of roster) {
        if (m.aliases.some((a) => covers(cSig, a.sig) || namesRefer(a.name, name)))
          owners.add(m.id);
      }
    }
  }
  return [...owners];
}
