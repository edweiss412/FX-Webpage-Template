import { billingBodyProps, budgetFetchFailed } from "@/components/crew/sections/budgetRows";
import type { BillingRow } from "@/components/show-panels/BillingBody";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";

/**
 * Billing search entries (spec §2.4, §4): PO, Proposal, Invoice and Invoice
 * notes, exactly the rows `BillingSection` renders, grouped under its panel
 * card's title, the section's registry label.
 *
 * Nothing when the shell does not render the section (`billingVisible` false),
 * nothing when the section shows its financials-fetch error block, and nothing
 * when the row derivation throws: `BillingSection` runs it inside
 * `WrappedSection`, which then renders a fallback with no lines.
 */
export function buildBillingEntries({
  data,
  viewer,
  billingVisible,
}: SectionBuildInput): SearchEntry[] {
  if (!billingVisible) return [];
  // Outside the guard, as in the section: a malformed projection throws here.
  const ctx = resolveViewerContext(viewer, data);
  if (budgetFetchFailed(data.tileErrors, ctx)) return [];

  let rows: readonly BillingRow[];
  try {
    rows = billingBodyProps(data, ctx).rows;
  } catch {
    return [];
  }
  const group = showSection("billing").label;
  return rows.flatMap((row) =>
    row.searchTarget === undefined
      ? []
      : [
          {
            id: row.searchTarget,
            section: "billing" as const,
            group,
            label: row.label,
            value: row.value,
            context: [],
            copy: null,
          },
        ],
  );
}
