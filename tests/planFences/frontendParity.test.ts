/**
 * tests/planFences/frontendParity.test.ts — one core, two frontends.
 *
 * The gate (`tests/docs/_metaPlanSnippetFences.test.ts`) and the CLI
 * (`pnpm plan:fences`) must report the SAME findings over the same tree. Two
 * recognizers drift, and the drift surfaces as a developer whose local run is
 * clean while CI is red — the worst possible way to learn a gate exists.
 *
 * Plus the read-core purity pin, modelled on `tests/specLint/_metaPureCore.test.ts`:
 * `lib/planFences/**` does no I/O, so the rules stay testable as pure functions
 * and the frontends stay the only things that touch disk.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePlan } from "@/lib/planFences";
import { nonBaselined, scanTree } from "@/scripts/plan-fences";
import { premiseHolds } from "@/tests/_shared/premise";

const FIXTURES_ROOT = "tests/docs/fixtures/planFences";
const CORE_DIR = join(process.cwd(), "lib/planFences");
const FORBIDDEN = /["'`]node:(fs|child_process|process|net|http|https|os)(\/[A-Za-z/]+)?["'`]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("plan-fences frontend parity", () => {
  it("the CLI scan and a direct core scan agree, finding for finding", () => {
    const viaCli = scanTree(FIXTURES_ROOT).flatMap((r) => r.findings);
    const viaCore = readdirSync(FIXTURES_ROOT)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .flatMap((f) => {
        const p = join(FIXTURES_ROOT, f);
        return analyzePlan(p, readFileSync(p, "utf8")).findings;
      });

    // Premise: a comparison of two empty lists is not agreement about anything.
    premiseHolds("the fixture tree yields findings to compare", viaCore.length > 0);

    const key = (f: (typeof viaCore)[number]): string =>
      `${f.path}|${f.fenceLine}|${f.rule}|${f.instance}|${f.count}`;
    expect(viaCli.map(key).sort()).toEqual(viaCore.map(key).sort());
  });

  it("the CLI's baseline filter is the gate's predicate, not a second opinion", () => {
    // Every planted fixture finding is un-baselined (the baseline covers the
    // real corpus only), so the filter must pass all of them through.
    const planted = scanTree(FIXTURES_ROOT).flatMap((r) => r.findings);
    premiseHolds("planted findings exist to filter", planted.length > 0);
    expect(nonBaselined(planted).length).toBe(planted.length);
  });
});

describe("plan-fences pure core (structural)", () => {
  const files = walk(CORE_DIR);

  it("has files (walker sanity floor — an empty walk asserts nothing)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)("%s imports no I/O builtin", (file) => {
    const m = FORBIDDEN.exec(readFileSync(file, "utf8"));
    expect(m, m ? `forbidden import ${m[0]} in ${file}` : undefined).toBeNull();
  });
});
