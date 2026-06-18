/**
 * app/show/[slug]/_ShowBody.tsx (M10 §B Task 10.8 / Phase 3 / Cluster I-5)
 *
 * Server Component extracted from `app/show/[slug]/page.tsx` so that the
 * preview-as route (`app/admin/show/[slug]/preview/[crewId]/page.tsx`)
 * can render the same show body for the `admin_preview` Viewer kind
 * (Pin-3 contract) without duplicating the tile cascade.
 *
 * The underscore prefix keeps this out of Next.js routing — it's a
 * private helper consumed by both pages. Inputs are the post-auth
 * payload (slug, showId, viewer, data); no cookie reads, no auth
 * chain. Both call sites resolve identity their own way and then hand
 * the resolved Viewer + ShowForViewer payload to this component.
 *
 * Behavior is identical to the previous inline crew page render body.
 * The extraction is purely structural; tests pinned to the crew page's
 * rendered output should continue passing unchanged. The preview-as
 * route mounts this body BELOW the sticky <PreviewBanner /> per spec
 * §9.3 so the banner stays on screen as the operator scrolls through
 * the show.
 */
import type { ReactNode } from "react";
import { IdentityChip } from "@/components/auth/IdentityChip";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ShowRealtimeBridge } from "@/components/realtime/ShowRealtimeBridge";
import { RightNowCard } from "@/components/right-now/RightNowCard";
import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
import { AudioScopeTileView, loadAudioScopeTileData } from "@/components/tiles/AudioScopeTile";
import { ContactsTileView, loadContactsTileData } from "@/components/tiles/ContactsTile";
import { CrewTileView, loadCrewTileData } from "@/components/tiles/CrewTile";
import { DiagramsTileView, loadDiagramsTileData } from "@/components/tiles/DiagramsTile";
import { FinancialsTileView, loadFinancialsTileData } from "@/components/tiles/FinancialsTile";
import {
  LightingScopeTileView,
  loadLightingScopeTileData,
} from "@/components/tiles/LightingScopeTile";
import { LodgingTileView, loadLodgingTileData } from "@/components/tiles/LodgingTile";
import { NotesTileView, loadNotesTileData } from "@/components/tiles/NotesTile";
import { OpeningReelTileView, loadOpeningReelTileData } from "@/components/tiles/OpeningReelTile";
import { PackListTileView, loadPackListTileData } from "@/components/tiles/PackListTile";
import { ScheduleTileView, loadScheduleTileData } from "@/components/tiles/ScheduleTile";
import { ShowStatusTileView, loadShowStatusTileData } from "@/components/tiles/ShowStatusTile";
import { TransportTileView, loadTransportTileData } from "@/components/tiles/TransportTile";
import { VenueTileView, loadVenueTileData } from "@/components/tiles/VenueTile";
import { VideoScopeTileView, loadVideoScopeTileData } from "@/components/tiles/VideoScopeTile";
import { WrappedTile } from "@/components/shared/WrappedTile";
import {
  audioScopeVisible,
  financialsVisible,
  lightingScopeVisible,
  transportTileVisible,
  videoScopeVisible,
} from "@/lib/visibility/scopeTiles";
import { TerminalFailure } from "@/components/auth/TerminalFailure";
import type { Viewer, ShowForViewer } from "@/lib/data/getShowForViewer";
import {
  MalformedProjectionError,
  resolveViewerContext,
  type ViewerContext,
} from "@/lib/data/viewerContext";
import {
  filterVisibleTodayTiles,
  selectTodayTiles,
  transportVisibleForToday,
  type TodayTileId,
} from "@/lib/show/selectTodayTiles";
import { nowDate } from "@/lib/time/now";
import { selectRightNowState } from "@/lib/time/rightNow";
import { isPackListVisibleToday } from "@/lib/visibility/packList";

export type ShowBodyProps = {
  slug: string;
  showId: string;
  viewer: Viewer;
  data: ShowForViewer;
  /**
   * M11.5 §B Task C4: optional identity chip rendered in the page-header
   * right slot. Provided by the tokenized route (C1) when the picker
   * has resolved a crew identity; null/undefined for admin viewers and
   * for the legacy slug-only path (which is removed when C1 lands).
   */
  identityChip?: {
    name: string;
    role: string;
    shareToken: string;
  } | null;
};

export async function ShowBody({
  slug,
  showId,
  viewer,
  data,
  identityChip,
}: ShowBodyProps): Promise<ReactNode> {
  // Per-viewer context computed once and threaded into the hero card and
  // the tile grid below.
  //
  // FAIL CLOSED on a malformed projection: when crewMembers is not an
  // array for a crew/admin_preview viewer, per-crew restrictions could
  // not be verified, so resolveViewerContext throws the typed
  // MalformedProjectionError instead of falling back to none
  // restrictions (which would render Right Now / Schedule / Pack List
  // unrestricted). The catch lives HERE — not in the page functions —
  // because this Server Component executes during React render, after
  // both call sites (crew route + admin preview-as route) have already
  // returned their element. Renders the crew route's existing infra arm
  // (page.tsx infra_error / resolved-arm catch use the same code).
  // No retryHref: ShowBody doesn't receive the shareToken (the chip prop
  // is null in exactly this case), and TerminalFailure's retry link is
  // optional by design (components/auth/TerminalFailure.tsx).
  let ctx: ViewerContext;
  try {
    ctx = resolveViewerContext(viewer, data);
  } catch (err) {
    if (err instanceof MalformedProjectionError) {
      return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
    }
    throw err;
  }
  const rightNowCtx = buildRightNowContext({
    show: data.show,
    dateRestriction: ctx.dateRestriction,
    hotelReservations: data.hotelReservations,
    rooms: data.rooms, // rooms-sourced anchors (§4.4); call site migrates to _CrewShell in Phase 2
  });

  // M11 Phase C Task C.2 / AC-11.38: render-time "today" reads through the
  // request-scoped time utility so screenshot capture can pin the clock via
  // the `X-Screenshot-Frozen-Now` header. In production (no header /
  // ENABLE_TEST_AUTH unset) this short-circuits to `new Date()`.
  const today = await nowDate();
  const todayState = selectRightNowState(today, rightNowCtx.dates, rightNowCtx.dateRestriction, {
    timezone: rightNowCtx.timezone,
  });
  const transportVisibleForTodayBand = transportVisibleForToday({
    transportTileVisible: transportTileVisible({
      transportation: data.transportation,
      viewerName: data.viewerName,
      isAdmin: ctx.isAdmin,
    }),
    isAdmin: ctx.isAdmin,
    hasTransportationFetchError: Boolean(data.tileErrors["transportation"]),
  });
  const packListVisibleForToday =
    data.pullSheet !== null &&
    data.pullSheet.length > 0 &&
    isPackListVisibleToday({
      show: data.show,
      restriction: ctx.stageRestriction,
      today,
    });
  const todayTiles = filterVisibleTodayTiles(selectTodayTiles(todayState.kind), {
    transportVisible: transportVisibleForTodayBand,
    packListVisible: packListVisibleForToday,
  });
  const isInToday = (id: TodayTileId): boolean => todayTiles.includes(id);

  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerName: data.viewerName,
    isAdmin: ctx.isAdmin,
  });

  const tileRenderers: Record<
    | TodayTileId
    | "lodging-tile"
    | "venue-tile"
    | "crew-tile"
    | "contacts-tile"
    | "audio-scope-tile"
    | "video-scope-tile"
    | "lighting-scope-tile"
    | "show-status-tile"
    | "opening-reel-tile"
    | "diagrams-tile"
    | "financials-tile"
    | "notes-tile",
    ReactNode
  > = {
    "lodging-tile": (
      <WrappedTile
        key="lodging-tile"
        tileId="lodging-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if (ctx.isAdmin && data.tileErrors["hotel"]) {
            throw new Error(`hotel fetch failed: ${data.tileErrors["hotel"]}`);
          }
          return loadLodgingTileData({ hotelReservations: data.hotelReservations });
        }}
        View={LodgingTileView}
      />
    ),
    "venue-tile": (
      <WrappedTile
        key="venue-tile"
        tileId="venue-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => loadVenueTileData({ venue: data.show.venue })}
        View={VenueTileView}
      />
    ),
    "crew-tile": (
      <WrappedTile
        key="crew-tile"
        tileId="crew-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => loadCrewTileData({ crewMembers: data.crewMembers })}
        View={CrewTileView}
      />
    ),
    "contacts-tile": (
      <WrappedTile
        key="contacts-tile"
        tileId="contacts-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if (data.tileErrors["contacts"]) {
            throw new Error(`contacts fetch failed: ${data.tileErrors["contacts"]}`);
          }
          return loadContactsTileData({ contacts: data.contacts });
        }}
        View={ContactsTileView}
      />
    ),
    "schedule-tile": (
      <WrappedTile
        key="schedule-tile"
        tileId="schedule-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() =>
          loadScheduleTileData({
            show: data.show,
            dateRestriction: ctx.dateRestriction,
            today,
          })
        }
        View={ScheduleTileView}
      />
    ),
    "audio-scope-tile": (
      <WrappedTile
        key="audio-scope-tile"
        tileId="audio-scope-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if (audioScopeVisible(ctx.viewerFlags) && data.tileErrors["rooms"]) {
            throw new Error(`rooms fetch failed: ${data.tileErrors["rooms"]}`);
          }
          return loadAudioScopeTileData({
            rooms: data.rooms,
            viewerFlags: ctx.viewerFlags,
          });
        }}
        View={AudioScopeTileView}
      />
    ),
    "video-scope-tile": (
      <WrappedTile
        key="video-scope-tile"
        tileId="video-scope-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if (videoScopeVisible(ctx.viewerFlags) && data.tileErrors["rooms"]) {
            throw new Error(`rooms fetch failed: ${data.tileErrors["rooms"]}`);
          }
          return loadVideoScopeTileData({
            rooms: data.rooms,
            viewerFlags: ctx.viewerFlags,
          });
        }}
        View={VideoScopeTileView}
      />
    ),
    "lighting-scope-tile": (
      <WrappedTile
        key="lighting-scope-tile"
        tileId="lighting-scope-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if (lightingScopeVisible(ctx.viewerFlags) && data.tileErrors["rooms"]) {
            throw new Error(`rooms fetch failed: ${data.tileErrors["rooms"]}`);
          }
          return loadLightingScopeTileData({
            rooms: data.rooms,
            viewerFlags: ctx.viewerFlags,
          });
        }}
        View={LightingScopeTileView}
      />
    ),
    "transport-tile": (
      <WrappedTile
        key="transport-tile"
        tileId="transport-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if ((ctx.isAdmin || transportVisible) && data.tileErrors["transportation"]) {
            throw new Error(
              `transportation fetch failed: ${data.tileErrors["transportation"]}`,
            );
          }
          return loadTransportTileData({
            transportation: data.transportation,
            visible: transportVisible,
          });
        }}
        View={TransportTileView}
      />
    ),
    "show-status-tile": (
      <WrappedTile
        key="show-status-tile"
        tileId="show-status-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => loadShowStatusTileData({ show: data.show })}
        View={ShowStatusTileView}
      />
    ),
    "opening-reel-tile": (
      <WrappedTile
        key="opening-reel-tile"
        tileId="opening-reel-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() =>
          loadOpeningReelTileData({
            showId,
            eventDetails: data.show.event_details,
            hasVideo: data.openingReelHasVideo,
          })
        }
        View={OpeningReelTileView}
      />
    ),
    "diagrams-tile": (
      <WrappedTile
        key="diagrams-tile"
        tileId="diagrams-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() =>
          loadDiagramsTileData({
            showId,
            diagrams: data.diagrams,
            agendaLinks: data.show.agenda_links,
          })
        }
        View={DiagramsTileView}
      />
    ),
    "financials-tile": (
      <WrappedTile
        key="financials-tile"
        tileId="financials-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          if (
            financialsVisible(ctx.viewerFlags, ctx.isAdmin) &&
            data.tileErrors["financials"]
          ) {
            throw new Error(`financials fetch failed: ${data.tileErrors["financials"]}`);
          }
          return loadFinancialsTileData({
            financials: data.financials,
            viewerFlags: ctx.viewerFlags,
            isAdmin: ctx.isAdmin,
          });
        }}
        View={FinancialsTileView}
      />
    ),
    "pack-list-tile": (
      <WrappedTile
        key="pack-list-tile"
        tileId="pack-list-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() =>
          loadPackListTileData({
            pullSheet: data.pullSheet,
            show: data.show,
            stageRestriction: ctx.stageRestriction,
            today,
          })
        }
        View={PackListTileView}
      />
    ),
    "notes-tile": (
      <WrappedTile
        key="notes-tile"
        tileId="notes-tile"
        showId={showId}
        sheetName={data.show.title}
        load={() => {
          const failed = ["hotel", "rooms", "contacts"].find(
            (k) => data.tileErrors[k],
          );
          if (failed) {
            throw new Error(`${failed} fetch failed: ${data.tileErrors[failed]}`);
          }
          if ((ctx.isAdmin || transportVisible) && data.tileErrors["transportation"]) {
            throw new Error(
              `transportation fetch failed: ${data.tileErrors["transportation"]}`,
            );
          }
          return loadNotesTileData({
            show: data.show,
            hotelReservations: data.hotelReservations,
            rooms: data.rooms,
            transportation: transportVisible ? data.transportation : null,
            contacts: data.contacts,
          });
        }}
        View={NotesTileView}
      />
    ),
  };

  const flatGridOrder = [
    "lodging-tile",
    "venue-tile",
    "transport-tile",
    "crew-tile",
    "contacts-tile",
    "show-status-tile",
    "diagrams-tile",
    "opening-reel-tile",
    "audio-scope-tile",
    "video-scope-tile",
    "lighting-scope-tile",
    "pack-list-tile",
    "financials-tile",
    "notes-tile",
  ] as const;

  return (
    <>
      <Header
        show={data.show}
        identityChip={
          identityChip
            ? (
                <IdentityChip
                  name={identityChip.name}
                  role={identityChip.role}
                  slug={slug}
                  shareToken={identityChip.shareToken}
                  showId={showId}
                />
              )
            : undefined
        }
      />
      <ShowRealtimeBridge showId={showId} slug={slug} renderVersion={data.viewerVersionToken} />
      <main
        data-testid="page-container"
        className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-section-gap px-4 py-6 sm:p-8"
      >
        <RightNowCard context={rightNowCtx} />

        <section
          data-testid="today-band"
          aria-labelledby="today-band-heading"
          className="flex flex-col gap-tile-gap"
        >
          <h2
            id="today-band-heading"
            className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Today
          </h2>
          <div
            data-testid="today-band-tiles"
            className={
              todayTiles.length === 2
                ? "grid grid-cols-1 items-stretch gap-tile-gap sm:grid-cols-2"
                : "grid grid-cols-1 items-stretch gap-tile-gap"
            }
          >
            {todayTiles.map((id) => tileRenderers[id])}
          </div>
        </section>

        <section
          data-testid="tile-grid"
          aria-label="Show tiles"
          className="grid grid-cols-2 items-stretch gap-tile-gap sm:grid-cols-3 lg:grid-cols-4"
        >
          {flatGridOrder
            .filter((id) => !isInToday(id as TodayTileId))
            .map((id) => tileRenderers[id])}
        </section>
      </main>
      <Footer
        asOf={null}
        showId={showId}
        showSlug={slug}
        // M10 §B / Cluster I-5 (Codex R5): when the body is mounted
        // under the admin preview-as route, the footer's report button
        // must file as admin AND carry the previewed-viewer context
        // (crewPreview). Otherwise an admin scrolling to the footer
        // and tapping "Something looks wrong?" would silently submit a
        // crew-surface report with no preview context, defeating the
        // triage purpose of preview-as (role-filtering bugs).
        reportAutocapture={
          viewer.kind === "admin_preview"
            ? {
                rightNowState: rightNowCtx,
                crewPreview: {
                  crewMemberId: viewer.crewMemberId,
                  name: ctx.viewerName,
                  role: ctx.viewerCrew?.role ?? null,
                },
              }
            : { rightNowState: rightNowCtx }
        }
        reportSurfaceOverride={viewer.kind === "admin_preview" ? "admin" : "crew"}
        {...(viewer.kind === "admin_preview"
          ? {
              reportSurfaceIdOverride: `admin-preview-footer-${slug}-${viewer.crewMemberId}`,
            }
          : {})}
        lastSyncedAt={data.lastSyncedAt}
        lastSyncStatus={data.lastSyncStatus}
      />
    </>
  );
}
