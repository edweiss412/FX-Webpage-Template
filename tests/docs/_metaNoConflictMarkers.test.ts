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
      if (!body.includes("<<<<<<<") && !body.includes(">>>>>>>") && !body.includes("=======")) {
        continue;
      }
      body.split("\n").forEach((line, index) => {
        if (MARKER_RE.test(line)) offenders.push(`${rel}:${index + 1}: ${line.slice(0, 40)}`);
      });
    }

    expect(offenders, `leftover conflict markers:\n${offenders.join("\n")}`).toEqual([]);
  });
});
