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
import { premise } from "@/tests/_shared/premise";

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
    // Empty until Task 4 retires `budget`; each alias is then checked here with no edit.
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
