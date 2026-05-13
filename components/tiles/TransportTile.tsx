/**
 * components/tiles/TransportTile.tsx — ground-transport tile (M4 Task 4.7;
 * spec §8.1).
 *
 * Visibility decided by the canonical predicate
 * `transportTileVisible` in lib/visibility/scopeTiles.ts. Two OR'd
 * branches:
 *
 *   1. driver_name === viewerName             → assigned driver
 *   2. viewerName ∈ schedule[*].assigned_names → tagged passenger / co-driver
 *
 * Plus admin sees the tile unconditionally when transportation exists.
 *
 * The component takes the predicate output (`visible`) as a prop so the
 * page can decide once at the parent level (avoiding double-fetching
 * `viewerName` here). Defense in depth: the tile ALSO returns null when
 * `transportation` is missing, even if the caller mistakenly mounts it.
 *
 * Render order:
 *   1. Driver block (driver_name + phone + email tap targets) — only
 *      when present.
 *   2. Vehicle metadata (vehicle, license plate, color, parking).
 *   3. Per-leg schedule rows (data-testid="transport-schedule-row")
 *      with stage / date / time / assigned_names tags.
 *   4. Notes — when present.
 *
 * Each schedule row carries data-testid="transport-schedule-row" so the
 * end-to-end assigned_names contract test can enumerate rows and assert
 * the round-trip string lands in the DOM verbatim.
 *
 * Server Component (no `'use client'`).
 */
import type { TransportationRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { formatIsoDate } from "@/lib/format/date";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type TransportTileProps = {
  transportation: TransportationRow | null;
  /**
   * Output of `transportTileVisible({ transportation, viewerName, isAdmin })`,
   * computed once at the page level.
   */
  visible: boolean;
};

export function TransportTile({ transportation, visible }: TransportTileProps) {
  if (!visible || !transportation) return null;

  // §8.3 generic-optional sentinel-hiding (Codex rounds 10 + 13 + 15):
  // notes was reclassified in round 10; vehicle/license_plate/color/
  // parking in round 13; driver_name/driver_phone/driver_email in
  // round 15. The round-15 reclassification was driven by user harm:
  // a sentinel driver_phone like "TBD" rendered as a `tel:TBD` link,
  // creating a dead/misleading contact control (clicking opens the
  // dialer to "TBD"). All transportation free-text fields originate
  // from sheet cells that the parser only normalizes with presence()
  // — sentinels survive projection. Routes through the central
  // predicate per lib/visibility/emptyState.ts:27-29 ("Tiles MUST
  // NOT inline string-list checks").
  const notesVisible = !shouldHideGenericOptional(transportation.notes);
  const vehicleVisible = !shouldHideGenericOptional(transportation.vehicle);
  const licensePlateVisible = !shouldHideGenericOptional(transportation.license_plate);
  const colorVisible = !shouldHideGenericOptional(transportation.color);
  const parkingVisible = !shouldHideGenericOptional(transportation.parking);
  const driverNameVisible = !shouldHideGenericOptional(transportation.driver_name);
  const driverPhoneVisible = !shouldHideGenericOptional(transportation.driver_phone);
  const driverEmailVisible = !shouldHideGenericOptional(transportation.driver_email);

  // If the predicate said visible but every meaningful field is null
  // (degenerate row), fall back to required-field empty-state. This
  // shouldn't happen in practice — a row exists only when the parser
  // saw something — but guards against bad data without hiding the tile.
  const allEmpty =
    !driverNameVisible &&
    !vehicleVisible &&
    !licensePlateVisible &&
    !colorVisible &&
    !parkingVisible &&
    transportation.schedule.length === 0 &&
    !notesVisible;
  if (allEmpty) {
    return (
      <Section
        testId="transport-tile"
        heading="Transport"
        headingTone="eyebrow"
        variant="reference"
        ariaLabel="Transport"
        bodyAs="div"
      >
        <EmptyState label="No transport details on file yet." />
      </Section>
    );
  }

  return (
    <Section
      testId="transport-tile"
      heading="Transport"
      headingTone="eyebrow"
      variant="reference"
      ariaLabel="Transport"
      bodyAs="div"
    >
      <div className="flex flex-1 flex-col gap-4">
        {/*
          Driver block — only shown when driver_name is set. Tap-to-call
          + tap-to-email use the KeyValue atom's linkAs feature for
          consistent 44px tap targets.
        */}
        {driverNameVisible ? (
          <dl className="flex flex-col gap-3">
            <KeyValue label="Driver" value={transportation.driver_name} />
            {driverPhoneVisible ? (
              <KeyValue label="Driver phone" value={transportation.driver_phone} linkAs="tel" />
            ) : null}
            {driverEmailVisible ? (
              <KeyValue label="Driver email" value={transportation.driver_email} linkAs="mailto" />
            ) : null}
          </dl>
        ) : null}

        {/*
          Vehicle metadata — license plate + color get tabular figures
          via KeyValue.tabular. Hairline divider above only when the
          driver block rendered AND any vehicle field is present.
        */}
        {vehicleVisible || licensePlateVisible || colorVisible || parkingVisible ? (
          <dl
            className={[
              "flex flex-col gap-3",
              driverNameVisible ? "border-t border-border pt-4" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {vehicleVisible ? <KeyValue label="Vehicle" value={transportation.vehicle} /> : null}
            {licensePlateVisible ? (
              <KeyValue label="License plate" value={transportation.license_plate} tabular />
            ) : null}
            {colorVisible ? <KeyValue label="Color" value={transportation.color} /> : null}
            {parkingVisible ? <KeyValue label="Parking" value={transportation.parking} /> : null}
          </dl>
        ) : null}

        {/*
          Per-leg schedule rows. Each row is a minimal stage / date /
          time / passengers stack so a phone reader can scan top-down.
          data-testid="transport-schedule-row" anchors the end-to-end
          assigned_names contract test.
        */}
        {transportation.schedule.length > 0 ? (
          <ol className="flex flex-col gap-3 border-t border-border pt-4">
            {transportation.schedule.map((leg, idx) => (
              <li
                key={`${leg.stage}-${leg.date ?? "no-date"}-${idx}`}
                data-testid="transport-schedule-row"
                className="flex flex-col gap-1"
              >
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
                  {leg.stage}
                </p>
                <p className="text-sm text-text">
                  {leg.date ? (
                    <time dateTime={leg.date} className="font-semibold text-text-strong">
                      {formatIsoDate(leg.date, "weekday-short")}
                    </time>
                  ) : null}
                  {leg.date && leg.time ? <span className="text-text-subtle"> · </span> : null}
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

        {notesVisible ? (
          <p className="border-t border-border pt-4 text-sm text-text-subtle">
            {transportation.notes}
          </p>
        ) : null}
      </div>
    </Section>
  );
}


/**
 * View alias + async loader for M9 Task 9.2 — `TransportTile` is
 * already pure; the loader is identity but provides the seam where
 * future per-tile derivation can throw and be caught by
 * <TileServerFallback>.
 */
export const TransportTileView = TransportTile;

export async function loadTransportTileData(
  props: TransportTileProps,
): Promise<TransportTileProps> {
  return props;
}
