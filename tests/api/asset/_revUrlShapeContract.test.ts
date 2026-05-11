import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function tsFiles(path: string): string[] {
  const absolute = join(root, path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...tsFiles(child));
    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

describe("M7 diagram asset revision URL shape", () => {
  test("asset routes reject key-value revision segments and never emit r-prefixed URLs", () => {
    const route = readFileSync(
      join(root, "app/api/asset/diagram/[show]/[rev]/[key]/route.ts"),
      "utf8",
    );
    expect(route).toContain('rev.includes("=")');

    const assetSources = tsFiles("app/api/asset")
      .map((path) => [path, readFileSync(join(root, path), "utf8")] as const)
      .filter(([, source]) => source.includes("/api/asset/diagram/") || source.includes("r=${"));

    expect(assetSources).toEqual([]);
  });

  test("crew-facing components emit `/api/asset/diagram/<show>/<bare-uuid>/<key>` with no `r=` prefix", () => {
    // Component-emission arm of the M7 §13 meta-test. The diagram-asset
    // route hard-rejects `r=`-prefixed rev segments with 410; this test
    // pins the symmetric contract on the EMISSION side so a careless
    // refactor of the Gallery URL builder cannot start producing URLs
    // the route would reject. Every `components/**` source that
    // references `/api/asset/diagram/` MUST interpolate the rev segment
    // as a bare value (no `r=`, no `?rev=`, no `key=`).
    const components = tsFiles("components");
    const offenders: { path: string; line: number; snippet: string }[] = [];
    const targetRe = /\/api\/asset\/diagram\/[^\n]*/;
    const banned = /\/api\/asset\/diagram\/[^\n]*(?:r=|\?|key=)/;
    for (const path of components) {
      const source = readFileSync(join(root, path), "utf8");
      if (!targetRe.test(source)) continue;
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        if (banned.test(line)) {
          offenders.push({ path, line: i + 1, snippet: line.trim() });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("agenda asset route + reel asset route are referenced only as bare proxy URLs", () => {
    // Sibling proxy URLs follow the same shape contract: `[fileId]` /
    // `[show]` are bare path segments, never `?id=` / `?show=` query
    // params. Lock the contract for all three proxy routes so a future
    // refactor doesn't accidentally introduce a query-style variant.
    const components = tsFiles("components");
    const offenders: { path: string; line: number; snippet: string }[] = [];
    const banned = /\/api\/asset\/(?:agenda|reel)\/[^\n]*\?/;
    for (const path of components) {
      const source = readFileSync(join(root, path), "utf8");
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        if (banned.test(line)) offenders.push({ path, line: i + 1, snippet: line.trim() });
      }
    }
    expect(offenders).toEqual([]);
  });
});
