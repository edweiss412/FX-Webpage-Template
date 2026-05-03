/**
 * tests/sync/enrichWithDrivePins.test.ts (M3 Task 3.1)
 *
 * Unit tests for the Phase-1 enrichment step that converts ParsedSheet →
 * ParseResult by calling a DriveClient. The dev panel and the production
 * sync layer share the same enrichment function; this suite exercises every
 * branch of the pass-through / enrichment logic.
 */
import { describe, expect, test } from "vitest";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";
import type { ParsedSheet } from "@/lib/parser/types";

function emptyParsed(overrides: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    show: {
      title: "",
      client_label: "",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

const baseCtx = {
  driveFileId: "show-file-id-1",
  fileMeta: {
    driveFileId: "show-file-id-1",
    headRevisionId: "show-head-1",
    md5Checksum: "x".repeat(32),
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-01T00:00:00.000Z",
  },
};

describe("enrichWithDrivePins — pass-through cases", () => {
  test("openingReel: null → output openingReel: null (no Drive call)", async () => {
    let getFileCalls = 0;
    const client: DriveClient = {
      ...mockDriveClient,
      async getFile(id) {
        getFileCalls += 1;
        return mockDriveClient.getFile(id);
      },
    };
    const parsed = emptyParsed();
    const result = await enrichWithDrivePins(parsed, client, baseCtx);
    expect(result.openingReel).toBeNull();
    expect(getFileCalls).toBe(0);
  });

  test("linkedFolder: null → output linkedFolderItems: [] (no Drive call)", async () => {
    let listFolderCalls = 0;
    const client: DriveClient = {
      ...mockDriveClient,
      async listFolder(id) {
        listFolderCalls += 1;
        return mockDriveClient.listFolder(id);
      },
    };
    const parsed = emptyParsed();
    const result = await enrichWithDrivePins(parsed, client, baseCtx);
    expect(result.diagrams.linkedFolderItems).toEqual([]);
    expect(listFolderCalls).toBe(0);
  });

  test("hardErrors are preserved verbatim through enrichment", async () => {
    const parsed = emptyParsed({
      hardErrors: [{ code: "MI-1_VERSION_DETECTION_FAILED", message: "no version" }],
    });
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.hardErrors).toEqual(parsed.hardErrors);
  });

  test("warnings + raw_unrecognized are preserved verbatim", async () => {
    const parsed = emptyParsed({
      warnings: [{ severity: "warn", code: "TEST_WARN", message: "warning text" }],
      raw_unrecognized: [{ block: "test", key: "k", value: "v" }],
    });
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.warnings).toEqual(parsed.warnings);
    expect(result.raw_unrecognized).toEqual(parsed.raw_unrecognized);
  });
});

describe("enrichWithDrivePins — reel pinning + MIME gate", () => {
  test("openingReel with video/* mimeType → OpeningReelPinned populated", async () => {
    const client: DriveClient = {
      ...mockDriveClient,
      async getFile(id) {
        return {
          driveFileId: id,
          headRevisionId: "rev-abc",
          md5Checksum: "y".repeat(32),
          mimeType: "video/mp4",
          modifiedTime: "2026-04-15T12:00:00.000Z",
        };
      },
    };
    const parsed = emptyParsed({ openingReel: { driveFileId: "reel-1" } });
    const result = await enrichWithDrivePins(parsed, client, baseCtx);
    expect(result.openingReel).toEqual({
      driveFileId: "reel-1",
      drive_modified_time: "2026-04-15T12:00:00.000Z",
      headRevisionId: "rev-abc",
      mimeType: "video/mp4",
    });
  });

  test("openingReel with non-video mimeType → null (MIME gate enforced)", async () => {
    const client: DriveClient = {
      ...mockDriveClient,
      async getFile(id) {
        return {
          driveFileId: id,
          headRevisionId: "rev-abc",
          md5Checksum: "y".repeat(32),
          mimeType: "application/pdf",
          modifiedTime: "2026-04-15T12:00:00.000Z",
        };
      },
    };
    const parsed = emptyParsed({ openingReel: { driveFileId: "not-a-video" } });
    const result = await enrichWithDrivePins(parsed, client, baseCtx);
    expect(result.openingReel).toBeNull();
  });
});

describe("enrichWithDrivePins — linked folder enumeration", () => {
  test("linkedFolder present → listFolder called and items mapped", async () => {
    const client: DriveClient = {
      ...mockDriveClient,
      async listFolder(folderId) {
        return {
          folderId,
          files: [
            {
              driveFileId: "child-1",
              headRevisionId: "rev-1",
              md5Checksum: "a".repeat(32),
              mimeType: "image/png",
              modifiedTime: "2026-04-10T00:00:00.000Z",
            },
            {
              driveFileId: "child-2",
              headRevisionId: "rev-2",
              md5Checksum: "b".repeat(32),
              mimeType: "image/jpeg",
              modifiedTime: "2026-04-11T00:00:00.000Z",
            },
          ],
        };
      },
    };
    const parsed = emptyParsed({
      diagrams: {
        linkedFolder: { driveFolderId: "folder-1", driveFolderUrl: "https://drive/folder-1" },
        embeddedImages: [],
        linkedFolderItems: [],
      },
    });
    const result = await enrichWithDrivePins(parsed, client, baseCtx);
    expect(result.diagrams.linkedFolderItems).toEqual([
      {
        driveFileId: "child-1",
        mimeType: "image/png",
        drive_modified_time: "2026-04-10T00:00:00.000Z",
        headRevisionId: "rev-1",
        md5Checksum: "a".repeat(32),
        snapshotPath: null,
      },
      {
        driveFileId: "child-2",
        mimeType: "image/jpeg",
        drive_modified_time: "2026-04-11T00:00:00.000Z",
        headRevisionId: "rev-2",
        md5Checksum: "b".repeat(32),
        snapshotPath: null,
      },
    ]);
    expect(result.diagrams.linkedFolder).toEqual(parsed.diagrams.linkedFolder);
  });
});

describe("enrichWithDrivePins — M3 contract", () => {
  test("embeddedImages is always [] in M3 (M7 wires real capture)", async () => {
    const parsed = emptyParsed({
      diagrams: {
        linkedFolder: { driveFolderId: "f", driveFolderUrl: "https://drive/f" },
        embeddedImages: [],
        linkedFolderItems: [],
      },
    });
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.diagrams.embeddedImages).toEqual([]);
  });
});
