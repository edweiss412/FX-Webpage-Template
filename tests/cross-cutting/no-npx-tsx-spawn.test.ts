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
  // "runs tsx" if it spawns a child AND names the tsx BINARY.
  //
  // FIDELITY: `tsx` must be a command token, never the `.tsx` React extension.
  // A bare /tsx/ matched `src/Real.tsx` in a COMMENT and classified a file that
  // spawns `node` as a tsx runner (lineKeyCensus.test.ts, 2026-08-28). The
  // lookbehind rejects a preceding dot or word character, so `Real.tsx` and
  // `foo_tsx` do not match while `.bin/tsx`, `npx tsx` and `"tsx"` all do.
  // This NARROWS to the guard's stated intent; it does not weaken it, and
  // MENTIONS_TSX_BINARY is exercised in both directions below.
  // `TSX_BIN` is the constant the convention itself prescribes, so a file using
  // only it still RUNS tsx and must be classified. Caught by the positive
  // control below, which failed on the first draft of this predicate.
  const MENTIONS_TSX_BINARY = /(?<![.\w])tsx\b|\bTSX_BIN\b/;
  const SPAWNS_CHILD = /(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/;
  const tsxRunners = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return SPAWNS_CHILD.test(src) && MENTIONS_TSX_BINARY.test(src);
  });

  // Controls on the predicate itself. Without these the narrowing is a claim
  // about a regex rather than a tested property of it.
  it("POSITIVE CONTROL: a real bare-tsx spawn is still classified as a runner", () => {
    const real = [
      'execFileSync("npx", ["tsx", "x.ts"])',
      'spawnSync(TSX_BIN, ["x.ts"])',
      'execFileSync(join(root, "node_modules", ".bin", "tsx"), [])',
      "// invoke the repo's tsx bin\nexecSync(cmd)",
    ];
    for (const src of real)
      expect(
        SPAWNS_CHILD.test(src) && MENTIONS_TSX_BINARY.test(src),
        `should classify as a tsx runner: ${src}`,
      ).toBe(true);
  });

  it("NEGATIVE CONTROL: a .tsx path in a comment plus a child spawn is NOT a runner", () => {
    // The exact misfire this narrowing repairs.
    const src = 'execFileSync("node", [p]);\n// the row at src/Real.tsx:10 and src/Real.tsx:22';
    expect(SPAWNS_CHILD.test(src), "the sample must still spawn a child").toBe(true);
    expect(/tsx/.test(src), "the OLD bare predicate would have matched").toBe(true);
    expect(MENTIONS_TSX_BINARY.test(src), "the narrowed predicate must not match").toBe(false);
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
