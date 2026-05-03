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

type TransportTileProps = {
  transportation: TransportationRow | null;
  /**
   * Output of `transportTileVisible({ transportation, viewerName, isAdmin })`,
   * computed once at the page level.
   */
  visible: boolean;
};

/** Render an ISO date as "Mon, Jun 1". */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function TransportTile({ transportation, visible }: TransportTileProps) {
  if (!visible || !transportation) return null;

  // If the predicate said visible but every meaningful field is null
  // (degenerate row), fall back to required-field empty-state. This
  // shouldn't happen in practice — a row exists only when the parser
  // saw something — but guards against bad data without hiding the tile.
  const allEmpty =
    !transportation.driver_name &&
    !transportation.vehicle &&
    !transportation.license_plate &&
    !transportation.color &&
    !transportation.parking &&
    transportation.schedule.length === 0 &&
    !transportation.notes;
  if (allEmpty) {
    return (
      <Section
        testId="transport-tile"
        heading="Transport"
        headingTone="eyebrow"
        ariaLabel="Transport"
        bodyAs="div"
      >
        <EmptyState />
      </Section>
    );
  }

  return (
    <Section
      testId="transport-tile"
      heading="Transport"
      headingTone="eyebrow"
      ariaLabel="Transport"
      bodyAs="div"
    >
      <div className="flex flex-1 flex-col gap-4">
        {/*
          Driver block — only shown when driver_name is set. Tap-to-call
          + tap-to-email use the KeyValue atom's linkAs feature for
          consistent 44px tap targets.
        */}
        {transportation.driver_name ? (
          <dl className="flex flex-col gap-3">
            <KeyValue label="Driver" value={transportation.driver_name} />
            {transportation.driver_phone ? (
              <KeyValue
                label="Driver phone"
                value={transportation.driver_phone}
                linkAs="tel"
              />
            ) : null}
            {transportation.driver_email ? (
              <KeyValue
                label="Driver email"
                value={transportation.driver_email}
                linkAs="mailto"
              />
            ) : null}
          </dl>
        ) : null}

        {/*
          Vehicle metadata — license plate + color get tabular figures
          via KeyValue.tabular. Hairline divider above only when the
          driver block rendered AND any vehicle field is present.
        */}
        {(transportation.vehicle ||
          transportation.license_plate ||
          transportation.color ||
          transportation.parking) ? (
          <dl
            className={[
              "flex flex-col gap-3",
              transportation.driver_name
                ? "border-t border-border pt-4"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {transportation.vehicle ? (
              <KeyValue label="Vehicle" value={transportation.vehicle} />
            ) : null}
            {transportation.license_plate ? (
              <KeyValue
                label="License plate"
                value={transportation.license_plate}
                tabular
              />
            ) : null}
            {transportation.color ? (
              <KeyValue label="Color" value={transportation.color} />
            ) : null}
            {transportation.parking ? (
              <KeyValue label="Parking" value={transportation.parking} />
            ) : null}
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
                    <time
                      dateTime={leg.date}
                      className="font-semibold text-text-strong"
                    >
                      {formatDate(leg.date)}
                    </time>
                  ) : null}
                  {leg.date && leg.time ? (
                    <span className="text-text-subtle"> · </span>
                  ) : null}
                  {leg.time ? (
                    <span className="tabular-nums">{leg.time}</span>
                  ) : null}
                </p>
                {leg.assigned_names.length > 0 ? (
                  <p className="text-sm text-text-subtle">
                    With:{" "}
                    {leg.assigned_names.map((name, i) => (
                      <span key={`${name}-${i}`}>
                        {i > 0 ? ", " : ""}
                        <span className="text-text">{name}</span>
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {transportation.notes ? (
          <p className="border-t border-border pt-4 text-sm text-text-subtle">
            {transportation.notes}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
