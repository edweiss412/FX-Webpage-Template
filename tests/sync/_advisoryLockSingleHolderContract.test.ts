import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
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
  });

  test("only lockedShowTx issues pg_advisory lock SQL in M6 sync code", () => {
    const syncSources = ["lib/sync/lockedShowTx.ts", "lib/sync/runScheduledCronSync.ts"];
    const holders = syncSources.filter((path) => /\bpg_(?:try_)?advisory_xact_lock\s*\(/i.test(read(path)));

    expect(holders).toEqual(["lib/sync/lockedShowTx.ts"]);
    const source = read("lib/sync/lockedShowTx.ts");
    expect(source).toContain("hashtext('show:' ||");
    expect(source).not.toMatch(/show_id|slug/i);
  });
});
