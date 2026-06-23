import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

// inlined from tests/sync/runScheduledCronSync.test.ts:216-248 (not exported there) — narrows to ONE method's text
function methodText(className: string, methodName: string): string {
  const text = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
  const sf = ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.MethodDeclaration | null = null;
  const visit = (n: ts.Node): void => {
    if (ts.isClassDeclaration(n) && n.name?.text === className) {
      for (const m of n.members) {
        if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === methodName) {
          found = m;
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error(`${className}.${methodName} not found`);
  return (found as ts.MethodDeclaration).getText(sf);
}

describe("R20 live-wiring source-scan guards", () => {
  it("applyShowSnapshot reads shows_internal.run_of_show and returns it as priorRunOfShow", () => {
    const src = methodText("PostgresPipelineTx", "applyShowSnapshot");
    expect(src).toMatch(/run_of_show[\s\S]*from\s+public\.shows_internal/i); // the LIVE select exists
    expect(src).toMatch(/priorRunOfShow\s*:/); // wired into the return
    // RED before impl: applyShowSnapshot has no shows_internal.run_of_show select → production never emits AGENDA_DAY_EMPTIED.
  });
  it("upsertShowsInternal writes run_of_show ($5::jsonb + excluded.run_of_show)", () => {
    const src = methodText("PostgresPipelineTx", "upsertShowsInternal");
    expect(src).toMatch(/run_of_show/);
    expect(src).toMatch(/\$5::jsonb/);
    expect(src).toMatch(/run_of_show\s*=\s*excluded\.run_of_show/i); // actually WRITTEN, not just SELECT-listed
    // RED before impl: the upsert has no run_of_show column → the sync never persists the computed value.
  });
});
