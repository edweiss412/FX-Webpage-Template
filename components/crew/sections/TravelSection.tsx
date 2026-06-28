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
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { formatIsoDate } from "@/lib/format/date";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import {
  parseFlightItinerary,
  sortSegmentsByDate,
  pickUpcomingIndex,
  formatFlightDate,
} from "@/lib/crew/flightDisplay";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

type TravelSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
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
        <p className="text-[10.5px] font-bold uppercase leading-none tracking-eyebrow text-text-faint">
          {label}
        </p>
        <p
          data-testid="travelrow-primary"
          className="min-w-0 wrap-break-word text-[15px] font-bold leading-snug text-text-strong"
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

export function TravelSection({ data, viewer, showId, today }: TravelSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + isAdmin true;
  // crew/admin_preview → matched row; malformed projection throws
  // MalformedProjectionError (INTENTIONALLY outside WrappedSection so the
  // route-level infra arm catches it, not the per-block fallback).
  const ctx = resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-travel" className="flex flex-col gap-4">
      <WrappedSection
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
            viewerName: data.viewerName,
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
            const date = !shouldHideGenericOptional(leg.date) ? leg.date : null;
            const time = !shouldHideGenericOptional(leg.time) ? leg.time : null;
            const assignedNames = leg.assigned_names;
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

          // Vehicle row: vehicle is the primary; license plate + color fall to meta;
          // parking is the conf line. Same promote-first-survivor cascade.
          const vehicleFields = [vehicle, licensePlate, color, parking].filter(Boolean) as string[];
          const hasVehicle = vehicleFields.length > 0;
          const vehiclePrimary = vehicleFields[0] ?? null;
          const vehicleMetaLines = vehicleFields.slice(1, -1);
          const vehicleConf =
            vehicleFields.length > 1 ? vehicleFields[vehicleFields.length - 1] : null;

          const hasGettingThere =
            hasDriver || hasVehicle || legs.length > 0 || transportNotes !== null;

          // --- Hotels: sort ascending by ordinal, regardless of array order ---------
          const reservations = [...data.hotelReservations].sort((a, b) => a.ordinal - b.ordinal);
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
          const flightSegments = sortSegmentsByDate(flightItinerary.segments);
          const showFlight = flightSegments.length > 0;
          const flightNextIdx = pickUpcomingIndex(flightSegments, flightTodayIso);

          const allHidden = !showFlight && !hasGettingThere && !hasHotels;

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
                  <SourceLink
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["travel-getting-there"]]}
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
                  <SourceLink
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["travel-hotels"]]}
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
                    if (confirmation) stayRows.push({ k: "Confirmation", v: confirmation });
                    if (resNotes) stayRows.push({ k: "Notes", v: resNotes });

                    return (
                      <div
                        key={res.ordinal}
                        className={[
                          "flex flex-col gap-3",
                          idx > 0 ? "border-t border-border pt-4" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
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

                        {res.check_in !== null || res.check_out !== null ? (
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
                      <SourceLink
                        driveFileId={data.driveFileId}
                        anchor={data.sourceAnchors[CARD_REGION_MAP["travel-flight"]]}
                      />
                    }
                  >
                    <div data-testid="travel-flight" className="flex flex-col gap-1.5">
                      {flightSegments.map((seg, i) => {
                        const carrier = seg.flightNo ?? seg.airline;
                        const route =
                          seg.origin && seg.dest
                            ? `${seg.origin} → ${seg.dest}`
                            : (seg.origin ?? seg.dest ?? "");
                        const isNext = i === flightNextIdx;
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
                            {seg.structured ? (
                              // §2.4: tabular figures so flight numbers / times / codes read at a
                              // glance and don't shift width; alpha tokens unaffected by tnum.
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase leading-none tracking-eyebrow text-text-faint">
                                  <span>
                                    {seg.date ? formatFlightDate(seg.date) : (seg.dateRaw ?? "")}
                                  </span>
                                  {isNext ? (
                                    <span
                                      data-testid="flight-next-chip"
                                      // accent-on-bg (4.6:1 AA) — NOT raw text-accent (3.0:1, AA-large only) per DESIGN.md §1.1
                                      className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-accent-on-bg"
                                    >
                                      {seg.date === flightTodayIso ? "Today" : "Next"}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-sm/relaxed text-text tabular-nums">
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
                                {seg.conf ? (
                                  <p className="text-xs text-text-faint tabular-nums">
                                    Conf {seg.conf}
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
                      {flightItinerary.confirmation ? (
                        <p className="px-1 text-xs text-text-faint tabular-nums">
                          Confirmation {flightItinerary.confirmation}
                        </p>
                      ) : null}
                    </div>
                  </SectionCard>
                </div>
              ) : null}

              {allHidden && !hotelFetchFailed && !transportFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState label="No travel details on file yet." />
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
