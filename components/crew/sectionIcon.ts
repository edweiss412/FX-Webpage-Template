/**
 * components/crew/sectionIcon.ts: the glyph beside each crew section's label.
 *
 * One map, read by the compact "All sections" rows, the wide nav and search's
 * result groups, so they show the same icon for a section (crew page redesign
 * spec §4.6, §5.3). Every section draws its registry glyph, the one the admin rail
 * shows (PR B plan, decision 3); the home has no record and keeps `HomeIcon`. Each
 * glyph inherits `currentColor` from its row.
 */
import type { ComponentType } from "react";
import { HomeIcon } from "@/components/crew/icons/sectionIcons";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { showSection } from "@/lib/showSections/registry";

type SectionGlyph = ComponentType<{ className?: string }>;

export const SECTION_ICON = {
  today: HomeIcon,
  ...Object.fromEntries(CREW_SECTION_IDS.map((id) => [id, showSection(id).icon])),
} as Readonly<Record<SectionId, SectionGlyph>>;
