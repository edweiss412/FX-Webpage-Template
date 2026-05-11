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
});
