// tests/paneCompaction/literalSubstitution.test.ts
//
// Diff round 3, core finding 1 (P1). Three substitutions passed a runtime value
// as `String.replace`'s REPLACEMENT STRING, where `$&`, "$`", "$'" and `$1` are
// syntax rather than characters. Fixing those three closes the instances; this
// closes the CLASS, so a fourth site cannot reintroduce it.
//
// Derived rather than enumerated: the check walks the AST of both send-path
// source files and judges every `.replace`/`.replaceAll` call it finds, so a
// new call site is covered the moment it is written. A literal replacement is
// fine (it has no runtime value to misread) and so is a replacer FUNCTION
// (which has no substitution grammar at all). Anything else -- an identifier, a
// property access, a template -- is the defect.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import { premiseHolds } from "@/tests/_shared/premise";

// DELIBERATELY NOT ENROLLED in `paneCompactionCore`'s `suitePaths`, and that is a
// claim rather than an oversight. The mutant overlay is a Vite plugin that
// rewrites the MODULE GRAPH; this file reads the source off DISK with
// `readFileSync`, so under a mutant run it would read the unmutated bytes and
// pass unconditionally. Enrolling it would buy zero kills, cost a run per
// mutant, and -- the part that matters -- would show up in the suite list as
// coverage it cannot provide. It is a static guard about the shape of the
// source, which is a different job from pinning behaviour, and it belongs
// outside the mutation loop.
const FILES = ["scripts/lib/pane-compaction-core.ts", "scripts/pane-compaction.ts"];

type Call = { file: string; line: number; text: string; ok: boolean };

function replaceCalls(file: string): Call[] {
  const abs = join(process.cwd(), file);
  const src = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
  const out: Call[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "replace" || node.expression.name.text === "replaceAll")
    ) {
      const arg = node.arguments[1];
      const ok =
        arg !== undefined &&
        (ts.isStringLiteral(arg) ||
          ts.isNoSubstitutionTemplateLiteral(arg) ||
          ts.isArrowFunction(arg) ||
          ts.isFunctionExpression(arg));
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      out.push({ file, line: line + 1, text: node.getText(src).slice(0, 90), ok });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

describe("every substitution inserts its value as CHARACTERS (diff r3 F1)", () => {
  const calls = FILES.flatMap(replaceCalls);

  it("finds call sites to judge, so a silent zero-scan cannot pass", () => {
    // The premise this guard needs: without it, a renamed file or a broken
    // walker reports "no offenders" and reads exactly like a clean bill.
    premiseHolds("the AST walk found replace call sites", calls.length > 0);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("passes no runtime value as a replacement STRING", () => {
    const offenders = calls.filter((c) => !c.ok).map((c) => `${c.file}:${c.line}  ${c.text}`);
    expect(offenders).toEqual([]);
  });
});
