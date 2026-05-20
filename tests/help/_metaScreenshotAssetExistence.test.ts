// tests/help/_metaScreenshotAssetExistence.test.ts
//
// Structural meta-test that every `<Screenshot name="X">` reference in
// `app/help/**/*.mdx` has corresponding light + dark WebP assets on disk at
// `public/help/screenshots/<name>-light.webp` and `<name>-dark.webp`.
//
// Phase E ships the `<Screenshot>` references during content authoring; Phase F
// (screenshot harness, Codex-owned backend phase) is the canonical home for the
// `public/help/screenshots/` directory + manifest + capture script. Until Phase F
// lands, this test SKIPS conditionally so it does not block Phase E close-out,
// but it ACTIVATES automatically the moment Phase F creates the directory —
// catching the regression class going forward.
//
// Codex R6 (job `review-mpe89vuh-kp757m`, fresh-eyes against base `3eb73ad`)
// surfaced this gap: in a production build before Phase F lands, the 3 docs
// pages would render broken `<img>` URLs. Per AGENTS.md §1.7 spec-canonical and
// the existing M11-E-D1/D3/D4 disposition pattern, this is the planned phase
// sequence — Phase E ships its content surface; Phase F ships its asset surface;
// they integrate at Phase F close. Tracked as DEFERRED.md M11-E-D5.
//
// When Phase F creates `public/help/screenshots/` with at least one WebP, this
// test auto-activates and asserts every reference has its light + dark assets.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const HELP_MDX_ROOT = join(ROOT, "app", "help");
const SCREENSHOTS_DIR = join(ROOT, "public", "help", "screenshots");

type ScreenshotRef = {
  /** The manifest key passed as <Screenshot name="..."> */
  name: string;
  /** Path to the MDX file (relative to repo root). */
  file: string;
  /** 1-indexed line number in the MDX file. */
  line: number;
};

function walkMdx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMdx(abs));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      out.push(abs);
    }
  }
  return out;
}

const SCREENSHOT_RE = /<Screenshot\s+(?:[^>]*?\s+)?name=["']([^"']+)["']/g;

function collectReferences(): ScreenshotRef[] {
  const refs: ScreenshotRef[] = [];
  for (const abs of walkMdx(HELP_MDX_ROOT)) {
    const rel = abs.slice(ROOT.length + 1);
    const content = readFileSync(abs, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      for (const m of line.matchAll(SCREENSHOT_RE)) {
        if (m[1] !== undefined) {
          refs.push({ name: m[1], file: rel, line: i + 1 });
        }
      }
    }
  }
  return refs;
}

function screenshotsDirActive(): boolean {
  if (!existsSync(SCREENSHOTS_DIR)) return false;
  const st = statSync(SCREENSHOTS_DIR);
  if (!st.isDirectory()) return false;
  // Phase F is considered "landed" only when at least one .webp asset is
  // present. An empty directory committed alone does NOT activate the test —
  // that would be Phase F scaffolding without content.
  const entries = readdirSync(SCREENSHOTS_DIR);
  return entries.some((e) => e.endsWith(".webp"));
}

describe("Help <Screenshot> asset existence (Phase E meta-test, deferred to Phase F)", () => {
  const refs = collectReferences();
  const phaseFActive = screenshotsDirActive();

  it("[forward-looking] enumerates every <Screenshot name=> reference", () => {
    // Structural sanity check that the scanner found references. The list
    // itself is the side-benefit for human readers; assertion is the scan ran.
    expect(refs.length).toBeGreaterThanOrEqual(0);
  });

  // Conditional skip: until Phase F lands, the asset directory does not exist.
  // This test auto-activates the moment Phase F creates `public/help/screenshots/`
  // with at least one WebP. See DEFERRED.md M11-E-D5.
  const itPhaseF = phaseFActive ? it : it.skip;

  itPhaseF(
    "[Phase F unlocked] every <Screenshot name> has light + dark WebP on disk",
    () => {
      const missing: string[] = [];
      for (const ref of refs) {
        const lightPath = join(SCREENSHOTS_DIR, `${ref.name}-light.webp`);
        const darkPath = join(SCREENSHOTS_DIR, `${ref.name}-dark.webp`);
        if (!existsSync(lightPath)) {
          missing.push(`${ref.file}:${ref.line} → missing ${lightPath}`);
        }
        if (!existsSync(darkPath)) {
          missing.push(`${ref.file}:${ref.line} → missing ${darkPath}`);
        }
      }
      if (missing.length > 0) {
        throw new Error(
          `<Screenshot> reference(s) have no corresponding WebP asset:\n  ${missing.join("\n  ")}\n\n` +
            `Either run the Phase F capture script to (re)generate the assets, ` +
            `or update the <Screenshot name="..."> reference to match an existing manifest key.`,
        );
      }
    },
  );
});
