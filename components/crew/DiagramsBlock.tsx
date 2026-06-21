/**
 * components/crew/DiagramsBlock.tsx — crew-redesign relocation of the former
 * components/tiles/DiagramsTile.tsx (M7 Task 7.9 / AC-7.1 / AC-7.2 / AC-7.2b /
 * AC-7.4 / AC-7.7).
 *
 * Pure presentational crew block that surfaces a show's diagrams (embedded
 * images on the DIAGRAMS tab + linked-folder items) AND its agenda PDF, behind
 * one frame. The actual swipeable lightbox lives in
 * `components/diagrams/Gallery.tsx`; the inline PDF.js viewer lives in
 * `components/agenda/AgendaEmbed.tsx`.
 *
 * The export name is kept as `DiagramsTile` so VenueSection's direct-invocation
 * call site (`DiagramsTile({ ... })` inside a WrappedSection render seam)
 * remains byte-identical — only the import path moved from
 * `@/components/tiles/DiagramsTile` to `@/components/crew/DiagramsBlock`.
 *
 * AC-7.2b — embedded-first ordering: this block is the ONLY layer that decides
 * ordering. Both the Gallery and the Lightbox are pure renderers and relay the
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
 * diagram entries AND no agenda link carries a fileId.
 *
 * Server Component (no `'use client'`).
 */
import { Section } from "@/components/atoms/Section";
import { MapIcon } from "@/components/crew/icons/sectionIcons";
import { Gallery, type GalleryItem } from "@/components/diagrams/Gallery";
import { AgendaEmbed, type AgendaLink } from "@/components/agenda/AgendaEmbed";
import { isAllowedDiagramMime } from "@/lib/data/diagrams";
import { shouldHideDiagrams } from "@/lib/visibility/emptyState";
import type {
  PersistedDiagrams,
  PersistedEmbeddedImage,
  PersistedLinkedFolderItem,
} from "@/lib/parser/types";

type DiagramsTileProps = {
  showId: string;
  diagrams: PersistedDiagrams | null;
  agendaLinks: AgendaLink[];
};

function keyFromPath(snapshotPath: string | null, fallback: string): string {
  // The persisted shape is `diagram-snapshots/shows/<id>/<rev>/<key>`.
  // Take the last path segment so the Gallery emits a URL whose
  // <key> segment is byte-identical to what the diagram route's
  // findAsset() compares against. For null paths we still need a
  // stable key for React's reconciler; use the parser-side id.
  if (!snapshotPath) return fallback;
  const idx = snapshotPath.lastIndexOf("/");
  return idx >= 0 ? snapshotPath.slice(idx + 1) : snapshotPath;
}

function embeddedItem(entry: PersistedEmbeddedImage, ordinal: number): GalleryItem {
  return {
    key: keyFromPath(entry.snapshotPath, entry.objectId),
    alt: entry.alt && entry.alt.length > 0 ? entry.alt : `Diagram ${ordinal}`,
    // Codex R13 P1: availability MUST gate on the same MIME allowlist
    // the asset route uses. Without this, a persisted `image/svg+xml`
    // entry with a non-null snapshotPath would render as `<img>` here
    // but always 410 at the proxy → broken image with no admin signal.
    available: entry.snapshotPath !== null && isAllowedDiagramMime(entry.mimeType),
  };
}

function linkedItem(entry: PersistedLinkedFolderItem, ordinal: number): GalleryItem {
  return {
    key: keyFromPath(entry.snapshotPath, entry.driveFileId),
    alt: entry.alt && entry.alt.length > 0 ? entry.alt : `Diagram ${ordinal}`,
    // Codex R13 P1: see embeddedItem above. Same MIME allowlist gates
    // availability so a linked-folder SVG entry never renders as a
    // broken proxy URL on the crew page.
    available: entry.snapshotPath !== null && isAllowedDiagramMime(entry.mimeType),
  };
}

export function DiagramsTile({ showId, diagrams, agendaLinks }: DiagramsTileProps) {
  const embedded = diagrams?.embeddedImages ?? [];
  const linked = diagrams?.linkedFolderItems ?? [];
  const items: GalleryItem[] = [
    ...embedded.map((entry, i) => embeddedItem(entry, i + 1)),
    ...linked.map((entry, i) => linkedItem(entry, embedded.length + i + 1)),
  ];

  // Whole-block-missing per §8.3 — both media domains empty. Predicate
  // (M9 C6 / M7-D5) lives in lib/visibility/emptyState.ts so the
  // "is there anything to show" decision routes through the same
  // visibility module as the sentinel-hiding helpers.
  if (shouldHideDiagrams(diagrams, agendaLinks)) return null;
  const hasAgendaPdf = agendaLinks.some((link) => Boolean(link.fileId));
  const hasItems = items.length > 0;

  // Heading mirrors content state: diagrams + agenda together get the
  // combined label; either alone gets the single-domain label so the
  // block name doesn't lie about its contents.
  const heading = hasItems && hasAgendaPdf ? "Diagrams & agenda" : hasItems ? "Diagrams" : "Agenda";

  return (
    <Section
      testId="diagrams-tile"
      heading={heading}
      headingTone="eyebrow"
      variant="primary"
      ariaLabel={heading}
      bodyAs="div"
      // Mock `.card-head .ico` parity: the "Site diagrams" card carries the
      // mock's `map` glyph in the SAME sunken-square treatment SectionCard uses
      // (this section uses the Section primitive, not SectionCard, so the chip
      // is supplied via headingIcon rather than the icon prop).
      headingIcon={
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-subtle [&_svg]:size-[15px]"
        >
          <MapIcon />
        </span>
      }
    >
      {hasItems && diagrams ? (
        <Gallery showId={showId} snapshotRevisionId={diagrams.snapshot_revision_id} items={items} />
      ) : null}
      {hasItems && hasAgendaPdf ? (
        <div className="mt-3 border-t border-border pt-3">
          <AgendaEmbed showId={showId} agendaLinks={agendaLinks} />
        </div>
      ) : hasAgendaPdf ? (
        <AgendaEmbed showId={showId} agendaLinks={agendaLinks} />
      ) : null}
    </Section>
  );
}
