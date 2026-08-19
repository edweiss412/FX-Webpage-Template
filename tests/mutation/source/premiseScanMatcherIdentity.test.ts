import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise } from "../../_shared/premise";

/**
 * AC-6, structural half — the scanner holds exactly ONE registrar-name matcher.
 *
 * `HOOK_REGISTRARS` (premiseScan.ts:66) is consulted by the top-level hook seed,
 * and `hookBodies` carried a SECOND, textually identical regex literal. Two
 * matchers where the design assumes one is a drift the behavioural fixtures
 * cannot detect: all four registrars are already covered by enumerated cases
 * (premiseScan.test.ts:2929, :2955), so editing either matcher reds those
 * instead. The property is a property of the SOURCE, so it is asserted there.
 *
 * Plan: docs/superpowers/plans/2026-08-19-premisescan-nested-hook-sibling-leak.md
 */
const SCANNER = join(__dirname, "premiseScan.ts");
const REGISTRAR_NAMES = /beforeEach|beforeAll|afterEach|afterAll/;

/** Every regex literal in the scanner whose pattern names a hook registrar. */
function registrarLiterals(): { line: number; text: string }[] {
  const source = readFileSync(SCANNER, "utf8");
  // The assertion below is about what this file CONTAINS. If it were empty or
  // unreadable the count would be zero and the test would pass while proving
  // nothing, so the premise is stated executably rather than assumed.
  premise("the scanner source was read", source.length, 0);

  const sf = ts.createSourceFile("premiseScan.ts", source, ts.ScriptTarget.Latest, true);
  const found: { line: number; text: string }[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isRegularExpressionLiteral(node) && REGISTRAR_NAMES.test(node.text)) {
      found.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        text: node.text,
      });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

describe("AC-6 — one registrar matcher, not two", () => {
  it("the scanner declares the registrar names exactly once", () => {
    const literals = registrarLiterals();
    // Reported with their lines: a bare count tells whoever reds this nothing
    // about where the second declaration is.
    expect(literals.map((l) => `${l.line}: /${l.text}/`)).toHaveLength(1);
  });
});
