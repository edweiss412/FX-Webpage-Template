import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { SECTION_BUILDERS, type SectionBuildInput } from "@/lib/search/sections";
import type { SearchIndex } from "@/lib/search/types";

/**
 * The crew page's search index (spec §2.4, §3): every line each section the
 * shell renders shows this viewer, in `[...BASE_SECTION_IDS, "budget"]` order.
 *
 * Runs on the server inside `CrewShell`, once per render, from the inputs the
 * sections receive: `data`, `viewer`, the request-scoped `today`, and what the
 * shell computes once, `budgetVisible` and `staticPreview`. Budget is built
 * only when the shell renders it. Each builder's ids carry its section, and
 * each builder keeps its own ids unique, so ids are unique across the index.
 *
 * Imports only modules without `"use client"` (tests/search/builderImports.test.ts).
 */
export function buildSearchIndex(input: SectionBuildInput): SearchIndex {
  const sections: readonly SectionId[] = input.budgetVisible
    ? [...BASE_SECTION_IDS, "budget"]
    : BASE_SECTION_IDS;
  return { entries: sections.flatMap((id) => SECTION_BUILDERS[id](input)) };
}
