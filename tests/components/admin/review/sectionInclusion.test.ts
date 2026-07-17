/**
 * tests/components/admin/review/sectionInclusion.test.ts
 *
 * Pins the pure server-safe section-inclusion module and its lockstep with the
 * client `step3Sections` registry.
 *
 * Failure modes caught:
 *  - The ordered id list drifts from `step3Sections` (a section added/removed in
 *    one but not the other) — the LOCKSTEP test fails. This is the structural
 *    defense that lets the SSR page derive `renderedSectionIds` from the pure
 *    module instead of calling the `"use client"` `step3Sections` (which throws
 *    when invoked from a Server Component — the P0 this module fixes).
 *  - The agenda inclusion rule regresses (renders when the baseline is empty, or
 *    is dropped when present) — the INCLUSION test fails.
 */
import { describe, expect, it } from "vitest";
import {
  includesAgenda,
  includesReport,
  renderedSectionIds,
} from "@/components/admin/review/sectionInclusion";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { SectionData } from "@/components/admin/review/sectionData";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";

/**
 * Minimal SectionData: `step3Sections` and the pure module read ONLY `mode` and
 * `agendaBaseline` at registry-build time (every `render` is an uninvoked
 * closure). The cast keeps the fixture focused on the two data-dependent inputs.
 */
function sectionData(agendaCount: number, mode: "staged" | "published" = "published"): SectionData {
  return {
    mode,
    agendaBaseline: Array.from({ length: agendaCount }, () => ({}) as unknown as AdminAgendaItem),
  } as unknown as SectionData;
}

describe("section inclusion — pure server-safe logic", () => {
  it("includesAgenda is true iff the baseline has entries", () => {
    expect(includesAgenda(sectionData(0))).toBe(false);
    expect(includesAgenda(sectionData(3))).toBe(true);
  });

  it("includesReport is true iff the source is staged", () => {
    expect(includesReport(sectionData(0, "staged"))).toBe(true);
    expect(includesReport(sectionData(0, "published"))).toBe(false);
  });

  it("omits agenda when the baseline is empty, in registry order (staged: report last)", () => {
    expect(renderedSectionIds(sectionData(0, "staged"))).toEqual([
      "venue",
      "event",
      "crew",
      "contacts",
      "schedule",
      "hotels",
      "transport",
      "rooms",
      "packlist",
      "billing",
      "warnings",
      "report",
    ]);
  });

  it("omits the staged-only report section in published mode", () => {
    expect(renderedSectionIds(sectionData(0, "published"))).toEqual([
      "venue",
      "event",
      "crew",
      "contacts",
      "schedule",
      "hotels",
      "transport",
      "rooms",
      "packlist",
      "billing",
      "warnings",
    ]);
  });

  it("inserts agenda after schedule when a baseline exists", () => {
    const ids = renderedSectionIds(sectionData(2));
    expect(ids).toContain("agenda");
    expect(ids.indexOf("agenda")).toBe(ids.indexOf("schedule") + 1);
  });
});

describe("section inclusion — lockstep with step3Sections", () => {
  for (const mode of ["staged", "published"] as const) {
    for (const agendaCount of [0, 2]) {
      it(`renderedSectionIds equals step3Sections ids (${mode}, agenda×${agendaCount})`, () => {
        const d = sectionData(agendaCount, mode);
        expect(renderedSectionIds(d)).toEqual(step3Sections(d).map((s) => s.id));
      });
    }
  }
});
