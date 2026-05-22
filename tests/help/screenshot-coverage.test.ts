import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";

const ROOT = process.cwd();
const HELP_ROOT = join(ROOT, "app", "help");

type ScreenshotRef = {
  file: string;
  line: number;
  name: string;
};

const SCREENSHOT_NAME_RE = /(<Screenshot)\s+[^>]*name=["']([^"']*)["']/g;

function walkMdx(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMdx(path));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      files.push(path);
    }
  }
  return files;
}

function collectScreenshotRefs(): ScreenshotRef[] {
  if (!existsSync(HELP_ROOT)) return [];

  const refs: ScreenshotRef[] = [];
  for (const abs of walkMdx(HELP_ROOT)) {
    const rel = abs.slice(ROOT.length + 1);
    const source = readFileSync(abs, "utf8");
    for (const match of source.matchAll(SCREENSHOT_NAME_RE)) {
      if (match.index === undefined) continue;
      refs.push({
        file: rel,
        line: source.slice(0, match.index).split("\n").length,
        name: match[2] ?? "",
      });
    }
  }
  return refs;
}

describe("help screenshot coverage Half A (Task F.8 / test #8)", () => {
  // F.11 Half B appends: non-empty walk assertion + on-disk WebP existence + un-skip M11-E-D5 stopgaps.
  it("every collected <Screenshot name=> reference is non-empty and resolves to a manifest entry", () => {
    const refs = collectScreenshotRefs();

    const manifestKeys = new Set(MANIFEST.map((entry) => entry.key));
    const violations: string[] = [];
    for (const ref of refs) {
      if (ref.name.trim() === "") {
        violations.push(`Screenshot has empty name attribute in ${ref.file}:${ref.line}`);
        continue;
      }

      if (!manifestKeys.has(ref.name)) {
        violations.push(
          `${ref.file}:${ref.line} references <Screenshot name="${ref.name}"> with no manifest entry`,
        );
      }
    }

    expect(violations, `Screenshot coverage violations:\n${violations.join("\n")}`).toEqual([]);
  });
});
