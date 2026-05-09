import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const lockHolderRegistry = [
  {
    path: "lib/sync/lockedShowTx.ts",
    holder: "withShowLock",
    layer: "JS-side transaction wrapper",
    key: "hashtext('show:' || drive_file_id)",
  },
  {
    path: "lib/sync/runScheduledCronSync.ts",
    holder: "processOneFile",
    layer: "delegates to withShowLock; processOneFile_unlocked never locks",
    key: "hashtext('show:' || drive_file_id)",
  },
] as const;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function tsFiles(path: string): string[] {
  const absolute = join(root, path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...tsFiles(child));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}

describe("M6 advisory-lock single-holder contract", () => {
  test("every M6 sync lock path is registered with the drive_file_id hashkey", () => {
    expect(lockHolderRegistry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          holder: "withShowLock",
          key: "hashtext('show:' || drive_file_id)",
        }),
        expect.objectContaining({
          holder: "processOneFile",
          layer: expect.stringContaining("delegates to withShowLock"),
        }),
      ]),
    );
    for (const entry of lockHolderRegistry) {
      expect(read(entry.path), `${entry.holder} registry row points at missing source`).toContain(
        entry.holder,
      );
    }
  });

  test("only lockedShowTx issues pg_advisory lock SQL in M6 runtime-owned code", () => {
    const runtimeSources = [
      ...tsFiles("lib/sync"),
      ...tsFiles("lib/drive"),
      ...tsFiles("app/api/cron"),
      ...tsFiles("app/api/drive"),
      ...tsFiles("app/api/admin/sync"),
      ...tsFiles("app/api/admin/staged"),
    ];
    const holders = runtimeSources
      .filter((path) => /\bpg_(?:try_)?advisory_xact_lock\s*\(/i.test(read(path)))
      .sort();

    expect(holders).toEqual(["lib/sync/lockedShowTx.ts"]);
    const source = read("lib/sync/lockedShowTx.ts");
    expect(source).toContain("hashtext('show:' ||");
    expect(source).not.toMatch(/show_id|slug/i);
  });
});
