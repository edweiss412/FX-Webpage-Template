/**
 * tests/docs/_metaNoConflictMarkers.test.ts
 *
 * No tracked text file may carry leftover merge-conflict markers.
 *
 * This exists because the ledger meta-tests demonstrably do NOT catch them. An
 * unresolved arm was left wrapping two graduated entries in `BACKLOG-archive.md`
 * through several review rounds, and every ledger assertion stayed green the
 * whole time: the headings and provenance strings remain discoverable INSIDE the
 * conflict arm, so a guard that greps for content finds it and reports success
 * while the document is corrupt. `git diff --check` would have caught it, but
 * nothing in CI runs it over these files.
 *
 * Derived, not enumerated: the file list comes from `git ls-files`, so a new
 * tracked file is covered the moment it exists rather than when someone
 * remembers to add it here.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { premise } from "@/tests/_shared/premise";

const REPO_ROOT = path.resolve(__dirname, "../..");

/** Extensions whose bytes are not line-oriented text; scanning them is noise. */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".zip",
  ".xlsx",
  ".mp4",
  ".webm",
]);

/** A marker only counts at line start — prose may legitimately quote one. */
const MARKER_RE = /^(?:<{7}|={7}|>{7})(?:\s|$)/;

/**
 * The same marker AFTER a markdown formatter has been over it.
 *
 * Prettier reads `>>>>>>> origin/main` as a seven-deep blockquote and rewrites
 * it as `> > > > > > > origin/main`. The document is still corrupt — a merge
 * arm nobody resolved — but the contiguous form above no longer matches, so the
 * guard reports clean. That is not hypothetical: this repo carried exactly one
 * such line in `BACKLOG-archive.md`, and it survived every ledger assertion AND
 * this guard until a cross-model reviewer read the file by eye.
 *
 * Only the `>` arm needs this. `<<<<<<<` and `=======` are not blockquote or
 * heading syntax, so a formatter leaves them contiguous.
 */
const MANGLED_MARKER_RE = /^(?:>\s){6}>(?:\s|$)/;

/** True when `line` is a conflict marker in either the raw or formatted shape. */
export function looksLikeConflictMarker(line: string): boolean {
  return MARKER_RE.test(line) || MANGLED_MARKER_RE.test(line);
}

function trackedTextFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\0")
    .filter((rel) => rel.length > 0)
    .filter((rel) => !BINARY_EXTENSIONS.has(path.extname(rel).toLowerCase()));
}

describe("no leftover merge-conflict markers", () => {
  it("no tracked text file carries a conflict marker at line start", () => {
    const files = trackedTextFiles();
    // A walk that returned nothing would pass vacuously, which is the one way
    // this guard could silently stop guarding.
    premise("tracked text files discovered", files.length, 100);

    const offenders: string[] = [];
    for (const rel of files) {
      const absolute = path.join(REPO_ROOT, rel);
      let body: string;
      try {
        if (!statSync(absolute).isFile()) continue;
        body = readFileSync(absolute, "utf8");
      } catch {
        continue; // submodule, symlink, or deleted-but-tracked: not our subject
      }
      // The cheap pre-filter has to admit the mangled shape too, or the very
      // line this guard was extended for is skipped before it is ever tested.
      if (
        !body.includes("<<<<<<<") &&
        !body.includes(">>>>>>>") &&
        !body.includes("=======") &&
        !body.includes("> > > > > > >")
      ) {
        continue;
      }
      body.split("\n").forEach((line, index) => {
        if (looksLikeConflictMarker(line))
          offenders.push(`${rel}:${index + 1}: ${line.slice(0, 40)}`);
      });
    }

    expect(offenders, `leftover conflict markers:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("recognises a marker a markdown formatter has re-spaced", () => {
    // The walk above passes once the repo is clean, so it cannot show that the
    // MANGLED shape is recognised at all. This is the discriminating half.
    expect(looksLikeConflictMarker(">>>>>>> origin/main")).toBe(true);
    expect(looksLikeConflictMarker("> > > > > > > origin/main")).toBe(true);
    expect(looksLikeConflictMarker("<<<<<<< HEAD")).toBe(true);
    expect(looksLikeConflictMarker("=======")).toBe(true);
  });

  it("does not fire on ordinary blockquotes or on prose that quotes a marker", () => {
    // Seven levels is the marker; six is a (preposterous but legal) blockquote,
    // and a marker quoted mid-line is prose — this file's own docblock does it.
    expect(looksLikeConflictMarker("> > > > > > quoted six deep")).toBe(false);
    expect(looksLikeConflictMarker("> quoted")).toBe(false);
    expect(looksLikeConflictMarker("the marker `>>>>>>>` appears mid-sentence")).toBe(false);
    expect(looksLikeConflictMarker(">>>>>>>>")).toBe(false);
  });
});
