/**
 * Defense 6 (spec 2026-07-20-show-scoped-alert-copy-design §3.5).
 *
 * `safeDougFacingTemplate` selects show-scoped copy with NO scope parameter.
 * That is sound only while it is reachable from exactly one place: the show
 * modal, via `deriveAttentionItems`. A second caller would silently inherit
 * show-scoped copy, so this pins the topology and fails on arrival of the
 * ambiguity rather than on a guess about it.
 *
 * Counts CALL SITES, not files, and counts them everywhere including the
 * defining module. An "expect zero external callers" assertion proves nothing:
 * it never counts the internal call, so deleting that call or aliasing the
 * function would pass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Both verified exports: walk at tests/styles/_classScanUtils.ts:7,
// stripComments at tests/styles/_classScanUtils.ts:15.
import { walk, stripComments } from "../styles/_classScanUtils";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib", "scripts"];

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (/\.tsx?$/.test(file)) out.push(file);
    }
  }
  return out;
}

function callSites(symbol: string): { file: string; count: number }[] {
  const out: { file: string; count: number }[] = [];
  for (const file of sourceFiles()) {
    // stripComments so a mention in a docstring is not a call site.
    const src = stripComments(readFileSync(file, "utf8"));
    // Exclude the DECLARATION: `export function safeDougFacingTemplate(`
    // otherwise matches and the defining file counts one too many.
    const withoutDecl = src.replace(
      new RegExp(`export\\s+(async\\s+)?function\\s+${symbol}\\s*\\(`, "g"),
      "",
    );
    const calls = withoutDecl.match(new RegExp(`\\b${symbol}\\s*\\(`, "g")) ?? [];
    // A bare reference without parens (passed as a callback, re-exported) is
    // ALSO a topology change, so count those too, minus the import statement.
    const refs = withoutDecl.match(new RegExp(`\\b${symbol}\\b`, "g")) ?? [];
    const imports = withoutDecl.match(new RegExp(`import[^;]*\\b${symbol}\\b[^;]*;`, "g")) ?? [];
    const total = Math.max(calls.length, refs.length - imports.length);
    if (total > 0) out.push({ file: file.replace(`${ROOT}/`, ""), count: total });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe("attention-items call topology", () => {
  it("safeDougFacingTemplate is referenced exactly once, inside its own module", () => {
    expect(callSites("safeDougFacingTemplate")).toEqual([
      { file: "lib/admin/attentionItems.ts", count: 1 },
    ]);
  });

  it("deriveAttentionItems is referenced exactly once, from the show modal", () => {
    // Its declaration is stripped before counting and it makes no recursive
    // call, so the defining module contributes zero.
    expect(callSites("deriveAttentionItems")).toEqual([
      { file: "app/admin/_showReviewModal.tsx", count: 1 },
    ]);
  });

  it("neither symbol is imported under an alias", () => {
    // The counter matches by name, so `import { x as y }` would evade it.
    // Rather than teach it to resolve aliases, forbid the alias form.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const sym of ["safeDougFacingTemplate", "deriveAttentionItems"]) {
        if (new RegExp(`\\b${sym}\\s+as\\s+\\w+`).test(src)) {
          offenders.push(`${file.replace(`${ROOT}/`, "")} aliases ${sym}`);
        }
      }
    }
    expect(offenders, "the topology gate matches by name; do not alias").toEqual([]);
  });
});
