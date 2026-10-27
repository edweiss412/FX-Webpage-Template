/**
 * components/crew/sections/budgetRows.ts — the Budget section's row derivation,
 * shared by `BudgetSection` and the search index builder (lib/search/sections/
 * budget.ts), so the page and the index read the same rows (spec §2.4).
 *
 * Non-client module: the builder runs on the server and imports it.
 */
import type { KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import { entryId } from "@/lib/search/entryId";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { financialsVisible } from "@/lib/visibility/scopeTiles";

/** The Budget card's title, which is also the search `group` of its rows. */
export const BUDGET_TITLE = "Budget";

/** The Budget card's `data-card-id`, the search region of its rows. */
export const BUDGET_CARD_ID = "budget-main";

/**
 * §4.13 mechanism #3: the financials FETCH failed and this viewer is entitled
 * to see that, so the section renders its inline error block instead of rows.
 * The same single `financialsVisible` predicate that gates the Budget tab.
 */
export function budgetFetchFailed(
  tileErrors: ShowForViewer["tileErrors"],
  ctx: Pick<ViewerContext, "viewerFlags" | "isAdmin">,
): boolean {
  return Boolean(tileErrors["financials"]) && financialsVisible(ctx.viewerFlags, ctx.isAdmin);
}

/** Sentinel-guarded read of an optional financials field (§8.3 contract). */
function shown(value: string | null): string {
  return value != null && !shouldHideGenericOptional(value) ? value : "";
}

/**
 * The Budget card's rows, in render order. Every financials field is
 * sentinel-guarded at the read site (§8.3); a blank or sentinel value yields ""
 * and KeyValueRows omits that row, so an all-blank financials object leaves no
 * present row and the section shows its EmptyState.
 *
 * Each row KeyValueRows will render carries its search target id
 * (lib/search/entryId.ts); an omitted row carries none.
 */
export function budgetRows(financials: ShowForViewer["financials"]): KeyValueRow[] {
  const rows: KeyValueRow[] = financials
    ? [
        { k: "PO", v: shown(financials.po) },
        { k: "Proposal", v: shown(financials.proposal) },
        { k: "Invoice", v: shown(financials.invoice) },
        { k: "Invoice notes", v: shown(financials.invoice_notes) },
      ]
    : [];
  const seen = new Map<string, number>();
  return rows.map((row) =>
    shouldHideGenericOptional(row.v)
      ? row
      : {
          ...row,
          searchTarget: entryId("budget", BUDGET_CARD_ID, BUDGET_TITLE, row.k, row.v, seen),
        },
  );
}
