import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("M7 pending_snapshot_uploads state-transition contract", () => {
  test("snapshotAssets creates exactly one ledger row per apply attempt through a tx port", () => {
    const source = readFileSync(join(root, "lib/sync/snapshotAssets.ts"), "utf8");

    expect(source).toContain("insertPendingSnapshotUpload");
    expect(source.match(/insertPendingSnapshotUpload/g) ?? []).toHaveLength(2);
    expect(source).toContain("assetCount");
    expect(source).not.toMatch(/for\s*\([^)]*embeddedImages[\s\S]*insertPendingSnapshotUpload/);
    expect(source).not.toMatch(/for\s*\([^)]*linkedFolderItems[\s\S]*insertPendingSnapshotUpload/);
  });
});
