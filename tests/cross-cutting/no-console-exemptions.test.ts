// Phase 4 structural guard: pins the no-console exemption registry AND walks the runtime tree
// (app/+lib/+components/) for stray console.* CALLS via AST (comments/strings ignored — a text
// grep would false-positive on the `// console.error` comments that legitimately remain).
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";

const EXEMPT_GLOBS = [
  "scripts/**",
  "tests/**",
  "lib/log/logger.ts",
  "lib/log/persist.ts",
  "lib/observe/clientLog.ts",
] as const;

// The exempt FILES (not the glob dirs) that fall inside the walked app/+lib/+components/ tree.
const EXEMPT_IN_TREE = new Set([
  "lib/log/logger.ts",
  "lib/log/persist.ts",
  "lib/observe/clientLog.ts",
]);

function consoleCallLines(sf: SourceFile): number[] {
  const hits: number[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (
      Node.isPropertyAccessExpression(expr) &&
      /^console\.(log|warn|error|info|debug)$/.test(expr.getText())
    ) {
      hits.push(call.getStartLineNumber());
    }
  }
  return hits;
}

function findConsoleCalls(filePath: string, source: string): number[] {
  const sf = new Project({ useInMemoryFileSystem: true }).createSourceFile(filePath, source);
  return consoleCallLines(sf);
}

describe("no-console exemptions (Phase 4)", () => {
  test("eslint config: no-console error + the EXACT 5-file exemption", () => {
    const cfg = readFileSync("eslint.config.mjs", "utf8");
    expect(cfg).toMatch(/"no-console":\s*"error"/);
    // the no-console:off override block names exactly the 5 sanctioned surfaces
    const off = cfg.slice(
      cfg.indexOf('rules: { "no-console": "off" }') - 400,
      cfg.indexOf('rules: { "no-console": "off" }'),
    );
    for (const g of EXEMPT_GLOBS) expect(off).toContain(`"${g}"`);
  });

  test("AST negative control: a `// console.log` comment is NOT a call; a real call IS", () => {
    const fixture = `const x = 1;\n// console.log("nope")\nconst y = "console.error('also not a call')";\nconsole.log("yes");\n`;
    expect(findConsoleCalls("/virtual/fixture.ts", fixture)).toEqual([4]); // only the real call on line 4
  });

  test("NO stray console.* call in app/ + lib/ + components/ (AST walk)", () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths(["app/**/*.{ts,tsx}", "lib/**/*.ts", "components/**/*.{ts,tsx}"]);
    const cwd = process.cwd().replaceAll("\\", "/");
    const offenders: string[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = sf.getFilePath().replaceAll("\\", "/").replace(`${cwd}/`, "");
      if (EXEMPT_IN_TREE.has(rel) || rel.includes("/node_modules/") || rel.includes(".next"))
        continue;
      for (const ln of consoleCallLines(sf)) offenders.push(`${rel}:${ln}`);
    }
    expect(offenders).toEqual([]);
  });
});
