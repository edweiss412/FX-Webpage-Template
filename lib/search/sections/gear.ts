import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";

import type { SectionBuildInput } from "./index";

/**
 * Gear search entries: none. Its cards left for Event details, Pack list and Rooms (PR
 * C Tasks 5 to 7), so the section is an empty state until it retires in Task 8.
 * `resolveViewerContext` stays, so a malformed projection throws here as it does in
 * the component.
 */
export function buildGearEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  resolveViewerContext(viewer, data);
  return [];
}
