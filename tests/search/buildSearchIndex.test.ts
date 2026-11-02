/**
 * buildSearchIndex composition (spec §2.4, plan Task 13).
 *
 * The index is the section builders' entries concatenated in
 * `["today", ...CREW_SECTION_IDS]` order, each section only when the shell's
 * member list (`sections`, from `crewSectionsFor`) holds it, every builder
 * handed the shell's own inputs, and ids unique across the whole index.
 *
 * The composition cases replace every builder with a stub that returns marker
 * entries, so they test the composer and not the builders: the Billing builder
 * gates itself on `billingVisible` too, so a composer that always called it
 * would pass any test that used the real builder.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { buildSearchIndex } from "@/lib/search/buildSearchIndex";
import { SECTION_BUILDERS, type SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { ALL_CASES, adminViewer, crewNoTransport, fullContent } from "@/tests/search/_viewerMatrix";

const INDEX_ORDER: readonly SectionId[] = ["today", ...CREW_SECTION_IDS];

afterEach(() => {
  vi.restoreAllMocks();
});

function marker(section: SectionId, n: number): SearchEntry {
  return {
    id: `${section}:marker:${n}`,
    section,
    group: "",
    label: null,
    value: `${section} ${n}`,
    context: [],
    copy: null,
  };
}

/**
 * Replaces every builder with a stub. Each returns two markers, the second
 * first, so a composer that sorted entries (by id or value) instead of
 * concatenating them would reorder them. Returns the inputs each stub saw.
 */
function stubBuilders(): Map<SectionId, SectionBuildInput[]> {
  const calls = new Map<SectionId, SectionBuildInput[]>();
  for (const id of INDEX_ORDER) {
    vi.spyOn(SECTION_BUILDERS, id).mockImplementation((input) => {
      calls.set(id, [...(calls.get(id) ?? []), input]);
      return [marker(id, 2), marker(id, 1)];
    });
  }
  return calls;
}

describe("composition", () => {
  test("concatenates every builder in ['today', ...CREW_SECTION_IDS] order when every section is listed", () => {
    // The admin case: from PR B Task 9 a crew lead with no flight and no ride is
    // not listed Transport, so the case that lists every section is the admin's.
    premiseHolds(
      "the admin case lists every section",
      CREW_SECTION_IDS.every((id) => adminViewer.sections.includes(id)),
    );
    const calls = stubBuilders();

    const index = buildSearchIndex(adminViewer);

    expect(index.entries.map((e) => e.id)).toEqual(
      INDEX_ORDER.flatMap((id) => [`${id}:marker:2`, `${id}:marker:1`]),
    );
    // Each builder ran once, on the shell's inputs: the same projection and the
    // same request clock, never a fresh `new Date()`.
    for (const id of INDEX_ORDER) {
      const seen = calls.get(id) ?? [];
      expect(seen).toHaveLength(1);
      expect(seen[0]!.data).toBe(adminViewer.data);
      expect(seen[0]!.viewer).toBe(adminViewer.viewer);
      expect(seen[0]!.today).toBe(adminViewer.today);
      expect(seen[0]!.billingVisible).toBe(true);
      expect(seen[0]!.staticPreview).toBe(false);
    }
  });

  test("leaves Billing out, without calling its builder, when Billing is not listed", () => {
    premiseHolds(
      "the crew case does not list Billing, nor (no flight, no ride) Transport",
      !crewNoTransport.sections.includes("billing") &&
        !crewNoTransport.sections.includes("transport"),
    );
    const calls = stubBuilders();

    const index = buildSearchIndex(crewNoTransport);

    expect([...new Set(index.entries.map((e) => e.section))]).toEqual(
      INDEX_ORDER.filter((id) => id !== "billing" && id !== "transport"),
    );
    expect(calls.has("billing")).toBe(false);
  });

  test("reads the shell's member list, not billingVisible, to choose the sections", () => {
    // Each pairing flips one input against the other, so a composer that kept
    // reading billingVisible gets one of the two wrong.
    for (const billingVisible of [true, false]) {
      vi.restoreAllMocks();
      const calls = stubBuilders();
      const sections: SectionId[] = billingVisible ? ["venue"] : ["venue", "billing"];
      const index = buildSearchIndex({ ...fullContent, billingVisible, sections });
      expect(
        [...new Set(index.entries.map((e) => e.section))],
        `billingVisible ${billingVisible}`,
      ).toEqual(INDEX_ORDER.filter((id) => id === "today" || sections.includes(id)));
      expect(calls.has("billing"), `billingVisible ${billingVisible}`).toBe(!billingVisible);
    }
  });

  test("passes staticPreview through and still builds the index (Doug's preview searches like crew)", () => {
    const calls = stubBuilders();
    const input = { ...fullContent, staticPreview: true };

    const index = buildSearchIndex(input);

    const listed: SectionId[] = ["today", ...fullContent.sections];
    premise("sections fullContent lists", fullContent.sections.length, 0);
    expect(index.entries.length).toBe(listed.length * 2);
    for (const id of listed) expect(calls.get(id)?.[0]?.staticPreview).toBe(true);
  });
});

describe("with the real builders", () => {
  test("every matrix case builds without throwing, ids are unique across the index and name their section", () => {
    let multiSection = 0;
    let withBilling = 0;
    for (const c of ALL_CASES) {
      const { entries } = buildSearchIndex(c);
      const ids = entries.map((e) => e.id);
      expect(new Set(ids).size, `${c.name}: duplicate ids`).toBe(ids.length);
      for (const e of entries)
        expect(e.id.startsWith(`${e.section}:`), `${c.name}: ${e.id}`).toBe(true);
      if (new Set(entries.map((e) => e.section)).size > 1) multiSection += 1;
      if (entries.some((e) => e.section === "billing")) withBilling += 1;
    }
    // The uniqueness check is cross-section only if some index spans sections,
    // and covers Billing only if some case renders it.
    premise("matrix cases whose index spans more than one section", multiSection, 0);
    premise("matrix cases whose index holds Billing entries", withBilling, 0);
  });

  test("a staticPreview index equals the live one for the same inputs", () => {
    const live = buildSearchIndex(fullContent);
    premise("fullContent index entries", live.entries.length, 0);
    expect(buildSearchIndex({ ...fullContent, staticPreview: true })).toEqual(live);
  });
});
