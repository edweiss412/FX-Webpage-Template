/**
 * components/crew/diagramItems.ts — the Diagrams block's gallery items, shared
 * by `DiagramsTile` (DiagramsBlock.tsx) and the search index builder
 * (lib/search/sections/venue.ts), so the page and the index read the same items
 * (spec §2.4, §2.5).
 *
 * AC-7.2b — embedded-first ordering: this is the ONLY layer that decides
 * ordering. Both the Gallery and the Lightbox are pure renderers and relay the
 * order verbatim. Embedded entries from `diagrams.embeddedImages` come first;
 * linked-folder entries from `diagrams.linkedFolderItems` follow.
 *
 * AC-7.7 — placeholder slot for null snapshotPath: a Persisted entry may have
 * `snapshotPath = null` when a 4xx or drift case left the Apply unable to
 * download. The item maps that to `available: false` so the Gallery renders a
 * placeholder slot (NOT a hidden slot) in that grid position.
 *
 * Search: the card title and every thumbnail the gallery renders with a REAL
 * name are lines; a thumbnail named by the "Diagram N" fallback, or past the
 * gallery's first `INITIAL_VISIBLE`, is not (spec §2.5, §12 L10). Ids are
 * computed here once, title first, then thumbnails in gallery order.
 *
 * Non-client module: the builder runs on the server and imports it. Only a
 * TYPE comes from the client Gallery module, and types are erased.
 */
import type { GalleryItem } from "@/components/diagrams/Gallery";
import { INITIAL_VISIBLE } from "@/components/diagrams/galleryLimits";
import { diagramAssetKeyFromPath, isAllowedDiagramMime } from "@/lib/data/diagrams";
import type {
  PersistedDiagrams,
  PersistedEmbeddedImage,
  PersistedLinkedFolderItem,
} from "@/lib/parser/types";
import { entryId } from "@/lib/search/entryId";

/** The Diagrams card's heading, which is also the search `group` of its lines. */
export const DIAGRAMS_HEADING = "Diagrams";

/** The Diagrams block's `data-card-id` in VenueSection: the search region. */
export const DIAGRAMS_CARD_ID = "venue-diagrams";

/**
 * The §4 manifest fields, carried through to the Gallery item verbatim.
 *
 * `variants` is normalised to an array here (never undefined) because the loader
 * treats it as one; the other three are OMITTED when absent, matching the
 * manifest's own serialization rule — a null would read as "generated, empty".
 */
function variantFields(
  entry: PersistedEmbeddedImage | PersistedLinkedFolderItem,
): Pick<GalleryItem, "variants" | "blurDataURL" | "intrinsicWidth" | "intrinsicHeight"> {
  return {
    variants: entry.variants ?? [],
    ...(entry.blurDataURL !== undefined ? { blurDataURL: entry.blurDataURL } : {}),
    ...(entry.intrinsicWidth !== undefined ? { intrinsicWidth: entry.intrinsicWidth } : {}),
    ...(entry.intrinsicHeight !== undefined ? { intrinsicHeight: entry.intrinsicHeight } : {}),
  };
}

/** The diagram's own name, or null when the sheet gave it none (the gallery then invents one). */
export function diagramRealName(
  entry: PersistedEmbeddedImage | PersistedLinkedFolderItem,
): string | null {
  return entry.alt && entry.alt.length > 0 ? entry.alt : null;
}

function embeddedItem(entry: PersistedEmbeddedImage, ordinal: number): GalleryItem {
  return {
    // Stable, list-unique React/failed-tracking identity — source-prefixed so
    // it can never collide with a linked entry, and content-derived (not
    // ordinal) so it survives reorder/insert. DISTINCT from `key`: two entries
    // can share an asset `key`, so `id` must NOT reuse it.
    id: `embedded:${entry.objectId}`,
    // Asset-key derivation shared with the admin published-review diagrams
    // sub-block via lib/data/diagrams.ts (single source of truth). Last path
    // segment of snapshotPath byte-matches the diagram route's findAsset();
    // null paths fall back to the parser-side id (a 410-regardless entry).
    key: diagramAssetKeyFromPath(entry.snapshotPath, entry.objectId),
    alt: diagramRealName(entry) ?? `Diagram ${ordinal}`,
    // Codex R13 P1: availability MUST gate on the same MIME allowlist
    // the asset route uses. Without this, a persisted `image/svg+xml`
    // entry with a non-null snapshotPath would render as `<img>` here
    // but always 410 at the proxy → broken image with no admin signal.
    available: entry.snapshotPath !== null && isAllowedDiagramMime(entry.mimeType),
    ...variantFields(entry),
  };
}

function linkedItem(entry: PersistedLinkedFolderItem, ordinal: number): GalleryItem {
  return {
    // See embeddedItem: source-prefixed so linked/embedded ids never collide.
    id: `linked:${entry.driveFileId}`,
    key: diagramAssetKeyFromPath(entry.snapshotPath, entry.driveFileId),
    alt: diagramRealName(entry) ?? `Diagram ${ordinal}`,
    // Codex R13 P1: see embeddedItem above. Same MIME allowlist gates
    // availability so a linked-folder SVG entry never renders as a
    // broken proxy URL on the crew page.
    available: entry.snapshotPath !== null && isAllowedDiagramMime(entry.mimeType),
    ...variantFields(entry),
  };
}

/** One search line of the Diagrams block. */
export type DiagramSearchLine = { id: string; value: string };

export type DiagramGallery = {
  /** Gallery items, embedded first. */
  items: GalleryItem[];
  /** The card title's line. */
  heading: DiagramSearchLine;
  /** Thumbnail lines in gallery order, each keyed by its item's `id`. */
  thumbnails: (DiagramSearchLine & { itemId: string })[];
  /** `item.id` → search target id, for the Gallery's `searchTargets` prop. */
  searchTargets: Record<string, string>;
};

export function diagramGalleryItems(diagrams: PersistedDiagrams | null): DiagramGallery {
  const embedded = diagrams?.embeddedImages ?? [];
  const linked = diagrams?.linkedFolderItems ?? [];
  const sources = [
    ...embedded.map((entry, i) => ({
      item: embeddedItem(entry, i + 1),
      name: diagramRealName(entry),
    })),
    ...linked.map((entry, i) => ({
      item: linkedItem(entry, embedded.length + i + 1),
      name: diagramRealName(entry),
    })),
  ];

  const seen = new Map<string, number>();
  const line = (value: string) =>
    entryId("venue", DIAGRAMS_CARD_ID, DIAGRAMS_HEADING, null, value, seen);
  const heading = { id: line(DIAGRAMS_HEADING), value: DIAGRAMS_HEADING };
  // The gallery renders the first INITIAL_VISIBLE items, unavailable ones
  // included, until "Show all"; only those with a real name are lines.
  const thumbnails = sources
    .slice(0, INITIAL_VISIBLE)
    .flatMap(({ item, name }) =>
      name !== null && name.trim().length > 0
        ? [{ id: line(name), value: name, itemId: item.id }]
        : [],
    );
  return {
    items: sources.map(({ item }) => item),
    heading,
    thumbnails,
    searchTargets: Object.fromEntries(thumbnails.map((t) => [t.itemId, t.id])),
  };
}
