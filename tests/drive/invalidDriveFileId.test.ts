import { describe, expect, test, vi } from "vitest";
import {
  assertNonEmptyDriveFileId,
  DriveFetchError,
  fetchDriveFileMetadata,
  InvalidDriveFileIdError,
} from "@/lib/drive/fetch";

describe("assertNonEmptyDriveFileId / InvalidDriveFileIdError", () => {
  test("throws InvalidDriveFileIdError (and instanceof DriveFetchError) for empty/blank/nullish", () => {
    for (const bad of ["", "   ", "\t", undefined, null]) {
      expect(() => assertNonEmptyDriveFileId(bad as unknown)).toThrow(InvalidDriveFileIdError);
      try {
        assertNonEmptyDriveFileId(bad as unknown);
      } catch (e) {
        expect(e).toBeInstanceOf(DriveFetchError); // existing handlers still classify it
      }
    }
  });

  test("passes a valid id through (no throw)", () => {
    expect(() => assertNonEmptyDriveFileId("1AbcDEF")).not.toThrow();
  });

  test("captures the raw value for forensics", () => {
    try {
      assertNonEmptyDriveFileId("");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidDriveFileIdError);
      expect((e as InvalidDriveFileIdError).rawFileId).toBeDefined();
    }
  });

  test("fetchDriveFileMetadata with an empty id NEVER reaches drive.files.get", async () => {
    const filesGet = vi.fn();
    const fakeDrive = { files: { get: filesGet } } as never;
    await expect(fetchDriveFileMetadata("", { drive: fakeDrive })).rejects.toThrow(
      InvalidDriveFileIdError,
    );
    expect(filesGet).not.toHaveBeenCalled(); // the empty id never reached the Drive client
  });

  test("fetchDriveFileMetadata with a valid id DOES reach drive.files.get", async () => {
    const filesGet = vi.fn(async () => ({
      data: { id: "1Valid", name: "n", mimeType: "m", modifiedTime: "t" },
    }));
    const fakeDrive = { files: { get: filesGet } } as never;
    await fetchDriveFileMetadata("1Valid", { drive: fakeDrive });
    expect(filesGet).toHaveBeenCalledTimes(1);
    expect((filesGet.mock.calls[0] as unknown[])[0]).toMatchObject({ fileId: "1Valid" });
  });
});
