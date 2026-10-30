/**
 * The asset list a crew `save` marker carries (spec 4.8): every stage diagram
 * URL the crew Gallery and its lightbox can request, and every agenda URL, built
 * on the server from the show data rather than scraped from HTML, so a diagram
 * past "Show all" and an agenda nobody opened are saved too.
 *
 * Built from what the components themselves use: the gallery items come from
 * `diagramGalleryItems` (the helper `DiagramsTile` renders from, which applies
 * the asset-key derivation and the MIME allowlist), and each URL from
 * `makeDiagramLoader`, the Gallery's next/image loader. The agenda URL is the
 * shape `AgendaEmbed` opens. tests/lib/offline/assetList.test.ts renders both
 * components, and ScheduleSection, and compares.
 *
 * Only what this viewer's own page renders is listed: ScheduleSection withholds
 * every agenda from a viewer whose days are unconfirmed, so the list does too,
 * decided by the same viewer resolution and the same predicate.
 *
 * Every URL is a same-origin `/api/asset/` path, which the marker reader
 * requires (lib/offline/marker.ts).
 */
import { imageConfigDefault, type ImageConfigComplete } from "next/dist/shared/lib/image-config";

import { diagramGalleryItems } from "@/components/crew/diagramItems";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { makeDiagramLoader } from "@/lib/images/diagramLoader";

type ImageSizes = Pick<ImageConfigComplete, "deviceSizes" | "imageSizes">;

/**
 * Every width next/image can put in a srcset: the configured device and image
 * sizes. Read as next/image reads them: a Next build defines
 * `process.env.__NEXT_IMAGE_OPTS` from next.config in every bundle, and outside
 * one (Vitest) next/image falls back to Next's defaults, as this does.
 */
function srcsetWidths(): number[] {
  const configured = process.env.__NEXT_IMAGE_OPTS as unknown as ImageSizes | undefined;
  const { deviceSizes, imageSizes } = configured ?? imageConfigDefault;
  return [...deviceSizes, ...imageSizes];
}

/**
 * Throws what `resolveViewerContext` throws for a viewer the data cannot place
 * (CrewShell turns those into failure pages before the slot renders), and
 * whatever malformed show data makes it throw. The slot catches.
 */
export function savedCopyAssetUrls(showId: string, data: ShowForViewer, viewer: Viewer): string[] {
  const urls = new Set<string>();

  const diagrams = data.diagrams;
  if (diagrams !== null) {
    const widths = srcsetWidths();
    for (const item of diagramGalleryItems(diagrams).items) {
      if (!item.available) continue;
      const args = {
        showId,
        rev: diagrams.snapshot_revision_id,
        key: item.key,
        variants: item.variants,
      };
      // The original, which the lightbox pins once a slide shows zoom intent.
      urls.add(makeDiagramLoader({ ...args, pinOriginal: true })({ src: item.key, width: 0 }));
      // The tier the loader picks at each width a thumbnail or a slide can ask for.
      const loader = makeDiagramLoader(args);
      for (const width of widths) urls.add(loader({ src: item.key, width }));
    }
  }

  // ScheduleSection's privacy branch: no agenda at all for a viewer whose days
  // are withheld (components/crew/sections/ScheduleSection.tsx).
  const { dateRestriction } = resolveViewerContext(viewer, data);
  if (!suppressesDates(dateRestriction)) {
    for (const link of data.show.agenda_links) {
      // AgendaEmbed offers only the entries with a fileId; an empty one is none.
      if (link.fileId) urls.add(`/api/asset/agenda/${showId}/${link.fileId}`);
    }
  }

  return [...urls];
}
