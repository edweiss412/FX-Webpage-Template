import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkSections } from "../../lib/specLint/sections";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

const ALL_HEADINGS = [
  "## 1.1 Resolved scope — do not relitigate",
  "## Dimensional Invariants",
  "## Transition Inventory",
  "body",
].join("\n");

describe("checkSections (spec §6)", () => {
  it("spec without resolved-scope heading → SECTION_MISSING_RESOLVED_SCOPE at 1:1", () => {
    const f = checkSections(parseDoc("# Title\nbody\n"), "spec", []);
    expect(f).toEqual([
      expect.objectContaining({
        check: "sections",
        code: "SECTION_MISSING_RESOLVED_SCOPE",
        severity: "fail",
        docLine: 1,
        column: 1,
      }),
    ]);
  });

  it("spec with resolved-scope heading (case-insensitive match) → clean", () => {
    expect(checkSections(parseDoc(ALL_HEADINGS), "spec", [])).toEqual([]);
  });

  it("plan kind skips everything — even with UI citations and no headings", () => {
    expect(checkSections(parseDoc("body\n"), "plan", ["components/Button.tsx"])).toEqual([]);
  });

  it("UI detection positive via components/ citation", () => {
    const f = checkSections(parseDoc("## Resolved scope\n"), "spec", ["components/X.tsx"]);
    expect(codes(f).sort()).toEqual([
      "SECTION_MISSING_DIMENSIONAL_INVARIANTS",
      "SECTION_MISSING_TRANSITION_INVENTORY",
    ]);
  });

  it("UI detection positive via non-api app/ citation", () => {
    const f = checkSections(parseDoc("## Resolved scope\n"), "spec", ["app/(admin)/x.tsx"]);
    expect(codes(f)).toHaveLength(2);
  });

  it("app/api/ citations only → NOT a UI spec", () => {
    const f = checkSections(parseDoc("## Resolved scope\n"), "spec", ["app/api/health/route.ts"]);
    expect(f).toEqual([]);
  });

  it("one heading present, other missing — both directions", () => {
    const dimOnly = ["## Resolved scope", "## Dimensional Invariants"].join("\n");
    const f1 = checkSections(parseDoc(dimOnly), "spec", ["components/X.tsx"]);
    expect(codes(f1)).toEqual(["SECTION_MISSING_TRANSITION_INVENTORY"]);
    const transOnly = ["## Resolved scope", "## Transition Inventory"].join("\n");
    const f2 = checkSections(parseDoc(transOnly), "spec", ["components/X.tsx"]);
    expect(codes(f2)).toEqual(["SECTION_MISSING_DIMENSIONAL_INVARIANTS"]);
  });

  it("not-ui waiver disables the UI sub-check with UI citations present", () => {
    const doc = ["<!-- spec-lint: not-ui — pure backend -->", "## Resolved scope"].join("\n");
    expect(checkSections(parseDoc(doc), "spec", ["components/X.tsx"])).toEqual([]);
  });

  it("both UI codes anchor at docLine 1 col 1", () => {
    const f = checkSections(parseDoc("## Resolved scope\n"), "spec", ["components/X.tsx"]);
    for (const finding of f) {
      expect(finding.docLine).toBe(1);
      expect(finding.column).toBe(1);
    }
  });
});
