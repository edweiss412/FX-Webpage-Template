/**
 * components/show-panels/VenueBody.tsx
 *
 * The Venue section body both surfaces render (crew page redesign spec §6.2,
 * `venue` row): the Where core of the admin's `VenueBreakdown`, a "Venue"
 * eyebrow over the venue name, the address and the city lines, a map slot
 * beside them, and the loading-dock band under them.
 *
 * - Admin: every line as parsed (`sentinels: "show"`), the dock band, and the
 *   map region with `VenueMapTile` in the slot; the body fills the admin panel
 *   card edge to edge (`bleed`). No search markers.
 * - Crew: the name, the street and the city the crew page resolves
 *   (`venueWhereProps`, components/crew/sections/venueRows.ts), sentinels
 *   hidden, a search target per line, and the "Open in Maps" link in the slot
 *   only when the URL parses. No dock band: the crew's dock stays in its own
 *   Facilities card (spec §6.2). The body sits inside the crew panel card under
 *   its header (`bleed` false), since that card's header shares its box.
 *
 * Crew presentation (PR B invariant-8 UI gate rows 3 and 7), each a prop whose
 * default is the admin's markup: `layout: "container"` puts the map slot beside
 * the text at the crew section container's `@min-crew-split` (DESIGN.md §6),
 * never at a viewport width, and `addressTone: "text"` sets the address lines
 * in body text, the 7:1 the crew's sunlight floor asks of actionable copy.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment). Its
 * unprefixed test ids (`venue-body`, `venue-text-col`, `venue-dock`) are the
 * admin's and stay unprefixed on both surfaces, so it takes no `testIdPrefix`.
 */
import type { ReactNode } from "react";
import { Truck } from "lucide-react";

import { CELL_EYEBROW_CLASS } from "@/components/show-panels/FieldRowList";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/** A search target id per line (lib/search/entryId.ts); a line without one carries no marker. */
export type VenueBodyTargets = { name?: string; address?: string; city?: string };

export type VenueBodyProps = {
  /** The venue name, already resolved by the caller; null or "" renders no line. */
  name: string | null;
  /** The address line (the admin's as parsed, the crew's street only). */
  address: string | null;
  /** The city line. */
  city: string | null;
  /** The loading-dock band's text; null renders no band. */
  dock: string | null;
  /** Beside the text column: the admin's map region, the crew's Maps link, or nothing. */
  map: ReactNode;
  /** "show": a sentinel renders as given (admin). "hide": its line is omitted (crew). */
  sentinels: "show" | "hide";
  /**
   * true: the body cancels its card's padding and its regions reach the card's
   * edges (the admin card, whose box holds the body alone). false: it sits
   * inside the card's padding, under the card's header (the crew panel card).
   */
  bleed: boolean;
  /**
   * "viewport" (the default, admin): the map region joins the text's row from the
   * `sm` window width. "container" (crew): from the crew section container's
   * `@min-crew-split` (DESIGN.md §6).
   */
  layout?: "viewport" | "container";
  /** "subtle" (the default, admin): the address lines muted. "text" (crew): body text. */
  addressTone?: "subtle" | "text";
  /**
   * Print the "Venue" label over the name. true (the default, admin). false on the crew
   * page, where the section's heading already says it (crew panel follow-ups spec §4).
   */
  nameLabel?: boolean;
  /** Search targets (crew). Given, the eyebrow, which repeats the card's title, is skipped. */
  targets?: VenueBodyTargets;
};

/** A line to render, or null: empty, or a sentinel the surface hides. */
function shown(value: string | null, sentinels: "show" | "hide"): string | null {
  if (value === null || value.length === 0) return null;
  return sentinels === "hide" && shouldHideGenericOptional(value) ? null : value;
}

export function VenueBody({
  name,
  address,
  city,
  dock,
  map,
  sentinels,
  bleed,
  layout = "viewport",
  addressTone = "subtle",
  nameLabel = true,
  targets,
}: VenueBodyProps) {
  const nameLine = shown(name, sentinels);
  const addressLine = shown(address, sentinels);
  const cityLine = shown(city, sentinels);
  const dockLine = shown(dock, sentinels);

  return (
    // Bleed: cancel the panel p-tile-pad and clip to its radius so the map
    // divider + dock band reach the card edges (one card, no nesting).
    <div
      data-testid="venue-body"
      className={bleed ? "-m-tile-pad overflow-hidden rounded-md" : undefined}
    >
      {/* Region A: two-column (stacks below sm, or below the crew threshold) */}
      <div
        className={
          layout === "container"
            ? "flex flex-col @min-crew-split:flex-row @min-crew-split:items-stretch"
            : "flex flex-col sm:flex-row sm:items-stretch"
        }
      >
        <div
          data-testid="venue-text-col"
          className={
            bleed
              ? "flex min-w-0 flex-1 flex-col gap-1 p-tile-pad"
              : "flex min-w-0 flex-1 flex-col gap-1"
          }
        >
          {nameLabel ? (
            <span
              className={CELL_EYEBROW_CLASS}
              {...(targets === undefined ? {} : { "data-search-skip": "" })}
            >
              Venue
            </span>
          ) : null}
          {nameLine ? (
            <span
              data-search-target={targets?.name}
              className="text-lg leading-tight font-bold wrap-break-word text-text-strong"
            >
              {nameLine}
            </span>
          ) : null}
          {addressLine || cityLine ? (
            <span
              className={
                addressTone === "text"
                  ? "mt-1 text-sm/snug text-text"
                  : "mt-1 text-sm/snug text-text-subtle"
              }
            >
              {addressLine ? (
                <span data-search-target={targets?.address} className="block wrap-break-word">
                  {addressLine}
                </span>
              ) : null}
              {cityLine ? (
                <span data-search-target={targets?.city} className="block wrap-break-word">
                  {cityLine}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {map}
      </div>
      {/* Region B: loading-dock footer — only when present */}
      {dockLine ? (
        <div
          data-testid="venue-dock"
          className="flex items-start gap-2.5 border-t border-border bg-surface-sunken p-tile-pad"
        >
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-sm border border-border bg-surface text-accent-on-bg"
          >
            <Truck className="size-3.5" />
          </span>
          <div className="min-w-0">
            <span className={CELL_EYEBROW_CLASS}>Loading dock</span>
            <p className="mt-0.5 text-sm/snug wrap-break-word text-text">{dockLine}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
