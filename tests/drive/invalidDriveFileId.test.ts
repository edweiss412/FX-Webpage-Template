import { describe, expect, test, vi } from "vitest";
import {
  assertNonEmptyDriveFileId,
  DriveFetchError,
  fetchDriveFileMetadata,
  InvalidDriveFileIdError,
} from "@/lib/drive/fetch";
import { runWithRequestContext, setCronInFlight } from "@/lib/log/requestContext";

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

  test("empty-id guard error carries the call-time cron snapshot", async () => {
    const filesGet = vi.fn();
    const fakeDrive = { files: { get: filesGet } } as never;
    let caught: unknown;
    await runWithRequestContext(
      {
        requestId: "r",
        cronPhase: "file-loop",
        cronInFlightDriveFileId: "showA",
        cronProcessedCount: 4,
      },
      async () => {
        caught = await fetchDriveFileMetadata("", { drive: fakeDrive }).catch((e) => e);
      },
    );
    expect(caught).toBeInstanceOf(InvalidDriveFileIdError);
    expect(
      (caught as { syncRunContext?: { phase?: string; inFlightDriveFileId?: string } })
        .syncRunContext,
    ).toMatchObject({ phase: "file-loop", inFlightDriveFileId: "showA", processedBeforeThrow: 4 });
    expect(filesGet).not.toHaveBeenCalled();
  });

  test("detached Drive rejection carries the CALL-TIME snapshot, not the advanced ALS", async () => {
    // The failing operation was created under driveFileId "A"; the shared ALS then
    // advances to "B" before the rejection surfaces. The error must attribute to "A".
    let rejectGet!: (e: unknown) => void;
    const filesGet = vi.fn(() => new Promise((_resolve, reject) => (rejectGet = reject)));
    const fakeDrive = { files: { get: filesGet } } as never;
    let caught: unknown;
    await runWithRequestContext(
      {
        requestId: "r",
        cronPhase: "file-loop",
        cronInFlightDriveFileId: "A",
        cronProcessedCount: 1,
      },
      async () => {
        const p = fetchDriveFileMetadata("1Valid", { drive: fakeDrive }); // snapshot A captured now
        await Promise.resolve(); // let driveFilesGet invoke the fake (rejectGet assigned)
        setCronInFlight({ driveFileId: "B", processedCount: 2 }); // shared ALS advances past A
        rejectGet(new DriveFetchError("gone", 404)); // 404 = non-transient → no retry
        caught = await p.catch((e) => e);
      },
    );
    expect(
      (caught as { syncRunContext?: { phase?: string; inFlightDriveFileId?: string } })
        .syncRunContext,
    ).toMatchObject({ phase: "file-loop", inFlightDriveFileId: "A" }); // the operation that created it, not "B"
  });
});
