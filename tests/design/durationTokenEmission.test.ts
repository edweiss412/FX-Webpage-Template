import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

const NAMED_DURATIONS = ["instant", "fast", "normal", "slow"] as const;

// Compiles the REAL app/globals.css (via the fixture probe stylesheet, whose
// @source guarantees all four named duration classes are live candidates
// regardless of what app code currently uses) with the repo's own Tailwind
// CLI, and asserts every duration-* utility emits CSS wired to the motion
// tokens. Failure modes caught: wrong theme namespace
// (BL-DURATION-TOKENS-EMIT-NO-CSS — any of the four aliases deleted or
// renamed), or a Tailwind upgrade changing the `duration-<name>` resolution
// namespace. Source-regex checks cannot catch either; only the compiler's
// actual output can.
describe("duration token emission (compiled)", () => {
  const outDir = mkdtempSync(join(tmpdir(), "duration-token-emission-"));
  const outFile = join(outDir, "out.css");
  execFileSync(join(process.cwd(), "node_modules", ".bin", "tailwindcss"), [
    "-i",
    join(process.cwd(), "tests", "design", "fixtures", "duration-probe.css"),
    "-o",
    outFile,
  ]);
  const css = readFileSync(outFile, "utf8");

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  test.each([...NAMED_DURATIONS])(
    "duration-%s utility emits a rule bound to its alias var",
    (name) => {
      expect(css).toMatch(
        new RegExp(
          `\\.duration-${name}\\s*\\{[^}]*transition-duration:\\s*var\\(--transition-duration-${name}\\)`,
        ),
      );
    },
  );

  test.each([...NAMED_DURATIONS])(
    "alias var --transition-duration-%s chains to its source token",
    (name) => {
      expect(css).toMatch(
        new RegExp(`--transition-duration-${name}:\\s*var\\(--duration-${name}\\)`),
      );
    },
  );

  test("reduced-motion terminus zeroes the non-zero source tokens", () => {
    // --duration-instant is 0ms by value and is deliberately absent from the
    // reduced-motion override; fast/normal/slow are the ones it must rewrite.
    const rmBlock = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?--duration-fast:\s*0ms;[\s\S]*?--duration-normal:\s*0ms;[\s\S]*?--duration-slow:\s*0ms;/,
    );
    expect(
      rmBlock,
      "reduced-motion block must zero --duration-fast/--duration-normal/--duration-slow",
    ).not.toBeNull();
  });
});
