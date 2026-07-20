import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Structural purity pin (spec §7): nothing under lib/specLint/ may import node:fs,
// node:child_process, or node:process — in ANY form. The single pattern covers bare
// imports, `from` clauses, require(), dynamic import(), template-literal specifiers,
// and subpaths (node:fs/promises), because every form contains the quoted-or-backticked
// specifier. Template: tests/observe/_metaReadOnlyQueryCore.test.ts (fails-by-default
// on new files via recursive walk).
const CORE_DIR = join(process.cwd(), "lib/specLint");
const FORBIDDEN = /["'`]node:(fs|child_process|process)(\/[A-Za-z/]+)?["'`]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("spec-lint pure core (structural)", () => {
  const files = walk(CORE_DIR);

  it("has files (walker sanity floor)", () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it.each(files)("%s imports no node:fs / node:child_process / node:process", (file) => {
    const src = readFileSync(file, "utf8");
    const m = FORBIDDEN.exec(src);
    expect(m, m ? `forbidden import ${m[0]} in ${file}` : undefined).toBeNull();
  });
});
