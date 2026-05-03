/**
 * components/tiles/VenueTile.tsx — venue tile (M4 Task 4.4 line 290-302;
 * spec §8.1 + §8.3).
 *
 * Reads `props.venue` straight off `getShowForViewer.ts:166` (which
 * mirrors `ShowRow.venue` from `lib/parser/types.ts:85-91`).
 *
 * Empty-state behavior (spec §8.3):
 *   - Every show has a venue conceptually, even if the data is incomplete.
 *     The tile ALWAYS renders (no whole-tile-missing branch). When
 *     `venue` is null OR `venue.name` is missing → the heading falls
 *     back to "Venue" and the body renders the canonical "Doug hasn't
 *     filled this in yet" placeholder via the EmptyState atom (required
 *     -field branch).
 *   - Optional fields (loadingDock, googleLink, notes) → omit when
 *     missing. Tile sized to actual content.
 *
 * Heading tone: when the venue name IS present, the heading reads
 * `headingTone="prominent"` — the venue name itself is the primary
 * value of the tile. When the name is missing, falls back to the
 * default eyebrow tone with the literal "Venue" so the placeholder
 * read works.
 *
 * Server Component (no `'use client'`).
 */
import type { ShowRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";

type VenueTileProps = {
  venue: ShowRow["venue"];
};

export function VenueTile({ venue }: VenueTileProps) {
  // Required-field-missing branch per §8.3: the venue tile always
  // renders (every show has a venue conceptually) but the body is the
  // canonical placeholder when the structural name is missing. Use the
  // eyebrow heading tone with the literal "Venue" so the placeholder
  // reads cleanly.
  if (!venue || !venue.name || venue.name.trim() === "") {
    return (
      <Section
        testId="venue-tile"
        heading="Venue"
        headingTone="eyebrow"
        ariaLabel="Venue"
        bodyAs="div"
      >
        <EmptyState variant="required-field" />
      </Section>
    );
  }

  // Address sits as the subheading under the name (DESIGN.md §3 cascade —
  // primary value, then quieter secondary). When address is missing, we
  // emit the empty-state placeholder via KeyValue inside the body so
  // the tile stays scannable.
  const subheading = venue.address ? (
    <p className="font-medium text-text">{venue.address}</p>
  ) : null;

  return (
    <Section
      testId="venue-tile"
      heading={venue.name}
      headingTone="prominent"
      ariaLabel="Venue"
      subheading={subheading}
      bodyAs="dl"
    >
      {/*
        Address gets a KeyValue row only when it's missing — required
        per the parser's contract (`ShowRow.venue.address: string`)
        but defensible if the upstream data is incomplete. When
        present, address renders in the subheading slot above instead.
      */}
      {!venue.address ? (
        <KeyValue label="Address" value={null} />
      ) : null}

      {venue.loadingDock ? (
        <KeyValue label="Loading dock" value={venue.loadingDock} />
      ) : null}

      {venue.googleLink ? (
        <KeyValue
          label="Map"
          value={
            <a
              href={venue.googleLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-(--spacing-tap-min) items-center -mx-1 px-1 py-1.5 text-text underline-offset-4 transition-colors duration-(--duration-fast) hover:text-accent-on-bg hover:underline"
            >
              Open in Maps
            </a>
          }
        />
      ) : null}

      {venue.notes ? <KeyValue label="Notes" value={venue.notes} /> : null}
    </Section>
  );
}
