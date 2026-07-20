import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";

// Contract (spec §4.1.2): every synthetic fixture the serial writer places in
// fixtures/shows/raw/ carries CORPUS_TEMP_PREFIX, and the parallel corpus reader
// filters that prefix. Both sides are asserted against the SHARED constant (not
// against each other's source), so neither can drift silently. Failure mode
// caught: a fourth corpus write site with an unprefixed name (the reader would
// list it mid-overlap and fail its parse loop).
const reader = readFileSync("tests/help/fixture-range-parser.test.ts", "utf8");
const writer = readFileSync("tests/sync/dev-routing.test.ts", "utf8");

describe("corpus temp-prefix contract", () => {
  it("prefix constant is the ratified literal", () => {
    expect(CORPUS_TEMP_PREFIX).toBe("_temp-");
  });

  it("reader imports the shared constant and filters it", () => {
    expect(reader).toContain('from "../helpers/corpusTemp"');
    expect(reader).toContain("!file.startsWith(CORPUS_TEMP_PREFIX)");
  });

  it("every corpus write site uses a prefix-derived const; no literal filename bypass", () => {
    expect(writer).toContain('from "../helpers/corpusTemp"');
    const writeSites = [...writer.matchAll(/writeFile\(\s*join\(FIXTURE_DIR,\s*([A-Z_]+)\)/g)].map(
      (m) => m[1]!,
    );
    // 6 write calls across 3 const names today (dev-routing lines 94/301/380/404/447/470).
    expect(writeSites.length).toBeGreaterThanOrEqual(6);
    for (const name of new Set(writeSites)) {
      expect(writer, `${name} must be defined as \`\${CORPUS_TEMP_PREFIX}…\``).toMatch(
        new RegExp(`const ${name} = \`\\$\\{CORPUS_TEMP_PREFIX\\}[^\`]+\\.md\``),
      );
    }
    // No writeFile(join(FIXTURE_DIR, "literal.md")) escape hatch.
    expect(writer).not.toMatch(/writeFile\(\s*join\(FIXTURE_DIR,\s*["'`]/);
  });
});
