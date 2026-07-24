import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet } from "./ignorableSnippet";

export type IdentityFields = Pick<
  ParseWarning,
  "code" | "sourceCell" | "rawSnippet" | "blockRef" | "roleToken"
>;

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
  // Fold roleToken into the identity for UNKNOWN_ROLE_TOKEN so two same-cell unknown
  // tokens get distinct, reorder-stable React keys (§8.1 — otherwise expanded checkbox
  // state can migrate between the two recognize controls). Legacy warnings without
  // roleToken keep the token-free key (unchanged).
  const rt = w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string" ? w.roleToken : "";
  // Fold blockRef.field for FIELD_UNREADABLE (crewwarn-instance-discriminator §2.1): a member
  // whose phone AND email carry the SAME unusable value would otherwise share one identity —
  // occurrence-suffixed React keys and one report surfaceId (shared draft/idempotency state).
  // Shares the tail slot with the roleToken fold (codes are disjoint), so every other key stays
  // byte-identical. NUL presence delimiter: present-but-empty stays distinct from field-less
  // legacy warnings. RAW string, never trimmed (identity semantics, not render semantics).
  const fu =
    w.code === "FIELD_UNREADABLE" && typeof w.blockRef?.field === "string"
      ? `\0F${w.blockRef.field}`
      : "";
  return `${w.code}|${cell}|${snippet}|${br}|${rt}${fu}`;
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
