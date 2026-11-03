/**
 * components/crew/sections/budgetRows.ts: the Billing section's row derivation,
 * shared by `BillingSection` and the search index builder
 * (lib/search/sections/billing.ts), so the page and the index read the same rows
 * (spec §2.4). The module keeps the name of the card it feeds, `budget-main`,
 * whose id stays across the move (crew page redesign PR B plan, decision 5).
 *
 * Non-client module: the builder runs on the server and imports it.
 */
import type { BillingBodyProps, BillingRow } from "@/components/show-panels/BillingBody";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import { entryId } from "@/lib/search/entryId";
import { showSection } from "@/lib/showSections/registry";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { financialsVisible } from "@/lib/visibility/scopeTiles";

/** The Billing card's `data-card-id`, the search region of its rows (kept from Budget). */
export const BUDGET_CARD_ID = "budget-main";

type GateViewer = Pick<ViewerContext, "viewerFlags" | "isAdmin">;

/**
 * §4.13 mechanism #3: the financials FETCH failed and this viewer is entitled
 * to see that, so the section renders its inline error block instead of rows.
 * The same single `financialsVisible` predicate that gates the Billing section.
 */
export function budgetFetchFailed(
  tileErrors: ShowForViewer["tileErrors"],
  ctx: GateViewer,
): boolean {
  return Boolean(tileErrors["financials"]) && financialsVisible(ctx.viewerFlags, ctx.isAdmin);
}

/** Sentinel-guarded read of an optional financials field (§8.3 contract). */
function shown(value: string | null): string {
  return value != null && !shouldHideGenericOptional(value) ? value : "";
}

/**
 * The Billing card's rows, in render order: the crew field set, PO, Proposal,
 * Invoice and Invoice notes (spec §6.2 `billing` row; COI stays in Venue). Every
 * financials field is sentinel-guarded at the read site (§8.3); a blank or
 * sentinel value yields "" and the body omits that row, so an all-blank
 * financials object leaves no present row and the section shows its empty state.
 *
 * Each row the body will render carries its search target id
 * (lib/search/entryId.ts), grouped under the card's title, the section's
 * registry label; an omitted row carries none.
 */
export function budgetRows(financials: ShowForViewer["financials"]): BillingRow[] {
  const rows: BillingRow[] = financials
    ? [
        { label: "PO", value: shown(financials.po) },
        { label: "Proposal", value: shown(financials.proposal) },
        { label: "Invoice", value: shown(financials.invoice) },
        { label: "Invoice notes", value: shown(financials.invoice_notes) },
      ]
    : [];
  const group = showSection("billing").label;
  const seen = new Map<string, number>();
  return rows.map((row) =>
    shouldHideGenericOptional(row.value)
      ? row
      : {
          ...row,
          searchTarget: entryId("billing", BUDGET_CARD_ID, group, row.label, row.value, seen),
        },
  );
}

/**
 * The props the crew Billing body receives, built on the server from gated data
 * (spec §6.1; the harness rule "Client props and payloads"): no row at all for a
 * viewer `financialsVisible` excludes, whatever the projection handed over, so a
 * withheld financial value can never reach the body.
 */
export function billingBodyProps(data: ShowForViewer, ctx: GateViewer): BillingBodyProps {
  return {
    rows: financialsVisible(ctx.viewerFlags, ctx.isAdmin) ? budgetRows(data.financials) : [],
    sentinels: "hide",
    // The crew's field keys carry no colon (PR B invariant-8 gate, row 15).
    keyColon: false,
  };
}
