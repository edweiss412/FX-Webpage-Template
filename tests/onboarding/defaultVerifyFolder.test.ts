import { beforeEach, describe, expect, it, vi } from "vitest";

const filesGetMock = vi.fn();

vi.mock("@/lib/drive/client", () => ({
  getDriveClient: () => ({
    files: { get: filesGetMock },
  }),
}));

import { defaultVerifyFolder } from "@/app/api/admin/onboarding/scan/route";
import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/timeouts";

const FOLDER = {
  id: "folder-1",
  name: "FXAV Shows",
  mimeType: "application/vnd.google-apps.folder",
  trashed: false,
};

describe("defaultVerifyFolder (spec S8)", () => {
  beforeEach(() => {
    filesGetMock.mockReset();
  });

  it("bounds the folder metadata get with {timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false}", async () => {
    filesGetMock.mockResolvedValue({ data: FOLDER });
    const result = await defaultVerifyFolder("folder-1");
    expect(result).toEqual({ ok: true, folderId: "folder-1", folderName: "FXAV Shows" });
    expect(filesGetMock).toHaveBeenCalledWith(expect.objectContaining({ fileId: "folder-1" }), {
      timeout: DRIVE_FILES_GET_TIMEOUT_MS,
      retry: false,
    });
  });

  it("maps a probed-shape Drive timeout to 504 ONBOARDING_FOLDER_VERIFY_UNAVAILABLE, not operator blame", async () => {
    filesGetMock.mockRejectedValue(
      Object.assign(new Error("The operation was aborted."), {
        cause: Object.assign(new Error("aborted"), { name: "AbortError" }),
      }),
    );
    const result = await defaultVerifyFolder("folder-1");
    expect(result).toEqual({
      ok: false,
      status: 504,
      code: "ONBOARDING_FOLDER_VERIFY_UNAVAILABLE",
    });
  });

  it("still maps a plain status-less error to 400 OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA (regression pin)", async () => {
    filesGetMock.mockRejectedValue(new Error("weird non-timeout failure"));
    const result = await defaultVerifyFolder("folder-1");
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA",
    });
  });

  it("keeps the 403/404 status branches (regression pins)", async () => {
    filesGetMock.mockRejectedValue({ status: 403 });
    expect(await defaultVerifyFolder("folder-1")).toEqual({
      ok: false,
      status: 403,
      code: "FOLDER_NOT_SHARED",
    });
    filesGetMock.mockRejectedValue({ status: 404 });
    expect(await defaultVerifyFolder("folder-1")).toEqual({
      ok: false,
      status: 404,
      code: "FOLDER_NOT_FOUND",
    });
  });
});
