/**
 * components/tiles/LodgingTile.tsx — hotel reservation tile (M4 Task 4.4
 * line 290-302; spec §8.1 + §8.3).
 *
 * Reads `props.hotelReservations` straight off `getShowForViewer.ts:103`.
 * That helper already filters reservations by viewer name for crew /
 * admin_preview viewers (lib/data/getShowForViewer.ts:217-224); admin
 * viewers see all. The tile does NOT re-filter — it renders whatever
 * the projection hands it.
 *
 * Empty-state behavior (spec §8.3, AGENTS.md §1.5):
 *   - hotelReservations.length === 0 → return null (whole-tile-missing
 *     reflow). Crew not on any reservation should not see a "no
 *     hotels" placeholder; the tile simply doesn't exist.
 *   - any individual field on a reservation that is null/undefined →
 *     omit that field. The hotel name field (the heading) IS the tile;
 *     if it's missing on every reservation we still render the tile
 *     with the EmptyState placeholder via KeyValue, since we already
 *     know the viewer IS on a reservation (the row exists).
 *
 * Multi-reservation behavior: a viewer can be named on more than one
 * reservation across the run (cardinality cap §10 = 4 per show). The
 * tile renders each reservation as a stacked block separated by a
 * hairline divider. The row order matches `ordinal` from the parser
 * (already sorted ascending by `getShowForViewer.ts:203`).
 *
 * Date rendering: ISO `YYYY-MM-DD` strings render as <time
 * dateTime="…">Mon D</time>. Tabular figures default-on for dates
 * via the global <time> rule in app/globals.css (search for "tabular").
 *
 * Server Component (no `'use client'`).
 */
import type { HotelReservationRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";

type LodgingTileProps = {
  hotelReservations: HotelReservationRow[];
};

/** Render an ISO date as "Mon D" — e.g. "Apr 19". Defensive on bad input. */
function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function LodgingTile({ hotelReservations }: LodgingTileProps) {
  // Whole-tile-missing per §8.3: return null. Grid reflows.
  if (!hotelReservations || hotelReservations.length === 0) {
    return null;
  }

  return (
    <Section
      testId="lodging-tile"
      heading="Lodging"
      headingTone="eyebrow"
      ariaLabel="Lodging"
      bodyAs="div"
    >
      <div className="flex flex-1 flex-col gap-4">
        {hotelReservations.map((res, idx) => (
          <div
            key={`${res.ordinal}-${idx}`}
            className={[
              "flex flex-col gap-3",
              // Hairline between stacked reservations (DESIGN.md §1 —
              // quiet rules, not heavy). First entry has no divider.
              idx > 0 ? "border-t border-border pt-4" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/*
              Hotel name reads as the prominent line of the block. We
              put it in <p> rather than another <h2> so the tile keeps
              one heading and the multi-reservation case doesn't create
              a heading-stack inside a single <article>.
            */}
            {res.hotel_name ? (
              <p
                data-testid="lodging-hotel-name"
                className="text-base font-semibold leading-tight text-text-strong"
              >
                {res.hotel_name}
              </p>
            ) : null}

            {res.hotel_address ? (
              <p className="text-sm text-text-subtle">{res.hotel_address}</p>
            ) : null}

            <dl className="flex flex-col gap-3">
              {/*
                Check-in / Check-out as a horizontal pair on tile-wide
                layouts. We give them their own row of two KeyValues
                rather than a single "Apr 19 – Apr 23" line because each
                date carries semantic <time> for screen readers and
                date-pickers/share-targets in mobile browsers.
              */}
              <div className="grid grid-cols-2 gap-3">
                <KeyValue
                  label="Check in"
                  value={
                    res.check_in ? (
                      <time dateTime={res.check_in}>
                        {formatShortDate(res.check_in)}
                      </time>
                    ) : null
                  }
                />
                <KeyValue
                  label="Check out"
                  value={
                    res.check_out ? (
                      <time dateTime={res.check_out}>
                        {formatShortDate(res.check_out)}
                      </time>
                    ) : null
                  }
                />
              </div>

              {/*
                Confirmation number — optional. The parser pulls this
                from the names column when a "- #1234" suffix is
                present; the projection passes it through. Tabular
                figures applied so digit columns line up.
              */}
              {res.confirmation_no ? (
                <KeyValue
                  label="Confirmation"
                  value={res.confirmation_no}
                  tabular
                />
              ) : null}

              {/*
                Notes — optional, free text. Rendered without tabular
                figures since notes are prose.
              */}
              {res.notes ? <KeyValue label="Notes" value={res.notes} /> : null}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
