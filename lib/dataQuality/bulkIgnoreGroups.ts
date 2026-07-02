import type { ParseWarning } from "@/lib/parser/types";
import { hasIgnorableSnippet, normalizeSnippet } from "./ignorableSnippet";

export type BulkIgnoreItem = { code: string; rawSnippet: string };
export type BulkIgnoreGroup = { code: string; items: BulkIgnoreItem[] };

/**
 * Group the ACTIVE ignorable warnings by code into distinct-content sets, keeping only
 * codes with >=2 distinct contents — the threshold at which a bulk "Ignore all N" saves
 * clicks over per-card ignoring (DQIGNORE-2).
 *
 * Content is keyed on the SAME basis as `warningFingerprint` (code + normalized
 * rawSnippet) but WITHOUT importing node:crypto, so this is safe to run in a "use client"
 * bundle. Two cards with identical content share one fingerprint (ignoring it moves both),
 * so they collapse to a single item here; a group of only-identical rows is size 1 and is
 * excluded. Each returned item is exactly the `{ code, rawSnippet }` body the per-warning
 * `/data-quality/ignore` route expects, so the bulk action is N precise per-fingerprint
 * inserts — never a coarse code-level ignore that would mask future distinct rows.
 */
export function groupIgnorableByCode(warnings: readonly ParseWarning[]): BulkIgnoreGroup[] {
  const byCode = new Map<string, Map<string, BulkIgnoreItem>>();
  for (const w of warnings) {
    if (!hasIgnorableSnippet(w)) continue;
    const rawSnippet = w.rawSnippet as string;
    const contentKey = normalizeSnippet(rawSnippet);
    let contents = byCode.get(w.code);
    if (!contents) {
      contents = new Map();
      byCode.set(w.code, contents);
    }
    // First occurrence wins — the raw form we send is irrelevant to the fingerprint
    // (the route re-normalizes), and keeping the earliest preserves parse order.
    if (!contents.has(contentKey)) contents.set(contentKey, { code: w.code, rawSnippet });
  }
  const groups: BulkIgnoreGroup[] = [];
  for (const [code, contents] of byCode) {
    if (contents.size >= 2) groups.push({ code, items: [...contents.values()] });
  }
  return groups;
}
