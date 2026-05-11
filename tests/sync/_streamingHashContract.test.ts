import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("M7 streaming/hash contract", () => {
  test("diagram snapshotting hashes bytes without Buffer.concat", () => {
    const snapshotAssets = readFileSync(join(root, "lib/sync/snapshotAssets.ts"), "utf8");
    const defaultSnapshotAssets = readFileSync(
      join(root, "lib/sync/defaultSnapshotAssetsForApply.ts"),
      "utf8",
    );
    const assetRecovery = readFileSync(join(root, "lib/sync/assetRecovery.ts"), "utf8");
    const boundedBytes = readFileSync(join(root, "lib/sync/boundedBytes.ts"), "utf8");
    expect(boundedBytes).toMatch(/createHash\("sha256"\)[\s\S]*sha256\.update\(/);
    expect(boundedBytes).toMatch(/createHash\("md5"\)[\s\S]*md5\.update\(/);
    expect(defaultSnapshotAssets).toContain("readBoundedWebStream");
    expect(defaultSnapshotAssets).toContain("readBoundedNodeStream");
    expect(assetRecovery).toContain("readBoundedWebStream");
    expect(assetRecovery).toContain("readBoundedNodeStream");
    expect(assetRecovery).toContain("mkdtemp");
    expect(assetRecovery).toContain("writeFile");
    expect(assetRecovery).toContain("readFile(asset.tempPath)");
    expect(assetRecovery).toContain("rm(verifiedRun.tmpDir");
    expect(snapshotAssets).not.toContain("Buffer.concat");
    expect(defaultSnapshotAssets).not.toContain("Buffer.concat");
    expect(assetRecovery).not.toContain("Buffer.concat");
    expect(boundedBytes).not.toContain("Buffer.concat");
    expect(snapshotAssets).not.toContain("arrayBuffer()");
    expect(defaultSnapshotAssets).not.toContain("arrayBuffer()");
    expect(assetRecovery).not.toContain("arrayBuffer()");
    expect(defaultSnapshotAssets).not.toContain('responseType: "arraybuffer"');
    expect(assetRecovery).not.toContain('responseType: "arraybuffer"');
  });
});
