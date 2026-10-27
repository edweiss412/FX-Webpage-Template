import type { SectionId } from "@/lib/crew/resolveActiveSection";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Per-section search index builders (spec §2.4).
 *
 * A builder runs on the server inside `CrewShell` and returns, in render
 * order, one `SearchEntry` per line its section renders for this viewer
 * (INV-1, spec §2.3). It takes the same values `CrewShell` gives the section
 * component, under the same names: `data`, `viewer` and `today` (the
 * request-scoped `await nowDate()` `Date`, so clock-dependent lines match the
 * render), plus what the shell computes once: `budgetVisible`
 * (`financialsVisible(...)`) and `staticPreview`.
 *
 * Every builder is a stub returning `[]` until its section task replaces it.
 * Builders import only from modules without `"use client"`: a value imported
 * from a client module is a client reference on the server, not the value.
 */
export type SectionBuildInput = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  budgetVisible: boolean;
  staticPreview: boolean;
};

export type SectionBuilder = (input: SectionBuildInput) => SearchEntry[];

const notYetBuilt: SectionBuilder = () => [];

export const SECTION_BUILDERS: Record<SectionId, SectionBuilder> = {
  today: notYetBuilt,
  schedule: notYetBuilt,
  venue: notYetBuilt,
  travel: notYetBuilt,
  crew: notYetBuilt,
  gear: notYetBuilt,
  budget: notYetBuilt,
};
