import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// PR E lever B: the report-fixtures + validation CLI harnesses spawn tsx in a hot
// path (validation-report-fixtures spawns 42-66 children). Pin the direct-bin
// convention so a regression back to `npx tsx` (npx resolver cold-start
// ~0.25-0.5s/spawn) can't silently creep into tests/scripts.
const SCRIPTS_DIR = join(process.cwd(), "tests", "scripts");

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? tsFiles(join(dir, e.name))
      : /\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

// Any child-process call whose COMMAND literal is "npx" — catches spawn/spawnSync/
// exec/execSync/execFile/execFileSync, single- or double-quoted, regardless of how
// the args array is formatted (multiline included).
const SPAWNS_NPX = /(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*["']npx["']/;
const USES_TSX_BIN = /node_modules[/\\]\.bin[/\\]tsx|\bTSX_BIN\b/;

const files = tsFiles(SCRIPTS_DIR);

describe("tests/scripts spawns tsx via the absolute bin, never `npx`", () => {
  it("discovers the script files (anti-vacuity)", () => {
    expect(files.length).toBeGreaterThan(3);
    expect(files.some((f) => f.endsWith("_report-fixtures-helpers.ts"))).toBe(true);
  });

  it.each(files)("%s: does not spawn `npx`", (file) => {
    expect(
      SPAWNS_NPX.test(readFileSync(file, "utf8")),
      `${file} spawns npx — use the absolute tsx bin (join(REPO_ROOT,'node_modules/.bin/tsx'))`,
    ).toBe(false);
  });

  // Positive: every file that runs a tsx child must reference the absolute bin
  // (so the convention is asserted, not just the absence of npx). A file
  // "runs tsx" if it passes --tsconfig or `-e` to a child it spawns AND mentions tsx.
  const tsxRunners = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return (
      /(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/.test(src) && /tsx/.test(src)
    );
  });

  it("finds the known tsx-spawning harnesses (anti-vacuity)", () => {
    expect(tsxRunners.some((f) => f.endsWith("_report-fixtures-helpers.ts"))).toBe(true);
    expect(tsxRunners.length).toBeGreaterThanOrEqual(4);
  });

  it.each(tsxRunners)("%s: spawns tsx via node_modules/.bin/tsx", (file) => {
    expect(
      USES_TSX_BIN.test(readFileSync(file, "utf8")),
      `${file} runs tsx but not via the absolute bin (TSX_BIN / node_modules/.bin/tsx)`,
    ).toBe(true);
  });
});
