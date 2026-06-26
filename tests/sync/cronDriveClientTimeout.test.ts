import { beforeEach, describe, expect, test, vi } from "vitest";

// Mirror defaultDriveClientSheetsFieldsMask.test.ts's mock seam, but expose
// STABLE spreadsheets.get + revisions.list mocks so we can assert the DXT-3
// per-call timeout forwarding + the withDriveRetry wrap (TimeoutError retry).
const { sheetsGetMock, revisionsListMock } = vi.hoisted(() => ({
  sheetsGetMock: vi.fn(),
  revisionsListMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn(() => ({ spreadsheets: { get: sheetsGetMock } })),
    drive: vi.fn(() => ({ revisions: { list: revisionsListMock } })),
    auth: { GoogleAuth: vi.fn() },
  },
}));

vi.mock("@/lib/drive/client", () => ({
  GOOGLE_DRIVE_SCOPES: [],
  DriveConfigError: class DriveConfigError extends Error {},
  getDriveClient: vi.fn(),
  getDriveAuth: vi.fn(() => ({ kind: "auth" })),
  getDriveAccessToken: vi.fn(async () => "test-token"),
}));

import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/fetch";
import { defaultDriveClient } from "@/lib/sync/runScheduledCronSync";

describe("defaultDriveClient metadata timeouts (DXT-3)", () => {
  beforeEach(() => {
    sheetsGetMock.mockReset();
    revisionsListMock.mockReset();
  });

  test("listSpreadsheetSheets forwards a per-call gaxios timeout + retry:false to spreadsheets.get", async () => {
    sheetsGetMock.mockResolvedValue({ data: { sheets: [{ properties: { title: "Crew" } }] } });

    await defaultDriveClient().listSpreadsheetSheets!("sheet-1");

    expect(sheetsGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ spreadsheetId: "sheet-1" }),
      { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
    );
  });

  test("listSpreadsheetSheets retries a gaxios TimeoutError (wrapped in withDriveRetry), then succeeds", async () => {
    sheetsGetMock
      .mockRejectedValueOnce({ code: "TimeoutError" })
      .mockResolvedValue({ data: { sheets: [{ properties: { title: "Crew" } }] } });

    const sheets = await defaultDriveClient().listSpreadsheetSheets!("sheet-1");

    expect(sheets).toHaveLength(1);
    expect(sheetsGetMock).toHaveBeenCalledTimes(2);
  });

  test("getSpreadsheetRevisionId forwards a per-call gaxios timeout + retry:false to revisions.list", async () => {
    revisionsListMock.mockResolvedValue({ data: { revisions: [{ id: "rev-9" }] } });

    const id = await defaultDriveClient().getSpreadsheetRevisionId!("sheet-1");

    expect(id).toBe("rev-9");
    expect(revisionsListMock).toHaveBeenCalledWith(expect.objectContaining({ fileId: "sheet-1" }), {
      timeout: DRIVE_FILES_GET_TIMEOUT_MS,
      retry: false,
    });
  });

  test("getSpreadsheetRevisionId retries a gaxios TimeoutError (wrapped in withDriveRetry), then succeeds", async () => {
    revisionsListMock
      .mockRejectedValueOnce({ code: "TimeoutError" })
      .mockResolvedValue({ data: { revisions: [{ id: "rev-9" }] } });

    const id = await defaultDriveClient().getSpreadsheetRevisionId!("sheet-1");

    expect(id).toBe("rev-9");
    expect(revisionsListMock).toHaveBeenCalledTimes(2);
  });
});
