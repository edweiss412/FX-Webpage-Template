import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise } from "@/tests/_shared/premise";

/**
 * `scripts/lib/` spawns nothing except through the one declared seam.
 *
 * WHY THIS PARSES RATHER THAN PATTERN-MATCHES. A regex over source text drew a
 * different hole in four consecutive review rounds: it matched backticked prose
 * describing this very rule, it missed a side-effect `import "x";`, it missed
 * the bare `child_process` alias, and it missed an ordinary multiline import.
 * Each repair widened the pattern and the next probe found the next corner. The
 * parser resolves the grammar, so there are no corners left.
 */
const CORE_DIR = join(process.cwd(), "scripts/lib");
const BANNED = new Set(["child_process", "node:child_process"]);

/** The single declared spawn seam. An allowlist of one, named with its reason. */
const ALLOWED = new Set(["ledger-git.ts"]);

export function importsBanned(src: string, fileName: string): boolean {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (n: ts.Node): void => {
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      BANNED.has(n.moduleSpecifier.text)
    ) {
      found = true;
    }
    if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference) &&
      ts.isStringLiteral(n.moduleReference.expression) &&
      BANNED.has(n.moduleReference.expression.text)
    ) {
      found = true;
    }
    if (ts.isCallExpression(n)) {
      const isDynamic = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
      const arg = n.arguments[0];
      if ((isDynamic || isRequire) && arg && ts.isStringLiteral(arg) && BANNED.has(arg.text)) {
        found = true;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** The recognizer's own self-test, POSITIVE and NEGATIVE, beside the walk it gates. */
const SELF_TEST: ReadonlyArray<readonly [string, string, boolean]> = [
  ["node: static", 'import { execFileSync } from "node:child_process";', true],
  ["bare static", 'import { execFileSync } from "child_process";', true],
  ["multiline", 'import {\n  execFileSync,\n  spawnSync,\n} from "node:child_process";', true],
  ["side-effect", 'import "child_process";', true],
  ["require", 'const cp = require("child_process");', true],
  ["dynamic", 'const cp = await import("child_process");', true],
  ["type-only", 'import type { ChildProcess } from "child_process";', true],
  ["prose mention", " * a direct `node:child_process` call made here, so a guard", false],
  ["string literal", 'const s = "child_process";', false],
  ["decoy path", 'import x from "./my-child_process-helper";', false],
];

describe("scripts/lib spawns only through the declared seam", () => {
  const files = readdirSync(CORE_DIR).filter((n) => n.endsWith(".ts"));

  it("walker sanity floor — the walk reached the directory", () => {
    // The guard's own premise. Without it a mis-rooted or empty walk passes
    // vacuously, which is the failure mode a purity guard is least able to notice.
    premise("scripts/lib holds files", files.length, 6);
  });

  it.each(SELF_TEST)("recognizer: %s", (_label, src, expected) => {
    expect(importsBanned(src, "probe.ts")).toBe(expected);
  });

  it.each(files.filter((f) => !ALLOWED.has(f)))("%s imports no child_process", (file) => {
    expect(importsBanned(readFileSync(join(CORE_DIR, file), "utf8"), file)).toBe(false);
  });

  it("the allowlisted seam really does import it, so the allowlist is not dead", () => {
    // An allowlist entry that no longer needs to be there is a stale claim; this
    // fails if ledger-git.ts stops spawning, prompting removal rather than rot.
    for (const f of ALLOWED) {
      expect(importsBanned(readFileSync(join(CORE_DIR, f), "utf8"), f), f).toBe(true);
    }
  });
});
