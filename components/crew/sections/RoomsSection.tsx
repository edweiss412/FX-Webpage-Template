/**
 * components/crew/sections/RoomsSection.tsx — the crew page's Rooms section (crew page
 * redesign spec §6.2 `rooms` row, lines 317 and 320, PR C Task 7).
 *
 * The crew panel card titled "Rooms & scope" (the registry label) around the shared
 * room list (components/show-panels/RoomsBody.tsx), CALLED with the crew props: no cap,
 * the crew's room label, `h4` names, sentinels hidden, empty disciplines dropped, the
 * viewer's own disciplines labeled and first (an emphasis, never a gate: every
 * discipline stays visible to everyone), no room rail, rows that read their container,
 * and search targets. The panel
 * keeps the Room details card's id, `gear-room-details`, and takes the scope cards'
 * dynamic anchor: the GEAR tab when the show has one, else the INFO rooms region.
 *
 * Below it, the Diagrams block, moved from Venue with its wrapper and ids. Each block
 * keeps its tile id (plan decision 5), so a throw from one leaves the other.
 *
 * Membership is "always" (spec line 240): with no rooms and no diagrams the section
 * shows its own empty state, and a failed rooms fetch keeps its audience (spec line
 * 241): the admin sees the degraded block, crew the empty state.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` flags resolve via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section does
 * not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { DiagramsTile } from "@/components/crew/DiagramsBlock";
import { DIAGRAMS_CARD_ID } from "@/components/crew/diagramItems";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { ROOMS_CARD_ID, roomsPanel } from "@/components/crew/sections/roomsRows";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { RoomsBody } from "@/components/show-panels/RoomsBody";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { shouldHideDiagrams } from "@/lib/visibility/emptyState";
import { roomLabel } from "@/lib/visibility/roomLabel";

/**
 * What a thumbnail measures in this section: 26vw on a phone (76 to 113px), about 95px
 * in the 446px sheet from 640, and at most 200px in the wide column. The gallery's
 * default says 30vw, so a 430 phone at 3x asked for 387px, three past the 512 tier's
 * reach, and fetched the 1024 tier for a 111px thumbnail: 2.8x the bytes on a venue's
 * network (gate repair 5).
 */
const THUMBNAIL_SIZES = "(min-width: 1024px) 200px, (min-width: 640px) 100px, 26vw";

type RoomsSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function RoomsSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: RoomsSectionProps): JSX.Element {
  // Outside the wrappers: a malformed projection reaches the route's infra arm.
  const ctx = resolveViewerContext(viewer, data);

  const hasDiagrams = !shouldHideDiagrams(data.diagrams);

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. Rooms are shown
  // to every viewer, so a fetch error surfaces an inline degraded block to an admin
  // and the empty state to crew. NO upsertAdminAlert (the _CrewShell projection alert
  // is the sole producer). Composes with the WrappedSection render-throw arm.
  const roomsFetchFailed = Boolean(data.tileErrors["rooms"]) && ctx.isAdmin;

  return (
    <div data-testid="section-rooms" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:gear:scope"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          const panel = roomsPanel(data.rooms, ctx.viewerFlags);
          const hasRooms = panel.rooms.length > 0;
          return (
            <>
              {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              {!hasRooms && !hasDiagrams && !roomsFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState label="No rooms on file yet." />
                </div>
              ) : null}
              {hasRooms ? (
                <PanelCard
                  sectionId="rooms"
                  cardId={ROOMS_CARD_ID}
                  actions={
                    <CardHeaderActions
                      cardId={ROOMS_CARD_ID}
                      driveFileId={data.driveFileId}
                      anchor={
                        // GEAR-derived scope (modern shows) links to the GEAR tab through
                        // the date-grid-gated `gear_scope` anchor; a legacy INFO-inline
                        // show has none, so the precise `rooms` (INFO) anchor (spec §3.6).
                        data.sourceAnchors[
                          data.sourceAnchors["gear_scope"]
                            ? "gear_scope"
                            : CARD_REGION_MAP[ROOMS_CARD_ID]
                        ]
                      }
                      showId={showId}
                      cardReport={cardReport}
                    />
                  }
                >
                  {/* CALLED, not rendered as an element, so a throw from the body is
                      inside the wrapper's catch (spec §6.1, error containment). */}
                  {RoomsBody({
                    rooms: panel.rooms,
                    cap: null,
                    testIdPrefix: "crew-panel",
                    roomName: roomLabel,
                    nameAs: "h4",
                    sentinels: "hide",
                    dropEmpty: true,
                    emphasize: panel.emphasize,
                    navAnchors: false,
                    scopeLayout: "fluid",
                    headerTone: "body",
                    chipTone: "neutral",
                    targets: panel.targets,
                  })}
                </PanelCard>
              ) : null}
            </>
          );
        }}
      />

      {hasDiagrams ? (
        <div data-testid="venue-diagrams" data-card-id={DIAGRAMS_CARD_ID}>
          <WrappedSection
            ledger={ledger}
            tileId="crew:venue:diagrams"
            showId={showId}
            sheetName={data.show.title}
            render={() =>
              // DiagramsTile owns the embedded-first ordering + MIME allowlist +
              // null-snapshotPath gating — the throwable transform. DIRECT-INVOKED as a
              // function call (not `<DiagramsTile/>` JSX) so its synchronous body runs
              // INSIDE WrappedSection's try/catch (the H2 direct-invocation contract); a
              // build throw is contained (fallback + TILE_SERVER_RENDER_FAILED upsert).
              DiagramsTile({
                showId,
                diagrams: data.diagrams,
                thumbnailSizes: THUMBNAIL_SIZES,
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
