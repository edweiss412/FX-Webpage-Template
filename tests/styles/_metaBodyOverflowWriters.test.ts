/**
 * Only lib/ui/scrollLock.ts writes `document.body.style.overflow`.
 *
 * Crew page redesign spec §5.2: dialogs nest inside the section sheet, and
 * per-dialog save-and-restore of the body's overflow leaves the page locked
 * whenever two of them close out of order. The reference-counted lock fixes
 * that only if nothing else writes the property, so this walks every source
 * file under app/, components/ and lib/ and fails on any other writer.
 *
 * Detection covers plain assignment and `setProperty("overflow", ...)` on
 * `body.style`, with comments stripped first. A writer reached through an alias
 * (`const s = document.body.style; s.overflow = ...`) is outside what this
 * scan can see; that is a documented limit, not a supported pattern.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";
import { premise } from "../_shared/premise";

const ROOT = process.cwd();
const LOCK_MODULE = "lib/ui/scrollLock.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(rel)) out.push(rel);
  }
  return out;
}

const WRITER = /body\.style\.overflow\s*=(?!=)|body\.style\.setProperty\(\s*["'`]overflow["'`]/;

/** Every file whose comment-stripped source writes the body's overflow. */
function overflowWriters(files: ReadonlyArray<{ file: string; source: string }>): string[] {
  return files
    .filter(({ file, source }) => WRITER.test(stripCommentsForFile(source, file)))
    .map(({ file }) => file);
}

const SOURCES = ["app", "components", "lib"].flatMap((dir) =>
  walk(dir).map((file) => ({ file, source: readFileSync(join(ROOT, file), "utf8") })),
);

describe("body overflow writers", () => {
  it("finds the lock module itself", () => {
    // PREMISE: the walk reached lib/ and the pattern matches the one real
    // writer; otherwise an empty result below would prove nothing.
    premise("files walked", SOURCES.length, 100);
    expect(overflowWriters(SOURCES)).toContain(LOCK_MODULE);
  });

  it("finds no writer but the lock module", () => {
    expect(overflowWriters(SOURCES).filter((file) => file !== LOCK_MODULE)).toEqual([]);
  });

  it("reports a planted fifth writer", () => {
    const planted = {
      file: "components/planted/Planted.tsx",
      source: 'export function f() {\n  document.body.style.overflow = "hidden";\n}\n',
    };
    expect(overflowWriters([...SOURCES, planted])).toContain(planted.file);
  });

  it("ignores a comparison and a comment", () => {
    const quiet = {
      file: "components/planted/Quiet.tsx",
      source:
        "// document.body.style.overflow = 'hidden'\nexport const locked = () => document.body.style.overflow === \"hidden\";\n",
    };
    expect(overflowWriters([quiet])).toEqual([]);
  });
});
