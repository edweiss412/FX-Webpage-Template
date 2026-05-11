import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

const ALLOWED_STORAGE_PATH_SURFACES = [
  "lib/sync/snapshotAssets.ts",
  "lib/sync/diagramGc.ts",
  "lib/sync/assetRecovery.ts",
  "app/api/admin/snapshot-rollback/[id]/repair/route.ts",
] as const;

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

describe("M7 storage write surface contract", () => {
  test("diagram snapshot storage paths are confined to registered backend surfaces", () => {
    const surfaces = [...tsFiles("lib"), ...tsFiles("app")]
      .filter((path) => readFileSync(join(root, path), "utf8").includes("diagram-snapshots/shows"))
      .sort();

    expect(surfaces).toEqual([
      "lib/sync/assetRecovery.ts",
      "lib/sync/diagramGc.ts",
      "lib/sync/snapshotAssets.ts",
    ]);
    for (const surface of surfaces) {
      expect(ALLOWED_STORAGE_PATH_SURFACES).toContain(
        surface as (typeof ALLOWED_STORAGE_PATH_SURFACES)[number],
      );
    }
  });
});
