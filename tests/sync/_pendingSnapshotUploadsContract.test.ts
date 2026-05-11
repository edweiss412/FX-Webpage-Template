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

  test("promotion claims only unclaimed, unpromoted, non-delete, non-promoting rows", () => {
    const source = readFileSync(join(root, "lib/sync/promoteSnapshot.ts"), "utf8");

    expect(source).toMatch(
      /set\s+claim_token\s*=\s*gen_random_uuid\(\)[\s\S]*claim_expires_at\s*=\s*now\(\)\s*\+\s*interval '5 minutes'[\s\S]*promote_started_at\s*=\s*now\(\)/i,
    );
    expect(source).toMatch(
      /where\s+snapshot_revision_id\s*=\s*\$1::uuid[\s\S]*and\s+claim_token\s+is\s+null[\s\S]*and\s+delete_started_at\s+is\s+null[\s\S]*and\s+promote_started_at\s+is\s+null/i,
    );
  });

  test("GC reclaims only expired claims outside delete and promote windows", () => {
    const source = readFileSync(join(root, "lib/sync/diagramGc.ts"), "utf8");

    expect(source).toMatch(/claim_expires_at\s*<\s*\$1::timestamptz/i);
    expect(source).toMatch(/promoted_at\s+is\s+null/i);
    expect(source).toMatch(/delete_started_at\s+is\s+null/i);
    expect(source).toMatch(/promote_started_at\s+is\s+null/i);
  });

  test("GC delete transition requires claim ownership and pending promotion exclusion", () => {
    const source = readFileSync(join(root, "lib/sync/diagramGc.ts"), "utf8");

    expect(source).toMatch(/set\s+delete_started_at\s*=\s*\$3::timestamptz/i);
    expect(source).toMatch(/where\s+id\s*=\s*\$1::uuid[\s\S]*and\s+claim_token\s*=\s*\$2::uuid/i);
    expect(source).toMatch(/and\s+promoted_at\s+is\s+null/i);
    expect(source).toMatch(/and\s+promote_started_at\s+is\s+null/i);
  });

  test("successful promotion clears claim state only for the caller's claim token", () => {
    const source = readFileSync(join(root, "lib/sync/promoteSnapshot.ts"), "utf8");

    expect(source).toMatch(
      /set\s+promoted_at\s*=\s*now\(\)[\s\S]*claim_token\s*=\s*null[\s\S]*claimed_at\s*=\s*null[\s\S]*claim_expires_at\s*=\s*null/i,
    );
    expect(source).toMatch(
      /where\s+p\.snapshot_revision_id\s*=\s*\$1::uuid[\s\S]*and\s+p\.claim_token\s*=\s*\$2::uuid/i,
    );
  });

  test("admin repair covers delete_started rows that GC cannot reclaim", () => {
    const source = readFileSync(join(root, "lib/sync/promoteSnapshot.ts"), "utf8");

    expect(source).toContain("delete_started_at::text");
    expect(source).toMatch(
      /row\.delete_started_at[\s\S]*storage\.removePrefix\?\.\(row\.temp_prefix\)/,
    );
    expect(source).toMatch(
      /delete\s+from\s+public\.pending_snapshot_uploads[\s\S]*delete_started_at\s+is\s+not\s+null/i,
    );
  });

  test("GC has a rename-retry path for unclaimed rows still referenced by pending diagrams", () => {
    const source = readFileSync(join(root, "lib/sync/diagramGc.ts"), "utf8");

    expect(source).toContain("listPendingPromotionRetries");
    expect(source).toMatch(
      /coalesce\([\s\S]*s\.diagrams->'pending'->>'revision_id'[\s\S]*s\.diagrams->'pending'->>'snapshot_revision_id'[\s\S]*\)\s*=\s*p\.snapshot_revision_id::text/,
    );
    expect(source).toMatch(/await promoteSnapshotUpload\(snapshotRevisionId\)/);
  });

  test("GC production storage listing recurses into revision directories", () => {
    const source = readFileSync(join(root, "lib/sync/diagramGc.ts"), "utf8");

    expect(source).toContain("entries.push(...(await listPaths(`${prefix}${entry.name}/`)))");
  });

  test("GC production storage listing paginates Supabase Storage pages", () => {
    const source = readFileSync(join(root, "lib/sync/diagramGc.ts"), "utf8");

    expect(source).toMatch(/const\s+pageSize\s*=\s*100/);
    expect(source).toMatch(/bucket\.list\(objectPrefix,\s*\{\s*limit:\s*pageSize,\s*offset\s*\}/);
    expect(source).toMatch(/offset\s*\+=\s*page\.length/);
  });
});
