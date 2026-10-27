/**
 * components/crew/DiagramsBlock.tsx — crew-redesign relocation of the former
 * components/tiles/DiagramsTile.tsx (M7 Task 7.9 / AC-7.1 / AC-7.2 / AC-7.2b /
 * AC-7.4 / AC-7.7).
 *
 * Pure presentational crew block that surfaces a show's diagrams (embedded
 * images on the DIAGRAMS tab + linked-folder items) behind one frame. The
 * actual swipeable lightbox lives in `components/diagrams/Gallery.tsx`.
 *
 * The agenda PDF relocated to the Schedule section (§4.6) — it is no longer
 * part of this block, and `agenda_links` no longer factors into the
 * whole-block-missing gate (Diagrams hides on diagram content alone).
 *
 * The export name is kept as `DiagramsTile` so VenueSection's direct-invocation
 * call site (`DiagramsTile({ ... })` inside a WrappedSection render seam)
 * remains byte-identical — only the import path moved from
 * `@/components/tiles/DiagramsTile` to `@/components/crew/DiagramsBlock`.
 *
 * AC-7.2b — embedded-first ordering: this block (through diagramItems.ts, which
 * the crew search builder shares) is the ONLY layer that decides ordering. Both the Gallery and the Lightbox are pure renderers and relay the
 * order verbatim. Embedded entries from `diagrams.embeddedImages` come first;
 * linked-folder entries from `diagrams.linkedFolderItems` follow.
 *
 * AC-7.7 — placeholder slot for null snapshotPath: a Persisted entry may have
 * `snapshotPath = null` when a 4xx or drift case left the Apply unable to
 * download. The block maps that to `available: false` so the Gallery renders a
 * placeholder slot (NOT a hidden slot) in that grid position.
 *
 * Asset-key derivation: the Gallery emits asset URLs of the form
 * `/api/asset/diagram/<show>/<rev>/<key>`. The `<key>` segment is the last path
 * segment of the persisted `snapshotPath` so the URL the Gallery emits
 * literal-equality matches what `app/api/asset/diagram/.../route.ts:findAsset()`
 * compares against.
 *
 * Whole-block-missing per §8.3: returns `null` when there are no available
 * diagram entries.
 *
 * Server Component (no `'use client'`).
 */
import { Section } from "@/components/atoms/Section";
import { MapIcon } from "@/components/crew/icons/sectionIcons";
import { DIAGRAMS_HEADING, diagramGalleryItems } from "@/components/crew/diagramItems";
import { Gallery } from "@/components/diagrams/Gallery";
import { shouldHideDiagrams } from "@/lib/visibility/emptyState";
import type { PersistedDiagrams } from "@/lib/parser/types";

type DiagramsTileProps = {
  showId: string;
  diagrams: PersistedDiagrams | null;
  /** Passed through to the Gallery; see GalleryProps.sizes for why the caller owns it. */
  thumbnailSizes?: string;
};

export function DiagramsTile({ showId, diagrams, thumbnailSizes }: DiagramsTileProps) {
  // Items (embedded first, availability, fallback names) and their search
  // targets come from diagramItems.ts, which the search builder reads too.
  const gallery = diagramGalleryItems(diagrams);

  // Whole-block-missing per §8.3 — no diagram content. The agenda PDF moved
  // to the Schedule section (§4.6), so this block now hides on diagram
  // content ALONE. The predicate (M9 C6 / M7-D5) lives in
  // lib/visibility/emptyState.ts so the "is there anything to show" decision
  // routes through the same visibility module as the sentinel-hiding helpers.
  if (shouldHideDiagrams(diagrams)) return null;

  const heading = DIAGRAMS_HEADING;

  return (
    <Section
      testId="diagrams-tile"
      heading={heading}
      headingTone="eyebrow"
      variant="primary"
      ariaLabel={heading}
      bodyAs="div"
      // The card title is a search line and the group of the thumbnail lines.
      headingSearchTarget={gallery.heading.id}
      // Mock `.card-head .ico` parity: the "Site diagrams" card carries the
      // mock's `map` glyph in the SAME sunken-square treatment SectionCard uses
      // (this section uses the Section primitive, not SectionCard, so the chip
      // is supplied via headingIcon rather than the icon prop).
      headingIcon={
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-subtle [&_svg]:size-3.75"
        >
          <MapIcon />
        </span>
      }
    >
      {diagrams ? (
        <Gallery
          showId={showId}
          snapshotRevisionId={diagrams.snapshot_revision_id}
          items={gallery.items}
          searchTargets={gallery.searchTargets}
          {...(thumbnailSizes ? { sizes: thumbnailSizes } : {})}
        />
      ) : null}
    </Section>
  );
}
