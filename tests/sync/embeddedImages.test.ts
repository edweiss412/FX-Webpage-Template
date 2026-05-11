import { describe, expect, test } from "vitest";
import type { ParsedSheet } from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import {
  MAX_TOTAL_DIAGRAM_ITEMS,
  enrichWithDrivePins,
  type DriveClient,
} from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";

function emptyParsed(overrides: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    show: {
      title: "FinTech Forum 2026",
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
  driveFileId: "spreadsheet-1",
  fileMeta: {
    driveFileId: "spreadsheet-1",
    headRevisionId: "unused-for-sheets",
    md5Checksum: "x".repeat(32),
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-01T00:00:00.000Z",
  },
};

function clientWithEmbedded(objects: Array<{ objectId: string; bytes?: string; alt?: string }> = []) {
  const bytesByObject = new Map(objects.map((object) => [object.objectId, object.bytes ?? object.objectId]));
  return {
    ...mockDriveClient,
    async listSpreadsheetSheets() {
      return [
        { title: "RUN OF SHOW", embeddedObjects: [] },
        {
          title: "DIagrams",
          embeddedObjects: objects.map((object) => ({
            objectId: object.objectId,
            mimeType: "image/png",
            ...(object.alt ? { alt: object.alt } : {}),
            contentUrl: `https://content.local/${object.objectId}`,
          })),
        },
      ];
    },
    async getSpreadsheetRevisionId() {
      return "sheet-revision-42";
    },
    async getEmbeddedImageBytes(_spreadsheetId, objectId) {
      const bytes = bytesByObject.get(objectId);
      return bytes == null ? null : new TextEncoder().encode(bytes);
    },
  } satisfies DriveClient;
}

describe("sha256Base64Url", () => {
  test("is byte-derived, stable for equal bytes, and changes when bytes change", () => {
    const first = sha256Base64Url(new TextEncoder().encode("same bytes"));
    const second = sha256Base64Url(new TextEncoder().encode("same bytes"));
    const changed = sha256Base64Url(new TextEncoder().encode("same bytet"));

    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });
});

describe("embedded image extraction in enrichWithDrivePins", () => {
  test("extracts DIAGRAMS tab embedded images case-insensitively with revision id and content fingerprint", async () => {
    const result = await enrichWithDrivePins(
      emptyParsed(),
      clientWithEmbedded([
        { objectId: "ballroom-layout", bytes: "layout-bytes", alt: "Ballroom layout" },
        { objectId: "ballroom-photo", bytes: "photo-bytes", alt: "Ballroom photo" },
      ]),
      baseCtx,
    );

    expect(result.diagrams.embeddedImages).toHaveLength(2);
    expect(result.diagrams.embeddedImages).toEqual([
      {
        sheetTab: "DIagrams",
        objectId: "ballroom-layout",
        mimeType: "image/png",
        alt: "Ballroom layout",
        contentUrl: "https://content.local/ballroom-layout",
        sheetsRevisionId: "sheet-revision-42",
        embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("layout-bytes")),
        recovery_disposition: "normal",
        snapshotPath: null,
      },
      {
        sheetTab: "DIagrams",
        objectId: "ballroom-photo",
        mimeType: "image/png",
        alt: "Ballroom photo",
        contentUrl: "https://content.local/ballroom-photo",
        sheetsRevisionId: "sheet-revision-42",
        embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("photo-bytes")),
        recovery_disposition: "normal",
        snapshotPath: null,
      },
    ]);
  });

  test("does not call revision lookup when there are no embedded objects", async () => {
    let revisionCalls = 0;
    const client: DriveClient = {
      ...mockDriveClient,
      async listSpreadsheetSheets() {
        return [{ title: "DIAGRAMS", embeddedObjects: [] }];
      },
      async getSpreadsheetRevisionId() {
        revisionCalls += 1;
        throw new Error("revision API should not be called for empty embedded set");
      },
    };

    const result = await enrichWithDrivePins(emptyParsed(), client, baseCtx);

    expect(result.diagrams.embeddedImages).toEqual([]);
    expect(revisionCalls).toBe(0);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "DIAGRAMS_EMBEDDED_NONE_FOUND" }),
    );
  });

  test("missing DIAGRAMS tab emits warning without revision lookup", async () => {
    let revisionCalls = 0;
    const client: DriveClient = {
      ...mockDriveClient,
      async listSpreadsheetSheets() {
        return [{ title: "RUN OF SHOW", embeddedObjects: [] }];
      },
      async getSpreadsheetRevisionId() {
        revisionCalls += 1;
        throw new Error("revision API should not be called without DIAGRAMS tab");
      },
    };

    const result = await enrichWithDrivePins(emptyParsed(), client, baseCtx);

    expect(result.diagrams.embeddedImages).toEqual([]);
    expect(revisionCalls).toBe(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "DIAGRAMS_TAB_MISSING" }));
  });

  test("restage-only fallback preserves the placeholder entry when content URL is missing", async () => {
    const client: DriveClient = {
      ...mockDriveClient,
      async listSpreadsheetSheets() {
        return [
          {
            title: "DIAGRAMS",
            embeddedObjects: [{ objectId: "unreadable", mimeType: "image/png", contentUrl: null }],
          },
        ];
      },
      async getSpreadsheetRevisionId() {
        return "sheet-revision-99";
      },
      async getEmbeddedImageBytes() {
        throw new Error("content URL missing should skip byte fetch");
      },
    };

    const result = await enrichWithDrivePins(emptyParsed(), client, baseCtx);

    expect(result.diagrams.embeddedImages).toEqual([
      {
        sheetTab: "DIAGRAMS",
        objectId: "unreadable",
        mimeType: "image/png",
        contentUrl: null,
        sheetsRevisionId: "sheet-revision-99",
        embeddedFingerprint: null,
        recovery_disposition: "restage_required",
        snapshotPath: null,
      },
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE" }),
    );
  });

  test("caps embedded images upstream of persistence and emits dropped-count warning", async () => {
    const objects = Array.from({ length: 65 }, (_, index) => ({
      objectId: `embedded-${index + 1}`,
      bytes: `bytes-${index + 1}`,
    }));

    const result = await enrichWithDrivePins(emptyParsed(), clientWithEmbedded(objects), baseCtx);

    expect(result.diagrams.embeddedImages).toHaveLength(MAX_TOTAL_DIAGRAM_ITEMS);
    expect(result.diagrams.embeddedImages.at(-1)?.objectId).toBe("embedded-60");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
        message: expect.stringContaining("5"),
      }),
    );
  });
});

describe("linked-folder freezing in enrichWithDrivePins", () => {
  test("captures only image files with immutable Drive revision and md5 pins", async () => {
    const client: DriveClient = {
      ...mockDriveClient,
      async listFolder(folderId) {
        return {
          folderId,
          files: [
            {
              driveFileId: "image-1",
              name: "A ballroom.png",
              mimeType: "image/png",
              modifiedTime: "2026-04-01T00:00:00.000Z",
              headRevisionId: "rev-image-1",
              md5Checksum: "a".repeat(32),
            },
            {
              driveFileId: "pdf-1",
              name: "Not a diagram.pdf",
              mimeType: "application/pdf",
              modifiedTime: "2026-04-02T00:00:00.000Z",
              headRevisionId: "rev-pdf-1",
              md5Checksum: "b".repeat(32),
            },
          ],
        };
      },
    };
    const parsed = emptyParsed({
      diagrams: {
        linkedFolder: {
          driveFolderId: "folder-1",
          driveFolderUrl: "https://drive.google.com/drive/folders/folder-1",
        },
        embeddedImages: [],
        linkedFolderItems: [],
      },
    });

    const result = await enrichWithDrivePins(parsed, client, baseCtx);

    expect(result.diagrams.linkedFolderItems).toEqual([
      {
        driveFileId: "image-1",
        mimeType: "image/png",
        alt: "A ballroom.png",
        drive_modified_time: "2026-04-01T00:00:00.000Z",
        headRevisionId: "rev-image-1",
        md5Checksum: "a".repeat(32),
        snapshotPath: null,
      },
    ]);
  });

  test("uses the residual combined cap after embedded images and emits linked overflow warning", async () => {
    const linkedFiles = Array.from({ length: 78 }, (_, index) => ({
      driveFileId: `linked-${index + 1}`,
      name: `Linked ${String(index + 1).padStart(2, "0")}.png`,
      mimeType: "image/png",
      modifiedTime: "2026-04-01T00:00:00.000Z",
      headRevisionId: `rev-linked-${index + 1}`,
      md5Checksum: String(index + 1).padStart(32, "0"),
    }));
    const client: DriveClient = {
      ...clientWithEmbedded(
        Array.from({ length: 58 }, (_, index) => ({
          objectId: `embedded-${index + 1}`,
          bytes: `embedded-bytes-${index + 1}`,
        })),
      ),
      async listFolder(folderId) {
        return { folderId, files: linkedFiles };
      },
    };
    const parsed = emptyParsed({
      diagrams: {
        linkedFolder: {
          driveFolderId: "folder-1",
          driveFolderUrl: "https://drive.google.com/drive/folders/folder-1",
        },
        embeddedImages: [],
        linkedFolderItems: [],
      },
    });

    const result = await enrichWithDrivePins(parsed, client, baseCtx);

    expect(result.diagrams.embeddedImages).toHaveLength(58);
    expect(result.diagrams.linkedFolderItems).toHaveLength(2);
    expect(result.diagrams.linkedFolderItems.map((item) => item.driveFileId)).toEqual([
      "linked-1",
      "linked-2",
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "LINKED_FOLDER_OVERFLOW_TRUNCATED",
        message: expect.stringContaining("76"),
      }),
    );
  });
});
