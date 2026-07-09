// Surface-B live-show override blocks (spec 2026-07-07 §8.4 / §8.5).
//
// Three presenters compose the six overridable fields onto the admin show page,
// each wiring <OverrideableField> with its loader-derived props (§8.2a) and the
// SAME server action as `onSave`:
//   • ShowDetailsOverrideBlock — net-new "Show details" section (dates + venue).
//   • CrewOverrideFields       — name + role for ONE crew member (used inline in the
//                                existing per-show crew row, replacing the plain text).
//   • HotelsOverrideBlock      — net-new "Hotels" section (per reservation hotel_name
//                                + hotel_address).
//
// RSC boundary (feedback_rsc_server_action_boundary): these are Server Components
// that pass the server action `onSave` straight through to the client
// <OverrideableField> as a DIRECT ref (never an inline closure / .bind), so
// `next build` accepts the Server→Client action wiring.

import {
  OverrideableField,
  type OverrideableFieldProps,
} from "@/components/admin/overrides/OverrideableField";
import type {
  CrewOverrideView,
  HotelOverrideView,
  ShowOverridesView,
} from "@/lib/overrides/loadShowOverrides";

type OnSave = OverrideableFieldProps["onSave"];

const FIELD_LABEL_CLASS = "text-xs font-medium uppercase tracking-wide text-text-subtle";
const ROW_CLASS = "grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3";

export function ShowDetailsOverrideBlock({
  driveFileId,
  show,
  onSave,
}: {
  driveFileId: string;
  show: ShowOverridesView["show"];
  onSave: OnSave;
}) {
  return (
    <section
      data-testid="per-show-details-block"
      aria-label="Show details"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <h2 className="text-lg font-semibold text-text-strong">Show details</h2>
      <div className={ROW_CLASS}>
        <span className={FIELD_LABEL_CLASS}>Dates</span>
        <OverrideableField
          driveFileId={driveFileId}
          domain="show"
          field="dates"
          matchKey=""
          currentValue={show.dates.currentValue}
          expectedCurrentValue={show.dates.expectedCurrentValue}
          override={show.dates.override}
          onSave={onSave}
        />
      </div>
      <div className={ROW_CLASS}>
        <span className={FIELD_LABEL_CLASS}>Venue</span>
        <OverrideableField
          driveFileId={driveFileId}
          domain="show"
          field="venue"
          matchKey=""
          currentValue={show.venue.currentValue}
          expectedCurrentValue={show.venue.expectedCurrentValue}
          override={show.venue.override}
          onSave={onSave}
        />
      </div>
    </section>
  );
}

export function CrewOverrideFields({
  driveFileId,
  view,
  onSave,
}: {
  driveFileId: string;
  view: CrewOverrideView;
  onSave: OnSave;
}) {
  return (
    <div data-testid={`crew-override-fields-${view.id}`} className="flex flex-col gap-2">
      <div className={ROW_CLASS}>
        <span className={FIELD_LABEL_CLASS}>Name</span>
        <OverrideableField
          driveFileId={driveFileId}
          domain="crew"
          field="name"
          matchKey={view.matchKey}
          currentValue={view.name.currentValue}
          expectedCurrentValue={view.name.expectedCurrentValue}
          override={view.name.override}
          onSave={onSave}
        />
      </div>
      <div className={ROW_CLASS}>
        <span className={FIELD_LABEL_CLASS}>Role</span>
        <OverrideableField
          driveFileId={driveFileId}
          domain="crew"
          field="role"
          matchKey={view.matchKey}
          currentValue={view.role.currentValue}
          expectedCurrentValue={view.role.expectedCurrentValue}
          override={view.role.override}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

function HotelOverrideRow({
  driveFileId,
  hotel,
  onSave,
}: {
  driveFileId: string;
  hotel: HotelOverrideView;
  onSave: OnSave;
}) {
  // exactOptionalPropertyTypes: only pass currentOrdinal when observed (advisory, R20).
  const ordinalProp =
    hotel.currentOrdinal === undefined ? {} : { currentOrdinal: hotel.currentOrdinal };
  return (
    <div
      data-testid={`hotel-override-row-${hotel.id}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-bg p-tile-pad"
    >
      <div className={ROW_CLASS}>
        <span className={FIELD_LABEL_CLASS}>Hotel</span>
        <OverrideableField
          driveFileId={driveFileId}
          domain="hotel"
          field="hotel_name"
          matchKey={hotel.matchKey}
          currentValue={hotel.hotel_name.currentValue}
          expectedCurrentValue={hotel.hotel_name.expectedCurrentValue}
          override={hotel.hotel_name.override}
          currentLiveHotelName={hotel.currentLiveHotelName}
          {...ordinalProp}
          onSave={onSave}
        />
      </div>
      <div className={ROW_CLASS}>
        <span className={FIELD_LABEL_CLASS}>Address</span>
        <OverrideableField
          driveFileId={driveFileId}
          domain="hotel"
          field="hotel_address"
          matchKey={hotel.matchKey}
          currentValue={hotel.hotel_address.currentValue}
          expectedCurrentValue={hotel.hotel_address.expectedCurrentValue}
          override={hotel.hotel_address.override}
          currentLiveHotelName={hotel.currentLiveHotelName}
          {...ordinalProp}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

export function HotelsOverrideBlock({
  driveFileId,
  hotels,
  onSave,
}: {
  driveFileId: string;
  hotels: readonly HotelOverrideView[];
  onSave: OnSave;
}) {
  if (hotels.length === 0) return null;
  return (
    <section
      data-testid="per-show-hotels-block"
      aria-label="Hotels"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <h2 className="text-lg font-semibold text-text-strong">Hotels</h2>
      <div className="flex flex-col gap-2">
        {hotels.map((hotel) => (
          <HotelOverrideRow
            key={hotel.id}
            driveFileId={driveFileId}
            hotel={hotel}
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  );
}
