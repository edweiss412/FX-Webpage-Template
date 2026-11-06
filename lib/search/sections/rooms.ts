import { DIAGRAMS_HEADING, diagramGalleryItems } from "@/components/crew/diagramItems";
import { roomsPanel } from "@/components/crew/sections/roomsRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { shouldHideDiagrams } from "@/lib/visibility/emptyState";

import type { SectionBuildInput } from "./index";

/**
 * Rooms search entries (spec §2.4, §4; crew page redesign PR C Task 7): the lines
 * `RoomsSection` renders, in render order. First the panel's, from `roomsPanel`
 * (roomsRows.ts), the model the section renders the shared body from, so each entry's
 * id is the `data-search-target` on its line: per room its name, its header fields,
 * its disciplines. Then the Diagrams card title and every thumbnail the gallery renders
 * under a real name.
 *
 * The two blocks are two `WrappedSection`s (`crew:gear:scope`, `crew:venue:diagrams`):
 * when a block's derivation throws, the page renders its fallback and no lines, so the
 * builder drops that block's entries and keeps the other's. `resolveViewerContext` sits
 * outside both in the component and here, so a malformed projection throws in both
 * places.
 */
export function buildRoomsEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  const ctx = resolveViewerContext(viewer, data);
  const entries: SearchEntry[] = [];
  const diagramLine = (id: string, value: string): SearchEntry => ({
    id,
    section: "rooms",
    group: DIAGRAMS_HEADING,
    label: null,
    value,
    context: [],
    copy: null,
  });

  try {
    entries.push(...roomsPanel(data.rooms, ctx.viewerFlags).entries);
  } catch {
    // The rooms' WrappedSection renders a fallback with no lines.
  }

  if (!shouldHideDiagrams(data.diagrams)) {
    try {
      const gallery = diagramGalleryItems(data.diagrams);
      entries.push(diagramLine(gallery.heading.id, gallery.heading.value));
      for (const t of gallery.thumbnails) entries.push(diagramLine(t.id, t.value));
    } catch {
      // The diagrams' WrappedSection renders a fallback with no lines.
    }
  }
  return entries;
}
