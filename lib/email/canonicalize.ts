// lib/email/canonicalize.ts
export function canonicalize(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim().toLowerCase();
  return t.length === 0 ? null : t;
}
export function isCanonical(s: string): boolean {
  return s === s.trim().toLowerCase() && s.length > 0;
}
