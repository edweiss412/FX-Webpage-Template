/**
 * tests/showSections/registry.test.ts
 * (crew page redesign PR B plan, Task 2; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §5.1 line 238,
 * §12 line 490 "Registry parity")
 *
 * The show-section registry is the one place a shared section's id, label, group
 * and glyph live. The admin review popup reads its shared entries from it today
 * and the crew page moves onto the same ids section by section.
 *
 * Failure modes caught:
 *  - registry drift from the admin: a shared registry label, group or icon that
 *    differs from what `step3Sections` carries for the same id, in staged or in
 *    published mode (spec line 490);
 *  - a registry id the admin never renders, which would make the parity loop
 *    pass over fewer ids than the registry holds;
 *  - the admin rail's group list (`STEP3_SECTION_GROUPS`) diverging from the
 *    registry's six groups plus the admin-only "Checks";
 *  - the registry importing the admin (directly or through a repo-local module),
 *    which would drag admin code into every crew bundle that reads a label.
 *
 * The consumption proof (that the admin READS these values rather than holding
 * equal literals) is tests/showSections/registryConsumption.test.ts; equality
 * here cannot see a reintroduced literal that happens to match.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { buildStagedSectionData, type SectionData } from "@/components/admin/review/sectionData";
import { includesAgenda } from "@/components/admin/review/sectionInclusion";
import { STEP3_SECTION_GROUPS, step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import {
  SHOW_SECTION_GROUPS,
  SHOW_SECTIONS,
  showSection,
  type ShowSectionId,
} from "@/lib/showSections/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import {
  compilerOptions,
  importedFiles,
  moduleSpecifiers,
} from "@/tests/components/_orphanedComponents";
import { sectionDataArgs } from "@/tests/components/admin/wizard/_step3ReviewFixture";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";

const ROOT = process.cwd();
const REGISTRY_FILE = "lib/showSections/registry.ts";

/** Spec §5.1 line 238, verbatim order. */
const SPEC_ORDER = [
  "venue",
  "event",
  "crew",
  "contacts",
  "schedule",
  "agenda",
  "hotels",
  "transport",
  "rooms",
  "packlist",
  "billing",
];

/** Spec §5.1 line 238: the six groups of `STEP3_SECTION_GROUPS` minus "Checks". */
const SPEC_GROUPS = ["The show", "People", "Schedule", "Logistics", "Gear", "Money"];

const AGENDA_ITEM: AdminAgendaItem = {
  label: "Agenda PDF",
  badge: null,
  href: null,
  block: null,
};

function stagedWithAgenda(): SectionData {
  return buildStagedSectionData({ ...sectionDataArgs(), agendaBaseline: [AGENDA_ITEM] });
}

function publishedWithAgenda(): SectionData {
  return buildPublishedSurfaceProps({
    agendaLinks: [{ label: "Agenda", url: "https://example.com/agenda.pdf" }],
  }).data;
}

const FIXTURES: ReadonlyArray<[string, () => SectionData]> = [
  ["staged", stagedWithAgenda],
  ["published", publishedWithAgenda],
];

describe("show-section registry: shape (spec §5.1 line 238)", () => {
  it("holds the eleven shared sections in the spec's order", () => {
    expect(SHOW_SECTIONS.map((s) => s.id)).toEqual(SPEC_ORDER);
  });

  it("names the six groups in the spec's order, and every entry sits in one of them", () => {
    expect([...SHOW_SECTION_GROUPS]).toEqual(SPEC_GROUPS);
    for (const s of SHOW_SECTIONS) expect(SHOW_SECTION_GROUPS).toContain(s.group);
  });

  it("showSection(id) returns that id's entry, for every id", () => {
    for (const s of SHOW_SECTIONS) expect(showSection(s.id)).toEqual(s);
  });
});

describe("show-section registry: parity with the admin popup (spec line 490)", () => {
  it.each(FIXTURES)(
    "%s: every step3Sections entry with a registry id carries the registry's label, group and icon",
    (_mode, build) => {
      const d = build();
      premiseHolds("the fixture includes the conditional agenda entry", includesAgenda(d));
      const registryIds = new Set<string>(SHOW_SECTIONS.map((s) => s.id));
      const shared = step3Sections(d).filter((def) => registryIds.has(def.id));
      // Every registry id is compared, so a parity hole cannot hide behind a
      // fixture that omits the section.
      expect(shared.map((def) => def.id)).toEqual(SHOW_SECTIONS.map((s) => s.id));
      for (const def of shared) {
        const entry = showSection(def.id as ShowSectionId);
        expect({ id: def.id, label: def.label, group: def.group }).toEqual({
          id: entry.id,
          label: entry.label,
          group: entry.group,
        });
        expect(def.Icon).toBe(entry.icon);
      }
    },
  );

  it("STEP3_SECTION_GROUPS is the registry's groups plus the admin-only Checks", () => {
    expect([...STEP3_SECTION_GROUPS]).toEqual([...SHOW_SECTION_GROUPS, "Checks"]);
  });
});

// ── The registry imports nothing from the admin ─────────────────────────────

const ADMIN_ROOTS = ["components/admin/", "lib/admin/"];

/** Every repo-local file `file` reaches through its imports, transitively. */
function reachableFiles(file: string): Set<string> {
  const options = compilerOptions(ROOT);
  const seen = new Set<string>();
  const queue = [file];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    for (const dep of importedFiles([join(ROOT, next)], options, ROOT)) {
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return seen;
}

function adminReach(file: string): string[] {
  return [...reachableFiles(file)].filter((f) => ADMIN_ROOTS.some((root) => f.startsWith(root)));
}

describe("show-section registry: imports nothing from the admin", () => {
  it("the checker flags a module that imports lib/admin (positive control)", () => {
    // sectionInclusion.ts imports `@/lib/admin/step3SectionStatus`; a checker that
    // could not see that edge would pass the registry vacuously.
    expect(adminReach("components/admin/review/sectionInclusion.ts")).toContain(
      "lib/admin/step3SectionStatus.ts",
    );
  });

  it("no module the registry reaches lives under components/admin/ or lib/admin/", () => {
    const source = ts.createSourceFile(
      REGISTRY_FILE,
      readFileSync(join(ROOT, REGISTRY_FILE), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    premise("the walk saw the registry's own import edges", moduleSpecifiers(source).length, 0);
    expect(adminReach(REGISTRY_FILE)).toEqual([]);
  });
});
