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
 *     the lot/permit details — the parking half of §9 test 17), Crew Wi-Fi
 *     (WifiIcon, `event_details.internet`), and Power (`event_details.power`).
 *     Every value routes through `shouldHideGenericOptional`.
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
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import {
  BuildingIcon,
  CarIcon,
  DockIcon,
  InfoIcon,
  MapPinIcon,
  WifiIcon,
} from "@/components/crew/icons/sectionIcons";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { streetFromAddress, venueDisplay } from "@/lib/venue/venueLocation";

type VenueSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
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

export function VenueSection({ data, viewer, showId }: VenueSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + none-restriction;
  // crew/admin_preview → matched row; malformed projection throws
  // MalformedProjectionError (the page's existing infra arm catches it).
  const ctx = resolveViewerContext(viewer, data);

  const venue = data.show.venue;

  // --- Where: discrete Venue / City / Address rows ---------------------------
  // venueDisplay resolves the city (geocoded → structured-address → trailing-known
  // city in the NAME) and returns the venue name with a redundant trailing city
  // stripped, so a blank-address FXAV venue ("Four Seasons Hotel Chicago") still
  // shows a clean "Chicago" City row WITHOUT printing the city twice. This card was
  // previously address-only and rendered NOTHING for such venues; it now always
  // surfaces the venue name + city. streetFromAddress drops the city tail from the
  // Address value; an empty street value reflows the Address row out (KeyValueRows
  // sentinel-hides empty values).
  const { name: venueDisplayName, city: venueCity } = venueDisplay(venue);
  const whereRows: KeyValueRow[] = venue
    ? [
        { k: "Venue", v: venueDisplayName ?? venue.name ?? "" },
        ...(venueCity ? [{ k: "City", v: venueCity } as KeyValueRow] : []),
        { k: "Address", v: streetFromAddress(venue.address, venueCity) ?? "" },
      ]
    : [];
  // KeyValueRows omits empty/sentinel values, so "are there any present rows?" must
  // use the same predicate to decide whether the Where card has content.
  const hasWhereRows = whereRows.some((row) => !shouldHideGenericOptional(row.v));

  // Maps link — only when the value parses as an http(s) URL. A sentinel like
  // "TBD" is rejected by isParseableUrl so the anchor never becomes a dead
  // navigation control (ported from VenueTile).
  const mapHref = isParseableUrl(venue?.googleLink) ? venue!.googleLink! : null;

  // --- Parking: transportTileVisible-gated -----------------------------------
  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerName: data.viewerName,
    isAdmin: ctx.isAdmin,
  });
  const rawParking = data.transportation?.parking ?? null;
  const parking =
    transportVisible && !shouldHideGenericOptional(rawParking) ? rawParking!.trim() : null;

  // --- Connectivity: Wi-Fi (internet) + power --------------------------------
  const rawInternet = data.show.event_details["internet"] ?? null;
  const internet = shouldHideGenericOptional(rawInternet) ? null : rawInternet!.trim();
  const rawPower = data.show.event_details["power"] ?? null;
  const power = shouldHideGenericOptional(rawPower) ? null : rawPower!.trim();

  // --- COI status — sentinel-guarded; span omitted entirely when hidden ------
  const rawCoi = data.show.coi_status ?? null;
  const coi = shouldHideGenericOptional(rawCoi) ? null : rawCoi!.trim();

  // --- Venue notes — sentinel-guarded ----------------------------------------
  const rawNotes = venue?.notes ?? null;
  const notes = shouldHideGenericOptional(rawNotes) ? null : rawNotes!.trim();

  // --- Loading dock — §8.3 generic-optional; sentinels reflow out ------------
  // Read at THIS site through `shouldHideGenericOptional` so the sentinel-hiding
  // meta-test (which walks venue.loadingDock) stays green; FactRows then also
  // sentinel-gates the row, but the read-site guard is the contract surface.
  const loadingDock = shouldHideGenericOptional(venue?.loadingDock ?? null)
    ? null
    : venue!.loadingDock!.trim();

  // The mock `.kvrow` fact list: each row gets a 28px sunken mini-icon. Dock →
  // DockIcon, Parking → CarIcon, Crew Wi-Fi → WifiIcon. FactRows omits any row
  // whose `v` is empty/sentinel, so we still gate each value above and only
  // push rows we want; empty strings here would also reflow out inside FactRows.
  const factRows: FactRow[] = [];
  if (loadingDock) {
    factRows.push({
      k: "Loading dock",
      v: loadingDock,
      sub: "Service entrance",
      icon: <DockIcon />,
    });
  }
  if (parking) {
    factRows.push({ k: "Parking", v: parking, icon: <CarIcon /> });
  }
  if (internet) {
    factRows.push({ k: "Crew Wi-Fi", v: internet, icon: <WifiIcon /> });
  }
  if (power) {
    factRows.push({ k: "Power", v: power });
  }

  // Venue notes stay as a free-text paragraph under the status card (a long
  // multi-line note doesn't belong in the right-aligned `.v` slot).
  const venueNotes = notes;

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
        <div data-testid="venue-where" data-card-id="venue-where">
          <SectionCard
            icon={<MapPinIcon />}
            title="Where"
            action={
              <SourceLink
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP["venue-where"]]}
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
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-tap-min items-center -mx-1 px-1 py-1.5 text-text underline-offset-4 transition-colors duration-fast hover:text-accent-on-bg hover:underline"
              >
                Open in Maps
              </a>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      {hasFacts ? (
        <div data-testid="venue-facilities" data-card-id="venue-facilities">
          <SectionCard
            icon={<BuildingIcon />}
            title="Facilities"
            action={
              <SourceLink
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP["venue-facilities"]]}
              />
            }
          >
            <FactRows rows={factRows} />
          </SectionCard>
        </div>
      ) : null}

      {hasStatus ? (
        <div data-testid="venue-status" data-card-id="venue-status">
          <SectionCard
            icon={<InfoIcon />}
            title="Venue status"
            action={
              <SourceLink
                driveFileId={data.driveFileId}
                anchor={data.sourceAnchors[CARD_REGION_MAP["venue-status"]]}
              />
            }
          >
            {coi !== null ? (
              <div className="flex flex-col gap-1">
                {/* Eyebrow label is a plain <p>, not a <dt>: these COI / notes
                    blocks are not inside a <dl> (no paired <dd>), so a <dt> here
                    would be an orphan description-term (invalid semantics, WCAG
                    1.3.1). Same eyebrow styling, valid structure. */}
                <p className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                  COI
                </p>
                <span
                  data-testid="coi-status"
                  className="text-sm font-semibold tabular-nums text-text-strong"
                >
                  {coi}
                </span>
              </div>
            ) : null}
            {venueNotes !== null ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                  Venue notes
                </p>
                <p className="text-sm text-text">{venueNotes}</p>
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
