/**
 * lib/crew/resolveActiveSection.ts: the one source for crew section ids (crew
 * page redesign PR B plan, Task 3; spec §5.1 "Legacy ids", §11 `s` param row).
 *
 * `resolveActiveSection(raw, entitled)` aliases first, then admits the id only
 * when the viewer is entitled to it; anything else is the home. Expected ids
 * come from `CREW_SECTION_IDS` and `LEGACY_SECTION_ALIASES` themselves, so no
 * case passes on a literal the module also holds.
 */
import { describe, expect, test } from "vitest";
import {
  CREW_SECTION_IDS,
  LEGACY_SECTION_ALIASES,
  canonicalSectionParam,
  resolveActiveSection,
  type SectionId,
} from "@/lib/crew/resolveActiveSection";
import { crewSectionEntitled, type CrewSectionsViewer } from "@/lib/crew/crewSections";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

/** Every section entitled: the most an entitled set can hold. */
const ALL: ReadonlySet<SectionId> = new Set<SectionId>(["today", ...CREW_SECTION_IDS]);

describe("canonicalSectionParam", () => {
  test("an id stays itself, today included", () => {
    premise("crew section ids", CREW_SECTION_IDS.length, 0);
    for (const id of ["today", ...CREW_SECTION_IDS] as const) {
      expect(canonicalSectionParam(id), id).toBe(id);
    }
  });

  test("an alias becomes the id that replaced it", () => {
    premise("legacy aliases", Object.keys(LEGACY_SECTION_ALIASES).length, 0);
    for (const [alias, id] of Object.entries(LEGACY_SECTION_ALIASES)) {
      expect(canonicalSectionParam(alias), alias).toBe(id);
      expect(CREW_SECTION_IDS as readonly string[], alias).toContain(id);
    }
  });

  test("an absent, empty or unknown value is dropped, inherited object keys included", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "bogus",
      "TODAY",
      "venue ",
      "constructor",
      "__proto__",
    ]) {
      expect(canonicalSectionParam(raw), String(raw)).toBeUndefined();
    }
  });
});

describe("resolveActiveSection", () => {
  test("absent, empty or unknown resolves home", () => {
    for (const raw of [undefined, "", "bogus", "TODAY", "venue ", "constructor"]) {
      expect(resolveActiveSection(raw, ALL), String(raw)).toBe("today");
    }
  });

  test("each entitled id resolves to itself", () => {
    for (const id of CREW_SECTION_IDS) {
      expect(resolveActiveSection(id, ALL), id).toBe(id);
    }
  });

  test("a non-entitled id resolves home (spec line 463)", () => {
    for (const id of CREW_SECTION_IDS) {
      const without = new Set([...ALL].filter((x) => x !== id));
      expect(resolveActiveSection(id, without), id).toBe("today");
      // Positive control: the same value with the id entitled opens it.
      expect(resolveActiveSection(id, ALL), id).toBe(id);
    }
  });

  test("?s=today stays home, whatever the entitled set holds", () => {
    expect(resolveActiveSection("today", ALL)).toBe("today");
    expect(resolveActiveSection("today", new Set<SectionId>())).toBe("today");
  });
});

describe("legacy section aliases (spec line 242, line 489)", () => {
  /** The entitled set the shell builds for a viewer: the home plus every entitled id. */
  function entitledFor(viewer: CrewSectionsViewer): Set<SectionId> {
    const data = makeShowForViewer({});
    return new Set<SectionId>([
      "today",
      ...CREW_SECTION_IDS.filter((id) => crewSectionEntitled(id, data, viewer)),
    ]);
  }
  const LEAD: CrewSectionsViewer = {
    viewerFlags: ["LEAD"],
    isAdmin: false,
    dateRestriction: { kind: "none" },
  };
  const NON_LEAD: CrewSectionsViewer = {
    viewerFlags: [],
    isAdmin: false,
    dateRestriction: { kind: "none" },
  };

  test("every old id resolves to its replacement when entitled, and home when not", () => {
    const aliases = Object.entries(LEGACY_SECTION_ALIASES);
    premise("legacy aliases", aliases.length, 0);
    for (const [alias, id] of aliases) {
      const without = new Set([...ALL].filter((x) => x !== id));
      expect(resolveActiveSection(alias, ALL), alias).toBe(id);
      expect(resolveActiveSection(alias, without), alias).toBe("today");
    }
  });

  test("?s=budget and ?s=billing open Billing for a lead and land home for a non-lead", () => {
    const lead = entitledFor(LEAD);
    const nonLead = entitledFor(NON_LEAD);
    premiseHolds(
      "the lead is entitled to billing, the non-lead is not",
      lead.has("billing") && !nonLead.has("billing"),
    );
    for (const raw of ["budget", "billing"]) {
      expect(resolveActiveSection(raw, lead), raw).toBe("billing");
      expect(resolveActiveSection(raw, nonLead), raw).toBe("today");
    }
  });

  test("?s=travel and ?s=hotels open Hotels for every viewer, lead or not (PR B Task 9)", () => {
    for (const viewer of [LEAD, NON_LEAD]) {
      const entitled = entitledFor(viewer);
      premiseHolds("hotels is entitled for every viewer", entitled.has("hotels" as SectionId));
      for (const raw of ["travel", "hotels"]) {
        expect(resolveActiveSection(raw, entitled), raw).toBe("hotels");
      }
    }
  });

  test("travel is no longer a section id, only an alias of hotels", () => {
    expect(CREW_SECTION_IDS as readonly string[]).not.toContain("travel");
    expect(LEGACY_SECTION_ALIASES["travel"]).toBe("hotels");
    expect(canonicalSectionParam("travel")).toBe("hotels");
  });

  test("budget is no longer a section id, only an alias", () => {
    expect(CREW_SECTION_IDS as readonly string[]).not.toContain("budget");
    expect(LEGACY_SECTION_ALIASES["budget"]).toBe("billing");
  });
});
