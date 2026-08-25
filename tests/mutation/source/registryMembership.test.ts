// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUARD_SURFACES } from "./registry";

/**
 * Enrolment is opt-in, so an unenrolled surface is not "failing" — it is
 * untouched by the harness, silently. `pnpm mutation:guards` therefore has no
 * reason to fail before a row exists and may pass immediately after one lands,
 * and a command green on both sides of a change is not a red. THIS is the red:
 * an assertion that the surface IS registered, which fails by construction
 * until the row exists.
 */
describe("the render-fault detector is an enrolled guard surface", () => {
  const surface = GUARD_SURFACES.find((s) => s.sourcePath === "scripts/capture-render-fault.ts");

  it("has a registry row", () => {
    expect(
      surface,
      "scripts/capture-render-fault.ts must be enrolled in GUARD_SURFACES",
    ).toBeTruthy();
  });

  it("names suites that exist and that IMPORT the module", () => {
    // A source-scanning suite is not an import: the overlay would not apply,
    // and a dead overlay reports a PERFECT score with every other gate
    // condition passing. Existence alone cannot tell those apart, so the
    // specifier is derived from `sourcePath` and matched against the suite's
    // own text -- hardcoding the specifier would pass on a renamed module.
    const stem = (surface?.sourcePath ?? "").replace(/\.(ts|tsx|mts|cts|js|jsx)$/, "");
    expect(stem, "sourcePath must carry a module extension").not.toBe(surface?.sourcePath);

    expect(surface?.suitePaths.length ?? 0).toBeGreaterThan(0);
    for (const suitePath of surface?.suitePaths ?? []) {
      const abs = join(process.cwd(), suitePath);
      expect(existsSync(abs), `${suitePath} does not exist`).toBe(true);

      // `@/scripts/x`, `../../scripts/x` and `./x` all end in the same stem;
      // a suite that merely READS the file mentions it inside a string
      // argument, never after a `from`.
      const src = readFileSync(abs, "utf8");
      const tail = stem.split("/").slice(-2).join("/");
      const imports = /(?:^|\n)\s*(?:import[\s\S]*?from|export[\s\S]*?from)\s*["']([^"']+)["']/g;
      const specifiers = [...src.matchAll(imports)]
        .map((m) => m[1])
        .filter((s): s is string => s !== undefined);
      expect(
        specifiers.some((specifier) =>
          specifier.replace(/\.(ts|tsx|mts|cts|js|jsx)$/, "").endsWith(tail),
        ),
        `${suitePath} must IMPORT ${surface?.sourcePath}; found specifiers: ${specifiers.join(", ")}`,
      ).toBe(true);
    }
  });

  it("enumerates its operator subset rather than defaulting", () => {
    // The operator family is CLOSED and hand-enumerated. Each widening of a
    // recognizer is a bigger target for the next round.
    expect(surface?.operators.length ?? 0).toBeGreaterThan(0);
  });

  it("carries a control proving the overlay is live", () => {
    expect(surface?.control?.from).toBeTruthy();
    expect(surface?.control?.to).toBeTruthy();
    expect(surface?.control?.from).not.toBe(surface?.control?.to);
  });
});
