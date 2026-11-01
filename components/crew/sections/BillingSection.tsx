/**
 * components/crew/sections/BillingSection.tsx
 *
 * The lead-gated Billing section (crew page redesign spec §6.2 `billing` row;
 * PR B plan Task 4, which retired the Budget section it replaces). Renders
 * `data.financials` through the shared Billing body inside the crew panel card,
 * titled with the section's registry label ("Billing & docs", spec §9.1). A
 * SYNCHRONOUS Server Component on the section contract
 * `({ data, viewer, today, showId })`.
 *
 * Single-predicate gate (§4.1): the SAME `financialsVisible(viewerFlags,
 * isAdmin)` predicate gates the section's entitlement (`crewSectionEntitled`),
 * the `?s=` resolution (a non-lead's `?s=billing` or `?s=budget` resolves home),
 * the projection (`getShowForViewer` populates `financials` only for a lead or
 * an admin) and the body's props (`billingBodyProps`).
 *
 * Kept from the Budget section, so its history and alerts carry over: card id
 * `budget-main` (plan decision 5) and tile id `crew:budget:rows` (decision 6).
 *
 * `today` is part of the uniform section contract; Billing ignores it.
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import {
  BUDGET_CARD_ID,
  billingBodyProps,
  budgetFetchFailed,
} from "@/components/crew/sections/budgetRows";
import { BillingBody } from "@/components/show-panels/BillingBody";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";

export function BillingSection({
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
  // §4.13 mechanism #3, the active-section FETCH-error fallback, unchanged from
  // Budget: on a financials fetch error, every viewer `financialsVisible` admits
  // (leads and lead previews included) sees the inline degraded block, and no
  // one else is entitled to the section at all (spec §5.1 line 241). NO
  // upsertAdminAlert (the _CrewShell projection alert is the sole producer).
  const ctx = resolveViewerContext(viewer, data);
  const financialsFetchFailed = budgetFetchFailed(data.tileErrors, ctx);

  return (
    <div data-testid="section-billing" className="flex flex-col gap-4">
      {/* The rows and the body run inside the wrapper's render callback, the body
          CALLED rather than rendered as an element, so a throw from either is
          contained (fallback plus the ledger's failed entry) instead of escaping
          to the route's error boundary (spec §6.1, error containment). */}
      <WrappedSection
        ledger={ledger}
        tileId="crew:budget:rows"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          if (financialsFetchFailed) {
            return <SectionTileError domain="financials" />;
          }

          const props = billingBodyProps(data, ctx);
          if (!props.rows.some((row) => row.value.length > 0)) {
            return (
              <div data-testid="section-empty">
                <EmptyState label="No budget details on file yet." />
              </div>
            );
          }

          return (
            <PanelCard
              sectionId="billing"
              cardId={BUDGET_CARD_ID}
              actions={
                <CardHeaderActions
                  cardId={BUDGET_CARD_ID}
                  driveFileId={data.driveFileId}
                  anchor={data.sourceAnchors[CARD_REGION_MAP[BUDGET_CARD_ID]]}
                  showId={showId}
                  cardReport={cardReport}
                />
              }
            >
              {BillingBody(props)}
            </PanelCard>
          );
        }}
      />
    </div>
  );
}
