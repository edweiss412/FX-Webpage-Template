/**
 * components/crew/sections/BudgetSection.tsx (Phase 3, Task 7)
 *
 * The lead-gated Budget section. Renders `data.financials`
 * (po / proposal / invoice / invoice_notes) via the shared KeyValueRows
 * primitive. It is a SYNCHRONOUS Server Component matching the section
 * contract `({ data, viewer, today, showId })`.
 *
 * Single-predicate gate (§4.1): the SAME `financialsVisible(viewerFlags,
 * isAdmin)` predicate gates the Budget tab (CrewSubNav), the section
 * selection (`resolveActiveSection` — a non-lead's `?s=budget` falls back to
 * `today`), AND the projection itself (`getShowForViewer` only populates
 * `financials` when the viewer is a lead/admin). So this section is only ever
 * REACHED for an entitled viewer; it additionally no-ops defensively when
 * `data.financials` is absent, so it can never leak or render blank.
 *
 * `today`/`showId` are part of the uniform section contract; Budget ignores
 * them.
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/** Sentinel-guarded read of an optional financials field (§8.3 contract). */
function shown(value: string | null): string {
  return value != null && !shouldHideGenericOptional(value) ? value : "";
}

export function BudgetSection({
  data,
}: {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
}): JSX.Element {
  const financials = data.financials;

  // Every financials field is sentinel-guarded at the read site (§8.3); a blank
  // or sentinel value yields "" → KeyValueRows omits that row, and an all-blank
  // financials object collapses to zero rows → EmptyState.
  const rows: KeyValueRow[] = financials
    ? [
        { k: "PO", v: shown(financials.po) },
        { k: "Proposal", v: shown(financials.proposal) },
        { k: "Invoice", v: shown(financials.invoice) },
        { k: "Invoice notes", v: shown(financials.invoice_notes) },
      ]
    : [];

  const hasAny = rows.some((r) => r.v.length > 0);

  if (!hasAny) {
    return (
      <div data-testid="section-empty">
        <EmptyState label="No budget details on file yet." />
      </div>
    );
  }

  return (
    <SectionCard title="Budget">
      <KeyValueRows rows={rows} />
    </SectionCard>
  );
}
