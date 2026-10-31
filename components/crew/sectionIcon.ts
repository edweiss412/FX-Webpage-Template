/**
 * components/crew/sectionIcon.ts: the glyph beside each crew section's label.
 *
 * One map, read by the compact "All sections" rows and the wide nav, so the two
 * show the same icon for a section (crew page redesign spec §4.6, §5.3). Each
 * glyph inherits `currentColor` from its row.
 */
import type { JSX } from "react";
import {
  BoxIcon,
  CalendarIcon,
  HomeIcon,
  MapPinIcon,
  PlaneIcon,
  ReceiptIcon,
  UsersIcon,
} from "@/components/crew/icons/sectionIcons";
import type { SectionId } from "@/lib/crew/resolveActiveSection";

export const SECTION_ICON: Readonly<
  Record<SectionId, (props: { className?: string }) => JSX.Element>
> = {
  today: HomeIcon,
  schedule: CalendarIcon,
  venue: MapPinIcon,
  travel: PlaneIcon,
  crew: UsersIcon,
  gear: BoxIcon,
  budget: ReceiptIcon,
};
