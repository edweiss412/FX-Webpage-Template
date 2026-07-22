/**
 * tests/admin/dev/noCardRenderer.test.ts
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 8)
 *
 * The card renderer is gone: the gallery route is the switcher-driven real modal
 * (spec §3.6 REMOVED). This structural test fails-by-default if any deleted card
 * module reappears OR if any live source under app/ or components/ imports one,
 * so a regression cannot silently resurrect the parallel card surface.
 */
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const DELETED_FILES = [
  "components/admin/dev/ScenarioBlock.tsx",
  "components/admin/dev/GalleryCard.tsx",
  "app/admin/dev/attention-gallery/buildBlockProps.ts",
  "app/admin/dev/attention-gallery/params.ts",
];

// Import specifiers that would re-wire a live module to the removed surface.
const FORBIDDEN_SPECIFIERS = [
  "components/admin/dev/ScenarioBlock",
  "components/admin/dev/GalleryCard",
  "attention-gallery/buildBlockProps",
  "attention-gallery/params",
  "./buildBlockProps",
  "./params",
];

function walk(dir: string, acc: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === ".next-dev") continue;
      walk(p, acc);
    } else if (/\.tsx?$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("no card renderer", () => {
  test("every deleted card module is absent", () => {
    for (const rel of DELETED_FILES) {
      expect(existsSync(join(ROOT, rel)), `${rel} must not exist`).toBe(false);
    }
  });

  test("no live source under app/ or components/ imports a removed card module", () => {
    const files = [...walk(join(ROOT, "app"), []), ...walk(join(ROOT, "components"), [])];
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const spec of FORBIDDEN_SPECIFIERS) {
        // Match an import/from referencing the specifier (quote-delimited).
        if (new RegExp(`from\\s+["'][^"']*${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(src)) {
          offenders.push(`${f.replace(ROOT + "/", "")} -> ${spec}`);
        }
      }
    }
    expect(offenders, `removed card modules still imported:\n${offenders.join("\n")}`).toEqual([]);
  });
});
