/**
 * buildSearchIndex composition (spec §2.4, plan Task 13).
 *
 * The index is the section builders' entries concatenated in
 * `[...BASE_SECTION_IDS, "budget"]` order, Budget only when the shell renders
 * it (`budgetVisible`), every builder handed the shell's own inputs, and ids
 * unique across the whole index.
 *
 * The composition cases replace every builder with a stub that returns marker
 * entries, so they test the composer and not the builders: the Budget builder
 * gates itself on `budgetVisible` too, so a composer that always called it
 * would pass any test that used the real builder.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { buildSearchIndex } from "@/lib/search/buildSearchIndex";
import { SECTION_BUILDERS, type SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import {
  ALL_CASES,
  crewNoTransport,
  fullContent,
  leadWithFinancials,
} from "@/tests/search/_viewerMatrix";

const INDEX_ORDER: readonly SectionId[] = [...BASE_SECTION_IDS, "budget"];

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
  test("concatenates every builder in [...BASE_SECTION_IDS, 'budget'] order when Budget is visible", () => {
    premiseHolds("the lead case is entitled to Budget", leadWithFinancials.budgetVisible);
    const calls = stubBuilders();

    const index = buildSearchIndex(leadWithFinancials);

    expect(index.entries.map((e) => e.id)).toEqual(
      INDEX_ORDER.flatMap((id) => [`${id}:marker:2`, `${id}:marker:1`]),
    );
    // Each builder ran once, on the shell's inputs: the same projection and the
    // same request clock, never a fresh `new Date()`.
    for (const id of INDEX_ORDER) {
      const seen = calls.get(id) ?? [];
      expect(seen).toHaveLength(1);
      expect(seen[0]!.data).toBe(leadWithFinancials.data);
      expect(seen[0]!.viewer).toBe(leadWithFinancials.viewer);
      expect(seen[0]!.today).toBe(leadWithFinancials.today);
      expect(seen[0]!.budgetVisible).toBe(true);
      expect(seen[0]!.staticPreview).toBe(false);
    }
  });

  test("leaves Budget out, without calling its builder, when Budget is not visible", () => {
    premiseHolds("the crew case is not entitled to Budget", !crewNoTransport.budgetVisible);
    const calls = stubBuilders();

    const index = buildSearchIndex(crewNoTransport);

    expect([...new Set(index.entries.map((e) => e.section))]).toEqual([...BASE_SECTION_IDS]);
    expect(calls.has("budget")).toBe(false);
  });

  test("passes staticPreview through and still builds the index (Doug's preview searches like crew)", () => {
    const calls = stubBuilders();
    const input = { ...fullContent, staticPreview: true };

    const index = buildSearchIndex(input);

    expect(index.entries.length).toBe(BASE_SECTION_IDS.length * 2);
    for (const id of BASE_SECTION_IDS) expect(calls.get(id)?.[0]?.staticPreview).toBe(true);
  });
});

describe("with the real builders", () => {
  test("every matrix case builds without throwing, ids are unique across the index and name their section", () => {
    let multiSection = 0;
    let withBudget = 0;
    for (const c of ALL_CASES) {
      const { entries } = buildSearchIndex(c);
      const ids = entries.map((e) => e.id);
      expect(new Set(ids).size, `${c.name}: duplicate ids`).toBe(ids.length);
      for (const e of entries)
        expect(e.id.startsWith(`${e.section}:`), `${c.name}: ${e.id}`).toBe(true);
      if (new Set(entries.map((e) => e.section)).size > 1) multiSection += 1;
      if (entries.some((e) => e.section === "budget")) withBudget += 1;
    }
    // The uniqueness check is cross-section only if some index spans sections,
    // and covers Budget only if some case renders it.
    premise("matrix cases whose index spans more than one section", multiSection, 0);
    premise("matrix cases whose index holds Budget entries", withBudget, 0);
  });

  test("a staticPreview index equals the live one for the same inputs", () => {
    const live = buildSearchIndex(fullContent);
    premise("fullContent index entries", live.entries.length, 0);
    expect(buildSearchIndex({ ...fullContent, staticPreview: true })).toEqual(live);
  });
});
