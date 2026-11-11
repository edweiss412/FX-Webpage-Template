/**
 * components/crew/sections/VenueSection.tsx — crew-redesign §9 "Venue" section.
 *
 * The single synchronous Server Component that homes every venue-facing field
 * the deleted VenueTile / ShowStatusTile (venue half) used to carry, into one
 * curated surface:
 *
 *   - The Venue panel — the shared Venue body (components/show-panels/
 *     VenueBody.tsx, crew page redesign PR B Task 5, spec §6.2 `venue` row) in
 *     the crew panel card titled with the section's registry label ("Venue",
 *     spec §9.1), card id `venue-where` kept: the venue name, the street and the
 *     city lines (`venueWhereProps`), sentinels hidden, a search target per line,
 *     and the Maps link in the body's map slot. The body is CALLED inside its own
 *     `WrappedSection` (`crew:venue:where`), so a throw is contained and recorded
 *     (spec §6.1, error containment).
 *   - Maps link — `venue.googleLink`, rendered as an `<a>` ONLY when it parses
 *     as an http(s) URL (`isParseableUrl`, ported from VenueTile) so a sentinel
 *     like "TBD" never becomes a dead `href="TBD"` navigation control (§9 test
 *     33).
 *   - Facilities — crew-only, below the body: the mock `.kvrow` FactRows fact
 *     list with 28px sunken mini-icons: Loading dock (DockIcon,
 *     sentinel-guarded), Parking (CarIcon, gated by `transportTileVisible` so a
 *     non-assigned crew member never sees the lot/permit details — the parking
 *     half of §9 test 17), the Room (the general-session room's parsed name,
 *     suppressed when it is the parser's synthesized fallback), the connectivity
 *     rows derived from `event_details.internet` (either "Wi-Fi network" + "Wi-Fi
 *     password" + "Internet notes" when the cell splits, or the single raw "Crew
 *     Wi-Fi" row when it does not), and Power (`event_details.power`). Every
 *     value routes through `shouldHideGenericOptional`.
 *   - Venue status — crew-only, below Facilities: the AC-4.1
 *     `data-testid="coi-status"` surface, ported from ShowStatusTile, visible to
 *     every crew member (spec §6.2: COI stays in Venue). Sentinel-guarded: when
 *     the value is a sentinel/empty the `<span data-testid="coi-status">` is
 *     OMITTED entirely (no empty span). Then venue notes, sentinel-guarded.
 *
 * Diagrams moved to the Rooms section (crew page redesign PR C Task 7, spec line
 * 317), so the cards stack in one column at every width.
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

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { FactRows } from "@/components/crew/primitives/FactRows";
import {
  FACILITIES_CARD_ID,
  FACILITIES_TITLE,
  STATUS_CARD_ID,
  STATUS_TITLE,
  WHERE_CARD_ID,
  venueFactRows,
  venueStatusLines,
  venueTransportVisible,
  venueWhereProps,
} from "@/components/crew/sections/venueRows";
import { NewTabHint } from "@/components/shared/NewTabHint";
import { showSection } from "@/lib/showSections/registry";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { VenueBody } from "@/components/show-panels/VenueBody";
import { BuildingIcon, InfoIcon } from "@/components/crew/icons/sectionIcons";
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

  // --- Venue panel lines / Facilities / Venue status rows ---------------------
  // Derived in the sibling venueRows.ts, which the search builder reads too, so
  // the page and the index cannot disagree on a line (each carries its search
  // target id). Every value routes through `shouldHideGenericOptional` there.
  const where = venueWhereProps(venue);
  // The body hides an empty/sentinel line, so "is there a line to show?" must use
  // the same predicate to decide whether the Venue panel has content.
  const hasWhereLines = [where.name, where.address, where.city].some(
    (line) => line !== null && !shouldHideGenericOptional(line),
  );

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

  const hasWhere = hasWhereLines || mapHref !== null;
  const hasFacts = factRows.length > 0;
  const hasStatus = coi !== null || venueNotes !== null;

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The parking
  // block reads transportation.parking, gated by transportTileVisible (the same
  // gate _ShowBody applies: isAdmin || transportVisible). On a transportation
  // fetch error, admin sees an inline degraded block; a non-assigned crew member
  // (gate false) sees a silent omission — no boundary widening. NO
  // upsertAdminAlert (the _CrewShell projection alert is the sole producer).
  const transportFetchFailed =
    Boolean(data.tileErrors["transportation"]) && (ctx.isAdmin || transportVisible);

  const allHidden = !hasWhere && !hasFacts && !hasStatus;

  return (
    <div data-testid="section-venue" className="flex flex-col gap-4">
      {transportFetchFailed ? <SectionTileError domain="transportation" /> : null}

      {allHidden && !transportFetchFailed ? (
        <div data-testid="section-empty">
          <EmptyState label="No venue details on file yet." />
        </div>
      ) : null}

      {hasWhere ? (
        <div data-testid="venue-where">
          <WrappedSection
            ledger={ledger}
            tileId="crew:venue:where"
            showId={showId}
            sheetName={data.show.title}
            render={() => (
              <PanelCard
                sectionId="venue"
                cardId={WHERE_CARD_ID}
                actions={
                  <CardHeaderActions
                    cardId={WHERE_CARD_ID}
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP[WHERE_CARD_ID]]}
                    showId={showId}
                    cardReport={cardReport}
                    label={showSection("venue").label}
                  />
                }
              >
                {/* CALLED, not rendered as an element, so a throw from the body
                    is inside the wrapper's catch (spec §6.1, error containment).
                    The crew's dock stays in Facilities, so the body draws none. */}
                {VenueBody({
                  ...where,
                  dock: null,
                  map: mapHref ? (
                    <a
                      href={mapHref}
                      // An action, not sheet text (spec §2.3 clause 5).
                      data-search-skip=""
                      target="_blank"
                      rel="noopener noreferrer"
                      // Underlined at rest (PR B invariant-8 gate, row 18): beside the
                      // address from the crew threshold, a bare line read as a caption.
                      className="inline-flex min-h-tap-min items-center -mx-1 px-1 py-1.5 text-text underline underline-offset-4 transition-colors duration-fast hover:text-accent-on-bg"
                    >
                      Open in Maps <NewTabHint />
                    </a>
                  ) : null,
                  sentinels: "hide",
                  bleed: false,
                  // The crew's presentation (PR B invariant-8 gate rows 3 and 7):
                  // the section container's threshold, the address in body text.
                  layout: "container",
                  addressTone: "text",
                  nameLabel: false,
                })}
              </PanelCard>
            )}
          />
        </div>
      ) : null}

      {hasFacts ? (
        <div data-testid="venue-facilities" data-card-id={FACILITIES_CARD_ID}>
          <PanelCard
            icon={BuildingIcon}
            title={FACILITIES_TITLE}
            actions={
              <CardHeaderActions
                cardId={FACILITIES_CARD_ID}
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP[FACILITIES_CARD_ID]]}
                showId={showId}
                cardReport={cardReport}
                label={FACILITIES_TITLE}
              />
            }
          >
            <FactRows rows={factRows} />
          </PanelCard>
        </div>
      ) : null}

      {hasStatus ? (
        <div data-testid="venue-status" data-card-id={STATUS_CARD_ID}>
          <PanelCard
            icon={InfoIcon}
            title={STATUS_TITLE}
            actions={
              <CardHeaderActions
                cardId={STATUS_CARD_ID}
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP[STATUS_CARD_ID]]}
                showId={showId}
                cardReport={cardReport}
                label={STATUS_TITLE}
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
                <p className="max-w-[75ch] text-sm text-text">{venueNotes.value}</p>
              </div>
            ) : null}
          </PanelCard>
        </div>
      ) : null}
    </div>
  );
}
