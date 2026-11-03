/**
 * tests/showSections/registryConsumption.test.ts
 * (crew page redesign PR B plan, Task 2, "Single-source claims carry a
 * consumption proof"; spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md
 * §5.1 line 238)
 *
 * The claim: the admin popup reads every shared section's label, group and glyph,
 * and its rail's group list, FROM lib/showSections/registry.ts. Equality with
 * today's values cannot prove that, because a literal restored in `step3Sections`
 * (`label: "Venue"`) equals the registry's value and passes any equality test.
 *
 * So the registry's accessor is mocked to return probe values no literal can
 * hold, distinct per id, and the admin has to follow them. Failure modes caught:
 *  - a literal label, group or icon in a shared `step3Sections` entry;
 *  - an entry reading another id's record (`showSection("event")` on venue);
 *  - a group list in the admin that copies the registry's groups instead of
 *    reading them.
 */
import type { LucideIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => {
  const icons = new Map<string, unknown>();
  return {
    label: (id: string) => `probe label for ${id}`,
    group: (id: string) => `probe group for ${id}`,
    /** One distinct component per id, so an entry reading the wrong id's icon differs. */
    icon: (id: string) => {
      let icon = icons.get(id);
      if (icon === undefined) {
        icon = Object.assign(() => null, { displayName: `ProbeIcon(${id})` });
        icons.set(id, icon);
      }
      return icon;
    },
    groups: ["Probe one", "Probe two", "Probe three"],
  };
});

vi.mock("@/lib/showSections/registry", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/showSections/registry")>();
  return {
    ...actual,
    SHOW_SECTION_GROUPS: probe.groups,
    showSection: (id: string) => ({
      id,
      label: probe.label(id),
      group: probe.group(id),
      icon: probe.icon(id) as LucideIcon,
    }),
  };
});

import { buildStagedSectionData, type SectionData } from "@/components/admin/review/sectionData";
import { includesAgenda } from "@/components/admin/review/sectionInclusion";
import { STEP3_SECTION_GROUPS, step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import { SHOW_SECTIONS } from "@/lib/showSections/registry";
import { premiseHolds } from "@/tests/_shared/premise";
import { sectionDataArgs } from "@/tests/components/admin/wizard/_step3ReviewFixture";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";

const AGENDA_ITEM: AdminAgendaItem = {
  label: "Agenda PDF",
  badge: null,
  href: null,
  block: null,
};

const FIXTURES: ReadonlyArray<[string, () => SectionData]> = [
  ["staged", () => buildStagedSectionData({ ...sectionDataArgs(), agendaBaseline: [AGENDA_ITEM] })],
  [
    "published",
    () =>
      buildPublishedSurfaceProps({
        agendaLinks: [{ label: "Agenda", url: "https://example.com/agenda.pdf" }],
      }).data,
  ],
];

describe("the admin reads shared section labels, groups and icons from the registry", () => {
  it.each(FIXTURES)(
    "%s: every shared step3Sections entry carries the probe values",
    (_m, build) => {
      const d = build();
      premiseHolds("the fixture includes the conditional agenda entry", includesAgenda(d));
      const registryIds = new Set<string>(SHOW_SECTIONS.map((s) => s.id));
      const defs = step3Sections(d);
      const shared = defs.filter((def) => registryIds.has(def.id));
      premiseHolds("every registry id is compared", shared.length === registryIds.size);
      for (const def of shared) {
        expect({ id: def.id, label: def.label, group: def.group }).toEqual({
          id: def.id,
          label: probe.label(def.id),
          group: probe.group(def.id),
        });
        expect(def.Icon).toBe(probe.icon(def.id));
      }
      // The admin-only entries are not registry entries and keep their own values.
      for (const def of defs.filter((x) => !registryIds.has(x.id))) {
        expect(def.label.startsWith("probe")).toBe(false);
      }
    },
  );

  it("STEP3_SECTION_GROUPS is the registry's group list plus Checks", () => {
    expect([...STEP3_SECTION_GROUPS]).toEqual([...probe.groups, "Checks"]);
  });
});
