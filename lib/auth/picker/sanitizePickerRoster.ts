// lib/auth/picker/sanitizePickerRoster.ts
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * Flow 8.1 (spec §4.2 / D3 / D4 / D6): the single roster-sanitize chokepoint.
 * `loadRoster` wraps its Supabase read in this so EVERY picker render path
 * (no_auth/gate-skip, all stale arms, renderPickerRepick) gets sanitized rows.
 *   1. Sentinel-guard: drop rows whose `name` is a generic sentinel
 *      (`shouldHideGenericOptional` — "" TBD N/A TBA - —, case/whitespace-insensitive).
 *   2. Dedup by `id` ONLY (first-wins, order preserved). Same-name/different-id
 *      rows are BOTH kept — collapsing by name would hide a real second person.
 */
export function sanitizePickerRoster<T extends { id: string; name: string }>(
  roster: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of roster) {
    if (shouldHideGenericOptional(r.name)) continue; // canonicalize-exempt: roster name sentinel check, not an email
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
