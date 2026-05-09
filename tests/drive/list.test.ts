import { describe, expect, test, vi } from "vitest";
import type { drive_v3 } from "googleapis";

const FOLDER_ID = "watched-folder-1";

function fakeDrive(filesList: ReturnType<typeof vi.fn>): drive_v3.Drive {
  return {
    files: {
      list: filesList,
    },
  } as unknown as drive_v3.Drive;
}

describe("listFolder", () => {
  test("uses a folder-scoped spreadsheet query with shared-drive pagination settings", async () => {
    const filesList = vi.fn().mockResolvedValue({
      data: {
        files: [
          {
            id: "sheet-1",
            name: "Show Sheet",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-05-08T12:00:00.000Z",
            parents: [FOLDER_ID],
          },
        ],
      },
    });
    const { listFolder, GOOGLE_SHEETS_MIME_TYPE } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, { drive: fakeDrive(filesList) });

    expect(files).toEqual([
      {
        driveFileId: "sheet-1",
        name: "Show Sheet",
        mimeType: GOOGLE_SHEETS_MIME_TYPE,
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: [FOLDER_ID],
      },
    ]);
    expect(filesList).toHaveBeenCalledWith({
      q: `'${FOLDER_ID}' in parents and mimeType = '${GOOGLE_SHEETS_MIME_TYPE}' and trashed = false`,
      pageSize: 100,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, parents, headRevisionId, md5Checksum)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
    });
  });

  test("paginates through every nextPageToken before returning files", async () => {
    const filesList = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          nextPageToken: "page-2",
          files: [
            {
              id: "sheet-1",
              name: "First",
              mimeType: "application/vnd.google-apps.spreadsheet",
              modifiedTime: "2026-05-08T12:00:00.000Z",
              parents: [FOLDER_ID],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "sheet-2",
              name: "Second",
              mimeType: "application/vnd.google-apps.spreadsheet",
              modifiedTime: "2026-05-08T13:00:00.000Z",
              parents: [FOLDER_ID],
            },
          ],
        },
      });
    const { listFolder } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, { drive: fakeDrive(filesList) });

    expect(files.map((file) => file.driveFileId)).toEqual(["sheet-1", "sheet-2"]);
    expect(filesList).toHaveBeenCalledTimes(2);
    expect(filesList.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        pageToken: "page-2",
      }),
    );
  });

  test("drops files whose parents do not include the watched folder and emits UNEXPECTED_PARENT", async () => {
    const filesList = vi.fn().mockResolvedValue({
      data: {
        files: [
          {
            id: "sheet-good",
            name: "Good",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-05-08T12:00:00.000Z",
            parents: [FOLDER_ID],
          },
          {
            id: "sheet-bad",
            name: "Bad Parent",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-05-08T12:00:00.000Z",
            parents: ["other-folder"],
          },
          {
            id: "sheet-missing-parents",
            name: "Missing Parents",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-05-08T12:00:00.000Z",
          },
        ],
      },
    });
    const onWarning = vi.fn();
    const { listFolder } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, { drive: fakeDrive(filesList), onWarning });

    expect(files.map((file) => file.driveFileId)).toEqual(["sheet-good"]);
    expect(onWarning).toHaveBeenCalledWith({
      code: "UNEXPECTED_PARENT",
      driveFileId: "sheet-bad",
      folderId: FOLDER_ID,
      parents: ["other-folder"],
    });
    expect(onWarning).toHaveBeenCalledWith({
      code: "UNEXPECTED_PARENT",
      driveFileId: "sheet-missing-parents",
      folderId: FOLDER_ID,
      parents: [],
    });
  });
});
