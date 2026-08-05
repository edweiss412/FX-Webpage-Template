import { describe, expect, it } from "vitest";

import { parseFiling } from "../../lib/reviewRounds/filing";

const FILING = `## diff — 7 rounds

**Examined:** R1-R7, 23 findings.

**Mechanizable:**
- "spec cites a symbol that no longer exists" (R2, R4, R5) —
  extend \`spec:lint\` to resolve every \`file:line\` citation -> BL-SPEC-CITATION-RESOLVE

**Judgment:** R1 scope call on the picker pivot; R6 copy decision.
**Infra:** R3 reaped, no verdict.
`;

describe("filing structure (spec §6)", () => {
  it("extracts stage, declared round count, and cited ids", () => {
    const [section, ...rest] = parseFiling(FILING);
    expect(rest).toEqual([]);
    expect(section?.stage).toBe("diff");
    expect(section?.declaredRounds).toBe(7);
    expect(section?.hasExamined).toBe(true);
    expect(section?.hasDisposition).toBe(true);
    expect(section?.citedIds).toEqual(["BL-SPEC-CITATION-RESOLVE"]);
  });

  // Ratified: `**Mechanizable:** none` is legal and expected (spec §1.1). The
  // filing is a duty to look, not a duty to find.
  it("accepts Mechanizable: none with an Examined line", () => {
    const [s] = parseFiling(
      "## spec — 4 rounds\n\n**Examined:** R1-R4.\n\n**Mechanizable:** none\n",
    );
    expect(s?.hasExamined).toBe(true);
    expect(s?.hasDisposition).toBe(true);
    expect(s?.citedIds).toEqual([]);
  });

  it("reports a missing Examined line", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Mechanizable:** none\n");
    expect(s?.hasExamined).toBe(false);
  });

  it("reports a section with no disposition line at all", () => {
    const [s] = parseFiling("## spec — 4 rounds\n\n**Examined:** R1-R4.\n");
    expect(s?.hasDisposition).toBe(false);
  });

  // Failure caught: two contradictory sections for one stage both passing,
  // with nothing saying which is the filing (spec §7.1 assertion 8).
  it("returns both sections when a stage appears twice", () => {
    const sections = parseFiling(
      "## diff — 4 rounds\n\n**Examined:** a\n**Infra:** b\n\n## diff — 9 rounds\n\n**Examined:** c\n**Infra:** d\n",
    );
    expect(sections.map((s) => s.stage)).toEqual(["diff", "diff"]);
  });

  // Plan resolution R2: the recognizer is narrow on purpose. A bare SHOUTY
  // DEFERRED id is not treated as a citation, so it is neither checked nor
  // wrongly rejected - a conservative under-check, not silent wrongness.
  it("recognizes BL- and DEF- tokens only", () => {
    const [s] = parseFiling(
      "## spec — 4 rounds\n\n**Examined:** a\n**Mechanizable:** BL-ONE, DEF-TWO, PSQL-GUARD-RECALL-RESIDUAL\n",
    );
    expect(s?.citedIds).toEqual(["BL-ONE", "DEF-TWO"]);
  });
});
