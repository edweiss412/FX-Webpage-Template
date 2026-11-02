/**
 * components/crew/sections/TransportSection.tsx — the crew page's Transport
 * section (crew page redesign spec §6.2 `transport` row, line 308; PR B Task 9).
 *
 * Two blocks, in one wrapper that keeps the retired Travel section's tile id,
 * `crew:travel:transport` (plan decision 6, so its open render alerts stay
 * resolvable):
 *
 *   - "Your flight" (card id `travel-flight`, spec line 318), the crew-only card
 *     on top: the viewer's OWN itinerary, parsed by `flightCard`
 *     (transportRows.ts) into structured rows with the next or today's flight
 *     emphasized; an unparseable leg falls back to its raw line, which date
 *     suppression withholds.
 *   - The shared transport body (components/show-panels/TransportBody.tsx),
 *     CALLED with the crew props (`transportPanel`) inside the crew panel card
 *     titled "Transport" (the registry label, spec line 403), card id
 *     `travel-getting-there`. Rendered ONLY when `transportTileVisible` admits
 *     the viewer, so a viewer the gate excludes never receives a driver,
 *     vehicle, plate, parking, assignment or note (phase 1 watchpoint 14; spec
 *     line 507 for the flight-only viewer).
 *
 * Membership (`crewSectionEntitled`, lib/crew/crewSections.ts): an admin, a
 * viewer the transport gate admits, or a viewer whose "Your flight" card renders
 * a row (spec line 240, plan decision 1). With nothing to show the section says
 * so, and when date suppression emptied it, says the dates are hidden. A failed
 * transport read shows its block to an admin and to a viewer the gate admits
 * (spec line 241), as Travel's did.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `today` + `showId` are passed in; `viewer` flags resolve via
 * `resolveViewerContext` (which throws MalformedProjectionError on a malformed
 * crewMembers projection — this section does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { PlaneIcon } from "@/components/crew/icons/sectionIcons";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { WrappedSection } from "@/components/crew/WrappedSection";
import {
  TRANSPORT_CARD_ID,
  flightCard,
  transportPanel,
} from "@/components/crew/sections/transportRows";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { TransportBody } from "@/components/show-panels/TransportBody";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

type TransportSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function TransportSection({
  data,
  viewer,
  showId,
  ledger,
  today,
  cardReport = DEFAULT_CARD_REPORT,
}: TransportSectionProps): JSX.Element {
  // Single canonical viewer resolution (outside WrappedSection, so the
  // route-level infra arm catches a malformed projection).
  const ctx = resolveViewerContext(viewer, data);

  // BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK: under `unknown_asterisk` every date
  // here is a claim about the viewer's own schedule, so the legs' days and the
  // flight's dates are withheld (LEAK SITES 1 and 3).
  const hideDates = suppressesDates(ctx.dateRestriction);

  return (
    <div data-testid="section-transport" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:travel:transport"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // The single source of truth for whether a viewer may see ANY
          // ground-transport detail: when it says no, no transport value is derived.
          const transportVisible = transportTileVisible({
            transportation: data.transportation,
            viewerId: data.viewerId,
            transportationOwnerIds: data.transportationOwnerIds,
            viewerName: data.viewerName,
            viewerNameAliases: data.viewerNameAliases,
            isAdmin: ctx.isAdmin,
          });
          const transportation = transportVisible ? data.transportation : null;
          const panel = transportation !== null ? transportPanel(transportation, hideDates) : null;
          const hasTransport = panel !== null && panel.lines.length > 0;

          // §4.13 mechanism #3: the transportation block's gate is isAdmin ||
          // transportVisible. A FALSE gate is a silent omission. NO upsertAdminAlert.
          const transportFetchFailed =
            Boolean(data.tileErrors["transportation"]) && (ctx.isAdmin || transportVisible);

          // Flight: the viewer's own itinerary, the suppression filter and the
          // next-flight pick applied.
          const flight = flightCard(data, today, hideDates);
          const flightSegments = flight.rows;
          const showFlight = flightSegments.length > 0;

          const allHidden = !showFlight && !hasTransport;
          // Did SUPPRESSION empty this section, or was there nothing to show?
          // Keyed on whether a DATE existed to withhold, never on a row count: a
          // raw flight line like "Charter pending" carries no date, and blaming
          // suppression for it is as false as saying nothing is booked.
          const suppressionEmptiedSection =
            hideDates &&
            allHidden &&
            ((transportation?.schedule ?? []).some((leg) => !shouldHideGenericOptional(leg.date)) ||
              flight.sortedSegments.some((seg) => seg.date !== null || seg.dateRaw !== null));

          return (
            <>
              {transportFetchFailed ? <SectionTileError domain="transportation" /> : null}

              {showFlight ? (
                <div data-card-id="travel-flight">
                  <SectionCard
                    icon={<PlaneIcon />}
                    title="Your flight"
                    action={
                      <CardHeaderActions
                        cardId="travel-flight"
                        driveFileId={data.driveFileId}
                        anchor={data.sourceAnchors[CARD_REGION_MAP["travel-flight"]]}
                        showId={showId}
                        cardReport={cardReport}
                      />
                    }
                  >
                    <div data-testid="travel-flight" className="flex flex-col gap-1.5">
                      {flightSegments.map((row, i) => {
                        // Render structured fields ONLY when a leg has real content beyond a bare
                        // date — otherwise (e.g. "3/22 Charter pending") fall back to the raw line so
                        // the operator's text is never dropped. The date still drives sort/emphasis.
                        // `flightRowFields` (travelRows.ts) single-sources the decision with the
                        // suppression filter so the two cannot drift.
                        const { seg, carrier, route, conf, dateLabel, chip } = row;
                        const isNext = chip !== null;
                        return (
                          <div
                            key={i}
                            data-testid="travel-flight-seg"
                            className={
                              // Emphasis = a sunken tint + the chip (NO side-stripe border —
                              // DESIGN.md "no side-stripe borders >1px"). 12px radius is on-token.
                              isNext ? "rounded-md bg-surface-sunken/60 px-3 py-2" : "p-1 "
                            }
                          >
                            {row.structured ? (
                              // §2.4: tabular figures so flight numbers / times / codes read at a
                              // glance and don't shift width; alpha tokens unaffected by tnum.
                              <div className="flex min-w-0 flex-col gap-0.5">
                                {/* The segment's line (eyebrow, carrier and route, times) is
                                    one search target and its Conf line another, so targets
                                    never nest. This wrapper repeats the parent's column and
                                    gap, so the stack lays out exactly as before. */}
                                <div
                                  data-search-target={row.line?.id}
                                  className="flex min-w-0 flex-col gap-0.5"
                                >
                                  {/* The eyebrow row is omitted outright when it would carry
                                      neither a date nor a chip — a structured segment ALWAYS has
                                      one of the two spellings of its date, so this is unreachable
                                      for every viewer except a suppressed one, whose rows would
                                      otherwise gain a blank 10.5px line above them. */}
                                  {dateLabel || isNext ? (
                                    <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase leading-none tracking-eyebrow text-text-faint">
                                      {dateLabel ? <span>{dateLabel}</span> : null}
                                      {isNext ? (
                                        <span
                                          data-testid="flight-next-chip"
                                          // accent-on-bg (5.34:1 AA) — NOT raw text-accent (2.23:1, decorative-only) per DESIGN.md §1.1
                                          className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-accent-on-bg"
                                        >
                                          {chip}
                                        </span>
                                      ) : null}
                                    </p>
                                  ) : null}
                                  {/* `empty:hidden` (DESIGN.md §7a): with the carrier withheld under
                                      suppression, a segment whose origin and dest are both
                                      null paints a childless <p> that would still spend
                                      the stack's gap. */}
                                  <p className="text-sm/relaxed text-text tabular-nums empty:hidden">
                                    {carrier ? (
                                      <span className="font-semibold">{carrier}</span>
                                    ) : null}
                                    {carrier && route ? (
                                      <span className="text-text-subtle"> · </span>
                                    ) : null}
                                    {route}
                                  </p>
                                  {seg.depTime && seg.arrTime ? (
                                    <p className="text-[13px] text-text-subtle tabular-nums">
                                      {seg.depTime} – {seg.arrTime}
                                    </p>
                                  ) : null}
                                </div>
                                {conf ? (
                                  <p
                                    data-search-target={row.confLine?.id}
                                    className="text-xs text-text-faint tabular-nums"
                                  >
                                    {/* Same transcribe-back class as the itinerary
                                        locator below; only the code gets the slash. */}
                                    Conf <span className="code-value">{conf}</span>
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span
                                data-testid="travel-flight-leg"
                                data-search-target={row.line?.id}
                                className="text-sm/relaxed text-text tabular-nums"
                              >
                                {seg.raw}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {/* The itinerary-level confirmation is the same unvalidated
                          remainder as the per-segment one: leading tokens before the
                          first date. Withheld under suppression for the same reason
                          (`flightCard` returns null for it then). */}
                      {flight.confirmation !== null ? (
                        <p
                          data-search-target={flight.confirmationLine?.id}
                          className="px-1 text-xs text-text-faint tabular-nums"
                        >
                          {/* Only the CODE gets the slashed zero, not the label
                              beside it. DESIGN.md §2.4. */}
                          Confirmation <span className="code-value">{flight.confirmation}</span>
                        </p>
                      ) : null}
                    </div>
                  </SectionCard>
                </div>
              ) : null}

              {allHidden && !transportFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState
                    label={
                      suppressionEmptiedSection
                        ? "Your days haven't been confirmed yet, so travel dates are hidden. Check back after the schedule is finalized."
                        : "No transport details on file yet."
                    }
                  />
                </div>
              ) : null}

              {panel !== null && hasTransport ? (
                <PanelCard
                  sectionId="transport"
                  cardId={TRANSPORT_CARD_ID}
                  actions={
                    <CardHeaderActions
                      cardId={TRANSPORT_CARD_ID}
                      driveFileId={data.driveFileId}
                      anchor={data.sourceAnchors[CARD_REGION_MAP[TRANSPORT_CARD_ID]]}
                      showId={showId}
                      cardReport={cardReport}
                    />
                  }
                >
                  {/* CALLED, not rendered as an element, so a throw from the body is
                      inside the wrapper's catch (spec §6.1, error containment). */}
                  {TransportBody(panel.body)}
                </PanelCard>
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}
