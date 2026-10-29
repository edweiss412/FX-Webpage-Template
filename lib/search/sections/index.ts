import type { SectionId } from "@/lib/crew/resolveActiveSection";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { SearchEntry } from "@/lib/search/types";

import { buildBudgetEntries } from "./budget";
import { buildCrewEntries } from "./crew";
import { buildGearEntries } from "./gear";
import { buildScheduleEntries } from "./schedule";
import { buildTodayEntries } from "./today";
import { buildTravelEntries } from "./travel";
import { buildVenueEntries } from "./venue";

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
 * Each section task replaced its stub with the section's own builder.
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

export const SECTION_BUILDERS: Record<SectionId, SectionBuilder> = {
  today: buildTodayEntries,
  schedule: buildScheduleEntries,
  venue: buildVenueEntries,
  travel: buildTravelEntries,
  crew: buildCrewEntries,
  gear: buildGearEntries,
  budget: buildBudgetEntries,
};
