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
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

  it("runs the shared directive plugin — a use-server module is stubbed, not shipped (C2)", () => {
    // The CLI path had no plugin, so this is RED until bundleLiveEntry routes
    // through the plugin-capable child. namedDecl carries `"use server"`; its
    // body must be replaced by the plugin's throw, never bundled.
    const work = mkdtempSync(join(tmpdir(), "bundle-directive-"));
    const entry = join(work, "entry.tsx");
    const fixture = join(ROOT, "tests/e2e/helpers/__fixtures__/directive/namedDecl.ts");
    writeFileSync(entry, `import * as m from ${JSON.stringify(fixture)};\nconsole.log(m);\n`);
    const outFile = join(work, "bundle.js");

    bundleLiveEntry({ entry, outFile });

    const bundle = readFileSync(outFile, "utf8");
    expect(bundle).toContain("server action export f is not callable");
    expect(bundle).not.toContain("NAMED_BODY_SENTINEL");
  }, 60_000);

  it("writes a REAL esbuild metafile when metafilePath is given (C2)", () => {
    // RED until BundleOptions.metafilePath is wired. A fabricated stub would not
    // carry the entry, a react input, and 100+ keys all at once. Bundles the
    // packlist live entry (the deep graph C4's reality check measures — ~1900
    // inputs) so the ">100 keys" real-metafile check has ample margin.
    const work = mkdtempSync(join(tmpdir(), "bundle-metafile-"));
    const outFile = join(work, "bundle.js");
    const metafilePath = join(work, "meta.json");
    const entry = join(ROOT, "tests/e2e/_packListRescanLiveEntry.tsx");

    bundleLiveEntry({
      entry,
      outFile,
      aliases: { "node:crypto": join(ROOT, "tests/e2e/_nodeCryptoStub.ts") },
      metafilePath,
    });

    expect(existsSync(metafilePath)).toBe(true);
    const meta = JSON.parse(readFileSync(metafilePath, "utf8")) as {
      inputs: Record<string, unknown>;
    };
    const inputs = Object.keys(meta.inputs);
    expect(inputs.length).toBeGreaterThan(100);
    expect(inputs.some((p) => p.includes("_packListRescanLiveEntry"))).toBe(true);
    expect(
      inputs.some((p) => /node_modules\/.*\/react\//.test(p) || /node_modules\/react\//.test(p)),
    ).toBe(true);
  }, 60_000);
});
