/**
 * components/crew/sections/BudgetSection.tsx (Phase 3, Task 7)
 *
 * The lead-gated Budget section. Renders `data.financials`
 * (po / proposal / invoice / invoice_notes) via the shared KeyValueRows
 * primitive. It is a SYNCHRONOUS Server Component matching the section
 * contract `({ data, viewer, today, showId })`.
 *
 * Single-predicate gate (§4.1): the SAME `financialsVisible(viewerFlags,
 * isAdmin)` predicate gates the Budget entry (`crewSectionsFor`), the section
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
import { SectionTileError } from "@/components/crew/SectionTileError";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import { WrappedSection } from "@/components/crew/WrappedSection";
import {
  BUDGET_CARD_ID,
  BUDGET_TITLE,
  budgetFetchFailed,
  budgetRows,
} from "@/components/crew/sections/budgetRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

export function BudgetSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
}): JSX.Element {
  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The Budget
  // surface reads data.financials, gated by financialsVisible(viewerFlags,
  // isAdmin) — the SAME single predicate that gates the Budget tab, the section
  // selection, and the projection. On a financials fetch error, an entitled
  // viewer (lead/admin) sees an inline degraded block; a non-lead crew member
  // (gate false) sees a silent omission — no boundary widening. NO
  // upsertAdminAlert (the _CrewShell projection alert is the sole producer).
  const ctx = resolveViewerContext(viewer, data);
  const financialsFetchFailed = budgetFetchFailed(data.tileErrors, ctx);

  // The rows transform is the section's throwable block — wrapped so a throw is
  // contained (fallback + TILE_SERVER_RENDER_FAILED upsert) instead of crashing
  // the page once the old FinancialsTile shell is deleted (§4.13 / wp-13).
  return (
    <WrappedSection
      ledger={ledger}
      tileId="crew:budget:rows"
      showId={showId}
      sheetName={data.show.title}
      render={() => {
        if (financialsFetchFailed) {
          return <SectionTileError domain="financials" />;
        }

        // Every financials field is sentinel-guarded at the read site (§8.3,
        // budgetRows.ts); a blank or sentinel value yields "" → KeyValueRows
        // omits that row, and an all-blank financials object collapses to zero
        // rows → EmptyState. The search builder reads the same rows.
        const rows = budgetRows(data.financials);

        const hasAny = rows.some((r) => r.v.length > 0);

        if (!hasAny) {
          return (
            <div data-testid="section-empty">
              <EmptyState label="No budget details on file yet." />
            </div>
          );
        }

        return (
          <div data-card-id={BUDGET_CARD_ID}>
            <SectionCard
              title={BUDGET_TITLE}
              action={
                <CardHeaderActions
                  cardId={BUDGET_CARD_ID}
                  driveFileId={data.driveFileId}
                  anchor={data.sourceAnchors[CARD_REGION_MAP[BUDGET_CARD_ID]]}
                  showId={showId}
                  cardReport={cardReport}
                />
              }
            >
              <KeyValueRows rows={rows} />
            </SectionCard>
          </div>
        );
      }}
    />
  );
}
