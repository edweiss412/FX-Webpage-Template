import { beforeEach, describe, expect, test, vi } from "vitest";

// google.sheets() seam, mirroring cronDriveClientTimeout.test.ts.
const { spreadsheetsGetMock } = vi.hoisted(() => ({ spreadsheetsGetMock: vi.fn() }));

vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn(() => ({ spreadsheets: { get: spreadsheetsGetMock } })),
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
import { fetchSheetTitleToGid } from "@/lib/drive/sheetGids";

describe("fetchSheetTitleToGid metadata timeout (DXT-3, onboarding scan path)", () => {
  beforeEach(() => spreadsheetsGetMock.mockReset());

  test("forwards a per-call gaxios timeout + retry:false to spreadsheets.get", async () => {
    spreadsheetsGetMock.mockResolvedValue({
      data: { sheets: [{ properties: { title: "Crew", sheetId: 7 } }] },
    });

    const map = await fetchSheetTitleToGid("sheet-1");

    expect(map.get("Crew")).toBe(7);
    expect(spreadsheetsGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ spreadsheetId: "sheet-1" }),
      { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
    );
  });

  test("retries a gaxios TimeoutError (wrapped in withDriveRetry), then succeeds", async () => {
    spreadsheetsGetMock
      .mockImplementationOnce(() => Promise.reject({ code: "TimeoutError" }))
      .mockResolvedValue({ data: { sheets: [] } });

    await fetchSheetTitleToGid("sheet-1");

    expect(spreadsheetsGetMock).toHaveBeenCalledTimes(2);
  });

  // Note: the "non-transient error → no retry" path is the shared driveErrorStatus
  // classifier, exercised by tests/drive/fetch.test.ts's 404 cases and the
  // verifyReel/cron/applyStaged negative tests; it is not re-asserted here because
  // a module-mocked (vi.mock googleapis) rejection that surfaces to .rejects trips
  // the tests/drive project's unhandled-rejection handling.
});
