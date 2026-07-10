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
  OrphanOverrideView,
  ShowOverridesView,
} from "@/lib/overrides/loadShowOverrides";
import type { RepointTargetIndex } from "@/lib/overrides/repointTargetIndex";

type OnSave = OverrideableFieldProps["onSave"];
// Serializable CAS-B lookup for repoint (R6), threaded to every paused-override-capable field
// (crew, hotel, orphans); show fields are singletons and never repoint.
type Resolver = RepointTargetIndex;

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
  repointTargets,
}: {
  driveFileId: string;
  view: CrewOverrideView;
  onSave: OnSave;
  repointTargets?: Resolver;
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
          {...(repointTargets !== undefined ? { repointTargets } : {})}
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
          {...(repointTargets !== undefined ? { repointTargets } : {})}
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
  repointTargets,
}: {
  driveFileId: string;
  hotel: HotelOverrideView;
  onSave: OnSave;
  repointTargets?: Resolver;
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
          {...(repointTargets !== undefined ? { repointTargets } : {})}
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
          {...(repointTargets !== undefined ? { repointTargets } : {})}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

// Human label for an orphaned override's field (its live row is gone, so we can't
// borrow the inline section's label). Domain-qualified so Doug can tell a crew orphan
// from a hotel one at a glance.
const ORPHAN_FIELD_LABEL: Record<OrphanOverrideView["field"], string> = {
  name: "Crew name",
  role: "Crew role",
  hotel_name: "Hotel",
  hotel_address: "Hotel address",
};

// §6 step 4 / G2: deactivated overrides whose parsed target vanished from the sheet
// (crew member dropped, hotel reservation removed) have no live field to attach to.
// This block gives them the SAME <OverrideableField> paused UI (Re-point / Discard) so
// the "Override paused" needs-attention deep-link resolves to a real control instead of
// a dead end. Rendered only when there is at least one orphan.
export function OrphanedOverridesBlock({
  driveFileId,
  orphans,
  onSave,
  repointTargets,
}: {
  driveFileId: string;
  orphans: readonly OrphanOverrideView[];
  onSave: OnSave;
  repointTargets?: Resolver;
}) {
  if (orphans.length === 0) return null;
  return (
    <section
      // Scroll target for the "Override paused" needs-attention deep-link (§6 step 4):
      // a target_missing card links to /admin/show/<slug>#paused-overrides so Doug lands
      // on this block instead of the page top (impeccable critique P1).
      id="paused-overrides"
      data-testid="per-show-orphaned-overrides-block"
      aria-label="Paused overrides needing attention"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <h2 className="text-lg font-semibold text-text-strong">Paused overrides</h2>
      <p className="text-sm text-text-subtle">
        The sheet no longer has these targets. Re-point each to a current row or discard it.
      </p>
      <div className="flex flex-col gap-2">
        {orphans.map((orphan) => (
          <div
            key={`${orphan.domain}-${orphan.field}-${orphan.matchKey}`}
            data-testid={`orphaned-override-row-${orphan.domain}-${orphan.field}-${orphan.matchKey}`}
            className={ROW_CLASS}
          >
            <span className={FIELD_LABEL_CLASS}>{ORPHAN_FIELD_LABEL[orphan.field]}</span>
            <OverrideableField
              driveFileId={driveFileId}
              domain={orphan.domain}
              field={orphan.field}
              matchKey={orphan.matchKey}
              // The target row is gone, so there is no live value to show. Render Doug's
              // OWN correction (the override value) as the value cell so he can decide
              // Re-point vs Discard without recalling what he typed (critique P1). Orphan
              // overrides are always crew/hotel scalars (show is never orphaned).
              currentValue={String(orphan.override.overrideValue ?? "")}
              expectedCurrentValue={null}
              override={orphan.override}
              {...(repointTargets !== undefined ? { repointTargets } : {})}
              onSave={onSave}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HotelsOverrideBlock({
  driveFileId,
  hotels,
  onSave,
  repointTargets,
}: {
  driveFileId: string;
  hotels: readonly HotelOverrideView[];
  onSave: OnSave;
  repointTargets?: Resolver;
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
            {...(repointTargets !== undefined ? { repointTargets } : {})}
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  );
}
