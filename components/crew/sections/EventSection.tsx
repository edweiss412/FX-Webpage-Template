/**
 * components/crew/sections/EventSection.tsx — the crew page's Event details section
 * (crew page redesign spec §6.2 `event` row, PR C Task 5).
 *
 * The crew panel card titled "Event details" (the registry label) around the shared
 * body (components/show-panels/EventDetailsBody.tsx), CALLED with the crew props:
 * the crew keys, sentinels hidden, rows in place of chips that read their container,
 * `h4` titles and the crew's title map. The panel keeps the Tech specs card's id, `gear-tech-specs`, and
 * the keynote, the reel and the dress code each keep their card id and header
 * actions as a field card inside it (spec line 328, plan decision 4). The dress code
 * is the full-text destination of the pass's "Dress code" cell and the quick fact
 * (spec line 316). The reel's text is URL-stripped by the groups (no raw Drive URL
 * reaches the crew DOM, spec line 302), and its proxied player
 * (`/api/asset/reel/${showId}`) reads the `showId` PROP, never `data.show.id`, which
 * doesn't exist on ShowRow. Wi-Fi and power stay in Venue.
 *
 * Membership is "always" (spec line 240): with nothing to show the section shows
 * its own empty state. The fields arrive with the show row, so there is no fetch to
 * fail. Its own wrapper is `crew:event:details` (plan decision 5).
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` flags resolve via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section
 * does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import {
  EVENT_FIELD_CARD_IDS,
  EVENT_PANEL_CARD_ID,
  eventGroupTitle,
  eventPanel,
} from "@/components/crew/sections/eventRows";
import { EventDetailsBody } from "@/components/show-panels/EventDetailsBody";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { OpeningReelVideo } from "@/components/tiles/OpeningReelVideo";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { CARD_REGION_MAP, type CardId } from "@/lib/sheet-links/buildSheetDeepLink";

type EventSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function EventSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: EventSectionProps): JSX.Element {
  // Outside the wrapper: a malformed projection reaches the route's infra arm.
  resolveViewerContext(viewer, data);

  const headerActions = (cardId: CardId, hitDirection: "up" | "down" = "up") => (
    <CardHeaderActions
      cardId={cardId}
      driveFileId={data.driveFileId}
      anchor={data.sourceAnchors[CARD_REGION_MAP[cardId]]}
      showId={showId}
      cardReport={cardReport}
      hitDirection={hitDirection}
    />
  );
  const fieldCard = (cardId: CardId, hitDirection?: "down") => ({
    cardId,
    actions: headerActions(cardId, hitDirection),
  });

  return (
    <div data-testid="section-event" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:event:details"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          const panel = eventPanel(data.show.event_details, data.openingReelHasVideo);
          if (!panel.visible) {
            return (
              <div data-testid="section-empty">
                <EmptyState label="No event details on file yet." />
              </div>
            );
          }
          return (
            <PanelCard
              sectionId="event"
              cardId={EVENT_PANEL_CARD_ID}
              actions={headerActions(EVENT_PANEL_CARD_ID)}
            >
              {/* CALLED, not rendered as an element, so a throw from the body is
                  inside the wrapper's catch (spec §6.1, error containment). */}
              {EventDetailsBody({
                groups: panel.groups,
                chips: false,
                sentinels: "hide",
                titleAs: "h4",
                groupTitle: eventGroupTitle,
                fieldCards: {
                  keynote_requirements: fieldCard(EVENT_FIELD_CARD_IDS.keynote_requirements),
                  // Wrapped under the player on a phone, so the actions' tap overlays
                  // grow away from its controls.
                  opening_reel: fieldCard(EVENT_FIELD_CARD_IDS.opening_reel, "down"),
                  // Down, or a keynote of one line above it loses its own actions to
                  // these overlays, and a report on the keynote files against this card.
                  dress_code: fieldCard(EVENT_FIELD_CARD_IDS.dress_code, "down"),
                },
                reelPlayer: panel.showPlayer ? <OpeningReelVideo showId={showId} /> : null,
                rowLayout: "fluid",
                targets: panel.targets,
              })}
            </PanelCard>
          );
        }}
      />
    </div>
  );
}
