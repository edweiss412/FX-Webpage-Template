import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("M7 streaming/hash contract", () => {
  test("diagram snapshotting hashes bytes without Buffer.concat", () => {
    const snapshotAssets = readFileSync(join(root, "lib/sync/snapshotAssets.ts"), "utf8");
    const sha256 = readFileSync(join(root, "lib/crypto/sha256.ts"), "utf8");

    expect(`${snapshotAssets}\n${sha256}`).toContain("createHash");
    expect(snapshotAssets).not.toContain("Buffer.concat");
  });
});
