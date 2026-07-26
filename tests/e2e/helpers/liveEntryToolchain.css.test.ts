/**
 * tests/e2e/helpers/liveEntryToolchain.css.test.ts
 *
 * Unit cover for the CSS half of the live-entry toolchain helper.
 *
 * MEASURED CAVEAT that shapes these assertions. `app/globals.css:1` is
 * `@import "tailwindcss"`, which turns on automatic content detection, and
 * `:17` then excludes `../tests`. Compiling an entry with and without its
 * `@source` lines produces **byte-identical** output (161016 both ways, zero
 * classes unique to either). So the emitted stylesheet cannot distinguish much
 * about what was fed in — asserting on its contents is close to vacuous, and
 * an earlier version of this file proved that by staying green under a
 * mutation that dropped the sources entirely.
 *
 * What IS the helper's responsibility, and what these cases pin: it runs the
 * LOCAL Tailwind binary against the entry it was given, writes the output
 * where it was told, and refuses bad inputs by name instead of surfacing an
 * opaque CLI error.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { compileEntryCss } from "./liveEntryToolchain";

const ROOT = process.cwd();

function entryFixture(): { work: string; entryCss: string } {
  const work = mkdtempSync(join(tmpdir(), "css-helper-"));
  const entryCss = join(work, "entry.css");
  writeFileSync(
    entryCss,
    `@source "${join(ROOT, "components", "admin", "CompactAlertCard.tsx")}";\n` +
      readFileSync(join(ROOT, "app", "globals.css"), "utf8"),
  );
  return { work, entryCss };
}

describe("compileEntryCss", () => {
  it("compiles the given entry into the given output", () => {
    const { work, entryCss } = entryFixture();
    const outFile = join(work, "out.css");

    compileEntryCss({ entryCss, outFile });

    expect(existsSync(outFile)).toBe(true);
    const css = readFileSync(outFile, "utf8");
    // Compiled, not copied: the theme layer is expanded and the `@source`
    // directive is consumed rather than passed through.
    expect(css).toMatch(/--color-/);
    expect(css).not.toContain("@source ");
    expect(css.length).toBeGreaterThan(50_000);
  });

  it("names a missing entry stylesheet", () => {
    const { work } = entryFixture();
    expect(() =>
      compileEntryCss({ entryCss: join(work, "nope.css"), outFile: join(work, "out.css") }),
    ).toThrow(/entry stylesheet does not exist/i);
  });

  it("names a missing output directory", () => {
    const { entryCss } = entryFixture();
    expect(() =>
      compileEntryCss({
        entryCss,
        outFile: join(tmpdir(), "no-such-css-out-dir", "out.css"),
      }),
    ).toThrow(/output directory does not exist/i);
  });
});
