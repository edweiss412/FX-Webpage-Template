import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function runSeed(): void {
  execFileSync("pnpm", ["db:seed"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl },
  });
}

type SeedSummary = {
  showCount: number;
  auditCount: number;
  pendingSyncCount: number;
  pendingIngestionCount: number;
  shows: Array<{
    slug: string;
    drive_file_id: string;
    last_seen_modified_time: string;
    opening_reel_drive_file_id: string | null;
    opening_reel_drive_modified_time: string | null;
    opening_reel_head_revision_id: string | null;
    opening_reel_mime_type: string | null;
    diagrams: SeedDiagrams;
    crew_count: number;
    auth_count: number;
  }>;
};

type SeedEmbeddedImage = {
  objectId: string;
  sheetTab: string;
  mimeType: string;
  snapshotPath: string | null;
  sourceFolder: "embedded";
  sheetsRevisionId: string;
  embeddedFingerprint: string | null;
  recovery_disposition: "normal" | "restage_required";
};

type SeedLinkedFolderItem = {
  driveFileId: string;
  mimeType: string;
  drive_modified_time: string;
  headRevisionId: string;
  md5Checksum: string;
  snapshotPath: string | null;
  sourceFolder: "linked";
  recovery_disposition: "normal" | "restage_required";
};

type SeedDiagrams = {
  snapshot_revision_id: string;
  snapshot_status: "complete" | "partial_failure" | "partial_failure_restage_required";
  linkedFolder: { driveFolderId: string; driveFolderUrl: string } | null;
  embeddedImages: SeedEmbeddedImage[];
  linkedFolderItems: SeedLinkedFolderItem[];
};

type SeedShow = SeedSummary["shows"][number] & { diagrams: SeedDiagrams };

function loadSeedSummary(): SeedSummary {
  const output = runPsql(`
    with seed_shows as (
      select *
        from public.shows
       where drive_file_id like 'seed-fixture:%'
    ),
    show_rows as (
      select
        s.slug,
        s.drive_file_id,
        s.last_seen_modified_time::text,
        s.opening_reel_drive_file_id,
        s.opening_reel_drive_modified_time::text,
        s.opening_reel_head_revision_id,
        s.opening_reel_mime_type,
        s.diagrams,
        (select count(*)::int from public.crew_members c where c.show_id = s.id) as crew_count,
        (select count(*)::int from public.crew_member_auth a where a.show_id = s.id) as auth_count
      from seed_shows s
    )
    select jsonb_build_object(
      'showCount', (select count(*)::int from seed_shows),
      'auditCount', (
        select count(*)::int
          from public.sync_audit
         where drive_file_id like 'seed-fixture:%'
      ),
      'pendingSyncCount', (
        select count(*)::int
          from public.pending_syncs
         where drive_file_id like 'seed-fixture:%'
      ),
      'pendingIngestionCount', (
        select count(*)::int
          from public.pending_ingestions
         where drive_file_id like 'seed-fixture:%'
      ),
      'shows', coalesce(
        (select jsonb_agg(to_jsonb(show_rows) order by slug) from show_rows),
        '[]'::jsonb
      )
    )::text;
  `);

  return JSON.parse(output) as SeedSummary;
}

describe("seed script", () => {
  test("AC-2.7 seed loads 10 fixtures with full persisted-shape integrity", () => {
    runSeed();
    runSeed();

    const summary = loadSeedSummary();

    expect(summary.showCount).toBe(10);
    expect(summary.auditCount).toBe(10);
    expect(summary.pendingSyncCount).toBe(0);
    expect(summary.pendingIngestionCount).toBe(0);

    const restageShows = summary.shows.filter(
      (show) => show.diagrams?.snapshot_status === "partial_failure_restage_required",
    );
    expect(restageShows.length).toBeGreaterThanOrEqual(1);

    for (const show of summary.shows) {
      expect(show.drive_file_id).toMatch(/^seed-fixture:/);
      expect(Date.parse(show.last_seen_modified_time)).not.toBeNaN();
      expect(show.crew_count).toBeGreaterThan(0);
      expect(show.auth_count).toBe(show.crew_count);

      const reelValues = [
        show.opening_reel_drive_file_id,
        show.opening_reel_drive_modified_time,
        show.opening_reel_head_revision_id,
        show.opening_reel_mime_type,
      ];
      const presentReelValues = reelValues.filter((value) => value !== null);
      expect([0, 4]).toContain(presentReelValues.length);
      if (presentReelValues.length === 4) {
        expect(show.opening_reel_mime_type).toMatch(/^video\//);
      }

      expect(show.diagrams).not.toBeNull();
      expect(show.diagrams.snapshot_revision_id).toEqual(expect.any(String));
      expect(["complete", "partial_failure", "partial_failure_restage_required"]).toContain(
        show.diagrams.snapshot_status,
      );
      expect(
        show.diagrams.linkedFolder === null ||
          (typeof show.diagrams.linkedFolder?.driveFolderId === "string" &&
            typeof show.diagrams.linkedFolder?.driveFolderUrl === "string"),
      ).toBe(true);
      expect(Array.isArray(show.diagrams.embeddedImages)).toBe(true);
      expect(Array.isArray(show.diagrams.linkedFolderItems)).toBe(true);

      for (const embedded of show.diagrams.embeddedImages) {
        expect(embedded.objectId).toEqual(expect.any(String));
        expect(embedded.sheetTab).toEqual(expect.any(String));
        expect(embedded.mimeType).toEqual(expect.any(String));
        expect(embedded.snapshotPath === null || typeof embedded.snapshotPath === "string").toBe(
          true,
        );
        expect(embedded.sourceFolder).toBe("embedded");
        expect(embedded.sheetsRevisionId).toEqual(expect.any(String));
        expect(
          embedded.embeddedFingerprint === null ||
            (typeof embedded.embeddedFingerprint === "string" &&
              embedded.embeddedFingerprint.length > 0),
        ).toBe(true);
        expect(["normal", "restage_required"]).toContain(embedded.recovery_disposition);
        if (embedded.embeddedFingerprint === null) {
          expect(embedded.recovery_disposition).toBe("restage_required");
        }
        if (embedded.recovery_disposition === "normal") {
          expect(embedded.embeddedFingerprint).toEqual(expect.any(String));
        }
        if (embedded.recovery_disposition === "restage_required") {
          expect(embedded.snapshotPath).toBeNull();
        }
      }

      for (const linked of show.diagrams.linkedFolderItems) {
        expect(linked.driveFileId).toEqual(expect.any(String));
        expect(linked.mimeType).toEqual(expect.any(String));
        expect(linked.drive_modified_time).toEqual(expect.any(String));
        expect(linked.headRevisionId).toEqual(expect.any(String));
        expect(linked.md5Checksum).toEqual(expect.any(String));
        expect(linked.snapshotPath === null || typeof linked.snapshotPath === "string").toBe(true);
        expect(linked.sourceFolder).toBe("linked");
        expect(["normal", "restage_required"]).toContain(linked.recovery_disposition);
        if (linked.recovery_disposition === "restage_required") {
          expect(linked.snapshotPath).toBeNull();
        }
      }
    }

    const restageEntry = (restageShows as SeedShow[])
      .flatMap((show) => show.diagrams.embeddedImages)
      .find((embedded) => embedded.recovery_disposition === "restage_required");

    expect(restageEntry).toBeDefined();
    if (!restageEntry) {
      throw new Error("Expected at least one restage-required embedded image");
    }
    expect(restageEntry.embeddedFingerprint).toBeNull();
    expect(restageEntry.sourceFolder).toBe("embedded");
    expect(restageEntry.snapshotPath).toBeNull();
  });
});
