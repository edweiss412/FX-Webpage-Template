// Structural guard — every compileEntryCss caller runs under the font fixture.
//
// FAIL-BY-DEFAULT, by filesystem walk. A new harness spec that imports
// `@playwright/test` directly fails here rather than silently opting out of the
// oracle, which is the same property that makes the mutation-surface meta-test
// work: discovery is a walk, not a hand-maintained list, so a surface that did
// not exist when this was written is still covered.
//
// THE PREDICATE IS THE `test` BINDING, NOT A MODULE REFERENCE. A file that
// writes
//
//   import { test } from "@playwright/test";
//   import { expect } from "./helpers/fontFidelityFixture";
//
// references the fixture and still runs every case on base Playwright, so the
// oracle never attaches and every document it renders goes unchecked. A
// /from "…fontFidelityFixture"/ match returns true for exactly that file, which
// is a live escaping mutant against the obvious formulation.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const E2E_DIR = resolve(__dirname);
const FIXTURE = "fontFidelityFixture";

/**
 * Specs that call `compileEntryCss`, directly or through a helper that does.
 *
 * Walked from disk every run. The helper module itself and its own tests are
 * not specs and are excluded by extension.
 */
function specsCallingCompileEntryCss(): string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(E2E_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".spec.ts")) continue;
    const full = join(E2E_DIR, entry.name);
    if (readFileSync(full, "utf8").includes("compileEntryCss")) hits.push(entry.name);
  }
  return hits.sort();
}

/** Does any import statement bind `test` from a module whose path contains `module`? */
function bindsTestFrom(source: string, module: string): boolean {
  const pattern = new RegExp(
    String.raw`import\s*(?:type\s*)?\{[^}]*\btest\b[^}]*\}\s*from\s*["'][^"']*${module}["']`,
  );
  return pattern.test(source);
}

describe("font-fidelity fixture wiring", () => {
  const specs = specsCallingCompileEntryCss();

  test("the walk actually finds callers", () => {
    // Non-vacuity. A walk that found nothing would pass every assertion below
    // while proving nothing at all — the exact shape this file exists to catch
    // elsewhere.
    expect(specs.length).toBeGreaterThan(25);
  });

  test.each(specs)("%s binds `test` from the shared fixture", (name) => {
    const source = readFileSync(join(E2E_DIR, name), "utf8");
    expect(
      bindsTestFrom(source, "@playwright/test"),
      `${name} still binds \`test\` from @playwright/test, so the oracle never attaches to the ` +
        `documents it renders — import it from ./helpers/${FIXTURE} instead`,
    ).toBe(false);
    expect(
      bindsTestFrom(source, FIXTURE),
      `${name} does not bind \`test\` from ./helpers/${FIXTURE}`,
    ).toBe(true);
  });
});
