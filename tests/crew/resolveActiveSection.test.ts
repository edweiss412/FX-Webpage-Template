import { describe, expect, test } from "vitest";
import { resolveActiveSection, BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";

describe("resolveActiveSection", () => {
  test("absent/empty/unknown → today", () => {
    for (const raw of [undefined, "", "bogus", "TODAY", "venue "]) {
      expect(resolveActiveSection(raw, { budgetVisible: false })).toBe("today");
    }
  });
  test("each base id resolves to itself", () => {
    for (const id of BASE_SECTION_IDS) {
      expect(resolveActiveSection(id, { budgetVisible: false })).toBe(id);
    }
  });
  test("budget gated by budgetVisible (single predicate)", () => {
    expect(resolveActiveSection("budget", { budgetVisible: false })).toBe("today");
    expect(resolveActiveSection("budget", { budgetVisible: true })).toBe("budget");
  });
});
