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
    expect(filesList).toHaveBeenCalledWith(
      {
        q: `'${FOLDER_ID}' in parents and mimeType = '${GOOGLE_SHEETS_MIME_TYPE}' and trashed = false`,
        pageSize: 100,
        fields:
          "nextPageToken, files(id, name, mimeType, modifiedTime, parents, headRevisionId, md5Checksum)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: "allDrives",
      },
      // The folder list now carries a per-call stall-guard timeout + retry:false.
      { timeout: expect.any(Number), retry: false },
    );
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

  // === Pagination edge cases (pinned behavior) ===

  test("terminates after a final page of exactly pageSize files when Drive omits nextPageToken (pinned: no extra request)", async () => {
    // listFolder requests pageSize: 100. Drive MAY return a full page with
    // no nextPageToken when the result count is an exact multiple of the
    // page size — the loop must treat the absent token as terminal, not
    // re-request page 1 or hang.
    const PAGE_SIZE = 100; // mirrors the pageSize listFolder sends (asserted in the first test above)
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `sheet-${i}`,
      name: `Sheet ${i}`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: [FOLDER_ID],
    }));
    const filesList = vi.fn().mockResolvedValue({
      data: { files: fullPage }, // no nextPageToken
    });
    const { listFolder } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, { drive: fakeDrive(filesList) });

    expect(files).toHaveLength(PAGE_SIZE);
    expect(files.map((file) => file.driveFileId)).toEqual(fullPage.map((file) => file.id));
    expect(filesList).toHaveBeenCalledTimes(1);
  });

  test("returns an empty list for an empty first page (no files array, no token) without a second request (pinned)", async () => {
    const filesList = vi.fn().mockResolvedValue({ data: {} });
    const { listFolder } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, { drive: fakeDrive(filesList) });

    expect(files).toEqual([]);
    expect(filesList).toHaveBeenCalledTimes(1);
  });

  test("follows a nextPageToken onto an empty final page and terminates with only the first page's files (pinned)", async () => {
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
        data: { files: [] }, // empty terminal page, no token
      });
    const { listFolder } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, { drive: fakeDrive(filesList) });

    expect(files.map((file) => file.driveFileId)).toEqual(["sheet-1"]);
    expect(filesList).toHaveBeenCalledTimes(2);
    expect(filesList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ pageToken: "page-2" }));
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

  // BL-ONBOARDING-SCAN-TRANSIENT-THROTTLE-RETRY: the folder list opts into the
  // same withDriveRetry coverage as files.get / the xlsx export, so a transient
  // throttle on the list no longer aborts the scan (esp. at the raised prepare cap).
  const fastRetry = { sleep: async () => {}, random: () => 0 };

  test("retries a transient 429 on the folder list, then succeeds", async () => {
    const ok = {
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
    };
    const filesList = vi.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValue(ok);
    const { listFolder } = await import("@/lib/drive/list");

    const files = await listFolder(FOLDER_ID, {
      drive: fakeDrive(filesList),
      retry: fastRetry,
    });

    expect(files).toHaveLength(1);
    expect(filesList).toHaveBeenCalledTimes(2);
  });

  test("does NOT retry a non-transient 404 on the folder list", async () => {
    const filesList = vi.fn().mockRejectedValue({ status: 404 });
    const { listFolder } = await import("@/lib/drive/list");

    await expect(
      listFolder(FOLDER_ID, { drive: fakeDrive(filesList), retry: fastRetry }),
    ).rejects.toMatchObject({ status: 404 });
    expect(filesList).toHaveBeenCalledTimes(1);
  });

  test("forwards a per-call gaxios timeout (default DRIVE_LIST_TIMEOUT_MS) + retry:false to files.list", async () => {
    const filesList = vi.fn().mockResolvedValue({ data: { files: [] } });
    const { listFolder, DRIVE_LIST_TIMEOUT_MS } = await import("@/lib/drive/list");

    expect(DRIVE_LIST_TIMEOUT_MS).toBe(10_000);

    await listFolder(FOLDER_ID, { drive: fakeDrive(filesList), retry: fastRetry });

    // supportsAllDrives/includeItemsFromAllDrives stay in the params (1st arg, for
    // _sharedDriveSupportContract); the budget + retry:false ride in the 2nd arg.
    expect(filesList).toHaveBeenCalledWith(
      expect.objectContaining({ supportsAllDrives: true, includeItemsFromAllDrives: true }),
      { timeout: DRIVE_LIST_TIMEOUT_MS, retry: false },
    );
  });

  test("honors an injected listTimeoutMs over the default", async () => {
    const filesList = vi.fn().mockResolvedValue({ data: { files: [] } });
    const { listFolder } = await import("@/lib/drive/list");

    await listFolder(FOLDER_ID, {
      drive: fakeDrive(filesList),
      retry: fastRetry,
      listTimeoutMs: 20,
    });

    expect(filesList).toHaveBeenCalledWith(expect.objectContaining({ supportsAllDrives: true }), {
      timeout: 20,
      retry: false,
    });
  });

  test("retries a gaxios TimeoutError on the folder list (classified transient 504), then succeeds", async () => {
    const ok = { data: { files: [] } };
    const filesList = vi.fn().mockRejectedValueOnce({ code: "TimeoutError" }).mockResolvedValue(ok);
    const { listFolder } = await import("@/lib/drive/list");

    await listFolder(FOLDER_ID, { drive: fakeDrive(filesList), retry: fastRetry });

    expect(filesList).toHaveBeenCalledTimes(2);
  });

  test("exhausts bounded retries on a persistent folder-list timeout, then throws (never hangs)", async () => {
    const maxRetries = 2;
    const filesList = vi.fn().mockRejectedValue({ code: "TimeoutError" });
    const { listFolder } = await import("@/lib/drive/list");

    await expect(
      listFolder(FOLDER_ID, {
        drive: fakeDrive(filesList),
        retry: { ...fastRetry, maxRetries },
      }),
    ).rejects.toBeTruthy();
    expect(filesList).toHaveBeenCalledTimes(1 + maxRetries);
  });
});
