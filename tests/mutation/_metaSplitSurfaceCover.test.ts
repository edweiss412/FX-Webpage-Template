// tests/mutation/_metaSplitSurfaceCover.test.ts
//
// Two registry rows share one `sourcePath`, and together they must cover exactly what
// the one row they replaced covered. `controlOutlineResidue` was split because it cost
// 4,413 s of child time and pinned the whole source matrix's makespan alone; splitting
// by OPERATOR is only sound if the operators partition.
//
// WHAT GOES WRONG WITHOUT THIS. A dropped operator is a silent jurisdiction shrink:
// the gate still passes, both rows still score, and a whole family of mutants simply
// stops being generated. A duplicated operator is the opposite and just as quiet --
// the same site scored twice, under two rows, each believing it owns the verdict.
// Neither shows up in a score, because a score is complete over the operators it was
// given and says nothing about the ones it was not.
//
// EVERY NUMBER HERE IS DERIVED. The whole-surface mutant count is generated from the
// UNION of the parts' operators rather than written down, so this cannot pass by
// matching a literal the split also wrote.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";
import { generateMutants } from "./source/generate";
import { OPERATOR_NAMES, enumerateSites, type OperatorName } from "./source/operators";
import { GUARD_SURFACES } from "./source/registry";

const PARTS = ["controlOutlineResidueRewrites", "controlOutlineResidueBoundaries"] as const;

const mutantCount = (path: string, text: string, ops: readonly OperatorName[]): number =>
  generateMutants(path, text, ops, enumerateSites(path, text, ops)).mutants.length;

describe("the split surface's two rows cover exactly what one row covered", () => {
  const rows = PARTS.map((id) => {
    const row = GUARD_SURFACES.find((s) => s.id === id);
    if (row === undefined) throw new Error(`${id} is not enrolled`);
    return row;
  });

  it("both halves name the same source file", () => {
    expect(new Set(rows.map((r) => r.sourcePath)).size).toBe(1);
  });

  it("the operator sets are DISJOINT, so no site is scored twice under two rows", () => {
    const [a, b] = rows.map((r) => new Set<string>(r.operators));
    const both = [...a!].filter((o) => b!.has(o));
    expect(both, "an operator declared by both halves scores its sites twice").toEqual([]);
  });

  it("their union is EXACTLY the operator vocabulary, so nothing is silently dropped", () => {
    const union = new Set(rows.flatMap((r) => r.operators as readonly string[]));
    expect([...union].sort()).toEqual([...OPERATOR_NAMES].sort());
  });

  it("their mutant counts sum to the whole surface's, derived rather than written down", () => {
    const path = rows[0]!.sourcePath;
    const text = readFileSync(path, "utf8");
    const union = [...new Set(rows.flatMap((r) => r.operators))] as OperatorName[];
    const whole = mutantCount(path, text, union);
    // PREMISE: a surface generating nothing would make the sum trivially equal.
    premiseHolds("the union generates mutants at all", whole > 0);
    const summed = rows.reduce((n, r) => n + mutantCount(path, text, r.operators), 0);
    expect(summed, "the halves generate a different population than the whole").toBe(whole);
  });

  it("every accepted row sits under the half that declares its operator", () => {
    // registry.ts:141-146 already enforces this at validation time; asserted here too
    // because the split is precisely the edit that could move a row to the wrong half,
    // and a validation error reads as a registry typo rather than as a bad split.
    for (const r of rows) {
      const declared = new Set<string>(r.operators);
      const strays = r.accepted.map((a) => a.siteId).filter((s) => !declared.has(s.split(":")[0]!));
      expect(strays, `${r.id} carries accepted rows for operators it does not declare`).toEqual([]);
    }
  });
});
