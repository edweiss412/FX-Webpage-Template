import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMutantLoadHook } from "./overlay";

const TARGET = "/repo/lib/specLint/taskContract.ts";
const MUTANT = "export const mutated = true;\n";

describe("mutant overlay load hook (spec §3.3, AC-3)", () => {
  /**
   * This is the harness's highest-consequence failure mode. If the hook fails
   * to recognise its target, every mutant silently runs against CLEAN source:
   * the suite passes every time, the harness reports a perfect score, and it
   * has tested nothing at all. A gate whose own failure mode is "reports
   * success while measuring nothing" is exactly what this arc exists to remove,
   * so the recognition rules are pinned individually rather than implied.
   */
  const hook = createMutantLoadHook(TARGET, MUTANT);

  it("serves the mutant for the exact resolved target id", () => {
    expect(hook(TARGET)).toBe(MUTANT);
  });

  it("serves the mutant when Vite appends a query suffix to the id", () => {
    // Vite routinely resolves ids with `?v=`, `?import`, and friends. An
    // equality-only check would miss these and silently fall through to the
    // clean file.
    expect(hook(`${TARGET}?v=1`)).toBe(MUTANT);
    expect(hook(`${TARGET}?import`)).toBe(MUTANT);
  });

  it("returns null for every other module, including near-miss paths", () => {
    for (const other of [
      "/repo/lib/specLint/parse.ts",
      "/repo/lib/specLint/taskContract.test.ts",
      "/repo/lib/specLint/taskContract.ts.map",
      "/other/taskContract.ts",
      "\0virtual:something",
    ]) {
      expect(hook(other), `${other} must not be overlaid`).toBeNull();
    }
  });

  it("does not match on a bare suffix, so a same-named file elsewhere is untouched", () => {
    // A tempting implementation is `id.endsWith("taskContract.ts")`. That would
    // overlay any same-named module in the graph and mutate the wrong file.
    expect(hook("/some/other/package/taskContract.ts")).toBeNull();
  });

  it("never writes to the target file — the tracked source is read-only to this harness (AC-4)", () => {
    const real = "lib/specLint/taskContract.ts";
    const before = readFileSync(real);
    const h = createMutantLoadHook(`${process.cwd()}/${real}`, MUTANT);
    h(`${process.cwd()}/${real}`);
    h("/unrelated.ts");
    expect(readFileSync(real).equals(before)).toBe(true);
  });
});
