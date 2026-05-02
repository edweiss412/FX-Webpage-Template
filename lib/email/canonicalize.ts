// lib/email/canonicalize.ts
export function canonicalize(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim().toLowerCase();
  return t.length === 0 ? null : t;
}
/**
 * Returns true iff `s` is already in canonical form (trimmed, lowercased, non-empty).
 * Does NOT validate email format — schema CHECK constraints are the validity gate
 * per AGENTS.md §1.3 ("schema-level CHECK is the safety net, not the primary mechanism").
 */
export function isCanonical(s: string): boolean {
  return s === s.trim().toLowerCase() && s.length > 0;
}
