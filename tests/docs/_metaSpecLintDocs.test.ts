import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";
import { AC_AMBIGUOUS_RECORD } from "../specLint/acAmbiguousRecord";
import { AC_UNCLAIMED_RESIDUE } from "../specLint/acUnclaimedResidue";

const WRITING_PLANS = "docs/agents/writing-plans.md";
const AGENTS = "AGENTS.md";

/** Top-level `- ` bullets, each joined with its continuation lines. */
function bullets(path: string): string[] {
  const lines = readFileSync(path, "utf8").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (current) out.push(current.join(" "));
      current = [line];
    } else if (current !== null && /^\s+\S/.test(line)) {
      current.push(line.trim());
    } else if (current) {
      out.push(current.join(" "));
      current = null;
    }
  }
  if (current) out.push(current.join(" "));
  return out;
}

describe("the acceptance-criterion disposition convention is documented for plan authors", () => {
  const all = bullets(WRITING_PLANS);

  it("AC-11: exactly ONE bullet states the convention, and it is in writing-plans.md", () => {
    // Parsed, not grepped: the file already carries two near-identical copies of
    // its red-contract bullet and two of its reconciliation bullet, so "the text
    // appears somewhere" would be satisfied by a duplicate nobody meant to add.
    premise("top-level bullets parsed out of the file", all.length, 10);
    const stating = all.filter((b) => b.includes("TASK_AC_UNCLAIMED"));
    expect(`bullets stating the convention: ${stating.length}`).toBe(
      "bullets stating the convention: 1",
    );
    // Spec §4.2 constraint 3: this paragraph goes here and NOT in AGENTS.md.
    expect(readFileSync(AGENTS, "utf8").includes("TASK_AC_UNCLAIMED")).toBe(false);
  });

  it("AC-11: the bullet names both codes, the accept-set direction, and the decline", () => {
    const bullet = all.find((b) => b.includes("TASK_AC_UNCLAIMED")) ?? "";
    for (const required of [
      "TASK_AC_UNDECLARED",
      "accept-set",
      "already says",
      "silent by design",
    ]) {
      expect(`bullet states "${required}": ${bullet.includes(required)}`).toBe(
        `bullet states "${required}": true`,
      );
    }
  });

  it("AC-11: the counts it quotes are DERIVED from the committed records, not typed", () => {
    // The numbers move as the corpus does. Reading them off the records the arm
    // asserts against is what stops this paragraph becoming the stale figure the
    // provenance convention exists to prevent.
    const bullet = all.find((b) => b.includes("TASK_AC_UNCLAIMED")) ?? "";
    premise("records to derive the counts from", AC_AMBIGUOUS_RECORD.length, 0);
    premise("residue rows to derive the count from", AC_UNCLAIMED_RESIDUE.length, 0);
    // Anchored to the noun each count describes. A bare `13 ` would be
    // satisfied by any other thirteen in the paragraph, which is a coincidence
    // the assertion should not be able to live on.
    expect(
      `ambiguous count present: ${bullet.includes(`${AC_AMBIGUOUS_RECORD.length} lines today`)}`,
    ).toBe("ambiguous count present: true");
    expect(
      `residue count present: ${bullet.includes(`${AC_UNCLAIMED_RESIDUE.length} rows today`)}`,
    ).toBe("residue count present: true");
  });
});
