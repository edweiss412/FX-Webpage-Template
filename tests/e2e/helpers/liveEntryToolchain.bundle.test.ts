/**
 * tests/e2e/helpers/liveEntryToolchain.bundle.test.ts
 *
 * Unit cover for the bundler half of the live-entry toolchain helper
 * (plan 2026-07-26-ci-dark-coverage-pr1 Task 1).
 *
 * What this catches: a helper that resolves nothing (an empty or stub bundle
 * still "succeeds" if you only assert the file exists), and a missing entry
 * surfacing as an opaque esbuild resolution error instead of a named one.
 */
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bundleLiveEntry } from "./liveEntryToolchain";

const ROOT = join(__dirname, "..", "..", "..");

describe("bundleLiveEntry", () => {
  it("bundles a live entry with explicit aliases, using the local binary", () => {
    const work = mkdtempSync(join(tmpdir(), "bundle-helper-"));
    const outFile = join(work, "bundle.js");

    bundleLiveEntry({
      entry: join(ROOT, "tests/e2e/_compactAlertCardLiveEntry.tsx"),
      outFile,
      aliases: {
        "node:crypto": join(ROOT, "tests/e2e/_nodeCryptoStub.ts"),
        "next/navigation": join(ROOT, "tests/e2e/_nextNavigationStub.ts"),
      },
    });

    expect(existsSync(outFile)).toBe(true);
    // A real bundle of this component tree is ~900kb. Asserting a floor rather
    // than mere existence is what makes an empty/stub output fail.
    expect(statSync(outFile).size).toBeGreaterThan(100_000);
  }, 60_000);

  it("names a missing entry instead of surfacing a raw resolution error", () => {
    expect(() =>
      bundleLiveEntry({
        entry: join(ROOT, "tests/e2e/_thisEntryDoesNotExist.tsx"),
        outFile: join(mkdtempSync(join(tmpdir(), "bundle-helper-")), "bundle.js"),
      }),
    ).toThrow(/entry does not exist/i);
  });

  it("names a missing output directory", () => {
    expect(() =>
      bundleLiveEntry({
        entry: join(ROOT, "tests/e2e/_compactAlertCardLiveEntry.tsx"),
        outFile: join(tmpdir(), "no-such-dir-for-live-entry-helper", "bundle.js"),
      }),
    ).toThrow(/output directory does not exist/i);
  });
});
