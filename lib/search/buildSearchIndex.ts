import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { SECTION_BUILDERS, type SectionBuildInput } from "@/lib/search/sections";
import type { SearchIndex } from "@/lib/search/types";

/**
 * What the shell hands the index: the builders' inputs plus its member list,
 * `sections` (the ids `crewSectionsFor` lists this viewer).
 */
export type SearchIndexInput = SectionBuildInput & { sections: readonly SectionId[] };

/**
 * The crew page's search index (spec §2.4, §3): every line each section the
 * shell lists shows this viewer, Today first, then the sections in
 * `CREW_SECTION_IDS` order.
 *
 * Runs on the server inside `CrewShell`, once per render, from the inputs the
 * sections receive: `data`, `viewer`, the request-scoped `today`, and what the
 * shell computes once, `billingVisible`, `staticPreview` and the member list.
 * A section is built only when the member list holds it. Each builder's ids
 * carry its section, and each builder keeps its own ids unique, so ids are
 * unique across the index.
 *
 * Imports only modules without `"use client"` (tests/search/builderImports.test.ts).
 */
export function buildSearchIndex(input: SearchIndexInput): SearchIndex {
  const listed = new Set<SectionId>(input.sections);
  const order: readonly SectionId[] = ["today", ...CREW_SECTION_IDS];
  return {
    entries: order
      .filter((id) => id === "today" || listed.has(id))
      .flatMap((id) => SECTION_BUILDERS[id](input)),
  };
}
