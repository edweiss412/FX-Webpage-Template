"use client";

/**
 * components/crew/sectionController.ts — the section controller's context
 * (crew show search spec §9.1).
 *
 * `CrewSections` provides it and re-exports `useSectionController`, the name
 * the redesign agreed to. It lives in its own module so the search results,
 * which `CrewSections` renders, can read it without importing `CrewSections`
 * back (no import cycle).
 */

import { createContext, useContext } from "react";

import type { SectionId } from "@/lib/crew/resolveActiveSection";

export type SectionController = {
  openSectionAndReveal: (sectionId: SectionId, targetId: string) => void;
};

export const SectionControllerContext = createContext<SectionController | null>(null);

/** The section controller, provided by `CrewSections` to everything it renders. */
export function useSectionController(): SectionController {
  const controller = useContext(SectionControllerContext);
  if (controller === null) {
    throw new Error("useSectionController must be used inside CrewSections");
  }
  return controller;
}
