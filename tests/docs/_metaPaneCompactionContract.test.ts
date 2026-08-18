// AGENTS.md points at `docs/agents/orchestrator-pane-compaction.md`, and the two
// must not drift. This does NOT model the prose; it pins the specific sentences
// that can drift, one per edit — the shape of _metaAgentsMarkerContract.test.ts.
//
// The pins are chosen by what a later editor is most likely to "simplify":
// the no-interrupt decision (four defects were found on the interrupt's race
// surface before it was removed), the no-commit contract (invariant 1), and the
// band values (three copies would drift; there are deliberately two).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise } from "@/tests/_shared/premise";

const ROOT = join(__dirname, "..", "..");
const AGENTS = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
const WRITEUP_PATH = "docs/agents/orchestrator-pane-compaction.md";
const WRITEUP = readFileSync(join(ROOT, WRITEUP_PATH), "utf8");

describe("pane-compaction contract", () => {
  it("both documents are substantial, so an emptied file cannot pass", () => {
    // The guard's own premise: a truncated write-up would satisfy every
    // `not.toMatch` below while satisfying nothing a reader needs.
    premise("the write-up has content", WRITEUP.length, 2000);
    premise("AGENTS.md has content", AGENTS.length, 10000);
  });

  it("AGENTS.md points at the write-up by path", () => {
    expect(AGENTS).toContain(WRITEUP_PATH);
  });

  it("AGENTS.md does not restate the write-up's detail", () => {
    // Two copies drift. The pointer carries the decision, the write-up carries
    // the mechanism — so the band arithmetic must live in exactly one of them.
    expect(AGENTS).not.toContain("2 × full + half");
  });

  it("the write-up states that nothing interrupts", () => {
    expect(WRITEUP).toMatch(/never interrupt|nothing here ever interrupts|no interrupt/i);
  });

  it("both documents state the ESC pin, which is the sentence most likely to be dropped", () => {
    expect(AGENTS).toContain("\\x1b");
    expect(WRITEUP).toContain("\\x1b");
  });

  it("the write-up states the checkpoint's no-commit contract", () => {
    expect(WRITEUP.toLowerCase()).toContain("never commits");
  });

  it("neither document contradicts the spec's band values", () => {
    // The spec is canonical (invariant 7). A write-up that says 0.5 or 0.8 has
    // reverted to the float fraction the spec deliberately replaced.
    for (const [name, doc] of [["AGENTS.md", AGENTS], [WRITEUP_PATH, WRITEUP]] as const) {
      expect(doc, `${name} carries a float band value`).not.toMatch(/f\s*[<>=]+\s*0\.[58]/);
    }
    expect(WRITEUP).toContain("t < 5");
    expect(WRITEUP).toContain("t >= 8");
  });
});
