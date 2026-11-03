/**
 * components/show-panels/BillingBody.tsx
 *
 * The Billing section body both surfaces render (crew page redesign spec §6.2,
 * `billing` row): the key-value rows of the admin's `OpsBreakdown`.
 *
 * - Admin: COI, Proposal, PO#, Invoice and Invoice notes, each non-empty one as
 *   parsed (`sentinels: "show"`, a sentinel in the same style as any value), and
 *   "No billing details parsed." when none is. No search markers.
 * - Crew: PO, Proposal, Invoice and Invoice notes (`budgetRows`,
 *   components/crew/sections/budgetRows.ts), sentinels hidden, a search target
 *   per row, and keys without their colon (`keyColon: false`). The crew section
 *   shows its own section-level empty state and never calls the body with
 *   nothing to show.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment), and
 * it calls the field list the same way, so every line it runs is inside that
 * catch. It emits no test id, so it takes no `testIdPrefix`.
 */
import { FieldRowList, type FieldRow } from "@/components/show-panels/FieldRowList";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type BillingRow = FieldRow;

export type BillingBodyProps = {
  /** The rows in render order, already gated by the caller. */
  rows: readonly BillingRow[];
  /** "show": a sentinel renders as parsed (admin). "hide": its row is omitted (crew). */
  sentinels: "show" | "hide";
  /** true (the default, admin): "Proposal:". false (crew): the key without its colon. */
  keyColon?: boolean;
};

export function BillingBody({ rows, sentinels, keyColon = true }: BillingBodyProps) {
  const shown =
    sentinels === "hide" ? rows.filter((row) => !shouldHideGenericOptional(row.value)) : rows;
  return shown.length === 0 ? (
    <p className="text-sm text-text-subtle">No billing details parsed.</p>
  ) : (
    FieldRowList({ rows: shown, keyColon })
  );
}
