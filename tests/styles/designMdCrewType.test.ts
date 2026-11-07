/**
 * tests/styles/designMdCrewType.test.ts
 *
 * DESIGN.md §2 is the visual reference an implementer reads first. If the crew section
 * scale lives only in globals.css, the next surface built from the doc ships at the
 * admin's sizes and the rule set quietly stops describing the page.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("DESIGN.md records the crew section type scale", () => {
  const design = readFileSync("DESIGN.md", "utf8");
  const typography = design.slice(
    design.indexOf("## 2. Typography"),
    design.indexOf("## 3. Spacing"),
  );

  it("names the attribute and the three sizes", () => {
    expect(typography).toContain("data-crew-section-type");
    for (const size of ["12px", "13px", "15px"]) expect(typography).toContain(size);
  });
});
