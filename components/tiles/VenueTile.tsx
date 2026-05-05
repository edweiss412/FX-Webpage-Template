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
 *     back to "Venue" and the body renders the crew-facing EmptyState
 *     ("Venue details haven't been added yet.") per Task 4.14 (required
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
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type VenueTileProps = {
  venue: ShowRow["venue"];
};

/**
 * URL-validity guard for the googleLink anchor (Codex round-16).
 * Returns true only when the value parses as an `http(s):` URL —
 * any other shape (sentinels like "TBD", bare paths, JS code) is
 * rejected so the anchor doesn't become a dead/misleading
 * navigation control. Mirrors the dead-tel:-link guard in
 * TransportTile (round-15) and CrewTile/ContactsTile (round-16).
 */
function isParseableUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
        variant="reference"
        ariaLabel="Venue"
        bodyAs="div"
      >
        <EmptyState label="Venue details haven't been added yet." />
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
      variant="reference"
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

      {/*
        §8.3 generic-optional (Codex round-16): loadingDock is a
        generic optional text field. Sentinels reflow out via the
        central predicate.
      */}
      {!shouldHideGenericOptional(venue.loadingDock ?? null) ? (
        <KeyValue label="Loading dock" value={venue.loadingDock} />
      ) : null}

      {/*
        §8.3 generic-optional + URL-validity (Codex round-16):
        googleLink renders as an <a href>, so a sentinel like "TBD"
        would otherwise become `href="TBD"` — a dead/misleading
        navigation control with the same shape as the round-15
        driver_phone tel: bug. Hide via the central predicate AND
        require a parseable URL before rendering the anchor (a
        non-URL string also doesn't belong here regardless of
        sentinel status).
      */}
      {!shouldHideGenericOptional(venue.googleLink ?? null) &&
      isParseableUrl(venue.googleLink) ? (
        <KeyValue
          label="Map"
          value={
            <a
              href={venue.googleLink ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-tap-min items-center -mx-1 px-1 py-1.5 text-text underline-offset-4 transition-colors duration-fast hover:text-accent-on-bg hover:underline"
            >
              Open in Maps
            </a>
          }
        />
      ) : null}

      {/*
        §8.3 generic-optional (Codex round-10): sentinels
        (`'TBD'`/`'N/A'`/`'TBA'`) are hidden via the central predicate
        so the row reflows out for meaningless values.
      */}
      {!shouldHideGenericOptional(venue.notes ?? null) ? (
        <KeyValue label="Notes" value={venue.notes ?? null} />
      ) : null}
    </Section>
  );
}
