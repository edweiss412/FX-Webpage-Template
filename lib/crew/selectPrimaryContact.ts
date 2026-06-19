import type { ContactRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * Deterministic actionable-first primary contact for the Today "Need
 * something" card. "Actionable" = at least one of phone/email is
 * non-sentinel (passes `shouldHideGenericOptional`). Tie-break is a
 * stable total order by (kind, name) so the choice never varies with
 * array order (the contacts query has no ORDER BY). No actionable
 * contact → null (the card is omitted upstream).
 */
export function selectPrimaryContact(contacts: ContactRow[]): ContactRow | null {
  const actionable = contacts.filter(
    (c) => !shouldHideGenericOptional(c.phone ?? "") || !shouldHideGenericOptional(c.email ?? ""),
  );
  if (actionable.length === 0) return null;
  return (
    [...actionable].sort(
      (a, b) => a.kind.localeCompare(b.kind) || (a.name ?? "").localeCompare(b.name ?? ""),
    )[0] ?? null
  );
}
