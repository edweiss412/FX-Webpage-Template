import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet } from "./ignorableSnippet";

export type IdentityFields = Pick<ParseWarning, "code" | "sourceCell" | "rawSnippet" | "blockRef">;

export function warningIdentityKey(w: IdentityFields): string {
  const cell = w.sourceCell ? `${w.sourceCell.gid}:${w.sourceCell.a1 ?? ""}` : "";
  const snippet = typeof w.rawSnippet === "string" ? normalizeSnippet(w.rawSnippet) : "";
  // blockRef distinguishes reportable-but-NOT-ignorable no-content warnings (AGENDA_*,
  // BLOCK_DISAPPEARED have no rawSnippet/sourceCell — only a blockRef). Stable within a
  // session (from the persisted parse_warnings; router.refresh() does not re-parse). This is
  // the REPORT/key identity; the IGNORE fingerprint stays content-only by design.
  const br = w.blockRef
    ? `${w.blockRef.kind}:${w.blockRef.index ?? ""}:${w.blockRef.iso ?? ""}:${w.blockRef.name ?? ""}`
    : "";
  return `${w.code}|${cell}|${snippet}|${br}`;
}

/** Per-render UNIQUE React keys; identity + occurrence suffix for perfect duplicates.
 *  Distinguishable items always get suffix 0, so removing a different-identity sibling
 *  never changes another item's key (stability across an ignore refresh). */
export function stableWarningKeys(items: readonly IdentityFields[]): string[] {
  const seen = new Map<string, number>();
  return items.map((w) => {
    const base = warningIdentityKey(w);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}
