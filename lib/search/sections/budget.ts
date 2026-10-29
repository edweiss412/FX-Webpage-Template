import { BUDGET_TITLE, budgetFetchFailed, budgetRows } from "@/components/crew/sections/budgetRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Budget search entries (spec §2.4, §4): PO, Proposal, Invoice and Invoice
 * notes, exactly the rows `BudgetSection` renders.
 *
 * Nothing when the shell does not render the section (`budgetVisible` false),
 * nothing when the section shows its financials-fetch error block, and nothing
 * when the row derivation throws: `BudgetSection` runs it inside
 * `WrappedSection`, which then renders a fallback with no lines.
 */
export function buildBudgetEntries({
  data,
  viewer,
  budgetVisible,
}: SectionBuildInput): SearchEntry[] {
  if (!budgetVisible) return [];
  // Outside the guard, as in the section: a malformed projection throws here.
  const ctx = resolveViewerContext(viewer, data);
  if (budgetFetchFailed(data.tileErrors, ctx)) return [];

  let rows: ReturnType<typeof budgetRows>;
  try {
    rows = budgetRows(data.financials);
  } catch {
    return [];
  }
  return rows.flatMap((row) =>
    row.searchTarget === undefined
      ? []
      : [
          {
            id: row.searchTarget,
            section: "budget" as const,
            group: BUDGET_TITLE,
            label: row.k,
            value: row.v,
            context: [],
            copy: null,
          },
        ],
  );
}
