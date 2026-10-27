/**
 * components/crew/sections/TravelSection.tsx — crew-redesign §9 "Travel" section.
 *
 * The single synchronous Server Component that homes the two travel-facing
 * surfaces the deleted TransportTile / LodgingTile used to carry:
 *
 *   - Getting there (ground transport) — the FULL TransportationRow field set
 *     (driver_name / driver_phone / driver_email / vehicle / license_plate /
 *     color / parking / per-leg schedule incl. assigned_names / notes). The
 *     ENTIRE block is gated by `transportTileVisible({ transportation,
 *     viewerName, isAdmin })` so an unassigned crew member never sees any
 *     driver / vehicle / plate / parking PII (the gate half of §9 test 17).
 *     When the predicate says hidden, the block is omitted wholesale.
 *
 *   - Hotels — every `hotelReservations[]` entry, sorted ASCENDING by
 *     `ordinal` (regardless of array order; the ordinal half of §9 test 17),
 *     each rendered as a stacked block separated by a hairline divider on
 *     idx>0 (LodgingTile idiom). hotel_name is the prominent line; address /
 *     confirmation / check-in–check-out / notes are sentinel-guarded rows.
 *
 *   - Your flight — the viewer's OWN itinerary, projected as
 *     `viewerFlightInfo` ("arrival | departure"). Rendered FIRST (full-width,
 *     above the getting-there/hotels split) as the most personal Travel datum.
 *     `parseFlightItinerary` (lib/crew/flightDisplay.ts) sentinel/URL-strips then
 *     classifies each leg (TRAVEL vs TECH) into structured fields — date · carrier
 *     · route · times · conf — with the next/today flight emphasized; an
 *     unparseable (no-date) leg falls back to its raw line. The card is omitted
 *     when nothing survives (no false "not added" placeholder).
 *
 * When ALL blocks are hidden/empty, a section-level `<EmptyState
 * data-testid="section-empty">` renders so the surface is never blank.
 *
 * Every generic-optional string read routes through `shouldHideGenericOptional`
 * (lib/visibility/emptyState.ts) — the `_metaSentinelHidingContract` meta-test
 * walks `components/crew/sections/` and fails an unguarded read.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `today` + `showId` are passed in; `viewer` flags resolve via
 * `resolveViewerContext` (which throws MalformedProjectionError on a malformed
 * crewMembers projection — this section does not swallow it).
 */
import type { JSX, ReactNode } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { BedIcon, CarIcon, PlaneIcon } from "@/components/crew/icons/sectionIcons";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { flightCard, gettingThereRows, hotelBlocks } from "@/components/crew/sections/travelRows";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { cn } from "@/lib/ui/cn";

type TravelSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

/**
 * The mock's `.travelrow` — one itinerary line in "Getting there". A 34px
 * sunken mini-icon square (a car for ground transport / driver / vehicle, a
 * plane for flight legs) sits left of a `.tcol` that stacks:
 *
 *   - `tlabel`   — a faint uppercase eyebrow (the stage / field label)
 *   - `tprimary` — the strong primary line (date / driver name / vehicle)
 *   - `tmeta`    — a subtle secondary line (time, "with …", phone/email)
 *   - `tconf`    — a faint, tabular-nums sub line (confirmation / plate / color)
 *
 * Rows are separated by a hairline bottom border; the first drops its top
 * padding and the last drops its border + bottom padding so the list sits
 * flush inside the SectionCard. All free-text values are pre-resolved by the
 * caller (sentinel-hidden at the read site), so this presentational helper
 * never touches a raw generic-optional field.
 */
function TravelRow({
  mode,
  label,
  primary,
  meta,
  conf,
  searchTarget,
}: {
  mode: "ground" | "flight";
  label: string;
  /** The strong primary line — a string or a pre-built node (e.g. a <time>). */
  primary: ReactNode;
  meta?: ReactNode;
  conf?: ReactNode;
  /** The row's search entry id (travelRows.ts); the whole row is one search line. */
  searchTarget?: string | undefined;
}): JSX.Element {
  const Glyph = mode === "flight" ? PlaneIcon : CarIcon;
  return (
    <div
      data-testid="travelrow"
      data-search-target={searchTarget}
      className="flex items-start gap-3.5 border-b border-border py-3.5 first:pt-0 last:border-b-0 last:pb-0"
    >
      {/* 34px sunken mini-icon square — a 17px glyph centered, subtle ink. */}
      <span
        data-slot="travelrow-icon"
        aria-hidden="true"
        className="grid size-8.5 shrink-0 place-items-center rounded-[9px] bg-surface-sunken text-text-subtle [&_svg]:size-4.25"
      >
        <Glyph />
      </span>

      {/* `.tcol` — the stacked label / primary / meta / conf lines. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* `empty:hidden` is load-bearing (DESIGN.md §7a): a ground leg whose stage was
            promoted to the primary line passes `label=""`, and an empty <p> is still a
            flex item, so this stack would spend its `gap-0.5` above a line that paints
            nothing — measured as a 2px displacement of the primary line. The element
            keeps its documented slot and costs nothing when blank. CAVEAT: `:empty`
            matches only with NO child nodes, text included, so a stray literal space or
            {" "} here would silently re-enable the gap. */}
        <p className="text-[10.5px] font-bold uppercase leading-none tracking-eyebrow text-text-faint empty:hidden">
          {label}
        </p>
        {/* `empty:hidden` for the same reason the eyebrow above carries it, and
            it became reachable with date suppression: a leg whose only content
            is its date and its assigned names keeps its row by design, but
            `primary` then resolves to null and an empty <p> is still a flex
            item spending the stack's gap above a line that paints nothing. */}
        <p
          data-testid="travelrow-primary"
          className="min-w-0 wrap-break-word text-[15px] font-bold leading-snug text-text-strong empty:hidden"
        >
          {primary}
        </p>
        {meta !== undefined && meta !== null ? (
          <p
            data-testid="travelrow-meta"
            className="min-w-0 wrap-break-word text-[13px] leading-snug text-text-subtle"
          >
            {meta}
          </p>
        ) : null}
        {conf !== undefined && conf !== null ? (
          <p className="min-w-0 wrap-break-word text-[11.5px] leading-snug tabular-nums text-text-faint">
            {conf}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TravelSection({
  data,
  viewer,
  showId,
  ledger,
  today,
  cardReport = DEFAULT_CARD_REPORT,
}: TravelSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + isAdmin true;
  // crew/admin_preview → matched row; malformed projection throws
  // MalformedProjectionError (INTENTIONALLY outside WrappedSection so the
  // route-level infra arm catches it, not the per-block fallback).
  const ctx = resolveViewerContext(viewer, data);

  // BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK. `unknown_asterisk` means the sheet says
  // this viewer works SOME subset of days and does not say which, so every date
  // this section renders is a claim about the VIEWER'S OWN schedule. The three
  // sites gated below (ground-leg dates, hotel check-in/out, the personal flight
  // block) are the ones `lib/crew/dateSuppression.ts` used to list as NOT gated.
  // Computed ONCE here; every derivation downstream runs over POST-suppression
  // content so the viewer never sees a blank row, an empty card, or section
  // chrome wrapping nothing — each such case falls back to the same designed
  // empty state a viewer with no travel data at all receives.
  const hideDates = suppressesDates(ctx.dateRestriction);

  return (
    <div data-testid="section-travel" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:travel:transport"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // --- Getting there: whole-block gate via transportTileVisible -------------
          // The predicate is the single source of truth for whether a viewer may see
          // ANY ground-transport detail. When it returns false the entire block is
          // omitted, so no driver / vehicle / plate / parking PII reaches the DOM.
          const transportVisible = transportTileVisible({
            transportation: data.transportation,
            viewerId: data.viewerId,
            transportationOwnerIds: data.transportationOwnerIds,
            viewerName: data.viewerName,
            viewerNameAliases: data.viewerNameAliases,
            isAdmin: ctx.isAdmin,
          });
          const transportation = transportVisible ? data.transportation : null;

          // Getting there, hotels and the flight card are derived in travelRows.ts,
          // which the search builder reads too, so the page and the index agree on
          // every line. Every generic-optional read there routes through
          // `shouldHideGenericOptional`, as it did here.
          const ground = gettingThereRows(transportation, hideDates);
          const hasGettingThere = ground.visible;
          const reservations = hotelBlocks(data.hotelReservations, hideDates);
          const hasHotels = reservations.length > 0;

          // §4.13 mechanism #3 — active-section FETCH-error visual fallback.
          // When the projection flagged a fetch error for a block this section
          // owns AND that block's visibility gate is satisfied: admin sees an
          // inline degraded block; crew sees omission. NO upsertAdminAlert (the
          // _CrewShell projection alert is the sole producer). Gates mirror
          // _ShowBody §4.13: hotel → isAdmin; transportation → isAdmin ||
          // transportVisible. A FALSE gate → silent omission (no boundary
          // widening). This composes with the WrappedSection render-throw arm.
          const hotelFetchFailed = Boolean(data.tileErrors["hotel"]) && ctx.isAdmin;
          const transportFetchFailed =
            Boolean(data.tileErrors["transportation"]) && (ctx.isAdmin || transportVisible);

          // Flight: the viewer's own itinerary (`flightCard`, travelRows.ts), with
          // the suppression filter and the next-flight pick applied.
          const flight = flightCard(data, today, hideDates);
          const flightSegments = flight.rows;
          const showFlight = flightSegments.length > 0;

          const allHidden = !showFlight && !hasGettingThere && !hasHotels;

          // Did SUPPRESSION empty this section, or was there nothing to show?
          // The distinction is load-bearing copy, not bookkeeping: this arc is
          // what made the empty state reachable for a viewer who HAS travel data
          // (a dates-only reservation used to keep the hotels block alive), and
          // telling a crew member their travel is not booked when it is booked
          // and merely withheld is a trust failure — they would chase the admin
          // for data that already exists. Derived from the UNFILTERED inputs,
          // because that is the only place the difference survives.
          // Keyed on whether a DATE actually existed to withhold, not merely on
          // whether a row existed. A contentless reservation with null dates is
          // dropped because it renders nothing, and blaming suppression for that
          // is the same falsehood pointed the other way.
          const suppressionEmptiedSection =
            hideDates &&
            allHidden &&
            (data.hotelReservations.some(
              // Through the sentinel predicate like every other read in this
              // file: a literal `TBD` check-in is not a date, and counting it
              // as one produces exactly the wrong-reason copy this term exists
              // to prevent.
              (res) =>
                !shouldHideGenericOptional(res.check_in) ||
                !shouldHideGenericOptional(res.check_out),
            ) ||
              (transportation?.schedule ?? []).some(
                (leg) => !shouldHideGenericOptional(leg.date),
              ) ||
              // Keyed on a DATE here too, not on the row count. Under
              // `allHidden` every flight row was withheld, but a row can be
              // withheld by the raw-fallback rule WITHOUT having carried a date:
              // "Charter pending" parses with `date` and `dateRaw` both null.
              // Counting rows would tell that viewer their dates are hidden when
              // none existed — the same falsehood as the hotel and leg terms
              // above, pointed a third way. Its content loss is documented
              // limit 7, and a plain absence beats a wrong reason.
              flight.sortedSegments.some((seg) => seg.date !== null || seg.dateRaw !== null));

          // §4.9 mock `split-wide`: at ≥720px the section is two columns — a WIDE
          // LEFT "Getting there" (ground transport / itinerary) and a NARROW RIGHT
          // "Where you're staying" (hotels), at the mock's 1.6fr/1fr ratio. <720px
          // collapses to one column, getting-there above hotels. The grid only
          // mounts when BOTH blocks have content; with just one present it renders
          // full-width (no dead 1.6fr track). The grid uses `items-start` (NOT the
          // default stretch) so the SHORT right "Hotels" column takes its natural
          // height instead of stretching to match the taller "Getting there" list
          // and leaving dead space (2026-06-21 owner amendment — see
          // v1-pre-deployment-amendments); each column carries `min-w-0` so long
          // strings wrap rather than overflow.
          const useSplit = hasGettingThere && hasHotels;

          const gettingThereBlock = hasGettingThere ? (
            <div data-testid="travel-getting-there" data-card-id="travel-getting-there">
              <SectionCard
                icon={<PlaneIcon />}
                title="Getting there"
                action={
                  <CardHeaderActions
                    cardId="travel-getting-there"
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["travel-getting-there"]]}
                    showId={showId}
                    cardReport={cardReport}
                  />
                }
              >
                {/* Mock `.travelrow` list — driver / vehicle / itinerary legs as
                    icon-led rows. The list is a single flush column; each row's
                    first/last padding + hairline border is handled by TravelRow. */}
                <div className="flex flex-col">
                  {ground.rows.map((row) => {
                    // Driver and load out: name, else the first surviving contact
                    // field, as the primary; the rest in a tabular meta line.
                    // Vehicle: plate and colour in meta, parking as the conf line.
                    // Legs: the date (in a <time>), else the time, else the stage,
                    // as the primary; the meta line carries the time when the date
                    // is the primary, and who rides.
                    if (row.kind === "contact") {
                      return (
                        <TravelRow
                          key={row.key}
                          mode="ground"
                          label={row.label}
                          primary={row.primary}
                          meta={
                            row.meta !== null ? (
                              <span className="tabular-nums">{row.meta}</span>
                            ) : undefined
                          }
                          searchTarget={row.line?.id}
                        />
                      );
                    }
                    if (row.kind === "vehicle") {
                      return (
                        <TravelRow
                          key={row.key}
                          mode="ground"
                          label={row.label}
                          primary={row.primary}
                          meta={row.meta ?? undefined}
                          conf={row.conf ?? undefined}
                          searchTarget={row.line?.id}
                        />
                      );
                    }
                    const time = row.legMeta?.time ?? null;
                    const names = row.legMeta?.names ?? [];
                    const legMeta =
                      row.legMeta !== null ? (
                        <>
                          {time !== null ? <span className="tabular-nums">{time}</span> : null}
                          {time !== null && names.length > 0 ? (
                            <span className="text-text-faint"> · </span>
                          ) : null}
                          {names.length > 0 ? (
                            <span>
                              With <span className="text-text">{names.join(", ")}</span>
                            </span>
                          ) : null}
                        </>
                      ) : undefined;
                    return (
                      <TravelRow
                        key={row.key}
                        mode="ground"
                        label={row.label}
                        primary={
                          row.primaryDate !== null ? (
                            <time dateTime={row.primaryDate}>{row.primary}</time>
                          ) : (
                            row.primary
                          )
                        }
                        meta={legMeta}
                        searchTarget={row.line?.id}
                      />
                    );
                  })}
                </div>

                {ground.notes !== null ? (
                  <p
                    data-search-target={ground.notesLine?.id}
                    className="mt-3.5 border-t border-border pt-3.5 text-[13px] leading-relaxed text-text-subtle"
                  >
                    {ground.notes}
                  </p>
                ) : null}
              </SectionCard>
            </div>
          ) : null;

          const hotelsBlock = hasHotels ? (
            <div data-testid="travel-hotels" data-card-id="travel-hotels">
              <SectionCard
                icon={<BedIcon />}
                title="Hotels"
                action={
                  <CardHeaderActions
                    cardId="travel-hotels"
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["travel-hotels"]]}
                    showId={showId}
                    cardReport={cardReport}
                  />
                }
              >
                <div className="flex flex-col gap-4">
                  {reservations.map((res, idx) => {
                    return (
                      <div
                        key={res.ordinal}
                        className={cn(
                          "flex flex-col gap-3",
                          idx > 0 ? "border-t border-border pt-4" : "",
                        )}
                      >
                        {res.name !== null ? (
                          <p
                            data-testid="travel-hotel-name"
                            data-search-target={res.nameLine?.id}
                            className="text-base font-semibold leading-tight text-text-strong"
                          >
                            {res.name}
                          </p>
                        ) : null}

                        {res.address !== null ? (
                          <p
                            data-search-target={res.addressLine?.id}
                            className="text-sm text-text-subtle"
                          >
                            {res.address}
                          </p>
                        ) : null}

                        {/* LEAK SITE 2 (the render half). Under suppression the whole
                            <dl> stays unmounted — the hotel card renders name and its
                            other non-date fields exactly as it does when both dates are
                            null, mirroring the Tonight card's treatment. `hotelBlocks`
                            withholds both dates under suppression. */}
                        {res.checkIn !== null || res.checkOut !== null ? (
                          <dl className="grid grid-cols-2 gap-3">
                            {res.checkIn !== null ? (
                              <div
                                data-search-target={res.checkIn.line?.id}
                                // A blank date renders only its label: chrome, not a line.
                                data-search-skip={res.checkIn.line === null ? "" : undefined}
                                className="flex flex-col gap-1"
                              >
                                <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                  Check in
                                </dt>
                                <dd className="text-sm text-text">
                                  <time dateTime={res.checkIn.iso}>{res.checkIn.text}</time>
                                </dd>
                              </div>
                            ) : null}
                            {res.checkOut !== null ? (
                              <div
                                data-search-target={res.checkOut.line?.id}
                                data-search-skip={res.checkOut.line === null ? "" : undefined}
                                className="flex flex-col gap-1"
                              >
                                <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                  Check out
                                </dt>
                                <dd className="text-sm text-text">
                                  <time dateTime={res.checkOut.iso}>{res.checkOut.text}</time>
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}

                        {res.stayRows.length > 0 ? <KeyValueRows rows={res.stayRows} /> : null}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
          ) : null;

          return (
            <>
              {transportFetchFailed ? <SectionTileError domain="transportation" /> : null}
              {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}

              {/* Flight: the viewer's own itinerary, rendered first — the most personal
                  Travel datum. Full-width, above the getting-there/hotels split. */}
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
                                  {/* `empty:hidden` for the same reason travelrow-primary
                                      carries it: with the carrier withheld under
                                      suppression, a segment whose origin and dest are both
                                      null paints a childless <p> that still spends the
                                      stack's gap. */}
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

              {allHidden && !hotelFetchFailed && !transportFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState
                    label={
                      suppressionEmptiedSection
                        ? // Harmonized with its two ratified siblings — RightNowHero's "Your
                          // days aren't confirmed yet" and ScheduleSection's "Your days
                          // haven't been confirmed yet. Check back after the schedule is
                          // finalized." A suppressed viewer meets all three in one scroll,
                          // and the first draft was the outlier: passive, led with the
                          // system's action, and offered no next step.
                          "Your days haven't been confirmed yet, so travel dates are hidden. Check back after the schedule is finalized."
                        : "No travel details on file yet."
                    }
                  />
                </div>
              ) : null}

              {useSplit ? (
                <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-start">
                  <div
                    data-testid="travel-column"
                    data-travel-column="getting-there"
                    className="flex min-w-0 flex-col gap-4"
                  >
                    {gettingThereBlock}
                  </div>
                  <div
                    data-testid="travel-column"
                    data-travel-column="hotels"
                    className="flex min-w-0 flex-col gap-4"
                  >
                    {hotelsBlock}
                  </div>
                </div>
              ) : (
                <>
                  {gettingThereBlock}
                  {hotelsBlock}
                </>
              )}
            </>
          );
        }}
      />
    </div>
  );
}
