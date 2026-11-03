/**
 * lib/showSections/registry.ts
 *
 * The show-section registry (crew page redesign spec §5.1): one record per
 * section the admin review popup and the crew page both render, holding its id,
 * label, group and glyph. The admin's `step3Sections` reads its shared entries'
 * label, group and Icon from here (its admin-only entries, every `render`, rail
 * count and dot rule stay in components/admin/wizard/step3ReviewSections.tsx),
 * and the crew page moves onto these ids section by section.
 *
 * Labels are the admin's, verbatim. This module imports nothing from the admin,
 * so a crew bundle that reads a label never pulls admin code in; the admin
 * asserts at type level that every id here is one of its `SectionId`s.
 */
import {
  BedDouble,
  CalendarDays,
  FileText,
  LayoutGrid,
  MapPin,
  Package,
  Phone,
  Receipt,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

/** The rail groups, in order: the admin's `STEP3_SECTION_GROUPS` without "Checks". */
export const SHOW_SECTION_GROUPS = [
  "The show",
  "People",
  "Schedule",
  "Logistics",
  "Gear",
  "Money",
] as const;

export type ShowSectionGroup = (typeof SHOW_SECTION_GROUPS)[number];

type Entry = {
  readonly id: string;
  readonly label: string;
  readonly group: ShowSectionGroup;
  readonly icon: LucideIcon;
};

const SECTIONS = [
  { id: "venue", label: "Venue", group: "The show", icon: MapPin },
  { id: "event", label: "Event details", group: "The show", icon: Sparkles },
  { id: "crew", label: "Crew", group: "People", icon: Users },
  { id: "contacts", label: "Contacts", group: "People", icon: Phone },
  { id: "schedule", label: "Crew schedule", group: "Schedule", icon: CalendarDays },
  { id: "agenda", label: "Agenda", group: "Schedule", icon: FileText },
  { id: "hotels", label: "Hotels", group: "Logistics", icon: BedDouble },
  { id: "transport", label: "Transport", group: "Logistics", icon: Truck },
  { id: "rooms", label: "Rooms & scope", group: "Gear", icon: LayoutGrid },
  { id: "packlist", label: "Pack list", group: "Gear", icon: Package },
  { id: "billing", label: "Billing & docs", group: "Money", icon: Receipt },
] as const satisfies readonly Entry[];

export type ShowSectionId = (typeof SECTIONS)[number]["id"];

export type ShowSection = Entry & { readonly id: ShowSectionId };

/** Every shared section, in rail order. */
export const SHOW_SECTIONS: readonly ShowSection[] = SECTIONS;

/** The registry record for `id`. Read values through this; never copy one. */
export function showSection(id: ShowSectionId): ShowSection {
  const section = SHOW_SECTIONS.find((s) => s.id === id);
  // Unreachable while `id` is typed from SECTIONS; a cast at a call site is the only way here.
  if (section === undefined) throw new Error(`unknown show section: ${id}`);
  return section;
}
