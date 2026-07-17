import type { ParseWarning } from "@/lib/parser/types";

export type ActiveCodeGroup = { code: string; items: ParseWarning[] };

/**
 * Group the ALREADY-ORDERED active warnings by code, preserving first-code-appearance
 * order (Map insertion order over the ordered input). Interleaved same-code warnings
 * collapse into one group; intra-group order is the input order of that code's items.
 * Code-set-agnostic — it groups over WHATEVER codes are present (spec §2), never
 * special-casing the digest vs operator-actionable split. Client-safe (no node:crypto).
 */
export function groupActiveByCode(warnings: readonly ParseWarning[]): ActiveCodeGroup[] {
  const byCode = new Map<string, ParseWarning[]>();
  for (const w of warnings) {
    const items = byCode.get(w.code);
    if (items) items.push(w);
    else byCode.set(w.code, [w]);
  }
  return [...byCode.entries()].map(([code, items]) => ({ code, items }));
}
