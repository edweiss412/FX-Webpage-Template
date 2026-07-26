/**
 * tests/e2e/helpers/liveEntryToolchain.css.test.ts
 *
 * Unit cover for the CSS half of the live-entry toolchain helper
 * (plan 2026-07-26-ci-dark-coverage-pr1 Task 3).
 *
 * MEASURED CAVEAT, and it shapes every assertion below. `app/globals.css:1`
 * is `@import "tailwindcss"`, which turns on automatic content detection, and
 * `:17` then excludes `../tests`. Building this entry with and without its
 * `@source` lines produces **byte-identical** output (161016 both ways, zero
 * classes unique to either). So the CSS the CLI emits cannot distinguish a
 * helper that forwards sources from one that silently drops them.
 *
 * Asserting on the emitted stylesheet would therefore be VACUOUS — verified by
 * mutation: deleting the `@source` lines from the helper left an
 * output-based assertion green. These cases assert the helper's OWN behaviour
 * (the intermediate it writes, the guards it enforces) instead, which is what
 * the helper is actually responsible for.
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildEntryCss } from "./liveEntryToolchain";

const ROOT = process.cwd();

describe("buildEntryCss", () => {
  it("forwards every source into the entry CSS, ahead of the globals preamble", () => {
    const work = mkdtempSync(join(tmpdir(), "css-helper-"));
    const a = join(ROOT, "components", "admin", "CompactAlertCard.tsx");
    const b = join(ROOT, "tests", "e2e", "_compactAlertCardLiveEntry.tsx");

    buildEntryCss({ sources: [a, b], outFile: join(work, "out.css"), workDir: work });

    // The intermediate is the helper's actual output; the CLI's stylesheet is
    // insensitive to it (see the module header), so this is where a dropped
    // source is observable. Mutation-verified: removing the `@source` mapping
    // from the helper turns this red.
    const entry = readFileSync(join(work, "entry.css"), "utf8");
    expect(entry).toContain(`@source "${a}";`);
    expect(entry).toContain(`@source "${b}";`);
    expect(entry.indexOf(`@source "${a}";`)).toBeLessThan(entry.indexOf("@import"));
  });

  it("produces a stylesheet the CLI actually generated", () => {
    const work = mkdtempSync(join(tmpdir(), "css-helper-"));
    const outFile = join(work, "out.css");

    buildEntryCss({
      sources: [join(ROOT, "components", "admin", "CompactAlertCard.tsx")],
      outFile,
      workDir: work,
    });

    expect(existsSync(outFile)).toBe(true);
    const css = readFileSync(outFile, "utf8");
    // Proves the CLI ran and emitted a real sheet rather than copying the
    // input: the theme layer is compiled, and the source `@source` directives
    // are consumed rather than passed through.
    expect(css).toMatch(/--color-/);
    expect(css).not.toContain("@source ");
    expect(css.length).toBeGreaterThan(50_000);
  });

  it("rejects an empty source list rather than emitting an unstyled sheet", () => {
    const work = mkdtempSync(join(tmpdir(), "css-helper-"));
    expect(() =>
      buildEntryCss({ sources: [], outFile: join(work, "out.css"), workDir: work }),
    ).toThrow(/at least one source/i);
  });

  it("names a missing work directory", () => {
    expect(() =>
      buildEntryCss({
        sources: [join(ROOT, "components", "admin", "CompactAlertCard.tsx")],
        outFile: join(tmpdir(), "no-such-css-dir", "out.css"),
        workDir: join(tmpdir(), "no-such-css-dir"),
      }),
    ).toThrow(/work directory does not exist/i);
  });
});
