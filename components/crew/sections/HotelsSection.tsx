/**
 * components/crew/sections/HotelsSection.tsx — the crew page's Hotels section
 * (crew page redesign spec §6.2 `hotels` row, line 307; PR B Task 9).
 *
 * The crew panel card titled "Hotels" (the registry label, spec line 401)
 * around one shared hotel card per reservation
 * (components/show-panels/HotelCardBody.tsx), each CALLED with the crew props
 * (`hotelsPanel`): the confirmation number and notes shown, no guest chips, no
 * check-in or check-out when the viewer's dates are suppressed, sentinels
 * hidden, sorted ascending by `ordinal`. The card keeps the `travel-hotels` card
 * id and its header actions (spec line 328); the section has its own wrapper,
 * `crew:hotels:list` (plan decision 6). It replaces the Hotels card of the
 * retired Travel section; `?s=travel` resolves here (spec line 242).
 *
 * Membership is "always" (spec line 240): with no reservation the section
 * shows its own empty state, and when date suppression emptied it, says the
 * dates are hidden rather than that nothing is booked. A failed hotel read shows
 * its load-failure block to an admin only, as Travel's did (spec line 241).
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` flags resolve via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section
 * does not swallow it).
 */
import { Fragment, type JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { WrappedSection } from "@/components/crew/WrappedSection";
import {
  HOTELS_CARD_ID,
  hotelDatesWithheld,
  hotelsPanel,
} from "@/components/crew/sections/hotelsRows";
import { HotelCardBody } from "@/components/show-panels/HotelCardBody";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";

type HotelsSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function HotelsSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: HotelsSectionProps): JSX.Element {
  // Single canonical viewer resolution; a malformed crewMembers projection
  // throws MalformedProjectionError OUTSIDE WrappedSection so the route-level
  // handler sees it.
  const ctx = resolveViewerContext(viewer, data);
  // BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK, LEAK SITE 2: an `unknown_asterisk`
  // viewer's stay dates are a claim about their own schedule, so they are withheld.
  const hideDates = suppressesDates(ctx.dateRestriction);

  // §4.13 mechanism #3: the hotel block's gate is isAdmin, so a FETCH error
  // surfaces an inline degraded block to an admin only. NO upsertAdminAlert
  // (the _CrewShell projection alert is the sole producer).
  const hotelFetchFailed = Boolean(data.tileErrors["hotel"]) && ctx.isAdmin;

  return (
    <div data-testid="section-hotels" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:hotels:list"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          const panel = hotelsPanel(data.hotelReservations, hideDates);
          const hasHotels = panel.cards.length > 0;
          return (
            <>
              {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}
              {!hasHotels && !hotelFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState
                    label={
                      hotelDatesWithheld(data.hotelReservations, hideDates)
                        ? // Harmonized with its ratified siblings (the pass's "Your days
                          // aren't confirmed yet." and Schedule's "Your days haven't been
                          // confirmed yet. Check back after the schedule is finalized.").
                          "Your days haven't been confirmed yet, so hotel dates are hidden. Check back after the schedule is finalized."
                        : "No hotel details on file yet."
                    }
                  />
                </div>
              ) : null}
              {hasHotels ? (
                <PanelCard
                  sectionId="hotels"
                  cardId={HOTELS_CARD_ID}
                  actions={
                    <CardHeaderActions
                      cardId={HOTELS_CARD_ID}
                      driveFileId={data.driveFileId}
                      anchor={data.sourceAnchors[CARD_REGION_MAP[HOTELS_CARD_ID]]}
                      showId={showId}
                      cardReport={cardReport}
                    />
                  }
                >
                  <div className="flex flex-col gap-3">
                    {panel.cards.map((card) => (
                      // CALLED, not rendered as an element, so a throw from the body
                      // is inside the wrapper's catch (spec §6.1, error containment).
                      <Fragment key={card.key}>{HotelCardBody(card.body)}</Fragment>
                    ))}
                  </div>
                </PanelCard>
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}
