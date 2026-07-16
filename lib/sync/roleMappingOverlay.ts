import { canonicalRoleToken } from "@/lib/parser/roleVocabulary";

export const GRANTABLE_FLAGS = ["A1", "V1", "L1", "FINANCIALS"] as const;
export type GrantableFlag = (typeof GRANTABLE_FLAGS)[number];
const GRANTABLE = new Set<string>(GRANTABLE_FLAGS);

export type RoleTokenMapping = {
  token: string;
  grants: GrantableFlag[];
  decidedBy: string;
  decidedAt: string;
};

/** Dedupe + stable order (spec §8.3): filter GRANTABLE_FLAGS by membership. */
export function normalizeGrants(raw: readonly unknown[]): GrantableFlag[] | null {
  for (const g of raw) if (typeof g !== "string" || !GRANTABLE.has(g)) return null;
  const set = new Set(raw as string[]);
  return GRANTABLE_FLAGS.filter((f) => set.has(f));
}

/**
 * The SINGLE validation boundary for role_token_mappings rows (spec §6.2).
 * Mirrors normalizeUseRawDecisions (useRawOverlay.ts:188): non-array -> [];
 * corrupt rows dropped; NEVER throws.
 */
export function normalizeRoleTokenMappings(raw: unknown): RoleTokenMapping[] {
  if (!Array.isArray(raw)) return [];
  const out: RoleTokenMapping[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    // canonical token: exact canonicalRoleToken fixpoint, 1..64 chars
    if (typeof e.token !== "string") continue;
    if (e.token !== canonicalRoleToken(e.token) || e.token.length === 0 || e.token.length > 64)
      continue; // canonicalize-exempt: role-token canonicality check, not email
    if (!Array.isArray(e.grants)) continue;
    const grants = normalizeGrants(e.grants);
    if (grants === null) continue;
    if (typeof e.decided_by !== "string" || e.decided_by.trim() === "") continue; // canonicalize-exempt: blank-check of a validation field, not email normalization
    if (typeof e.decided_at !== "string" || Number.isNaN(Date.parse(e.decided_at))) continue;
    out.push({ token: e.token, grants, decidedBy: e.decided_by, decidedAt: e.decided_at });
  }
  return out;
}
