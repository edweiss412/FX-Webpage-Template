// Spec: docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md §3.1.4
//
// The reason `driveErrorStatus`'s shape reader was extracted to a leaf module is
// keeping the spreadsheet-export stack out of the hourly watch cron. NO
// behavioural test can observe that: importing the full helper from
// `lib/drive/fetch.ts` classifies every 404 shape identically and passes every
// other assertion in the suite. Only an import-graph assertion discriminates.
//
// It forbids the whole CHAIN rather than one edge: `fetch.ts` is merely the path
// that was noticed, and a direct import of `exportSheetToMarkdown` or of `xlsx`
// itself reintroduces the same cost while passing a fetch.ts-only guard.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

function importsOf(absPath: string): string[] {
  const src = readFileSync(absPath, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of src.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(REPO_ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null; // bare package specifier — reported by name, not walked
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/** Every package specifier reachable from `entry` through first-party files. */
function transitivePackages(entry: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      const resolved = resolveSpecifier(specifier, file);
      if (resolved === null) packages.add(specifier.split("/")[0]!);
      else queue.push(resolved);
    }
  }
  return packages;
}

describe("watch cron import graph", () => {
  it("lib/drive/watch.ts does not reach `xlsx` through any path", () => {
    const packages = transitivePackages(join(REPO_ROOT, "lib/drive/watch.ts"));
    expect(
      [...packages].filter((p) => p === "xlsx"),
      "The hourly watch cron must not load the spreadsheet-export stack. This " +
        "usually means something imported lib/drive/fetch.ts (which pulls in " +
        "exportSheetToMarkdown -> xlsx) instead of the leaf status-shape reader.",
    ).toEqual([]);
  });

  it("the leaf status-shape module has no imports at all", () => {
    const leaf = join(REPO_ROOT, "lib/drive/errorStatus.ts");
    expect(importsOf(leaf)).toEqual([]);
  });
});
