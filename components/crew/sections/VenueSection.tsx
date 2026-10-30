/**
 * components/crew/sections/VenueSection.tsx — crew-redesign §9 "Venue" section.
 *
 * The single synchronous Server Component that homes every venue-facing field
 * the deleted VenueTile / DiagramsTile / ShowStatusTile (venue half) used to
 * carry, into one curated surface:
 *
 *   - Address — the mock 2-line form: street on line 1, locality muted on line 2
 *     (split on the first comma; comma-less → single line). Ported from VenueTile.
 *   - Facilities — the mock `.kvrow` FactRows fact list with 28px sunken
 *     mini-icons: Loading dock (DockIcon, sentinel-guarded), Parking (CarIcon,
 *     gated by `transportTileVisible` so a non-assigned crew member never sees
 *     the lot/permit details — the parking half of §9 test 17), the Room (the
 *     general-session room's parsed name, suppressed when it is the parser's
 *     synthesized fallback), the connectivity rows derived from
 *     `event_details.internet` (either "Wi-Fi network" + "Wi-Fi password" +
 *     "Internet notes" when the cell splits, or the single raw "Crew Wi-Fi" row
 *     when it does not), and Power (`event_details.power`). Every value routes
 *     through `shouldHideGenericOptional`.
 *   - COI status — the AC-4.1 `data-testid="coi-status"` surface, ported from
 *     ShowStatusTile. Sentinel-guarded: when the value is a sentinel/empty the
 *     `<span data-testid="coi-status">` is OMITTED entirely (no empty span).
 *   - Venue notes — `venue.notes`, sentinel-guarded.
 *   - Maps link — `venue.googleLink`, rendered as an `<a>` ONLY when it parses
 *     as an http(s) URL (`isParseableUrl`, ported from VenueTile) so a sentinel
 *     like "TBD" never becomes a dead `href="TBD"` navigation control (§9 test
 *     33).
 *   - Diagrams — the ported DiagramsTile, which owns embedded-first ordering
 *     and the MIME allowlist + null-snapshotPath gating. The agenda PDF
 *     relocated to the Schedule section (§4.6) and is no longer here.
 *     Whole-block omission when there's nothing to show is DiagramsTile's own
 *     `null` return.
 *
 * When ALL blocks are hidden, a section-level `<EmptyState data-testid=
 * "section-empty">` renders so the surface is never blank.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `today` + `showId` are passed in; `viewer` flags resolve via
 * `resolveViewerContext` (which throws MalformedProjectionError on a malformed
 * crewMembers projection — this section does not swallow it).
 */
import type { JSX } from "react";

import { DiagramsTile } from "@/components/crew/DiagramsBlock";
import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { FactRows } from "@/components/crew/primitives/FactRows";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import {
  FACILITIES_CARD_ID,
  FACILITIES_TITLE,
  STATUS_CARD_ID,
  STATUS_TITLE,
  WHERE_CARD_ID,
  WHERE_TITLE,
  venueFactRows,
  venueStatusLines,
  venueTransportVisible,
  venueWhereRows,
} from "@/components/crew/sections/venueRows";
import { NewTabHint } from "@/components/shared/NewTabHint";
import { BuildingIcon, InfoIcon, MapPinIcon } from "@/components/crew/icons/sectionIcons";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

type VenueSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

/**
 * URL-validity guard for the Maps anchor. Byte-identical to VenueTile's
 * `isParseableUrl` (components/tiles/VenueTile.tsx:44-52) — re-declared locally
 * because that helper is not exported and the scope guard forbids touching
 * VenueTile. Returns true only when the value parses as an `http(s):` URL so a
 * sentinel like "TBD" never becomes a dead `href="TBD"` navigation control.
 */
function isParseableUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function VenueSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: VenueSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + none-restriction;
  // crew/admin_preview → matched row; malformed projection throws
  // MalformedProjectionError (the page's existing infra arm catches it).
  const ctx = resolveViewerContext(viewer, data);

  const venue = data.show.venue;

  // --- Where / Facilities / Venue status rows --------------------------------
  // Derived in the sibling venueRows.ts, which the search builder reads too, so
  // the page and the index cannot disagree on a row (each carries its search
  // target id). Every value routes through `shouldHideGenericOptional` there.
  const whereRows = venueWhereRows(venue);
  // KeyValueRows omits empty/sentinel values, so "are there any present rows?" must
  // use the same predicate to decide whether the Where card has content.
  const hasWhereRows = whereRows.some((row) => !shouldHideGenericOptional(row.v));

  // Maps link — only when the value parses as an http(s) URL. A sentinel like
  // "TBD" is rejected by isParseableUrl so the anchor never becomes a dead
  // navigation control (ported from VenueTile).
  const mapHref = isParseableUrl(venue?.googleLink) ? venue!.googleLink! : null;

  // Parking is transportTileVisible-gated (the parking half of §9 test 17).
  const transportVisible = venueTransportVisible(data, ctx.isAdmin);
  const factRows = venueFactRows(data, { transportVisible });
  // Venue notes stay as a free-text paragraph under the status card (a long
  // multi-line note doesn't belong in the right-aligned `.v` slot).
  const { coi, notes: venueNotes } = venueStatusLines(data);

  const hasWhere = hasWhereRows || mapHref !== null;
  const hasFacts = factRows.length > 0;
  const hasStatus = coi !== null || venueNotes !== null;

  // diagrams renders null only when shouldHideDiagrams is true — recompute the
  // same predicate input to decide whether the block contributes content. The
  // agenda PDF relocated to the Schedule section (§4.6), so agenda presence no
  // longer forces this block to render (an agenda-only show shows NO empty
  // Diagrams block here).
  const hasDiagrams =
    (data.diagrams?.embeddedImages?.length ?? 0) + (data.diagrams?.linkedFolderItems?.length ?? 0) >
    0;

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The parking
  // block reads transportation.parking, gated by transportTileVisible (the same
  // gate _ShowBody applies: isAdmin || transportVisible). On a transportation
  // fetch error, admin sees an inline degraded block; a non-assigned crew member
  // (gate false) sees a silent omission — no boundary widening. NO
  // upsertAdminAlert (the _CrewShell projection alert is the sole producer).
  const transportFetchFailed =
    Boolean(data.tileErrors["transportation"]) && (ctx.isAdmin || transportVisible);

  const allHidden = !hasWhere && !hasFacts && !hasStatus && !hasDiagrams;

  // §4.9 mock `split-wide`: at ≥720px the section is two columns — LEFT the venue
  // detail tiles (Where / Facilities / Venue status, which carries dock / parking
  // / Wi-Fi / power / COI / venue notes), RIGHT the site-diagrams block. <720px
  // collapses to one column with the left tiles first, then diagrams. The grid
  // only mounts when BOTH a left-detail tile AND diagrams have content; when
  // diagrams are absent the left tiles render full-width (no dead right column),
  // and vice-versa.
  const hasLeft = hasWhere || hasFacts || hasStatus;
  const useSplit = hasLeft && hasDiagrams;

  // Left detail tiles (Where / Facilities / Venue status) as a stacked fragment
  // so they can render either inside the split's left column or full-width.
  const leftTiles = (
    <>
      {hasWhere ? (
        <div data-testid="venue-where" data-card-id={WHERE_CARD_ID}>
          <SectionCard
            icon={<MapPinIcon />}
            title={WHERE_TITLE}
            action={
              <CardHeaderActions
                cardId={WHERE_CARD_ID}
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP[WHERE_CARD_ID]]}
                showId={showId}
                cardReport={cardReport}
              />
            }
          >
            {/* Discrete Venue / City / Address rows. KeyValueRows omits any
                empty/sentinel value, so a blank address shows just Venue + City and
                a city-less venue shows Venue + Address. */}
            {hasWhereRows ? <KeyValueRows rows={whereRows} /> : null}
            {mapHref ? (
              <a
                href={mapHref}
                // An action, not sheet text (spec §2.3 clause 5).
                data-search-skip=""
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-tap-min items-center -mx-1 px-1 py-1.5 text-text underline-offset-4 transition-colors duration-fast hover:text-accent-on-bg hover:underline"
              >
                Open in Maps <NewTabHint />
              </a>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      {hasFacts ? (
        <div data-testid="venue-facilities" data-card-id={FACILITIES_CARD_ID}>
          <SectionCard
            icon={<BuildingIcon />}
            title={FACILITIES_TITLE}
            action={
              <CardHeaderActions
                cardId={FACILITIES_CARD_ID}
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP[FACILITIES_CARD_ID]]}
                showId={showId}
                cardReport={cardReport}
              />
            }
          >
            <FactRows rows={factRows} />
          </SectionCard>
        </div>
      ) : null}

      {hasStatus ? (
        <div data-testid="venue-status" data-card-id={STATUS_CARD_ID}>
          <SectionCard
            icon={<InfoIcon />}
            title={STATUS_TITLE}
            action={
              <CardHeaderActions
                cardId={STATUS_CARD_ID}
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP[STATUS_CARD_ID]]}
                showId={showId}
                cardReport={cardReport}
              />
            }
          >
            {coi !== null ? (
              // One search line: the label and the value together (spec §2.3).
              <div data-search-target={coi.searchTarget} className="flex flex-col gap-1">
                {/* Eyebrow label is a plain <p>, not a <dt>: these COI / notes
                    blocks are not inside a <dl> (no paired <dd>), so a <dt> here
                    would be an orphan description-term (invalid semantics, WCAG
                    1.3.1). Same eyebrow styling, valid structure. */}
                <p className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                  {coi.label}
                </p>
                <span
                  data-testid="coi-status"
                  className="text-sm font-semibold tabular-nums text-text-strong"
                >
                  {coi.value}
                </span>
              </div>
            ) : null}
            {venueNotes !== null ? (
              <div data-search-target={venueNotes.searchTarget} className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                  {venueNotes.label}
                </p>
                <p className="text-sm text-text">{venueNotes.value}</p>
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}
    </>
  );

  const diagramsBlock = hasDiagrams ? (
    <div data-testid="venue-diagrams" data-card-id="venue-diagrams">
      <WrappedSection
        ledger={ledger}
        tileId="crew:venue:diagrams"
        showId={showId}
        sheetName={data.show.title}
        render={() =>
          // DiagramsTile owns the embedded-first ordering + MIME allowlist +
          // null-snapshotPath gating — the throwable transform. DIRECT-INVOKED
          // as a function call (not `<DiagramsTile/>` JSX) so its synchronous
          // body runs INSIDE WrappedSection's try/catch (the H2
          // direct-invocation contract); a build throw is contained (fallback +
          // TILE_SERVER_RENDER_FAILED upsert).
          DiagramsTile({
            showId,
            diagrams: data.diagrams,
            // Only this component knows which branch rendered: in the split the
            // gallery sits in the narrow 1fr column (~92px thumbnails at 1440px),
            // so declaring the full-width default would make every thumbnail
            // fetch a 1024 variant where 256 suffices.
            ...(useSplit
              ? {
                  thumbnailSizes:
                    "(min-width: 1200px) 92px, (min-width: 720px) 8vw, (min-width: 640px) 21vw, 29vw",
                }
              : {}),
          })
        }
      />
    </div>
  ) : null;

  return (
    <div data-testid="section-venue" className="flex flex-col gap-4">
      {transportFetchFailed ? <SectionTileError domain="transportation" /> : null}

      {allHidden && !transportFetchFailed ? (
        <div data-testid="section-empty">
          <EmptyState label="No venue details on file yet." />
        </div>
      ) : null}

      {/* items-start (NOT stretch): the right Diagrams column takes its natural
          height rather than stretching to match the taller left detail stack
          (2026-06-21 owner amendment, see v1-pre-deployment-amendments). */}
      {useSplit ? (
        <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-start">
          <div
            data-testid="venue-column"
            data-venue-column="details"
            className="flex min-w-0 flex-col gap-4"
          >
            {leftTiles}
          </div>
          <div
            data-testid="venue-column"
            data-venue-column="diagrams"
            className="flex min-w-0 flex-col gap-4"
          >
            {diagramsBlock}
          </div>
        </div>
      ) : (
        <>
          {leftTiles}
          {diagramsBlock}
        </>
      )}
    </div>
  );
}
