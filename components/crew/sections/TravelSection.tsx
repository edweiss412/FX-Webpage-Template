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
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { formatIsoDate } from "@/lib/format/date";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import {
  parseFlightItinerary,
  sortSegmentsByDate,
  pickUpcomingIndex,
  formatFlightDate,
  type FlightSegment,
} from "@/lib/crew/flightDisplay";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
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
}: {
  mode: "ground" | "flight";
  label: string;
  /** The strong primary line — a string or a pre-built node (e.g. a <time>). */
  primary: ReactNode;
  meta?: ReactNode;
  conf?: ReactNode;
}): JSX.Element {
  const Glyph = mode === "flight" ? PlaneIcon : CarIcon;
  return (
    <div
      data-testid="travelrow"
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

/**
 * The flight card's structured-vs-raw decision, extracted so the card and the
 * date-suppression filter below read it from ONE place. Two copies of this
 * predicate would drift, and the drift is silent: the filter would withhold a
 * row the card would have rendered structurally (content lost) or keep one the
 * card renders raw (a date leaked through the fallback).
 */
function flightRowFields(
  seg: FlightSegment,
  hideDates: boolean,
): {
  carrier: string | null;
  route: string;
  conf: string | null;
  showStructured: boolean;
} {
  // `flightNo`, `airline` and `conf` are the parser's UNVALIDATED REMAINDER: it
  // claims the date, route and times, then assigns whatever tokens are left to
  // these. So an ordinary duplicated-date authoring mistake ("5/13 MAY13 LGA -
  // ORD", or a leading ISO date) puts a date in them, and it renders outside
  // `dateLabel` where none of the date gates can see it.
  //
  // The rule under suppression is CLOSED, not a recognizer: render only the
  // fields whose SHAPE cannot express a date — the route (airport codes, three
  // letters each side of a separator) and the times (`h:mm am/pm`) — and
  // withhold the remainder. Recognizing dates inside the remainder instead would
  // mean enumerating spellings, which does not terminate and gets a wider
  // target every round. `flightNo` is in the withheld set precisely because its
  // own shape (`^[A-Z]{1,3}\d{1,4}[A-Z]?$`) ACCEPTS "MAY13".
  //
  // The cost is the carrier name and confirmation code, for suppressed viewers
  // only; route and times are what a crew member reads off a phone anyway.
  const carrier = hideDates ? null : (seg.flightNo ?? seg.airline);
  const route =
    seg.origin && seg.dest ? `${seg.origin} → ${seg.dest}` : (seg.origin ?? seg.dest ?? "");
  const conf = hideDates ? null : seg.conf;
  const hasContent = Boolean(carrier || route || seg.depTime || seg.arrTime);
  return { carrier, route, conf, showStructured: seg.structured && hasContent };
}

/**
 * Does this reservation render ANYTHING once its check-in/check-out rows are
 * withheld? Mirrors the hotel block's own read sites (name / address /
 * confirmation / notes). Used only under date suppression: a reservation whose
 * sole rendered content was its dates would otherwise leave an empty bordered
 * block inside a titled "Hotels" card — section chrome wrapping nothing.
 */
function reservationHasNonDateContent(res: ShowForViewer["hotelReservations"][number]): boolean {
  return Boolean(
    res.hotel_name ||
    !shouldHideGenericOptional(res.hotel_address) ||
    !shouldHideGenericOptional(res.confirmation_no) ||
    !shouldHideGenericOptional(res.notes),
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

          // Generic-optional reads route through the central predicate so sentinels
          // ('TBD' / 'N/A' / 'TBA' / '') reflow out — and so a sentinel driver_phone
          // never renders as a dead `tel:TBD` control.
          const driverName =
            transportation && !shouldHideGenericOptional(transportation.driver_name)
              ? transportation.driver_name
              : null;
          const driverPhone =
            transportation && !shouldHideGenericOptional(transportation.driver_phone)
              ? transportation.driver_phone
              : null;
          const driverEmail =
            transportation && !shouldHideGenericOptional(transportation.driver_email)
              ? transportation.driver_email
              : null;
          const loadoutName =
            transportation && !shouldHideGenericOptional(transportation.loadout_name)
              ? transportation.loadout_name
              : null;
          const loadoutPhone =
            transportation && !shouldHideGenericOptional(transportation.loadout_phone)
              ? transportation.loadout_phone
              : null;
          const loadoutEmail =
            transportation && !shouldHideGenericOptional(transportation.loadout_email)
              ? transportation.loadout_email
              : null;
          const vehicle =
            transportation && !shouldHideGenericOptional(transportation.vehicle)
              ? transportation.vehicle
              : null;
          const licensePlate =
            transportation && !shouldHideGenericOptional(transportation.license_plate)
              ? transportation.license_plate
              : null;
          const color =
            transportation && !shouldHideGenericOptional(transportation.color)
              ? transportation.color
              : null;
          const parking =
            transportation && !shouldHideGenericOptional(transportation.parking)
              ? transportation.parking
              : null;
          const transportNotes =
            transportation && !shouldHideGenericOptional(transportation.notes)
              ? transportation.notes
              : null;

          // Per-leg sentinel hiding: each schedule leg's `stage` / `date` /
          // `time` is a generic-optional free-text field — a sentinel ('TBD' /
          // 'N/A' / 'TBA' / '') must reflow out at the READ site, never reach
          // the bold `tprimary` / eyebrow / meta. (`assigned_names` is a
          // string[]; empties are already filtered upstream in the projection.)
          // A leg with NO surviving real field (no stage, no date, no time, no
          // names) is dropped entirely so the list never shows an empty row.
          const legs = (transportation ? transportation.schedule : []).flatMap((leg) => {
            const stage = !shouldHideGenericOptional(leg.stage) ? leg.stage : null;
            // LEAK SITE 1. Withheld before the retention check below, so a leg
            // whose only content WAS its date leaves the list rather than
            // rendering an empty row — and `dateIsPrimary` (which mounts the
            // <time dateTime=…>, itself the leak) is false by construction.
            const date = hideDates || shouldHideGenericOptional(leg.date) ? null : leg.date;
            const time = !shouldHideGenericOptional(leg.time) ? leg.time : null;
            // The projection preserves schedule members unvalidated, so a blank
            // or corrupt assignee can reach here. It renders as an empty "With "
            // label — not visible content, and therefore not something that may
            // keep a date-emptied row alive. Sanitized ONLY under suppression so
            // every other viewer's output stays byte-identical to today's.
            const assignedNames = hideDates
              ? leg.assigned_names.filter((n) => typeof n === "string" && n.trim().length > 0)
              : leg.assigned_names;
            // No surviving real content → omit the whole leg.
            if (stage === null && date === null && time === null && assignedNames.length === 0) {
              return [];
            }
            return [{ stage, date, time, assignedNames }];
          });

          // --- Getting-there travelrows (mock `.travelrow`) ------------------------
          // Driver + vehicle each collapse to ONE travelrow: the strongest field is
          // the primary, the remainder fall to meta/conf. Each value is already
          // sentinel-hidden at the read site above, so a row only appears when at
          // least one of its fields survived. The `primary ?? meta ?? conf` cascade
          // guarantees no surviving field is dropped when its preferred anchor
          // (driver_name / vehicle) is itself a sentinel/null.
          // Driver row: name is the primary; phone + email fall to meta. When the
          // name is a sentinel/null, the first surviving contact field is promoted
          // to primary so nothing is silently dropped.
          const driverFields = [driverName, driverPhone, driverEmail].filter(Boolean) as string[];
          const hasDriver = driverFields.length > 0;
          const driverPrimary = driverFields[0] ?? null;
          const driverMetaLines = driverFields.slice(1);

          // Load-out secondary transporter: same promote-first-survivor cascade as the driver.
          const loadoutFields = [loadoutName, loadoutPhone, loadoutEmail].filter(
            Boolean,
          ) as string[];
          const hasLoadout = loadoutFields.length > 0;
          const loadoutPrimary = loadoutFields[0] ?? null;
          const loadoutMetaLines = loadoutFields.slice(1);

          // Vehicle row: vehicle is the primary; license plate + color fall to meta;
          // parking is the conf line. Same promote-first-survivor cascade.
          const vehicleFields = [vehicle, licensePlate, color, parking].filter(Boolean) as string[];
          const hasVehicle = vehicleFields.length > 0;
          const vehiclePrimary = vehicleFields[0] ?? null;
          const vehicleMetaLines = vehicleFields.slice(1, -1);
          const vehicleConf =
            vehicleFields.length > 1 ? vehicleFields[vehicleFields.length - 1] : null;

          const hasGettingThere =
            hasDriver || hasLoadout || hasVehicle || legs.length > 0 || transportNotes !== null;

          // --- Hotels: sort ascending by ordinal, regardless of array order ---------
          // LEAK SITE 2 (the filter half). Under suppression the check-in/out <dl>
          // does not mount, so a dates-only reservation would render an empty
          // block; it is dropped here and `hasHotels` re-derives from what is
          // actually visible.
          const reservations = [...data.hotelReservations]
            .sort((a, b) => a.ordinal - b.ordinal)
            .filter((res) => !hideDates || reservationHasNonDateContent(res));
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

          // Flight: derive structured segments from the viewer's flight_info string
          // (pure; no DB/projection change). parseFlightItinerary owns the same
          // strip/sentinel pre-clean as before, then classifies each leg (TRAVEL vs
          // TECH) into fields. showYear: from the show's dates, else the show-tz year.
          const flightTodayIso = todayIsoInShowTimezone(data.show, today);
          const showYear =
            Number(
              (
                data.show.dates.travelIn ??
                data.show.dates.showDays[0] ??
                data.show.dates.travelOut ??
                ""
              ).slice(0, 4),
            ) || Number(flightTodayIso.slice(0, 4));
          const flightItinerary = parseFlightItinerary(data.viewerFlightInfo, showYear);
          const sortedFlightSegments = sortSegmentsByDate(flightItinerary.segments);
          // LEAK SITE 3 (the row-set half). A raw-fallback row prints `seg.raw`
          // verbatim — the designated render of the viewer's OWN itinerary line,
          // date included by construction, and unparseable mixed text that cannot
          // be split into date and non-date parts. Withholding the whole row is
          // the conservative arm; the content cost is recorded as a documented
          // limit. The filter runs BEFORE `showFlight`, so an all-raw itinerary
          // produces exactly the no-flight-data render rather than a stranded
          // empty "Your flight" card that would also suppress the empty state.
          const flightSegments = hideDates
            ? sortedFlightSegments.filter((seg) => flightRowFields(seg, hideDates).showStructured)
            : sortedFlightSegments;
          const showFlight = flightSegments.length > 0;
          // "Which flight is next" is the same viewer-schedule claim as the date,
          // rendered as a chip AND as row styling; both hang off this index.
          const flightNextIdx = hideDates
            ? null
            : pickUpcomingIndex(flightSegments, flightTodayIso);

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
              sortedFlightSegments.some((seg) => seg.date !== null || seg.dateRaw !== null));

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
                  {hasDriver && driverPrimary ? (
                    <TravelRow
                      mode="ground"
                      label="Driver"
                      primary={driverPrimary}
                      meta={
                        driverMetaLines.length > 0 ? (
                          <span className="tabular-nums">{driverMetaLines.join(" · ")}</span>
                        ) : undefined
                      }
                    />
                  ) : null}

                  {hasLoadout && loadoutPrimary ? (
                    <TravelRow
                      mode="ground"
                      label="Load out"
                      primary={loadoutPrimary}
                      meta={
                        loadoutMetaLines.length > 0 ? (
                          <span className="tabular-nums">{loadoutMetaLines.join(" · ")}</span>
                        ) : undefined
                      }
                    />
                  ) : null}

                  {hasVehicle && vehiclePrimary ? (
                    <TravelRow
                      mode="ground"
                      label="Vehicle"
                      primary={vehiclePrimary}
                      meta={vehicleMetaLines.length > 0 ? vehicleMetaLines.join(" · ") : undefined}
                      conf={vehicleConf ?? undefined}
                    />
                  ) : null}

                  {legs.map((leg, idx) => {
                    // Each sub-field is already sentinel-hidden at the read site
                    // above, so a non-null `date` / `time` / `stage` is real
                    // content. The date is the primary line; when a leg has no
                    // date, the time (else the stage) is promoted so the row is
                    // never blank — and the promoted field is then not repeated
                    // in the meta line. A leg with no stage label drops the
                    // eyebrow (empty `label` → TravelRow renders a blank eyebrow,
                    // acceptable per its presentational contract).
                    const dateIsPrimary = leg.date !== null;
                    const timeIsPrimary = !dateIsPrimary && leg.time !== null;
                    // When neither date nor time survives, the stage becomes the
                    // primary; in that case it must NOT also be the eyebrow.
                    const stageIsPrimary = !dateIsPrimary && !timeIsPrimary && leg.stage !== null;
                    const label = stageIsPrimary ? "" : (leg.stage ?? "");
                    const showTimeInMeta = dateIsPrimary && leg.time !== null;
                    const hasNames = leg.assignedNames.length > 0;
                    const legMeta =
                      showTimeInMeta || hasNames ? (
                        <>
                          {showTimeInMeta ? <span className="tabular-nums">{leg.time}</span> : null}
                          {showTimeInMeta && hasNames ? (
                            <span className="text-text-faint"> · </span>
                          ) : null}
                          {hasNames ? (
                            <span>
                              With <span className="text-text">{leg.assignedNames.join(", ")}</span>
                            </span>
                          ) : null}
                        </>
                      ) : undefined;
                    return (
                      <TravelRow
                        key={`${leg.stage ?? "no-stage"}-${leg.date ?? "no-date"}-${idx}`}
                        mode="ground"
                        label={label}
                        primary={
                          dateIsPrimary ? (
                            <time dateTime={leg.date!}>
                              {formatIsoDate(leg.date!, "weekday-short")}
                            </time>
                          ) : (
                            (leg.time ?? leg.stage)
                          )
                        }
                        meta={legMeta}
                      />
                    );
                  })}
                </div>

                {transportNotes !== null ? (
                  <p className="mt-3.5 border-t border-border pt-3.5 text-[13px] leading-relaxed text-text-subtle">
                    {transportNotes}
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
                    const hotelAddress = !shouldHideGenericOptional(res.hotel_address)
                      ? res.hotel_address
                      : null;
                    const confirmation = !shouldHideGenericOptional(res.confirmation_no)
                      ? res.confirmation_no
                      : null;
                    const resNotes = !shouldHideGenericOptional(res.notes) ? res.notes : null;

                    const stayRows: KeyValueRow[] = [];
                    if (confirmation)
                      stayRows.push({ k: "Confirmation", v: confirmation, code: true });
                    if (resNotes) stayRows.push({ k: "Notes", v: resNotes });

                    return (
                      <div
                        key={res.ordinal}
                        className={cn(
                          "flex flex-col gap-3",
                          idx > 0 ? "border-t border-border pt-4" : "",
                        )}
                      >
                        {res.hotel_name ? (
                          <p
                            data-testid="travel-hotel-name"
                            className="text-base font-semibold leading-tight text-text-strong"
                          >
                            {res.hotel_name}
                          </p>
                        ) : null}

                        {hotelAddress !== null ? (
                          <p className="text-sm text-text-subtle">{hotelAddress}</p>
                        ) : null}

                        {/* LEAK SITE 2 (the render half). Under suppression the whole
                            <dl> stays unmounted — the hotel card renders name and its
                            other non-date fields exactly as it does when both dates are
                            null, mirroring the Tonight card's treatment. */}
                        {!hideDates && (res.check_in !== null || res.check_out !== null) ? (
                          <dl className="grid grid-cols-2 gap-3">
                            {res.check_in !== null ? (
                              <div className="flex flex-col gap-1">
                                <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                  Check in
                                </dt>
                                <dd className="text-sm text-text">
                                  <time dateTime={res.check_in}>
                                    {formatIsoDate(res.check_in, "short")}
                                  </time>
                                </dd>
                              </div>
                            ) : null}
                            {res.check_out !== null ? (
                              <div className="flex flex-col gap-1">
                                <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                  Check out
                                </dt>
                                <dd className="text-sm text-text">
                                  <time dateTime={res.check_out}>
                                    {formatIsoDate(res.check_out, "short")}
                                  </time>
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}

                        {stayRows.length > 0 ? <KeyValueRows rows={stayRows} /> : null}
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
                      {flightSegments.map((seg, i) => {
                        // Render structured fields ONLY when a leg has real content beyond a bare
                        // date — otherwise (e.g. "3/22 Charter pending") fall back to the raw line so
                        // the operator's text is never dropped. The date still drives sort/emphasis.
                        // Single-sourced with the suppression filter above so the two decisions
                        // cannot drift.
                        const { carrier, route, conf, showStructured } = flightRowFields(
                          seg,
                          hideDates,
                        );
                        const isNext = i === flightNextIdx;
                        // LEAK SITE 3 (the label half). BOTH arms are suppressed: `dateRaw`
                        // is the raw M/D token and leaks identically to the formatted ISO.
                        const dateLabel = hideDates
                          ? ""
                          : seg.date
                            ? formatFlightDate(seg.date)
                            : (seg.dateRaw ?? "");
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
                            {showStructured ? (
                              // §2.4: tabular figures so flight numbers / times / codes read at a
                              // glance and don't shift width; alpha tokens unaffected by tnum.
                              <div className="flex min-w-0 flex-col gap-0.5">
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
                                        {seg.date === flightTodayIso ? "Today" : "Next"}
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
                                {conf ? (
                                  <p className="text-xs text-text-faint tabular-nums">
                                    {/* Same transcribe-back class as the itinerary
                                        locator below; only the code gets the slash. */}
                                    Conf <span className="code-value">{conf}</span>
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span
                                data-testid="travel-flight-leg"
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
                          first date. Withheld under suppression for the same reason. */}
                      {!hideDates && flightItinerary.confirmation ? (
                        <p className="px-1 text-xs text-text-faint tabular-nums">
                          {/* Only the CODE gets the slashed zero, not the label
                              beside it. DESIGN.md §2.4. */}
                          Confirmation{" "}
                          <span className="code-value">{flightItinerary.confirmation}</span>
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
