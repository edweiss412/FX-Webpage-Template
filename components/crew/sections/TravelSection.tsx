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
 * There is NO flights block — flights are not in the ShowForViewer projection,
 * so the section renders nothing for them (no false "not added" placeholder).
 *
 * When BOTH blocks are hidden/empty, a section-level `<EmptyState
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
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { formatIsoDate } from "@/lib/format/date";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

type TravelSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
};

export function TravelSection({ data, viewer }: TravelSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + isAdmin true;
  // crew/admin_preview → matched row; malformed projection throws
  // MalformedProjectionError (the page's existing infra arm catches it).
  const ctx = resolveViewerContext(viewer, data);

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
  const legs = transportation ? transportation.schedule : [];

  const driverRows: KeyValueRow[] = [];
  if (driverName) driverRows.push({ k: "Driver", v: driverName });
  if (driverPhone) driverRows.push({ k: "Driver phone", v: driverPhone });
  if (driverEmail) driverRows.push({ k: "Driver email", v: driverEmail });

  const vehicleRows: KeyValueRow[] = [];
  if (vehicle) vehicleRows.push({ k: "Vehicle", v: vehicle });
  if (licensePlate) vehicleRows.push({ k: "License plate", v: licensePlate });
  if (color) vehicleRows.push({ k: "Color", v: color });
  if (parking) vehicleRows.push({ k: "Parking", v: parking });

  const hasGettingThere =
    driverRows.length > 0 ||
    vehicleRows.length > 0 ||
    legs.length > 0 ||
    transportNotes !== null;

  // --- Hotels: sort ascending by ordinal, regardless of array order ---------
  const reservations = [...data.hotelReservations].sort((a, b) => a.ordinal - b.ordinal);
  const hasHotels = reservations.length > 0;

  const allHidden = !hasGettingThere && !hasHotels;

  return (
    <div data-testid="section-travel" className="flex flex-col gap-4">
      {allHidden ? (
        <div data-testid="section-empty">
          <EmptyState label="No travel details on file yet." />
        </div>
      ) : null}

      {hasGettingThere ? (
        <div data-testid="travel-getting-there">
          <SectionCard title="Getting there">
            <div className="flex flex-col gap-4">
              {driverRows.length > 0 ? <KeyValueRows rows={driverRows} /> : null}

              {vehicleRows.length > 0 ? (
                <div
                  className={[
                    driverRows.length > 0 ? "border-t border-border pt-4" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <KeyValueRows rows={vehicleRows} />
                </div>
              ) : null}

              {legs.length > 0 ? (
                <ol
                  className={[
                    "flex flex-col gap-3",
                    driverRows.length > 0 || vehicleRows.length > 0
                      ? "border-t border-border pt-4"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {legs.map((leg, idx) => (
                    <li
                      key={`${leg.stage}-${leg.date ?? "no-date"}-${idx}`}
                      data-testid="travel-schedule-row"
                      className="flex flex-col gap-1"
                    >
                      <p className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
                        {leg.stage}
                      </p>
                      <p className="text-sm text-text">
                        {leg.date ? (
                          <time dateTime={leg.date} className="font-semibold text-text-strong">
                            {formatIsoDate(leg.date, "weekday-short")}
                          </time>
                        ) : null}
                        {leg.date && leg.time ? (
                          <span className="text-text-subtle"> · </span>
                        ) : null}
                        {leg.time ? <span className="tabular-nums">{leg.time}</span> : null}
                      </p>
                      {leg.assigned_names.length > 0 ? (
                        <p className="text-sm text-text-subtle">
                          With: <span className="text-text">{leg.assigned_names.join(", ")}</span>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}

              {transportNotes !== null ? (
                <p
                  className={[
                    "text-sm text-text-subtle",
                    driverRows.length > 0 || vehicleRows.length > 0 || legs.length > 0
                      ? "border-t border-border pt-4"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {transportNotes}
                </p>
              ) : null}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {hasHotels ? (
        <div data-testid="travel-hotels">
          <SectionCard title="Hotels">
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
                            <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
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
                            <dt className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
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
      ) : null}
    </div>
  );
}
