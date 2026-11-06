/**
 * components/crew/sectionIcon.ts: the glyph beside each crew section's label.
 *
 * One map, read by the compact "All sections" rows, the wide nav and search's
 * result groups, so they show the same icon for a section (crew page redesign
 * spec §4.6, §5.3). A section moved onto a shared body draws its registry glyph,
 * the one the admin rail shows (PR B plan, decision 3); the rest keep their crew
 * glyphs until PR C. Each glyph inherits `currentColor` from its row.
 */
import type { ComponentType } from "react";
import { CalendarIcon, HomeIcon } from "@/components/crew/icons/sectionIcons";
import { CREW_MOVED_IDS } from "@/lib/crew/crewSections";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { showSection } from "@/lib/showSections/registry";

type SectionGlyph = ComponentType<{ className?: string }>;

type CrewMovedId = (typeof CREW_MOVED_IDS)[number];

/** The crew's own glyphs: the home and every section not yet moved. */
const CREW_GLYPHS: Readonly<Record<Exclude<SectionId, CrewMovedId>, SectionGlyph>> = {
  today: HomeIcon,
  schedule: CalendarIcon,
};

/** Each moved section's registry glyph, read through the registry's accessor. */
function movedGlyphs(): Record<CrewMovedId, SectionGlyph> {
  const glyphs = {} as Record<CrewMovedId, SectionGlyph>;
  for (const id of CREW_MOVED_IDS) glyphs[id] = showSection(id).icon;
  return glyphs;
}

export const SECTION_ICON: Readonly<Record<SectionId, SectionGlyph>> = {
  ...CREW_GLYPHS,
  ...movedGlyphs(),
};
